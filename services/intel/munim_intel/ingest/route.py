"""`POST /ingest` (NB-6): a member's supplier-invoice upload, read into a draft. core-api's `POST /v1/imports/invoices` stores
the document (blob port, core.document kind `supplier_invoice`), mints an `ingest` run (actor = the member, scope '*': an
invoice draft is tenant-wide) and calls this route with the bytes, the tenant's currency and the names intel may link by exact
alias (core's supplier and ingredient names; `link.py`). Only core mints the token (rule 15); the tenant is the token's alone.

  1. The run-frame: with AI off or no budget for the month no page is read (`model_blocked`, rule 11); over the month's cap
     with AI on the vision model is built capped (T-127), as the negotiation's models are.
  2. `Ingest.invoice`: the vision role reads the page in the quarantine (no tools, a schema; rule 8), the read becomes a
     `purchasing.invoice.record.v1` draft whose every number is a span of the page's transcript, and core's
     `/internal/intel/v1` stores the transcript's chunks and then the draft (R25). Any figure not on the page, an unlinked
     supplier or an unreadable line withholds the whole draft (`abstained`).
  3. Nothing is recorded here: a named person approves the draft, typing each number beside its span (R16, R26).

The answer is ids and a status code only. The page's text and the model's read never leave in it, in a log or in a trace
(traces carry ids, counts and codes: pipeline.py). Every refusal of a caller is the same 401, as in app.py.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import logging
import time
from collections.abc import Awaitable, Callable

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google.adk.models import BaseLlm
from pydantic import ValidationError

from munim_intel.config import Config, ConfigError
from munim_intel.contracts_gen.models import InternalIngestRequest, InternalRunFrameResponse
from munim_intel.ingest.embed import RecordedEmbedder
from munim_intel.ingest.link import Alias, AliasTable
from munim_intel.ingest.pipeline import Ingest
from munim_intel.ingest.quarantine import quarantined_llm
from munim_intel.ingest.sink import CoreSink
from munim_intel.llm import cause, frame_over_cap, price_of, provider_of
from munim_intel.llm.providers import ProviderUnavailable, RetiredModelRefused
from munim_intel.manager.ask import fetch_run_frame
from munim_intel.runtime.context import RunContext, RunTokenRefused, load_public_key, verify_run_token
from munim_intel.runtime.internal_client import SERVICE_SECRET_HEADER, CoreError, InternalClient
from munim_intel.runtime.state import Budget, RunState
from munim_intel.trace.buffer import TraceBuffer
from munim_intel.trace.spend import Meter, SpendBuffer, spend_currency

log = logging.getLogger("munim_intel.ingest")

#: F8: supplier invoices are the inventory & purchasing specialist's (invoice.py PACK).
ACTOR = "specialist:inventory_purchasing"
#: (client, the run's spend currency, capped) -> the `vision` role's model. A test may pass its own.
VisionModel = Callable[[InternalClient, str, bool], Awaitable[BaseLlm]]


def default_vision(cfg: Config) -> VisionModel:
    async def build(client: InternalClient, currency: str, capped: bool) -> BaseLlm:
        return await quarantined_llm("vision", cfg, client, currency=currency, capped=capped)

    return build


def _error(status: int, code: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": code, "reason_code": None}}, status_code=status)


async def read_upload(
    ctx: RunContext,
    req: InternalIngestRequest,
    image: bytes,
    frame: InternalRunFrameResponse,
    client: InternalClient,
    cfg: Config,
    vision: VisionModel,
) -> tuple[str, str | None]:
    """(status, draft id). Raises CoreError / httpx errors from core's internal API (the route answers 502)."""
    capped = frame_over_cap(cfg, frame)
    if frame.narration != "model" and not capped:
        return "model_blocked", None
    currency = spend_currency(frame)
    try:
        llm = await vision(client, currency, capped)
    except (ProviderUnavailable, RetiredModelRefused, CoreError, httpx.HTTPError) as e:
        log.warning("intel: ingest run %s has no vision model: %s", ctx.run_id, cause(e))
        return "model_blocked", None
    spend = SpendBuffer(client.write_spend, currency)
    state = RunState(
        traces=TraceBuffer(client.write_traces),
        # One read of the page plus the quarantine's one schema retry; no tools.
        budget=Budget(max_model_calls=2, max_tool_calls=0),
        meter=Meter(spend, "vision", provider_of(llm), llm.model, price_of(llm)),
    )
    # A core name links to its core row: the row id stands in for an intel entity id (an invoice links by `core_ref` only),
    # so a core name and an intel.alias of the same row are one entity, never two matches.
    aliases = AliasTable(Alias(a.core_ref.split(":", 1)[1], a.kind, a.core_ref, a.alias) for a in req.aliases)
    # An invoice run reads the page only: it extracts no claims and embeds nothing.
    run = Ingest(
        state=state, sink=CoreSink(client), extract_llm=llm, vision_llm=llm, embedder=RecordedEmbedder(), aliases=aliases, actor=ACTOR
    )
    try:
        report = await run.invoice(req.document_id.root, image, req.media_type, req.currency)
    finally:
        await state.traces.flush()
        await spend.flush()
    if report.draft_id is None:
        return "abstained", None
    return ("drafted", report.draft_id) if report.draft_status == "proposed" else ("draft_refused", None)


