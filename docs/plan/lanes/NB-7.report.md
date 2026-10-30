# NB-7 report: Tavily market price, zod advisory

**Step 0, zod.** `packages/contracts/package.json` 4.6.5 to 4.6.7 (one pin in the workspace). `pnpm install --lockfile-only`; I reverted its unrelated babel peer-suffix re-resolution by hand, so the lock diff is zod only (4.6.7, its integrity, `zod-validation-error` and eslint-plugin-react-hooks edges). `pnpm install --offline --frozen-lockfile` passed. `make contracts` + `make ontology`: SDK and Pydantic outputs unchanged; only `ontology.json` / `sources.sha256.json` hashes moved (contracts `package.json` hash). `pnpm audit --prod`: "No known vulnerabilities found".

**Importer.** New built-in `market_signal_v2` (v1's header untouched, so v1 files still match): adds `ingredient`, `price`. `ingredient_price` rows mirror 0037's CHECKs at preview (ingredient by exact name, unique; price and quantity above 0; source token); commit now writes `ingredient_id`, `value_minor`, `currency`. v1 with that kind: `kind_unsupported`.

**Intel.** `munim_intel/market/web_price.py` (search, deterministic extract, CSV, model_view), synthetic fixture `fixtures/tavily_hazelnut.json`; `config.tavily_key()` (redacted). No ADK tool added: it would re-key fixtures, and the model needs no page text.

**Cited cell.** Tavily JSON, then regex extract (digits must be on the page), then a v2 CSV with source `tavily-recorded:<host>` (or `tavily:<host>`), then an owner upload, preview, approval (R28), then `core.market_signal`, then `market.ingredient_price` cell. The model is told no figure.

**Red-proofs.** (1) importer with `ingredient_price` removed from the kinds: 2 of 2 tests fail, exit 1; restored 3/3. (2) `model_view` planted with the price: the no-figure test fails. (3) Typed 1425 in prose: `numeric_char`; a cell passes.

**Tests.** contracts 262/262; core-api imports 106/106 + new `imports-market-price` 3/3; tsc clean; web 191/191; intel pytest 990 passed, 2 skipped, 4 xfailed (new `tests/market` 9 + 1 live skipped).

**Live call: no.** `TAVILY_API_KEY` absent; the live path is tested through a mock transport only.

**Not done.** Screen market line and source chip (no NB-6b report). No core route or button hands intel's CSV to the upload; it needs a contract and a web surface. The URL cannot live in the row (0037 `source` is a token): the host only, and the full URL needs a migrator column. 0037 was not verified applied on local-db (login refused), so no restarts and no live end-to-end.

**Guarantee.** Clause 1: clean. The importer is draft-then-owner approval; intel writes nothing. Clause 2: clean. The price shows only as a cell; Tavily text never enters traces or logs.

**Files.** `packages/contracts/package.json`, `pnpm-lock.yaml`, `packages/contracts/generated/{ontology,sources.sha256}.json`, `services/core-api/src/modules/imports/{formats,rows,parse,commit}.ts`, `services/core-api/test/imports-market-price.test.ts`, `services/intel/munim_intel/config.py`, `services/intel/munim_intel/decide/questions.py` (line 64: IMPORT_FIELDS mirror), `services/intel/munim_intel/market/{__init__,web_price}.py`, `.../market/fixtures/tavily_hazelnut.json`, `services/intel/tests/market/test_web_price.py`. Not mine: NB-6b's `apps/web/components/staff/*` and `apps/web/tests/draft-span.test.ts`; `apps/web/AGENTS.md`.
