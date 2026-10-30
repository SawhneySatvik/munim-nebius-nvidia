# T-122 then T-123 — provider-neutral code and the Cup export (R54 P-4/P-5, R56, R57; hard rule 2)

**Do not edit anything until `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/sync/GO2` exists** (a full `make check` is running); read and plan meanwhile. Concurrent lane: **T-127** (the only migrator; owns `make contracts`/`make ontology`; db/migrations 0032, core-api purchasing/finance routes, run-frame, intel ask/negotiate/ingest, worldgen cobnut/kit/cli + Makefile `seed`, deploy/vercel env-setup) — stay out of those files except rewording, and report needed diffs.

Read `CLAUDE.md` first — **hard rule 2 binds the Cup repo and its whole history: no Supabase, Vercel or AWS** — and
rules 6, 20, the Git section (no AI attribution anywhere), gotchas 17, 27. Read `docs/plan/06-gaps-and-split.md` rows
T-122 and T-123 (they are the spec), ledger R54 P-4/P-5, R56, R57, `infra/gcp/README.md` (T-121: its env table names the
neutral variables the Cup deploy sets), `adapters/gcp/README.md` (T-120 wiring notes), `deploy/vercel/README.md` (T-113/
T-126: the dev/Vercel names, which must keep working in this repo).

