# Lane M (migrator) report: `nebius` in both provider CHECKs (EV-3 / P1)

**Status: done.** Migration 0036 is written, the db tests pass, it is applied to the running local database, and core-api
`/health` reports `"migration_version":36`. core-api and core-worker were restarted after the apply, so lane A can go ahead.
**Blocks the gate:** `make ontology` must run before `make check`, because the contracts ontology freshness test now sees 0036 as a drifted input. See open issue 0.

## Files changed (repo-relative; commit exactly these)

New:

```
db/migrations/0036_ev3_nebius_provider.sql
db/tests/providers-0036.test.ts
```

Changed:

```
db/tests/manifest.ts
db/tests/grants.test.ts
db/tests/redproof-0017.sh
db/tests/redproof-0018.sh
db/tests/redproof-0019.sh
db/tests/redproof-0020.sh
db/tests/redproof-0021.sh
db/tests/redproof-0022.sh
db/tests/redproof-0023.sh
db/tests/redproof-0024.sh
db/tests/redproof-0025.sh
db/tests/redproof-0026.sh
db/tests/redproof-0027.sh
db/tests/redproof-0028.sh
db/tests/redproof-0029.sh
db/tests/redproof-0030.sh
db/tests/redproof-0031.sh
db/tests/redproof-0032.sh
db/tests/redproof-0033.sh
db/tests/redproof-0034.sh
db/tests/redproof-0035.sh
```

No new dependency, no lockfile change. Nothing outside `db/migrations/**` and `db/tests/**` was touched.

## What the migration does

`0036_ev3_nebius_provider.sql`. It is additive and runs in the runner's single transaction for the file.
- **Pre-check.** Both CHECKs must read back exactly as the four-provider list from 0002/0012, or the file refuses.
- **Change.** The migration drops each CHECK and adds it back under an explicit name, with `nebius` as a fifth value. Real names, read from `pg_constraint` on the local DB first:
  - `platform.model_role`: `model_role_provider_check`
  - `intel.intel_spend`: `intel_spend_provider_check`

  Both names stay the same, the pattern 0021 and 0028 used. Every older value is still allowed, so existing rows still pass, and both constraints are validated.
- **Post-conditions.** Read back from Postgres:
  - Each named CHECK equals the five-provider rendering and `convalidated` is true.
  - Exactly one CHECK on each table reads the `provider` column.
  - The `model_id` CHECK (never `gemini-2.5-*`) is still the one from 0002.
  - `munim_meta.assert_catalog('0036')` passes.
- **Guarantee scan (both clauses, in the file header).**
  - *Books:* no grant, policy, trigger, function or payload changes, and no row is written. `model_role` still changes only through an approved `config_draft`. intel still has no write grant: `providers-0036` P2 confirms that `munim_intel_ro` gets 42501 inserting a spend row.
  - *Traces to a ledger row:* no rendered number changes.

## Pinned lists and numbers (step 2)

- **Provider list.** No existing db test or migration-time assertion pinned it. `db/tests/w3decisions.test.ts:141` only uses `'openrouter'`, which is still valid. The new `db/tests/providers-0036.test.ts` now pins the five-value list.
- **Migration number or count, inside my territory (updated, the same set the 0035 commit 6f94218 changed):**
  - `db/tests/manifest.ts`: `MIGRATIONS` gains `0036_ev3_nebius_provider`; the header now says 0001–0036.
  - `db/tests/grants.test.ts`: 34 → 35 applied; the planted file is now 0037 and its red-proof count is 36.
  - `db/tests/redproof-0017.sh` … `redproof-0035.sh`: each planted `0036_redproof_plant.sql` / `assert_catalog('0036')` is now `0037`. These had to change: a real `0036_*` file next to a planted `0036_*` makes `readMigrations` throw "gap or duplicate", so every one of those scripts would break. I did **not** run these scripts. They plant files into the shared `db/migrations`, so they belong in a scratch copy.
