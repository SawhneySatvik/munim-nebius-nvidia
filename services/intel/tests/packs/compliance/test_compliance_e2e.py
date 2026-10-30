"""T-050 end to end: the Compliance & Assets detectors find their answer-key plants through core-api's real internal API.
The four worlds are seeded by worldgen at the 100-day gate profile on embedded Postgres, and every sweep runs with the
profile's AS_OF, 10 Oct 2026, as each outlet's business date. Fails, never skips, without node.

Expected values are independent of the code: plant ids, `where`, ₹ and metrics from the answer keys; severities from the
ladder L of the packs header (IN ₹50,000 / ₹10,000 / ₹2,000; AU A$1,000 / A$200 / A$40) and pack §4. Not gated here:
- A4 (not plantable) and overdue maintenance (no plant): test_compliance_offline.py covers both. The maintenance
  draft's payload also goes once through core's real drafts route here, driven by hand.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "customers"))

from pack_kit import ACTORS, AS_OF, WORLDS, PackStack, answer_key, detector_map  # noqa: E402

from munim_intel.contracts_gen.models import InternalDraftsRequest, InternalSnapshotsRequest  # noqa: E402
from munim_intel.detect import REGISTRY, OutletFrame  # noqa: E402
from munim_intel.mapping import Abstain, Detection, draft_body  # noqa: E402
from munim_intel.runtime.context import RunContext  # noqa: E402
from munim_intel.runtime.internal_client import InternalClient  # noqa: E402
from munim_intel.watch.detectors.compliance import (  # noqa: E402
    amc_waste,
    energy_drift,
    licence_expiring,
    maintenance_overdue,
    missed_logs,
    temp_excursion,
)

SPECS = [missed_logs.SPEC, temp_excursion.SPEC, amc_waste.SPEC, maintenance_overdue.SPEC, energy_drift.SPEC, licence_expiring.SPEC]
#: A5: the licence plants, found by the run-frame's licence kinds (W3.2): days left by the key's metric, `high` (> 7 days).
A5 = ("RG-A5", "ST-A5", "AU-A5")
LADDER = {"IN": (5_000_000, 1_000_000, 200_000), "AU": (100_000, 20_000, 4_000)}
A1 = {"RG-A1": "IN", "AU-A1": "AU"}


def ladder(code: str, minor: int) -> str:
    critical, high, medium = LADDER[code]
    return "critical" if minor >= critical else "high" if minor >= high else "medium" if minor >= medium else "low"


@pytest.fixture(scope="module")
def ps(tmp_path_factory: pytest.TempPathFactory) -> Iterator[PackStack]:
    s = PackStack(tmp_path_factory.mktemp("run"))
    yield s
    s.stop()


@pytest.fixture(scope="module")
def swept(ps: PackStack) -> dict[str, Any]:
    reports = {w: ps.sweep(w, SPECS, ps.frame(w, AS_OF)).as_json() for w in WORLDS}
    print("reports:", reports)
    return reports


def plant_findings(ps: PackStack) -> dict[str, list[dict[str, Any]]]:
    """Answer-key id → its findings, located by the key's own ids and dates (never by the code's rows)."""
    out: dict[str, list[dict[str, Any]]] = {}
    for plant in A1:
        entry = answer_key(plant)
        w = {"RG": "restaurant_group", "AU": "au_outlet"}[plant[:2]]
        asset = ps.id(w, entry["where"]["asset"])
        days = sorted({(AS_OF.toordinal() - int(log.split(":")[2])) for log in entry["where"]["logs"]})
        keys = {f"compliance.temp_excursion:{asset}:{AS_OF.fromordinal(d).isoformat()}" for d in days}
        out[plant] = [f for f in ps.findings("compliance", w) if f["dedupe_key"] in keys]
    for plant in ("CK-A2", "CK-A3"):
        asset = ps.id("cloud_kitchen", answer_key(plant)["where"]["asset"])
        out[plant] = [f for f in ps.findings("compliance", "cloud_kitchen") if f["dedupe_key"] == f"compliance.amc_waste:{asset}:2026-q4"]
    where = answer_key("CK-A6")["where"]
    outlet, checklist = ps.id("cloud_kitchen", where["outlet"]), ps.id("cloud_kitchen", where["checklist"])
    out["CK-A6"] = [
        f for f in ps.findings("compliance", "cloud_kitchen") if f["dedupe_key"].startswith(f"compliance.missed_logs:{outlet}:{checklist}:")
    ]
    for plant in A5:
        w = {"RG": "restaurant_group", "ST": "store", "AU": "au_outlet"}[plant[:2]]
        where = answer_key(plant)["where"]
        (lic,) = ps.sql("SELECT kind, valid_to::text FROM core.licence WHERE id = $1", ps.id(w, where["licence"]))
        key = f"compliance.licence_expiring:{ps.id(w, where['outlet'])}:{lic['kind']}:{lic['valid_to']}"
        out[plant] = [f for f in ps.findings("compliance", w) if f["dedupe_key"] == key]
    return out


def test_detector_map_plants_of_the_registered_detectors() -> None:
    problems = detector_map()["problems"]
    registered = {s.id for s in REGISTRY["compliance"]}
    mine = {pid for pid, p in problems.items() if p.get("detector") in registered}
    print("gated:", sorted(mine))
    assert mine == {"RG-A1", "AU-A1", "CK-A2", "CK-A3", "CK-A6", "RG-A5", "ST-A5", "AU-A5"}
    assert registered == {s.id for s in SPECS}


def test_a5_each_licence_is_found_once_with_its_days_left(ps: PackStack, swept: dict[str, Any]) -> None:
    """RG-A5 is FSSAI (verified in IN.json), ST-A5 Shops & Establishments and AU-A5 the food business registration (both
    `_unverified`): expiry is reported for any kind held (DECISIONS 11 Oct). Days left = the key's metric; > 7 → high."""
    found = plant_findings(ps)
    got = {p: [(f["severity"], int(f["impact"])) for f in found[p]] for p in A5}
    print("A5:", got)
    assert got == {p: [("high", answer_key(p)["metric"]["value"])] for p in A5}


