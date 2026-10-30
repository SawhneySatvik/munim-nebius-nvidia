// Installs the packed SDK tarball into a temp dir, type-checks src/main.ts against its .d.ts, scans the example's
// imports, then runs it there. Usage: node scripts/run.mjs [path/to/munim-sdk.tgz]   (default: the website download)
// Env: MUNIM_API_URL, MUNIM_STOREFRONT_KEY, MUNIM_WAIT_S (see src/main.ts). Exit code is the example's.
import { execFileSync, spawnSync } from "node:child_process";
import { builtinModules } from "node:module";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tgz = resolve(process.argv[2] ?? join(here, "../../apps/site/public/downloads/munim-sdk.tgz"));
const source = process.env.MUNIM_EXAMPLE_SRC ? resolve(process.env.MUNIM_EXAMPLE_SRC) : join(here, "src/main.ts"); // red-proof seam

// Dependency scan: the example may import only @munim/sdk and Node built-ins.
const text = readFileSync(source, "utf8");
const specs = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)].map((m) => m[1]);
const allowed = (s) => s === "@munim/sdk" || (s.startsWith("node:") && builtinModules.includes(s.slice(5)));
const bad = specs.filter((s) => !allowed(s));
if (specs.length === 0 || !specs.includes("@munim/sdk")) throw new Error(`dependency scan found no @munim/sdk import (saw: ${specs.join(", ")})`);
if (bad.length) {
  console.error(`dependency scan FAILED: ${bad.join(", ")}`);
  process.exit(1);
}
console.log(`dependency scan OK: ${specs.join(", ")}`);

const dir = mkdtempSync(join(tmpdir(), "storefront-min-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "scratch", private: true, type: "module" }));
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tgz], { cwd: dir, stdio: "inherit" });
  cpSync(source, join(dir, "main.ts"));
  // Type-check against the tarball's .d.ts, the way a consumer's editor would.
  if (process.env.MUNIM_SKIP_TSC !== "1") {
    const tsc = process.env.MUNIM_TSC;
    if (!tsc) throw new Error("set MUNIM_TSC to a tsc entry (e.g. packages/sdk/node_modules/typescript/bin/tsc) or MUNIM_SKIP_TSC=1");
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, types: ["node"], typeRoots: [process.env.MUNIM_TYPE_ROOTS ?? ""].filter(Boolean) }, files: ["main.ts"] }));
    execFileSync(process.execPath, [tsc, "-p", dir], { stdio: "inherit" });
    console.log("typecheck OK (against the tarball's .d.ts)");
  }
  const r = spawnSync(process.execPath, ["main.ts"], { cwd: dir, stdio: "inherit", env: process.env });
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
