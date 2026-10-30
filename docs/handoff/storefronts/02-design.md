# 02 · Design system

One visual language, two palettes. The look is a playful **neo-brutalist street-food** style: warm paper-coloured
pages, chunky white cards with thick near-black outlines and hard offset shadows, fat pill buttons, loud condensed
all-caps headings, and small hand-drawn shapes. It should feel like a printed stall menu that someone stuck stickers on.
Everything below is original to this pack: draw your own shapes and icons, and write your own CSS.

## 1 · Principles

| Principle | In practice |
|---|---|
| Outlines, not blur | Every card, button, chip, input and badge has a `2px` near-black border. Shadows are solid offsets with **no blur**. |
| Physical feedback | A control lifts on hover (its shadow grows) and presses in on tap (it moves into its shadow). |
| Loud headings, calm body | Condensed display caps for headings only. Body text, prices and all numbers use a friendly sans with tabular figures. |
| Data first | Every price, time and total on screen comes from the API (01). The design never needs a number typed into it. |
| Status is never colour alone | Every state has a word and, where useful, an icon: "Open", "Busy", "Sold out", "Veg". |
| Demo honesty is part of the design | The demo labels (20-rules.md) are designed in (a top bar, the footer, near payment), not hidden. |

## 2 · Tokens

### 2.1 Spice Route (warm Indian street kitchen)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFF3DC` (cream) | page background |
| `--card` | `#FFFFFF` | cards, inputs, modal, drawer |
| `--ink` | `#1C1410` | text, every border, every shadow |
| `--muted` | `#5C4A3D` | secondary text |
| `--primary` | `#C0281C` (chilli red) | primary buttons, active chip, links |
| `--on-primary` | `#FFFFFF` | text on primary |
| `--secondary` | `#0B6E69` (deep teal) | secondary buttons, marquee band, focus ring |
| `--on-secondary` | `#FFFFFF` | text on secondary |
| `--accent` | `#F5B21B` (turmeric) | sticker titles, busy banner, highlights. Text on it is always `--ink` |
| `--on-accent` | `#1C1410` | text on accent |
| `--veg` | `#1F7A3A` | veg mark |
| `--nonveg` | `#A3361C` | non-veg mark |
| `--danger` | `#B42318` | errors, refusals |
| `--ok` | `#1F6B33` | "Open" dot, success |
| `--focus` | `#0B6E69` | focus ring |

### 2.2 Laneway Cafe (Melbourne laneway coffee)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F4EDE1` (oat cream) | page background |
| `--card` | `#FFFFFF` | cards, inputs, modal, drawer |
| `--ink` | `#211A16` (espresso) | text, every border, every shadow |
| `--muted` | `#5B5048` | secondary text |
| `--primary` | `#A2462B` (terracotta) | primary buttons, active chip, links |
| `--on-primary` | `#FFFFFF` | text on primary |
| `--secondary` | `#2E5E4A` (tram green) | secondary buttons, marquee band, focus ring |
| `--on-secondary` | `#FFFFFF` | text on secondary |
| `--accent` | `#B9C8A6` (sage) | sticker titles, busy banner, highlights. Text on it is always `--ink` |
| `--on-accent` | `#211A16` | text on accent |
| `--veg` | `#2E6B3A` | veg mark |
| `--nonveg` | `#9C3B22` | non-veg mark |
| `--danger` | `#B42318` | errors, refusals |
| `--ok` | `#2E6B3A` | "Open" dot, success |
| `--focus` | `#2E5E4A` | focus ring |

### 2.3 Measured contrast (WCAG 2.x relative luminance)

Text needs ≥ 4.5 : 1; borders, focus rings and control edges need ≥ 3 : 1. All pairs below pass.

