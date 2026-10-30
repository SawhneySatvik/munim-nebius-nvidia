// Gate for deploy/nebius/guard.ts:  node --test "deploy/nebius/test/*.test.ts"
// Fixtures are fake settings in a temp tree; no network, no database, no real file is read.
// GUARD_UNDER_TEST points the test at a mutated copy (the red-proof).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { loadRepoConfig } from "../../../packages/config/src/index.ts";

const SCRIPT = process.env.GUARD_UNDER_TEST ? resolve(process.env.GUARD_UNDER_TEST) : join(import.meta.dirname, "../guard.ts");
const g = (await import(pathToFileURL(SCRIPT).href)) as typeof import("../guard.ts");

const tmp: string[] = [];
after(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });

const settings = (ref: string, o: { pw?: string; host?: string; id?: string; url?: string } = {}) => [
  `SUPABASE_PROJECT_ID=${o.id ?? ref}`,
  `SUPABASE_PROJECT_URL=${o.url ?? `https://${ref}.supabase.co`}`,
  `SUPABASE_SESSION_POOLER_CONNECTION_STRING=postgresql://postgres.${ref}:${o.pw ?? `pw-${ref}-secret`}@${o.host ?? "pool.example.test"}:5432/postgres`,
  `SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING=postgresql://postgres.${ref}:${o.pw ?? `pw-${ref}-secret`}@${o.host ?? "pool.example.test"}:6543/postgres`,
].join("\n") + "\n";

function tree(nebius: string | null, reference: string | null) {
  const root = mkdtempSync(join(tmpdir(), "nbd-"));
  tmp.push(root);
  mkdirSync(join(root, ".run", "nebius"), { recursive: true });
  if (nebius !== null) writeFileSync(join(root, ".env.nebius"), nebius);
  if (reference !== null) writeFileSync(join(root, ".env"), reference);
  return { root, env: g.profileEnv(root, {}) };
}

