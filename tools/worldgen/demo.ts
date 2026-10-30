// make demo: seeds the synthetic worlds into a running core-api, one OS process per world, all at once, then recomputes every
// world's answer key and prints a summary table. Each world's own request log is untouched (the worlds are separate businesses, so
// running them side by side reorders nothing inside any one log; the determinism gates keep holding).
//
//   node tools/worldgen/demo.ts [--worlds=a,b,…] [--days=183] [--live-days=35] [--as-of=YYYY-MM-DD] [--run-dir=.run]
//
// Sign-in, per world (a verifier needs the world's one owner, so every world signs in as its own people):
//   MUNIM_SEED_TOKENS_<WORLD>   JSON {"owner": "<jwt>", …} for that world, e.g. MUNIM_SEED_TOKENS_RESTAURANT_GROUP (Supabase mode: real
//                               confirmed sign-ins supplied by the caller)
//   MUNIM_SEED_TOKENS           JSON used for any world without its own variable
//   neither                     minted for a core-api started with MUNIM_IDP=local (R44a) by adapters/dev/idp-local/mint-seed-tokens.ts,
//                               which refuses a server whose /health does not report idp "local"
// MUNIM_API_URL defaults to http://127.0.0.1:${PORT:-8787}. Nothing here reads .env.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadWorld, type WorldName } from "./src/run.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const ALL = ["restaurant_group", "cloud_kitchen", "store", "au_outlet"];

function parse(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]!);
    if (!m || !["worlds", "days", "live-days", "as-of", "run-dir"].includes(m[1]!)) throw new Error(`unknown argument ${argv[i]}`);
    out.set(m[1]!, m[2] ?? argv[++i] ?? "");
  }
  return out;
}

interface Outcome { world: string; seconds: number; seed: "ok" | "FAIL"; writes: string; planted: string; asOf: string; verify: string; verified: boolean }

const run = (args: string[], env: Record<string, string>, logFile: string): Promise<{ code: number | null; out: string }> =>
  new Promise((ok) => {
    const p = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => {
      writeFileSync(logFile, out);
      ok({ code, out });
    });
  });

