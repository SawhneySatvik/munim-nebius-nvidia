// A small Markdown parser for the kit guides (docs/kit/*.md). It produces a tree that components/Markdown.tsx turns
// into React elements — never an HTML string — so raw HTML in a guide (`<script>`, `<img onerror>`) is shown as text
// (gotcha 15). Covers what the guides use: headings, paragraphs, fenced code, lists (nested), block quotes, tables,
// rules, and inline code, strong, emphasis, links and autolinks. Link targets pass an allow-list (`safeHref`).

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string | null; c: Inline[] }
  | { t: "br" };

export type Align = "left" | "center" | "right" | null;
export type Block =
  | { t: "h"; level: number; id: string; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "code"; lang: string; v: string }
  | { t: "list"; ordered: boolean; start: number; items: Block[][] }
  | { t: "quote"; c: Block[] }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

/** Maps a relative link (`storefront.md#menu`) to a site path, or null to render it as plain text. */
export type Resolve = (relative: string) => string | null;

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** GitHub-style heading anchors (the guides link to them): lower-case, punctuation dropped, each space a hyphen —
 *  so "5 · API calls per step" is "5--api-calls-per-step". */
export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-") || "section"
  );
}

export function plainText(c: Inline[]): string {
  return c.map((i) => (i.t === "text" || i.t === "code" ? i.v : i.t === "br" ? " " : plainText(i.c))).join("");
}

/** Only http(s), mailto, in-page anchors and site-absolute paths survive; relative paths go through `resolve`. */
export function safeHref(raw: string, resolve: Resolve): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href === "") return null;
  return resolve(href);
}

const noResolve: Resolve = () => null;

