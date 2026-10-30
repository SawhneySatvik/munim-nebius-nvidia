// The kit guides are Markdown files under docs/kit/ (authored in that folder, not here). They are read while
// prerendering; a slug is the file's path under docs/kit without ".md" or a numeric prefix. An empty or missing
// folder is a valid state: the guides page says the guides have not landed yet.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { type Block, parseMarkdown, plainText } from "./markdown.ts";
import { KIT_DOCS, repoRoot } from "./repo.ts";

export type Guide = { slug: string; title: string; summary: string; blocks: Block[] };

export const GUIDES_BASE = "/developers/guides";

function kitDir(root: string): string {
  return join(root, ...KIT_DOCS);
}

function listMarkdown(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      if (e.name.startsWith(".")) return [];
      if (e.isDirectory()) return listMarkdown(join(dir, e.name), `${prefix}${e.name}/`);
      return e.isFile() && e.name.toLowerCase().endsWith(".md") ? [`${prefix}${e.name}`] : [];
    });
}

// Reading order: a numeric file prefix ("20-storefront-spice-route.md") wins; otherwise start-here, storefront
// guides, everything else, errors, changelog. The prefix is dropped from the URL.
function rank(file: string): number {
  const n = /^(\d+)-/.exec(file.split("/").pop()!);
  if (n) return Number(n[1]);
  const s = file.toLowerCase();
  if (/(^|\/)(readme|index|getting-started|start|quickstart)/.test(s)) return 5;
  if (/storefront|spice|laneway/.test(s)) return 25;
  if (/error/.test(s)) return 85;
  if (/changelog/.test(s)) return 95;
  return 50;
}

export function slugOf(file: string): string {
  return file
    .replace(/\.md$/i, "")
    .split("/")
    .map((seg) => seg.replace(/^\d+-/, ""))
    .join("/");
}

/** A link inside a guide: `20-storefront.md#x` → `/developers/guides/storefront#x`; anything outside docs/kit, or not
 *  a guide, renders as text (the reader has the website, not the repository). */
export function guideResolver(file: string, known: Set<string>) {
  return (relative: string): string | null => {
    const [target = "", hash] = relative.split("#", 2);
    const anchor = hash ? `#${hash}` : "";
    if (target === "") return anchor || null;
    const path = posix.normalize(posix.join(posix.dirname(file), target));
    if (path.startsWith("..") || !known.has(path)) return null;
    return `${GUIDES_BASE}/${slugOf(path)}${anchor}`;
  };
}

/** One Markdown file outside docs/kit (the mock API's README). Its relative links render as text. */
export function loadMarkdownFile(...parts: string[]): Block[] | null {
  const path = join(repoRoot(), ...parts);
  return existsSync(path) ? parseMarkdown(readFileSync(path, "utf8")) : null;
}

export function loadGuides(root: string = repoRoot()): Guide[] {
  const dir = kitDir(root);
  const files = listMarkdown(dir).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const known = new Set(files);
  return files.map((file): Guide => {
    const blocks = parseMarkdown(readFileSync(join(dir, file), "utf8"), guideResolver(file, known));
    const h1 = blocks.find((b) => b.t === "h" && b.level === 1);
    const firstP = blocks.find((b) => b.t === "p");
    const slug = slugOf(file);
    const title = h1 && h1.t === "h" ? plainText(h1.c) : slug.split("/").pop()!.replace(/[-_]/g, " ");
    const summary = firstP && firstP.t === "p" ? plainText(firstP.c).slice(0, 200) : "";
    // The page prints the title itself; drop the duplicate leading h1.
    return { slug, title, summary, blocks: h1 ? blocks.filter((b) => b !== h1) : blocks };
  });
}
