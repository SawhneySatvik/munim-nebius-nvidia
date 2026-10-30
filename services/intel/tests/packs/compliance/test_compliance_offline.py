"""T-050 offline gates: the Compliance & Assets detectors against T-043's in-memory core.

Expected values are hand values from packs/compliance-assets.md §4, §6 and §10 and the ladder **L** in the packs header
(IN ₹50,000 / ₹10,000 / ₹2,000; AU A$1,000 / A$200 / A$40), never the code under test. A4 (energy drift) needs more
history than the gate profile has, and no world plants overdue maintenance, so their cases are here. A8 (trap) is here
too, as a hand row.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "customers"))

from pack_kit import FakeCore, frame, narration_problems, number_words, offline, ontology_function, pack_detector_ids, run  # noqa: E402

from conftest import REPO  # noqa: E402
from munim_intel.contracts_gen.models import InternalDraftsRequest, ReasonCode  # noqa: E402
from munim_intel.detect import REGISTRY, Ladder  # noqa: E402
from munim_intel.mapping import SNAP_CLOSE  # noqa: E402
from munim_intel.runtime.context import RunContext  # noqa: E402
from munim_intel.skills.compliance import skill  # noqa: E402
from munim_intel.tools.handles import HandleTable  # noqa: E402
from munim_intel.watch.detectors.compliance import (  # noqa: E402
    amc_waste,
    energy_drift,
    licence_expiring,
    maintenance_overdue,
    missed_logs,
    temp_excursion,
)

OUTLET = "01920000-0000-7000-8000-0000000043c1"  # test_watch's outlet
ASSET = "01920000-0000-7000-8000-0000000050a1"
CHECKLIST = "01920000-0000-7000-8000-0000000050b1"
LICENCE = "01920000-0000-7000-8000-0000000050c1"
IN_LADDER = Ladder(5_000_000, 1_000_000, 200_000)
SPECS = [missed_logs.SPEC, temp_excursion.SPEC, amc_waste.SPEC, maintenance_overdue.SPEC, energy_drift.SPEC, licence_expiring.SPEC]


def impact(f: Any) -> str:
    return str(f.envelope.impact_ref.root)


# -- missed logs (A6) ------------------------------------------------------------------------------------------------


def checklist(expected: int, done: int) -> dict[str, Any]:
    cov = done * 10_000 // expected
    return {
        "checklist_id": CHECKLIST,
        "expected_runs": expected,
        "done_runs": done,
        "coverage_bp": cov,
        "temp_expected": None,
        "temp_logged": None,
    }


def temp_row(expected: int, logged: int) -> dict[str, Any]:
    cov = None if expected == 0 else logged * 10_000 // expected
    return {
        "checklist_id": None,
        "expected_runs": None,
        "done_runs": None,
        "coverage_bp": cov,
        "temp_expected": expected,
        "temp_logged": logged,
    }


def test_missed_logs_a6_four_of_seven_is_high_over_the_seven_days_to_yesterday() -> None:
    """A6: done 4 of 7 → 4 × 10,000 ÷ 7 = 5,714 bp < 6,000 → high. Window 3–9 Oct for a business date of 10 Oct."""
    core = offline(missed_logs.SPEC, [checklist(7, 4)])
    (f,) = core.findings
    (m,) = core.minted
    print("A6:", f.severity, f.dedupe_key, m.model_dump(mode="json")["params"])
    assert m.model_dump(mode="json")["params"] == {"outlet_id": OUTLET, "from": "2026-10-03", "to": "2026-10-09"}
    assert (f.pack, f.type, f.severity) == ("compliance", "compliance.missed_logs", "high")
    assert f.dedupe_key == f"compliance.missed_logs:{OUTLET}:{CHECKLIST}:2026-w41"
    assert impact(f).endswith(f"·0·coverage_bp{SNAP_CLOSE}")


def test_missed_logs_boundaries_daily_only_and_the_temperature_row() -> None:
    cases = [  # (row, severity or None) — coverage < 9,000 fires; < 6,000 is high; weekly checklists and empty temp rows never
        ({**checklist(7, 7), "coverage_bp": 8_999}, "medium"),
        ({**checklist(7, 7), "coverage_bp": 9_000}, None),
        ({**checklist(7, 7), "coverage_bp": 6_000}, "medium"),
        ({**checklist(7, 7), "coverage_bp": 5_999}, "high"),
        (checklist(1, 0), None),
        (temp_row(7, 6), "medium"),
        (temp_row(0, 0), None),
    ]
    got = []
    for r, _ in cases:
        fs = offline(missed_logs.SPEC, [r]).findings
        got.append(fs[0].severity if fs else None)
    print("missed logs:", got)
    assert got == [w for _, w in cases]
    (f,) = offline(missed_logs.SPEC, [temp_row(7, 6)]).findings
    assert f.dedupe_key == f"compliance.missed_logs:{OUTLET}:temp_log:2026-w41"


# -- temperature excursions (A1, A8) -----------------------------------------------------------------------------------


def asset_day(bad: int, waste: int, readings: int = 3) -> dict[str, Any]:
    return {
        "asset_id": ASSET,
        "logged_on": "2026-10-09",
        "readings": readings,
        "out_of_range": bad,
        "max_milli_c": 11_000,
        "temp_waste_minor": waste,
    }


def test_temp_excursion_a1_is_high_and_the_a8_single_reading_is_silent() -> None:
    """A1: 3 readings out of range in a day; 14 kg paneer × 32,000 = 448,000 paise of temperature waste → L medium →
    at least high. A8: one 9 °C reading during a delivery, the next in range → out_of_range 1 → nothing."""
    core = offline(temp_excursion.SPEC, [asset_day(3, 448_000), {**asset_day(1, 0), "logged_on": "2026-10-08"}])
    (f,) = core.findings
    print("A1:", f.severity, f.dedupe_key, impact(f))
    assert (f.severity, f.dedupe_key) == ("high", f"compliance.temp_excursion:{ASSET}:2026-10-09")
    assert impact(f).endswith(f"·0·temp_waste_minor{SNAP_CLOSE}")
    big = offline(temp_excursion.SPEC, [asset_day(2, 5_000_000)]).findings
    assert [x.severity for x in big] == ["critical"], "L above high wins: ₹50,000 of waste is critical"


# -- AMC waste (A2, A3) -----------------------------------------------------------------------------------------------


def costs(waste: int, overdue: int | None = 0, last_cost: int | None = None) -> dict[str, Any]:
    return {
        "asset_id": ASSET,
        "repairs_under_amc_minor": waste,
        "amc_overlap_days": 0,
        "amc_overlap_minor": 0,
        "amc_waste_minor": waste,
        "preventive_overdue_days": overdue,
        "last_preventive_cost_minor": last_cost,
    }


def test_amc_waste_threshold_and_severity() -> None:
    """§4: ≥ ₹1,000 (A$20) in 90 days. A2: 450,000 + 380,000 + 520,000 = 1,350,000 → high.
    A3: 75 × 3,650,000 ÷ 365 = 750,000 → medium."""
    cases = [
        ("IN", 99_999, None),
        ("IN", 100_000, "low"),
        ("IN", 1_350_000, "high"),
        ("IN", 750_000, "medium"),
        ("AU", 1_999, None),
        ("AU", 2_000, "low"),
    ]
    got = []
    for code, v, _ in cases:
        fs = offline(amc_waste.SPEC, [costs(v)], code).findings
        got.append((code, v, fs[0].severity if fs else None))
    print("amc:", got)
    assert got == cases
    core = offline(amc_waste.SPEC, [costs(1_350_000)])
    assert core.findings[0].dedupe_key == f"compliance.amc_waste:{ASSET}:2026-q4"
    assert core.minted[0].model_dump(mode="json")["params"] == {"outlet_id": OUTLET, "from": "2026-07-13", "to": "2026-10-10"}


# -- maintenance overdue and its draft (§6) -----------------------------------------------------------------------------


def test_maintenance_overdue_fires_after_fourteen_days_and_drafts_a_schedule_with_refs() -> None:
    assert offline(maintenance_overdue.SPEC, [costs(0, overdue=14)]).findings == []
    core = offline(maintenance_overdue.SPEC, [costs(0, overdue=15, last_cost=180_000)])
    (f,) = core.findings
    (d,) = core.drafts
    p = d.model_dump(mode="json")
    print("finding:", f.severity, f.dedupe_key, "draft:", json.dumps(p["payload"]), p["based_on"])
    # due 15 days before 10 Oct = 25 Sep
    assert (f.severity, f.dedupe_key) == ("medium", f"compliance.maintenance_overdue:{ASSET}:2026-09-25")
    sid = impact(f).split("·")[0]
    assert (p["pack"], p["command_type"], p["outlet_ids"], p["finding_id"]) == (
        "compliance",
        "compliance.maintenance.schedule.v1",
        [OUTLET],
        f.envelope.finding_id.root,
    )
    payload = p["payload"]
    assert {k: v for k, v in payload.items() if k != "maintenance_id"} == {
        "outlet_id": OUTLET,
        "asset_id": ASSET,
        "kind": "preventive",
        "due_on": "2026-10-10",
        "estimated_cost_minor": f"{sid}·0·last_preventive_cost_minor{SNAP_CLOSE}",
        "vendor_note": None,
    }
    assert p["based_on"] == [f"{sid}·0·preventive_overdue_days{SNAP_CLOSE}", payload["estimated_cost_minor"]]
    assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", payload["maintenance_id"])
    InternalDraftsRequest.model_validate(p)


def test_maintenance_draft_without_a_past_preventive_cost_leaves_the_estimate_empty() -> None:
    (d,) = offline(maintenance_overdue.SPEC, [costs(0, overdue=30, last_cost=None)]).drafts
    p = d.model_dump(mode="json")
    assert p["payload"]["estimated_cost_minor"] is None and len(p["based_on"]) == 1


# -- energy drift (A4) ------------------------------------------------------------------------------------------------


def month(per: int, median: int | None, orders: int = 1_000) -> dict[str, Any]:
    excess = 0 if median is None else max(per - median, 0) * orders
    return {
        "month_on": "2026-10-01",
        "utility_minor": per * orders,
        "orders": orders,
        "per_order_minor": per,
        "median_per_order_minor": median,
        "energy_excess_minor": excess,
    }


def test_energy_drift_a4_at_one_point_three_times_the_median_and_never_on_a_zero_baseline() -> None:
    """A4: +40% for a month on flat orders: per order 1,400 vs 1,000 on 1,000 orders → excess 400,000 → L medium.
    1.3 × is the threshold itself; 1,299 is below it. A zero baseline (no utility expense recorded) never fires."""
    cases = [
        (month(1_400, 1_000), "medium"),
        (month(1_300, 1_000), "medium"),
        (month(1_299, 1_000), None),
        (month(0, 0), None),
        (month(5, None), None),
    ]
    got = []
    for r, _ in cases:
        fs = offline(energy_drift.SPEC, [r]).findings
        got.append(fs[0].severity if fs else None)
    print("energy:", got)
    assert got == [w for _, w in cases]
    (f,) = offline(energy_drift.SPEC, [month(1_400, 1_000)]).findings
    assert f.dedupe_key == f"compliance.energy_drift:{OUTLET}:2026-10"


# -- licence expiry (A5): the rule, and the run-frame's licence kinds (W3.2) -------------------------------------------


MANAGER = "01920000-0000-7000-8000-0000000050f1"


def licence(days_left: int | None, missing: bool = False, *, valid_to: str = "2026-10-30", manager: str | None = None) -> dict[str, Any]:
    """A licence_calendar v2 row (0023 L1): `status` in_force | expired | missing, and the outlet's manager."""
    status = "missing" if missing else "expired" if days_left is not None and days_left < 0 else "in_force"
    return {
        "outlet_id": OUTLET,
        "kind": "fssai",
        "licence_id": None if missing else LICENCE,
        "valid_to": None if missing else valid_to,
        "days_left": days_left,
        "missing": missing,
        "status": status,
        "manager_member_id": manager,
    }


