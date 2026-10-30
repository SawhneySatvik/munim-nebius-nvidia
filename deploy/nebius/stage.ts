// Stages (and, with --deploy, ships) the Nebius demo's Vercel pair from a clean worktree of a commit (R77; gotcha 42: never the
// working tree). New projects only: munim-nebius-api and munim-nebius-web, region bom1, uploads as one tarball (gotcha 43).
//   node deploy/nebius/stage.ts [--ref <git rev>] [--reference <path>] [--dry-run] [--setup-only] [--deploy]
//   --reference   the existing demos' settings file for the guard (default <repo root>/.env; a worktree has none)
//   (default)     guard, resolve the commit, create/refresh the worktree, `pnpm install --frozen-lockfile`, stage the api with the
//                 commit's own deploy/vercel/build.mjs. Makes no Vercel call and no database connection.
//   --dry-run     print every command in order and run none (the guard's verdict is printed, not enforced, so the plan can be read
//                 before .env.nebius exists)
//   --setup-only  with --deploy: create, configure and link the two projects; deploy nothing (run the env step after this)
//   --deploy      also the Vercel steps. The orchestrator runs this; it is network. Every `--prod` is preceded by a check that the
//                 directory is linked to exactly the expected munim-nebius-* project (gotcha 39 wrote files on `link`).
// Exit codes: 0 done, 1 refused or failed, 2 usage.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILE, check, nebiusName, profileEnv } from "./guard.ts";

class Usage extends Error {}
class Refuse extends Error {}

export function parseArgs(argv: readonly string[]) {
  const got = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(argv[i]!);
    if (!m) throw new Usage(`unexpected argument '${argv[i]}'`);
    const [, flag, inline] = m as unknown as [string, string, string | undefined];
    if (!["ref", "reference", "dry-run", "setup-only", "deploy"].includes(flag)) throw new Usage(`unknown flag '--${flag}'`);
    if (got.has(flag)) throw new Usage(`--${flag} given twice`);
    if (flag === "ref" || flag === "reference") {
      const v = inline ?? argv[++i];
      if (!v || v.startsWith("-")) throw new Usage(flag === "ref" ? "--ref needs a git revision" : "--reference needs a path");
      got.set(flag, v);
    } else {
      if (inline !== undefined) throw new Usage(`--${flag} takes no value`);
      got.set(flag, true);
    }
  }
  if (got.has("setup-only") && !got.has("deploy")) throw new Usage("--setup-only goes with --deploy");
  return { ref: (got.get("ref") as string | undefined) ?? "HEAD", reference: got.get("reference") as string | undefined, dry: got.has("dry-run"), setupOnly: got.has("setup-only"), deploy: got.has("deploy") };
}

interface Exec { (cmd: string, args: string[], o: { cwd: string; env: Record<string, string>; capture: boolean }): { status: number | null; stdout: string } }
const realExec: Exec = (cmd, args, { cwd, env, capture }) => {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", maxBuffer: 64 << 20, stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"] });
  return { status: r.error ? null : r.status, stdout: r.stdout ?? "" };
};

function linkedTo(dir: string): string | null {
  const f = join(dir, ".vercel", "project.json");
  if (!existsSync(f)) return null;
  try { const n = (JSON.parse(readFileSync(f, "utf8")) as { projectName?: unknown }).projectName; return typeof n === "string" ? n : ""; } catch { return ""; }
}

