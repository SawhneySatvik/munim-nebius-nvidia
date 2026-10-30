// Stages deploy/vercel/out/: one self-contained directory the founder deploys as the munim-api project
// (README.md). Nothing here runs on Vercel; Vercel installs nothing for core (its node_modules is staged) and
// installs intel's and suppliers-sim's locked requirements.txt itself.
//   node deploy/vercel/build.mjs [--out <dir>]
// Layout inside each service root mirrors the repo, because the services find files by repo-relative paths
// (core-api: modules/<m>/index.ts, contracts' registry, graph/*.sql; intel: parents[4]/packages/contracts/…).
// core's third-party packages are copied as real files into one flat node_modules; workspace packages are
// relative symlinks to their staged copies, so Node resolves them outside node_modules and strips their
// types (Node refuses type stripping under node_modules). An existing out/.vercel (the project link) is kept.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, "../..");
const args = process.argv.slice(2);
let out = join(HERE, "out");
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") out = resolve(args[++i] ?? "");
  else if (a.startsWith("--out=")) out = resolve(a.slice(6));
  else throw new Error(`build: unknown argument '${a}'`);
}
if (!out || out === ROOT || ROOT.startsWith(out)) throw new Error("build: --out must be a fresh directory outside the repo root");

// Keep the founder's project link across rebuilds.
const link = join(out, ".vercel");
const keep = existsSync(link) ? join(dirname(out), `.vercel-keep-${process.pid}`) : null;
if (keep) renameSync(link, keep);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
if (keep) renameSync(keep, link);

const SKIP = /(^|\/)(node_modules|test|tests|__pycache__|\.venv|\.pytest_cache|\.mypy_cache|\.ruff_cache)(\/|$)|\.test\.ts$|(^|\/)vitest\.config\.ts$|(^|\/)tsconfig[^/]*\.json$/;
const copyTree = (from, to) => cpSync(join(ROOT, from), to, { recursive: true, filter: (src) => !SKIP.test(relative(ROOT, src)) });

// ---- core (core-api + the worker's jobs behind the tick route) -------------------------------------
const core = join(out, "core");
// Workspace packages core-api loads at runtime, at their repo paths (adapters/dev: the IdP and blob store the dev mapping
// builds from this deployment's Supabase names).
const WORKSPACE = ["services/core-api", "services/core-worker", "packages/config", "packages/contracts", "packages/core-domain",
  "adapters/dev/idp-supabase", "adapters/dev/blob-supabase", "adapters/gcp"];
// The graph adapter packages/config finds by path when MUNIM_GRAPH names it (R68): staged whenever this checkout has it, so the
// deployment switches its graph backend by environment alone (MUNIM_GRAPH, MUNIM_FALKORDB_URL). The Cup export has neither.
if (existsSync(join(ROOT, "adapters/falkordb/package.json"))) WORKSPACE.push("adapters/falkordb");
const byName = new Map();
for (const p of WORKSPACE) {
  copyTree(p, join(core, p));
  byName.set(JSON.parse(readFileSync(join(ROOT, p, "package.json"), "utf8")).name, p);
}
// The dev mapping packages/config loads when it is present (T-122), and the "type": "module" its folder needs. Not packages.
copyTree("adapters/dev/env", join(core, "adapters/dev/env"));
cpSync(join(ROOT, "adapters/dev/package.json"), join(core, "adapters/dev/package.json"));

/** The directory Node would load `name` from when required inside `fromDir` (the real repo's pnpm layout). */
function locate(name, fromDir) {
  for (let d = fromDir; ; d = dirname(d)) {
    const c = join(d, "node_modules", name);
    if (existsSync(join(c, "package.json"))) return realpathSync(c);
    if (d === dirname(d)) throw new Error(`build: cannot resolve ${name} from ${relative(ROOT, fromDir)}`);
  }
}
const pkgOf = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
const runtimeDeps = (pkg) => ({ ...pkg.dependencies, ...pkg.optionalDependencies });