| Pair | Spice Route | Laneway Cafe |
|---|---|---|
| ink on bg | 16.51 | 14.74 |
| ink on card | 18.15 | 17.16 |
| muted on bg | 7.64 | 6.72 |
| muted on card | 8.39 | 7.82 |
| on-primary on primary | 5.90 | 6.09 |
| on-secondary on secondary | 6.09 | 7.46 |
| on-accent on accent | 9.74 | 9.70 |
| primary as text (links) on bg | 5.36 | 5.24 |
| primary as text on card | 5.90 | 6.09 |
| veg on card | 5.38 | 6.40 |
| non-veg on card | 6.77 | 6.86 |
| danger on card / on bg | 6.57 / 5.98 | 6.57 / 5.65 |
| ok on card / on bg | 6.54 / 5.95 | 6.40 / 5.50 |
| focus ring on bg / on card | 5.54 / 6.09 | 6.41 / 7.46 |
| border (ink) against bg | 16.51 | 14.74 |
| white on ink ("Sold out" pill, demo bar) | 18.15 | 17.16 |

The accent fill against the page is low (1.70 and 1.52), which is why **every accent shape carries the 2px ink
border**: its edge is the ink line (≥ 14 : 1), not the fill. Never use an accent fill without the border.

### 2.4 Shape, space, shadow

| Token | Value |
|---|---|
| `--border-w` | `2px` |
| `--radius-card` | `18px` |
| `--radius-pill` | `9999px` |
| `--shadow` | `4px 4px 0 0 var(--ink)` (resting) |
| `--shadow-lift` | `6px 6px 0 0 var(--ink)` (hover: element moves `-2px, -2px`) |
| `--shadow-press` | `1px 1px 0 0 var(--ink)` (active: element moves `3px, 3px`) |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px |
| Content width | `max-width: 1120px`, side padding 16 px (24 px ≥ 640 px) |

## 3 · Type

| Role | Spice Route | Laneway Cafe | Size / style |
|---|---|---|---|
| Display (hero, page titles, stickers) | Bebas Neue (SIL OFL) | Anton (SIL OFL) | caps, `letter-spacing: .02em`, line-height 0.95. Hero `clamp(48px, 11vw, 112px)`; page title 40–56; sticker 28–32 |
| Body, UI, **all numbers** | Inter (SIL OFL) | Montserrat (SIL OFL) | 16/24 body, 18/26 item names (700), 14/20 small print (never below 14) |
| Money and times | body face + `font-variant-numeric: tabular-nums` | same | never in the display face |

Load fonts with `next/font/google` (it downloads them at build time and serves them from your own site, so it works on
any host). Spice Route needs the `latin-ext` subset for `₹` (U+20B9): checked on 13 Oct 2026, Google's Inter
`latin-ext` file contains `₹` and tabular figures, and Montserrat has tabular figures. Display faces have no tabular
figures, which is one more reason money never uses them.

```ts
// file: app/fonts.ts
// Spice Route. For Laneway use Anton (weight "400") and Montserrat (subsets ["latin"]) with the same variable names.
import { Bebas_Neue, Inter } from "next/font/google";

export const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display-face", display: "swap" });
export const body = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-body-face", display: "swap" });
// app/layout.tsx: <html lang="en-IN" className={`${display.variable} ${body.variable}`}>  (Laneway: lang="en-AU")
```

## 4 · CSS: tokens, Tailwind theme, components

Tailwind v4 (what `create-next-app` installs) is configured in CSS: the `@theme inline` block below maps the CSS
variables to utilities (`bg-primary`, `text-ink`, `border-ink`, `shadow-hard`, `rounded-card`, `font-display`, …).
There is no `tailwind.config.js`. The component classes (`.card`, `.btn`, …) are plain CSS you can use with or
without utilities. Replace the generated `app/globals.css` with this; for Laneway, swap the `:root` palette block
for §2.2's values.

