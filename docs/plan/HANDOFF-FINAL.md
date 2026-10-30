# Munim: final handoff (17 Oct 2026, morning)

Where everything stands after the build, the Cup suite and the FalkorDB entry. Read this first in any new session; the
older `HANDOFF-PROD.md` is the running log behind it. Decisions are in `00-decision-ledger.md` (R54–R74 for this phase).

## 1. The three codebases

| | Where | What it is | State |
|---|---|---|---|
| **Munim (root)** | `food-ops` → `main` (this checkout) | The whole product: core-api, core-worker, intel (ADK + Gemini), suppliers-sim, the Cobnut demo app (`apps/web`), the Munim site (`apps/site`), db, packages, the GCP and Vercel deploy code, the film source (`video/`) | `make check` 8/8 green at 06f1ad4; later commits are docs, export rules, small fixes and the film |
| **Cup entry** | GitHub `SawhneySatvik/food-ops-cup` (local `../food-ops-cup`) | Exported from main with `make export-cup EXPORT_ARGS="--history --check"`: 180 commits, one author (you), plain one-line messages | Pushed at f4fece7. Every gate 0 (words, secrets, paths, identities, messages); the export builds and tests on its own; **its GitHub CI passed** |
| **FalkorDB entry** | GitHub `SawhneySatvik/business-graph` (local `../business-graph`), built from `food-ops` branch **`falkordb`** | Exported from the branch with `scripts/export-falkor.sh --check`: **one fresh commit**, "Business Graph: Munim on FalkorDB", 2,102 files | Pushed at 57fa781 (replaced once, to carry the supplier-map fix). All gates pass; local setup ran end to end |

The branch `falkordb` (R72, R73) = main + the graph build. main's fixes are merged **into** it (never the reverse).
Its working copy is the git worktree `~/.cache/munim-wt/f3`. Every make check target passed on it (ae6a912).

**Both GitHub repos are PRIVATE.** Both events require a public repo: make each public before you submit
(`gh repo edit SawhneySatvik/<repo> --visibility public --accept-visibility-change-consequences`).

## 2. Live deployments

| What | URL | Deploys from |
|---|---|---|
| Cobnut demo (storefront + staff screens) | https://munim-cobnut.vercel.app | Vercel native Git, production branch **`falkordb`** (R73); serving ae6a912 |
| Munim site + developer portal + SDK 0.3.1 | https://munim-rho.vercel.app | Vercel native Git from **main** |
| munim-api (core-api, intel, suppliers-sim) | behind the demo's `/api` | serving ae6a912 (the `falkordb` branch); GitHub Actions `munim-api.yml` deploys after a green `ci` on `falkordb`, or by hand from a clean worktree (`deploy/vercel/README.md`) |
| Hosted Postgres | Supabase, Mumbai | migration **35** applied; demo tenant `edfb6eec-2a31-7bd5-aaa7-a5530aabbc00` |
| Cup on Google Cloud | — | **Not deployed yet (yours).** `DEPLOY.md` in food-ops-cup |

Production smoke after the last deploys: storefront → checkout, owner home (8 source chips), Ask answered live first try
(18 s, 4 citations), the AI office's run replay. The graph features are **off** on Vercel until a FalkorDB Cloud
instance exists (`MUNIM_GRAPH` unset).

## 3. The films

Review page (phone): https://claude.ai/artifact/7XCjGRANqgtp4XnaWpETC9

| Cut | File (1080p master, `video/munim-launch/renders/`) | Length | End card |
|---|---|---|---|
| **Cup submission** (R74 V-1) | `munim-cup4-review.mp4` | 3:58.6 | "Built with Gemini on Google Cloud" + **CLOUD-RUN-URL placeholder** |
| **FalkorDB submission** (R74 V-2) | `munim-falkor-review.mp4` | 3:30 | "Built on FalkorDB", track, business-graph repo + **LIVE-URL placeholder** |
| Cup fallback (approved 2:55) | `munim-cup-review.mp4` | 2:55 | placeholder |
| Full tour | `munim-full.mp4` | 6:00 | munim-rho |

