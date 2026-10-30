"""The Nemotron path (events build, P1): what a live OpenAI-compatible model POSTs for each structured and tool call, and how
its replies are read. The contract tests of tests/test_gemini_request.py, for the `nvidia` provider. Offline: bodies are caught
at httpx (`AsyncClient.send`, under the openai SDK) and answered with the raw chat-completion bodies the NVIDIA endpoint
returned to the same calls (tests/fixtures/nemotron, recorded on 24 Oct by tests/fixtures/record_nemotron.py).

Measured live (24 Oct, codes only): ADK's strict `json_schema` response format is accepted with the quote, claims and invoice
schemas and the router's enum on Nemotron, and the reply is the bare JSON; the reasoning arrives in `reasoning_content`, a
field ADK never reads. Thinking on, the router took 19 s and a claims read ran past its 30 s timeout; with the chat template's
`enable_thinking: false`, under 1 s.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from google.adk.models import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.genai import types
from pydantic import BaseModel

from munim_intel.config import Config, load_config
from munim_intel.contracts_gen.models import InternalSpendRequest, InternalTracesBatchRequest, PlatformModelRoleRow
from munim_intel.decide.mimic import LlmMimic
from munim_intel.decide.questions import ROUTE_INTENT
from munim_intel.ingest import quarantine
from munim_intel.ingest.claims import ExtractedClaims, extract_request
from munim_intel.ingest.invoice import InvoiceRead, vision_request
from munim_intel.llm import provider_of
from munim_intel.llm.providers import THINKING_MAX_TOKENS, TimedOpenAILlm, build_live_llm, strip_think
from munim_intel.llm.recorded import FIXTURES_DIR, RecordedLlm, request_key
from munim_intel.negotiate.extract import INSTRUCTION, QuoteFields
from munim_intel.runtime.context import RunContext
from munim_intel.runtime.state import RunState
from munim_intel.trace.buffer import TraceBuffer
from munim_intel.trace.served import KEY
from munim_intel.trace.spend import Meter, SpendBuffer

NVIDIA_KEY = "nvidia-test-key-not-real-0003"
NEMOTRON = Path(__file__).resolve().parent / "fixtures" / "nemotron"
INVOICE = Path(__file__).resolve().parent / "fixtures" / "invoice" / "riverbank-sample.png"
#: A committed negotiation fixture (as tests/test_gemini_request.py): the extractor reading Bargain Bulk Traders' 1 kg reply.
FIXTURE = FIXTURES_DIR / "02838d3f4c458b70f856b601c94196f267398849c5674fc28a82cdc4f9329301.json"
#: The ids `scripts/dev/nemotron-roles.ts --provider=nvidia` sets, which the fixtures were recorded on.
MODELS = {
    "router": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "reason": "nvidia/nemotron-3-ultra-550b-a55b",
    "extract": "nvidia/nemotron-3.5-super-vl-120b-a12b",
    "vision": "nvidia/nemotron-3.5-super-vl-120b-a12b",
}
CTX = RunContext(
    "01920000-0000-7000-8000-0000000000e1",
    "01920000-0000-7000-8000-0000000000f1",
    ("*",),
    "ask",
    "01920000-0000-7000-8000-0000000000d1",
    4_102_444_800,
    "not-a-token",
)


def recorded(case: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads((NEMOTRON / f"{case}.json").read_text("utf8"))
    return body


class Wire:
    """Every request the openai SDK sends (method, URL, JSON body), each answered with the next queued reply: a recorded
    chat-completion body, or an HTTP status alone."""

    def __init__(self) -> None:
        self.sent: list[tuple[httpx.URL, dict[str, Any]]] = []
        self.replies: list[dict[str, Any] | int] = []

    async def send(self, request: httpx.Request) -> httpx.Response:
        self.sent.append((request.url, json.loads(request.content)))
        reply = self.replies.pop(0)
        if isinstance(reply, int):
            return httpx.Response(reply, json={"error": {"message": "PLANTED provider text"}}, request=request)
        return httpx.Response(200, json=reply, request=request)


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch) -> Iterator[Wire]:
    w = Wire()

    async def send(_client: httpx.AsyncClient, request: httpx.Request, **_: Any) -> httpx.Response:
        return await w.send(request)

    monkeypatch.setattr(httpx.AsyncClient, "send", send)
    yield w


@pytest.fixture
def nvidia_cfg(tmp_path: Path) -> Config:
    return load_config(env={"MUNIM_MODEL_MODE": "live", "NVIDIA_API_KEY": NVIDIA_KEY}, run_dir=tmp_path)


def live(role: str, cfg: Config) -> TimedOpenAILlm:
    row = PlatformModelRoleRow.model_validate(
        {
            "role": role,
            "provider": "nvidia",
            "model_id": MODELS[role],
            "location": None,
            "input_price_per_mtok_minor": 0,
            "output_price_per_mtok_minor": 0,
            "price_currency": "INR",
            "probed_at": None,
            "updated_at": "2026-10-24T00:00:00Z",
        }
    )
    llm = build_live_llm(row, cfg)
    assert isinstance(llm, TimedOpenAILlm)
    return llm


def state_with_meter(llm: BaseLlm, role: str) -> tuple[RunState, list[InternalSpendRequest], list[InternalTracesBatchRequest]]:
    spent: list[InternalSpendRequest] = []
    traced: list[InternalTracesBatchRequest] = []

    async def spend_sink(req: InternalSpendRequest) -> object:
        spent.append(req)
        return None

    async def trace_sink(req: InternalTracesBatchRequest) -> object:
        traced.append(req)
        return None

    meter = Meter(SpendBuffer(spend_sink, "INR"), role, provider_of(llm), llm.model, None)
    return RunState(traces=TraceBuffer(trace_sink), meter=meter), spent, traced


def flush(state: RunState) -> None:
    async def go() -> None:
        await state.traces.flush()
        assert state.meter is not None
        await state.meter.buffer.flush()

    asyncio.run(go())


QUARANTINED: dict[str, tuple[str, Callable[[BaseLlm], LlmRequest], type[BaseModel]]] = {
    "quote": (
        "extract",
        lambda llm: quarantine.build_request(llm, INSTRUCTION, [types.Part(text="a supplier's reply")], QuoteFields),
        QuoteFields,
    ),
    "claims": ("extract", lambda llm: extract_request(llm, "a document's text"), ExtractedClaims),
    "invoice": ("vision", lambda llm: vision_request(llm, INVOICE.read_bytes(), "image/png"), InvoiceRead),
}


@pytest.mark.parametrize("case", list(QUARANTINED))
def test_a_quarantined_schema_goes_to_nemotron_as_strict_json_schema_with_thinking_off(wire: Wire, nvidia_cfg: Config, case: str) -> None:
    role, build, schema = QUARANTINED[case]
    llm = live(role, nvidia_cfg)
    wire.replies.append(recorded(case)["response"])
    state, spent, traced = state_with_meter(llm, role)
    got = asyncio.run(quarantine.call(llm, build(llm), schema, state, role=role))  # type: ignore[arg-type]
    flush(state)
    [(url, body)] = wire.sent
    assert (url.host, url.path) == ("integrate.api.nvidia.com", "/v1/chat/completions")
    assert body["model"] == llm.model and not body.get("tools")
    fmt = body["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True
    full = quarantine._inline(schema.model_json_schema())
    assert set(fmt["json_schema"]["schema"]["properties"]) == set(full["properties"])
    assert fmt["json_schema"]["schema"]["additionalProperties"] is False
    # Thinking off on every role but `reason` (llm/providers.py module doc).
    assert body["chat_template_kwargs"] == {"enable_thinking": False}
    # The recorded Nemotron reply reads as the schema, and the reasoning field never reaches the text.
    assert isinstance(got, schema)
    assert [(r.provider, r.model_id) for req in spent for r in req.entries] == [("nvidia", llm.model)]
    [route] = [e.model_dump(mode="json")["payload"] for req in traced for e in req.events if e.kind == "route"]
    assert route == {"model_path": "live", "provider": "nvidia", "model_id": llm.model}


def test_the_sample_invoice_reads_back_as_printed(wire: Wire, nvidia_cfg: Config) -> None:
    """The committed sample invoice (synthetic), as Nemotron VL read it: the supplier, number, date and both lines as typed."""
    llm = live("vision", nvidia_cfg)
    wire.replies.append(recorded("invoice")["response"])
    state, _, _ = state_with_meter(llm, "vision")
    read = asyncio.run(quarantine.call(llm, vision_request(llm, INVOICE.read_bytes(), "image/png"), InvoiceRead, state, role="vision"))
    assert (read.supplier_name, read.invoice_no, read.invoice_date) == ("Riverbank Dairy (simulated)", "RBD-2026-1047", "2026-10-22")
    assert [(x.description, x.qty, x.unit, x.unit_price, x.tax) for x in read.lines] == [
        ("Butter (synthetic)", "10", "kg", "610.00", "732.00"),
        ("Fresh cream (synthetic)", "6", "l", "180.00", "54.00"),
    ]


def test_the_router_enum_goes_as_strict_json_schema_and_answers_a_code(wire: Wire, nvidia_cfg: Config) -> None:
    llm = live("router", nvidia_cfg)
    wire.replies.append(recorded("router")["response"])
    state = {"question": "Why did butter cost more this week?", "outlet_kinds": ("restaurant",), "country": "IN"}
    [d] = asyncio.run(LlmMimic(llm).decide(CTX, state, [ROUTE_INTENT]))  # type: ignore[arg-type]
    [(_, body)] = wire.sent
    fmt = body["response_format"]["json_schema"]
    assert fmt["strict"] is True and fmt["schema"]["properties"]["answer"]["enum"] == ["A", "B", "C", "D", "E", "F"]
    assert body["chat_template_kwargs"] == {"enable_thinking": False}
    # No logprobs on this path (mimic.py): an unscored answer, served live.
    assert d.answer in ROUTE_INTENT.options and d.band == "unscored" and d.model_path == "live" and d.provider == "nvidia"


def test_reason_keeps_thinking_with_room_to_answer_and_its_reasoning_never_reaches_the_parts(wire: Wire, nvidia_cfg: Config) -> None:
    llm = live("reason", nvidia_cfg)
    fixture = recorded("reason_tool")["response"]
    wire.replies.append(fixture)
    config = types.GenerateContentConfig(
        system_instruction="Answer with the tool.",
        tools=[
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name="sales_for_day",
                        description="d",
                        parameters_json_schema={"type": "object", "properties": {"day": {"type": "string"}}},
                    )
                ]
            )
        ],
    )
    req = LlmRequest(model=llm.model, contents=[types.Content(role="user", parts=[types.Part(text="q")])], config=config)

    async def go() -> list[Any]:
        return [r async for r in llm.generate_content_async(req)]

    [resp] = asyncio.run(go())
    [(_, body)] = wire.sent
    assert "chat_template_kwargs" not in body and body["max_tokens"] == THINKING_MAX_TOKENS
    assert [t["function"]["name"] for t in body["tools"]] == ["sales_for_day"]
    [part] = resp.content.parts
    assert part.function_call.name == "sales_for_day" and part.function_call.args == {"day": "2026-10-20"}
    reasoning = fixture["choices"][0]["message"]["reasoning_content"]
    assert reasoning and reasoning not in json.dumps(resp.model_dump(mode="json"))
    assert resp.custom_metadata[KEY] == "live"


@pytest.mark.parametrize(
    ("text", "kept"),
    [
        ('<think>CANARY reasoning</think>{"a": 1}', '{"a": 1}'),
        ('CANARY reasoning</think>\n{"a": 1}', '{"a": 1}'),
        ('{"a": 1}<think>CANARY cut off mid-way', '{"a": 1}'),
        ('{"a": 1}', '{"a": 1}'),
    ],
    ids=["block", "opened-in-prompt", "cut-off", "none"],
)
def test_inlined_reasoning_is_cut(text: str, kept: str) -> None:
    assert strip_think(text) == kept


def test_a_reply_with_inlined_reasoning_still_reads_as_its_schema(wire: Wire, nvidia_cfg: Config) -> None:
    """A provider that inlines its reasoning (Token Factory may; NVIDIA's endpoint sends it apart) is read without it."""
    llm = live("extract", nvidia_cfg)
    reply = recorded("quote")["response"]
    msg = reply["choices"][0]["message"]
    msg["content"] = "<think>CANARY-THINK the price is 575</think>" + msg["content"]
    wire.replies.append(reply)
    state, _, traced = state_with_meter(llm, "extract")
    got = asyncio.run(quarantine.call(llm, QUARANTINED["quote"][1](llm), QuoteFields, state))
    flush(state)
    assert isinstance(got, QuoteFields) and got.unit_price_minor == 57_500
    assert "CANARY-THINK" not in json.dumps([r.model_dump(mode="json") for r in traced])


def test_a_reply_off_its_schema_is_asked_for_once_more_naming_places_not_values(wire: Wire, nvidia_cfg: Config) -> None:
    """The retry (ingest/quarantine.py): one more call, budgeted, charged and traced, whose added line names what was wrong by
    place and kind; the reply's own values (untrusted, rule 8) never go back. Paired: two misses are Unreadable after two calls."""
    llm = live("extract", nvidia_cfg)
    good = recorded("quote")["response"]
    bad = json.loads(json.dumps(good))
    bad["choices"][0]["message"]["content"] = json.dumps({"unit_price_minor": "CANARY-VALUE", "qty_milli": 10000})
    wire.replies += [bad, good]
    state, spent, traced = state_with_meter(llm, "extract")
    got = asyncio.run(quarantine.call(llm, QUARANTINED["quote"][1](llm), QuoteFields, state))
    flush(state)
    assert isinstance(got, QuoteFields) and got.unit_price_minor == 57_500
    first, second = (body for _, body in wire.sent)
    note = second["messages"][-1]
    assert second["messages"][:-1] == first["messages"] and note["role"] == "user"
    assert "unit_price_minor: int_type" in note["content"] and "min_order_qty_milli: missing" in note["content"]
    assert "CANARY-VALUE" not in json.dumps(second)
    assert state.budget.model_calls == 2 and sum(len(r.entries) for r in spent) == 2
    assert [e.payload for req in traced for e in req.events if e.kind == "route"] and len(
        [e for req in traced for e in req.events if e.kind == "route"]
    ) == 2

    wire.sent.clear()
    wire.replies += [bad, bad]
    state, spent, _ = state_with_meter(llm, "extract")
    with pytest.raises(quarantine.Unreadable):
        asyncio.run(quarantine.call(llm, QUARANTINED["quote"][1](llm), QuoteFields, state))
    flush(state)
    assert len(wire.sent) == 2 and state.budget.model_calls == 2 and sum(len(r.entries) for r in spent) == 2


def test_a_refused_nemotron_call_is_still_served_from_its_committed_fixture(wire: Wire, nvidia_cfg: Config) -> None:
    """As on Gemini (T-125): the caller's request is untouched, so a 400 from the endpoint is served from the fixture recorded
    mode authored under the request's own key."""
    fixture = json.loads(FIXTURE.read_text("utf8"))
    [text] = [p["text"] for c in fixture["request"]["contents"] for p in c["parts"]]
    llm = live("extract", nvidia_cfg)
    llm.fallback = RecordedLlm(model="recorded/extract", fixtures_dir=FIXTURES_DIR)
    req = quarantine.build_request(llm, INSTRUCTION, [types.Part(text=text)], QuoteFields)
    assert request_key(req.model_copy(update={"model": "recorded/extract"}))[0] == FIXTURE.stem
    wire.replies.append(400)

    async def go() -> list[Any]:
        return [r async for r in llm.generate_content_async(req)]

    responses = asyncio.run(go())
    assert len(wire.sent) == 1, "the provider was called once"
    assert [r.content.parts[0].text for r in responses] == [fixture["responses"][0]["content"]["parts"][0]["text"]]
    assert responses[0].custom_metadata[KEY] == "recorded-fallback"
    assert (
        isinstance(req.config.response_schema, dict)
        and request_key(req.model_copy(update={"model": "recorded/extract"}))[0] == FIXTURE.stem
    )


def test_the_recorded_nemotron_fixtures_hold_no_key_and_name_a_nemotron_model() -> None:
    files = sorted(NEMOTRON.glob("*.json"))
    assert {f.stem for f in files} == {"quote", "claims", "invoice", "invoice_hazelnut", "router", "reason_tool"}
    for f in files:
        text = f.read_text("utf8")
        assert "Bearer" not in text and "api_key" not in text and "account" not in text.lower()
        d = json.loads(text)
        assert d["model_id"] == MODELS[d["role"]] and "nemotron" in d["response"]["model"]