describe("nebius guard", () => {
  test("distinct projects on a shared pooler host pass", () => {
    const t = tree(settings("nebiusref0001"), settings("existingref002"));
    assert.deepEqual(g.check(t), []);
  });

  for (const [what, nebius] of [
    ["the same project id", settings("nebiusref0001", { id: "existingref002" })],
    ["the same pooler login", settings("existingref002", { id: "nebiusref0001", url: "https://nebiusref0001.supabase.co" })],
    ["the same project URL", settings("nebiusref0001", { url: "https://existingref002.supabase.co" })],
    ["the whole existing file", settings("existingref002")],
  ] as const) {
    test(`refuses ${what}, naming kinds but no value`, () => {
      const t = tree(nebius, settings("existingref002"));
      const p = g.check(t);
      assert.ok(p.length > 0, "expected a refusal");
      const text = p.join("\n");
      for (const secret of ["existingref002", "nebiusref0001", "pw-", "pool.example.test"]) assert.ok(!text.includes(secret), `a value leaked: ${secret}`);
    });
  }

  test("refuses when the Nebius file is missing, empty of a project, or the reference is missing or empty", () => {
    assert.ok(g.check(tree(null, settings("existingref002"))).some((p) => p.includes("does not exist")));
    assert.ok(g.check(tree("GEMINI_API_KEY=x\n", settings("existingref002"))).length > 0);
    assert.ok(g.check(tree(settings("nebiusref0001"), null)).some((p) => p.includes("cannot be proved")));
    assert.ok(g.check(tree(settings("nebiusref0001"), "GEMINI_API_KEY=x\n")).some((p) => p.includes("cannot be proved")));
  });

  test("refuses when the selector or run dir is not the profile's", () => {
    const t = tree(settings("nebiusref0001"), settings("existingref002"));
    assert.ok(g.check({ root: t.root, env: { ...t.env, MUNIM_ENV_FILE: join(t.root, ".env") } }).some((p) => p.includes("MUNIM_ENV_FILE")));
    const { MUNIM_ENV_FILE: _a, ...noFile } = t.env;
    assert.ok(g.check({ root: t.root, env: noFile }).some((p) => p.includes("MUNIM_ENV_FILE")));
    const { MUNIM_RUN_DIR: _b, ...noRun } = t.env;
    assert.ok(g.check({ root: t.root, env: noRun }).some((p) => p.includes("MUNIM_RUN_DIR")));
  });

  test("refuses the existing Vercel project names and any name outside munim-nebius-", () => {
    const t = tree(settings("nebiusref0001"), settings("existingref002"));
    for (const n of ["munim-cobnut", "munim-api", "munim", "munim-rho", "munim-web"]) assert.ok(g.check({ ...t, names: [n] }).length > 0, n);
    assert.deepEqual(g.check({ ...t, names: [g.PROFILE.web, g.PROFILE.api] }), []);
  });

  test("the process environment cannot stand in for either file", () => {
    const t = tree(settings("nebiusref0001"), settings("existingref002"));
    const poisoned = { ...t.env, SUPABASE_PROJECT_ID: "existingref002" };
    assert.deepEqual(g.check({ root: t.root, env: poisoned }), []);
  });

  test("the guarded command's environment drops inherited Supabase and database settings", () => {
    const e = g.profileEnv("/r", { PATH: "/bin", SUPABASE_PROJECT_ID: "x", MUNIM_DB_URL_SESSION: "x", MUNIM_DATABASE_URL: "x", VERCEL_PROJECT_ID: "x", MUNIM_RUN_DIR: "/other", MUNIM_ENV_FILE: "/other" });
    assert.deepEqual(Object.keys(e).sort(), ["MUNIM_ENV_FILE", "MUNIM_RUN_DIR", "PATH"]);
    assert.equal(e.MUNIM_ENV_FILE, "/r/.env.nebius");
    assert.equal(e.MUNIM_RUN_DIR, "/r/.run/nebius");
  });

  test("main refuses with exit 1 and runs nothing; the OK path runs the command with the profile env", () => {
    const bad = tree(settings("existingref002"), settings("existingref002"));
    const errs: string[] = [];
    assert.equal(g.main(["exec", "--", "node", "-e", `require("fs").writeFileSync(${JSON.stringify(join(bad.root, "ran"))}, "x")`], bad.root, () => {}, (l) => errs.push(l)), 1);
    assert.ok(errs.some((l) => l.includes("REFUSED")));
    const ok = tree(settings("nebiusref0001"), settings("existingref002"));
    const sentinel = join(ok.root, "ran");
    assert.equal(g.main(["exec", "--", "node", "-e", `require("fs").writeFileSync(${JSON.stringify(sentinel)}, process.env.MUNIM_ENV_FILE ?? "")`], ok.root, () => {}, () => {}), 0);
    assert.equal(readFileSync(sentinel, "utf8"), join(ok.root, ".env.nebius"));
    assert.ok(!existsSync(join(bad.root, "ran")));
    assert.equal(g.main(["exec", "--", "node", "-e", "process.exit(3)"], ok.root, () => {}, () => {}), 3);
    assert.equal(g.main(["bogus"], ok.root, () => {}, () => {}), 2);
  });
});

