"""T-046 end to end: the inventory & purchasing detectors through intel's watcher pipeline against the real core-api
internal API on embedded Postgres, the four worldgen worlds seeded through the API at the gate profile (100 days, as of
2026-10-10; tools/worldgen/test/profile.ts). Fails — never skips — without node. ST-I4, once time-bound (expiry_risk read
the database clock), is pinned: the sweep passes the run-frame's business date as `as_of`.

Expected values are independent of the code under test: plant ids, places and ₹ from the hand-kept answer keys
(`impact_minor`, `where`) and detector-map.json; severities from the pack ladder L worked by hand below; the S-series
on-hand and minimum quantities typed from the keys' `what`. Tests run in file order on one seeded stack.

The id-keyed detectors (overbilled, near-duplicate, shrinkage) are reached by the sweep through their listings
(`purchasing.invoices`, `inventory.counts`, migration 0022; W3.2 driver mints). The xfail(strict) gates are the pack-row
gates this lane cannot meet from its territory; each turns red the day it starts passing, so its marker must go.
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Iterator
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "watch"))
from stack import Bridge, Stack  # noqa: E402

from conftest import REPO
from munim_intel.config import Config, load_config
from munim_intel.contracts_gen.models import InternalSnapshotsRequest
from munim_intel.detect import REGISTRY, DetectorSpec
from munim_intel.runtime.context import RunContext, load_public_key, verify_run_token
from munim_intel.runtime.internal_client import InternalClient
from munim_intel.watch.detectors import inventory_purchasing as inventory_purchasing  # noqa: F401  (registers the pack)
from munim_intel.watch.pipeline import Report, WatchRun

PACK = "inventory_purchasing"
WORLDS = ["store", "restaurant_group", "cloud_kitchen", "au_outlet"]
DAYS = 100
AS_OF = date(2026, 10, 10)
FINDINGS = """SELECT f.tenant_id::text, f.id::text, f.pack, f.type, f.severity, f.dedupe_key, f.envelope,
                     (s.rows -> f.impact_row ->> f.impact_column)::bigint AS impact
                FROM intel.finding f JOIN evidence.snapshot s ON s.tenant_id = f.tenant_id AND s.id = f.impact_snapshot_id
               ORDER BY f.dedupe_key"""

# Sweep-reachable plants: (answer-key id, detector, dedupe-key parts as answer-key aliases or literals, severity by hand).
#   RG-I1 336,000 paise: L medium (≥ ₹2,000, < ₹10,000).  ST-I1 315,000: medium.  AU-I1 21,600 cents: AU L high (≥ A$200).
#   CK-K7 252,000: 4.3 × 252,000 = 1,083,600 ≥ ₹10,000 → high.  The supplier is not in the key: matched by ingredient.
SWEPT = [
    ("RG-I1", "purchasing.price_creep", ["*", "ing:tomato", "2026-w41"], "medium"),
    ("ST-I1", "purchasing.price_creep", ["*", "ing:atta_5kg", "2026-w41"], "medium"),
    ("AU-I1", "purchasing.price_creep", ["*", "ing:milk", "2026-w41"], "high"),
    ("CK-K7", "inventory.waste_spike", ["outlet:1", "ing:cream", "2026-w37"], "high"),
]
# Plants keyed by an invoice or count id the sweep lists: RG-I2 72,000 low; CK-I2 32,000 low; ST-I2 24,000 low;
# AU-I2 10,000 cents medium (≥ A$40); RG-I3 520,000 medium; ST-I3 200,000 medium (= ₹2,000); ST-I5 1,350,000 high.
KEYED = [
    ("RG-I2", "purchasing.overbilled", "inv:paneer-over", "low"),
    ("CK-I2", "purchasing.overbilled", "inv:chicken-over", "low"),
    ("ST-I2", "purchasing.overbilled", "inv:sugar-over", "low"),
    ("AU-I2", "purchasing.overbilled", "inv:beans-over", "medium"),
    ("RG-I3", "purchasing.near_duplicate_invoice", "invoices", "medium"),
    ("ST-I3", "purchasing.near_duplicate_invoice", "invoices", "medium"),
    ("ST-I5", "inventory.shrinkage", "count", "high"),
]
# The pack's waste plants that were NOT MET before wg-1 re-planted them (T-046 report): AU-K7 and CK-I6 now sit in one ISO
# week each (2026-w38, 2026-w41) and ST-K7's key (₹1,800) is over the pack's ₹1,500 excess.
WASTE_NOT_MET = {"AU-K7": ["2026-w38"], "CK-I6": ["2026-w41"], "ST-K7": ["2026-w36"]}
# Waste plants of other detectors whose rows are real waste spikes (detector-map lists them as `also`, as for RG-A1 / RG-C2).
OTHER_WASTE = ["RG-K3", "RG-K7", "AU-K3", "AU-A1"]
# S-series (inventory.below_reorder v1): (key, outlet, ingredient, on hand milli, minimum milli) typed from each key's `what`.
BELOW = [
    ("RG-S1", "outlet:3", "ing:boxes", 30_000, 50_000),
    ("CK-S1", "outlet:1", "ing:lpg", 2_000, 4_000),
    ("ST-S1", "outlet:1", "ing:detergent_1kg", 10_000, 24_000),
    ("AU-S1", "outlet:1", "ing:cups", 120_000, 200_000),
]
WORLD_OF = {"RG": "restaurant_group", "CK": "cloud_kitchen", "ST": "store", "AU": "au_outlet"}
# Pack §4's eight detector ids, typed by hand.
DETECTORS = (
    "inventory.shortfall",
    "inventory.waste_spike",
    "inventory.expiry_risk",
    "inventory.shrinkage",
    "inventory.dead_stock",
    "purchasing.price_creep",
    "purchasing.overbilled",
    "purchasing.near_duplicate_invoice",
)


def answer_key(plant: str) -> dict[str, Any]:
    key = json.loads((REPO / "tools" / "worldgen" / "answer-key" / f"{WORLD_OF[plant[:2]]}.json").read_text("utf8"))
    entry: dict[str, Any] = next(p for p in key["problems"] if p["id"] == plant)
    return entry


def detector_map() -> dict[str, Any]:
    problems: dict[str, Any] = json.loads((REPO / "tools" / "worldgen" / "answer-key" / "detector-map.json").read_text("utf8"))["problems"]
    return problems


def monday_week(offset: int) -> str:
    d = date.fromordinal(AS_OF.toordinal() + offset)
    y, w, _ = d.isocalendar()
    return f"{y}-w{w:02d}"


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(DAYS, WORLDS)
    yield s
    s.stop()


class Harness:
    def __init__(self, stack: Stack, run_dir: Path) -> None:
        self.stack = stack
        (run_dir / "keys").mkdir(parents=True, exist_ok=True)
        (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(stack.ready["public_key_pem"])
        (run_dir / "service-secret").write_text(stack.ready["secret"] + "\n")
        self.cfg: Config = load_config(env={"MUNIM_RUN_DIR": str(run_dir)})
        self.run_ids: list[str] = []

    def ctx(self, world: str) -> RunContext:
        t = self.stack.call("token", world=world, trigger="watch_sweep", scope=["*"])
        self.run_ids.append(t["run_id"])
        return verify_run_token(t["token"], load_public_key(self.cfg.run_token_public_key_pem()))

    def client(self, ctx: RunContext) -> InternalClient:
        return InternalClient(ctx, base_url=self.cfg.core_url, service_secret=self.cfg.service_secret(), transport=Bridge(self.stack))

    def sweep(self, world: str, specs: list[DetectorSpec], on: date | None = None) -> Report:
        """One watcher run; `on` moves every outlet's business date (the frame is pinned to AS_OF otherwise)."""
        ctx = self.ctx(world)
        frame = self.stack.frame(world, "template")
        if on is not None:
            frame = replace(frame, outlets=tuple(replace(o, business_date=on) for o in frame.outlets))

        async def go() -> Report:
            client = self.client(ctx)
            try:
                return await WatchRun(ctx, client, frame, self.cfg).run({PACK: specs})
            finally:
                await client.aclose()

        return asyncio.run(go())

    def id(self, world: str, alias: str) -> str:
        return str(self.stack.call("id", world=world, key=alias))

    def findings(self, world: str | None = None) -> list[dict[str, Any]]:
        rows = [f for f in self.stack.sql(FINDINGS) if f["pack"] == PACK]
        return rows if world is None else [f for f in rows if f["tenant_id"] == self.stack.tenants[world]]


