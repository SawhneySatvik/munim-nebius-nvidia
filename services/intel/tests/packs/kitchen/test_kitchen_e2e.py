"""T-045 end to end: the Kitchen detectors in intel's real `/watch:sweep` against the real core-api on embedded Postgres,
the four worldgen worlds at the gate profile (100 days to Sat 2026-10-10). Fails — never skips — without node.

Expected values are independent of the code under test: plant ids, places and ₹ from the hand-kept answer keys
(tools/worldgen/answer-key/*.json) and the worldgen literals they cite, worked by hand per ISO week against the pack's
§4 bars (IN ₹1,000 = 100,000 paise; AU A$20 = 2,000 cents; 2% of the week's orders; 1.5 × the median). Where the plant
as written cannot meet a §4 bar, the gate asserts what the bar does to it (found X of planted Y) — a spec contradiction
reported to the orchestrator, never hidden by tuning a threshold here.

K1, K4, K5, K6 have no plant (T-086: no ticket-times history kind), so the last tests write ticket timestamps on existing
orders (core.kitchen_ticket and core.prep_time are operational tables; worldgen never writes them) and drive the real
templates and the sweep. The tests run in file order on one stack.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from e2e_harness import DAYS, WORLDS, Harness, answer_key
from stack import Stack

from munim_intel.skills.kitchen import skill


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
    return {f["dedupe_key"]: f for f in h.findings("kitchen") if f["tenant_id"] == tenant}


def test_sweeps_find_the_kitchen_plants_the_section_4_bars_admit(h: Harness) -> None:
    for w in WORLDS:
        h.sweep(w)
    rg_n, rg_c, rg_s = (h.id("restaurant_group", f"outlet:{i}") for i in (1, 2, 3))
    au = h.id("au_outlet", "outlet:1")
    rg, ck, st, au_f = (keyed(h, w) for w in WORLDS)
    print("kitchen findings:", {w: sorted(keyed(h, w)) for w in WORLDS})

    # RG-K3: 10 kg chicken overprep at Central, 5–2 days back = Mon 5 – Thu 8 Oct, all in 2026-W41. 180,000 × 4.3 = 774,000 → medium.
    k3 = rg.pop(f"kitchen.overprep:{rg_c}:2026-w41")
    assert (k3["impact"], k3["severity"], k3["impact_column"]) == (answer_key("RG-K3")["impact_minor"], "medium", "overprep_minor")
    # AU-K3: 12 avocados overprep 5–3 days back (5–7 Oct, 2026-W41). 3,000 × 4.3 = 12,900 → AU medium (≥ 4,000, < 20,000).
    a3 = au_f.pop(f"kitchen.overprep:{au}:2026-w41")
    assert (a3["impact"], a3["severity"]) == (answer_key("AU-K3")["impact_minor"], "medium")
    # RG-K7: South's 24 kg rice overprep, 30–27 days back = Thu 10 – Sun 13 Sep, all in 2026-W37. The detector reads the
    # outlet's week (pack §3); worldgen's baseline waste is never overprep (wg-1), so the week's impact is the key alone:
    # 216,000 × 4.3 = 928,800 → medium.
    k7 = rg.pop(f"kitchen.overprep:{rg_s}:2026-w37")
    assert (k7["impact"], k7["severity"]) == (answer_key("RG-K7")["impact_minor"], "medium")
    # RG-K2 (pack K2): 13 × 37,800 butter-chicken remakes at North over four ISO weeks, 3 / 3 / 4 / 3 a week (W35 26, 27, 29 Aug;
    # W36 31 Aug, 1, 4 Sep; W37 7, 9, 10, 13 Sep; W38 16, 18, 19 Sep), each ≥ ₹1,000 and ≥ 2% of the week's orders. No prep time
    # is configured: station 'unassigned'. 113,400 × 4.3 = 487,620 and 151,200 × 4.3 = 650,160 → medium. Σ = the key.
    k2 = {w: rg.pop(f"kitchen.remakes:{rg_n}:unassigned:2026-{w}") for w in ("w35", "w36", "w37", "w38")}
    assert {w: (f["impact"], f["severity"]) for w, f in k2.items()} == {
        "w35": (3 * 37_800, "medium"),
        "w36": (3 * 37_800, "medium"),
        "w37": (4 * 37_800, "medium"),
        "w38": (3 * 37_800, "medium"),
    }
    assert sum(f["impact"] for f in k2.values()) == answer_key("RG-K2")["impact_minor"]
    # RG-C2's prawn overprep at North (detector-map `also` kitchen.overprep): the period month's run, 2 × 1,155 g × 80,000/kg
    # = 184,800 in W38 and in W39 (→ medium), and the 14 days to as-of, 3 × 1,122 g × 80,000/kg = 269,280 in W41
    # (× 4.3 = 1,157,904 → high). Nothing else at RG: 0 false alarms.
    assert {k: (f["impact"], f["severity"]) for k, f in rg.items()} == {
        f"kitchen.overprep:{rg_n}:2026-w38": (184_800, "medium"),
        f"kitchen.overprep:{rg_n}:2026-w39": (184_800, "medium"),
        f"kitchen.overprep:{rg_n}:2026-w41": (269_280, "high"),
    }
    # CK-K2: 16 × 29,400 chicken-wrap remakes, 4 a week in W35–W38 (117,600 × 4.3 = 505,680 → medium). AU-K2: 16 × 1,850,
    # 4 a week in W34–W37 (7,400 × 4.3 = 31,820 → AU high). Each Σ = its key; nothing else in either world, nor at the store.
    ck_n = h.id("cloud_kitchen", "outlet:1")
    ck_k2 = {w: ck.pop(f"kitchen.remakes:{ck_n}:unassigned:2026-{w}") for w in ("w35", "w36", "w37", "w38")}
    au_k2 = {w: au_f.pop(f"kitchen.remakes:{au}:unassigned:2026-{w}") for w in ("w34", "w35", "w36", "w37")}
    assert {(f["impact"], f["severity"]) for f in ck_k2.values()} == {(4 * 29_400, "medium")}
    assert {(f["impact"], f["severity"]) for f in au_k2.values()} == {(4 * 1_850, "high")}
    assert sum(f["impact"] for f in ck_k2.values()) == answer_key("CK-K2")["impact_minor"]
    assert sum(f["impact"] for f in au_k2.values()) == answer_key("AU-K2")["impact_minor"]
    assert (ck, st, au_f) == ({}, {}, {})


def test_a_shop_gets_no_kitchen_snapshot_and_a_restaurant_does(h: Harness) -> None:
    def kitchen_mints(world: str) -> int:
        return h.count("SELECT 1 FROM evidence.snapshot WHERE tenant_id = $1 AND template_id LIKE 'kitchen.%'", h.stack.tenants[world])

    # Hand count per kitchen outlet and sweep: 8 weeks × 3 weekly detectors + 1 ticket_times window = 25; RG has 3 outlets.
    assert (kitchen_mints("store"), kitchen_mints("restaurant_group"), kitchen_mints("cloud_kitchen")) == (0, 75, 25)


def test_every_kitchen_finding_and_trace_carries_the_kitchen_specialist(h: Harness) -> None:
    findings = h.findings("kitchen")
    kitchen_types = h.count("SELECT 1 FROM intel.finding WHERE type LIKE 'kitchen.%'")
    actors = h.stack.sql(
        "SELECT DISTINCT t.payload ->> 'detector' AS d, t.actor FROM intel.trace_event t WHERE t.payload ->> 'detector' LIKE 'kitchen.%'"
    )
    print("kitchen findings:", len(findings), "trace actors:", actors)
    # Hand count from the first test: RG 1 + 1 + 4 + 3, CK 4, AU 1 + 4.
    assert len(findings) == kitchen_types == 18 and {f["pack"] for f in findings} == {"kitchen"}
    assert actors and {a["actor"] for a in actors} == {"watcher:kitchen"}
    assert h.count("SELECT 1 FROM core.draft WHERE source = 'intel:kitchen'") == 0  # §6 maps no plant above to a draft


# ---- fixtures: K1, K6 (ticket drift), K4 (prep time), K5 (refusal) on the worlds' own orders ----------------------------

TICKETS = """INSERT INTO core.kitchen_ticket (tenant_id, id, outlet_id, order_id, station, status, accepted_at, ready_at, due_at)
SELECT o.tenant_id, gen_random_uuid(), o.outlet_id, o.id, $3, 'done', a.at, a.at + make_interval(secs => $6::int), NULL
  FROM (SELECT o.*, row_number() OVER (PARTITION BY o.business_date ORDER BY o.id) AS n
          FROM core."order" o WHERE o.tenant_id = $1 AND o.outlet_id = $2 AND o.business_date BETWEEN $4::date AND $5::date) o
 CROSS JOIN LATERAL (SELECT ((o.business_date + $7::time) AT TIME ZONE 'Asia/Kolkata') AS at) a
 WHERE o.n <= $8"""


def tickets(h: Harness, world: str, outlet: str, station: str, days: tuple[str, str], sec: int | None, at: str, per_day: int) -> int:
    """`per_day` tickets on each business day's first orders, accepted at `at` local, ready `sec` later (None: never)."""
    # A NULL `sec` makes ready_at NULL (an interval of NULL seconds): the ticket was never bumped.
    h.stack.sql(TICKETS, h.stack.tenants[world], outlet, station, days[0], days[1], sec, at, per_day)
    return h.count(
        "SELECT 1 FROM core.kitchen_ticket WHERE tenant_id = $1 AND outlet_id = $2 AND station = $3",
        h.stack.tenants[world],
        outlet,
        station,
    )