export function main(o: { argv: readonly string[]; root: string; cache?: string; env?: Record<string, string | undefined>; exec?: Exec; out?: (l: string) => void; err?: (l: string) => void }): number {
  const out = o.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = o.err ?? ((l) => process.stderr.write(`${l}\n`));
  let a: ReturnType<typeof parseArgs>;
  try { a = parseArgs(o.argv); } catch (e) {
    if (!(e instanceof Usage)) throw e;
    err(`nebius stage: ${e.message}`);
    err("usage: node deploy/nebius/stage.ts [--ref <git rev>] [--reference <path>] [--dry-run] [--setup-only] [--deploy]");
    return 2;
  }
  const root = resolve(o.root), cache = o.cache ?? join(homedir(), ".cache", "munim-nebius");
  const shadow = join(cache, "src"), apiOut = join(cache, "api-out");
  const exec = o.exec ?? realExec;
  // The guarded environment: Nebius settings only, CI=1 so pnpm refuses to rewrite the lockfile.
  const env = { ...profileEnv(root, o.env ?? process.env), CI: "1" };
  const shown = (p: string) => (relative(root, p).startsWith("..") ? p : relative(root, p) || ".");
  const sh = (cwd: string, cmd: string, argv: string[], capture = false) => {
    const full = cmd === "vercel" ? [...argv, "--non-interactive"] : argv;
    out(`$ (in ${shown(cwd)}) ${cmd} ${full.join(" ")}`);
    return a.dry ? { status: 0, stdout: "" } : exec(cmd, full, { cwd, env, capture });
  };
  const must = (cwd: string, cmd: string, argv: string[], what: string, capture = false) => {
    const r = sh(cwd, cmd, argv, capture);
    if (r.status !== 0) throw new Refuse(`${what} failed (${cmd} exited ${r.status ?? "without a status"})`);
    return r;
  };
  const assertLinked = (dir: string, name: string) => {
    if (a.dry) return;
    const got = linkedTo(dir);
    if (got !== name) throw new Refuse(`${dir} is linked to ${got ?? "nothing"}, expected ${name}; delete its .vercel and re-run`);
  };
  const vercelProject = (dir: string, name: string, settings: string[]) => {
    const bad = nebiusName(name);
    if (bad) throw new Refuse(bad);
    if (a.dry || linkedTo(dir) === null) {
      must(dir, "vercel", ["project", "add", name], `creating ${name}`);
      must(dir, "vercel", ["project", "update", name, ...settings, "--yes"], `configuring ${name}`);
      must(dir, "vercel", ["link", "--yes", "--project", name], `linking ${name}`);
      // gotcha 39: link can write a .env.local holding a VERCEL_OIDC_TOKEN (here, or in the parent it climbed to). Deleted unread.
      if (!a.dry) for (const d of [dir, dirname(dir)]) rmSync(join(d, ".env.local"), { force: true });
    }
    assertLinked(dir, name);
  };

  try {
    if (Object.keys(o.env ?? process.env).some((k) => k === "VERCEL_ORG_ID" || k === "VERCEL_PROJECT_ID") && a.deploy) throw new Refuse("VERCEL_ORG_ID / VERCEL_PROJECT_ID are set; they override a project link. Unset them.");
    const problems = check({ root, env, names: [PROFILE.web, PROFILE.api], ...(a.reference !== undefined ? { reference: a.reference } : {}) });
    for (const p of problems) (a.dry ? out : err)(`nebius guard: ${a.dry ? "WOULD REFUSE" : "REFUSED"} — ${p}`);
    if (problems.length && !a.dry) return 1;
    if (!problems.length) out(`nebius guard: OK (reference: ${basename(resolve(root, a.reference ?? ".env"))})`);
    if (a.dry) out("nebius stage (dry run): these commands would run, in this order; none is run");

    const sha = a.dry ? `<${a.ref}>` : must(root, "git", ["rev-parse", "--verify", `${a.ref}^{commit}`], `resolving ${a.ref}`, true).stdout.trim();
    if (a.dry) out(`$ (in .) git rev-parse --verify ${a.ref}^{commit}`);
    if (existsSync(shadow)) {
      if (!a.dry) {
        const common = exec("git", ["rev-parse", "--git-common-dir"], { cwd: shadow, env, capture: true }).stdout.trim();
        if (!common || realpathSync(resolve(shadow, common)) !== realpathSync(join(root, ".git"))) throw new Refuse(`${shadow} exists but is not a worktree of this repository; remove it and \`git worktree prune\``);
      }
      must(shadow, "git", ["checkout", "--detach", "--force", sha], "refreshing the worktree");
    } else must(root, "git", ["worktree", "add", "--detach", shadow, sha], "creating the clean worktree");
    must(shadow, "pnpm", ["install", "--frozen-lockfile"], "installing dependencies");
    must(shadow, "node", [join(shadow, "deploy", "vercel", "build.mjs"), "--out", apiOut], `staging ${shown(apiOut)}`);
    if (!a.deploy) return (out(a.dry ? "nebius stage (dry run): done" : `nebius stage: staged ${shown(apiOut)} from ${sha.slice(0, 9)}. No Vercel call was made.`), 0);

    out("== munim-nebius-api");
    vercelProject(apiOut, PROFILE.api, ["--node-version", "24.x"]);
    out("== munim-nebius-web");
    vercelProject(shadow, PROFILE.web, ["--root-directory", "apps/web", "--framework", "nextjs", "--node-version", "22.x"]);
    if (a.setupOnly) return (out("nebius stage: projects ready. Next: the environment step (docs/nebius/DEPLOY.md), then run again with --deploy only."), 0);
    assertLinked(apiOut, PROFILE.api);
    must(apiOut, "vercel", ["deploy", "--prod", "--regions", PROFILE.region, "--archive=tgz", "--yes"], "the api production deploy");
    assertLinked(shadow, PROFILE.web);
    try {
      must(shadow, "vercel", ["pull", "--yes", "--environment=production"], "pulling the web project's env");
      must(shadow, "vercel", ["build", "--prod", "--yes"], "the web build");
    } finally {
      if (!a.dry) rmSync(join(shadow, ".vercel", ".env.production.local"), { force: true }); // no pulled env left at rest, even after a failed build
    }
    must(shadow, "vercel", ["deploy", "--prebuilt", "--prod", "--regions", PROFILE.region, "--archive=tgz", "--yes"], "the web production deploy");
    out(a.dry ? "nebius stage (dry run): done" : "nebius stage: deployed.");
    return 0;
  } catch (e) {
    if (!(e instanceof Refuse)) throw e;
    err(`nebius stage: FAIL — ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ argv: process.argv.slice(2), root: resolve(import.meta.dirname, "../..") });
}
