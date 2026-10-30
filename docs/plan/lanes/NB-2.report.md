# NB-2 report: the model tag on Ask answers — DONE

**Files changed** (none staged; `apps/web/AGENTS.md` untracked is next dev's, not mine):
- packages/contracts/src/threads/index.ts (AnswerView `run_id: Uuid7.nullable()`)
- packages/contracts/test/samples/threads.ts (samples gain run_id; the roundtrip test needs it — outside the listed territory)
- packages/contracts/generated/{json-schema/v1.ask.response.schema.json, json-schema/v1.thread.schema.json, openapi/public.json, openapi/internal.json, ontology.json, sources.sha256.json}
- packages/sdk/src/gen/openapi.ts
- services/intel/munim_intel/contracts_gen/models.py (generated only)
- services/core-api/src/modules/threads/index.ts (AnswerRow, both selects, answerViews)
- services/core-api/test/threads.test.ts (new test "NB-2: an answer view carries its run_id")
- apps/web/components/staff/pages/ask.tsx (`runId={a.run_id}`)
- apps/web/components/staff/run-by.tsx (new exported `traceRunFor`: `"*" || of === "answer"`)
- apps/web/tests/run-by.test.ts (new)
- apps/web/mock-server/staff-data.ts, apps/web/mock-server/staff.ts (`run_id: null` on mock answers; web typecheck required it)

**Trace-scope assumption holds:** `/v1/traces/:run` reads `intel.run` under the member's RLS; the ask run's scope is the
thread's/asker's own (`threads/index.ts` mints with `scope`), and existing test (3) asserts it.

**Commands**
- `make contracts`: "verify_models: ok", 408 classes. `make ontology`: 170 object types, written.
- contracts vitest: `Test Files 18 passed, Tests 262 passed` (ontology "fresh" and roundtrip included; roundtrip failed first until samples got run_id).
- core-api `vitest run test/threads.test.ts`: `Tests 34 passed`.
- web `vitest run`: `Tests 178 passed`; `tsc --noEmit`: 0 errors. core-api `tsc --noEmit`: clean.

**Red-proofs**
- core-api: answerViews forced to `run_id: null` -> `AssertionError: expected null to be '01a17c9d-…'`, 1 failed; restored, 34 pass.
- web: old gate (`outletIds === "*"` only) -> "an answer's run is read by a single-outlet member" failed, 1 failed; restored, 3 pass.

**Not done / notes**
- No restarts (core-api and web need the orchestrator's restart). Web test checks the pure gate `traceRunFor`; node-env vitest cannot run effects, so no rendered fetch assertion.
- Did not run `make check` or the python tests.
- Guarantee scan: clause 1 clean (read-only field, no book write). Clause 2 clean (run_id is an id; trace payloads stay ids/labels; no new numbers).
