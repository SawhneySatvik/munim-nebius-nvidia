// Gate: no Supabase-isms in db/migrations (02-schema §8). Green = 0 hits over all 13 files; red-proofs plant
// constructs in a temp copy (the real tree is never touched).
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { MIGRATION_FILES } from "./manifest.ts";
import { DEFAULT_DIR, FORBIDDEN, scan } from "./static-gate.ts";

const temps: string[] = [];
function copy(): string {
  const d = mkdtempSync(join(tmpdir(), "munim-static-"));
  cpSync(DEFAULT_DIR, d, { recursive: true });
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("db/migrations: 0 forbidden constructs over every migration file", () => {
  const r = scan();
  console.log(`static gate: ${r.files} files scanned, ${r.hits.length} forbidden constructs`);
  expect(r.files).toBe(MIGRATION_FILES.length);
  expect(r.hits).toEqual([]);
});

test("RED-PROOF: a planted auth.uid() → exactly 1 hit", () => {
  const d = copy();
  writeFileSync(join(d, "0099_planted.sql"), "CREATE POLICY p ON core.item USING (tenant_id = auth.uid());\n");
  const r = scan(d);
  console.log("RED-PROOF static gate:", r.hits);
  expect(r.hits.length).toBe(1);
  expect(r.hits[0]).toMatchObject({ file: "0099_planted.sql", rule: "auth schema" });
});

test("RED-PROOF: every forbidden construct and a non-allow-listed extension each count once", () => {
  const d = copy();
  const plants = [
    "SELECT auth.uid();",
    "SELECT * FROM storage.objects;",
    "SELECT extensions.uuid_generate_v4();",
    "SELECT pgmq.send('q', '{}');",
    "SELECT net.http_post('x') /* pg_net */; SELECT pg_net.x;",
    "GRANT USAGE ON SCHEMA core TO supabase_admin;",
    "SELECT graphql.resolve('{}');",
    "CREATE EXTENSION IF NOT EXISTS postgis;",
  ];
  writeFileSync(join(d, "0099_planted.sql"), plants.join("\n") + "\n-- a comment mentioning auth.uid() is not a hit\n");
  const r = scan(d);
  expect(r.hits.map((h) => h.rule)).toEqual([...FORBIDDEN.map((f) => f.rule), "extension not allowed: postgis"]);
});
