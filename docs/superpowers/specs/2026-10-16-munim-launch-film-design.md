# Munim launch film: "A day at Cobnut Bakehouse" (16 Oct 2026)

**Status:** approved by the founder (AskUserQuestion rounds, 16 Oct; ledger R65).

## Purpose and cuts
A production-ready, animation-heavy launch film for **Munim** (the product), told through one day at Cobnut Bakehouse (a
synthetic two-outlet Lucknow bakery that runs on Munim). Two cuts from one scene library:
- **Cup cut:** 2:45–2:55, **strictly under 3:00** (Cup T&C, `docs/admin/cup-tnc-snapshot-2026-10-13.md` line 28).
- **Full tour:** about 6:00, every feature.
- 1920×1080, 30 fps, H.264 + AAC; loudness about −14 LUFS integrated, −1 dBFS true peak.

## Rules that bind the film
- **Hard rule 1:** fresh code and original assets. The Snacky Shack video (`projects_26/the-snacky-shack/brag-output`) is a
  reference for **method only**; no file, code, art, music or copy is reused. Icons are drawn fresh or from an open-source
  icon set recorded in the provenance log; fonts are Google Fonts (OFL) as on the site.
- **Hard rule 5:** in-app "Sample data"/"Simulated" labels are hidden in the recreated screens (founder, R65), and the film
  carries **one clear disclosure card**: "Synthetic business · simulated suppliers · payments recorded, not processed."
  Payment *processing* is never shown as real (it stays "recorded"); everything else may be shown as built.
- **Not-yet-built features shown as built (founder's call, R65):** the drag-and-drop storefront page builder, customer
  campaign messages (drafted by AI, sent only after approval), an Australian outlet on the AU pack, and the AI back-office
  "office" visual (specialists at desks).

## Checkpoint 1 decisions (founder, 16 Oct: "style approved")
- Cup cut end card: Munim · "Built with Gemini on Google Cloud" · the Cloud Run URL (hard rule 2: no Vercel on the Cup cut); the
  full tour's end card shows munim-rho.vercel.app.
- Checkout: FIRST50 refused with the app's real message, then COBNUT10 applied (₹1,398.60).
- Disclosure card: "Synthetic business · simulated suppliers and recipients · payments recorded, not processed."
- The full tour's Australia beat uses the seeded AU business, Laneway Cafe Fitzroy; the A2A chat and deal review are a labelled
  behind-the-scenes view of the real backend run.

## Checkpoint 2 decisions (founder, 16 Oct: "spike approved")
- Narrator: Emma (`bf_emma`), Kokoro, local.
- The owner's brief moves to about 8:10 am ("Ten past eight."), four early orders since the 8 am opening (online orders are
  refused while an outlet is closed).

## Look
- **Munim chrome** (titles, captions, transitions, end card): the site's "Ledger, softened" tokens (R61): paper `#f3ead7`,
  ink `#1b1611`, ledger red `#b4232a`, turmeric `#f0b429`, ruled lines `#a9bccb`; Bricolage Grotesque, Atkinson
  Hyperlegible, IBM Plex Mono; 2.5px ink outlines, 4px hard shadows; ledger-page wipes between scenes.
- **Cobnut screens:** Cobnut Bakehouse's own look (apps/web tokens: cream, hazelnut brown, rose-berry; Fraunces + Inter),
  recreated faithfully from the real components, inside device frames (phone for the customer, tablet for the kitchen and
  counter, laptop for the owner and the developer portal).
- **The AI office:** an original illustration set (eight specialist desks + the Manager), drawn fresh in SVG/CSS in the
  ledger style, with a dated provenance note.

