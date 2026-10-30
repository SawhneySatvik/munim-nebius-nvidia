"""A2 (events build): what Nemotron needed to answer an Ask, pinned offline, and its live answers replayed.

Diagnosis (docs/plan/lanes/A2.report.md): the Manager picked a specialist seeing pack names only, computed date windows itself,
had no handle for an outlet named in the question, typed dates and number words into its prose, and wrote "none" for null. The
fixes, each pinned here: every specialist's reads in the Manager's system prompt; date windows and an O<n> handle per outlet in
the run frame; null words read as null where null is allowed; every refused segment named in one refusal; the finish tool
outside the tool cap. The bar is untouched: the same checks refuse the same text (test_manager.py, tests/context, tests/tools).

Expected values never come from the code under test: windows are worked by hand from the calendar; each skill's reads are its
own skill.py list; each replayed question's template and columns are named below by hand from the template registry.

The replays: tests/manager/fixtures/nemotron/, recorded live on 24 Oct by record_nemotron_ask.py from Nemotron 3 Ultra on the
NVIDIA endpoint, against the locally seeded Cobnut and Kosambari worlds. Each ask runs again here through the real answer_ask,
with an in-memory core that mints exactly the rows core minted then; any prompt change re-keys the requests, and a replay then
misses its fixture and fails (conftest's guard): re-record by hand, live.
"""

from __future__ import annotations

import asyncio
import importlib
import json
import re
from pathlib import Path
from typing import Any

import httpx
import pytest
from google.adk.models.llm_request import LlmRequest
from google.adk.tools.base_tool import BaseTool
from google.genai import types
from openai._base_client import BaseClient

from manager_kit import CTX, FakeCore, frame, kit_cfg, vid
from munim_intel.config import load_config
from munim_intel.context.assembler import ROUTES, date_windows, frame_block
from munim_intel.contracts_gen.models import InternalRunFrameResponse, PlatformModelRoleRow, ThreadsIntelAskRequest
from munim_intel.decide.mimic import LlmMimic
from munim_intel.llm.providers import build_live_llm
from munim_intel.llm.recorded import RecordedLlm
from munim_intel.manager.ask import Models, answer_ask, prepare
from munim_intel.manager.paths import ANSWER, bind
from munim_intel.runtime.state import PACKS, Budget, RunState
from munim_intel.tools.answer import SubmitAnswerTool
from munim_intel.tools.generated import build_toolset, read_index
from munim_intel.tools.grammar import check_grammar
from munim_intel.tools.handles import HandleError, HandleTable
from munim_intel.tools.ontology import load_ontology
from munim_intel.trace.buffer import TraceBuffer
from munim_intel.trace.plugin import MunimPlugin

NEMOTRON = Path(__file__).resolve().parent / "fixtures" / "nemotron"


def run(coro: Any) -> Any:
    return asyncio.run(coro)


# -- the run frame: an O<n> handle per outlet, date windows per business date ----------------------------------------


def test_date_windows_are_the_calendar_weeks_and_months_around_the_business_date() -> None:
    # By hand from the calendar: 24 Oct 2026 is a Saturday; 1 Jan 2026 a Thursday; 19 Oct 2026 a Monday; 1 Mar 2026 a Sunday.
    assert date_windows("2026-10-24").endswith(
        "this week 2026-10-19 to 2026-10-25; last week 2026-10-12 to 2026-10-18; "
        "this month 2026-10-01 to 2026-10-31; last month 2026-09-01 to 2026-09-30."
    )
    assert "this week 2025-12-29 to 2026-01-04; last week 2025-12-22 to 2025-12-28;" in date_windows("2026-01-01")
    assert "last month 2025-12-01 to 2025-12-31." in date_windows("2026-01-01")
    assert "this week 2026-10-19 to 2026-10-25;" in date_windows("2026-10-19")
    assert "this week 2026-02-23 to 2026-03-01; last week 2026-02-16 to 2026-02-22; this month 2026-03-01 to 2026-03-31;" in (
        date_windows("2026-03-01")
    )
    assert "last month 2026-02-01 to 2026-02-28." in date_windows("2026-03-01")


