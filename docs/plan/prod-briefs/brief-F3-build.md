# F3 — the FalkorDB build (R68; design `docs/plan/falkordb/design.md`)

Build exactly `docs/plan/falkordb/design.md` §10 (17 steps), from §0 decisions D1–D9 and the §3–§7 texts. Read first:
`CLAUDE.md` (hard rules, gotchas 17, 27, 33, 40, 42), design §0, §3, §4, §10, §11, R68 in `docs/plan/00-decision-ledger.md`.

Founder rulings already made (R68): the graph API routes **yes** (both features); a live URL later on FalkorDB Cloud (the
founder deploys; no instance exists yet, so **every gate runs on the embedded test server**, design §11); the repo is named
`business-graph` (F4, not this lane). Add `MUNIM_FALKORDB_URL=` (empty) to `.env.example` with a one-line comment — never
open `.env`.

## Lanes (two agents at most; heavy commands through `scripts/dev/heavy.sh`)
- **Lane A (you, now):** steps 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9 → 10 → 11. **Do step 9 (contracts) as early as it can
  stand** and tell the orchestrator by message when it lands, so Lane B (the screen, 14; then 12 → 13) can start on it.
- **Lane B (later, separate agent):** 14, 12, 13. **Last (whoever finishes first, orchestrator assigns):** 15, 16, 17.

## Where you work
**Only in the git worktree `~/.cache/munim-wt/f3`** (branch `f3-falkordb`, from c784ea8). Never edit the main checkout
`/Users/satviksawhney/Downloads/projects_26/foodops-os`; other lanes (C3 clean-up, C4 docs, go-live) work there. First, in
the worktree, through heavy.sh: `pnpm install --frozen-lockfile --offline` and `uv sync --frozen --offline` (both reuse
the stores; say how much disk the worktree takes). The orchestrator commits your branch and merges it; C3 is rewording
comments in `packages/config/src/index.ts` and apps/web on main, so expect a small merge there — keep your hunks in that
file minimal.

## Two rulings for this build (orchestrator, from review)
- **Mounted only with a graph backend.** The Cup export and the main demo keep the Postgres graph backend and must not
  show a broken feature: the `/v1/graph/*` routes are mounted, and the supplier map's route and its links shown, **only
  when the configured graph backend is the graph adapter** (neutral names; core-api never names FalkorDB). With the
  Postgres backend the routes 404 and no link appears. A test per backend, and a red-proof. Keep the public API
  description honest for the Cup build (the graph routes either stay out of its OpenAPI or say they need a graph backend —
  pick the simpler and report it).
- **The swap is one function.** FalkorDB Cloud has not been probed (`RENAME`, `SCAN`, graph-count limits incl. staging
  keys are UNVERIFIED). Keep the staging-key-and-`RENAME` swap and the stale-key cleanup behind one function each, so a
  no-`RENAME` variant (a pointer key naming the live graph) is a one-file change. Write the probe as a script
  (`scripts/dev/probe-falkordb.ts`, reads `MUNIM_FALKORDB_URL` through packages/config, read-only plus one scratch key it
  deletes) that the orchestrator runs once the founder's instance exists.
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `Makefile`, `.gitignore`, `.env.example`: yours for this build; report every
  hunk (the orchestrator reads the lockfile diff, gotcha 27). `.gitignore` already carries an unrelated uncommitted hunk
  (`.agents`, `.codex`, `.claude`) — leave it.
- `make contracts` regenerates shared generated files: run it once per contract change, report it.

## Rules
- Every gate asserts a positive count from an independent source, is red-proved by a plant, and checks the process exit
  code (gotcha 33). FalkorDB tests start their own server; they never skip (a missing binary fails with "run make
  falkordb-fetch").
- No Cup-exported file names FalkorDB (D9). The Cup export must stay green (step 17).
- Core is the only writer (D1); reads are `GRAPH.RO_QUERY` only (D5); no Postgres fallback in the FalkorDB backend (D6);
  intel's graph tool declarations byte-identical (D7); no numbers or personal data in the graph (D8).
- Ports 4540–4559 for FalkorDB test servers, 4620–4639 for anything else. Kill by PID.
- No commits, no staging (gotcha 40). No AI attribution anywhere. Never open `.env`.
- Disk is tight (~12 GB free): no repo copies; if you need a scratch copy, rsync excluding `node_modules`, `.venv`,
  `.next`, `video/`, and delete it when done (gotcha 37).

## Report (as text, or `…/scratchpad/f3/report.md`)
Per step: files, the test and its red-proof output (exit codes), anything cut (design §10 cut ladder) and why; the
guarantee scan (both clauses); every shared-file hunk; what you did not do.
