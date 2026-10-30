"""T-085 measure stage of `make eval-w3`: seed each world once, run the recorded stacks the pack lanes built, write
`measured.json`. It computes no pass or fail; evals/w3 `gate.py` reads this file plus the hand-kept answer keys and exits
non-zero on any red.

Reused, not copied: the T-043 stack and the kitchen lane's `Harness` (embedded Postgres 18 + the real core-api, the four
worldgen worlds at the 100-day gate profile, intel's real /watch:sweep); the T-083 investigation e2e module (its Stack and
its own gate functions, run in file order); the T-053 fan-out kit (twenty recorded questions through the real Manager,
branches and validator, in-memory core); the T-054 brief fixtures. Everything runs with MUNIM_MODEL_MODE=recorded; the
models' replies are synthetic, so the plumbing table proves routing and counts, never answer quality.

Run from services/intel:  uv run --frozen python tests/evals/measure.py
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import os
import random
import re
import sys
import tempfile
import time
from dataclasses import replace
from datetime import date
from pathlib import Path
from types import ModuleType
from typing import Any

if os.environ.get("MUNIM_MODEL_MODE") != "recorded":
    sys.exit("eval-w3 measure: MUNIM_MODEL_MODE must be 'recorded' (no live model in a W3 gate)")

TESTS = Path(__file__).resolve().parents[1]
for sub in ("", "packs/kitchen", "watch", "fanout"):
    sys.path.insert(0, str(TESTS / sub))

from e2e_harness import DAYS, WORLDS, Harness  # noqa: E402
from stack import Bridge, Stack  # noqa: E402

from conftest import REPO  # noqa: E402

from munim_intel.detect import REGISTRY  # noqa: E402
from munim_intel.runtime.context import load_public_key, verify_run_token  # noqa: E402
from munim_intel.runtime.internal_client import InternalClient  # noqa: E402
from munim_intel.watch.pipeline import WatchRun, detectors_for  # noqa: E402

EVALS = REPO / "evals" / "w3"
KEYS = REPO / "tools" / "worldgen" / "answer-key"
OUT = Path(os.environ.get("EVAL_W3_OUT", str(REPO / ".run" / "eval-w3" / "measured.json")))
#: Files whose content the measurement depends on; the gate refuses a measured.json whose hashes no longer match.
INPUTS = [*(KEYS / f"{w}.json" for w in WORLDS), KEYS / "detector-map.json", EVALS / "accept.json"]
REF = re.compile(r"⟨snap:([0-9a-f-]{36})·(\d+)·([a-z_][a-z0-9_]*)⟩")
FINDINGS = """SELECT f.tenant_id::text AS tenant, f.pack, f.dedupe_key, f.type,
                     (s.rows -> f.impact_row ->> f.impact_column) AS impact
                FROM intel.finding f LEFT JOIN evidence.snapshot s ON s.tenant_id = f.tenant_id AND s.id = f.impact_snapshot_id"""
DRAFTS = """SELECT id::text, tenant_id::text AS tenant, source, command_type, command_payload, outlet_ids::text[] AS outlet_ids,
                   finding_id::text, evidence, based_on
              FROM core.draft WHERE source LIKE 'intel:%' ORDER BY id"""
REF_OK = """SELECT (jsonb_array_length(rows) > $3::int AND (rows -> $3::int) ? $4::text) AS ok
              FROM evidence.snapshot WHERE tenant_id = $1::uuid AND id = $2::uuid"""


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load(p: Path) -> Any:
    return json.loads(p.read_text("utf8"))


def uuid7() -> str:
    ms = int(time.time() * 1000).to_bytes(6, "big")
    rnd = bytearray(random.SystemRandom().randbytes(10))
    rnd[0] = 0x70 | (rnd[0] & 0x0F)
    rnd[2] = 0x80 | (rnd[2] & 0x3F)
    h = (ms + bytes(rnd)).hex()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


#: Plants stamped at the wall clock on the seed day (storefront coupon uses, the store's rice count): outside the AS_OF
#: frame unless the stack is seeded on AS_OF. Their detectors run again at each world's seed day (its latest order business
#: date), as the customers and inventory pack e2e suites do; only these, so no day-keyed finding of another is minted twice.
SEED_DAY = ("customers.coupon_cap_evasion", "customers.coupon_spike", "inventory.shrinkage")


def seed_day_sweep(h: Harness, stack: Stack, world: str) -> int:
    """The SEED_DAY detectors at the world's seed day, through core's real internal API; returns the run's error count."""
    detectors_for(None)  # registers the detectors
    specs = {p: [s for s in ss if s.id in SEED_DAY] for p, ss in REGISTRY.items()}
    specs = {p: ss for p, ss in specs.items() if ss}
    assert sorted(s.id for ss in specs.values() for s in ss) == sorted(SEED_DAY)
    (row,) = stack.sql('SELECT max(business_date)::text AS d FROM core."order" WHERE tenant_id = $1', stack.tenants[world])
    seed = date.fromisoformat(row["d"])
    frame = stack.frame(world, "template")
    frame = replace(frame, outlets=tuple(replace(o, business_date=seed) for o in frame.outlets))
    t = stack.call("token", world=world, trigger="watch_sweep", scope=["*"])
    ctx = verify_run_token(t["token"], load_public_key(h.cfg.run_token_public_key_pem()))

    async def go() -> int:
        client = InternalClient(ctx, base_url=h.cfg.core_url, service_secret=h.cfg.service_secret(), transport=Bridge(stack))
        try:
            return (await WatchRun(ctx, client, frame, h.cfg).run(specs)).errors
        finally:
            await client.aclose()

    return asyncio.run(go())