def test_the_frame_block_names_each_outlet_by_its_handle_and_the_windows_of_its_business_date() -> None:
    f = frame("mixed")
    h = HandleTable()
    block = frame_block(f, "ask", h)
    assert block.startswith("Run frame: country pack IN")
    assert "- outlet O1: Jayanagar Corner Store (store), business date 2026-10-10" in block
    assert "- outlet O2: Indiranagar Kitchen (restaurant), business date 2026-10-10" in block
    assert block.count("Dates for tool arguments") == 1 and "this week 2026-10-05 to 2026-10-11" in block
    # The same handles on every call (the block is rendered per model step); the id behind each is the frame's.
    assert frame_block(f, "ask", h) == block
    assert [h.literal_id("O1", outlet=True), h.literal_id("O2", outlet=True)] == [o.id.root for o in f.outlets]


def test_the_frame_block_hands_the_model_the_handle_of_an_outlet_the_question_names() -> None:
    """Fix cycle 1 (review, major): told only in the core rules, Nemotron read a payout for every outlet when the question
    named Indiranagar. The frame now says which handle the question names; it carries handles and frame names, never the
    question's own text."""
    f = frame("restaurant")
    named = frame_block(f, "ask", HandleTable(), "Why did profit drop at Koramangala this week?")
    assert "The question names outlet O2 (Koramangala Cloud): pass that handle as outlet_id to every read that takes one." in named
    assert "profit" not in named
    for question in (None, "How did net sales go this week?"):
        assert "The question names outlet" not in frame_block(f, "ask", HandleTable(), question)


def test_an_outlet_handle_reaches_core_as_that_outlets_id_and_an_unknown_one_is_refused_before_core() -> None:
    core = FakeCore(frame("restaurant"))
    h = HandleTable()
    frame_block(core.run_frame, "ask", h)
    [read] = [t for t in build_toolset("people", CTX, core.client(), h, propose=False) if t.name == "read_people_labour_pct"]
    args = {"from": "2026-10-05", "to": "2026-10-11", "outlet_id": "O2", "page": 0}
    run(read.run_async(args=args, tool_context=None))  # type: ignore[arg-type]
    sent = json.loads(core.bodies[-1])
    assert sent["template_id"] == "people.labour_pct" and sent["params"]["outlet_id"] == core.run_frame.outlets[1].id.root
    out = run(read.run_async(args={**args, "outlet_id": "O3"}, tool_context=None))  # type: ignore[arg-type]
    assert out == {"error": "O3 is not an outlet of this run. Outlets: O1–O2."} and len(core.bodies) == 1
    with pytest.raises(HandleError):
        HandleTable().literal_id("O1", outlet=True)


def test_an_outlet_handle_fills_only_an_outlet_argument_and_is_refused_in_any_other_id_slot() -> None:
    """Fix cycle 1 (review): O<n> resolved in every id slot, so an outlet's id could be read as an item or a supplier."""
    core = FakeCore(frame("restaurant"))
    h = HandleTable()
    frame_block(core.run_frame, "ask", h)
    [read] = [t for t in build_toolset("catalogue", CTX, core.client(), h, propose=False) if t.name == "read_catalogue_recipe_current"]
    out = run(read.run_async(args={"item_id": "O1", "outlet_id": None, "as_of": None, "page": 0}, tool_context=None))  # type: ignore[arg-type]
    assert out == {"error": "O1 is an outlet; pass O<n> only as an outlet argument, and a cell handle here."} and core.bodies == []
    with pytest.raises(HandleError):
        h.literal_id("O1")
    with pytest.raises(HandleError):
        h.entity_id("O1")
    # Paired: the same handle in the outlet slot of the same read reaches core as that outlet's id, beside a real item cell.
    h.add_snapshot({"snapshot_id": vid(76), "template_id": "catalogue.dish_margin", "columns": [{"name": "item_id", "type": "uuid"}],
                    "rows": [{"item_id": vid(77)}]})  # fmt: skip
    run(read.run_async(args={"item_id": "S1.r0.item_id", "outlet_id": "O1", "as_of": None, "page": 0}, tool_context=None))  # type: ignore[arg-type]
    assert json.loads(core.bodies[-1])["params"] == {"item_id": vid(77), "outlet_id": core.run_frame.outlets[0].id.root, "as_of": None}


