// Gate d: tools/worldgen/src holds no SQL client and reaches nothing but the public SDK (and core-domain's tz module).
// Everything it knows about the system comes back over HTTP. The scan reads whole files (an import may span lines)
// and is an allow-list for non-relative specifiers: node builtins (never child_process), @munim/sdk, the tz module.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export interface Violation { file: string; line: number; text: string; rule: string }

/** Any `from "x"`, `import "x"`, `import("x")`, `require("x")` — across newlines. Group 2 is the specifier. */
const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*(["'`])([^"'`\n]*)\1/g;
/** `import(` whose argument does not start with a quote. Group 1 = template prefix up to `${`, if any. */
const DYNAMIC_NON_LITERAL = /\bimport\s*\(\s*(?!["'])(?:`([^`$]*)\$\{)?/g;
const ALLOWED_BARE = new Set(["@munim/sdk", "@munim/core-domain/tz"]);
const TEXT_RULES: Array<[string, RegExp]> = [
  ["sql statement", /\b(INSERT\s+INTO|DELETE\s+FROM|SELECT\s+[\w*,."\s]+\s+FROM|UPDATE\s+[\w."]+\s+SET|CREATE\s+TABLE)\b/],
  ["client construction", /\bnew\s+(?:\w+\.)?(Pool|Client)\s*\(/],
  [".query( call", /\.query\s*\(/],
  ["connection string", /postgres(?:ql)?:\/\//],
  ["database env var", /\b(DATABASE_URL|MUNIM_DB_URL_[A-Z]+|[A-Z_]*CONNECTION_STRING|MUNIM_DATABASE_URL)\b/],
  ["child_process", /\bchild_process\b/],
  ["psql", /\bpsql\b/],
  ["require( call", /\brequire\s*\(/],
  ["createRequire", /\bcreateRequire\b/],
];

export function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
}

const REPO = resolve(import.meta.dirname, "../../..");
/** Relative imports may land inside the scanned tree, on the SDK, or on core-domain's tz module — nowhere else. */
const allowedTarget = (target: string, dir: string): boolean =>
  [dir, join(REPO, "packages/sdk"), join(REPO, "packages/core-domain/tz")].some((a) => target === a || target.startsWith(a + sep));

/** Comments blanked out (same offsets) so prose like "from `a` to `b`" is not read as an import. */
const blankComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\/|(?<![:"'`\\])\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, " "));

/** Every relative specifier in a file (static, dynamic, side-effect and require forms; comments ignored). */
export const relativeSpecifiers = (text: string): string[] => [...blankComments(text).matchAll(SPECIFIER)].map((m) => m[2]!).filter((x) => x.startsWith("."));

const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length;

export function scan(dir: string): { scanned: number; violations: Violation[] } {
  const violations: Violation[] = [];
  const fs = files(dir);
  for (const file of fs) {
    const text = readFileSync(file, "utf8");
    const code = blankComments(text);
    const lines = text.split("\n");
    const add = (index: number, rule: string) => violations.push({ file, line: lineOf(text, index), text: lines[lineOf(text, index) - 1]!.trim(), rule });
    for (const m of code.matchAll(SPECIFIER)) {
      const spec = m[2]!;
      if (m[1] === "`" && spec.includes("$")) continue; // template: judged by the dynamic-import rule
      const ok = spec.startsWith(".") ? allowedTarget(resolve(dirname(file), spec), resolve(dir)) : spec.startsWith("node:") ? spec !== "node:child_process" : ALLOWED_BARE.has(spec);
      if (!ok) add(m.index!, `import of ${spec}`);
    }
    for (const m of code.matchAll(DYNAMIC_NON_LITERAL)) {
      const prefix = m[1];
      // A template with a static relative prefix (`./worlds/${name}.ts`) stays inside the tree; anything else is opaque.
      if (prefix !== undefined && prefix.startsWith(".") && allowedTarget(resolve(dirname(file), prefix), resolve(dir))) continue;
      add(m.index!, "dynamic import with a non-literal specifier");
    }
    for (const [rule, re] of TEXT_RULES) {
      const g = new RegExp(re.source, "g");
      for (const m of code.matchAll(g)) add(m.index!, rule);
    }
  }
  return { scanned: fs.length, violations };
}
