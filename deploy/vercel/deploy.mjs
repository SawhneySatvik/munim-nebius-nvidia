// Deploys munim-api and munim-cobnut with the already-logged-in Vercel CLI (R57). The orchestrator runs it; nothing
// asks a question and a re-run is safe.
//   node deploy/vercel/deploy.mjs [--project munim-api|munim-cobnut|both] [--ref <git rev>] [--setup-only]
//                                 [--apply-settings] [--dry-run]
//   --setup-only      create, configure and link the projects; deploy nothing (run this before env-setup.ts)
//   --apply-settings  re-apply the project settings below to a project that already exists
//   --dry-run         print every command in order and run none (no git, no build, no vercel)
//   --ref             munim-cobnut deploys this commit (default HEAD) from a shadow checkout; uncommitted files stay out
//
// munim-api: stage ~/.cache/munim-deploy/api-out (build.mjs --out, from the working tree), then `vercel deploy --prod` from there.
// munim-cobnut: gotcha 38 wants the deploy rooted at the repo root with `rootDirectory: apps/web`, and the repo root's
//   `.vercel/` belongs to project `munim` (apps/site). So the root is never used: a `git worktree` of --ref under
//   ~/.cache/munim-deploy/cobnut-src carries its own link, and pull / build --prod / deploy --prebuilt --prod run there.
// Guards: no VERCEL_ORG_ID / VERCEL_PROJECT_ID in the environment (they override a link); a project is created with
//   `vercel project add`, never by `vercel link` (link creates a missing project AND connects the repo's Git remote, which
//   would build on every push); the linked project's name is compared to the expected one before every --prod.
// Region bom1 (R56 G-5) is passed to both deploys. Exit codes: 0 done, 1 failed, 2 usage.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REGION = "bom1";
const PROJECTS = {
  // README: Node 24.x (type stripping at run time); the framework preset is left alone (see the report on `services`).
  "munim-api": { settings: ["--node-version", "24.x"] },
  // The build runs on this machine, so the project's Node setting follows what `vercel build` is run with.
  "munim-cobnut": { settings: ["--root-directory", "apps/web", "--framework", "nextjs", "--node-version", "22.x"] },
};

class Usage extends Error {}
class Refuse extends Error {}

export function parseArgs(argv) {
  const valued = new Set(["project", "ref"]);
  const bare = new Set(["setup-only", "apply-settings", "dry-run"]);
  const got = new Map();
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(argv[i]);
    if (!m) throw new Usage(`unexpected argument '${argv[i]}'`);
    const [, flag, inline] = m;
    if (!valued.has(flag) && !bare.has(flag)) throw new Usage(`unknown flag '--${flag}'`);
    if (got.has(flag)) throw new Usage(`--${flag} given twice`);
    if (bare.has(flag)) {
      if (inline !== undefined) throw new Usage(`--${flag} takes no value`);
      got.set(flag, true);
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === "" || (inline === undefined && value.startsWith("--"))) throw new Usage(`--${flag} needs a value`);
    got.set(flag, value);
  }
  const project = got.get("project") ?? "both";
  if (project !== "both" && !(project in PROJECTS)) throw new Usage("--project must be munim-api, munim-cobnut or both");
  const ref = got.get("ref") ?? "HEAD";
  if (ref.startsWith("-")) throw new Usage("--ref must be a git revision");
  return { project, ref, setupOnly: got.has("setup-only"), applySettings: got.has("apply-settings"), dryRun: got.has("dry-run") };
}

const USAGE = "usage: node deploy/vercel/deploy.mjs [--project munim-api|munim-cobnut|both] [--ref <git rev>] [--setup-only] [--apply-settings] [--dry-run]";

function realExec(cmd, args, { cwd, env, capture }) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", maxBuffer: 64 << 20, stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"] });
  return { status: r.error ? null : r.status, stdout: r.stdout ?? "" };
}

/** The `.vercel/project.json` link of a directory, or null when it has none. */
function linkOf(dir) {
  const file = join(dir, ".vercel", "project.json");
  if (!existsSync(file)) return null;
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return { name: typeof j.projectName === "string" ? j.projectName : null };
  } catch {
    return { name: null };
  }
}

