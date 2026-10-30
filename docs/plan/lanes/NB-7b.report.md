# NB-7b report: market price, wired end to end

**Flow.** `POST /v1/imports/market-price {ingredient_id}` (owner/manager/judge over every outlet; staff and a one-outlet manager get 403). Core mints an `ingest` run (a new trigger needs a migration), calls intel `/market-price`, stores the returned `market_signal_v2` CSV, previews it inline and returns the `imports.run.commit.v1` draft id. Nothing reaches `core.market_signal` until that draft is approved (R28). Screen: "Check market price" per PO line, a pending-import card with no price, then "Market price ₹… / kg — host — recorded|live" from the `unit_price_minor` cell with its chip.

**Tests.** contracts 262; core-api imports 143 (new, 7); intel 21 passed, 1 skipped; web 195 (new, 4); tsc, ruff and eslint clean. Red-proofs, all exit 1: gate removed, direct signal insert (book guard 403), stray `value_minor` in the line. The trace test asserts one label-only event with no page word.

**Live (local, recorded; no TAVILY key).** Run `01a17df0-d3a5`, draft `01a17df0-d3b8`. The cell had 0 rows before approval. After a scripted approval with the owner's token (not a person) it read 138500 paise/kg, `tavily-recorded:market-sim.example`. Film drafts `01a17dbd` and `01a17dba` stay proposed. Restarted core-api, intel, demo tokens.

**Not done.** No screenshots or browser pass. A pending import is lost on reload (the draft stays in the inbox). A rejected file cannot be re-proposed the same day. No `template-words` label.

**Guarantee.** Clause 1: clean. Clause 2: the price shows only as a cell; no page text reaches traces or UI.

**Files.** In territory: `packages/contracts/src/internal/index.ts`, `packages/contracts/generated/**`, `packages/sdk/src/gen/{client,openapi}.ts`, `services/intel/munim_intel/{app.py,contracts_gen/*,market/route.py,market/fixtures/tavily_roasted_hazelnuts_synthetic.json}`, `services/intel/tests/market/test_market_route.py`, `services/core-api/src/modules/imports/market.ts`, `services/core-api/test/imports-market-check.test.ts`, `apps/web/components/staff/suppliers/{market.tsx,po-draft.tsx}`, `apps/web/tests/market-line.test.ts`. Forced outside: `packages/contracts/src/imports/index.ts`, `MANIFEST.d/{imports,internal}.txt`, `test/samples/{imports,internal}.ts`, `services/core-api/src/{server.ts,modules/imports/index.ts}`, `apps/web/lib/munim/staff.ts`. Not mine: `apps/web/AGENTS.md`, `video/**`.
