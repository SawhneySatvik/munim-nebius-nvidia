# Known gaps, then the Cup and FalkorDB splits (R56, 15 Oct 2026)

**What this is.** The plan from the end of lanes C and D to two submitted entries. It replaces plan 05's phase 4 with
a trimmed gate (R56 G-1), adds a known-gaps phase (G-2), and details phase 5 (Cup on Google Cloud) and the FalkorDB
repo (G-3). Plan 05 stays the record of phases 0–3.

**Deadlines (re-read 15 Oct).**
- **FalkorDB Graph Hacks:** FACT. The event runs 15 Oct 00:01 IST to **18 Oct 23:59 IST**
  (wemakedevs.org/hackathons/falkordb rules 7, schedule). Snapshot: `docs/admin/falkordb-rules-snapshot-2026-10-15.md`.
- **Cup:** the published T&C (re-read 15 Oct) still states **no submission deadline**. "18 Oct 23:59 IST" comes only
  from the 9 Oct design spec §14, so it is UNVERIFIED and the founder should confirm it.
- **Planning assumption:** both close 18 Oct 23:59 IST, about 3.5 days from now.

**Settled (R56).** Region Mumbai everywhere (Supabase as is, Vercel `bom1`, GCP `asia-south1`). AI is recorded-only
in every gate and every deploy; Gemini free tier with a founder-made GCP API key; no AI tests. Claude pushes only on
the founder's word; no AI attribution in any commit (CLAUDE.md Git).

## Order

**The Cup is the critical path.** The Vercel-only work does not block it:
- The Cup uses Cloud Storage (T-120) and an always-on worker (T-121), so it needs neither T-116 nor T-117.
- T-119 and step B's Vercel deploy are standalone-only.
- From step B, only the local journey matters to the Cup, as proof the system works end to end.