def test_licence_rule_a5_twenty_days_is_high_seven_is_critical_missing_is_critical() -> None:
    t = frame("IN").detectors["compliance.licence_expiring"]
    cases = [  # §4: days_left ≤ 30 or missing; critical if ≤ 7 days, expired or missing; else high
        (licence(20), "high"),
        (licence(30), "high"),
        (licence(31), None),
        (licence(7), "critical"),
        (licence(8), "high"),
        (licence(None, missing=True), "critical"),
        (licence(None), None),
        # 0023: an expired licence is not `missing`; its days_left is negative (run out) or 0 (lapsed) → ≤ 7 → critical
        (licence(-3, valid_to="2026-10-07"), "critical"),
        ({**licence(0), "status": "expired"}, "critical"),
    ]
    got = [licence_expiring.severity(r, t, IN_LADDER) if licence_expiring.fires(r, t) else None for r, _ in cases]
    print("licence:", got)
    assert got == [w for _, w in cases]
    outlet_w, *_, business_w = licence_expiring.windows(frame("IN").outlets[0], t)
    assert licence_expiring.dedupe(licence(20), outlet_w) == f"{OUTLET}:fssai:2026-10-30"
    assert licence_expiring.dedupe({**licence(20), "kind": "gst"}, business_w) == "gst:2026-10-30"  # R-B S2-D: no outlet