def test_k1_and_k6_fixture_drift_on_a_steady_slot_is_found_and_a_loaded_slot_is_not(h: Harness) -> None:
    ck = h.id("cloud_kitchen", "outlet:1")
    # History bills run to Fri 9 Oct (D-1), so this week has five business days of orders (Mon 5 – Fri 9 Oct).
    # K1: tandoor 20:05 — 6 tickets a day at 600 s for 28 days (Mon 7 Sep – Sun 4 Oct), then 7 a day at 1,020 s (+7 min).
    assert tickets(h, "cloud_kitchen", ck, "tandoor", ("2026-09-07", "2026-10-04"), 600, "20:05", 6) == 168
    assert tickets(h, "cloud_kitchen", ck, "tandoor", ("2026-10-05", "2026-10-10"), 1020, "20:05", 7) == 168 + 35
    # K6 trap: grill 21:05 — 5 a day at 600 s for the 28 days, then 10 a day (double the orders) at 780 s (+30%).
    assert tickets(h, "cloud_kitchen", ck, "grill", ("2026-09-07", "2026-10-04"), 600, "21:05", 5) == 140
    assert tickets(h, "cloud_kitchen", ck, "grill", ("2026-10-05", "2026-10-10"), 780, "21:05", 10) == 140 + 50
    h.sweep("cloud_kitchen")
    drift = {k: f for k, f in keyed(h, "cloud_kitchen").items() if k.startswith("kitchen.ticket_drift:")}
    snap = h.mint("cloud_kitchen", "kitchen.ticket_drift", {"outlet_id": ck, "week_start": "2026-10-05"})
    cells = {(r["station"], r["slot_start"]): (r["drift_bp"], r["load_ratio_bp"], r["tickets_now"]) for r in snap["rows"]}
    print("ticket_drift W41:", cells)
    # Hand: K1 drift = (1,020 − 600) / 600 = 7,000 bp, load = 35 × 4 / 168 = 8,333 bp; K6 drift = 3,000 bp, load = 50 × 4 / 140 = 14,286.
    assert (cells[("tandoor", "20:00")], cells[("grill", "21:00")]) == ((7000, 8333, 35), (3000, 14286, 50))
    (key,) = drift
    f = drift[key]
    # One finding (tandoor, 20:00, W41); the loaded grill slot is load, not drift (K6). The kitchen's history refunds some
    # aggregator orders as `late` (kitchen pack §2's reason, wg-1), none in W41 (checked below), and no order is cancelled
    # after a promise, so the Σ row's loss is 0: L = low, lifted to medium by the 420 s p80 gap.
    assert key == f"kitchen.ticket_drift:{ck}:tandoor:20:00:2026-w41"
    assert (f["severity"], f["impact"], f["impact_column"]) == ("medium", 0, "late_loss_minor")
    loss_row = h.stack.sql("SELECT jsonb_array_length(rows) - 1 AS last FROM evidence.snapshot WHERE id = $1", f["impact_snapshot"])[0][
        "last"
    ]
    assert f["impact_row"] == int(loss_row), "the impact cites the Σ row (the snapshot's last)"
    late = """SELECT 1 FROM core.refund f JOIN core.outlet o ON o.tenant_id = f.tenant_id AND o.id = f.outlet_id
                WHERE f.reason_code = 'late' AND f.outlet_id = $1
                  AND ((f.at AT TIME ZONE o.tz) - o.business_day_cutoff)::date BETWEEN $2::date AND $3::date"""
    assert h.count(late, ck, "2026-10-05", "2026-10-11") == 0


