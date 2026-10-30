"""T-051 end to end: the Market & Strategy detectors through intel's WatchRun against the real core-api internal API on
embedded Postgres, the four worldgen worlds seeded through the API in the 100-day gate profile. Fails — never skips —
without node.

Expected values come from the hand-kept answer keys and detector-map.json; severities are the IN ladder L by hand.
`market.upcoming` has no date param (pack §3) and reads the real date, while RG-M1 / RG-M1b sit at fixed dates from the
as-of date: their check runs only while each signal lies in [business date, + days ahead] and otherwise is a loud,
counted skip (as db/tests/templates-worlds.ts does) — never a silent pass.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "catalogue"))
from menu_market_harness import WORLD_OF_PREFIX, WORLDS, Stack, Sweeper, answer_key, detector_map  # noqa: E402

from munim_intel.watch.detectors.market import competitor_undercut, event_ahead  # noqa: E402

PACK = "market"
SPECS = [event_ahead.SPEC, competitor_undercut.SPEC]
#: IN ladder L by hand: |383,630| and |−263,968| are ≥ 200,000 and < 1,000,000 → medium.
SEVERITY = {"RG-M1": "medium", "RG-M1b": "medium"}


@pytest.fixture(scope="module")
def stack() -> Iterator[Stack]:
    s = Stack(100, WORLDS)
    yield s
    s.stop()


@pytest.fixture(scope="module")
def sw(stack: Stack, tmp_path_factory: pytest.TempPathFactory) -> Sweeper:
    s = Sweeper(stack, tmp_path_factory.mktemp("run"))
    reports = {w: s.sweep(w, PACK, SPECS).as_json() for w in WORLDS}
    print("reports:", reports)
    return s


def plants() -> list[tuple[str, str]]:
    m = detector_map()["problems"]
    return [(pid, WORLD_OF_PREFIX[pid[:2]]) for pid, e in m.items() if (e.get("detector") or "").startswith(f"{PACK}.")]


def where(world: str, pid: str) -> dict[str, Any]:
    entry: dict[str, Any] = next(p for p in answer_key(world)["problems"] if p["id"] == pid)
    return entry


def signal_day(sw: Sweeper, world: str, outlet: str, label: str) -> tuple[str | None, str]:
    """The plant's upcoming signal date and the outlet's business date now (core's formula, as the template reads it)."""
    on = sw.stack.sql(
        """SELECT to_char(on_date, 'YYYY-MM-DD') AS d FROM core.market_signal
            WHERE tenant_id = $1 AND outlet_id = $2 AND label = $3 AND on_date >= '2026-10-10' ORDER BY on_date LIMIT 1""",
        sw.stack.tenants[world],
        outlet,
        label,
    )
    today = sw.stack.sql(
        "SELECT to_char(((now() AT TIME ZONE tz) - business_day_cutoff)::date, 'YYYY-MM-DD') AS d FROM core.outlet WHERE id = $1", outlet
    )
    return (on[0]["d"] if on else None), today[0]["d"]


def test_the_event_ahead_plants_are_found_with_impact_equal_to_the_key(sw: Sweeper) -> None:
    findings = sw.findings(PACK)
    assert sorted(p for p, _ in plants()) == ["RG-M1", "RG-M1b"]  # hand list: detector-map.json market rows
    checked, skipped = [], []
    for pid, world in plants():
        e = where(world, pid)
        outlet = sw.id(world, e["where"]["outlet"])
        on, today = signal_day(sw, world, outlet, e["where"]["label"])
        days = e["where"]["lookahead_days"]
        if on is None or not (today <= on <= _plus(today, days)):
            skipped.append(f"{pid}: gate date {today} outside the plant window ({on} must lie within {days} days)")
            continue
        key = f"market.event_ahead:{outlet}:{e['where']['label']}:{on}"
        hits = [f for f in findings if f["tenant_id"] == sw.stack.tenants[world] and f["dedupe_key"] == key]
        checked.append((pid, [(abs(int(h["impact"])), h["severity"], h["confidence_bp"]) for h in hits], e["impact_minor"]))
    print("checked:", checked, "SKIPPED:", skipped)
    assert [(pid, hits) for pid, hits, want in checked] == [(pid, [(want, SEVERITY[pid], 10_000)]) for pid, _, want in checked]
    if skipped:
        pytest.skip(f"{len(skipped)} time-bound plant(s) outside their window: {skipped}")


def _plus(day: str, n: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


def test_market_false_alarms_are_at_most_two_per_world(sw: Sweeper) -> None:
    findings = sw.findings(PACK)
    explained = set()
    for pid, world in plants():
        e = where(world, pid)
        explained.add((sw.stack.tenants[world], f"market.event_ahead:{sw.id(world, e['where']['outlet'])}:{e['where']['label']}:"))
    per_world = {
        w: [
            f["dedupe_key"]
            for f in findings
            if f["tenant_id"] == sw.stack.tenants[w]
            and not any(t == f["tenant_id"] and f["dedupe_key"].startswith(p) for t, p in explained)
        ]
        for w in WORLDS
    }
    print("false alarms:", per_world)
    assert max(len(v) for v in per_world.values()) <= 2


def test_every_market_finding_and_trace_carries_the_specialist(sw: Sweeper) -> None:
    # Selected by finding type, not by the pack under test: a finding filed under another specialist is counted here.
    findings = sw.stack.sql("SELECT pack, type FROM intel.finding WHERE type LIKE 'market.%'")
    actors = sw.stack.sql(
        """SELECT DISTINCT t.actor FROM intel.trace_event t JOIN intel.run r ON r.tenant_id = t.tenant_id AND r.id = t.run_id
            WHERE r.trigger = 'watch_sweep'"""
    )
    print("findings:", [(f["type"], f["pack"]) for f in findings], "actors:", actors)
    if not findings:
        pytest.skip("no market finding to check: the time-bound RG-M1 / RG-M1b window has passed (see the plants test)")
    # No drafts: pack §6 maps none to these findings.
    assert {f["pack"] for f in findings} == {PACK} and {f["type"] for f in findings} <= {"market.event_ahead", "market.competitor_undercut"}
    assert {a["actor"] for a in actors} == {"watcher:market"}
    assert sw.stack.sql("SELECT 1 FROM core.draft WHERE source LIKE 'intel:%'") == []