@pytest.fixture(scope="module")
def h(stack: Stack, tmp_path_factory: pytest.TempPathFactory) -> Harness:
    return Harness(stack, tmp_path_factory.mktemp("run"))


def spec(detector: str) -> DetectorSpec:
    return next(s for s in REGISTRY[PACK] if s.id == detector)


def test_sweeps_find_the_reachable_answer_key_plants_with_impact_equal_to_the_key(h: Harness) -> None:
    reports = {w: h.sweep(w, REGISTRY[PACK]).as_json() for w in WORLDS}
    print("reports:", json.dumps(reports, sort_keys=True))
    # No error, and no finding abstained (core's number grammar refuses a narration with a typed figure or number word).
    assert all(r["errors"] == 0 and "abstained" not in r["findings"] for r in reports.values())
    missing = []
    for plant, detector, parts, severity in SWEPT:
        world = WORLD_OF[plant[:2]]
        want = [h.id(world, p) if ":" in p else p for p in parts if p != "*"]
        hits = [f for f in h.findings(world) if f["dedupe_key"].startswith(f"{detector}:") and all(p in f["dedupe_key"] for p in want)]
        got = [(f["type"], f["severity"], int(f["impact"])) for f in hits]
        if got != [(detector, severity, answer_key(plant)["impact_minor"])]:
            missing.append((plant, got))
    assert missing == []