| When | Critical path (Cup) | Alongside |
|---|---|---|
| **Now** (C and D still running) | T-120 `adapters/gcp`, T-121 `infra/gcp` (new folders, no overlap with C or D) | T-130 done (rules snapshot); T-131 design (graph model, Cypher) |
| After C and D commit | T-122 neutral names, then T-123 export + history filter; T-125 live + recorded fallback (needs C's fixtures); step B local journey | T-116, T-117, T-118 gaps; T-131 build; step B hosted seed + Vercel; T-119 |
| 17 Oct | T-124 GCP deploy, seed, journey on Cloud Run; submission pack | T-132 FalkorDB export (fresh history); T-133 deploy + pack |
| 18 Oct | Founder: video, deck, T&C re-check, submit both by 23:59 IST | Step F clean-up |

**Model tiering (founder):**
- **Opus:** the migrator (T-117), T-122/T-123 (hard rule 2 in history), T-131 (guarantee + graph core).
- **Sonnet:** T-116, T-120, T-121, T-124 docs, T-133.

**Cut order if time runs short:** T-118, then T-119, then step B's Vercel deploy, then T-117. The Cup's live URL, public
repo, video and deck are never cut, and neither are FalkorDB's required deliverables.

## Step B — phase 3c (orchestrator)

1. **Local journey** on a fresh local DB with core-api, core-worker, intel and suppliers-sim (recorded), and apps/web
   with the mock off, using `MUNIM_DEMO_TOKENS`. The path: a web order, then the kitchen board, then the hand-over at the
   counter. On the owner home, a source drawer opens. Nandini requests quotes for both outlets (T-114) and a PO draft
   appears. Farah gets a 403 when she approves. Nandini approves from the inbox, and the audit row carries her name. This
   also proves Lane A's deferred real-API sign-in.
2. **Hosted:** apply 0027–0030 over the session pooler (`make dev-db THROUGH=30`, runbook in `deploy/vercel/README.md`).
   Then `MUNIM_SEED_OPERATOR=1 make seed WORLD=cobnut` with the synthetic operator, and record the tenant id. The 11
   duplicate synthetic tenants stay unless the founder says to clear them (they are append-only books).
3. **Vercel** (R55 S-3, region `bom1`):
   - munim-cobnut uses Vercel's Git integration on `food-ops` `main`, root `apps/web`.
   - munim-api uses `.github/workflows/munim-api.yml`: on a push to `main`, run `node deploy/vercel/build.mjs`, then
     `vercel deploy --prod` from `deploy/vercel/out`.
   - The founder adds the secret values (`vercel env add`), plus `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
     `VERCEL_PROJECT_ID` as GitHub secrets. Claude never sees values.
   - `.github/` and `deploy/vercel/` stay out of both exports.
4. Production journey: repeat step 1 on the live URLs.

## Step C — known gaps (R56 G-2)

| Ticket | Gap | Fix | Territory | Done when |
|---|---|---|---|---|
| T-116 | Uploads go to a per-instance `/tmp`, so production imports break | A `BlobStore` adapter on Supabase Storage (`adapters/dev/blob-supabase`), chosen by env in env-root. The same port gets a Cloud Storage adapter in T-120. | adapters/dev, core-api env-root, core-worker imports wiring | Upload on one instance, parse on another (two processes) passes. Contract tests are shared with T-120. |
| T-117 | A repeat tick in one slot re-posts the brief; poison rows are counted per instance | Migration 0031 adds a tick ledger (`(job, slot)` unique, operational) claimed in the tick transaction. Poison counting moves onto the existing `core.outbox.publish_attempts` / `dead_at`. | migrator: `db/migrations/0031_*`, core-worker cron | Two concurrent ticks in one slot: one runs, one reports `ran:false`. A replayed slot posts no second brief. Red-proved. `make test-db`. |
| T-118 | The prep-time draft and the ticket-drift finding are mock-only (server-stamped ticket times, B1 §5) | Investigate first. The preferred fix replays the world's history through the real commands under the world's dated clock, only if that clock is already the seed's sanctioned path (R44 dated history). **Never** a client-supplied time on a live route. If it would weaken server-stamped times, stop: it stays mock-only, the demo script says so, and the founder is told. | tools/worldgen, intel recorded fixtures (kitchen) | On the real Cobnut world, `kitchen.prep_time_gap` and `kitchen.ticket_drift` fire and the prep-time draft appears — or a written stop with evidence. |
| T-119 | First-deploy UNVERIFIED items (B2 §7) | Verify on the first deploy: Services and bindings on Hobby, Node 24 type stripping, cron through service rewrites, the binding URL path (`new URL("/watch:sweep", base)`), SSE through the Next rewrite without buffering, `MUNIM_TRUSTED_PROXY_HOPS`. Fix what fails. | deploy/vercel, core-api only if needed | Each item has a measured result in the DECISIONS close entry. |

## Step D — the Cup on Google Cloud (plan 05 phase 5, detailed)

**Hard rule 2 binds the Cup repo and its history: no Supabase, Vercel or AWS.** On 15 Oct about 30 files in the
export's paths mention Supabase: core-api, apps/web, worldgen, `packages/config` (the `SUPABASE_*` names), comments in
three applied migrations, and test files. Two apps/web files mention Vercel. Seventeen commit messages mention one or
the other. Path filtering alone is not enough.

| Ticket | What | Territory |
|---|---|---|
| T-120 | **`adapters/gcp/`** behind the existing ports. Cloud SQL Postgres (`--edition=ENTERPRISE`, gotcha 7; connection budget, gotcha 24). Identity Platform behind the IdP port (token verify, demo accounts). Cloud Storage `BlobStore` (T-116's contract tests). Secrets reach the services as env from Secret Manager (config is env-only since T-113, so no code adapter is needed). Gemini model roles (no `gemini-2.5-*`, rule 13). **The Cup deploy runs `MUNIM_MODEL_MODE=live`** (R56 G-4 amended), on the free tier, under the R47 spend cap (over cap → abstain, rule 11). Gates stay recorded. | adapters/gcp, port contract tests |
| T-121 | **`infra/gcp/`**. Dockerfiles; Cloud Run services in `asia-south1`: web (Next standalone), core-api (min 1, CPU always allocated, gotcha 8; SSE max age under 60 min), core-worker as an always-on service (the real long-running worker, no daily tick), intel, suppliers-sim (simulated, labelled). Artifact Registry and Cloud Build. Budget alert at the founder's figure. `scripts/deploy-gcp.sh` (revives `make deploy-gcp`). | infra/gcp, scripts/deploy-gcp.sh |
| T-122 | **Provider-neutral names in exported code.** Config reads neutral names (`MUNIM_DB_URL_SESSION` / `_TRANSACTION`, `MUNIM_IDP=identity-platform`, …). The `SUPABASE_*` names are accepted **permanently in this repo** through a dev-only mapping under `adapters/dev`, so `.env.example` stays the founder's template (rule 20) and the Vercel env (step B) is entered once, under the names B2 listed, never twice. The demo sign-in in apps/web moves behind an IdP-neutral server adapter: the Supabase password grant lives in `adapters/dev`, the Identity Platform grant in `adapters/gcp`. Comments and test names are reworded. Applied migrations are never edited (rule 6); their comments are handled in T-123. Gate: `git grep -il 'supabase\|vercel'` over the export allowlist gives 0. | packages/config, apps/web/lib/server, core-api, worldgen, tests (shared files → orchestrator reads every diff) |
| T-123 | **`make export-cup`** with the R54 allowlist (apps/web, services/*, imported packages, db/migrations, IN pack, the Cobnut world, adapters/gcp, infra/gcp, README, one architecture doc). Red-proof: a planted forbidden import or word fails; a clean tree passes. **History:** `git filter-repo` (not installed yet: `brew install git-filter-repo`) on a throwaway clone. It uses the same allowlist **plus explicit path excludes** for files the teammate's 12 historical commits put under `apps/web`, which a HEAD-only check cannot see: `apps/web/.claude/` (3 files), `AGENTS.md`, `CLAUDE.md`, `.vercel/`, `package-lock.json`, `apps/web/docs/` (71 files incl. old screenshots). A reviewed `--replace-text` map covers Supabase/Vercel/Claude wording in old blobs (12 old apps/web files; migration comments — the Cup DB is fresh, so its migration hashes are its own). A message callback covers the 17 Supabase/Vercel messages, the 9 that mention Claude/CLAUDE.md, and any internal wording. Empty commits are dropped. **Forbidden-word gate over the tree, every historical blob and every message:** `supabase`, `vercel`, `aws`, `claude`, `anthropic`, `\.claude`, `CLAUDE\.md`, `juspay`, `snacky`, the founder's and teammate's emails, plus the secret patterns. Gate: the final tree is identical to the `make export-cup` output and the history-wide gate is 0. | scripts/export-cup.sh, Makefile target |
| T-125 | **Live with a recorded fallback** (R56 G-4). In live mode, a model call that fails, is rate-limited (free tier) or is over the cap is served from the recorded fixture when one exists for that call, which covers the curated Ask questions. Otherwise it abstains as today. The trace records which path served the call (labels only). The validator is unchanged: recorded answers pass cite-or-abstain like live ones. Tests are recorded-only. A planted 429 must reach the fixture, and a call with no fixture must still abstain. | services/intel/munim_intel/llm (Opus: touches the cite-or-abstain path) |
| T-124 | **Deploy and prove.** Cloud SQL: all migrations, then roles; seed Cobnut with Identity Platform demo accounts; deploy; the step-B journey against the Cloud Run URL. Submission pack: README ("All rights reserved", synthetic data, simulated suppliers, recorded AI), one architecture doc, deck outline (architecture + business case), video script under 3 minutes (customer → kitchen → owner → approval → Cares, "Simulated" visible). | infra, docs in the export |

**Founder inputs:**
- The GCP project id with billing and the budget figure.
- `! gcloud auth login` (Claude never handles credentials).
- The Gemini API key, put into Secret Manager by the founder.
- Create the **public** repo on their account (no Google or Hack2skill collaborators), and give the word to push.
- Record the video; submit.
- Re-snapshot and diff the T&C (gotcha 19) before submitting.

## Step E — the FalkorDB repo (R56 G-3)

**On record:**
- R12 and the event's rules 3 and 8 (main coding after 15 Oct; graph as the core) conflict with a Munim-based entry.
  Claude flagged this once.
- **The founder owns eligibility** ("will manage that"). Claude builds what the founder asked for.
- R54 P-5: the repo starts from a **fresh history**.

| Ticket | What | Territory |
|---|---|---|
| T-130 | **Done 15 Oct:** `docs/admin/falkordb-rules-snapshot-2026-10-15.md`. 15 Oct 00:01 to 18 Oct 23:59 IST. Rule 2: FalkorDB must be the primary graph DB and support a central part of the product. Rule 3: "if the product still works once FalkorDB is taken out, the graph is decoration". Rule 4: any hosting. Rule 8: main coding after the start. Rule 10 deliverables: public repo, README with setup **and the graph data model**, the Cypher queries the product depends on, a demo video, a live deployment or full local setup, the track(s). Tracks: Agents That Act on Connected Data / Agent Memory and Coordination / Company Brain. | docs/admin |
| T-131 | **Graph as the core** (rules 2–3) in this repo, so both exports draw from one source. **The lane brief cites R56 G-3**, which overrides `01-pdr.md`'s "No FalkorDB Graph Hacks work in this repo (R12)" for this ticket. In the FalkorDB build the graph port has **no Postgres-edges fallback**: FalkorDB is required, so the graph features stop working without it (rule 3's test). `adapters/dev/graph-falkordb` is pinned to a **4.x tag** (gotcha 10). Suggested track: Agents That Act on Connected Data. The graph carries supplier → ingredient → recipe → menu item → outlet, plus findings and drafts as nodes with snapshot refs. Graph-first features, both reads with cited refs: "what does a butter price rise touch" (traversal → affected items, outlets, margin snapshot) and a supplier dependency view. The One Guarantee is unchanged: graph reads only; numbers still come from snapshots; writes are still drafts. | adapters/dev/graph-falkordb, intel graph + one skill, apps/web one screen |
| T-132 | **`make export-falkor`**: an allowlist like the Cup's plus the FalkorDB adapter and the graph screen, minus `adapters/gcp`/`infra/gcp` unless that event wants GCP. One fresh initial commit (no history). Same forbidden-word and secret gates. | scripts/export-falkor.sh |
| T-133 | Deploy where the T&C allows: this repo's Vercel + Supabase stack with FalkorDB Cloud (free tier) or a FalkorDB container. README and architecture doc centred on the graph, a video script, and a submission checklist. | deploy, docs in the export |

**Founder inputs:**
- A FalkorDB Cloud account or the hosting choice.
- Create the repo (fresh) and give the word to push.
- The eligibility call; the video; the submission.

## Step F — trimmed phase 4 (R56 G-1)

**Skipped:**
- The production-URL `make eval` + smoke pass.
- The screenshot set for visual sign-off.
- The whole-frontend adversarial review.

**Kept:**
- Each ticket's own gates.
- Clean-up:
  - the CLAUDE.md stack line and doc map (`apps/web` = Cobnut; packs = history; `adapters/gcp`, `infra/gcp`,
    `deploy/vercel`);
  - BOARD.md;
  - voiding the old test order on the local DB;
  - dropping `git stash@{0}`, on the founder's word.
- The DECISIONS close entry.
- A push to `food-ops` on the founder's word.

## Risks (said once)

- **Time.** About 3.5 days for the gaps, two exports, two deploys and two submission packs. The cut order is in "Order"
  above. After it, T-131's second graph feature goes.
- **Hard rule 2 in history** (T-122/T-123) is the step most likely to slip, and it disqualifies if missed. It gets an
  Opus lane and a history-wide gate.
- **No adversarial review** (G-1): the export gates and the step-B journey are the only checks on the guarantee before
  submission.
