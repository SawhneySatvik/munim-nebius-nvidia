# Munim site "Ledger, softened" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> For the visual work itself, load the `impeccable` skill (craft, audit, polish) and follow this plan's tokens exactly.

**Goal:** Every page of `apps/site` in the founder-approved "Ledger, softened" direction (R61), content and routes unchanged,
then a Vercel preview of munim-rho for the founder.

**Architecture:** One token layer in `app/globals.css` (replacing the indigo/off-white tokens and the dark scheme) and fonts in
`app/layout.tsx`; shared parts restyled once (header, footer, buttons, tags, source chips, cards, sections); pages restyled
on top. The developer portal gets a quiet variant scoped under `.dev-shell` (its layout wrapper). No new dependencies.

**Tech Stack:** Next.js 16.4 (App Router), React 19.3, plain CSS (no Tailwind in apps/site), `next/font/google`, Vitest.

**Reference look:** the comparison page https://claude.ai/artifact/8ayrD2FZNjxSstekiudqxt, direction "A/C 1 · Ledger,
softened" (its source is `docs/superpowers/specs/assets/munim-directions.html`, copied there by the orchestrator). Match its
nav, hero, promise strip, product cards, Cares band, developer panel, buttons, tags and source chips.

**Decisions taken in this plan (state them in the report):**
- The site becomes a **single light "paper" world** (`color-scheme: light`); the old dark scheme is removed, because the
  direction is a paper look. The developer portal's code blocks are ink-on-dark inside the light page.
- Contrast: every text/background pair ≥ 4.5 : 1, outlines and focus ≥ 3 : 1 (checked by a new test).
- Keep the site's "no color-mix/oklch" rule (H11 in `globals.css`'s header).

---

## Lanes

- **S1 (foundation + marketing):** Tasks 1–6. After Task 3 passes its gates, S1 creates the file
  `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/design/GO-S2`.
- **S2 (developer portal):** waits for `GO-S2`, then Tasks 7–9. Touches only `app/developers/**`, `components/{DevNav,Operation,SchemaView,OpSearch,CodeBlock,CopyButton,Markdown}.tsx`
  and a `/* developer portal */` section at the end of `globals.css` (S1 never edits below that marker; S1 adds the marker).
- **Orchestrator:** Task 10 (preview deploy) and commits. Lanes never commit; no AI attribution anywhere.

---

### Task 1: Tokens and the contrast test (S1)

**Files:**
- Modify: `apps/site/app/globals.css` (the `:root` token block, the dark `@media` block, header comment)
- Create: `apps/site/test/tokens.test.ts`

- [ ] **Step 1: Write the failing contrast test**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/site && node_modules/.bin/vitest run test/tokens.test.ts`
Expected: FAIL (`token --paper missing from :root`).

- [ ] **Step 3: Replace the token layer**

In `globals.css`, replace the header comment and the whole `:root { … }` block and delete the `@media (prefers-color-scheme: dark) { :root { … } }` block with:

```css
/* Munim site — "Ledger, softened" (R61, docs/superpowers/specs/2026-10-16-munim-site-ledger-softened-design.md).
   The munim's red cloth ledger on ruled paper, with market-signage shapes. A single light paper world. Contrast of every
   pair is tested in test/tokens.test.ts. No color-mix/oklch (H11). */
