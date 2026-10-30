// Gate for deploy/vercel/deploy.mjs:  node --test "deploy/vercel/test/*.test.ts"
// The process boundary is replaced by a recording `exec`; the files (links, the recorded origin) are real, in a temp tree.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { pathToFileURL } from "node:url";

const HERE = import.meta.dirname;
// DEPLOY_UNDER_TEST points the file at a mutated copy (the red-proof).
const SCRIPT = process.env.DEPLOY_UNDER_TEST ? resolve(process.env.DEPLOY_UNDER_TEST) : join(HERE, "../deploy.mjs");
const { main } = (await import(pathToFileURL(SCRIPT).href)) as { main: (o: Record<string, unknown>) => number };

interface Call { cmd: string; args: string[]; cwd: string; env: Record<string, string | undefined> }
interface Opts {
  exists?: boolean;
  linkAs?: string;           // what `vercel link` records, if not the requested name
  failOn?: string;           // an exact "cmd args" prefix that exits 1
  domains?: string;          // stdout of `vercel api`
  foreignShadow?: boolean;   // the existing shadow belongs to some other repository
}

const tmp: string[] = [];
function world(o: Opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "t126-deploy-"));
  tmp.push(dir);
  const root = join(dir, "repo");
  const shadow = join(dir, "cache", "cobnut-src");
  const apiOut = join(dir, "cache", "api-out");
  mkdirSync(join(root, "deploy", "vercel"), { recursive: true });
  mkdirSync(join(root, ".git"));
  mkdirSync(join(dir, "other.git"));
  mkdirSync(join(root, ".vercel"));
  writeFileSync(join(root, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_munim", orgId: "team_x", projectName: "munim" }));
  const calls: Call[] = [];
  const known = new Set<string>(o.exists ? ["munim-api", "munim-cobnut"] : []);
  const link = (cwd: string, name: string) => {
    mkdirSync(join(cwd, ".vercel"), { recursive: true });
    writeFileSync(join(cwd, ".vercel", "project.json"), JSON.stringify({ projectId: `prj_${name}`, orgId: "team_x", projectName: name }));
  };
  const exec = (cmd: string, args: string[], x: { cwd: string; env: Record<string, string | undefined>; capture?: boolean }) => {
    calls.push({ cmd, args, cwd: x.cwd, env: x.env });
    const line = `${cmd} ${args.join(" ")}`;
    if (o.failOn && line.startsWith(o.failOn)) return { status: 1, stdout: "" };
    const ok = (stdout = "") => ({ status: 0, stdout });
    if (cmd === "node") { mkdirSync(apiOut, { recursive: true }); return ok(); }
    if (cmd === "git") {
      if (args[0] === "rev-parse" && args[1] === "--verify") return ok("0123456789abcdef0123456789abcdef01234567\n");
      if (args[0] === "rev-parse") return ok(`${o.foreignShadow ? join(dir, "other.git") : join(root, ".git")}\n`);
      if (args[0] === "status") return ok(" M apps/web/x.ts\n?? y\n");
      if (args[0] === "worktree") { mkdirSync(shadow, { recursive: true }); return ok(); }
      return ok();
    }
    if (cmd === "vercel") {
      if (args[0] === "project" && args[1] === "inspect") return { status: known.has(args[2]!) ? 0 : 1, stdout: "" };
      if (args[0] === "project" && args[1] === "add") { known.add(args[2]!); return ok(); }
      if (args[0] === "link") { link(x.cwd, o.linkAs ?? args[args.indexOf("--project") + 1]!); return ok(); }
      if (args[0] === "pull") { writeFileSync(join(x.cwd, ".vercel", ".env.production.local"), "pulled"); return ok(); }
      if (args[0] === "api") return ok(o.domains ?? JSON.stringify({ domains: [{ name: "munim-api-xyz.vercel.app", redirect: "a.example" }, { name: "munim-api.vercel.app" }] }));
    }
    return ok();
  };
  const out: string[] = [];
  const err: string[] = [];
  const run = (argv: string[], env: Record<string, string | undefined> = {}) =>
    main({ argv, root, shadow, apiOut, env: { PATH: "/usr/bin", ...env }, exec, out: (l: string) => out.push(l), err: (l: string) => err.push(l) });
  return { dir, root, shadow, calls, out, err, run, link, outDir: apiOut };
}
after(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });

const lines = (calls: Call[]) => calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
const munimUntouched = (root: string) => JSON.parse(readFileSync(join(root, ".vercel", "project.json"), "utf8")).projectName === "munim" && !existsSync(join(root, ".vercel", "output"));

