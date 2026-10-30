# munim-api on Vercel

This deploys one Vercel project, **munim-api**, on the Hobby plan. It runs three services:

| service | runtime | what it is |
|---|---|---|
| `core` | Node 24, Fluid compute | core-api, plus core-worker's jobs behind the tick route |
| `intel` | Python 3.12 | FastAPI / ADK |
| `suppliers` | Python 3.12 | A2A, **simulated suppliers only** |

All three run against the existing hosted Supabase project. apps/web (project munim-cobnut) reaches munim-api only through its `/api/*` rewrite (`MUNIM_API_ORIGIN`).

**Who does what (R57, updated 16 Oct).** A push to `main` deploys on its own (next section). The founder's steps are one-time: connect the Vercel GitHub app to the repo and put a Vercel token in a GitHub secret (both below). `! node deploy/vercel/env-setup.ts` stays the one line that sends secrets to Vercel without anyone seeing a value (CLAUDE.md rule 20). `node deploy/vercel/deploy.mjs` from the orchestrator's machine is the manual fallback. Everything is in Mumbai (`bom1`, R56 G-5).

Everything Vercel-specific lives in this directory. `services/*` and `packages/*` stay platform-neutral.

- core boots through `services/core-api/src/env-root.ts`.
- intel boots through `munim_intel.asgi`.
- suppliers-sim boots through its `build_app`.

## How deploys happen

| project | when it deploys | how |
|---|---|---|
| **munim-cobnut** (apps/web) | a push to `falkordb` (its production branch since R73) | Vercel's own Git build: install, `next build`, deploy to production |
| **munim-rho** (Vercel project `munim`, apps/site) | a push to `main` | the same |
| **munim-api** | `ci` succeeds on a push to `falkordb` (R73) | `.github/workflows/munim-api.yml`: `build.mjs` stages the project, the Vercel CLI uploads it. Vercel's Git build cannot build this one: what it runs is staged by `build.mjs`, not a folder of the repo. |

Both Next projects build without waiting for `ci`; only munim-api waits for it. `ci` takes 75-100 minutes on GitHub (a push on 16 Oct took 1 h 15 min), so munim-api trails a push by that long. A manual run (Actions > munim-api > Run workflow, from main) skips the wait and deploys the head of `falkordb`. The workflow checks out the commit `ci` passed, not the tip of `falkordb`; runs queue one at a time; a slow older run that finishes after a newer one would deploy the older commit (not guarded).

The ignored-build step diffs against the branch's last successful deployment, which can be a preview of the same commit: a production
deployment of a commit already built as a preview is then skipped (CANCELED). When munim-cobnut's production branch moved to `falkordb`
on 17 Oct, its first production deployment of the branch head was therefore a prebuilt CLI deploy from a clean checkout (`--archive=tgz`).

