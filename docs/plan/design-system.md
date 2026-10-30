# Munim — design system (D-3, pass 2)

Binds `packages/ui` (T-060) and every W4 surface. Ledger outranks this file. Token **names** below are the
contract for T-060's token snapshot test; hex values may be tuned only with the contrast table re-measured.
Contrast figures are `FACT`: WCAG 2.x relative-luminance ratios computed by script on 9 Oct 2026.

## 1 · Principles
1. **Numbers are evidence.** Every figure an AI surface shows is a rendered `⟨snap⟩` cell and looks like one
   (evidence style, opens its rows). A number that cannot trace shows the "Cannot verify" block, never a guess.
2. **The person decides.** Drafts look like drafts (dashed edge, "Draft" label, ref beside each value) until a
   named person approves. No component has an "auto-applied" state (R16).
3. **Simulated means labelled.** The simulated badge is a component, not a style; it cannot be themed away.
4. **Glanceable at the counter, calm at the desk.** POS/KDS: big, high-contrast, few choices per screen.
   Console: dense, quiet, aligned numbers, colour only where it carries meaning.
5. **Never colour alone.** Every status has a text label and an icon or shape cue as well.
6. **AI degrades to hidden** (CLAUDE.md rule 11): no AI component has an error-styled failure state.

## 2 · Colour tokens
CSS custom properties are the source of truth (`packages/ui/tokens.css`, mirrored by a typed `tokens.ts`).
Components use semantic tokens only — never raw hex, never Tailwind palette colours. Theme switches by
`[data-theme="light"|"dark"]` on `<html>`; default follows `prefers-color-scheme`.

| Token | Light | Dark | Use | Target | Measured L / D |
|---|---|---|---|---|---|
| `--surface-canvas` | `#F7F6F2` | `#151513` | page background | — | — |
| `--surface-raised` | `#FFFFFF` | `#1E1E1B` | cards, sheets, inputs | — | — |
| `--surface-sunken` | `#EFEDE6` | `#0F0F0D` | wells, table stripes, code | — | — |
| `--surface-scrim` | `#1C1B1880` | `#00000099` | modal backdrop | — | — |
| `--text-primary` | `#1C1B18` | `#ECEAE3` | body, numbers | 4.5 | 15.93 / 15.19 (canvas) |
| `--text-secondary` | `#55524A` | `#B8B4A9` | labels, meta | 4.5 | 7.21 / 8.83 |
| `--text-muted` | `#6B675E` | `#9C988E` | hints, timestamps | 4.5 | 4.72 / 4.93 (worst: on accent- / evidence-subtle) |
| `--border-subtle` | `#D9D5CB` | `#34332E` | dividers only (decorative) | none | 1.47 — never an input edge |
| `--border-strong` | `#7F7A6F` | `#77736A` | input/control edges | 3.0 | 3.65 sunken / 3.54 raised (worst) |
| `--accent` | `#3B4BC8` | `#94A3FF` | primary action, links, focus | 4.5 | 5.92 / 7.12 (worst) |
| `--on-accent` | `#FFFFFF` | `#151513` | text on accent fill | 4.5 | 6.94 / 7.79 |
| `--accent-subtle` | `#E8EAFB` | `#23284A` | selected row, tag bg | 4.5 (accent on it) | 5.81 / 6.07 |
| `--focus-ring` | = accent | = accent | 2 px ring, 2 px offset | 3.0 | ≥ 5.85 / ≥ 7.12 all surfaces |
| `--success` / `-subtle` | `#1B6E3A` / `#E2F2E7` | `#6FD39A` / `#15291C` | ready, paid, approved | 4.5 | 5.42 / 8.39 (on subtle) |
| `--warning` / `-subtle` | `#7A4F00` / `#FDF0D2` | `#F4BE55` / `#2C2310` | at risk, expiring | 4.5 | 6.30 / 9.11 |
| `--warning-solid` | `#E8A317` | `#E8A317` | amber **fill** (text = `--text-primary` L / `#151513` D) | 4.5 | 7.94 / 8.43; never as text (2.17) |
| `--danger` / `-subtle` | `#B3261E` / `#FCE7E5` | `#FF8F85` / `#331614` | late, void, rejected, destructive | 4.5 | 5.51 / 7.52 |
| `--on-danger` | `#FFFFFF` | `#151513` | text on danger fill | 4.5 | 6.54 / 8.29 |
| `--info` / `-subtle` | `#1A5E9A` / `#E3EFFA` | `#7DB8F0` / `#122434` | neutral notices | 4.5 | 5.78 / 7.52 |
| `--evidence` / `-subtle` | `#0B6B63` / `#DFF3F0` | `#5ED3C4` / `#10302C` | cited numbers, citation chips | 4.5 | 5.44 sunken / 7.83 |
| `--abstain` / `-subtle` | `#4A5363` / `#ECEEF2` | `#AEB7C7` / `#22262E` | "Cannot verify" block | 4.5 | 6.67 / 7.51 |
| `--simulated` / `-subtle` | `#7B2F8E` / `#F5E8F8` | `#E3A2F2` / `#2A1730` | "Simulated supplier" badge | 4.5 | 6.74 / 8.48 |

