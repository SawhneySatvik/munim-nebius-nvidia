"""The munim-api suppliers-sim service's function entry (staged as out/suppliers/index.py by build.mjs). SIMULATED
suppliers only (hard rule 5). Vercel routes `/suppliers-sim/*` here with the path unchanged, so the app is mounted at
the path of SUPPLIERS_SIM_PUBLIC_URL — the URL its agent cards advertise and the seeded card URLs point at."""

import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent / "services" / "suppliers-sim"))

from starlette.applications import Starlette
from starlette.routing import Mount
from suppliers_sim.app import build_app

PUBLIC_URL = os.environ.get("SUPPLIERS_SIM_PUBLIC_URL")
_inner = build_app(PUBLIC_URL)
_prefix = urlsplit(PUBLIC_URL or "").path.rstrip("/")
app = Starlette(routes=[Mount(_prefix, app=_inner)]) if _prefix else _inner
