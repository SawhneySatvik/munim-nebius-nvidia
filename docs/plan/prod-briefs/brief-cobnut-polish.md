# Cobnut polish — fix the brand-audit findings in apps/web (16 Oct)

Read `CLAUDE.md` (gotcha 18: 48px targets, 16px inputs). Cobnut Bakehouse keeps its own brand (R61): tokens in
`apps/web/app/globals.css`, staff tokens in `apps/web/app/staff/staff.css`, primitives in `apps/web/components/ui.tsx`.
Audit evidence: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/brand-audit/`
(`shots/`, `shots-states/`, `audit.json`, scripts `shoot.mjs`, `states*.mjs` you can reuse). Verdict: mostly consistent; fix:

1. **Modals open top-left** (shop item modal and the counter option sheet): `app/globals.css:252-257` `dialog.modal` —
   Tailwind preflight's `margin: 0` beats the dialog's UA `margin: auto`. Add `margin: auto`.
2. **Shop menu at 390 is 414px wide** (sideways scroll). Find the overflowing element and fix it.
3. **Staff header on phones stacks to ~190px over 4–5 rows; tabs clip ("Care…")** (`components/staff/shell.tsx:129-158`,
   `staff.css:22-31`): one compact sticky row on phones, nav tabs scroll with a visible fade cue, the "Sample data" and
   "Demo sign-in" badges merged into one row. Labels must stay (hard rule 5).
4. **Purchase-order detail lights no tab** (`shell.tsx:155`): match `/staff/purchase-orders` for the Suppliers tab.
5. **Unknown `/staff/...` URLs fall through to the shop's not-found**: add `app/staff/[...rest]/page.tsx` calling `notFound()`
   and `app/staff/not-found.tsx` (FullPage, "Back to home").
6. **Titles without the berry swash** on kitchen (`kitchen.tsx:103`), draft detail (`draft-detail.tsx:215`): add
   `section-title`. Leave the counter (till).
7. **`<SimulatedSupplier/>` inside the supplier h1 renders in Fraunces** (`pages/supplier.tsx:92`): move it out of the h1 or
   set the sans face.
8. **`.offline-bar` duplicates ui.tsx `OfflineBanner`** with a different look and the only raw hex (`staff.css:140`, used in
   11 files): give `OfflineBanner` a `top` prop, use it in staff, delete `.offline-bar`.
9. **Content widths and left edges differ** (`staff.css:34`, `sign-in.tsx:27`, `draft-detail.tsx:206`, `supplier.tsx:89`,
   `purchase-order.tsx:140`): full-bleed only for till and kitchen; everything else on one `--staff-max` with one gutter
   aligned with the bar's wordmark.
10. **Scallop strips used as tape** under titles (`supplier.tsx:93`, `purchase-order.tsx:147`): remove (scallops only divide
    full-bleed bands, as in the shop).
11. **Off-scale radius** `rounded-[18px]` (`ask.tsx:36,248`) → `var(--radius-card)`; **inline style** in `order-bits.tsx:84`
    → a `.note-ok` class beside `.pill-ready`.
12. **Targets under 48px**: `staff.css:25` (select 44px), `:29` (`.staff-nav .chip` 44px), `till.tsx:29` (badge override) →
    48px; fold `.pill` into `.badge` variants in globals.css (`.pill` is a near-copy) and `.sim-badge` likewise.
13. **Demo bar wording on /staff**: the root bar says "Sample shop — orders are not real" above the staff badges; on /staff
    use staff-aware copy ("Sample business — synthetic data, simulated suppliers") — keep a label, change only the words.
14. **Palette**: keep the plum source-chip colour (`--src #5b3a78`, the "ledger stamp" next to every figure) and promote it
    and the status tokens (`--warn`, `--ok-bg`) into `globals.css`; alias `--late` to `--danger`.

## Gates
`tsc --noEmit` 0, `eslint` 0, `vitest run` all pass, `next build` 0; both smokes on the mock (`MUNIM_MOCK=1`, port
4480–4489); re-run the audit's `shoot.mjs` and states scripts: every staff screen and the shop at 1280 and 390, **no
sideways scroll anywhere** (shop menu included), modals centred, phone header one row; screenshots into
`/private/tmp/…/scratchpad/brand-audit/after/`. Report before/after for items 1, 2, 3 (screenshot paths).

## Limits
Territory: `apps/web/app/**` (not `app/api`, not `lib/server/**`), `apps/web/components/**`, `apps/web/app/globals.css`,
`apps/web/app/staff/staff.css`. **Lane T-122 is editing `apps/web/lib/server/**`** — do not touch it. Never `.env`; no
commits; no AI attribution; never ports 8787/4102/3000; leave 8790/8090 alone. Report:
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/brand-audit/fixed.md`
(the orchestrator reads it; if the Write tool refuses a report file, return it as text). Final message ≤ 20 lines.
