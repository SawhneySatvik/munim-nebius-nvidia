"""T-043 end to end: intel's real `/events` and `/watch:sweep` (FastAPI app, recorded model) against the real core-api
internal API on embedded Postgres, with the four worldgen worlds seeded through the API (14-day profile, as of
2026-10-10). Fails — never skips — without node.

Expected values are independent of the code under test: plant ids, locations and ₹ come from the hand-kept answer keys
(tools/worldgen/answer-key/*.json, `impact_minor` and `where`); severities from the pack ladder **L** worked by hand
below; counts are hand counts. The tests run in file order and share one seeded stack.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from stack import Bridge, Stack

from conftest import REPO
from munim_intel.app import create_app
from munim_intel.config import Config, load_config
from munim_intel.detect import REGISTRY
from munim_intel.llm.recorded import RecordedLlm
from munim_intel.runtime.context import RunContext, load_public_key, verify_run_token
from munim_intel.watch.frame import Frame, Narration, core_frame_source
from munim_intel.watch.pipeline import detectors_for

WORLDS = ["store", "restaurant_group", "cloud_kitchen", "au_outlet"]
MONTH = "2026-10"

# (answer-key id, world, detector, specialist, outlet alias, channel kind | item alias, severity by hand)
#   RG-F1 55,000 paise: L = low (< ₹2,000), ads never opted in → at least high.
#   RG-F2 320,000: L = medium (≥ ₹2,000, < ₹10,000); opted in → medium.
#   CK-F1 40,000: low → not opted in → high.        CK-F2 220,000: medium, opted in.
#   AU-F1 17,500 cents: AU ladder medium (≥ A$40, < A$200) → not opted in → high.
#   ST-C4: above MRP is always critical.
PLANTS = [
    ("RG-F1", "restaurant_group", "finance.unapproved_ad_fee", "finance", "outlet:1", "aggregator:swiggy", "high"),
    ("RG-F2", "restaurant_group", "finance.unapproved_ad_fee", "finance", "outlet:2", "aggregator:zomato", "medium"),
    ("CK-F1", "cloud_kitchen", "finance.unapproved_ad_fee", "finance", "outlet:1", "aggregator:zomato", "high"),
    ("CK-F2", "cloud_kitchen", "finance.unapproved_ad_fee", "finance", "outlet:1", "aggregator:swiggy", "medium"),
    ("AU-F1", "au_outlet", "finance.unapproved_ad_fee", "finance", "outlet:1", "aggregator:ubereats", "high"),
    ("ST-C4", "store", "catalogue.above_mrp", "catalogue", "outlet:1", "item:biscuit_pack", "critical"),
]
OWNER = {"finance.unapproved_ad_fee": "finance", "catalogue.above_mrp": "catalogue"}
TYPE = {"finance.unapproved_ad_fee": "reconciliation_break.unapproved_ad_fee", "catalogue.above_mrp": "catalogue.above_mrp"}

FINDINGS = """SELECT f.tenant_id::text, f.id::text, f.pack, f.type, f.severity, f.outlet_ids::text[] AS outlet_ids, f.dedupe_key,
                     f.confidence_bp, f.envelope, (s.rows -> f.impact_row ->> f.impact_column)::bigint AS impact
                FROM intel.finding f JOIN evidence.snapshot s ON s.tenant_id = f.tenant_id AND s.id = f.impact_snapshot_id
               ORDER BY f.dedupe_key"""
DRAFTS = """SELECT d.id::text, d.source, d.command_type, d.status, d.finding_id::text, d.command_payload, d.outlet_ids::text[] AS outlet_ids
              FROM core.draft d WHERE d.source LIKE 'intel:%' ORDER BY d.id"""


def answer_key(plant: str) -> dict[str, Any]:
    world = {"RG": "restaurant_group", "CK": "cloud_kitchen", "ST": "store", "AU": "au_outlet"}[plant[:2]]
    key = json.loads((REPO / "tools" / "worldgen" / "answer-key" / f"{world}.json").read_text("utf8"))
    entry: dict[str, Any] = next(p for p in key["problems"] if p["id"] == plant)
    return entry


@pytest.fixture(scope="module", autouse=True)
def reference_detectors_only() -> Iterator[None]:
    """These gates count the two reference detectors' findings, drafts and model calls by hand. The pack lanes register
    more detectors, and collecting their tests imports them, so sweeps in this module run only the two reference ones."""
    detectors_for(None)  # registers every detector package
    saved = {pack: list(specs) for pack, specs in REGISTRY.items()}
    for pack in list(REGISTRY):
        REGISTRY[pack] = [s for s in saved[pack] if s.id in OWNER]
        if not REGISTRY[pack]:
            del REGISTRY[pack]
    yield
    REGISTRY.clear()
    REGISTRY.update(saved)


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(14, WORLDS)
    yield s
    s.stop()


class Harness:
    def __init__(self, stack: Stack, run_dir: Path) -> None:
        self.stack = stack
        (run_dir / "keys").mkdir(parents=True, exist_ok=True)
        (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(stack.ready["public_key_pem"])
        (run_dir / "service-secret").write_text(stack.ready["secret"] + "\n")
        self.cfg: Config = load_config(env={"MUNIM_RUN_DIR": str(run_dir)})
        self.narration: dict[str, Narration] = {w: "template" for w in WORLDS}
        self.frames: dict[str, Frame] = {}

        async def frame_source(ctx: RunContext) -> Frame | None:
            world = stack.world_of[ctx.tenant_id]
            return stack.frame(world, self.narration[world])

        self.client = TestClient(create_app(self.cfg, core_transport=Bridge(stack), frame_source=frame_source))

    def sweep(self, world: str) -> dict[str, Any]:
        t = self.stack.call("token", world=world, trigger="watch_sweep", scope=["*"])
        r = self.client.post(
            "/watch:sweep", headers={"x-munim-service-secret": self.stack.ready["secret"], "authorization": f"Bearer {t['token']}"}
        )
        assert r.status_code == 202, r.text
        body: dict[str, Any] = r.json()
        return body

    def deliver(self, event: dict[str, Any]) -> None:
        r = self.client.post("/events", json=[event], headers={"x-munim-service-secret": self.stack.ready["secret"]})
        assert (r.status_code, r.json()) == (202, {"accepted": 1}), r.text

    def id(self, world: str, key: str) -> str:
        if key.startswith("aggregator:"):
            rows = self.stack.sql("SELECT id::text FROM core.channel WHERE tenant_id = $1 AND kind = $2", self.stack.tenants[world], key)
            assert len(rows) == 1
            return str(rows[0]["id"])
        return str(self.stack.call("id", world=world, key=key))

    def findings(self) -> list[dict[str, Any]]:
        return self.stack.sql(FINDINGS)

    def count(self, q: str, *params: Any) -> int:
        return int(self.stack.sql(f"SELECT count(*)::int AS n FROM ({q}) x", *params)[0]["n"])  # noqa: S608 — the tests' own SQL


@pytest.fixture(scope="module")
def h(stack: Stack, tmp_path_factory: pytest.TempPathFactory) -> Harness:
    return Harness(stack, tmp_path_factory.mktemp("run"))


def test_three_deliveries_of_one_event_make_one_claim_one_detector_run_one_finding(h: Harness) -> None:
    """04 §11 event dedupe. The finding merge alone would also leave one row, so the gate counts what only the claim
    controls: event claims, snapshots minted by event runs, and model calls (the store narrates critical findings)."""
    h.narration["store"] = "model"
    outlet = h.id("store", "outlet:1")
    event = h.stack.call("event", world="store", type="munim.inventory.movement.recorded.v1", outlet=outlet)
    calls = RecordedLlm.calls
    for _ in range(3):
        h.deliver(event)
    tenant = h.stack.tenants["store"]
    claims = h.count("SELECT 1 FROM intel.event_claim WHERE tenant_id = $1 AND event_id = $2", tenant, event["id"])
    minted = h.count(
        """SELECT 1 FROM evidence.snapshot s JOIN intel.run r ON r.tenant_id = s.tenant_id AND r.id = s.run_id
            WHERE s.tenant_id = $1 AND r.trigger = 'event'""",
        tenant,
    )
    findings = [f for f in h.findings() if f["tenant_id"] == tenant]
    print(
        "claims:",
        claims,
        "event snapshots:",
        minted,
        "findings:",
        [(f["type"], f["severity"]) for f in findings],
        "model calls:",
        RecordedLlm.calls - calls,
    )
    assert (claims, minted, len(findings), RecordedLlm.calls - calls) == (1, 1, 1, 1)


def test_a_free_digit_in_narration_is_abstained_and_the_template_stays(h: Harness) -> None:
    """The store's critical finding was narrated by the recorded model with a typed figure: core's number grammar
    refused it, so the stored envelope is still the template (refs only), and the abstention is traced."""
    tenant = h.stack.tenants["store"]
    (f,) = [f for f in h.findings() if f["tenant_id"] == tenant]
    abstains = h.stack.sql(
        """SELECT t.payload FROM intel.trace_event t JOIN intel.run r ON r.tenant_id = t.tenant_id AND r.id = t.run_id
            WHERE t.tenant_id = $1 AND r.trigger = 'event' AND t.kind = 'abstain'""",
        tenant,
    )
    print("envelope:", f["envelope"], "abstains:", abstains)
    assert f["envelope"]["abstained"] is False and f["envelope"]["segments"][0]["text"].startswith("This item's shelf price is above")
    assert [a["payload"] for a in abstains] == [{"detector": "catalogue.above_mrp", "reason": "number_grammar"}]


def test_sweeps_find_the_answer_key_plants_of_both_reference_detectors(h: Harness) -> None:
    h.narration["restaurant_group"] = "model"  # RG-F1 is high: narrated; CK-F1 and AU-F1 are high too, narration off.
    calls = RecordedLlm.calls
    reports = {w: h.sweep(w) for w in WORLDS}
    print("reports:", json.dumps(reports, sort_keys=True))
    assert RecordedLlm.calls - calls == 1, "exactly one model narration (RG-F1); CK-F1 and AU-F1 narrate by template"
    # W3 close ruling (money): that one call is one spend row, posted by the sweep's own run (app.watch builds the meter).
    spend = h.stack.sql(
        "SELECT role, currency, amount_minor::bigint AS amount, input_tokens FROM intel.intel_spend WHERE tenant_id = $1",
        h.stack.tenants["restaurant_group"],
    )
    # Recorded: no operator price (R47 D1) → charged 0, posted with its tokens.
    assert [(r["role"], r["currency"], int(r["amount"])) for r in spend] == [("narrate", "INR", 0)] and spend[0]["input_tokens"] > 0
    got = {(f["tenant_id"], f["dedupe_key"]): f for f in h.findings()}
    want = set()
    for plant, world, detector, pack, outlet_alias, what, severity in PLANTS:
        tenant, outlet, target = h.stack.tenants[world], h.id(world, outlet_alias), h.id(world, what)
        key = f"{detector}:{outlet}:{target}:{MONTH}" if pack == "finance" else f"{detector}:{outlet}:{target}"
        want.add((tenant, key))
        f = got.get((tenant, key))
        assert f is not None, f"{plant} not found"
        assert (f["pack"], f["type"], f["severity"], int(f["impact"])) == (
            pack,
            TYPE[detector],
            severity,
            answer_key(plant)["impact_minor"],
        ), plant
        assert f["confidence_bp"] == 10_000, f"{plant}: packs/{pack}.md names no coverage cell (hand list) → full"
    assert set(got) == want, f"false alarms: {sorted(set(got) - want)}"


def test_model_narration_of_a_high_finding_passes_the_validator_and_narration_off_makes_no_call(h: Harness) -> None:
    by_plant = {}
    for plant, world, detector, _, outlet_alias, what, _ in PLANTS:
        key = f"{detector}:{h.id(world, outlet_alias)}:{h.id(world, what)}"
        by_plant[plant] = next(f for f in h.findings() if f["dedupe_key"].startswith(key))
    narrated = by_plant["RG-F1"]["envelope"]["segments"][0]["text"]
    templated = {p: by_plant[p]["envelope"]["segments"][0]["text"] for p in ("CK-F1", "AU-F1", "RG-F2")}
    print("RG-F1:", narrated, "\ntemplates:", templated)
    assert not narrated.startswith("This channel charged ad and promotion fees"), "RG-F1 still carries the template"
    assert "⟨snap:" in narrated and by_plant["RG-F1"]["envelope"]["abstained"] is False
    assert all(t.startswith("This channel charged ad and promotion fees") for t in templated.values())


def test_a_tenant_wide_sweep_files_each_finding_under_its_own_outlet(h: Harness) -> None:
    """T-040 note a. A sweep's run token is `*`; each detector mints per outlet, and the finding (with its impact
    snapshot) belongs to that outlet, so the outlet's own manager sees it — not only all-outlet members. Needs the
    core-api change filed by T-043 (internal snapshots + findings): red on T-040's core, where `outlet_ids` = {}."""
    rows = h.stack.sql(
        """SELECT f.tenant_id::text, f.id::text, f.dedupe_key, f.outlet_ids::text[] AS outlet_ids, s.outlet_scope
             FROM intel.finding f JOIN evidence.snapshot s ON s.tenant_id = f.tenant_id AND s.id = f.impact_snapshot_id"""
    )
    wrong = []
    for plant, world, detector, _, outlet_alias, what, _ in PLANTS:
        outlet = h.id(world, outlet_alias)
        (f,) = [
            r
            for r in rows
            if r["tenant_id"] == h.stack.tenants[world] and r["dedupe_key"].startswith(f"{detector}:{outlet}:{h.id(world, what)}")
        ]
        seen = h.stack.call("visible", world=world, outlet=outlet)
        if (f["outlet_ids"], f["outlet_scope"], f["id"] in seen) != ([outlet], [outlet], True):
            wrong.append((plant, f["outlet_ids"], f["outlet_scope"], f["id"] in seen))
    print("not filed under their outlet:", wrong)
    assert wrong == []


