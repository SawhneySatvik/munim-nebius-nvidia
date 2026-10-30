"""The daily brief wired end to end: intel's real `/watch:sweep` then `/brief` (FastAPI app, recorded model, template
wording) against the real core-api on embedded Postgres, the restaurant_group world seeded through the API (14-day profile,
as of 2026-10-10). Fails — never skips — without node.

Expected values are independent of the code under test: the hand-kept ranking
(services/core-api/src/modules/inbox/ranking.restaurant_group.hand.json — impacts from the worldgen answer key, severities
from the IN pack ladder worked by hand there) and the answer key's own impacts. Nothing here is read back from ranking.ts.
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "watch"))
from stack import Bridge, Stack  # noqa: E402

from conftest import REPO  # noqa: E402
from munim_intel.app import create_app  # noqa: E402
from munim_intel.config import Config, load_config  # noqa: E402
from munim_intel.runtime.context import RunContext  # noqa: E402
from munim_intel.watch.frame import Frame  # noqa: E402

WORLD = "restaurant_group"
#: tools/worldgen/test/profile.ts: the gate profile (fixed outlet-local "today" 2026-10-10, 100 days of history). The hand
#: ranking's keys exist at this profile only: at 14 days the lapsed regulars of RG-G4 cannot lapse.
DAYS = 100
#: urgency_bp = the severity's weight (age 0: the findings were written by this very sweep). ranking.ts's own table is not
#: imported: this is the hand data's formula, written out again (hand file `_note`).
URGENCY = {"low": 10_000, "medium": 15_000, "high": 20_000, "critical": 30_000}
HAND = json.loads((REPO / "services/core-api/src/modules/inbox/ranking.restaurant_group.hand.json").read_text("utf8"))
SNAP = re.compile(r"⟨snap:([0-9a-f-]{36})·(\d+)·([a-z_][a-z0-9_]*)⟩")
DESK = {"Customers": "customers", "People": "people", "Finance": "finance", "Inventory and purchasing": "inventory_purchasing"}


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(DAYS, [WORLD])
    yield s
    s.stop()


def client_for(stack: Stack, run_dir: Path) -> TestClient:
    (run_dir / "keys").mkdir(parents=True, exist_ok=True)
    (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(stack.ready["public_key_pem"])
    (run_dir / "service-secret").write_text(stack.ready["secret"] + "\n")
    cfg: Config = load_config(env={"MUNIM_RUN_DIR": str(run_dir)})

    async def frame_source(ctx: RunContext) -> Frame | None:
        return stack.frame(WORLD, "template")  # template wording: the gate judges code-ranked, code-worded text

    return TestClient(create_app(cfg, core_transport=Bridge(stack), frame_source=frame_source))


def post(stack: Stack, client: TestClient, path: str, trigger: str) -> Any:
    t = stack.call("token", world=WORLD, trigger=trigger, scope=["*"])
    return client.post(path, headers={"x-munim-service-secret": stack.ready["secret"], "authorization": f"Bearer {t['token']}"})


@pytest.fixture(scope="module")
def run(stack: Stack, tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    """One sweep, then one /brief, then core's own read of the ranking (same code path /brief used, a fresh brief token)."""
    client = client_for(stack, tmp_path_factory.mktemp("run"))
    tenant = stack.tenants[WORLD]
    swept = post(stack, client, "/watch:sweep", "watch_sweep")
    assert swept.status_code == 202 and swept.json()["status"] == "done", swept.text
    findings = stack.sql(
        "SELECT f.id::text, f.pack, f.type, f.severity, f.confidence_bp, f.dedupe_key,"
        " (s.rows -> f.impact_row ->> f.impact_column)::bigint AS impact"
        " FROM intel.finding f JOIN evidence.snapshot s ON s.tenant_id = f.tenant_id AND s.id = f.impact_snapshot_id"
        " WHERE f.tenant_id = $1 AND f.status = 'open'",
        tenant,
    )
    brief = post(stack, client, "/brief", "brief")
    assert brief.status_code == 202, brief.text
    tok = stack.call("token", world=WORLD, trigger="brief", scope=["*"])["token"]
    read = stack.call(
        "http",
        method="GET",
        path="/internal/intel/v1/brief-items",
        headers={"authorization": f"Bearer {tok}", "x-munim-service-secret": stack.ready["secret"]},
        body=None,
    )
    assert read["status"] == 200
    return {"tenant": tenant, "findings": findings, "brief": brief.json(), "read": read["body"], "items": json.loads(read["body"])["items"]}


def cell(stack: Stack, tenant: str, ref: str) -> str:
    sid, row, col = SNAP.findall(ref)[0]
    v = stack.sql(
        "SELECT (rows -> $2::int ->> $3) AS v FROM evidence.snapshot WHERE tenant_id = $1 AND id = $4::uuid", tenant, int(row), col, sid
    )
    if len(v) != 1 or v[0]["v"] is None:
        # Not an AssertionError: the top-five xfail admits AssertionError only, so a missing cell must fail it outright.
        raise LookupError(f"no cell for {ref}")
    return str(v[0]["v"])


def stored_brief(stack: Stack, run: dict[str, Any]) -> list[dict[str, Any]]:
    answers = stack.sql(
        "SELECT abstained, envelope FROM intel.answer WHERE tenant_id = $1 AND question = $2", run["tenant"], "What needs me today?"
    )
    assert [a["abstained"] for a in answers] == [False]  # exactly one stored brief answer, not abstained
    segments: list[dict[str, Any]] = answers[0]["envelope"]["segments"]
    return segments


