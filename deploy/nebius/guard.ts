// The Nebius profile (R77) and the guard that keeps it away from the existing demos' Supabase and Vercel projects.
//   node deploy/nebius/guard.ts check                     exit 0 only if the profile is safe; prints problems by NAME, never a value
//   node deploy/nebius/guard.ts exec -- <command> [args]  check, then run the command with only the Nebius settings in its environment
// The Nebius database settings live in `.env.nebius` (git-ignored, `.env.example`'s names), selected by MUNIM_ENV_FILE and read only
// through packages/config (rule 20: this file never opens one itself except through loadConfig). Generated secrets (role passwords,
// service secret, run-token keys) go to `.run/nebius`, so nothing is shared with the existing demos' `.run`.
// The reference is the existing demos' settings file: `<repo root>/.env`, or the path given by an explicit `--reference <path>` flag
// (a worktree has no `.env`). No environment variable selects it: a stale export must not point the guard at the wrong file. The guard compares the pooler hosts,
// the pooler login's project ref, the project id and the project URL's host, and refuses on any match. Fails closed: a reference with
// no database settings, or a Nebius file with none, is a refusal.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Config, loadConfig } from "../../packages/config/src/index.ts";

export const PROFILE = {
  web: "munim-nebius-web",
  api: "munim-nebius-api",
  region: "bom1",
  envFile: ".env.nebius",
  runDir: ".run/nebius",
} as const;
/** The Vercel projects of the Cup and FalkorDB demos (R73); the Nebius pair must never be one of these. */
export const EXISTING_VERCEL = ["munim-cobnut", "munim-api", "munim", "munim-rho"] as const;

/**
 * The only inherited variables a guarded command sees (an allow-list: a deny-list missed MUNIM_SERVICE_SECRET, PG*, DATABASE_URL,
 * POSTGRES_*, TAVILY_* and FalkorDB passwords). Process env wins over a file in packages/config, so nothing else may pass. The
 * MUNIM_SEED_* names are the deliberate hand-off of persona/operator tokens to the seeding commands (DEPLOY.md step 5); the other
 * MUNIM_/URL names are DEPLOY.md's own exports (the local core-api URL and port, the suppliers-sim origin).
 */
const ALLOWED = /^(PATH|HOME|SHELL|TMPDIR|TERM|USER|LOGNAME|LANG|LC_[A-Z_]+|NODE_[A-Z_]+|XDG_[A-Z_]+|PNPM_HOME|PORT|MUNIM_SEED_TOKENS|MUNIM_SEED_OPERATOR_TOKEN|MUNIM_API_URL|SUPPLIERS_SIM_PUBLIC_URL)$/;

export const nebiusName = (name: string): string | null =>
  (EXISTING_VERCEL as readonly string[]).includes(name) ? `Vercel project name "${name}" is one of the existing demos' projects`
  : !name.startsWith("munim-nebius-") ? `Vercel project name "${name}" does not start with munim-nebius-`
  : null;

const hostOf = (u: string | undefined): string | undefined => { try { return u ? new URL(u).host.toLowerCase() : undefined; } catch { return undefined; } };
/** The pooler login is `<role>.<project ref>`; the ref identifies the project even when the pooler host is shared. */
const refOf = (u: string | undefined): string | undefined => {
  try {
    if (!u) return undefined;
    const url = new URL(u), user = decodeURIComponent(url.username);
    if (user.includes(".")) return user.split(".").slice(1).join(".").toLowerCase();
    return /^db\.([^.]+)\.supabase\.co$/.exec(url.hostname.toLowerCase())?.[1]; // `postgres@db.<ref>.supabase.co:6543`
  } catch { return undefined; }
};

/**
 * What identifies a Supabase project, by kind. Pooler HOSTS are shared by every project of a region, so a host match alone proves
 * nothing; the project ref (pooler login `<role>.<ref>`, SUPABASE_PROJECT_ID, `<ref>.supabase.co`, `db.<ref>.supabase.co`) is what
 * is unique. Values stay inside this module's comparisons.
 */
export function identifiers(cfg: Config): { refs: Record<string, string>; hosts: Record<string, string> } {
  const s = cfg.get("MUNIM_DB_URL_SESSION"), t = cfg.get("MUNIM_DB_URL_TRANSACTION");
  const label = (h: string | undefined, drop: string) => (h?.endsWith(".supabase.co") ? h.slice(0, -".supabase.co".length).replace(new RegExp(`^${drop}`), "").toLowerCase() : undefined);
  const keep = (pairs: Array<[string, string | undefined]>) => Object.fromEntries(pairs.filter((p): p is [string, string] => !!p[1]));
  return {
    refs: keep([
      ["session pooler login", refOf(s)], ["transaction pooler login", refOf(t)], ["SUPABASE_PROJECT_ID", cfg.get("SUPABASE_PROJECT_ID")?.toLowerCase()],
      ["SUPABASE_PROJECT_URL", label(hostOf(cfg.get("SUPABASE_PROJECT_URL")), "")], ["direct connection host", label(hostOf(cfg.get("SUPABASE_DIRECT_CONNECTION_STRING")), "db\\.")],
    ]),
    hosts: keep([["session pooler host", hostOf(s)], ["transaction pooler host", hostOf(t)]]),
  };
}

export interface CheckOptions {
  root: string;
  env?: Record<string, string | undefined>;
  /** Vercel project names the caller is about to use; default the profile's pair. */
  names?: readonly string[];
  /** The existing demos' settings file (a path); default `<root>/.env`. Only the `--reference` flag sets it. */
  reference?: string;
}