:root {
  color-scheme: light;
  --paper: #f3ead7;
  --paper-2: #fbf6ea;
  --ink: #1b1611;
  --muted: #5b4d40;
  --accent: #b4232a;
  --on-accent: #fff8ef;
  --accent-2: #f0b429;
  --on-accent-2: #1b1611;
  --rule: #a9bccb;
  --code-bg: #1b1611;
  --on-code: #fbf6ea;
  --ok: #1f6b3a;
  --warn: #7a4600;
  --danger: #a3241b;
  --stroke: 2.5px;
  --stroke-quiet: 1.5px;
  --shadow: 4px 4px 0 var(--ink);
  --shadow-sm: 2px 2px 0 var(--ink);
  --radius: 12px;
  --radius-sm: 6px;
  --radius-pill: 999px;
  --gutter: 16px;
  --dur-fast: 90ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
```

Then map every old token the rest of the file uses onto the new ones (keep the old names as aliases at the end of the
`:root` block only while Tasks 2–9 replace their uses; delete the aliases in Task 9): `--surface-canvas → var(--paper)`,
`--surface-raised → var(--paper-2)`, `--surface-sunken → var(--paper)`, `--text-primary → var(--ink)`, `--text-secondary`
and `--text-muted → var(--muted)`, `--border-subtle → var(--ink)`, `--border-strong → var(--ink)`, `--accent-subtle →
var(--paper)`, `--focus-ring → var(--accent)`, `--success → var(--ok)`, `--warning → var(--warn)`, `--simulated →
var(--on-accent-2)` with `--simulated-subtle → var(--accent-2)`, `--evidence → var(--ok)`, `--abstain → var(--muted)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/site && node_modules/.bin/vitest run test/tokens.test.ts`
Expected: PASS (13 checks). If a pair fails, darken the foreground token (never lighten the paper) and re-run.

### Task 2: Fonts (S1)

**Files:** Modify `apps/site/app/layout.tsx:2,9-12` and the `viewport` export.

- [ ] **Step 1:** Replace the font imports and constants with:

```tsx
import { Atkinson_Hyperlegible, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
// Open-source fonts (SIL OFL) served by next/font; latin-ext carries the rupee sign.
const sans = Atkinson_Hyperlegible({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-sans", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "600"], variable: "--font-mono", display: "swap" });
```

and set `themeColor` to the single value `"#f3ead7"`.
- [ ] **Step 2:** In `globals.css` base rules, use `var(--font-display)` for `.display` headings (weight 800, tracking
  `-0.02em`, `line-height: 1`, `text-wrap: balance`), `var(--font-sans)` for body (16px, `line-height: 1.55`),
  `var(--font-mono)` with `font-variant-numeric: tabular-nums` for every figure, code, eyebrow and source chip.
- [ ] **Step 3:** `cd apps/site && node_modules/.bin/next build` → exit 0; the ₹ sign renders in all three faces
  (check a screenshot of the home page's figures).

### Task 3: Shared parts (S1) — then create `GO-S2`

**Files:** `apps/site/app/globals.css` (header, nav, footer, `.btn*`, `.tag*`, `.cite`, cards, `.section*`, `.eyebrow`,
`.lede`, focus, skip link, mobile menu), `apps/site/components/{Logo,Labels,ContactCard,Icon}.tsx` (markup only if a class
must change), `apps/site/app/layout.tsx` (structure unchanged).

- [ ] **Step 1:** Restyle to the reference: header = paper bar with a 2.5px ink bottom rule (no glass blur); logo = a 24px
  ledger-red square with an ink outline + "munim" in the display face; nav links ink, 48px targets; "Contact us" = primary
  pill. Buttons: `.btn` pill, 48px min height, 2.5px ink outline, `--shadow-sm`, `:active` moves `translate(2px,2px)` and
  drops the shadow (none under `prefers-reduced-motion`); `.btn-primary` ledger red; a secondary = turmeric; plain = paper-2.
  Tags: mono uppercase 12px pills with a 1.5px ink outline; simulated = turmeric fill; "Cannot verify" = dashed outline.
  `.cite` (source chip) = mono 12px pill, `↳` prefix, paper background. Cards (`.g-card`, `.listing-row`, feature cards):
  paper-2, 2.5px ink outline, 12px radius, `--shadow` only where a card stands alone (not on every block). Footer: ink
  background, paper text, the simulation note kept verbatim. Skip link and focus ring: 3px ledger red.
- [ ] **Step 2:** Add the ledger furniture as two utility classes used only on heroes and section heads:
  `.ruled` (repeating 32px rules in `--rule` over `--paper-2`) and `.margin-line` (a 2px ledger-red vertical line 12px
  from the left edge).
- [ ] **Step 3:** Add the marker comment `/* developer portal */` as the last line of `globals.css`.
- [ ] **Step 4:** Gates: `node_modules/.bin/tsc --noEmit` 0, `node_modules/.bin/vitest run` all pass (111 + tokens),
  `node_modules/.bin/next build` 0. Then `touch …/scratchpad/design/GO-S2`.

### Task 4: Home page (S1)

**Files:** `apps/site/app/page.tsx` (markup only where layout requires), `globals.css` home section rules.

- [ ] **Step 1:** Rebuild the home's sections to the reference while keeping every word and link: hero (ruled paper card,
  margin line, headline with "honest books" on a turmeric highlight, lede, two pill CTAs, the Ask-Munim sample card with
  its source chips beside it on desktop, below on phone); the One Guarantee as the two-cell promise strip with ink number
  badges; features as a ledger-style list (status tag per row, not a card grid); "Eight specialists" as a dense two-column
  list; "How it works" as four steps whose order is real (numbered); the Cares teaser as the ledger-red band; developers
  as the ops-list + ink code panel pair; packs; the contact CTA.
- [ ] **Step 2:** Screenshots at 1280 and 390 (Playwright from the repo's node_modules; `next start -p 4470`) into
  `apps/site/.screenshots/r61/`; no horizontal scroll at 390 (`scrollWidth <= 390`); zero console errors.

### Task 5: Munim Cares page (S1)

**Files:** `apps/site/app/cares/page.tsx`, `globals.css` Cares rules.

- [ ] **Step 1:** Hero on the ledger-red band ("Surplus food, shared before it is wasted." with "before" highlighted);
  the four steps as numbered ledger rows; B2B section; the impact section's figures in mono with their source chips and
  "Sample data" tags; every recipient with its "Simulated" tag; the developer call-out as an ink panel.
- [ ] **Step 2:** Screenshots 1280/390, no sideways scroll, zero console errors.

### Task 6: Contact and not-found (S1)

**Files:** `apps/site/app/contact/page.tsx`, `apps/site/app/not-found.tsx`, `components/ContactCard.tsx`.

- [ ] **Step 1:** Contact = the form as one paper-2 card with 48px inputs (16px text), labels above, the copyable address
  as selectable text with a copy button; not-found = a ledger entry "No such page" with the route in mono and links home
  and to the developer portal.
- [ ] **Step 2:** Screenshots, gates as Task 4.

### Task 7: Developer portal shell, quiet variant (S2, after GO-S2)

**Files:** `apps/site/app/developers/layout.tsx`, `components/{DevNav,OpSearch}.tsx`, `globals.css` below `/* developer portal */`.

- [ ] **Step 1:** Wrap the portal in `.dev-shell`. Under it: 1.5px ink rules instead of 2.5px outlines, no hard shadows,
  no ruled paper; side nav = paper with the current item as an ink row with paper text; search = 48px field.
- [ ] **Step 2:** Screenshots of `/developers` 1280/390.

### Task 8: Reference, schemas, guides (S2)

**Files:** `apps/site/app/developers/**/page.tsx` (markup only where needed), `components/{Operation,SchemaView,CodeBlock,CopyButton,Markdown}.tsx`.

- [ ] **Step 1:** Operation rows: method chip (GET paper, POST turmeric, PATCH/PUT/DELETE paper with ink), path in mono,
  `overflow-wrap: anywhere`; the selected operation as an ink row; code blocks ink background, paper text, ledger-red
  keyword accent, copy button 44px; schema tables scroll inside their own box; guides' prose 65ch.
- [ ] **Step 2:** The openapi test (`test/openapi.test.tsx`) and markdown test still pass; screenshots of reference, one
  section, one schema, guides index, one guide, downloads, getting started, errors, AI contract, mock at 1280/390; no
  sideways scroll except inside code/table boxes.

### Task 9: Clean-up and the full gate (S2, then S1 confirms)

- [ ] **Step 1:** Delete the old-token aliases from `:root` (Task 1 Step 3) and fix any remaining use (`grep -n "surface-\|text-primary\|accent-subtle" app components`).
- [ ] **Step 2:** `tsc --noEmit` 0; `vitest run` all pass; `next build` 0; every page screenshotted at 1280 and 390 into
  `apps/site/.screenshots/r61/`; zero console errors; `grep -rn "prefers-color-scheme: dark" app` → none.
- [ ] **Step 3:** Report: `…/scratchpad/design/lane-S1.md` and `lane-S2.md` (files, decisions, gate output, screenshot
  list, anything left).

### Task 10: Preview for the founder (orchestrator)

- [ ] **Step 1:** Commit the work by lane (no AI attribution): `R61 site: tokens, fonts, shared parts, home, Cares, contact`
  and `R61 site: developer portal, quiet variant`.
- [ ] **Step 2:** `vercel build && vercel deploy --prebuilt` from the repo root (munim-rho's link; gotcha 38) **without
  `--prod`**, then publish phone screenshots of home, Cares and the API reference with the preview link for the founder.
- [ ] **Step 3:** Production deploy of munim-rho only on the founder's word.
