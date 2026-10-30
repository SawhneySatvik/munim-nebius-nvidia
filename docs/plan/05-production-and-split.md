# Production and split plan (R54, 15 Oct 2026)

> **Superseded from phase 4 on by `06-gaps-and-split.md` (R56):** phase 4 trimmed, a known-gaps step added, phase 5
> (Cup on GCP) and the FalkorDB repo detailed there. Phases 0–3 below remain the record.

**What this is.** The order of work from today to a submitted Cup entry: pull Cobnut into this repo, make this repo
production-ready on Vercel + Supabase, then split a lean Cup repo onto Google Cloud. This repo stays the single source
of everything; the Cup repo is an export of it. Decisions are in the ledger (R54); this file is the plan.

## Starting point (checked 15 Oct)

- Backend closed: core-api, core-worker, intel, suppliers-sim; migrations 0001–0029; `make check` green on 45d35ce.
  Hosted Supabase is at migration 26 (0027–0029 not applied there). Nothing of the backend is deployed; it runs locally.
- `apps/web` is a two-file landing stub (the W4-spine frontend was reverted, R52). `apps/site` (munim-rho.vercel.app)
  is the marketing site and SDK downloads.
- Cobnut (`IIITManjeet/Cobnut-Bakehouse`, 0382306, 12 commits, one author, first commit 14 Oct 00:25 IST): storefront +
  15 staff screens on an in-app mock. tsc, eslint, 47/47 tests, `next build`, storefront smoke and staff smoke all pass;
  its staff smoke also passes against the real core-api. Built from the **pre-integration** owner-screens pack, so the
  review fixes are missing (`SCRATCH` reports: sync-review, sync-build, sync-live; summary in DECISIONS 15 Oct).
- Cup T&C (snapshot 13 Oct): a deployed live URL on Cloud Run/GCP/Firebase, a video under 3 minutes, a **public** GitHub
  repo with the source code, a deck. No submission date is stated.

## Order and why

| # | Phase | Who | Why here |
|---|---|---|---|
| 0 | Decisions recorded (R54); Manjeet told to freeze | founder + Claude | Nothing moves until his repo stops changing. |
| 1 | Import Cobnut into `apps/web`, onto pnpm + the workspace SDK | Claude | One repo, one toolchain; every later fix lands once. |
| 2 | Bring `apps/web` up to the final pack; phone and review fixes | Claude | Fixes are cheapest before the real backend is wired in. |
| 3 | Standalone production on Vercel + Supabase | Claude; founder for plan, keys | Turns the mock demo into the real system; finds the serverless limits early. |
| 4 | Production-ready gate: review, evals, screenshots, clean-up | Claude | The split copies whatever is here; make it right first. |
| 5 | GCP adapters + infra written **in this repo**, then the Cup export and deploy | Claude; founder creates repo, pays | Everything stays recorded here; the Cup repo is generated, never hand-edited. |
| 6 | Submission: T&C re-check, video, deck, README | founder + Claude | Last, on the deployed build. |

The FalkorDB entry is **not** in this sequence. See the last section: its event window (R12) starts today.

## Phase 0 — Decide and freeze (today)

- [ ] Ledger R54 written (this commit).
- [ ] Founder tells Manjeet: **freeze `Cobnut-Bakehouse` now; no more pushes.** Claude owns the frontend from here.
- [ ] Founder: send the ROFR clarification email (`docs/admin/rofr-clarification-email.md`, still a draft, OQ-E). It
      bears directly on how much the public repo hands over.
- Retired by R54: the "resend the pack to Manjeet" step, the change list for Manjeet, and the stateless-mock fix (the
  mock becomes dev/test only, so the Vercel instance problem no longer reaches users).

## Phase 1 — Import (about half a day)

