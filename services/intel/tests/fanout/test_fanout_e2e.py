"""T-053 end to end: the real core-api on embedded Postgres (worldgen `restaurant_group`, as of the gate profile's day),
`POST /v1/ask` "why was this week bad?" as the owner, core's AskPort bridged to intel's real `/ask` app in-process
(T-082b's tests/manager/ask_stack.mts, run as is), recorded models. route.intent answers investigate; the Manager fans
out to four specialists; at least three answer, and the Manager merges them into one stored answer whose refs resolve.
Fails — never skips — without node.

Structure only (wg-1 is changing worldgen's values): how many branches ran, answered and were merged, that they ran in
parallel in the stored trace, and that every cited ref resolves — each value re-read from `evidence.snapshot` by SQL,
never through core's view or intel's code. The reads end on the gate profile's day (live legs post after it), so the
digests — part of each fixture key — hold still until worldgen changes; then re-record:
`uv run --frozen python tests/fanout/test_fanout_e2e.py --record` (seeds the world, a few minutes).
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import AsyncGenerator, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from google.adk.models import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from fanout_kit import READS, call
from munim_intel.app import create_app
from munim_intel.config import load_config
from munim_intel.decide.mimic import LlmMimic
from munim_intel.llm.recorded import RecordedLlm, request_key
from munim_intel.manager.ask import Models
from munim_intel.runtime.internal_client import SERVICE_SECRET_HEADER
from munim_intel.trace.price import Price

HERE = Path(__file__).resolve().parent
STACK = HERE.parent / "manager" / "ask_stack.mts"
DM = HERE / "fixtures" / "e2e" / "decide"
REASON = HERE / "fixtures" / "e2e" / "reason"
WORLD, DAYS = "restaurant_group", 100
QUESTION = "why was this week bad?"
BRIEF = "What hurt results in the week ending today?"
PACKS = ["catalogue", "people", "finance", "kitchen"]
#: The kit's reads, with this week's windows where its own would read another period: South's bank credits against UPI
#: takings (RG-F5) and the overprep logged this ISO week (RG-K3) — answer-key plants, so each read has rows.
E2E_READS = {
    **READS,
    "finance": (
        "read_finance_tender_vs_bank",
        {"from": "2026-10-04", "to": "2026-10-10", "method": "upi", "outlet_id": None, "page": 0},
        "Bank credits fell {§.r0.gap_minor} short of takings on {§.r0.business_on}.",
    ),
    "kitchen": (
        "read_kitchen_remakes_overprep",
        {"outlet_id": None, "week_start": "2026-10-05", "page": 0},
        "Station {§.r0.station} overprepared food worth {§.r0.overprep_minor} this week.",
    ),
}
CANONICAL = re.compile(r"⟨snap:([0-9a-f-]{36})·(\d+)·([a-z_][a-z0-9_]*)⟩")
_IDENTITY = re.compile(r'internal name is "([a-z_]+)"')
_SKILL = re.compile(r"^Skill ([a-z_]+):", re.M)


def _route(code: str, p: float) -> LlmResponse:
    def cand(t: str, q: float) -> types.LogprobsResultCandidate:
        return types.LogprobsResultCandidate(token=t, log_probability=math.log(q))

    top = [cand(code, p), cand("B", (1 - p) * 0.6), cand("A", (1 - p) * 0.4)]
    return LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text=code)]),
        logprobs_result=types.LogprobsResult(
            chosen_candidates=[cand(code, p)], top_candidates=[types.LogprobsResultTopCandidates(candidates=top)]
        ),
    )


def _responses(req: LlmRequest) -> list[dict[str, Any]]:
    return [p.function_response.response or {} for c in req.contents for p in c.parts or [] if p.function_response is not None]


def script(req: LlmRequest) -> LlmResponse:
    """The recorded run (SYNTHETIC replies). The Manager fans out, then merges the first segment of every report; a
    branch reads its one template (E2E_READS, windows ending on the profile's day) and cites row 0, or abstains
    insufficient_history on an empty read."""
    system = str(req.config.system_instruction or "")
    step = sum(1 for c in req.contents if c.role == "model")
    m = _IDENTITY.search(system)
    if m and m.group(1) == "munim_branch":
        pack = _SKILL.findall(system)[0]
        tool, args, cite = E2E_READS[pack]
        read = next((r for r in _responses(req) if "handle" in r), None)
        if read is None:
            return call(tool, args)
        if not read["rows"]:
            return call("report", {"segments": [], "abstain": "insufficient_history"})
        return call("report", {"segments": [{"text": cite.replace("§", read["handle"])}], "abstain": None})
    if step == 0:
        return call("fan_out", {"specialists": PACKS, "question": BRIEF})
    [fanned] = [r for r in _responses(req) if "reports" in r]
    segments = [{"text": r["segments"][0]} for r in fanned["reports"] if r["segments"]]
    return call("submit_answer", {"segments": segments, "abstain": None if segments else "insufficient_history"})


class Writer(BaseLlm):
    """Authoring only: answers from the script and writes each request's fixture (who sent it and the reply)."""

    model: str = "recorded"
    fixtures_dir: Path = REASON

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        step = _route("C", 0.87) if self.model == "recorded/router" else script(llm_request)
        key, canonical, _ = request_key(llm_request)
        body = {"request": json.loads(canonical), "responses": [step.model_dump(mode="json", exclude_none=True)]}
        self.fixtures_dir.mkdir(parents=True, exist_ok=True)
        (self.fixtures_dir / f"{key}.json").write_text(json.dumps(body, ensure_ascii=False, indent=1, sort_keys=True) + "\n", "utf8")
        yield step


#: R47 D1: a replay has no operator price; these carry one (typed by hand, paise per 1M tokens) so the run's spend is
#: money core's cap sums — every row ≥ 1 minor unit.
PRICE = Price(13_500, 67_500, "INR")


def recorded() -> Models:
    return Models(
        LlmMimic(RecordedLlm(model="recorded/router", fixtures_dir=DM, price=PRICE), adapter="recorded"),
        RecordedLlm(model="recorded/reason", fixtures_dir=REASON, price=PRICE),
    )


def writing() -> Models:
    return Models(LlmMimic(Writer(model="recorded/router", fixtures_dir=DM), adapter="recorded"), Writer(model="recorded/reason"))


class Bridge(httpx.AsyncBaseTransport):
    """intel's InternalClient → core-api's app in the stack, over the stack's pipe."""

    def __init__(self, stack: AskStack) -> None:
        self.stack = stack

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = (await request.aread()).decode() or None
        out = self.stack.call(
            "http", method=request.method, path=request.url.raw_path.decode(), headers=dict(request.headers.items()), body=body
        )
        return httpx.Response(out["status"], content=out["body"].encode(), headers={"content-type": "application/json"})


class AskStack:
    """ask_stack.mts as a subprocess; one reader serves every `intel_ask` it meets in place (calls nest strictly)."""

    def __init__(self, models: Models) -> None:
        node = shutil.which("node")
        assert node, "node is required: the T-053 end-to-end gate runs core-api's real /v1/ask"
        self.proc = subprocess.Popen(  # noqa: S603 — fixed argv of our own fixture
            [node, str(STACK), str(DAYS), WORLD], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8"
        )
        self.ready = self._read("ready")
        run_dir = Path(tempfile.mkdtemp(prefix="t053-run-"))
        (run_dir / "keys").mkdir()
        (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(self.ready["public_key_pem"])
        self.secret: str = self.ready["secret"]
        cfg = load_config(env={"MUNIM_RUN_DIR": str(run_dir), "MUNIM_SERVICE_SECRET": self.secret})

        async def models_of(*_: object) -> Models:
            return models

        self.intel = create_app(cfg, core_transport=Bridge(self), ask_models=models_of)
        self.intel_replies: list[tuple[int, str]] = []

    def _send(self, msg: dict[str, Any]) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def _read(self, key: str) -> Any:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            if not line.startswith("{"):
                continue
            msg = json.loads(line)
            if "intel_ask" in msg:
                self._serve(msg["intel_ask"])
            elif key in msg:
                return msg if key == "ready" else msg[key]
        raise AssertionError(f"ask_stack.mts exited ({self.proc.wait()}) before answering")

    def _serve(self, a: dict[str, Any]) -> None:
        async def post() -> tuple[int, str]:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.intel), base_url="http://intel") as c:
                headers = {"authorization": f"Bearer {a['token']}", SERVICE_SECRET_HEADER: self.secret}
                r = await c.post("/ask", json=a["body"], headers=headers)
                return r.status_code, r.text

        status, body = asyncio.run(post())
        self.intel_replies.append((status, body))
        self._send({"op": "intel_reply", "id": a["id"], "status": status, "body": body})

    def call(self, op: str, **args: Any) -> Any:
        self._send({"op": op, **args})
        return self._read("ok")

    def sql(self, q: str, *params: Any) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = self.call("sql", q=q, params=list(params))
        return rows

    def stop(self) -> None:
        if self.proc.poll() is None:
            self._send({"op": "stop"})
            self.proc.wait(timeout=60)
        assert self.proc.returncode == 0, f"ask_stack.mts exited {self.proc.returncode}"