Every status colour was also checked as text on canvas, raised and sunken (worst light: evidence 5.44 sunken;
worst dark: danger 7.57 raised); muted text on every `*-subtle` fill ≥ 4.72; focus ring ≥ 5.81 everywhere. **KDS high-contrast** (`[data-kds-contrast="high"]`): canvas
`#000000`, card `#141414`, text `#FFFFFF` (18.42), secondary `#C8C8C8` (12.55), at-risk fill `#FFB300` with
black text (11.70), late fill `#C4001A` with white text (6.25) and a `#FF4D5E` 4 px border (6.48 vs black —
`#C4001A` alone is 3.36 on black, so it is a fill only), ready `#2ECC71` with black text (9.99).

Elevation in dark mode = lighter surface + `--border-subtle`, not shadow. Accent and evidence are different hues
on purpose: an accent link is an action; an evidence number is a fact you can open.

## 3 · Type
- **One family: Inter** (SIL OFL), loaded once with `next/font` in `apps/web/app/layout.tsx` as `--font-sans`;
  `packages/ui` reads only the variable. Fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
  `FACT`: Inter 3.015 (local copy inspected with fontTools) has `₹` U+20B9, `−` U+2212 and a `tnum` feature.
  `UNVERIFIED`: the exact build `next/font` ships — T-060's snapshot test asserts U+20B9 in the served file.
  Inter has no Devanagari; a future Hindi locale adds Noto Sans Devanagari as a second fallback only.
- **Money and every numeric column:** `.num { font-variant-numeric: tabular-nums lining-nums; }`, right-aligned,
  same decimals down a column. `slashed-zero` on IDs and codes only (SKU, invoice no.).

| Step | Size / line | Weight | Use |
|---|---|---|---|
| `--type-xs` | 12 / 16 | 500 | badge text, chart ticks (never inputs, never KDS) |
| `--type-sm` | 14 / 20 | 400 | console table cells, meta |
| `--type-md` | 16 / 24 | 400 | body, **every input** |
| `--type-lg` | 18 / 26 | 500 | POS item names, card titles |
| `--type-xl` | 22 / 28 | 600 | section heads, KDS line items |
| `--type-2xl` | 28 / 34 | 600 | page titles, KPI values |
| `--type-3xl` | 36 / 40 | 700 | POS total, KDS ticket number |
| `--type-4xl` | 48 / 52 | 700 | KDS timer, numpad display |

## 4 · Spacing, radius, elevation
- Space (4 px base): `--space-0..10` = 0, 2, 4, 8, 12, 16, 20, 24, 32, 48, 64. Console density row 36 px;
  POS/KDS row ≥ 56 px. Page gutter 16 px phone, 24 tablet, 32 desktop.
- Radius: `--radius-sm` 4 (chips, inputs), `--radius-md` 8 (buttons, cards), `--radius-lg` 12 (sheets,
  dialogs), `--radius-pill` 999 (badges). Storefront may pick a preset (§9); other surfaces may not.
- Elevation (light): `--elev-0` none; `--elev-1` `0 1px 2px #1C1B181A`; `--elev-2` `0 4px 12px #1C1B181F`;
  `--elev-3` `0 12px 32px #1C1B1829` (dialogs only). Z-index scale: base 0, sticky 10, drawer 30, dialog 40, toast 50.

## 5 · Tablet ergonomics (POS, KDS, staff ops)
- Tap targets **≥ 48 × 48 px** with ≥ 8 px between targets; POS primary actions 56 px tall; numpad keys 72 px.
- **Inputs ≥ 16 px** text (gotcha 18) — iOS zooms below that. Never fix zoom with `maximum-scale=1`.
- Thumb zones (landscape tablet held or counter-mounted): primary action (Charge, Bump, Approve) bottom-right;
  destructive actions top or behind a confirm sheet, never adjacent to the primary; cart/total on the right
  rail, catalogue grid left.
- Greasy fingers: no swipe-only actions, no long-press-only actions, no drag to reorder; every gesture has a
  button. Debounce double taps on commit buttons (idempotency key per tap still sent).
