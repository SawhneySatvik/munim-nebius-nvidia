"""T-082b end to end: the real core-api on embedded Postgres (worldgen `store`, 7 days, as of the gate profile's day),
`POST /v1/ask` as the owner, core's AskPort bridged to intel's real `/ask` app in-process (ask_stack.mts), recorded
models. One ask, "@Finance …": a stored turn signed by core as Finance via the Manager, with every cited ref resolving
to its snapshot cell. Fails — never skips — without node.

Expected values never come from the code under test: the signature is the T-088a contract's i18n pair for finance;
each resolved value is re-read from `evidence.snapshot` by SQL; the actor label is ledger F8's `specialist:finance`.
Fixtures: `uv run --frozen python tests/manager/test_manager_e2e.py --record` (seeds the world, ~1 min).
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

from munim_intel.app import create_app
from munim_intel.config import load_config
from munim_intel.decide.mimic import LlmMimic
from munim_intel.llm.recorded import RecordedLlm, request_key
from munim_intel.manager.ask import Models
from munim_intel.runtime.internal_client import SERVICE_SECRET_HEADER
from munim_intel.trace.price import Price

HERE = Path(__file__).resolve().parent
DM = HERE / "fixtures" / "e2e" / "decide"
REASON = HERE / "fixtures" / "e2e" / "reason"
WORLD, DAYS = "store", 7
QUESTION = "@Finance what did each outlet make last month?"
#: Hand: the T-088a contract's signature for an ask addressed to finance.
SIGNATURE = {"key": "answer.signature.via_manager", "specialist": "finance", "name_key": "specialist.finance.name"}
CANONICAL = re.compile(r"⟨[^⟩]*⟩")


def _call(name: str, args: dict[str, Any]) -> LlmResponse:
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(function_call=types.FunctionCall(name=name, args=args))]))


def _route(code: str, p: float) -> LlmResponse:
    def cand(t: str, q: float) -> types.LogprobsResultCandidate:
        return types.LogprobsResultCandidate(token=t, log_probability=math.log(q))

    top = [cand(code, p), cand("B", (1 - p) * 0.6), cand("C", (1 - p) * 0.4)]
    return LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text=code)]),
        logprobs_result=types.LogprobsResult(
            chosen_candidates=[cand(code, p)], top_candidates=[types.LogprobsResultTopCandidates(candidates=top)]
        ),
    )


#: The recorded run (SYNTHETIC model replies): route.intent answers lookup (code A); the Manager reads last month's P&L
#: by outlet and cites two cells of its first row. Last month, because worldgen's live legs post at the wall clock
#: (entry dates after AS_OF): September holds dated history only, so the digest — part of the fixture key — never moves.
ROUTE_SCRIPT = [_route("A", 0.9)]
REASON_SCRIPT = [
    _call("read_finance_pnl", {"group_by": "outlet", "period_month": "2026-09-01", "page": 0}),
    _call(
        "submit_answer",
        {"segments": [{"text": "Last month's net was {S1.r0.net_minor} on revenue of {S1.r0.revenue_minor}."}], "abstain": None},
    ),
]


class Writer(BaseLlm):
    """Authoring only: answers from the script and writes each request's fixture."""

    model: str = "recorded"
    fixtures_dir: Path = REASON
    steps: list[LlmResponse] = []

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        step = self.steps.pop(0)
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
    router = Writer(model="recorded/router", fixtures_dir=DM, steps=[s.model_copy(deep=True) for s in ROUTE_SCRIPT])
    reason = Writer(model="recorded/reason", fixtures_dir=REASON, steps=[s.model_copy(deep=True) for s in REASON_SCRIPT])
    return Models(LlmMimic(router, adapter="recorded"), reason)


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
    """ask_stack.mts as a subprocess. Calls nest strictly (an ask → intel → core callbacks), so one reader serves
    every `intel_ask` it meets in place, then keeps waiting for the answer it was reading for."""

    def __init__(self, models: Models) -> None:
        node = shutil.which("node")
        assert node, "node is required: the T-082b end-to-end gate runs core-api's real /v1/ask"
        self.proc = subprocess.Popen(  # noqa: S603 — fixed argv of our own fixture
            [node, str(HERE / "ask_stack.mts"), str(DAYS), WORLD],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self.ready = self._read("ready")
        run_dir = Path(tempfile.mkdtemp(prefix="t082b-run-"))
        (run_dir / "keys").mkdir()
        (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(self.ready["public_key_pem"])
        self.secret: str = self.ready["secret"]
        cfg = load_config(env={"MUNIM_RUN_DIR": str(run_dir), "MUNIM_SERVICE_SECRET": self.secret})

        async def models_of(*_: object) -> Models:
            return models

        self.intel = create_app(cfg, core_transport=Bridge(self), ask_models=models_of)
        #: Every /ask response intel gave core: (status, body).
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


def test_an_addressed_ask_through_real_core_is_a_stored_turn_signed_finance_via_manager_with_resolving_refs(stack: AskStack) -> None:
    out = stack.call("ask", persona="owner", question=QUESTION)
    assert out["status"] == 200, out["body"][:300]
    body = json.loads(out["body"])
    answer, turn = body["answer"], body["turn"]
    print("turn:", turn, "\nsignature:", answer["signature"], "\nsegments:", answer["envelope"]["segments"])
    assert turn["addressed_to"] == "finance" and turn["turn_no"] == 1 and turn["tainted"] is False
    assert answer["signature"] == SIGNATURE
    env = answer["envelope"]
    assert env["abstained"] is False and env["reason_code"] is None and len(env["segments"]) == 1

    # Every cited ref resolves, to the value the snapshot row holds (read back by SQL, not by core's view).
    tokens = sorted({t for s in env["segments"] for t in CANONICAL.findall(s["text"])})
    resolved = {r["ref"]: r["value"] for r in answer["resolved_refs"]}
    assert len(tokens) == 2 and sorted(resolved) == tokens
    for tok in tokens:
        sid, row, col = tok[len("⟨snap:") : -1].split("·")
        [cell] = stack.sql("SELECT rows -> $2::int -> $3::text AS v FROM evidence.snapshot WHERE id = $1::uuid", sid, int(row), col)
        assert cell["v"] == resolved[tok], tok

    # The stored turn and answer: the member's question unchanged, under core's answer id; intel answered id + taint only.
    [row] = stack.sql(
        """SELECT t.addressed_to, t.tainted, a.question, a.abstained, a.run_id::text FROM core.ai_thread_turn t
             JOIN intel.answer a ON a.tenant_id = t.tenant_id AND a.id = t.answer_id WHERE t.id = $1::uuid""",
        turn["turn_id"],
    )
    assert row["addressed_to"] == "finance" and row["question"] == QUESTION and row["abstained"] is False
    assert stack.intel_replies == [(200, json.dumps({"answer_id": answer["answer_id"], "tainted": False}, separators=(",", ":")))]

    # The run's traces carry the specialist (F8), and the run proposed nothing.
    actors = stack.sql("SELECT DISTINCT actor FROM intel.trace_event WHERE run_id = $1::uuid", row["run_id"])
    kinds = {r["kind"] for r in stack.sql("SELECT kind FROM intel.trace_event WHERE run_id = $1::uuid", row["run_id"])}
    assert [a["actor"] for a in actors] == ["specialist:finance"] and {"route", "skill_load", "tool_call"} <= kinds
    assert stack.sql("SELECT count(*)::int AS n FROM core.draft WHERE source LIKE 'intel:%'") == [{"n": 0}]


def test_the_ask_posted_one_spend_row_per_model_call_and_cores_budget_left_fell(stack: AskStack) -> None:
    """W3 close ruling (R-E 1-C, money): every provider call is a row in `intel.intel_spend`, which core's monthly cap
    sums. By hand from the recorded scripts above: route.intent 1 call (ROUTE_SCRIPT), the Manager 2 (REASON_SCRIPT: the
    read, then submit_answer) = 3 rows for the run, in the month budget's currency, each at least one minor unit. core's
    own effectiveCap (the `intel.ai_budget_left` template the run-frame reads) has spent = their sum and left = limit −
    spent. Runs after the turn test above, on the same stack."""
    [run] = stack.sql("SELECT a.run_id::text FROM intel.answer a WHERE a.question = $1 ORDER BY a.created_at LIMIT 1", QUESTION)
    rows = stack.sql(
        "SELECT role, provider, model_id, input_tokens, amount_minor::bigint AS amount, currency FROM intel.intel_spend"
        " WHERE run_id = $1::uuid ORDER BY at, id",
        run["run_id"],
    )
    assert sorted(r["role"] for r in rows) == ["reason", "reason", "router"]
    assert {(r["provider"], r["currency"]) for r in rows} == {("gemini", "INR")}
    assert all(int(r["amount"]) >= 1 and r["input_tokens"] > 0 for r in rows)
    [limit] = stack.sql("SELECT limit_minor::bigint AS n FROM platform.llm_budget")
    total = sum(int(r["amount"]) for r in stack.sql("SELECT amount_minor::bigint AS amount FROM intel.intel_spend"))
    cap = stack.call("budget")
    assert cap["spent_minor"] == total > 0 and cap["left_minor"] == int(limit["n"]) - total


def test_at_the_cap_the_next_ask_abstains_model_blocked_with_no_model_call(stack: AskStack) -> None:
    """The cap really stops the model: the operator sets this month's limit one minor unit above what is spent; one more
    ask still runs (left > 0 at its start) and its own spend takes left to ≤ 0; core's run-frame then says template, so
    the next ask is stored as a model_blocked abstention with no spend row. Paired: the ask before the cap answered."""
    spent = stack.call("budget")["spent_minor"]
    stack.sql("UPDATE platform.llm_budget SET limit_minor = $1", spent + 1)
    assert stack.call("budget")["left_minor"] == 1
    assert stack.call("frame")["narration"] == "model", "one minor unit left: the run-frame still allows the model"
    before = stack.call("ask", persona="owner", question=QUESTION)
    assert before["status"] == 200 and json.loads(before["body"])["answer"]["envelope"]["abstained"] is False
    cap = stack.call("budget")
    assert cap["left_minor"] <= 0 and cap["spent_minor"] >= spent + 3
    frame = stack.call("frame")
    assert frame["narration"] == "template" and frame["budget"]["level"] == "hard", "at the cap the run-frame says template"
    rows = int(stack.sql("SELECT count(*)::int AS n FROM intel.intel_spend")[0]["n"])
    after = stack.call("ask", persona="owner", question=QUESTION)
    assert after["status"] == 200, after["body"][:300]
    env = json.loads(after["body"])["answer"]["envelope"]
    assert env["abstained"] is True and env["reason_code"] == "model_blocked"
    assert int(stack.sql("SELECT count(*)::int AS n FROM intel.intel_spend")[0]["n"]) == rows, "no model call, no spend"


def record() -> None:
    for d in (DM, REASON):
        shutil.rmtree(d, ignore_errors=True)
    s = AskStack(writing())
    try:
        out = s.call("ask", persona="owner", question=QUESTION)
        print(out["status"], out["body"][:400])
    finally:
        s.stop()


if __name__ == "__main__" and sys.argv[1:] == ["--record"]:
    record()