const flat = new Map(); // name -> version hoisted into core/node_modules
function stageThirdParty(name, fromDir, intoNodeModules) {
  const src = locate(name, fromDir);
  const { version } = pkgOf(src);
  const hoisted = flat.get(name);
  let dest;
  if (hoisted === undefined) {
    flat.set(name, version);
    dest = join(core, "node_modules", name);
  } else if (hoisted === version) {
    return;
  } else {
    dest = join(intoNodeModules, name); // a second version: nested beside its dependent
    if (existsSync(dest)) return;
  }
  cpSync(src, dest, { recursive: true, dereference: true, filter: (s) => !/(^|\/)node_modules(\/|$)/.test(relative(src, s)) });
  for (const dep of Object.keys(runtimeDeps(pkgOf(src)))) {
    try {
      stageThirdParty(dep, src, join(dest, "node_modules"));
    } catch (e) {
      if (!(pkgOf(src).optionalDependencies ?? {})[dep]) throw e; // an optional dependency pnpm did not install
    }
  }
}

for (const p of WORKSPACE) {
  for (const dep of Object.keys(runtimeDeps(pkgOf(join(ROOT, p))))) {
    const ws = byName.get(dep);
    if (ws) {
      const at = join(core, p, "node_modules", dep);
      mkdirSync(dirname(at), { recursive: true });
      symlinkSync(relative(dirname(at), join(core, ws)), at);
    } else if (dep.startsWith("@munim/")) {
      throw new Error(`build: ${p} depends on ${dep}, which is not staged (add it to WORKSPACE)`);
    } else {
      stageThirdParty(dep, join(ROOT, p), join(core, "node_modules"));
    }
  }
}
writeFileSync(join(core, "package.json"), `${JSON.stringify({ private: true, type: "module", engines: { node: "24.x" } }, null, 2)}\n`);
cpSync(join(HERE, "core", "index.mjs"), join(core, "index.mjs"));

// ---- intel and suppliers-sim (Python; Vercel installs requirements.txt) ----------------------------
function requirements(pkg) {
  return execFileSync("uv", ["export", "--locked", "--package", pkg, "--no-dev", "--no-emit-workspace", "--no-hashes", "--no-header", "--quiet"],
    { cwd: ROOT, encoding: "utf8" });
}
const intel = join(out, "intel");
copyTree("services/intel/munim_intel", join(intel, "services/intel/munim_intel"));
copyTree("services/intel/fixtures", join(intel, "services/intel/fixtures"));
// intel reads these by repo-relative path (tools/grammar.py, negotiate/grammar.py, tools/ontology.py).
for (const f of ["packages/contracts/src/shared/grammar/number-words.json", "packages/contracts/generated/ontology.json"]) {
  mkdirSync(dirname(join(intel, f)), { recursive: true });
  cpSync(join(ROOT, f), join(intel, f));
}
writeFileSync(join(intel, "requirements.txt"), requirements("munim-intel"));
cpSync(join(HERE, "intel", "index.py"), join(intel, "index.py"));

const sim = join(out, "suppliers");
copyTree("services/suppliers-sim/suppliers_sim", join(sim, "services/suppliers-sim/suppliers_sim"));
writeFileSync(join(sim, "requirements.txt"), requirements("munim-suppliers-sim"));
cpSync(join(HERE, "suppliers", "index.py"), join(sim, "index.py"));
for (const d of [intel, sim]) writeFileSync(join(d, ".python-version"), "3.12\n");

cpSync(join(HERE, "vercel.json"), join(out, "vercel.json"));
// The CLI leaves node_modules out of an upload by default (its built-in ignore list); core's staged node_modules must go up.
writeFileSync(join(out, ".vercelignore"), "!node_modules\n");

// A staged symlink that points outside out/ would deploy as a dangling link.
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  const s = lstatSync(p);
  return s.isSymbolicLink() ? [p] : s.isDirectory() && n !== ".vercel" ? walk(p) : [];
});
for (const l of walk(out)) {
  if (relative(out, realpathSync(l)).startsWith("..")) throw new Error(`build: ${relative(out, l)} links outside the staged directory`);
}
console.log(`build: staged ${relative(ROOT, out) || out} — core: ${WORKSPACE.length} workspace packages, ${flat.size} third-party packages (${[...flat.keys()].sort().join(", ")}); intel and suppliers-sim requirements locked from uv.lock`);
