"""T-057 against the real core-api on embedded Postgres 18 (tests/watch/core_stack.mts, the seeded store world): pages go
through `wiki:batch` under a run token. The database rows are the independent judge: version 1 stored, an unchanged re-run
posts nothing, a changed input is version 2 of that page only, and core itself abstains a planted digit or a forged ref
(the accept is the clean first run).
"""

from __future__ import annotations

import asyncio
import dataclasses
import sys
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "watch"))
from stack import Bridge, Stack  # noqa: E402

from munim_intel.contracts_gen.models import InternalEntitiesBatchRequest, InternalSnapshotsRequest, InternalWikiBatchRequest
from munim_intel.runtime.context import load_public_key, verify_run_token
from munim_intel.runtime.internal_client import InternalClient
from munim_intel.wiki import CellIn, ClaimIn, CoreWikiSink, EntityIn, Neighbour, PageState, compile_wiki

from .wikikit import vid

WORLD = "store"
SUPPLIER, ITEM, OUTLET_E = vid(0xE1), vid(0xE2), vid(0xE3)
CLAIM, CONVERSATION, MESSAGE = vid(0xC1), vid(0xCC), vid(0xCD)


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(7, [WORLD])
    yield s
    s.stop()


class Counting:
    """Wraps the real sink; counts the calls that reach core."""

    def __init__(self, inner: CoreWikiSink) -> None:
        self.inner, self.calls = inner, 0

    async def post(self, req: InternalWikiBatchRequest) -> Any:
        self.calls += 1
        return await self.inner.post(req)