def kind_row(kind: str, days_left: int | None, missing: bool = False, outlet: str = OUTLET) -> dict[str, Any]:
    return {**licence(days_left, missing), "kind": kind, "outlet_id": outlet}


def test_licence_windows_follow_the_packs_kinds_for_the_outlets_kind() -> None:
    """Hand values from IN.json / AU.json: a restaurant's verified kind is FSSAI alone; GST, trade licence, fire NOC and
    Shops & Establishments carry `_unverified` notes; a shop has no fire NOC; every AU kind is unverified (no
    `required` window at all). GST and ABN are held by the business (`holder`), the rest by the outlet (R-B S2-D)."""
    got = {}
    for code, kind in (("IN", "restaurant"), ("IN", "store"), ("AU", "restaurant")):
        f = frame(code, kind)
        got[(code, kind)] = [
            (w.key.split(":", 1)[1], w.params["required_kinds"], w.params["as_of"]) for w in licence_expiring.windows(f.outlets[0], {})
        ]
    print("windows:", got)
    assert got == {
        ("IN", "restaurant"): [
            ("outlet:required", ["fssai"], "2026-10-10"),
            ("outlet:held", ["trade_licence", "fire_noc", "shops_establishment"], "2026-10-10"),
            ("business:held", ["gst"], "2026-10-10"),
        ],
        ("IN", "store"): [
            ("outlet:required", ["fssai"], "2026-10-10"),
            ("outlet:held", ["trade_licence", "shops_establishment"], "2026-10-10"),
            ("business:held", ["gst"], "2026-10-10"),
        ],
        ("AU", "restaurant"): [("outlet:held", ["food_business_registration"], "2026-10-10"), ("business:held", ["abn"], "2026-10-10")],
    }