def detector_of(dedupe_key: str) -> str:
    return dedupe_key.split(":")[0]


def num(v: Any) -> int | None:
    return None if v is None else int(v)


# ---- detectors: plants, false alarms, traps, drafts -------------------------------------------------------------------


ALIAS = re.compile(r"^(outlet|asset|staff|ing|item|aggregator|channel):")


def aliases(where: dict[str, Any]) -> list[str]:
    """The worldgen aliases (outlet:1, asset:chiller1 ...) a key's `where` names; a finding is the plant's if its dedupe key
    carries one of their ids (detectors key on an outlet, an asset, a member or an ingredient)."""
    out: list[str] = []
    for v in where.values():
        for x in v if isinstance(v, list) else [v]:
            if isinstance(x, str) and ALIAS.match(x):
                out.append(x)
    return out


UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def carries(f: dict[str, Any], ids: list[str]) -> bool:
    """A finding is about one of these places when its dedupe key names one. An id-keyed finding (its key is one row id:
    inventory.shrinkage's <count_id>, pack section 4) names no place, so it is taken as a plant with no places is: any
    finding of the detector in the world."""
    return any(i in f["dedupe_key"] for i in ids) or UUID.fullmatch(f["dedupe_key"].split(":", 1)[1]) is not None


def match_plant(plant: dict[str, Any], d: str, found: list[dict[str, Any]], accept: dict[str, Any], ids: list[str]) -> tuple[bool, bool]:
    """(found, impact equals the key): the world's findings of the mapped detector that carry one of the key's places."""
    cands = [f for f in found if f["detector"] == d and (not ids or carries(f, ids))]
    pid, key = plant["id"], plant["impact_minor"]
    if not cands:
        return False, False
    sign = abs if pid in accept["abs"] else (lambda x: x)
    got = {sign(f["impact"]) for f in cands if f["impact"] is not None}
    if pid in accept["sum_of_findings"]:
        want = accept["sum_of_findings"][pid]
        ok = sum(f["impact"] or 0 for f in cands) == (key if want is None else want)
        return True, ok
    if pid in accept["all_of"]:
        ok = set(accept["all_of"][pid]) <= got
        return ok, ok
    if key is None:
        return True, True  # a non-money plant: the key carries a metric, not a figure
    return True, bool(got & {sign(key), *accept["impact_alternatives"].get(pid, [])})


