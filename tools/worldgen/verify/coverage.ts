// The answer-key coverage gate (T-086): every problem in the four keys has a detector-map entry whose kind matches, whose detector id is a real pack §4
// id (read from docs/plan/packs, not from the map), and every kind has a recompute case and a place in LOCATORS; no number rides in a key's `where` that
// is not a window offset, a check, or a listed pending input; and the board's 28 pack §10 cases each point at key ids that exist or say why they cannot.
//   node tools/worldgen/verify/coverage.ts [--keys-dir=DIR] [--map=FILE]     exit 1 on any problem (red-proofs point it at a damaged copy)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECK_FIELDS, LOCATORS, PENDING_INPUTS } from "./pending-inputs.ts";

const HERE = import.meta.dirname;
const ROOT = join(HERE, "..", "..", "..");

/** The pack §10 cases the board row b-86 lists (BOARD.md W3), hand-typed. */
export const BOARD_CASES = ["C1", "C2", "C3", "C5", "C6", "K1", "K4", "K5", "K6", "M1", "M2", "M3", "M4", "FC2", "FC2b", "FC4", "P2", "G1", "G2", "G3", "G5", "G6", "F5", "F6", "F7", "F8", "A4", "A7"] as const;

interface Problem { id: string; kind: string; where: Record<string, unknown>; bridge?: Record<string, Record<string, readonly number[]>> }
interface MapEntry { kind: string; detector: string | null; also?: string[]; expect?: string; why_none?: string }
interface PackCase { key?: string[]; not_built?: string; partial?: string }
export interface DetectorMap { problems: Record<string, MapEntry>; pack_cases: Record<string, PackCase> }

/** Detector ids from the §4 tables of the pack docs: the first backticked cell of each table row under "## 4 · Detectors". */
export function packDetectorIds(packsDir = join(ROOT, "docs", "plan", "packs")): Set<string> {
  const ids = new Set<string>();
  for (const f of readdirSync(packsDir).filter((x) => x.endsWith(".md"))) {
    const text = readFileSync(join(packsDir, f), "utf8");
    const start = text.search(/^## 4 · Detectors/m);
    if (start < 0) continue;
    const rest = text.slice(start + 1);
    const end = rest.search(/\n## 5/);
    for (const m of (end < 0 ? rest : rest.slice(0, end)).matchAll(/^\| `([a-z_]+\.[a-z_]+)`[^|]*\|/gm)) ids.add(m[1]!);
  }
  return ids;
}

const BRIDGE_ROWS = ["revenue_volume", "revenue_price", "deal_discount", "cogs_supplier_price", "cogs_volume_mix", "waste", "channel_fees", "labour", "other", "unexplained", "margin_delta_minor"];
const roundAway = (n: number, d: number) => Math.sign(n) * Math.floor((2 * Math.abs(n) + d) / (2 * d));

/** A key bridge must balance exactly: Σ component priors = the margin before, Σ currents = the margin after, so Σ deltas = the margin delta; each share is
 *  delta over |margin delta| rounded; the residual (`unexplained`) stays inside the 2,000 bp the playbook allows. */
export function bridgeProblems(id: string, bridge: NonNullable<Problem["bridge"]>): string[] {
  const bad: string[] = [];
  for (const state of ["before", "after"]) {
    const rows = bridge[state];
    if (!rows || JSON.stringify(Object.keys(rows)) !== JSON.stringify(BRIDGE_ROWS)) { bad.push(`${id}.${state}: rows are not ${BRIDGE_ROWS.join(",")}`); continue; }
    const comps = BRIDGE_ROWS.slice(0, -1).map((k) => rows[k]!);
    const [mp, mc] = [rows.margin_delta_minor![0]!, rows.margin_delta_minor![1]!];
    const sum = (i: number) => comps.reduce((a, r) => a + r[i]!, 0);
    if (sum(0) !== mp) bad.push(`${id}.${state}: Σ prior ${sum(0)} ≠ margin before ${mp}`);
    if (sum(1) !== mc) bad.push(`${id}.${state}: Σ current ${sum(1)} ≠ margin after ${mc}`);
    if (sum(1) - sum(0) !== mc - mp) bad.push(`${id}.${state}: Σ deltas ${sum(1) - sum(0)} ≠ margin delta ${mc - mp}`);
    for (const k of BRIDGE_ROWS) {
      const [a, b, share] = rows[k]!;
      if (share !== roundAway((b! - a!) * 10000, Math.abs(mc - mp))) bad.push(`${id}.${state}.${k}: share_bp ${share} is not delta over |margin delta|`);
    }
    const u = roundAway((rows.unexplained![1]! - rows.unexplained![0]!) * 10000, Math.abs(mc - mp));
    if (Math.abs(u) > 2000) bad.push(`${id}.${state}: unexplained ${u} bp is above the 2,000 bp bar`);
  }
  return bad;
}

export function loadKeys(dir: string): Problem[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "detector-map.json")
    .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), "utf8")) as { problems: Problem[] }).problems);
}

