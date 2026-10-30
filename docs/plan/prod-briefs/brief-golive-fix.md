# Go-live fixes, then reseed, redeploy and the full production journey (R58, R62, R63)

Read `CLAUDE.md` (rules 3, 11, 13, 17, 19, 20; gotchas 39, 40), ledger R55–R63, the go-live report
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/golive/report.md`
(if absent, the findings are summarised below), and `docs/plan/prod-briefs/brief-golive.md` (the journey and the rules for
secrets). Production: munim-api https://munim-api.vercel.app, munim-cobnut https://munim-cobnut.vercel.app (both bom1),
hosted tenant `ef8c3b84-b91a-78a5-a607-4ed3f9256ec1`. Scripts the go-live lane left (git-ignored): `.run/golive/*.mts`.

## Part 1 — fix (no commits; report the file list)
- **D/E-1. Gemini 400 on `gemini-3.5-flash-lite`** (the quote extractor and the Ask router; `gemini-3.8-flash` answers 200
  on the same deployment). Find the request-shape cause (suspect: the response schema carrying `additionalProperties:false`
  or another field that model rejects). **R63: up to ~20 real Gemini calls** through `munim_intel.config` to confirm the cause
  and verify the fix; print only status codes and error *types*, never request or response text. Fix it at the one seam
  that builds the request, keeping every recorded fixture's key valid (if the key changes, explain and re-key consistently).
  Tests (recorded) that the built request matches the accepted shape; red-prove.
- **E-2. Ask times out at 90 s** while live intel makes ~8 sequential calls. Make core's Ask timeout and intel's own time
  budget configurable by env, defaults unchanged locally, and set the Vercel values inside Hobby's 300 s
  (e.g. core 240 s, intel 220 s) in `deploy/vercel/env-setup.ts` and its README. Also: intel's spend and trace posts after
  core gave up got 404, so live spend on a timed-out run is never counted against the R47 cap — make core accept a run's
  spend and traces for a short grace window after its HTTP wait ends (the run row is still the authority; no new write
  path; tests incl. the 404 case red-proved).
- **A. Order tracker shows "This link isn't valid." right after placing an order** (client navigation from checkout fetches a
  cached `?_rsc=` payload; a reload works). Likely `cacheComponents`/`partialPrefetching` on `/o/[outletId]/order/[orderId]`.
  Fix so the tracker renders right after checkout on a production build; test it against `next start` with the real
  navigation (Playwright), red-proved.
- **B-1. No "Request quotes" control in the staff UI** (T-114 shipped only the API). Add it where an owner/manager meets the
  need: on the low-stock ingredient (owner home's below-reorder figure and the supplier screen), with an outlet choice
  limited to the person's scope; it sends `purchasing.rfq.request.v1` through the existing staff client and shows the
  outcome in plain copy ("No shortfall yet", "Quotes requested — a purchase order is waiting for approval" linking to the
  draft, "No supplier could quote"). Simulated-supplier labels stay. Cobnut's own look (R61). Mock route + tests.
- **B-2. The seed plants no shortfall.** In the Cobnut world, set the opening hazelnut stock so the forecast need exceeds
  on-hand across both outlets on the seed day (no manual counts needed for the demo); keep determinism and the cobnut
  test green; red-prove the shortfall check.

Gates (heavy commands through `scripts/dev/heavy.sh`): intel pytest + ruff + mypy, `make intel-redproof`, core-api vitest,
apps/web tsc/eslint/vitest/next build + both smokes on the mock, worldgen node tests, deploy/vercel tests, `make boundaries`.
Then stop and report Part 1 (files, gates, the 400 root cause with the call count used). The orchestrator commits and sends
you "committed — go on".

## Part 2 — after "committed — go on"
1. Redeploy munim-api (`node deploy/vercel/deploy.mjs --project munim-api`) and set the new timeout env values on munim-api
   (stdin; names only in output).
2. **Reseed** a fresh Cobnut tenant following the go-live report's runbook (operator token, demo accounts, `make seed
   WORLD=cobnut SEED=<fresh>`, poll imports, one authenticated tick — **not in a UTC hour that already had a tick**).
3. Update `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY` and `MUNIM_DEMO_TENANT_ID` on munim-cobnut, redeploy munim-cobnut at HEAD.
4. **The full production journey**, every step in `brief-golive.md` step 6 (now including "Request quotes" from the UI →
   PO draft for both outlets → Farah refused → Nandini approves → "Approved by Nandini Mehrotra" + the audit row via
   lineage → one curated Ask answered with citations, live), screenshots at 390 and 1280 into `…/scratchpad/golive2/`.

## Limits
No commits; no AI attribution; never open `.env`; never print secrets, tokens, model inputs or outputs. Writes to the hosted
project and production deploys are authorized for this task (R55, R62 S-2). Don't touch `apps/site`. Ports 4500–4519.
Report: `…/scratchpad/golive2/report.md` (or as text). Final message ≤ 30 lines per part.
