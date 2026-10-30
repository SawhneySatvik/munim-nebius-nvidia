"""T-044 end to end: the Menu & Pricing detectors through intel's WatchRun against the real core-api internal API on
embedded Postgres, the four worldgen worlds seeded through the API in the 100-day gate profile. Fails — never skips —
without node.

Expected values are independent of the code under test: which plants belong to this specialist, where they sit and
their ₹ come from the hand-kept answer keys and detector-map.json (`detector`, `also`, `expect: no_finding`);
severities are the IN ladder L worked by hand below. One assert is `xfail(strict=True)`: it encodes a measured
pack/plant mismatch the orchestrator owns (T-044 report) and turns red the day the mismatch is fixed. (wg-1 fixed RG-C2's
window and R47 D9's 65% target margin unblocked the C1 price draft: both gates below are plain asserts now.)
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterator
from typing import Any

import pytest
from menu_market_harness import WORLD_OF_PREFIX, WORLDS, Stack, Sweeper, answer_key, detector_map

from munim_intel.watch.detectors.catalogue import above_mrp, below_cost, cost_drift, deal_loss, negative_margin, recipe_waste_gap

PACK = "catalogue"
SPECS = [above_mrp.SPEC, below_cost.SPEC, cost_drift.SPEC, deal_loss.SPEC, negative_margin.SPEC, recipe_waste_gap.SPEC]
#: IN ladder L by hand: 224,041, 263,894 and 295,008 are ≥ 200,000 and < 1,000,000 → medium; above MRP is critical.
SEVERITY = {"RG-C1": "medium", "RG-C1b": "medium", "RG-C2": "medium", "ST-C4": "critical"}
#: Measured pack/plant mismatch (wg-1): the worlds' baseline waste (North's tomato, Central's oil, South's paneer; the café's
#: milk and beans) runs far above the recipes' 2% allowance, so dishes no plant touches pass the 300 bp gap.
BASELINE_WASTE = "baseline waste on unplanted pairs runs far above the recipes' allowance (worldgen follow-up)"


def plants() -> list[tuple[str, str, dict[str, Any]]]:
    """(key id, world, map entry) of every answer-key problem whose map detector is one of this specialist's."""
    m = detector_map()["problems"]
    out = []
    for pid, entry in m.items():
        if (entry.get("detector") or "").startswith(f"{PACK}."):
            out.append((pid, WORLD_OF_PREFIX[pid[:2]], entry))
    return out


def key_entry(world: str, pid: str) -> dict[str, Any]:
    entry: dict[str, Any] = next(p for p in answer_key(world)["problems"] if p["id"] == pid)
    return entry


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(100, WORLDS)
    yield s
    s.stop()


class Swept:
    def __init__(self, sw: Sweeper) -> None:
        self.sw = sw
        self.reports = {w: sw.sweep(w, PACK, SPECS) for w in WORLDS}
        self.findings = sw.findings(PACK)

    def prefixes(self, world: str, where: dict[str, Any], detector: str) -> set[str]:
        """Dedupe-key prefixes of the rows a plant names: its item, or every item whose recipe uses its ingredient."""
        outlet = self.sw.id(world, where["outlet"])
        if "item" in where:
            rows = {f"{outlet}:{self.sw.id(world, where['item'])}"}
        else:
            rows = self.sw.items_using(world, outlet, where["ingredient"])
        return {f"{detector}:{r}" for r in rows}

    def of(self, world: str) -> list[dict[str, Any]]:
        tenant = self.sw.stack.tenants[world]
        return [f for f in self.findings if f["tenant_id"] == tenant]


@pytest.fixture(scope="module")
def swept(stack: Stack, tmp_path_factory: pytest.TempPathFactory) -> Swept:
    return Swept(Sweeper(stack, tmp_path_factory.mktemp("run")))


def matched(s: Swept, pid: str, world: str, entry: dict[str, Any]) -> list[dict[str, Any]]:
    pre = s.prefixes(world, key_entry(world, pid)["where"], entry["detector"])
    return [f for f in s.of(world) if any(f["dedupe_key"].startswith(p + ":") or f["dedupe_key"] == p for p in pre)]


def test_the_cost_drift_and_above_mrp_plants_are_found_with_impact_equal_to_the_key(swept: Swept) -> None:
    print("reports:", {w: r.as_json() for w, r in swept.reports.items()})
    found = []
    for pid, world, entry in plants():
        if entry.get("expect") == "no_finding" or pid == "RG-C2":
            continue
        hits = matched(swept, pid, world, entry)
        want = key_entry(world, pid)["impact_minor"]
        found.append((pid, [(int(h["impact"]), h["severity"], h["confidence_bp"]) for h in hits], want))
    print("plants:", found)
    # Hand list from detector-map.json: RG-C1, RG-C1b (cost_drift) and ST-C4 (above_mrp); RG-C2 has its own gate below.
    assert sorted(pid for pid, _, _ in found) == ["RG-C1", "RG-C1b", "ST-C4"]
    assert [(pid, hits) for pid, hits, want in found] == [(pid, [(want, SEVERITY[pid], 10_000)]) for pid, _, want in found]


