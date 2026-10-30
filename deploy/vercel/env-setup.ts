// The founder runs this once (R57 E-4), and again after anything it sends changes. It needs no input, no prompt and no
// argument:   node deploy/vercel/env-setup.ts
//   [--project munim-api|munim-cobnut|both]   default both
//   [--env production|preview]                default production
//   [--api-origin https://<munim-api production domain>]   default: the origin deploy.mjs recorded in .run/vercel/api-origin
//   [--rotate]    regenerate the secrets this script generates (service secret, cron secret, run-token key pair)
//   [--dry-run]   print every name with its source and state; call nothing, write nothing, print no value
// What it does: resolves every value, then sends each one to the Vercel project with `vercel env add NAME <env>`, the
// value on stdin, after a `vercel env rm` so a re-run updates. It uses the logged-in Vercel CLI and `--project <name>`;
// it never links a directory, so the repo root's `.vercel/` (project `munim`) stays untouched.
// Values: `.env` only through packages/config (CLAUDE.md rule 20); generated files under `.run/` (db-roles.json,
// cobnut/site.env, cobnut/demo-password); new secrets are generated into `.run/vercel/` (0600) and reused on re-runs.
// Output is names only: never a value, never a value's length. The vercel CLI's own output is shown only when a call
// fails, first redacted against every value in the plan. Exit codes: 0 all sent, 1 something missing or failed, 2 usage.
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { type Config, ensureRunDir, loadRepoConfig } from "../../packages/config/src/index.ts";
import { falkorUrl } from "../../adapters/falkordb/env.ts";

export type Project = "munim-api" | "munim-cobnut";
export type Target = "production" | "preview";
const PROJECTS: readonly Project[] = ["munim-api", "munim-cobnut"];
const TARGETS: readonly Target[] = ["production", "preview"];

/** A value that cannot be resolved yet, and the step that produces it. */
class Missing {
  producedBy: string;
  constructor(producedBy: string) {
    this.producedBy = producedBy;
  }
}
type Ctx = { cfg: Config; runDir: string; apiOrigin: string | Missing; rotate: boolean; write: boolean; memo: Map<string, unknown> };
const NEW = Symbol("new"); // a generated secret that a real run will create
type Read = string | Missing | typeof NEW;
interface Var {
  project: Project;
  name: string;
  /** Stored as a Vercel sensitive variable (write-only). Only what must be read at build time stays plain. */
  sensitive: boolean;
  source: string;
  read(c: Ctx): Read;
}

const text = (path: string) => readFileSync(path, "utf8").trim();
const fromFile = (path: (c: Ctx) => string, producedBy: string) => (c: Ctx): Read => (existsSync(path(c)) ? text(path(c)) : new Missing(producedBy));
const vercelDir = (c: Ctx) => join(c.runDir, "vercel");

/** The pooler strings carry the `postgres` password; every role logs in with its own password (README), so
 *  only host, port and database go to Vercel, where intel's process would otherwise see the admin password. */