# -- null words --------------------------------------------------------------------------------------------------------


def test_the_word_none_is_null_where_an_argument_admits_null_and_stays_a_word_where_it_does_not() -> None:
    core = FakeCore(frame("restaurant"))
    h = HandleTable()
    tools = {t.name: t for t in build_toolset("finance", CTX, core.client(), h, propose=False)}
    settle = tools["read_finance_settlement_vs_orders"]
    args = {"from": "2026-10-01", "to": "2026-10-31", "outlet_id": "None", "channel_id": "none", "page": 0}
    assert settle.validate_args(args) is None  # type: ignore[attr-defined]
    run(settle.run_async(args=args, tool_context=None))  # type: ignore[arg-type]
    assert json.loads(core.bodies[-1])["params"] == {"from": "2026-10-01", "to": "2026-10-31", "outlet_id": None, "channel_id": None}
    # group_by admits no null: "none" stays a word and the enum refuses it.
    pnl = tools["read_finance_pnl"]
    assert "group_by" in str(pnl.validate_args({"group_by": "none", "period_month": "2026-10-01", "page": 0}))  # type: ignore[attr-defined]


class _Actions:
    skip_summarization = False


class _Ctx:
    def __init__(self) -> None:
        self.actions = _Actions()
        self.function_call_id = "call-1"


def submit_tool() -> SubmitAnswerTool:
    table = HandleTable()
    table.add_snapshot(
        {
            "snapshot_id": vid(70),
            "template_id": "people.labour_pct",
            "columns": [{"name": "labour_bp", "type": "integer"}, {"name": "iso_week", "type": "text"}],
            "rows": [{"labour_bp": 2576, "iso_week": "2026-W42"}],
        }
    )
    return SubmitAnswerTool(vid(71), table, lambda: [])


def test_submit_answer_reads_the_word_none_as_answering_never_as_a_reason_code() -> None:
    tool = submit_tool()
    args = {"segments": [{"text": "Labour was {S1.r0.labour_bp} of net sales last week."}], "abstain": "none"}
    assert tool.validate_args(args) is None
    assert run(tool.run_async(args=args, tool_context=_Ctx())) == {"status": "submitted"}  # type: ignore[arg-type]
    assert tool.envelope is not None and tool.envelope.abstained is False
    # Paired: any other word outside the codes is still refused.
    assert tool.validate_args({**args, "abstain": "nothing"}) is not None


def test_one_refusal_names_every_refused_segment_and_the_first_ones_code_stands() -> None:
    tool = submit_tool()
    texts = ["Labour was {S1.r0.labour_bp} on 2026-10-18.", "Both outlets were fine.", "Labour was {S1.r0.labour_bp}."]
    first = run(tool.run_async(args={"segments": [{"text": t} for t in texts], "abstain": None}, tool_context=_Ctx()))  # type: ignore[arg-type]
    assert first["error"].startswith("segment 0: numeric_char, a digit outside the braces")
    assert "segment 1: it cites no cell" in first["error"] and "segment 2" not in first["error"]
    assert "2026" not in first["error"] and tool.envelope is None
    second = run(tool.run_async(args={"segments": [{"text": t} for t in texts], "abstain": None}, tool_context=_Ctx()))  # type: ignore[arg-type]
    assert second == {"status": "abstained", "reason_code": "number_grammar"}