def test_the_held_mushroom_price_is_not_a_creep_and_paneer_is_its_listed_also(h: Harness) -> None:
    """RG-C6 (mushroom invoiced +9% once, then held) stays silent here: one crept observation < the pack's 2. The paneer
    creep is RG-C1 / RG-C1b's `also` in detector-map.json, so it is found and is no false alarm."""
    world = "restaurant_group"
    creeps = [f for f in h.findings(world) if f["type"] == "purchasing.price_creep"]
    assert [f for f in creeps if h.id(world, "ing:mushroom") in f["dedupe_key"]] == []
    assert len([f for f in creeps if h.id(world, "ing:paneer") in f["dedupe_key"]]) == 1
    assert "purchasing.price_creep" in detector_map()["RG-C1"]["also"]


def mapped(h: Harness, plant: str, detector: str) -> set[tuple[str, str]]:
    """The findings (tenant, dedupe key) a sweep made for one answer-key problem that detector-map.json gives `detector`
    (as its detector or in its `also`), matched by what the key's `where` names: the ingredient for a price creep (the key
    names no supplier), outlet + ingredient + the ISO weeks of the planted days for waste, the batch code for expiry."""
    world, where = WORLD_OF[plant[:2]], answer_key(plant)["where"]
    tenant, found = h.stack.tenants[world], h.findings(world)
    if detector == "purchasing.price_creep":
        ing = h.id(world, where["ingredient"])
        return {(tenant, f["dedupe_key"]) for f in found if f["type"] == detector and f":{ing}:" in f["dedupe_key"]}
    if detector == "inventory.waste_spike":
        days = where.get("waste_offsets", []) + list(range(where.get("from_offset", 0), where.get("to_offset", -1) + 1))
        stem = f"{detector}:{h.id(world, where['outlet'])}:{h.id(world, where['ingredient'])}:"
        return {(tenant, f["dedupe_key"]) for f in found if f["dedupe_key"] in {stem + monday_week(o) for o in days}}
    if detector == "inventory.expiry_risk":
        (b,) = h.stack.sql("SELECT id::text FROM core.batch WHERE tenant_id = $1 AND batch_code = $2", tenant, where["batch"])
        return {(tenant, f["dedupe_key"]) for f in found if f["dedupe_key"] == f"{detector}:{h.id(world, where['outlet'])}:{b['id']}"}
    if detector in ("purchasing.overbilled", "purchasing.near_duplicate_invoice", "inventory.shrinkage"):
        return {(tenant, f["dedupe_key"]) for f in found if f["dedupe_key"] == keyed_key(h, plant, detector)}
    return set()


def keyed_key(h: Harness, plant: str, detector: str) -> str:
    """The dedupe key an id-keyed plant takes, from the key's `where` (a count by its outlet's one stock count)."""
    world, where = WORLD_OF[plant[:2]], answer_key(plant)["where"]
    if "invoices" in where:
        return f"{detector}:{min(h.id(world, a) for a in where['invoices'])}"
    if "invoice" in where:
        return f"{detector}:{h.id(world, where['invoice'])}"
    (count,) = h.stack.sql("SELECT id::text FROM core.stock_count WHERE tenant_id = $1", h.stack.tenants[world])
    return f"{detector}:{count['id']}"


def false_alarms(h: Harness) -> dict[str, list[tuple[str, str]]]:
    """Per world, the findings that are no detector-map problem of this pack's detectors (detector or `also`)."""
    ok: set[tuple[str, str]] = set()
    for plant, p in detector_map().items():
        for detector in {p.get("detector"), *p.get("also", [])} & set(DETECTORS):
            if p.get("expect") != "no_finding":
                ok |= mapped(h, plant, detector)
    return {w: [(f["type"], f["dedupe_key"]) for f in h.findings(w) if (f["tenant_id"], f["dedupe_key"]) not in ok] for w in WORLDS}


