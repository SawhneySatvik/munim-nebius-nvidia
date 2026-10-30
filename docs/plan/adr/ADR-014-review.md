# ADR-014 · Independent review (11 Oct 2026)

One Opus reviewer worked read-only against HEAD 260b4de, plus the T-041 runtime facts. The founder asked for one reviewer instead of three. Every claim was checked against the repo or the installed ADK 2.11.0 wheel.

**Verdict: ratify with changes.** The core is right: deterministic first, typed `propose_*` tools, no generic write path, everything through core, and handles that fail closed. Clause 1 holds everywhere the reviewer looked. But the injection control has a hole (B1), several budgets and gates don't work on the ADR's own numbers, and long-horizon "computed completion" is hollow.

## Blocker
**B1. Taint can be laundered (§6.3, §6.4, §4.3, §6.1 block 6).**
- Taint is session state for each Runner. A branch that called `search` returns up to 6×400 chars of model prose in a `BranchReport` to an untainted orchestrator that holds `propose_*`.
- Example: an injected review leads to a coupon draft.
- The same leak happens across investigation steps, through the "last 2 step summaries".
- **Fix:**
  - Make taint a per-run flag in the shared per-run state.
  - Add `BranchReport.tainted`. A tainted report taints the orchestrator.
  - Store `investigation_step.tainted`. Tainted summaries in block 6 taint the next step.
  - Branches have no `propose_*`. `propose_*` is bound only on `draft_request`.
  - Gate: planted injection gives 0 `propose_*` anywhere in the run and across a step boundary. Red-prove it by removing propagation.

## Major
**M1. Context budgets contradict the call caps (§3.4 vs §6.1).**
- Blocks 1–5 come to about 8.3k tokens per call.
- A single ask hits Σ40k in about 4 calls. A branch passes 24k at call 3 of 6. The orchestrator passes 30k at call 3.
- **Fix:** derive the Σ caps from T-059 measurements, with cached prefix counted separately, or cap per-call size plus call count. Until measured, use about 100k for an ask and 60k per branch.

**M2. The 12-tool cap makes the "≤2 skills, single agent" path unreachable, and the FACT label is wrong.**
- The smallest pair is 18 tools.
- R3 actually says degradation sets in past about **20** tools (Shopify), not 12.
- **Fix:** relabel as a design choice, cap at 20, bind `propose_*` only on `draft_request`, and have T-070 measure. This is a founder question.

**M3. "Completion computed by core" is hollow (§7.3–§7.5).**
- The model sets item verdicts.
- `done` is reachable with H0 still at `cannot_verify`.
- There is no explained-share check.
- `margin_fall` is a known path.
- **Fix:**
  - Item verdicts come from deterministic detector thresholds over the item's own templates, minted in this investigation.
  - Add a `finance.margin_bridge` template whose components sum to the margin delta (balance check), with an "unexplained" residual cell.
  - `done` requires H0 supported, plus a residual ≤ X% or an explicit "unexplained" item.
  - Core ranks contributors.
  - The LLM narrates and handles only off-checklist follow-ups.

**M4. T-083 and pack gates assert plants that don't exist in the worldgen answer keys.** C1, C2, C3 and the market plants are absent.
- **Fix:** take expected counts from the answer keys.
- Add the missing plants as a worldgen ticket before T-083 and T-045.
- The note about the H-1 external dependency is stale: 0018 has landed (8088c47).

**M5. Branches can propose drafts, contradicting §7.5.**
- **Fix:** branches are read-only analysts. Only the orchestrator proposes, and only on `draft_request`.

**M6. Deterministic draft ids are keyed on `run_id`, so a resumed step mints new ids.**
- **Fix:** key ids on (investigation_id, step_no, item_id, proposal fingerprint), and on (run_id, fingerprint) for ask runs.
- State plainly that the T-083 kill-mid-step gate tests plumbing only.

**M7. Cron-minted investigation runs freeze the creator's outlet scope (T3).**
- **Fix:** at each step mint, intersect the stored scope with the creator's current membership, and cancel if it is gone.
- Investigation reads need viewer scope ⊇ investigation scope; otherwise 404.
- Or drop cron and keep a member-triggered `:continue`.

**M8. Internal routes are orphaned.** Narrowing T-040 drops the routes for:
- `forecasts:batch`
- `quotes:batch`
- claims/entities/edges/embeddings/wiki batches
- `spend`
- `model-roles` (T-041)
- a budget read

Run-token claims also lack budget, model roles and country pack ref.
- **Fix:** restore these in T-040 or add T-040b, and add a §14 row for the RunContext/run-frame contract.

**M9. Data egress to new processors is unaddressed.**
- `screen.untrusted` sends raw untrusted text to the decision-model provider, which could be a new sub-processor (TypeSafe via OpenRouter).
- `link.entity` and `map.columns` also send untrusted or personal data.
- Committing the Jev model id to git moves provider choice outside `platform.model_role`, an R36 deviation not listed in §14.
- **Fix:**
  - A per-question egress allow-list of fields (labels only, no tenant UUIDs, no sample values), with a gate.
  - Any screening runs on the `extract` role and provider.
  - Jev for `route.*` only, after a vendor-doc probe and a founder egress decision.
  - Turn off OpenRouter upstream data collection (UNVERIFIED feature; needs a probe).