def test_a1_temperature_excursions_are_found_on_both_days_with_the_key_waste(ps: PackStack, swept: dict[str, Any]) -> None:
    """Two asset-days of three bad readings each; the waste is binned on the last of them. Σ impact = the key's ₹ and
    Σ out_of_range = the key's count; each day is high (L of its waste is below high, so the floor holds)."""
    found = plant_findings(ps)
    for plant, code in A1.items():
        entry, fs = answer_key(plant), found[plant]
        bad = sum(f["snapshot_rows"][f["impact_row"]]["out_of_range"] for f in fs)
        print(plant, [(f["dedupe_key"], f["impact"], f["severity"]) for f in fs], "out of range:", bad)
        assert len(fs) == 2 and sum(int(f["impact"]) for f in fs) == entry["impact_minor"] and bad == entry["where"]["out_of_range"]
        # By hand: RG 448,000 → medium, AU 7,200 cents → medium, a day without waste → low; each lifted to high.
        assert {ladder(code, int(f["impact"])) for f in fs} <= {"low", "medium"} and {f["severity"] for f in fs} == {"high"}


def test_a2_a3_amc_waste_is_found_per_asset_with_the_key_impact(ps: PackStack, swept: dict[str, Any]) -> None:
    found = plant_findings(ps)
    for plant in ("CK-A2", "CK-A3"):
        (f,) = found[plant]
        key = answer_key(plant)["impact_minor"]
        print(plant, f["dedupe_key"], f["impact"], f["severity"], "key:", key)
        assert (f["type"], int(f["impact"]), f["severity"]) == ("compliance.amc_waste", key, ladder("IN", key))


