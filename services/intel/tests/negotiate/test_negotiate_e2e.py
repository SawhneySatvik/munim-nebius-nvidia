"""T-055 against the real core-api on embedded Postgres 18 (R-C F7): one negotiation from a real shortfall cell to a PO
draft core's own drafts route accepts. Every intel write goes through `/internal/intel/v1` under a run token —
`forecasts:batch`, `chunks:batch` (the supplier replies), `quotes:batch` (with source chunk and spans), the snapshots
`inventory.shortfall`, `purchasing.price_creep`, `purchasing.quote_compare`, `purchasing.deal_inputs`, and `drafts`.

World `cloud_kitchen` (7 days, worldgen AS_OF 2026-10-10), ingredient Chicken. Fixtures a person would have set up, as
the cluster superuser under the owner's command context (no route drives them from here): two more simulated suppliers
(the world has one), the three cards on the sim, a purchases budget and an outlet business policy; one forecast run
through core's own forecasts route (the run's forecast of 200 chicken biryanis a day for the next 7 days).

Expected values, by hand — never read from the code:
  reference = 18400 paise/kg (purchasing.price_creep latest_minor = CK-I2's invoice price, tools/worldgen/src/worlds/
  cloud_kitchen.ts "chicken invoiced … FF-5501 … priceMinor: 18400"); the owner set no negotiation bounds, so core's
  run-frame serves the R47 D7 default: target 9500 bp = 17480, walk-away 11000 bp = 20240.
  Rule defaults (no chooser model): steady 10200 bp = 18768 → counter at the discounter's 16560 → 10050 bp = 18492
  (18492.5 rounds half-up in integers: (18400·10050 + 5000) // 10000 = 18492) → counter → 9900 bp = 18216 → accept;
  discounter 9000 bp = 16560 (no rival below, target above) → accept; premium 11200 bp = 20608 > 20240 → counter 16560 →
  11000 bp = 20240 → counter → 10800 bp = 19872 → accept. Quotes stored: 3 RFQ + 2 + 2 counters = 7.
  Review: discounter's minimum is 3 × the RFQ quantity, above the chicken used in its 4-day shelf life → fail
  moq_exceeds_need; steady and premium pass (policy: floor 6000 bp, 7 days; the dishes' margins are far above it). PO:
  steady at 18216 per kg for the shortfall cell's quantity, status `proposed` from core's drafts route.

Packaging (the pack's RG-S1 takeaway boxes) still cannot pass deal review against real core: deal_inputs v3 (0026, R47
D3) skips the margin rule for an item with no selling price, but its forecast need is 0 (cannot_verify since R-C F7).
Reported for the pack owner; this run uses a recipe ingredient instead (chicken: `margin_rule_applies` true).

Runs on migration 0026 (deal_inputs v3, the business-policy bounds core's run-frame reads).
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest

from kit import PUBLIC, StubChooser, build_app, llm
from kit import no_fixture_misses as no_fixture_misses  # autouse: a missing recorded fixture fails the test
from munim_intel.contracts_gen.models import InternalRunFrameResponse, InternalSnapshotsRequest
from munim_intel.mapping import SNAP_CLOSE, SNAP_OPEN
from munim_intel.negotiate.policy import policy_from
from munim_intel.negotiate.port import A2aSuppliers, simulated_suppliers
from munim_intel.negotiate.run import Outcome, Rfq, negotiate, negotiation_budget, rfq_from
from munim_intel.runtime.context import RunContext, load_public_key, verify_run_token
from munim_intel.runtime.internal_client import SERVICE_SECRET_HEADER, InternalClient
from munim_intel.runtime.state import RunState
from munim_intel.tools.generated import uuid7
from munim_intel.trace.buffer import TraceBuffer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "watch"))
from stack import Bridge, Stack  # noqa: E402

__all__ = ["Stack", "scenario", "seed"]

E2E_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "e2e"
WORLD = "cloud_kitchen"
AS_OF = "2026-10-10"
#: Hand values (module docstring).
REFERENCE = 18_400
PO = ("steady", 18_216)
QUOTES = 7
REFUSED = {"discounter": "moq_exceeds_need"}
#: Fixed ids for the fixture rows this test adds.
DISCOUNTER = "0199e0b0-0000-7000-8000-00000000c002"
PREMIUM = "0199e0b0-0000-7000-8000-00000000c003"


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(7, [WORLD])
    yield s
    s.stop()


def _owner_do(stack: Stack, tenant: str, command: str, body: str) -> None:
    """`body` under the owner's own command context (the book guard's person-command path). A DO block takes no bind
    parameters, so callers format in this fixture's own ids and constants (hence their S608 noqa)."""
    owner = stack.sql(
        "SELECT m.id::text FROM core.membership ms JOIN core.member m ON m.id = ms.member_id WHERE ms.tenant_id = $1 AND ms.role = 'owner'",
        tenant,
    )
    stack.sql(
        f"""DO $$ BEGIN
          PERFORM set_config('app.tenant_id', '{tenant}', true); PERFORM set_config('app.outlet_ids', '{{*}}', true);
          PERFORM set_config('app.role', 'owner', true); PERFORM set_config('app.member_id', '{owner[0]["id"]}', true);
          PERFORM set_config('app.command_type', '{command}', true);
          {body}
        END $$"""
    )