## T-122 — provider-neutral names in exported code
- `packages/config` reads **neutral names**: `MUNIM_DB_URL_SESSION`, `MUNIM_DB_URL_TRANSACTION`, `MUNIM_IDP=local|supabase|identity-platform`
  (+ `MUNIM_IDP_PROJECT_ID`, `MUNIM_IDP_WEB_API_KEY`), `MUNIM_BLOB=fs|supabase|gcs` (+ `MUNIM_BLOB_BUCKET`), and the
  rest exactly as `infra/gcp/README.md`'s table lists. The `SUPABASE_*` names stay accepted **permanently in this repo**
  through a **dev-only mapping under `adapters/dev`** (e.g. `adapters/dev/env-supabase`) that config applies when present,
  so `.env.example` (the founder's template, rule 20) and the Vercel env already set by `deploy/vercel/env-setup.ts`
  keep working unchanged — the founder never enters anything twice. If neutral and dev names are both set and differ,
  refuse to boot with a clear `ConfigError` (names only, never values).
- Composition roots (`services/core-api/src/env-root.ts`, `dev-root.ts`, `server.ts`, core-worker main, `infra/gcp/entries/*`)
  choose IdP and blob store by the neutral names; the Supabase IdP and Storage adapters are imported **only from
  `adapters/dev`** and only through the dev mapping / dev root (boundaries: add or tighten a dependency-cruiser rule so a
  non-dev path importing `adapters/dev` fails; red-prove it). Wire `adapters/gcp` (T-120) for `identity-platform` and
  `gcs`. `blobStoreFromEnv(config)` stays exported from env-root (T-121's worker entry imports it).
- apps/web demo sign-in (`apps/web/lib/server/**`): behind an IdP-neutral server adapter — the Supabase password grant
  moves under `adapters/dev`, the Identity Platform grant comes from `adapters/gcp`, chosen by `MUNIM_IDP`. apps/web may
  import from `adapters/*` only in its server code; check the boundary rules and adjust deliberately (report it).
- intel (`munim_intel.config`): same neutral names where it reads any provider name.
- Reword comments, test names and strings in exported paths that say Supabase/Vercel (provider-neutral words: "the hosted
  Postgres", "the IdP", "the deploy platform"). **Applied migrations are never edited (rule 6)** — leave their comments
  for T-123's history/text map. `db/seeds`, `db/scripts`: reword if not migrations.
- Gate: `git grep -il 'supabase\|vercel\|aws\b'` over the T-123 allowlist (minus `db/migrations/*.sql` already applied)
  → 0. `make check` green. The Vercel deploy path still works: run `deploy/vercel/build.mjs` and boot core from the staged
  `out/` with the **dev** names only (embedded PG, local IdP) to prove the mapping; and boot with **neutral** names only.
  Red-prove the conflict refusal and the boundary rule.

## T-123 — `make export-cup` and the filtered history (after T-122 is green)
- `scripts/export-cup.sh` + the `export-cup` Makefile target (replace the stub): the R54 allowlist — `apps/web`, `services/*`,
  the packages they import (compute from the workspace graph, not by hand), `db/migrations` + `db` runtime pieces the
  migrator needs, the IN country pack only, the Cobnut world only (plus whatever worldgen code it needs), `adapters/gcp`,
  `infra/gcp`, `scripts/deploy-gcp.sh`, a root README and **one** architecture doc (write `ARCHITECTURE.md` for the export
  from `docs/plan/03-architecture.md` — current, provider-neutral, no internal plan/ledger references), root config files
  the build needs (`package.json`, `pnpm-workspace.yaml` filtered to exported packages, lockfile regenerated or filtered
  so `pnpm install --frozen-lockfile` works in the export — prove it), `.github/workflows/ci.yml` only if it is
  provider-neutral (else a new neutral CI). **Excluded:** `docs/` (plan, ledger, research, DECISIONS, handoff, admin),
  `apps/site`, `adapters/dev`, `deploy/vercel`, `.github/workflows/munim-*.yml`, the AU pack, other worlds, `.claude`,
  `CLAUDE.md`, `.env*` except a neutral `.env.example` for the Cup, `.run`, `.vercel`.
- **No LICENSE file**; README states "All rights reserved", synthetic data, simulated suppliers, payments recorded never
  processed, AI recorded/live per R56 G-4. No mention of Claude/Anthropic/AI tooling.
- Export gate: the exported tree builds and tests on its own in a temp dir (`pnpm install --frozen-lockfile`, typecheck,
  unit tests, `next build` of apps/web) — **red-prove** with a planted forbidden import (`adapters/dev` from services) and a
  planted forbidden word, each failing the export.
- **History (`--history`)**: on a throwaway clone (never this repo), `git filter-repo` (install with `brew install
  git-filter-repo` if missing — report if you cannot) with the same allowlist **plus explicit excludes** for what the
  teammate's 12 early commits put under `apps/web` (`apps/web/.claude/`, `AGENTS.md`, `CLAUDE.md`, `.vercel/`,
  `package-lock.json`, `apps/web/docs/`); a reviewed `--replace-text` map for Supabase/Vercel/Claude wording in old blobs
  (incl. applied migration comments — the Cup DB is fresh); a message callback rewriting commit messages that mention
  Supabase, Vercel, AWS, Claude, Anthropic, CLAUDE.md, Juspay, Snacky or internal wording; drop empty commits; authors
  and dates kept. **History-wide gate** over every blob and every message: `supabase`, `vercel`, `aws`, `claude`,
  `anthropic`, `\.claude`, `CLAUDE\.md`, `juspay`, `snacky`, the founder's and the teammate's email addresses (commit
  author fields keep the teammate's GitHub identity — check what the founder wants; default: keep author names, map
  emails to GitHub noreply addresses and report it), secret patterns (JWT, `sk-`, `AIza`, `ghp_`, PEM, `sfk_` other than
  public mock keys) → **0**. The final tree of the filtered history must equal `make export-cup`'s output (diff → empty).
- Output: the exported repo at a path you report (e.g. `~/munim-cup-export`), never pushed, never given a remote.

## Limits
Do not commit; no AI attribution in anything you write. Never read `.env`. Do not touch `pnpm-lock.yaml` of this repo
(report needed dependency changes). Ports 4400–4419. Concurrent work: T-118 or step-B checks may run in the tree —
stay in your territory (packages/config, composition roots, apps/web/lib/server, adapters/dev new mapping package,
dependency-cruiser config, scripts/export-cup.sh, the export target, ARCHITECTURE/README for the export, worldgen and
tests only for rewording). Shared files (`Makefile`, `.dependency-cruiser.cjs`, `packages/config`) — the orchestrator
reads every diff.

Report: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad/lane-T122-T123.md`
(files; the env-name mapping table; gate outputs incl. the history-wide gate counts before/after; red-proofs; the export
path; what you did not do). Final message ≤ 30 lines.