- **Computed from the files, so nothing to change:** core-api `/health` (`max(version)`), `services/core-api/test/health.test.ts` and `tests/smoke/smoke.test.ts` S1.
- **Pinned outside my territory. Not edited; the orchestrator or a docs lane should update these:**
  - `db/README.md:11`: "35 numbered SQL files, `0001` to `0035`" → 36 / `0036`.
  - `db/README.md:114`: "34 apply" → 35.
  - `db/README.md` migrations table: needs a `0036` row, e.g. "`0036` | `nebius` added to the model-role and model-spend provider lists".
  - `scripts/export-cup/root/docs/data-model.md:148`: "There are 35 files; the embedded test database applies 34" → 36 / 35.
  - `deploy/vercel/README.md:204,228`: pins `migration_version` 31. This was already stale before tonight; hosted is at whatever was last applied there.

## Gates run (output verbatim)

- Full db suite, `cd db && NO_COLOR=1 ./node_modules/.bin/vitest run --reporter=verbose`:
  ```
   Test Files  38 passed (38)
        Tests  499 passed (499)
  exit=0
  ```
- `cd db && ./node_modules/.bin/tsc -p .`: `tsc exit=0`
- `cd db && node tests/static-gate.ts`: `static-gate: 36 migration file(s) scanned, 0 forbidden construct(s)` (exit 0)
- From the run of `providers-0036` and `grants`:
  ```
  migrate: applied 0036_ev3_nebius_provider
   ✓ tests/providers-0036.test.ts > DEF the provider CHECKs > one validated CHECK on provider per table, named, reading back the five-provider list
   ✓ tests/providers-0036.test.ts > P1 platform.model_role.provider > 'nebius' and the four older values accepted (read back); 'nebius ' and 'bogus' → 23514
   ✓ tests/providers-0036.test.ts > P2 intel.intel_spend.provider > munim_svc records 'nebius' and 'nvidia' spend; 'bogus' → 23514; munim_intel_ro cannot insert (42501)
   ✓ tests/providers-0036.test.ts > RED-PROOF > with the CHECKs back at four providers (a clone, NOT VALID), the same 'nebius' writes → 23514
   ✓ tests/grants.test.ts > migrations > migration count = 35 applied, names and order match the manifest, 0013_embeddings skipped loudly
   ✓ tests/grants.test.ts > migrations > RED-PROOF: a planted 0037 applied to a clone → count/names no longer match the manifest
   ✓ tests/grants.test.ts > intel cannot write > INSERT/UPDATE/DELETE/TRUNCATE as munim_intel_ro → 42501 on N/N tables (N = 170)
  ```
