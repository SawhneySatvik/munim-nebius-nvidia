"""R68 (F3 step 13): "What does a price rise of Butter (synthetic) touch?", end to end on the FalkorDB build. The real core-api on
embedded Postgres (Cobnut, a fixed seed and day), the supply graph on a FalkorDB test server behind core's graph:query
(butter_stack.mts), core's POST /v1/ask bridged to intel's real /ask app in-process, recorded models. Fails — never skips —
without node or the FalkorDB test server (`make falkordb-fetch`).

The run, as a careful model would make it (authored by code from the rows it was shown, never by hand): route.intent says
lookup; the Manager loads inventory_purchasing, reads purchasing.price_creep (S1), asks the graph what each priced supplier
supplies until one of them names butter — the graph row's ingredient id comes back as S1's cell path (handle reuse), so the
model knows which price row is butter's — then asks the graph what a price change of butter reaches, and answers: butter's
latest price cell, and the dishes and outlets the graph reached, by name, with no number of its own.

The design's cut (§5.1, taken): one skill, no margins. The Manager's tool cap (20, R45 F3) cannot hold catalogue's tools beside
inventory_purchasing's (2 fixed + 14 + 8 = 24, FACT: skills/loader.py and the committed inventory fixtures' 16 tools), so the
answer cannot also read catalogue.dish_margin. The supplier map shows each dish's margin from the snapshot it mints.

Expected values never come from the code under test: the seven butter dishes and Cobnut's dish list are typed from
tools/worldgen/src/worlds/cobnut.ts (RECIPES, DISHES); each cited cell is re-read from evidence.snapshot by SQL; the graph's own
answer for butter is read from the backend directly. QUESTION is the text apps/web's supplier map opens Ask with
(lib/munim/graph.ts askAbout), typed again here.
Fixtures: `uv run --frozen python tests/graph/test_butter_question_e2e.py --record` (seeds the world, ~2 min).
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
from collections.abc import AsyncGenerator, Callable, Iterator
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

HERE = Path(__file__).resolve().parent
DM = HERE / "fixtures" / "butter" / "decide"
REASON = HERE / "fixtures" / "butter" / "reason"
QUESTION = "What does a price rise of Butter (synthetic) touch?"
AS_OF = "2026-10-10"
#: By hand from cobnut.ts RECIPES: every dish with butter in it.
BUTTER_DISHES = {
    "Hazelnut Croissant", "Pain au Chocolat", "Cardamom Knot", "Pistachio Danish", "Hazelnut Praline Cake",
    "Brown Butter Hazelnut Cookie", "Eggless Choc-Chip Cookie",
}  # fmt: skip
#: By hand from cobnut.ts DISHES: every dish on Cobnut's menu.
ALL_DISHES = BUTTER_DISHES | {
    "Gianduja Mousse Cup", "Rose Pistachio Tres Leches", "Oat & Jaggery Cookie", "Build-a-Box", "Truffle Tin",
    "Hazelnut Hot Chocolate", "Cold Coffee",
}  # fmt: skip
OUTLETS = {"Cobnut Hazratganj", "Cobnut Gomti Nagar"}
CANONICAL = re.compile(r"⟨[^⟩]*⟩")

Projection = dict[str, Any]


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


def _and(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def reason_step(p: Projection) -> LlmResponse:
    """The Manager's next step, from what the request shows it (the authoring model)."""
    calls = [part for c in p["contents"] if c["role"] == "model" for part in c["parts"] if "call" in part]
    done = [(part["response"], part["data"]) for c in p["contents"] if c["role"] == "user" for part in c["parts"] if "response" in part]
    if not calls:
        return _call("load_skill", {"pack": "inventory_purchasing"})
    if done[-1][0] == "load_skill":
        return _call("read_purchasing_price_creep", {"as_of": AS_OF, "page": 0})
    creep = next(d for n, d in done if n == "read_purchasing_price_creep")
    rows = [r for n, d in done if n == "graph_supplier_dependency" for r in d["rows"]]
    butter = next((r for r in rows if str(r["ingredient_name"]).startswith("Butter")), None)
    if butter is None:
        asked = {c["args"]["supplier_id"] for c in calls if c["call"] == "graph_supplier_dependency"}
        nxt = next(r["supplier_id"] for r in creep["rows"] if r["supplier_id"] not in asked)
        return _call("graph_supplier_dependency", {"supplier_id": nxt})
    held = str(butter["ingredient_id"])
    assert held.startswith("S1.r"), f"butter's id is not a cell of the price snapshot: {held}"
    shock = [d for n, d in done if n == "graph_price_shock_path"]
    if not shock:
        return _call("graph_price_shock_path", {"ingredient_id": held, "depth": 2})
    dishes = [str(r["name"]) for r in shock[0]["rows"] if r["kind"] == "item"]
    outlets = [str(r["name"]) for r in shock[0]["rows"] if r["kind"] == "outlet"]
    h = held.removesuffix(".ingredient_id")
    segments = [
        f"{butter['ingredient_name']} costs {{{h}.latest_minor}} at its latest price.",
        f"A rise in that price reaches these dishes: {_and(dishes)}. They are sold at {_and(outlets)}. "
        f"Its latest price is {{{h}.latest_minor}}.",
    ]
    return _call("submit_answer", {"segments": [{"text": s} for s in segments], "abstain": None})


