# Lane B2 — Vercel deploy adapter for munim-api (+ spike)

Repo: `/Users/satviksawhney/Downloads/projects_26/foodops-os` (read `CLAUDE.md` first; it binds you; gotcha 38 too).
SCRATCH = `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad`
Read `SCRATCH/sync/interface.md` (lane rules, names, env, platform-neutral rule) — it binds you.
**Do not edit anything until `SCRATCH/sync/GO` exists** (a full `make check` is running). The spike (step 1) is
read-only research and can start now.

Territory: `deploy/vercel/**` (new), and **platform-neutral** changes in `services/core-api/src/**`,
`services/core-worker/src/**`, `services/intel/**`, `services/suppliers-sim/**`, `packages/config/**` (each with tests).
No Vercel CLI link/deploy/env commands; no hosted Supabase writes.

## Shape (founder, 15 Oct)
One Vercel project **munim-api** on the **Hobby** plan serving core-api (Hono, Node, Fluid Compute), intel (Python
FastAPI/ADK) and suppliers-sim (Python, A2A, simulated), against the existing hosted Supabase (session pooler for
LISTEN/NOTIFY and migrations, transaction pooler for app pools), `MUNIM_IDP=supabase`. apps/web (separate project
munim-cobnut) reaches it only through its `/api/*` rewrite.

## Work
1. **Spike first (write `SCRATCH/reports/lane-B2-spike.md` before building).** Check, from current Vercel docs (use the
   vercel plugin skills / docs, not memory) and measurement:
   - Python function bundle size limit vs intel's deps (`services/intel`: google-adk 2.11, a2a-sdk, openai, fastapi…;
     measure the real installed size of a slim prod install, no dev group) and suppliers-sim's;
   - Hobby limits: function max duration, cron frequency (once a day?), concurrency, memory; Fluid Compute on by default;
   - SSE: a function streaming for minutes; what happens at max duration; does the SDK's fetch SSE reconnect cleanly
     (`packages/sdk/src/stream.ts`); does a Next.js external rewrite (apps/web `/api` → munim-api) stream without buffering;
   - LISTEN/NOTIFY: one held session-pooler connection per open stream — the Supabase session pooler's connection cap on
     the founder's plan vs the connection budget (03-architecture §8); propose a cap;
   - core-worker on serverless: what must move into request handling or a cron route (outbox sweep, cron jobs,
     investigations, imports, fanout); what degrades with a once-a-day cron; how intel calls back into core-api
     (`/internal/intel/v1`) and how core reaches intel (URLs, service secret, run-token keys);
   - secrets/config each service reads (names only) — `packages/config`, `munim_intel.config`; which live in `.run/`
     today (db role passwords, run-token keys, service secret) and need env vars in production.
   **If intel cannot fit a Vercel function, stop and report** (that is a founder decision; do not host it elsewhere).
2. **Build** (after GO):
   - platform-neutral: a core-api route that runs one sweep/cron tick (authenticated with the service secret or a cron
     bearer, idempotent, bounded time) reusing core-worker's code via a shared module — so Vercel Cron (and later Cloud
     Scheduler) can call it; whatever core-api/intel need to boot from env alone (no `.run/` files) in production, with
     the same redaction rules; SSE stream max-lifetime + clean close before the platform cuts it (configurable);
   - `deploy/vercel/`: entry files that import the services' composition roots (Hono app export for Node; ASGI app for
     Python), `vercel.json` (functions, routes for core-api / intel / suppliers-sim paths, cron once a day on Hobby,
     maxDuration), build script, and `deploy/vercel/README.md` with: the exact project settings, the **env var list (names,
     which service, secret or not, where the value comes from)**, the deploy commands (from the right directory, gotcha
     38), and how to rotate run-token keys.
   - a migration runbook for applying 0027–0029 to the hosted project via the existing `make dev-db THROUGH=…` path
     (do not run it).
3. **Local proof:** run the Vercel entry points locally (node for the Hono export; uvicorn for the ASGI apps) against a local
   embedded Postgres you start (ports 4340–4349), with env-only config (no `.run/` reads in prod mode), and show: health,
   an authenticated `/v1/me`, an SSE stream that closes at the configured lifetime and the SDK reconnects, the sweep route
   (401 without auth, 200 with), intel reachable from core and calling back. If `vercel build` would help, ask the
   orchestrator first.

## Gates
- `make check` (lint, typecheck, boundaries, tests) green for every package you touched; new routes have tests incl. auth
  refusal; red-prove the sweep route's auth and the SSE lifetime close.
- Guarantee scan for anything on a write path (clause 1: no write without a person's command or approved decision; the
  sweep only runs what core-worker already runs) and clause 2 (no change to snapshots/refs).
- Nothing Vercel-specific outside `deploy/vercel/` (grep `vercel` under services/ and apps/web → only comments, or none).

## Report
`SCRATCH/reports/lane-B2.md`: spike answers with sources, files, gate output, the env var list, the deploy runbook, risks,
what you did not do. Final message ≤ 30 lines.
