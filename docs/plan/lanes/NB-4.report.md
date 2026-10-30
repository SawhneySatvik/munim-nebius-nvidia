# NB-4 report: migration 0037, done and not applied

**Blocking for other lanes now.** 0037 and the updated `db/tests/manifest.ts` are in the shared tree, and they turn three tests red:
- contracts `ontology.test.ts`: (3) fresh, (4b) FK count 400 vs 401, and (4c) `[112, 30, 74]`. That is NB-2's gate.
- intel `tests/test_tools.py:101`, which reads the manifest: `(112, 74, 63, 24)` ≠ `(108, 73, 62, 24)`. That is NB-1's pytest.

Safe order:
1. Commit the NB-4 files.
2. Apply the contracts and intel count edits below.
3. Run `make ontology`.
4. Re-key the 6 recorded fixtures (`665834d5`, `948b364f`, `3c647255`, `9a77f4a2`, `cbed299c`, `ffd927b8`), whose read-tool descriptions list quote_compare's columns.

**Files.**
- New: `db/migrations/0037_nb4_quote_saving_ingredient_price.sql`, `db/tests/saving-signal-0037.test.ts`, `db/tests/redproof-0037.sh`.
- Changed: `db/tests/{manifest,grants.test,mc1d.test,mc1bc.test}.ts`, `db/tests/redproof-0017.sh`…`redproof-0035.sh` (plant moved to 0038), `db/README.md`.

**Versions.**
- `purchasing.quote_compare` v2 gains `reference_unit_price_minor` (the last costed receipt at the run's outlets, at or before `issued_at`) and `saving_minor`.
- `market.upcoming` v4 and `market.signal_uplift` v3 exclude `ingredient_price`.
- `market.ingredient_price` v1 is new.

**Docs vs reality.**
- `core.market_signal` had no ingredient column. I added `ingredient_id`. That is a schema decision for you to confirm.
- The negotiation anchors on `price_creep.latest_minor`, which can be a list price. Both are 148000 on Cobnut today, but NB-6 should show quote_compare's own reference.

**Gates.**
- `heavy.sh make test-db`: `Test Files 39 passed (39)`, `Tests 509 passed (509)`.
- `tsc` passes; the static gate finds 0 forbidden constructs.
- `redproof-0037.sh` PASS (26 plants); `redproof-0035.sh` PASS.
- Guarantee: `680/680 attempts refused over 170 tables` (N unchanged); book grants 0/105.

**Edits that need other territories (not made):**
- `ontology.test.ts` L154/167/168/174.
- `specialists.ts` L131, and `specialists.test.ts` L113 and L122 (market 9→10).
- `test_tools.py` L101–102.
- `EVERY_TOOL` 80→81.
- The skill's `READ_TEMPLATES`, the NB-7 importer, and the `market-strategy.md` §3 row.

Not applied, no restarts, no commits.