1. Full-history scan of all 12 Cobnut commits (unshallowed): tokens/JWT patterns, keys, `.env*`, forbidden words
   (snacky, juspay, foodops, the founder's email), `sfk_` beyond the public mock keys. Gate: zero hits, or stop.
2. Remove the `apps/web` stub (one commit), then bring Cobnut in **with its history** as a subtree at `apps/web`,
   fetched by URL (`git fetch <url> main` then `git subtree add --prefix=apps/web FETCH_HEAD`). No remote is created.
3. In the same ticket, delete from `apps/web`: `.claude/`, `AGENTS.md`, any `CLAUDE.md`, `.vercel/`,
   `package-lock.json`, `docs/screenshots/` (retaken in phase 4). Inside this repo those would become live agent
   instructions or stale artifacts.
4. Convert to the workspace: package name `@munim/web`; `@munim/sdk: workspace:*` (0.2.0 types, so `lib/munim/types.ts`
   and its hand-typed `/v1/me` go); versions aligned with the monorepo pins (Next 16.4.0, React 19.3.0, TypeScript
   6.0.3, Vitest 5.0.3). Read the lockfile diff before committing (gotcha 27).
5. Wire `apps/web` into `make check`: typecheck, eslint, vitest, `next build`, dependency-cruiser boundaries (no
   imports from `services/`; only `@munim/sdk` and `@munim/contracts` types).
- **Done when:** `make check` green with `apps/web` inside it; storefront smoke and staff smoke pass on the mock; the
  scan is clean; `git log apps/web` shows Manjeet's 12 commits with their original dates.

## Phase 2 — Final pack and fixes (one to two days)

1. Take the final-pack (45d35ce) versions of the files the review lists: `lib/munim/drafts.ts`,
   `components/staff/pages/draft-detail.tsx`, `decision.tsx`, `use-command.ts`, `staff-copy.ts`, `source.tsx`,
   `shell.tsx`, `scripts/staff-smoke.ts`, `mock-server/staff.ts`, `mock-server/staff-data.ts`; delete
   `lib/munim/draft-decision.ts` (one approval module). Re-apply Manjeet's own UI edits on top (three-way, using
   the pre-integration pack as the base).
2. That closes: outlet-scope gate (every target outlet; null `outlet_id` = whole business), the role gate for finance
   and payroll drafts, the mock no longer rewriting a draft on approve-with-edits, refs resolved per viewer, the Cares
   draft showing recipient + pickup window + "Simulated recipient", the PO draft showing "Recorded only" and its
   traced price (so it can be approved), the stale-draft and dropped-write copy, `iso_week` from the clock, the
   recipient badge in the drawer, `outletsState`, and the smoke that completes its own order.
3. Phone and polish (live review): Suppliers 180px too wide at 390; Source tags, "Open Cares" link and Mock pill under
   48px; the Mock pill covering prices and the Review button; the outlet picker truncated; the signed-in name hidden
   on phones; tab titles on Cares and Suppliers; one time format on Cares; repeated short ids in the drawer.
4. Keep Manjeet's better pieces: shop header and footer staff links, the phone header, the staff mock-controls panel,
   `tests/staff.test.ts`, outlets of kind `restaurant`.
5. Seed data gains a manager and a two-outlet draft, so the outlet gate is visible and testable.
- **Done when:** the red-proofs pass and fail as they should (manager on Cares draft → no Approve and 403; manager of
  one outlet on a two-outlet draft → no Approve and 403; approve-with-edits leaves `command_payload` unchanged); no
  page scrolls sideways at 390; the walk-through has no console errors.

## Phase 3 — Standalone production on Vercel + Supabase (two to three days)

Shape: `apps/web` (Cobnut) on Vercel; core-api on Vercel as a Hono function; intel and suppliers-sim as Vercel Python
functions; Postgres, Auth and Storage on the existing hosted Supabase project; the in-app mock **not** in production
builds (dev and tests only).

1. **Spike first (half a day), because three things may not fit serverless:**
   - *SSE.* Streams use LISTEN/NOTIFY on a held connection. On a function that is one connection per open stream, cut
     at the function's maximum duration; the SDK's fetch-based stream reconnects. Measure the connection budget on the
     Supabase session pooler.
   - *core-worker.* A long-running process does not exist on Vercel. It becomes a cron route that sweeps the outbox and
     runs the jobs. **Hobby cron runs once a day; once a minute needs Pro** (founder, money).
   - *intel bundle size.* google-adk + a2a-sdk + openai: the local site-packages is 183 MB. Check it against Vercel's
     Python function size limit (UNVERIFIED). If it does not fit, that is a founder call (a slimmer bundle, or intel
     somewhere else).
2. **Same origin.** `apps/web` rewrites `/api/*` to core-api, so the browser never calls another origin. That removes
   founder question #1 (CORS) instead of answering it.
3. Hosted Supabase: apply migrations 0027–0029 (migrator lane, session pooler); run `make test-db` gates first locally.
4. Seed the **Cobnut world** (`make seed WORLD=cobnut`): two Lucknow outlets of kind restaurant with GSTIN and FSSAI on
   Hazratganj (Gomti Nagar left without, for the `tax_id_missing` state), the menu matching the storefront mock, the
   three demo people plus a manager, simulated suppliers and simulated Cares recipients, Cares enabled by an operator,
   `is_demo = true`.
5. Sign-in: Supabase Auth through the existing IdP port, with demo accounts for the demo people (see founder question
   on how visitors and judges sign in).
6. Secrets: the founder adds them with `vercel env add`; Claude never sees values. Run-token keys and the service
   secret are generated into the env, not committed.
