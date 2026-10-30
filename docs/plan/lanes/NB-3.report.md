# NB-3 report: done

**Change.** No migration was needed: the scope is already recorded in `evidence.snapshot.outlet_scope`, which `mintSnapshot` stores from the run token or the member.
- An approver who does not cover every `based_on` snapshot's scope is refused first, with 403 `forbidden`/`authority_denied`.
- `recheck` re-runs with `app.outlet_ids` narrowed to each snapshot's scope, then restores the approver's own before any write.
- The stale `now_ref` snapshot stores that same scope. It used to store the approver's `'*'`.
- Row keys are unchanged.

**Files**
- `services/core-api/src/modules/approvals/decide.ts`
- `services/core-api/src/modules/approvals/snapshots.ts`
- `services/core-api/test/approvals-evidence-scope.test.ts` (new)
- `docs/plan/lanes/NB-3.report.md`

Not mine: `apps/web/AGENTS.md`, `docs/plan/lanes/NB-1.report.md`.

**Gates**
- New file plus `approvals.test.ts`: `Tests 22 passed (22)`.
- Every approve or `based_on` test file, plus rfq: `Test Files 36 passed (36)`, `Tests 632 passed (632)`.
- `tsc -p .`: exit 0.
- `heavy.sh make test-db`: `Test Files 38 passed (38)`, `Tests 499 passed (499)`, guard.test included.

**Red-proofs** (each exited 1; all reverted)
- Today's code: test (1) got `[409, 'stale_draft']`; test (3) got `now_ref: null`.
- Cover check removed: test (2) got 422, not 403.
- Restore removed: test (4) got `[422, 'execution_failed']`.
- `recheck` returning `[]`: test (3) got 200.
- Approver-scope label: test (3) got `['*']`.

**Guarantee scan**
- **Books:** the PO is written only under `app.decision_id` and the approver's own scope; test (5)'s audit-log check is clean. The scope only narrows (gotcha 20).
- **Numbers:** the executed quantity and price are snapshot cells, and the stale values cite an approver-minted snapshot. Clean.

**Not done**
- No restarts, migration, contracts or git.
- Not checked live: after the core-api restart, an owner approving a fresh single-outlet RFQ PO should get 200. Draft `01a16ae1-…` stays `stale`.
- A manager now gets 403 where they got 422 `cannot_verify` for evidence wider than their scope.
- `forbidden` was already missing from `APPROVAL_ERROR_CODES`.