def test_sweep_then_brief_stores_one_answer_with_resolving_refs_and_no_dedupe_key(stack: Stack, run: dict[str, Any]) -> None:
    assert run["brief"]["posted"] is True and run["brief"]["abstained"] is False
    assert len(run["findings"]) > 10  # the sweep really found things (a positive count, not an empty world)
    segments = stored_brief(stack, run)
    assert len(segments) == 5
    for seg in segments:
        cells = SNAP.findall(seg["text"])
        assert cells, seg["text"]
        for ref in SNAP.finditer(seg["text"]):
            cell(stack, run["tenant"], ref.group(0))  # the snapshot and the cell it names exist in this tenant
    # No dedupe key in what core handed intel, nor in what was stored (they hold weeks and dates; review R-B).
    stored = json.dumps(segments, ensure_ascii=False)
    for f in run["findings"]:
        assert f["dedupe_key"] not in run["read"]
        assert f["dedupe_key"] not in stored
    assert "dedupe" not in run["read"]


def test_the_brief_is_the_top_five_by_impact_x_confidence_x_urgency_worked_out_again_from_the_rows(
    stack: Stack, run: dict[str, Any]
) -> None:
    """The independent check on ranking order: the formula applied in Python to the findings' own SQL rows (dedupe: the
    highest score per key), not to anything ranking.ts returned."""

    def score(f: dict[str, Any]) -> int:
        return abs(int(f["impact"] or 0)) * int(f["confidence_bp"]) * URGENCY[f["severity"]]

    best: dict[str, int] = {}
    for f in run["findings"]:
        best[f["dedupe_key"]] = max(score(f), best.get(f["dedupe_key"], 0))
    want = sorted(best.values(), reverse=True)[:5]
    by_id = {f["id"]: f for f in run["findings"]}
    # By score, not by id: two findings can tie at the cut (RG-A1's temp_excursion and its waste_spike, both 448,000 high),
    # and the tie-break (severity, older, id) is not part of this formula.
    assert [score(by_id[i["finding_id"]]) for i in run["items"][:5]] == want
    assert len(set(want)) >= 4
    assert len({i["finding_id"] for i in run["items"]}) == len(run["items"])  # one item per finding
    assert len({by_id[i["finding_id"]]["dedupe_key"] for i in run["items"]}) == len(run["items"])  # and per dedupe key
    segments = stored_brief(stack, run)
    for seg, item in zip(segments, run["items"][:5], strict=True):
        assert item["impact_ref"] in seg["text"] or item["texts"][0].strip() in seg["text"], (seg["text"], item["texts"])


def hand_ids(items: list[dict[str, Any]], impact_of: Callable[[str], int]) -> list[str]:
    """The hand-data id of each of the top five items, matched by (pack, impact); an item the hand data lacks names itself."""
    by_impact = {(r["pack"], r["impact_minor"]): r["id"] for r in HAND["rows"] if r["impact_minor"] is not None}
    got = []
    for i in items[:5]:
        impact = impact_of(i["impact_ref"])
        got.append(by_impact.get((i["pack"], impact), f"extra:{i['type']}:{impact}:{i['severity']}"))
    print("brief top 5 against the hand data:", got, "hand:", HAND["top5"])
    return got


@pytest.mark.xfail(
    strict=True,
    raises=AssertionError,  # R-D 5: only the comparison may fail here; a crash in the stack or the mapping is a real red
    reason=(
        "W3 close (fx-packs): the hand data's inputs disagree with the pack docs, not the detectors. Hand top 5 = G4, P3, F5, "
        "F7, I3 (key impacts, severity = ladder). Actual: P3; G4 at pack section 10's 90-day spend / 3 (the six plants' 1,075,200 "
        "plus two unplanted at-risk customers = 1,357,440, not the key's window spend 3,225,600), so below P3; F4+F7 as one "
        "missing_payout of 898,800 (accept.json); price_creep 844,800 = paneer 6 x 20 kg x (39,040 - 32,000), RG-C1/C1b's `also` "
        "the hand data leaves out; A1 temp_excursion 448,000 `high` as pack section 4 and section 10 A1 say (the hand file's "
        "ladder-only severity is wrong), tied at rank 5 with its 448,000 waste_spike (a tie the hand file does not list). F5 is "
        "three weekly findings by design (accept.json all_of). Owners: the hand file (core-api inbox) for all but G4; G4's cell "
        "also needs worldgen background customers that do not lapse (no one can type 1,357,440 from the key). strict: when both "
        "land this XPASSes and fails, and the mark goes."
    ),
)
def test_the_top_five_is_the_hand_ranking(stack: Stack, run: dict[str, Any]) -> None:
    assert hand_ids(run["items"], lambda ref: int(cell(stack, run["tenant"], ref))) == HAND["top5"]


def test_the_hand_ranking_gate_can_pass(stack: Stack, run: dict[str, Any]) -> None:
    """The pair for the xfail above: the comparison itself accepts when the data agrees. Items shaped as core hands them
    (pack, type, severity, impact_ref), built from the hand top five's own rows, go through the same `hand_ids` path —
    the impact read swapped for the hand impact behind each ref — and give the hand top 5 back."""
    rows = {r["id"]: r for r in HAND["rows"]}
    items = [{"pack": rows[i]["pack"], "type": "hand", "severity": "hand", "impact_ref": f"hand:{i}"} for i in HAND["top5"]]
    assert hand_ids(items, lambda ref: int(rows[ref.removeprefix("hand:")]["impact_minor"])) == HAND["top5"]
