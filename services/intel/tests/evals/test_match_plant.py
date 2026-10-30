"""eval-w3's plant matching for `sum_of_findings` (accept.json): a plant whose impact is the sum of its detector's
findings is matched against the hand value accept.json types for it, or the key's impact when that value is null.
Expected values are typed by hand (RG-P2's six Σ cells from the m0026 world check; RG-K2's four weekly findings from the
key's `what`), never read from the code under test."""

from __future__ import annotations

import importlib.util
import json
from types import ModuleType
from typing import Any

import pytest

from conftest import REPO

D = "people.overstaffed_slot"
NORTH = "01920000-0000-7000-8000-00000000a001"


@pytest.fixture
def measure(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    monkeypatch.setenv("MUNIM_MODEL_MODE", "recorded")  # measure.py refuses to load otherwise
    spec = importlib.util.spec_from_file_location("eval_measure", REPO / "services" / "intel" / "tests" / "evals" / "measure.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def accept() -> dict[str, Any]:
    out: dict[str, Any] = json.loads((REPO / "evals" / "w3" / "accept.json").read_text("utf8"))
    return out


def finding(slot: str, impact: int, detector: str = D) -> dict[str, Any]:
    return {"detector": detector, "dedupe_key": f"{detector}:{NORTH}:{slot}", "impact": impact}


def test_rg_p2_is_the_sum_of_its_six_weekday_slot_findings_at_the_templates_hand_value(measure: ModuleType) -> None:
    plant = {"id": "RG-P2", "impact_minor": 480_000}  # the key's figure; accept.json types 408,000 (the documented gap)
    six = [finding(f"{d}:{h}", v) for (d, h), v in zip(
        [("tue", "15:00"), ("tue", "16:00"), ("tue", "17:00"), ("wed", "15:00"), ("wed", "16:00"), ("wed", "17:00")],
        [72_000, 64_000, 72_000, 64_000, 72_000, 64_000], strict=True)]  # fmt: skip
    got = [
        measure.match_plant(plant, D, six, accept(), [NORTH]),
        measure.match_plant(plant, D, [*six[:-1], finding("wed:17:00", 64_001)], accept(), [NORTH]),
        measure.match_plant(plant, D, six[:-1], accept(), [NORTH]),
        measure.match_plant(plant, D, [], accept(), [NORTH]),
    ]
    assert got == [(True, True), (True, False), (True, False), (False, False)]


def test_a_null_hand_value_still_sums_to_the_keys_impact(measure: ModuleType) -> None:
    plant = {"id": "RG-K2", "impact_minor": 491_400}
    d = "kitchen.remakes"
    weeks = [finding(f"2026-w{w}", v, d) for w, v in zip((38, 39, 40, 41), (113_400, 151_200, 113_400, 113_400), strict=True)]
    assert [measure.match_plant(plant, d, weeks, accept(), [NORTH]), measure.match_plant(plant, d, weeks[1:], accept(), [NORTH])] == [
        (True, True),
        (True, False),
    ]
