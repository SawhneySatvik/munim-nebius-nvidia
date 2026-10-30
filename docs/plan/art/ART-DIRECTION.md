# Munim back office — art direction and asset bible (D-3)

The pixel office in `/console` replays real trace events (R8, `04-agent-framework.md` §7). **Every asset is
generated fresh for Munim and logged in `PROVENANCE.md`** (CLAUDE.md hard rule 1; R4 §A K1): no sprite pack,
no pixel font, no traced or "in the style of" art. R4 §A's pixel-office repos were ideas only (desks, walking,
bubbles, a waiting-for-permission cue). Art is on the PDR cut ladder: if cut, the console view stays.

## 1 · Style rules
- **Grid:** 16 px tiles. Map 24 × 14 tiles = 384 × 224 logical px. Integer scale only: 3× (1152 × 672) on
  desktop, 2× (768 × 448) on tablet; below 768 CSS px wide, or with reduced motion, show the console view.
- **Camera:** three-quarter top-down, orthographic (no vanishing points), back wall visible, one fixed view.
- **Light:** one source, upper-left (the windows). Two shade tones plus one highlight per material. Furniture
  drops a 1 px shadow down-right in `#34332E`. No gradients, no anti-aliasing, no alpha except full cut-out.
- **Outline:** 1 px `#1C1B18` outer outline on characters and props; interior lines use the material's dark
  tone, never pure black. Floor and wall tiles have no outline. The board's cork may use a 2-colour checker.
- **Characters:** 16 × 24 frames, head 8 px wide (~two heads tall), 1 × 2 px eyes, mouths only in speech
  frames, feet on the bottom row, anchor point bottom-centre.
- **No text in any image** — no letters, digits, logos or UI. Desk names, "Simulated supplier", bubble text
  and counts are DOM text overlays from i18n keys (Inter, design-system §3), rendered as text nodes
  (gotcha 15). The art is icon-only; labels make it readable and are what a11y reads.
- **Colour meaning is reserved** (design-system tokens): amber = awaiting approval, slate = cannot verify,
  red = error/rejected, teal = evidence and the graph, green = approved, **plum = simulated, used only on
  supplier-bay assets**. Shirts and furniture use the other palette entries. Characters are told apart by
  label, desk and role prop, never by colour alone.

## 2 · Palette (32 colours; 25 are design-system token values, 7 are materials)
| # | Hex | Source | Use | # | Hex | Source | Use |
|---|---|---|---|---|---|---|---|
| 1 | `#1C1B18` | text-primary | outline, black hair | 17 | `#94A3FF` | accent dark | shirt, monitor light |
| 2 | `#34332E` | border-subtle D | shadow | 18 | `#E8EAFB` | accent-subtle | paper tint, shirt |
| 3 | `#55524A` | text-secondary | dark fabric | 19 | `#1A5E9A` | info | shirt, monitor frame |
| 4 | `#7F7A6F` | border-strong | metal, chair | 20 | `#7DB8F0` | info dark | screen glow |
| 5 | `#D9D5CB` | border-subtle | wall | 21 | `#0B6B63` | evidence | board pins, edges |
| 6 | `#EFEDE6` | surface-sunken | floor light | 22 | `#5ED3C4` | evidence dark | lit pin |
| 7 | `#F7F6F2` | surface-canvas | paper | 23 | `#1B6E3A` | success | approved stamp, plant dark |
| 8 | `#FFFFFF` | surface-raised | highlight | 24 | `#6FD39A` | success dark | plant light |
| 9 | `#6E4A2E` | material | wood dark, brown hair | 25 | `#E8A317` | warning-solid | "awaiting" bubble |
| 10 | `#9A6B43` | material | wood mid | 26 | `#F4BE55` | warning dark | lamp, highlight |
| 11 | `#C4925E` | material | wood light, cork | 27 | `#B3261E` | danger | rejected stamp, error |
| 12 | `#5A3A28` | material | skin 1 | 28 | `#FF8F85` | danger dark | error highlight |
| 13 | `#8D5A3B` | material | skin 2 | 29 | `#7B2F8E` | simulated | supplier bay only |
| 14 | `#C68A62` | material | skin 3 | 30 | `#E3A2F2` | simulated dark | supplier bay only |
| 15 | `#E8B896` | material | skin 4 | 31 | `#4A5363` | abstain | "cannot verify" |
| 16 | `#3B4BC8` | accent | router shirt | 32 | `#AEB7C7` | abstain dark | "cannot verify" light |

Key colour `#FF00FF` is outside the palette and keyed out; any processed pixel off these 32 hexes fails.