class Writer(BaseLlm):
    """Authoring only: answers each request with `step(projection)` and writes its fixture."""

    model: str = "recorded"
    fixtures_dir: Path = REASON
    step: Callable[[Projection], LlmResponse] = reason_step

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        key, canonical, _ = request_key(llm_request)
        resp = self.step(json.loads(canonical))
        body = {"request": json.loads(canonical), "responses": [resp.model_dump(mode="json", exclude_none=True)]}
        self.fixtures_dir.mkdir(parents=True, exist_ok=True)
        (self.fixtures_dir / f"{key}.json").write_text(json.dumps(body, ensure_ascii=False, indent=1, sort_keys=True) + "\n", "utf8")
        yield resp


def recorded() -> Models:
    return Models(
        LlmMimic(RecordedLlm(model="recorded/router", fixtures_dir=DM), adapter="recorded"),
        RecordedLlm(model="recorded/reason", fixtures_dir=REASON),
    )


def writing() -> Models:
    router = Writer(model="recorded/router", fixtures_dir=DM, step=lambda _p: _route("A", 0.9))  # A = lookup
    return Models(LlmMimic(router, adapter="recorded"), Writer(model="recorded/reason", fixtures_dir=REASON))


class Bridge(httpx.AsyncBaseTransport):
    """intel's InternalClient → core-api's app in the stack, over the stack's pipe."""

    def __init__(self, stack: ButterStack) -> None:
        self.stack = stack

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = (await request.aread()).decode() or None
        out = self.stack.call(
            "http", method=request.method, path=request.url.raw_path.decode(), headers=dict(request.headers.items()), body=body
        )
        return httpx.Response(out["status"], content=out["body"].encode(), headers={"content-type": "application/json"})


class ButterStack:
    """butter_stack.mts as a subprocess (tests/manager/test_manager_e2e.py's AskStack, on this stack)."""

    def __init__(self, models: Models) -> None:
        node = shutil.which("node")
        assert node, "node is required: this gate runs core-api's real /v1/ask"
        self.proc = subprocess.Popen(  # noqa: S603 — fixed argv of our own fixture
            [node, str(HERE / "butter_stack.mts")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8"
        )
        self.ready = self._read("ready")
        run_dir = Path(tempfile.mkdtemp(prefix="f3-butter-run-"))
        (run_dir / "keys").mkdir()
        (run_dir / "keys" / "run-token-ed25519.pub.pem").write_text(self.ready["public_key_pem"])
        self.secret: str = self.ready["secret"]
        cfg = load_config(env={"MUNIM_RUN_DIR": str(run_dir), "MUNIM_SERVICE_SECRET": self.secret})

        async def models_of(*_: object) -> Models:
            return models

        self.intel = create_app(cfg, core_transport=Bridge(self), ask_models=models_of)

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
        raise AssertionError(f"butter_stack.mts exited ({self.proc.wait()}) before answering")

    def _serve(self, a: dict[str, Any]) -> None:
        async def post() -> tuple[int, str]:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.intel), base_url="http://intel") as c:
                headers = {"authorization": f"Bearer {a['token']}", SERVICE_SECRET_HEADER: self.secret}
                r = await c.post("/ask", json=a["body"], headers=headers)
                return r.status_code, r.text

        status, body = asyncio.run(post())
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
        assert self.proc.returncode == 0, f"butter_stack.mts exited {self.proc.returncode}"


@pytest.fixture(scope="module")
def stack() -> Iterator[ButterStack]:
    s = ButterStack(recorded())
    yield s
    s.stop()


def test_the_butter_question_names_the_graphs_dishes_and_every_number_is_a_price_cell(stack: ButterStack) -> None:
    out = stack.call("ask", persona="owner", question=QUESTION)
    assert out["status"] == 200, out["body"][:300]
    body = json.loads(out["body"])
    answer, turn = body["answer"], body["turn"]
    env = answer["envelope"]
    print("segments:", [s["text"] for s in env["segments"]])
    assert env["abstained"] is False and env["reason_code"] is None and len(env["segments"]) == 2
    # Graph rows taint the run (a name may be document text), so it could propose nothing.
    assert turn["tainted"] is True

    # Every number is a cell of the purchasing.price_creep snapshot the run minted, resolving to what the row holds (by SQL).
    text = " ".join(s["text"] for s in env["segments"])
    assert not re.search(r"\d", CANONICAL.sub("", text)), "a digit outside a ref"
    tokens = sorted(set(CANONICAL.findall(text)))
    resolved = {r["ref"]: r["value"] for r in answer["resolved_refs"]}
    assert len(tokens) == 1 and sorted(resolved) == tokens
    for tok in tokens:
        sid, row, col = tok[len("⟨snap:") : -1].split("·")
        [cell] = stack.sql(
            "SELECT template_id, rows -> $2::int -> $3::text AS v FROM evidence.snapshot WHERE id = $1::uuid", sid, int(row), col
        )
        assert cell["template_id"] == "purchasing.price_creep" and col == "latest_minor"
        assert resolved[tok] is not None and cell["v"] == resolved[tok]

    # The dishes it names are butter's (by hand) and the graph's (the backend, read directly); both outlets are named.
    assert {d for d in ALL_DISHES if d in text} == BUTTER_DISHES
    assert all(o in text for o in OUTLETS)
    [butter] = stack.sql("SELECT id::text FROM core.ingredient WHERE name = 'Butter (synthetic)'")
    rows = stack.call("graph", template="price_shock_path", args={"ingredient_id": butter["id"], "depth": 1})
    assert {r["name"] for r in rows if r["kind"] == "item"} == BUTTER_DISHES


def record() -> None:
    for d in (DM, REASON):
        shutil.rmtree(d, ignore_errors=True)
    s = ButterStack(writing())
    try:
        out = s.call("ask", persona="owner", question=QUESTION)
        print(out["status"], out["body"][:600])
    finally:
        s.stop()


if __name__ == "__main__" and sys.argv[1:] == ["--record"]:
    record()