def test_missing_fires_only_for_a_verified_kind_and_expiry_for_any_kind_held_at_this_outlet() -> None:
    """DECISIONS 11 Oct: a missing FSSAI (verified) is critical; a missing GST (unverified) is silent; an expiring GST is
    high; an EXPIRED trade licence (unverified; v1 read it as missing and lost it) is critical; another outlet's row in
    the same snapshot is not this outlet's finding."""
    other = "01920000-0000-7000-8000-0000000050d1"
    expired = {**kind_row("trade_licence", -2), "valid_to": "2026-10-08"}
    rows = [kind_row("fssai", None, True), kind_row("gst", None, True), kind_row("gst", 20), expired, kind_row("fssai", 3, outlet=other)]
    core = FakeCore({"compliance.licence_calendar": rows})
    run(core, frame("IN"), {"compliance": [licence_expiring.SPEC]})
    got = sorted((f.dedupe_key, f.severity) for f in core.findings)
    print("licence findings:", got)
    assert got == [
        (f"compliance.licence_expiring:{OUTLET}:fssai:missing", "critical"),
        (f"compliance.licence_expiring:{OUTLET}:trade_licence:2026-10-08", "critical"),
        ("compliance.licence_expiring:gst:2026-10-30", "high"),  # business-held: no outlet in the key (S2-D)
    ]