def test_every_false_alarm_is_dead_stock_or_a_waste_plant_of_another_detector(h: Harness) -> None:
    """A characterization, not the pack gate (that is the xfail below): what detector-map.json does not explain is
    dead stock (the store's plant batches and the kitchen's LPG, listed as `also` but not read by mapped()) or a real
    waste spike planted for kitchen.overprep / compliance.temp_excursion (RG-K3, RG-K7, AU-K3, AU-A1: `also` since wg-1)."""
    other: set[tuple[str, str]] = set()
    for plant in OTHER_WASTE:
        other |= mapped(h, plant, "inventory.waste_spike")
    alarms = false_alarms(h)
    print("false alarms by detector-map:", {w: (len(a), sorted({t for t, _ in a})) for w, a in alarms.items()})
    rest = [(w, t) for w, a in alarms.items() for t, k in a if (h.stack.tenants[w], k) not in other]
    assert {t for _, t in rest} <= {"inventory.dead_stock"}


@pytest.mark.xfail(
    strict=True,
    raises=AssertionError,
    reason="NOT MET (wg-1): store 3 — dead stock on the batches of other plants (ST-C4, ST-I4, ST-I5: `also` "
    "inventory.dead_stock in detector-map.json), which mapped() does not read for dead_stock",
)
def test_false_alarms_are_at_most_two_per_world(h: Harness) -> None:
    alarms = false_alarms(h)
    print("false alarms per world:", {w: len(a) for w, a in alarms.items()})
    assert all(len(a) <= 2 for a in alarms.values())


def test_the_pack_waste_plants_are_found_with_impact_equal_to_the_key(h: Harness) -> None:
    got = {}
    for plant in WASTE_NOT_MET:
        world, where = WORLD_OF[plant[:2]], answer_key(plant)["where"]
        stem = f"inventory.waste_spike:{h.id(world, where['outlet'])}:{h.id(world, where['ingredient'])}:"
        got[plant] = [int(f["impact"]) for f in h.findings(world) if f["dedupe_key"].startswith(stem)]
    print("waste plant impacts:", got)
    assert got == {p: [answer_key(p)["impact_minor"]] for p in WASTE_NOT_MET}


def test_the_store_batch_expiring_soon_is_found_inside_its_window(h: Harness) -> None:
    """ST-I4's batch sits at as-of + 3. The sweep mints expiry_risk with `as_of` = the run-frame's business date (AS_OF),
    never the database clock, so the plant is inside its window on any wall-clock day: a precondition, never a skip."""
    tenant = h.stack.tenants["store"]
    (b,) = h.stack.sql(
        "SELECT id::text, (expires_on - $3::date)::int AS left_days FROM core.batch WHERE tenant_id = $1 AND batch_code = $2",
        tenant,
        answer_key("ST-I4")["where"]["batch"],
        AS_OF.isoformat(),
    )
    assert 0 <= int(b["left_days"]) <= 7, f"ST-I4's batch is {b['left_days']} days from expiry at AS_OF"
    hits = [f for f in h.findings("store") if f["dedupe_key"] == f"inventory.expiry_risk:{h.id('store', 'outlet:1')}:{b['id']}"]
    print("ST-I4:", [(f["severity"], f["impact"]) for f in hits])
    assert [(f["severity"], int(f["impact"])) for f in hits] == [("low", answer_key("ST-I4")["impact_minor"])]  # ₹1,000 < ₹2,000


def test_id_keyed_detectors_find_their_plants_through_the_sweeps_listings(h: Harness) -> None:
    """No ids handed in: the first test's sweep listed the tenant's invoices and minted each. ST-I5's count is submitted
    through the API on the seed day (wall clock, after AS_OF), so the store's counts are listed by a sweep on that
    business date — as a live sweep on the day of the count would."""
    (seed,) = h.stack.sql(
        """SELECT max(((sc.counted_at AT TIME ZONE o.tz) - o.business_day_cutoff)::date)::text AS d FROM core.stock_count sc
             JOIN core.outlet o ON o.tenant_id = sc.tenant_id AND o.id = sc.outlet_id WHERE sc.tenant_id = $1""",
        h.stack.tenants["store"],
    )
    assert h.sweep("store", [spec("inventory.shrinkage")], on=date.fromisoformat(seed["d"])).errors == 0
    got = [
        (plant, [(f["severity"], int(f["impact"])) for f in h.findings(WORLD_OF[plant[:2]]) if f["dedupe_key"] == keyed_key(h, plant, d)])
        for plant, d, _, _ in KEYED
    ]
    print("keyed:", got)
    # Each near-duplicate pair is minted from both invoices and is one finding (the second listing merges).
    assert got == [(p, [(s, answer_key(p)["impact_minor"])]) for p, _, _, s in KEYED]


