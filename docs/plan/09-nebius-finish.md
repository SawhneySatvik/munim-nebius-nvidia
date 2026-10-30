# 09 — Nebius finish: tickets

Approved by the founder 27 Oct 2026 (the plan: `../../../hackathon/_meta/PLANS-2026-10-27.md` §1; decisions D-025–D-028,
R77). Deadline Fri 30 Oct, 22:30 IST. Every lane reads `CLAUDE.md` and `docs/plan/lanes/COMMON.md` first (the guard, the
shared running stack, git rules), then its ticket below. Reports go to `docs/plan/lanes/<ticket>.report.md` (≤ 300 words:
files changed, each command with its key output lines, red-proofs, what you did NOT do). The orchestrator commits.

**Restarts (wave 1):** only NB-1 restarts intel. Nobody else restarts any service; the orchestrator restarts core-api and
web after committing NB-2 / NB-3. Run targeted test files, not `make check` (one `make check` per wave, by the
orchestrator, on a quiet tree). Heavy runs (`make test-db`, `make intel-redproof`) go through `scripts/dev/heavy.sh`.

---

## Wave 1

### NB-1 · The live Ask refuses the reorder question (Opus)

**Symptom (27 Oct, after a full reseed):** `node scripts/dev/nemotron-smoke.ts --world=cobnut --ask` (question "Which
ingredients are below their reorder level?") abstained twice: `reason=missing_ref`, `segments=0`, at 61 s and at
80 145 ms (answer `01a17c6a-dc2d-7d14-b46b-6e1976308047`). The same question answered on every run on 24 Oct (A2).

**Territory:** `services/intel/**` except `services/intel/munim_intel/contracts_gen/**`. Read anything else.
**Restart right:** intel only, always `MUNIM_MODEL_MODE=live MUNIM_ASK_BUDGET_S=80 scripts/dev/restart-svc.sh intel`.

1. **Cheap checks first, before any code:**
   - Is any Cobnut ingredient below its reorder level today? The world was reseeded on a new date. Read it as the owner
     through the public API the inventory skill uses (demo sign-in per COMMON.md). If none: an empty read cannot be cited
     (an open A2 item), so `missing_ref` may be correct behaviour. Then report, propose a question that has data, and
     do not change the seed.
   - Read that answer's run trace (route traces, step timings, tool calls) and say whether the 80 s run timed out or
     failed on logic. Quote ids and labels only, never untrusted text.
2. Fix inside your territory only. If the cause is in core-api, the seed or the contracts, **stop and report** with
   evidence.
3. **No change may loosen the citation bar.** A2's review rejected exactly that: abstaining is right when the evidence is
   absent.
4. A latency cause is reported, not fixed by raising the 80 s budget (that is the founder's call).

**Done when:**
- The root cause is stated with evidence.
- If it was a code defect: a regression test fails before the fix and passes after; `uv run --locked pytest` (recorded)
  is green; the smoke passes **3 runs in a row** live.
- The five A2 questions are re-run live (reorder, net sales, labour, expiry, Kosambari's Swiggy payout), with a table of
  answered or abstained, the reason, and seconds.
- `scripts/dev/heavy.sh make intel-redproof` prints "ALL RED-PROOFS FIRED".

### NB-2 · The model tag on Ask answers (gap B) (Sonnet)

**Territory:** `packages/contracts/src/threads/index.ts`, `packages/contracts/generated/**`, `packages/sdk/src/gen/**`,
`services/intel/munim_intel/contracts_gen/**` (generated output only), `services/core-api/src/modules/threads/index.ts`
and its tests, `apps/web/components/staff/pages/ask.tsx`, `apps/web/components/staff/run-by.tsx`, and their web tests.
**No restarts.**

Exact edits (from `docs/plan/lanes/A.report.md` "Blocked" item 3; re-read the lines first):
1. Contract: `AnswerView` gains `run_id: Uuid7.nullable()`.
2. core-api `threads/index.ts`: `AnswerRow` and its two selects gain `a.run_id`; `answerViews` returns
   `run_id: r.run_id ?? null`.
3. `make contracts`, then `make ontology`. The ontology "fresh" test must pass.
4. `apps/web/components/staff/pages/ask.tsx`: in `<RunBy agent={signatureWords(a.signature)} runId={null} of="answer" />`,
   change only `runId={null}` to `runId={a.run_id}`.
5. `apps/web/components/staff/run-by.tsx` (~line 61): answers skip the every-outlet gate:
   `session.me.outlet_ids === "*" || of === "answer" ? runId : null`. An ask run's outlet scope is the asker's own, so
   core opens its trace to them. Confirm that in core-api's trace read before relying on it; if it does not hold, stop
   and report.

**Done when:**
- Contracts vitest is green, including the ontology "fresh" test.
- A new core-api test asserts that an answer view carries its `run_id`. Red-proof: it fails with the select reverted.
- A new web test: `RunBy` with `of="answer"` and a single-outlet session still requests the run's models. Red-proof: it
  fails with the old gate.
- Web typecheck and web tests are green.

### NB-3 · A single-outlet PO draft goes stale when the owner approves it (Opus)

**Cause (INFERENCE, `docs/plan/lanes/A.report.md` "Found on the way (P2)"):** `approvals/decide.ts` `recheck` re-runs
`based_on` under the **approver's** scope. For the owner that is both outlets. The shortfall row is keyed by
`(ingredient_id, stockout_on)`, and `stockout_on` differs once both outlets' stock is summed. So the row reads as
"gone" and the draft goes `stale` with no execution (draft `01a16ae1-5e08-7d75-a3f9-4bca5217326b`).

**Decided semantics:**
- Re-judge every `based_on` reference under the scope the evidence was gathered with: the snapshot's or its run's
  recorded outlet scope.
- Before that, refuse when the approver's scope does not cover that scope. Use the existing out-of-scope error code; add
  a new one only if none fits.
- Do not change row keys. Add no migration: if the scope is not recorded anywhere readable, **stop and report**.

**Territory:** `services/core-api/src/modules/approvals/**` and core-api approval tests (existing files plus one new
file). **No restarts.**

**Done when** (new tests in core-api, each red-proved against today's code where it applies):
1. A single-outlet RFQ PO draft approved by the owner executes. It fails today with `stale_draft`.
2. An approver whose scope is narrower than the draft's is refused, and nothing executes.
3. A draft whose evidence really changed under its own scope still goes `stale`.
4. Decide's idempotency replay test passes, and the audit chain verifies after an approval.
5. Guarantee clause-1 scan: the execution writes books only under `app.decision_id`. Run the book-guard DB gates through
   `scripts/dev/heavy.sh make test-db`, and quote the summary line.
6. The core-api approvals tests are green.

### NB-D · Deploy prep for the Nebius demo, no network (Sonnet)

R77: a **new** Vercel project pair (web and api) and a **second** Supabase project. They never touch munim-cobnut,
munim-api or the Supabase project behind the Cup and FalkorDB demos.

**Territory:** new files under `deploy/nebius/`, new files under `scripts/dev/`, `docs/nebius/DEPLOY.md`, and
`packages/config/**` only if an alternate settings file is needed.

1. **Read first:** `deploy/vercel/README.md`, `deploy.mjs`, `build.mjs`, `env-setup.ts`, and `packages/config`. Then design
   a Nebius profile with project names (proposed: `munim-nebius-web`, `munim-nebius-api`), region `bom1` and
   `--archive=tgz` (gotcha 43). Deploys come from a clean worktree at a commit (gotcha 42).
2. **The second Supabase project's settings** live in a separate git-ignored file using `.env.example`'s exact names,
   e.g. `.env.nebius`, selected by a variable, e.g. `MUNIM_ENV_FILE=.env.nebius`. They load only through
   `packages/config` and are never printed. If config cannot select a file today, add that with a test.
3. **A guard that refuses to run** migrate, seed or deploy when the Nebius profile resolves to the existing Supabase
   project's host, or to the existing Vercel project names. The guard compares host names through config without
   printing them, and is red-proved.
4. **Seeding the new database:** Cobnut and Kosambari, never the Snacky Shack. Write the exact command sequence.
5. **`docs/nebius/DEPLOY.md`:** the runbook, step by step, with what the founder does (create the Supabase project and
   put its strings in the file) and what the orchestrator runs.

**Not allowed:** any `vercel` CLI command that links, pulls, deploys or calls the network (gotcha 39 wrote an OIDC token
to disk), any change to the existing projects, and any database connection.

**Done when:** the guard's tests and red-proof pass; the runbook is complete; a dry run (no network) of the staging step
works from a clean worktree.

### NB-F · Film script and storyboard, 3:00 max, for the founder's review (Sonnet)

**Territory:** `docs/nebius/FILM-SCRIPT.md` only. Read `video/munim-launch/` (README, storyboards, fixtures), the
judging notes in `../../../hackathon/nebius-nvidia/` (BRIEF, UPDATE, `raw/2026-10-24/update-47163-will-it-ship.html`)
and `EVENTS-STATUS.md`.

1. A HyperFrames recreation (D-023), built from real screens of the deployed demo.
2. **Beats,** each as a row of: time, screen and state, on-screen text, caption or narration, and the product feature it
   needs, with whether that feature works today.
   - 0:00–0:30: the aha. An owner asks something only the books can answer, and gets a cited answer and a found leak.
   - Which NVIDIA Nemotron model does what (router: Lightning; reason: Ultra; vision: Super VL), served on Nebius Token
     Factory.
   - The chain on one item: invoice photo, price check, negotiation with simulated suppliers, PO draft, then a person
     approves.
   - One "Cannot verify".
   - The limitations.
   - End card: the repo and the live URL.
3. Every number on screen comes from the seeded world. Synthetic data and simulated suppliers are labelled on screen.
4. Total length 3:00 or less, counted.

**Done when:** the file exists with a beat table that sums to 3:00 or less, and with a list of the features the film
needs that are not ready yet.

---

### NB-4 · Migration 0037: the cited saving and the ingredient-price signal (migrator, Opus)

**Why:** the PO line's saving must be a snapshot cell, because rule 3 forbids computing it in the browser or a model
(`lanes/A.report.md` P2 "The saving on that line"). The Tavily price check needs a signal kind that no menu or event
template reads by accident (`lanes/A.report.md` P2 "Price check through Tavily").

**Territory:**
- `db/migrations/0037_*.sql` (new);
- DB tests for it under `db/tests/`;
- the red-proof scripts that plant "the next migration": since 0036 they plant `0037`, so move them to `0038` (see
  `lanes/M.report.md`);
- `db/README.md`'s migration count.

Nothing else. If a `packages/contracts` enum must change too (e.g. the `market_signal_v1` import kinds), **stop and
report** the exact edit.

**Do not** apply it to the shared local database (the orchestrator does that with a core-api restart). Run the DB suite on
embedded Postgres only.

1. **`purchasing.quote_compare`, a new template version** (snapshot templates are versioned rows in
   `evidence.snapshot_template`; read 0021, 0022 and 0026 for how versions are added, bound and guarded). Add two
   columns:
   - `reference_unit_price_minor`: the last price paid for that ingredient, from the books, with its basis named in the
     template's doc comment;
   - `saving_minor` = (reference − quoted unit price) × quantity, in minor units, NULL when there is no reference.
   Integer arithmetic only, no rounding surprises. Earlier versions are left untouched.
2. **`core.market_signal.kind`** admits `ingredient_price`. **A new version of `market.upcoming`** excludes it, as it
   already excludes `competitor_price`. **A new template, `market.ingredient_price`**, returns an ingredient's
   price signals over the last :days days (value, unit, source label, observed date, outlet or all), in the same style
   as the competitor-price template. Bind it the way the market pack's templates are bound.
3. Gates:
   - `scripts/dev/heavy.sh make test-db` green (quote the summary line);
   - a new test that mints `quote_compare` on a seeded fixture and checks `saving_minor` against an independently
     computed value;
   - a red-proof that an `ingredient_price` signal does not appear in `market.upcoming`;
   - the guarantee gates unchanged (the intel-write refusal count goes up only by tables you add; state the N).

**Done when:** all the above are green, with their output in `docs/plan/lanes/NB-4.report.md`.

### NB-5 · The Next.js security upgrade (Sonnet)

`apps/web` runs `next 16.4.0`, which `npm audit` flags as critical. 16.4.3 is the newest stable and clean: verified in
the Munshi repo on 27 Oct with `npm audit` and `pnpm audit --prod`.

**Territory:** `apps/web/package.json` and `pnpm-lock.yaml`, plus any `apps/web` source that the upgrade forces to
change (report each one).

1. Read `CLAUDE.md` gotchas 27, 41 and 42, `apps/web/next.config.ts`, and `apps/web/scripts/` (`nav-smoke.ts`,
   `bundle-isolation.sh`).
2. Set `next` (and `eslint-config-next`/`@next/*` if present) to 16.4.3. Install through the repo's normal pnpm path.
   Read the lockfile diff: only Next.js and its own dependencies may move.
3. Re-confirm that `cacheComponents`/partial prefetching stay off.
4. **Gates:**
   - `pnpm audit --prod` shows no critical advisory for next;
   - web typecheck, lint and vitest are green;
   - the production builds for cobnut and blr_kitchen succeed;
   - `apps/web/scripts/bundle-isolation.sh` PASS;
   - `apps/web/scripts/nav-smoke.ts` passes against a production build (client navigation into dynamic-id routes, gotcha
     41).
5. Do not restart the shared dev servers. The orchestrator restarts web on 3000, 3001 and 3002 after the commit.

### NB-6 · One item end to end: invoice upload → read → draft, and the cited saving on the PO (Opus)

**Why:** the film's beats 5 and 8 need it, and today the invoice (butter) and the negotiation (hazelnuts) are two
separate demos (`lanes/A.report.md` P2).

**Already works:** intel reads an invoice photo with the vision role, and its draft holds only page-span refs; a forged
figure withholds the draft (c2adcd0, red-proved). The negotiation with simulated suppliers produces a PO draft. Migration
0037 gives `purchasing.quote_compare` v2 the `reference_unit_price_minor` and `saving_minor` cells (applied locally; DB at
37).

**Missing, and what this ticket builds:**
1. **A core route that hands intel the document.** A staff upload (photo or PDF):
   - stores it through the blob port (local: `.run/local/blobs`);
   - mints an ingest run token (rule 15: only core mints);
   - calls intel's ingest with the bytes and the tenant's supplier and item aliases (`ingest/link.py` `AliasSource` has
     no read path today).
   intel returns the extraction, and core records the resulting draft. Any internal-contract change goes in
   `packages/contracts/src/internal/` (`make contracts`, `make ontology`). The invoice text is untrusted: it never rides
   in a trace (rule 8).
2. **One item.** Render a NEW synthetic invoice from "Lalbagh Nut & Spice (simulated)" for roasted hazelnuts, at a price
   above the last paid ₹1,480/kg (pick a value; state it), labelled synthetic. Render it from HTML with headless Chrome,
   the same way `services/intel/tests/fixtures/invoice/riverbank-sample.png` was made.
3. **The cited saving.** The negotiation's PO draft cites `quote_compare` v2's `saving_minor` (and the reference price
   cell) in `based_on`, so the saving shows as a number with its source. Show `quote_compare`'s own reference beside the
   saving, not `price_creep.latest_minor` (NB-4 report §4).
4. **The staff screen** (`apps/web`): an upload control on the purchases/invoices view, the invoice draft with its
   page-span chips, and the PO draft's saving with its source chip. **Do this part only after the orchestrator says NB-5
   (the Next.js upgrade) is committed.** Until then, stop after items 1–3 and report.

**Territory:**
- the core-api documents/imports module and the new route;
- `packages/contracts/src/internal/**` and the generated outputs;
- `services/intel/munim_intel/{ingest,negotiate}/**` and their tests and fixtures;
- `apps/web` staff purchasing views (step 4 only).

Restart rights: core-api and intel (`MUNIM_MODEL_MODE=live MUNIM_ASK_BUDGET_S=80` for intel).

**Done when:**
- Locally, live on Nemotron: upload the hazelnut invoice → a draft whose every figure is a page span → the owner approves
  → the purchase is recorded.
- The hazelnut negotiation's PO draft cites the saving cell, the owner approves it, and it executes (NB-3 makes
  single-outlet approval work).
- The forged-figure red-proof still fires. A new red-proof: an upload whose ingest token is for another tenant is
  refused.
- Contracts, core-api (targeted), intel (recorded) and web tests are green.
- Screenshots in `.screenshots/NB-6/`.

### NB-6b · The inbox draft page shows invoice spans (Sonnet)

The invoice draft's figures are page spans, and `/staff/inbox/{id}` renders them as "Cannot verify" (NB-6 report).
Render a span ref the way the suppliers screen does: "Read on the page", with the page text from
`GET /v1/imports/documents/{id}/text`. **Territory:** the shared staff draft/inbox components in `apps/web` and their
tests.

**Done when:**
- a test fails on today's code and passes after;
- a screenshot at 390 is in `.screenshots/NB-6b/`;
- web tests and typecheck are green.

### NB-7 · Tavily: one cited market-price search, and the zod advisory (Sonnet)

0. **The zod advisory.** Bump `zod` to ≥ 4.6.6 wherever the workspace pins it (`pnpm audit --prod` flags
   `packages__contracts>zod`, high). Then `make contracts` and `make ontology`, and check that the generated outputs
   are unchanged or explain each diff. Contracts, core-api (targeted) and web tests stay green, and `pnpm audit --prod`
   shows no high advisory.
1. **The importer.** It accepts `ingredient_price` signals: `market_signal_v1` kinds, field mapping and the
   `ingredient_id` column from 0037 (`lanes/NB-4.report.md` §4 and §6). There is a test and a red-proof.
2. **Intel.** A Tavily client lives behind the provider config. `TAVILY_API_KEY` is read through `munim_intel.config`,
   and its value is never logged.
   - The market specialist runs one search for the negotiated ingredient's market price.
   - The result enters ONLY through the signal path, as an owner-approved import, never written directly. It is cited
     as a web source: URL and label, `market.ingredient_price` cells.
   - Until the key exists the result is a recorded fixture, labelled "recorded" on screen (EV-7). The live call runs
     when the key is present.
   - Tavily's text is untrusted: it never rides in a trace, and no number from it is shown unless it is a cell.
3. **Done when:**
   - recorded tests pass;
   - a red-proof shows a Tavily-returned number outside a cell is refused;
   - the screen shows the market line with its source chip;
   - with a key, one live call is made (or the test is reported as skipped for no key).

**Territory:** the zod pins and lockfile, `packages/contracts` (imports), the core-api imports module,
`services/intel/munim_intel/{market,skills/market,providers or a new tavily module,config.py}` and their tests.
`apps/web` is limited to the market line, and only after NB-6b has finished.

### NB-pack · The submission text, before the key (Sonnet)

**Territory:** `docs/nebius/SUBMISSION.md` (new), `docs/nebius/FEEDBACK-DRAFT.md`, and the export's README source
(find where `make export-nebius` takes the README from; edit that source, never the exported copy).
1. The Devpost form, field by field:
   - the name;
   - the tagline;
   - what it does;
   - how it was built: where Nemotron and Token Factory are used, role by role, from the code;
   - the challenges;
   - accomplishments;
   - what was learned;
   - what's next;
   - the track (Best Apps & Agents) and the Tavily bonus;
   - the links (placeholders: REPO-URL, LIVE-URL, VIDEO-URL).
   Every claim must be true of the code at HEAD; measured figures are marked TO-MEASURE until N3.
2. **"What changed since 26 Aug".** The rules require it of an existing project. Build it from `git log` since 26 Aug
   on this branch: the Nemotron work, the `nebius` provider, the hero chain, NB-1 to NB-7. Plain and specific.
3. The README sections that don't need the key: what it is, how to run it locally, the architecture, where each model
   role is used, and the limitations (the Swiggy payout abstention, empty reads, latency), with TO-MEASURE markers for
   Token Factory numbers.
4. The feedback section, from FEEDBACK-DRAFT, with each measurement marked as taken on NVIDIA's endpoint until N3.

The same rules apply throughout: synthetic data and simulated suppliers labelled; no Snacky Shack (no owner consent);
no AI-attribution text.

### NB-film · The Nebius film, built ahead of the key (Opus)

**Territory:** `video/` (a new composition beside `video/munim-launch/`, or a new cut inside it, following its README),
render output under its `renders/`.
- Build the film from `docs/nebius/FILM-SCRIPT.md` (12 beats, 2:58) as a HyperFrames recreation from real screens of the
  local stack (capture them now: everything except Token Factory works locally).
- The founder hasn't answered the script's three choices, so use its defaults: cut beat 6 first if it runs long, no
  Kosambari cutaway, the same narration approach as the Cup film.
- Beats that need Token Factory (2, 4, the model tags, 11's measured numbers) and the end-card URLs are built with
  clearly marked placeholders that a later pass swaps in.
- Render a draft (≤ 3:00, counted) through `scripts/dev/heavy.sh`.
- Every number on screen comes from the seeded world.
- Labels: "Synthetic data", "Simulated supplier".

## Wave 2 (listed now; dispatched after wave 1 lands)

- **NB-5:** the Next.js security upgrade in `apps/web` (after NB-2), with a client-navigation smoke (gotcha 41).
- **NB-6:** the invoice upload in the staff app. A core-api route stores the document and hands intel the bytes and the
  tenant's aliases. The invoice item is made the same item as the negotiation (a re-rendered synthetic hazelnut invoice
  from the hazelnut supplier, simulated). The PO line shows its cited saving (after NB-4).
- **NB-7:** Tavily. One live search on that ingredient's market price, entering through the signal path and cited
  (recorded and labelled until the key exists).
- **N3:** the Token Factory switch, after the key arrives (Wed evening).
- **N4:** the deploy, after the second Supabase project exists.
- **N5:** film render. **N6:** package and submit.