def zod_findings(bodies: list[dict[str, Any]]) -> list[list[str]]:
    """core-api's own zod FindingsRequest over each body (tests/tools/zod_check.mts): the failing JSON paths per body."""
    node = shutil.which("node")
    assert node, "node is required: this gate parses with core-api's zod contracts"
    out = subprocess.run(
        [node, str(REPO / "services" / "intel" / "tests" / "tools" / "zod_check.mts")],
        input=json.dumps({"drafts": [], "snapshots": [], "findings": bodies}),
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    result: list[list[str]] = json.loads(out.stdout)["findings"]
    return result


def test_an_outlet_held_licence_finding_names_its_outlet_and_a_business_held_one_none() -> None:
    """T-114 (Lane B1 §7 item 4): the calendar is minted over every outlet, so core cannot stamp the outlet from the
    snapshot; the finding of an outlet-held kind names the row's outlet (core takes it only as that row's own cell), and
    the business-held GST stays tenant-wide, like its task. Both bodies, serialized as InternalClient sends them (an
    unnamed outlet goes as `null`), pass core's zod contract — every finding without an outlet was once refused 422."""
    other = "01920000-0000-7000-8000-0000000050d1"
    expired = {**kind_row("trade_licence", -2), "valid_to": "2026-10-08"}
    rows = [kind_row("fssai", None, True), kind_row("gst", 20), expired, kind_row("fssai", 3, outlet=other)]
    core = FakeCore({"compliance.licence_calendar": rows})
    run(core, frame("IN"), {"compliance": [licence_expiring.SPEC]})
    got = sorted((f.dedupe_key, None if f.outlet_ids is None else [o.root for o in f.outlet_ids.root]) for f in core.findings)
    print("licence finding outlets:", got)
    assert got == [
        (f"compliance.licence_expiring:{OUTLET}:fssai:missing", [OUTLET]),
        (f"compliance.licence_expiring:{OUTLET}:trade_licence:2026-10-08", [OUTLET]),
        ("compliance.licence_expiring:gst:2026-10-30", None),
    ]
    issues = zod_findings([f.model_dump(mode="json", by_alias=True) for f in core.findings])
    print("zod issues per finding:", issues)
    assert issues == [[]] * 3


def test_registered_in_a_real_sweep_not_only_when_a_test_imports_it() -> None:
    """A fresh interpreter that imports only the watch package registers every registry detector of the eight specialists
    (forecast's three are a service's, not watch detectors) — licence_expiring was once left out of compliance/__init__."""
    import subprocess

    code = (
        "import json; from munim_intel.watch.pipeline import detectors_for; "
        "print(json.dumps(sorted(s.id for v in detectors_for(None).values() for s in v)))"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True, timeout=120)
    registered = json.loads(out.stdout.strip().splitlines()[-1])
    want = []  # every pack md §4 table's first-cell ids, forecast.md aside (the specialists test's own parse)
    for f in sorted((REPO / "docs" / "plan" / "packs").glob("*.md")):
        if f.name != "forecast.md":
            section = re.search(r"^## 4 · [\s\S]*?(?=^## 5 · )", f.read_text("utf8"), flags=re.M)
            want += re.findall(r"^\| `([a-z_]+\.[a-z_]+)`", section.group(0) if section else "", flags=re.M)
    want.sort()
    print("registered:", len(registered), "pack §4 rows:", len(want))
    assert registered == want and "compliance.licence_expiring" in registered


# -- the task draft (pack §6): the outlet's manager, or abstain assignee_missing ------------------------------------------


def test_licence_and_log_findings_draft_a_task_for_the_outlets_manager_and_abstain_without_one() -> None:
    """Pack §6 goals.task.create: no numeric leaves; assignee ← manager_member_id (0023); due the licence's valid_to while
    ahead, else tomorrow (11 Oct). Paired: the same rows with no manager → no draft, an `assignee_missing` abstain trace."""
    rows = {
        "compliance.licence_calendar": [
            licence(20, manager=MANAGER),
            {**licence(-3, valid_to="2026-10-07", manager=MANAGER), "kind": "trade_licence"},
        ],
        "compliance.log_coverage": [{**checklist(7, 4), "manager_member_id": MANAGER}],
    }
    core = FakeCore(rows)
    run(core, frame("IN"), {"compliance": [licence_expiring.SPEC, missed_logs.SPEC]})
    drafts = sorted((d.model_dump(mode="json") for d in core.drafts), key=lambda d: d["payload"]["due_on"])
    got = [(d["pack"], d["command_type"], d["payload"]["title_key"], d["payload"]["assignee_member_id"], d["payload"]["due_on"],
            d["payload"]["outlet_id"], d["outlet_ids"], [b.split("·")[-1] for b in d["based_on"]]) for d in drafts]  # fmt: skip
    print("task drafts:", got)
    assert got == [
        (
            "compliance",
            "goals.task.create.v1",
            "goals.task.renew_licence",
            MANAGER,
            "2026-10-11",
            OUTLET,
            [OUTLET],
            ["manager_member_id⟩", "days_left⟩"],
        ),
        (
            "compliance",
            "goals.task.create.v1",
            "goals.task.fix_log_discipline",
            MANAGER,
            "2026-10-11",
            OUTLET,
            [OUTLET],
            ["manager_member_id⟩", "coverage_bp⟩"],
        ),
        (
            "compliance",
            "goals.task.create.v1",
            "goals.task.renew_licence",
            MANAGER,
            "2026-10-30",
            OUTLET,
            [OUTLET],
            ["manager_member_id⟩", "days_left⟩"],
        ),
    ]
    assert all(d["payload"]["finding_id"] == d["finding_id"] and InternalDraftsRequest.model_validate(d) for d in drafts)
    bare = FakeCore({k: [{**r, "manager_member_id": None} for r in v] for k, v in rows.items()})
    run(bare, frame("IN"), {"compliance": [licence_expiring.SPEC, missed_logs.SPEC]})
    abstains = [t["payload"]["reason"] for t in bare.traces if t["kind"] == "abstain"]
    print("no manager:", len(bare.findings), "findings,", len(bare.drafts), "drafts, abstains:", abstains)
    assert (len(bare.findings), len(bare.drafts), abstains) == (3, 0, ["assignee_missing"] * 3)


# -- shape: registry, params, narration, specialist label --------------------------------------------------------------


def test_registered_detectors_are_the_pack_section_4_ids() -> None:
    """Every pack §4 detector is registered; licence_expiring since the run-frame carries the pack's licence kinds."""
    registered = {s.id for s in REGISTRY.get("compliance", [])}
    doc = pack_detector_ids("compliance-assets.md")
    print("registered:", sorted(registered), "pack §4:", sorted(doc))
    assert registered == doc
    assert {s.id for s in SPECS} == registered


def test_every_window_matches_its_template_params_and_every_narration_is_digit_free() -> None:
    problems = []
    for spec in SPECS:
        schema = ontology_function(spec.template)["params_schema"]
        for code in ("IN", "AU"):
            f = frame(code)
            for w in spec.windows(f.outlets[0], f.detectors[spec.id]):
                if set(w.params) != set(schema["properties"]) or not set(schema["required"]) <= set(w.params):
                    problems.append(f"{spec.id}: params {sorted(w.params)} vs {sorted(schema['properties'])}")
        problems += [f"{spec.id}: {p}" for p in narration_problems(spec)]
    print("problems:", problems)
    assert problems == []


def test_every_finding_draft_and_trace_carries_the_compliance_specialist() -> None:
    core = FakeCore(
        {
            "compliance.log_coverage": [checklist(7, 4)],
            "compliance.temp_excursions": [asset_day(3, 448_000)],
            "compliance.asset_costs": [costs(1_350_000, overdue=20, last_cost=180_000)],
            "compliance.energy_per_order": [month(1_400, 1_000)],
        }
    )
    report, _ = run(core, frame("IN"), {"compliance": SPECS})
    actors = {t["actor"] for t in core.traces}
    print("findings:", len(core.findings), "drafts:", len(core.drafts), "actors:", actors, "report:", report.as_json())
    # Hand count: missed logs, temp excursion, AMC waste, maintenance overdue, energy drift = 5; one schedule draft.
    assert (len(core.findings), len(core.drafts)) == (5, 1)
    assert {f.pack for f in core.findings} == {"compliance"} and {d.pack for d in core.drafts} == {"compliance"}
    assert actors == {"watcher:compliance"}


# -- the skill ---------------------------------------------------------------------------------------------------------


def test_skill_is_valid_against_the_ontology_and_binds_at_most_twenty_tools() -> None:
    ont = json.loads((REPO / "packages" / "contracts" / "generated" / "ontology.json").read_text("utf8"))
    entry = next(s for s in ont["specialists"] if s["id"] == "compliance")
    codes = set(ReasonCode.model_fields["root"].annotation.__args__)  # type: ignore[union-attr]
    prose = skill.INSTRUCTIONS_MD
    ctx = RunContext(
        "01920000-0000-7000-8000-0000000050d1", "01920000-0000-7000-8000-0000000050e1", ("*",), "ask", "member:x", 2_000_000_000, "h.p.s"
    )
    tools = skill.toolset(ctx, None, HandleTable({}), propose=True)  # type: ignore[arg-type]
    read_only = skill.toolset(ctx, None, HandleTable({}), propose=False)  # type: ignore[arg-type]
    print("tools:", [t.name for t in tools], "chars:", len(prose))
    assert (skill.PACK, list(skill.READ_TEMPLATES), list(skill.DRAFTABLES)) == ("compliance", entry["templates"], entry["draftables"])
    assert set(skill.REFUSAL_CODES) == {"not_a_certificate", "log_coverage_missing"} and set(skill.REFUSAL_CODES) <= codes
    assert len(prose) <= 1_500 and not any(ch.isdigit() for ch in prose)
    assert [w for w in number_words() if re.search(rf"\b{re.escape(w)}\b", prose, flags=re.I)] == []
    assert len(tools) == len(entry["templates"]) + len(entry["draftables"]) <= 20
    assert len(read_only) == len(entry["templates"]) and not any(t.name.startswith("propose_") for t in read_only)


# -- R-B S2-D: a business-held licence is one finding and one tenant-wide task --------------------------------------------

OUTLET_2 = "01920000-0000-7000-8000-0000000050d2"
MANAGER_2 = "01920000-0000-7000-8000-0000000050f2"


def test_a_business_held_licence_is_filed_once_tenant_wide_and_an_outlet_held_one_per_outlet() -> None:
    """Hand values: two restaurants, both rows for one GST registration expiring 30 Oct (the template repeats a
    tenant-wide licence per outlet) → one finding `gst:2026-10-30`, one task with no outlet and `outlet_ids` [], assigned
    to the first row's outlet manager. Paired: each outlet's own FSSAI expiring → one finding and one task per outlet."""
    f = frame("IN")
    f = replace(f, outlets=(f.outlets[0], replace(f.outlets[0], id=OUTLET_2)))
    rows = [
        {**kind_row("fssai", 20), "manager_member_id": MANAGER},
        {**kind_row("gst", 20), "manager_member_id": MANAGER},
        {**kind_row("fssai", 20, outlet=OUTLET_2), "manager_member_id": MANAGER_2},
        {**kind_row("gst", 20, outlet=OUTLET_2), "manager_member_id": MANAGER_2},
    ]
    core = FakeCore({"compliance.licence_calendar": rows})
    run(core, f, {"compliance": [licence_expiring.SPEC]})
    keys = sorted({x.dedupe_key for x in core.findings})
    drafts = sorted(
        (
            (d["payload"]["outlet_id"], d["outlet_ids"], d["payload"]["assignee_member_id"])
            for d in (x.model_dump(mode="json") for x in core.drafts)
        ),
        key=str,
    )
    print("keys:", keys, "drafts:", drafts)
    assert keys == [
        f"compliance.licence_expiring:{OUTLET}:fssai:2026-10-30",
        f"compliance.licence_expiring:{OUTLET_2}:fssai:2026-10-30",
        "compliance.licence_expiring:gst:2026-10-30",
    ]
    assert len([x for x in core.findings if x.dedupe_key.endswith(":gst:2026-10-30")]) == 1, "filed once, not once per outlet"
    assert drafts == sorted([(None, [], MANAGER), (OUTLET, [OUTLET], MANAGER), (OUTLET_2, [OUTLET_2], MANAGER_2)], key=str)


def test_a_missing_licence_narrates_its_status_never_its_null_date_cells() -> None:
    """A missing FSSAI row has null days_left and valid_to: its narration cites the status cell only. Paired: an
    expiring row cites days_left and valid_to."""
    core = FakeCore({"compliance.licence_calendar": [kind_row("fssai", None, True), kind_row("trade_licence", 20)]})
    run(core, frame("IN"), {"compliance": [licence_expiring.SPEC]})
    texts = {x.dedupe_key.split(":")[-2]: x.envelope.segments[0].text for x in core.findings}
    print("narrations:", texts)
    assert re.findall(r"·0·([a-z_]+)⟩", texts["fssai"]) == ["status"]
    assert re.findall(r"·1·([a-z_]+)⟩", texts["trade_licence"]) == ["days_left", "valid_to"]
