// Static Supabase-ism gate (R31, R35): migrations must run on any Postgres. Scans db/migrations/*.sql
// (comments stripped) for vendor-only constructs and for any CREATE EXTENSION outside the allow-list.
// CLI: `node tests/static-gate.ts [dir]` prints the count and exits 1 on any hit (or when no file is scanned).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

// btree_gist backs the non-overlap exclusion constraints (02-schema §2.3); available on Cloud SQL and
// Supabase (UNVERIFIED for the founder's hosted project until F1's 0012 run) — see db/README.md.
export const ALLOWED_EXTENSIONS = ["pgcrypto", "pg_trgm", "vector", "btree_gist"];

export const FORBIDDEN: { rule: string; re: RegExp }[] = [
  { rule: "auth schema", re: /\bauth\s*\./i },
  { rule: "storage schema", re: /\bstorage\s*\./i },
  { rule: "extensions schema", re: /\bextensions\s*\./i },
  { rule: "pgmq", re: /\bpgmq\b/i },
  { rule: "pg_net", re: /\bpg_net\b/i },
  { rule: "supabase_*", re: /\bsupabase_/i },
  { rule: "graphql", re: /graphql/i },
];

export interface Hit {
  file: string;
  line: number;
  rule: string;
  text: string;
}

/** Blanks out comments, keeping line numbers. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, "");
}

export function scan(dir: string = DEFAULT_DIR): { files: number; hits: Hit[] } {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const hits: Hit[] = [];
  for (const f of files) {
    const lines = stripComments(readFileSync(join(dir, f), "utf8")).split("\n");
    lines.forEach((text, i) => {
      for (const { rule, re } of FORBIDDEN) if (re.test(text)) hits.push({ file: f, line: i + 1, rule, text: text.trim() });
      for (const m of text.matchAll(/create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_-]+)"?/gi)) {
        if (!ALLOWED_EXTENSIONS.includes(m[1]!.toLowerCase())) {
          hits.push({ file: f, line: i + 1, rule: `extension not allowed: ${m[1]}`, text: text.trim() });
        }
      }
    });
  }
  return { files: files.length, hits };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? DEFAULT_DIR;
  const r = scan(dir);
  for (const h of r.hits) console.log(`${h.file}:${h.line} [${h.rule}] ${h.text}`);
  console.log(`static-gate: ${r.files} migration file(s) scanned, ${r.hits.length} forbidden construct(s)`);
  process.exit(r.files === 0 || r.hits.length > 0 ? 1 : 0);
}
