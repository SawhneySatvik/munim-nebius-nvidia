# Handoff — production phases 1–4 (R54, R55), 15 Oct 2026

**Read first:** `CLAUDE.md`, `docs/plan/05-production-and-split.md` (the plan), ledger R54 + R55
(`docs/plan/00-decision-ledger.md`), DECISIONS "15 Oct" entries. This file says where the work stands and how to resume.

## The ask (founder, 15 Oct)
Pull Manjeet's Cobnut repo into this repo, fix everything, make **this repo production-ready** (phases 1–4 of plan 05),
**today, nothing cut**. Only then the Cup split onto Google Cloud (phase 5, not started). Shipyard may be bypassed; spin
agents directly. Founder answers so far:
- R54: Cobnut → `apps/web` with history; Manjeet's repo frozen (done, phase 0); Claude owns the frontend; standalone on
  Vercel + Supabase now, GCP at the split; Cup repo lean (only the deployed code + README + one architecture doc), no
  licence, filtered history kept; FalkorDB repo = fresh history (FalkorDB work still waits for the founder's explicit go;
  R12 window 15–18 Oct).
- R55: demo sign-in = person picker, demo passwords server-side, reseed on demand; Vercel **Hobby** (daily cron); two new
  Vercel projects **munim-cobnut** (`apps/web`) and **munim-api** (core-api + intel + suppliers-sim), deploy to production
  approved; DB = the **existing hosted Supabase project** (at migration 26; apply 0027–0029; seed Cobnut there).

**R62 (16 Oct): after the running lanes, follow `docs/plan/07-submission-plan.md` (Cup suite, then FalkorDB; ≤ 2 agents; heavy runs via `scripts/dev/heavy.sh`).**

**R56 (15 Oct, later):** after lanes C/D, the plan is `docs/plan/06-gaps-and-split.md` — phase 3c, known gaps
T-116–T-119, then the Cup on GCP (T-120–T-124) and the FalkorDB repo (T-130–T-133) in parallel; phase 4 trimmed.
Region Mumbai everywhere; AI recorded-only; no AI attribution in commits; push only on the founder's word.

## This session's goal (R57, 15 Oct 14:30)
A **complete, demo-ready Munim on Vercel + Supabase** (munim-cobnut + munim-api, deployed from GitHub so the founder can
monitor remotely) and **all Cup code ready** (the founder does the GCP setup tonight; the Cup repo is a separate export;
FalkorDB after the Cup). Push `main` after each green milestone, after a history scan for `.env`, `.run/`, keys and any
AI/Claude attribution.

**Sequence for the rest of the session (orchestrator):**
1. Commit each lane as it lands (T-114 → then `make ontology` and a full `make check`; T-121; T-116/T-117; T-125; T-126).
   First green `make check` → scan → **push** (milestone 1).
2. **T-122** neutral names (Opus; after T-114 and T-116 land — it touches env-root and config), then **T-123**
   `make export-cup` + history filter (Opus), then the **T-124** submission docs (README, architecture doc, deck outline,
   video script) — code only; GCP setup is the founder's tonight.
3. **Step B:** local journey (mock off, local stack, Cobnut) → hosted migrations 0027–0031 (`make dev-db`, session pooler,
   through `packages/config`) → hosted Cobnut seed (synthetic operator, Supabase demo accounts) → the founder types one line remotely,
   `! node deploy/vercel/env-setup.ts` (R57 E-5) → `deploy/vercel/deploy.sh` from this machine deploys both projects → production journey →
   T-119's measured checks. Milestone push after each green step.
4. T-118 (first to cut) if time remains; clean-up; DECISIONS close; final push.

## Status