/**
 * @param {{argv: string[], root: string, shadow?: string, apiOut?: string, env?: Record<string,string|undefined>,
 *   exec?: typeof realExec, out?: (l: string) => void, err?: (l: string) => void}} o
 */
export function main(o) {
  const out = o.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = o.err ?? ((l) => process.stderr.write(`${l}\n`));
  let args;
  try {
    args = parseArgs(o.argv);
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    err(`deploy: ${e.message}`);
    err(USAGE);
    return 2;
  }
  const root = resolve(o.root);
  const exec = o.exec ?? realExec;
  const dry = args.dryRun;
  // Staged outside the repo: run anywhere under deploy/vercel, CLI 60.1.3 resolves the project folder to deploy/vercel
  // itself (gotcha 39), links that folder and uploads it. Outside the repo there is no parent to climb to.
  const outDir = o.apiOut ?? join(homedir(), ".cache", "munim-deploy", "api-out");
  const shadow = o.shadow ?? join(homedir(), ".cache", "munim-deploy", "cobnut-src");
  const env = { ...(o.env ?? process.env), CI: "1" };

  /** Print a command; run it unless this is a dry run. (No vercel call uses the repo root: the test asserts every cwd.) */
  const sh = (cwd, cmd, argv, { capture = false } = {}) => {
    const full = cmd === "vercel" ? [...argv, "--non-interactive"] : argv;
    out(`$ ${cwd === root ? "" : `(in ${relative(root, cwd).startsWith("..") ? cwd : relative(root, cwd)}) `}${cmd} ${full.join(" ")}`);
    if (dry) return { status: 0, stdout: "" };
    return exec(cmd, full, { cwd, env, capture });
  };
  const must = (cwd, cmd, argv, what, opts) => {
    const r = sh(cwd, cmd, argv, opts);
    if (r.status !== 0) throw new Refuse(`${what} failed (${cmd} exited ${r.status ?? "without a status"})`);
    return r;
  };

  /** Refuse unless `dir` is linked to exactly `name`. */
  const assertLinked = (dir, name) => {
    const l = linkOf(dir);
    if (!l && dry) return;
    if (!l || l.name !== name) {
      throw new Refuse(`refusing to deploy: ${dir} is linked to ${l ? (l.name ?? "a project with no recorded name") : "nothing"}, expected ${name}. Delete ${join(dir, ".vercel")} and re-run to link it again.`);
    }
  };

  /** Create (never via `link`), configure and link the project, once. */
  const provision = (name, dir) => {
    const link = linkOf(dir);
    if (link && link.name !== name) assertLinked(dir, name);
    let settings = args.applySettings;
    if (!link) {
      out(`${name}: not linked here yet`);
      const exists = sh(dir, "vercel", ["project", "inspect", name], { capture: true }).status === 0;
      if (!exists || dry) {
        if (dry) out("  (dry run: the next two steps run only if the project does not exist yet)");
        must(dir, "vercel", ["project", "add", name], `creating project ${name}`);
        settings = true;
      }
    }
    if (settings) must(dir, "vercel", ["project", "update", name, ...PROJECTS[name].settings, "--yes"], `configuring project ${name}`);
    if (!link) {
      must(dir, "vercel", ["link", "--yes", "--project", name], `linking ${name}`);
      if (!dry) assertLinked(dir, name);
    }
  };

  const recordOrigin = () => {
    if (dry) return out(`(then: read munim-api's production domain with 'vercel api /v9/projects/munim-api/domains' and write it to .run/vercel/api-origin for env-setup.ts)`);
    const r = sh(outDir, "vercel", ["api", "/v9/projects/munim-api/domains", "--raw"], { capture: true });
    let domain = null;
    try {
      const text = r.stdout;
      const json = JSON.parse(text.slice(text.indexOf("{")));
      domain = (json.domains ?? []).find((d) => typeof d.name === "string" && d.name.endsWith(".vercel.app") && !d.redirect && !d.gitBranch)?.name ?? null;
    } catch {
      domain = null;
    }
    if (!domain) return err("warning: could not read munim-api's production domain; write it (https://<domain>) to .run/vercel/api-origin by hand, or pass --api-origin to env-setup.ts");
    const dir = join(root, ".run", "vercel");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, "api-origin");
    const before = existsSync(file) ? readFileSync(file, "utf8").trim() : null;
    writeFileSync(file, `https://${domain}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    out(`recorded munim-api's production origin in .run/vercel/api-origin: https://${domain}`);
    if (before !== null && before !== `https://${domain}`) out("  it changed: run env-setup.ts again, then redeploy both projects");
  };

  const api = () => {
    out("== munim-api (stages the working tree, not a commit)");
    must(root, "node", [join(root, "deploy", "vercel", "build.mjs"), "--out", outDir], `staging ${outDir}`);
    provision("munim-api", outDir);
    if (args.setupOnly) return;
    assertLinked(outDir, "munim-api");
    must(outDir, "vercel", ["deploy", "--prod", "--regions", REGION, "--yes"], "the munim-api production deploy");
    recordOrigin();
  };

  const cobnut = () => {
    out("== munim-cobnut (a committed ref, deployed from a shadow checkout; the repo root's .vercel/ is not touched)");
    let sha = `<${args.ref}>`;
    if (!dry) {
      sha = must(root, "git", ["rev-parse", "--verify", `${args.ref}^{commit}`], `resolving ${args.ref}`, { capture: true }).stdout.trim();
      const dirty = sh(root, "git", ["status", "--porcelain"], { capture: true }).stdout.split("\n").filter(Boolean).length;
      out(`munim-cobnut: deploying commit ${sha.slice(0, 9)}${dirty ? ` (${dirty} uncommitted path(s) are NOT in it)` : ""}`);
    }
    if (existsSync(shadow)) {
      if (!dry) {
        const common = sh(shadow, "git", ["rev-parse", "--git-common-dir"], { capture: true }).stdout.trim();
        if (!common || realpathSync(resolve(shadow, common)) !== realpathSync(join(root, ".git"))) {
          throw new Refuse(`${shadow} exists but is not a worktree of this repository; remove it (rm -rf ${shadow}; git worktree prune) and re-run`);
        }
      }
      must(shadow, "git", ["checkout", "--detach", "--force", sha], `checking out ${sha.slice(0, 9)} in the shadow checkout`);
    } else {
      if (!dry) mkdirSync(resolve(shadow, ".."), { recursive: true });
      must(root, "git", ["worktree", "add", "--detach", shadow, sha], "creating the shadow checkout");
    }
    provision("munim-cobnut", shadow);
    if (args.setupOnly) return;
    must(shadow, "pnpm", ["install", "--frozen-lockfile"], "installing dependencies (CI=1 makes pnpm refuse to rewrite the lockfile)");
    must(shadow, "vercel", ["pull", "--yes", "--environment=production"], "pulling the project settings and env");
    must(shadow, "vercel", ["build", "--prod", "--yes"], "the munim-cobnut build");
    if (!dry) rmSync(join(shadow, ".vercel", ".env.production.local"), { force: true }); // no pulled env left at rest
    assertLinked(shadow, "munim-cobnut");
    must(shadow, "vercel", ["deploy", "--prebuilt", "--prod", "--regions", REGION, "--yes"], "the munim-cobnut production deploy");
  };

  try {
    const idEnv = ["VERCEL_ORG_ID", "VERCEL_PROJECT_ID"].filter((k) => env[k]);
    if (idEnv.length) throw new Refuse(`${idEnv.join(" and ")} set in the environment: they override the project link. Unset them and re-run.`);
    if (dry) out("deploy (dry run): these commands would run, in this order; none is run");
    else must(join(root, "deploy", "vercel"), "vercel", ["whoami"], "checking the Vercel login (is `vercel` on PATH and logged in?)", { capture: true });
    if (args.project !== "munim-cobnut") api();
    if (args.project !== "munim-api") cobnut();
    out(dry ? "deploy (dry run): done" : args.setupOnly ? "deploy: projects ready. Next: node deploy/vercel/env-setup.ts, then node deploy/vercel/deploy.mjs" : "deploy: done. Monitor: Vercel dashboard > the project > Deployments / Logs, or `vercel ls --cwd <dir>` / `vercel logs <url>`");
    return 0;
  } catch (e) {
    if (!(e instanceof Refuse)) throw e;
    err(`deploy: FAIL — ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ argv: process.argv.slice(2), root: resolve(import.meta.dirname, "../..") });
}
