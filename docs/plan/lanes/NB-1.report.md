# NB-1: blocked on the model roles (not intel)

**Root cause (FACT): both smoke runs ran on Gemini, not Nemotron.** The rebuilt DB holds migration 0015's Gemini roles; the
seed (`kit.ts:183`) only prices them, and `nemotron-roles.ts --provider=nvidia` was not re-run.
`platform.model_role`: router `gemini-3.5-flash-lite`, reason `gemini-3.8-flash`. `intel.log`: 8 Gemini calls, 0 NVIDIA.

**Traces:**
- Run `01a17c69-6788-77dc-b226-6b818ae71006` (61 s): router 400 → `recorded-fallback`; reason `TimeoutError` (60 s role
  timeout) before any tool call.
- Run `01a17c6a-daa0-77f5-bb31-274dc2151ebc` (80 s): router 400 → fallback; reason 503, then 200 after 39 s; `load_skill` ok;
  cancelled at the 80 s budget.

Both timed out; neither failed on logic. `missing_ref` is `ask.py`'s generic `NO_ANSWER` (lines 74, 258).

**Files changed:** this report only.

**Gate:** `scripts/dev/heavy.sh make intel-redproof` → 468 plants, 0 `FAIL:`, `ALL RED-PROOFS FIRED`, `exit=0`.

**Five questions** (rows read as the owner via `POST /v1/snapshots`; no model was called):

| Question | Rows | Live |
|---|---|---|
| Reorder | 1 | blocked |
| Net sales | 1 (W44) | blocked |
| Labour | 1 (W43) | blocked |
| Expiry | 2 | blocked |
| Kosambari payout | 357, 19 short | blocked |

**Orchestrator:**
1. Run `node scripts/dev/nemotron-roles.ts --provider=nvidia` (expect `5 roles on nvidia`). INFERENCE: no intel restart
   needed, since intel fetches `/model-roles` on every ask (intel.log 13:40:45, 13:42:20); check the first smoke shows `provider=nvidia`.
2. Re-dispatch NB-1 for the smoke ×3 and the table.
3. Add step 1 to the rebuild runbook.

Until then, watcher narrations call Gemini.

**Not done:** the repoint (lane A's; an R24 draft), live asks (they would measure Gemini on the
founder's key), code, a regression test, pytest.

**Surprises (not fixed):**
- The smoke fails on "abstained" before it checks the provider, so it hid the Gemini spend.
- The router call to `gemini-3.5-flash-lite` gets 400, though narrations on the same id get 200. This is the Cup path; not
  investigated.

**Guarantee scan:**
- Approvals: clean. No code changed. Side effects: 5 snapshot mints and re-minted `blr_kitchen` tokens.
- Numbers trace: clean. No render or validation path was touched.

Not mine in the tree: NB-3 (core-api approvals), NB-4 (`db/`), `apps/web/AGENTS.md`.
