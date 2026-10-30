# C3 — clean-up before the Cup docs and export (plan 07, R62)

Read `CLAUDE.md` (hard rule 2 for the export; gotchas 40, 42), `docs/plan/HANDOFF-PROD.md` ("C3 clean-up must include"),
`scripts/export-cup/rules.py` (what the export keeps and forbids). Concurrent lanes: the **FalkorDB build** (F3, in its own
worktree `~/.cache/munim-wt/f3` — it does not touch this tree), the **docs lane** (C4: `scripts/export-cup/root/**`,
`docs/shared/`, per-module READMEs incl. `apps/web/README.md`) and the **go-live lane** (deploys from a
clean worktree; it may edit `packages/sdk/scripts/pack.mjs`, `apps/site` downloads/getting-started, `packages/sdk/README.md`
for SDK 0.3.0). Stay out of those files.

## Do
1. **Export gate:** `make export-cup EXPORT_ARGS="--check"` must pass. Today it fails on 8 "Vercel" words in committed
   apps/web files (the cached-shell comments, README) and `packages/config/src/index.ts`, plus anything else it now finds.
   Reword provider-neutrally ("the deploy platform", "the CDN"); never edit applied migrations (the export's text map handles
   their comments). **`make export-cup` exports a commit (HEAD), never the working tree**, so it cannot see your edits:
   check with `scripts/dev/heavy.sh /private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/sync/export-wt.sh` (a temp index + a dangling commit; no ref moves, the real index is untouched).
   `apps/web/README.md` belongs to the docs lane (C4), which clears its words; FalkorDB mentions in intel belong to the
   FalkorDB build — leave both.
2. **Ask shows outlet names:** answers cite an outlet by its raw id (the snapshot cell `outlet_id`). Render the outlet's
   name wherever a source chip or answer text shows an outlet id (apps/web's ref/source rendering, using the outlets the
   session already has); numbers still come only from cells. Test + red-proof.
3. **GCP runbook:** the synthetic seed operator's `platform.operator` row needs one admin SQL insert (no route creates
   operators) — write that step exactly, through the Cloud SQL admin connection, with the reason, in `infra/gcp/README.md`.
4. **Docs and housekeeping (this repo):** the CLAUDE.md "Stack" line and doc map (apps/web = Cobnut demo + staff screens;
   apps/site = Munim site; `adapters/gcp`, `infra/gcp`, `deploy/vercel`, `video/`; the handoff packs are history);
   `docs/plan/BOARD.md` brought up to date with T-110…T-128 (done) and F-tickets; dead code and stale comments the export
   check or a quick grep finds (`TODO`/`FIXME` without an owner, references to removed files); the stale `.orig`/`.bak`
   files anywhere tracked.
5. **T-128 leftovers:**
   - **Consent keys (severity 2):** `consentHandler` writes `{marketing, at}` but `customers.consented_audience` reads
     `email`/`sms`, so a non-demo business's consented audience is always 0. Make the writer and the reader agree. Prefer the fix
     that keeps existing `{marketing, at}` rows (already on the hosted DB) readable over changing what the writer stores.
     **Migrations belong to the migrator lane only (rule 6):** if the fix needs SQL in a migration, stop that item and
     report exactly what the migration must change; I spawn the migrator. Test + red-proof whatever you do change.
   - **Intel run-token flake (severity 3):** session-scoped minted run tokens (900 s) expire on a slow suite. Mint per test
     or give the test fixture a longer TTL (tests only; production TTL unchanged).
   - **Null-page branch:** restore a core-api test for "nothing published → `page: null`" (a world without the page).
6. **Void the old local test order** only if the local dev DB is up (it is not required; skip and say so if not).
7. Do **not** drop `git stash@{0}` (founder's word pending).

## Gates
`make check` green (through heavy.sh); the working-tree export check above green (0 forbidden words, build + tests); no AI attribution; no commits; never
open `.env`; ports 4600–4619. Report `…/scratchpad/c3/report.md` (or as text): files, gate output, what you did not do.
