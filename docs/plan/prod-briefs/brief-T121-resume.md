# T-121 resume — finish `infra/gcp/` (the Cup's Cloud Run infrastructure)

Read `CLAUDE.md` (hard rules 2 and 5, gotchas 7, 8, 17, 23, 24, 27 bind you), `docs/plan/06-gaps-and-split.md` (the T-121
row and step D), ledger R56 (Mumbai `asia-south1`; the Cup deploy runs `MUNIM_MODEL_MODE=live` on the Gemini free tier
under the R47 cap; every gate stays recorded), `docs/plan/03-architecture.md` §8 (connection budget) and
`adapters/gcp/README.md` (T-120, done: Identity Platform IdP + Cloud Storage BlobStore; wiring is T-122's job).

## State (a previous run was cut off without a report; files are untracked in the tree)
`infra/gcp/cloudbuild.yaml`, `cloudbuild-web.yaml`, `gcloudignore`, `docker/{core-api,core-worker,intel,suppliers-sim,web}.Dockerfile`
(+ `.dockerignore` each), `entries/{core-api,core-worker}.mjs`, `scripts/deploy-gcp.sh` (create-or-update, flags parsed
both ways, `--dry-run`). The script refers to **`infra/gcp/README.md`, which does not exist**. Read every file first and
keep what is right.

## Finish
1. `infra/gcp/README.md`: one-time setup the founder runs (project, billing link, APIs to enable, Artifact Registry repo
   `munim` in asia-south1, service accounts with least privilege per service, Secret Manager secrets — the exact names
   `deploy-gcp.sh` uses — Cloud SQL Postgres created with `--edition=ENTERPRISE` (gotcha 7) in asia-south1 with the
   smallest tier that fits the connection arithmetic (write the arithmetic: services × instances × pool max + reserved,
   gotcha 24), Identity Platform enablement, the GCS bucket, **a budget alert at the founder's figure** (a command with a
   placeholder; the founder sets the amount)), then the deploy order (migrations and roles first, then seed, then
   services), how to reseed Cobnut, rollback, and cost notes (min-instances 1 only where needed: core-api for SSE + the
   always-on core-worker, gotcha 8; SSE max age under Cloud Run's 60-minute cap). Plain words; commands copy-pasteable;
   no secret values anywhere.
2. Check `deploy-gcp.sh` against the services' real env names: today the code reads the names `packages/config` and
   `munim_intel.config` accept (T-113 env-only boot). T-122 (next, separate lane) introduces neutral names
   (`MUNIM_DB_URL_SESSION`/`_TRANSACTION`, `MUNIM_IDP=identity-platform`, `MUNIM_BLOB=gcs`, …). Make the script and README
   use the neutral names consistently and **list every name in one table** (service, secret or plain, source) that T-122
   must make the code accept. Do not edit `packages/config` or services yourself.
3. `make deploy-gcp` target in the Makefile → `scripts/deploy-gcp.sh` (one target; read the Makefile style first; the
   `deploy-gcp` stub exists — replace it, keep `export-cup` as is).
4. Verify without the cloud: `bash -n`; `shellcheck` if installed; `scripts/deploy-gcp.sh --dry-run --project demo-proj`
   prints the full plan and exits 0; unknown flag → exit 2; `--project` without value → exit 2; `--project=x` works
   (red-prove each). If `docker` is available locally, build at least the core-api and web images from the repo root
   (`docker build -f infra/gcp/docker/<svc>.Dockerfile .`) and run each with `--help`/a health probe against nothing; if
   not available, say so — do not install Docker.
5. Hard rule 2 gate: `grep -ril 'supabase\|vercel\|aws\|claude\|anthropic' infra/gcp scripts/deploy-gcp.sh` → empty.

## Limits
Territory: `infra/gcp/**`, `scripts/deploy-gcp.sh`, the Makefile's `deploy-gcp` target only. No `gcloud` commands that
talk to Google (no auth, no project calls). No `.env`. Ports for anything local: 4380–4389 (never 8787, 4102, 3000; leave
8790, 8090 and 4350–4359 alone — Lane C is running there). Do not touch `pnpm-lock.yaml`. Do not commit. No AI attribution
in anything you write.

Report: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad/lane-T121.md`
(files, the env-name table, verification output, what you did not do). Final message ≤ 20 lines.
