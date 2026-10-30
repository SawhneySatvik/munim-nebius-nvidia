"""T-095d gates: the Munim Cares drafts (ADR-015 §4), offline against the in-memory core (the internal API is the system
boundary; core's side of the templates is b-95a's). Expected values are hand values: the recipients' and listings' ids,
rows and pickup days below, and ST-I4's `impact_minor` read from the committed answer key and `evals/w3/accept.json`
— never from the code under test. Every refusal is paired with an accept."""

from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "kitchen"))
from fake_core import CTX, OUTLET, FakeCore, pack  # noqa: E402

import munim_intel.watch.detectors  # noqa: E402,F401 — registers every detector
from conftest import REPO  # noqa: E402
from munim_intel.config import load_config  # noqa: E402
from munim_intel.contracts_gen.models import Cloudevent  # noqa: E402
from munim_intel.events import handle_event  # noqa: E402
from munim_intel.mapping import Proposal, draft_id, uuid7_ms  # noqa: E402
from munim_intel.runtime.internal_client import InternalClient  # noqa: E402
from munim_intel.skills.market import skill as market  # noqa: E402
from munim_intel.tools.generated import uuid7  # noqa: E402
from munim_intel.tools.handles import HandleTable  # noqa: E402
from munim_intel.watch.frame import Frame, frame_from_pack  # noqa: E402
from munim_intel.watch.pipeline import WatchRun, detectors_for  # noqa: E402

CFG = load_config(env={}, run_dir=REPO / "nonexistent")
PUBLISHED = "munim.cares.listing.published.v1"
BATCH, ING = "01920000-0000-7000-8000-0000000095b1", "01920000-0000-7000-8000-0000000095b2"
R1, R2 = "01920000-0000-7000-8000-0000000095c1", "01920000-0000-7000-8000-0000000095c2"
L1, L2 = "01920000-0000-7000-8000-0000000095d1", "01920000-0000-7000-8000-0000000095d2"
M1, M2 = "01920000-0000-7000-8000-0000000095e1", "01920000-0000-7000-8000-0000000095e2"
PICKUP_ON = "2026-10-11"
FROM, TO = "2026-10-11T10:30:00.000Z", "2026-10-11T12:00:00.000Z"


def key(path: str, plant: str) -> dict[str, Any]:
    return next(p for p in json.loads((REPO / "tools/worldgen/answer-key" / path).read_text("utf8"))["problems"] if p["id"] == plant)


ST_I4 = key("store.json", "ST-I4")
ACCEPT = json.loads((REPO / "evals/w3/accept.json").read_text("utf8"))


def frame(cares: bool, kind: str = "store") -> Frame:
    return frame_from_pack(pack("IN"), [{"id": OUTLET, "kind": kind, "business_date": "2026-10-10", "cares_active": cares}], "template")  # type: ignore[dict-item]


def expiry_row() -> dict[str, Any]:
    return {
        "outlet_id": OUTLET, "batch_id": BATCH, "ingredient_id": ING, "unit": "unit", "is_sku": True, "days_to_expiry": 2,
        "expiry_on": "2026-10-12", "remaining_qty_milli": 40_000, "use_before_expiry_qty_milli": 0, "at_risk_qty_milli": 40_000,
        "at_risk_minor": ST_I4["impact_minor"],
    }  # fmt: skip


def match_row(recipient: str, fit: bool = True, metres: int = 1200) -> dict[str, Any]:
    return {
        "recipient_id": recipient, "name": "Asha Food Bank (simulated)", "simulated": True, "distance_m": metres, "capacity_fit": fit,
        "overlap_min": 90, "pickup_from": FROM, "pickup_to": TO, "pickup_on": PICKUP_ON,
    }  # fmt: skip


def sweep(serve: Any, f: Frame, pack_name: str) -> FakeCore:
    core = FakeCore(serve)
    asyncio.run(WatchRun(CTX, core, f, CFG).run({pack_name: detectors_for(None)[pack_name]}))
    return core


def expiry_sweep(matches: list[dict[str, Any]], cares: bool = True) -> FakeCore:
    rows = {"inventory.expiry_risk": [expiry_row()], "cares.recipient_match": matches}
    return sweep(lambda t, _p: rows.get(t, []), frame(cares), "inventory_purchasing")