**Settings of the two Next projects.** Root Directory, framework and Node come from `deploy.mjs` for munim-cobnut; everything else was set through the Vercel API on 16 Oct and `deploy.mjs` does not manage it (the `PATCH /v9/projects/<id>` body is the setting's name and value; the variable is `POST /v10/projects/<id>/env`):

| setting | munim-cobnut | munim-rho |
|---|---|---|
| Root Directory | `apps/web` | `apps/site` (the API had `null`; the repo root's `.vercel/project.json` only cached `apps/site`) |
| Source files outside the Root Directory | on | on |
| Framework / Build Command | Next.js / default (`pnpm run build`) | the same |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` | the same |
| Environment | `ENABLE_EXPERIMENTAL_COREPACK=1` (production, preview), plus the production-only variables listed below | `ENABLE_EXPERIMENTAL_COREPACK=1` (production, preview), nothing else |
| Function region | `bom1` (the project default was `iad1`; only the CLI deploys passed `--regions bom1`) | `bom1` (its production deploys had run in `iad1`) |
| Node.js | 22.x | 24.x |
| Ignored Build Step | `bash "$(git rev-parse --show-toplevel)/deploy/vercel/ignore-build.sh" web` | the same with `site` |
| Production branch | `main` (set when the repo is connected) | the same |

- **pnpm.** Vercel's own pnpm stops at 10, and the repo's `packageManager` is `pnpm@11.9.0` (the lockfile is `9.0`). `ENABLE_EXPERIMENTAL_COREPACK=1` makes Vercel run 11.9.0. Without it, an override `pnpm install` would use the oldest pnpm in the build container. The install runs from the workspace root with the frozen lockfile (the build log reads `Done in 15.3s using pnpm v11.9.0`, `Lockfile is up to date`).
- **Ignored Build Step.** `ignore-build.sh` diffs `$VERCEL_GIT_PREVIOUS_SHA` (the last successful deployment of the branch) against `HEAD` over the project's inputs and exits 0 (skip) when nothing changed. A push of several commits builds only its tip, so it never diffs against `HEAD^`. No previous sha, or one not in Vercel's depth-10 clone, builds. Inputs: **web** = `apps/web`, `packages/sdk`, `adapters/dev`, `adapters/gcp` (apps/web reaches the last two through tsconfig paths and a relative import); **site** = `apps/site`, `docs/kit`, `packages/contracts/generated`, `tsconfig.base.json` (the site reads them while prerendering, `apps/site/lib/repo.ts`); both also `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`. A new input means a line in the script, then `node --test deploy/vercel/test/ignore-build.test.ts`. A skipped build is a push that changed nothing the project reads; a changed environment variable still needs a redeploy (the dashboard's Redeploy with "Use project's Ignore Build Step" unchecked, or `deploy.mjs`).
- **Proven on 16 Oct, without a push:** both projects built from a clean worktree of `c14102c` with `vercel deploy --archive=tgz` (a preview, not production) and reached Ready; `pnpm install`, `vercel pull` and `vercel build --prod` still pass locally against the new settings. The Git-triggered build itself, and the ignore script on Vercel, are UNVERIFIED until the first push after the connection.
- **Previews.** munim-cobnut's variables are production-only, so a preview from another branch builds without them and will not talk to munim-api.

**What the founder does, once:**
1. **Connect the Vercel GitHub app to `SawhneySatvik/food-ops` (not done; Vercel reports "Vercel App is not installed" for that GitHub account).**
   - Open https://github.com/apps/vercel/installations/new, choose the account `SawhneySatvik`, pick *Only select repositories*, select `food-ops`, and install.
   - The Vercel account must also be signed in to GitHub as `SawhneySatvik` (Vercel > Account Settings > Authentication). UNVERIFIED which GitHub login it holds now: Vercel's default import namespace is another GitHub user, `paybxis`, which has no `food-ops`.
   - Then connect each project in the dashboard (https://vercel.com/satvik-sawhneys-projects/munim-cobnut/settings/git and https://vercel.com/satvik-sawhneys-projects/munim/settings/git, Connect Git Repository), or tell the orchestrator to run `vercel api -X POST /v9/projects/<id>/link -f type=github -f repo=SawhneySatvik/food-ops -f productionBranch=main` for `prj_SnyN3wJh6doO1C5qTdL6sV5U5otM` (munim-cobnut) and `prj_x8D6vby5mV2PSmypeAMnJhPLD7LA` (munim-rho). Never for munim-api.
   - Check: `vercel api /v9/projects/munim-cobnut --raw` shows `link.repo` `food-ops` and `link.productionBranch` `main`. Hobby also needs each commit's author to be the Vercel account's own GitHub user (UNVERIFIED).
2. **Give the workflow a Vercel token.** Create one at https://vercel.com/account/tokens, then run `! gh secret set VERCEL_TOKEN -R SawhneySatvik/food-ops` (it prompts and does not echo). `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (munim-api) are already set; they are ids, not secrets. Until the token exists the workflow stops at its first step and says which secret is missing.

## How it is built

`node deploy/vercel/build.mjs` stages `deploy/vercel/out/`, which is git-ignored. That directory is what gets uploaded:

```
out/vercel.json            services, rewrites, cron (this directory's vercel.json)
out/.vercelignore          "!node_modules": the CLI skips node_modules on upload unless told otherwise
out/core/                  index.mjs + core-api, core-worker, config, contracts, core-domain, the dev adapters at
                           their repo paths + a flat node_modules (real files; @munim/* are relative symlinks)
out/intel/                 index.py + services/intel/{munim_intel,fixtures} + two contracts files intel reads by path
                           + requirements.txt (uv export --locked --no-dev) + .python-version
out/suppliers/             index.py + services/suppliers-sim/suppliers_sim + requirements.txt + .python-version
```

The staging is deliberate. Vercel's Node builder compiles every TypeScript file it traces and renames it to `.js`, but core-api finds its modules by path (`<module>/index.ts`). So:
- core's entry is plain JavaScript with a computed import, which leaves nothing for the builder to trace.
- `includeFiles: "**"` ships the staged tree as is.
- Node 24 strips the types at run time.
- Python dependencies come from the repo's `uv.lock`, never from re-resolving `pyproject.toml`.

**Routing:**
- `/suppliers-sim/*` goes to `suppliers`.
- Everything else goes to `core`.
- `intel` has **no public route**:
  - core reaches it over a service binding, injected as `MUNIM_INTEL_URL`;
  - it reaches core over the project's public domain, `MUNIM_CORE_URL` (the production origin): Vercel refuses circular
    service bindings (core → intel → core), so intel has no binding to core;
  - bindings do not authenticate, so the service secret still guards every call.

**Cron:** `0 1 * * *`. That is once a day, the Hobby minimum, and it fires anywhere in 01:00–01:59 UTC.
- It calls `GET /internal/cron/v1/tick` with `Authorization: Bearer $CRON_SECRET`.
- Each call runs every core-worker job once for the slot `(yesterday 01:00, today 01:00]` UTC.

## Project settings

`deploy.mjs` creates each project with `vercel project add` (never through `vercel link`, which would also connect this repo's Git remote: a Git connection is made on purpose, once, as described above), applies the settings below once with `vercel project update`, and links the directory it deploys from. `--apply-settings` re-applies them. **Never connect Git to munim-api**: Vercel would build the repo root on every push instead of the staged `out/`.

**munim-api** (dashboard check):

| setting | value |
|---|---|
| Plan | Hobby |
| Framework preset | Other (the services are declared in `vercel.json`). UNVERIFIED: if the first deploy ignores `services`, run `vercel project update munim-api --framework services` (the CLI's own link flow sets that slug when `vercel.json` declares services). |
| Root Directory | `.` (the uploaded `out/` directory is the root) |
| Node.js version | 24.x (set by `deploy.mjs`) |
| Fluid compute | on (default) |
| Function region | **Mumbai, `bom1`** (R56 G-5; Supabase is Mumbai too). `deploy.mjs` passes `--regions bom1`. |
| Deployment Protection | Standard: previews protected, production public. munim-cobnut's rewrite and Vercel Cron call production. |

**munim-cobnut** (apps/web; created by `deploy.mjs`, its Next settings are in the table under "How deploys happen"): framework Next.js, Root Directory `apps/web`, Node.js 22.x (the version `vercel build` runs under on the deploying machine), region `bom1`. gotcha 38 applies to the manual path: the build and the `--prebuilt` deploy run from a repo-root checkout. The repo root's own `.vercel/` belongs to project `munim` (apps/site), so `deploy.mjs` never uses the root: it builds from a `git worktree` of the chosen commit at `~/.cache/munim-deploy/cobnut-src`, which carries its own link. munim-cobnut therefore deploys the **committed** `HEAD` (or `--ref`), not the working tree; munim-api stages the working tree.

## Environment variables (names only)

Project environment variables apply to the whole deployment. That is **INFERENCE: no per-service scoping is documented**. See Risks.

| name | service(s) | secret | where the value comes from |
|---|---|---|---|
| `SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING` | core | yes | `.env`. Only its host, port and database are used; each role logs in with its own password. |
| `SUPABASE_SESSION_POOLER_CONNECTION_STRING` | core | yes | `.env`. Used for LISTEN/NOTIFY on `/v1/stream`. |
| `SUPABASE_PROJECT_ID` | core | no | `.env`. It is the pooler user suffix `<role>.<project id>`. |
| `SUPABASE_PROJECT_URL` | core | no | `.env`. Used for the JWKS and `/auth/v1/user`. |
| `SUPABASE_PUBLISHABLE_KEY` | core | no (public by design) | `.env` |
| `SUPABASE_SECRET_KEY` | core | yes | `.env`. The uploads bucket only (Storage, server-side); never sent to a browser. |
| `MUNIM_BLOB` | core | no | `supabase`: uploads and the tick's import parse share one bucket. Unset is `fs`, a per-instance temp directory, where an import cannot find a file uploaded on another instance. |
| `MUNIM_BLOB_BUCKET` | core | no | `munim-uploads` (created once, below) |
| `MUNIM_DB_PASSWORD_MUNIM_CORE` | core | yes | `.run/db-roles.json` after `make dev-db` (runbook below) |
| `MUNIM_DB_PASSWORD_MUNIM_SVC` | core | yes | same |
| `MUNIM_DB_PASSWORD_MUNIM_PLATFORM` | core | yes | same |
| `MUNIM_SERVICE_SECRET` | core, intel | yes | generated by `env-setup.ts` |
| `MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM` | core | yes | generated by `env-setup.ts` (an Ed25519 pair). PEM text; a one-line value with literal `\n` also works. |
| `MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM` | core, intel | no | the same pair, generated together |
| `CRON_SECRET` | core | yes | generated by `env-setup.ts` (16+ characters). Vercel sends it; core's entry passes it on as `MUNIM_CRON_SECRET`. |
| `SUPPLIERS_SIM_PUBLIC_URL` | intel, suppliers | no | `<munim-api production origin>/suppliers-sim` (from `.run/vercel/api-origin`). Its origin must match the seeded `core.supplier.a2a_card_url` rows (seed lane). |
| `MUNIM_CORE_URL` | intel | no | `<munim-api production origin>` (from `.run/vercel/api-origin`): intel reaches core through the public domain, since Vercel refuses circular service bindings. |
| `MUNIM_STREAM_MAX_AGE_S` | core | no | `270`. Streams end with a reconnect hint before Hobby's 300 s cut; the SDK reconnects. |
| `MUNIM_DB_POOL_MAX` | core | no | `3`. Caps every app pool per instance (connection budget below). |
| `MUNIM_ASK_TIMEOUT_S` | core | no | `240`. How long `POST /v1/ask` waits for intel (default 90). A live ask makes about 8 sequential model calls. UNVERIFIED: the browser reaches munim-api through munim-cobnut's `/api` rewrite, an external origin to Vercel's CDN, which waits at most 120 s for a first byte (Vercel changelog, May 2025); an ask past that reaches the browser as a 504, which the Ask screen treats as a lost answer (it looks for the turn and never resends). Measure it in the production journey. |
| `MUNIM_ASK_BUDGET_S` | intel | no | `220`. intel stops the ask's run at this age and stores what it has ("cannot verify" when nothing was submitted), so core finds an answer before its own wait ends (unset: no limit). Keep intel's budget < core's wait < 300 s (Hobby). |
| `MUNIM_MODEL_MODE` | intel | no | `live` (R58): live Gemini, and a call that fails or is rate-limited is served from the recorded fixture of that exact call when one exists (T-125), else abstains. Every gate and `make smoke` stay `recorded`. |
| `GEMINI_API_KEY` | intel | yes | `.env` (the founder's free-tier key). Missing → `env-setup` names it and exits 1; the rest is still sent. |
| `OPENROUTER_API_KEY`, `NVIDIA_API_KEY` | intel | yes | not sent (Gemini only, R58) |
| `MUNIM_TICK_PERIOD_MIN`, `MUNIM_TICK_BUDGET_S` | core | no | leave unset: 1440 and 240 are the Hobby values |

**Setting them: `! node deploy/vercel/env-setup.ts`** (no prompt, no argument, safe to re-run). It reads `.env` only through `packages/config`, the role passwords from `.run/db-roles.json`, the Cobnut tenant id and storefront key from `.run/cobnut/site.env`, the demo password from `.run/cobnut/demo-password`, and the production origin from `.run/vercel/api-origin` (written by `deploy.mjs`). It generates the service secret, cron secret and run-token key pair into `.run/vercel/` (0600) once and reuses them; `--rotate` replaces them. For each name it runs `vercel env rm` then `vercel env add` with the value on stdin, and prints names only (`set MUNIM_SERVICE_SECRET (munim-api, production)`). A source that does not exist yet prints `missing NAME (…): produced by <step>`, the rest is still sent, and the exit code is 1. `--dry-run` lists every name with its source and state. Differences from the table: the two pooler strings are sent **without the `postgres` credentials** (host, port and database only: each role logs in with its own password, and intel's process environment should not hold the admin password), `MUNIM_MODEL_MODE` is `live` with `GEMINI_API_KEY` (R58; the R47 spend cap is the operator's `platform.llm_budget` row for the month, not an environment setting — with none, or a role with no INR price, AI declines and every surface degrades to its template), and `MUNIM_BLOB=supabase` / `MUNIM_BLOB_BUCKET=munim-uploads` are constants (T-116; create the bucket first, below). `SUPABASE_SECRET_KEY` is sent as a sensitive variable; it bypasses RLS and, like the run-token private key and the role passwords, lands in the process environment of every service (Risks, below).

munim-cobnut gets exactly (plus `ENABLE_EXPERIMENTAL_COREPACK=1`, set once by hand and not managed by `env-setup.ts`): `NEXT_PUBLIC_MUNIM_API=/api`, `MUNIM_API_ORIGIN` (the munim-api production origin), `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY`, `MUNIM_DEMO_SIGNIN=1`, `MUNIM_DEMO_PASSWORD`, `MUNIM_DEMO_TENANT_ID`, `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`. `NEXT_PUBLIC_*` and `MUNIM_API_ORIGIN` are baked in at build time, so both projects need a redeploy after any change.

**Do not set:**
- `MUNIM_INTEL_URL`: core's binding to intel injects it. (`MUNIM_CORE_URL` is sent by `env-setup`: the production origin.)
- `MUNIM_IDP`: the default `supabase` is the only mode the env-only boot accepts.
- `MUNIM_CORS_ORIGINS`: the browser is same-origin through munim-cobnut's rewrite.
- `MUNIM_RUN_DIR`, `MUNIM_DATABASE_URL`: dev only.
- On munim-cobnut: `MUNIM_MOCK`, `MUNIM_IDP`, `MUNIM_DEMO_TOKENS`, `MOCK_TOKEN_SECRET`, `NEXT_PUBLIC_MUNIM_MOCK_CONTROLS`, `MUNIM_NEXT_STANDALONE`.
- `MUNIM_TRUSTED_PROXY_HOPS`: 0 until measured; no hop count has been measured, and one too many makes the rate limiters' key a value the client typed.
  - At 0 on Vercel there is no socket address to read (`core/index.mjs` calls `app.fetch(request)` with no Node request), so every request keys as `unknown`: the Cares routes' 60-a-minute limit is shared by all visitors on a function instance (FACT, from the code).
  - Vercel's request-headers docs say its edge overwrites `X-Forwarded-For` with the client's address, which would make `1` safe (the one entry is never client text). UNVERIFIED on this deploy, as is what the entry holds for a request through munim-cobnut's rewrite.
  - To measure: set `1` on munim-api (`printf 1 | vercel env add MUNIM_TRUSTED_PROXY_HOPS production` from its link) and redeploy, then run the spoof probe in `infra/gcp/README.md` (deploy step 8) against munim-api and against munim-cobnut's `/api`. Function instances count separately, so only a run that ends in a 429 is conclusive. Once it holds, add the value to `env-setup.ts`'s `VARS`.

### One-time: the uploads bucket (Supabase Storage)

Uploaded documents' bytes live in one private bucket that every core instance reads and writes (`adapters/dev/blob-supabase`).
Create it once in the dashboard, under Storage → New bucket:
- **Name** `munim-uploads` (the `MUNIM_BLOB_BUCKET` value).
- **Public bucket: off.** Objects are read only by core, with the secret key.
- **File size limit:** at least 5 MB. core-api caps an upload at 5 MiB, and Vercel's 4.5 MB request body limit bites first.
- **Allowed MIME types:** leave empty, or allow `application/octet-stream`. The store writes every object with that type.
- **No Storage policies.** The secret key bypasses them, and with none a publishable key or a signed-in user's token reads nothing.

Objects are named `<tenant id>/<sha256 of the bytes>`. Nothing deletes them: a document row keeps its key.
To check after a deploy, upload a CSV in the app, then trigger the cron once (Cron Jobs → Run). The import run should reach `previewed`.

## Deploy (the orchestrator, from this machine; the logged-in Vercel CLI)

**This is the manual fallback** (a failed automatic deploy, or before the Git connection exists). Three rules:
- **Deploy from a clean checkout of the commit (gotcha 42).** `deploy.mjs` stages munim-api from the working tree it lives in, so another lane's uncommitted files ship. Make a worktree (`git worktree add --detach ~/.cache/munim-deploy/api-src <sha>`, `pnpm install --frozen-lockfile --offline`) and run its `deploy/vercel/deploy.mjs`. munim-cobnut already deploys a committed ref from its own worktree.
- **`--archive=tgz` on every prebuilt deploy (gotcha 43).** The free plan refuses more than 5,000 file uploads a day (`api-upload-free`); one tarball is one upload. `deploy.mjs` does not pass the flag yet: when a prebuilt deploy (munim-cobnut, munim-rho) fails with that error, run the printed `vercel deploy` line again by hand with `--archive=tgz`. That is proven for those two only. For munim-api it is **UNVERIFIED** and the workflow does not use it: core's staged `node_modules` holds relative symlinks (see "How it is built"), and a tarball might not keep them. If a munim-api deploy hits `api-upload-free`, re-run it after the day's window; to try the flag, first deploy a preview (no `--prod`) with it and check that `core/node_modules/@munim/*` are still links.
- **munim-rho is deployed from the repo root only (gotcha 38),** because its Root Directory is now `apps/site`. `apps/site/.vercel/` is a stale link that records no root directory and holds a pulled env file; do not deploy from it.

```bash
node deploy/vercel/deploy.mjs --dry-run                     # prints every command, runs none
node deploy/vercel/deploy.mjs [--project munim-api|munim-cobnut|both] [--ref <rev>] [--setup-only] [--apply-settings]
```

What it does, with no prompt anywhere:
- **munim-api:** `node deploy/vercel/build.mjs` stages `deploy/vercel/out/` (from the working tree), then `vercel deploy --prod --regions bom1` runs from there. Afterwards it reads the project's `*.vercel.app` domain (`vercel api /v9/projects/munim-api/domains`) and writes it to `.run/vercel/api-origin`, which `env-setup.ts` needs. UNVERIFIED until the first run: the `vercel api` call; if it cannot read the domain it warns, and the origin goes into that file by hand (`https://<domain>`).
- **munim-cobnut:** a shadow worktree of the commit, then `pnpm install --frozen-lockfile`, `vercel pull --yes --environment=production`, `vercel build --prod --yes`, `vercel deploy --prebuilt --prod --regions bom1`. The pulled env file is deleted after the build.
- **First time only, per project:** it creates the project (`vercel project add`), configures it, links the directory (`out/` and the shadow checkout, never the repo root), and checks that the link's project name is the expected one.
- **Every `--prod` is preceded by that name check.** A directory linked to any other project, or a link with no recorded name, is refused with the fix. It also refuses to start while `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` is set (they silently override a link).
- `build.mjs` also writes `out/.vercelignore` with `!node_modules`: the CLI leaves `node_modules` out of an upload by default, and core's staged `node_modules` has to go up (`deploy/vercel/test/build.test.ts`).

**First deploy, in this order** (the production origin does not exist before the first munim-api deploy, and munim-cobnut needs it):
1. `node deploy/vercel/deploy.mjs --project munim-api`. It boots without its env and will not serve yet; it exists to create the project and its domain, and to record `.run/vercel/api-origin`.
2. The migrations (runbook below) and the hosted Cobnut seed with the demo accounts, which write `.run/db-roles.json` and `.run/cobnut/*`.
3. The founder runs one line in the session: `! node deploy/vercel/env-setup.ts`.
4. `node deploy/vercel/deploy.mjs` (both). From then on, step 4 alone is the deploy, plus step 3 whenever a value changes.

**Rotation.** `! node deploy/vercel/env-setup.ts --rotate` replaces the service secret, the cron secret and the run-token key pair, then redeploy both.
- Run tokens live minutes. A run minted under the old key fails verification after the redeploy; it is refused (404/401), never misattributed.
- The redeploy swaps core and intel together, because they are one deployment, so the two sides cannot drift.
- Rotate at a quiet time.

**After the first full deploy, check (UNVERIFIED until then):**
- `curl -s https://<munim-api>/health` returns 200 with `migration_version` 31 and `idp` `supabase`.
- `curl -s https://<munim-cobnut>/api/health` returns the same through the rewrite, and `/staff/sign-in` offers the four demo people.
- `curl -sI https://<munim-api>/health | grep -i x-vercel-id` and the same for munim-cobnut: the id starts with `bom1::` (the region). Also visible per function in the dashboard.
- `curl -sN -H 'Authorization: Bearer …' -H 'X-Munim-Tenant: …' 'https://<munim-cobnut>/api/v1/stream?topics=…'` shows `event: ready` at once, a `: hb` every 20 s, and `event: reconnect` at about 270 s.
  - This proves the rewrite streams without buffering.
- `curl -s -o /dev/null -w '%{http_code}' https://<munim-api>/internal/cron/v1/tick` returns 404.
- Vercel's cron run shows 200 in the dashboard's Cron Jobs tab. Use "Run" to trigger it once.

## Migration runbook: apply 0027–0031 to the hosted project (the orchestrator; do not hand to a lane)

The production database is the existing hosted Supabase project, currently at migration 26. 0027–0030 exist; 0031 is T-117's tick ledger and lands with that ticket. Apply them in order, 0027, 0028, 0029, 0030, 0031. Until 0031 is committed, `THROUGH=30` is the most the runner can apply.

1. **Locally, gates first:** `make test-db`, which runs embedded Postgres and every DB gate. It must be green.
2. **Apply:** `make dev-db THROUGH=31` from the repo root. It reads `.env` through the config module and uses the session pooler. In order, it:
   1. probes the hosted items in rolled-back transactions;
   2. applies 0027 to 0031 in order (the runner skips applied files and refuses a changed applied file);
   3. **sets fresh passwords for the runtime roles** into `.run/db-roles.json`;
   4. re-seeds the country packs;
   5. verifies the logins and LISTEN/NOTIFY.

   It prints only counts and pass/fail.
3. **Because step 2 rotates the role passwords:**
   - re-run `! node deploy/vercel/env-setup.ts --project munim-api` (it resends the three `MUNIM_DB_PASSWORD_*` values) and redeploy;
   - restart any local `make up` that points at the hosted project.
4. **Check:** `curl -s https://<munim-api>/health` returns `"migration_version":31`.

## Monitor remotely

Nothing here needs the repo or this machine.
- **Vercel dashboard** (vercel.com > the project): *Deployments* (status, commit or source, duration, the Inspect link), *Logs* (runtime logs per deployment, filter by function), *Cron Jobs* (munim-api: the daily tick, its last run and status, a Run button), *Settings > Environment Variables* (names; sensitive values are write-only), *Settings > Functions* (region: Mumbai).
- **Vercel CLI**, from any machine that is logged in: `vercel ls` (recent deployments, from a linked directory such as `deploy/vercel/out`), `vercel inspect <deployment-url>`, `vercel logs <deployment-url>`.
- **Health URLs:** `https://<munim-api>/health` (200; `migration_version`, `idp`) and `https://<munim-cobnut>/api/health` (the same through the rewrite). Region: the `x-vercel-id` response header starts `bom1::` (UNVERIFIED until the first deploy).
- **After a deploy,** the *Deployments* list shows the new production deployment as Ready with the production domain moved to it; a failed build shows Error with the build log one click away.

## Connection budget (Supabase session pooler; INFERENCE, see the lane B2 spike report)

- Supavisor's pool is about 15 backend connections per (role, database). The session (5432) and transaction (6543) ports share it.
- Each warm core instance holds **one** LISTEN connection (`munim_core`, session mode) for all its streams.
- With `MUNIM_DB_POOL_MAX=3`, each instance adds at most 3 transaction-mode `munim_core` backends while transactions are open. Three instances use at most 12.
- If more instances appear:
  - the extra LISTEN connections are refused;
  - `/v1/stream` answers 503 and the SDK backs off and retries;
  - nothing else is affected.

## Risks and limits (Hobby)

- **Environment variables reach every service (INFERENCE).**
  - intel's process environment would hold the run-token private key, the DB role passwords and `SUPABASE_SECRET_KEY` (it bypasses RLS).
  - intel never reads them: it has no DB client (import-linter) and reads only the public key. But this weakens R25 and rule 15 as trust boundaries.
  - If Vercel offers no per-service env scoping, the fix is a second project for intel and suppliers-sim, with core reaching intel over its public URL plus the service secret. That is a founder decision.
- **Once-a-day cron:**
  - outbox rows the in-request publisher missed wait up to 24 h;
  - the watch sweep, import-preview parsing and Auto investigations run daily;
  - the brief lands about 06:30–07:30 IST.
  - A repeated tick does not post the brief twice. Each job claims its slot in `core.tick_claim` (migration 0031) before it
    starts: a retry in the same hour runs nothing again, and a manual Run later in the day starts each job's window where the
    last one ended.
- **Uploads:**
  - documents go to the private bucket above (`MUNIM_BLOB=supabase`); without it they would land in a per-instance `/tmp`,
    and an import could fail to find its file on another instance;
  - bodies cap at 4.5 MB.
- **Streams:** they reconnect every 270 s.
- **Beta features:** Services, bindings and Node 24 type stripping on Vercel's runtime were not verified with `vercel build` or a deploy.