- **KDS status uses three cues:** colour fill + text label ("NEW", "AT RISK", "LATE +04:10") + shape (at risk:
  amber fill and `!` triangle icon; late: red fill, 4 px border and the elapsed timer inverted). Thresholds come
  from the outlet setting, never hard-coded. Late tickets do not flash (seizure floor: never > 3 flashes/s).
- KDS legible at 2 m: item text ≥ 22 px, timer 48 px, modifiers indented with a `+` prefix, allergens as a
  labelled pill, not colour.

## 6 · Motion
- Durations: `--dur-instant` 0, `--dur-fast` 120 ms (press, hover), `--dur-base` 200 ms (enter, toast),
  `--dur-slow` 320 ms (drawer, sheet). Easing `cubic-bezier(.2,0,0,1)` in, `(.4,0,1,1)` out.
- Nothing on POS/KDS animates longer than 200 ms; nothing blocks input while animating.
- New KDS ticket: 1 s static outline highlight, then steady. Approval commit: row collapses 200 ms.
- **`prefers-reduced-motion: reduce`** → all durations 0 except opacity fades ≤ 120 ms; the pixel office
  shows the static console view (trace list + desk status) instead of walking sprites (§10, ART-DIRECTION).

## 7 · Components and states
Every component ships with these states; the D-2 screen spec names which states each screen screenshots.

| Component | States |
|---|---|
| Button (primary, secondary, ghost, danger) | default, hover (`@media (hover:hover)` only), pressed, focus-visible, disabled, busy (spinner + label kept, width fixed) |
| Input / select | empty, filled, focus, invalid (danger edge + message + icon), disabled, read-only |
| Numpad | idle, entering (display updates), max-digits reached, invalid (shake 0 ms in reduced motion + message), confirm; amounts held as minor units |
| Order line (POS) | new, edited (qty/options), with modifiers, discounted (shows rule name), voided (strike + reason + actor), sent to kitchen (locked) |
| Ticket card (KDS) | new, in progress, at risk, late, ready, bumped, recalled; station filter applied |
| Inbox item | finding only; finding + draft; draft states **pending, approved, edited, rejected, expired**; owner-only badge |
| Approval diff | before → after per field, each proposed number shown as its ref beside the value, the person's edits labelled "Edited by <name>", required reason on reject, Approve disabled until refs resolve |
| Citation chip | default (evidence colour, dotted underline, source icon), focus, open (drawer lists snapshot rows), unresolved → replaced by the Cannot-verify block |
| Snapshot table | loading, rows (≤ 500, row count shown), highlighted cited row/column, empty, too-old (snapshot time shown, "as of" label) |
| KPI tile | value (evidence style, opens rows), delta with arrow + sign + text, no data ("—" + why), cannot verify |
| Chart | rules below; empty; cannot verify |
| Toast | success, info, warning, danger; `aria-live="polite"` (danger `assertive`); ≤ 2 stacked; never the only record of an action |
| Empty state | typographic only (no illustrations): one line of what is missing + one action |
| "Cannot verify" block | abstain colour, hatched left edge, icon, i18n heading "Cannot verify", core-composed reason from `reason_code`, links to the refs it did check; never error red |
| Simulated badge | plum pill, diagonal-stripe edge, text "Simulated supplier" (or "Simulated data"); not dismissible, not themable, rendered by the supplier name component itself |

**Chart rules:** every plotted value comes from one snapshot and the chart links to it; no dual axes; y-axis
starts at zero for bars; at most 5 series (else small multiples); series distinguished by colour **and** marker
or dash; axis labels formatted by the pack (§8); a data table toggle under every chart; no 3D, no pie > 5 slices.

**Icons:** a small set of SVG glyphs authored fresh in `packages/ui/icons` (24 px grid, 2 px stroke,
`currentColor`); no third-party icon pack (hard rule 1). Every icon used for status has a text label beside it.

Ref rendering (T-060): only the `⟨snap⟩`/`⟨cite⟩` renderer may put an AI-surface number on screen; it formats
via the pack and wraps the value in a citation chip. Model text is rendered as text nodes, never raw HTML
(gotcha 15). The "Cannot verify: …" sentence is i18n copy keyed by `reason_code`, never model text.

## 8 · i18n and number formatting
- Every user string is an i18n key; copy in D-2 specs is literal. English only in v1.
- **One format module** (`packages/ui/format`) reads the business's country pack: locale, currency, minor
  units, time zone, date pattern, compact style. No `if (country === …)` anywhere (rule 7, R21).
- IN pack locale `en-IN` → `₹12,34,567.50` (lakh grouping); AU pack `en-AU` → `$1,234,567.50` (`A$` only where
  another currency could appear on the same screen). Grouping comes from `Intl.NumberFormat` with the pack locale.