def test_the_rg_c6_held_cost_is_not_flagged_while_rg_c1_at_another_outlet_is(swept: Swept) -> None:
    """The trap is paired with an accept: the same detector over the same world finds RG-C1's drift."""
    traps = [(pid, w, e) for pid, w, e in plants() if e.get("expect") == "no_finding"]
    assert [pid for pid, _, _ in traps] == ["RG-C6"]
    ((pid, world, entry),) = traps
    hits = matched(swept, pid, world, entry)
    rg_c1 = matched(swept, "RG-C1", "restaurant_group", {"detector": "catalogue.cost_drift"})
    print(
        "RG-C6 rows:",
        sorted(swept.prefixes(world, key_entry(world, pid)["where"], entry["detector"])),
        "findings:",
        hits,
        "RG-C1:",
        len(rg_c1),
    )
    assert hits == [] and len(rg_c1) == 1


def false_alarms(s: Swept, world: str) -> Counter[str]:
    """Findings no plant or `also` entry of this world explains, per detector."""
    explained: set[str] = set()
    for pid, entry in detector_map()["problems"].items():
        if WORLD_OF_PREFIX[pid[:2]] != world:
            continue
        detectors = [d for d in [entry.get("detector"), *entry.get("also", [])] if d and d.startswith(f"{PACK}.")]
        if entry.get("expect") == "no_finding":
            continue
        where = key_entry(world, pid)["where"]
        if "outlet" not in where:
            continue
        for d in detectors:
            explained |= s.prefixes(world, where, d)
    out: Counter[str] = Counter()
    for f in s.of(world):
        if not any(f["dedupe_key"].startswith(p + ":") or f["dedupe_key"] == p for p in explained):
            out[f["type"]] += 1
    return out


def test_false_alarms_per_world_are_at_most_two_outside_recipe_waste_gap(swept: Swept) -> None:
    counts = {w: false_alarms(swept, w) for w in WORLDS}
    print("false alarms per world and detector:", {w: dict(c) for w, c in counts.items()})
    outside = {w: sum(n for t, n in c.items() if t != "catalogue.recipe_waste_gap") for w, c in counts.items()}
    assert len(outside) == len(WORLDS) and max(outside.values()) <= 2, outside


@pytest.mark.xfail(strict=True, raises=AssertionError, reason=BASELINE_WASTE)
def test_recipe_waste_gap_false_alarms_are_at_most_two_on_every_world(swept: Swept) -> None:
    counts = {w: false_alarms(swept, w)["catalogue.recipe_waste_gap"] for w in WORLDS}
    print("recipe_waste_gap false alarms:", counts)
    assert max(counts.values()) <= 2


def test_rg_c2_is_found_at_its_key(swept: Swept) -> None:
    (entry,) = [e for pid, _, e in plants() if pid == "RG-C2"]
    hits = matched(swept, "RG-C2", "restaurant_group", entry)
    print("RG-C2:", [(h["dedupe_key"], h["impact"]) for h in hits])
    assert [int(h["impact"]) for h in hits] == [key_entry("restaurant_group", "RG-C2")["impact_minor"]]


def test_c5_new_dish_without_a_recipe_has_an_unknown_margin_and_no_finding(swept: Swept) -> None:
    """C5's precondition: the dish sold the key's units with no recipe version, so its margin cell is null and no
    detector files it. The `recipe_missing` refusal itself is the ask path's (T-082), not a watcher's."""
    world, pid = "restaurant_group", "RG-C5"
    e = key_entry(world, pid)
    outlet, item = swept.sw.id(world, e["where"]["outlet"]), swept.sw.id(world, e["where"]["item"])
    rows = swept.sw.stack.sql(
        """SELECT s.rows FROM evidence.snapshot s WHERE s.tenant_id = $1 AND s.template_id = 'catalogue.dish_margin'
             AND s.params ->> 'outlet_id' = $2 ORDER BY s.created_at DESC LIMIT 1""",
        swept.sw.stack.tenants[world],
        outlet,
    )
    (row,) = [r for r in rows[0]["rows"] if r["item_id"] == item]
    print("RG-C5 row:", row)
    assert (row["units_sold"], row["recipe_version_id"], row["margin_minor"]) == (e["metric"]["value"], None, None)
    assert [f for f in swept.of(world) if item in f["dedupe_key"]] == []


