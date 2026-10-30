"""T-049 end to end: the Customers & Growth detectors find their answer-key plants through core-api's real internal API.
The four worlds are seeded by worldgen at the 100-day gate profile on embedded Postgres. Fails, never skips, without node.

Two dates:
- Dated history (G4) is relative to the profile's AS_OF, 10 Oct 2026; the sweep runs with that business date.
- The coupon plants (RG-G1, CK-G2) are orders placed through the API on the seed day, the wall-clock day the stack is
  seeded. Their sweep runs with that day as the business date: the latest business date of the tenant's orders. The
  two are the same detectors on the same tenant at two business dates.

Expected values are independent of the code: plant ids, `where` and ₹ from the answer keys; thresholds from the pack
JSON; severities from the ladder L of the packs header (IN ₹50,000 / ₹10,000 / ₹2,000; AU A$1,000 / A$200 / A$40).
CK-G2 is planted at the pack's scale for one week (detector-map.json pack_cases G2: 12 cash orders on one day, not 60 in
four weeks), so it fires at the pack's own thresholds. The four-week case is in test_customers_offline.py.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pack_kit import ACTORS, AS_OF, WORLDS, PackStack, answer_key, detector_map  # noqa: E402

from munim_intel.watch.detectors.customers import (  # noqa: E402
    coupon_cap_evasion,
    coupon_spike,
    rating_drop,
    regulars_lapsing,
    staff_applied_coupon,
)

SPECS = [coupon_cap_evasion.SPEC, staff_applied_coupon.SPEC, regulars_lapsing.SPEC, rating_drop.SPEC, coupon_spike.SPEC]
COUPON_SPECS = [coupon_cap_evasion.SPEC, staff_applied_coupon.SPEC]
LADDER = {"IN": (5_000_000, 1_000_000, 200_000), "AU": (100_000, 20_000, 4_000)}
CODE = {"restaurant_group": "IN", "cloud_kitchen": "IN", "store": "IN", "au_outlet": "AU"}
G4 = {"restaurant_group": "RG-G4", "cloud_kitchen": "CK-G4", "store": "ST-G4", "au_outlet": "AU-G4"}

#: CK-G3 at its planted scale (W3.2: the coupon_leakage driver reaches it). The key's 10 orders are the uses threshold;
#: the first-time leg is the pack's 70%: each of the ten is a new storefront guest's first order (wg-1). The ratio leg
#: stays: the other 27 days have no use, so the median is 0.
G3_ORDERS = len(answer_key("CK-G3")["where"]["orders"])
G3_SCALE = {"customers.coupon_spike": {"uses_gte": G3_ORDERS, "uses_vs_median_bp_gte": 50_000, "first_time_share_bp_gte": 7_000}}


def ladder(code: str, minor: int) -> str:
    critical, high, medium = LADDER[code]
    return "critical" if minor >= critical else "high" if minor >= high else "medium" if minor >= medium else "low"


def iso_week(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-w{w:02d}"


@pytest.fixture(scope="module")
def ps(tmp_path_factory: pytest.TempPathFactory) -> Iterator[PackStack]:
    s = PackStack(tmp_path_factory.mktemp("run"))
    yield s
    s.stop()


@pytest.fixture(scope="module")
def swept(ps: PackStack) -> dict[str, Any]:
    """Every world at AS_OF, then the coupon detectors on each world's seed day (CK-G2 at the pack's thresholds)."""
    out: dict[str, Any] = {"as_of": {}, "seed": {}, "ck_pack_scale_staff": None}
    for w in WORLDS:
        out["as_of"][w] = ps.sweep(w, SPECS, ps.frame(w, AS_OF)).as_json()
    for w in WORLDS:
        seed = ps.sql('SELECT max(business_date)::text AS d FROM core."order" WHERE tenant_id = $1', ps.tenants[w])[0]["d"]
        out["seed"][w] = date.fromisoformat(seed)
        ps.sweep(w, COUPON_SPECS, ps.frame(w, out["seed"][w]))
    out["ck_pack_scale_staff"] = [f for f in ps.findings("customers", "cloud_kitchen") if f["type"] == "customers.staff_applied_coupon"]
    out["g3"] = ps.sweep("cloud_kitchen", [coupon_spike.SPEC], ps.frame("cloud_kitchen", out["seed"]["cloud_kitchen"], G3_SCALE)).as_json()
    print("reports at AS_OF:", out["as_of"], "seed days:", out["seed"])
    return out


def plant_findings(ps: PackStack, swept: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Answer-key id → the findings that are that plant, located by the key's own ids (never by the code's rows)."""
    out: dict[str, list[dict[str, Any]]] = {}
    welcome = ps.id("restaurant_group", answer_key("RG-G1")["where"]["coupon"])
    month = swept["seed"]["restaurant_group"].isoformat()[:7]
    out["RG-G1"] = [
        f for f in ps.findings("customers", "restaurant_group") if f["dedupe_key"] == f"customers.coupon_cap_evasion:{welcome}:{month}"
    ]
    orders = [ps.id("cloud_kitchen", k) for k in answer_key("CK-G2")["where"]["orders"]]
    members = ps.sql(
        "SELECT DISTINCT applied_by::text AS m, coupon_id::text AS c FROM core.coupon_use WHERE order_id = ANY ($1::uuid[])", orders
    )
    assert len(members) == 1, f"CK-G2's orders were applied by {len(members)} member/coupon pairs"
    m, c = members[0]["m"], members[0]["c"]
    out["CK-G2"] = [
        f
        for f in ps.findings("customers", "cloud_kitchen")
        if f["type"] == "customers.staff_applied_coupon" and f":{c}:{m}:" in f["dedupe_key"]
    ]
    (leak,) = ps.sql("SELECT id::text FROM core.coupon WHERE tenant_id = $1 AND code = 'LEAK15'", ps.tenants["cloud_kitchen"])
    key = f"customers.coupon_spike:{leak['id']}:{swept['seed']['cloud_kitchen'].isoformat()}"
    out["CK-G3"] = [f for f in ps.findings("customers", "cloud_kitchen") if f["dedupe_key"] == key]
    for w, plant in G4.items():
        outlet = ps.id(w, answer_key(plant)["where"]["outlet"])
        key = f"customers.regulars_lapsing:{outlet}:{iso_week(AS_OF)}"
        out[plant] = [f for f in ps.findings("customers", w) if f["dedupe_key"] == key]
    return out