def test_each_overbilled_invoice_gets_its_dispute_from_the_pipeline(h: Harness) -> None:
    """Pack §6 for I2: the sweep's mapping (window params + the snapshot's line rows, W3.2) drafted one dispute per
    overbilled plant; core resolved every ref and stored it `proposed` as intel:inventory_purchasing. Each key plants one
    overbilled line (answer-key `what`), so each dispute claims exactly one line, by ref, under that finding."""
    out = []
    for plant in ("RG-I2", "CK-I2", "ST-I2", "AU-I2"):
        world = WORLD_OF[plant[:2]]
        (f,) = [f for f in h.findings(world) if f["dedupe_key"] == keyed_key(h, plant, "purchasing.overbilled")]
        rows = h.stack.sql(
            """SELECT source, status, command_payload FROM core.draft
                WHERE finding_id = $1 AND command_type = 'purchasing.invoice.dispute.v1'""",
            f["id"],
        )
        out.append(
            (plant, [(d["source"], d["status"], d["command_payload"]["supplier_invoice_id"], d["command_payload"]["lines"]) for d in rows])
        )
    print("disputes:", out)
    for plant, ds in out:
        invoice = h.id(WORLD_OF[plant[:2]], answer_key(plant)["where"]["invoice"])
        ((source, status, inv, lines),) = ds
        assert (source, status, inv) == (f"intel:{PACK}", "proposed", invoice), plant
        assert len(lines) == 1 and lines[0]["claimed_minor"].endswith("·overbilled_minor⟩"), plant


def test_every_finding_draft_and_trace_carries_the_specialist(h: Harness) -> None:
    findings = h.findings()
    every = h.stack.sql("SELECT pack FROM intel.finding")
    drafts = h.stack.sql("SELECT source FROM core.draft WHERE source LIKE 'intel:%'")
    actors = h.stack.sql("SELECT DISTINCT actor FROM intel.trace_event WHERE run_id = ANY($1::uuid[])", h.run_ids)
    print("findings:", len(findings), "drafts:", len(drafts), "actors:", actors)
    assert len(findings) == len(every) > 0
    assert {d["source"] for d in drafts} == {f"intel:{PACK}"}
    assert {a["actor"] for a in actors} == {f"watcher:{PACK}"}


def test_a_second_sweep_adds_no_finding(h: Harness) -> None:
    """Re-detection merges (price_creep is tenant-wide and minted once per outlet: it merges within a sweep too)."""
    before = len(h.findings())
    reports = {w: h.sweep(w, REGISTRY[PACK]).as_json() for w in WORLDS}
    print("second sweep:", {w: r["findings"] for w, r in reports.items()})
    assert len(h.findings()) == before
    assert all(set(r["findings"]) <= {"merged"} for r in reports.values())


def test_below_reorder_v1_carries_the_s_series_quantities(h: Harness) -> None:
    """inventory.below_reorder stays the 0005 v1 (no params). Its on-hand and minimum cells equal each S plant's `what`,
    so v1 suffices for the S-series tile; neither v1 nor the pack's v2 has a ₹ column for the keys' impact."""
    got = []
    for plant, outlet, ingredient, _, _ in BELOW:
        world = WORLD_OF[plant[:2]]
        ctx = h.ctx(world)

        async def mint(ctx: RunContext = ctx) -> list[dict[str, Any]]:
            client = h.client(ctx)
            try:
                req = InternalSnapshotsRequest.model_validate({"template_id": "inventory.below_reorder", "params": {}})
                snap = await client.mint_snapshot(req)
                rows: list[dict[str, Any]] = snap.model_dump(mode="json")["rows"]
                return rows
            finally:
                await client.aclose()

        row = next(r for r in asyncio.run(mint()) if (r["outlet_id"], r["ingredient_id"]) == (h.id(world, outlet), h.id(world, ingredient)))
        got.append((plant, int(row["on_hand_milli"]), int(row["min_qty_milli"])))
    assert got == [(p, on_hand, minimum) for p, _, _, on_hand, minimum in BELOW]