| Phase | State | Evidence |
|---|---|---|
| 0 Freeze + ROFR email | done (founder) | — |
| 1 Import | **done, committed** | 67be0b5 (stub removed), 68bb04b (subtree import, 12 commits of IIITManjeet, dates kept), 55e4166 (workspace); `make check` ok 8/8 on the imported tree. (Ids after the 15 Oct history rewrite that removed AI attribution.) |
| 2 apps/web to the final pack + fixes + production mode | **done, committed** (88ef98c, T-112) | vitest 64/64, build, both smokes, 6/6 red-proofs, walk 72/72; report → `SCRATCH2/reports/lane-A.md`. Real-API sign-in deferred to 3c |
| 3a Cobnut world + demo accounts | **done, committed** (64fb0d7, T-111) | worldgen 73/73; real-intel run produced findings + Cares and licence drafts. Gaps it found → lanes C, D |
| 3a' Negotiation trigger, Cobnut recorded fixtures (Ask), compliance finding outlet | **done, committed** (b6dda3c, T-114) | journey green on a fresh PG (recorded); five curated Ask questions; follow-ups → T-127 |
| 3a'' Menu/outlet display order (migration 0030) | **done, committed** (9f43b76, T-115) | make test-db 467/467; core-api 43/43 + red-proofs; report `SCRATCH2/reports/lane-D.md`. Ontology freshness gate waits for `make ontology` after T-114's `make contracts` |
| D1 T-120 `adapters/gcp` (Identity Platform, Cloud Storage) | **done, committed** (8f5a220) | 8/8 + 15/15, tsc, boundaries; wiring is T-122 |
| D2 T-121 `infra/gcp` + `scripts/deploy-gcp.sh` | **done, committed** (4e851e3) | stub-gcloud harness 22/22 + red-proof; no image built (no Docker here); core-worker entry needs `blobStoreFromEnv` (T-116) and the neutral names (T-122); report `SCRATCH3/lane-T121.md` |
| C1 T-117 tick ledger (0031) + T-116 shared blob store | **done, committed** (31b6b43; ontology 0031 committed after) | db 474/474; red-proofs; `deploy/vercel/build.mjs` stages the blob adapters |
| T-125 live + recorded fallback | **done, committed** (eba2d32) | 15 tests, intel 883; run-level over-cap wiring → T-127 |
| T-127 demo path on the real system (0032 rfq authority, 0033 per-outlet forecast, budget route, run-level over-cap, ingestion fallback, Cobnut suppliers + budget, live env per R58) | **done, committed** (e491210) | db 482, core-api 1053, intel 905; e2e with no SQL. **T-127b** (R59: ₹0 role prices + ₹100 monthly AI budget via operator drafts; Cobnut budgets for 3 months; live-mode fallback e2e) **in progress** → `SCRATCH3/lane-T127b.md` |
| T-122 + T-123 neutral names, `make export-cup`, filtered history | **done, committed** (841b2d1; restores a buildable HEAD after 7046272 swept in staged moves, gotcha 40) | export not yet run for real: `make export-cup EXPORT_ARGS="--check --history"` → `projects_26/food-ops-cup` (plan 07 C5). AU pack kept (R60 C-4) |
| T-126 Vercel wiring (`deploy/vercel/deploy.mjs` from this machine, founder-run `env-setup.ts`, dispatch-only workflows, `bom1`) | **done, committed** (43db237) | 53/53 tests; order: `deploy.mjs --project munim-api` (records the origin) → `make dev-db THROUGH=31` + hosted Cobnut seed → founder `! node deploy/vercel/env-setup.ts` → `deploy.mjs` both. Watch whether `vercel link --yes` connects Git (then `vercel git disconnect`). SUPABASE_SECRET_KEY probe: cannot reach book schemas |
| 3b Vercel adapter for munim-api + spike | **done, committed** (9c20ef9, T-113) | spike → `SCRATCH/reports/lane-B2-spike.md`; report → `SCRATCH/reports/lane-B2.md`; `make check` 8/8 on the tree before both commits |
| 3c Local integration gate, hosted migrations, seed, deploys | **in progress.** Milestone 1 pushed (5974eb2). Founder ran `env-setup.ts` (23 set incl. GEMINI_API_KEY and MUNIM_MODEL_MODE=live; 5 missing by design). **munim-api live: https://munim-api.vercel.app** (bom1; /health ok, migration 26; staged from `~/.cache/munim-deploy/api-out`, outside the repo — gotcha 39). Orchestrator set SUPPLIERS_SIM_PUBLIC_URL, MUNIM_CORE_URL (munim-api) and MUNIM_API_ORIGIN (munim-cobnut) by hand; `.run/vercel/api-origin` written. **Hosted DB migrated to 0033** (`make dev-db THROUGH=33`, 17 pass / 0 fail, 15 Oct night); role passwords rotated and **re-set in munim-api from `.run/db-roles.json`** by the orchestrator (no `.env`). **Next, after T-127b and T-122/T-123 land (deploy stages the working tree):** hosted Cobnut seed with demo accounts and `SUPPLIERS_SIM_PUBLIC_URL`, set NEXT_PUBLIC_MUNIM_STOREFRONT_KEY / MUNIM_DEMO_TENANT_ID / MUNIM_DEMO_PASSWORD on munim-cobnut, deploy both, production journey | gotcha 39; stray project `vercel` created by the first attempt was removed |
| 4 Production-ready gate | not started | — |