function withoutCredentials(name: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} in .env is not a URL`); // the TypeError would quote the value
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

const envVar = (project: Project, name: Parameters<Config["get"]>[0], o: { sensitive?: boolean; strip?: boolean } = {}): Var => ({
  project, name, sensitive: o.sensitive ?? false,
  source: `.env via packages/config${o.strip ? " (credentials removed)" : ""}`,
  read: (c) => {
    const v = c.cfg.get(name);
    return v === undefined ? new Missing(`fill ${name} in .env`) : o.strip ? withoutCredentials(name, v) : v;
  },
});
const constant = (project: Project, name: string, value: string): Var => ({ project, name, sensitive: false, source: "constant", read: () => value });

function rolePassword(role: "munim_core" | "munim_svc" | "munim_platform"): Var {
  return {
    project: "munim-api", name: `MUNIM_DB_PASSWORD_${role.toUpperCase()}`, sensitive: true, source: `.run/db-roles.json (${role})`,
    read: (c) => {
      const file = join(c.runDir, "db-roles.json");
      if (!existsSync(file)) return new Missing("make dev-db (writes .run/db-roles.json)");
      let parsed: { roles?: Record<string, unknown> } & Record<string, unknown>;
      try {
        parsed = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        throw new Error(".run/db-roles.json is not valid JSON"); // no cause: a SyntaxError quotes the input
      }
      const pw = (parsed.roles ?? parsed)[role];
      return typeof pw === "string" && pw !== "" ? pw : new Missing(`make dev-db (no ${role} in .run/db-roles.json)`);
    },
  };
}

/** A secret this script generates once into .run/vercel/<file> (0600) and reuses; --rotate replaces it. */
function generated(project: Project, name: string, file: string, make: () => string, sensitive = true): Var {
  return {
    project, name, sensitive, source: `.run/vercel/${file} (generated if absent)`,
    read: (c) => {
      const path = join(vercelDir(c), file);
      if (existsSync(path) && !c.rotate) return text(path);
      if (!c.write) return NEW;
      ensureRunDir(vercelDir(c));
      const v = make();
      writeFileSync(path, `${v}\n`, { mode: 0o600 });
      chmodSync(path, 0o600);
      return v;
    },
  };
}
const hex = () => randomBytes(32).toString("hex");
/** The run-token pair is one unit: both files are replaced together, whichever one is missing or on --rotate.
 *  Memoised per run, so the private and public variables are read from the same pair even when rotating. */
function keyPair(c: Ctx): { private: string; public: string } | typeof NEW {
  const priv = join(vercelDir(c), "run-token.pem");
  const pub = join(vercelDir(c), "run-token.pub.pem");
  const memo = c.memo.get("run-token") as { private: string; public: string } | undefined;
  if (memo) return memo;
  if (existsSync(priv) && existsSync(pub) && !c.rotate) return { private: text(priv), public: text(pub) };
  if (!c.write) return NEW;
  ensureRunDir(vercelDir(c));
  const pair = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  for (const [path, pem] of [[priv, pair.privateKey], [pub, pair.publicKey]] as const) {
    writeFileSync(path, pem, { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  const made = { private: pair.privateKey.trim(), public: pair.publicKey.trim() };
  c.memo.set("run-token", made);
  return made;
}

const COBNUT_DIR = (c: Ctx) => join(c.runDir, "cobnut");
/** `make seed WORLD=cobnut` writes site.env (tools/worldgen/src/cli.ts); only the named line is taken from it. */
function siteEnv(name: "MUNIM_DEMO_TENANT_ID" | "NEXT_PUBLIC_MUNIM_STOREFRONT_KEY"): (c: Ctx) => Read {
  return (c) => {
    const file = join(COBNUT_DIR(c), "site.env");
    if (!existsSync(file)) return new Missing("the hosted cobnut seed (writes .run/cobnut/site.env)");
    const v = parseEnv(readFileSync(file, "utf8"))[name]?.trim();
    return v ? v : new Missing(`the hosted cobnut seed (no ${name} in .run/cobnut/site.env)`);
  };
}
const apiOrigin = (suffix: string) => (c: Ctx): Read => (c.apiOrigin instanceof Missing ? c.apiOrigin : `${c.apiOrigin}${suffix}`);
const ORIGIN_SOURCE = "--api-origin, else .run/vercel/api-origin (written by deploy.mjs)";
const MISSING_ORIGIN = "node deploy/vercel/deploy.mjs --project munim-api (records .run/vercel/api-origin), or pass --api-origin";

// One row per variable.
// munim-api = the README's env table (T-113). R58: live Gemini with T-125's recorded fallback, so MUNIM_MODEL_MODE=live and
// GEMINI_API_KEY (absent → named as missing, the rest still sent, exit 1); the R47 spend cap is the operator's
// platform.llm_budget row, not an environment setting. Not sent, on purpose: OPENROUTER/NVIDIA keys (Gemini only, R58),
// MUNIM_INTEL_URL (core's service binding injects it; Vercel refuses a circular binding, so intel reaches core over the public
// origin, MUNIM_CORE_URL, sent below), MUNIM_IDP, MUNIM_CORS_ORIGINS,
// MUNIM_TRUSTED_PROXY_HOPS (0 until measured, README "Do not set"), MUNIM_TICK_* (defaults hold). Gates and `make smoke` stay recorded.
// munim-cobnut = what apps/web reads (grep process.env under apps/web): never MUNIM_MOCK, MUNIM_IDP, MUNIM_DEMO_TOKENS,
// MOCK_TOKEN_SECRET, NEXT_PUBLIC_MUNIM_MOCK_CONTROLS or MUNIM_NEXT_STANDALONE.
export const VARS: readonly Var[] = [
  envVar("munim-api", "SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING", { strip: true }),
  envVar("munim-api", "SUPABASE_SESSION_POOLER_CONNECTION_STRING", { strip: true }),
  envVar("munim-api", "SUPABASE_PROJECT_ID"),
  envVar("munim-api", "SUPABASE_PROJECT_URL"),
  envVar("munim-api", "SUPABASE_PUBLISHABLE_KEY"),
  envVar("munim-api", "SUPABASE_SECRET_KEY", { sensitive: true }), // T-116: the uploads bucket; bypasses RLS, so it is sensitive
  rolePassword("munim_core"),
  rolePassword("munim_svc"),
  rolePassword("munim_platform"),
  generated("munim-api", "MUNIM_SERVICE_SECRET", "service-secret", hex),
  generated("munim-api", "CRON_SECRET", "cron-secret", hex),
  {
    project: "munim-api", name: "MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM", sensitive: true, source: ".run/vercel/run-token.pem (generated with its public half)",
    read: (c) => { const p = keyPair(c); return p === NEW ? p : p.private; },
  },
  {
    project: "munim-api", name: "MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM", sensitive: false, source: ".run/vercel/run-token.pub.pem (generated with its private half)",
    read: (c) => { const p = keyPair(c); return p === NEW ? p : p.public; },
  },
  { project: "munim-api", name: "SUPPLIERS_SIM_PUBLIC_URL", sensitive: false, source: `${ORIGIN_SOURCE} + /suppliers-sim`, read: apiOrigin("/suppliers-sim") },
  // intel → core over the project's public domain: Vercel refuses circular service bindings (core → intel → core).
  { project: "munim-api", name: "MUNIM_CORE_URL", sensitive: false, source: ORIGIN_SOURCE, read: apiOrigin("") },
  constant("munim-api", "MUNIM_STREAM_MAX_AGE_S", "270"),
  constant("munim-api", "MUNIM_DB_POOL_MAX", "3"),
  // Go-live E-2: a live ask makes ~8 sequential model calls. Core waits 240 s for intel, which stops its own run at 220 s
  // and stores what it has, both inside Hobby's 300 s function limit (intel budget < core wait < 300 s).
  constant("munim-api", "MUNIM_ASK_TIMEOUT_S", "240"),
  constant("munim-api", "MUNIM_ASK_BUDGET_S", "220"),
  constant("munim-api", "MUNIM_MODEL_MODE", "live"), // R58
  envVar("munim-api", "GEMINI_API_KEY", { sensitive: true }), // R58: the founder's free-tier key
  constant("munim-api", "MUNIM_BLOB", "supabase"), // T-116: one shared bucket for uploads and the tick's import parse
  constant("munim-api", "MUNIM_BLOB_BUCKET", "munim-uploads"),
  // The graph on FalkorDB Cloud: core-api and the worker's jobs read it; apps/web shows the supplier map only with MUNIM_GRAPH set.
  constant("munim-api", "MUNIM_GRAPH", "falkordb"),
  {
    project: "munim-api", name: "MUNIM_FALKORDB_URL", sensitive: true,
    source: ".env via packages/config: MUNIM_FALKORDB_URL, or FalkorDB Cloud's FALKOR_DB_* parts",
    read: (c) => {
      try {
        return falkorUrl(c.cfg);
      } catch {
        return new Missing("fill FALKOR_DB_HOST, FALKOR_DB_PORT, FALKOR_DB_NAME and FALKOR_DB_PASSWORD (or MUNIM_FALKORDB_URL) in .env");
      }
    },
  },

  constant("munim-cobnut", "NEXT_PUBLIC_MUNIM_API", "/api"),
  { project: "munim-cobnut", name: "MUNIM_API_ORIGIN", sensitive: false, source: ORIGIN_SOURCE, read: apiOrigin("") },
  { project: "munim-cobnut", name: "NEXT_PUBLIC_MUNIM_STOREFRONT_KEY", sensitive: false, source: ".run/cobnut/site.env", read: siteEnv("NEXT_PUBLIC_MUNIM_STOREFRONT_KEY") },
  constant("munim-cobnut", "MUNIM_DEMO_SIGNIN", "1"),
  constant("munim-cobnut", "MUNIM_GRAPH", "falkordb"),
  { project: "munim-cobnut", name: "MUNIM_DEMO_PASSWORD", sensitive: true, source: ".run/cobnut/demo-password", read: fromFile((c) => join(COBNUT_DIR(c), "demo-password"), "the demo accounts step (adapters/dev/idp-supabase/demo-accounts.ts writes .run/cobnut/demo-password)") },
  { project: "munim-cobnut", name: "MUNIM_DEMO_TENANT_ID", sensitive: false, source: ".run/cobnut/site.env", read: siteEnv("MUNIM_DEMO_TENANT_ID") },
  envVar("munim-cobnut", "SUPABASE_PROJECT_URL"),
  envVar("munim-cobnut", "SUPABASE_PUBLISHABLE_KEY"),
];

export interface Args {
  project: Project | "both";
  env: Target;
  apiOrigin?: string;
  rotate: boolean;
  dryRun: boolean;
}
class UsageError extends Error {}

const USAGE = "usage: node deploy/vercel/env-setup.ts [--project munim-api|munim-cobnut|both] [--env production|preview] [--api-origin https://<munim-api domain>] [--rotate] [--dry-run]";

/** `--flag value` and `--flag=value` (gotcha 17); an unknown flag, a missing or unknown value, a repeat or a
 *  positional argument is refused, never defaulted. */
export function parseArgs(argv: readonly string[]): Args {
  const valued = new Set(["project", "env", "api-origin"]);
  const bare = new Set(["rotate", "dry-run"]);
  const got = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(a);
    if (!m) throw new UsageError(`unexpected argument '${a}'`);
    const [, flag, inline] = m as unknown as [string, string, string | undefined];
    if (!valued.has(flag) && !bare.has(flag)) throw new UsageError(`unknown flag '--${flag}'`);
    if (got.has(flag)) throw new UsageError(`--${flag} given twice`);
    if (bare.has(flag)) {
      if (inline !== undefined) throw new UsageError(`--${flag} takes no value`);
      got.set(flag, true);
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === "" || (inline === undefined && value.startsWith("--"))) throw new UsageError(`--${flag} needs a value`);
    got.set(flag, value);
  }
  const project = (got.get("project") as string | undefined) ?? "both";
  if (project !== "both" && !PROJECTS.includes(project as Project)) throw new UsageError(`--project must be munim-api, munim-cobnut or both`);
  const env = (got.get("env") as string | undefined) ?? "production";
  if (!TARGETS.includes(env as Target)) throw new UsageError(`--env must be production or preview`);
  const origin = got.get("api-origin") as string | undefined;
  return { project: project as Args["project"], env: env as Target, ...(origin !== undefined ? { apiOrigin: parseOrigin(origin, "--api-origin") } : {}), rotate: got.has("rotate"), dryRun: got.has("dry-run") };
}

function parseOrigin(raw: string, what: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new UsageError(`${what} must be an https origin such as https://munim-api.vercel.app`);
  }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.pathname !== "/") {
    throw new UsageError(`${what} must be an https origin (no path, credentials or query)`);
  }
  return u.origin;
}