```css
/* file: app/globals.css — Spice Route palette; for Laneway replace the :root colour block with 02-design §2.2 */
@import "tailwindcss";

:root {
  --bg: #fff3dc;
  --card: #ffffff;
  --ink: #1c1410;
  --muted: #5c4a3d;
  --primary: #c0281c;
  --on-primary: #ffffff;
  --secondary: #0b6e69;
  --on-secondary: #ffffff;
  --accent: #f5b21b;
  --on-accent: #1c1410;
  --veg: #1f7a3a;
  --nonveg: #a3361c;
  --danger: #b42318;
  --ok: #1f6b33;
  --focus: #0b6e69;

  --border-w: 2px;
  --radius-card: 18px;
  --radius-pill: 9999px;
  --shadow: 4px 4px 0 0 var(--ink);
  --shadow-lift: 6px 6px 0 0 var(--ink);
  --shadow-press: 1px 1px 0 0 var(--ink);
}

@theme inline {
  --color-bg: var(--bg);
  --color-card: var(--card);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-primary: var(--primary);
  --color-on-primary: var(--on-primary);
  --color-secondary: var(--secondary);
  --color-on-secondary: var(--on-secondary);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-veg: var(--veg);
  --color-nonveg: var(--nonveg);
  --color-danger: var(--danger);
  --color-ok: var(--ok);
  --color-focus: var(--focus);
  --font-display: var(--font-display-face), "Arial Narrow", sans-serif;
  --font-sans: var(--font-body-face), system-ui, sans-serif;
  --radius-card: 18px;
  --radius-pill: 9999px;
  --shadow-hard: 4px 4px 0 0 var(--ink);
  --shadow-hard-lift: 6px 6px 0 0 var(--ink);
  --shadow-hard-press: 1px 1px 0 0 var(--ink);
}

@layer base {
  html {
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font-body-face), system-ui, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  body {
    min-height: 100dvh;
    font-size: 1rem;
    line-height: 1.5;
  }
  h1, h2, h3, .display {
    font-family: var(--font-display-face), "Arial Narrow", sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 0.95;
  }
  input:not([type="checkbox"]):not([type="radio"]), select, textarea {
    font: inherit;
    font-size: max(16px, 1rem); /* below 16px, iOS Safari zooms the page */
    min-height: 48px;
    background: var(--card);
    color: var(--ink);
    border: var(--border-w) solid var(--ink);
    border-radius: 12px;
    padding: 0 14px;
  }
  textarea { padding: 12px 14px; }
  input[type="checkbox"], input[type="radio"] {
    width: 22px;
    height: 22px;
    accent-color: var(--primary);
  }
  :focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 3px;
  }
  .num { font-variant-numeric: tabular-nums; }
}

@layer components {
  .card {
    background: var(--card);
    border: var(--border-w) solid var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
  }
  .card-link {
    transition: transform 160ms ease-out, box-shadow 160ms ease-out;
  }
  .card-link:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-lift); }
  .card-link:active { transform: translate(3px, 3px); box-shadow: var(--shadow-press); }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    min-width: 48px;
    padding: 0 24px;
    border: var(--border-w) solid var(--ink);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow);
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition: transform 120ms ease-out, box-shadow 120ms ease-out;
  }
  .btn:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-lift); }
  .btn:active { transform: translate(3px, 3px); box-shadow: var(--shadow-press); }
  .btn:disabled, .btn[aria-disabled="true"] {
    background: var(--card);
    color: var(--muted);
    box-shadow: none;
    transform: none;
    cursor: not-allowed;
  }
  .btn-primary { background: var(--primary); color: var(--on-primary); }
  .btn-secondary { background: var(--secondary); color: var(--on-secondary); }
  .btn-accent { background: var(--accent); color: var(--on-accent); }
  .btn-plain { background: var(--card); color: var(--ink); }
  .btn-round { padding: 0; width: 48px; }

  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 48px;
    padding: 0 18px;
    white-space: nowrap;
    background: var(--card);
    color: var(--ink);
    border: var(--border-w) solid var(--ink);
    border-radius: var(--radius-pill);
    font-weight: 700;
  }
  .chip[aria-current="true"] { background: var(--primary); color: var(--on-primary); box-shadow: var(--shadow); }

  .sticker {
    display: inline-block;
    padding: 6px 18px 4px;
    background: var(--accent);
    color: var(--on-accent);
    border: var(--border-w) solid var(--ink);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow);
    transform: rotate(-1deg);
    font-size: clamp(28px, 5vw, 32px);
  }

  /* A checkbox or radio with its text: the whole label is the 48px tap area. */
  .choice {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 12px;
    border: var(--border-w) solid var(--ink);
    border-radius: 12px;
    background: var(--card);
    cursor: pointer;
  }
  .choice:has(input:checked) { background: var(--accent); color: var(--on-accent); }
  .choice:has(input:disabled) { color: var(--muted); cursor: not-allowed; }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 10px;
    background: var(--card);
    border: var(--border-w) solid var(--ink);
    border-radius: var(--radius-pill);
    font-size: 14px;
    font-weight: 700;
  }

  .checker {
    height: 14px;
    border-block: var(--border-w) solid var(--ink);
    background: repeating-conic-gradient(var(--ink) 0 25%, var(--bg) 0 50%) 0 0 / 14px 14px;
  }

  .rail {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 6px 2px 10px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }
  .rail::-webkit-scrollbar { display: none; }
  .rail > * { scroll-snap-align: start; }

  .marquee {
    overflow: hidden;
    background: var(--secondary);
    color: var(--on-secondary);
    border-block: var(--border-w) solid var(--ink);
  }
  .marquee-track {
    display: flex;
    width: max-content;
    gap: 32px;
    padding: 10px 0;
    animation: marquee 32s linear infinite;
  }
  .marquee:hover .marquee-track { animation-play-state: paused; }

  .bob { animation: bob 6s ease-in-out infinite; }

  .soldout-pill {
    display: inline-block;
    padding: 4px 12px;
    background: var(--ink);
    color: #ffffff;
    border-radius: var(--radius-pill);
    transform: rotate(-3deg);
    font-weight: 700;
  }

  dialog.modal, dialog.drawer {
    background: var(--card);
    color: var(--ink);
    border: var(--border-w) solid var(--ink);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog.modal {
    width: min(560px, calc(100vw - 24px));
    max-height: 90dvh;
    border-radius: var(--radius-card);
    overflow: auto;
  }
  dialog.drawer {
    margin: 0 0 0 auto;
    width: min(420px, 100vw);
    max-width: 100vw;
    height: 100dvh;
    max-height: none;
    border-radius: var(--radius-card) 0 0 var(--radius-card);
  }
  dialog.drawer[open] { animation: slide-in 220ms ease-out; }
  dialog::backdrop { background: rgb(28 20 16 / 0.45); }
}

@keyframes marquee {
  to { transform: translateX(-50%); }
}
@keyframes bob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-10px) rotate(2deg); }
}
@keyframes slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  .marquee-track { flex-wrap: wrap; width: auto; justify-content: center; }
}
```

