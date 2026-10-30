// Verify a seeded world against its answer key. Live use:
//   MUNIM_API_URL=http://127.0.0.1:8787 MUNIM_SEED_TOKEN=<owner bearer> node tools/worldgen/verify/run.ts --world=restaurant_group --as-of=2026-10-10 [--days=183]
// A demo world is reseeded with a fresh seed each time: pass that run's --seed (the key's own seed is the default).
// Exit 1 when any entry fails to resolve or recompute to the key.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyWorld, type AnswerKey } from "./recompute.ts";

/** The world's key as it applies to a timeline of `days` days: a long-window plant is in the key only when the timeline reaches it, and an entry
 *  whose figures were counted from the dated bills (or whose offsets assume the calendar) is in the key only for the as-of it was counted at. */
export function loadKey(world: string, days = Number.POSITIVE_INFINITY, asOf?: string): AnswerKey {
  // A demo world's key sits in answer-key/demo/, apart from the evaluation keys (their coverage gate reads every top-level file).
  const top = join(import.meta.dirname, "..", "answer-key", `${world}.json`);
  const key = JSON.parse(readFileSync(existsSync(top) ? top : join(import.meta.dirname, "..", "answer-key", "demo", `${world}.json`), "utf8")) as AnswerKey;
  return { ...key, problems: key.problems.filter((p) => (p.min_days ?? 0) <= days && (asOf === undefined || p.as_of === undefined || p.as_of === asOf)) };
}

export function report(results: Awaited<ReturnType<typeof verifyWorld>>): boolean {
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(8)} key=${String(r.expected).padStart(9)} recomputed=${String(r.got).padStart(9)}  ${r.detail}`);
  const bad = results.filter((r) => !r.ok).length;
  console.log(`verify: ${results.length - bad}/${results.length} entries recomputed to the key`);
  return bad === 0;
}

if (import.meta.filename === process.argv[1]) {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a}`);
    args.set(m[1]!, m[2] ?? process.argv[++i] ?? "");
  }
  const world = args.get("world");
  const asOf = args.get("as-of");
  if (!world || !asOf) throw new Error("--world and --as-of are required");
  const token = process.env.MUNIM_SEED_TOKEN;
  if (!token) throw new Error("MUNIM_SEED_TOKEN (the owner's bearer token) is required");
  const days = Number(args.get("days") ?? 183);
  if (!Number.isInteger(days) || days < 14) throw new Error("--days must be a whole number of at least 14");
  const key = loadKey(world, days, asOf);
  const ok = report(await verifyWorld({ baseUrl: process.env.MUNIM_API_URL ?? "http://127.0.0.1:8787", token: () => token, asOf }, { ...key, seed: args.get("seed") || key.seed }));
  process.exit(ok ? 0 : 1);
}