- Compact (dashboards, KPI tiles only, always inside a ref chip whose full value is in the drawer and the
  `aria-label`): IN `₹12.3 L`, `₹1.2 Cr`; AU `$12.3k`, `$1.2M` — the pack names the style. Compact forms
  are produced by the renderer from the cell value only; the model never writes or attaches a magnitude.
- Money is always `.num`; amounts are minor units in code; negatives use `−` U+2212 before the symbol
  (`−₹1,200`), plus danger colour only where the sign matters; tax lines show the pack's rounding.
- Dates/times format in the **outlet's** IANA zone from the pack, on the server, through the one tz module
  (gotcha 14). KDS shows 24 h `HH:mm` and elapsed `mm:ss`; storefront shows the pack's customer pattern.

## 9 · Storefront theming
Tenant theme = data, validated against a `contracts` schema, applied as CSS variables on the storefront root:
`--brand-primary`, `--brand-on-primary` (**computed**: `#FFFFFF` or `#1C1B18`, whichever passes 4.5:1; if
neither does, the theme is refused with the measured ratio), `--brand-surface` (canvas tint, must keep
`--text-primary` ≥ 4.5), `--brand-radius` (`sharp` 2 / `soft` 8 / `round` 16), logo (SVG or PNG ≤ 200 KB,
transparent, shown on canvas and on primary), layout preset `menu-grid | menu-list | hero-banner`.
**Locked (not themable):** font family, semantic tokens (danger, warning, success, evidence, abstain,
simulated), focus ring, the "Pay at the counter" notice, FSSAI / ABN / tax-invoice lines, type scale.

## 10 · Accessibility floors
WCAG 2.2 AA on every surface. Text ≥ 4.5:1, large text and UI edges ≥ 3:1 (table above). Focus visible on
every interactive element. Targets ≥ 24 px everywhere, ≥ 48 px on tablet surfaces. Full keyboard path through
console approvals. Citation chips have an `aria-label` with the full value and its source ("₹12,400, from
snapshot rows, open evidence"). KDS announces new tickets via a polite live region. Layout survives 200 %
zoom and 320 px width (storefront). `lang` set from the pack. The pixel office canvas is `aria-hidden`; its
text equivalent is the trace list beside it. Screenshot gate: every status screen also captured in greyscale
— if two statuses look identical, it fails review.

## 11 · Hazards (traps for W4)
| # | Trap | Rule |
|---|---|---|
| H1 | `apps/web` has **no Tailwind** today (`package.json`, 9 Oct). If T-060 adds Tailwind v4, its source scan skips workspace packages | add `@source` for `packages/ui`; map utilities to the CSS variables in `@theme`, never to palette colours |
| H2 | Dynamic class names (`bg-${status}`) are purged by any class scanner | full class strings in a lookup map, or style by `data-status` attribute |
| H3 | `dark:` utilities follow the media query by default and fight `[data-theme]` | components never use `dark:`; tokens switch under `[data-theme]` |
| H4 | Theme flash and hydration mismatch | theme cookie read on the server sets `data-theme`; `suppressHydrationWarning` on `<html>` only |
| H5 | Tenant colours interpolated into a `<style>` tag = CSS injection | validate `^#[0-9A-F]{6}$` server-side, set via `style` object, never string-built CSS |
| H6 | `next/font` called inside a shared package | call it in the app layout; packages read `var(--font-sans)` |
| H7 | iOS zoom on inputs < 16 px; `maximum-scale=1` breaks pinch zoom (a11y) | `--type-md` minimum on inputs, selects, textareas |
| H8 | `<input type="number">` rounds, scroll-wheels, and drops leading zeros | `type="text" inputmode="decimal"`, parse to minor units in `format` |
| H9 | Sticky `:hover` on iPad after a tap | hover styles inside `@media (hover:hover)` |
| H10 | `100vh` jumps under iPad Safari bars | `100dvh` |
| H11 | Older kitchen tablets: `color-mix()` needs Safari 16.2+ (`UNVERIFIED` exact floor) | ship literal hex tokens; no `color-mix`/`oklch` for any state colour |
| H12 | `toLocaleString()` without a locale differs server vs client → hydration errors and wrong grouping | only the `format` module formats; it always passes the pack locale and zone |
| H13 | Colour-only status (KDS amber/red, chart series, diff add/remove) | label + icon/shape always; greyscale screenshot check |
| H14 | `next/image` resamples sprites → blurred pixel art | office art via `<canvas>` or `unoptimized`, `image-rendering: pixelated`, integer scale only |
| H15 | Tabular figures silently lost when the fallback font renders | font load asserted in the token snapshot test; numbers checked for `tnum` in computed style |