def test_what_an_empty_read_shows_is_left_out_never_moved_into_a_segment_citing_another_cell() -> None:
    """Fix cycle 1 (review, blocker): told to say an empty read's result "inside a segment that cites a cell", Nemotron put
    "no stock is at risk at Gomti Nagar" into the segment citing Hazratganj's cells: a claim with no ledger row. Both the
    output contract and the no-cell refusal now say to leave it out."""
    tool = submit_tool()
    texts = ["Labour was {S1.r0.labour_bp} last week.", "Nothing was read at the other outlet."]
    refusal = run(tool.run_async(args={"segments": [{"text": t} for t in texts], "abstain": None}, tool_context=_Ctx()))["error"]  # type: ignore[arg-type]
    core = FakeCore(frame("restaurant"))
    req = ThreadsIntelAskRequest.model_validate({"answer_id": vid(75), "question": "q", "addressed_to": None, "thread": None})
    system = prepare(CTX, req, core.run_frame, core.client(), bind(ANSWER, None)).assembler.system()
    for text in (refusal, system):
        low = " ".join(text.lower().split())
        assert "inside a segment that cites" not in low and "cites another cell" not in low, "the coaching to move the claim is back"
    assert "segment 1: it cites no cell" in refusal and "Leave out what a read without rows shows" in refusal
    assert "What a read without rows shows is not stated at all: leave it out" in " ".join(system.split())


def test_a_segment_naming_an_outlet_must_cite_a_cell_of_that_outlet() -> None:
    """Fix cycle 1: intel refuses, at submit time, a segment that names a run-frame outlet none of its cited cells is tied to
    (by the row's outlet_id, or the outlet_id the snapshot was read for). The prompt alone let it through live."""
    a, b = vid(80), vid(81)
    table = HandleTable()
    for n, params, row in ((82, {"outlet_id": a}, {"at_risk_minor": 1}), (83, {"outlet_id": b}, {"at_risk_minor": 2}),
                           (84, {"outlet_id": None}, {"outlet_id": b, "on_hand_milli": 3}), (89, {"as_of": None}, {"latest_minor": 4}),
                           (90, {"outlet_id": None}, {"short_minor": 5})):  # fmt: skip
        cols = [{"name": c, "type": "uuid" if c == "outlet_id" else "integer"} for c in row]
        table.add_snapshot({"snapshot_id": vid(n), "template_id": "t.x", "params": params, "columns": cols, "rows": [row]})
    outlets = {a: "Cobnut Hazratganj", b: "Cobnut Gomti Nagar"}

    def submit(text: str, scope: dict[str, str] = outlets) -> Any:
        tool = SubmitAnswerTool(vid(85), table, lambda: [], scope)
        return run(tool.run_async(args={"segments": [{"text": text}], "abstain": None}, tool_context=_Ctx()))  # type: ignore[arg-type]

    out = submit("At Cobnut Hazratganj {S1.r0.at_risk_minor} is at risk, and nothing at Gomti Nagar.")
    assert out["error"].startswith("segment 0: it names Cobnut Gomti Nagar, but no cell it cites is that outlet's")
    # Paired: each named outlet cites its own cell, by the read's argument or by the row's outlet_id.
    assert submit("Hazratganj {S1.r0.at_risk_minor} and Gomti Nagar {S2.r0.at_risk_minor}.") == {"status": "submitted"}
    assert submit("Gomti Nagar holds {S3.r0.on_hand_milli}.") == {"status": "submitted"}
    # A read for every outlet is no one outlet's: naming one beside its figure is refused.
    assert submit("At Gomti Nagar the payout was short by {S5.r0.short_minor}.")["error"].startswith("segment 0: it names Cobnut Gomti")
    # Paired: a figure no outlet has (a supplier's price: no outlet_id param or column) claims no outlet's figure.
    assert submit("Butter costs {S4.r0.latest_minor}; the dishes it reaches are sold at Gomti Nagar.") == {"status": "submitted"}
    # One outlet in scope: every read is that outlet's, so nothing to tie.
    assert submit("Gomti Nagar holds {S1.r0.at_risk_minor}.", {b: "Cobnut Gomti Nagar"}) == {"status": "submitted"}
    # The Manager's own submit_answer (prepare) carries the run frame's outlets.
    core = FakeCore(frame("restaurant"))
    req = ThreadsIntelAskRequest.model_validate({"answer_id": vid(86), "question": "q", "addressed_to": None, "thread": None})
    p = prepare(CTX, req, core.run_frame, core.client(), bind(ANSWER, None))
    first = core.run_frame.outlets[0].id.root
    cols = [{"name": "net_minor", "type": "integer"}]
    p.handles.add_snapshot(
        {"snapshot_id": vid(87), "template_id": "t.x", "params": {"outlet_id": first}, "columns": cols, "rows": [{"net_minor": 1}]}
    )
    args = {"segments": [{"text": "Koramangala made {S1.r0.net_minor}."}], "abstain": None}
    out = run(p.submit.run_async(args=args, tool_context=_Ctx()))  # type: ignore[arg-type]
    assert out["error"].startswith("segment 0: it names Koramangala Cloud, but no cell it cites is that outlet's")