def detectors(h: Harness, stack: Stack, dmap: dict[str, Any], accept: dict[str, Any], today: date) -> dict[str, Any]:
    t0 = time.time()
    sweeps = {w: h.sweep(w) for w in WORLDS}
    for w in WORLDS:
        if errors := seed_day_sweep(h, stack, w):
            sweeps[w]["status"] = f"seed-day sweep: {errors} errors"
    world_of = {t: w for w, t in stack.tenants.items()}
    ids: dict[tuple[str, str], str] = {}

    def ident(w: str, k: str) -> str:
        if (w, k) not in ids:
            ids[(w, k)] = h.id(w, k)
        return ids[(w, k)]

    rows = stack.sql(FINDINGS)
    findings: dict[str, list[dict[str, Any]]] = {w: [] for w in WORLDS}
    for r in rows:
        findings[world_of[r["tenant"]]].append(
            {"pack": r["pack"], "dedupe_key": r["dedupe_key"], "detector": detector_of(r["dedupe_key"]), "impact": num(r["impact"])}
        )
    plants: dict[str, dict[str, Any]] = {}
    explained: dict[str, list[tuple[str, list[str]]]] = {w: [] for w in WORLDS}  # (detector, place ids) per world
    # `also` detectors that key on no outlet (tenant-level, e.g. purchasing.price_creep's <supplier>:<ingredient>:<week>)
    # are explained by the plant's other places instead (RG-C1's ing:paneer).
    tenant_level: dict[str, list[tuple[str, list[str]]]] = {w: [] for w in WORLDS}
    outlet_ids = {w: [r["id"] for r in stack.sql("SELECT id::text FROM core.outlet WHERE tenant_id = $1", stack.tenants[w])] for w in WORLDS}
    for w in WORLDS:
        for p in load(KEYS / f"{w}.json")["problems"]:
            e = dmap["problems"][p["id"]]
            if not e["detector"] or e.get("expect") or e["detector"].startswith("forecast."):
                continue
            places = [ident(w, a) for a in aliases(p["where"])]
            win = accept["date_window"].get(p["id"])
            if win and not (today <= date.fromisoformat(win["on"]) <= date.fromordinal(today.toordinal() + win["ahead_days"])):
                plants[p["id"]] = {"world": w, "skipped": f"date window: {win['on']} is not within {win['ahead_days']} days of {today}"}
                continue
            f, ok = match_plant(p, e["detector"], findings[w], accept, places)
            plants[p["id"]] = {"world": w, "found": f, "impact_ok": ok}
            # `also` detectors key on other things (a dish, a week): they are explained by the plant's outlet alone.
            outlets = [ident(w, a) for a in aliases(p["where"]) if a.startswith("outlet:")]
            explained[w] += [(e["detector"], places), *((d, outlets) for d in e.get("also", []))]
            others = [ident(w, a) for a in aliases(p["where"]) if not a.startswith("outlet:")]
            tenant_level[w] += [(d, others) for d in e.get("also", []) if others]
    false_alarms: dict[str, list[dict[str, str]]] = {}
    for w in WORLDS:
        false_alarms[w] = [
            {"detector": f["detector"], "pack": f["pack"]}
            for f in findings[w]
            if not any(f["detector"] == d and (not o or carries(f, o)) for d, o in explained[w])
            and not (
                not any(i in f["dedupe_key"] for i in outlet_ids[w])
                and any(f["detector"] == d and any(i in f["dedupe_key"] for i in o) for d, o in tenant_level[w])
            )
        ]
    traps = []
    for t in accept["traps"]:
        w = t["world"]
        keys = [ident(w, k) for k in t["keys"]]
        of_d = [f for f in findings[w] if f["detector"] == t["detector"]]
        items: list[str] = []
        if t.get("any_item_using"):
            items = [
                r["item"]
                for r in stack.sql(
                    """SELECT DISTINCT r.item_id::text AS item FROM core.recipe_version r
                         JOIN core.recipe_line l ON l.tenant_id = r.tenant_id AND l.recipe_version_id = r.id
                        WHERE r.tenant_id = $1 AND l.ingredient_id = $2""",
                    stack.tenants[w],
                    ident(w, t["any_item_using"]),
                )
            ]
            assert items, f"{t['id']}: no recipe uses {t['any_item_using']}"
        hit = [
            f
            for f in of_d
            if all(k in f["dedupe_key"] for k in keys)
            and (not items or any(i in f["dedupe_key"] for i in items))
            and (t["suffix"] is None or f["dedupe_key"].endswith(t["suffix"]))
        ]
        traps.append({"id": t["id"], "specialist": t["specialist"], "world": w, "silent": not hit, "paired_accept": len(of_d) > len(hit)})
    label_mismatch = [
        {"detector": f["detector"], "pack": f["pack"]} for w in WORLDS for f in findings[w] if f["pack"] not in {detector_pack(f["detector"])}
    ]
    draft_stats, draft_cases = drafts(h, stack, world_of)
    return {
        "wall_s": round(time.time() - t0, 1),
        "sweeps": {w: s["status"] for w, s in sweeps.items()},
        "findings": {w: len(v) for w, v in findings.items()},
        "by_detector": {w: {d: sum(1 for f in v if f["detector"] == d) for d in sorted({f["detector"] for f in v})} for w, v in findings.items()},
        "plants": plants,
        "false_alarms": false_alarms,
        "traps": traps,
        "label_mismatch": label_mismatch,
        "drafts": draft_stats,
        "draft_cases": draft_cases,
    }


