// Gate for deploy/vercel/env-setup.ts:  node --test "deploy/vercel/test/*.test.ts"
// A fake `vercel` binary on PATH records its argv and stdin and, when told to fail, echoes stdin to stderr, which is
// the worst case for the script's output hygiene. No real vercel, no .env, no network.
import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../../../packages/config/src/index.ts";

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, "../../..");
// ENV_SETUP_UNDER_TEST points the whole file at a mutated copy (the red-proof).
const SCRIPT = process.env.ENV_SETUP_UNDER_TEST ? resolve(process.env.ENV_SETUP_UNDER_TEST) : join(HERE, "../env-setup.ts");
const mod = (await import(pathToFileURL(SCRIPT).href)) as typeof import("../env-setup.ts");

// Written from the README's env table (T-113) and the brief, not from the script.
const API = [
  "SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING", "SUPABASE_SESSION_POOLER_CONNECTION_STRING", "SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_URL",
  "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "MUNIM_DB_PASSWORD_MUNIM_CORE", "MUNIM_DB_PASSWORD_MUNIM_SVC", "MUNIM_DB_PASSWORD_MUNIM_PLATFORM",
  "MUNIM_SERVICE_SECRET", "MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM", "MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM", "CRON_SECRET", "SUPPLIERS_SIM_PUBLIC_URL",
  "MUNIM_STREAM_MAX_AGE_S", "MUNIM_DB_POOL_MAX", "MUNIM_MODEL_MODE", "MUNIM_BLOB", "MUNIM_BLOB_BUCKET",
  // R58: live Gemini with the recorded fallback on the standalone deploy.
  "GEMINI_API_KEY",
  // intel reaches core over the public origin: Vercel refuses circular service bindings (orchestrator, first munim-api deploy).
  "MUNIM_CORE_URL",
  // Go-live E-2: core's wait for an ask and intel's own time budget for it.
  "MUNIM_ASK_TIMEOUT_S", "MUNIM_ASK_BUDGET_S",
  // The graph on FalkorDB Cloud.
  "MUNIM_GRAPH", "MUNIM_FALKORDB_URL",
];
const COBNUT = [
  "NEXT_PUBLIC_MUNIM_API", "MUNIM_API_ORIGIN", "NEXT_PUBLIC_MUNIM_STOREFRONT_KEY", "MUNIM_DEMO_SIGNIN", "MUNIM_DEMO_PASSWORD",
  "MUNIM_DEMO_TENANT_ID", "SUPABASE_PROJECT_URL", "SUPABASE_PUBLISHABLE_KEY", "MUNIM_GRAPH",
];
const SENSITIVE = new Set([
  "MUNIM_FALKORDB_URL", "MUNIM_DB_PASSWORD_MUNIM_CORE", "MUNIM_DB_PASSWORD_MUNIM_SVC", "MUNIM_DB_PASSWORD_MUNIM_PLATFORM", "MUNIM_SERVICE_SECRET",
  "MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM", "CRON_SECRET", "MUNIM_DEMO_PASSWORD", "SUPABASE_SECRET_KEY", "GEMINI_API_KEY",
]);

const PLANT = {
  tx: "Tx-PLANT-9f3a", session: "Sx-PLANT-7c1d", core: "core-PLANT-pw-1", svc: "svc-PLANT-pw-2", platform: "plat-PLANT-pw-3",
  demo: "demo-PLANT-pw-8", secretKey: "sb_secret_PLANTsec5678", sfk: "sfk_PLANT_storefront_77", tenant: "11111111-2222-4333-8444-555555555555",
  gemini: "gemini-PLANT-key-0042", falkor: "falkor-PLANT-pw-0061",
};
const PLANTED_SECRETS = [PLANT.tx, PLANT.session, PLANT.core, PLANT.svc, PLANT.platform, PLANT.demo, PLANT.secretKey, PLANT.gemini, PLANT.falkor];
const ORIGIN = "https://munim-api-plant.vercel.app";