def test_a_refusal_names_every_rule_a_segment_breaks_keeps_its_refs_whole_and_the_first_rules_code_stands() -> None:
    tool = submit_tool()
    text = "Labour was {S1.r0.labour_bp}, two points over on 2026-10-18, a three-day high of 30%."
    first = run(tool.run_async(args={"segments": [{"text": text}], "abstain": None}, tool_context=_Ctx()))  # type: ignore[arg-type]
    error = first["error"]
    assert error.startswith("segment 0: numeric_char, a digit outside the braces")
    assert "number_symbol, a percent sign, '%'" in error and "number_word, a number word, 'two'" in error
    # A compound is named by its number part only: never the model's own word.
    assert "number_word, a number word, 'three'" in error and "three-day" not in error
    assert "malformed_ref" not in error, "blanking a digit inside the expanded ref made it look malformed"
    second = run(tool.run_async(args={"segments": [{"text": text}], "abstain": None}, tool_context=_Ctx()))  # type: ignore[arg-type]
    assert second == {"status": "abstained", "reason_code": "number_grammar"}


# -- the finish tool is outside the tool cap ----------------------------------------------------------------------------


class _Read(BaseTool):
    def __init__(self) -> None:
        super().__init__(name="read_something", description="a read")


async def _sink(_: Any) -> Any:
    raise AssertionError("not flushed in this test")


def test_at_the_tool_cap_a_read_is_refused_and_the_finish_tool_still_runs() -> None:
    state = RunState(traces=TraceBuffer(_sink), budget=Budget(max_tool_calls=1))
    plugin = MunimPlugin(state)
    read, finish = _Read(), submit_tool()
    done = {"segments": [{"text": "Labour was {S1.r0.labour_bp}."}], "abstain": None}

    def before(tool: BaseTool, args: dict[str, Any]) -> Any:
        return run(plugin.before_tool_callback(tool=tool, tool_args=args, tool_context=_Ctx()))  # type: ignore[arg-type]

    assert before(read, {}) is None
    assert before(read, {}) == {"error": "The tool-call limit for this run is reached."}
    assert before(finish, done) is None
    assert state.budget.tool_calls == 2, "the refused read counted; the finish tool did not"


# -- the NVIDIA endpoint's rate-limit bursts ------------------------------------------------------------------------------