## 5 · Components

| Component | Build | States |
|---|---|---|
| **Demo bar** | Full-width strip at the very top, `--ink` background, white 14 px text: "Sample shop — orders are not real." Not dismissable. | — |
| **Header** | Sticky, `--bg` with a 2px ink bottom border. Wordmark (display face) left; cart button right: `.btn .btn-plain` with your bag icon and the item **count** (a count of lines × qty, not money). | cart empty: count hidden |
| **State banner** | Directly under the header, full width, **min-height 56px reserved before data loads** (no layout shift). Copy from `acceptingText()` (01 §8.2) plus "Ready in about {n} min" while open or busy. | open: `--card` with an `--ok` dot + "Open" · busy: `--accent` + ink text · paused / closed: `--ink` with white text, plus the next opening time · loading: skeleton bar |
| **Checker strip** | `.checker`, `aria-hidden="true"`. Between hero and menu, above the footer. | — |
| **Hero** | Big display type (site name, one-line tagline), primary call to action ("Order for pickup"). A floating shape (§6) on the right at ≥ 640 px, below the text on phones, with `.bob`. | — |
| **Sticker title** | `<h2 class="sticker">` for section titles ("Menu", "Deals", "Munim Cares"). | — |
| **Category rail** | `<nav aria-label="Menu categories">` with `.rail` of `.chip` links to `#category-<slug>`; the chip for the section in view gets `aria-current="true"`. Sticky under the header on the menu page. Hidden scrollbar; the chips stay keyboard reachable. | — |
| **Marquee ticker** | `.marquee` band with two copies of the same list inside `.marquee-track` (the loop needs two). Content: category names, deal names (your labels for `name_key`), "Pickup only", the pay-at-counter line. **No typed numbers** (no "10% off": the API sends no percentage for deals). Whole band `aria-hidden="true"`: it repeats what is on the page. | reduced motion: static, wrapped |
| **Item card** | `.card` with: diet badge (§7), name (body face, 700, 18 px; `shownName()`), description (2-line clamp, plain text), price (body face, tabular) with "+ GST" or nothing per `prices_include_tax`, "Add" `.btn .btn-primary .btn-round` with a plus icon and `aria-label="Add {name}"`. Variant items show "from" the lowest variant price only if you list each variant price beside it; simplest is "Choose size". | sold out: `.soldout-pill` "Sold out" over the card's art area, the art area at 55 % opacity (text keeps full contrast), Add button disabled with text "Sold out" · ordering off (paused / closed): Add disabled, `title` "Not taking orders right now" |
| **Item modal** | Native `<dialog class="modal">` opened with `showModal()` (focus is trapped and Esc closes, for free). Name, description, variant radio group (required when `variants` is non-empty; a variant with `available: false` is disabled and says "Sold out"), one fieldset per option group (radio when `max_select` is 1, checkboxes otherwise; enforce `min_select` / `max_select`; `required` groups marked "Required"; each option shows its own `price_delta_minor` as "+{money}" when non-zero), quantity stepper (48 px buttons), "Add to cart". Under the button: "Final price is confirmed at checkout." **No computed total in the modal.** | invalid selection: Add disabled with the reason as text ("Choose a spice level") |
| **Cart drawer** | `<dialog class="drawer">`, slides in from the right. Lines: name, chosen variant and options (names), qty stepper, remove. Each line shows the **preview's** `line_total_minor` once a preview exists, otherwise the unit price from the menu with "each". Footer: the preview total (label "Preview") or "Total at checkout" when there is no preview yet, then "Go to checkout". | empty: "Your cart is empty." + "Back to menu" · preview refusals: the refusal copy, totals hidden |
| **Toast** | Bottom-centre `.card` pill, `role="status"` (polite), 2.5 s: "Added". | — |
| **Forms** | Labels always visible above inputs (never placeholder-only). Every checkbox and radio sits inside a `<label class="choice">` with its text, so the whole row is the 48 px tap area (variants, options, pickup times, "Send me offers"). Error text below the field in `--danger` with an alert icon, linked with `aria-describedby`. Inputs ≥ 16 px, ≥ 48 px tall. | — |
| **Skeletons** | `.card` shapes filled with `--bg`-tinted bars; no shimmer (or shimmer only without reduced motion). Same size as the loaded content. | — |
| **Full-page message** | Used for not-valid, empty menu, and fatal errors: a centred `.card` with a display-face title, one sentence, one button. | — |
| **Footer** | `--card` band with the 2px top border: the two demo labels, "Recorded only — Munim does not process payments.", outlet address, phone (`tel:` link) and tax ids when present, link to "Munim Cares". | — |
| **Mock test panel** | Only when `MOCK_CONTROLS_ENABLED` (01 §7): a small fixed `.card` bottom-left with two selects ("Outlet state": normal / open / busy / paused / closed; "Force 429": off / on) calling `writeMockControls()` then reloading data. Label it "Mock test controls (dev only)". | — |