@pytest.fixture(scope="module")
def stack() -> Iterator[AskStack]:
    s = AskStack(recorded())
    yield s
    s.stop()


def test_why_was_this_week_bad_fans_out_and_merges_at_least_three_branches_into_one_answer_whose_refs_resolve(
    stack: AskStack,
) -> None:
    out = stack.call("ask", persona="owner", question=QUESTION)
    assert out["status"] == 200, out["body"][:300]
    answer = json.loads(out["body"])["answer"]
    env = answer["envelope"]
    print("segments:", json.dumps(env["segments"], ensure_ascii=False, indent=1))
    assert env["abstained"] is False and env["reason_code"] is None

    [row] = stack.sql("SELECT a.run_id::text, a.question FROM intel.answer a WHERE a.id = $1::uuid", answer["answer_id"])
    assert row["question"] == QUESTION
    events = stack.sql("SELECT seq, actor, kind, payload FROM intel.trace_event WHERE run_id = $1::uuid ORDER BY seq", row["run_id"])
    [route] = [e["payload"] for e in events if e["kind"] == "route" and "path" in e["payload"]]
    assert route["intent"] == "investigate" and route["path"] == "fan_out"

    # ≥ 3 branches ran, in parallel (every branch started before any ended), labelled branch:<pack>.
    starts = {e["actor"]: e["seq"] for e in reversed(events) if e["actor"].startswith("branch:") and e["kind"] == "subagent_start"}
    ends = {e["actor"]: e["seq"] for e in events if e["actor"].startswith("branch:") and e["kind"] == "subagent_end"}
    print("branches:", {a: (starts[a], ends[a]) for a in starts})
    assert sorted(starts) == sorted(f"branch:{p}" for p in PACKS) and max(starts.values()) < min(ends.values())

    # W3 close ruling (R-E 1-C, money): one spend row per provider call, every branch's included, all in the run. By hand
    # from `script` above: route.intent 1; the Manager 2 (fan_out, then submit_answer); each of the 4 branches 2 (its
    # read, then report) = 11.
    spend = stack.sql("SELECT role, amount_minor::bigint AS amount FROM intel.intel_spend WHERE run_id = $1::uuid", row["run_id"])
    assert sorted(r["role"] for r in spend) == ["reason"] * 10 + ["router"] and all(int(r["amount"]) >= 1 for r in spend)

    # ≥ 3 merged into the one stored answer: each segment cites cells of a different branch's snapshot, every ref
    # resolves to the value the stored snapshot row holds (read back by SQL), and each snapshot was minted in this run.
    cited = [CANONICAL.findall(s["text"]) for s in env["segments"]]
    assert len(env["segments"]) >= 3 and all(cited)
    resolved = {r["ref"]: r["value"] for r in answer["resolved_refs"]}
    tokens = {m.group(0) for s in env["segments"] for m in CANONICAL.finditer(s["text"])}
    assert sorted(resolved) == sorted(tokens)
    snapshots: dict[str, str] = {}
    for tok in tokens:
        sid, i, col = CANONICAL.fullmatch(tok).groups()  # type: ignore[union-attr]
        [cell] = stack.sql(
            "SELECT rows -> $2::int -> $3::text AS v, template_id, run_id::text FROM evidence.snapshot WHERE id = $1::uuid",
            sid,
            int(i),
            col,
        )
        assert cell["v"] == resolved[tok] and cell["run_id"] == row["run_id"], tok
        snapshots[sid] = cell["template_id"]
    per_segment = [{sid for sid, _, _ in c} for c in cited]
    assert len(set().union(*per_segment)) >= 3 and len(set(snapshots.values())) >= 3, snapshots

    assert stack.intel_replies == [(200, json.dumps({"answer_id": answer["answer_id"], "tainted": False}, separators=(",", ":")))]
    assert stack.sql("SELECT count(*)::int AS n FROM core.draft WHERE source LIKE 'intel:%'") == [{"n": 0}]


def record() -> None:
    for d in (DM, REASON):
        shutil.rmtree(d, ignore_errors=True)
    s = AskStack(writing())
    try:
        out = s.call("ask", persona="owner", question=QUESTION)
        print(out["status"], out["body"][:600])
    finally:
        s.stop()


if __name__ == "__main__" and sys.argv[1:] == ["--record"]:
    record()
