// build.mjs stages core's node_modules, and the upload must not drop it: the Vercel CLI ignores node_modules by default,
// and only the staged .vercelignore re-includes it.   node --test "deploy/vercel/test/*.test.ts"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// realpath: build.mjs compares a staged symlink's real path with --out as given, so a symlinked tmpdir (macOS /var) would trip it.
const dir = realpathSync(mkdtempSync(join(tmpdir(), "t126-build-")));
after(() => rmSync(dir, { recursive: true, force: true }));

test("the staged tree carries core's node_modules and a .vercelignore that lets it upload", () => {
  const out = join(dir, "out");
  const r = spawnSync(process.execPath, [join(import.meta.dirname, "../build.mjs"), "--out", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(out, "core", "node_modules", "hono", "package.json")), "core/node_modules/hono is staged");
  assert.ok(existsSync(join(out, "vercel.json")) && existsSync(join(out, "intel", "requirements.txt")));
  assert.equal(readFileSync(join(out, ".vercelignore"), "utf8"), "!node_modules\n");
  // R68: the graph adapter is staged with its texts and its client, never its tests (13 read and 18 write Cypher files, by hand).
  const g = join(out, "core", "adapters", "falkordb");
  assert.ok(["env.ts", "projection.sql", "src/index.ts"].every((f) => existsSync(join(g, f))), "the graph adapter is staged");
  assert.deepEqual([readdirSync(join(g, "cypher", "read")).length, readdirSync(join(g, "cypher", "write")).length], [13, 18]);
  assert.ok(existsSync(join(out, "core", "node_modules", "falkordb", "package.json")), "its client is staged");
  assert.equal(existsSync(join(g, "test")), false);
});
