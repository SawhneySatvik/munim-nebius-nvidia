# Art provenance: the Munim launch film

Everything listed here was authored as SVG code for this film, during the event. There are no image models, stock art, sprite packs or icon libraries (hard rule 1). The Snacky Shack film was read for method only, and none of its files, code, art or copy is used.

| File / code | What it is | Made | How |
|---|---|---|---|
| `ui/office.js` (`desk()`, `EMBLEMS`, `UI.office`, `UI.slip`) | The AI back office: eight specialist desks and the Manager's desk. Each desk has a seated figure, a red cloth ledger (bahi-khata), a watcher lamp and an emblem for its area (price tag, chef's hat, crate, calculator, clipboard, speech bubble, shield, bar chart, bell). Dashed routing lines run to the Manager. | 16 Oct 2026 | SVG paths authored for this film in the Munim "Ledger, softened" palette (R61) |
| `assets/art/ink-mask.svg` | The ink-stamp roughness mask | 16 Oct 2026 | SVG `feTurbulence` (seed 3) turned into alpha; deterministic |
| `assets/art/grain.svg` | Paper grain over the ledger stage | 16 Oct 2026 | SVG `feTurbulence` (seed 7), warm brown at partial alpha; deterministic |
| `assets/art/swash.svg` | Cobnut's section-title swash | 16 Oct 2026 | The path from `apps/web/app/globals.css` (this project's own art), saved as a file |
| `assets/js/motion.js` (`CURSORS`) | The pointer, hand and I-beam cursors | 16 Oct 2026 | SVG paths authored for this film |
| `ui/cobnut.js` (`UI.hazelnut`, stamp mark, alert and close icons) | The Cobnut hazelnut and the small UI marks | 16 Oct 2026 | Redrawn from this project's own components (`apps/web/components/art.tsx`, `staff/source.tsx`) |
| `ui/negotiation.js` (`TICK`, `CROSS`) | The rule check and cross marks | 16 Oct 2026 | SVG paths authored for this film |
| The Munim mark (style frames, end card) | The "M" on a ledger rule with the ref dot | 16 Oct 2026 | This project's own logo drawing (`apps/site/components/Logo.tsx`), at film size |
