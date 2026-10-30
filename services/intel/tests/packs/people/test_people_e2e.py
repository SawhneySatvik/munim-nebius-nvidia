"""T-048 end to end: the People detectors in intel's real `/watch:sweep` against the real core-api on embedded Postgres,
the four worldgen worlds at the gate profile (100 days to Sat 2026-10-10). Fails — never skips — without node.

Expected values are independent of the code under test: the hand-kept answer keys and the worldgen literals they cite
(restaurant_group.ts: Ravi, ₹120/h, and au_outlet.ts: Liam, A$30/h, each clock out 45 min late on days 1, 3, 5, 7, 8,
10, 11, 13, 14, 15, 17, 18, 20–25 counted from Mon 14 Sep — 3, 5, 5 and 5 of the four ISO weeks' 7, 7, 7 and 5 shifts;
overtime at 1.5 ×), worked by hand per ISO week against packs/people.md §4. The overtime rule itself is then exercised
on the same rows with the bar set, in this test only, to each plant's own total and one minute above it.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "kitchen"))

from e2e_harness import DAYS, WORLDS, Harness, answer_key  # noqa: E402
from stack import Stack  # noqa: E402

from munim_intel.detect import Ladder, Window  # noqa: E402
from munim_intel.skills.people import skill  # noqa: E402
from munim_intel.watch.detectors.people import overtime_drift  # noqa: E402


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(DAYS, WORLDS)
    yield s
    s.stop()


@pytest.fixture(scope="module")
def h(stack: Stack, tmp_path_factory: pytest.TempPathFactory) -> Harness:
    return Harness(stack, tmp_path_factory.mktemp("run"))


def keyed(h: Harness, world: str) -> dict[str, dict[str, Any]]:
    tenant = h.stack.tenants[world]
    return {f["dedupe_key"]: f for f in h.findings("people") if f["tenant_id"] == tenant}


#: RG-P2 (R47 D6, labour_vs_demand v2): North's six helper weekday-slots and each one's Σ (excess_min, excess_cost_minor),
#: typed from the m0026 world check (db/tests/templates-worlds.ts, by hand from the key's `what` and the world's own bills):
#: every surplus minute at the helpers' 8,000 an hour; 540 min → 72,000, 480 → 64,000; Σ 3,060 / 408,000. The key's 3,600 /
#: 480,000 counts every planted helper minute: three slot-days also carry a baseline bill and the rolling norm absorbs the
#: plant in its fifth week (db/README.md 0026 "RG-P2 vs its key") — a worldgen/key gap, recorded, not hidden here.
#: The detector's window (29 Aug – 9 Oct) adds Tue 1 Sep and Wed 2 Sep to the m0026 window: crew only, one bill, excess 0.
P2_SIGMA = {
    ("tue", "15:00"): (540, 72_000),
    ("tue", "16:00"): (480, 64_000),
    ("tue", "17:00"): (540, 72_000),
    ("wed", "15:00"): (480, 64_000),
    ("wed", "16:00"): (540, 72_000),
    ("wed", "17:00"): (480, 64_000),
}
P2_TOTAL = 408_000


def test_sweeps_find_the_people_plants_the_section_4_bars_admit(h: Harness) -> None:
    for w in WORLDS:
        h.sweep(w)
    found = {w: keyed(h, w) for w in WORLDS}
    print("people findings:", {w: sorted(f) for w, f in found.items()})
    rg_n, ravi = h.id("restaurant_group", "outlet:1"), h.id("restaurant_group", "staff:ravi")
    au, liam = h.id("au_outlet", "outlet:1"), h.id("au_outlet", "staff:liam")
    # RG-P3: ₹15,000 advanced to Ravi 90 days back, nothing recovered: ≥ ₹2,000 and > 60 days. L: ≥ 1,000,000 → high.
    p3 = found["restaurant_group"].pop(f"people.advance_unrecovered:{rg_n}:{ravi}:2026-10")
    assert (p3["impact"], p3["severity"], p3["impact_column"]) == (answer_key("RG-P3")["impact_minor"], "high", "outstanding_minor")
    # RG-P1 / AU-P1: 18 late days × 45 = 810 extra minutes in the four weeks (W38 135 < W41 225) ≥ 600. The finding sits on
    # W41, its impact the member's Σ row: RG 810 / 60 × 12,000 × 1.5 = 243,000 → medium (IN ≥ 200,000); AU 810 / 60 × 3,000
    # × 1.5 = 60,750 cents → AU high (≥ 20,000).
    p1 = found["restaurant_group"].pop(f"people.overtime_drift:{rg_n}:{ravi}:2026-w41")
    a1 = found["au_outlet"].pop(f"people.overtime_drift:{au}:{liam}:2026-w41")
    assert (p1["impact"], p1["severity"], a1["impact"], a1["severity"]) == (
        answer_key("RG-P1")["impact_minor"],
        "medium",
        answer_key("AU-P1")["impact_minor"],
        "high",
    )
    # RG-P2 (R47 D6): NOT found today. North's six-week hourly window is 42 days of staffed slots plus the Σ rows: more
    # than core's 500-row snapshot cap (02-schema), which cuts the newest days unannounced. The sweep abstains `row_cap`
    # rather than judge part of a window (test_rg_p2_sigma_is_the_helpers_cost_at_their_own_rate shows the cap is hit).
    # Once the window fits, the six findings are P2_SIGMA's, low each (72,000 × 4.3 ÷ 6 = 51,600 < IN medium 200,000).
    assert not [k for k in found["restaurant_group"] if k.startswith("people.overstaffed_slot:")], sorted(found["restaurant_group"])
    capped = h.stack.sql("SELECT payload FROM intel.trace_event WHERE kind = 'abstain' AND payload ->> 'reason' = 'row_cap'")
    assert capped and all(r["payload"]["detector"] == "people.overstaffed_slot" for r in capped)
    # R47 D9 (worldgen's demo targets, labour 30%): AU's café is at or over its target in W39, W40 and W41, so
    # people.labour_pct_high fires on W40 and W41 (two weeks in a row each). No key entry (P4 is not planted): judged here on
    # the template's own cells against the D9 target, 3,000 bp, with labour worked by hand from au_outlet.ts: Liam and Zoe
    # rostered 07:00-15:00 daily at A$30/h, Liam +45 min on 5 shifts a week (AU-P1): 2 x 7 x 480 + 5 x 45 = 6,945 min
    # x 50 c = 347,250 (W39, W40); W41 to Fri 9 Oct, 5 days: (2 x 5 x 480 + 5 x 45) x 50 = 251,250. Labour is 107-124% of
    # sales: two full-time baristas against the café's A$2,000-3,200 a week — a worldgen realism gap, reported.
    for w in ("40", "41"):
        found["au_outlet"].pop(f"people.labour_pct_high:{au}:2026-w{w}")
    weeks = h.mint("au_outlet", "people.labour_pct", {"outlet_id": au, "from": "2026-09-21", "to": "2026-10-10"})["rows"]
    print("AU labour_pct:", [(r["iso_week"], r["labour_bp"], r["target_bp"], r["labour_minor"], r["net_sales_minor"]) for r in weeks])
    assert [(r["iso_week"], r["target_bp"], r["labour_minor"], r["labour_bp"] >= 3000) for r in weeks] == [
        ("2026-W39", 3000, 347_250, True),
        ("2026-W40", 3000, 347_250, True),
        ("2026-W41", 3000, 251_250, True),
    ]
    # Nothing else: 0 false alarms in every world.
    assert found == {"restaurant_group": {}, "cloud_kitchen": {}, "store": {}, "au_outlet": {}}


def weeks(h: Harness, world: str, outlet: str, staff: str) -> dict[str, int]:
    rows = h.mint(world, "people.overtime_drift", {"outlet_id": outlet, "from": "2026-09-14", "to": "2026-10-10"})["rows"]
    # Week rows only: v2's Σ row (iso_week NULL) comes first (0023 P1).
    return {r["iso_week"]: r["extra_min"] for r in rows if r["staff_id"] == staff and r["iso_week"] is not None and r["extra_min"]}


def test_the_overtime_plants_weekly_minutes_by_the_templates_own_cells(h: Harness) -> None:
    rg = weeks(h, "restaurant_group", h.id("restaurant_group", "outlet:1"), h.id("restaurant_group", "staff:ravi"))
    au = weeks(h, "au_outlet", h.id("au_outlet", "outlet:1"), h.id("au_outlet", "staff:liam"))
    print("RG-P1 extra minutes:", rg, "AU-P1:", au)
    assert rg == au == {"2026-W38": 3 * 45, "2026-W39": 5 * 45, "2026-W40": 5 * 45, "2026-W41": 5 * 45}


def test_rg_p2_is_judged_against_its_planted_demand_norm(h: Harness) -> None:
    """RG-P2's helpers work Tue/Wed 15:00–18:00 at North from 8 Sep; North's crew is on the books from 14 Jul and each of
    those slots has one planted order a day, so the template's 8-week norm (attended minutes per order) exists and the
    need is positive on every planted slot (wg-1; it was nothing before)."""
    rows = h.mint(
        "restaurant_group",
        "people.labour_vs_demand",
        {"outlet_id": h.id("restaurant_group", "outlet:1"), "from": "2026-09-08", "to": "2026-10-07", "slot_minutes": 60},
    )["rows"]
    days = [r for r in rows if r["business_on"] is not None]  # v2 (0026) adds a Σ row with no day
    p2 = [r for r in days if date.fromisoformat(r["business_on"]).isoweekday() in (2, 3) and r["slot_start"] in ("15:00", "16:00", "17:00")]
    print("RG-P2 slots:", [(r["business_on"], r["slot_start"], r["attended_min"], r["needed_min"]) for r in p2])
    # Ten Tue/Wed days × three hourly slots; on each the two helpers add 2 × 60 minutes to the crew's 2 × 60.
    assert len(p2) == 30 and all(r["attended_min"] == 240 and r["needed_min"] > 0 for r in p2)
    print("RG-P2: planted", answer_key("RG-P2")["impact_minor"])


def test_rg_p2_sigma_is_the_helpers_cost_at_their_own_rate(h: Harness) -> None:
    """R47 D6: v2 costs the excess at the extra staff's rate (the helpers' 8,000 an hour), not the blended crew rate, in one
    Σ row per (outlet, weekday, slot) — the cell each finding's impact cites. Over the detector's own window (six weeks of
    complete days to Fri 9 Oct) the six helper slots read P2_SIGMA, and every day row of theirs is priced at 8,000/h."""
    body = h.mint(
        "restaurant_group",
        "people.labour_vs_demand",
        {"outlet_id": h.id("restaurant_group", "outlet:1"), "from": "2026-08-29", "to": "2026-10-09", "slot_minutes": 60},
    )
    # The cap (02-schema, 500 rows) cuts this window: why the sweep abstains on it today (the Σ rows come first, so whole).
    assert body["row_count"] == 500
    rows = body["rows"]
    sigma = {(r["weekday"], r["slot_start"]): (r["excess_min"], r["excess_cost_minor"]) for r in rows if r["business_on"] is None}
    print("RG-P2 Σ rows:", {k: v for k, v in sigma.items() if k in P2_SIGMA})
    assert {k: sigma.get(k) for k in P2_SIGMA} == P2_SIGMA
    assert sum(cost for _, cost in P2_SIGMA.values()) == P2_TOTAL != answer_key("RG-P2")["impact_minor"]
    p2 = [r for r in rows if r["business_on"] is not None and (r["weekday"], r["slot_start"]) in P2_SIGMA and r["excess_min"]]
    assert p2 and all(r["excess_cost_minor"] * 60 == r["excess_min"] * 8_000 for r in p2)


def test_overtime_rule_on_the_plants_rows_fires_at_their_own_totals_and_not_one_minute_above(h: Harness) -> None:
    """The rule on the real rows, with the bar at each plant's own total (810 minutes) and one minute above it: it fires on
    the last week's row with the member's Σ row as the impact, and not at all one minute above."""
    out = {}
    for world, plant, ladder in (
        ("restaurant_group", "RG-P1", Ladder(5_000_000, 1_000_000, 200_000)),
        ("au_outlet", "AU-P1", Ladder(100_000, 20_000, 4_000)),
    ):
        outlet, staff = h.id(world, "outlet:1"), h.id(world, answer_key(plant)["where"]["staff"])
        params = {"outlet_id": outlet, "from": "2026-09-14", "to": "2026-10-10"}
        rows = h.mint(world, "people.overtime_drift", params)["rows"]
        w = Window(params, "2026-w41")
        hits = {bar: overtime_drift.select(rows, w, {"extra_min_gte": bar}, ladder) for bar in (810, 811)}
        (hit,) = hits[810]
        impact = int(rows[hit.impact_row]["extra_cost_minor"])
        out[plant] = (rows[hit.row]["iso_week"], rows[hit.impact_row]["iso_week"], impact, hits[811])
        assert rows[hit.row]["staff_id"] == staff
    print("overtime rule at the plants' totals:", out)
    assert out == {
        "RG-P1": ("2026-W41", None, answer_key("RG-P1")["impact_minor"], []),
        "AU-P1": ("2026-W41", None, answer_key("AU-P1")["impact_minor"], []),
    }


def test_every_people_finding_and_trace_carries_the_people_specialist(h: Harness) -> None:
    findings = h.findings("people")
    actors = h.stack.sql("SELECT DISTINCT actor FROM intel.trace_event WHERE payload ->> 'detector' LIKE 'people.%'")
    print("people findings:", len(findings), "actors:", actors)
    # Hand count from the first test: RG-P3, RG-P1, AU-P1, AU's two D9 labour weeks (RG-P2 abstains row_cap today).
    assert len(findings) == h.count("SELECT 1 FROM intel.finding WHERE type LIKE 'people.%'") == 5
    assert {f["pack"] for f in findings} == {"people"} and [a["actor"] for a in actors] == ["watcher:people"]
    assert h.count("SELECT 1 FROM core.draft WHERE source = 'intel:people'") == 0  # §6 attaches no draft to a finding


def test_p5_attendance_refusal_where_nothing_was_recorded_and_none_where_it_was(h: Harness) -> None:
    window = {"from": "2026-09-13", "to": "2026-10-10"}
    ck = h.mint("cloud_kitchen", "people.attendance_coverage", {"outlet_id": h.id("cloud_kitchen", "outlet:1"), **window})["rows"]
    rg = h.mint("restaurant_group", "people.attendance_coverage", {"outlet_id": h.id("restaurant_group", "outlet:2"), **window})["rows"]
    print("coverage CK:", ck, "RG Central:", rg)
    # CK rosters nobody (no attendance at all); RG Central's one cook is rostered daily and attends every shift (to 9 Oct: 27).
    assert (ck, rg) == (
        [{"rostered_shifts": 0, "attended_shifts": 0, "coverage_bp": None}],
        [{"rostered_shifts": 27, "attended_shifts": 27, "coverage_bp": 10_000}],
    )
    assert (skill.refusal("people.attendance_coverage", ck), skill.refusal("people.attendance_coverage", rg)) == (
        "attendance_missing",
        None,
    )