K4_TICKETS = """WITH o AS (
  SELECT o.id, o.business_date, row_number() OVER (ORDER BY o.business_date, o.id) - 1 AS n, count(*) OVER () AS m
    FROM core."order" o
   WHERE o.tenant_id = $1 AND o.outlet_id = $2 AND o.business_date BETWEEN '2026-09-27' AND '2026-10-10'
     AND EXISTS (SELECT 1 FROM core.order_line l WHERE l.tenant_id = o.tenant_id AND l.order_id = o.id AND l.item_id = $3))
INSERT INTO core.kitchen_ticket (tenant_id, id, outlet_id, order_id, station, status, accepted_at, ready_at)
SELECT $1, gen_random_uuid(), $2, o.id, 'biryani', 'done', a.at, a.at + interval '900 seconds'
  FROM generate_series(0, 299) g(i) JOIN o ON o.n = g.i % o.m
 CROSS JOIN LATERAL (SELECT ((o.business_date + CASE WHEN g.i < 150 THEN time '12:05' ELSE time '13:05' END)
                             AT TIME ZONE 'Asia/Kolkata') AS at) a"""


def test_k4_fixture_a_dish_slower_than_promised_gets_a_prep_time_draft_citing_p80(h: Harness) -> None:
    ck, tenant = h.id("cloud_kitchen", "outlet:1"), h.stack.tenants["cloud_kitchen"]
    # The CK dish sold most in the 14-day window (27 Sep – 10 Oct); configured at 600 s; 300 tickets at 900 s, 150 accepted
    # 12:05 and 150 at 13:05, cycling over the window's orders that carry the dish.
    (item,) = [r["id"] for r in h.stack.sql(
        """SELECT ol.item_id::text AS id FROM core.order_line ol JOIN core."order" o ON o.tenant_id = ol.tenant_id AND o.id = ol.order_id
            WHERE o.tenant_id = $1 AND o.outlet_id = $2 AND o.business_date BETWEEN '2026-09-27' AND '2026-10-10'
            GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1""", tenant, ck)]  # fmt: skip
    h.stack.sql(
        """INSERT INTO core.prep_time (tenant_id, id, outlet_id, item_id, station, prep_sec, valid_from)
           VALUES ($1, gen_random_uuid(), $2, $3, 'biryani', 600, '2026-09-01')""", tenant, ck, item)  # fmt: skip
    h.stack.sql(K4_TICKETS, tenant, ck, item)
    assert h.count("SELECT 1 FROM core.kitchen_ticket WHERE tenant_id = $1 AND station = 'biryani'", tenant) == 300
    h.sweep("cloud_kitchen")
    key = f"kitchen.prep_time_gap:{ck}:{item}:biryani"
    gaps = {k: f for k, f in keyed(h, "cloud_kitchen").items() if k.startswith("kitchen.prep_time_gap:")}
    assert list(gaps) == [key], gaps.keys()
    f = gaps[key]
    # Hand: the dish's whole-window row (0023 K1, slot_start NULL): 300 tickets all at 900 s, so p80 900 vs 600 s promised
    # (gap 300 ≥ 180); slower → medium.
    row = h.stack.sql("SELECT rows -> $2::int AS r FROM evidence.snapshot WHERE id = $1", f["impact_snapshot"], f["impact_row"])[0]["r"]
    assert (f["impact"], f["severity"], row["slot_start"], row["tickets"], row["configured_prep_sec"]) == (900, "medium", None, 300, 600)
    (d,) = h.stack.sql(
        """SELECT source, command_type, status, command_payload AS p, outlet_ids::text[] AS o FROM core.draft
            WHERE finding_id = $1::uuid""", f["id"])  # fmt: skip
    p = d["p"]
    assert (d["source"], d["command_type"], d["status"], d["o"]) == ("intel:kitchen", "kitchen.prep_time.set.v1", "proposed", [ck])
    # The prep time is the finding's own p80 cell, by ref — never a typed number (pack §6: 1 numeric leaf).
    assert p["prep_sec"] == f["envelope"]["impact_ref"] == f"⟨snap:{f['impact_snapshot']}·{f['impact_row']}·p80_sec⟩"
    assert (p["item_id"], p["station"], p["outlet_id"], p["valid_from"]) == (item, "biryani", ck, "2026-10-11")