## 3 · Floor plan (tile coordinates; letters are layout keys, never drawn)
```
   000000000011111111112222
   012345678901234567890123
00 WWwwWWWWWBBBBBBWWWWWwwWW   W wall · w window · B shared board (graph), 6×2 tiles
01 WWwwWWWWWBBBBBBWWWWWwwWW
02 ....|...................   | glass partition: supplier bay (x 0-3) is plum-taped
03 ss..|...................   s simulated supplier desks: steady, discounter, premium
04 ss..|.11..22..33..44....   1 Catalogue 2 Kitchen 3 Purchasing 4 Finance
05 ....|.11..22..33..44....
06 ss..|...................
07 ss..|.55..66..77..88....   5 People 6 Customers 7 Compliance 8 Market
08 ....|.55..66..77..88....
09 ss..|...................
10 ss..|..............OOO..   O owner desk + inbox tray (no owner sprite: the owner is the viewer)
11 ....|.....RRR......OOO..   R reception: the router
12 ....|...................
13 WWWWWWWWWWWDDWWWWWWWWWWW   D door (sub-agents enter and leave here)
```

## 4 · Asset list (logical px; fps = frames per second at playback)
| ID | `art/office/processed/<file>` | Size | Frames / states | Prompt |
|---|---|---|---|---|
| A0 | `anchor.png` (reference only, not shipped) | 64 × 48 | one seated character at a desk with monitor and plant | P-ANCHOR |
| C0 | `char-base.png` | 16 × 24 per frame; sheet 64 × 240 | 10 rows: idle 2f @2 · typing 3f @8 · reading 2f @3 · walk-down 4f @8 · walk-up 4f @8 · walk-side 4f @8 (left = mirrored) · speaking 2f @4 · **awaiting approval** 2f @2 (hand raised) · **abstain** 2f @2 (open empty hands) · error 2f @2 (slumped) | P-CHAR-01 |
| C1–C12 | `char-<role>.png` | as C0 | derived from C0 by **index palette swap** (skin, hair, shirt) — router, 8 specialists, 3 suppliers (plum outfits) | derived |
| R1–R12 | `props-role.png` | 16 × 8 per item; strip 192 × 8 | one role prop each, head- or hand-anchored, offset per frame from a table: headset (router), price tag (Catalogue), chef hat (Kitchen), crate (Purchasing), ledger book (Finance), clipboard (People), feedback card (Customers), thermometer (Compliance), scroll chart (Market), scales (steady), tag with asterisk (discounter), ribbon (premium) | P-PROP-01 |
| D1 | `desk.png` | 32 × 24 | 3 frames: monitor off · on · on-flicker (tool call) | P-FURN-01 |
| D2 | `desk-icons.png` | 8 × 8 each; strip 64 × 8 | one plaque icon per specialist desk (same objects as role props, simplified) | P-ICON-01 |
| D3 | `chair.png` | 16 × 16 | 2 facings: back, side | P-FURN-02 |
| D4 | `reception.png` | 48 × 24 | counter + bell, 1 frame | P-FURN-03 |
| D5 | `owner-desk.png` | 48 × 32 | desk with empty chair and lamp, 1 frame | P-FURN-04 |
| D6 | `inbox-tray.png` | 16 × 8 | 4 frames: empty · 1 paper · 2–3 · 4+ | P-PROP-02 |
| D7 | `paper.png` | 8 × 8 | 4 frames: draft (amber corner) · approved (green stamp) · rejected (red stamp) · expired (slate) | P-PROP-03 |
| S1 | `supplier-desk.png` | 32 × 24 | plum-trimmed desk, 1 frame | P-SUPP-01 |
| S2 | `supplier-tape.png` | 16 × 16 | plum diagonal floor-tape tile, seamless | P-SUPP-02 |
| S3 | `partition.png` | 16 × 32 | glass panel, tileable vertically | P-SUPP-03 |
| B1 | `board.png` | 96 × 32 | cork board in a wood frame, empty (nodes and edges drawn at runtime) | P-ENV-02 |
| B2 | `pin.png` | 8 × 8 | 2 frames: idle (teal) · lit (`graph.query` touched it) | P-ICON-02 |
| E1 | `tiles-floor.png` | 16 × 16 ×3 | seamless floor variants | P-ENV-01 |
| E2 | `tiles-wall.png` | 16 × 16 ×3 | wall, wall + skirting, window (2 tiles) | P-ENV-01 |
| E3 | `door.png` | 32 × 32 | 2 frames: closed · open | P-ENV-03 |
| E4 | `props-misc.png` | 16 × 24 each; strip 64 × 24 | plant, filing cabinet, water cooler, coffee mug (8 × 8 in-cell) | P-PROP-04 |
| U1 | `bubble.png` | 9-slice, 4 px corners, 24 × 16 | 2 tail directions (left, right); text is a DOM overlay | P-UI-01 |
| U2 | `bubble-icons.png` | 8 × 8 each; strip 96 × 8 (dots use 3 cells) | thinking dots (3f @4) · `!` awaiting (amber) · `?` cannot verify (slate) · `×` error (red) · ⇄ simulated A2A (plum) · ✓ done (green) · document (draft) · magnifier (tool) · book (skill) · pin (graph) | P-UI-02 |