/** Every reason the profile is unsafe, by name. Empty = safe. */
export function check(o: CheckOptions): string[] {
  const root = resolve(o.root), env = o.env ?? process.env, problems: string[] = [];
  const want = join(root, PROFILE.envFile);
  const sel = env.MUNIM_ENV_FILE?.trim();
  if (!sel) problems.push(`MUNIM_ENV_FILE is not set (it must be ${PROFILE.envFile}); the default .env is the existing demos' file`);
  else if (resolve(root, sel) !== want) problems.push(`MUNIM_ENV_FILE is not ${PROFILE.envFile} (its basename is ${basename(sel)})`);
  const runSel = env.MUNIM_RUN_DIR?.trim();
  if (!runSel || resolve(root, runSel) !== join(root, PROFILE.runDir)) problems.push(`MUNIM_RUN_DIR is not ${PROFILE.runDir}: generated secrets would be shared with the existing demos`);
  for (const n of o.names ?? [PROFILE.web, PROFILE.api]) { const p = nebiusName(n); if (p) problems.push(p); }
  if (!existsSync(want)) { problems.push(`${PROFILE.envFile} does not exist`); return problems; }

  // Only the two files are read: process env is withheld so a shell's SUPABASE_* cannot stand in for either side.
  const load = (envFile: string, runDir: string) => loadConfig({ envFile, env: {}, runDir });
  const mine = identifiers(load(want, join(root, PROFILE.runDir)));
  const refFile = resolve(root, o.reference ?? ".env");
  if (refFile === want) problems.push("the reference settings file is the Nebius file itself");
  if (!("session pooler login" in mine.refs)) problems.push(`${PROFILE.envFile} has no session pooler connection string with a project login (SUPABASE_SESSION_POOLER_CONNECTION_STRING)`);
  if (!("SUPABASE_PROJECT_ID" in mine.refs)) problems.push(`${PROFILE.envFile} has no SUPABASE_PROJECT_ID`);
  if (!existsSync(refFile)) { problems.push("the reference settings file (the existing demos') does not exist, so distinctness cannot be proved; pass --reference <path>"); return problems; }
  const theirs = identifiers(load(refFile, join(root, ".run")));
  if (!("session pooler login" in theirs.refs)) problems.push("the reference settings file has no session pooler connection string with a project login, so distinctness cannot be proved");
  // Any Nebius ref equal to any existing ref, whatever setting each came from (the same project written two ways is still the same project).
  for (const [kind, v] of Object.entries(mine.refs)) for (const [k2, w] of Object.entries(theirs.refs)) if (v === w) problems.push(`${kind} in ${PROFILE.envFile} names the same Supabase project as the existing demos' ${k2}`);
  // The pooler hosts are shared within a region, so equal hosts alone are fine; they are refused only if the refs gave no check at all.
  if (Object.keys(mine.refs).length === 0) for (const [kind, v] of Object.entries(mine.hosts)) if (Object.values(theirs.hosts).includes(v)) problems.push(`${kind} equals the existing demos' and no project ref could be compared`);
  return [...new Set(problems)];
}

/** The environment a guarded command runs in: inherited variables minus anything that could override the Nebius file. */
export function profileEnv(root: string, base: Record<string, string | undefined> = process.env): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && ALLOWED.test(k)) e[k] = v;
  e.MUNIM_ENV_FILE = join(resolve(root), PROFILE.envFile);
  e.MUNIM_RUN_DIR = join(resolve(root), PROFILE.runDir);
  return e;
}

/** `--reference <path>` / `--reference=<path>` (gotcha 17), before any `--`; anything else before it is refused. */
export function takeReference(argv: readonly string[]): { reference?: string; rest: string[] } {
  let reference: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") return { ...(reference !== undefined ? { reference } : {}), rest: argv.slice(i) };
    const m = /^--reference(?:=(.*))?$/s.exec(a);
    if (!m) throw new Error(`unexpected argument '${a}'`);
    if (reference !== undefined) throw new Error("--reference given twice");
    const v = m[1] ?? argv[++i];
    if (!v || v.startsWith("--")) throw new Error("--reference needs a path");
    reference = v;
  }
  return { ...(reference !== undefined ? { reference } : {}), rest: [] };
}

export function main(argv: readonly string[], root: string, out = (l: string) => process.stdout.write(`${l}\n`), err = (l: string) => process.stderr.write(`${l}\n`)): number {
  const [cmd, ...tail] = argv;
  const usage = "usage: node deploy/nebius/guard.ts check [--reference <path>] | exec [--reference <path>] -- <command> [args]";
  if (cmd !== "check" && cmd !== "exec") { err(usage); return 2; }
  let taken: ReturnType<typeof takeReference>;
  try { taken = takeReference(tail); } catch (e) { err(`${usage} (${e instanceof Error ? e.message : "bad arguments"})`); return 2; }
  const { reference, rest } = taken;
  if (cmd === "check" && rest.length) { err(usage); return 2; }
  const env = profileEnv(root);
  let problems: string[];
  try { problems = check({ root, env, ...(reference !== undefined ? { reference } : {}) }); } catch (e) { problems = [`settings could not be read (${e instanceof Error ? e.name : "error"})`]; }
  if (problems.length) { for (const p of problems) err(`nebius guard: REFUSED — ${p}`); return 1; }
  // exec: stderr, so a guarded command's stdout (demo-accounts prints tokens) stays clean for capture.
  (cmd === "exec" ? err : out)(`nebius guard: OK — the Nebius profile resolves to its own Supabase project and its own Vercel names (reference: ${basename(resolve(root, reference ?? ".env"))})`);
  if (cmd === "check") return 0;
  if (rest[0] !== "--" || rest.length < 2) { err(usage); return 2; }
  const r = spawnSync(rest[1]!, rest.slice(2), { cwd: root, env, stdio: "inherit" });
  return r.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), resolve(import.meta.dirname, "../.."));
}