def minted(core: FakeCore, template: str) -> list[tuple[dict[str, Any], str]]:
    return [(p, sid) for t, p, sid in core.minted if t == template]


def abstains(core: FakeCore) -> list[dict[str, Any]]:
    return [t["payload"] for t in core.traces if t["kind"] == "abstain"]


def cares_drafts(core: FakeCore) -> list[dict[str, Any]]:
    dumps = [d.model_dump(mode="json") for d in core.drafts]
    return [d for d in dumps if d["command_type"].startswith("cares.") or d["payload"].get("cares_listing_id")]


REF = re.compile(r"^⟨snap:([0-9a-f-]{36})·(\d+)·([a-z_0-9]+)⟩$")
SAFE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|⟨snap:[^⟩]*⟩|\d{4}-\d\d-\d\d(T[\d:.]+Z)?")


def leaves(v: Any) -> list[Any]:
    if isinstance(v, dict):
        return [x for e in v.values() for x in leaves(e)]
    if isinstance(v, list):
        return [x for e in v for x in leaves(e)]
    return [v]


def free_digits(payload: dict[str, Any]) -> list[Any]:
    """Leaves that carry a number nobody minted: any int/float, or a digit left in a string after the ids, dates and
    canonical refs (the only digit-bearing strings a mapping may place) are taken out."""
    return [
        x
        for x in leaves(payload)
        if isinstance(x, int | float) and not isinstance(x, bool) or isinstance(x, str) and re.search(r"\d", SAFE.sub("", x))
    ]


def resolves(core: FakeCore, ref: str) -> bool:
    """Offline meaning of "resolves": the snapshot id was minted in this run, the row exists and the column is in it.
    Core's own resolution of the same refs is b-95a's gate."""
    m = REF.match(ref)
    assert m, ref
    sid, row, col = m.group(1), int(m.group(2)), m.group(3)
    served = [r for t, prm, s in core.minted if s == sid for r in core.serve(t, prm)]
    return row < len(served) and col in served[row]


# -- expiry_risk -> cares.listing.publish.v1 ----------------------------------------------------------------------------


def test_a_donation_draft_goes_to_the_top_ranked_recipient_with_refs_that_resolve() -> None:
    core = expiry_sweep([match_row(R1, metres=1200), match_row(R2, metres=9000)])
    (draft,) = cares_drafts(core)
    p = draft["payload"]
    (qty_ref,) = [x for x in leaves(p) if isinstance(x, str) and REF.match(x)]
    (params, match_sid), (_, expiry_sid) = minted(core, "cares.recipient_match")[0], minted(core, "inventory.expiry_risk")[0]
    print("draft:", json.dumps(draft)[:700])
    assert (draft["command_type"], draft["pack"], draft["outlet_ids"]) == ("cares.listing.publish.v1", "inventory_purchasing", [OUTLET])
    assert (p["recipient_id"], p["kind"], p["pickup_from"], p["pickup_to"]) == (R1, "donation", FROM, TO)  # row 0, not R2
    line = p["lines"][0]
    assert (line["food_kind"], line["batch_id"], line["ingredient_id"], line["expires_on"], line["unit_price_minor"]) == (
        "packaged", BATCH, ING, "2026-10-12", None,
    )  # fmt: skip
    assert qty_ref == f"⟨snap:{expiry_sid}·0·at_risk_qty_milli⟩" == line["qty_milli"]
    # The match is asked for this batch's at-risk quantity: a shop SKU needs a recipient taking packaged food.
    assert params == {
        "outlet_id": OUTLET, "needs_cooked": False, "needs_raw": False, "needs_packaged": True, "qty_milli": 40_000,
        "unit": "unit", "expires_on": "2026-10-12",
    }  # fmt: skip
    # based_on names the quantity, the expiry and the match row's recipient, window and pickup day.
    assert draft["based_on"] == [
        f"⟨snap:{expiry_sid}·0·at_risk_qty_milli⟩", f"⟨snap:{expiry_sid}·0·expiry_on⟩",
        *(f"⟨snap:{match_sid}·0·{c}⟩" for c in ("recipient_id", "pickup_from", "pickup_to", "pickup_on")),
    ]  # fmt: skip
    assert all(resolves(core, r) for r in draft["based_on"]) and len(draft["based_on"]) == 6
    # Ids: the draft id keys on [batch, pickup day]; both minted ids are new and distinct, the line's by pointer.
    did = draft["draft_id"]
    assert did == proposal_id(core.findings[0].envelope.finding_id.root, "cares.listing.publish.v1", [BATCH, PICKUP_ON])
    assert p["listing_id"] == uuid7(uuid7_ms(did), f"{did}/listing_id") and line["line_id"] == uuid7(
        uuid7_ms(did), f"{did}/lines/0/line_id"
    )
    assert len({p["listing_id"], line["line_id"], BATCH, ING}) == 4
    assert (core.drafts[0].evidence[0].root, len(core.drafts)) == (f"snap:{expiry_sid}", 1)
    assert [t["payload"]["status"] for t in core.traces if t["kind"] == "draft"] == ["proposed"] and abstains(core) == []