- **Red-proof of the new gates, judged by process exit code.** This ran in a scratch copy of `db/` (the scratchpad, not the worktree), with a planted `0037_redproof_plant.sql` and `tests/providers-0036.test.ts` run each time. The clean run exited 0 with 4 passed. Every plant was red with a non-zero exit:
  ```
  ok   narrow-both: exit≠0; × tests/providers-0036.test.ts > DEF the provider CHECKs > one validated CHECK on provider per table, …
  ok   narrow-spend: exit≠0; × tests/providers-0036.test.ts > P2 intel.intel_spend.provider > munim_svc records 'nebius' and 'nvidia' spend; …
  ok   widen-bogus: exit≠0; × tests/providers-0036.test.ts > P1 platform.model_role.provider > 'nebius' and the four older values accepted …
  ok   pc-def: exit≠0; Error: migrate: 0037_redproof_plant failed and was rolled back: 0036: provider CHECKs not as written: platform.model_role def
  ok   pc-count: exit≠0; Error: migrate: 0037_redproof_plant failed and was rolled back: 0036: provider CHECKs not as written: intel.intel_spend count
  ok   pc-model-id: exit≠0; Error: migrate: 0037_redproof_plant failed and was rolled back: 0036: provider CHECKs not as written: model_role model_id
  ```
  (The `pc-*` plants re-run 0036's own post-condition block after a perturbation.) There is no `redproof-0036.sh` in the repo; the procedure above is the red-proof.
- I did **not** run `make check`; the orchestrator runs it.

## Local database: applied

- **Target.** `.run/local/local-db.json` points at `postgresql://127.0.0.1:57154/munim`. The apply script refuses any host other than `127.0.0.1`.
- **How it was applied.** Through the repo's own runner: `migrate()` imported from `db/migrate.ts`, connecting as the embedded cluster's admin, with `lock_timeout` 30 s. `.env` was not involved and no secret was printed. Runner output:
  ```
  apply-local: target 127.0.0.1:57154/munim
  migrate: SKIPPED 0013_embeddings — requires extension(s) vector, not available on this server (not recorded; applies where available)
  migrate: applied 0036_ev3_nebius_provider
  apply-local: 1 applied [0036_ev3_nebius_provider], 34 already applied, 1 skipped [0013_embeddings]
  ```
- **Read back on the live local DB:**
  - Both `*_provider_check` constraints are `convalidated: true`, with `CHECK ((provider = ANY (ARRAY['gemini'::text, 'openai'::text, 'openrouter'::text, 'nvidia'::text, 'nebius'::text])))`.
  - `munim_meta.schema_migrations` top row: `36 0036_ev3_nebius_provider`.
  - Existing rows are intact: `platform.model_role` 6 rows, all `gemini`; `intel.intel_spend` 3 rows, all `gemini`.
- **Restarts and health.**
  - `scripts/dev/restart-svc.sh core-api` and `scripts/dev/restart-svc.sh core-worker` both exited 0. Both processes are alive; the worker logged `worker.started`.
  - **core-api `/health`: `{"status":"ok","migration_version":36,"idp":"local"} http=200`**
- local-db was not restarted. No seeded world was touched.

## Open issues and hand-offs

0. **`make ontology` is required before `make check`. This blocks the gate.**
   - `packages/contracts/generated/ontology.json` stamps the sha256 of every file in `db/migrations`. Test (3) "fresh" in `packages/contracts/test/ontology.test.ts` is now red. A read-only `inputsDigest()` comparison shows exactly one drifted input: `["db/migrations/0036_ev3_nebius_provider.sql"]`.
   - The ontology's `provider` columns carry no enum, so the body most likely changes only in its stamp.
   - Tonight `packages/contracts` belongs to lane A, so I did not regenerate it. Lane A, or the orchestrator, should run `make ontology` after lane A's `make contracts`, which changes `packages/contracts/src`, also an input. The 0035 commit regenerated the ontology in the same commit as its migration.
1. **0036 is now frozen.** The running local DB records its sha256. Any review change to its bytes, even a header comment, has to go in a new `0037` fix-forward file. Otherwise the next apply on this database fails with "was edited".
2. **Lane A (contracts).** The API still refuses `nebius` until lane A adds it to:
   - `MODEL_PROVIDERS` in `packages/contracts/src/platform/index.ts:12`
   - the spend enum in `packages/contracts/src/internal/index.ts:259`
   - the regenerated SDK and Pydantic models (`make contracts`)

   The database now accepts it on both tables.
3. **Hosted database.** The hosted Supabase project is **not** migrated, and must not be tonight (guard). It needs 0036 before any hosted `nebius` model-role config or spend row; otherwise those writes get 23514.
4. **Out-of-territory doc counts.** These are listed above: `db/README.md`, `scripts/export-cup/root/docs/data-model.md`, and the already-stale `deploy/vercel/README.md`. No test or script I could find checks them (I searched `*.test.*`, `*.py`, `*.ts`, `*.sh` under `db`, `scripts`, `tests`, `packages`, `tools` and `services`), so they don't block `make check`, but they are now wrong. The orchestrator or a docs lane should update them.
5. **Housekeeping.** The red-proof scratch copy is deleted. After the runs, `ps` shows one embedded Postgres, local-db, started 01:24, so no cluster was left running. `make test-db` is `pnpm -F @munim/db test`: the same vitest suite I ran directly. The report file itself, `docs/plan/lanes/M.report.md`, is untracked; whether to commit it is the orchestrator's call.

## Docs versus schema reality

- No contradiction. The CHECKs were inline and auto-named, as M.md said: `model_role_provider_check` and `intel_spend_provider_check`. Postgres renders them as `provider = ANY (ARRAY[...])`.
- Only cosmetic: M.md quotes the list without spaces; the migration files have spaces.
