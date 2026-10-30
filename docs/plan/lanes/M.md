# Lane M (migrator): `nebius` in both provider CHECKs

Read `docs/plan/lanes/COMMON.md` first; its guard binds you. Report: `docs/plan/lanes/M.report.md`.

Territory: `db/migrations/**` (one new forward file), `db/tests/**` only where a test pins the provider list.

1. A new forward migration (the next number after the highest in `db/migrations/`; follow the repo's naming and
   header conventions) that adds `'nebius'` to the provider CHECK on both tables:
   `db/migrations/0002_platform.sql:54` and `db/migrations/0012_compliance_goals_intel.sql:537`
   (`CHECK (provider IN ('gemini','openai','openrouter','nvidia'))`). Additive only: existing rows and values stay
   valid; drop and re-add the constraint in one transaction. The CHECKs are inline, so their names are auto-generated:
   read the real names from `pg_constraint` on the local DB (or the harness) first, and name the new ones explicitly. Never edit an applied migration.
2. Check whether any db test or migration-time assertion pins the provider list or the highest migration number
   (core-api `/health` reports `migration_version`; the smoke checks it); update tests that pin the list, and note
   anything that pins the number.
3. Run the `db` package tests (they build their own throwaway clusters).
4. Apply the migration to the **running local** database only (`.run/local/local-db.json` must point at
   `127.0.0.1`; use the repo's own migrate entry point, `db/migrate.ts`, with that URL — read it for the admin URL it
   needs). Then `scripts/dev/restart-svc.sh core-api` and confirm `/health` shows the new `migration_version` — write, apply
   and restart in one sitting; lane A waits for your report before it restarts core-api. Also restart `core-worker`.
   If applying to the running DB is not possible without restarting local-db, **do not restart it**: report instead.
- **Done when:** the migration exists, db tests pass, the local DB has it applied (or the report says why not).
