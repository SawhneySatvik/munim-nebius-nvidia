"""The munim-api intel service's function entry (staged as out/intel/index.py by build.mjs): the platform-neutral
ASGI entry, with the staged repo layout on the import path (intel reads some files by repo-relative path)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "services" / "intel"))

from munim_intel.asgi import app

__all__ = ["app"]
