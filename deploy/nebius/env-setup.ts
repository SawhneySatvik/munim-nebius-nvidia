// Environment variables for the two Nebius Vercel projects (R77), behind the same guard as everything else in this directory.
//   node deploy/nebius/env-setup.ts --dry-run [--api-origin https://<munim-nebius-api domain>] [--reference <path>] [--env production|preview]
//   node deploy/nebius/env-setup.ts          [--api-origin ...] [--reference <path>] [--env ...] [--rotate]      (network: orchestrator only)
// The variable set is deploy/vercel/env-setup.ts's own table (munim-api -> munim-nebius-api, munim-cobnut -> munim-nebius-web), so the two
// cannot drift, read from `.env.nebius` and `.run/nebius` through packages/config, and generated secrets go to `.run/nebius/vercel/`.
// Differences, on purpose: NEBIUS_API_KEY (Token Factory, required) replaces the legacy provider key; NVIDIA_API_KEY (NVIDIA's own endpoint, dev
// only) and TAVILY_API_KEY are optional and sent only when present in .env.nebius; no FalkorDB (the graph stays on Postgres edges).
// --dry-run prints variable NAMES, their target project and a state word; never a value, never a length. The apply path sends each value on
// stdin to `vercel env add --project munim-nebius-*` with a guard-built environment; a project outside the profile is refused before any call.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Config, loadConfig } from "../../packages/config/src/index.ts";
import { VARS } from "../vercel/env-setup.ts";
import { PROFILE, check, nebiusName, profileEnv } from "./guard.ts";

type V = (typeof VARS)[number];
type Ctx = Parameters<V["read"]>[0];
export type Target = "production" | "preview";
const TO_NEBIUS: Record<string, string> = { "munim-api": PROFILE.api, "munim-cobnut": PROFILE.web };
const DROPPED = new Set(["GEMINI_API_KEY", "MUNIM_FALKORDB_URL", "MUNIM_GRAPH"]);
/** Only used when no origin is given in a dry run, so the table can be read; those names are reported as needing it. */
const PLACEHOLDER_ORIGIN = "https://origin-not-set.invalid";
const NEEDS_ORIGIN = new Set(["SUPPLIERS_SIM_PUBLIC_URL", "MUNIM_CORE_URL", "MUNIM_API_ORIGIN"]);

const OPTIONAL = new Set(["NVIDIA_API_KEY", "TAVILY_API_KEY"]);
const providerKey = (name: "NEBIUS_API_KEY" | "NVIDIA_API_KEY" | "TAVILY_API_KEY"): V => ({
  project: "munim-api", name, sensitive: true, source: ".env.nebius via packages/config",
  read: (c: Ctx) => { const v = c.cfg.get(name); return v === undefined ? ({ producedBy: `fill ${name} in .env.nebius` } as never) : v; },
}) as V;

/** The Nebius table: [target project, variable]. */
export function plan(): Array<{ project: string; v: V }> {
  return [...VARS.filter((v) => !DROPPED.has(v.name)), providerKey("NEBIUS_API_KEY"), providerKey("NVIDIA_API_KEY"), providerKey("TAVILY_API_KEY")].map((v) => ({ project: TO_NEBIUS[v.project]!, v }));
}

class Usage extends Error {}
export function parseArgs(argv: readonly string[]) {
  const got = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(argv[i]!);
    if (!m) throw new Usage(`unexpected argument '${argv[i]}'`);
    const [, flag, inline] = m as unknown as [string, string, string | undefined];
    const valued = ["api-origin", "reference", "env"].includes(flag);
    if (!valued && !["dry-run", "rotate"].includes(flag)) throw new Usage(`unknown flag '--${flag}'`);
    if (got.has(flag)) throw new Usage(`--${flag} given twice`);
    if (!valued) { if (inline !== undefined) throw new Usage(`--${flag} takes no value`); got.set(flag, true); continue; }
    const v = inline ?? argv[++i];
    if (!v || v.startsWith("--")) throw new Usage(`--${flag} needs a value`);
    got.set(flag, v);
  }
  const env = (got.get("env") as string | undefined) ?? "production";
  if (env !== "production" && env !== "preview") throw new Usage("--env must be production or preview");
  let origin: string | undefined;
  if (got.has("api-origin")) {
    try { const u = new URL(got.get("api-origin") as string); if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.pathname !== "/") throw 0; origin = u.origin; }
    catch { throw new Usage("--api-origin must be an https origin (no path, credentials or query)"); }
  }
  return { env: env as Target, origin, reference: got.get("reference") as string | undefined, rotate: got.has("rotate"), dry: got.has("dry-run") };
}

