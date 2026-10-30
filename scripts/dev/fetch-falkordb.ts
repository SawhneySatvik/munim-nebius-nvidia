// `make falkordb-fetch`: the FalkorDB test server every graph gate starts (adapters/falkordb/test/harness.ts), fetched once into
// `.run/falkordb/<platform>/` (git-ignored; binaries are never committed). The default is the falkordblite 0.10.0 wheel from PyPI:
// unzipped, never pip-installed. It carries Redis 8.6.2, the FalkorDB 4.18.3 module and its own OpenSSL, which the module loads
// from beside it (`@loader_path/../.dylibs` on macOS, `falkordblite.libs` on Linux), so the layout is kept as it is in the wheel.
// FALKORDB_TEST_VERSION=4.22.1 also fetches the official v4.22.1 module (GitHub release) to run on the wheel's Redis; on macOS that
// module links Homebrew's openssl@3 by absolute path.
// Every file is checked against the sha256 pinned below, the cached copy too on every run: a mismatch refuses (exit 1) and
// nothing is extracted. Full digests from PyPI's JSON API and GitHub's release asset digests (16 Oct 2026); the macOS wheel and
// module were also hashed locally in the F1 spike. Linux: UNVERIFIED (never run here).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const PLATFORM = `${process.platform}-${process.arch}`;
const DIR = join(ROOT, ".run", "falkordb", PLATFORM);

const PYPI = "https://files.pythonhosted.org/packages";
const MAC_WHEEL = { url: `${PYPI}/0e/43/39d8cf13964784447676d24f0cefa3bdc99c10e647c71e6a4172d302dcac/falkordblite-0.10.0-cp312-cp312-macosx_10_13_x86_64.macosx_15_0_arm64.whl`, sha256: "741fda166170513db1815d5369870e47d44da2e9b85320fddbc50c88a7338d51" };
const WHEELS: Record<string, { url: string; sha256: string }> = {
  "darwin-arm64": MAC_WHEEL,
  "darwin-x64": MAC_WHEEL,
  "linux-x64": { url: `${PYPI}/8a/5e/d343c5249bd24c6614e8c1b718a73bb9f68beb2cf90464bc51c9436d25af/falkordblite-0.10.0-cp312-cp312-manylinux_2_39_x86_64.whl`, sha256: "ee9659bd0c7cdf0c2532977f2ec8bf1d1ab01cb3b6776e50c67046481f3162c7" },
  "linux-arm64": { url: `${PYPI}/61/17/3ec180ca7c2e79a0c3e9912ac04b446e733745cd944845fe4306be016efd/falkordblite-0.10.0-cp312-cp312-manylinux_2_39_aarch64.whl`, sha256: "bfe1f47ae03decdc0ad111ec82606bac82ee6cdd7fea04cbcff1283608cc2d2e" },
};
const RELEASE = "https://github.com/FalkorDB/FalkorDB/releases/download/v4.22.1";
const MODULES_4_22_1: Record<string, { url: string; sha256: string }> = {
  "darwin-arm64": { url: `${RELEASE}/falkordb-macos-arm64v8.so`, sha256: "38a10b7942f234837bae3218ff0ebe446acf0603a9ae1ceb066e6f28534cfd77" },
  "linux-x64": { url: `${RELEASE}/falkordb-x64.so`, sha256: "84ff87446c8c2b4506f32baf675e607512f2a16f1b49e40fab26f505209a0335" },
  "linux-arm64": { url: `${RELEASE}/falkordb-arm64v8.so`, sha256: "38e6adc20d98ca6481ca427ec776eca23753d89077e609ea40d3c711a1e6bd99" },
};