def proposal_id(finding_id: str, command: str, targets: list[str]) -> str:
    return draft_id(finding_id, Proposal(command, {}, [], targets))


def test_a_raw_ingredient_asks_for_raw_and_lists_as_raw() -> None:
    rows = {"inventory.expiry_risk": [{**expiry_row(), "is_sku": False}], "cares.recipient_match": [match_row(R1)]}
    core = sweep(lambda t, _p: rows.get(t, []), frame(True), "inventory_purchasing")
    ((params, _),), (draft,) = minted(core, "cares.recipient_match"), cares_drafts(core)
    assert (params["needs_raw"], params["needs_packaged"], draft["payload"]["lines"][0]["food_kind"]) == (True, False, "raw")


def test_draft_leaves_pass_the_free_digit_scan_and_the_scan_fails_a_typed_number() -> None:
    (draft,) = cares_drafts(expiry_sweep([match_row(R1)]))
    assert free_digits(draft["payload"]) == []
    # The scan is live: a number typed into a string leaf, or a bare number, is found.
    assert free_digits({**draft["payload"], "note": "about 40 kg"}) == ["about 40 kg"]
    assert free_digits({**draft["payload"], "qty": 40}) == [40]


def test_not_opted_in_means_no_cares_mint_no_draft_and_no_abstain_and_the_accept_case_drafts() -> None:
    off, on = expiry_sweep([match_row(R1)], cares=False), expiry_sweep([match_row(R1)])
    print("off mints:", [t for t, _, _ in off.minted], "on mints:", [t for t, _, _ in on.minted])
    assert [t for t, _, _ in off.minted if t.startswith("cares.")] == []  # nothing of Cares is even asked for
    assert [t for t, _, _ in on.minted if t.startswith("cares.")] == ["cares.recipient_match"]
    assert (len(off.drafts), abstains(off), len(off.findings)) == (0, [], 1)
    assert (len(on.drafts), abstains(on), len(on.findings)) == (1, [], 1)


def test_opted_in_with_no_recipient_abstains_once_and_a_row_that_does_not_fit_still_drafts_as_the_adr_says() -> None:
    """ADR-015 §4: 0 rows -> `no_eligible_recipient`, otherwise row 0 (the template sorts fit first, it does not filter)."""
    empty, unfit = expiry_sweep([]), expiry_sweep([match_row(R1, fit=False)])
    assert (len(empty.drafts), abstains(empty)) == (0, [{"detector": "inventory.expiry_risk", "reason": "no_eligible_recipient"}])
    assert (len(unfit.drafts), abstains(unfit)) == (1, [])