## Minor
1. **Trace flush on failure.** `after_run_callback` does not run on error, so also flush in `on_run_error_callback` or in the runner's `finally`. Gate `on_run_error` and `on_agent_error` too. ADK 2.11 has 14 callbacks.
2. **Labels to upgrade to FACT** (from the installed source):
   - `ParallelAgent` is deprecated and shares session state across branches. This refutes 04 §2.
   - Toolsets are re-resolved on every model step.
   - `BaseAgent(BaseNode)` is confirmed.
3. **A2A extra.** Adding it pulls in `a2a-sdk[http-server]`. T-055 must add it and re-run the litellm lock gate.
4. **T-080 emitters.**
   - Cut the per-provider emitters; ADK converts schemas itself.
   - The lint gate needs a transforming emitter: 22/22 proposals use `pattern`, 13/22 use `anyOf`, and there is no `maxItems`.
   - The tool layer mints new-entity ids such as `po_id`.
5. **DraftMapping emits canonical `⟨snap:…⟩` refs directly**, since deterministic code holds the ids. It must not depend on T-082's handles.
6. **One per-run handle table** with a shared counter. No textual re-basing.
7. **Missing schema work.**
   - A flag column on `intel.chunk`, plus view changes to `chunk_search` and `claim_search`.
   - The rejected-fingerprint suppression check moves into core at `POST drafts` and does not use an `intel_ro` view.
8. **Gates that cannot fail, or are self-referential.**
   - T-080 table and FK counts: use `db/tests/manifest.ts`.
   - T-085 threshold gate: use answer-key ratios or PDR targets.
   - The cost gate reads fixture-reported usage.
   - T-082 compares routes against the fixture.
   - The shared-prefix gate must inspect the real `LlmRequest`, because ADK appends the agent-name line. Use one constant name.
9. **`numeric_source` is a single string.** Columns with two sources need a list, or a `derived:` form.
10. **Ticket size.**
    - Split M-C1 per pack (M-C1a…d).
    - T-082 and T-084 are about 2 sessions each.
    - T-083's cron is outside intel's territory.
11. **Investigation semantics.**
    - Freeze supported items.
    - Re-mint supported items' templates before the final compose.
    - "All refuted" is not the same as "no data".
12. **Calibration statistics.** Report accuracy and coverage only, until N2's 200 questions exist.
13. **§14 classification.**
    - O-5/P4 (deterministic negotiator) is a ledger interpretation of R7/R22.
    - Missing rows: RunContext/run-frame, model-roles and budget routes, chunk flag migration, `intel_ro` decision view, and the Jev id in git versus R36.
14. **Traces carry no prose.** `BranchReport` text and the investigation `question` never go into trace payloads (rule 8).
15. **`intel.forecast_point` and `intel.supplier_quote` are intel-computed** cells on the allow-list. Label them "forecast (computed)" and "Simulated supplier quote", and add a core-side forecast recompute spot-check in W5.

## What to cut
- `screen.untrusted` in W3.
- The Jev and OpenAI adapters, and the calibration maps, until W5.
- T-080's per-provider emitters.
- The cron auto-continue.
- DM `route.packs` × 8. Start with R8 `load_skill` plus one `route.intent` question.

## Clean surfaces
- **Clause 1** is clean throughout. Investigation tables are operational and written through core. Lineage is read-only via `audit_log`. Memory writes go through core. The decision model has no tools. RFQs are non-binding. `map.columns` produces a draft. Approval executes under the approver. There is no auto-apply.
- **Clause 2** is clean in the design: handles fail closed, decision confidence shows as a band only, and summaries are validated envelopes.
- **Isolation** is clean apart from M7.
- **NOTIFY, SSE and errors** are unchanged.
- **Contract facts verified:** 22 draftables, 2 templates today, 58 named in the packs, all referenced tables exist.

## Founder questions (reviewer recommendations)
1. **Investigations:** cron auto-continue, or member-triggered? *Recommended:* member-triggered `:continue`, deterministic verdicts and a margin bridge. Defer cron.
2. **Decision-model egress:** may tenant text go to a new processor? *Recommended:* an LLM mimic on the existing `router` role. Jev only for `route.*` labels, after a vendor-doc probe. Cut screening from W3. Keep a per-question egress allow-list.
3. **Tool cap:** 12 or about 20? *Recommended:* 20, `propose_*` only on `draft_request`, read-only branches, and T-070 measures.
4. **R7/R22:** does a deterministic negotiator triggered by the purchasing specialist fulfil "the specialist negotiates"? *Recommended:* yes, recorded as a ledger interpretation.
5. **Fan-out:** keep ≤4 branches once the budgets are re-based on T-059 measurements? *Recommended:* yes. If the budgets can't be met, use single-agent for W3 and keep fan-out for the demo S1 path only.
