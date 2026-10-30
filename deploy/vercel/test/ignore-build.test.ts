// Gate for deploy/vercel/ignore-build.sh:  node --test deploy/vercel/test/ignore-build.test.ts
// Real git repositories in a temp directory; the script runs as Vercel runs it (cwd = the Root Directory, one env var).
// IGNORE_UNDER_TEST points the file at a mutated copy (the red-proof). Exit 0 = skip the build, 1 = build.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, test } from "node:test";

const SCRIPT = process.env.IGNORE_UNDER_TEST ? resolve(process.env.IGNORE_UNDER_TEST) : join(import.meta.dirname, "../ignore-build.sh");
const tmp: string[] = [];
after(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repo whose first commit holds every path any case touches; `commit(path)` appends one commit that changes only that file. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), "ignore-build-"));
  tmp.push(root);
  git(root, "init", "-q", "-b", "main");
  const files = ["apps/web/a.ts", "apps/site/a.ts", "packages/sdk/a.ts", "adapters/dev/a.ts", "adapters/gcp/a.ts", "docs/kit/a.md",
    "packages/contracts/generated/a.json", "tsconfig.base.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "services/core-api/a.ts", "db/a.sql", "docs/plan/a.md"];
  for (const f of files) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), "0\n");
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  let n = 0;
  return {
    root,
    base: git(root, "rev-parse", "HEAD"),
    commit(path: string) {
      writeFileSync(join(root, path), `${++n}\n`);
      git(root, "commit", "-q", "-am", `change ${path}`);
    },
  };
}

function run(root: string, project: string, env: Record<string, string>, arg: string[] = [project]) {
  const cwd = join(root, project === "web" ? "apps/web" : "apps/site");
  const r = spawnSync("bash", [SCRIPT, ...arg], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}

describe("ignore-build.sh", () => {
  test("web: a change in each of its inputs builds, in every one of them", () => {
    for (const p of ["apps/web/a.ts", "packages/sdk/a.ts", "adapters/dev/a.ts", "adapters/gcp/a.ts", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
      const r = repo();
      r.commit(p);
      const got = run(r.root, "web", { VERCEL_GIT_PREVIOUS_SHA: r.base });
      assert.equal(got.code, 1, `${p}: ${got.out}`);
      assert.match(got.out, /inputs changed/, p);
    }
  });

  test("site: a change in each of its inputs builds, in every one of them", () => {
    for (const p of ["apps/site/a.ts", "docs/kit/a.md", "packages/contracts/generated/a.json", "tsconfig.base.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
      const r = repo();
      r.commit(p);
      const got = run(r.root, "site", { VERCEL_GIT_PREVIOUS_SHA: r.base });
      assert.equal(got.code, 1, `${p}: ${got.out}`);
      assert.match(got.out, /inputs changed/, p);
    }
  });

  test("a change outside both projects' inputs skips both", () => {
    const r = repo();
    for (const p of ["services/core-api/a.ts", "db/a.sql", "docs/plan/a.md"]) r.commit(p);
    for (const project of ["web", "site"]) {
      const got = run(r.root, project, { VERCEL_GIT_PREVIOUS_SHA: r.base });
      assert.equal(got.code, 0, `${project}: ${got.out}`);
      assert.match(got.out, /skip/, project);
    }
  });

  test("each project ignores the other's own inputs", () => {
    const r = repo();
    r.commit("apps/site/a.ts");
    assert.equal(run(r.root, "web", { VERCEL_GIT_PREVIOUS_SHA: r.base }).code, 0);
    const q = repo();
    q.commit("apps/web/a.ts");
    assert.equal(run(q.root, "site", { VERCEL_GIT_PREVIOUS_SHA: q.base }).code, 0);
  });

  test("a push of several commits builds when an EARLIER one changed an input and the tip did not (HEAD^ would skip)", () => {
    const r = repo();
    r.commit("apps/web/a.ts");
    r.commit("services/core-api/a.ts");
    r.commit("db/a.sql");
    const got = run(r.root, "web", { VERCEL_GIT_PREVIOUS_SHA: r.base });
    assert.equal(got.code, 1, got.out);
  });

  test("no previous sha (first deployment of the branch) builds, even with nothing changed", () => {
    const r = repo();
    for (const env of [{}, { VERCEL_GIT_PREVIOUS_SHA: "" }]) {
      const got = run(r.root, "web", env);
      assert.equal(got.code, 1, got.out);
      assert.match(got.out, /no previous successful deployment/);
    }
  });

  test("a previous sha that is not in the clone builds", () => {
    const r = repo();
    const got = run(r.root, "web", { VERCEL_GIT_PREVIOUS_SHA: "1234567890abcdef1234567890abcdef12345678" });
    assert.equal(got.code, 1, got.out);
    assert.match(got.out, /not in this clone/);
  });

  test("a real shallow clone that no longer holds the previous sha builds; one that holds it can skip", () => {
    const r = repo();
    for (let i = 0; i < 12; i++) r.commit("services/core-api/a.ts");
    const clone = mkdtempSync(join(tmpdir(), "ignore-build-clone-"));
    tmp.push(clone);
    git(clone, "clone", "-q", "--depth=10", `file://${r.root}`, "c");
    const root = join(clone, "c");
    assert.equal(run(root, "web", { VERCEL_GIT_PREVIOUS_SHA: r.base }).code, 1, "base is 12 commits back: outside depth 10");
    const near = git(root, "rev-parse", "HEAD~3");
    const got = run(root, "web", { VERCEL_GIT_PREVIOUS_SHA: near });
    assert.equal(got.code, 0, got.out);
    assert.match(got.out, /skip/);
  });

  test("an unknown project name builds", () => {
    const r = repo();
    const got = run(r.root, "web", { VERCEL_GIT_PREVIOUS_SHA: r.base }, ["nope"]);
    assert.equal(got.code, 1, got.out);
    assert.match(got.out, /usage/);
  });
});
