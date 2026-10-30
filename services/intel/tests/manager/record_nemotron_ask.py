"""A2 (events build): records the Nemotron Ask fixtures that tests/manager/test_nemotron_ask.py replays. Live and by hand only,
never a gate:

    MUNIM_MODEL_MODE=live uv run --frozen python tests/manager/record_nemotron_ask.py --world=cobnut --intent=lookup --question="..."

One Manager ask through the real `answer_ask` with the live `reason` model (Nemotron Ultra on the NVIDIA endpoint; the key loads
through munim_intel.config and is never printed), on a world seeded on the LOCAL stack: it refuses unless core-api says
`idp: "local"`. The route intent is given, not asked: the router's live pick is not what this pins, so its fixture is synthetic,
and unscored (no logprobs), as the live router on the NVIDIA endpoint is. Every snapshot is minted by core's member API as
the world's demo owner (`POST /staff/demo-session` on the world's web port; the token stays in memory), so the rows are the
world's and core checks every parameter. Written under fixtures/nemotron/:
  reason/<key>.json   each Manager step: the request as `recorded/reason` sees it, and Nemotron's reply as it came (its usage
                      and served path dropped: they are this call's, not a replay's);
  decide/<key>.json   the question's route fixture;
  asks/<slug>.json    the run frame, the question and intent, every snapshot core minted (template, params, columns, rows) and
                      what the run stored (abstained, reason code, segments).
The business date is each outlet's own: now in its zone, less its business-day cutoff (both from core's outlet record).
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from munim_intel.config import Config, load_repo_config
from munim_intel.contracts_gen.models import InternalRunFrameResponse, PlatformModelRoleRow, ThreadsIntelAskRequest
from munim_intel.decide.mimic import LlmMimic, build_request, codes_for
from munim_intel.decide.port import DecisionState
from munim_intel.decide.questions import ROUTE_INTENT
from munim_intel.llm.providers import TimedOpenAILlm, build_live_llm
from munim_intel.llm.recorded import RecordedLlm, request_key
from munim_intel.manager.ask import Models, answer_ask
from munim_intel.runtime.context import RunContext
from munim_intel.runtime.internal_client import InternalClient
from munim_intel.tools.generated import uuid7

HERE = Path(__file__).resolve().parent
OUT = HERE / "fixtures" / "nemotron"
DECIDE, REASON, ASKS = OUT / "decide", OUT / "reason", OUT / "asks"
CORE = "http://127.0.0.1:8787"
#: world -> (its web port on the local stack, its country pack).
WORLDS = {"cobnut": (3000, "IN"), "blr_kitchen": (3001, "IN")}
#: The id `scripts/dev/nemotron-roles.ts --provider=nvidia` sets for `reason` (probed 24 Oct).
REASON_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"


def slug(question: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", question.lower()).strip("-")[:60]


def write_route(question: str, intent: str, kinds: tuple[str, ...], country: str) -> None:
    """The question's route fixture: the intent's code with no logprobs, so the band is `unscored`, as the live router on the
    NVIDIA endpoint answers (OpenAILlm returns no logprobs). Fix cycle 1: a scored fixture sent an `investigate` question down
    the fan-out path and its six-call orchestrator cap, which the live ask never takes."""
    code = next(c for c, o in codes_for(ROUTE_INTENT).items() if o == intent)
    resp = LlmResponse(content=types.Content(role="model", parts=[types.Part(text=code)]))
    state: DecisionState = {"question": question, "outlet_kinds": kinds, "country": country}
    key, canonical, _ = request_key(build_request(RecordedLlm(model="recorded/router", fixtures_dir=DECIDE), ROUTE_INTENT, state))
    body = {"request": json.loads(canonical), "responses": [resp.model_dump(mode="json", exclude_none=True)]}
    (DECIDE / f"{key}.json").write_text(json.dumps(body, ensure_ascii=False, indent=1, sort_keys=True) + "\n", "utf8")


class Writer(TimedOpenAILlm):
    """The live reason model; each call's request (as `recorded/reason` would see it) and reply are written as a fixture."""

    secret: str = ""
    steps: int = 0

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        key, canonical, _ = request_key(llm_request.model_copy(update={"model": "recorded/reason"}))
        t0 = time.monotonic()
        replies = [r async for r in super().generate_content_async(llm_request, stream)]
        kept = [r.model_copy(update={"usage_metadata": None, "custom_metadata": None}) for r in replies]
        body = {"request": json.loads(canonical), "responses": [r.model_dump(mode="json", exclude_none=True) for r in kept]}
        text = json.dumps(body, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
        if self.secret and self.secret in text:
            raise SystemExit("record_nemotron_ask: a reply holds the key; nothing written")
        (REASON / f"{key}.json").write_text(text, "utf8")
        self.steps += 1
        for r in kept:
            for p in r.content.parts if r.content and r.content.parts else []:
                what = f"call {p.function_call.name}" if p.function_call else "text"
                print(f"  step {self.steps} ({time.monotonic() - t0:.1f} s): {what}")
        for r in replies:
            yield r


def arg(name: str) -> str:
    """`--name=value` only (gotcha 17: `--name value` is refused, never read as the default)."""
    found = [a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith(f"--{name}=")]
    if len(found) != 1 or not found[0]:
        raise SystemExit(f"usage: --world=<{'|'.join(WORLDS)}> --intent=<lookup|explain|investigate> --question=<text> (missing --{name}=)")
    return found[0]


def business_date(outlet: dict[str, Any]) -> str:
    h, m, s = (int(x) for x in str(outlet["business_day_cutoff"]).split(":"))
    return (datetime.now(ZoneInfo(outlet["tz"])) - timedelta(hours=h, minutes=m, seconds=s)).date().isoformat()


async def main() -> None:
    world, intent, question = arg("world"), arg("intent"), arg("question")
    if world not in WORLDS or intent not in ("lookup", "explain", "investigate"):
        raise SystemExit("record_nemotron_ask: unknown --world or --intent")
    if unknown := [a for a in sys.argv[1:] if not re.match(r"^--(world|intent|question)=", a)]:
        raise SystemExit(f"record_nemotron_ask: unknown argument {unknown[0].split('=')[0]}")
    cfg: Config = load_repo_config(HERE.parents[3])
    key = cfg.provider_key("NVIDIA_API_KEY")
    if cfg.model_mode != "live" or key is None:
        raise SystemExit("record_nemotron_ask: needs MUNIM_MODEL_MODE=live and NVIDIA_API_KEY")
    if httpx.get(f"{CORE}/health").json().get("idp") != "local":
        raise SystemExit("record_nemotron_ask: core-api is not the local stack; refusing")
    port, country = WORLDS[world]
    session = httpx.post(f"http://127.0.0.1:{port}/staff/demo-session", json={"person": "owner"}, timeout=30).json()
    auth = {"authorization": f"Bearer {session['token']}", "x-munim-tenant": session["tenant_id"]}
    outlets = httpx.get(f"{CORE}/v1/outlets", headers=auth).json()["outlets"]
    frame = InternalRunFrameResponse.model_validate(
        {
            "pack": {"code": country, "version": 3},
            "currency": "INR",
            "severity_ladder": {"critical_minor_gte": 5_000_000, "high_minor_gte": 1_000_000, "medium_minor_gte": 100_000},
            "detectors": {},
            "outlets": [
                {"id": o["id"], "name": o["name"], "kind": o["kind"], "tz": o["tz"], "business_date": business_date(o)} for o in outlets
            ],
            "budget": None,
            "narration": "model",
            "licence_kinds": [],
            "payroll_scope": "drafts",
            "negotiation": {"target_bp": 9500, "walkaway_bp": 11000},
        }
    )
    snapshots: list[dict[str, Any]] = []
    stored: dict[str, Any] = {}

    def core(request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/internal/intel/v1/")
        body = json.loads(request.content.decode() or "{}")
        if path == "snapshots":
            r = httpx.post(f"{CORE}/v1/snapshots", json=body, headers=auth, timeout=30)
            if r.is_success:
                snap = r.json()
                snapshots.append({k: snap[k] for k in ("template_id", "params", "columns", "rows")})
            print(f"  mint {body['template_id']} -> {r.status_code}")
            return httpx.Response(r.status_code, content=r.content)
        if path == "answers":
            stored.update(body["envelope"])
            return httpx.Response(201, json={"answer_id": body["envelope"]["answer_id"], "abstained": body["envelope"]["abstained"],
                                             "reason_code": body["envelope"].get("reason_code")})  # fmt: skip
        if path == "traces:batch":
            return httpx.Response(201, json={"inserted": len(body["events"]), "last_seq": 0})
        if path == "spend":
            return httpx.Response(201, json={"inserted": len(body["entries"]), "existing": 0})
        return httpx.Response(404, json={"error": {"code": "not_found", "message": "not_found", "reason_code": None}})

    for d in (DECIDE, REASON, ASKS):
        d.mkdir(parents=True, exist_ok=True)
    kinds = tuple(sorted({o.kind for o in frame.outlets}))
    write_route(question, intent, kinds, country)
    row = PlatformModelRoleRow.model_validate(
        {"role": "reason", "provider": "nvidia", "model_id": REASON_MODEL, "location": None, "input_price_per_mtok_minor": None,
         "output_price_per_mtok_minor": None, "price_currency": None, "probed_at": None, "updated_at": "2026-10-24T00:00:00Z"}
    )  # fmt: skip
    live = build_live_llm(row, cfg)
    assert isinstance(live, TimedOpenAILlm)
    reason = Writer(
        model=live.model, api_key=key, base_url=live.base_url, timeout_s=live.timeout_s, extra_body=live.extra_body,
        max_tokens=live.max_tokens, secret=key,
    )  # fmt: skip
    models = Models(LlmMimic(RecordedLlm(model="recorded/router", fixtures_dir=DECIDE), adapter="recorded"), reason)
    now = int(time.time() * 1000)
    run_id = uuid7(now, str(uuid.uuid4()))
    ctx = RunContext(run_id, session["tenant_id"], ("*",), "ask", str(uuid.uuid4()), int(time.time()) + 600, "recorder")
    client = InternalClient(ctx, base_url="http://core.recorder", service_secret="recorder", transport=httpx.MockTransport(core))
    req = ThreadsIntelAskRequest.model_validate(
        {"answer_id": uuid7(now, f"answer-{run_id}"), "question": question, "addressed_to": None, "thread": None}
    )
    print(f"record_nemotron_ask: {world}, {intent}: {question}")
    t0 = time.monotonic()
    await answer_ask(ctx, req, frame, client, cfg, models)
    out = {
        "world": world,
        "question": question,
        "intent": intent,
        "model_id": REASON_MODEL,
        "recorded_on": frame.outlets[0].business_date,
        "frame": frame.model_dump(mode="json"),
        "snapshots": snapshots,
        "stored": {
            "abstained": stored.get("abstained"),
            "reason_code": stored.get("reason_code"),
            "segments": len(stored.get("segments") or []),
        },
    }
    (ASKS / f"{slug(question)}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf8")
    print(f"record_nemotron_ask: {reason.steps} reason calls, {time.monotonic() - t0:.1f} s; stored {out['stored']}")


if __name__ == "__main__":
    asyncio.run(main())