7. AI: recorded models by default; live Gemini only after F-3 (prices and a budget cap) is answered.
- **Done when:** the production URL takes a web order that appears on the kitchen board, is handed over at the counter,
  and shows on the owner home with source chips that open; one approval from the inbox lands in the books with the
  approver's name in the audit log; all of it on the real backend.

## Phase 4 — Production-ready gate (one to two days)

1. `make check`, `make test-db`, `make eval` green; staff and storefront smokes against the production URL (the smoke
   completes its own order).
2. Screenshots of every state in the screen specs into `.screenshots/<ticket>/`, at 1280 and 390, from the production
   build. Founder sign-off on the look before anything else is changed (memory: visual sign-off).
3. One adversarial review of the whole frontend + deploy, with the guarantee scan (both clauses), ≤ 2 fix cycles.
4. Clean-up (R51): dead code and stale docs; CLAUDE.md stack line and doc map updated (`apps/web` is Cobnut; the packs
   become history); BOARD.md closed out; the old `git stash@{0}` dropped on the founder's word.
5. Push this repo to `SawhneySatvik/food-ops` on the founder's word, after a history scan for `.env`, `.run/` and keys.

## Phase 5 — The Cup split onto Google Cloud (two to three days)

**Built in this repo first, so the knowledge stays here:**
1. `adapters/gcp/`: Cloud SQL Postgres (create with `--edition=ENTERPRISE`, gotcha 7), Identity Platform or Firebase
   Auth behind the IdP port, Cloud Storage behind the storage port, Secret Manager, Gemini through the model-role
   table. Tested locally against the ports' contract tests.
2. `infra/gcp/`: Cloud Run services. core-api with min instances 1 and CPU always allocated, because SSE and the sweep
   need it (gotcha 8); SSE reconnects before the 60-minute cap. The worker as its own always-on service or a Cloud
   Scheduler job. Budget alerts at the founder's figure.
3. `make export-cup` with an **allowlist** (lean, R54): `apps/web`, `services/*`, the packages they import,
   `db/migrations`, the IN country pack, the Cobnut world, `adapters/gcp`, `infra/gcp`, README, one architecture doc.
   Left out: `docs/plan`, ledger, research, DECISIONS, handoff packs, `docs/admin`, `apps/site`, `adapters/dev`
   (Supabase, Vercel publisher, FalkorDB), the AU pack, the other worlds. Red-proof: a planted forbidden import fails
   the export; a clean tree passes.

**Then the Cup repo:**
4. History (R54: kept): `git filter-repo` on a throwaway clone with the same allowlist, so every commit carries only
   Cup files (Manjeet's dated commits come along as evidence of the timeline). Scan **every commit message** for
   forbidden words and anything internal; rewrite the ones that need it; drop empty commits. Diff the result's tree
   against `make export-cup` output: they must be identical.
5. No licence file. The README says "All rights reserved" and that all data is synthetic and suppliers simulated.
6. Founder creates the public repo on his account (no Google or Hack2skill collaborators); Claude pushes on his word.
7. Deploy to Cloud Run from the exported tree; live URL; the smokes against it.
- From here on, changes are made **in this repo** and re-exported; the Cup repo is never edited by hand.

## Phase 6 — Submission

Re-snapshot and diff the T&C (gotcha 19); the video (under 3 minutes, customer → kitchen → owner → approval → Cares,
"Simulated" visible); the deck (architecture and business case); the README. Submit.

## The FalkorDB entry — needs a decision today

R12: the FalkorDB Graph Hacks entry (15–18 Oct per the 9 Oct record; re-check the dates) is a **separate product in a
separate repo, coded from 15 Oct**, where the graph must be core and main coding starts after the event starts. Munim's
FalkorDB adapter must not be submitted as it. The founder's R54 answer (fresh history from today) fits that. Two things
follow:
- It cannot wait for phases 1–6: its window is now. It would run **in parallel**, in its own repo, from an empty
  history.
- Under the standing "no FalkorDB work until the founder asks", nothing starts until the founder says go and confirms
  the event's dates and rules (re-snapshot its T&C first).

## Founder questions this plan raises

1. FalkorDB: go or skip, given the window is 15–18 Oct (above).
2. Vercel plan: Pro (once-a-minute cron, longer function time) or Hobby with a daily sweep (money).
3. Sign-in on the production demo: a demo picker backed by demo accounts (anyone can enter as Nandini), or real
   sign-in with accounts you hand to judges.
4. If intel does not fit a Vercel Python function: a slimmer bundle or intel hosted elsewhere for the standalone.
5. Still open from before: F-3 AI prices and budget cap; GCP project and budget; the word to push; till shift close
   (Q6); counter staff receiving goods (Q19).