## 6 · Illustration (draw your own)

No stock images, no icon packs, no third-party art. Draw everything as inline SVG or CSS: flat fills from the palette,
`2px` ink strokes, round line caps, simple geometric parts. Keep each SVG under 4 KB and mark decorative ones
`aria-hidden="true"`. Keep a short dated log (date, file, "drawn by hand for this project") in your repo's README.

| Site | Hero shape idea | Category / marquee motifs |
|---|---|---|
| Spice Route | A round clay bowl (two ellipses and an arc) with three wavy steam lines, and a chilli (a curved tapered path + a small leaf cap) leaning on it | a star-anise-like eight-point star, a dotted rangoli circle, a leaf |
| Laneway Cafe | A takeaway cup (trapezoid + lid band + sleeve) with two steam curls, beside a tram-wire zigzag line | a coffee bean (ellipse + S-curve), a croissant made of three arcs, a bicycle wheel circle |

Icons you need (24 × 24 viewBox, `stroke="currentColor"`, stroke-width 2, round caps and joins, `fill="none"`): bag,
plus, minus, close, clock, phone, map pin, check, alert, offline (cloud with slash), leaf (vegan), chevron. A dozen
hand-drawn paths is enough.

## 7 · Diet marks

The API's `diet` is `veg`, `non_veg`, `egg`, `vegan` or `null`. Show a mark **with its word** (`DIET_LABEL` in
01 §8.2); show nothing when `diet` is null, and never guess from the item name.

