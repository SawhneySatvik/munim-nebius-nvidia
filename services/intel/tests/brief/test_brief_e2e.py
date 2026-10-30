"""T-054 gate 4 against the real core-api on embedded Postgres 18 (tests/watch/core_stack.mts, the seeded store world): the
template brief is posted under a run token to `answers` and core's own validator accepts it (the row is the judge:
`intel.answer.abstained` is false and holds every segment). The refusals are the paired rejects: a planted digit and a
forged ref are abstained by core with their reason codes (posted straight to the sink, past the brief's own drop rule).

R-E 1-A (W3 close): a model line with a number word or a `⟩k` suffix never reaches core (intel's grammar is core's), so
the stored brief is the template and not abstained; and when core does abstain a brief (planted: intel's drop rule
bypassed), the template-only brief is re-posted under its own id and that one stands.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "watch"))
from stack import Bridge, Stack  # noqa: E402

import munim_intel.brief as brief_module
from munim_intel.brief import BriefItem, CoreAnswerSink, compile_brief
from munim_intel.config import load_config
from munim_intel.contracts_gen.models import InternalAnswersRequest, InternalSnapshotsRequest
from munim_intel.llm.recorded import RecordedLlm
from munim_intel.mapping import snap_ref
from munim_intel.runtime.context import RunContext, load_public_key, verify_run_token
from munim_intel.runtime.internal_client import InternalClient
from munim_intel.runtime.state import RunState
from munim_intel.trace.buffer import TraceBuffer

from .briefkit import aio, vid

WORLD = "store"


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(7, [WORLD])
    yield s
    s.stop()


@aio
async def test_template_brief_passes_core_validator_and_planted_digit_or_forged_ref_does_not(stack: Stack) -> None:
    tenant = stack.tenants[WORLD]
    t = stack.call("token", world=WORLD, trigger="brief", scope=["*"])
    ctx = verify_run_token(t["token"], load_public_key(stack.ready["public_key_pem"].encode()))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    sink = CoreAnswerSink(client)
    outlet = stack.sql("SELECT id::text FROM core.outlet WHERE tenant_id = $1 ORDER BY id LIMIT 1", tenant)[0]["id"]
    as_of = date.fromisoformat(stack.ready["as_of"])
    snap = await client.mint_snapshot(
        InternalSnapshotsRequest.model_validate(
            {
                "template_id": "catalogue.sku_price_check",
                "params": {"outlet_id": outlet, "from": (as_of - timedelta(days=30)).isoformat(), "to": as_of.isoformat()},
            }
        )
    )
    sid = snap.snapshot_id.root
    ref = snap_ref(sid, 0, "mrp_minor")
    items = [
        BriefItem(vid(0xF1), "finance", "high", "finance.tender_gap", (f"The till and the takings differ by {ref}.",), ref, (vid(0xD1),)),
        BriefItem(vid(0xF2), "people", "medium", "people.advance_unrecovered", ("An advance is still outstanding.",), ref),  # no own ref
    ]

    def stored() -> list[dict[str, object]]:
        rows: list[dict[str, object]] = stack.sql(
            "SELECT id::text, question, abstained, reason_code, envelope FROM intel.answer WHERE tenant_id = $1 ORDER BY created_at", tenant
        )
        return rows

    r = await compile_brief(items, sink, ctx=ctx)  # AI off: the template brief
    rows = stored()
    assert (r.posted, r.abstained, r.template_items, r.model_calls) == (True, False, 2, 0)
    assert [(a["abstained"], a["reason_code"], a["question"]) for a in rows] == [(False, None, "What needs me today?")]
    env = rows[0]["envelope"]
    assert isinstance(env, dict) and len(env["segments"]) == 2
    assert env["segments"][0]["text"].endswith("A draft is ready for your decision. — Finance desk")
    # item 2's own text had no ref, so it falls back to the impact-cell line
    assert env["segments"][1]["text"] == f"A medium finding needs your attention, impact {ref}. \u2014 People desk"

    async def post(text: str, refs: list[str], n: int) -> tuple[bool, str | None]:
        req = InternalAnswersRequest.model_validate(
            {
                "question": "What needs me today?",
                "envelope": {
                    "answer_id": f"01920000-0000-7000-8000-{0xAB0 + n:012x}",
                    "segments": [{"text": text, "refs": refs}],
                    "abstained": False,
                    "reason_code": None,
                },
            }
        )
        resp = await sink.post(req)
        return resp.abstained, resp.reason_code.root if resp.reason_code else None

    assert await post(f"The takings differ by {ref}.", [f"snap:{sid}"], 1) == (False, None)  # accept
    assert await post(f"The takings differ by 40 and {ref}.", [f"snap:{sid}"], 2) == (True, "number_grammar")
    forged = snap_ref(vid(0xBAD), 0, "mrp_minor")
    assert await post(f"The takings differ by {forged}.", [f"snap:{vid(0xBAD)}"], 3) == (True, "unresolved_ref")


class Lines(RecordedLlm):
    """The model's reply (no fixture: these lines are the plant)."""

    reply: str = ""

    async def generate_content_async(self, llm_request: Any, stream: bool = False) -> Any:
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.reply)]))