def test_expiry_findings_are_the_committed_answer_key_and_unchanged_by_cares() -> None:
    """Cares on, Cares off and no match at all leave the ST-I4 finding identical (a re-run comparison, not the key gate:
    the key gate is the e2e `test_the_store_batch_expiring_soon_is_found_inside_its_window` against core, which reads
    store.json). Here the fixture's cell is the key's impact (100,000 paise = 40 x 2,500, read from the committed key), and
    accept.json holds no alternative for the plant."""
    assert (ST_I4["kind"], ST_I4["impact_minor"]) == ("expiry_risk", 100_000)
    assert "ST-I4" not in ACCEPT["impact_alternatives"] and not any("ST-I4" in str(v) for k, v in ACCEPT.items() if k != "_about")
    cores = [expiry_sweep([match_row(R1)]), expiry_sweep([match_row(R1)], cares=False), expiry_sweep([])]
    seen = [c.finding_rows() for c in cores]
    (f,) = seen[0]
    assert (f["dedupe_key"], f["severity"], f["impact_column"]) == (f"inventory.expiry_risk:{OUTLET}:{BATCH}", "low", "at_risk_minor")
    assert expiry_row()["at_risk_minor"] == ST_I4["impact_minor"] and seen[0] == seen[1] == seen[2]


# -- overstaffed_slot -> goals.task.create.v1 ---------------------------------------------------------------------------

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "people"))
from test_people_offline import p2_rows  # noqa: E402


def listing(listing_id: str, weekday: str = "tue", slot: str = "15:00", on: str = PICKUP_ON) -> dict[str, Any]:
    return {
        "listing_id": listing_id, "kind": "donation", "status": "published", "recipient_id": R1, "pickup_from": FROM, "pickup_to": TO,
        "pickup_on": on, "pickup_weekday": weekday, "pickup_slot_start": slot, "lines": 1,
    }  # fmt: skip


def people_sweep(listings: list[dict[str, Any]], crew: list[dict[str, Any]], cares: bool = True) -> FakeCore:
    window = ("2026-08-29", "2026-10-09", 60)
    rows = {"cares.listings": listings, "cares.pickup_crew": crew}

    def serve(t: str, p: dict[str, Any]) -> list[dict[str, Any]]:
        if t == "people.labour_vs_demand":
            return p2_rows(4) if (p["from"], p["to"], p["slot_minutes"]) == window else []
        return rows.get(t, [])

    return sweep(serve, replace_frame(cares), "people")


def replace_frame(cares: bool) -> Frame:
    return frame(cares, "restaurant")


CREW = [{"staff_id": "s1", "member_id": M1}, {"staff_id": "s2", "member_id": M2}]


def test_exactly_one_pack_and_hand_over_task_for_the_listing_in_the_slot_with_the_first_crew_member() -> None:
    core = people_sweep([listing(L2, "wed", "16:00", "2026-10-14"), listing(L1)], CREW)
    (task,) = cares_drafts(core)
    p, (crew_params, crew_sid), (_, listings_sid) = task["payload"], minted(core, "cares.pickup_crew")[0], minted(core, "cares.listings")[0]
    (finding,) = core.finding_rows()
    print("task:", json.dumps(task)[:600])
    assert finding["dedupe_key"] == f"people.overstaffed_slot:{OUTLET}:tue:15:00"
    assert (task["command_type"], task["pack"], task["outlet_ids"]) == ("goals.task.create.v1", "people", [OUTLET])
    assert (p["title_key"], p["assignee_member_id"], p["due_on"], p["cares_listing_id"], p["outlet_id"]) == (
        "cares.task.pack_and_hand_over", M1, PICKUP_ON, L1, OUTLET,
    )  # fmt: skip
    assert p["finding_id"] == core.findings[0].envelope.finding_id.root
    assert crew_params == {"outlet_id": OUTLET, "listing_id": L1} and len(minted(core, "cares.pickup_crew")) == 1  # chained, one
    assert minted(core, "cares.listings")[0][0] == {"outlet_id": OUTLET, "status": "published"}
    # The listing at row 1 (row 0 is the off-slot one) and the crew's first row are cited, beside the finding's own slot cells.
    fsid = finding["impact_snapshot"]
    assert task["based_on"] == [
        f"⟨snap:{fsid}·7·weekday⟩", f"⟨snap:{fsid}·7·slot_start⟩", f"⟨snap:{listings_sid}·1·pickup_weekday⟩",
        f"⟨snap:{listings_sid}·1·pickup_slot_start⟩", f"⟨snap:{listings_sid}·1·pickup_on⟩", f"⟨snap:{crew_sid}·0·member_id⟩",
    ]  # fmt: skip
    assert all(resolves(core, r) for r in task["based_on"])
    did = task["draft_id"]
    assert p["task_id"] == uuid7(uuid7_ms(did), f"{did}/task_id")
    assert did == proposal_id(p["finding_id"], "goals.task.create.v1", [L1, PICKUP_ON])