## Story (Cup cut timings; the full tour extends each scene)
| # | Scene | Cup | Content |
|---|---|---|---|
| 1 | Cold open | 0:00–0:10 | Ledger paper; ink-stamp words on the beat: "Thin margins." "Late nights." "Books that don't add up." Munim logo lands. |
| 2 | Meet Cobnut | 0:10–0:20 | Munim site hero → zoom out to a stylised Lucknow map with two outlets (Hazratganj, Gomti Nagar): "Cobnut Bakehouse runs on Munim." |
| 3 | 7 AM brief | 0:20–0:38 | Nandini's owner home on a laptop: figures count up; ink encircle on waste ₹4,872 vs ₹1,512; source drawer opens: "Every number traces to a row." |
| 4 | 8:30 order | 0:38–1:00 | A customer's phone: menu (Regular before Large) → Hazelnut Praline Cake (1 kg, eggless, message) → checkout with FIRST50 → order placed → live tracker. |
| 5 | Kitchen + counter | 1:00–1:18 | Ticket flies phone → Kavya's kitchen board (Start → Ready); Imran's till: walk-in order, card **recorded**, hand-over. |
| 6 | AI back office | 1:18–1:45 | The office: watchers light up (butter waste, hazelnut shortfall). Ask Munim: question → 2–3 s "thinking" → answer streams with source chips; one honest "Cannot verify". |
| 7 | Negotiation | 1:45–2:15 | "Request quotes" → three simulated suppliers (Steady, Discounter, Premium) bid in animated A2A chat → deal review → PO draft with traced qty/price → Farah (manager, Gomti Nagar) is refused → Nandini approves → "Approved by Nandini Mehrotra" + lineage. |
| 8 | Munim Cares | 2:15–2:32 | Closing time: sourdough near use-by → AI listing draft → owner approves → Riverside Night Shelter matched → pickup 9:00–10:30 pm → impact counter. |
| 9 | Developers + also in Munim | 2:32–2:45 | Dev portal + SDK snippet; quick montage: storefront page builder, campaign drafts, Australian outlet on the AU pack. |
| 10 | Close + disclosure | 2:45–2:55 | "Nothing changes your books without your approval. Every number traces to a row." End card: Munim, munim-rho.vercel.app, "Built with Gemini on Google Cloud"; disclosure card. |

The full tour adds: the Munim site and Cares network page, more of the owner home and inbox, the staff picker and roles,
counter modifiers and receipts (GST tax invoice), the kitchen's Now/Later lanes, more Ask questions (labour %, Cares
impact), the supplier and goods-received screens, findings and dismissals, the developer portal's reference and the SDK
download, and each "also in Munim" feature at full length.

## Motion and sound
- **Motion kit (written fresh):** camera zoom/pan, a cursor with pointer/hand/text states and tap ripples, hand-drawn ink
  encircle, turmeric highlighter swipe, number count-up, toasts, sticker captions, ticket flight, AI thinking indicator and
  token streaming, chat bubbles for supplier bids, ledger-page wipes. Every caption holds long enough to read; nothing
  depends on motion alone.
- **Voice:** a narrator generated locally with HyperFrames' Kokoro TTS (audition `bm_george` and `bf_emma`; pick one),
  captions on screen. Script in plain, confident English.
- **Music:** an original instrumental composed in code for this film (or a free local music model if one is available);
  ducked under the narration. **SFX** synthesised in code (clicks, whoosh, order chime, stamps, cha-ching for "recorded").
- **One clock:** a single timing file drives picture, captions, narration placement and audio.

## Data
One fixture consistent with the seeded Cobnut world: people (Nandini Mehrotra, owner; Farah Qureshi, manager, Gomti Nagar;
Imran Siddiqui, counter; Kavya Tandon, kitchen), outlets, the menu and prices from `apps/web/mock-server/data.ts`, the
suppliers and recipients from the world, the waste figures (₹4,872 vs ₹1,512), the hazelnut PO (1,000 g, ₹1,465.20 from
Steady). Every number shown adds up. AI answers are written to read like real Gemini answers, with source chips.

## Build and checkpoints
- Source in `video/munim-launch/` (committed; renders and large media git-ignored; excluded from the Cup and FalkorDB
  exports). HyperFrames CLI 0.8.163 (`npx hyperframes`), GSAP vendored locally.
- Checkpoints for the founder: (1) **style frames** — 3–4 stills (cold open, owner home with encircle, AI office, the
  negotiation) published as a private page; (2) a **spike** — scene 3 fully animated with VO and music; (3) the full
  build, both renders, published for review.
- Renders run through `scripts/dev/heavy.sh`; the lane respects the machine-load rules (R62 S-4).