export function check(o: { problems: readonly Problem[]; map: DetectorMap; recomputeSrc: string; detectors: ReadonlySet<string>; boardCases: readonly string[] }): string[] {
  const bad: string[] = [];
  const ids = new Set(o.problems.map((p) => p.id));
  if (ids.size !== o.problems.length) bad.push("duplicate problem ids across the keys");
  const pending = (kind: string) => PENDING_INPUTS.filter((p) => p.kind === kind).map((p) => p.field);
  for (const p of o.problems) {
    const m = o.map.problems[p.id];
    if (!m) bad.push(`${p.id}: no detector-map entry`);
    else {
      if (m.kind !== p.kind) bad.push(`${p.id}: map says kind ${m.kind}, key says ${p.kind}`);
      if (m.detector === null && !m.why_none) bad.push(`${p.id}: detector null without why_none`);
      if (m.detector !== null && !o.detectors.has(m.detector)) bad.push(`${p.id}: ${m.detector} is not a pack §4 detector`);
      for (const a of m.also ?? []) if (!o.detectors.has(a)) bad.push(`${p.id}: also ${a} is not a pack §4 detector`);
      if (m.expect !== undefined && (m.expect !== "no_finding" || m.detector === null)) bad.push(`${p.id}: expect must be no_finding on a named detector`);
    }
    if (p.kind === "margin_bridge") bad.push(...(p.bridge ? bridgeProblems(p.id, p.bridge) : [`${p.id}: no bridge rows`]));
    if (!o.recomputeSrc.includes(`case "${p.kind}":`)) bad.push(`${p.id}: kind ${p.kind} has no recompute case`);
    const listed = LOCATORS[p.kind];
    if (!listed) { bad.push(`${p.id}: kind ${p.kind} is not in LOCATORS`); continue; }
    for (const [field, value] of Object.entries(p.where)) {
      if (!listed.includes(field) && !pending(p.kind).includes(field)) bad.push(`${p.id}: where.${field} is neither a locator nor a pending input`);
      if (typeof value === "number" && !field.endsWith("_offset") && !CHECK_FIELDS.includes(field) && !pending(p.kind).includes(field)) {
        bad.push(`${p.id}: where.${field} is a number the recompute could take as input`);
      }
    }
  }
  for (const id of Object.keys(o.map.problems)) if (!ids.has(id)) bad.push(`${id}: in the detector map but in no key`);
  for (const c of o.boardCases) {
    const e = o.map.pack_cases[c];
    if (!e) { bad.push(`pack case ${c}: no entry`); continue; }
    if (e.key && e.not_built) bad.push(`pack case ${c}: both key and not_built`);
    if (!e.key && !(e.not_built && e.not_built.length >= 40)) bad.push(`pack case ${c}: neither key ids nor a reason of at least 40 characters`);
    for (const k of e.key ?? []) if (!ids.has(k)) bad.push(`pack case ${c}: key id ${k} does not exist`);
  }
  for (const c of Object.keys(o.map.pack_cases)) if (!o.boardCases.includes(c) && c !== "M1b") bad.push(`pack case ${c}: not on the board row's list`);
  return bad;
}

if (import.meta.filename === process.argv[1]) {
  let keysDir = join(HERE, "..", "answer-key");
  let mapFile = join(keysDir, "detector-map.json");
  for (const a of process.argv.slice(2)) {
    const m = /^--(keys-dir|map)=(.*)$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a}`);
    if (m[1] === "keys-dir") keysDir = m[2]!; else mapFile = m[2]!;
  }
  const problems = loadKeys(keysDir);
  const bad = check({
    problems, map: JSON.parse(readFileSync(mapFile, "utf8")) as DetectorMap, recomputeSrc: readFileSync(join(HERE, "recompute.ts"), "utf8"),
    detectors: packDetectorIds(), boardCases: BOARD_CASES,
  });
  for (const b of bad) console.log(`FAIL  ${b}`);
  console.log(`coverage: ${problems.length} problems, ${new Set(problems.map((p) => p.kind)).size} kinds, ${BOARD_CASES.length} board cases → ${bad.length === 0 ? "ok" : `${bad.length} problem(s)`}`);
  process.exit(bad.length === 0 ? 0 : 1);
}