async function main() {
  const args = parse(process.argv.slice(2));
  const worlds = (args.get("worlds") ?? ALL.join(",")).split(",");
  for (const w of worlds) if (!ALL.includes(w)) throw new Error(`unknown world ${w}; the worlds are ${ALL.join(", ")}`);
  const days = args.get("days") ?? "183";
  const runDir = resolve(ROOT, args.get("run-dir") ?? ".run");
  const logs = join(runDir, "demo");
  mkdirSync(logs, { recursive: true });
  const url = process.env.MUNIM_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "8787"}`;

  // Tokens first, for every world, so a missing one fails before anything is written.
  const tokens = new Map<string, Record<string, string>>();
  for (const w of worlds) {
    const own = process.env[`MUNIM_SEED_TOKENS_${w.toUpperCase()}`] ?? process.env.MUNIM_SEED_TOKENS;
    if (own) {
      tokens.set(w, JSON.parse(own) as Record<string, string>);
      continue;
    }
    // The server keeps its local signing key under its MUNIM_RUN_DIR: `.run/local` after `make up LOCAL_DB=1`, `.run` otherwise. Mint with
    // each candidate and keep the one the server accepts (a token signed with the wrong key is a 401).
    let minted: Record<string, string> | null = null;
    let why = "";
    for (const dir of [join(runDir, "local"), runDir]) {
      const m = spawnSync(process.execPath, [join(ROOT, "adapters/dev/idp-local/mint-seed-tokens.ts"), `--world=${w}`, `--url=${url}`, `--run-dir=${dir}`], { cwd: ROOT, encoding: "utf8" });
      if (m.status !== 0) {
        why = m.stderr.trim() || "mint failed";
        break;
      }
      const t = JSON.parse(m.stdout) as Record<string, string>;
      const probe = await fetch(new URL("/v1/me/tenants", url), { headers: { Authorization: `Bearer ${t.owner}` } });
      if (probe.status === 200) {
        minted = t;
        break;
      }
      why = `the server rejected a token signed with the key under ${dir} (HTTP ${probe.status})`;
    }
    if (!minted) {
      throw new Error(`no sign-in for ${w}: ${why}. Start the server with MUNIM_IDP=local (make up LOCAL_DB=1), or set MUNIM_SEED_TOKENS_${w.toUpperCase()} to JSON {"owner":"<jwt>",…}.`);
    }
    tokens.set(w, minted);
  }

  // One owner per world: the verifier needs the world's tenant to be the owner's only one, and a shared sign-in would make four tenants.
  // Every persona a world names must have a token too, or its seed would stop half-way after the other worlds had started writing.
  const owners = new Map<string, string>();
  for (const w of worlds) {
    const t = tokens.get(w)!;
    const personas = (await loadWorld(w as WorldName)).meta.personas;
    const missing = personas.filter((p) => !t[p]);
    if (missing.length) throw new Error(`${w}: no token for persona(s) ${missing.join(", ")}`);
    const other = owners.get(t.owner!);
    if (other) throw new Error(`${w} and ${other} would sign in as the same owner (one sign-in per world: set MUNIM_SEED_TOKENS_${w.toUpperCase()}; the shared MUNIM_SEED_TOKENS suits a single world)`);
    owners.set(t.owner!, w);
  }

  const started = Date.now();
  const outcomes = await Promise.all(worlds.map(async (world): Promise<Outcome> => {
    const t0 = Date.now();
    const flags = [`--world=${world}`, `--days=${days}`, ...(args.has("live-days") ? [`--live-days=${args.get("live-days")}`] : []), ...(args.has("as-of") ? [`--as-of=${args.get("as-of")}`] : [])];
    const r = await run([join(ROOT, "tools/worldgen/src/cli.ts"), ...flags], { MUNIM_API_URL: url, MUNIM_SEED_TOKENS: JSON.stringify(tokens.get(world)) }, join(logs, `${world}.seed.log`));
    const seconds = (Date.now() - t0) / 1000;
    const m = /seeded \((\d+) writes, as_of=(\d{4}-\d{2}-\d{2}), days=\d+\); planted (\d+)/.exec(r.out);
    if (r.code !== 0 || !m) return { world, seconds, seed: "FAIL", writes: "-", planted: "-", asOf: "-", verify: r.out.trim().split("\n").at(-1)?.slice(0, 120) ?? "no output", verified: false };
    return { world, seconds, seed: "ok", writes: m[1]!, planted: m[3]!, asOf: m[2]!, verify: "", verified: false };
  }));
  const seededIn = (Date.now() - started) / 1000;

  // Verify every seeded world (independent recompute from the read routes) in parallel too.
  await Promise.all(outcomes.filter((o) => o.seed === "ok").map(async (o) => {
    const owner = tokens.get(o.world)!.owner!;
    const r = await run([join(ROOT, "tools/worldgen/verify/run.ts"), `--world=${o.world}`, `--as-of=${o.asOf}`, `--days=${days}`], { MUNIM_API_URL: url, MUNIM_SEED_TOKEN: owner }, join(logs, `${o.world}.verify.log`));
    const m = /verify: (\d+)\/(\d+) entries recomputed to the key/.exec(r.out);
    o.verified = r.code === 0 && m !== null && m[1] === m[2];
    o.verify = m ? `${m[1]}/${m[2]} recomputed` : (r.out.trim().split("\n").at(-1) ?? "no output").slice(0, 120);
  }));
  const total = (Date.now() - started) / 1000;

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\n${pad("world", 18)}${pad("seed", 6)}${pad("seconds", 9)}${pad("writes", 8)}${pad("planted", 9)}${pad("as_of", 12)}verify`);
  for (const o of outcomes) console.log(`${pad(o.world, 18)}${pad(o.seed, 6)}${pad(o.seconds.toFixed(1), 9)}${pad(o.writes, 8)}${pad(o.planted, 9)}${pad(o.asOf, 12)}${o.verified ? "PASS " : "FAIL "}${o.verify}`);
  console.log(`\nseeded ${worlds.length} world(s) in parallel: ${seededIn.toFixed(1)} s; seed + verify: ${total.toFixed(1)} s (sum of per-world times ${outcomes.reduce((a, o) => a + o.seconds, 0).toFixed(1)} s). Logs: ${logs}`);
  console.log("All data is synthetic; suppliers are simulated; payments are recorded, never processed.");
  const bad = outcomes.filter((o) => o.seed !== "ok" || !o.verified);
  if (bad.length) {
    console.error(`make demo: FAIL — ${bad.map((o) => o.world).join(", ")}`);
    process.exit(1);
  }
}

main().catch((e: Error) => {
  console.error(`make demo: FAIL — ${e.message}`);
  process.exit(1);
});