| `diet` | Mark (your SVG, 16 px, in a `.badge`) | Word |
|---|---|---|
| `veg` | square outline with a filled circle, `--veg` | "Veg" |
| `non_veg` | square outline with a filled triangle, `--nonveg` | "Non-veg" |
| `egg` | square outline with a filled oval, `--ink` | "Egg" |
| `vegan` | leaf icon, `--veg` | "Vegan" |

The API has **no "spicy" field**. Do not add a spicy badge (an option group such as "Spice level" is a choice the
shopper makes, not a property of the dish).

## 8 · Layout patterns

| Pattern | Rule |
|---|---|
| Menu grid | 1 column below 640 px, 2 columns from 640 px, 3 from 1024 px; 16 px gaps; one section per category with its sticker title and `id="category-<slug>"`. |
| Mobile cart bar | Below 1024 px, a sticky bottom bar (`.card`, full width, 64 px) with the count and "View cart" opens the drawer. It must not cover the footer labels: add bottom padding to the page equal to its height. |
| Checkout | One column, max 640 px wide, four numbered sections (Pickup time, Review, Your details, Place). |
| Tracker | One column, max 640 px: ticket number in the display face, progress steps (5 dots joined by a 2px line; the current step filled `--primary`, done steps `--ink`, each with its word), then the order card. |
| Breakpoints | 360 (smallest phone tested), 640, 1024, 1280. Everything works at 320 px and at 200 % zoom. |

## 9 · Motion

| Motion | Spec | Reduced motion |
|---|---|---|
| Hover lift / press | 120–160 ms ease-out, translate + shadow change | none (static) |
| Hero shape bob | 6 s ease-in-out, ±10 px and ±2° | none |
| Marquee | 32 s linear loop, pauses on `:hover` | static, wrapped list |
| Drawer | 220 ms slide from the right | appears without sliding |
| Toast | fade 150 ms | appears without fading |
| Status change on tracker | the new step's dot scales 1 → 1.15 → 1 over 300 ms | none; the `aria-live` text still announces it |

## 10 · Accessibility floor

* Text ≥ 4.5 : 1, borders and focus ≥ 3 : 1: the token pairs above are measured; do not introduce new pairs without
  measuring them.
* Tap targets ≥ 48 × 48 px (buttons, chips, steppers, close buttons, checkboxes with their labels).
* Inputs ≥ 16 px font. Visible focus ring on every control. Full keyboard path: menu → item modal → cart → checkout →
  place, with no traps (native `<dialog>` handles modal focus and Esc).
* Status never by colour alone. Order status changes and "Added" go through `aria-live="polite"` regions.
* `lang="en-IN"` (Spice Route) or `lang="en-AU"` (Laneway Cafe) on `<html>`.
* Owner text (`display_name`, `description`, Cares `label`) is plain text: render it as text, never as HTML.
