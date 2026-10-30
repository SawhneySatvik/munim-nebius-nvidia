# Munim site redesign: "Ledger, softened" (16 Oct 2026)

**Status:** direction chosen by the founder (AskUserQuestion, 16 Oct; comparison page
https://claude.ai/artifact/8ayrD2FZNjxSstekiudqxt, blend A/C 1). This spec is for the founder's review before any page is built.

## Scope

- **In:** `apps/site` only (munim-rho): the marketing home, the Munim Cares page, contact, not-found, and the developer
  portal (getting started, authentication, errors, AI contract, mock, downloads, guides, API reference, schemas).
- **Out:** `apps/web`. The Cobnut storefront and staff screens keep Cobnut Bakehouse's own brand (founder, 16 Oct); a
  separate read-only audit checks that every staff screen follows it.
- **Unchanged:** every page's content, routes, data and behaviour. This is a visual and UX rework, not a rewrite of what the
  site says. Copy edits only where a heading or label must change to fit the new layout.

## The direction

Warm neo-brutalism taken from the munim's own tool, the red cloth-bound ledger (bahi-khata), softened with the rounder,
friendlier shapes of hand-lettered market signs. The look encodes the product's promise: honest books, every number traced
to a row.

**Colour (tokens):**

| token | value | use |
|---|---|---|
| `--paper` | `#f3ead7` | page background (ledger paper) |
| `--paper-2` | `#fbf6ea` | raised surfaces |
| `--ink` | `#1b1611` | text, outlines, hard shadows |
| `--muted` | `#5b4d40` | secondary text |
| `--accent` | `#b4232a` | ledger red: primary actions, the margin line, Cares band |
| `--accent-2` | `#f0b429` | turmeric: highlight, secondary action, "Simulated" tags |
| `--rule` | `#a9bccb` | ledger ruling (hero and section heads only) |

Semantic colours (traced/ok, warning, cannot verify) stay separate from the accents and keep ≥ 4.5 : 1 on paper.

**Type:** Bricolage Grotesque (display, 800, tight tracking) · Atkinson Hyperlegible (body) · IBM Plex Mono (every figure,
code, source tags, eyebrows), all through `next/font` with `latin-ext` for the ₹ sign, replacing Fraunces/Inter/JetBrains.
One type scale; headings `text-wrap: balance`; body ~65 characters wide.

**Shape:** 2.5px ink outlines; hard offset shadows 4px (2px on small parts), no blur; 12px card radius; pill buttons;
pressing a button moves it into its shadow. Ruled ledger paper with a red margin line only on the hero and section heads.

**Signature details (content, not ornament):** source tags read like ledger entries (`↳ snapshot · row · column`); figures
always in mono with tabular numerals; "Sample data", "Simulated supplier" and "Cannot verify" tags as defined parts.

## Developer portal: the quiet variant

Long reference pages need calm and density. The portal keeps the same type and colours but drops the hard shadows and
ruled paper, uses 1.5px rules instead of 2.5px outlines, and gives code blocks the ink background. Navigation, search, the
operation list and schema views keep their current behaviour.

## UX rules (hold on every page)

- Tap targets ≥ 48px; inputs ≥ 16px (gotcha 18); visible focus on everything; `prefers-reduced-motion` respected.
- Works at 390px with no sideways scroll; only code and wide tables scroll inside their own box.
- Simulated means labelled (hard rule 5): every supplier, recipient and figure from the demo world carries its tag.
- No AI-template tells: no gradient heroes, no emoji markers, no everything-centred layouts, no card-on-every-block.
- Fresh code and original assets only (hard rule 1); the third-party sites the founder named are style references only
  (hard rule 4).

## Process

1. **Reference page first:** the new tokens, fonts and shared parts, then the **home page** only. Deploy it as a **Vercel
   preview** of munim-rho (not production), and send the founder the link and phone screenshots.
2. **Founder sign-off** on that page (or one round of changes).
3. **Then fan out:** Cares page, contact and not-found, then the developer portal (quiet variant).
4. Gates per page: `apps/site` typecheck, lint, its test suite (111 today), `next build`, screenshots at 1280 and 390 of
   every page, contrast check of every token pair, no horizontal scroll at 390.
5. Production deploy of munim-rho only on the founder's word.

## Not in this spec

Cobnut/staff UI changes (separate audit); the drag-and-drop storefront builder; any new site pages or content.
