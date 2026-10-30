"""ASGI entrypoint for the Vercel suppliers-sim service."""

from __future__ import annotations

import os
from urllib.parse import urlsplit

from suppliers_sim.app import build_app
from starlette.applications import Starlette
from starlette.routing import Mount

public_url = os.environ.get("SUPPLIERS_SIM_PUBLIC_URL")
inner_app = build_app(public_url)
prefix = urlsplit(public_url or "").path.rstrip("/")
app = Starlette(routes=[Mount(prefix, app=inner_app)]) if prefix else inner_app
