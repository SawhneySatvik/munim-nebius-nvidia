// Usage: node docs/kit/check-refs.mjs [docs-dir]   (default: the folder this script is in)
// Asserts that every `/v1/...` path (and every `METHOD path` pair) in the markdown exists in the OpenAPI file, that every
// reason code listed under a "Reason code" table header exists in reason-codes.ts, that every code under an "Error code"
// header exists in error.ts, and that relative .md links resolve. Floors stop it passing when it matched nothing.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const docsDir = resolve(process.argv[2] ?? here);

const openapi = JSON.parse(readFileSync(join(repo, "packages/contracts/generated/openapi/public.json"), "utf8"));
const norm = (p) => p.replaceAll(/\{[^}]*\}/g, "{}");
const ops = new Map(); // normalised path -> Set of upper-case methods
for (const [p, v] of Object.entries(openapi.paths)) ops.set(norm(p), new Set(Object.keys(v).map((m) => m.toUpperCase())));

const strip = (s) => s.replaceAll(/\/\/[^\n]*/g, "");
const reasonSrc = strip(readFileSync(join(repo, "packages/contracts/src/shared/reason-codes.ts"), "utf8"));
const reasonCodes = new Set();
for (const m of reasonSrc.matchAll(/export const \w*_REASON_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/g))
  for (const s of m[1].matchAll(/"([a-z_]+)"/g)) reasonCodes.add(s[1]);
const errSrc = strip(readFileSync(join(repo, "packages/contracts/src/shared/error.ts"), "utf8"));
const errorCodes = new Set([...(errSrc.match(/ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));

const files = readdirSync(docsDir).filter((f) => f.endsWith(".md"));
const problems = [];
const seenPaths = new Set();
const seenPairs = new Set();
const seenReasons = new Set();
const seenErrors = new Set();

const PATH = String.raw`\/v1\/[A-Za-z0-9_\-\/{}:.]*`;
const clean = (t) => t.replace(/[.:,)]+$/, "");

for (const f of files) {
  const raw = readFileSync(join(docsDir, f), "utf8");
  const text = raw.replaceAll(/\$\{[^}]*\}/g, "{}"); // template literals: `${id}` -> `{}`
  const where = (p) => `${f}: ${p}`;

  const exists = (path) => {
    if (path === "/v1") return true;
    if (ops.has(norm(path))) return true;
    return path.endsWith("/") && [...ops.keys()].some((k) => k.startsWith(path)); // a prefix such as `/v1/cares-network/*`
  };

  for (const m of text.matchAll(new RegExp(PATH, "g"))) {
    const p = clean(m[0]);
    seenPaths.add(p);
    if (!exists(p)) problems.push(where(`unknown path ${p}`));
  }
  const pair = (method, p) => {
    p = clean(p);
    seenPairs.add(`${method} ${p}`);
    const methods = ops.get(norm(p));
    if (methods && !methods.has(method)) problems.push(where(`${method} ${p} is not an operation (has ${[...methods].join(",")})`));
  };
  for (const m of text.matchAll(new RegExp(String.raw`\b(GET|POST)\s+\`?(${PATH})`, "g"))) pair(m[1], m[2]);
  for (const m of text.matchAll(new RegExp(String.raw`\.(GET|POST)\(\s*"(${PATH})"`, "g"))) pair(m[1], m[2]);

  // Tables: the first cell of rows under a "Reason code" / "Error code" header.
  let kind = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("|")) { kind = null; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const head = cells[0]?.toLowerCase();
    if (head === "reason code" || head === "error code") { kind = head; continue; }
    if (!kind || /^:?-+:?$/.test(cells[0] ?? "")) continue;
    for (const t of (cells[0] ?? "").matchAll(/`([^`]+)`/g)) {
      const code = t[1];
      if (kind === "reason code") {
        seenReasons.add(code);
        if (!reasonCodes.has(code)) problems.push(where(`unknown reason code ${code}`));
      } else {
        seenErrors.add(code);
        if (!errorCodes.has(code)) problems.push(where(`unknown error code ${code}`));
      }
    }
  }

  for (const m of raw.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g))
    if (!m[1].startsWith("http") && !existsSync(join(docsDir, m[1]))) problems.push(where(`broken link ${m[1]}`));
}

const floor = (name, got, min) => { if (got < min) problems.push(`floor: ${name} ${got} < ${min} (matched too little to mean anything)`); };
floor("markdown files", files.length, 6);
floor("distinct /v1 paths", seenPaths.size, 15);
floor("METHOD path pairs", seenPairs.size, 6);
floor("reason codes", seenReasons.size, 12);
floor("error codes", seenErrors.size, 6);
floor("reason codes known to reason-codes.ts", reasonCodes.size, 50);
floor("operations in public.json", ops.size, 200);

console.log(`files=${files.length} paths=${seenPaths.size} pairs=${seenPairs.size} reason_codes=${seenReasons.size} error_codes=${seenErrors.size} (known: ${reasonCodes.size} reason, ${errorCodes.size} error, ${ops.size} openapi paths)`);
if (problems.length) {
  console.error(problems.map((p) => `FAIL ${p}`).join("\n"));
  process.exit(1);
}
console.log("OK");
