# Lane C resume (T-114) — finish the negotiation trigger, Cobnut fixtures and compliance outlet

Read `docs/plan/prod-briefs/brief-C.md` (the original brief) and `interface.md` — both bind you, with these updates:
- Lane D (T-115, display order, migration 0030) is **finished** and its files are in the tree (`db/migrations/0030_*`,
  catalogue/storefront reads, db tests). Do not touch them.
- Lanes A and B2 are committed (T-112 apps/web, T-113 deploy/vercel + env-only boot). `adapters/gcp/`, `infra/`,
  `scripts/deploy-gcp.sh` are another lane's untracked work (T-120/T-121) — do not touch.
- **Commit rule (founder, 15 Oct):** you do not commit; and nothing you write may contain AI attribution.
- After your last `make contracts`, also run `make ontology` (the ontology freshness gate fails on any new migration or
  contract edit; Lane D left it for you) and say so in the report.

## Where the previous Lane C run stopped (it was cut off mid-work, no report)
Its working files are in the tree (uncommitted): `services/core-api/src/modules/purchasing/{index.ts,rfq.ts}`,
`services/core-api/src/internal/writes.ts`, `packages/contracts/src/{purchasing,internal}/index.ts` + generated output,
`services/intel/munim_intel/negotiate/route.py`, `app.py` include, `detect/__init__.py`, `watch/pipeline.py`,
`watch/detectors/compliance/licence_expiring.py`, recorded fixtures under `services/intel/fixtures/recorded/` and
`munim_intel/decide/fixtures/`, recorders `tests/manager/record_cobnut_ask.py`, `tests/negotiate/record_cobnut.py`, tests
`tests/negotiate/test_negotiate_route.py`, core-api tests `rfq.test.ts`, `intel-finding-outlet.test.ts`, `redproof-t114.sh`.
Read them all before changing anything; keep what is right.

Its scratch (harness, e2e, logs): `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/7e5cfc8c-21e0-4ef3-917e-c858ea111286/scratchpad/laneC/`
(`start.sh`, `harness.ts`, `e2e.ts`, `intel-redproof-t114.sh`). Its stack may still be running: harness PID 65581 (core-api
4351, control 4354, embedded PG), suppliers-sim 4353 (PID 65759 → 65767), intel 4352 (PID 65762 → 65769); seeded Cobnut
tenant `889dd60c-0cce-7584-9fe5-fa54558f8ffe`; demo tokens in `laneC/run/cobnut/demo-tokens.json` expire ~14:49 IST.
Kill those PIDs and restart with `start.sh` (then reseed) whenever you change core-api or intel code — the running stack
predates later edits. Ports stay 4350–4359.

Its intel red-proof script passed (9 plants red, restored green). **The end-to-end journey fails** (orchestrator run,
14:03 IST): `node laneC/e2e.ts 889dd60c-… negotiate` → suppliers added → "RFQ 1 (hazelnuts, both outlets): no shortfall
yet" got **503**: inside the negotiate run, after `forecasts:batch` 201, a `POST /internal/intel/v1/snapshots` returned
**422**, intel raised `CoreError`, `/negotiate` answered 502, core mapped it to 503. Find why that mint is refused (template
params? a template the internal route does not admit? stale stack?), fix it at the right side, and make the whole journey
green: RFQ with no shortfall → nothing sent (as designed); after the owner's count creates a shortfall → RFQ → PO draft
covering both outlets with qty/price as `purchasing.quote_compare` refs → Farah 403 → Nandini approves → PO + audit
under her name. Then `node laneC/e2e.ts <tenant> ask`: every curated Ask question returns a cited answer.

## Gates (as brief-C, all of them), plus
- `make ontology` then `packages/contracts` tests green; `make contracts` re-run shows no drift.
- core-api full vitest; intel pytest + ruff + mypy; `make intel-redproof`; `make boundaries`; the T-114 red-proofs.
- Kill every process you start (and the orphaned ones above) before you finish; delete token files.

Report: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad/lane-C.md`
(create the directory if missing): files, the 422 root cause and fix, the curated Ask question list, Q16 default, gate
output, guarantee scan (both clauses), what you did not do. Final message ≤ 30 lines.
