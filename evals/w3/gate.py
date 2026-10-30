"""T-085 gate stage of `make eval-w3`: reads measured.json (the measure stage), the hand-kept answer keys and the hand files
beside this one, prints the tables and exits non-zero on any red. Pure and fast: no stack, no model, no network.

Denominators come from the answer keys and detector-map.json (read here, never from measured.json); measured.json says only
what the recorded stacks found. Overrides for the red-proofs (planted copies live outside the tree): EVAL_W3_MEASURED,
EVAL_W3_THRESHOLDS, EVAL_W3_SPEC, EVAL_W3_GOLDENS (a directory).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from fractions import Fraction
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
KEYS = REPO / "tools" / "worldgen" / "answer-key"

# Ledger F8 (specialists) and worldgen's worlds, typed here a second time on purpose: spec.json is the table's definition,
# these pins are what the table must be (8 x 4 = 32 rows). Dropping a specialist from spec.json turns the gate red.
F8 = ["catalogue", "kitchen", "inventory_purchasing", "finance", "people", "customers", "compliance", "market"]
WORLDS = ["restaurant_group", "cloud_kitchen", "store", "au_outlet"]
ROWS = len(F8) * len(WORLDS)

# Golden files assert end state only: counts, ids, labels, booleans. Any other key (text, contains, regex, says ...) is a
# transcript assertion and turns the lint red. A string value is an identifier (no whitespace), never a sentence.
GOLDEN_KEYS = {
    "_about",
    "ask_paths",
    "fan_out",
    "threads",
    "brief",
    "runs",
    "abstains",
    "model_calls",
    "matches_labels",
    "labelled",
    "plant",
    "supported",
    "refuted",
    "investigation_status",
    "checks_failed",
}


def load(p: Path) -> Any:
    return json.loads(p.read_text("utf8"))


def lint_goldens(d: Path) -> list[str]:
    bad: list[str] = []
    files = sorted(d.glob("*.json"))
    if not files:
        return [f"no golden files in {d}"]

    def walk(o: Any, where: str) -> None:
        if isinstance(o, dict):
            for k, v in o.items():
                if k not in GOLDEN_KEYS:
                    bad.append(f"{where}: key {k!r} is not an end-state assertion (rows, refs, counts, ids)")
                walk(v, f"{where}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{where}[{i}]")
        elif isinstance(o, str) and any(c.isspace() for c in o) and not where.endswith("._about"):
            bad.append(f"{where}: a prose string value {o[:40]!r} (transcript text)")

    for f in files:
        walk(load(f), f.name)
    return bad


def frac(num: int, den: int) -> str:
    return f"{num}/{den} {100 * num // den}%"


def main() -> int:
    measured_p = Path(os.environ.get("EVAL_W3_MEASURED", str(REPO / ".run" / "eval-w3" / "measured.json")))
    spec = load(Path(os.environ.get("EVAL_W3_SPEC", str(HERE / "spec.json"))))
    thr = load(Path(os.environ.get("EVAL_W3_THRESHOLDS", str(HERE / "thresholds.json"))))
    goldens = Path(os.environ.get("EVAL_W3_GOLDENS", str(HERE / "goldens")))
    reds: list[str] = []
    if not measured_p.exists():
        print(f"eval-w3 gate: RED {measured_p} missing: run the measure stage first", file=sys.stderr)
        return 1
    m = load(measured_p)

    # Freshness (gotcha 13): measured.json must come from these exact answer keys, detector-map and accept.json.
    for rel, h in m["inputs"].items():
        if hashlib.sha256((REPO / rel).read_bytes()).hexdigest() != h:
            reds.append(f"stale measurement: {rel} changed since measured.json was written")

    # Gate 4: the grid is the hand-pinned F8 x worlds.
    if spec["specialists"] != F8 or spec["worlds"] != WORLDS:
        reds.append(f"grid: spec.json lists {spec['specialists']} x {spec['worlds']}, expected the {ROWS}-row F8 x worldgen grid")
    na = {(n["specialist"], n["world"]) for n in spec["not_applicable"]}
    if na != {("kitchen", "store")}:
        reds.append(f"not_applicable must be exactly kitchen x store, got {sorted(na)}")

    # Plants per cell, from the answer keys alone.
    dmap = load(KEYS / "detector-map.json")["problems"]
    cell_plants: dict[tuple[str, str], list[str]] = {}
    unmapped: dict[tuple[str, str], list[str]] = {}
    service: list[str] = []
    for w in WORLDS:
        for p in load(KEYS / f"{w}.json")["problems"]:
            if p["pack"] in spec["service_packs"]:
                service.append(p["id"])
                continue
            e = dmap[p["id"]]
            if e.get("expect") == "no_finding":
                continue  # a trap: counted under refusals
            s = spec["key_pack_to_specialist"][p["pack"]]
            (cell_plants if e["detector"] else unmapped).setdefault((s, w), []).append(p["id"])
    det = m["detectors"]
    plants = det["plants"]

    exc = thr["n1_floor_exceptions"]
    table: list[dict[str, Any]] = []
    for s in F8:
        for w in WORLDS:
            cell = f"{s}/{w}"
            ids = cell_plants.get((s, w), [])
            row: dict[str, Any] = {"s": s, "w": w, "cell": cell}
            if (s, w) in na:
                row["n1"] = "n/a"
                if ids or unmapped.get((s, w)):
                    reds.append(f"{cell}: marked n/a but the key plants {ids + unmapped.get((s, w), [])}")
                if cell in exc:
                    reds.append(f"{cell}: a threshold on an n/a row")
                if any(spec["detector_prefix_to_specialist"][d.split(".")[0]] == s for d in det["by_detector"][w]):
                    reds.append(f"{cell}: a finding on an n/a row")
            elif not ids:
                row["n1"] = "no plants"
                if cell in exc:
                    reds.append(f"{cell}: a threshold ({exc[cell]['floor']}) on a row with no plants: must print 'no plants', never 100%")
            else:
                skipped = [i for i in ids if "skipped" in plants[i]]
                live = [i for i in ids if i not in skipped]
                ok = sum(1 for i in live if plants[i]["impact_ok"])
                found = sum(1 for i in live if plants[i]["found"])
                row.update(ok=ok, found=found, total=len(live), skipped=skipped)
                row["n1"] = frac(ok, len(live)) if live else "all skipped (date window)"
                floor = Fraction(exc[cell]["floor"]) if cell in exc else Fraction(1)
                if floor > 1:
                    reds.append(f"{cell}: floor {floor} is above the answer-key ratio (at most 1)")
                elif live and Fraction(ok, len(live)) < floor:
                    reds.append(f"{cell}: N1 {ok}/{len(live)} is below the floor {floor}")
            row["unmapped"] = len(unmapped.get((s, w), []))
            row["fa"] = sum(
                1
                for f in det["false_alarms"][w]
                if spec["detector_prefix_to_specialist"][f["detector"].split(".")[0]] == s
                and f["detector"] not in thr["false_alarms"]["excluded_detectors"]
            )
            table.append(row)
    if len(table) != ROWS:
        reds.append(f"rows: {len(table)} != {ROWS}")
    for cell in exc:
        s, w = cell.split("/")
        if s not in F8 or w not in WORLDS:
            reds.append(f"threshold on unknown cell {cell}")

    for w in WORLDS:
        n = sum(r["fa"] for r in table if r["w"] == w)
        if n > thr["false_alarms"]["max_per_world"]:
            reds.append(f"{w}: {n} false alarms > {thr['false_alarms']['max_per_world']}")
    if det["label_mismatch"]:
        reds.append(f"specialist labels: {len(det['label_mismatch'])} finding(s) filed under another specialist")
    for w in WORLDS:
        if det["sweeps"][w] != "done":
            reds.append(f"{w}: sweep status {det['sweeps'][w]}")

    # Per specialist: refusal cases and draft-ref resolution.
    per: dict[str, dict[str, Any]] = {}
    for s in F8:
        cases = [(t["id"], t["silent"] and t["paired_accept"]) for t in det["traps"] if t["specialist"] == s]
        draft_cases = det["draft_cases"].get(s, {})
        cases += [(f"drafts.{k}", bool(v)) for k, v in sorted(draft_cases.items())]
        refs = det["drafts"].get(s)
        per[s] = {"cases": cases, "refs": refs}
        for name, ok in cases:
            if not ok:
                reds.append(f"{s}: refusal case {name} failed")
        if refs and refs["resolved"] < refs["numeric_leaves"]:
            reds.append(f"{s}: draft refs {refs['resolved']}/{refs['numeric_leaves']} resolve")

    # Investigation (RG-MF1) against the hand-typed key lists.
    inv, gold_inv = m["investigation"], load(goldens / "investigation.json")
    for field in ("supported", "refuted", "investigation_status", "checks_failed"):
        if inv[field] != gold_inv[field]:
            reds.append(f"investigation {field}: got {inv[field]}, key says {gold_inv[field]}")

    # Plumbing against the goldens.
    plumb, gold_pl = m["plumbing"], load(goldens / "plumbing.json")
    for cat in ("ask_paths", "fan_out", "threads", "brief"):
        for field in ("runs", "abstains", "model_calls"):
            if plumb[cat][field] != gold_pl[cat][field]:
                reds.append(f"plumbing {cat}.{field}: got {plumb[cat][field]}, golden {gold_pl[cat][field]}")
        if plumb[cat]["matches_labels"] != plumb[cat]["labelled"] or plumb[cat]["labelled"] != gold_pl[cat]["labelled"]:
            reds.append(f"plumbing {cat}: {plumb[cat]['matches_labels']}/{plumb[cat]['labelled']} runs match their hand labels")

    # Gate 3: the golden lint.
    reds += [f"golden lint: {b}" for b in lint_goldens(goldens)]

    # ---- print ---------------------------------------------------------------------------------------------------
    print("Munim W3 eval: recorded models (MUNIM_MODEL_MODE=recorded), synthetic worlds, 100-day gate profile as of 2026-10-10")
    print("\nN1 per specialist x world (answer-key plants found with impact = key; denominators from the keys)")
    print(f"{'specialist':<22}{'world':<18}{'N1 impact=key':<22}{'found':>7}{'unmapped':>10}{'false alarms':>14}")
    for r in table:
        shown = f"{r['found']}/{r['total']}" if "found" in r else "-"
        print(f"{r['s']:<22}{r['w']:<18}{r['n1']:<22}{shown:>7}{r['unmapped']:>10}{('-' if r['n1'] == 'n/a' else r['fa']):>14}")
    skipped = [i for i, p in plants.items() if "skipped" in p]
    print(f"\nrows: {len(table)} (= {len(F8)} specialists x {len(WORLDS)} worlds); skipped for the date window: {len(skipped)} {skipped}")
    print(
        "unmapped = key plants with no detector (a watcher, tile or abstain case; detector-map.json); "
        f"forecast plants {sorted(service)} belong to the service, not a row"
    )

    print("\nPer specialist")
    print(f"{'specialist':<22}{'N1 impact=key':<16}{'false alarms':>13}{'  refusal-case pass':<22}{'draft-ref resolution':<24}")
    for s in F8:
        rows = [r for r in table if r["s"] == s and "total" in r]
        tot, ok = sum(r["total"] for r in rows), sum(r["ok"] for r in rows)
        cases = per[s]["cases"]
        refs = per[s]["refs"]
        rf = frac(sum(1 for _, o in cases if o), len(cases)) if cases else "no cases"
        dr = (
            "no drafts"
            if not refs
            else (frac(refs["resolved"], refs["numeric_leaves"]) if refs["numeric_leaves"] else f"{refs['drafts']} drafts, no numeric leaf")
        )
        print(f"{s:<22}{(frac(ok, tot) if tot else 'no plants'):<16}{sum(r['fa'] for r in table if r['s'] == s):>13}  {rf:<20}{dr:<24}")
    fa = thr["false_alarms"]
    print(
        "false alarms exclude",
        fa["excluded_detectors"],
        "(the catalogue lane's documented baseline-waste mismatch); limit",
        fa["max_per_world"],
        "a world",
    )
    print(
        "refusal cases = answer-key traps silent with a paired accept, plus per real draft: replay accepted, "
        "typed number refused, forged ref refused, nothing stored"
    )

    print("\nInvestigation RG-MF1 (T-083 stack, restaurant_group)")
    print(f"  supported: {inv['supported']}   (key: {gold_inv['supported']})")
    print(f"  refuted:   {inv['refuted']}   (key: {gold_inv['refuted']})")
    held = "all hold" if not inv["checks_failed"] else inv["checks_failed"]
    print(f"  status: {inv['investigation_status']}; the T-083 gates re-run on this stack: {held}")

    print("\nRecorded plumbing (synthetic replies: counts, not answer quality)")
    print(f"{'category':<12}{'runs':>6}{'model calls':>13}{'abstains':>10}{'match hand labels':>20}")
    for cat in ("ask_paths", "fan_out", "threads", "brief"):
        c = plumb[cat]
        print(f"{cat:<12}{c['runs']:>6}{c['model_calls']:>13}{c['abstains']:>10}{str(c['matches_labels']) + '/' + str(c['labelled']):>20}")
    wall = m["wall_s"]
    print(
        f"\nmeasured on {m['measured_on']}; wall time: seed 4 worlds {wall['seed_4_worlds']}s, "
        f"sweeps+drafts {wall['sweeps_and_drafts']}s, investigation stack {wall['investigation_stack']}s"
    )
    if reds:
        print(f"\nRED ({len(reds)}):")
        for red in reds:
            print("  -", red)
        return 1
    print("\nGREEN: every gate holds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
