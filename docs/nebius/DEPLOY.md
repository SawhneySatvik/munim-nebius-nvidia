# Nebius demo: deploy runbook (R77, no network until step 5)

**Model-provider verification:** the project owner has separately verified live application inference through Nebius Token Factory using an NVIDIA Nemotron model. This runbook tracks the separate Vercel/Supabase hosting setup; its hosting steps do not describe or negate that model-provider test.

A new Vercel pair (`munim-nebius-web`, `munim-nebius-api`, region `bom1`) and a second free Supabase project. The existing demos
(`munim-cobnut`, `munim-api`, `munim`/`munim-rho`, and the Supabase project behind them) are never touched. Everything below runs
from the repo root. The profile lives in `deploy/nebius/`; every command that could reach a database goes through the guard.

## What the guard does
`node deploy/nebius/guard.ts check` refuses (exit 1, names only, never a value) unless:
- `MUNIM_ENV_FILE` is `.env.nebius` and `MUNIM_RUN_DIR` is `.run/nebius` (the guard sets both; generated secrets, role passwords and
  run-token keys are therefore separate from the existing demos');
- no Supabase project ref in `.env.nebius` (pooler login, `SUPABASE_PROJECT_ID`, project URL, direct host) equals one in the reference
  file: `<repo root>/.env`, or the path of an explicit `--reference <path>` flag (needed from a worktree that has no `.env`; no environment
  variable selects it). The reference must itself have a session-pooler login ref, else the guard refuses. The OK line names its basename;
- the Vercel names are not the existing four and start with `munim-nebius-`.
Pooler hosts are shared by a whole Supabase region, so an equal pooler host alone is allowed; the project ref is the identity.
`guard.ts exec [--reference <path>] -- <cmd>` runs the check, then the command with an allow-list environment: PATH, HOME, SHELL, TMPDIR, TERM,
USER, LANG/LC_*, NODE_*, XDG_*, PNPM_HOME, PORT, `MUNIM_API_URL`, `SUPPLIERS_SIM_PUBLIC_URL`, the deliberate `MUNIM_SEED_TOKENS` /
`MUNIM_SEED_OPERATOR_TOKEN`, plus the two it sets. Everything else (PG*, DATABASE_URL, POSTGRES_*, TAVILY_*, service secrets, provider keys) is dropped.
Gate: `node --test "deploy/nebius/test/*.test.ts"`.

## Founder, once
1. Create a new free Supabase project (any name that is not the existing one; Mumbai/ap-south-1 if offered). Do not touch the old one.
2. Create `.env.nebius` in the repo root (git-ignored) with `.env.example`'s exact names, values from the new project:
   `SUPABASE_PROJECT_ID`, `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`,
   `SUPABASE_SESSION_POOLER_CONNECTION_STRING`, `SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING` (and the direct string), plus
   `NEBIUS_API_KEY` (Token Factory; required), `TAVILY_API_KEY` (optional), `NVIDIA_API_KEY` (optional, dev) and any other provider key the demo uses. Nobody else opens this file.
3. Tell the orchestrator who the platform operator is on this database (a real person's sign-in; R24) and give that person's access
   token to the seeding shell as `MUNIM_SEED_OPERATOR_TOKEN` (never a demo account).

## Orchestrator
1. **Check** (no network): `node deploy/nebius/guard.ts check`. Must print `nebius guard: OK`.
2. **Dry run** (no network): `node deploy/nebius/stage.ts --deploy --dry-run` prints the whole plan. The commit must be committed first
   (the build comes from a clean worktree of `--ref`, default `HEAD`; gotcha 42).
3. **Migrate** (database; first connection): `node deploy/nebius/guard.ts exec -- node scripts/dev/bootstrap-dev-db.ts`
   runs every migration (0001 to 0036, including 0036's `nebius` provider CHECKs), sets runtime-role passwords into `.run/nebius/db-roles.json`,
   seeds the country packs and verifies the logins. Never run `make dev-db` for Nebius: it reads `.env`.
4. **Core-api against the new database, on port 8799** (never `make up`: its `.run/*.pid` files belong to the running dev services):
   `PORT=8799 node deploy/nebius/guard.ts exec -- sh -c 'cd services/core-api && exec node src/server.ts' > .run/nebius/core-api.log 2>&1 &`
   Note the PID with `$!`; stop it by PID only. Check `curl -s http://127.0.0.1:8799/health`.
5. **Seed Cobnut and Kosambari. Never the Snacky Shack** (`--world=snacky_shack` is simply not run):
   ```
   export MUNIM_API_URL=http://127.0.0.1:8799 SUPPLIERS_SIM_PUBLIC_URL=<the nebius api origin>/suppliers-sim
   T="$(node deploy/nebius/guard.ts exec -- node adapters/dev/idp-supabase/demo-accounts.ts)"   # the guard's OK line goes to stderr
   MUNIM_SEED_TOKENS="$T" node deploy/nebius/guard.ts exec -- node tools/worldgen/src/cli.ts --world=cobnut
   MUNIM_SEED_TOKENS="$T" node deploy/nebius/guard.ts exec -- node tools/worldgen/src/cli.ts --world=blr_kitchen   # Kosambari Kitchens
   ```
   `demo-accounts.ts` takes the operator from `MUNIM_SEED_OPERATOR_TOKEN`. A `platform.operator` row for `worldgen-cobnut-operator`
   (and the blr_kitchen equivalent) must exist first (HANDOFF-PROD, lane B1 notes). Open: demo-accounts.ts makes the four Cobnut sign-ins
   (`<key>@cobnut-demo.invalid`); whether the same four people may own the Kosambari tenant is UNVERIFIED, so blr_kitchen may need its own
   persona tokens. The seeds print the tenant ids and write `storefront-key`, `site.env` under `.run/nebius/<world>/`.
6. **Stage and set up the projects** (network from here): `node deploy/nebius/stage.ts --deploy --setup-only`. Afterwards check where
   `.vercel/project.json` landed (gotcha 39): `~/.cache/munim-nebius/api-out/.vercel` and `~/.cache/munim-nebius/src/.vercel` only, and delete any `.env.local` unread.
7. **Environment variables** for the two projects, profile-aware and behind the same guard (`deploy/nebius/env-setup.ts`; it reuses
   `deploy/vercel/env-setup.ts`'s table mapped to `munim-nebius-api` / `munim-nebius-web`, with `NEBIUS_API_KEY` for Token Factory
   (`NVIDIA_API_KEY` and `TAVILY_API_KEY` optional, sent only when present) and no FalkorDB). Reads `.env.nebius` and `.run/nebius` through packages/config; generated secrets go to `.run/nebius/vercel/`.
   First `node deploy/nebius/env-setup.ts --dry-run` (no network; prints names, target project and a state word, never a value), then, once the
   api is deployed and its domain known (network): `node deploy/nebius/env-setup.ts --api-origin https://<munim-nebius-api domain>`.
   Never run `deploy/vercel/env-setup.ts` for this. Gate: its test is in `deploy/nebius/test/`.
8. **Deploy**: `node deploy/nebius/stage.ts --deploy --ref <sha>`. Uploads are `--archive=tgz`; each `--prod` is preceded by a check that
   the directory is linked to exactly the expected `munim-nebius-*` project.
9. **Point the hosted model roles at Nemotron.** The migration's initial model-role rows are platform defaults; setting `NEBIUS_API_KEY`
   does not itself change those rows. Obtain the real operator's access token and the current Token Factory input/output rates. Create
   `.run/nebius/model-prices.json` (git-ignored) with one entry for each role: `router`, `reason`, `narrate`, `extract`, `vision`. Each
   entry must contain `input_price_per_mtok_minor`, `output_price_per_mtok_minor`, and `price_currency`. Rates are positive integer
   minor units per million tokens and may differ by model; all five roles must use one currency because model-role pricing is
   platform-wide. For the seeded Indian demo businesses, use INR. Copy the exact rates for each configured model from the provider console;
   the script rejects missing, zero, or non-integer rates. Then run:
   ```sh
   MUNIM_API_URL=https://munim-nebius-api.vercel.app \
   MUNIM_PLATFORM_OPERATOR_TOKEN=<real-operator-token> \
     node scripts/dev/nemotron-roles-hosted.ts --prices-file=.run/nebius/model-prices.json
   ```
   Prices are positive integer minor currency units per million tokens and may vary by role/model. The script refuses zero/unset pricing and any host except the
   dedicated API project. It proposes and approves each role through the operator config-draft API, then reads the rows back; it never
   writes SQL or prints the token. Do not use a demo-persona token. The service is already configured for live inference by the profile;
   once roles are applied, exercise Ask Munim and confirm the returned trace names `nebius` and the requested Nemotron model before
   calling the new hosted demo live.

   **Pricing reference (checked 30 October 2026):** Nebius's public catalog lists Nemotron 3.5 Lightning at **$0.06/M input and
   $0.24/M output**, and Nemotron 3 Super at **$0.30/M input and $0.90/M output** ([Nebius Nemotron catalog](https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference)).
   Nebius lists Nemotron 3.5 Super VL at **$0.30/M input and $0.90/M output** ([Nebius model announcement](https://nebius.com/blog/posts/three-new-open-weight-models-from-us-companies-give-builders-more-choice)).
   These are USD list-price references, not the prices to paste into the app's INR fields. Verify the current account rate card, convert
   each selected model's input and output rate to the deployment currency, and record integer minor currency units per million tokens.
   The roles map to Lightning (`router`), Nemotron 3 Super (`reason`), and Super VL (`narrate`, `extract`, `vision`); the last three share
   one model rate. Rates can change, so the provider console at configuration time is authoritative.
10. **Connect the marketing page to the Nebius demo.** In the existing Munim marketing-site Vercel project (`munim`, rooted at
    `apps/site`), set the non-secret build variable `NEXT_PUBLIC_MUNIM_DEMO_ORIGIN` to
    `https://munim-nebius-web.vercel.app` for Production, then redeploy that site. The `/nebius` page uses this origin for its
    staff sign-in and storefront links. Until this is set, it deliberately falls back to the existing Cobnut demo.
11. Keep the deployment up until judging ends (mid-December).

## Hosting verification scope
The model-provider integration has been live-tested as described above. This runbook is a deployment procedure: its Vercel setup and database steps are separate infrastructure checks and must be verified against the chosen hosting environment before calling that deployment live. In particular, configure and read back the model roles in step 9, then verify a live trace on the deployed demo.