const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
const argv = process.argv.slice(2);
let stdin = "";
try { stdin = fs.readFileSync(0, "utf8"); } catch {}
fs.appendFileSync(process.env.FAKE_VERCEL_LOG, JSON.stringify({ argv, stdin }) + "\\n");
if (argv[0] === "project" && argv[1] === "inspect") process.exit(process.env.FAKE_VERCEL_NO_PROJECT === argv[2] ? 1 : 0);
if (argv[0] === "env" && argv[1] === "add" && argv[2] === process.env.FAKE_VERCEL_FAIL) {
  process.stderr.write("Error: could not store " + stdin + "\\n");
  process.exit(1);
}
process.exit(0);
`;

interface Call { argv: string[]; stdin: string }
interface World { dir: string; runDir: string; bin: string; log: string; env: Record<string, string> }

function world(): World {
  const dir = mkdtempSync(join(tmpdir(), "t126-env-"));
  const runDir = join(dir, ".run");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "vercel"), FAKE);
  chmodSync(join(bin, "vercel"), 0o755);
  mkdirSync(join(runDir, "cobnut"), { recursive: true });
  writeFileSync(join(runDir, "db-roles.json"), JSON.stringify({ written_at: "x", roles: { munim_core: PLANT.core, munim_svc: PLANT.svc, munim_platform: PLANT.platform } }));
  writeFileSync(join(runDir, "cobnut", "site.env"), `MUNIM_DEMO_TENANT_ID=${PLANT.tenant}\nNEXT_PUBLIC_MUNIM_STOREFRONT_KEY=${PLANT.sfk}\nMUNIM_DEMO_TOKENS=/nowhere\n`);
  writeFileSync(join(runDir, "cobnut", "demo-password"), `${PLANT.demo}\n`);
  mkdirSync(join(runDir, "vercel"), { recursive: true });
  writeFileSync(join(runDir, "vercel", "api-origin"), `${ORIGIN}\n`);
  const log = join(dir, "calls.jsonl");
  const env = { ...(process.env as Record<string, string>), PATH: `${bin}${delimiter}${process.env.PATH}`, FAKE_VERCEL_LOG: log };
  delete env.VERCEL_ORG_ID;
  delete env.VERCEL_PROJECT_ID;
  return { dir, runDir, bin, log, env };
}

function config(w: World, extra: Record<string, string | undefined> = { GEMINI_API_KEY: PLANT.gemini }) {
  return loadConfig({
    runDir: w.runDir,
    env: {
      ...extra,
      SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING: `postgresql://postgres.projref:${PLANT.tx}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
      SUPABASE_SESSION_POOLER_CONNECTION_STRING: `postgresql://postgres.projref:${PLANT.session}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
      SUPABASE_PROJECT_ID: "projref", SUPABASE_PROJECT_URL: "https://projref.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_PLANTpub1234", SUPABASE_SECRET_KEY: PLANT.secretKey, FALKOR_DB_HOST: "falkor.plant.test", FALKOR_DB_PORT: "6379", FALKOR_DB_NAME: "falkordb", FALKOR_DB_PASSWORD: PLANT.falkor,
    },
  });
}

function go(w: World, argv: string[], extra: Record<string, string> = {}, cfg = config(w)) {
  const out: string[] = [];
  const err: string[] = [];
  const code = mod.run({ argv, root: ROOT, config: cfg, env: { ...w.env, ...extra }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out, err, all: [...out, ...err] };
}

const calls = (w: World): Call[] => (existsSync(w.log) ? readFileSync(w.log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Call) : []);
const adds = (w: World) => calls(w).filter((c) => c.argv[0] === "env" && c.argv[1] === "add");
const flag = (c: Call, f: string) => c.argv[c.argv.indexOf(f) + 1];

describe("env-setup", () => {
  const worlds: World[] = [];
  const fresh = () => { const w = world(); worlds.push(w); return w; };
  after(() => { for (const w of worlds) rmSync(w.dir, { recursive: true, force: true }); });

  test("the variable table is exactly the expected names, once each", () => {
    const names = mod.VARS.map((v) => `${v.project}/${v.name}`).sort();
    assert.deepEqual(names, [...API.map((n) => `munim-api/${n}`), ...COBNUT.map((n) => `munim-cobnut/${n}`)].sort());
  });

  test("every name apps/web reads is sent, or is on the never-send list", () => {
    // MUNIM_IDP_WEB_API_KEY: Identity Platform only (the Cup); munim-cobnut signs in through the dev mapping's grant (T-122).
    // NODE_ENV: set by Next.js and the platform (next.config.ts reads it for the dev-only CSP sources), never by env-setup.
    const never = new Set(["MUNIM_MOCK", "NEXT_PUBLIC_MUNIM_MOCK_CONTROLS", "MOCK_TOKEN_SECRET", "MUNIM_NEXT_STANDALONE", "MUNIM_IDP", "MUNIM_IDP_WEB_API_KEY", "MUNIM_DEMO_TOKENS", "NODE_ENV"]);
    const read = new Set<string>();
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (["node_modules", ".next", "tests", "mock-server", "scripts"].includes(e.name)) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|mjs)$/.test(e.name)) for (const m of readFileSync(p, "utf8").matchAll(/\benv\.([A-Z][A-Z0-9_]{3,})/g)) read.add(m[1]!);
      }
    };
    walk(join(ROOT, "apps/web"));
    assert.ok(read.has("MUNIM_API_ORIGIN") && read.has("MUNIM_DEMO_PASSWORD"), "the scan found apps/web's env reads");
    for (const n of read) assert.ok(never.has(n) || COBNUT.includes(n), `apps/web reads ${n}, which env-setup neither sends nor excludes`);
  });

  test("dry run: lists every name, calls nothing, writes nothing, prints no value", () => {
    const w = fresh();
    rmSync(join(w.runDir, "vercel"), { recursive: true });
    const r = go(w, ["--dry-run"]);
    assert.equal(r.code, 0);
    assert.equal(calls(w).length, 0);
    assert.equal(existsSync(join(w.runDir, "vercel")), false, "dry run must not create .run/vercel");
    const text = r.all.join("\n");
    for (const n of [...API, ...COBNUT]) assert.ok(text.includes(n), `dry run lists ${n}`);
    for (const s of [...PLANTED_SECRETS, PLANT.sfk, PLANT.tenant, "projref"]) assert.ok(!text.includes(s), "dry run printed a value");
  });

  test("a real run sends every name once, on stdin, after an rm, and prints names only", () => {
    const w = fresh();
    const r = go(w, []);
    assert.equal(r.code, 0, r.all.join("\n"));
    const sent = adds(w);
    assert.equal(sent.length, API.length + COBNUT.length);
    const key = (c: Call) => `${flag(c, "--project")}/${c.argv[2]}`;
    assert.equal(new Set(sent.map(key)).size, sent.length, "each name once per project");
    const all = calls(w);
    for (const c of sent) {
      const at = (verb: string) => all.findIndex((x) => x.argv[1] === verb && x.argv[2] === c.argv[2] && flag(x, "--project") === flag(c, "--project"));
      assert.ok(at("rm") >= 0 && at("rm") < at("add"), `${key(c)}: rm before add`);
      assert.equal(c.argv[3], "production");
      assert.ok(c.argv.includes("--non-interactive") && c.argv.includes("--force"));
      assert.ok(c.argv.includes(SENSITIVE.has(c.argv[2]!) ? "--sensitive" : "--no-sensitive"), `${key(c)} sensitivity`);
      assert.ok(!c.argv.some((a) => a.includes("PLANT")), "no value in argv");
    }
    const value = (project: string, name: string) => sent.find((c) => key(c) === `${project}/${name}`)!.stdin;
    assert.equal(value("munim-api", "MUNIM_DB_PASSWORD_MUNIM_SVC"), PLANT.svc);
    assert.equal(value("munim-api", "SUPPLIERS_SIM_PUBLIC_URL"), `${ORIGIN}/suppliers-sim`);
    assert.equal(value("munim-api", "MUNIM_CORE_URL"), ORIGIN);
    // R58: the standalone deploy runs live Gemini (T-125's recorded fallback); every gate stays recorded.
    assert.equal(value("munim-api", "MUNIM_MODEL_MODE"), "live");
    // intel stops before core stops waiting, and core before Hobby's 300 s limit cuts the function.
    const [budget, wait] = [Number(value("munim-api", "MUNIM_ASK_BUDGET_S")), Number(value("munim-api", "MUNIM_ASK_TIMEOUT_S"))];
    assert.ok(budget > 90 && budget < wait && wait < 300, `ask budget ${budget} s < core wait ${wait} s < 300 s`);
    assert.equal(value("munim-api", "GEMINI_API_KEY"), PLANT.gemini);
    assert.equal(value("munim-cobnut", "MUNIM_API_ORIGIN"), ORIGIN);
    assert.equal(value("munim-cobnut", "NEXT_PUBLIC_MUNIM_API"), "/api");
    assert.equal(value("munim-cobnut", "MUNIM_DEMO_TENANT_ID"), PLANT.tenant);
    assert.equal(value("munim-cobnut", "NEXT_PUBLIC_MUNIM_STOREFRONT_KEY"), PLANT.sfk);
    assert.equal(value("munim-cobnut", "MUNIM_DEMO_PASSWORD"), PLANT.demo);
    assert.match(value("munim-api", "MUNIM_SERVICE_SECRET"), /^[0-9a-f]{64}$/);
    assert.match(value("munim-api", "CRON_SECRET"), /^[0-9a-f]{64}$/);
    // The pooler strings keep host, port and database; the admin credentials stay home.
    assert.equal(value("munim-api", "SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING"), "postgresql://aws-0-ap-south-1.pooler.supabase.com:6543/postgres");
    assert.equal(value("munim-api", "SUPABASE_SESSION_POOLER_CONNECTION_STRING"), "postgresql://aws-0-ap-south-1.pooler.supabase.com:5432/postgres");
    // The run-token pair belongs together.
    const priv = value("munim-api", "MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM");
    const pub = value("munim-api", "MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM");
    assert.equal(createPublicKey(priv).export({ type: "spki", format: "pem" }).toString().trim(), pub);

    // Output hygiene: every line is one of three shapes, and none carries a value.
    for (const l of r.out) assert.match(l, /^(set [A-Z0-9_]+ \((munim-api|munim-cobnut), production\)|done: \d+ set, 0 missing, 0 failed|redeploy both projects for this to take effect: .*)$/);
    assert.equal(r.err.length, 0);
    const generated = [value("munim-api", "MUNIM_SERVICE_SECRET"), value("munim-api", "CRON_SECRET"), ...priv.split("\n")];
    for (const s of [...PLANTED_SECRETS, PLANT.sfk, ...generated]) assert.ok(!r.all.join("\n").includes(s), "a value reached the output");
    // .run/vercel holds the generated secrets, owner-only.
    assert.equal(statSync(join(w.runDir, "vercel")).mode & 0o777, 0o700);
    for (const f of readdirSync(join(w.runDir, "vercel")).filter((x) => x !== "api-origin")) assert.equal(statSync(join(w.runDir, "vercel", f)).mode & 0o777, 0o600, f);
  });

  test("what munim-api receives boots core's env-only config: both pooler strings still yield every role's URL", () => {
    const w = fresh();
    go(w, ["--project", "munim-api"]);
    const sent = Object.fromEntries(adds(w).map((c) => [c.argv[2]!, c.stdin]));
    // deploy/vercel/core/index.mjs copies CRON_SECRET to MUNIM_CRON_SECRET before core boots.
    const cfg = loadConfig({ envOnly: true, env: { ...sent, MUNIM_CRON_SECRET: sent.CRON_SECRET } });
    for (const [role, pw, port] of [["munim_core", PLANT.core, "6543"], ["munim_svc", PLANT.svc, "6543"], ["munim_platform", PLANT.platform, "6543"]] as const) {
      const u = new URL(cfg.dbUrl(role));
      assert.deepEqual([u.username, decodeURIComponent(u.password), u.port, u.pathname], [`${role}.projref`, pw, port, "/postgres"]);
    }
    const l = new URL(cfg.sessionDbUrl("munim_core"));
    assert.deepEqual([l.username, decodeURIComponent(l.password), l.port], ["munim_core.projref", PLANT.core, "5432"]);
    assert.ok(cfg.runTokenKeyPems() !== null && cfg.cronSecret() !== null && cfg.serviceSecret().length === 64);
    // T-116: env-root builds the shared bucket store from exactly these three.
    assert.deepEqual([cfg.blob, cfg.blobBucket(), cfg.require("SUPABASE_SECRET_KEY")], ["supabase", "munim-uploads", PLANT.secretKey]);
  });

  test("a re-run reuses the generated secrets; --rotate replaces them, and the pair still matches", () => {
    const w = fresh();
    go(w, ["--project", "munim-api"]);
    const first = adds(w);
    rmSync(w.log);
    go(w, ["--project=munim-api"]);
    const again = adds(w);
    const pick = (cs: Call[], n: string) => cs.find((c) => c.argv[2] === n)!.stdin;
    for (const n of ["MUNIM_SERVICE_SECRET", "CRON_SECRET", "MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM", "MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM"]) assert.equal(pick(again, n), pick(first, n), `${n} reused`);
    rmSync(w.log);
    const r = go(w, ["--project", "munim-api", "--rotate"]);
    assert.equal(r.code, 0);
    const rotated = adds(w);
    for (const n of ["MUNIM_SERVICE_SECRET", "CRON_SECRET", "MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM", "MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM"]) assert.notEqual(pick(rotated, n), pick(first, n), `${n} rotated`);
    assert.equal(createPublicKey(pick(rotated, "MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM")).export({ type: "spki", format: "pem" }).toString().trim(), pick(rotated, "MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM"));
  });

  test("--env preview targets preview; one project only touches that project", () => {
    const w = fresh();
    const r = go(w, ["--project", "munim-cobnut", "--env=preview"]);
    assert.equal(r.code, 0);
    assert.equal(adds(w).length, COBNUT.length);
    assert.ok(adds(w).every((c) => c.argv[3] === "preview" && flag(c, "--project") === "munim-cobnut"));
  });

  test("missing sources are reported by name with their producing step; the rest is still sent; exit 1", () => {
    const w = fresh();
    rmSync(join(w.runDir, "cobnut"), { recursive: true });
    rmSync(join(w.runDir, "vercel", "api-origin"));
    const r = go(w, []);
    assert.equal(r.code, 1);
    for (const n of ["MUNIM_DEMO_PASSWORD", "MUNIM_DEMO_TENANT_ID", "NEXT_PUBLIC_MUNIM_STOREFRONT_KEY", "MUNIM_API_ORIGIN"]) {
      assert.ok(r.err.some((l) => l.startsWith(`missing ${n} (munim-cobnut, production): produced by `)), `${n} reported`);
    }
    assert.ok(r.err.some((l) => l.startsWith("missing SUPPLIERS_SIM_PUBLIC_URL (munim-api, production)")));
    assert.ok(r.err.some((l) => l.startsWith("missing MUNIM_CORE_URL (munim-api, production)")));
    const sent = adds(w).map((c) => c.argv[2]);
    assert.ok(sent.includes("MUNIM_SERVICE_SECRET") && sent.includes("NEXT_PUBLIC_MUNIM_API"));
    assert.ok(!sent.includes("MUNIM_DEMO_PASSWORD") && !sent.includes("MUNIM_API_ORIGIN"));
    assert.ok(r.out.includes(`done: ${API.length + COBNUT.length - 6} set, 6 missing, 0 failed`), r.out.join("\n"));
  });

  test("R58: no GEMINI_API_KEY in .env → named as missing with its step, everything else sent, exit 1", () => {
    const w = fresh();
    const r = go(w, [], {}, config(w, {}));
    assert.equal(r.code, 1);
    assert.ok(r.err.some((l) => l.startsWith("missing GEMINI_API_KEY (munim-api, production): produced by fill GEMINI_API_KEY in .env")), r.err.join("\n"));
    const sent = adds(w).map((c) => c.argv[2]);
    assert.equal(sent.length, API.length + COBNUT.length - 1);
    assert.ok(sent.includes("MUNIM_MODEL_MODE") && !sent.includes("GEMINI_API_KEY"));
    assert.ok(r.out.includes(`done: ${API.length + COBNUT.length - 1} set, 1 missing, 0 failed`), r.out.join("\n"));
  });

  test("--api-origin wins over the recorded file", () => {
    const w = fresh();
    go(w, ["--project", "munim-cobnut", "--api-origin", "https://other.example.com/"]);
    assert.equal(adds(w).find((c) => c.argv[2] === "MUNIM_API_ORIGIN")!.stdin, "https://other.example.com");
  });

  test("a failing call names the variable and the step; the CLI's echo of the value is redacted", () => {
    const w = fresh();
    const r = go(w, ["--project", "munim-api"], { FAKE_VERCEL_FAIL: "MUNIM_DB_PASSWORD_MUNIM_SVC" });
    assert.equal(r.code, 1);
    assert.ok(r.err.includes("FAIL MUNIM_DB_PASSWORD_MUNIM_SVC (munim-api, production): vercel env add exited 1"), r.err.join("\n"));
    assert.ok(r.err.some((l) => l.includes("[redacted]")), "the echoed value was redacted, not dropped silently");
    assert.ok(!r.all.join("\n").includes(PLANT.svc), "the value reached the output");
    assert.equal(adds(w).length, API.length, "the other variables were still sent");
  });

  test("a project that cannot be reached stops that project only", () => {
    const w = fresh();
    const r = go(w, [], { FAKE_VERCEL_NO_PROJECT: "munim-cobnut" });
    assert.equal(r.code, 1);
    assert.ok(r.err.some((l) => l.startsWith("FAIL munim-cobnut: cannot reach the project")));
    assert.equal(adds(w).filter((c) => flag(c, "--project") === "munim-cobnut").length, 0);
    assert.equal(adds(w).filter((c) => flag(c, "--project") === "munim-api").length, API.length);
  });

  test("refuses to run while VERCEL_ORG_ID / VERCEL_PROJECT_ID could redirect --project", () => {
    const w = fresh();
    const r = go(w, [], { VERCEL_PROJECT_ID: "prj_x" });
    assert.equal(r.code, 1);
    assert.equal(calls(w).length, 0);
  });

  test("an absent vercel binary is a named failure, not a crash", () => {
    const w = fresh();
    const r = go(w, ["--project", "munim-api"], { PATH: "/nonexistent" });
    assert.equal(r.code, 1);
    assert.ok(r.err.some((l) => l.includes("cannot reach the project")), r.err.join("\n"));
  });
});

describe("env-setup command line", () => {
  let dir = "";
  before(() => { dir = mkdtempSync(join(tmpdir(), "t126-cli-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, MUNIM_ENV_FILE: join(dir, "none.env"), MUNIM_RUN_DIR: join(dir, "run") } });

  for (const bad of [
    ["--bogus"], ["--project=nope"], ["--project"], ["--project", "--dry-run"], ["--env", "staging"], ["--dry-run=1"], ["--dry-run", "--dry-run"],
    ["munim-api"], ["-n"], ["--api-origin=http://munim-api.vercel.app"], ["--api-origin", "https://user:pw@x.example.com"], ["--api-origin=https://x.example.com/path"],
  ]) {
    test(`usage error, exit 2: ${bad.join(" ")}`, () => {
      const r = cli(...bad);
      assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /^env-setup: /m);
      assert.ok(!existsSync(join(dir, "run")), "nothing is created on a usage error");
    });
  }

  test("--dry-run with no .env and no .run exits 0 and creates nothing", () => {
    const r = cli("--dry-run");
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes("MUNIM_SERVICE_SECRET") && r.stdout.includes("MUNIM_DEMO_PASSWORD"));
    assert.ok(!existsSync(join(dir, "run")));
  });

  test("both flag forms parse", () => {
    assert.equal(cli("--project=munim-api", "--env=preview", "--dry-run").status, 0);
    assert.equal(cli("--project", "munim-cobnut", "--env", "production", "--dry-run").status, 0);
  });
});