export function parseMarkdown(src: string, resolve: Resolve = noResolve): Block[] {
  const ids = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugify(text);
    const n = ids.get(base) ?? 0;
    ids.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
  return blocks(src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"), resolve, uniqueId);
}

function blocks(lines: string[], resolve: Resolve, uniqueId: (t: string) => string): Block[] {
  const out: Block[] = [];
  let i = 0;
  const startsBlock = (l: string, next: string | undefined) =>
    FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || ITEM.test(l) || (l.includes("|") && next !== undefined && TABLE_SEP.test(next) && next.includes("-"));

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(marker)) body.push(lines[i++]!);
      i++; // closing fence (or end of file)
      out.push({ t: "code", lang: fence[2] ?? "", v: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const c = inline(heading[2]!, resolve);
      out.push({ t: "h", level: heading[1]!.length, id: uniqueId(plainText(c)), c });
      i++;
      continue;
    }
    if (HR.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== "") {
        const q = QUOTE.exec(lines[i]!);
        body.push(q ? q[1]! : lines[i]!);
        i++;
      }
      out.push({ t: "quote", c: blocks(body, resolve, uniqueId) });
      continue;
    }
    const next = lines[i + 1];
    if (line.includes("|") && next !== undefined && TABLE_SEP.test(next) && next.includes("-")) {
      const cells = (l: string) => splitRow(l).map((c) => inline(c, resolve));
      const align = splitRow(next).map((c): Align => {
        const s = c.trim();
        return s.startsWith(":") && s.endsWith(":") ? "center" : s.endsWith(":") ? "right" : s.startsWith(":") ? "left" : null;
      });
      const head = cells(line);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") rows.push(cells(lines[i++]!));
      out.push({ t: "table", align, head, rows });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      const indent = item[1]!.length;
      const ordered = /\d/.test(item[2]!);
      const start = ordered ? Number.parseInt(item[2]!, 10) : 1;
      const items: Block[][] = [];
      while (i < lines.length) {
        const m = ITEM.exec(lines[i]!);
        if (!m || m[1]!.length !== indent || /\d/.test(m[2]!) !== ordered) break;
        const contentIndent = m[1]!.length + m[2]!.length + 1;
        const body = [m[3]!];
        i++;
        // Continuation: indented lines (nested lists, wrapped text), and blank lines followed by indented lines.
        while (i < lines.length) {
          const l = lines[i]!;
          if (l.trim() === "") {
            const after = lines[i + 1];
            if (after !== undefined && after.trim() !== "" && indentOf(after) > indent) {
              body.push("");
              i++;
              continue;
            }
            break;
          }
          if (indentOf(l) > indent) body.push(l.slice(Math.min(indentOf(l), contentIndent)));
          else if (!startsBlock(l, lines[i + 1])) body.push(l.trim()); // lazy paragraph continuation
          else break;
          i++;
        }
        items.push(blocks(body, resolve, uniqueId));
      }
      out.push({ t: "list", ordered, start, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && (para.length === 0 || !startsBlock(lines[i]!, lines[i + 1]))) para.push(lines[i++]!);
    out.push({ t: "p", c: inline(para.join("\n"), resolve) });
  }
  return out;
}

function indentOf(l: string): number {
  return l.length - l.trimStart().length;
}

function splitRow(l: string): string[] {
  let s = l.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]!;
    if (ch === "\\" && s[k + 1] === "|") {
      cur += "|";
      k++;
    } else if (ch === "`") {
      inCode = !inCode;
      cur += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const PUNCT = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;

export function inline(src: string, resolve: Resolve = noResolve): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\" && src[i + 1] === "\n") {
      flush();
      out.push({ t: "br" });
      i += 2;
      continue;
    }
    if (ch === "\\" && i + 1 < src.length && PUNCT.test(src[i + 1]!)) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      if (text.endsWith("  ")) {
        text = text.replace(/ +$/, "");
        flush();
        out.push({ t: "br" });
      } else text += " ";
      i++;
      continue;
    }
    if (ch === "`") {
      const run = /^`+/.exec(src.slice(i))![0];
      const end = src.indexOf(run, i + run.length);
      if (end !== -1) {
        flush();
        out.push({ t: "code", v: src.slice(i + run.length, end).replace(/\n/g, " ").replace(/^ (.+) $/, "$1") });
        i = end + run.length;
        continue;
      }
      text += run;
      i += run.length;
      continue;
    }
    if (ch === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(src.slice(i));
      if (auto) {
        flush();
        out.push({ t: "link", href: safeHref(auto[1]!, resolve), c: [{ t: "text", v: auto[1]!.replace(/^mailto:/i, "") }] });
        i += auto[0].length;
        continue;
      }
      text += ch; // any other "<" is literal text: raw HTML is never interpreted
      i++;
      continue;
    }
    if (ch === "!" && src[i + 1] === "[") {
      const link = linkAt(src, i + 1);
      if (link) {
        text += link.label; // images are not loaded from guides; the alt text stands in
        i = link.end;
        continue;
      }
    }
    if (ch === "[") {
      const link = linkAt(src, i);
      if (link) {
        flush();
        out.push({ t: "link", href: safeHref(link.url, resolve), c: inline(link.label, resolve) });
        i = link.end;
        continue;
      }
    }
    if (ch === "*" || ch === "_") {
      const double = src[i + 1] === ch;
      const delim = double ? ch + ch : ch;
      const prev = src[i - 1];
      const leftOk = ch === "*" || prev === undefined || !WORD.test(prev);
      const opensOk = i + delim.length < src.length && !/\s/.test(src[i + delim.length]!);
      if (leftOk && opensOk) {
        const close = findClose(src, i + delim.length, delim, ch);
        if (close !== -1) {
          flush();
          const c = inline(src.slice(i + delim.length, close), resolve);
          out.push(double ? { t: "strong", c } : { t: "em", c });
          i = close + delim.length;
          continue;
        }
      }
      text += delim;
      i += delim.length;
      continue;
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

function findClose(src: string, from: number, delim: string, ch: string): number {
  let k = from;
  while (k < src.length) {
    const at = src.indexOf(delim, k);
    if (at === -1) return -1;
    const before = src[at - 1]!;
    const after = src[at + delim.length];
    const single = delim.length === 1 && (src[at + 1] === ch || src[at - 1] === ch);
    const rightOk = ch === "*" || after === undefined || !WORD.test(after);
    if (at > from && !/\s/.test(before) && rightOk && !single) return at;
    k = at + delim.length;
  }
  return -1;
}

function linkAt(src: string, open: number): { label: string; url: string; end: number } | null {
  let depth = 0;
  let k = open;
  for (; k < src.length; k++) {
    if (src[k] === "\\") {
      k++;
      continue;
    }
    if (src[k] === "[") depth++;
    else if (src[k] === "]" && --depth === 0) break;
  }
  if (k >= src.length || src[k + 1] !== "(") return null;
  const close = src.indexOf(")", k + 2);
  if (close === -1) return null;
  const url = src
    .slice(k + 2, close)
    .trim()
    .replace(/\s+"[^"]*"$/, "")
    .replace(/^<(.*)>$/, "$1");
  return { label: src.slice(open + 1, k), url, end: close + 1 };
}