describe("deploy.mjs", () => {
  test("dry run runs nothing and shows both --prod deploys with bom1", () => {
    const w = world();
    assert.equal(w.run(["--dry-run"]), 0);
    assert.equal(w.calls.length, 0);
    const text = w.out.join("\n");
    assert.match(text, /vercel deploy --prod --regions bom1 --yes/);
    assert.match(text, /vercel deploy --prebuilt --prod --regions bom1 --yes/);
    assert.match(text, /vercel pull --yes --environment=production/);
    assert.match(text, /vercel build --prod --yes/);
    assert.ok(munimUntouched(w.root));
    assert.ok(!existsSync(join(w.root, ".run")), "a dry run writes nothing");
  });

  test("refuses while VERCEL_ORG_ID or VERCEL_PROJECT_ID could override the link", () => {
    for (const k of ["VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
      const w = world();
      assert.equal(w.run([], { [k]: "x" }), 1);
      assert.equal(w.calls.length, 0);
      assert.ok(w.err.join().includes(k));
    }
  });

  test("first run, both projects: create, configure, link, check, deploy; origin recorded; the repo root's .vercel is never used", () => {
    const w = world();
    assert.equal(w.run([]), 0, w.err.join("\n"));
    assert.deepEqual(lines(w.calls), [
      "vercel whoami --non-interactive",
      `node ${join(w.root, "deploy/vercel/build.mjs")} --out ${w.outDir}`,
      "vercel project inspect munim-api --non-interactive",
      "vercel project add munim-api --non-interactive",
      "vercel project update munim-api --node-version 24.x --yes --non-interactive",
      "vercel link --yes --project munim-api --non-interactive",
      "vercel deploy --prod --regions bom1 --yes --non-interactive",
      "vercel api /v9/projects/munim-api/domains --raw --non-interactive",
      "git rev-parse --verify HEAD^{commit}",
      "git status --porcelain",
      `git worktree add --detach ${w.shadow} 0123456789abcdef0123456789abcdef01234567`,
      "vercel project inspect munim-cobnut --non-interactive",
      "vercel project add munim-cobnut --non-interactive",
      "vercel project update munim-cobnut --root-directory apps/web --framework nextjs --node-version 22.x --yes --non-interactive",
      "vercel link --yes --project munim-cobnut --non-interactive",
      "pnpm install --frozen-lockfile",
      "vercel pull --yes --environment=production --non-interactive",
      "vercel build --prod --yes --non-interactive",
      "vercel deploy --prebuilt --prod --regions bom1 --yes --non-interactive",
    ]);
    for (const c of w.calls.filter((x) => x.cmd === "vercel")) {
      assert.notEqual(resolve(c.cwd), resolve(w.root), `vercel ${c.args[0]} ran in the repo root`);
      assert.notEqual(resolve(c.cwd), resolve(w.root, "apps/site"));
    }
    assert.deepEqual(w.calls.filter((c) => c.cmd === "vercel" && c.args[0] === "deploy").map((c) => c.cwd), [w.outDir, w.shadow]);
    assert.ok(w.calls.every((c) => c.env.CI === "1"), "CI=1 for every child");
    assert.equal(readFileSync(join(w.root, ".run", "vercel", "api-origin"), "utf8"), "https://munim-api.vercel.app\n");
    assert.ok(!existsSync(join(w.shadow, ".vercel", ".env.production.local")), "the pulled env is removed after the build");
    assert.ok(munimUntouched(w.root));
    assert.ok(w.out.some((l) => l.includes("deploying commit 012345678") && l.includes("2 uncommitted")));
  });

  test("second run: already linked, so only the deploys run; --apply-settings re-applies settings", () => {
    const w = world();
    w.link(w.outDir, "munim-api");
    mkdirSync(w.shadow, { recursive: true });
    w.link(w.shadow, "munim-cobnut");
    assert.equal(w.run(["--project", "munim-api"]), 0, w.err.join("\n"));
    assert.deepEqual(lines(w.calls).filter((l) => l.startsWith("vercel") && !l.startsWith("vercel whoami")), [
      "vercel deploy --prod --regions bom1 --yes --non-interactive",
      "vercel api /v9/projects/munim-api/domains --raw --non-interactive",
    ]);
    w.calls.length = 0;
    assert.equal(w.run(["--project=munim-api", "--apply-settings"]), 0);
    assert.ok(lines(w.calls).includes("vercel project update munim-api --node-version 24.x --yes --non-interactive"));
    assert.ok(!lines(w.calls).some((l) => l.startsWith("vercel project add") || l.startsWith("vercel link")));
  });

  test("an existing shadow checkout is moved to the ref, not recreated", () => {
    const w = world();
    mkdirSync(w.shadow, { recursive: true });
    w.link(w.shadow, "munim-cobnut");
    assert.equal(w.run(["--project", "munim-cobnut", "--ref", "v1"]), 0, w.err.join("\n"));
    const l = lines(w.calls);
    assert.ok(l.includes("git rev-parse --verify v1^{commit}"));
    assert.ok(l.includes("git checkout --detach --force 0123456789abcdef0123456789abcdef01234567"));
    assert.ok(!l.some((x) => x.startsWith("git worktree add")));
  });

  test("a shadow directory that is not a worktree of this repo is refused", () => {
    const w = world({ foreignShadow: true });
    mkdirSync(w.shadow, { recursive: true });
    assert.equal(w.run(["--project", "munim-cobnut"]), 1);
    assert.match(w.err.join(), /not a worktree of this repository/);
    assert.ok(!lines(w.calls).some((l) => l.includes("--prod") || l.startsWith("git checkout")));
  });

  for (const [what, project] of [["munim-api", "out"], ["munim-cobnut", "shadow"]] as const) {
    test(`${what}: a directory linked to another project is refused before any --prod`, () => {
      const w = world();
      const dir = project === "out" ? w.outDir : w.shadow;
      mkdirSync(dir, { recursive: true });
      w.link(dir, "munim");
      assert.equal(w.run(["--project", what]), 1);
      assert.match(w.err.join(), new RegExp(`linked to munim, expected ${what}`));
      assert.ok(!lines(w.calls).some((l) => l.startsWith("vercel deploy")), "no deploy was attempted");
    });
  }

  test("a link with no recorded name is refused", () => {
    const w = world();
    mkdirSync(join(w.outDir, ".vercel"), { recursive: true });
    writeFileSync(join(w.outDir, ".vercel", "project.json"), JSON.stringify({ projectId: "p", orgId: "o" }));
    assert.equal(w.run(["--project", "munim-api"]), 1);
    assert.match(w.err.join(), /no recorded name/);
    assert.ok(!lines(w.calls).some((l) => l.startsWith("vercel deploy")));
  });

  test("a link command that lands on the wrong project is caught before the deploy", () => {
    const w = world({ exists: true, linkAs: "munim" });
    assert.equal(w.run(["--project", "munim-api"]), 1);
    assert.match(w.err.join(), /expected munim-api/);
    assert.ok(!lines(w.calls).some((l) => l.startsWith("vercel deploy")));
  });

  test("--setup-only creates and links but deploys nothing", () => {
    const w = world();
    assert.equal(w.run(["--setup-only"]), 0);
    const l = lines(w.calls);
    assert.ok(l.includes("vercel link --yes --project munim-api --non-interactive") && l.includes("vercel link --yes --project munim-cobnut --non-interactive"));
    assert.ok(!l.some((x) => x.startsWith("vercel deploy") || x.startsWith("vercel build") || x.startsWith("vercel pull") || x.startsWith("pnpm")));
  });

  test("a project is never created by `vercel link` alone: an existing project skips add", () => {
    const w = world({ exists: true });
    assert.equal(w.run(["--project", "munim-api", "--setup-only"]), 0);
    assert.ok(!lines(w.calls).some((x) => x.startsWith("vercel project add")));
    assert.ok(!lines(w.calls).some((x) => x.startsWith("vercel project update")), "settings only on creation or --apply-settings");
  });

  test("a failing deploy stops with the step named, and records no origin", () => {
    const w = world({ failOn: "vercel deploy" });
    assert.equal(w.run(["--project", "munim-api"]), 1);
    assert.match(w.err.join(), /the munim-api production deploy failed \(vercel exited 1\)/);
    assert.ok(!existsSync(join(w.root, ".run")));
  });

  test("an unreadable domain list is a warning, not a failure", () => {
    const w = world({ domains: "not json" });
    assert.equal(w.run(["--project", "munim-api"]), 0);
    assert.match(w.err.join(), /could not read munim-api's production domain/);
  });

  test("a changed origin is called out", () => {
    const w = world();
    mkdirSync(join(w.root, ".run", "vercel"), { recursive: true });
    writeFileSync(join(w.root, ".run", "vercel", "api-origin"), "https://old.vercel.app\n");
    w.run(["--project", "munim-api"]);
    assert.ok(w.out.some((l) => l.includes("it changed: run env-setup.ts again")));
  });

  test("the login check failing stops everything", () => {
    const w = world({ failOn: "vercel whoami" });
    assert.equal(w.run([]), 1);
    assert.equal(w.calls.length, 1);
  });

  for (const bad of [["--bogus"], ["--project=nope"], ["--project"], ["--project", "--dry-run"], ["--dry-run=1"], ["--ref"], ["--ref=-rf"], ["--setup-only", "--setup-only"], ["both"]]) {
    test(`usage error, exit 2: ${bad.join(" ")}`, () => {
      const w = world();
      assert.equal(w.run(bad), 2);
      assert.equal(w.calls.length, 0);
    });
  }
});
