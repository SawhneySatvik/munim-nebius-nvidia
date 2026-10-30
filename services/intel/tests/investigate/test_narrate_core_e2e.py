"""R-E 1-B against the real core-api on embedded Postgres 18 (tests/watch/core_stack.mts, the seeded store world): a step
narration whose model line types a magnitude suffix after its cell (`{C4}k`) is stored with that item on core's template —
not abstained — because intel's grammar is core's and the line never reaches core. The paired plant: with intel's line
checks planted away, the same line reaches core, whose validator abstains the whole answer (number_grammar). The judge
is the stored `intel.answer` row. The run token is a `brief` one (core_stack mints by trigger, with a watcher actor): the
gate is core's validator on the stored answer, which takes any run's token; the `/investigate:narrate` route's own
token rule is test_narrate.py's.
"""

from __future__ import annotations

import asyncio
import sys
from collections.abc import AsyncGenerator, Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from google.adk.models import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "watch"))
from stack import Bridge, Stack  # noqa: E402

import munim_intel.investigate as inv  # noqa: E402
from munim_intel.config import load_config  # noqa: E402
from munim_intel.contracts_gen.models import InternalRunFrameResponse, InternalSnapshotsRequest, InvestigationsNarrateRequest  # noqa: E402
from munim_intel.mapping import snap_ref  # noqa: E402
from munim_intel.runtime.context import load_public_key, verify_run_token  # noqa: E402
from munim_intel.runtime.internal_client import InternalClient  # noqa: E402

WORLD = "store"


def vid(n: int) -> str:
    return f"01920000-0000-7000-8000-{n:012x}"


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(7, [WORLD])
    yield s
    s.stop()


class Scripted(BaseLlm):
    model: str = "scripted/narrate"
    reply: str = ""

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.reply)]))


def frame() -> InternalRunFrameResponse:
    return InternalRunFrameResponse.model_validate(
        {
            "pack": {"code": "IN", "version": 3},
            "currency": "INR",
            "severity_ladder": {"critical_minor_gte": 1, "high_minor_gte": 1, "medium_minor_gte": 1},
            "detectors": {},
            "outlets": [],
            "budget": None,
            "narration": "model",
            "licence_kinds": [],
            "payroll_scope": "drafts",
            "negotiation": {"target_bp": 9500, "walkaway_bp": 11000},
        }
    )


def narrate(stack: Stack, n: int, reply: str) -> tuple[str, InvestigationsNarrateRequest]:
    """One narration through intel's narrate_step and the real core; returns (run id, the request)."""
    tenant = stack.tenants[WORLD]
    t = stack.call("token", world=WORLD, trigger="brief", scope=["*"])
    ctx = verify_run_token(t["token"], load_public_key(stack.ready["public_key_pem"].encode()))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    outlet = stack.sql("SELECT id::text FROM core.outlet WHERE tenant_id = $1 ORDER BY id LIMIT 1", tenant)[0]["id"]
    as_of = date.fromisoformat(stack.ready["as_of"])

    async def go() -> InvestigationsNarrateRequest:
        snap = await client.mint_snapshot(
            InternalSnapshotsRequest.model_validate(
                {
                    "template_id": "catalogue.sku_price_check",
                    "params": {"outlet_id": outlet, "from": (as_of - timedelta(days=30)).isoformat(), "to": as_of.isoformat()},
                }
            )
        )
        a, b = snap_ref(snap.snapshot_id.root, 0, "mrp_minor"), snap_ref(snap.snapshot_id.root, 0, "price_minor")
        req = InvestigationsNarrateRequest.model_validate(
            {
                "answer_id": vid(0xA00 + n),
                "question": "investigation margin_fall step",
                "playbook_id": "margin_fall",
                "owner": "finance",
                "items": [
                    {
                        "item_id": "supplier_price",
                        "specialist": "inventory_purchasing",
                        "verdict": "supported",
                        "cells": [{"ref": a, "column": "mrp_minor"}],
                        "template": f"Supplier prices moved the margin {a}.",
                    },
                    {
                        "item_id": "labour",
                        "specialist": "people",
                        "verdict": "refuted",
                        "cells": [{"ref": b, "column": "price_minor"}],
                        "template": f"Labour cost does not explain this change {b}.",
                    },
                ],
            }
        )
        await inv.narrate_step(ctx, req, frame(), client, load_config(env={}), Scripted(reply=reply))
        await client.aclose()
        return req

    return ctx.run_id, asyncio.run(go())


def stored(stack: Stack, answer_id: str) -> dict[str, Any]:
    [row] = stack.sql("SELECT abstained, reason_code, envelope FROM intel.answer WHERE id = $1::uuid", answer_id)
    return row


REPLY = "supplier_price: Supplier prices pushed the margin down {C1}.\nlabour: Labour moved by {C2}k."


def test_a_suffix_line_keeps_its_items_template_and_core_stores_the_answer(stack: Stack) -> None:
    _, req = narrate(stack, 1, REPLY)
    row = stored(stack, req.answer_id.root)
    assert (row["abstained"], row["reason_code"]) == (False, None)
    texts = [s["text"] for s in row["envelope"]["segments"]]
    assert texts[0].startswith("Supplier prices pushed the margin down ⟨snap:") and texts[1] == req.items[1].template


def test_paired_the_same_line_past_intels_checks_is_abstained_by_core(stack: Stack, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(inv, "check_grammar", lambda _: None)
    _, req = narrate(stack, 2, REPLY)
    row = stored(stack, req.answer_id.root)
    assert (row["abstained"], row["reason_code"]) == (True, "number_grammar")