SCRATCH = `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad`
(session scratch; **it may be gone in a new session** — the briefs are summarised below so they can be re-issued).
SCRATCH2 = `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/7e5cfc8c-21e0-4ef3-917e-c858ea111286/scratchpad`
(the resuming session's scratch, 15 Oct afternoon: lane-A/C/D reports, `check-1.log`/`check-2.log`, walk screenshots `shots-A/`).
SCRATCH3 = `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad`
(third session, 15 Oct from 14:00: lane-C.md and lane-T121.md reports). Plan from here: `docs/plan/06-gaps-and-split.md`. **R58 (15 Oct): the Vercel demo runs live Gemini with the recorded fallback too.** GO2 = `SCRATCH/sync/GO2` (created by the orchestrator when milestone 1's `make check` is green; lanes T-127 and T-122/T-123 wait for it).

**Founder answers (15 Oct, resumed session):** hosted operator for Cobnut = the **synthetic seed operator**
(`worldgen-cobnut-operator`, `MUNIM_SEED_OPERATOR=1`), same as the other hosted worlds. Hosted DB (read-only probe):
migration 26, 11 non-demo synthetic tenants from repeat seeds, 4 synthetic operators, no Cobnut. Claude reaches the hosted
DB only through `packages/config` (`make db-ping` or a `loadRepoConfig` script) — `.env` is never opened.
**Incident:** the embedded Postgres behind the old local backend on :8790 (`scripts/dev/local-db.ts`, PID 36261 parent,
data dir `$TMPDIR/munim-pg-MiBpGH`, 209 MB, throwaway dev data) was stopped by mistake; data dir kept. Phase 3c builds
its own local stack, so it is not restored unless the founder asks.
Lane briefs (copied into the repo): `docs/plan/prod-briefs/brief-{A,B1,B2}.md` and the shared spec `interface.md`;
sync reports `SCRATCH/reports/sync-{review,build,live}.md`. The lanes do not commit; the orchestrator does, by ticket,
staging by name.

## If you resume in a new session
1. `git status` — lane edits may be uncommitted in the tree. Do **not** discard them. Run the gates below on what is
   there; commit what passes by area (apps/web; tools/worldgen; services + deploy/vercel).
2. If SCRATCH is gone, re-create the briefs from the summaries below and re-run the unfinished lanes.
3. Then do phase 3c and 4 as written here.

### Phase 1 — what was done (for reference)
- History scan of all 12 Cobnut commits: no tokens/keys/`.env`/forbidden words; `sfk_` only public mock keys; the
  teammate's email appears only as commit author.
- Imported with `git fetch <url> main` + `git subtree add --prefix=apps/web FETCH_HEAD` (no remote created).
- Removed `.claude/`, `AGENTS.md`, `package-lock.json`, `docs/screenshots/`. `@munim/web`; `@munim/sdk: workspace:*`
  (the `/v1/me` shim in `lib/munim/types.ts` replaced by SDK types); `openapi-fetch 0.17.0` direct (pnpm strictness);
  TypeScript 6.0.3, Vitest 5.0.3, @types/node 22.20.5 (monorepo pins); `transpilePackages: ["@munim/sdk"]` and
  `allowImportingTsExtensions` (the SDK is TS source). `pnpm-workspace.yaml` allowBuilds esbuild/unrs-resolver: false.
- dependency-cruiser resolves `@/*` through `tsconfig.depcruise.json`. Lockfile: 362 packages added, none removed/changed.

### Lane A brief (apps/web) — summary
Merge Cobnut to the final owner-screens pack (`docs/handoff/owner-screens`, 45d35ce): merge base = the pre-integration
pack's code (`SCRATCH/integrate/orig` markdown; extract with `SCRATCH/integrate/extract.mjs`); classes per
`sync-review.md` (verbatim / three-way `git merge-file` / hand-port for his own `pages/cares.tsx`, `pages/suppliers.tsx`);
delete `lib/munim/draft-decision.ts` (one approval module); every review fix present (outlet gate over every target
outlet, per-type role gate, mock never rewrites `command_payload`, per-viewer refs, Cares/PO cards on the inbox draft
page, PO price traced, stale/dropped-write copy, `iso_week` from clock, drawer recipient badge, `outletsState`, smoke
completes its order). Add manager **Farah Qureshi (Gomti Nagar)** and a two-outlet draft to the mock. Phone fixes (Suppliers
too wide at 390; ≥ 48px tap targets; Mock pill overlap; outlet picker; name on phones; page titles; one time format;
drawer id columns). "Sample data" badge (hard rule 5). Production mode: `/mock/v1/*` 404 unless `MUNIM_MOCK=1`;
`/api/:path*` rewrite to `MUNIM_API_ORIGIN`; `POST /staff/demo-session` (Supabase password grant server-side for
`<key>@cobnut-demo.invalid` with `MUNIM_DEMO_PASSWORD`; local variant reads `MUNIM_DEMO_TOKENS`); new README.
Gates: tsc/eslint/vitest/next build 0; smokes ok on the mock; red-proofs (manager on Cares draft, Farah on the two-outlet
draft, edits leave the payload, staff never see Approve); headless walk of every screen × four people at 1280 and 390, zero
console errors, no sideways scroll.

### Lane B1 brief (tools/worldgen) — summary
`make seed WORLD=cobnut`: Cobnut Bakehouse, `is_demo`, IN/INR/Asia/Kolkata; outlets Cobnut Hazratganj (GSTIN + FSSAI)
and Cobnut Gomti Nagar (none), kind restaurant; catalogue + coupons = `apps/web/mock-server/data.ts`; storefront key to
the run dir; people Nandini Mehrotra owner `*`, Farah Qureshi manager Gomti Nagar, Imran Siddiqui staff counter
Hazratganj, Kavya Tandon staff kitchen Hazratganj; dated history so owner-home figures, findings and drafts exist
(butter waste, sourdough near expiry → Cares listing draft, PO draft from negotiation); simulated suppliers and Cares
recipients as the mock; Cares enabled by operator; a two-outlet draft if any real flow makes one. Demo accounts for
`MUNIM_IDP=supabase` (one generated password into the run dir) and a tokens file for `MUNIM_IDP=local`. Reseed = rerun.
Gates on a fresh local DB (never 8790, never hosted): counts/roles/menu diff (red-proved), apps/web smokes against it.

### Lane B2 brief (deploy/vercel + platform-neutral services) — summary
Spike from current Vercel docs: Python function size vs intel deps (local site-packages 183 MB); Hobby limits
(duration, cron once a day); SSE through a function and through apps/web's external rewrite; Supabase session-pooler cap
vs one LISTEN per stream; what core-worker work moves to a cron route; secrets/config names, including those in `.run/`
today. **If intel cannot fit, stop → founder.** Build: an authenticated, idempotent core-api sweep route (platform-neutral)
reusing core-worker code; env-only boot in production; SSE max lifetime with clean close; `deploy/vercel/` (entries,
`vercel.json`, daily cron, README with project settings, **env var list**, deploy commands, key rotation); migration
runbook for 0027–0029 (not run). Local proof of the entries against a local embedded PG.


## Go-live 3 (16 Oct, evening) — screens wave live, milestone 2 pushed
- **Pushed** c784ea8 to food-ops (T-128 screens + C2). Hosted DB at **0034**; munim-api and munim-cobnut redeployed at
  c784ea8 from clean worktrees; **tenant edfb6eec-2a31-7bd5-aaa7-a5530aabbc00** (seed `cobnut-golive3-10161707`).
  SDK **0.3.0** committed (e70216b); munim-rho redeploy for it and the T-128 status lines in progress.
- **Journey (66 shots, `SCRATCH/golive3/shots/`):** all-outlets (18 chips), office + desk, a live margin-fall investigation
  (Plan, 12 s, 20 chips), page builder (v1 saved; publish refused `demo_protected`), campaign approved → "Sent (simulated)",
  and the core journey. RFQ passed on the 2nd try and Ask on the 3rd: **Gemini 5xx on flash-lite** → C3 item 9 (bounded
  retry). Office trace replay 400 (`limit=500` > core's 100) → C3 item 8. Plugin `_ResourceExhaustedError` label → C3 10.
- **Seeding now needs two Vercel ticks in two different UTC hours** (T-128's second import batch parses only after the
  first is approved). Re-running the same seed name resumes the same tenant. A 28P01 right after `make dev-db` rotated the
  role passwords cleared in ~2 min (pooler credential cache, UNVERIFIED).
- **Lanes now:** C3 clean-up (+ items 8–10), C4 Cup docs (Sonnet + Haiku), F3 FalkorDB Lane A (core) and Lane B (map +
  intel) in the worktree `~/.cache/munim-wt/f3` (branch `f3-falkordb`). Export checks of uncommitted work use
  `SCRATCH/sync/export-wt.sh` (temp index + dangling commit; `make export-cup` exports a commit, never the tree).

## Go-live status (16 Oct, afternoon) — Vercel demo working end to end
- Fixes committed 4ebe1f8. munim-api deployed from a **clean worktree** `~/.cache/munim-deploy/api-src` (gotcha 42); hosted
  tenant `52836e26-619f-7e6f-b77d-b050a1e5805a` (seed cobnut-golive2-10161059); munim-cobnut at 4ebe1f8. Production journey
  20/22: storefront → kitchen → counter → owner home + chips → Request quotes (live extraction) → PO draft both outlets →
  Farah 403 → Nandini approves → lineage. Ask live failed on the gemini-3.8-flash free-tier quota (429); trace-label bug for
  `_ResourceExhaustedError` handed to C2 (item 9). The 120 s CDN first-byte limit on the /api rewrite is still unmeasured.

## Go-live and design status (16 Oct, ~02:30 IST)
- **Live:** munim-rho (redesigned site, R61, prod on the founder's word), munim-api, munim-cobnut (https://munim-cobnut.vercel.app;
  tenant ef8c3b84-…, seed cobnut-golive-10152020). Production journey: storefront → kitchen → counter → owner home + source
  drawer PASS; RFQ/PO/Ask blocked (flash-lite 400, Ask 90 s timeout, no Request-quotes UI, no seeded shortfall); tracker
  "link isn't valid" after checkout (cache). T-119 all measured OK (bom1, rewrite, SSE reconnect 271.9 s, tick 404, no Git).
- **Go-live fix lane** running (`prod-briefs/brief-golive-fix.md`, R63 ≤ 20 live calls): Part 1 fixes → orchestrator
  commits → Part 2 reseed + redeploy + full journey (`SCRATCH/golive2/`). Then `make check` + push milestone 2, then plan 07.

- munim-api redeployed on HEAD: `/health` ok, migration 33, idp supabase. **Go-live lane** running (`prod-briefs/brief-golive.md`): synthetic operator + Supabase demo accounts, hosted Cobnut seed, munim-cobnut env + deploy, production journey, T-119 checks → `SCRATCH/golive/report.md`.
- S2 (developer portal) done, uncommitted (shares globals.css with S1; commit both together).

## Screens wave (R66, 16 Oct)
- T-128 lane (`prod-briefs/brief-T128-screens.md`): audit → founder questions → build every remaining screen after `SCRATCH/sync/GO3` (created by the orchestrator when the go-live fix lane's Part 1 is committed) → site status lines. Report `SCRATCH/t128/report.md`.

## Film track (R65, 16 Oct)
- Munim launch film, two cuts (Cup < 3:00, full ~6:00), recreated UI in HyperFrames at `video/munim-launch/`. Spec
  `docs/superpowers/specs/2026-10-16-munim-launch-film-design.md`, plan `docs/superpowers/plans/2026-10-16-munim-launch-film.md`.
  Video lane running: Tasks 1–3 (scaffold, fixture, scripts, motion kit, 4 style frames) → founder checkpoint "style
  approved" → spike (scene 3) → "spike approved" → full build → renders. Founder checkpoints are relayed by the orchestrator.

## C3 clean-up must include (found 16 Oct)
- `make export-cup EXPORT_ARGS="--check"` exits 2 at HEAD: 8 "Vercel" words in committed apps/web files (go-live's PPR comments,
  README) and `packages/config/src/index.ts` — reword provider-neutrally (hard rule 2 for the export).
- Ask cites an outlet by its raw id (snapshot cell `outlet_id`) — show the outlet name.
- GCP runbook: the synthetic operator's `platform.operator` row needs one admin SQL insert (no route creates operators).
- C2 not done: per-IP rate limiter (hop count unmeasured), unique index on invoice series.

## Security (C1 done, R64; C2 committed 5e60917)
- C1 report: `SCRATCH/c1/security-review.md` (0 sev 1, 7 sev 2, 21 sev 3). C2 brief `prod-briefs/brief-C2-security-fixes.md`
  starts after the go-live fix lane's Part 1 is committed. F1 FalkorDB design lane running (`prod-briefs/brief-F1-design.md`).

## Design track (R61, 16 Oct, in parallel)
- **Munim site (`apps/site`) redesign, "Ledger, softened"** (founder-picked blend of Bahi-khata × Stall board on
  https://claude.ai/artifact/8ayrD2FZNjxSstekiudqxt; copy in `docs/superpowers/specs/assets/munim-directions.html`).
  Spec `docs/superpowers/specs/2026-10-16-munim-site-ledger-softened-design.md`; plan
  `docs/superpowers/plans/2026-10-16-munim-site-ledger-softened.md`. Founder approved building **every** page, then a
  **Vercel preview** (not prod) of munim-rho; prod only on the founder's word. Lanes: **S1** (tokens, fonts, shared parts,
  home, Cares, contact; creates `SCRATCH/design/GO-S2`), **S2** (developer portal, quiet variant; waits for GO-S2).
- **Cobnut keeps its own brand** (staff screens + storefront). Brand audit: mostly consistent; the polish lane fixes the
  findings (`prod-briefs/brief-cobnut-polish.md`; modals top-left, shop menu 414px at 390, phone staff header, etc.).

## Phase 3c — orchestrator (after the lanes)
1. Commit each lane's work after re-running its gates; read every shared-file diff (`Makefile`, `packages/config`,
   lockfile) before staging. Install any dependencies the lanes asked for yourself.
2. **Local integration gate:** seed Cobnut into a local DB, run core-api/intel/suppliers-sim locally (not on 8787/4102;
   leave 8790 alone or use separate ports), run apps/web with the mock off, `MUNIM_API_ORIGIN` → local core-api,
   `MUNIM_DEMO_TOKENS` → the local tokens file. Smokes + one full journey: web order → kitchen board → hand-over at the
   counter → owner home source drawer opens → one approval from the inbox with its audit row (approver's name).
3. **Hosted:** apply 0027–0029 to the hosted project (`make dev-db THROUGH=0029` path per B2's runbook; session pooler);
   seed Cobnut there with demo accounts; record the tenant id and storefront key (never print the key or password).
4. **Vercel:** create **munim-api** and **munim-cobnut** (never touch the root `.vercel/` link = munim-rho; gotcha 38: deploy
   from the directory B2's runbook names, checking `.vercel/project.json` there first). The founder sets secret values
   himself (`! vercel env add NAME production` per name in B2's list) — Claude never reads `.env` or sees values.
   Deploy both to production (approved, R55 S-3). Smoke against the production URLs; repeat the journey.

## Phase 4 — production-ready gate
`make check`, `make test-db`, `make eval` green; smokes against production; screenshots of every screen state at 1280 and
390 into `.screenshots/<ticket>/` and show the founder (visual sign-off); one adversarial review of the whole frontend +
deploy with the guarantee scan (both clauses), ≤ 2 fix cycles; clean-up (CLAUDE.md stack line + doc map: `apps/web` =
Cobnut, packs = history; BOARD.md; drop `git stash@{0}` only on the founder's word); DECISIONS close entry; push to
`SawhneySatvik/food-ops` only on the founder's word after a history scan for `.env`, `.run/`, keys.

## Notes from lane B1
- Reseed: `MUNIM_SEED_OPERATOR=1 make seed WORLD=cobnut` (needs a `platform.operator` row for `worldgen-cobnut-operator` in that DB); prints the tenant id and paths of `storefront-key`, `demo-tokens.json`, `site.env` under `$MUNIM_RUN_DIR/cobnut/`.
- Hosted seeding needs an operator: `demo-accounts.ts` takes the operator from `MUNIM_SEED_OPERATOR_TOKEN` — a real person's sign-in, never a demo account (R24 config drafts are named-person approvals). **Ask the founder who is operator on hosted** at phase 3c.
- Tax class `restaurant_5` (no `bakery_5` in the IN pack; same 5%).
- Not producible on the real world: the mock's prep-time draft and ticket-drift finding (server-stamped ticket times). Mock-only; say so in the demo script.

## Open founder items
F-3 AI prices + budget cap (live Gemini stays off until answered; recorded models meanwhile); GCP project + budget (phase
5); the word to push; FalkorDB go/skip (window 15–18 Oct); till shift close (Q6); counter staff receiving goods (Q19).
Known leftovers: a paid order in `preparing` on the local dev DB from the teammate's old smoke (void it in phase 4).

## Known gaps after R71 (17 Oct, not founder-blocking)
- `consented` is one email-OR-sms count; `campaignCreate` does not check a campaign's channel against the cited cell, so an
  SMS campaign on `{marketing}`-only customers would see a non-zero audience. Latent: non-demo campaign drafts are refused
  (`campaign_audience_unscoped`) and no message leaves Munim. Fix: per-channel cells or a channel check.
- `consentHandler` overwrites the whole consent object with `{marketing, at}` — a customer re-ticking "Send me offers"
  clears a staff-written `email:false`; nothing can grant `consent.sms` yet.
