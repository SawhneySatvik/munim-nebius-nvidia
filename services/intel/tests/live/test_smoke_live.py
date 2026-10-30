"""Recorded gates for the live smoke's own logic (no network: a fake caller). The live run itself is `make smoke-live`."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from google.genai import types
from google.genai.errors import ClientError
from google.genai.models import AsyncModels

import live.smoke_live as sl
from munim_intel.config import Config, load_config
from munim_intel.llm.providers import ProviderUnavailable


def cfg_with(keys: dict[str, str], tmp_path_factory: pytest.TempPathFactory) -> Config:
    return load_config(env=keys, run_dir=tmp_path_factory.mktemp("run"))


async def ok_caller(provider: str, role: str, model_id: str, cfg: Config) -> sl.Cell:
    return sl.Cell("ok", "", 5, 10, 3, None, True)


async def bad_caller(provider: str, role: str, model_id: str, cfg: Config) -> sl.Cell:
    if model_id == "planted-bad-model-id":
        raise RuntimeError("provider says: secret-ish text that must not print")
    return sl.Cell("ok", "", 5, 10, 3)


def test_adr_has_ten_rows_and_every_one_is_in_the_table(tmp_path_factory: pytest.TempPathFactory) -> None:
    assert len(sl.adr_rows()) == 10
    out = asyncio.run(sl.run_matrix(cfg_with({"GEMINI_API_KEY": "gem-test-key-0001"}, tmp_path_factory), ok_caller))
    lines, missing = sl.token_table(out)
    assert missing == [] and len(lines) == 10


def test_a_missing_adr_row_in_the_table_turns_red(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delitem(sl.ROW_SOURCES, "brief")
    _, missing = sl.token_table(sl.Outcome())
    assert any("brief" in m for m in missing)


def test_no_key_is_skipped_and_cap_is_providers_with_key_x_roles(tmp_path_factory: pytest.TempPathFactory) -> None:
    out = asyncio.run(sl.run_matrix(cfg_with({"GEMINI_API_KEY": "gem-test-key-0001"}, tmp_path_factory), ok_caller))
    assert out.cells[("nvidia", "router")].detail == "no key"
    assert out.cells[("openai", "router")].status == "skipped"
    # gemini x 6 roles, + 1 planned for the router's one retry (hand count); the others have no key or no id. The fake
    # caller makes one call per cell.
    assert out.made == 6 and out.planned == 7


def test_planned_calls_above_the_cap_refuse_to_run(tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> None:
    """The cap (1 key x 6 roles + 1 router retry = 7, by hand) is independent of the per-cell plan: a plan that retries
    every role is refused before any call."""
    made: list[str] = []

    async def counting(provider: str, role: str, model_id: str, cfg: Config) -> sl.Cell:
        made.append(role)
        return sl.Cell("ok")

    monkeypatch.setattr(sl, "worst_calls", lambda provider, role: 2)
    with pytest.raises(SystemExit, match="exceed cap 7"):
        asyncio.run(sl.run_matrix(cfg_with({"GEMINI_API_KEY": "gem-test-key-0001"}, tmp_path_factory), counting))
    assert made == []


def test_the_router_cell_is_the_decision_model_and_takes_the_unscored_retry(
    tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """T-059's live finding scripted at the genai SDK: the logprobs request answers 400, the same enum request without
    logprobs answers D (draft_request). The router cell is ok, unscored, 2 calls; the probe line says rejected."""
    seen: list[bool] = []

    async def generate_content(self: Any, *, model: str, contents: Any, config: types.GenerateContentConfig) -> Any:
        seen.append(bool(config.response_logprobs))
        if config.response_logprobs:
            raise ClientError(400, {"error": {"code": 400, "message": "secret-ish provider text", "status": "INVALID_ARGUMENT"}})
        return types.GenerateContentResponse(
            candidates=[
                types.Candidate(content=types.Content(role="model", parts=[types.Part(text="D")]), finish_reason=types.FinishReason.STOP)
            ],
            usage_metadata=types.GenerateContentResponseUsageMetadata(prompt_token_count=250),
        )

    monkeypatch.setattr(AsyncModels, "generate_content", generate_content)
    cfg = cfg_with({"GEMINI_API_KEY": "gem-test-key-0001"}, tmp_path_factory)
    cell = asyncio.run(sl.live_call("gemini", "router", "gemini-3.5-flash-lite", cfg))
    assert (cell.status, cell.calls, cell.logprobs, cell.prompt) == ("ok", 2, False, 250) and seen == [True, False]
    assert cell.detail == "route.intent=draft_request band=unscored calls=2"

    async def router_only(provider: str, role: str, model_id: str, c: Config) -> sl.Cell:
        return cell if role == "router" else sl.Cell("ok", "", 5, 10, 3)

    out = asyncio.run(sl.run_matrix(cfg, router_only))
    assert out.made == 7 == out.planned
    assert sl.report(out) == 0
    printed = capsys.readouterr().out
    assert "gemini      unsupported (logprobs request rejected; retried once without" in printed
    assert "secret-ish" not in printed


def test_a_present_key_with_a_failing_call_exits_nonzero_without_leaking_text(
    tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("MUNIM_LIVE_MODEL_GEMINI_ROUTER", "planted-bad-model-id")
    out = asyncio.run(sl.run_matrix(cfg_with({"GEMINI_API_KEY": "gem-test-key-0001"}, tmp_path_factory), bad_caller))
    assert out.cells[("gemini", "router")].status == "failed"
    # R-E 3: a call that raised was still made (and may be billed): by hand, 5 ok cells x 1 + the failed router at its
    # planned worst (the call and its one retry) = 7, never the 6 a default count of 1 gives.
    assert out.made == 7 == out.planned
    assert sl.report(out) == 1
    assert "secret-ish" not in capsys.readouterr().out


def test_paired_a_provider_that_cannot_be_built_made_no_call(tmp_path_factory: pytest.TempPathFactory) -> None:
    async def unbuildable(provider: str, role: str, model_id: str, cfg: Config) -> sl.Cell:
        if role == "narrate":
            raise ProviderUnavailable("gemini: no key")
        return sl.Cell("ok", "", 5, 10, 3)

    out = asyncio.run(sl.run_matrix(cfg_with({"GEMINI_API_KEY": "gem-test-key-0001"}, tmp_path_factory), unbuildable))
    assert out.cells[("gemini", "narrate")].status == "skipped" and out.made == 5  # 5 ok cells; the skipped one made none


def test_a_retired_model_id_is_never_called(tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MUNIM_LIVE_MODEL_GEMINI_ROUTER", "gemini-2.5-flash")
    out = asyncio.run(sl.run_matrix(cfg_with({"GEMINI_API_KEY": "gem-test-key-0001"}, tmp_path_factory), ok_caller))
    assert out.cells[("gemini", "router")].status == "failed" and out.made == 5
