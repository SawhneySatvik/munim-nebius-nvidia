# NB-4i report: integration of migration 0037

**Edits (lines verified by reading).**
- `packages/contracts/test/ontology.test.ts` L154 [112,30,74]; L167/168/174 62→63 (the `18 + 63` comment too). The new template is exposed: no `NOT_AGENT_EXPOSED` entry, and the regenerated ontology says "63 agent-exposed".
- `packages/contracts/src/intel/specialists.ts` L131: `market.ingredient_price` added to market.
- `packages/contracts/test/specialists.test.ts` L122: market count 9→10. **Deviation:** L113 not edited. The new §3 row in `market-strategy.md` already lists the id, so adding it to `REGISTRY_ONLY_0022` double-counted (red-proved).
- `services/intel/munim_intel/skills/market/skill.py` READ_TEMPLATES += market.ingredient_price.
- `docs/plan/packs/market-strategy.md` §3: new row.
- `services/intel/tests/test_tools.py` L101 (112,74,63,24), L102 30.
- `services/intel/tests/tools/test_generated.py`: EVERY_TOOL 81, `TOOLSET_SIZE["market"]` 11→12, comments.

**Generated:** `make ontology` (74 functions, 63 exposed, 401 FKs), `make contracts`. Changed: `generated/ontology.json`, `generated/sources.sha256.json`. The sdk and Pydantic outputs came out byte-identical.

**Fixtures.** Far more than the 6 named were re-keyed: the Manager prompt carries `read_index()`, so the full pytest run was 81 failed and 43 errors. Offline recorders (`--record`, ScriptLlm, no network) re-wrote:
- `tests/context/fixtures` (1 key: 42974f59→8d0be0c8)
- `tests/manager/fixtures/{reason,threads/reason}`
- `tests/fanout/fixtures/{reason,e2e/reason}`
- `tests/graph/fixtures/butter/reason`

The 11 Nemotron live replays in `tests/manager/fixtures/nemotron/reason` were re-keyed by a scratchpad script. Only `system` changed (tools and contents were identical); it matched each old fixture uniquely on the rest, and replies are untouched. Script: `.../scratchpad/rekey.py`, not committed. Every changed fixture is shown in `git status` as a delete plus an untracked add; stage by name.

**Gates.**
- contracts vitest: `Test Files 18 passed (18)`, `Tests 262 passed (262)`.
- intel pytest, recorded: `975 passed, 1 skipped, 4 xfailed`.
- `heavy.sh make intel-redproof`: `ALL RED-PROOFS FIRED`.

**Not done.**
- The six `fixtures/recorded` files (665834d5…, 948b364f, 3c647255, 9a77f4a2, cbed299c, ffd927b8). They are Cobnut 15 Oct, date-dead, and no gate replays them (the suite is green without them). Their only recorder is live `record_cobnut_ask.py serve`.
- No live calls, no restarts, no git writes.
- No NB-7 importer, no db/ edits.

**Guarantee scan.** Clause 1 (nothing changes the books without approval): clean, with no write path touched. Clause 2 (every number traces to a ledger row): clean. Only the prompt index and test counts moved; the Nemotron replies are unchanged and still validate against minted cells.