def detector_pack(d: str) -> str:
    spec = load(EVALS / "spec.json")["detector_prefix_to_specialist"]
    return str(spec[d.split(".")[0]])


def leaves(o: Any) -> list[Any]:
    if isinstance(o, dict):
        return [x for v in o.values() for x in leaves(v)]
    if isinstance(o, list):
        return [x for v in o for x in leaves(v)]
    return [o]


def replace_first_ref(o: Any, new: Any) -> tuple[Any, bool]:
    """The payload with its first ref string replaced by `new`."""
    if isinstance(o, str):
        return (new, True) if REF.fullmatch(o) else (o, False)
    if isinstance(o, dict):
        out: dict[str, Any] = {}
        done = False
        for k, v in o.items():
            out[k], hit = (v, False) if done else replace_first_ref(v, new)
            done = done or hit
        return out, done
    if isinstance(o, list):
        lst: list[Any] = []
        done = False
        for v in o:
            nv, hit = (v, False) if done else replace_first_ref(v, new)
            lst.append(nv)
            done = done or hit
        return lst, done
    return o, False


def drafts(h: Harness, stack: Stack, world_of: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Draft-ref resolution per `intel:<pack>` draft (a numeric leaf is a ref string; a bare number is unresolved; a ref
    resolves when its snapshot, row and column exist in the draft's own tenant), then the paired validator cases on a
    real draft per pack: replay (accept), a typed number in place of a ref, a ref to a snapshot never minted."""
    stored = stack.sql(DRAFTS)
    stats: dict[str, dict[str, int]] = {}
    for d in stored:
        pack = d["source"].removeprefix("intel:")
        s = stats.setdefault(pack, {"drafts": 0, "numeric_leaves": 0, "resolved": 0})
        s["drafts"] += 1
        for leaf in leaves(d["command_payload"]):
            m = REF.fullmatch(leaf) if isinstance(leaf, str) else None
            if m:
                s["numeric_leaves"] += 1
                ok = stack.sql(REF_OK, d["tenant"], m.group(1), int(m.group(2)), m.group(3))
                s["resolved"] += int(bool(ok and ok[0]["ok"]))
            elif isinstance(leaf, (int, float)) and not isinstance(leaf, bool):
                s["numeric_leaves"] += 1
    cases: dict[str, dict[str, bool]] = {}
    before = len(stored)
    for pack in sorted(stats):
        pick = next((x for x in stored if x["source"] == f"intel:{pack}" and replace_first_ref(x["command_payload"], 0)[1]), None)
        if pick is None:  # workflow drafts (compliance) carry no snapshot cell: nothing for the number-and-ref cases to bite on
            continue
        world = world_of[pick["tenant"]]
        t = stack.call("token", world=world, trigger="watch_sweep", scope=["*"])
        headers = {
            "authorization": f"Bearer {t['token']}",
            "x-munim-service-secret": stack.ready["secret"],
            "content-type": "application/json",
        }
        based_on = [b["ref"] if isinstance(b, dict) else b for b in pick["based_on"]]
        body = {
            "draft_id": pick["id"], "pack": pack, "command_type": pick["command_type"], "payload": pick["command_payload"],
            "outlet_ids": pick["outlet_ids"], "finding_id": pick["finding_id"], "evidence": pick["evidence"], "based_on": based_on,
        }

        def post(b: dict[str, Any], headers: dict[str, str] = headers) -> tuple[int, dict[str, Any]]:
            r = stack.call("http", method="POST", path="/internal/intel/v1/drafts", headers=headers, body=json.dumps(b))
            try:
                return int(r["status"]), dict(json.loads(r["body"]))
            except ValueError:
                return int(r["status"]), {}

        status, replay = post(body)
        accept_ok = status in (200, 201) and replay.get("status") == "proposed"
        out = {"accept_replay": accept_ok}
        for name, new in (("typed_number_refused", 40), ("forged_ref_refused", f"⟨snap:{uuid7()}·0·impact_minor⟩")):
            payload, hit = replace_first_ref(pick["command_payload"], new)
            assert hit, f"{pack}: a stored draft with no ref to replace"
            status, res = post({**body, "draft_id": uuid7(), "payload": payload})
            out[name] = not (status in (200, 201) and res.get("status") == "proposed")
        cases[pack] = out
    after = int(stack.sql("SELECT count(*)::int AS n FROM core.draft WHERE source LIKE 'intel:%'")[0]["n"])
    for c in cases.values():
        c["nothing_stored"] = after == before
    return stats, cases


# ---- investigation ----------------------------------------------------------------------------------------------------


def investigation() -> dict[str, Any]:
    """The T-083 e2e module's own gates 1-3 (bridge before and after, supported items, the held settlement), run in its
    file order on its Stack; failures are recorded, the verdict lists are read from the final view."""
    path = TESTS / "investigate" / "test_investigate_e2e.py"
    spec = importlib.util.spec_from_file_location("t083_e2e", path)
    assert spec and spec.loader
    mod: ModuleType = importlib.util.module_from_spec(spec)
    sys.modules["t083_e2e"] = mod
    spec.loader.exec_module(mod)
    t0 = time.time()
    s = mod.Stack()
    failed: list[str] = []
    try:
        for name in (
            "test_plain_world_h0_cannot_complete_pos_days_open",
            "test_shift_history_closes_every_trading_day_and_leaves_the_held_settlement",
            "test_gate3_held_settlement_waits_and_gate1_bridge_is_the_keys_before",
            "test_gate3_approved_import_then_continue_supports_h0",
            "test_gate1_bridge_sum_is_the_margin_delta_is_the_key",
        ):
            try:
                getattr(mod, name)(s)
            except AssertionError as e:
                failed.append(f"{name}: {str(e)[:200]}")
        view = mod.VIEWS.get(("A", 2), {})
        status = mod.status_of(view) if view else {}
    finally:
        s.stop()
    return {
        "plant": "RG-MF1",
        "checks_failed": failed,
        "supported": sorted(k for k, v in status.items() if v == "supported"),
        "refuted": sorted(k for k, v in status.items() if v == "refuted"),
        "investigation_status": view.get("status"),
        "wall_s": round(time.time() - t0, 1),
    }


# ---- recorded plumbing ------------------------------------------------------------------------------------------------


def plumbing() -> dict[str, Any]:
    """Runs, model calls and stored abstentions per category, from the T-053 kit's twenty recorded questions (real Manager,
    branches, validator; in-memory core), and the T-054 brief in its two modes. `matches_labels` counts runs whose
    (intent, path, branches, outcome) equal labels.json, hand-written by the T-053 lane."""
    import fanout_kit as k
    from test_fanout import LABELS, classify

    cats: dict[str, dict[str, Any]] = {}

    def bump(cat: str, calls: int, abstained: bool, matched: bool | None) -> None:
        c = cats.setdefault(cat, {"runs": 0, "model_calls": 0, "abstains": 0, "matches_labels": 0, "labelled": 0})
        c["runs"] += 1
        c["model_calls"] += calls
        c["abstains"] += int(abstained)
        if matched is not None:
            c["labelled"] += 1
            c["matches_labels"] += int(matched)

    for q in k.QUESTIONS:
        r = k.run(q)
        got = classify(r)
        calls = sum(k.Counted.CALLS.values())
        matched = got == LABELS[q.question]
        cat = "ask_paths" if got["path"] != "fan_out" else "fan_out"
        bump(cat, calls, bool(r.envelope["abstained"]), matched)
        if q.in_thread:
            bump("threads", calls, bool(r.envelope["abstained"]), matched)
    cats.update(brief())
    return cats


def brief() -> dict[str, dict[str, Any]]:
    from munim_intel.brief import compile_brief
    from munim_intel.config import load_config
    from munim_intel.llm.recorded import RecordedLlm
    from munim_intel.runtime.context import RunContext
    from munim_intel.runtime.state import RunState
    from munim_intel.trace.buffer import TraceBuffer

    sys.path.insert(0, str(TESTS))
    from brief.briefkit import RecordingSink, items, vid

    async def go() -> dict[str, dict[str, Any]]:
        cfg = load_config(env={}, run_dir=Path(tempfile.mkdtemp()))
        ctx = RunContext(vid(0xAA), vid(0xBB), ("*",), "brief", "brief", 0, "")

        async def sink_traces(_: Any) -> None:
            return None

        out = {"runs": 0, "model_calls": 0, "abstains": 0, "matches_labels": 0, "labelled": 0}
        for llm in (RecordedLlm(model="recorded/narrate", fixtures_dir=TESTS / "brief" / "fixtures"), None):
            sink = RecordingSink()
            rep = await compile_brief(items(), sink, ctx=ctx, llm=llm, cfg=cfg, state=RunState(traces=TraceBuffer(sink_traces)))
            out["runs"] += 1
            out["model_calls"] += rep.model_calls
            out["abstains"] += int(rep.abstained)
            out["labelled"] += 1
            # The hand-stated shape (test_brief.py): posted once, five items, one model call in model mode and none with AI off.
            out["matches_labels"] += int(rep.posted and rep.items == 5 and rep.model_calls == (1 if llm else 0))
        return {"brief": out}

    return asyncio.run(go())


def main() -> None:
    t0 = time.time()
    accept = load(EVALS / "accept.json")
    dmap = load(KEYS / "detector-map.json")
    stack = Stack(DAYS, WORLDS)
    seed_s = round(time.time() - t0, 1)
    try:
        h = Harness(stack, Path(tempfile.mkdtemp(prefix="eval-w3-")))
        det = detectors(h, stack, dmap, accept, date.today())
    finally:
        stack.stop()
    inv = investigation()
    plumb = plumbing()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "inputs": {str(p.relative_to(REPO)): sha(p) for p in INPUTS},
                "measured_on": date.today().isoformat(),
                "wall_s": {"seed_4_worlds": seed_s, "sweeps_and_drafts": det.pop("wall_s"), "investigation_stack": inv.pop("wall_s")},
                "detectors": det,
                "investigation": inv,
                "plumbing": plumb,
            },
            indent=1,
            sort_keys=True,
        )
        + "\n",
        "utf8",
    )
    print(f"measured in {time.time() - t0:.0f}s -> {OUT}")


if __name__ == "__main__":
    main()
