import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "../components/Markdown.tsx";
import { guideResolver } from "../lib/guides.ts";
import { parseMarkdown, slugify } from "../lib/markdown.ts";

const render = (md: string, resolve = guideResolver("20-guide.md", new Set(["00-start.md", "20-guide.md"]))) =>
  renderToStaticMarkup(<Markdown blocks={parseMarkdown(md, resolve)} />);

describe("raw HTML in a guide stays text (gotcha 15)", () => {
  const planted = `<script>alert("x")</script>`;
  const cases: Array<[string, string]> = [
    ["paragraph", `Hello ${planted} world`],
    ["block of html", `${planted}\n<img src=x onerror="alert(1)">`],
    ["heading", `## Title ${planted}`],
    ["list item", `- one ${planted}\n- two`],
    ["table cell", `| a | b |\n|---|---|\n| ${planted} | <b>x</b> |`],
    ["block quote", `> ${planted}`],
    ["link label", `[${planted}](https://example.com)`],
    ["code span", "`" + planted + "`"],
    ["fenced code", "```html\n" + planted + "\n```"],
  ];
  for (const [where, md] of cases)
    test(`in a ${where}`, () => {
      const html = render(md);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).toContain("&lt;script&gt;");
    });
});

describe("link targets pass an allow-list", () => {
  test.each([["javascript:alert(1)"], ["JavaScript:alert(1)"], ["data:text/html,<b>x</b>"], ["vbscript:x"], ["//evil.example/x"]])(
    "%s gets no href",
    (url) => {
      const html = render(`[click](${url})`);
      expect(html).not.toContain("href=");
      expect(html).toContain("click");
    },
  );

  test("http(s), mailto, anchors and site paths keep their href", () => {
    const html = render("[a](https://example.com/x) [b](mailto:hi@example.com) [c](#part) [d](/developers)");
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('href="mailto:hi@example.com"');
    expect(html).toContain('href="#part"');
    expect(html).toContain('href="/developers"');
  });

  test("a link to another guide becomes its site path; a file outside the kit becomes text", () => {
    const html = render("[start](00-start.md#base-urls) and [secret](../../.env) and [src](../src/x.ts)");
    expect(html).toContain('href="/developers/guides/start#base-urls"');
    expect(html).not.toContain(".env");
    expect(html).not.toContain("href=\"../");
  });
});

describe("the parser covers what the guides use", () => {
  test("GitHub-style heading anchors", () => {
    expect(slugify("5 · API calls per step")).toBe("5--api-calls-per-step");
    expect(slugify("4.2 /o/[outletId] menu")).toBe("42-ooutletid-menu");
  });

  test("headings, nested lists, tables, code, emphasis", () => {
    const html = render(
      ["## Steps", "", "1. First **bold**", "   - nested *em*", "2. Second", "", "| A | B |", "|:--|--:|", "| `x_y` | z |", "", "```ts", "const a = 1;", "```"].join(
        "\n",
      ),
    );
    expect(html).toContain('<h2 id="steps">Steps</h2>');
    expect(html).toMatch(/<ol><li><span>First <strong>bold<\/strong><\/span><ul><li><span>nested <em>em<\/em><\/span><\/li><\/ul><\/li><li><span>Second<\/span><\/li><\/ol>/);
    expect(html).toContain("<table>");
    expect(html).toContain("<code>x_y</code>");
    expect(html).toContain("const a = 1;");
  });

  test("snake_case words are not emphasis", () => {
    expect(render("reason_code and tax_minor_total")).toContain("reason_code and tax_minor_total");
  });
});

describe("no raw-HTML path anywhere in the site", () => {
  test("no dangerouslySetInnerHTML in apps/site source", () => {
    const root = join(import.meta.dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name === ".vercel" || name === "test") continue; // build output (vercel build) is framework code, not source
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?|mjs)$/.test(name)) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20);
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"));
    expect(hits).toEqual([]);
  });
});