def test_every_finding_and_draft_carries_its_specialist(h: Harness) -> None:
    findings, drafts = h.findings(), h.stack.sql(DRAFTS)
    by_id = {f["id"]: f for f in findings}
    detector_of = {v: k for k, v in TYPE.items()}
    wrong_f = [f["id"] for f in findings if f["pack"] != OWNER[detector_of[f["type"]]]]
    wrong_d = [d["id"] for d in drafts if d["finding_id"] not in by_id or d["source"] != f"intel:{by_id[d['finding_id']]['pack']}"]
    actors = h.stack.sql(
        """SELECT DISTINCT t.actor FROM intel.trace_event t JOIN intel.run r ON r.tenant_id = t.tenant_id AND r.id = t.run_id
            WHERE r.trigger IN ('event', 'watch_sweep')"""
    )
    print("findings:", len(findings), "drafts:", len(drafts), "actors:", sorted(a["actor"] for a in actors))
    # Hand count: 6 plants → 6 findings; the 5 finance ones each get a dispute draft (pack §6), above-MRP none.
    assert (len(findings), len(drafts), wrong_f, wrong_d) == (6, 5, [], [])
    assert {a["actor"] for a in actors} == {"watcher:finance", "watcher:catalogue"}
    for d in drafts:
        f = by_id[d["finding_id"]]
        p = d["command_payload"]
        assert (d["command_type"], d["status"], p["basis"], p["lines"]) == ("finance.dispute.draft.v1", "proposed", "unapproved_ad_fee", [])
        # The claimed total is the finding's own impact cell, by ref — never a typed number.
        assert p["total_claimed_minor"] == f["envelope"]["impact_ref"] and p["total_claimed_minor"].endswith("·unapproved_minor⟩")


