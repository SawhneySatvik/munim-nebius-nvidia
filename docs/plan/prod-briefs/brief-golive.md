# Vercel go-live — hosted Cobnut seed, munim-cobnut deploy, production journey (R55, R57, R58, R59, R62 S-2)

Read `CLAUDE.md` (rule 20; gotchas 16, 38, 39, 40), ledger R55–R62, `deploy/vercel/README.md`, `deploy/vercel/deploy.mjs`,
`deploy/vercel/env-setup.ts`, `tools/worldgen/src/cli.ts`, `adapters/dev/idp-supabase/demo-accounts.ts`,
`docs/plan/prod-briefs/interface.md`, and the 15 Oct entries of `docs/DECISIONS.md` (how earlier worlds reached the hosted
project, the "4 synthetic operators", the founder's "hosted operator = the synthetic seed operator" answer).

**State:** hosted Supabase at migration 33; **munim-api live** at https://munim-api.vercel.app (`/health` ok, idp supabase,
migration 33, region bom1). munim-cobnut exists (linked in `~/.cache/munim-deploy/cobnut-src`, root `apps/web`) but has never
been deployed. The founder already ran `env-setup.ts` (23 values incl. GEMINI_API_KEY, MUNIM_MODEL_MODE=live); the
orchestrator set SUPPLIERS_SIM_PUBLIC_URL, MUNIM_CORE_URL, MUNIM_API_ORIGIN and the three role passwords. Still unset on
munim-cobnut: `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY`, `MUNIM_DEMO_TENANT_ID`, `MUNIM_DEMO_PASSWORD`.

**You are authorized (R55 S-4, R62 S-2) to write to the hosted project and deploy munim-cobnut to production** for this go-live.

## Rules for secrets (rule 20, gotcha 16)
Never open `.env`; reach Supabase only through `packages/config` (`loadRepoConfig`). Never print, log or echo a token,
password, storefront key or key. Pipe values from `.run/` files straight into `vercel env add NAME production` (stdin); write
captured tokens only to 0600 files under `.run/` (git-ignored) and delete token files at the end. Any `.env.local` the Vercel
CLI writes is deleted unread (gotcha 39).

## Steps
1. **Operator for hosted (founder: the synthetic seed operator).** Find, from the code and the 15 Oct DECISIONS entries, how
   the seed's operator token is obtained against a Supabase-IdP core (a Supabase user bound to a `platform.operator` row).
   Create or reuse the synthetic operator the sanctioned way (no new write path; if the only way is SQL into `platform.*`,
   do it exactly as the existing scripts do, through `packages/config`, and say so). Its token goes to a 0600 file.
2. **Demo accounts:** `node adapters/dev/idp-supabase/demo-accounts.ts` (Supabase admin through `packages/config`) → the
   four people `<key>@cobnut-demo.invalid` with one password in `.run/cobnut/demo-password`; capture its stdout tokens into a
   0600 file. If Supabase refuses `.invalid` addresses, report the exact status and choose `cobnut-demo.example` (reserved,
   never receives mail) instead, updating the code and its test in one place.
3. **Seed:** `MUNIM_API_URL=https://munim-api.vercel.app MUNIM_SEED_TOKENS="$(cat <file>)" SUPPLIERS_SIM_PUBLIC_URL=https://munim-api.vercel.app/suppliers-sim MUNIM_SEED_OPERATOR=1 make seed WORLD=cobnut`
   (fresh tenant). It prints the tenant id and writes `.run/cobnut/{storefront-key,site.env}`. If a function timeout or
   Hobby limit stops it, find the cause, fix it in the smallest correct place, and re-run with a fresh tenant.
4. **munim-cobnut env:** set `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY`, `MUNIM_DEMO_TENANT_ID` (from `site.env`) and
   `MUNIM_DEMO_PASSWORD` (from `demo-password`) on munim-cobnut production, from `~/.cache/munim-deploy/cobnut-src`, by stdin.
   Check `vercel env ls production` shows every name `apps/web` reads (names only).
5. **Deploy:** `node deploy/vercel/deploy.mjs --project munim-cobnut` (deploys committed HEAD from the shadow checkout).
   Note the production URL. If the build fails, fix and redeploy (commits are the orchestrator's: report the diff).
6. **Production journey** (headless Chromium from the repo's node_modules, against the munim-cobnut production URL):
   storefront menu loads in the right order (Regular before Large; Hazratganj first) → place a web order with a sample card
   tender recorded (no real payment exists) → the demo picker signs in as Kavya (kitchen): the ticket is on the board → Imran
   (counter): hand over → Nandini (owner): owner home figures with source chips that open → request quotes for roasted
   hazelnuts for both outlets → a PO draft for both outlets appears → Farah (Gomti Nagar manager) sees it and is refused →
   Nandini approves → the PO shows "Approved by Nandini Mehrotra" and the audit row exists (read it through the API) → one
   curated Ask question answered with citations (live Gemini, or the recorded fallback). Screenshots of each step at 390 and
   1280 into `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/golive/`.
7. **T-119 measured checks:** `x-vercel-id` region on both projects; `https://<munim-cobnut>/api/health` through the rewrite;
   an SSE stream through the rewrite shows `event: ready` at once, a heartbeat, and `event: reconnect` near 270 s without
   buffering; the tick route 404s without auth; whether `vercel link --yes` connected Git to either project (if so,
   `vercel git disconnect`). Record each result.

## Limits
Do not commit (report diffs). No AI attribution. Heavy local commands through `scripts/dev/heavy.sh`. Ports 4490–4499 if
needed. Do not touch `apps/site` (redesign lanes) or `apps/web/app`/`components` (Cobnut polish lane) except a build fix you
report first. Report: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/golive/report.md`
(or return it as text if the Write tool refuses): the tenant id, URLs, each journey step with its screenshot, each T-119
result, anything fixed, anything not working. Final message ≤ 30 lines.
