"""NB-6 gates for intel's `POST /ingest` (ingest/route.py) against the real core-api on embedded Postgres 18
(tests/watch/core_stack.mts, two seeded worlds). The vision model replays what Nemotron VL read live from the hazelnut invoice
(tests/fixtures/invoice/lalbagh-hazelnut.png, SYNTHETIC; tests/fixtures/nemotron/invoice_hazelnut.json, recorded 27 Oct with
record_nemotron.py); everything intel writes goes through core's `/internal/intel/v1` under the run token. The documents are
fixture rows inserted as the cluster superuser (core-api's upload route is gated in services/core-api/test/imports-invoice.test.ts).

  (1) drafted: an ingest token of the document's own tenant → 200 `drafted`; core stores ONE proposed
      `purchasing.invoice.record.v1` draft citing the document, linked to that tenant's supplier and ingredient by exact alias,
      holding no typed number: each figure is a span of the page's transcript, and the spans hold the printed figures (hand
      values 2, 1560.00, 156.00). One spend row is charged as `vision`; the run's traces carry no word of the page.
  (2) a forged figure (a price the page does not show) withholds the whole draft: 200 `abstained`, no chunk, no draft.
  (3) cross-tenant: an ingest token of ANOTHER tenant with this tenant's document → core refuses the transcript's chunks
      (422 invalid_payload: intel.chunk's (tenant, document) FK), the route answers 502, and neither tenant gains a chunk or a
      draft. Red-proof: INGEST_REDPROOF_DROP_DOCUMENT_FK=1 drops that FK first, and (3) fails.
  (4) AI switched off (the typed kill switch): 200 `model_blocked`, and the vision model is never built (rule 11).
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import sys
from collections.abc import AsyncGenerator, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.adk.models import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "watch"))
from stack import Bridge, Stack  # noqa: E402  (T-043's stack, imported by bare name as the pack gates do)

from munim_intel.config import load_config  # noqa: E402
from munim_intel.contracts_gen.models import InternalChunksBatchRequest  # noqa: E402
from munim_intel.ingest.route import ingest_router  # noqa: E402
from munim_intel.runtime.context import load_public_key, verify_run_token  # noqa: E402
from munim_intel.runtime.internal_client import SERVICE_SECRET_HEADER, CoreError, InternalClient  # noqa: E402
from munim_intel.tools.grammar import ANY_REF  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
PNG = (FIXTURES / "invoice" / "lalbagh-hazelnut.png").read_bytes()
READ = json.loads((FIXTURES / "nemotron" / "invoice_hazelnut.json").read_text("utf8"))["response"]["choices"][0]["message"]["content"]
HOME, OTHER = "store", "cloud_kitchen"
#: Words of the page (untrusted text): none may ride in a trace.
PAGE_WORDS = ("Lalbagh", "hazelnut", "LNS-2026-0412", "1560.00", "156.00", "Hazratganj", "TAX INVOICE")
#: Fixed ids for this file's fixture documents.
DOC = {n: f"0199e0b6-0000-7000-8000-00000000d00{n}" for n in range(1, 5)}
CHUNK = "0199e0b6-0000-7000-8000-00000000c001"


class Page(BaseLlm):
    """The vision model: Nemotron VL's recorded read of the page, whatever the request (`read` may be a forged copy)."""

    model: str = "recorded/vision-nemotron"
    read: str = READ

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        usage = types.GenerateContentResponseUsageMetadata(prompt_token_count=662, candidates_token_count=268)
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.read)]), usage_metadata=usage)


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(7, [HOME, OTHER])
    # AI on, with a month's budget, as an operator sets them (tests/manager/ask_stack.mts): the run-frame narrates by model.
    s.sql("UPDATE platform.feature_flag SET value = 'true' WHERE key = 'intel.enabled'")
    for tenant in s.tenants.values():
        s.sql(
            "INSERT INTO platform.llm_budget (tenant_id, month, limit_minor, currency) "
            "SELECT $1, date_trunc('month', $2::date)::date, 100000000, base_currency FROM core.tenant WHERE tenant_id = $1",
            tenant,
            s.ready["as_of"],
        )
    yield s
    s.stop()