def test_pages_post_to_real_core_at_version_one_rerun_posts_zero_and_core_refuses_bad_prose(stack: Stack) -> None:
    tenant = stack.tenants[WORLD]
    t = stack.call("token", world=WORLD, trigger="watch_sweep", scope=["*"])
    ctx = verify_run_token(t["token"], load_public_key(stack.ready["public_key_pem"].encode()))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    sink = Counting(CoreWikiSink(client))
    outlet = stack.sql("SELECT id::text FROM core.outlet WHERE tenant_id = $1 ORDER BY id LIMIT 1", tenant)[0]["id"]
    as_of = date.fromisoformat(stack.ready["as_of"])
    stack.sql("INSERT INTO core.conversation (tenant_id, id, kind) VALUES ($1, $2, 'supplier')", tenant, CONVERSATION)
    stack.sql(
        """INSERT INTO core.message (tenant_id, id, conversation_id, author_label, body)
           VALUES ($1, $2, $3, 'Supplier (simulated)', 'Delivers fresh milk daily')""",
        tenant, MESSAGE, CONVERSATION,
    )  # fmt: skip

    def pages(table: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = stack.sql(f"SELECT * FROM {table} WHERE tenant_id = $1 ORDER BY 1", tenant)  # noqa: S608 — fixed tables
        return rows

    price_check = {
        "template_id": "catalogue.sku_price_check",
        "params": {"outlet_id": outlet, "from": (as_of - timedelta(days=30)).isoformat(), "to": as_of.isoformat()},
    }

    async def go() -> None:
        await client.write_entities(
            InternalEntitiesBatchRequest.model_validate(
                {
                    "entities": [
                        {"id": SUPPLIER, "kind": "supplier", "core_ref": None, "name": "Steady Dairy"},
                        {"id": ITEM, "kind": "item", "core_ref": None, "name": "Milk"},
                        {"id": OUTLET_E, "kind": "outlet", "core_ref": f"core.outlet:{outlet}", "name": "Main Store"},
                    ]
                }
            )
        )
        stack.sql(
            """INSERT INTO intel.claim (tenant_id, id, run_id, message_id, span_start, span_end, quote, subject_entity_id, predicate)
               VALUES ($1, $2, $3, $4, 0, 9, 'Delivers ', $5, 'delivers')""",
            tenant, CLAIM, ctx.run_id, MESSAGE, SUPPLIER,
        )  # fmt: skip
        snap = await client.mint_snapshot(InternalSnapshotsRequest.model_validate(price_check))
        rows = snap.model_dump(mode="json")["rows"]
        assert rows, "the store world has price-check rows"

        def cell(snap_id: str, value: Any) -> CellIn:
            return CellIn(f"⟨snap:{snap_id}·0·mrp_minor⟩", "mrp_minor", value, "The printed price of the first listed item is")

        mrp = (cell(snap.snapshot_id.root, rows[0]["mrp_minor"]),)
        world = [
            EntityIn(SUPPLIER, "supplier", "Steady Dairy", claims=(ClaimIn(CLAIM),), neighbours=(Neighbour(ITEM, "item"),)),
            EntityIn(ITEM, "item", "Milk", neighbours=(Neighbour(SUPPLIER, "supplier"),), cells=mrp),
            EntityIn(OUTLET_E, "outlet", "Main Store", cells=mrp),
        ]
        state: dict[str, PageState] = {}
        first = await compile_wiki(world, state, sink)
        print("first:", first, "| versions:", [(r["kind"], r["current_version"]) for r in pages("intel.wiki_page")])
        assert (first.posted, first.stored, first.abstained) == (3, 3, 0)
        assert [r["current_version"] for r in pages("intel.wiki_page")] == [1, 1, 1]
        assert len(pages("intel.wiki_version")) == 3

        calls = sink.calls
        again = await compile_wiki(world, state, sink)
        assert (again.posted, again.unchanged, sink.calls) == (0, 3, calls)
        assert len(pages("intel.wiki_version")) == 3

        # the same values in a re-minted snapshot are not a change
        snap2 = await client.mint_snapshot(InternalSnapshotsRequest.model_validate(price_check))
        assert snap2.snapshot_id != snap.snapshot_id
        old_id, new_id = snap.snapshot_id.root, snap2.snapshot_id.root
        moved = tuple(dataclasses.replace(c, ref=c.ref.replace(old_id, new_id)) for c in mrp)
        remint = [dataclasses.replace(e, cells=moved) if e.cells else e for e in world]
        assert (await compile_wiki(remint, state, sink)).posted == 0

        # a new claim on the supplier: version 2 of that page alone
        more = [dataclasses.replace(world[0], claims=(ClaimIn(CLAIM), ClaimIn(vid(0xC2)))), *world[1:]]
        stack.sql(
            """INSERT INTO intel.claim (tenant_id, id, run_id, message_id, span_start, span_end, quote, subject_entity_id, predicate)
               VALUES ($1, $2, $3, $4, 9, 14, 'fresh', $5, 'delivers')""",
            tenant, vid(0xC2), ctx.run_id, MESSAGE, SUPPLIER,
        )  # fmt: skip
        r = await compile_wiki(more, state, sink)
        assert (r.posted, r.stored) == (1, 1)
        by_entity = {p["entity_id"]: p["current_version"] for p in pages("intel.wiki_page")}
        assert by_entity == {SUPPLIER: 2, ITEM: 1, OUTLET_E: 1}

        # core is the judge of the prose itself: the same page with one planted digit, then one forged ref, then a clean one
        page = {
            "page_id": vid(0xF0), "entity_id": None, "kind": "supplier", "slug": "supplier-planted", "title": "Planted",
            "version": 1,
        }  # fmt: skip
        ok_ref = f"⟨cite:claim:{CLAIM}⟩"
        attempts = {
            "digit": (f"They deliver 5 days a week {ok_ref}.", [f"claim:{CLAIM}"]),
            "forged": (f"They deliver ⟨cite:claim:{vid(0xBAD)}⟩.", [f"claim:{vid(0xBAD)}"]),
            "clean": (f"They deliver in the morning {ok_ref}.", [f"claim:{CLAIM}"]),
        }
        verdicts: dict[str, tuple[str, str | None]] = {}
        for name, (text, refs) in attempts.items():
            body = [{"text": text, "refs": refs}]
            req = InternalWikiBatchRequest.model_validate({"pages": [{**page, "version_id": vid(0xF1 + len(verdicts)), "body": body}]})
            out = (await sink.inner.post(req)).pages[0]
            verdicts[name] = (out.status, out.reason_code.root if out.reason_code else None)
            if name == "forged":
                assert not [r for r in pages("intel.wiki_page") if r["slug"] == "supplier-planted"]
        print("verdicts:", verdicts)
        assert verdicts == {"digit": ("abstained", "number_grammar"), "forged": ("abstained", "unresolved_ref"), "clean": ("stored", None)}
        await client.aclose()

    asyncio.run(go())