The Cup T&C say the video must be "strictly under three (3) minutes"; you chose ~4:00 (R74 V-1, recorded). The 2:55 cut
is the fallback if you change your mind.

**To finish a film:** put the URL in `video/munim-launch/assets/js/fixture.js` (`endCard.cup4.url`,
`endCard.falkor.url`), then render (about 8 minutes each, through `scripts/dev/heavy.sh`, one worker); the README in
`video/munim-launch/` has the exact commands, and `tools/check-cup-url.mjs` refuses a render that still has a placeholder.

## 4. What only you can do, in order

1. **Google Cloud (Cup):** follow `DEPLOY.md` in food-ops-cup (21 steps): the one-time setup and first deploy from your
   laptop (`scripts/deploy-gcp.sh`), the seed, the smoke checks. Then optionally connect the repo for continuous deploys
   (Cloud Build trigger on main; steps 17–21). New migrations always run from your laptop before you push.
2. **Send the Cloud Run URL** → the Cup film's end card is filled and re-rendered (~8 min), and the form's links.
3. **FalkorDB live URL (optional):** create a FalkorDB Cloud free instance; put its URL in `.env` as
   `MUNIM_FALKORDB_URL`. Then a session runs `scripts/dev/probe-falkordb.ts` (on the branch) to check the instance allows
   `RENAME`/`SCAN`, sets `MUNIM_GRAPH=falkordb` (munim-api and munim-cobnut) and `MUNIM_FALKORDB_URL` (munim-api), redeploys,
   fills LIVE-URL in business-graph's README (regenerate + force-push its one commit) and the film. Without it, the entry
   ships with complete local setup, which the rules accept.
4. **Make both repos public.**
5. **Decks:** from `docs/submission/cup/deck-outline.md` (12 slides, mapped to the judging criteria). The FalkorDB entry
   needs no deck.
6. **Forms:** the Cup form is drafted field by field in `docs/submission/cup/submission-form.md` (placeholders for the
   URLs). FalkorDB asks for the repo, the README (graph model + setup), the Cypher queries (`docs/cypher.md` in the repo),
   the video, live URL or local setup, and the track: **Agents That Act on Connected Data**.
7. **On submission day:** re-check the Cup T&C (`docs/submission/cup/tnc-diff.md` has the script; gotcha 19).
8. **Submit both by Sun 18 Oct, 23:59 IST.** `docs/submission/cup/checklist.md` is the day's list.

Optional, still open: the "Prompt your jersey" promo; the repo licence (stays "All rights reserved"); the ROFR email
draft (`docs/admin/rofr-clarification-email.md`, optional); the GCP budget alert amount and how long to keep services up
(6 Nov, or 4 Dec if shortlisted); the FalkorDB eligibility call (rule 8: main coding after 15 Oct — yours, R56).

## 5. How to resume work (commands)

```bash
# main (this checkout)
UV_OFFLINE=1 scripts/dev/heavy.sh make check            # ~60 min; UV_OFFLINE=1 when pypi DNS flaps
make export-cup EXPORT_ARGS="--history --check"          # regenerate ../food-ops-cup (it must not exist: move it first)
# FalkorDB branch (worktree)
cd ~/.cache/munim-wt/f3 && git merge main                # bring main's fixes in; then make check there
scripts/export-falkor.sh --out <new dir> --check         # regenerate business-graph (one fresh commit)
# check uncommitted work against the Cup export (temp index + throwaway branch; nothing else changes)
<scratchpad>/sync/export-wt.sh <repo> [--history]
```

- Heavy commands go through `scripts/dev/heavy.sh` (two slots, shared by every checkout).
- Deploys: `deploy/vercel/README.md` (munim-api from a clean worktree at a commit, gotcha 42; `--archive=tgz`, gotcha 43).
- Hosted DB: `make dev-db THROUGH=<n>` rotates the role passwords; re-set the three `MUNIM_DB_PASSWORD_*` on munim-api
  from `.run/db-roles.json` straight away, then redeploy.
- Seeding the hosted demo needs two Vercel ticks in two different UTC hours (the second import batch parses only after the
  first is approved); re-running the same seed name resumes the same tenant.
