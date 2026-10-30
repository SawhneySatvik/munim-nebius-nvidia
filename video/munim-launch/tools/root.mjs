// HyperFrames' check, snapshot and preview read only index.html, and lint refuses a second root-level composition, so
// the film keeps its roots in roots/ (cup, cup4, falkor, full, frames, spike, kit) and this copies the one being worked on to
// index.html (git-ignored). Paths inside a root are written from the project folder, as index.html sees them.
// Usage: node tools/root.mjs cup|cup4|falkor|full|frames|spike|kit     Edit roots/<name>.html, never index.html.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name) || !existsSync(join(ROOT, "roots", `${name}.html`))) {
  console.error("usage: node tools/root.mjs <cup|cup4|falkor|full|frames|spike|kit> (a file in roots/)");
  process.exit(2);
}
const src = readFileSync(join(ROOT, "roots", `${name}.html`), "utf8");
const banner = `<!-- GENERATED from roots/${name}.html by tools/root.mjs: edit that file, not this one. -->\n`;
writeFileSync(join(ROOT, "index.html"), src.replace(/^<!doctype html>\n/i, (d) => d + banner));
console.log(`index.html ← roots/${name}.html`);
