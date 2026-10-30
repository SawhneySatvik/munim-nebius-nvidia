"""T-049 offline gates: the Customers & Growth detectors against T-043's in-memory core, at full pack scale.

Expected values are hand values from packs/customers-growth.md §4 and §10 and the ladder **L** in the packs header (IN
₹50,000 / ₹10,000 / ₹2,000; AU A$1,000 / A$200 / A$40), never the code under test. G2 and G3 are planted only at reduced
scale in the worlds (detector-map.json pack_cases), and G6 is not plantable, so their pack-scale cases are here.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pack_kit import FakeCore, frame, narration_problems, number_words, offline, ontology_function, pack_detector_ids, run  # noqa: E402

from conftest import REPO  # noqa: E402
from munim_intel.contracts_gen.models import ReasonCode  # noqa: E402
from munim_intel.detect import REGISTRY, Ladder  # noqa: E402
from munim_intel.mapping import SNAP_CLOSE  # noqa: E402
from munim_intel.runtime.context import RunContext  # noqa: E402
from munim_intel.skills.customers import skill  # noqa: E402
from munim_intel.tools.handles import HandleTable  # noqa: E402
from munim_intel.watch.detectors.customers import (  # noqa: E402
    coupon_cap_evasion,
    coupon_spike,
    rating_drop,
    regulars_lapsing,
    staff_applied_coupon,
)
from munim_intel.watch.frame import Frame  # noqa: E402

COUPON = "01920000-0000-7000-8000-0000000049a1"
MEMBER = "01920000-0000-7000-8000-0000000049b1"
OUTLET = "01920000-0000-7000-8000-0000000043c1"  # test_watch's outlet
IN_LADDER = Ladder(5_000_000, 1_000_000, 200_000)
SPECS = [coupon_cap_evasion.SPEC, staff_applied_coupon.SPEC, regulars_lapsing.SPEC, rating_drop.SPEC, coupon_spike.SPEC]


def thresholds(code: str, detector: str) -> Any:
    f: Frame = frame(code)
    return f.detectors[detector]


# -- coupon cap evasion (G1) ---------------------------------------------------------------------------------------


def leak(cap_minor: int) -> dict[str, Any]:
    return {"coupon_id": COUPON, "uses": 30, "discount_minor": 184_000, "cap_evasion_uses": 9, "cap_evasion_minor": cap_minor}


def test_cap_evasion_fires_at_the_pack_threshold_and_not_one_below() -> None:
    # §4: cap_evasion_minor ≥ ₹500 (A$10) in 30 days.
    cases = [("IN", 49_999, 0), ("IN", 50_000, 1), ("AU", 999, 0), ("AU", 1_000, 1)]
    got = [(code, v, len(offline(coupon_cap_evasion.SPEC, [leak(v)], code).findings)) for code, v, _ in cases]
    print("cap evasion:", got)
    assert got == cases


def test_cap_evasion_g1_finding_is_one_per_coupon_month_with_its_impact_cell() -> None:
    """RG-G1's numbers (9 uses beyond the cap, 64,800 paise): low on L (< ₹2,000); the window is the 30 days to today."""
    core = offline(coupon_cap_evasion.SPEC, [leak(64_800), {**leak(0), "coupon_id": None}])
    (f,) = core.findings
    (m,) = core.minted  # one mint: the tenant-level template once per run (S2-C), and no coupon.set follow-up (S1-A)
    print("finding:", f.dedupe_key, f.severity, f.envelope.impact_ref, "params:", m.params)
    assert (f.pack, f.type, f.severity, f.dedupe_key) == (
        "customers",
        "customers.coupon_cap_evasion",
        "low",
        f"customers.coupon_cap_evasion:{COUPON}:2026-10",
    )
    assert f.envelope.impact_ref is not None and f.envelope.impact_ref.root.endswith(f"·0·cap_evasion_minor{SNAP_CLOSE}")
    assert m.model_dump(mode="json")["params"] == {"from": "2026-09-11", "to": "2026-10-10"}