const fail = (msg: string): never => {
  console.error(`falkordb-fetch: FAIL — ${msg}`);
  process.exit(1);
};
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** The file at `dest`, downloaded when absent, its sha256 checked either way. */
async function fetchPinned(pin: { url: string; sha256: string }, dest: string): Promise<void> {
  if (!existsSync(dest)) {
    console.log(`falkordb-fetch: downloading ${pin.url}`);
    let body: Buffer | undefined;
    for (let attempt = 1; attempt <= 3 && !body; attempt++) {
      try {
        const res = await fetch(pin.url, { redirect: "follow" });
        if (!res.ok) fail(`download refused: HTTP ${res.status} for ${pin.url}`);
        body = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        console.error(`falkordb-fetch: download attempt ${attempt} failed (${(e as Error).name}: ${(e as Error).message})`);
      }
    }
    if (!body) fail(`could not download ${pin.url}`);
    const part = `${dest}.part`;
    writeFileSync(part, body!);
    const got = sha256(part);
    if (got !== pin.sha256) {
      rmSync(part, { force: true });
      fail(`sha256 mismatch for ${pin.url}: got ${got}, pinned ${pin.sha256}; nothing kept`);
    }
    renameSync(part, dest);
  }
  const got = sha256(dest);
  if (got !== pin.sha256) fail(`sha256 mismatch for ${dest}: got ${got}, pinned ${pin.sha256}; delete it and run make falkordb-fetch again`);
}

const testVersion = process.env.FALKORDB_TEST_VERSION ?? "4.18.3";
if (testVersion !== "4.18.3" && testVersion !== "4.22.1") fail("FALKORDB_TEST_VERSION must be 4.18.3 (the wheel's, default) or 4.22.1");
const wheelPin = WHEELS[PLATFORM] ?? fail(`no pinned falkordblite wheel for ${PLATFORM} (pinned: ${Object.keys(WHEELS).join(", ")})`);
mkdirSync(DIR, { recursive: true });
const wheel = join(DIR, "falkordblite-0.10.0.whl");
await fetchPinned(wheelPin, wheel);
// Only the server, the module and the libraries they load; the Python package is not needed. Extracted once per verified wheel
// (the stamp holds its sha256), so a cached run (make test calls this first) touches nothing.
const bin = join(DIR, "redislite", "bin");
const stamp = join(DIR, ".extracted");
const extracted = existsSync(stamp) && readFileSync(stamp, "utf8").trim() === wheelPin.sha256
  && ["redis-server", "redis-cli", "falkordb.so"].every((f) => existsSync(join(bin, f)));
if (!extracted) {
  rmSync(stamp, { force: true });
  rmSync(join(DIR, "redislite"), { recursive: true, force: true });
  rmSync(join(DIR, "falkordblite.libs"), { recursive: true, force: true });
  execFileSync("unzip", ["-o", "-q", wheel, "redislite/bin/*", ...(process.platform === "darwin" ? ["redislite/.dylibs/*"] : ["falkordblite.libs/*"]), "-d", DIR], { stdio: "inherit" });
  for (const f of ["redis-server", "redis-cli", "falkordb.so"]) {
    if (!existsSync(join(bin, f))) fail(`the wheel has no redislite/bin/${f}`);
    chmodSync(join(bin, f), 0o755);
  }
}
const version = execFileSync(join(bin, "redis-server"), ["--version"], { encoding: "utf8" }).trim();
if (!/v=8\.6\.2\b/.test(version)) fail(`unexpected redis-server: ${version}`);
if (!extracted) writeFileSync(stamp, `${wheelPin.sha256}\n`);
console.log(`falkordb-fetch: ${PLATFORM}: Redis 8.6.2 + FalkorDB 4.18.3 in ${bin}${extracted ? " (cached)" : ""}`);

if (testVersion === "4.22.1") {
  const pin = MODULES_4_22_1[PLATFORM] ?? fail(`no pinned v4.22.1 module for ${PLATFORM}`);
  const so = join(DIR, "falkordb-4.22.1.so");
  await fetchPinned(pin, so);
  chmodSync(so, 0o755);
  console.log(`falkordb-fetch: ${PLATFORM}: FalkorDB 4.22.1 module at ${so}`);
}