def seed(stack: Stack) -> dict[str, Any]:
    tenant = stack.tenants[WORLD]
    outlet = stack.sql("SELECT id::text FROM core.outlet WHERE tenant_id = $1", tenant)[0]["id"]
    [steady] = stack.sql("SELECT id::text FROM core.supplier WHERE tenant_id = $1 AND kind = 'simulated'", tenant)
    ids = {"steady": steady["id"], "discounter": DISCOUNTER, "premium": PREMIUM}
    card = {k: f"{PUBLIC}/{k}/.well-known/agent-card.json" for k in ids}
    _owner_do(
        stack,
        tenant,
        "purchasing.supplier.upsert.v1",
        # A DO block takes no bind parameters; every value is this fixture\'s own id or constant.
        f"""UPDATE core.supplier SET a2a_card_url = '{card["steady"]}' WHERE id = '{steady["id"]}';
            INSERT INTO core.supplier (tenant_id, id, name, kind, a2a_card_url, terms) VALUES
              ('{tenant}', '{DISCOUNTER}', 'Bargain Bulk Traders (simulated)', 'simulated', '{card["discounter"]}', '{{}}'),
              ('{tenant}', '{PREMIUM}', 'Premium Provisions (simulated)', 'simulated', '{card["premium"]}', '{{}}');""",  # noqa: S608
    )
    _owner_do(
        stack,
        tenant,
        "finance.budget.set.v1",
        # A DO block takes no bind parameters; every value is this fixture\'s own id or constant.
        f"""INSERT INTO core.budget (tenant_id, id, outlet_id, category, period_month, amount_minor, currency, origin)
            VALUES ('{tenant}', '0199e0b0-0000-7000-8000-00000000b001', NULL, 'purchases', '2026-10-01', 10000000, 'INR', '{{}}');""",  # noqa: S608
    )
    _owner_do(
        stack,
        tenant,
        "tenancy.policy.set.v1",
        # A DO block takes no bind parameters; every value is this fixture\'s own id or constant.
        f"""INSERT INTO core.business_policy (tenant_id, id, outlet_id, margin_floor_bp, min_payment_days, valid_from, origin)
            VALUES ('{tenant}', '0199e0b0-0000-7000-8000-00000000b002', '{outlet}', 6000, 7, '2026-01-01', '{{}}');""",  # noqa: S608
    )
    chicken = stack.sql("SELECT id::text FROM core.ingredient WHERE tenant_id = $1 AND name = 'Chicken'", tenant)[0]["id"]
    biryani = stack.sql("SELECT id::text FROM core.item WHERE tenant_id = $1 AND name_key = 'chicken_dum_biryani'", tenant)[0]["id"]
    return {"tenant": tenant, "outlet": outlet, "ids": ids, "chicken": chicken, "biryani": biryani}


async def scenario(stack: Stack, w: dict[str, Any], extract_llm: Any) -> tuple[Outcome, RunContext, Rfq]:
    """The negotiation, from the shortfall cell to the draft (record.py authors the extract fixtures through it)."""
    t = stack.call("token", world=WORLD, trigger="event", scope=[w["outlet"]])
    ctx = verify_run_token(t["token"], load_public_key(stack.ready["public_key_pem"].encode()))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    headers = {"authorization": f"Bearer {t['token']}", SERVICE_SECRET_HEADER: stack.ready["secret"]}
    # R47 D7: the owner's bounds, as core's run-frame serves them (this world sets none: core's default).
    async with httpx.AsyncClient(transport=Bridge(stack), base_url="http://core.test") as http:
        r = await http.get("/internal/intel/v1/run-frame", headers=headers)
    assert r.status_code == 200, r.text[:300]
    policy = policy_from(InternalRunFrameResponse.model_validate_json(r.content))
    assert (policy.target_bp, policy.walk_away_bp) == (9_500, 11_000)
    state = RunState(traces=TraceBuffer(client.write_traces), budget=negotiation_budget(3, policy))
    price = (
        await client.mint_snapshot(InternalSnapshotsRequest(template_id="purchasing.price_creep", params={"as_of": AS_OF}))
    ).model_dump(mode="json")
    # The run's forecast, through core's own route (intel has no client method for it; the same headers InternalClient sends).
    days = [(date.fromisoformat(AS_OF) + timedelta(days=d)).isoformat() for d in range(1, 8)]
    fr = uuid7(1_760_000_000_000, f"{ctx.run_id}/forecast")
    body = {
        "forecast_run": {"id": fr, "method": "weighted_seasonal_v1", "trained_through": AS_OF, "horizon_days": 7, "holdout_days": 0,
                         "wape_bp": None, "baseline_wape_bp": None, "bias_bp": None},
        "points": [{"id": uuid7(1_760_000_000_000, f"{fr}/{d}"), "outlet_id": w["outlet"], "item_id": w["biryani"], "business_on": d,
                    "slot_start": None, "method": "weighted_seasonal_v1", "qty_milli": 200_000, "lo_qty_milli": 200_000,
                    "hi_qty_milli": 200_000, "inputs_snapshot_id": price["snapshot_id"]} for d in days],
    }  # fmt: skip
    async with httpx.AsyncClient(transport=Bridge(stack), base_url="http://core.test") as http:
        r = await http.post("/internal/intel/v1/forecasts:batch", json=body, headers=headers)
        assert r.status_code == 201, r.text
    shortfall = (
        await client.mint_snapshot(
            InternalSnapshotsRequest(template_id="inventory.shortfall", params={"outlet_id": w["outlet"], "lead_days": 7, "as_of": AS_OF})
        )
    ).model_dump(mode="json")
    s_row = next(i for i, r in enumerate(shortfall["rows"]) if r["ingredient_id"] == w["chicken"])
    p_row = next(i for i, r in enumerate(price["rows"]) if r["ingredient_id"] == w["chicken"])
    rfq = rfq_from(shortfall, s_row, price, p_row, "latest_minor", item_name="Chicken", unit="kg", currency="INR", minor_unit=2,
                   needed_by="2026-10-13", outlet_ids=(w["outlet"],))  # fmt: skip
    # The core read of suppliers (no template exposes kind and card yet — reported): the superuser's rows stand in for it.
    rows = stack.sql("SELECT id::text AS supplier_id, kind, a2a_card_url FROM core.supplier WHERE tenant_id = $1", w["tenant"])
    by_id = {s.id: s for s in simulated_suppliers(rows)}
    suppliers = [by_id[w["ids"][k]] for k in ("steady", "discounter", "premium")]
    # One fixed minimum-order phrasing: the sim otherwise picks one by the run's (fresh) context id, and the recorded
    # extractor has one fixture per reply text.
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=build_app(PUBLIC, clause=0)), base_url=PUBLIC) as http:
        out = await negotiate(ctx, rfq, suppliers, port=A2aSuppliers(http, PUBLIC), core=client, chooser=StubChooser(lambda _r, _l: None),
                              extract_llm=extract_llm, state=state, policy=policy)  # fmt: skip
    return out, ctx, rfq


