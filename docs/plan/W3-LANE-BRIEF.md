# W3 lane brief — read this first (11 Oct 2026)

W3 builds the intelligence layer on top of the closed W1 and W2 and the R44 demo data. Every W3 lane reads this page,
then its row (or merged lane) in `docs/plan/BOARD.md` → W3. It reads **only the ADR-014 sections its row cites**, not the
whole ADR. Authority order: ledger R45 (F1–F11) > ADR-014 §11–§12 > BOARD row > this page.

## The ten rules that bind every W3 lane
1. **One Guarantee.** No book write without a person's own command, an approved decision, or a listed derivation.
   Every number shown is a snapshot cell. intel never writes Postgres; every write goes through core-api
   `/internal/intel/v1` (R25).
2. **Deterministic first.** Known paths are code: watchers → detectors → findings → drafts, verdicts, completion,
   ranking, negotiation bounds. The model only writes prose, answers open questions, and picks bounded typed choices.
3. **Typed tools only.**
   - Use `read_<template>` and `propose_<command>`.
   - Never add a generic SQL or write tool, or a `tenant_id`, `run_id` or `actor` parameter.
   - Use handles, not UUIDs; deterministic code emits canonical `⟨snap:…⟩`.
   - Cap: ≤ 20 tools per context (F3).
4. **Taint is per run.** Once untrusted text (search, documents, chats, supplier replies, tainted thread turns) is in
   any context of the run, no `propose_*` or `request_quotes` for the rest of the run, across branches and steps.
5. **Who proposes.** Only the Manager proposes drafts, only on `draft_request`, with one skill loaded. Branches are
   read-only. Nothing auto-applies, in any mode (R16).
6. **Specialists (F8).** Every trace, finding and draft carries its specialist (`intel.finding.pack`,
   `core.draft.source = intel:<pack>`). Ids: `catalogue`, `kitchen`, `inventory_purchasing`, `finance`, `people`,
   `customers`, `compliance`, `market`; `manager`; service `forecast`. Registry: `packages/contracts/src/intel/specialists.ts`.
7. **ADK 2.11 facts (installed source; T-041).**
   - Model roles are always `BaseLlm` instances, never strings.
   - No `ParallelAgent`: it is deprecated and shares state. Use one `Runner` per branch.
   - No `DatabaseSessionService`.
   - Use 14 callbacks; flush traces in `on_run_error` too.
   - Never `gemini-2.5-*`. Never `litellm`.
8. **Gates.**
   - Run with `MUNIM_MODEL_MODE=recorded`.
   - Expected values come from an independent source: the hand-kept worldgen answer keys, pack md tables, or the
     migration manifest. Never the code under test.
   - Each refusal is paired with an accept.
   - Red-prove every gate with a **non-zero process exit**.
   - Live quality (pass^k, accuracy, cost) is a W5 measurement, not a W3 gate.
9. **Territory and shared files.**
   - Stay in your row's territory. Schema needs go to the migrator as exact requests.
   - **Never run contracts gen or the full `make check` in the shared tree.** Use an rsync copy under
     `scratchpad/<lane>/`; the orchestrator regenerates and runs the quiet-tree gates.
   - No git. Never read `.env`.
10. **Report.**
    - Files by path.
    - Verbatim gate output and red-proofs.
    - Requests to other lanes and the migrator.
    - What you did NOT do.
    - A One Guarantee scan, both clauses.

## Landed in W3 so far (read the code, not this list)
- T-041 runtime: `services/intel/munim_intel/{runtime,llm,tools,app}`, RecordedLlm, RunContext.
- T-052 forecast engine.
- T-087a specialist registry.
- 0018 history imports.
- R44 dev IdP.

Check `git log --oneline -30` for later merges.

## Where to look
- **Contracts:** `packages/contracts/src/{intel,approvals,shared}`.
- **Core internal API:** `services/core-api/src/internal/**` (T-040).
- **Approvals and drafts:** `services/core-api/src/modules/approvals/**`.
- **Templates:**
  - `evidence.snapshot_template` (migrations 0019+);
  - pack specs `docs/plan/packs/*.md` §3 (templates), §4 (detectors), §6 (draftables), §10 (eval plants);
  - answer keys `tools/worldgen/answer-key/*.json` (77 entries at the 100-day profile; `detector-map.json` maps them to detectors).

## Pack lanes (b-44…b-48) — shared rules (added 11 Oct)
- **Detectors** follow T-043's interface: `munim_intel/watch/detectors/<pack>/<detector>.py` with
  `SPEC = register(DetectorSpec(...))` (id, pack, template, finding_type, impact_column, windows, fires, severity, dedupe,
  narration template without digits, optional watches/outlet_kinds/coverage_column/mapping → Proposal). Read
  `services/intel/munim_intel/detect/__init__.py` and the two reference detectors first.
- **Thresholds** live in the country pack under `detectors.<id>` (`thresholds`, `severity_ladder`). **Do not edit
  `packages/contracts/packs/{IN,AU}.json` in the shared tree** (five lanes would clobber it). Edit them only in your
  scratch copy, and put the exact JSON you added in your report; the orchestrator merges all packs' thresholds serially
  and bumps the pack version.
- **Skill** for asks: `munim_intel/skills/<pack>/` — instructions (no digits; cite-or-abstain), the generated toolset
  (`build_toolset(pack, …)`), and nothing else; the Manager (T-082) loads it.
- **Gates:** every pack §4 detector you build finds its answer-key plants (`tools/worldgen/answer-key/detector-map.json`)
  on the gate worlds with impact = key, ≤ 2 false alarms per world, 100% specialist labels, traps (e.g. RG-F8, RG-C6)
  NOT flagged; drafts per pack §6 mappings with canonical refs. Expected values come from the answer keys, never the code.
- Templates exist for every pack (0019, 0021). Formula notes and INFERENCES from M-C1bc are in `db/README.md` 0021 section.