@pytest.fixture(scope="module")
def world(stack: Stack, tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    home = stack.tenants[HOME]
    [supplier] = stack.sql("SELECT id::text FROM core.supplier WHERE tenant_id = $1 ORDER BY id LIMIT 1", home)
    [ingredient] = stack.sql("SELECT id::text FROM core.ingredient WHERE tenant_id = $1 ORDER BY id LIMIT 1", home)
    for n, doc in DOC.items():
        stack.sql(
            "INSERT INTO core.document (tenant_id, id, kind, media_type, byte_size, sha256, storage_ref) "
            "VALUES ($1, $2, 'supplier_invoice', 'image/png', $3, $4, $5)",
            home,
            doc,
            len(PNG),
            hashlib.sha256(doc.encode()).hexdigest(),
            f"fixture:{n}",
        )
    cfg = load_config(
        env={"MUNIM_SERVICE_SECRET": stack.ready["secret"], "MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM": stack.ready["public_key_pem"]},
        run_dir=tmp_path_factory.mktemp("nb6-run"),
    )
    return {"home": home, "supplier": supplier["id"], "ingredient": ingredient["id"], "cfg": cfg, "built": []}


def body(w: dict[str, Any], doc: str) -> dict[str, Any]:
    """What core-api sends: its own reads of the home tenant (the aliases are that tenant's rows, printed as on the page)."""
    return {
        "document_id": doc,
        "media_type": "image/png",
        "content_base64": base64.b64encode(PNG).decode(),
        "currency": "INR",
        "aliases": [
            {"kind": "supplier", "core_ref": f"core.supplier:{w['supplier']}", "alias": "Lalbagh Nut & Spice (simulated)"},
            {"kind": "ingredient", "core_ref": f"core.ingredient:{w['ingredient']}", "alias": "Roasted hazelnuts (synthetic)"},
        ],
    }


def call(stack: Stack, w: dict[str, Any], world: str, doc: str, page: Page) -> tuple[int, dict[str, Any], str]:
    """(status, body, run_id): POST /ingest under a fresh ingest token of `world`, as core-api calls it."""
    t = stack.call("token", world=world, trigger="ingest", scope=["*"])

    async def vision(*_: object) -> BaseLlm:
        w["built"].append(t["run_id"])
        return page

    app = FastAPI()
    app.include_router(ingest_router(w["cfg"], core_transport=Bridge(stack), vision=vision))
    res = TestClient(app).post(
        "/ingest",
        headers={"authorization": f"Bearer {t['token']}", SERVICE_SECRET_HEADER: stack.ready["secret"]},
        content=json.dumps(body(w, doc)),
    )
    return res.status_code, res.json(), t["run_id"]


def counts(stack: Stack, doc: str) -> tuple[int, int]:
    """(chunks, drafts) citing `doc`, in ANY tenant (the cluster superuser reads past RLS)."""
    [r] = stack.sql(
        "SELECT (SELECT count(*) FROM intel.chunk WHERE document_id = $1)::int AS chunks, "
        "(SELECT count(*) FROM core.draft WHERE evidence @> jsonb_build_array('doc:' || $1::text))::int AS drafts",
        doc,
    )
    return r["chunks"], r["drafts"]


def numbers(v: Any) -> list[Any]:
    if isinstance(v, bool):
        return []
    if isinstance(v, int | float):
        return [v]
    if isinstance(v, list):
        return [n for x in v for n in numbers(x)]
    if isinstance(v, dict):
        return [n for x in v.values() for n in numbers(x)]
    return []


def test_1_the_live_read_becomes_one_draft_whose_every_figure_is_a_span_of_the_page(stack: Stack, world: dict[str, Any]) -> None:
    status, out, run_id = call(stack, world, HOME, DOC[1], Page())
    assert (status, out["status"], out["run_id"]) == (200, "drafted", run_id)
    [d] = stack.sql(
        "SELECT id::text, command_type, status, source, run_id::text, outlet_ids, evidence, command_payload FROM core.draft "
        "WHERE tenant_id = $1 AND evidence @> jsonb_build_array('doc:' || $2::text)",
        world["home"],
        DOC[1],
    )
    assert (d["id"], d["command_type"], d["status"], d["source"], d["run_id"]) == (
        out["draft_id"],
        "purchasing.invoice.record.v1",
        "proposed",
        "intel:inventory_purchasing",
        run_id,
    )
    assert (d["outlet_ids"], d["evidence"]) == ([], [f"doc:{DOC[1]}"])
    p = d["command_payload"]
    assert (p["supplier_id"], p["invoice_no"], p["invoice_date"], p["currency"]) == (
        world["supplier"],
        "LNS-2026-0412",
        "2026-10-22",
        "INR",
    )
    [line] = p["lines"]
    assert (line["ingredient_id"], line["unit"], line["description"]) == (world["ingredient"], "kg", None)
    assert numbers(p) == [], "a draft carries no typed number"
    chunks = stack.sql(
        "SELECT char_start, text FROM intel.chunk WHERE tenant_id = $1 AND document_id = $2 ORDER BY seq", world["home"], DOC[1]
    )
    page = "".join(c["text"] for c in chunks)
    assert chunks and chunks[0]["char_start"] == 0
    cited = []
    for k in ("qty_milli", "unit_price_minor", "tax_minor"):
        ref = line[k]
        assert ANY_REF.fullmatch(ref) and ref.startswith(f"⟨cite:doc:{DOC[1]}·"), ref
        s, e = (int(x) for x in ref.split("·")[1].rstrip("⟩").split("-"))
        cited.append(page[s:e])
    assert cited == ["2", "1560.00", "156.00"]
    [spend] = stack.sql(
        "SELECT role, count(*)::int AS n FROM intel.intel_spend WHERE tenant_id = $1 AND run_id = $2 GROUP BY role", world["home"], run_id
    )
    assert (spend["role"], spend["n"]) == ("vision", 1)
    traces = stack.sql("SELECT kind, payload::text AS p FROM intel.trace_event WHERE tenant_id = $1 AND run_id = $2", world["home"], run_id)
    assert {t["kind"] for t in traces} >= {"subagent_start", "draft"}
    leaked = [(t["kind"], w) for t in traces for w in PAGE_WORDS if w.lower() in t["p"].lower()]
    assert leaked == []


def test_2_a_forged_figure_withholds_the_whole_draft(stack: Stack, world: dict[str, Any]) -> None:
    read = json.loads(READ)
    read["lines"][0]["unit_price"] = "1480.00"
    status, out, _ = call(stack, world, HOME, DOC[2], Page(read=json.dumps(read)))
    assert (status, out["status"], out["draft_id"]) == (200, "abstained", None)
    assert counts(stack, DOC[2]) == (0, 0)


def test_3_an_ingest_token_of_another_tenant_is_refused_and_writes_nothing(stack: Stack, world: dict[str, Any]) -> None:
    if os.environ.get("INGEST_REDPROOF_DROP_DOCUMENT_FK"):
        [fk] = stack.sql(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'intel.chunk'::regclass AND contype = 'f' "
            "AND confrelid = 'core.document'::regclass"
        )
        stack.sql(f'ALTER TABLE intel.chunk DROP CONSTRAINT "{fk["conname"]}"')
    before = stack.sql("SELECT (SELECT count(*) FROM intel.chunk)::int AS chunks, (SELECT count(*) FROM core.draft)::int AS drafts")[0]
    status, out, _ = call(stack, world, OTHER, DOC[3], Page())
    assert (status, out.get("error", {}).get("code"), out.get("status")) == (502, "internal", None)
    assert counts(stack, DOC[3]) == (0, 0)
    after = stack.sql("SELECT (SELECT count(*) FROM intel.chunk)::int AS chunks, (SELECT count(*) FROM core.draft)::int AS drafts")[0]
    assert after == before
    # The refusal itself, at core's write boundary: the other tenant's run cannot chunk this tenant's document.
    t = stack.call("token", world=OTHER, trigger="ingest", scope=["*"])
    ctx = verify_run_token(t["token"], load_public_key(stack.ready["public_key_pem"].encode()))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    chunk = {"id": CHUNK, "document_id": DOC[3], "message_id": None, "seq": 0, "char_start": 0, "text": "x"}

    async def write() -> str:
        try:
            await client.write_chunks(InternalChunksBatchRequest.model_validate({"chunks": [chunk]}))
            return "accepted"
        except CoreError as e:
            return f"{e.status} {e.code}"
        finally:
            await client.aclose()

    assert asyncio.run(write()) == "422 invalid_payload"


def test_4_with_ai_switched_off_no_page_is_read(stack: Stack, world: dict[str, Any]) -> None:
    stack.sql("UPDATE platform.feature_flag SET value = 'false' WHERE key = 'intel.enabled'")
    try:
        status, out, run_id = call(stack, world, HOME, DOC[4], Page())
    finally:
        stack.sql("UPDATE platform.feature_flag SET value = 'true' WHERE key = 'intel.enabled'")
    assert (status, out["status"], out["draft_id"]) == (200, "model_blocked", None)
    assert run_id not in world["built"] and counts(stack, DOC[4]) == (0, 0)
