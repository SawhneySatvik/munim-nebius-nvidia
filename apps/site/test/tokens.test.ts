// apps/site/test/tokens.test.ts — every text/background pair the site uses meets WCAG AA (R61 spec, UX rules).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const tok = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  if (!m) throw new Error(`token --${name} missing from :root`);
  return m[1]!;
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe("Ledger, softened tokens (R61)", () => {
  const text: Array<[string, string]> = [
    ["ink", "paper"], ["ink", "paper-2"], ["muted", "paper"], ["muted", "paper-2"],
    ["on-accent", "accent"], ["on-accent-2", "accent-2"], ["ink", "accent-2"], ["on-code", "code-bg"],
    ["ok", "paper-2"], ["warn", "paper-2"], ["danger", "paper-2"],
  ];
  it.each(text)("text --%s on --%s is at least 4.5:1", (fg, bg) => expect(ratio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5));
  it.each([["ink", "paper"], ["accent", "paper"]] as Array<[string, string]>)("outline/focus --%s on --%s is at least 3:1", (fg, bg) =>
    expect(ratio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(3));
  it("is a single light world", () => { expect(css).not.toMatch(/prefers-color-scheme:\s*dark/); expect(root).toMatch(/color-scheme:\s*light/); });
});