- Pushes: scan the new history first (no `.env`, `.run/`, keys, AI attribution); one author; stage by name.

## 6. Decisions this phase (ledger)

R54 one repo, then the splits · R55 standalone settings · R56 trimmed gate · R57 push cadence, Vercel secrets · R58 live
Gemini · R59 ₹0 prices · R60 Cup repo (name, one author, real history, no licence) · R61 the "Ledger, softened" site ·
R62 finish both entries · R63 live diagnostic calls · R64 security decisions · R65 the launch film · R66–R67 the screens
wave · R68 the FalkorDB entry (core is the only graph writer) · R69 Ask on flash-lite · R70 Cup form answers (eligibility
confirmed, no tooling sentence, theme Retail & Commerce) · R71 "Send me offers" = email consent only · R72 FalkorDB on its
own branch · R73 the branch drives the Vercel demo; business-graph is its own repo · R74 final films, track, no FalkorDB
security pass, the 08:15 deadline.

## 7. Known gaps and risks

- **GitHub CI on food-ops is green on main (675f399) and on `falkordb` (9cb308d)** after the CI fixes (per-gate matrix,
  SSE waits, pytest/vitest output on GitHub, the db harness's pool shutdown race, FalkorDB fetched for the red-proof job).
  The munim-api auto-deploy then failed only because the `VERCEL_TOKEN` secret holds extra characters ("--token contents
  are invalid"): re-set it trimmed — `pbpaste | tr -d '[:space:]' | gh secret set VERCEL_TOKEN -R SawhneySatvik/food-ops`
  with only the token copied. Until then munim-api deploys by hand; production already serves the branch (ae6a912; no
  runtime change since). The Cup repo's own CI passed.
- **Cup video length** (§3).
- **FalkorDB Cloud** is unprobed (`RENAME`, `SCAN`, graph-count limits); the swap is one function, so a no-RENAME variant
  is a one-file change. Linux FalkorDB binaries are unverified until CI runs them.
- **Consent** (after R71): an SMS campaign could cite `{marketing}`-only customers (latent: non-demo campaigns are refused
  and nothing is ever sent); re-ticking "Send me offers" clears a staff email opt-out; nothing grants `consent.sms` yet.
- **Live AI:** Gemini free tier; 5xx spikes are retried (bounded); a quota 429 shows "Cannot verify". Invoice vision still
  returns 400 live (no demo path uses it). The 120 s CDN first-byte limit on `/api` is unmeasured (the longest call seen is
  79 s).
- **Exported comments** still carry internal notes (ledger/ticket ids, "orchestrator ruling", "migrator lane", "founder").
  No AI-tool word appears anywhere (gated in files, paths, messages and history). Rewording them was cut for time.
- **Flakes under machine load:** worldgen's 240 s determinism test, a 57P01 at teardown, intel run tokens (fixed: 24 h test
  TTL). `make check` needs `UV_OFFLINE=1` when pypi DNS flaps.
- `git stash@{0}` is kept until you say to drop it.

## 8. In flight at handoff

- **Vercel → `falkordb` branch (done, 05:30):** munim-api and munim-cobnut serve ae6a912; munim-cobnut's production branch
  is `falkordb`; munim-rho stays on main; production smoke 6/6 (graph off: no "Supplier map" link). The first Git deploy of
  the branch was skipped by the ignored-build step (no change since an earlier preview of the same commit), so munim-cobnut
  went out by hand (`vercel deploy --prebuilt --prod --archive=tgz` from the clean shadow checkout); later pushes deploy
  on their own.
- **GitHub CI fixes (done, 08:45):** both branches green; see §7 for the token.

## 9. Machine state

- Worktrees: `~/.cache/munim-deploy/api-src` and `cobnut-src` (clean deploy staging), `~/.cache/munim-wt/f3` (the
  `falkordb` branch). The local dev database (embedded Postgres, started 13 Oct) is still running.
- `caffeinate` keeps the Mac awake (PID in the scratchpad's `caffeinate.pid`); about 13 GB free on disk.
- Render masters (git-ignored) in `video/munim-launch/renders/`; the Kokoro voice model cache in `~/.cache/hyperframes`.