def test_a_negotiation_runs_end_to_end_against_real_core(stack: Stack) -> None:
    [v] = stack.sql("SELECT max(version)::int AS v FROM evidence.snapshot_template WHERE id = 'purchasing.deal_inputs'")
    assert v["v"] >= 3, "deal review reads purchasing.deal_inputs v3 (0026, R47 D3)"
    w = seed(stack)
    out, ctx, rfq = asyncio.run(scenario(stack, w, llm("extract", E2E_FIXTURES)))
    key = {v: k for k, v in w["ids"].items()}
    quotes = stack.sql(
        """SELECT q.id::text, q.supplier_id::text, q.round, q.unit_price_minor, q.qty_milli, q.min_order_qty_milli, q.payment_days,
                  q.spans, k.text, k.run_id::text AS chunk_run FROM intel.supplier_quote q JOIN intel.chunk k ON k.id = q.source_chunk_id
            WHERE q.run_id = $1""",
        ctx.run_id,
    )
    # Every stored number is its span's text in the stored reply (read back from Postgres, not from intel's memory).
    scale = {"unit_price_minor": 100, "qty_milli": 1000, "min_order_qty_milli": 1000, "payment_days": 1}
    for q in quotes:
        assert q["chunk_run"] == ctx.run_id
        for name, span in q["spans"].items():
            if span is not None:
                assert round(float(q["text"][span[0] : span[1]].replace(",", "")) * scale[name]) == int(q[name]), (name, q["text"])
    refused = {key[x.supplier_id]: x.refused.reason_code for x in out.reviewed if x.refused is not None}
    draft = stack.sql(
        "SELECT status, source, command_type, command_payload FROM core.draft WHERE id = $1", out.draft.draft_id.root if out.draft else None
    )
    line = draft[0]["command_payload"]["lines"][0] if draft else {}
    cell = line.get("unit_price_minor", "")
    sid, row, col = cell[len(SNAP_OPEN) + len("snap:") : -len(SNAP_CLOSE)].split("·")
    rows = stack.sql("SELECT rows FROM evidence.snapshot WHERE id = $1", sid)[0]["rows"]
    print(
        f"quotes stored {len(quotes)} (all with a run chunk and spans), refused {refused}, draft {draft[0]['status'] if draft else None} "
        f"from {draft[0]['source'] if draft else None}, "
        f"PO {key[out.draft_request['payload']['supplier_id']] if out.draft_request else None} "
        f"at {rows[int(row)][col]}"
    )
    assert rfq.reference_price_minor == REFERENCE and len(quotes) == QUOTES
    assert refused == REFUSED
    assert draft and draft[0]["status"] == "proposed" and draft[0]["source"] == "intel:inventory_purchasing"
    assert out.draft_request is not None and (key[out.draft_request["payload"]["supplier_id"]], rows[int(row)][col]) == PO
    assert json.dumps(draft[0]["command_payload"], ensure_ascii=False).count("⟨snap:") == 2  # qty and price: cells, never figures