describe("nebius guard: review fixes", () => {
  const decoy = (t: { root: string }) => { const f = join(t.root, "decoy.env"); writeFileSync(f, settings("decoyref0003")); return f; };

  test("A: a stale MUNIM_REFERENCE_ENV_FILE export is ignored; the reference is <root>/.env", () => {
    const t = tree(settings("existingref002"), settings("existingref002"));
    assert.ok(g.check({ root: t.root, env: { ...t.env, MUNIM_REFERENCE_ENV_FILE: decoy(t) } }).length > 0, "a decoy reference let the same project through");
  });

  test("A: --reference selects the file, the OK line names its basename, and a reference without a pooler login ref is refused", () => {
    const t = tree(settings("nebiusref0001"), "GEMINI_API_KEY=x\n");
    const other = join(t.root, "demos.env");
    writeFileSync(other, settings("existingref002"));
    const outs: string[] = [], errs: string[] = [];
    assert.equal(g.main(["check", "--reference", other], t.root, (l) => outs.push(l), (l) => errs.push(l)), 0, errs.join("\n"));
    assert.ok(outs.some((l) => l.includes("OK") && l.includes("(reference: demos.env)")), outs.join("\n"));
    assert.equal(g.main(["check", `--reference=${other}`], t.root, () => {}, () => {}), 0);
    const bare = [] as string[];
    assert.equal(g.main(["check"], t.root, () => {}, (l) => bare.push(l)), 1);
    assert.ok(bare.some((l) => l.includes("cannot be proved")));
    writeFileSync(other, "SUPABASE_PROJECT_ID=existingref002\n"); // an id alone is not a pooler login
    assert.equal(g.main(["check", "--reference", other], t.root, () => {}, () => {}), 1);
    for (const bad of [["check", "--reference"], ["check", "--reference", other, "--reference", other], ["check", "--bogus"], ["check", "extra"]]) assert.equal(g.main(bad, t.root, () => {}, () => {}), 2, bad.join(" "));
  });

  test("B: an upper-case ref in the pooler login still matches", () => {
    const t = tree(settings("EXISTINGREF002", { id: "nebiusref0001", url: "https://nebiusref0001.supabase.co" }), settings("existingref002"));
    assert.ok(g.check(t).length > 0);
  });

  test("C: a transaction pooler of the form postgres@db.<ref>.supabase.co:6543 yields its ref", () => {
    const own = settings("nebiusref0001").split("\n").filter((l) => !l.startsWith("SUPABASE_TRANSACTION")).join("\n");
    const t = tree(`${own}\nSUPABASE_TRANSACTION_POOLER_CONNECTION_STRING=postgresql://postgres:pw-x@db.existingref002.supabase.co:6543/postgres\n`, settings("existingref002"));
    assert.ok(g.check(t).some((p) => p.includes("transaction pooler login")), "no ref taken from the db.<ref> host");
  });

  test("F: only allow-listed names reach the child; planted secrets do not, the deliberate seed tokens do", () => {
    const planted = { PATH: "/bin", HOME: "/h", NODE_OPTIONS: "--no-warnings", PGPASSWORD: "x", TAVILY_API_KEY: "x", DATABASE_URL: "x", POSTGRES_PASSWORD: "x", MUNIM_SERVICE_SECRET: "x", FALKOR_DB_PASSWORD: "x", MUNIM_FALKORDB_URL: "x", MUNIM_REFERENCE_ENV_FILE: "/x",
      MUNIM_SEED_TOKENS: "t", MUNIM_SEED_OPERATOR_TOKEN: "o" };
    assert.deepEqual(Object.keys(g.profileEnv("/r", planted)).sort(), ["HOME", "MUNIM_ENV_FILE", "MUNIM_RUN_DIR", "MUNIM_SEED_OPERATOR_TOKEN", "MUNIM_SEED_TOKENS", "NODE_OPTIONS", "PATH"]);
  });

  test("F: through main, a planted PGPASSWORD and TAVILY_API_KEY do not reach the child process", () => {
    const t = tree(settings("nebiusref0001"), settings("existingref002"));
    const sentinel = join(t.root, "seen");
    const was = { pg: process.env.PGPASSWORD, tv: process.env.TAVILY_API_KEY };
    process.env.PGPASSWORD = "planted-pg"; process.env.TAVILY_API_KEY = "planted-tv";
    try {
      assert.equal(g.main(["exec", "--", "node", "-e", `require("fs").writeFileSync(${JSON.stringify(sentinel)}, JSON.stringify([process.env.PGPASSWORD ?? null, process.env.TAVILY_API_KEY ?? null]))`], t.root, () => {}, () => {}), 0);
    } finally {
      for (const [k, v] of [["PGPASSWORD", was.pg], ["TAVILY_API_KEY", was.tv]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
    assert.equal(readFileSync(sentinel, "utf8"), "[null,null]");
  });
});

describe("packages/config file selection (unchanged by this ticket)", () => {
  test("MUNIM_ENV_FILE selects the file; unset reads <root>/.env", () => {
    const t = tree(settings("nebiusref0001"), settings("existingref002"));
    assert.equal(loadRepoConfig(t.root, { MUNIM_RUN_DIR: join(t.root, ".run/nebius") }).get("SUPABASE_PROJECT_ID"), "existingref002");
    assert.equal(loadRepoConfig(t.root, { MUNIM_ENV_FILE: join(t.root, ".env.nebius"), MUNIM_RUN_DIR: join(t.root, ".run/nebius") }).get("SUPABASE_PROJECT_ID"), "nebiusref0001");
  });
});