def test_k5_fixture_an_outlet_that_never_bumps_ready_is_refused_and_one_that_does_is_not(h: Harness) -> None:
    rg_c, rg_s = h.id("restaurant_group", "outlet:2"), h.id("restaurant_group", "outlet:3")
    # Sat 3 – Fri 9 Oct, 5 tickets a day: Central bumps every one ready (600 s), South never does.
    assert tickets(h, "restaurant_group", rg_c, "tandoor", ("2026-10-03", "2026-10-09"), 600, "19:05", 5) == 35
    assert tickets(h, "restaurant_group", rg_s, "tandoor", ("2026-10-03", "2026-10-09"), None, "19:05", 5) == 35
    window = {"from": "2026-10-03", "to": "2026-10-09"}
    central = h.mint("restaurant_group", "kitchen.ticket_coverage", {"outlet_id": rg_c, **window})["rows"]
    south = h.mint("restaurant_group", "kitchen.ticket_coverage", {"outlet_id": rg_s, **window})["rows"]
    print("coverage central:", central, "south:", south)
    assert (central, south) == (
        [{"tickets": 35, "timed_tickets": 35, "coverage_bp": 10_000}],
        [{"tickets": 35, "timed_tickets": 0, "coverage_bp": 0}],
    )
    assert (skill.refusal("kitchen.ticket_coverage", south), skill.refusal("kitchen.ticket_coverage", central)) == (
        "ticket_times_missing",
        None,
    )
    h.sweep("restaurant_group")
    assert [k for k in keyed(h, "restaurant_group") if k.startswith("kitchen.ticket_drift:")] == []