def test_a6_closing_checklist_four_of_seven_is_high(ps: PackStack, swept: dict[str, Any]) -> None:
    (f,) = plant_findings(ps)["CK-A6"]
    metric = answer_key("CK-A6")["metric"]
    days = answer_key("CK-A6")["where"]["days"]
    print("CK-A6:", f["dedupe_key"], f["impact"], f["severity"], "metric:", metric)
    assert (int(f["impact"]), f["severity"]) == (metric["value"] * 10_000 // days, "high")


def test_false_alarms_are_at_most_two_per_world(ps: PackStack, swept: dict[str, Any]) -> None:
    plants = {f["id"] for fs in plant_findings(ps).values() for f in fs}
    extra = {w: [(f["dedupe_key"], f["impact"]) for f in ps.findings("compliance", w) if f["id"] not in plants] for w in WORLDS}
    print("not a plant:", extra)
    assert all(len(v) <= 2 for v in extra.values()), extra


def test_the_maintenance_schedule_draft_is_accepted_by_core_as_proposed_with_its_refs(ps: PackStack, swept: dict[str, Any]) -> None:
    """No world plants overdue maintenance, so the §6 mapping is driven by hand through core's real drafts route. The
    steps: mint `compliance.asset_costs` at Zafran's outlet, map the freezer's row, and post the draft under CK-A2's
    finding, a compliance finding. Core parses the proposal schema, checks scope, resolves every ref and runs the number
    grammar. The draft must come back `proposed` and stored exactly as sent. The freezer has no past preventive cost,
    so the estimate is null by the mapping's rule."""
    (a2,) = plant_findings(ps)["CK-A2"]
    outlet = ps.id("cloud_kitchen", answer_key("CK-A6")["where"]["outlet"])
    freezer = ps.id("cloud_kitchen", answer_key("CK-A2")["where"]["asset"])

    async def propose(client: InternalClient, _: RunContext) -> tuple[str, InternalDraftsRequest]:
        params = {"outlet_id": outlet, "from": AS_OF.isoformat(), "to": AS_OF.isoformat()}
        snap = (
            await client.mint_snapshot(InternalSnapshotsRequest.model_validate({"template_id": "compliance.asset_costs", "params": params}))
        ).model_dump(mode="json")
        i = next(i for i, r in enumerate(snap["rows"]) if r["asset_id"] == freezer)
        d = Detection(snap["snapshot_id"], i, snap["rows"][i], OutletFrame(outlet, "cloud_kitchen", AS_OF), "INR")
        req = InternalDraftsRequest.model_validate(draft_body("compliance", a2["id"], d, maintenance_overdue.schedule(d)))
        res = await client.write_draft(req)
        return res.status, req

    status, req = ps.with_client("cloud_kitchen", propose)
    (row,) = ps.sql("SELECT source, status, command_type, command_payload, based_on FROM core.draft WHERE id = $1", req.draft_id.root)
    sent = req.model_dump(mode="json")
    print("draft:", status, row["status"], row["command_payload"], row["based_on"])
    assert (status, row["status"], row["source"], row["command_type"]) == (
        "proposed",
        "proposed",
        "intel:compliance",
        "compliance.maintenance.schedule.v1",
    )
    assert row["command_payload"] == sent["payload"] and sent["payload"]["estimated_cost_minor"] is None
    assert [b["ref"] if isinstance(b, dict) else b for b in row["based_on"]] == sent["based_on"]
    assert sent["based_on"][0].endswith("·preventive_overdue_days⟩") and sent["payload"]["asset_id"] == freezer


def test_every_finding_is_filed_under_its_outlet_and_carries_the_compliance_specialist(ps: PackStack, swept: dict[str, Any]) -> None:
    """Every compliance template but `licence_calendar` takes `outlet_id`, so each such finding (and its snapshot) belongs
    to that one outlet (T-040 note a); a licence finding's snapshot is minted under the run's scope (v1 has no outlet
    param — a migrator request), so it is tenant-wide. Every template narration passed core's number grammar."""
    findings = ps.findings("compliance")
    all_findings = ps.sql("SELECT pack FROM intel.finding")
    drafts = ps.sql("SELECT source, command_type FROM core.draft WHERE source LIKE 'intel:%'")
    actors = {a["actor"] for a in ps.sql(ACTORS)}
    outlets = {r["id"] for r in ps.sql("SELECT id::text FROM core.outlet")}
    print("findings:", len(findings), "of", len(all_findings), "drafts:", drafts, "actors:", actors)
    # Hand count: RG-A1 ×2 + AU-A1 ×2 + CK-A2 + CK-A3 + CK-A6 + 3 × A5 = 10 at least. Drafts: no world plants overdue
    # maintenance, so one schedule (the hand-driven one above); every licence and log finding has its outlet's manager
    # (wg-1), so each got a task: at least the four plants' (3 × A5, CK-A6).
    tasks = [d for d in drafts if d["command_type"] == "goals.task.create.v1"]
    assert len(findings) >= 10 and len(findings) == len(all_findings) and {d["source"] for d in drafts} == {"intel:compliance"}
    assert len(drafts) - len(tasks) == 1 and len(tasks) >= 4
    assert actors == {"watcher:compliance"}
    per_outlet = [f for f in findings if f["type"] != "compliance.licence_expiring"]
    assert all(len(f["outlet_ids"]) == 1 and f["outlet_ids"][0] in outlets and f["dedupe_key"] for f in per_outlet)
    assert all(f["envelope"]["abstained"] is False and "⟨snap:" in f["envelope"]["segments"][0]["text"] for f in findings)


def test_licence_and_log_tasks_go_to_each_outlets_manager_and_a_south_manager_task_is_proposed_by_core(
    ps: PackStack, swept: dict[str, Any]
) -> None:
    """Pack §6 goals.task.create, assignee = the outlet's manager (0023 `manager_member_id`). Worldgen gives every outlet a
    manager (wg-1; key aliases by hand below), so each licence and log plant's finding got one proposed task for its own
    outlet's manager and none abstained `assignee_missing` (the abstain itself is gated offline). Accept, driven by hand
    through core's real drafts route (no plant at South): South's licence row carries worldgen's manager, and the mapping's
    task for it is stored `proposed`, assigned to that member."""
    plants = plant_findings(ps)
    managers = {"RG-A5": "member:manager_central", "ST-A5": "member:manager", "AU-A5": "member:manager", "CK-A6": "member:manager"}
    got, want = {}, {}
    for plant, alias in managers.items():
        w = {"RG": "restaurant_group", "ST": "store", "AU": "au_outlet", "CK": "cloud_kitchen"}[plant[:2]]
        (f,) = plants[plant]
        rows = ps.sql(
            """SELECT source, status, command_payload ->> 'assignee_member_id' AS who, command_payload ->> 'outlet_id' AS outlet
                 FROM core.draft WHERE finding_id = $1::uuid AND command_type = 'goals.task.create.v1'""",
            f["id"],
        )
        got[plant] = [(r["source"], r["status"], r["who"], r["outlet"]) for r in rows]
        want[plant] = [("intel:compliance", "proposed", ps.id(w, alias), ps.id(w, answer_key(plant)["where"]["outlet"]))]
    abstained = ps.sql(
        "SELECT count(*)::int AS n FROM intel.trace_event WHERE kind = 'abstain' AND payload ->> 'reason' = 'assignee_missing'"
    )
    print("tasks:", got, "assignee_missing abstains:", abstained)
    assert got == want and abstained[0]["n"] == 0
    south, manager = ps.id("restaurant_group", "outlet:3"), ps.id("restaurant_group", "member:manager")
    (a5,) = plants["RG-A5"]

    async def propose(client: InternalClient, _: RunContext) -> tuple[str, InternalDraftsRequest]:
        params = {"as_of": AS_OF.isoformat(), "required_kinds": ["fssai"]}
        req0 = InternalSnapshotsRequest.model_validate({"template_id": "compliance.licence_calendar", "params": params})
        snap = (await client.mint_snapshot(req0)).model_dump(mode="json")
        i = next(i for i, r in enumerate(snap["rows"]) if r["outlet_id"] == south)
        d = Detection(snap["snapshot_id"], i, snap["rows"][i], OutletFrame(south, "restaurant", AS_OF), "INR", finding_id=a5["id"])
        proposal = licence_expiring.renew(d)
        assert not isinstance(proposal, Abstain), "South has a manager"
        req = InternalDraftsRequest.model_validate(draft_body("compliance", a5["id"], d, proposal))
        return (await client.write_draft(req)).status, req

    status, req = ps.with_client("restaurant_group", propose)
    (row,) = ps.sql("SELECT source, status, command_type, command_payload FROM core.draft WHERE id = $1", req.draft_id.root)
    print("task draft:", status, row)
    assert (status, row["status"], row["source"], row["command_type"]) == (
        "proposed",
        "proposed",
        "intel:compliance",
        "goals.task.create.v1",
    )
    p = row["command_payload"]
    assert (p["assignee_member_id"], p["outlet_id"], p["title_key"], p["finding_id"]) == (
        manager,
        south,
        "goals.task.renew_licence",
        a5["id"],
    )
