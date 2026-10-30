// Gate d (0 SQL clients in tools/worldgen/src) and the two independence rules around it.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";
import { files, relativeSpecifiers, scan } from "./no-sql.ts";

const SRC = join(import.meta.dirname, "..", "src");
const VERIFY = join(import.meta.dirname, "..", "verify");

describe("no SQL in worldgen", () => {
  test("src has 0 SQL clients and imports only the SDK and the tz module", () => {
    const { scanned, violations } = scan(SRC);
    assert.ok(scanned >= 9, `only ${scanned} files scanned — is the path right?`);
    assert.deepEqual(violations, []);
  });
  test("verify/ never imports from src/ (the recompute is independent of the generator)", () => {
    const fs = files(VERIFY);
    assert.ok(fs.length >= 2);
    for (const f of fs) {
      for (const spec of relativeSpecifiers(readFileSync(f, "utf8"))) {
        assert.ok(!resolve(dirname(f), spec).startsWith(SRC), `${f} imports ${spec} from the generator`);
      }
    }
  });
  test("RED-PROOF: the independence check sees multiline, dynamic and side-effect imports of src/", () => {
    for (const body of ['import { x } from\n  "../src/kit.ts";', 'const m = await import("../src/kit.ts");', 'import "../src/kit.ts";']) {
      assert.deepEqual(relativeSpecifiers(body), ["../src/kit.ts"], body);
      assert.ok(resolve(VERIFY, relativeSpecifiers(body)[0]!).startsWith(SRC));
    }
  });
  test("verify/ opens no database connection (read routes only)", () => {
    assert.deepEqual(scan(VERIFY).violations, []);
  });
});

// RED-PROOF (R3-M7): each way around the gate is planted in a throwaway tree and must be caught; the clean tree must pass.
// The tree lives under test/ (not os.tmpdir) so a relative SDK import resolves against the real repo layout.
describe("no-sql scan catches each bypass", () => {
  const plant = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(import.meta.dirname, ".planted-"));
    try {
      for (const [name, body] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, name)), { recursive: true });
        writeFileSync(join(dir, name), body);
      }
      return scan(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const bad: Record<string, [string, string]> = {
    "createRequire": ['import { createRequire } from "node:module";\nconst r = createRequire(import.meta.url);\nexport const x = r;\n', "createRequire"],
    "require(": ['const pg = require("pg");\nexport const x = pg;\n', "require( call"],
    "dynamic import, variable": ['export const x = async (n: string) => import(n);\n', "dynamic import with a non-literal specifier"],
    "dynamic import, template outside the tree": ['export const x = async (n: string) => import(`${n}.ts`);\n', "dynamic import with a non-literal specifier"],
    "dynamic import of pg": ['export const x = import("pg");\n', "import of pg"],
    "multiline from pg": ['import { Pool } from\n  "pg";\nexport const x = Pool;\n', "import of pg"],
    "multiline named import of @munim/db": ['import {\n  migrate,\n  other,\n} from\n  "@munim/db/migrate";\nexport const x = migrate;\n', "import of @munim/db/migrate"],
    "node:child_process": ['import { execSync } from "node:child_process";\nexport const x = execSync;\n', "child_process"],
    "psql": ['export const x = "psql -c select";\n', "psql"],
    "bare @munim/core-domain": ['import { x } from "@munim/core-domain";\nexport { x };\n', "import of @munim/core-domain"],
    "bare @munim/core-domain/money (only /tz is allowed)": ['import { x } from "@munim/core-domain/money";\nexport { x };\n', "import of @munim/core-domain/money"],
    "relative import out of the allowed trees": ['import { x } from "../../../services/core-api/src/app.ts";\nexport { x };\n', "import of ../../../services/core-api/src/app.ts"],
  };
  for (const [name, [src, rule]] of Object.entries(bad)) {
    test(`flags: ${name}`, () => {
      const r = plant({ "a.ts": src });
      assert.equal(r.scanned, 1);
      assert.ok(r.violations.some((v) => v.rule === rule), `expected '${rule}', got ${JSON.stringify(r.violations.map((v) => v.rule))}`);
    });
  }
  test("a multiline violation reports the line of its specifier statement", () => {
    const r = plant({ "a.ts": 'const a = 1;\nimport { Pool } from\n  "pg";\n' });
    assert.equal(r.violations[0]!.line, 2);
  });
  test("a clean tree passes: node builtins, the SDK (bare and relative), tz, a relative template import into the tree, prose in comments", () => {
    const r = plant({
      "a.ts": [
        'import { createHash } from "node:crypto";',
        'import { createMunimClient } from "@munim/sdk";',
        'import { createMunimClient as c2 } from "../../../../packages/sdk/src/index.ts";',
        'import { localDate } from "../../../../packages/core-domain/tz/index.ts";',
        'import { b } from "./b.ts";',
        '// Whole days from `a` to `b`, then require ( the caller ) to import ( it )',
        'export const load = async (w: string) => (await import(`./worlds/${w}.ts`)) as unknown;',
        "export { createHash, createMunimClient, c2, localDate, b };",
      ].join("\n"),
      "b.ts": "export const b = 1;\n",
    });
    assert.equal(r.scanned, 2);
    assert.deepEqual(r.violations, []);
  });
});
