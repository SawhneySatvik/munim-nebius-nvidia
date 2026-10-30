"""Under the `nebius` configuration (EV-3: every model role on Token Factory, the provider the Nebius rules count), no model
call leaves `api.tokenfactory.nebius.com`. Offline: every request the model clients send is caught at httpx (under the openai
SDK and google-genai alike) and answered with a recorded Nemotron body; the gate reads the host of each one.

Each role is built as a run builds it (`llm_for_role`, from the model roles core serves) and called through its own call site:
the router through the DecisionModel, extract and vision through the quarantine, reason and narrate as an agent's model step.
Paired red-proof: the same configuration with one role planted on `nvidia` is caught, naming the host it reached.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from google.adk.models.llm_request import LlmRequest
from google.genai import types

from munim_intel.config import Config, load_config
from munim_intel.contracts_gen.models import PlatformModelRoles
from munim_intel.decide.mimic import LlmMimic
from munim_intel.decide.questions import ROUTE_INTENT
from munim_intel.ingest import quarantine
from munim_intel.ingest.invoice import InvoiceRead, vision_request
from munim_intel.llm import llm_for_role, provider_of
from munim_intel.llm.providers import PROVIDERS, TimedOpenAILlm
from munim_intel.negotiate.extract import INSTRUCTION, QuoteFields
from munim_intel.runtime.context import RunContext
from munim_intel.runtime.state import RunState
from munim_intel.trace.buffer import TraceBuffer

TOKEN_FACTORY = "api.tokenfactory.nebius.com"
NEMOTRON = Path(__file__).resolve().parent / "fixtures" / "nemotron"
INVOICE = Path(__file__).resolve().parent / "fixtures" / "invoice" / "riverbank-sample.png"
#: Token Factory's ids (scripts/dev/nemotron-roles.ts --provider=nebius; catalogue of 17 Oct, UNVERIFIED without a key).
NEBIUS_IDS = {
    "router": "nvidia/Nemotron-3_5-Lightning",
    "narrate": "nvidia/Nemotron-3.5-Super-VL",
    "reason": "nvidia/nemotron-3-super-120b-a12b",
    "extract": "nvidia/Nemotron-3.5-Super-VL",
    "vision": "nvidia/Nemotron-3.5-Super-VL",
}
#: Which recorded Nemotron body answers a call, by the response schema's first property (none: an agent's model step).
REPLY = {"answer": "router", "unit_price_minor": "quote", "transcript": "invoice"}
CTX = RunContext(
    "01920000-0000-7000-8000-0000000000e1",
    "01920000-0000-7000-8000-0000000000f1",
    ("*",),
    "ask",
    "01920000-0000-7000-8000-0000000000d1",
    4_102_444_800,
    "not-a-token",
)


def roles(planted: dict[str, str] | None = None) -> PlatformModelRoles:
    """The nebius configuration, each role priced 0 INR; `planted` moves a role to another provider (the red-proof)."""
    providers = {role: "nebius" for role in NEBIUS_IDS} | (planted or {})
    return PlatformModelRoles.model_validate(
        {
            "items": [
                {
                    "role": role,
                    "provider": providers[role],
                    "model_id": model_id,
                    "location": None,
                    "input_price_per_mtok_minor": 0,
                    "output_price_per_mtok_minor": 0,
                    "price_currency": "INR",
                    "probed_at": None,
                    "updated_at": "2026-10-24T00:00:00Z",
                }
                for role, model_id in NEBIUS_IDS.items()
            ]
        }
    )


class Roles:
    def __init__(self, r: PlatformModelRoles) -> None:
        self.r = r

    async def model_roles(self) -> PlatformModelRoles:
        return self.r


@pytest.fixture
def keyed(tmp_path: Path) -> Config:
    env = {"MUNIM_MODEL_MODE": "live", "NEBIUS_API_KEY": "nebius-test-key-not-real-0004", "NVIDIA_API_KEY": "nvidia-test-key-not-real-0003"}
    return load_config(env=env, run_dir=tmp_path)


@pytest.fixture
def hosts(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """The host of every HTTP request a model client sends; each answered with the recorded Nemotron body for its role."""
    seen: list[str] = []

    async def send(_client: httpx.AsyncClient, request: httpx.Request, **_: Any) -> httpx.Response:
        seen.append(request.url.host)
        fmt = json.loads(request.content).get("response_format") or {}
        first = next(iter(fmt.get("json_schema", {}).get("schema", {}).get("properties", {"": None})))
        body = json.loads((NEMOTRON / f"{REPLY.get(first, 'reason_tool')}.json").read_text("utf8"))["response"]
        return httpx.Response(200, json=body, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "send", send)
    return seen


async def call_every_role(cfg: Config, source: Roles) -> list[str]:
    """Each role built from `source` as a run builds it, called through its own call site; the roles called."""
    called: list[str] = []
    for role in NEBIUS_IDS:
        llm = await llm_for_role(role, cfg, source, currency="INR")  # type: ignore[arg-type]
        state = RunState(traces=TraceBuffer(_drop))
        if role == "router":
            await LlmMimic(llm).decide(
                CTX, {"question": "Why did butter cost more?", "outlet_kinds": ("restaurant",), "country": "IN"}, [ROUTE_INTENT]
            )
        elif role == "extract":
            await quarantine.call(
                llm, quarantine.build_request(llm, INSTRUCTION, [types.Part(text="a reply")], QuoteFields), QuoteFields, state
            )
        elif role == "vision":
            await quarantine.call(llm, vision_request(llm, INVOICE.read_bytes(), "image/png"), InvoiceRead, state, role="vision")
        else:
            req = LlmRequest(
                model=llm.model, contents=[types.Content(role="user", parts=[types.Part(text="q")])], config=types.GenerateContentConfig()
            )
            [_ async for _ in llm.generate_content_async(req)]
        called.append(role)
    return called


async def _drop(_req: Any) -> object:
    return None


def left_token_factory(seen: list[str]) -> list[str]:
    """The gate: every host a model call reached that is not Token Factory's."""
    return [h for h in seen if h != TOKEN_FACTORY]