def test_a_live_nemotron_call_outlasts_a_burst_of_rate_limits(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Measured live (24 Oct): the endpoint answered 429 for about three seconds at a time, longer than the SDK's default two
    retries wait, and eight of eleven Asks abstained on it. Four 429s, then the call goes through (the SDK's own backoff, its
    waits zeroed here)."""
    cfg = load_config(env={"MUNIM_MODEL_MODE": "live", "NVIDIA_API_KEY": "nvidia-test-key-not-real-a2"}, run_dir=tmp_path)
    row = PlatformModelRoleRow.model_validate(
        {"role": "reason", "provider": "nvidia", "model_id": "nvidia/nemotron-3-ultra-550b-a55b", "location": None,
         "input_price_per_mtok_minor": 0, "output_price_per_mtok_minor": 0, "price_currency": "INR", "probed_at": None,
         "updated_at": "2026-10-24T00:00:00Z"}
    )  # fmt: skip
    llm = build_live_llm(row, cfg)
    body = json.loads((Path(__file__).resolve().parents[1] / "fixtures" / "nemotron" / "reason_tool.json").read_text("utf8"))["response"]
    sent: list[int] = []

    async def send(_client: httpx.AsyncClient, request: httpx.Request, **_: Any) -> httpx.Response:
        sent.append(1)
        if len(sent) <= 4:
            return httpx.Response(429, json={"status": 429, "title": "Too Many Requests"}, request=request)
        return httpx.Response(200, json=body, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "send", send)
    monkeypatch.setattr(BaseClient, "_calculate_retry_timeout", lambda *_a, **_k: 0.0)
    question = types.Content(role="user", parts=[types.Part(text="What were net sales on the business date?")])
    req = LlmRequest(model=llm.model, contents=[question], config=types.GenerateContentConfig())

    async def go() -> list[Any]:
        return [r async for r in llm.generate_content_async(req)]

    [reply] = run(go())
    assert len(sent) == 5 and reply.content is not None and reply.content.parts


# -- the specialist index ------------------------------------------------------------------------------------------------


def test_the_manager_sees_every_specialists_reads_before_it_loads_one_and_an_addressed_run_does_not() -> None:
    core = FakeCore(frame("restaurant"))
    req = ThreadsIntelAskRequest.model_validate({"answer_id": vid(72), "question": "q", "addressed_to": None, "thread": None})
    system = prepare(CTX, req, core.run_frame, core.client(), bind(ANSWER, None)).assembler.system()
    exposed = {f["id"]: f for f in load_ontology()["functions"] if f["agent_exposed"]}
    lines = read_index().splitlines()
    for pack in PACKS:
        # Each skill's own hand list of the reads it brings (skills/<pack>/skill.py).
        for t in importlib.import_module(f"munim_intel.skills.{pack}.skill").READ_TEMPLATES:
            if t in exposed:
                tool = exposed[t]["tool"]
                assert any(line.startswith(f"- {pack}: {tool}(") for line in lines), f"{pack} {tool} not in the index"
    assert "- people: read_people_labour_pct(to, from, outlet_id) → iso_week, labour_minor, net_sales_minor, labour_bp" in system
    assert read_index() in system and ROUTES in system and "No skill is loaded yet." in system
    # Once a skill is loaded the index leaves (it counted against the input-token cap on every call); the routes stay.
    p = prepare(CTX, req, core.run_frame, core.client(), bind(ANSWER, None))
    p.toolset.load("people")
    loaded = p.assembler.system()
    assert read_index() not in loaded and ROUTES in loaded and "Skill people:" in loaded
    addressed = ThreadsIntelAskRequest.model_validate({"answer_id": vid(73), "question": "q", "addressed_to": "people", "thread": None})
    assert read_index() not in prepare(CTX, addressed, core.run_frame, core.client(), bind(ANSWER, "people")).assembler.system()


def test_every_read_the_routing_examples_name_is_that_specialists_in_the_index() -> None:
    lines = read_index().splitlines()
    named = re.findall(r"(?:^|\n)- [^:\n]+: ([a-z_]+): ([^\n]+(?:\n  [^\n]+)*)", ROUTES)
    assert len(named) == 10, "a routing line no longer parses"
    for pack, tools in named:
        for tool in re.findall(r"read_[a-z_]+", tools):
            assert any(line.startswith(f"- {pack}: {tool}(") for line in lines), f"{pack}: {tool} is not that specialist's read"


# -- the live Nemotron asks, replayed ------------------------------------------------------------------------------------

#: By hand, from the template registry: the read that answers each question, and the columns an answer from it cites.
EXPECT: dict[str, tuple[str, set[str]]] = {
    "Which ingredients are below their reorder level?": ("inventory.below_reorder", {"on_hand_milli", "min_qty_milli", "par_qty_milli"}),
    "How did net sales go this week?": ("people.labour_pct", {"net_sales_minor"}),
    "What was labour as a share of sales last week?": ("people.labour_pct", {"labour_bp"}),
    "How much stock is at risk of expiring in the next three days?": ("inventory.expiry_risk", {"at_risk_minor", "at_risk_qty_milli"}),
    "Why was my Swiggy payout at Indiranagar short?": ("finance.settlement_vs_orders", {"short_minor", "commission_minor"}),
}
ASKS = sorted((NEMOTRON / "asks").glob("*.json"))
_SNAP = re.compile(r"⟨snap:([0-9a-f-]{36})·(\d+)·([a-z_][a-z0-9_]*)⟩")


class RecordedWorld(FakeCore):
    """core as it minted for the live ask: each mint answers the rows core returned then, for the same template and params."""

    def __init__(self, ask: dict[str, Any]) -> None:
        super().__init__(InternalRunFrameResponse.model_validate(ask["frame"]))
        self.served = {(s["template_id"], json.dumps(s["params"], sort_keys=True)): s for s in ask["snapshots"]}
        self.snaps: dict[str, dict[str, Any]] = {}

    def _snapshot(self, body: dict[str, Any]) -> dict[str, Any]:
        s = self.served[(body["template_id"], json.dumps(body["params"], sort_keys=True))]
        out = {**super()._snapshot(body), "columns": s["columns"], "rows": s["rows"], "row_count": len(s["rows"])}
        self.snaps[out["snapshot_id"]] = out
        return out


def test_every_question_of_the_target_was_recorded() -> None:
    assert {json.loads(p.read_text("utf8"))["question"] for p in ASKS} == set(EXPECT), "re-record: record_nemotron_ask.py"


#: Kosambari's delivery channels (tools/worldgen/src/worlds/blr_kitchen.ts `KINDS`). No cell and no run-frame line carries a
#: channel's name, so no answer may tie a figure to one (fix cycle 1: a payout answer said "Swiggy" of cells read for every
#: channel).
CHANNEL_NAMES = ("swiggy", "zomato")
#: The question whose cited reads must all be scoped to the outlet it names (fix cycle 1: both reads ran for every outlet).
SCOPED = {"Why was my Swiggy payout at Indiranagar short?": "Kosambari Indiranagar"}
#: Fix cycle 1: the payout question may honestly abstain (no cell names the channel; the 80 s budget). Every other question
#: must replay an answer, so a regression there cannot hide as an abstention.
ABSTENTION_ALLOWED = {"Why was my Swiggy payout at Indiranagar short?"}


def outlet_marks(frame: InternalRunFrameResponse) -> dict[str, tuple[str, ...]]:
    """outlet id -> how prose names it: the part of its name that tells it from the tenant's other outlets, and that part's
    first word ("Cobnut Gomti Nagar" -> "gomti nagar", "gomti")."""
    words = [o.name.lower().split() for o in frame.outlets]
    shared = set.intersection(*(set(w) for w in words)) if len(words) > 1 else set(words[0])
    out: dict[str, tuple[str, ...]] = {}
    for o, w in zip(frame.outlets, words, strict=True):
        own = [x for x in w if x not in shared]
        out[o.id.root] = (" ".join(own), own[0]) if own else ()
    return out


#: Fix cycle 1, stopped by the stop rule: on the live path (unscored route, the Manager alone) both payout recordings named
#: "Swiggy", which no cell ties, and ran past the live 80 s budget (104 s, 131 s), so live they end "cannot verify". The kept
#: one (131 s) also folds "no completed orders are missing from payouts" (missing_payouts returned no rows) into the segment
#: citing the deductions read; no check here can see that fold (it names no outlet). Strict: an honest re-record turns this
#: red until the mark is removed, and whoever removes it reads the stored text first. Its reads stay pinned by the next test.
KNOWN_DEFECT = {
    "why-was-my-swiggy-payout-at-indiranagar-short": (
        "names Swiggy, which no cell or frame line ties to a figure, and states an empty read's result (no missing payouts) "
        "inside a segment citing another read (A2 fix cycle 1)"
    ),
}
REPLAYS = [pytest.param(p, id=p.stem, marks=[pytest.mark.xfail(strict=True, reason=KNOWN_DEFECT[p.stem])] if p.stem in KNOWN_DEFECT else [])
           for p in ASKS]  # fmt: skip


@pytest.mark.parametrize("path", REPLAYS)
def test_a_live_nemotron_answer_replays_citing_minted_cells_of_its_read_and_naming_only_what_they_are_read_for(path: Path) -> None:
    recorded = json.loads(path.read_text("utf8"))
    assert recorded["model_id"].startswith("nvidia/nemotron")
    core = RecordedWorld(recorded)
    models = Models(
        LlmMimic(RecordedLlm(model="recorded/router", fixtures_dir=NEMOTRON / "decide"), adapter="recorded"),
        RecordedLlm(model="recorded/reason", fixtures_dir=NEMOTRON / "reason"),
    )
    req = ThreadsIntelAskRequest.model_validate(
        {"answer_id": vid(74), "question": recorded["question"], "addressed_to": None, "thread": None}
    )
    client = core.client()
    try:
        run(answer_ask(CTX, req, core.run_frame, client, kit_cfg(), models))
    finally:
        run(client.aclose())
    [stored] = core.answers
    env = stored["envelope"]
    if recorded["stored"]["abstained"] and recorded["question"] in ABSTENTION_ALLOWED:
        # An honest abstention (fix cycle 1: the rule is an abstention over an untied claim) replays as itself.
        assert env["abstained"] is True and env["reason_code"] == recorded["stored"]["reason_code"] and env["segments"] == []
        return
    assert env["abstained"] is False and len(env["segments"]) == recorded["stored"]["segments"] >= 1
    template, columns = EXPECT[recorded["question"]]
    marks = outlet_marks(core.run_frame)
    cited: list[tuple[str, str]] = []
    for seg in env["segments"]:
        assert check_grammar(seg["text"]) is None, "core's number grammar refuses the segment"
        refs = _SNAP.findall(seg["text"])
        assert refs and {f"snap:{sid}" for sid, _, _ in refs} == set(seg["refs"])
        tied: set[str] = set()
        for sid, row, col in refs:
            snap = core.snaps[sid]
            assert int(row) < len(snap["rows"]) and col in snap["rows"][int(row)], "a cited cell core never minted"
            cited.append((snap["template_id"], col))
            tied |= {v for v in (snap["rows"][int(row)].get("outlet_id"), snap["params"].get("outlet_id")) if isinstance(v, str)}
            if recorded["question"] in SCOPED:
                scope = next(o.id.root for o in core.run_frame.outlets if o.name == SCOPED[recorded["question"]])
                assert snap["params"].get("outlet_id") == scope, f"{snap['template_id']} was read for {snap['params'].get('outlet_id')}"
        text = seg["text"].lower()
        for outlet_id, names in marks.items():
            if any(re.search(rf"\b{re.escape(n)}\b", text) for n in names):
                assert outlet_id in tied, f"the segment names {names[0]!r} but no cited row or read is that outlet's: {seg['text']}"
        assert not any(c in text for c in CHANNEL_NAMES), f"a channel no cell names: {seg['text']}"
    assert any(t == template and c in columns for t, c in cited), f"no cell of {template} {sorted(columns)} cited: {cited}"


def test_the_live_payout_ask_reads_only_the_outlet_its_question_names() -> None:
    """Fix cycle 1 (review, major): every read of the recorded payout ask is scoped to Kosambari Indiranagar (O1), the outlet
    the question names; the cycle before, both reads ran for every outlet."""
    [path] = [p for p in ASKS if p.stem == "why-was-my-swiggy-payout-at-indiranagar-short"]
    recorded = json.loads(path.read_text("utf8"))
    core = RecordedWorld(recorded)
    models = Models(
        LlmMimic(RecordedLlm(model="recorded/router", fixtures_dir=NEMOTRON / "decide"), adapter="recorded"),
        RecordedLlm(model="recorded/reason", fixtures_dir=NEMOTRON / "reason"),
    )
    req = ThreadsIntelAskRequest.model_validate(
        {"answer_id": vid(88), "question": recorded["question"], "addressed_to": None, "thread": None}
    )
    client = core.client()
    try:
        run(answer_ask(CTX, req, core.run_frame, client, kit_cfg(), models))
    finally:
        run(client.aclose())
    scope = next(o.id.root for o in core.run_frame.outlets if o.name == SCOPED[recorded["question"]])
    assert core.snaps and {s["params"].get("outlet_id") for s in core.snaps.values()} == {scope}
