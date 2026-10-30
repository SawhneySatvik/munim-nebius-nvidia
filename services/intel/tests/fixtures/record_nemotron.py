"""Records the Nemotron fixtures (`tests/fixtures/nemotron/<case>.json`) that `tests/test_openai_request.py` replays: the raw
chat-completion body the NVIDIA endpoint answered to each of Munim's structured and tool calls, captured at the HTTP layer
under the live classes (`llm/providers.py`). Live and by hand only (never a gate):

    MUNIM_MODEL_MODE=live uv run python tests/fixtures/record_nemotron.py

The key loads through munim_intel.config and is never printed; a body that contains it is refused before it is written. Each
fixture keeps the response only (its request is rebuilt by the test from the same code), plus the case's model id and role.
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx
from google.adk.models import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.genai import types

from munim_intel.config import Config, load_repo_config
from munim_intel.contracts_gen.models import PlatformModelRoleRow
from munim_intel.decide.mimic import build_request as router_request
from munim_intel.decide.questions import ROUTE_INTENT
from munim_intel.ingest import quarantine
from munim_intel.ingest.claims import extract_request
from munim_intel.ingest.invoice import vision_request
from munim_intel.llm.providers import build_live_llm
from munim_intel.negotiate.extract import INSTRUCTION, QuoteFields

INTEL = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "nemotron"
INVOICE = Path(__file__).resolve().parent / "invoice" / "riverbank-sample.png"
#: NB-6: the hero chain's one item (SYNTHETIC; tests/ingest/test_ingest_route.py replays its read).
HAZELNUT = Path(__file__).resolve().parent / "invoice" / "lalbagh-hazelnut.png"
#: The ids `scripts/dev/nemotron-roles.ts --provider=nvidia` sets (probed 24 Oct).
MODELS = {
    "router": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "reason": "nvidia/nemotron-3-ultra-550b-a55b",
    "extract": "nvidia/nemotron-3.5-super-vl-120b-a12b",
    "vision": "nvidia/nemotron-3.5-super-vl-120b-a12b",
}
QUOTE_REPLY = "Hello from Riverbank Dairy (simulated). Butter (synthetic): INR 575.00 per kg for 10 kg, minimum order 5 kg, net 15 days."
CLAIMS_TEXT = "Riverbank Dairy (simulated) price list, October. Butter (synthetic) 1 kg: INR 590.00. Minimum order 5 kg."
SALES_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="sales_for_day",
            description="Net sales for one business day at the outlet, as a snapshot ref.",
            parameters_json_schema={
                "type": "object",
                "properties": {"day": {"type": "string", "description": "YYYY-MM-DD"}},
                "required": ["day"],
                "additionalProperties": False,
            },
        )
    ]
)


def live(role: str, cfg: Config) -> BaseLlm:
    row = PlatformModelRoleRow.model_validate(
        {
            "role": role,
            "provider": "nvidia",
            "model_id": MODELS[role],
            "location": None,
            "input_price_per_mtok_minor": None,
            "output_price_per_mtok_minor": None,
            "price_currency": None,
            "probed_at": None,
            "updated_at": "2026-10-24T00:00:00Z",
        }
    )
    return build_live_llm(row, cfg)


def reason_request(llm: BaseLlm) -> LlmRequest:
    config = types.GenerateContentConfig(system_instruction="Answer with the tool. Never type a number yourself.", tools=[SALES_TOOL])
    question = types.Content(role="user", parts=[types.Part(text="What were net sales on 2026-10-20?")])
    return LlmRequest(model=llm.model, contents=[question], config=config)


CASES: dict[str, tuple[str, Callable[[BaseLlm], LlmRequest]]] = {
    "quote": ("extract", lambda llm: quarantine.build_request(llm, INSTRUCTION, [types.Part(text=QUOTE_REPLY)], QuoteFields)),
    "claims": ("extract", lambda llm: extract_request(llm, CLAIMS_TEXT)),
    "invoice": ("vision", lambda llm: vision_request(llm, INVOICE.read_bytes(), "image/png")),
    "invoice_hazelnut": ("vision", lambda llm: vision_request(llm, HAZELNUT.read_bytes(), "image/png")),
    "router": (
        "router",
        lambda llm: router_request(
            llm,
            ROUTE_INTENT,
            {"question": "Why did butter cost more this week?", "outlet_kinds": ("restaurant",), "country": "IN"},
            logprobs=False,
        ),
    ),
    "reason_tool": ("reason", reason_request),
}


async def record(case: str, cfg: Config, key: str) -> None:
    role, build = CASES[case]
    llm = live(role, cfg)
    bodies: list[dict[str, Any]] = []
    real = httpx.AsyncClient.send

    async def capture(self: httpx.AsyncClient, request: httpx.Request, **kw: Any) -> httpx.Response:
        resp = await real(self, request, **kw)
        await resp.aread()
        bodies.append(resp.json())
        return resp

    httpx.AsyncClient.send = capture  # type: ignore[method-assign]
    try:
        last = None
        async for r in llm.generate_content_async(build(llm)):
            last = r
    finally:
        httpx.AsyncClient.send = real  # type: ignore[method-assign]
    [body] = bodies
    text = json.dumps({"case": case, "role": role, "model_id": MODELS[role], "response": body}, ensure_ascii=False, indent=2) + "\n"
    if key in text:
        raise SystemExit(f"{case}: the response holds the key; not written")
    (OUT / f"{case}.json").write_text(text, "utf8")
    usage = body.get("usage") or {}
    print(
        f"{case:<12} {MODELS[role]:<42} finish={body['choices'][0]['finish_reason']} usage={usage.get('prompt_tokens')}/"
        f"{usage.get('completion_tokens')} error_code={getattr(last, 'error_code', None)}"
    )


def main() -> int:
    cfg = load_repo_config(INTEL.parents[1])
    key = cfg.provider_key("NVIDIA_API_KEY")
    if cfg.model_mode != "live" or key is None:
        print("record_nemotron: needs MUNIM_MODEL_MODE=live and NVIDIA_API_KEY")
        return 2
    OUT.mkdir(exist_ok=True)
    runs: list[Awaitable[None]] = [record(c, cfg, key) for c in (sys.argv[1:] or CASES)]
    asyncio.run(_all(runs))
    return 0


async def _all(runs: list[Awaitable[None]]) -> None:
    for r in runs:
        await r


if __name__ == "__main__":
    sys.exit(main())