def test_cap_evasion_drafts_nothing_because_core_would_change_nothing() -> None:
    """R-B S1-A: core's coupon.set changes only caps, end and status, so pack §6's `requires_customer` tightening is a
    no-op or a conflict; the mapping is unwired until the pack names an executable tightening. Paired with the accept:
    the finding is still filed, once."""
    core = FakeCore({"customers.coupon_leakage": [leak(64_800)], "customers.coupon_current": [{"code": "WELCOME100"}]})
    report, _ = run(core, frame("IN"), {"customers": [coupon_cap_evasion.SPEC]})
    print("report:", report.as_json())
    assert (len(core.findings), core.drafts, [m.template_id for m in core.minted]) == (1, [], ["customers.coupon_leakage"])
    assert (coupon_cap_evasion.SPEC.mapping, coupon_cap_evasion.SPEC.follow_ups) == (None, ())


# -- staff-applied coupon (G2 at pack scale) -------------------------------------------------------------------------


def staff(uses: int, cash: int, median: int, discount: int = 0) -> dict[str, Any]:
    return {
        "coupon_id": COUPON,
        "member_id": MEMBER,
        "uses": uses,
        "cash_uses": cash,
        "discount_minor": discount,
        "outlet_median_uses": median,
    }


def test_staff_coupon_needs_both_ten_uses_and_three_times_the_median() -> None:
    cases = [  # (uses, median, findings per window) — uses ≥ 10 and uses ≥ 3 × median
        (9, 1, 0),
        (10, 3, 1),
        (10, 4, 0),
        (12, 4, 1),
    ]
    got = [(u, m, len(offline(staff_applied_coupon.SPEC, [staff(u, 0, m)]).findings) // 2) for u, m, _ in cases]
    print("staff coupon:", got)
    assert got == cases


def test_staff_coupon_g2_at_pack_scale_is_high_when_most_uses_are_cash() -> None:
    """G2: 60 anonymous cash orders in 4 weeks = 15 a week; STAFF30 on a 25,000 paise wrap = 7,500 off each.
    A week: 15 × 7,500 = 112,500 paise → L low; cash 15 of 15 > half → high. Cash 7 of 15 is not more than half → low."""
    core = offline(staff_applied_coupon.SPEC, [staff(15, 15, 2, 112_500)])
    weeks = sorted(m.model_dump(mode="json")["params"]["week_start"] for m in core.minted)
    print("weeks minted:", weeks, "findings:", [(f.dedupe_key, f.severity) for f in core.findings])
    assert weeks == ["2026-09-28", "2026-10-05"], "this ISO week (Monday 5 Oct) and the one before"
    assert {f.severity for f in core.findings} == {"high"}
    assert {f.dedupe_key for f in core.findings} == {
        f"customers.staff_applied_coupon:{OUTLET}:{COUPON}:{MEMBER}:2026-w40",
        f"customers.staff_applied_coupon:{OUTLET}:{COUPON}:{MEMBER}:2026-w41",
    }
    assert {f.severity for f in offline(staff_applied_coupon.SPEC, [staff(15, 7, 2, 112_500)]).findings} == {"low"}
    assert all(f.envelope.impact_ref and f.envelope.impact_ref.root.endswith(f"·discount_minor{SNAP_CLOSE}") for f in core.findings)


# -- coupon spike (G3) and its campaign trap (G6): the rule, and its coupon_leakage driver -----------------------------


def day(uses: int, median: int, first: int, in_campaign: bool | None = False) -> dict[str, Any]:
    return {
        "used_on": "2026-10-09",
        "uses": uses,
        "median_uses": median,
        "first_time_uses": first,
        "discount_minor": uses * 2_700,
        "excess_discount_minor": (uses - median) * 2_700,
        "in_campaign_window": in_campaign,
    }


def test_coupon_spike_g3_fires_and_the_g6_campaign_day_does_not() -> None:
    """G3: 180 uses vs a median of 6, 85% first-time (153 of 180); excess = (180 − 6) × 2,700 = 469,800 paise → L medium.
    G6: the same day inside an approved campaign's send window → nothing."""
    t = thresholds("IN", "customers.coupon_spike")
    g3, g6 = day(180, 6, 153), day(180, 6, 153, in_campaign=True)
    print("G3:", coupon_spike.fires(g3, t), coupon_spike.severity(g3, t, IN_LADDER), "G6:", coupon_spike.fires(g6, t))
    assert coupon_spike.fires(g3, t) and coupon_spike.severity(g3, t, IN_LADDER) == "medium"
    assert not coupon_spike.fires(g6, t)
    assert not coupon_spike.fires(day(180, 6, 153, in_campaign=None), t), "an unknown campaign window is not judged"


def test_coupon_spike_mints_coupon_daily_once_per_coupon_the_driver_lists() -> None:
    """The driver (W3.2): `coupon_leakage` lists two coupons and a Σ-like row with no coupon id; `coupon_daily` is minted
    for exactly the two listed ids (hand list), each with `to` = the business date, and G3's day fires once per coupon."""
    other = "01920000-0000-7000-8000-0000000049a2"
    core = FakeCore(
        {
            "customers.coupon_leakage": [leak(0), {**leak(0), "coupon_id": other}, {**leak(0), "coupon_id": None}, leak(0)],
            "customers.coupon_daily": [day(180, 6, 153), day(180, 6, 153, in_campaign=True)],
        }
    )
    run(core, frame("IN"), {"customers": [coupon_spike.SPEC]})
    minted = [(m.template_id, m.model_dump(mode="json")["params"]) for m in core.minted]
    print("minted:", minted, "findings:", [f.dedupe_key for f in core.findings])
    assert minted == [
        ("customers.coupon_leakage", {"from": "2026-09-13", "to": "2026-10-10"}),
        ("customers.coupon_daily", {"coupon_id": COUPON, "to": "2026-10-10"}),
        ("customers.coupon_daily", {"coupon_id": other, "to": "2026-10-10"}),
    ]
    assert [f.dedupe_key for f in core.findings] == [f"customers.coupon_spike:{c}:2026-10-09" for c in (COUPON, other)]
    assert {f.envelope.impact_ref.root.endswith("·0·excess_discount_minor⟩") for f in core.findings if f.envelope.impact_ref} == {True}


def test_coupon_spike_boundaries() -> None:
    t = thresholds("IN", "customers.coupon_spike")
    cases = [  # uses ≥ 20; uses ≥ 5 × median; first-time ≥ 70% of uses
        (day(20, 4, 14), True),
        (day(19, 0, 19), False),
        (day(20, 5, 14), False),
        (day(30, 6, 21), True),
        (day(30, 6, 20), False),
        ({**day(30, 6, 21), "used_on": None}, False),
    ]
    got = [(r["uses"], r["median_uses"], r["first_time_uses"], coupon_spike.fires(r, t)) for r, _ in cases]
    print("spike:", got)
    assert [g[3] for g in got] == [w for _, w in cases]


# -- regulars lapsing (G4) --------------------------------------------------------------------------------------------


def sigma(at_risk: int, regular: int, spend: int = 0) -> dict[str, Any]:
    return {"customer_id": None, "segment": None, "at_risk_count": at_risk, "regular_count": regular, "at_risk_spend_minor": spend}


def test_regulars_lapsing_fires_on_fifteen_or_ten_percent_of_regulars() -> None:
    cases = [(15, 1_000, 1), (14, 141, 0), (14, 140, 1), (0, 0, 0), (1, 10, 1), (1, 11, 0)]
    got = [(a, r, len(offline(regulars_lapsing.SPEC, [sigma(a, r)]).findings)) for a, r, _ in cases]
    print("lapsing:", got)
    assert got == cases


def test_regulars_lapsing_reads_the_sigma_row_only() -> None:
    """RG-G4 by hand: 6 regulars at risk among 22, spending 6 × 179,200 = 1,075,200 paise a month (key ÷ 3) → L high.
    A customer row never fires, whatever it holds."""
    customer = {"customer_id": "01920000-0000-7000-8000-0000000049c1", "segment": "at_risk", "at_risk_count": 99, "regular_count": 1}
    core = offline(regulars_lapsing.SPEC, [customer, sigma(6, 22, 1_075_200)])
    (f,) = core.findings
    print("finding:", f.dedupe_key, f.severity, f.envelope.impact_ref)
    assert (f.severity, f.dedupe_key) == ("high", f"customers.regulars_lapsing:{OUTLET}:2026-w41")
    assert f.envelope.impact_ref is not None and f.envelope.impact_ref.root.endswith(f"·1·at_risk_spend_minor{SNAP_CLOSE}")


def test_regulars_lapsing_drafts_the_win_back_campaign_from_its_own_sigma_row() -> None:
    """R67 (T-128): one draft per finding, by code. Hand values: the Σ row is row 1 of the detection's snapshot; the
    audience is its at_risk_count cell and the segment is that same snapshot; the outlet is the frame's; the send day is
    the day after the frame's business date (2026-10-10 → 2026-10-11, noon UTC); the name carries no digit."""
    customer = {"customer_id": "01920000-0000-7000-8000-0000000049c1", "segment": "at_risk", "at_risk_count": None, "regular_count": None}
    core = offline(regulars_lapsing.SPEC, [customer, sigma(6, 22, 1_075_200)])
    (f,) = core.findings
    (d,) = core.drafts
    body = d.model_dump(mode="json")
    p = body["payload"]
    snap = f.envelope.impact_ref.root.split("·")[0].removeprefix("⟨snap:") if f.envelope.impact_ref else None
    print("draft:", body["command_type"], body["outlet_ids"], p["audience_count"], p["send_at"])
    assert (body["pack"], body["command_type"], body["outlet_ids"]) == ("customers", "customers.campaign.create.v1", [OUTLET])
    assert p["segment_snapshot_id"] == snap and p["audience_count"] == f"⟨snap:{snap}·1·at_risk_count{SNAP_CLOSE}"
    assert body["based_on"] == [p["audience_count"]]
    got = (p["channel"], p["message_key"], p["placeholders"], p["coupon_id"], p["outlet_ids"])
    assert got == ("sms", "campaign.win_back", [], None, [OUTLET])
    assert p["send_at"] in ("2026-10-11T12:00:00Z", "2026-10-11T12:00:00+00:00")
    assert not re.search(r"\d", p["name"])


def test_core_refusing_the_campaign_off_a_demo_business_is_an_abstention_not_an_error() -> None:
    """R67: on every business that is not a demo core answers 422 campaign_audience_unscoped. The sweep records an
    abstention with that reason and no error; any other 422 is still an error."""
    from munim_intel.runtime.internal_client import CoreError

    class Refusing(FakeCore):
        def __init__(self, rows: dict[str, list[dict[str, Any]]], reason: str) -> None:
            super().__init__(rows)
            self.reason = reason

        async def write_draft(self, req: Any) -> Any:
            raise CoreError(422, "invalid_payload", self.reason)

    got = []
    for reason in ("campaign_audience_unscoped", "number_grammar"):
        core = Refusing({regulars_lapsing.SPEC.template: [sigma(6, 22, 1_075_200)]}, reason)
        report, _ = run(core, frame("IN"), {"customers": [regulars_lapsing.SPEC]})
        r = report.as_json()
        abstains = [t["payload"] for t in core.traces if t["kind"] == "abstain"]
        got.append((reason, r["drafts"], r["errors"], abstains))
    print("refusals:", got)
    abstained = [{"detector": "customers.regulars_lapsing", "reason": "campaign_audience_unscoped"}]
    assert got == [("campaign_audience_unscoped", {"abstained": 1}, 0, abstained), ("number_grammar", {}, 1, [])]


# -- rating drop ------------------------------------------------------------------------------------------------------


def week(reviews: int, avg: int, mean: int | None, late_bp: int | None = None) -> dict[str, Any]:
    return {
        "iso_week": "2026-W41",
        "reviews": reviews,
        "avg_rating_x100": avg,
        "mean_8w_x100": mean,
        "late_tickets": 4,
        "late_change_bp": late_bp,
    }


def test_rating_drop_half_a_star_on_ten_reviews_medium_and_high_with_late_tickets() -> None:
    cases = [  # avg ≤ mean − 50 and reviews ≥ 10; high when late_change_bp ≥ 2,500
        (week(10, 350, 400), "medium"),
        (week(10, 351, 400), None),
        (week(9, 300, 400), None),
        (week(10, 350, None), None),
        (week(12, 340, 410, 2_500), "high"),
        (week(12, 340, 410, 2_499), "medium"),
    ]
    got = []
    for r, _ in cases:
        fs = offline(rating_drop.SPEC, [r]).findings
        got.append(fs[0].severity if fs else None)
    print("rating drop:", got)
    assert got == [w for _, w in cases]
    (f,) = offline(rating_drop.SPEC, [week(10, 350, 400)]).findings
    assert f.dedupe_key == f"customers.rating_drop:{OUTLET}:2026-w41"


# -- shape: registry, params, narration, specialist label --------------------------------------------------------------


def test_registered_detectors_are_the_pack_section_4_ids() -> None:
    """Every pack §4 detector is registered; coupon_spike through its coupon_leakage driver (W3.2)."""
    registered = {s.id for s in REGISTRY.get("customers", [])}
    doc = pack_detector_ids("customers-growth.md")
    print("registered:", sorted(registered), "pack §4:", sorted(doc))
    assert registered == doc
    assert {s.id for s in SPECS} == registered


def test_every_window_matches_its_template_params_and_every_narration_is_digit_free() -> None:
    problems = []
    for spec in SPECS:
        for code in ("IN", "AU"):
            f = frame(code)
            o, t = f.outlets[0], f.detectors[spec.id]
            listed = [] if spec.driver is None else [(spec.driver.template, spec.driver.params(o, t))]
            if spec.driver is not None:
                listed.append((spec.template, spec.driver.window(COUPON, o, t).params))
            for template, params in [*((spec.template, w.params) for w in spec.windows(o, t)), *listed]:
                s = ontology_function(template)["params_schema"]
                if set(params) != set(s["properties"]) or not set(s["required"]) <= set(params):
                    problems.append(f"{spec.id}: {template} params {sorted(params)} vs {sorted(s['properties'])}")
        problems += [f"{spec.id}: {p}" for p in narration_problems(spec)]
    print("problems:", problems)
    assert problems == []


def test_every_finding_and_trace_carries_the_customers_specialist() -> None:
    core = FakeCore(
        {
            "customers.coupon_leakage": [leak(64_800)],
            "customers.staff_coupon_use": [staff(15, 15, 2, 112_500)],
            "customers.churn_segments": [sigma(6, 22, 1_075_200)],
            "customers.review_trend": [week(10, 350, 400)],
            "customers.coupon_daily": [day(180, 6, 153)],
        }
    )
    report, _ = run(core, frame("IN"), {"customers": SPECS})
    actors = {t["actor"] for t in core.traces}
    print("findings:", len(core.findings), "drafts:", len(core.drafts), "actors:", actors, "report:", report.as_json())
    # Hand count: 1 cap evasion + 2 staff weeks + 1 lapsing + 1 rating + 1 spike (the leak row's coupon) = 6; one draft,
    # the lapsing finding's win-back campaign (R67; coupon.set stays unwired, R-B S1-A).
    assert (len(core.findings), len(core.drafts)) == (6, 1)
    assert {f.pack for f in core.findings} == {"customers"} and actors == {"watcher:customers"}


# -- the skill ---------------------------------------------------------------------------------------------------------


def test_skill_is_valid_against_the_ontology_and_binds_at_most_twenty_tools() -> None:
    import json

    ont = json.loads((REPO / "packages" / "contracts" / "generated" / "ontology.json").read_text("utf8"))
    entry = next(s for s in ont["specialists"] if s["id"] == "customers")
    codes = set(ReasonCode.model_fields["root"].annotation.__args__)  # type: ignore[union-attr]
    prose = skill.INSTRUCTIONS_MD
    ctx = RunContext(
        "01920000-0000-7000-8000-0000000049d1", "01920000-0000-7000-8000-0000000049e1", ("*",), "ask", "member:x", 2_000_000_000, "h.p.s"
    )
    tools = skill.toolset(ctx, None, HandleTable({}), propose=True)  # type: ignore[arg-type]
    read_only = skill.toolset(ctx, None, HandleTable({}), propose=False)  # type: ignore[arg-type]
    print("tools:", [t.name for t in tools], "chars:", len(prose))
    # R-B S1-B / S1-D (orchestrator ruling, 11 Oct): neither coupon.set nor the campaign is agent-exposed, so the customers
    # specialist proposes nothing — in the registry and in the skill.
    assert (skill.PACK, list(skill.READ_TEMPLATES)) == ("customers", entry["templates"])
    assert (list(skill.DRAFTABLES), entry["draftables"]) == ([], [])
    exposed = {a["command_type"] for a in ont["actions"] if a["agent_exposed"]}
    assert not {"catalogue.coupon.set.v1", "customers.campaign.create.v1"} & exposed and len(exposed) > 10
    assert "campaign.create" not in prose
    assert set(skill.REFUSAL_CODES) == {"no_marketing_consent", "insufficient_history"} and set(skill.REFUSAL_CODES) <= codes
    assert len(prose) <= 1_500 and not any(ch.isdigit() for ch in prose)
    assert [w for w in number_words() if re.search(rf"\b{re.escape(w)}\b", prose, flags=re.I)] == []
    assert len(tools) == len(entry["templates"]) + len(skill.DRAFTABLES) <= 20
    assert [t.name for t in tools if t.name.startswith("propose_")] == []
    assert len(read_only) == len(entry["templates"]) and not any(t.name.startswith("propose_") for t in read_only)