export interface RunOptions {
  argv: readonly string[];
  root: string;
  env?: Record<string, string | undefined>;
  config?: Config;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

export function run(o: RunOptions): number {
  const out = o.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = o.err ?? ((l) => process.stderr.write(`${l}\n`));
  const env = o.env ?? process.env;
  let args: Args;
  try {
    args = parseArgs(o.argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`env-setup: ${e.message}`);
    err(USAGE);
    return 2;
  }
  let cfg: Config | undefined = o.config;
  try {
    cfg ??= loadRepoConfig(o.root, env);
    return execute(args, cfg, env, out, err);
  } catch (e) {
    err(`env-setup: FAIL — ${cfg ? cfg.redact(e instanceof Error ? e.message : "error") : e instanceof Error ? e.message : "error"}`);
    return 1;
  }
}

function execute(args: Args, cfg: Config, env: Record<string, string | undefined>, out: (l: string) => void, err: (l: string) => void): number {
  if (env.VERCEL_ORG_ID || env.VERCEL_PROJECT_ID) {
    err("env-setup: VERCEL_ORG_ID / VERCEL_PROJECT_ID are set; they would override --project. Unset them and re-run.");
    return 1;
  }
  const projects = args.project === "both" ? PROJECTS : [args.project];
  const originFile = join(cfg.runDir, "vercel", "api-origin");
  const apiOrigin: string | Missing = args.apiOrigin ?? (existsSync(originFile) ? parseOrigin(text(originFile), ".run/vercel/api-origin") : new Missing(MISSING_ORIGIN));
  const ctx: Ctx = { cfg, runDir: cfg.runDir, apiOrigin, rotate: args.rotate, write: !args.dryRun, memo: new Map() };
  const plan = VARS.filter((v) => projects.includes(v.project));

  if (args.dryRun) {
    out(`env-setup (dry run): nothing is sent or written, and no value is printed. Target: ${args.env}.`);
    for (const p of projects) {
      out(`${p}`);
      for (const v of plan.filter((x) => x.project === p)) {
        const [state, note] = dryState(v, ctx);
        out(`  ${state.padEnd(8)} ${v.name.padEnd(48)} ${v.sensitive ? "sensitive" : "plain    "}  ${v.source}${note}`);
      }
    }
    out("`new` = generated by a real run; `missing` = a real run skips it and exits 1 (see 'produced by' in a real run).");
    return 0;
  }

  const target = { cwd: ensureVercelCwd(cfg.runDir), env: { ...env } };
  // Resolve everything first, so a redaction list covers every value before any call is made.
  const resolved = plan.map((v) => ({ v, value: v.read(ctx) as string | Missing }));
  const secrets = resolved.flatMap((r) => (typeof r.value === "string" ? [r.value] : []));
  const redact = (s: string) => redactAll(cfg.redact(s), secrets);

  let sent = 0, missing = 0, failed = 0;
  for (const p of projects) {
    // One cheap call per project: logged in, and the project exists. A failure here stops this project only.
    const probe = vercel(target, ["project", "inspect", p, "--yes"]);
    if (probe.status !== 0) {
      err(`FAIL ${p}: cannot reach the project (vercel project inspect exited ${probe.status ?? "without a status"}${probe.spawnError ? "; is `vercel` on PATH?" : ""}). Is the CLI logged in, and does the project exist? Run: node deploy/vercel/deploy.mjs --project ${p} --setup-only`);
      failed += resolved.filter((r) => r.v.project === p).length;
      continue;
    }
    for (const { v, value } of resolved.filter((r) => r.v.project === p)) {
      const label = `${v.name} (${p}, ${args.env})`;
      if (value instanceof Missing) {
        err(`missing ${label}: produced by ${value.producedBy}`);
        missing++;
        continue;
      }
      vercel(target, ["env", "rm", v.name, args.env, "--yes", "--project", p]); // absent on a first run: the exit status says nothing
      const add = vercel(target, ["env", "add", v.name, args.env, "--yes", "--force", v.sensitive ? "--sensitive" : "--no-sensitive", "--project", p], value);
      if (add.status === 0) {
        out(`set ${label}`);
        sent++;
      } else {
        err(`FAIL ${label}: vercel env add exited ${add.status ?? "without a status"}${add.spawnError ? " (is `vercel` on PATH?)" : ""}`);
        for (const line of add.output.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4)) err(`  vercel: ${redact(line).slice(0, 200)}`);
        failed++;
      }
    }
  }
  out(`done: ${sent} set, ${missing} missing, ${failed} failed`);
  if (sent > 0) out("redeploy both projects for this to take effect: node deploy/vercel/deploy.mjs (NEXT_PUBLIC_* and MUNIM_API_ORIGIN are baked in at build time; the rest is read per deployment)");
  return missing === 0 && failed === 0 ? 0 : 1;
}