def ingest_router(
    cfg: Config,
    *,
    now: Callable[[], float] = time.time,
    core_transport: httpx.AsyncBaseTransport | None = None,
    vision: VisionModel | None = None,
) -> APIRouter:
    router = APIRouter()
    keys: dict[str, Ed25519PublicKey] = {}
    vision_of = vision or default_vision(cfg)

    def context(request: Request) -> RunContext | JSONResponse:
        try:
            secret = cfg.service_secret()
            if "k" not in keys:
                keys["k"] = load_public_key(cfg.run_token_public_key_pem())
        except ConfigError as e:
            log.error("intel: refusing requests — %s", e)
            return _error(503, "unavailable")
        if not hmac.compare_digest(request.headers.get(SERVICE_SECRET_HEADER, "").encode(), secret.encode()):
            return _error(401, "unauthenticated")
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return _error(401, "unauthenticated")
        try:
            ctx = verify_run_token(auth[7:], keys["k"], now=now)
        except RunTokenRefused as e:
            log.info("intel: %s on /ingest", e)
            return _error(401, "unauthenticated")
        # Only an ingest token buys a read (an ask, event or sweep token must not spend a vision call here).
        return ctx if ctx.trigger == "ingest" else _error(401, "unauthenticated")

    @router.post("/ingest")
    async def ingest_route(request: Request) -> JSONResponse:
        ctx = context(request)
        if isinstance(ctx, JSONResponse):
            return ctx
        # Parsed by hand: no validation error ever echoes the request (the bytes) back.
        try:
            req = InternalIngestRequest.model_validate_json(await request.body() or b"{}")
            image = base64.b64decode(req.content_base64, validate=True)
        except (ValidationError, binascii.Error):
            return _error(400, "bad_request")
        frame = await fetch_run_frame(ctx, cfg, core_transport)
        if frame is None:
            return _error(503, "unavailable")
        client = InternalClient(ctx, base_url=cfg.core_url, service_secret=cfg.service_secret(), transport=core_transport)
        try:
            status, draft_id = await read_upload(ctx, req, image, frame, client, cfg, vision_of)
        except (CoreError, httpx.HTTPError) as e:
            log.error("intel: ingest run %s failed: %s", ctx.run_id, type(e).__name__)
            return _error(502, "internal")
        finally:
            await client.aclose()
        log.info("intel: ingest run %s %s", ctx.run_id, status)
        return JSONResponse({"run_id": ctx.run_id, "status": status, "draft_id": draft_id})

    return router
