# C2 — security fixes from the C1 review (plan 07, R62, R64)

Read `CLAUDE.md` (the One Guarantee, rules 1–20, gotchas 16, 20–23, 33, 40), ledger **R64** (the decisions below come from
it), and the C1 report
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/c1/security-review.md`
(file:line evidence for every item). Code is committed through the go-live fixes; re-read each finding against HEAD first.

## Fix (each with a test that fails without the fix — red-proved, a non-zero exit)
1. **S2-1 demo deny-list (R64 X-2):** on a tenant with `is_demo = true`, core refuses with a fixed error code (e.g.
   `demo_protected`, 403) the commands that break the demo for others: storefront key revoke/rotate, member invite /
   deactivate / role change, and AI-cap changes. Read the command registry and authority table to find the exact command
   types; refuse in the command path (not only the UI). apps/web shows the refusal in plain copy where these controls exist.
2. **S2-4 Ask mints skip `min_role`** (`evidence/mint.ts:55`): enforce the template's `min_role` against the asking member's
   role for every mint, Ask included; a staff Ask cannot read advisor-level finance/payroll cells (test with a staff token).
3. **S2-5 request size and order lines:** a request-body limit in core-api (default e.g. 256 KB; uploads keep their own
   route limit), and caps on order lines/quantities in the contracts (`orders/index.ts:29-46`) — `make contracts`,
   `make ontology`, contracts tests; a storefront request over the cap → 413/422.
4. **S2-6 extraction spend:** the quarantined extractor's model calls post spend rows like every other call
   (`ingest/quarantine.py:91-137`) so the R47 cap sees them; test the count.
5. **S2-7 `POST /v1/devices` role check** (`tenancy/commands.ts:270-281`): owner and manager only, outlet-scoped; staff 403.
6. **Sev 3, cheap ones:** security headers on apps/web (CSP that allows the app's own origin, the `/api` rewrite and Google
   Fonts if used; `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, `Permissions-Policy`), set through
   `next.config.ts` headers (platform-neutral); `MUNIM_TRUSTED_PROXY_HOPS` set for Vercel (env-setup) and Cloud Run
   (deploy-gcp) with the hop counts C1 lists; suppliers-sim bounds (`minor_unit` and other numeric inputs capped, request
   size limit); the export's secret patterns gaps C1 lists (`scripts/export-cup/rules.py`); IAM tightening items for
   `infra/gcp` that need no code change in services; a per-identity tenant cap on `/v1/onboarding` and the runbook step to
   turn self-serve sign-up off in Identity Platform (R64 X-4).
7. **R64 X-1:** the GCP seed path uses the synthetic seed operator (as on Vercel): update `infra/gcp/README.md` and
   `scripts/deploy-gcp.sh`/the seed runbook so the Cup tenant is `is_demo` with its AI budget; no label code changes.
8. Leave alone (R64): the number-grammar gaps (X-3) — **do not mention them in any README, docs page or comment that the
   Cup or FalkorDB exports carry**.

## Coordination (added 16 Oct, the T-128 screens lane is running at the same time)
- **No `make contracts` / `make ontology` in this lane** (T-128 owns them now). Cap order lines and quantities **server-side
  in core-api** (count before processing, 422 with a fixed code) instead of changing the contracts; the request-body limit
  is core-api middleware.
- The demo deny-list goes in its **own file** (e.g. `services/core-api/src/lib/demo-guard.ts`); T-128 has an uncommitted
  `services/core-api/src/lib/demo.ts` for the campaign bypass — do not edit it; T-128 adds the page-builder publish command
  to your list after you land.
- Stay out of T-128's files (storefront pages, customers campaign, migration 0034, contracts, the new staff screens).

## Gates
Through `scripts/dev/heavy.sh`: `make check` green; `make test-db` if any migration changes (prefer none); the guarantee
scan (both clauses) restated; `make export-cup EXPORT_ARGS="--check"` still passes. Do not commit; no AI attribution;
never open `.env`; ports 4520–4539; stay out of `apps/site`. Report:
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/c2/report.md`
(or as text): per item — files, the test and its red-proof, anything not fixed and why. Final message ≤ 30 lines.