def test_detector_map_names_these_plants_for_these_detectors() -> None:
    """The plants gated here are exactly the customers detectors' entries in the hand-kept map (registered ones)."""
    problems = detector_map()["problems"]
    mine = {pid for pid, p in problems.items() if p.get("detector") in {s.id for s in SPECS}}
    print("mapped:", sorted(mine))
    assert mine == {"RG-G1", "CK-G2", "CK-G3", "RG-G4", "CK-G4", "ST-G4", "AU-G4"}


def test_g3_the_leaked_code_is_found_through_the_coupon_listing_with_the_key_impact(ps: PackStack, swept: dict[str, Any]) -> None:
    """The driver lists LEAK15 (used on the seed day) and mints its coupon_daily; the day's ten uses against a median of 0
    fire at the planted scale. Impact = excess discount = 10 × 2,700 − 0 = the key's 27,000 paise → L low."""
    (f,) = plant_findings(ps, swept)["CK-G3"]
    key = answer_key("CK-G3")["impact_minor"]
    print("CK-G3:", f["dedupe_key"], f["severity"], f["impact"], "key:", key, "report:", swept["g3"])
    assert (f["type"], int(f["impact"]), f["severity"]) == ("customers.coupon_spike", key, ladder("IN", key))


def test_g1_cap_evasion_is_found_once_with_the_key_impact(ps: PackStack, swept: dict[str, Any]) -> None:
    (f,) = plant_findings(ps, swept)["RG-G1"]
    key = answer_key("RG-G1")["impact_minor"]
    print("RG-G1:", f["dedupe_key"], f["severity"], f["impact"], "key:", key)
    assert (f["pack"], f["type"], int(f["impact"]), f["severity"]) == ("customers", "customers.coupon_cap_evasion", key, ladder("IN", key))


def test_g1_proposes_no_coupon_set_and_its_coupon_is_unchanged(ps: PackStack, swept: dict[str, Any]) -> None:
    """R-B S1-A: core's coupon.set changes only caps, end and status, so pack §6's requires_customer tightening could not
    change WELCOME20 (restaurant_group.ts: a customer is already required) — the mapping is unwired. Paired with the
    accept: RG-G1's finding exists (the previous test) and draws no draft; the coupon row is as worldgen wrote it."""
    (f,) = plant_findings(ps, swept)["RG-G1"]
    coupon = ps.id("restaurant_group", answer_key("RG-G1")["where"]["coupon"])
    drafts = ps.sql("SELECT command_type FROM core.draft WHERE finding_id = $1::uuid", f["id"])
    (row,) = ps.sql("SELECT code, requires_customer, per_customer_cap FROM core.coupon WHERE id = $1", coupon)
    print("RG-G1 drafts:", drafts, "coupon:", row)
    assert (drafts, row) == ([], {"code": "WELCOME20", "requires_customer": True, "per_customer_cap": 1})


