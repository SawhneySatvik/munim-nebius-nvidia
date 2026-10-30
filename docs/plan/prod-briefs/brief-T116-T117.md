# T-116 and T-117 — known gaps before the split (R56 G-2, plan 06 step C)

Read `CLAUDE.md` first (it binds you; rules 4–6, 14, 16, 20; gotchas 1–3, 21, 22, 27, 29, 30, 33), `docs/plan/06-gaps-and-split.md`
(rows T-116, T-117), and the T-113 report section on known gaps:
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/reports/lane-B2.md`
(items [2] and the tick notes). Ledger R54–R56 bind.

Concurrent lanes (stay out of their files): **Lane C (T-114)** — `services/core-api/src/modules/purchasing/**`,
`services/core-api/src/internal/writes.ts`, `packages/contracts/**` + generated output, `services/intel/**`; its stack on
ports 4350–4359. **T-121** — `infra/gcp/**`, `scripts/deploy-gcp.sh`, the Makefile `deploy-gcp` target.
Do not commit. No AI attribution in anything you write. Never read `.env`. Never touch `pnpm-lock.yaml` (report
dependencies). Never 8787/4102/3000; leave 8790/8090 alone.

## T-117 (you are the only migrator now) — tick ledger, poison rows on the outbox
Problem: `Worker.tick` (`services/core-worker/src/worker.ts`) takes a cluster-wide advisory lock, so two *concurrent*
ticks are safe, but a *repeated* tick for the same aligned slot (Vercel cron retry, manual call, Cloud Scheduler retry)
re-runs every job — the morning brief is re-posted. And `PoisonRows` (`sweeper.ts`) counts failures in memory per
instance, so on serverless a poison row never dead-letters.
Fix:
- Migration `0031_tick_ledger.sql` (additive): a table recording `(job, slot_at)` claims — `munim:operational`, platform-
  level or tenant-less as the existing operational job tables are (read how 0001–0030 model cross-tenant service state and
  follow it; if it must carry `tenant_id`, it leads the key), unique `(job, slot_at)`, `claimed_at`, `finished_at`,
  `outcome`; written only by `munim_svc` (explicit revoke-then-grant; no DELETE anywhere; RLS forced if it has a tenant);
  manifest + DB gates (isolation if tenant, service-privilege, static gate) + its own red-proof script like
  `redproof-0030.sh`; post-conditions inside the migration as 0030 does; bump the other red-proof scripts' plant number
  (0031 → 0032) as Lane D did for 0030.
- core-worker: each job in a tick claims `(job, slot)` in the tick transaction (`INSERT … ON CONFLICT DO NOTHING`); an
  already-claimed slot skips that job and reports it (`"brief": "already-ran"`); `ran:false` semantics for the lock stay.
- Poison counting moves onto `core.outbox.publish_attempts` / `dead_at` (0014; munim_svc already has UPDATE on those
  two columns): a failed publish increments `publish_attempts` in the database; at `POISON_ATTEMPTS` the row gets
  `dead_at`; the in-memory `PoisonRows` goes away (or becomes a thin wrapper over the columns).
- Done when: two concurrent ticks in one slot → one runs, one `ran:false`; a replayed slot posts no second brief
  (`fanout-brief` skipped) and the other jobs skip too; a poison row dead-letters across two separate processes;
  each red-proved (a non-zero exit). `make test-db` green; core-worker and core-api tests green (the T-113 tick route
  tests included).

## T-116 — a shared blob store (Supabase Storage) for uploads and imports
Problem: `services/core-api/src/env-root.ts` (T-113) stores upload blobs in a per-instance temp directory; the import
parse runs in the tick on another instance, so production imports cannot find their files.
Fix:
- `adapters/dev/blob-supabase/` (new package, like `adapters/dev/idp-supabase`): a `BlobStore` over Supabase Storage's
  REST API (a private bucket; content-addressed `<tenant>/<sha256>` keys as the existing store uses; URL and service key
  only through `packages/config`; errors name the step and HTTP status, never a key or body). Read the existing
  `BlobStore` port where core-worker defines it (`services/core-worker/src/imports/index.ts`, `main.ts`) and the
  Cloud Storage adapter `adapters/gcp/blob-gcs` (T-120) — write **shared contract tests** both adapters run (move
  blob-gcs's contract-style cases into one shared test module both import; keep blob-gcs green).
- env-root chooses the store by env (`MUNIM_BLOB=supabase|gcs|fs`; `fs` stays the local default); core-worker's import
  wiring uses the same choice. Platform-neutral code (the choice) in services; Supabase-specific code only under
  `adapters/dev` (boundaries enforce it).
- Done when: an upload through core-api in one process is parsed by a tick in a second process against a local
  stand-in for Storage (a small local HTTP server speaking the subset of the Storage API you use — no network), red-proved
  (pointing the second process at an empty store fails); shared contract tests pass for both adapters; `make boundaries`
  green. Do not create buckets or call the hosted project — write the one-time bucket setup into
  `deploy/vercel/README.md`'s env/setup section (that file is yours for this one addition).

## Report
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad/lane-T116-T117.md`:
files, migration summary, gate output (`make test-db`, core-worker, core-api, adapters), red-proofs, guarantee scan (both
clauses), hosted-apply note (0031 after 0030), what you did not do. Final message ≤ 30 lines.