def test_every_catalogue_finding_and_trace_carries_the_specialist(swept: Swept) -> None:
    # Selected by finding type, not by the pack under test: a finding filed under another specialist is counted here.
    findings = swept.sw.stack.sql("SELECT pack, type FROM intel.finding WHERE type LIKE 'catalogue.%'")
    actors = swept.sw.stack.sql(
        """SELECT DISTINCT t.actor FROM intel.trace_event t JOIN intel.run r ON r.tenant_id = t.tenant_id AND r.id = t.run_id
            WHERE r.trigger = 'watch_sweep'"""
    )
    drafts_ = swept.sw.stack.sql(
        """SELECT d.source, d.command_type, d.status, d.finding_id::text, f.type AS finding_type FROM core.draft d
             LEFT JOIN intel.finding f ON f.tenant_id = d.tenant_id AND f.id = d.finding_id WHERE d.source LIKE 'intel:%'"""
    )
    types = Counter(f["type"] for f in findings)
    print("findings:", len(findings), types, "actors:", actors, "drafts:", Counter((d["command_type"], d["finding_type"]) for d in drafts_))
    assert len(findings) == len(swept.findings) > 0 and {f["pack"] for f in findings} == {PACK}
    assert {a["actor"] for a in actors} == {"watcher:catalogue"}
    # Rule (pack §6, W3.2 follow-up mints): each recipe_waste_gap finding gets its recipe draft from recipe_current; no
    # negative margin or deal-tagged order fires here; each cost_drift finding gets its price draft from dish_margin's
    # suggested price, which exists now that the worlds set a 65% target margin (R47 D9). By hand: the two dish plants of
    # detector-map.json (RG-C1 Central, RG-C1b South paneer tikka; RG-C6 is a no-finding trap) → 2 price drafts, one on
    # each plant's finding. ST-I1's `also` cost_drift (the shop's atta, a SKU no recipe uses) has no dish_margin row to
    # price from, so no draft. All proposed, as intel:catalogue.
    price_findings = {d["finding_id"] for d in drafts_ if d["command_type"] == "catalogue.price.set.v1"}
    plant_findings = {
        f["id"] for pid in ("RG-C1", "RG-C1b") for f in matched(swept, pid, "restaurant_group", detector_map()["problems"][pid])
    }
    assert price_findings == plant_findings and len(plant_findings) == 2
    rest = [f["tenant_id"] for f in swept.findings if f["type"] == "catalogue.cost_drift" and f["id"] not in plant_findings]
    assert rest == [swept.sw.stack.tenants["store"]], "the one other cost_drift finding is the shop's (ST-I1's `also`)"
    assert Counter((d["command_type"], d["finding_type"], d["status"], d["source"]) for d in drafts_) == {
        ("catalogue.recipe.version.create.v1", "catalogue.recipe_waste_gap", "proposed", "intel:catalogue"): types[
            "catalogue.recipe_waste_gap"
        ],
        ("catalogue.price.set.v1", "catalogue.cost_drift", "proposed", "intel:catalogue"): 2,
    }


def test_the_c1_price_draft_is_proposed_from_dish_margin(swept: Swept) -> None:
    """Pack §6 C1: RG-C1's cost-drift finding carries a `catalogue.price.set.v1` draft the sweep proposed (its follow-up
    `catalogue.dish_margin` mint), now that the worlds set a target margin (R47 D9: 65%). The amount is a canonical ref to
    that dish_margin snapshot's `suggested_price_minor` cell on the drifting item's own row; `based_on` also carries the
    finding's drift cell. Read back from core's own rows — the sweep's draft, not a re-post."""
    world, sw = "restaurant_group", swept.sw
    (entry,) = [e for pid, _, e in plants() if pid == "RG-C1"]
    (f,) = matched(swept, "RG-C1", world, entry)
    (d,) = sw.stack.sql(
        """SELECT status, source, command_payload, based_on FROM core.draft
            WHERE finding_id = $1 AND command_type = 'catalogue.price.set.v1'""",
        f["id"],
    )
    amount = d["command_payload"]["amount_minor"]
    sid, row, col = amount[len("⟨snap:") : -1].split("·")
    (snap,) = sw.stack.sql("SELECT template_id, rows -> $2::int AS row FROM evidence.snapshot WHERE id = $1", sid, int(row))
    item = sw.id(world, key_entry(world, "RG-C1")["where"]["item"])
    print("C1 draft:", d["status"], d["source"], amount, snap)
    assert (d["status"], d["source"], col) == ("proposed", "intel:catalogue", "suggested_price_minor")
    assert snap["template_id"] == "catalogue.dish_margin" and snap["row"]["item_id"] == item == d["command_payload"]["item_id"]
    based_on = [b["ref"] for b in d["based_on"]]
    assert snap["row"]["suggested_price_minor"] is not None and amount in based_on
    assert any(ref.endswith("·cost_drift_minor⟩") for ref in based_on), "the drift cell rides in based_on"
