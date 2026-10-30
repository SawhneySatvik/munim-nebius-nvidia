"""T-056 against the real core-api on embedded Postgres 18 (tests/watch/core_stack.mts, one seeded world): chunks and
claims go through `/internal/intel/v1` under a run token, and the database's own quote check (MB012) is the independent
judge of gate (2); `embeddings:batch` answers the real 503 (no pgvector here), which the pipeline takes as
`unavailable`; the run's traces are accepted by core's traces route. The documents and the chat are fixture rows
inserted as the cluster superuser (there is no upload route for them yet); everything intel writes goes through core.
"""

from __future__ import annotations

import asyncio
import hashlib
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "watch"))
from stack import Bridge, Stack  # noqa: E402  (T-043's stack, imported by bare name as the pack gates do)

from munim_intel.contracts_gen.models import InternalTracesBatchRequest
from munim_intel.ingest.embed import RecordedEmbedder
from munim_intel.ingest.link import Alias, AliasTable
from munim_intel.ingest.pipeline import Ingest, Report
from munim_intel.ingest.quarantine import FIXTURES_DIR
from munim_intel.ingest.sink import CoreSink
from munim_intel.llm.recorded import RecordedLlm
from munim_intel.runtime.context import load_public_key, verify_run_token
from munim_intel.runtime.internal_client import CoreError, InternalClient
from munim_intel.runtime.state import Budget, RunState
from munim_intel.trace.buffer import TraceBuffer

from . import corpus as C

WORLD = "store"
CONVERSATION = C.vid(0xC1)


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(7, [WORLD])
    yield s
    s.stop()


def seed(stack: Stack) -> str:
    tenant = stack.tenants[WORLD]
    for doc, kind in ((C.DOC_SUPPLY, "agreement"), (C.DOC_INJECT, "other"), (C.DOC_INJECT_MIXED, "other")):
        raw = C.DOCS[doc].encode()
        stack.sql(
            """INSERT INTO core.document (tenant_id, id, kind, media_type, byte_size, sha256, storage_ref)
               VALUES ($1, $2, $3, 'text/plain', $4, $5, $6)""",
            tenant,
            doc,
            kind,
            len(raw),
            hashlib.sha256(raw).hexdigest(),
            f"fixture:{doc}",
        )
    stack.sql("INSERT INTO core.conversation (tenant_id, id, kind) VALUES ($1, $2, 'supplier')", tenant, CONVERSATION)
    for mid, body in C.MESSAGES:
        stack.sql(
            "INSERT INTO core.message (tenant_id, id, conversation_id, author_label, body) VALUES ($1, $2, $3, 'Supplier (simulated)', $4)",
            tenant,
            mid,
            CONVERSATION,
            body,
        )
    return tenant