## 5 · Trace event → what is drawn (T-066 contract; only actors in the trace are drawn)
| `trace_event.kind` | Drawn |
|---|---|
| `route` | router speaks at reception; the routed specialist walks in by the door to its desk |
| `skill_load` | actor reading + book bubble |
| `subagent_start` / `_end` | sub-agent walks in to its desk / returns to idle |
| `tool_call` / `tool_result` | typing + magnifier bubble, monitor flicker / idle. `graph.query`: walk to the board, touched pins lit |
| `a2a_send` / `a2a_receive` | Purchasing ⇄ the named supplier desk, plum ⇄ bubble; the supplier's DOM label always reads "Simulated supplier" |
| `finding` | actor speaks + pin bubble; label = trace short label |
| `draft` | actor walks a paper to the owner's tray (+1), returns, then **awaiting approval** with `!` until the inbox SSE changes the draft: approved → green stamp, rejected → red stamp, expired → slate |
| `abstain` | abstain pose + `?` bubble, label "Cannot verify" (i18n) |
| `error` | error pose + `×` bubble |
| any other | idle; never invent motion |

Desks of agents absent from the trace show an empty chair. Bubble text = trace short labels only, as text.
## 6 · Master prompt layers (paste L1 + L2 as message one of each session; L3 per image)
**L1 core master.** "Original pixel art for a small modern office, drawn for this project only. Three-quarter
top-down orthographic view. Strict 16-pixel tile grid; every logical pixel is a crisp square block of one
flat colour. One-pixel dark ink outline (#1C1B18) on characters and furniture, interior lines in the
material's darker tone. Light from the upper left; two shade tones and one highlight per material; no
gradients, no anti-aliasing, no dithering, no blur. Use only these colours: [32 hexes from §2]. Solid #FF00FF
background for cut-out. No text, letters, numbers, logos, signage, UI or watermark anywhere. Do not imitate
any existing game, sprite pack or artist. Friendly, calm, a little playful."
**L2 family modifiers.** *Characters:* "A sprite sheet on a grid of 16×24-pixel cells, one character, rows =
poses listed below, columns = frames, identical proportions in every cell, head 8 px wide, feet on the bottom
row." *Furniture/props:* "One isolated object centred on the key colour, exact pixel size given, shadow
1 px down-right." *Environment:* "Seamless tiles; edges must wrap." *Icons/UI:* "8×8-pixel glyphs, outline
only where it reads, centred."
**L3 per image.** One line naming the asset ID, exact pixel size, frames and poses from §4, and the role
prop. Example P-CHAR-01: "C0 base worker, neutral grey shirt, short black hair, skin 3; ten rows as listed…"
**Session rule:** generate ⚓ A0 first and re-roll until the founder approves it — A0 is the style contract.
Attach A0 to every later request ("match the style, palette and pixel scale of this image exactly"). 2–3
candidates per asset, keep one. Drift check every 5 assets against A0 (outline weight, head size, palette
count before quantising); on drift, re-paste L1 + L2 and regenerate.
**Model:** picked by live probe at generation, recorded per row (`UNVERIFIED` which; never `gemini-2.5-*`,
rule 13). Prompts verbatim in `art/office/PROMPTS.md` by prompt id.

## 7 · Pipeline: drops → mapping → processed
1. `art/office/drops/` — raw output, `<asset-id>__<prompt-id>__r<roll>.png`. **Gitignored**; the operator
   archives them; each kept drop's sha256 is logged (founder may flip to committed).
2. `art/office/MAPPING.md` — if the generator saved its own filenames: map by dimensions first, then by
   eye; full table recorded. Lanes never guess.
3. Process once, centrally, by script (T-066 owns it): key out `#FF00FF` → detect pixel scale →
   nearest-neighbour downscale to the logical size → snap every pixel to the §2 palette (fail if the
   nearest distance is too large) → optional hand cleanup (logged `hand_edit: yes`) → C1–C12 palette swaps →
   write `processed/`, then pack one atlas PNG-8 + JSON frame map.
4. `art/office/processed/` — one committed indexed PNG per asset in §4 (a few KB each). Packed from these:
   `apps/web/public/office/` holds the shipped atlas + frame map only; lanes consume nothing else.
5. `art/office/PROVENANCE.md` (from `provenance.template.md`): one row per drop, processed and shipped file;
   each row names the shas it was derived from, so every shipped byte traces to a dated generation.

## 8 · Byte budgets and gates (proposal — needs ratification; no ledger entry yet)
- Atlas ≤ 160 KB; frame map ≤ 8 KB; office total ≤ 200 KB transferred, measured from a production build.
- Loaded only on the back-office route: **0 bytes** of office art on `/pos`, `/kds`, `/order`, `/admin`.
- Gate (red-provable): shipped file > 1 KB and ≤ ceiling; palette ≤ 32 and ⊆ §2; processed + shipped rows =
  files in those directories (count the directories, not the log) with matching sha256 — CI checks those two
  kinds only (drops are not in git); every `derived from` resolves; dates ≥ build start; operators registered.
