# Lane A — apps/web: final pack, fixes, production mode

Repo: `/Users/satviksawhney/Downloads/projects_26/foodops-os` (read `CLAUDE.md` first; it binds you).
SCRATCH = `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad`
Read `SCRATCH/sync/interface.md` (lane rules, names, env) — it binds you.
**Do not edit anything until the file `SCRATCH/sync/GO` exists** (a full `make check` is running on the tree). Read and
plan meanwhile; poll for GO with `test -f` every minute or so (use short sleeps in a loop, under 2 minutes per call).

Territory: `apps/web/**` only (except `apps/web/package.json` dependency changes: report them).

## Context
`apps/web` is Cobnut Bakehouse (the teammate's storefront + 15 staff screens), imported 15 Oct with history. It was
built from the **pre-integration** owner-screens pack (markdown in `SCRATCH/integrate/orig/`; its code blocks are
extracted at `SCRATCH/sync/orig-code/` — the merge base). The **final** pack is
`docs/handoff/owner-screens/*.md` (commit 45d35ce); its code blocks are extracted at `SCRATCH/sync/pack/` (regenerate
with `node SCRATCH/integrate/extract.mjs <dir> docs/handoff/owner-screens/*.md` if needed).
Reports to read first: `SCRATCH/reports/sync-review.md` (file-by-file classes: same / old-unchanged / old+his edits /
his own), `SCRATCH/reports/sync-build.md`, `SCRATCH/reports/sync-live.md`, `SCRATCH/reports/review.md` (the review the
final pack fixed).

## Work
1. **Merge to the final pack.** For each file in sync-review.md:
   - old version unchanged → take the final pack's file verbatim;
   - old + his edits → `git merge-file <his> <orig> <final>` (his = ours, orig = base, final = theirs); resolve by hand;
   - his own (`components/staff/pages/cares.tsx`, `suppliers.tsx`) → port the final pack's gate/label/card fixes by hand;
   - pack files he lacks (`components/staff/pages/purchase-order.tsx`, `supplier.tsx`, `tests/staff-copy.test.ts`) → add,
     and wire routes so nothing he built is lost;
   - delete `lib/munim/draft-decision.ts`; one approval module (`lib/munim/drafts.ts`) used by every decision surface,
     including `po-draft.tsx` and the Cares listing draft.
   Every review fix must be present: S2-1…S2-5, S3-1…S3-8, the outlet gate (every target outlet; null `outlet_id` =
   whole business), the role gate per draft type (core `roleAllowed`; check `services/core-api/src/modules/approvals/**`),
   mock never rewriting `command_payload`, per-viewer refs, Ask append scope check, `outletsState`, the stale-draft and
   dropped-write copy, `iso_week` from the clock, recipient badge in the drawer, the hardened staff smoke that completes
   its order, and the PO price tracing to the quote cells (so a PO draft can be approved as proposed).
2. **Seed** (mock): add the manager Farah Qureshi (Gomti Nagar) to the picker and mock, and a draft covering both
   outlets. Picker shows four people.
3. **Phone + polish** (sync-live.md): Suppliers 180px too wide at 390; Source tags, "Open Cares" link and Mock pill ≥ 48px
   tap targets; Mock pill must not cover prices or the Review button; outlet picker not truncated; signed-in name visible
   on phones; page titles on Cares and Suppliers; one time format on Cares; the drawer's repeated short-id columns.
   Hard rule 5: a visible **"Sample data"** badge on staff screens and the shop (is_demo; the tenant read gives `is_demo`
   on the real API — use it; on the mock it is always true).
4. **Production mode** (interface.md): `/mock/v1/*` answers 404 unless `MUNIM_MOCK=1`; `next.config.ts` rewrites
   `/api/:path*` to `MUNIM_API_ORIGIN` when set (plain Next rewrite, platform-neutral); the demo sign-in route
   `POST /staff/demo-session` exactly as interface.md says (Supabase password grant with server env; local variant reads a
   tokens file via `MUNIM_DEMO_TOKENS`); the picker uses it when not on the mock. Real-API sign-in must end in
   `GET /v1/me` like today. Check `services/core-api` for what `/v1/me/tenants` returns and what the SSE stream needs
   through a same-origin proxy (fetch-based SSE with bearer; the rewrite must not buffer). Update `.env.example` (names
   and public mock values only).
5. **README** for apps/web: replace the teammate's handoff notes with a short current README (what it is, env table,
   dev on the mock, dev against local core-api, scripts). Plain words; no history of the pack.

## Gates (run them; paste output in your report)
- `node_modules/.bin/tsc --noEmit` 0; `node_modules/.bin/eslint` 0; `node_modules/.bin/vitest run` all pass (his 47 + the
  pack's + yours); `node_modules/.bin/next build` 0 with every /staff route.
- Under `next start` on 4320 with `MUNIM_MOCK=1`: storefront smoke "smoke: all ok"; staff smoke "staff smoke: all ok".
- Without `MUNIM_MOCK`: `/mock/v1/health` → 404.
- Red-proofs (unit or mock-level, each must fail when its fix is reverted): manager on Cares draft → no Approve + mock 403;
  Farah on the two-outlet draft → no Approve + mock 403; approve-with-edits leaves `command_payload` unchanged; staff
  never see Approve.
- Headless walk (reuse `SCRATCH/sync/walk.mjs` / `SCRATCH/fix/render.mjs`): every staff screen as each of the four people
  at 1280 and 390 → `SCRATCH/sync/shots-A/`; zero console errors; `document.documentElement.scrollWidth <= 390` at 390 on
  every page.
- Greps: no "snacky", "juspay", "foodops", founder's email; every user-facing string in i18n/copy modules as the app
  already does.

## Report
Write `SCRATCH/reports/lane-A.md`: files changed (with line counts), every merge decision, the gate outputs, dependency
changes needed, anything left or wrong, what you did not do. Final message: ≤ 30 lines summary.