def test_chunks_and_claims_pass_core_and_embeddings_are_unavailable(stack: Stack, tmp_path: Path) -> None:
    tenant = seed(stack)
    t = stack.call("token", world=WORLD, trigger="watch_sweep", scope=["*"])
    pem = stack.ready["public_key_pem"].encode()
    ctx = verify_run_token(t["token"], load_public_key(pem))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    sink = CoreSink(client)
    sent: list[InternalTracesBatchRequest] = []

    async def traces(req: InternalTracesBatchRequest) -> object:
        sent.append(req)
        return await client.write_traces(req)

    # Hand count of the model calls (R-C F6: every quarantined call spends the budget): 2 passes × (3 documents of one
    # chunk + 2 messages) = 10.
    state = RunState(traces=TraceBuffer(traces), budget=Budget(max_model_calls=10))
    # A claim-only entity (no core row in this world), written through core like everything else; claims link to it.
    steady = Alias(C.vid(0xA1), "supplier", None, "Steady Dairy")
    aliases = AliasTable([steady])
    ing = Ingest(
        state=state,
        sink=sink,
        extract_llm=RecordedLlm(model="recorded/extract", fixtures_dir=FIXTURES_DIR),
        vision_llm=RecordedLlm(model="recorded/vision", fixtures_dir=FIXTURES_DIR),
        embedder=RecordedEmbedder(),
        aliases=aliases,
    )

    async def go() -> tuple[list[Report], list[Report], str]:
        await sink.batch(
            "entities:batch", {"entities": [{"id": steady.entity_id, "kind": "supplier", "core_ref": None, "name": steady.alias}]}
        )
        await sink.batch(
            "aliases:batch", {"aliases": [{"id": C.vid(0xA9), "entity_id": steady.entity_id, "alias": steady.alias, "source": "claim"}]}
        )
        first = [await ing.document(d, text) for d, text in C.DOCS.items()] + [await ing.messages(C.MESSAGES)]
        again = [await ing.document(d, text) for d, text in C.DOCS.items()] + [await ing.messages(C.MESSAGES)]
        # A claim whose quote is not its chunk's text, posted straight to core: the database refuses the batch.
        chunk = next(c for c in stack.sql("SELECT id::text FROM intel.chunk WHERE document_id = $1", C.DOC_SUPPLY))
        try:
            await sink.batch(
                "claims:batch",
                {
                    "claims": [
                        {
                            "id": C.vid(0xBAD),
                            "chunk_id": chunk["id"],
                            "message_id": None,
                            "span_start": 0,
                            "span_end": 12,
                            "quote": "Steady Dairy gives a discount",
                            "subject_entity_id": None,
                            "predicate": "discounts",
                            "object": None,
                            "object_entity_id": None,
                        }
                    ]
                },
            )
            refused = "accepted"
        except CoreError as e:
            refused = f"{e.status} {e.code}"
        await state.traces.flush()
        await client.aclose()
        return first, again, refused

    first, again, refused = asyncio.run(go())
    rows: list[dict[str, Any]] = stack.sql(
        """SELECT c.quote, c.span_start, c.span_end, coalesce(k.text, m.body) AS source, c.subject_entity_id::text AS subject
             FROM intel.claim c LEFT JOIN intel.chunk k ON k.tenant_id = c.tenant_id AND k.id = c.chunk_id
             LEFT JOIN core.message m ON m.tenant_id = c.tenant_id AND m.id = c.message_id
            WHERE c.tenant_id = $1 AND c.run_id = $2""",
        tenant,
        ctx.run_id,
    )
    stored = stack.sql("SELECT count(*)::int AS n FROM intel.trace_event WHERE tenant_id = $1 AND run_id = $2", tenant, ctx.run_id)[0]["n"]
    print(
        "first:",
        [(r.chunks, r.claims, r.dropped, r.refused, r.embeddings.status) for r in first],
        "| again:",
        [(r.chunks, r.claims) for r in again],
        "| fabricated claim:",
        refused,
        "| claims in db:",
        len(rows),
        "| traces stored:",
        stored,
    )
    assert sum(r.claims for r in first) == len(rows) == C.EXPECTED_KEPT
    assert all(r["source"][r["span_start"] : r["span_end"]] == r["quote"] for r in rows)
    # Subjects named in their quotes (R-C F10): Steady Dairy's delivery claim links; the payment-terms claim names no
    # subject; Fresh Farm Greens has no alias in this world.
    assert sorted(str(r["subject"]) for r in rows) == sorted([steady.entity_id] + ["None"] * 2)
    assert all(r.refused.get("ai_budget_cap", 0) == 0 for r in [*first, *again])
    assert sum(r.chunks for r in first) == len(C.DOCS) + len(C.MESSAGES)
    assert sum(r.refused.get("tool_call_attempted", 0) for r in first) == C.EXPECTED_REFUSED
    assert {r.embeddings.status for r in first} == {"unavailable"}
    assert [(r.chunks, r.claims) for r in again] == [(0, 0)] * len(again)
    assert refused == "422 claim_quote_mismatch"
    assert stored == sum(len(b.events) for b in sent) > 0


