// Gate for deploy/nebius/stage.ts. The process boundary is a recording exec; files are real, in a temp tree.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { main } from "../stage.ts";

const tmp: string[] = [];
after(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });
const settings = (ref: string) => `SUPABASE_PROJECT_ID=${ref}\nSUPABASE_SESSION_POOLER_CONNECTION_STRING=postgresql://postgres.${ref}:pw-${ref}@pool.example.test:5432/postgres\n`;

type Hook = (cmd: string, args: string[], o: { cwd: string }) => { status: number | null; stdout: string } | void;
function world(nebiusRef: string, hook?: Hook) {
  const dir = mkdtempSync(join(tmpdir(), "nbd-stage-"));
  tmp.push(dir);
  const root = join(dir, "repo");
  mkdirSync(join(root, ".git"), { recursive: true });
  writeFileSync(join(root, ".env.nebius"), settings(nebiusRef));
  writeFileSync(join(root, ".env"), settings("existingref002"));
  const calls: Array<{ cmd: string; args: string[]; cwd: string; env: Record<string, string> }> = [];
  const exec = (cmd: string, args: string[], o: { cwd: string; env: Record<string, string> }) => {
    calls.push({ cmd, args, cwd: o.cwd, env: o.env });
    const hooked = hook?.(cmd, args, o);
    if (hooked) return hooked;
    if (cmd === "git" && args[0] === "rev-parse") return { status: 0, stdout: "a".repeat(40) + "\n" };
    if (cmd === "vercel" && args[0] === "link") { // what link records
      const name = args[args.indexOf("--project") + 1]!;
      mkdirSync(join(o.cwd, ".vercel"), { recursive: true });
      writeFileSync(join(o.cwd, ".vercel", "project.json"), JSON.stringify({ projectName: name }));
    }
    return { status: 0, stdout: "" };
  };
  return { root, cache: join(dir, "cache"), calls, exec, run: (argv: string[], env = { PATH: "/bin" }) => {
    const errs: string[] = [], outs: string[] = [];
    const code = main({ argv, root, cache: join(dir, "cache"), exec, env, out: (l) => outs.push(l), err: (l) => errs.push(l) });
    return { code, errs, outs };
  } };
}

describe("nebius stage", () => {
  test("refuses before any command when the profile resolves to the existing project", () => {
    const w = world("existingref002");
    assert.equal(w.run(["--deploy"]).code, 1);
    assert.equal(w.calls.length, 0);
  });

  test("staging only: git, pnpm, build; no vercel; env carries the Nebius file and no inherited Supabase settings", () => {
    const w = world("nebiusref0001");
    const r = w.run([], { PATH: "/bin", SUPABASE_PROJECT_ID: "existingref002" });
    assert.equal(r.code, 0, r.errs.join("\n"));
    assert.deepEqual(w.calls.map((c) => c.cmd), ["git", "git", "pnpm", "node"]);
    for (const c of w.calls) { assert.equal(c.env.MUNIM_ENV_FILE, join(w.root, ".env.nebius")); assert.equal(c.env.SUPABASE_PROJECT_ID, undefined); }
  });

  test("--deploy: only munim-nebius-* projects, bom1, tgz archive, never a project name outside the profile", () => {
    const w = world("nebiusref0001");
    const r = w.run(["--deploy"]);
    assert.equal(r.code, 0, r.errs.join("\n"));
    const v = w.calls.filter((c) => c.cmd === "vercel");
    assert.ok(v.length >= 10);
    for (const c of v) for (const t of c.args) if (/^munim(-|$)/.test(t)) assert.match(t, /^munim-nebius-(api|web)$/);
    for (const d of v.filter((c) => c.args.includes("deploy"))) { assert.ok(d.args.includes("--archive=tgz")); assert.equal(d.args[d.args.indexOf("--regions") + 1], "bom1"); }
    assert.equal(v.filter((c) => c.args.includes("--prod") && c.args[0] === "deploy" || c.args.includes("--prebuilt")).length, 2);
  });

  test("a link that lands on another project stops before the deploy", () => {
    const w = world("nebiusref0001");
    const base = w.exec;
    const r = main({ argv: ["--deploy"], root: w.root, cache: w.cache, env: { PATH: "/bin" }, out: () => {}, err: () => {},
      exec: (cmd, args, o) => { const res = base(cmd, args, o); if (cmd === "vercel" && args[0] === "link") writeFileSync(join(o.cwd, ".vercel", "project.json"), JSON.stringify({ projectName: "munim-api" })); return res; } });
    assert.equal(r, 1);
    assert.ok(!w.calls.some((c) => c.cmd === "vercel" && c.args[0] === "deploy"));
  });

  test("--dry-run runs nothing and prints the plan; usage errors exit 2", () => {
    const w = world("nebiusref0001");
    const r = w.run(["--deploy", "--dry-run"]);
    assert.equal(r.code, 0);
    assert.equal(w.calls.length, 0);
    assert.ok(r.outs.some((l) => l.includes("--archive=tgz")));
    for (const bad of [["--bogus"], ["--setup-only"], ["--ref"], ["--dry-run=1"]]) assert.equal(w.run(bad).code, 2, bad.join(" "));
  });

  test("D: the pulled .env.production.local is removed even when the web build fails", () => {
    const pulled = (cwd: string) => join(cwd, ".vercel", ".env.production.local");
    const w = world("nebiusref0001", (cmd, args, o) => {
      if (cmd === "vercel" && args[0] === "pull") { mkdirSync(join(o.cwd, ".vercel"), { recursive: true }); writeFileSync(pulled(o.cwd), "SECRET=x"); }
      if (cmd === "vercel" && args[0] === "build") return { status: 1, stdout: "" };
    });
    assert.equal(w.run(["--deploy"]).code, 1);
    assert.ok(w.calls.some((c) => c.cmd === "vercel" && c.args[0] === "build"), "the build did not run");
    assert.ok(!existsSync(pulled(join(w.cache, "src"))), "the pulled env was left at rest");
  });

  test("E: a .env.local written by vercel link is deleted (unread), here and in the parent; a link that lands in the parent is refused", () => {
    const w = world("nebiusref0001", (cmd, args, o) => {
      if (cmd === "vercel" && args[0] === "link") { mkdirSync(o.cwd, { recursive: true }); mkdirSync(w.cache, { recursive: true }); writeFileSync(join(o.cwd, ".env.local"), "VERCEL_OIDC_TOKEN=x"); writeFileSync(join(w.cache, ".env.local"), "VERCEL_OIDC_TOKEN=x"); }
    });
    assert.equal(w.run(["--deploy", "--setup-only"]).code, 0);
    for (const d of [join(w.cache, "api-out"), join(w.cache, "src"), w.cache]) assert.ok(!existsSync(join(d, ".env.local")), `${d}/.env.local left`);
    const lost = world("nebiusref0001", (cmd, args, o) => {
      if (cmd === "vercel" && args[0] === "link") { mkdirSync(join(o.cwd, "..", ".vercel"), { recursive: true }); writeFileSync(join(o.cwd, "..", ".vercel", "project.json"), JSON.stringify({ projectName: args[args.indexOf("--project") + 1] })); return { status: 0, stdout: "" }; }
    });
    assert.equal(lost.run(["--deploy", "--setup-only"]).code, 1);
  });

  test("--reference reaches the guard", () => {
    const w = world("nebiusref0001");
    const f = join(w.root, "demos.env");
    writeFileSync(f, settings("nebiusref0001")); // the same project as the Nebius file
    assert.equal(w.run(["--reference", f]).code, 1);
    assert.equal(w.calls.length, 0);
  });
});
