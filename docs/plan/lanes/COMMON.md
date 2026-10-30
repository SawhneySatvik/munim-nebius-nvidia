# Lanes: what every lane shares (events build, wave 1 onward)

Plan: `docs/plan/08-events-build.md`. Status: `docs/plan/EVENTS-STATUS.md` (the orchestrator writes it; lanes write only
their own report file, `docs/plan/lanes/<lane>.report.md`). Repo rules: `CLAUDE.md` at the repo root, read it first.

## Guard (verbatim from the plan)

> **Local only.** Start the stack only with `MUNIM_IDP=local make up LOCAL_DB=1` (add `MUNIM_GRAPH=falkordb` only if the
> lane needs the graph). Never run plain `make up`, `make dev-db`, `make seed` without `LOCAL_DB`, or anything that reaches
> the hosted Supabase project: it serves munim-api / munim-cobnut, which FalkorDB judges are looking at. Before any seed,
> confirm the database URL is the local one (`.run/local/local-db.json`); if in doubt, stop.
> **Never read, print, grep, copy or log `.env`** (CLAUDE.md rule 20). Keys load only through `packages/config` /
> `munim_intel.config`. No key value ever appears in output, logs, fixtures, traces or commits.
> **No AI attribution** in commits or files. **Migrations:** only the migrator lane writes them; additive only; local
> database only. Stay inside your file territory. A conflict means skip and report. On the second identical failure,
> stop, write it to `EVENTS-STATUS.md` and move on.

(Lanes write that failure to their own report file; the orchestrator copies it into `EVENTS-STATUS.md`.)

## The running stack (shared by all lanes; already up)

- Worktree `/Users/satviksawhney/Downloads/projects_26/foodops-intel`, branch `intelligence`. Three lanes edit this
  same tree at once, in separate territories. **Never** `git add`, `git commit`, `git stash`, `git checkout --`,
  `git reset` or `git clean`: the orchestrator commits per ticket from your report's file list.
- Services: local-db (embedded Postgres), intel (real, :8081), suppliers-sim (:8090), core-api (:8787, idp local),
  core-worker, web (:3000, live against core-api as Cobnut, demo sign-in on).
- **local-db is throwaway: stopping it deletes every seeded world.** Never run `make down`, never kill local-db, never
  re-run `make up`. To pick up a code change, restart ONE service:
  `scripts/dev/restart-svc.sh intel|core-api|core-worker|suppliers-sim`, or
  `scripts/dev/restart-svc.sh web <world> <port>` (web live as that seeded world), or
  `scripts/dev/restart-svc.sh tokens <world>` (re-mint demo sign-in tokens; they last 1 h).
  Only lane A restarts intel / core-api / core-worker; lane B restarts only `web` on :3000; lane C only its own web
  ports (:3001, :3002).
- Demo sign-in: `POST http://127.0.0.1:3000/staff/demo-session {"person":"owner"|"manager"|"counter"|"kitchen"}` →
  `{token, tenant_id}`; the API takes `Authorization: Bearer <token>` + `X-Munim-Tenant: <tenant_id>`. Never print a
  token; keep it in a shell variable or a file under the scratchpad.
- Cobnut is seeded on the local DB (`.run/local/cobnut/`: `site.env`, `storefront-key`, `demo-tokens.json`, all
  git-ignored, never committed or printed).
- Seeding a world: `MUNIM_SEED_OPERATOR=1 MUNIM_RUN_DIR=.run/local make seed WORLD=<w>` (after
  `node scripts/dev/local-operator.ts` has added that world's operator row; it is written for Cobnut).

## Shared files

- **`make contracts` belongs to lane A only** (it rewrites `packages/sdk/src/gen/openapi.ts` and
  `services/intel/munim_intel/contracts_gen/models.py`). No other lane changes `packages/contracts` tonight.
- **`platform.model_role` belongs to lane A only** (platform-wide, one price currency). No other lane reprices or
  repoints a role.
- No new dependency without naming `pnpm-lock.yaml` / `uv.lock` (and the package.json / pyproject) in your report.
- A second web dev server needs its own build directory; `scripts/dev/restart-svc.sh web <world> <port>` sets
  `MUNIM_WEB_DIST_DIR=.next-<world>` (git-ignored) and puts `apps/web/tsconfig.json` back after `next dev` edits it.
  If `apps/web/tsconfig.json` ever shows as modified, restore it from git; never commit that change.
- `next dev` may stop once with a Next.js security-upgrade notice; re-running the same command continues. **Never run
  the upgrade** (founder's decision).

## Gates

- **One `make check` at a time, run by the orchestrator only.** Lanes run their own package's tests
  (`pnpm --filter <pkg> test`, `cd services/intel && uv run pytest …`, `pnpm --filter <pkg> typecheck`, `lint`).
- Known pre-existing failures (do not chase): 6 tests in `adapters/falkordb` (no FalkorDB server tonight), 1 test in
  `tools/worldgen/test/cobnut.test.ts:174` (R67, date-dependent).
- After any local DB rebuild, run `node scripts/dev/nemotron-roles.ts --provider=nvidia` (the seed keeps 0015's Gemini roles).
- `apps/web/AGENTS.md` is written by `next dev`; leave it alone.
- Models: tonight's live key is the NVIDIA endpoint (`NVIDIA_API_KEY`, provider `nvidia`). Nemotron ids are in
  `EVENTS-STATUS.md`. Every "live" claim needs a trace or response showing a **Nemotron model id** and the **live**
  served path, never the recorded fallback (a live failure silently serves fixtures).

## Report (your last action)

Write `docs/plan/lanes/<lane>.report.md`: per ticket — done/blocked, the exact files you changed or created (one per
line, repo-relative; the orchestrator commits exactly these), the gates you ran and their result lines, evidence
(screenshot paths, trace ids, model ids), open issues, and anything the founder must do. Keep your final reply short:
the report path and a 5-line summary.