/** Dry run: the state of one variable (resolved but never printed), without generating anything. */
function dryState(v: Var, c: Ctx): [state: string, note: string] {
  try {
    const r = v.read({ ...c, write: false });
    return r instanceof Missing ? ["missing", `  <- ${r.producedBy}`] : r === NEW ? ["new", ""] : ["ok", ""];
  } catch (e) {
    return ["invalid", `  <- ${c.cfg.redact(e instanceof Error ? e.message : "error")}`]; // these messages never quote a value
  }
}

const redactAll = (s: string, secrets: readonly string[]): string => {
  const parts = new Set<string>();
  for (const v of secrets) {
    parts.add(v);
    parts.add(encodeURIComponent(v));
    for (const line of v.split("\n")) if (line.trim() && !line.startsWith("-----")) parts.add(line.trim());
  }
  return [...parts].filter((p) => p.length >= 4).sort((a, b) => b.length - a.length).reduce((t, p) => t.replaceAll(p, "[redacted]"), s);
};

function ensureVercelCwd(runDir: string): string {
  const dir = join(runDir, "vercel");
  ensureRunDir(runDir);
  ensureRunDir(dir);
  return dir; // no `.vercel` in here: --project names the target
}

/** One vercel call. The value (if any) goes on stdin; output is captured and returned, never printed here. */
function vercel(t: { cwd: string; env: Record<string, string | undefined> }, args: string[], input?: string) {
  const r = spawnSync("vercel", [...args, "--non-interactive"], {
    cwd: t.cwd, env: t.env as NodeJS.ProcessEnv, input: input ?? "", encoding: "utf8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"],
  });
  return { status: r.status, spawnError: r.error !== undefined, output: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run({ argv: process.argv.slice(2), root: resolve(import.meta.dirname, "../..") });
}