def test_no_listing_in_the_slot_drafts_nothing_and_asks_for_no_crew() -> None:
    core = people_sweep([listing(L2, "wed", "16:00", "2026-10-14")], CREW)
    assert (len(core.drafts), abstains(core), minted(core, "cares.pickup_crew"), len(core.findings)) == (0, [], [], 1)


def test_a_listing_with_no_rostered_crew_abstains_and_the_accept_case_drafts() -> None:
    none, some = people_sweep([listing(L1)], []), people_sweep([listing(L1)], CREW)
    assert (len(none.drafts), abstains(none)) == (0, [{"detector": "people.overstaffed_slot", "reason": "no_rostered_staff"}])
    assert (len(some.drafts), abstains(some)) == (1, [])


def test_not_opted_in_the_people_sweep_mints_nothing_of_cares_and_files_the_same_finding() -> None:
    off, on = people_sweep([listing(L1)], CREW, cares=False), people_sweep([listing(L1)], CREW)
    assert [t for t, _, _ in off.minted if t.startswith("cares.")] == [] and (len(off.drafts), abstains(off)) == (0, [])
    assert off.finding_rows() == on.finding_rows() and len(on.finding_rows()) == 1


def test_a_published_listing_event_runs_only_the_people_watch_and_drafts_the_task() -> None:
    assert {p: [s.id for s in specs] for p, specs in detectors_for(PUBLISHED).items()} == {"people": ["people.overstaffed_slot"]}
    rows = {"cares.listings": [listing(L1)], "cares.pickup_crew": CREW}
    window = ("2026-08-29", "2026-10-09", 60)
    core = FakeCore(
        lambda t, p: (
            (p2_rows(4) if (p["from"], p["to"], p["slot_minutes"]) == window else []) if t.startswith("people.") else rows.get(t, [])
        )
    )
    event = Cloudevent.model_validate(
        {
            "specversion": "1.0", "id": "01920000-0000-7000-8000-0000000095f1", "time": "2026-10-10T10:00:00Z",
            "datacontenttype": "application/json", "tenantid": CTX.tenant_id, "munimrun": "h.p.s",
            "source": f"/tenants/{CTX.tenant_id}/cares",
            "type": PUBLISHED, "subject": L1, "data": {"listing_id": L1, "outlet_id": OUTLET, "kind": "donation"},
        }
    )  # fmt: skip
    report = asyncio.run(handle_event(event, CTX, core, frame(True, "restaurant"), CFG))
    assert report is not None and (len(cares_drafts(core)), report.packs) == (1, {"people": "ran"})


def test_the_task_draft_leaves_pass_the_free_digit_scan_too() -> None:
    (task,) = cares_drafts(people_sweep([listing(L1)], CREW))
    assert free_digits(task["payload"]) == []


# -- tools and models ---------------------------------------------------------------------------------------------------


def test_market_tools_carry_no_tenant_or_run_parameter_and_stay_under_the_cap() -> None:
    client = InternalClient(CTX, base_url="http://127.0.0.1:9", service_secret="x")
    tools = market.toolset(CTX, client, HandleTable({}), propose=True)
    names = sorted(t.name for t in tools)
    schemas = json.dumps([t.schema for t in tools])  # type: ignore[attr-defined]
    assert {"read_cares_listings", "read_cares_impact"} <= set(names) and len(names) <= 20
    assert not re.search(r'"(tenant_id|run_id|actor|actor_id)"', schemas)
    assert not any(n.endswith("cares_listing_publish") or "cares" in n and n.startswith("propose") for n in names)  # code-only draftable


def test_the_cares_mappings_never_touch_a_model() -> None:
    from munim_intel.watch.detectors.inventory_purchasing import expiry_risk
    from munim_intel.watch.detectors.people import overstaffed_slot

    for mod in (expiry_risk, overstaffed_slot):
        src = Path(str(mod.__file__)).read_text("utf8")
        assert not re.search(r"\b(llm|Llm|BaseLlm|generate|Runner|google\.adk)\b", src), mod.__name__