def test_an_invoice_image_becomes_a_proposed_draft_in_core(stack: Stack) -> None:
    """The workflow draftable end to end (DECISIONS 11 Oct, W3.2): the recorded vision read of the invoice page → its
    transcript's chunks → `purchasing.invoice.record.v1` with every number a doc span and `based_on` [] → core's real
    drafts route stores it `proposed` under `intel:inventory_purchasing` (nothing executes until a person approves and
    types each number, R16/R26). Linked to the world's own supplier and ingredient by exact alias. Paired: the same
    document again answers with the same draft (0 new rows)."""
    tenant = stack.tenants[WORLD]
    (sup,) = stack.sql("SELECT id::text FROM core.supplier WHERE tenant_id = $1 ORDER BY id LIMIT 1", tenant)
    (ing,) = stack.sql("SELECT id::text FROM core.ingredient WHERE tenant_id = $1 ORDER BY id LIMIT 1", tenant)
    raw = C.IMAGES[C.DOC_INVOICE]
    stack.sql(
        """INSERT INTO core.document (tenant_id, id, kind, media_type, byte_size, sha256, storage_ref)
           VALUES ($1, $2, 'supplier_invoice', 'image/png', $3, $4, $5)""",
        tenant,
        C.DOC_INVOICE,
        len(raw),
        hashlib.sha256(raw).hexdigest(),
        f"fixture:{C.DOC_INVOICE}",
    )
    t = stack.call("token", world=WORLD, trigger="watch_sweep", scope=["*"])
    ctx = verify_run_token(t["token"], load_public_key(stack.ready["public_key_pem"].encode()))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    aliases = AliasTable(
        [
            Alias(C.vid(0xB1), "supplier", f"core.supplier:{sup['id']}", "Steady Dairy"),
            Alias(C.vid(0xB2), "ingredient", f"core.ingredient:{ing['id']}", "Paneer"),
        ]
    )
    state = RunState(traces=TraceBuffer(client.write_traces))
    ingest = Ingest(
        state=state,
        sink=CoreSink(client),
        extract_llm=RecordedLlm(model="recorded/extract", fixtures_dir=FIXTURES_DIR),
        vision_llm=RecordedLlm(model="recorded/vision", fixtures_dir=FIXTURES_DIR),
        embedder=RecordedEmbedder(),
        aliases=aliases,
        actor="specialist:inventory_purchasing",
    )

    async def go() -> tuple[Report, Report]:
        first = await ingest.invoice(C.DOC_INVOICE, raw, "image/png", "INR")
        again = await ingest.invoice(C.DOC_INVOICE, raw, "image/png", "INR")
        await state.traces.flush()
        await client.aclose()
        return first, again

    first, again = asyncio.run(go())
    rows = stack.sql(
        """SELECT id::text, source, status, command_type, command_payload AS p, based_on, outlet_ids::text[] AS o
             FROM core.draft WHERE tenant_id = $1 AND command_type = $2""",
        tenant,
        "purchasing.invoice.record.v1",
    )
    print("invoice draft:", (first.draft_status, first.reason_code), (again.draft_status, again.draft_id == first.draft_id), rows)
    assert (first.draft_status, first.reason_code, again.draft_status, again.draft_id) == ("proposed", None, "proposed", first.draft_id)
    (d,) = rows
    assert (d["id"], d["source"], d["status"], d["based_on"], d["o"]) == (first.draft_id, "intel:inventory_purchasing", "proposed", [], [])
    p = d["p"]
    assert (p["supplier_id"], p["invoice_no"], [ln["ingredient_id"] for ln in p["lines"]], [ln["description"] for ln in p["lines"]]) == (
        sup["id"],
        "INV-1042",
        [ing["id"], None],
        [None, "Malai cream"],
    )
    spans = [ln[k] for ln in p["lines"] for k in ("qty_milli", "unit_price_minor", "tax_minor")]
    assert all(s.startswith(f"⟨cite:doc:{C.DOC_INVOICE}·") for s in spans) and len(spans) == len(C.INVOICE_NUMBERS)