type Exec = (args: string[], input: string, env: Record<string, string>, cwd: string) => number | null;
const realExec: Exec = (args, input, env, cwd) => spawnSync("vercel", [...args, "--non-interactive"], { cwd, env, input, encoding: "utf8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] }).status;

export function run(o: { argv: readonly string[]; root: string; exec?: Exec; out?: (l: string) => void; err?: (l: string) => void }): number {
  const out = o.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = o.err ?? ((l) => process.stderr.write(`${l}\n`));
  let a: ReturnType<typeof parseArgs>;
  try { a = parseArgs(o.argv); } catch (e) {
    if (!(e instanceof Usage)) throw e;
    err(`nebius env-setup: ${e.message}`);
    err("usage: node deploy/nebius/env-setup.ts [--dry-run] [--api-origin https://<munim-nebius-api domain>] [--reference <path>] [--env production|preview] [--rotate]");
    return 2;
  }
  const root = resolve(o.root), env = profileEnv(root);
  let cfg: Config | undefined;
  try {
    const problems = check({ root, env, ...(a.reference !== undefined ? { reference: a.reference } : {}) });
    if (problems.length) { for (const p of problems) err(`nebius guard: REFUSED — ${p}`); return 1; }
    cfg = loadConfig({ envFile: env.MUNIM_ENV_FILE!, env: {}, runDir: env.MUNIM_RUN_DIR! });
    if (!a.dry && !a.origin) { err("nebius env-setup: a real run needs --api-origin (the munim-nebius-api production domain)"); return 2; }
    const ctx = { cfg, runDir: cfg.runDir, apiOrigin: a.origin ?? PLACEHOLDER_ORIGIN, rotate: a.rotate, write: !a.dry, memo: new Map() } as unknown as Ctx;
    const rows = plan();
    for (const { project } of rows) { const bad = nebiusName(project); if (bad) { err(`nebius env-setup: ${bad}`); return 1; } }

    const state = (v: V): string => {
      if (!a.origin && NEEDS_ORIGIN.has(v.name)) return "needs --api-origin";
      try {
        const r = v.read({ ...ctx, write: false }) as unknown;
        return typeof r === "string" ? "ok" : typeof r === "symbol" ? "new" : OPTIONAL.has(v.name) ? "optional, unset" : "missing";
      } catch { return "invalid"; }
    };
    if (a.dry) {
      out(`nebius env-setup (dry run): nothing is sent or written; names only. Target: ${a.env}.`);
      for (const { project, v } of rows) out(`${project}  ${v.name}  [${state(v)}]`);
      return 0;
    }
    // Resolve every value first so one missing name stops the run before any call.
    const resolved = rows.map(({ project, v }) => ({ project, v, value: v.read(ctx) as unknown }));
    const unset = (r: (typeof resolved)[number]) => typeof r.value !== "string";
    const missing = resolved.filter((r) => unset(r) && !OPTIONAL.has(r.v.name));
    for (const m of missing) err(`missing ${m.v.name} (${m.project})`);
    if (missing.length) return 1;
    const exec = o.exec ?? realExec;
    let failed = 0;
    for (const { project, v, value } of resolved.filter((r) => !unset(r))) {
      exec(["env", "rm", v.name, a.env, "--yes", "--project", project], "", env, cfg.runDir); // absent on a first run: the status says nothing
      const status = exec(["env", "add", v.name, a.env, "--yes", "--force", v.sensitive ? "--sensitive" : "--no-sensitive", "--project", project], value as string, env, cfg.runDir);
      out(status === 0 ? `set ${v.name} (${project}, ${a.env})` : `FAIL ${v.name} (${project}): vercel exited ${status ?? "without a status"}`);
      if (status !== 0) failed++;
    }
    out(`done: ${resolved.filter((r) => !unset(r)).length - failed} set, ${failed} failed. Redeploy: node deploy/nebius/stage.ts --deploy`);
    return failed ? 1 : 0;
  } catch (e) {
    err(`nebius env-setup: FAIL — ${cfg ? cfg.redact(e instanceof Error ? e.message : "error") : e instanceof Error ? e.name : "error"}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run({ argv: process.argv.slice(2), root: resolve(import.meta.dirname, "../..") });
}
