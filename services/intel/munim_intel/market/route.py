"""`POST /market-price` (NB-7b): one web price search for an ingredient, for core's "check the market price". core mints an
`ingest` run (a dedicated trigger would need a migration), names the ingredient from its own row and the outlets' business
date, and stores what comes back as an upload that an owner approves (R28). Only core mints the token (rule 15).

The page text (untrusted: rule 8, gotcha 15) is read by deterministic code in `web_price` and never leaves it; the answer is
the `market_signal_v2` CSV, its source token and a status code. The trace carries labels only: the mode and a status."""

from __future__ import annotations

import hmac
import logging
import time
from collections.abc import Callable
from datetime import date

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from munim_intel.config import Config, ConfigError
from munim_intel.contracts_gen.models import InternalMarketPriceRequest
from munim_intel.market import web_price
from munim_intel.runtime.context import RunContext, RunTokenRefused, load_public_key, verify_run_token
from munim_intel.runtime.internal_client import SERVICE_SECRET_HEADER, CoreError, InternalClient
from munim_intel.trace.buffer import TraceBuffer

log = logging.getLogger("munim_intel.market")
ACTOR = "specialist:inventory_purchasing"


def _error(status: int, code: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": code, "reason_code": None}}, status_code=status)


def market_router(
    cfg: Config, *, now: Callable[[], float] = time.time, core_transport: httpx.AsyncBaseTransport | None = None, http: httpx.Client | None = None
) -> APIRouter:
    router = APIRouter()
    keys: dict[str, Ed25519PublicKey] = {}

    def context(request: Request) -> RunContext | JSONResponse:
        try:
            secret = cfg.service_secret()
            if "k" not in keys:
                keys["k"] = load_public_key(cfg.run_token_public_key_pem())
        except ConfigError:
            return _error(503, "unavailable")
        if not hmac.compare_digest(request.headers.get(SERVICE_SECRET_HEADER, "").encode(), secret.encode()):
            return _error(401, "unauthenticated")
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return _error(401, "unauthenticated")
        try:
            ctx = verify_run_token(auth[7:], keys["k"], now=now)
        except RunTokenRefused:
            return _error(401, "unauthenticated")
        return ctx if ctx.trigger == "ingest" else _error(401, "unauthenticated")

    @router.post("/market-price")
    async def market_price(request: Request) -> JSONResponse:
        ctx = context(request)
        if isinstance(ctx, JSONResponse):
            return ctx
        try:
            req = InternalMarketPriceRequest.model_validate_json(await request.body() or b"{}")
        except ValidationError:
            return _error(400, "bad_request")
        client = InternalClient(ctx, base_url=cfg.core_url, service_secret=cfg.service_secret(), transport=core_transport)
        traces = TraceBuffer(client.write_traces)
        csv = source = None
        mode = "none"
        try:
            try:
                csv, price = web_price.propose(cfg, req.ingredient, req.currency, date.fromisoformat(req.on_date), http=http)
                source, status, mode = price.source, "proposed", "recorded" if price.recorded else "live"
            except web_price.WebPriceError as e:
                status = "no_price" if str(e) == "no_price_found" else "unavailable"
            await traces.append("tool_call", ACTOR, {"tool": "web_price", "mode": mode, "status": status})
            await traces.flush()
        except (CoreError, ValueError) as e:
            log.error("intel: market-price run %s failed: %s", ctx.run_id, type(e).__name__)
            return _error(502, "internal")
        finally:
            await client.aclose()
        return JSONResponse({"run_id": ctx.run_id, "status": status, "csv": csv, "origin": source})

    return router