def test_a_re_detection_merges_with_zero_new_rows(h: Harness) -> None:
    intel_drafts = "SELECT 1 FROM core.draft WHERE source LIKE 'intel:%'"
    before = (h.count("SELECT 1 FROM intel.finding"), h.count(intel_drafts))
    h.narration["restaurant_group"] = "template"
    reports = {w: h.sweep(w) for w in WORLDS}
    after = (h.count("SELECT 1 FROM intel.finding"), h.count(intel_drafts))
    merged = sum(r["findings"].get("merged", 0) for r in reports.values())
    recorded = sum(r["drafts"].get("recorded", 0) for r in reports.values())
    print("before:", before, "after:", after, "merged:", merged, "drafts already recorded:", recorded)
    assert before == (6, 5) and after == before
    assert (merged, recorded) == (6, 5)


def test_core_run_frame_is_the_default_source_and_a_sweep_runs_on_it(h: Harness) -> None:
    """T-040b: with no frame_source the app reads core's run-frame. For every world it equals the stack's hand-built
    frame (the tenant's pack document from SQL, outlets by id, business date = the profile's AS_OF; worldgen sets no
    operator budget → template; the kill switch is on, 0002's seed, so `ai_enabled`, T-127), and a sweep through it is
    `done` — no longer `frame_unavailable` — re-finding the store's one plant (ST-C4) as a merge."""
    source = core_frame_source(h.cfg, Bridge(h.stack))
    for world in WORLDS:
        t = h.stack.call("token", world=world, trigger="watch_sweep", scope=["*"])
        ctx = verify_run_token(t["token"], load_public_key(h.cfg.run_token_public_key_pem()))

        async def served(c: RunContext = ctx) -> Frame | None:
            return await source(c)

        assert asyncio.run(served()) == replace(h.stack.frame(world, "template"), ai_enabled=True), world
    client = TestClient(create_app(h.cfg, core_transport=Bridge(h.stack)))
    t = h.stack.call("token", world="store", trigger="watch_sweep", scope=["*"])
    r = client.post("/watch:sweep", headers={"x-munim-service-secret": h.stack.ready["secret"], "authorization": f"Bearer {t['token']}"})
    body = r.json()
    print("sweep through core's frame:", body)
    assert (r.status_code, body["status"], body["findings"].get("merged", 0)) == (202, "done", 1)