async def _setup(stack: Stack) -> tuple[RunContext, InternalClient, str, str]:
    """A fresh brief run (its own answer ids) and a real impact cell to cite."""
    tenant = stack.tenants[WORLD]
    t = stack.call("token", world=WORLD, trigger="brief", scope=["*"])
    ctx = verify_run_token(t["token"], load_public_key(stack.ready["public_key_pem"].encode()))
    client = InternalClient(ctx, base_url="http://core.test", service_secret=stack.ready["secret"], transport=Bridge(stack))
    outlet = stack.sql("SELECT id::text FROM core.outlet WHERE tenant_id = $1 ORDER BY id LIMIT 1", tenant)[0]["id"]
    as_of = date.fromisoformat(stack.ready["as_of"])
    snap = await client.mint_snapshot(
        InternalSnapshotsRequest.model_validate(
            {
                "template_id": "catalogue.sku_price_check",
                "params": {"outlet_id": outlet, "from": (as_of - timedelta(days=30)).isoformat(), "to": as_of.isoformat()},
            }
        )
    )
    return ctx, client, snap.snapshot_id.root, snap_ref(snap.snapshot_id.root, 0, "mrp_minor")


def _items(ref: str) -> list[BriefItem]:
    return [
        BriefItem(vid(0xF1), "finance", "high", "finance.tender_gap", (f"The till and the takings differ by {ref}.",), ref),
        BriefItem(vid(0xF2), "people", "medium", "people.advance_unrecovered", (f"An advance is still outstanding, {ref}.",), ref),
    ]


def _stored(stack: Stack, run_id: str) -> list[tuple[bool, str | None, list[str]]]:
    rows = stack.sql("SELECT abstained, reason_code, envelope FROM intel.answer WHERE run_id = $1::uuid ORDER BY created_at, id", run_id)
    return [(r["abstained"], r["reason_code"], [seg["text"] for seg in r["envelope"]["segments"]]) for r in rows]


@aio
async def test_a_number_word_or_a_suffix_line_never_reaches_core_and_the_brief_stands(stack: Stack, tmp_path: Path) -> None:
    ctx, client, _, ref = await _setup(stack)
    llm = Lines(model="recorded/narrate", reply="Seven tills disagree {I1}.\nAn advance is still out {I2}k.")
    state = RunState(traces=TraceBuffer(client.write_traces))
    r = await compile_brief(_items(ref), CoreAnswerSink(client), ctx=ctx, llm=llm, cfg=load_config(env={}, run_dir=tmp_path), state=state)
    assert (r.model_items, r.template_items, r.dropped, r.reposted) == (0, 2, 2, False)
    [(abstained, reason, texts)] = _stored(stack, ctx.run_id)
    assert (abstained, reason) == (False, None)
    assert texts == [
        f"The till and the takings differ by {ref}. \u2014 Finance desk",
        f"An advance is still outstanding, {ref}. \u2014 People desk",
    ]


@aio
async def test_a_brief_core_abstains_is_reposted_as_the_template_and_that_one_stands(
    stack: Stack, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The plant: intel's drop rule accepts every line, so a `⟩k` line reaches core, which abstains the whole brief
    (number_grammar); the template-only re-post is stored too, not abstained — exactly two rows for the run."""
    ctx, client, _, ref = await _setup(stack)
    real = brief_module.clean
    monkeypatch.setattr(brief_module, "clean", lambda text, allowed: True if "\u27e9k" in text else real(text, allowed))
    llm = Lines(model="recorded/narrate", reply="Takings are off by {I1}k.")
    state = RunState(traces=TraceBuffer(client.write_traces))
    r = await compile_brief(_items(ref), CoreAnswerSink(client), ctx=ctx, llm=llm, cfg=load_config(env={}, run_dir=tmp_path), state=state)
    assert (r.posted, r.abstained, r.reposted) == (True, False, True)
    stored = _stored(stack, ctx.run_id)
    assert [(a, rc) for a, rc, _ in stored] == [(True, "number_grammar"), (False, None)]
    assert stored[1][2][0] == f"The till and the takings differ by {ref}. \u2014 Finance desk"