def test_under_the_nebius_configuration_no_model_call_leaves_token_factory(keyed: Config, hosts: list[str]) -> None:
    called = asyncio.run(call_every_role(keyed, Roles(roles())))
    # A positive count, independent of the gate: one request per role called (five roles, by hand).
    assert called == ["router", "narrate", "reason", "extract", "vision"] and len(hosts) == 5
    assert left_token_factory(hosts) == []


def test_paired_a_role_planted_on_nvidia_is_caught_by_the_same_gate(keyed: Config, hosts: list[str]) -> None:
    asyncio.run(call_every_role(keyed, Roles(roles({"narrate": "nvidia"}))))
    assert len(hosts) == 5 and left_token_factory(hosts) == ["integrate.api.nvidia.com"]


def test_nebius_is_token_factory_with_its_own_key_and_never_repoints_nvidia(keyed: Config) -> None:
    assert PROVIDERS["nebius"].key_name == "NEBIUS_API_KEY" and PROVIDERS["nvidia"].key_name == "NVIDIA_API_KEY"
    assert httpx.URL(PROVIDERS["nebius"].base_url or "").host == TOKEN_FACTORY
    assert httpx.URL(PROVIDERS["nvidia"].base_url or "").host == "integrate.api.nvidia.com"
    llm = asyncio.run(llm_for_role("extract", keyed, Roles(roles()), currency="INR"))
    assert isinstance(llm, TimedOpenAILlm) and provider_of(llm) == "nebius" and llm.model == NEBIUS_IDS["extract"]
    no_key = load_config(env={"MUNIM_MODEL_MODE": "live"}, run_dir=keyed.run_dir)
    with pytest.raises(Exception, match="NEBIUS_API_KEY is not set"):
        asyncio.run(llm_for_role("extract", no_key, Roles(roles()), currency="INR"))