def test_g2_staff_code_needs_its_reduced_scale_and_then_is_found_with_the_key_impact(ps: PackStack, swept: dict[str, Any]) -> None:
    """(Name kept for the red-proof script.) At the pack's thresholds the cashier's 12 uses (≥ 10, against a median of 1 use
    a member: the owner and the manager use it once each, so ≥ 3 × the median) fire, and only for that cashier. Every
    one was paid in cash (> half of the uses), so L (90,000 → low) is lifted to `high`."""
    (f,) = plant_findings(ps, swept)["CK-G2"]
    key = answer_key("CK-G2")["impact_minor"]
    print("CK-G2:", f["dedupe_key"], f["severity"], f["impact"], "key:", key)
    assert [g["id"] for g in swept["ck_pack_scale_staff"]] == [f["id"]]
    assert (f["type"], int(f["impact"]), ladder("IN", key), f["severity"]) == ("customers.staff_applied_coupon", key, "low", "high")


def test_g4_lapsed_regulars_are_found_at_each_world_and_the_key_customers_are_the_at_risk_rows(
    ps: PackStack, swept: dict[str, Any]
) -> None:
    """Pack §3: monthly spend = 90-day spend ÷ 3, per customer. The key's ₹ is the window spend of n identical regulars,
    so their share of the Σ is n × round(key ÷ n ÷ 3). The Σ also holds customers the template marks at risk that are not
    plants (its segment rule is an INFERENCE in 0021), so the gate checks the key's customers and their share, plus
    severity by L on the impact cell."""
    found = plant_findings(ps, swept)
    for w, plant in G4.items():
        entry = answer_key(plant)
        (f,) = found[plant]
        phones = entry["where"]["phones"]
        ids = {
            r["id"] for r in ps.sql("SELECT id::text FROM core.customer WHERE tenant_id = $1 AND phone = ANY ($2)", ps.tenants[w], phones)
        }
        rows = {r["customer_id"]: r for r in f["snapshot_rows"] if r["customer_id"] in ids}
        n, per = len(phones), entry["impact_minor"] // len(phones)
        share = sum(r["monthly_spend_minor"] for r in rows.values())
        print(plant, "at risk:", {r["segment"] for r in rows.values()}, "share:", share, "impact:", f["impact"], f["severity"])
        assert len(ids) == n and set(rows) == ids and {r["segment"] for r in rows.values()} == {"at_risk"}
        assert share == n * ((per * 2 + 3) // 6), plant
        assert int(f["impact"]) >= share and f["severity"] == ladder(CODE[w], int(f["impact"]))


def test_false_alarms_are_at_most_two_per_world(ps: PackStack, swept: dict[str, Any]) -> None:
    plants = {f["id"] for fs in plant_findings(ps, swept).values() for f in fs}
    extra = {w: [(f["dedupe_key"], f["impact"]) for f in ps.findings("customers", w) if f["id"] not in plants] for w in WORLDS}
    print("not a plant:", extra)
    assert all(len(v) <= 2 for v in extra.values()), extra


def test_every_finding_and_trace_carries_the_customers_specialist_and_template_narration_holds(
    ps: PackStack, swept: dict[str, Any]
) -> None:
    findings = ps.findings("customers")
    all_findings = ps.sql("SELECT pack FROM intel.finding")
    drafts = ps.sql("SELECT source FROM core.draft WHERE source LIKE 'intel:%'")
    actors = {a["actor"] for a in ps.sql(ACTORS)}
    print("findings:", len(findings), "of", len(all_findings), "drafts:", drafts, "actors:", actors)
    # Hand count: RG-G1 + CK-G2 + CK-G3 + four G4 plants = 7 at least; every finding in the tenant DBs is this pack's.
    # No draft: coupon.set unwired (R-B S1-A); the win-back campaign is drafted (R67) but the eval worlds are not demo
    # businesses, so core refuses it (campaign_audience_unscoped) and nothing is stored.
    assert len(findings) >= 7 and len(findings) == len(all_findings) and drafts == []
    assert actors == {"watcher:customers"}
    assert all(f["envelope"]["abstained"] is False and "⟨snap:" in f["envelope"]["segments"][0]["text"] for f in findings)
