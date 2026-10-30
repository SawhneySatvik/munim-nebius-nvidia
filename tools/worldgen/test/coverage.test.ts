// T-086 gate: the coverage script is green on the real keys, and each way it can be red is red with a non-zero process exit (not just a failing line).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { BOARD_CASES, packDetectorIds } from "../verify/coverage.ts";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "verify", "coverage.ts");
// Hand-typed from the board row b-86 (BOARD.md W3): the pack §10 cases it lists.
const LISTED = "C1 C2 C3 C5 C6 K1 K4 K5 K6 M1 M2 M3 M4 FC2 FC2b FC4 P2 G1 G2 G3 G5 G6 F5 F6 F7 F8 A4 A7".split(" ");

function run(keysDir: string, mapFile: string) {
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [SCRIPT, `--keys-dir=${keysDir}`, `--map=${mapFile}`], { encoding: "utf8", env });
}

/** A scratch copy of the keys and the map, damaged by `f`; returns the process result. */
function damaged(f: (keys: Record<string, { problems: Array<Record<string, any>> }>, map: any) => void) {
  const dir = mkdtempSync(join(tmpdir(), "coverage-"));
  try {
    cpSync(join(ROOT, "answer-key"), dir, { recursive: true });
    const keys: Record<string, any> = {};
    for (const w of ["restaurant_group", "cloud_kitchen", "store", "au_outlet"]) keys[w] = JSON.parse(readFileSync(join(dir, `${w}.json`), "utf8"));
    const map = JSON.parse(readFileSync(join(dir, "detector-map.json"), "utf8"));
    f(keys, map);
    for (const [w, k] of Object.entries(keys)) writeFileSync(join(dir, `${w}.json`), JSON.stringify(k));
    writeFileSync(join(dir, "detector-map.json"), JSON.stringify(map));
    return run(dir, join(dir, "detector-map.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("answer-key coverage (T-086)", () => {
  test("the board's list is the script's list, and the pack docs hold the detector ids the map relies on", () => {
    assert.deepEqual([...BOARD_CASES], LISTED);
    assert.equal(LISTED.length, 28);
    const ids = packDetectorIds();
    assert.ok(ids.size >= 40, `only ${ids.size} detector ids parsed from the pack docs`);
    for (const known of ["kitchen.overprep", "finance.tender_gap", "market.event_ahead", "people.advance_unrecovered", "catalogue.above_mrp"]) assert.ok(ids.has(known), known);
  });

  test("green on the real keys: exit 0 and counts from an independent read of the four key files", () => {
    let problems = 0;
    const kinds = new Set<string>();
    for (const w of ["restaurant_group", "cloud_kitchen", "store", "au_outlet"]) {
      for (const p of (JSON.parse(readFileSync(join(ROOT, "answer-key", `${w}.json`), "utf8")) as { problems: Array<{ kind: string }> }).problems) { problems++; kinds.add(p.kind); }
    }
    assert.ok(problems >= 76 && kinds.size >= 40, `${problems} problems, ${kinds.size} kinds`);
    const r = run(join(ROOT, "answer-key"), join(ROOT, "answer-key", "detector-map.json"));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`coverage: ${problems} problems, ${kinds.size} kinds, 28 board cases → ok`));
  });

  const red: Array<[string, Parameters<typeof damaged>[0], RegExp[]]> = [
    ["RED-PROOF: a kind with no map entry, no recompute case and no LOCATORS entry", (k) => { k.restaurant_group!.problems.push({ id: "RG-ZZ", pack: "finance", kind: "mystery_kind", what: "planted", where: { outlet: "outlet:1" }, impact_minor: 1 }); }, [/RG-ZZ: no detector-map entry/]],
    ["RED-PROOF: a key problem the map does not name", (_k, m) => { delete m.problems["RG-C1"]; }, [/RG-C1: no detector-map entry/]],
    ["RED-PROOF: a map entry for a problem in no key", (_k, m) => { m.problems["RG-GHOST"] = { kind: "cost_drift", detector: "catalogue.cost_drift" }; }, [/RG-GHOST: in the detector map but in no key/]],
    ["RED-PROOF: a detector id the pack docs do not have", (_k, m) => { m.problems["RG-C1"].detector = "catalogue.cost_drifting"; }, [/RG-C1: catalogue.cost_drifting is not a pack §4 detector/]],
    ["RED-PROOF: a map kind that disagrees with the key", (_k, m) => { m.problems["RG-C1"].kind = "price_creep"; }, [/RG-C1: map says kind price_creep, key says cost_drift/]],
    ["RED-PROOF: a null detector with no reason", (_k, m) => { delete m.problems["RG-X1"].why_none; }, [/RG-X1: detector null without why_none/]],
    ["RED-PROOF: a number in the key the recompute could take as input", (k) => { k.restaurant_group!.problems.find((p) => p.id === "RG-S1")!.where.min_milli = 50000; }, [/RG-S1: where.min_milli is neither a locator nor a pending input/]],
    ["RED-PROOF: a bridge that does not sum (one component off by a paisa)", (k) => { k.restaurant_group!.problems.find((p) => p.id === "RG-MF1")!.bridge.after.waste[1] += 1; }, [/RG-MF1\.after: Σ current .* ≠ margin after/, /RG-MF1\.after: Σ deltas/]],
    ["RED-PROOF: a bridge share that is not delta over the margin delta", (k) => { k.restaurant_group!.problems.find((p) => p.id === "RG-MF1")!.bridge.before.waste[2] = -1; }, [/RG-MF1\.before\.waste: share_bp -1 is not delta over/]],
    ["RED-PROOF: a bridge residual above the playbook's bar", (k) => { const a = k.restaurant_group!.problems.find((p) => p.id === "RG-MF1")!.bridge.after; a.unexplained[1] -= 2000000; a.margin_delta_minor[1] -= 2000000; }, [/RG-MF1\.after: unexplained .* above the 2,000 bp bar/]],
    ["RED-PROOF: a pack case dropped from the map", (_k, m) => { delete m.pack_cases.K1; }, [/pack case K1: no entry/]],
    ["RED-PROOF: a pack case pointing at a key id that does not exist", (_k, m) => { m.pack_cases.C1.key = ["RG-NOPE"]; }, [/pack case C1: key id RG-NOPE does not exist/]],
    ["RED-PROOF: a not-built case with a one-word reason", (_k, m) => { m.pack_cases.K1 = { not_built: "hard" }; }, [/pack case K1: neither key ids nor a reason/]],
  ];
  for (const [name, f, expected] of red) {
    test(name, () => {
      const r = damaged(f);
      assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}${r.stderr}`);
      for (const re of expected) assert.match(r.stdout, re);
    });
  }
  test("RED-PROOF: the unmapped kind is also reported as having no recompute case", () => {
    const r = damaged((k) => { k.restaurant_group!.problems.push({ id: "RG-ZZ", pack: "finance", kind: "mystery_kind", what: "planted", where: {}, impact_minor: 1 }); });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /RG-ZZ: kind mystery_kind has no recompute case/);
    assert.match(r.stdout, /RG-ZZ: kind mystery_kind is not in LOCATORS/);
  });
});
