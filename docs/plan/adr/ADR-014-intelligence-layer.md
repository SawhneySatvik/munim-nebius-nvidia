# ADR-014 · Munim's intelligence layer

The design has five parts:
- a typed ontology;
- deterministic workflows;
- bounded agents;
- investigations owned by core;
- typed decisions.

**Status:** **ratified (ledger R45, 11 Oct 2026)** with founder decisions F1–F7 recorded in §11; revised after independent review.

> **Post-ratification notes (11 Oct 2026, docs lane): the ledger outranks this body.**
>
> The founder added ledger R45 addenda F8, F9 and F10 after this ADR was revised. F4 was also decided as *hybrid*. §11 records all four, but some body passages still describe the earlier design. **Where they disagree, follow ledger R45 and `docs/plan/BOARD.md` W3**, which was rewritten from §12 plus F1–F10. The body is left unedited for history.
>
> | Passage | Superseded by | Now |
> |---|---|---|
> | §3.2 row 5 (`negotiate` = "D over A2A"), §3.2 "Rejected as separate agents: … an LLM negotiator", §13.2 "No LLM negotiator", §14 L4 and P6 ("deterministic negotiator"), §12 T-055 gate "0 LLM calls" | **F4** | Hybrid. Rules set the allowed move set, the price limits and the default move. Each round the AI makes a typed choice (accept / counter / walk away) from that set and writes the message prose; prices are rendered by code. Replies go to the no-tools extractor (the run is tainted). The deal review is deterministic, and the PO draft is emitted by deal-review code. BOARD splits this into T-055a (rules) and T-055b (AI choice); the "0 LLM calls" gate becomes "move ∈ allowed set; out-of-set or budget → rule default". |
> | §3.1–§3.2 "orchestrator" and "skill `<pack>`" | **F8** | The orchestrator is presented as the **Manager**; its ADK name stays `munim` (§6.1). Each skill belongs to a named specialist (one per pack), which also owns its fixed-path workflows, identity, track record and evals. Actor labels: `manager`, `specialist:<pack>`, `branch:<pack>`, `watcher:<pack>`. BOARD T-087a/b and T-044…T-051. |
> | §6.4 rule 4 ("Ask answers are **never** re-read into later contexts in v1"), §13.2 "No ask history re-read into later contexts" | **F9** | Specialist threads re-read a **bounded** thread excerpt: a deterministic rolling summary of cited segments from **untainted** turns only, plus the last ≤ 3 turns. Taint carries across turns: a tainted turn in the window starts the next run tainted, so `propose_*` is refused. §6.2 still holds (no LLM summariser). BOARD T-088a/b, T-082a (6), T-082b (6). |
> | §0 line 5 and §7.2 ("A member triggers each step with `:continue`"), §13.3 "Cron auto-continue … deferred", §11 F1 | **F10** | Step (default), **Plan** (approve the plan once; core runs the steps inside that request) and **Auto** (Plan, plus resume on new data within the cap; core-worker; built last). The owner sets per-role ceilings and the monthly AI cap. Drafts always need approval. BOARD T-089a/b, T-090, M-C2 (mode columns). Open item O-1 covers identity for unattended Auto steps. |
> | §12 (no F8–F10 tickets; T-052 without a hash) | F8–F10 | BOARD W3.0–W3.4 adds M-C3, T-087a/b, T-088a/b, T-089a/b, T-090 and T-092a/b. T-052 = e05dd79. |
>
> Also: ledger R45 F8 says "ADK-014 §0", which means ADR-014 §0. Ledger F1's "until (a) is in use" has no (a); F10 supersedes it anyway.

**Ledger:** R3, R6, R7, R8, R15, R16, R22, R25–R29, R34–R36, R40, R44, R45 (incl. addenda F8–F10).

**Depends on:**
- 03-architecture §1.3, §1.6–§1.9, §4–§5;
- 04-agent-framework;
- ADR-003, -006, -007, -008, -010 and -013;
- `docs/plan/packs/*.md`;
- research R3, R5, R6a, R6b and R6c;
- review `ADR-014-review.md` (commit 1978a80).

**Amends, if ratified:**
- ADR-007 (fan-out mechanism);
- ADR-008 (A2A client/server);
- 04 §1 (RunContext fields), §2 (tool cap and skill loading), §3 (tool shapes), §5 (`confidence_bp`) and §6 (negotiator);
- the BOARD W3 rows.

§14 lists every item that needs more authority than this ADR, together with the authority it needs.

**Labels**
- `FACT` is sourced. The sources are research findings, repo files and the **installed ADK 2.11.0 wheel** at `.venv/lib/python3.12/site-packages/google/adk`, cited by file and line.
- `INFERENCE` is design reasoning.
- `UNVERIFIED` is pre-cutoff knowledge that has not been re-fetched. That covers Karpathy, the OpenAI/Gemini strict-output rules, and any vendor behaviour not probed.
- R6c facts come from secondary sources dated after my knowledge. No R6c number appears in any gate.

---

## 0 · The decision in twelve lines

1. **Deterministic first.** The following are ordinary code:
   - watchers → detectors → findings → drafts;
   - the forecast and the brief ranking;
   - supplier negotiation and deal review;
   - outcome checks and the graph projector;
   - wiki assembly;
   - investigation checklists, verdicts and completion.

   In these paths the only LLM call writes prose. It never chooses numbers, refs, actions, verdicts or completion.
2. **Agents only where the path is unknown,** which means `ask`. One orchestrator `LlmAgent` loads pack skills through `load_skill` (R8 default). For an `investigate` intent it may fan out to **at most 4 read-only, clean-context branches** (founder decision F5).
3. **Only the orchestrator can propose a draft,** and only on a `draft_request` intent, with exactly one skill loaded. Branches are read-only analysts.
4. **Taint is a property of the run.** Once any context in the run has read untrusted text, `propose_*` and `request_quotes` are refused for the rest of the run, including the orchestrator after a tainted branch. Tainted text is never re-read into a later context.
5. **Long-horizon investigations are core-owned durable workflows.**
   - A playbook is data.
   - A member triggers each step with `:continue`.
   - Core mints the snapshots in the member's current scope and evaluates the verdict rules.
   - Completion requires a balanced margin bridge with a bounded residual.
   - The LLM only narrates each step and answers off-checklist follow-ups.
6. **The ontology is generated:**
   - objects from tables;
   - links from FKs, projection edges and lineage;
   - functions from snapshot templates;
   - actions from the 22 draftable commands, each running preview → approve → commit with no auto-apply.
7. **Typed tools.** There is one `read_<template>` per template and one `propose_<command>` per draftable. Each model-facing schema is transformed from the contract schema. There is no generic write or SQL tool, and no `tenant_id` parameter.
8. **Handles, not UUIDs.** The model writes `S2.r3.unit_price_minor`. One handle table per run, with a shared counter, expands it to a canonical `⟨snap:…⟩`. An unexpanded handle contains digits, so it fails closed. Deterministic code emits canonical refs directly.
9. **A `DecisionModel` port** sits beside the LLM port. It answers typed `choice`, `score` and `predicate` questions with probabilities shown only as bands.
   - W3 ships two questions: `route.intent` and `map.columns`. Both use the LLM-mimic adapter on the existing `router` role, under a per-question egress allow-list.
   - Jev, OpenAI Decisions, calibration maps, screening, entity linking and a fine-tuned Gemma are deferred (§13.3), each with written entry criteria.
10. **Lineage is a superset of the action log.** It runs draft → decision → audit → book row, plus finding, run and snapshots. It also covers rejected, stale, failed and abstained drafts, which Palantir's action log does not record.
11. **Evals grade end state against the hand-kept worldgen answer keys.** pass^k, per-category accuracy and decision accuracy/coverage are live W5 measurements. No LLM judge sits in any gate.
12. **ADK is used narrowly:**
    - `LlmAgent`, built per request with one constant name;
    - one `Runner` per request and per branch, each with its own `InMemorySessionService`;
    - one `BasePlugin` covering all 14 callbacks;
    - the model classes.

    Not used: custom `BaseAgent`, `ParallelAgent` (FACT: deprecated, and its branches share state), `MemoryService`, `DatabaseSessionService` and `[eval]`.

---

## 1 · Principles

| # | Principle | Source |
|---|---|---|
| P1 | **The model proposes; a named person disposes.** Nothing auto-applies, and the autonomy slider is fixed at "suggest". | R15, R16. R6a "Palantir's typed Action layer…" (FACT: Palantir allows auto-apply; we forbid it). Karpathy, YC June 2025, "partial autonomy / autonomy slider" (UNVERIFIED). |
| P2 | **Numbers are rendered, never typed.** Snapshot cells only; draft numbers are refs. | R25, R26, R40; CLAUDE.md rule 3 |
| P3 | **Start simple.** Write code for a known path, use one LLM call when only prose is needed, and use an agent only for open questions. | R6a "Start simple and fan out sparingly" (FACT). R3 X3 "router, then one agent with JIT instruction packs" (FACT) |
| P4 | **Typed actions:** one tool each, and no free-form write. | R6a "one dedicated typed tool per action type" (FACT) |
| P5 | **Data, logic, action:** objects, then templates/detectors/forecast/playbooks, then drafts. | R6a "decomposed as data, logic and action" (medium) |
| P6 | **Keep each call's context small and curated.** "Just the right information for the next step." | R6a "Per-run context should be small and curated" (FACT); Karpathy, June 2025 (UNVERIFIED) |
| P7 | **One owner of the final output.** The orchestrator writes the envelope, and the core-api validator is the single choke point. | R6a "manager pattern" (fit: INFERENCE) |
| P8 | **Fan-out is a budgeted exception.** | R6a "Multi-agent fan-out… ~15× chat tokens" (FACT; not transferable) |
| P9 | **Typed decisions for bounded questions.** The band is metadata only. Schema safety is not correctness, and a decision model is never the policy layer. | R6c (secondary, post-cutoff) |
| P10 | **External, durable long-horizon state.** Completion is computed by core from ledger cells, never declared by a model. | R6b "Long-horizon work needs explicit external state" (FACT: "declaring the project complete too early"); review M3 |
| P11 | **Grade the end state, not the transcript.** Report pass^k and per-category results. | R6b tau-bench finding; R6b BFCL/Epoch finding (FACT) |
| P12 | **Gates never trust model opinion.** | R6b "Self-reported success and in-band LLM judges are poor verifiers" (pilot, medium) |
| P13 | **Untrusted text never reaches an action tool, directly or laundered through a summary.** | CLAUDE.md rule 8; 03 §3 T6; review B1 |
| P14 | **SQL is canonical.** The graph is a multi-hop projection, and GraphRAG is not core. | R6, R35; R6a GraphRAG (INFERENCE) |
| P15 | **Make human verification fast.** Show each value beside its ref, label edits, show stale cells. | R26; Karpathy, generation–verification loop (UNVERIFIED) |

I know of no primary Karpathy text called "graph engineering" (UNVERIFIED either way). No decision here depends on it.

---

## 2 · The ontology layer over Postgres

### 2.1 Shape

The pattern comes from R6a. All names are ours (hard rule 4).

| Concept | Munim realisation | Source of truth | Exposed to agents as |
|---|---|---|---|
| **Object type** | A table with `tenant_id`, keyed `(tenant_id, id)`, tagged `munim:book` or `munim:operational` (R29) | migrations | names via `intel_ro.*_names`, or rows inside snapshots; never raw reads |
| **Property** | A column. Numeric properties are visible only through templates. | migrations | snapshot columns |
| **Link type** | (a) FKs. (b) Projection edges: `intel.edge.kind` ∈ `uses, quoted, sold, wasted, supplies, works_at, mentions, supported_by, proposes, about, contradicts`. (c) Lineage: decision → draft → finding → run → snapshot, and audit → row. | `pg_constraint`; 0012 CHECK; 0003 | graph templates (multi-hop only); the lineage route (§8) |
| **Function** | A snapshot template (params schema, typed columns, `numeric_source`, `min_role`). Also detectors, the forecast engine, and investigation verdict rules. | `evidence.snapshot_template` (migration-authored); core-domain playbooks | one typed read tool per agent-exposed template (§5) |
| **Action type** | A draftable command: `command`, `proposal` (numeric leaves are refs), `editable` (ref or `{value, typed_by}`). Authority comes from `core.command_authority`. | `shared/draftables.ts`; 22 types (FACT) | `propose_<command>`, on `draft_request` only (§5.1) |
| **Action log** | `core.draft` + `core.decision` + `core.audit_log` + `intel.outcome` + the run's `abstain` trace events | 0003, 0012 | read-only lineage (§8) |

**The 22 action types** (FACT: unique `defineDraftable` registrations), all `.v1`:

| Module | Action types |
|---|---|
| catalogue | `price.set`, `recipe.version.create`, `deal.end`, `coupon.set` |
| compliance | `maintenance.schedule` |
| customers | `campaign.create` |
| finance | `dispute.draft`, `journal.adjust`, `period.close` |
| goals | `goal.create`, `task.create` |
| imports | `format.approve`, `run.commit` |
| inventory | `reorder_level.set`, `transfer.create` |
| kitchen | `prep_list.create`, `prep_time.set` |
| people | `payroll_draft.create`, `roster.create` |
| purchasing | `po.create`, `invoice.dispute`, `supplier_return.create` |

**Missing, and routed to the owning tickets:**
- a supplier-invoice draftable for invoice vision (04 §8): T-056 needs `purchasing.invoice.record.v1`;
- `catalogue.batch` for the menu-photo import (BOARD rider; T-067).

### 2.2 Actions: preview → approve → commit, never auto-apply

| Stage | What happens | Enforced by |
|---|---|---|
| Preview | A proposal arrives at `POST /internal/intel/v1/drafts`. Core:<ul><li>validates it against the registered proposal schema;</li><li>resolves refs in-tenant;</li><li>copies the `based_on` cells into `expected`;</li><li>computes the **proposal fingerprint**;</li><li>applies the open-duplicate and recently-rejected rules (§5.5);</li><li>stores `proposed`.</li></ul> | zod `checkDraftPayload("proposal")`; T-040 validator |
| Approve | `/v1/drafts/{id}:approve` moves the draft to `executing` with `exec_txid` (exactly one approval wins). Authority is checked on the **final** payload. The `based_on` cells are re-run in the approver's scope; any change marks the draft `stale` and nothing executes. | T-008 `decide.ts` (FACT, built) |
| Commit | The module command runs as the approver with `app.decision_id`. Audit and outbox rows are written in one transaction. | ADR-013 |
| Never | Auto-apply, an intel write grant, or a decision-model verdict standing in for any step above | R16, R25; §4.4 |

### 2.3 Lineage, including what Palantir does not log

Palantir's action log records successful submissions only (R6a "Decision capture and lineage", FACT). Munim's lineage is a superset, built from tables that already exist:

| Outcome | Recorded in | Shown as |
|---|---|---|
| Proposed | `core.draft` (source, `run_id`, `finding_id`, evidence, `based_on`) | proposal + evidence |
| Approved / edited | `core.decision` (`final_payload`, `{value, typed_by}` leaves) | verdict, approver, and a diff of the fields the person typed (R26) |
| Rejected | `verdict = rejected`, `reason`, plus a new optional `reason_code` (§8) | verdict + code. The free-text note is untrusted and never sent to intel. |
| Stale | `draft.status = stale` + history `changes[]` | the cells that moved |
| Failed | `status = failed` + history `sqlstate` | failure code |
| Abstained | `intel.trace_event{kind: abstain}` with `reason_code` + a `command_type` label | refusal + reason; no payload |
| Suppressed (recently rejected) | `DraftsResponse{status: abstained, reason_code: recently_rejected}` + trace `abstain` | refusal + reason |
| Executed | `core.audit_log` → rows. A book row's `origin` is its creation provenance (gotcha 34). | touched rows |
| Outcome | `intel.outcome` | measured effect (evidence only, R16) |

There is no new table. Lineage joins through `core.audit_log`, never through `origin`.

### 2.4 Materialisation

**Numbers come only from templates** (03 §1.7). FACT:
- Only **2** templates exist today: `inventory.below_reorder` and `platform.spend_by_tenant`.
- P&L is a core read (`modules/finance/read.ts`), not a template.
- The packs name **58** templates: catalogue 6, compliance 5, customers 7, finance 7, forecast 5, inventory_purchasing 11, kitchen 5, market 6, people 6.
- About 8 more non-pack templates are on the W2 deferred list.
- This ADR adds `finance.margin_bridge` (§7.3).
- **M-C (split per pack, §12) is therefore the critical path for every numeric tool.**

**`numeric_source` becomes a list** (review m9). Today `SnapshotColumn.numeric_source` is a single string, but many pack columns derive from 2–4 sources (for example `margin_minor ← all`). The change:
- the contract becomes `numeric_source: string | string[]`;
- the template-scan gate checks every element against the allow-list;
- the change lands in M-C1a before any multi-source template.

**Intel-computed cells on the allow-list** (review m15):
- `intel.forecast_point` renders with the label "forecast (computed)";
- `intel.supplier_quote` renders with the label "Simulated supplier quote";
- W5 adds a core-side spot-check that recomputes the forecast.

**Graph port** (R35 default):
- Postgres `intel.entity` and `intel.edge` with recursive CTEs;
- the five templates of 02-schema §6;
- ids and labels only;
- FalkorDB optional (F7);
- lineage never uses the graph.

**`make ontology` (T-080)** generates the ontology from:
1. the contracts registry (draftables, reason codes, grammar data);
2. the migration catalogue, introspected on the embedded-PG harness;
3. the `evidence.snapshot_template` rows;
4. `core.command_authority`.

It outputs `packages/contracts/generated/ontology.json`, which records the input sha256s for the freshness gate (gotcha 13), and `munim_intel/contracts_gen/ontology.py`. It also outputs the **model-facing tool schemas**, which are a transform of the contract schemas (§5.2).

What it does not output:
- **No per-provider emitters.** ADK converts schemas itself (review m4).
- **No tool names derived from generated Pydantic class names,** which are unstable (R3-m10). Names come from contract names.

SkillSpecs stay hand-written (procedural memory) and are validated against `ontology.json`.

---

## 3 · Agent topology

### 3.1 Ownership

- **Ask:** the orchestrator alone calls `submit_answer`, which posts to `answers`. Branch reports go only into the orchestrator's context.
- **Watchers, brief and investigations:** core or deterministic intel code owns the output.
- **Single choke point:** the core-api validator (R25).

### 3.2 Full roster

Kinds:
- **D** = deterministic code;
- **L1** = one LLM call, no tools, typed output;
- **DM** = DecisionModel question;
- **A** = `LlmAgent` with tools.

Segments: R = restaurants and cloud kitchens; S = shops.

Plant ids come from the pack §10 tables. "Key" marks plants **present in the worldgen answer keys today** (FACT: 60 problems across 4 worlds). Every other plant is added by T-086.

| # | Unit | Kind | Owner question / job | Can propose | Plants | R/S |
|---|---|---|---|---|---|---|
| 1 | `watch.pipeline`: event/sweep → `watch:claim` → detectors → finding → `DraftMapping` | D (intel) | "What changed that costs me money?" | the mapped draft per detector | every detector plant | both; kitchen off for S |
| 2 | `narrate(finding)` | L1 `narrate` | prose for findings ≥ `high`, at most 10 per tenant per day | — | template text in gates | both |
| 3 | `forecast.nightly` | D | "How many tomorrow?" | — | FC1–FC6 (T-086) | both |
| 4 | `brief.daily` | D + L1 | "What needs me today?" | attaches existing drafts | T-054 key | both |
| 5 | `negotiate`: RFQ to 3 simulated suppliers, at most 2 counters, counter = best rival (pack §6) | D over A2A | "Who should I buy from?" (simulated, R22) | `purchasing.po.create` | I7 / S1 (key: `*-S1`) | both |
| 6 | `deal_review` (5 rules) | D | "Is this deal safe?" | — (`reason_code` refusals) | I7 | both |
| 7 | `outcome.check` | D | "Did the approved change help?" | — | fixtures | both |
| 8 | `graph.projector` | D | multi-hop context | — | T-058 | both |
| 9 | `wiki.compile` | D + L1 | "What do we know about X?" | — | T-057 | both |
| 10 | `extract.claims` | L1 `extract`, **no tools**, quarantined | documents and chats → claims with spans | — | T-056 | both |
| 11 | `extract.vision` | L1 `vision`, no tools | invoice and menu photos → typed rows with span refs | needs `purchasing.invoice.record.v1`, `catalogue.batch` (gaps) | T-056 | both |
| 12 | `route.intent` | DM (`router` role) | intent of a question | — | hand-labelled set | both |
| 13 | `map.columns` | DM (`router` role) | source column header → target field and unit (renames and units only, R28) | `imports.format.approve` | T-030 sample files | both |
| 14 | **`investigation.playbook`** (`margin_fall` in v1) | **D in core** + L1 narrate | "Why did margin fall this month?" — over days | none (links existing drafts) | margin plants (T-086) | both |
| 15 | `orchestrator` (ask) | A `reason` | any owner question | through one loaded skill, on `draft_request` only | T-053 | both |
| 16 | skill `catalogue` | A, built on demand | "Which dishes/SKUs make money; what should I charge?" | `catalogue.price.set`, `recipe.version.create`, `deal.end` | C4 (key ST-C4); C1–C3, C5–C6 (T-086) | both |
| 17 | skill `kitchen` | A | "Which station or dish makes orders late?" | `kitchen.prep_time.set`, `prep_list.create` | K2/K3 (key: remake/waste); K1, K4–K6 (T-086) | **R only** |
| 18 | skill `inventory_purchasing` | A | "Will I run out, what's expiring, who's overcharging?" | `purchasing.po.create`, `invoice.dispute`, `supplier_return.create`, `inventory.reorder_level.set`, `transfer.create`; tool `request_quotes` | I1–I5 (key) | both |
| 19 | skill `finance` | A | "Did the channels pay me? Can I close?" | `finance.dispute.draft`, `journal.adjust`, `period.close` | F1–F4 (key); F5–F8 (T-086) | both |
| 20 | skill `people` | A | "Over-staffed? Overtime creeping?" | `people.roster.create`, `payroll_draft.create` (IN only) | P1 (key); P2+ (T-086) | both |
| 21 | skill `customers` | A | "Which coupons leak? Which regulars left?" | `customers.campaign.create`, `catalogue.coupon.set` | G4 (key); G1–G3, G5–G6 (T-086) | both |
| 22 | skill `compliance` | A | "What lapses next? Were checks done?" | `goals.task.create`, `compliance.maintenance.schedule` | A1–A3, A5–A6 (key); A4, A7 (T-086) | both |
| 23 | skill `market` | A | "What's coming this week? Does a second outlet pay back?" | `goals.goal.create`, `goals.task.create` | M1–M4 (all T-086) | both |

**How this meets "start simple" (P3):**
- At runtime there is at most **1 + 4 agents** per run.
- Skills 16–23 are data: instructions of at most 1.5k tokens plus a tool list, instantiated only when loaded.
- Each skill is justified by a pack §1 owner question, at least 1 draftable, and at least 4 plants.

**Rejected as separate agents:**
- a verifier/judge agent (P12);
- an LLM negotiator (the pack specifies the counter rule);
- a forecast agent (it is a tool: R3, 04 §2);
- an onboarding agent (vision + draft does the job);
- per-pack watcher agents (R8: "no LLM call per event");
- an LLM investigator (review M3: `margin_fall` is a known path).

`inventory_purchasing` is **one skill** (R3 unchanged). The earlier "facets" proposal is withdrawn: under a 20-tool cap it fits (§5.1). It returns only if the founder picks a 12-tool cap (F3).

### 3.3 Workflow versus agentic, end to end

```
event / 15-min sweep ─► watch:claim ─► detectors (SQL template + threshold fn) ─► finding ─► DraftMapping (canonical refs)   no LLM
                                              severity ≥ high ─► narrate (L1) ─► validator ─► inbox
member asks ─► /v1/ask ─► run token ─► route.intent (DM) ─┬─ certification_request ─► abstain not_a_certificate (no LLM)
                                                           ├─ lookup / explain / out_of_scope / low band ─► orchestrator + load_skill (≤ 2 skills, ≤ 20 tools)
                                                           ├─ investigate ─► orchestrator ─► fan_out(≤ 4 read-only branches) ─► BranchReports   [F5]
                                                           └─ draft_request ─► orchestrator + exactly 1 skill + its propose_* tools
                                    orchestrator ─► submit_answer(envelope) ─► core validator ─► stream (or "Cannot verify")
member starts investigation ─► core: playbook items ─► member-minted snapshots ─► verdict rules (core-domain) ─► checklist
                              ─► intel narrate(step) (L1, untainted) ─► validator ─► step summary   [:continue on later days]
```

### 3.4 Budgets

These are provisional and get re-based on T-059 measurements (review M1).

Blocks 1–5 of §6.1 come to about 8.3k tokens per call. That makes Σ-token caps below about 8 × that figure unreachable, so the caps are stated **per call × call count**, with a provisional Σ. Cached-prefix tokens are reported separately whenever the provider returns them. Until T-059 measures cache-hit rates, the cap applies to total input.

| Run kind | Per-call input cap | Model calls | Tool calls | Σ input (provisional) | Σ output | Branches |
|---|---|---|---|---|---|---|
| DM question | ≤ 2k | 1 | 0 | ≤ 2k | ≤ 64 | — |
| narrate (finding or investigation step) | ≤ 8k | 1 (+1 grammar retry) | 0 | ≤ 16k | ≤ 600 | — |
| brief | ≤ 8k | 1 (+1) | 0 | ≤ 16k | ≤ 1.2k | — |
| ask, single agent | ≤ 24k | ≤ 8 | ≤ 10 | **≤ 100k** | ≤ 4k | 0 |
| ask, fan-out: orchestrator | ≤ 24k | ≤ 6 | ≤ 6 | ≤ 100k | ≤ 4k | ≤ 4, depth 1 |
| ask, fan-out: each branch | ≤ 16k | ≤ 6 | ≤ 8 | **≤ 60k** | ≤ 2k | — |
| ask, fan-out run total | — | — | — | ≤ 340k (≈ 3.4× a single ask) | ≤ 12k | — |
| investigation step | — | 1 narrate | 0 model tools; core mints templates | ≤ 16k | ≤ 600 | 0 |
| investigation lifetime | — | ≤ 10 steps | — | ≤ 160k | — | ≤ 2 active per tenant |
| drafts per ask run | ≤ 3, orchestrator only | | | | | |

**Tenant ladder** (03 §9, 04 §10):
- **At the soft cap:** narration falls back to templates and fan-out is disabled (investigate runs single-agent).
- **At the hard cap:** rules only.

If T-059 measures p95 above these caps for fan-out, W3 ships single-agent ask and keeps fan-out only for the demo S1 path (F5).

---

## 4 · Decision models

### 4.1 The port

The port lives in `munim_intel/decide/`, outside ADK, because it generates no content.

```python
Kind = Literal["choice", "score", "predicate"]

@dataclass(frozen=True)
class DecisionQuestion:
    key: str                      # "route.intent"; versioned with its instructions
    version: int
    kind: Kind
    options: tuple[str, ...]
    instructions: str             # ≤ 300 tokens, committed
    egress: frozenset[str]        # the ONLY DecisionState fields that may leave the process (§4.3)
    threshold_bp: int             # below → abstained → caller's deterministic fallback

@dataclass(frozen=True)
class DecisionResult:
    key: str
    answer: str | None
    probs_bp: Mapping[str, int] | None    # sums to 10_000 ±1 when present
    band: Literal["low", "medium", "high"] # the only thing ever shown (R40 C5)
    abstained: bool                        # below threshold, schema-impossible answer, no probabilities, or adapter error
    adapter: str; model_id: str; input_tokens: int; latency_ms: int

class DecisionModel(Protocol):
    async def decide(self, ctx: RunContext, state: DecisionState, qs: Sequence[DecisionQuestion]) -> list[DecisionResult]: ...
```

Providers and models come from `platform.model_role`. **In v1 every question uses the existing `router` role,** so no R36 amendment is needed. Decision models have no tools and are invoked by code only.

### 4.2 Adapters in W3

| Adapter | How | Status |
|---|---|---|
| `RecordedDecision` | committed fixtures | every gate |
| `LlmMimic` | The approved LLM on the `router` role. Options are rendered as single-token codes `A…H`. Output is constrained to an enum (Gemini response schema; OpenAI-compatible strict `json_schema`). Probabilities are the answer token's top-k logprobs, renormalised over the options. Without logprobs → `probs_bp = None` → band `low` → fallback. | W3 default. Logprob availability per provider and model is UNVERIFIED and probed by T-059. |

Jev (OpenRouter), OpenAI Decisions and a fine-tuned Gemma are **deferred** (§13.3) with their entry criteria.

**Re-validation.** Every result is re-checked in Python: the answer must be one of the options, and the probabilities must sum to 10,000. A schema-impossible answer becomes `abstained` with the internal enum `decision_invalid` (R6c: shape is not correctness).

### 4.3 Which Munim decisions use it in W3, with egress allow-lists (review M9)

| Key | Kind | Options | Allowed egress fields | Below threshold |
|---|---|---|---|---|
| `route.intent` | choice | `lookup, explain, investigate, draft_request, certification_request, out_of_scope` | the member's question text (the same data class the `reason`-role orchestrator already receives); the set of outlet **kinds** in scope (`restaurant`/`cloud_kitchen`/`store`); country code. **No** UUIDs, names or cell values. | Treated as `explain`: the orchestrator uses `load_skill` (R8 default) |
| `map.columns` | choice per source column | the import kind's target field names + `ignore`; declared units | source column **header strings** and the target field names. **No** cell values, sample rows or file names. | Field left unmapped in the `imports.format.approve.v1` draft; a person maps it |

The egress allow-list is enforced by the request builder: a `DecisionState` field not in `egress` raises before any network call.

**Processor rule.** A DM question may go only to a provider that already receives the same data class through an LLM role in `platform.model_role`. A new processor (for example TypeSafe via OpenRouter) needs a founder egress decision (F2).

**Not used, deliberately.** Each of these stays deterministic; the reasons are in §14 P5:
- detector triage and severity (pack ladder L);
- inbox ranking;
- draft verification (the core validator does this);
- reason-code classification (members pick codes from fixed lists);
- investigation verdicts (core rules).

### 4.4 What a decision model must never do

1. Produce or alter a displayed or payload number (R25).
2. Write prose that a person sees.
3. Approve, reject or rank drafts; set severity; pass or fail a deal-review rule; set an investigation verdict or completion.
4. Act as a policy gate. The book guard, authority, approvals and the validator stay in core (R6c per Firecrawl).
5. Trigger action from confidence. No "auto-apply above 99%" (R16).
6. Take `tenant_id`, or send any field outside its egress allow-list.
7. Hold tools, or be called by a model.
8. Show a probability as a figure; only the band is shown (R40 C5).

### 4.5 Measurement (review m12)

In W3 and W5 the measure is **accuracy and coverage at threshold only**, per question and per adapter, live.

Label sets:
- `route.intent`: a hand-labelled set of at least 60 questions in W3, growing to the 200 owner questions of N2 (PDR §6);
- `map.columns`: the T-030 sample files.

Brier, ECE and calibration maps start only once there are at least 200 labelled items per question (§13.3). Recorded-mode replays measure nothing about the model, so no accuracy number is a W3 gate.

---

## 5 · Typed tools

### 5.1 The tool set

T-080 generates the tools; each SkillSpec binds its own.

| Tool | Generated from | Bound when |
|---|---|---|
| `read_<template>` | One template's `params_schema` (flat ids, dates, shape). Calls `POST /internal/intel/v1/snapshots` and returns a handle digest (§5.4). | The skill is loaded (orchestrator) or briefed (branch). Input-only templates (`forecast.sales_history`, `slot_profile`) and review-only ones (`deal_inputs`, `invoice_duplicates`) stay with their code. |
| `propose_<command>` | The draftable's proposal schema, **transformed** (§5.2) | **Only the orchestrator, only on `draft_request`, exactly one skill loaded, run not tainted.** 20 of 22 actions are agent-exposed. `imports.*` are produced only by the import workflows. `people.payroll_draft.create` is bound only where `payroll_scope = drafts`. |
| `request_quotes` | negotiation workflow #5 | Same rule as `propose_*`. Non-binding (R22). |
| `forecast_points` | `forecast.points` | kitchen, inventory_purchasing, people and market skills |
| `search` | `intel_ro.chunk_search` / `claim_search` | customers, compliance and market skills. **Taints the run.** |
| `graph_<template>` | the 5 graph templates | catalogue and inventory_purchasing skills |
| `load_skill` | skill enum | orchestrator, not on `draft_request`; at most 2 skills in total; traced as `skill_load` |
| `fan_out` | `[{skill, question}] ≤ 4` | orchestrator on `investigate` (F5) |
| `abstain` | `ReasonCode` filtered to the skill's refusal codes + `missing_ref` / `insufficient_history` | all |
| `report` / `submit_answer` | `BranchReport` / `AnswerEnvelope` with handles | branch / orchestrator |

**Tool cap.** The cap is a **design choice, not a FACT** (review M2):
- R3 cites degradation past about **20** tools (Shopify, FACT). 04 §2's "≤ 12 (FACT R3)" mislabels it.
- This ADR proposes **≤ 20 per context**, measured in T-070 (founder decision F3).

Counts, read-only bindings (agent-exposed templates + shared tools):

| Skill | Tools |
|---|---|
| catalogue | 6 + graph = 7 |
| kitchen | 5 + forecast = 6 |
| inventory_purchasing | 6 stock + `price_creep`, `invoice_vs_po`, `quote_compare` + forecast + graph = 11 |
| finance | 7 |
| people | 6 + forecast = 7 |
| customers | 7 + search = 8 |
| compliance | 5 + search = 6 |
| market | 6 + search + forecast = 8 |

- **Orchestrator base:** `load_skill`, `fan_out`, `abstain`, `submit_answer` = 4.
- **Two skills:** fits within 20 for every pair except inventory_purchasing + customers/market (11 + 8 + 4 = 23). For those pairs the second `load_skill` is refused with "use fan_out or answer with what you have".
- **`draft_request`:** one skill + its propose tools + `abstain` + `submit_answer`. The maximum is inventory_purchasing at 11 + 5 + `request_quotes` + 2 = **19**.
- **Branches:** one skill + `abstain` + `report`; the maximum is 13.
- **Under a 12-tool cap:** no two-skill pair fits, and inventory_purchasing alone (15) would need facets. That is why F3 is a founder decision.

### 5.2 Strict schemas: transformed, then linted

These facts are the reason a transform is needed (review m4, from contracts, FACT):
- **22 of 22** proposal schemas use `pattern` (the Ref regex);
- **13 of 22** use `anyOf`;
- none sets `maxItems`;
- new-entity ids such as `po_id`, `dispute_id` and `price_id` are required fields.

T-080 therefore generates a **model-facing schema** by a deterministic transform of the contract schema:
1. A Ref leaf becomes a `handle` string with no `pattern` and a description naming the handle grammar. It is validated in `before_tool_callback`.
2. A uuid id leaf for an existing entity becomes a `handle` that expands to the cell's literal value.
3. **New-entity id fields are removed** from the model schema. The tool layer mints them as deterministic UUIDv7s (§5.5).
4. `T | null` becomes nullable `T`; other `anyOf` unions are kept only if they survive lint, otherwise the tool is split.
5. Arrays get `maxItems`: the contract's own limit if it has one, otherwise 50.

**Lint** (the portable subset; transformed schemas only):
- object properties all listed in `required`;
- `additionalProperties: false`;
- string enums only;
- no `oneOf`, recursive `$ref` or `patternProperties`;
- depth ≤ 4;
- ≤ 30 properties per object.

Pydantic (intel) and zod (core) remain the authorities. Provider enforcement is an optimisation:
- OpenAI strict (Aug 2024) — UNVERIFIED;
- Gemini OpenAPI-subset declarations — UNVERIFIED; R6b's two Gemini claims were refuted 0-3, which means unverified, not false;
- OpenRouter enforcement "varies by provider", with `require_parameters` (R5, FACT);
- ADK `OpenAILlm` always sends `strict: True` (R5, INFERENCE).

**No per-provider emitters** (review m4, cut): ADK converts the schemas.

### 5.3 Validation and retry policy

| Failure | Response to the model | Retries |
|---|---|---|
| Arguments fail Pydantic | actionable error (≤ 300 chars): JSON path, expected form, a valid example handle; tool not executed | 1; then the tool is disabled for the run |
| Unknown handle | "S7 does not exist in this run. Minted: S1–S4." | 1 |
| Row or column out of range | "S2 has rows r0–r6, columns {…}." | 1 |
| core 422 / `reason_code` | a fixed English hint per `ReasonCode`, never the raw body | 1 (04 §4); then `abstain` with that code |
| core 409 (idempotent replay) or open-duplicate merge | "Already recorded as P1." | 0 (counts as success) |
| `recently_rejected` | "A person rejected this proposal within 30 days." | 0; abstain |
| Tainted run calls `propose_*` / `request_quotes` | "Drafts are unavailable after reading untrusted text in this run." | 0 |
| 5xx / network | — | 2, with backoff 0.5 s then 2 s, same idempotency key |
| Model error or budget | — | 1 → cheaper role → template (03 §9) |
| Grammar failure in `submit_answer` / `report` | segment index and rule | 1; then abstain `number_grammar` |

### 5.4 Caps and pagination

- **Snapshot digest:** `{handle, template_id, row_count, columns, rows[0..49], truncated, next_page}`, at most 2,000 tokens.
  - Each cell is shown with its typed value plus its handle path.
  - `page=n` re-reads the **stored** snapshot (no new mint), up to the 500-row cap.
- **Other caps:** search ≤ 8 hits of ≤ 300 chars; graph ≤ 50 nodes; forecast ≤ 50 rows per page.
- Past 3 pages, the model is told to narrow its parameters instead.
- The 25k figure in R6b is one vendor's default, not a threshold.

### 5.5 Idempotency and suppression (review M6, m7)

**Deterministic ids:**
- `draft_id = UUIDv7(ts = run start, rand = sha256(run_id ‖ proposal_fingerprint))` for asks. A retry or replay of the same proposal in the same run reuses the id.
- New-entity ids inside the payload (`po_id`, …) use `sha256(draft_id ‖ json_pointer)`.
- Watcher drafts use `(dedupe_key, fingerprint)`.
- Investigations create **no** drafts (§7), so there is no investigation-resume id problem.

**Fingerprint.** Core computes `command_type` + target ids + the template id and params of each `based_on` cell.

**Core at `POST /internal/intel/v1/drafts`:**
- same id + same body hash → original response;
- same id + different body → 409;
- an **open** draft with the same fingerprint → returns its id (status `proposed`, no contract change);
- a **rejected** draft with the same fingerprint within 30 days → `status: abstained, reason_code: recently_rejected` (new append-only reason code; §14).

The suppression check runs in core, not through an `intel_ro` view (review m7). It reads the verdict only, never the reason text.

Findings merge on `dedupe_key`, as today.

### 5.6 No `tenant_id`

- Tools close over `RunContext`.
- The T-041 schema scan is extended to every generated tool and also refuses `run_id` and `actor`.
- `outlet_id` parameters are intersected with the token's scope by core (R40 C4).

### 5.7 Cite or abstain, the grammar, refs and handles (review m5, m6)

**One per-run handle table** lives in the shared `RunState`, with one counter for the orchestrator and all its branches, so no textual re-basing is needed:
- `S<n>` is a snapshot; `S<n>.r<i>.<col>` is a cell;
- `D<n>` is a doc, chunk or claim;
- `F<n>` is a finding; `P<n>` is a draft.

**Expansion.** In prose the model writes `{S2.r3.unit_price_minor}`; payload leaves hold bare handles. Before any POST the tool layer expands each to canonical `⟨snap:<uuid>·3·unit_price_minor⟩` / `⟨cite:…⟩`. An uuid-typed cell used as an id expands to its literal value, so **the model never types a UUID** (INFERENCE: this removes the most error-prone copy task). An unresolved handle is left in place; it contains digits, so the `\p{N}` grammar rejects it → "cannot verify".

**Core receives only canonical refs,** and its validator decides (R25).

**Deterministic code** (`DraftMapping`, detectors, narration inputs) holds the snapshot ids and emits **canonical refs directly**. It does not depend on T-082's handle layer.

Quotations are rendered from source spans; the model never types one.

---

## 6 · Context engineering per run

Karpathy (June 2025, UNVERIFIED): "the delicate art and science of filling the context window with just the right information for the next step". Anthropic (Sep 2025): context is a finite attention budget (R6a, FACT, directional).

### 6.1 Assembly order

The tenant-invariant prefix comes first, for implicit caching (04 §10; cache behaviour UNVERIFIED per provider).

| # | Block | Source | Varies by | Tokens |
|---|---|---|---|---|
| 1 | Core system: role, the One Guarantee as output rules, handle grammar, cite-or-abstain | `intel/prompts/core.md` (pinned) | nothing | ≤ 1,200 |
| 2 | Output contract (`BranchReport` / `AnswerEnvelope`, refusal codes) | generated | skill set | ≤ 500 |
| 3 | Skill instructions (≤ 2) | SkillSpec, ≤ 1.5k each | skill set | ≤ 3,000 |
| 4 | Tool declarations | generated | skill set | ≤ 3,000 |
| 5 | Run frame:<ul><li>outlet names and kinds in scope;</li><li>business date in each outlet's tz;</li><li>country pack code and version;</li><li>currency label;</li><li>trigger.</li></ul> | `GET /internal/intel/v1/run-frame` (§14 C7) | tenant / run | ≤ 600 |
| 6 | Investigation excerpt: playbook, checklist with statuses and canonical refs, last 2 **untainted** step summaries | `intel_ro.investigation_current` | investigation | ≤ 1,500 |
| 7 | Episodic hints: ≤ 10 open findings in scope (type, severity, impact ref, age; no prose) | `intel_ro.finding_recent` | tenant | ≤ 1,000 |
| 8 | Evidence: tool results as digests | snapshots | run | the remainder up to the per-call cap |
| 9 | The question or branch brief | member / orchestrator | run | ≤ 500 |

**Per-call caps:** orchestrator ≤ 24k, branch ≤ 16k, DM ≤ 2k, narrate ≤ 8k. Tokens are counted with the provider tokenizer when available, otherwise as chars ÷ 3.5 (conservative, INFERENCE).

**Shared-prefix rule** (review m8). ADK prepends `You are an agent. Your internal name is "{name}".` to the system instruction (FACT, `flows/llm_flows/prompt/_identity.py:41`). So:
- every orchestrator is named the constant **`munim`** and every branch **`munim_branch`**;
- the pack goes in the trace actor label, never in the agent name;
- the prefix gate inspects the real `LlmRequest`.

### 6.2 Compaction

Compaction is deterministic; no LLM summarises in v1.

At 70% of the per-call cap, tool results older than the last 2 model turns are replaced by a digest line:

`S3 = finance.settlement_vs_orders · 212 rows · cols … · key cells {S3.r211.short_minor}`

Handles stay resolvable, so nothing citable is lost. LLM summaries can drop or rewrite refs, which would break P2 (INFERENCE).

### 6.3 Clean-context, read-only branches (review M5, m6)

**Mechanism.** Each branch runs in its **own `Runner` with its own `InMemorySessionService` session**. It shares only:
- the per-run `RunState`: budget, taint flag, handle table, trace buffer;
- the plugin instance.

**Branch context:** a brief of at most 1k tokens (question, skill, allowed templates, date window, outlet labels) plus blocks 1–5. **No orchestrator turn enters a branch.**

**Branch tools:** read tools, `abstain` and `report` only. **No `propose_*`, `request_quotes`, `load_skill` or `fan_out`.**

**Branch output** is at most about 1.5k tokens (R6a "often 1,000–2,000"):

```
BranchReport{ skill, verdict: answered|supported|refuted|cannot_verify,
  segments[≤ 6 × ≤ 400 chars, handles], snapshot_handles[], reason_code?, tainted: bool }
```

**Why not ADK `ParallelAgent`** (FACT, installed `agents/parallel_agent.py:246–262`):
- it is deprecated "in favor of Workflow";
- "Workflow cannot yet be used as an LlmAgent sub-agent";
- "Session state is shared by every branch", and each branch "sees the events that led to the fan-out".

That contradicts clean context and also refutes 04 §2's ParallelAgent plan.

`AgentTool` runs its agent in a sub-`Runner` and inherits plugins (FACT, `tools/agent_tool.py:133–279`). It is a possible later alternative, but our `fan_out` tool keeps per-branch budgets and the concurrency explicit.

### 6.4 Untrusted text and taint (review B1, m14)

**Untrusted:**
- documents, chats, reviews;
- supplier A2A free text (dropped; quotes are structured fields);
- customer-entered text;
- members' free-text notes and reject reasons;
- wiki bodies derived from claims.

**Tenant-trusted:** member-entered names of items, ingredients, suppliers and outlets.

**Rules:**
1. Extraction and vision have **no tools** (rule 8).
2. Untrusted text enters an agent context only through `search` (and `wiki_read`, if bound), wrapped `<untrusted cite="D3">…</untrusted>`.
3. **Run-level taint.** `RunState.tainted` is a single flag per run, set by any `search`/`wiki` result in any context of the run. A branch's `BranchReport.tainted` ORs into the orchestrator's run state. Once tainted, `propose_*` and `request_quotes` are refused for the rest of the run; `submit_answer` is still allowed.
4. **No cross-run laundering.**
   - Persisted text that later runs re-read (investigation step summaries) carries `tainted`. The assembler **excludes** tainted summaries from block 6.
   - Investigation narration runs see only snapshot cells, so they are untainted by construction, and that is asserted.
   - Ask answers are **never** re-read into later contexts in v1.
5. **Traces never carry prose.** That covers `BranchReport` text, answer segments, the member's question and investigation questions. Traces carry ids and labels ≤ 200 chars only (03 §1.8).
6. Screening (`screen.untrusted`) is deferred (§13.3), so W3 relies on rules 1–4.

### 6.5 Skills loaded just in time (review cut: no `route.packs`)

**What a skill is:**

```
SkillSpec{pack, instructions_md (≤ 1.5k), read_templates[], draftables[], refusal_codes[], graph_templates[], shared_tools[]}
```

It lives in `munim_intel/skills/<pack>/skill.py` and is validated against `ontology.json`.

**Who loads skills** (R8 default):
- the orchestrator calls `load_skill`, or the intent rule applies;
- `draft_request` requires exactly one skill, and the orchestrator chooses it first;
- `route.intent` decides only the path, not the packs.

**How tools get bound.** A `PackToolset(BaseToolset)` returns the loaded skills' tools from `state["skills"]`. Toolsets are re-resolved on every model step (FACT, installed `flows/llm_flows/tools/_agent_tools.py` builds `llm_request` tools per step via `canonical_tools`, as the reviewer verified), so a mid-run load takes effect on the next call. T-082 gates this.

---

## 7 · Memory and long-horizon tasks (everything inside R25)

### 7.1 Three memories, all core-owned; intel only reads

| Memory | Holds | Store | Intel reads via | Intel writes via |
|---|---|---|---|---|
| Episodic | runs, traces, answers, findings, drafts, decisions, outcomes | `intel.run`, `intel.trace_event`, `intel.answer`, `intel.finding`, `core.draft`/`core.decision`, `intel.outcome` | `intel_ro.finding_recent`, `trace_recent` | existing internal routes |
| Semantic | entities, aliases, edges, claims, wiki | `intel.*` knowledge tables | `intel_ro.*`, the Graph port | knowledge batches (T-040b) |
| Procedural | skills, playbooks, prompts | **git**: `munim_intel/skills/**`, `packages/core-domain/investigations/**` | import | **never written by an agent** |

ADK `MemoryService` and `DatabaseSessionService` are not used (gotcha 25).

### 7.2 Investigations are core-owned, deterministic and resumable (review M3, M7, m10, m11)

Long-horizon state is a **core module** (`services/core-api/src/modules/investigations/**`) over two operational tables. Intel's only role is to narrate.

```
core.investigation(tenant_id, id, playbook_id, params jsonb (period_month, compare_month), outlet_scope text[],
  created_by → core.member, status ∈ {open, waiting, done, no_driver_found, cannot_verify, cancelled, exhausted},
  checklist jsonb [{item_id, status ∈ {pending, supported, refuted, cannot_verify}, frozen bool, snapshot_ids[]}],
  steps_done int, max_steps int (≤ 10), created_at, updated_at)            -- munim:operational
core.investigation_step(tenant_id, investigation_id, step_no ≥ 1 (gapless), member_id, run_id null, started_at,
  item_updates jsonb, summary_answer_id null → intel.answer, tainted bool)  -- munim:operational
intel_ro.investigation_current  -- view: owner munim_view_owner + owner assertion (as 0013) + GRANT SELECT to munim_intel_ro
```

**Playbooks are data** in `packages/core-domain/investigations/playbooks.ts`: framework-free, validated, and reviewed like code. Each item is:

```
{item_id, label_key, template_id, params_from, verdict: {column, row: "component=<name>", supported_if: "share_bp >= N", refuted_if: "share_bp < N"}, data_gate?: H0}
```

**Each step** runs on `POST /v1/investigations/{id}:continue` (member-triggered; F1):
1. Authorise. The member's current outlet scope must ⊇ the investigation's `outlet_scope`, otherwise 404 (gotcha 16). Template `min_role` is checked per item; an item the member may not see → `cannot_verify` for this step.
2. For every non-frozen item, core **mints the item's template as a member snapshot** (R40 C4, `minted_by_member_id`) in the member's **current** scope. Scope therefore cannot freeze at creation (review M7).
3. Core evaluates each item's verdict rule over its own snapshot. A `supported` item is **frozen**.
4. Core computes the status (§7.4) and writes the step row in one transaction.
5. Core mints a run token (trigger `ask`, actor = the member; **no trigger change**). It calls intel `/investigate:narrate`, which makes one L1 call over the step's snapshot cells only. The validated envelope is stored as `intel.answer` and linked as `summary_answer_id`, with `tainted = false`, asserted.
   - If intel is down or over budget, core stores a template summary (rule 11).

**Off-checklist follow-ups** ("why did paneer cost rise?") are ordinary asks with block 6 in context. Their answers are not re-read into later contexts (§6.4).

**Draft ids.** Investigations create **no drafts**. The report links existing open findings and drafts whose fingerprints match the supported items (core lookup).

**Cron auto-continue is deferred.** If it is ever adopted, it is a `core-worker` job (core territory) that intersects the stored scope with the creator's **current** membership at each step and cancels when that membership is gone (review M7).

### 7.3 `finance.margin_bridge`: a balanced decomposition

This is a new template, in M-C1a.

**Params:** `period_month`, `compare_month`. Outlet scope comes from the minter.

**Rows**, one per component, each with `prior_minor`, `current_minor`, `delta_minor` and `share_bp = delta / |margin_delta|`:
- `revenue_volume`
- `revenue_price`
- `deal_discount`
- `cogs_supplier_price`: Σ current qty × (current unit cost − prior unit cost), from `core.supplier_price`/`recipe_line`
- `cogs_volume_mix`
- `waste`
- `channel_fees`: commission + ad fees + short payouts
- `labour`
- `other`
- `unexplained`: margin_delta − Σ named components

There is also a Σ row `margin_delta_minor`, from `core.posting`/`journal_entry` (the accounting identity).

**Balance check:** Σ of all component rows including `unexplained` = `margin_delta_minor`, an exact integer. It is asserted in the template gate and recomputed independently by the answer-key script (T-086).

`numeric_source` lists all sources per column (§2.4).

### 7.4 Stop condition: computed by core

| Status | Condition |
|---|---|
| `done` | H0 (data completeness: `finance.close_status` items `pos_days_closed`, `settlements_imported`, `bank_imported` for both months) is **supported**, **and** ≥ 1 driver item is supported, **and** \|`unexplained.share_bp`\| ≤ 2,000 (INFERENCE threshold, data in the playbook). Before `done`, core **re-mints every frozen item's template**; if any verdict flips, that item reopens and the investigation is not done (review m11). |
| `no_driver_found` | H0 supported; every driver item refuted, or the residual is above the threshold. This is reported honestly as "unexplained", with the residual cell. It is **not** the same as missing data (review m11). |
| `waiting` | H0 is `cannot_verify` (for example a missing payout cycle). It re-opens when the member continues after approving the import. |
| `cannot_verify` | Still `waiting` after `max_steps`, or the member stops. |
| `exhausted` | `steps_done = max_steps` in any other state. |
| `cancelled` | The member cancels. |

No model can set a status or a verdict (P10).

**Ranking.** Core ranks the contributors by `delta_minor` of the supported components; the ranking is deterministic.

### 7.5 Worked example: "Why did margin fall this month?"

**Playbook `margin_fall`:**

| Item | Verdict source (rule over the item's own snapshot) | Evidence templates for the narration | Plants (T-086) |
|---|---|---|---|
| H0 data complete (gate) | `finance.close_status`: all three items `done` | `finance.missing_payouts` | F7-style missing cycle |
| H1 supplier price | `margin_bridge` row `cogs_supplier_price`, `share_bp ≥ 1,000` | `purchasing.price_creep`, `catalogue.cost_drift` | C1 (paneer +22%), I1 (key) |
| H2 waste | row `waste`, ≥ 1,000 | `inventory.waste_week`, `catalogue.dish_margin` | C2, I6 |
| H3 deals | row `deal_discount`, ≥ 1,000 | `catalogue.deal_cost` | C3 |
| H4 channel fees | row `channel_fees`, ≥ 1,000 | `finance.settlement_vs_orders`, `unapproved_deductions` | F1–F3 (key) |
| H5 labour | row `labour`, ≥ 1,000 | `people.labour_pct`, `overtime_drift` | P1 (key) |
| H6 volume/mix | rows `revenue_volume` + `cogs_volume_mix`, ≥ 1,000 | `catalogue.menu_matrix` | — |

**The sequence:**
- **Day 1.** H0 finds a missing Zomato cycle → `waiting`, with date refs. H1 and H3 are supported and frozen; the others are refuted or pending.
- **Day 2.** The owner approves the payout import (R28) and clicks Continue. H0 is now supported, H4 is evaluated, and the frozen items are re-minted.
- **Done.** The residual is ≤ 20%. Contributors are ranked by core. Narration runs once per step.
- **Drafts.** The report links the open findings and drafts from the watchers (price draft, `deal.end`). Nothing executes without approval.

---

## 8 · The decision surface (human verdicts, console + SDK)

This section covers **people's** verdicts on drafts. It is not the `DecisionModel` port. Routes follow our own `/v1/<noun>/{id}:<verb>` convention and mirror no vendor shape (hard rule 4).

| Need | Route | Status |
|---|---|---|
| Inbox | `GET /v1/inbox`; SSE `inbox:<tenant>` | contracts exist; T-040 serves |
| Draft detail: resolved refs beside the values, `based_on` with expected values, history, `unverified_refs` | `GET /v1/drafts/{id}` | built (T-008) |
| Approve / edit-approve | `POST /v1/drafts/{id}:approve` | built |
| Reject | `POST /v1/drafts/{id}:reject {reason, reason_code?}` | `reason_code` ∈ `{wrong_numbers, not_needed, already_done, bad_timing, other}`; new, additive (§14 C4) |
| Decided, stale and failed log | `GET /v1/drafts?status=decided\|stale\|failed` | exists |
| Draft lineage, up and down | `GET /v1/drafts/{id}/lineage` | new (T-084a) |
| Row lineage, via `core.audit_log` | `GET /v1/lineage?row=core.<table>:<id>` | new (T-084a); another scope → 404 |
| Action catalogue for forms and the SDK | `GET /v1/draftables` | new (T-084a), from `ontology.json` |
| Dismiss a finding | `POST /v1/findings/{id}:dismiss {reason_code}` | new (T-084a) |
| Investigations | `POST /v1/investigations {playbook_id, period_month, compare_month, outlet_ids}`, `GET /v1/investigations/{id}`, `POST …:continue`, `POST …:cancel` | new (T-084b / T-083) |
| Ask | `POST /v1/ask`. Progress streams on `trace:<run>`. **No token streaming before validation.** | T-053 |

All of these are added to contracts `ROUTES`, and `@munim/sdk` is regenerated (R43). T-084a also **mounts or deletes** the unmounted SDK operations (R3-m5).

---

## 9 · Evaluation

| Layer | What | When | Gate or measurement |
|---|---|---|---|
| End-state goldens | On the 4 worldgen worlds, assert:<ul><li>**findings**: type, `dedupe_key`, impact cell = answer-key `impact_minor`;</li><li>**drafts**: `command_type`, refs resolve to the cells named in pack §6, `based_on`;</li><li>**abstentions**: `reason_code`.</li></ul>Never transcripts (R6b tau-bench). | W3 | **Gate.** Deterministic paths give real gates. Agentic paths replay fixtures, so they gate plumbing and guarantees only. |
| N1 | ₹ found ÷ ₹ planted and false alarms. Expected values come from the **hand-kept answer keys** via a committed `answer-key/detector-map.json` (kind → detector id or `none`; T-086). | W3 / W5 | gate |
| Investigations | Bridge balance, item verdicts and status against the answer key | W3 | gate (deterministic) |
| Determinism | The same recorded run twice → byte-identical traces and envelopes | W3 | gate |
| Budgets | The plugin stops a run whose **fixture-reported usage** exceeds the cap at exactly the cap | W3 | gate |
| pass^k | k = 5 live trials on a 40-case subset; pass^1 and pass^5 per provider (R6b) | W5 / T-070 | measurement |
| Per-category tool calls | (1) template selection; (2) parameter filling; (3) handle selection; (4) abstain on missing data; (5) no tool when out of scope; (6) sequencing; (7) refusal when tainted. Never one unweighted average (R6b BFCL/Epoch). | W5 live; W3 harness | measurement + recorded plumbing gate |
| DM | accuracy + coverage at threshold per question and adapter (§4.5) | W5 live | measurement |
| Judges | prose readability, out of band only | W5 | never a gate (P12) |
| Provider comparison (R36) | gemini / openrouter / nvidia (openai skipped loudly): N1, N2, per-category accuracy, pass^5, ₹ per run, p50/p95, DM accuracy | W5 / T-070 | table |
| Injection | planted injections → 0 `propose_*` executions, in-run and cross-run; 0 tool calls from extraction | W3 | gate |

**Fixture discipline.** `make record` (live, with keys) refreshes fixtures; the diffs are reviewed like code. Gates never call live models (rule 17).

---

## 10 · Mapping to ADK 2.11

| Need | ADK primitive | Our interface | Note |
|---|---|---|---|
| Orchestrator, branches | `LlmAgent` built per request from SkillSpecs; constant names `munim` / `munim_branch`; never subclassed | `agents/build.py` | identity line (FACT `_identity.py:41`) |
| Run loop | `Runner` + `InMemorySessionService` per request **and per branch** | `runtime/runner.py` (T-041, FACT) | create the session first (gotcha 5; T-041 does) |
| Fan-out | `asyncio.gather` over branch Runners with semaphore 4; **not `ParallelAgent`** | `fanout/fan_out()` | FACT: `ParallelAgent` is deprecated and shares state (§6.3). With no `Event.branch`, the plugin sets `actor = "branch:<pack>"`. |
| Deterministic workflows | none: plain async Python (intel) or a core module (investigations) | `watch/`, `brief/`, `negotiate/`, `outcome/` | the ADK 2.0 Workflow graph (R6b) adds nothing where there is ≤ 1 LLM call |
| Custom agents | **none**. FACT: `class BaseAgent(BaseNode, abc.ABC)` (`agents/base_agent.py:99`); custom `_run_async_impl` is bypassed by the graph engine (R6b). | AST gate: 0 `BaseAgent` subclasses / 0 `_run_async_impl` + a boot test that each built agent emits ≥ 1 event | `RecordedLlm(BaseLlm)` and `MunimPlugin(BasePlugin)` are other bases; the fired tests cover them |
| Cross-cutting | one `MunimPlugin(BasePlugin)` covering **all 14 callbacks** (FACT, `plugins/base_plugin.py`) | below | exact names (gotcha 4) |
| Models | `Gemini` native; `OpenAILlm` → `MunimOpenAILlm` (strict flag, `require_parameters`); `RecordedLlm` | `llm/` (T-041 built the registry, FACT) | no LiteLLM; no `FallbackModel` |
| Final output | our `submit_answer` / `report` tools, not `output_schema` | `tools/answer.py` | uniform across providers |
| Suppliers | `a2a-sdk` client and server behind `SupplierPort` (deterministic on both ends) | `negotiate/` | `google-adk[a2a]` pulls `a2a-sdk[http-server]` (review m3): T-055 adds it and re-runs the litellm lock gate. Card URL public (gotcha 6). "Simulated supplier". |
| Skills | `PackToolset(BaseToolset)` + `load_skill`; not `SkillToolset` (experimental, R5) | `skills/` | per-step re-resolution (FACT, §6.5) |
| Memory, artifacts, eval | not used (R25; `[eval]` pulls LiteLLM, R5 FACT) | own pytest | — |
| DecisionModel | outside ADK | `decide/` | — |

**The 14 MunimPlugin callbacks** (FACT names):

| Callback | What it does |
|---|---|
| `on_user_message_callback` | trace `route` |
| `before_run_callback` | open the budget and attach the `RunState` |
| `on_event_callback` | actor labels |
| `after_run_callback` | flush traces |
| `before_agent_callback` / `after_agent_callback` | `subagent_start` / `subagent_end` |
| `before_model_callback` | per-call cap and call-count check; at the cap, a template-fallback response |
| `after_model_callback` | record spend from usage metadata; grammar pre-check |
| `on_model_error_callback` | §5.3 |
| `before_tool_callback` | Pydantic validation, handle expansion, taint check, tool caps |
| `after_tool_callback` | digest, register handles, set the taint flag, trace |
| `on_tool_error_callback` | §5.3 |
| `on_agent_error_callback` | trace `error` |
| `on_run_error_callback` | **flush traces** |

**Flushing on failure** (review m1). `after_run_callback` is skipped when the run errors (FACT, `runners.py` near line 1649: "Run after_run callbacks on successful completion or early exit", guarded by `run_error is None`). `on_run_error_callback` covers `Exception` only. So the trace buffer is also flushed in `run_agent`'s `finally` (T-041 `runner.py`), which covers cancellation. Any flush is idempotent by `seq`.

**Trace sequencing.** `intel.trace_seq_gapless()` plus the 500-event batch cap mean concurrent branches share one `TraceBuffer` per run. It assigns `seq` under an `asyncio.Lock`, flushes in order every 50 events, and caps each batch at 500.

**T-041 is frozen** as committed (7f6418a). Everything above lands in new tickets.

---

## 11 · Founder decisions (decided 11 Oct 2026 — ledger R45)

| # | Decision | **Decided** |
|---|---|---|
| F1 | How investigations continue | **Member-triggered `:continue`**, core-run playbook, deterministic verdicts, margin bridge. *Amended by F10 (modes).* |
| F2 | Decision-model provider and egress | **LLM-mimic on the existing `router` role only**, egress allow-list per question, no new processor. Jev/OpenAI Decisions = W5 bake-off (§13.3). |
| F3 | Tool cap per context | **≤ 20**; `propose_*` only on `draft_request`; read-only branches; T-070 measures. |
| F4 | Negotiation | **Hybrid: AI picks moves, rules bound them.** Rules: target/walk-away price, max rounds, allowed concessions. Each round the model makes a typed choice (accept / counter / walk away) from the rule-allowed set and writes the message; supplier replies → no-tools extractor → typed fields (run tainted); deterministic deal review; PO as a draft. Replaces the earlier "deterministic negotiator" text in §3, §5 and the T-055 row — the negotiation run proposes nothing itself; deterministic deal-review code emits the PO draft with canonical refs. |
| F5 | Fan-out | **≤ 4 read-only branches for `investigate`**; budgets from T-059; single-agent fallback. |
| F6 | Fine-tune Gemma | **After W5, for intent routing** (training + hosting money approved in principle; R36 amendment and `intel.model_decision` then). |
| F7 | Graph store | **Postgres edges only now**; FalkorDB later behind the port. |
| F8 | What a specialist is | **8 named specialists as domain team members** (one per pack: Menu & Pricing, Kitchen, Inventory & Purchasing, Finance, People, Customers & Growth, Compliance & Assets, Market & Strategy; Forecast shared; orchestrator = Manager). Each owns its fixed-path workflows (code), its skill, an identity + track record, and its evals; fan-out branches are specialists acting read-only; every trace/finding/draft carries its specialist as actor. Not 8 always-on LLM agents; not ADK workflow-agent subclasses. |
| F9 | How people talk to specialists | **Mix:** one main conversation (ask anyone or `@Specialist`; Manager routes; answer signed "<Specialist> · via Manager") **plus** a per-specialist thread and desk page (findings, drafts, track record, direct conversation). Same validated answer path for both; thread context = rolling cited summary + last turns. |
| F10 | Investigation modes (amends F1) | **Step** (default) · **Plan** (approve the plan once, runs all steps) · **Auto** (Plan + resumes on new data within a spend cap). All modes: read-only steps, stop at draft/abstain/budget/scope change, drafts always need approval, scope re-checked each step. Owner sets the highest mode per role and the monthly AI cap. Auto (core-worker scheduling) built after Step and Plan. |

The options considered, with author and reviewer recommendations, are preserved in git history (commit 8c14ab5).

## 12 · Revised W3 ticket plan (replaces T-040…T-059 and M-C)

**Legend:** U = unchanged · M = modified (ID kept) · N = new.

**Gate rules:**
- Every gate asserts a positive quantity and can fail.
- Expected counts come from an **independent, hand-kept source**, named in each gate: pack md tables, `MANIFEST.d`, `db/tests/manifest.ts`, the worldgen answer keys and `detector-map.json`, or hand-labelled lists.
- No gate compares an artifact with itself or with a fixture of its own output.
- All gates run in `recorded` mode; each is red-proven.

**Dependency H-1** (dated history via approved imports): **satisfied** (0018, commit 8088c47).

**Migrator queue** (serial; numbers assigned when each lands): M-C1a → M-C1b → M-C1c → M-C1d → M-C2.

### W3.0: start now

| ID | | What | Gate |
|---|---|---|---|
| T-041 | U (done, 7f6418a) | intel runtime, as committed | as BOARD |
| T-052 | U (done) | forecast engine | as BOARD |
| M-C1a | N (split of M-C) | Outlet-scoped RLS on outlet-data tables (R1-m9). `numeric_source` list form. Advisor `min_role` (W2-R8). Templates: catalogue (6) + finance (7, incl. `finance.pnl`) + **`finance.margin_bridge`**. | (1) Template ids = 14, from the pack md §3 tables + this ADR §7.3, parsed by a script.<br>(2) Each returns exactly its spec columns on `restaurant_group` and `store`.<br>(3) Numeric-source gate: 0 violations, including list elements; a planted intel column → red.<br>(4) Manager-scope: an outlet-A manager minting each outlet-scoped template sees ≥ 1 own row and 0 outlet-B rows; red with RLS dropped.<br>(5) margin_bridge: Σ rows = `margin_delta_minor` exactly on 2 worlds; a planted mis-sum → red. |
| T-040 | M | Internal API, W1 subset (`events:claim`, `watch:claim`, `snapshots`, `findings`, `drafts`, `answers`, `traces:batch`) + validator resolver + `/v1` read paths + **draft idempotency, open-duplicate merge, `recently_rejected` suppression** | As BOARD (free digit → abstained; bare-number draft 422 / refs 201; cross-tenant ref refused; 500-event batch gapless), plus:<br>• same id + same body → byte-identical response, different body → 409;<br>• open duplicate → existing id, 0 new rows;<br>• a rejected fingerprint within 30 days → `recently_rejected`, at 31 days → accepted. |
| T-080 | M (was N) | `make ontology` + model-facing schema transform + lint + freshness; **no per-provider emitters** | (1) Actions = count of `proposal.` lines in `MANIFEST.d` (22).<br>(2) Object tables and FKs = counts in `db/tests/manifest.ts` (hand-written).<br>(3) Functions = M-C1 parsed ids landed so far.<br>(4) 20/20 agent-exposed transformed schemas pass lint; a planted `oneOf` → red.<br>(5) New-entity id fields absent from the model schemas (count = id fields named "new" in pack §6, hand list).<br>(6) Freshness: an edited migration or contract without regeneration → red.<br>(7) A renamed Pydantic class leaves the tool names unchanged. |

### W3.1

| ID | | What | Gate |
|---|---|---|---|
| M-C1b | N | Templates: inventory_purchasing (10 new) + kitchen (5) + forecast (5) | as M-C1a (1)–(4), counts from the pack md |
| T-040b | N (review M8) | Restored orphan routes:<ul><li>`forecasts:batch`, `quotes:batch`;</li><li>knowledge batches (claims/entities/aliases/edges/chunks/embeddings/wiki);</li><li>`spend`;</li><li>**`GET model-roles`** (T-041 already calls it);</li><li>**`GET run-frame`** (outlets, kinds, tz, business dates, pack code/version, currency, **budget soft/hard left**).</li></ul>Contracts + SDK. | (1) 500 claims → 500 rows; a quote mismatch → MB012 refused.<br>(2) model-roles returns 6 rows = the `platform.model_role` seed list in 0015 (hand count).<br>(3) run-frame for a manager scoped to 1 of 3 outlets lists exactly 1 outlet.<br>(4) Budget left after 3 recorded spends = seed − Σ (hand values).<br>(5) Every new route is in the OpenAPI (route-table diff). |
| T-042 | M | `MunimPlugin`: 14 callbacks, per-run `RunState` (budget, taint, handle table, `TraceBuffer`), flush in `on_run_error` + `finally` | (1) Each of 14 callbacks fires ≥ 1 across the scripted run + 3 planted-error runs (misspelt → 0 → red).<br>(2) A planted model exception → traces flushed (rows ≥ 1); red without the error-path flush.<br>(3) A fixture whose reported usage exceeds the cap stops at exactly the cap and returns the template fallback.<br>(4) Invalid args → 1 actionable error + 1 retry = 2 `tool_call` traces.<br>(5) Search then propose in one run → propose refused (1), 0 drafts; without search → accepted (1).<br>(6) 4 concurrent branches × 60 events → seq 1..240 gapless. |
| T-081 | N (narrowed) | `DecisionModel` port + `RecordedDecision` + `LlmMimic` + egress allow-lists; questions `route.intent`, `map.columns` | (1) A planted out-of-enum answer → `decision_invalid` → fallback, 1/1.<br>(2) Probabilities sum to 10,000 ±1 on every recorded result with probabilities.<br>(3) A planted non-allow-listed field (a tenant UUID; a sample cell) → refused before network, 2/2; the allow-listed request carries exactly the listed fields.<br>(4) No logprobs → band `low` → fallback path taken (1). |
| T-043 | M | Watcher pipeline as intel code: `DetectorSpec` (threshold fn reading pack `detectors.<id>`), `DraftMapping` (**canonical refs**), template narration, model narration ≥ high, `confidence_bp` from coverage cells | As BOARD (3 deliveries → 1 finding; just below → 0; just above → 1), plus:<br>• 0 LLM calls with narration off (call counter);<br>• `confidence_bp` = the coverage cell value named in the pack (hand list). |
| T-086 | N (review M4) | **Worldgen plants:**<ul><li>add the missing pack §10 plants: catalogue C1–C3, C5–C6; kitchen K1, K4–K6; market M1–M4; forecast FC2/FC2b/FC4; people P2; customers G1–G3, G5–G6; finance F5–F8; compliance A4, A7;</li><li>`margin_fall` month pairs with hand-computed bridge components;</li><li>`answer-key/detector-map.json` (answer-key kind → detector id or `none`).</li></ul>Via the API and approved imports only. | (1) The new plants per world equal the list above (hand list), each ₹ recomputed by the independent verify script = key.<br>(2) Bridge components and residual in the key = the verify script's recomputation.<br>(3) Every answer-key kind maps to a detector or to `none` with a reason (0 unmapped).<br>(4) Worldgen determinism and no-SQL gates stay green. |

### W3.2

| ID | | What | Gate |
|---|---|---|---|
| M-C1c | N | Templates: people (6) + customers (7) | as M-C1a (1)–(4) |
| M-C1d | N | Templates: compliance (5) + market (6) + the non-pack deferred list (committed `M-C-extra.txt`) | as M-C1a (1)–(4) |
| M-C2 | N | `core.investigation`, `core.investigation_step` (operational, gapless) + `intel_ro.investigation_current` (owner `munim_view_owner` + assertion + grants) + munim_svc INSERT on step summaries | (1) Isolation expected set grows by 2 (`db/tests/manifest.ts` updated by hand).<br>(2) Both tables tagged operational (tag gate).<br>(3) A step gap is refused and a consecutive step accepted.<br>(4) View owner = `munim_view_owner` (red when altered).<br>(5) intel-cannot-write N+1/N+1 (manifest count). |
| T-044…T-051 | M | **Packs as data + skills:** detectors, draft mappings, SkillSpec, eval cases. No per-pack agent code. T-044 catalogue, T-045 kitchen and T-051 market depend on T-086. | Per pack:<br>• every answer-key problem mapped to that pack's detectors (`detector-map.json`) is found, with impact cell = `impact_minor`;<br>• false alarms ≤ 2;<br>• ≥ 1 refusal case with its named `reason_code`;<br>• each draft-bearing plant yields a payload whose refs resolve to the pack §6 cells (count from pack §6);<br>• SkillSpec valid and ≤ 20 tools. |
| T-055 | M | suppliers-sim (`a2a-sdk` server, personalities as data) + deterministic negotiator + deal review + PO draft; adds `google-adk[a2a]` | As BOARD (3 RFQs + ≤ 2 counters traced; hidden clause refused 10/10; 1 PO draft with quote refs; every label "Simulated supplier"), plus:<br>• 0 LLM calls (counter);<br>• lock gate still red with planted `litellm`, green without. |
| T-056 | M | Ingestion: quarantined extractor and vision; `map.columns` via T-081 (headers only); exact-alias entity linking (no DM) | As BOARD (extractor tool count 0; claim quotes are source substrings 100%; injection fixtures → 0 tool calls), plus:<br>• a mapping draft with arithmetic → refused;<br>• the `map.columns` request body contains 0 cell values (planted sample → refused). |
| T-058 | U | Graph port + Postgres adapter + projector + 5 templates; FalkorDB behind the contract suite (F7) | as BOARD |
| T-084a | N (split) | Lineage routes, `/v1/draftables`, `findings:dismiss`, reject `reason_code`; mount or delete the unmounted SDK operations (R3-m5) | (1) Lineage of a price row changed by an approved draft returns the 6-hop chain (row → audit → decision → draft → finding → run).<br>(2) Rejected, stale and failed planted drafts (3) each appear with reason / changes / sqlstate.<br>(3) `/v1/draftables` length = count of `proposal.` lines in `MANIFEST.d`.<br>(4) Another outlet's row → 404.<br>(5) Every mounted `/v1` route has an OpenAPI operation. |

### W3.3

| ID | | What | Gate |
|---|---|---|---|
| T-083 | M (now core) | `modules/investigations` (core-api) + `core-domain/investigations/playbooks.ts` (`margin_fall`) + intel `/investigate:narrate` (L1) | On `restaurant_group` with the T-086 plants:<br>(1) Bridge Σ = margin delta = key.<br>(2) Supported items = the key's list.<br>(3) A missing settlement → H0 `cannot_verify`, status `waiting`; approve the import + `:continue` → H0 supported.<br>(4) A planted flip of a frozen item at final re-mint → reopened, not `done`.<br>(5) A member scoped to outlet 1 opening an all-outlet investigation → 404.<br>(6) Narration run tool count = 0, and its step `tainted` = false.<br>(7) Intel down → template summary, status still computed. |
| T-084b | N (split) | Investigation routes + SDK + SSE on the existing topics | `:continue` twice concurrently → 1 step (gapless); `:cancel` → `cancelled`, then `:continue` → 409 |
| T-082a | N (split) | Context assembler + `RunState` handle table (shared counter) + handle expansion + SkillSpec loader + `PackToolset` | (1) Every assembled call ≤ its per-call cap on the hand-labelled question list.<br>(2) Two tenants, same question → the real `LlmRequest` system instruction is byte-identical through block 4 (constant agent name).<br>(3) A planted unexpanded handle → "cannot verify".<br>(4) A second `load_skill` exceeding 20 tools → refused.<br>(5) A tainted step summary in block 6 → 0 bytes of it in the assembled context; untainted → present. |
| T-082b | N (split) | Single-agent ask end to end: `route.intent` → path table; `draft_request` binding rule; `submit_answer` | (1) For each `route.intent` value (6), the chosen path = a hand-written path table (independent of fixtures).<br>(2) `propose_*` bound only on `draft_request` with 1 skill (tool list inspected), 0 otherwise.<br>(3) `certification_request` → `not_a_certificate`, with 0 LLM calls. |
| T-054 | M | Brief + ranking (deterministic) + ≤ 1 narration call | As BOARD (top 5 = answer-key ranking; 0 duplicate dedupe keys), plus:<br>• ≤ 1 model call (counter);<br>• the hard-cap fallback passes the validator. |
| T-057 | U | Wiki compiler | as BOARD |

### W3.4

| ID | | What | Gate |
|---|---|---|---|
| T-053 | M | Fan-out (F5): `fan_out` with ≤ 4 read-only branch Runners, `BranchReport{tainted}`, merge in `submit_answer` | As BOARD (20 recorded questions → committed classifications incl. 4 abstentions — the classifications are the hand-labelled list; ≥ 3 parallel branches traced), plus:<br>• each branch's first `LlmRequest` contains 0 orchestrator events and ≤ 16k tokens;<br>• branch tool lists contain 0 `propose_*`;<br>• a branch that reads a planted injection → orchestrator `RunState.tainted` = true (red when `BranchReport.tainted` propagation is removed);<br>• run totals within the §3.4 caps on fixture-reported usage. |
| T-085 | N | W3 eval harness: end-state goldens over 4 worlds, per-category recorded plumbing table | `make eval-w3` prints N1 per world and pack, against answer-key ratios. A threshold set above the **answer-key ratio** (or a PDR §6 target) → red. A transcript-only assertion in a golden file → lint red. |
| T-059 | M | Live smoke + DM mimic probe + **budget measurement** (tokens per call kind, cache-hit where reported) | Prints the provider × role matrix (ok / skipped / failed + latency) and a measured-tokens table per §3.4 row; skipped loudly without keys. The §3.4 caps are re-based from this table (orchestrator, before W4). |

**W5.** T-070 narrows to live measurements:
- provider comparison;
- pass^5;
- per-category accuracy, including the F3 tool-count sweep;
- DM accuracy and coverage;
- out-of-band judge reports;
- the forecast recompute spot-check.

---

## 13 · Risks, deliberate omissions, and deferred items

### 13.1 Risks

| Risk | Mitigation |
|---|---|
| Four M-C migrations are serial and gate every numeric tool | split per pack; packs consume templates as they land |
| T-086 plants are late, so pack and investigation gates can't pass | gates name the answer-key mapped set; missing plants are reported, never faked |
| ADK minor churn (R5: breaking notes 2.4–2.10); `ParallelAgent` already deprecated (FACT) | exact pin; narrow surface; 14 fired-callback tests; no `BaseAgent` subclasses |
| Strict-schema variance (Gemini / OpenRouter / NVIDIA) | transform + lint; Pydantic and zod are the authorities; live smoke per provider |
| The provisional budgets are wrong | per-call caps + call counts; re-based from the T-059 table; single-agent fallback (F5) |
| Recorded fixtures drift from live | plainly stated; quality is a live W5 measurement; reviewed `make record` diffs |
| A handle bug points at the wrong cell of the same tenant | core re-resolves and shows the value beside it; `based_on` re-check; handle-table unit tests; human verification beside values (P15) |
| Taint false negatives (a new untrusted source added without a taint flag) | taint is set by tool **kind** in `after_tool_callback`; the T-080 lint requires every read tool to declare `untrusted: bool`, and a missing declaration → red |
| Investigation rules mis-specify a driver | playbooks are data reviewed like code; the bridge balance check; the residual is shown honestly (`no_driver_found`) |
| Egress of tenant text to model providers | per-question allow-lists; no new processor without a founder decision (F2) |
| Injection via member free text | treated as untrusted; never in agent context (verdict and code only) |

### 13.2 Deliberately not done

- No auto-apply, no autonomy that grows with track record, no confidence-gated action (R16).
- No LLM-chosen numbers, refs, drafts, verdicts or completion in any deterministic path. No LLM negotiator. No LLM verifier or judge in gates.
- No generic `sql.query` / `draft.write` tool for models. No raw object reads by agents.
- No drafts proposed by branches, and none in tainted runs.
- No GraphRAG; no lineage through the graph; no Spanner.
- None of these ADK features: `MemoryService`, `DatabaseSessionService`, `SkillToolset`, `ParallelAgent`, `FallbackModel`, `[eval]`, custom `BaseAgent`.
- No agent-written procedural memory.
- No MCP server exposing the ontology (R43: SDK only).
- No token streaming of unvalidated answers.
- No live external feeds.
- No ask history re-read into later contexts.

### 13.3 Deferred to W5 / later (kept visible for the founder)

| Item | Why deferred | Entry criteria |
|---|---|---|
| **Jev adapter** (TypeSafe via OpenRouter; typed choice/score/yes-no with probabilities; R6c, secondary) | Post-cutoff, unverified; a new sub-processor (review M9) | Vendor-doc probe confirms the request shape and model id; founder egress decision (F2b); OpenRouter data-collection setting probed; `route.intent` only; beats the mimic on accuracy at equal coverage in the W5 bake-off. The adapter choice must come from `platform.model_role`, not from a model id in git (§14 L5). |
| **OpenAI Decisions adapter** (`/v1/decisions`, R6c) | No OpenAI key (rule 20) | A key is provisioned by the founder; same probe and bake-off |
| **Calibration maps, Brier, ECE, reliability tables** | Too few labels (review m12) | ≥ 200 labelled items per question (N2's 200 owner questions for `route.intent`) |
| **`route.packs` (predicate × 8) and facets** | R8 `load_skill` first (review cut) | Live per-category data shows `load_skill` choosing wrong skills > 10% of the time |
| **`screen.untrusted`** + an `intel.chunk` flag column + `chunk_search`/`claim_search` view changes | Egress of raw untrusted text; the taint rule is the real control (review cut, M9) | Runs on the `extract` role/provider only; migration rows in §14 C8 |
| **`link.entity` DM** | Personal data in names | Restricted to item/ingredient/supplier/outlet kinds; egress allow-list |
| **Fine-tuned Gemma** + `intel.model_decision` (raw probabilities) | Money; no labels yet (F6) | ≥ 2,000 labels per question and a measured gap; provider CHECK + R36 amendment |
| **Cron auto-continue** for investigations | Scope freezing and territory (review M7, m10) | `core-worker` job with per-step scope re-intersection and cancel-on-loss |
| **Per-provider schema emitters** | ADK converts schemas (review m4) | A measured provider failure the transform cannot fix |
| **Agentic investigation steps** (LLM chooses hypotheses) | Known path (review M3) | A playbook-less question class shows measured value in W5 |

---

## 14 · Deviation register, by the authority each change needs

| # | Location | Change | Evidence | Authority |
|---|---|---|---|---|
| L1 | R36 role list; `model_role` / `intel_spend.role` CHECKs | none in v1 (DM uses `router`); a `decide` role later would amend both | §4.1 | Ledger, only if chosen |
| L2 | R36 provider list; provider CHECKs | a self-hosted Gemma endpoint (F6 b/c only) | R6c | Founder (money) + ledger |
| L3 | R8 "one ADK agent loads the domain skills it needs" | kept: the model loads skills through `load_skill`; `route.intent` picks only the path; `draft_request` limits to 1 skill | review cut | none (within R8) |
| L4 | R7 / R22 "purchasing specialist negotiates" | a deterministic negotiator, triggered by the skill's `request_quotes`, over real A2A | F4 | **Ledger interpretation** (founder) |
| L5 | R36 "model ids and providers come from `platform.model_role`" | if Jev is adopted, adapter selection must not key on a model id committed in git: add a `platform.model_role.adapter` column (migration) or rule it an interpretation | review M9, m13 | Ledger interpretation or migration, at W5 adoption |
| C1 | 04 §1 `RunContext{budget_left_minor, model_roles, country_pack_ref}` vs T-041 (token claims only) | these come from `GET /internal/intel/v1/run-frame` + `GET model-roles`; the token is unchanged | review M8 | Contract change (additive) + plan-doc |
| C2 | Internal API | restored: `forecasts:batch`, `quotes:batch`, knowledge batches, `spend`; new: `GET model-roles`, `GET run-frame` (incl. budget), `investigations/{id}:summary` | review M8 | Contract change (additive) |
| C3 | `FindingsRequest.confidence_bp` ("model self-assessment") | deterministic, from the coverage cell; shown as a band | R6b judges; R40 C5 | Contract change (semantics) |
| C4 | `DraftsRejectV1` | optional `reason_code` enum | §8 | Contract change (additive) |
| C5 | `ReasonCode` | add `recently_rejected` (append-only list) | §5.5 | Contract change (additive) |
| C6 | `SnapshotColumn.numeric_source` + template-scan gate | `string \| string[]` | review m9 | Contract change + migration convention |
| C7 | Core draft insert | idempotent id, open-duplicate merge, rejected-fingerprint suppression **in core** (no `intel_ro` decision view) | review m7, M6 | Core behaviour (T-040) |
| C8 | `intel.chunk` + `chunk_search` / `claim_search` views | a flag column + view filter: **deferred** with screening | review m7 | Migration (when adopted) |
| C9 | `core.investigation`, `core.investigation_step`, `intel_ro.investigation_current`; 03 §1.3 munim_svc operational INSERT list (+ step summary link) | new operational tables + view | §7.2 | Migration (additive) + plan-doc |
| — | `RunTrigger` / `TRACE_KINDS` | **no change** (investigation narration uses `ask`; router decisions trace as `route`) | §7.2 | — |
| P1 | 04 §3 `sql.query`, `draft.write` as model tools | generated `read_<template>` / `propose_<command>` (internal routes unchanged) | R6a; R6b | Plan-doc (this ADR) |
| P2 | ADR-007 `ParallelAgent` + `SequentialAgent`; 04 §2 fan-out | a Runner per branch, read-only branches | FACT: `ParallelAgent` deprecated and shares state | ADR amendment (this ADR) |
| P3 | ADR-008 `RemoteA2aAgent` / `to_a2a` | `a2a-sdk` client and server behind `SupplierPort` | R5; review m3 | ADR amendment (this ADR) |
| P4 | 04 §2 "≤ 12 tools (FACT R3)" | relabelled a design choice; proposed ≤ 20 (F3) | R3: Shopify ~20 (FACT) | Plan-doc + founder (F3) |
| P5 | R6c candidate uses | DM not used for triage, severity, ranking, draft verification, reason codes or investigation verdicts | P12; packs ladder L | Plan-doc (research never overrides) |
| P6 | 04 §6 negotiator wording | deterministic (see L4) | F4 | Plan-doc, subject to L4 |
| P7 | BOARD W3 rows; W5 T-070 | replaced by §12; part of eval moved to T-085 | — | Board edit |
| P8 | 04 §5 brief / §8 entity merges "proposed in the inbox" | entity linking is exact-alias in W3; the DM is deferred | §13.3 | Plan-doc |

---

## 15 · Changelog (review finding → change → where)

| Finding | Change | Where |
|---|---|---|
| **B1** taint laundering | Run-level `RunState.tainted`; `BranchReport.tainted` ORs into the orchestrator; branches have no `propose_*`; `propose_*` only on `draft_request`; persisted step summaries carry `tainted` and the assembler excludes tainted ones; ask answers are never re-read. Gates in T-042 (5), T-053, T-082a (5). | §0.3–4, §5.1, §6.3, §6.4, §7.2, §12 |
| **M1** budgets vs caps | Per-call caps × call counts; provisional Σ (ask 100k, branch 60k, fan-out run 340k); cached tokens reported separately; T-059 measures and re-bases | §3.4, §6.1, §12 T-059 |
| **M2** 12-tool cap and FACT label | Relabelled a design choice; ≤ 20 proposed; counts recomputed; facets withdrawn; founder decision F3 | §3.2, §5.1, §11 F3, §14 P4 |
| **M3** hollow completion | Investigations moved to a core module: playbooks as data; core mints and evaluates verdict rules; `finance.margin_bridge` with balance check and residual; `done` needs H0 + residual ≤ 20%; core ranks; LLM narrates only | §3.2 #14, §7.2–§7.5, §12 M-C1a, T-083 |
| **M4** absent plants | T-086 worldgen plants + `detector-map.json`; gates use answer keys; H-1 marked satisfied (0018 / 8088c47) | §3.2 plants column, §9, §12 |
| **M5** branches propose | Branches are read-only; orchestrator only, on `draft_request` | §5.1, §6.3, §12 T-053 |
| **M6** resume ids | Ids keyed on (run_id, fingerprint) and (dedupe_key, fingerprint); investigations create no drafts; the kill-mid-step gate is gone (deterministic core step, gapless + concurrency gate instead) | §5.5, §7.2, §12 T-084b |
| **M7** frozen scope | Member-triggered `:continue`; snapshots member-minted in the **current** scope; viewer scope ⊇ investigation scope or 404; cron deferred with a re-intersection rule | §7.2, §11 F1, §13.3 |
| **M8** orphaned routes | T-040b restores the batches/spend and adds `GET model-roles` + `GET run-frame` (budget); §14 C1/C2 | §6.1 block 5, §12, §14 |
| **M9** egress | Per-question egress allow-lists with a gate; screening cut; Jev deferred behind a probe, a founder egress decision and the OpenRouter data setting; §14 L5 | §4.3, §11 F2, §13.3, §14 |
| m1 flush on failure | Flush in `on_run_error_callback` + `run_agent` `finally`; all 14 callbacks gated | §10, §12 T-042 |
| m2 labels | `ParallelAgent` deprecated + shared state, per-step toolset resolution and `BaseAgent(BaseNode)` are now FACT with file/line cites | §6.3, §6.5, §10 |
| m3 A2A extra | T-055 adds `google-adk[a2a]` (`a2a-sdk[http-server]`) and re-runs the lock gate | §10, §12 T-055 |
| m4 emitters / lint | Per-provider emitters cut; a transforming emitter (Ref→handle, new-entity ids minted, `maxItems`, `anyOf` handling) before lint | §2.4, §5.2, §12 T-080 |
| m5 DraftMapping refs | Deterministic code emits canonical refs directly | §5.7, §12 T-043 |
| m6 handle table | One per-run table with a shared counter; no re-basing | §5.7, §6.3 |
| m7 schema work | Chunk flag deferred (§14 C8); rejected-fingerprint check in core (§14 C7) | §5.5, §13.3, §14 |
| m8 self-referential gates | T-080 counts from `MANIFEST.d` / `db/tests/manifest.ts`; T-085 vs answer-key ratios / PDR targets; cost gate on fixture-reported usage; T-082b vs a hand path table; prefix gate on the real `LlmRequest` with constant agent names | §6.1, §9, §12 |
| m9 `numeric_source` | List form, landed in M-C1a | §2.4, §14 C6 |
| m10 ticket size / territory | M-C1 split a–d; T-082 and T-084 split a/b; T-083 in core; cron (if any) in `core-worker` | §12, §7.2 |
| m11 investigation semantics | Frozen supported items; re-mint before `done`; `no_driver_found` ≠ `cannot_verify` | §7.2, §7.4 |
| m12 calibration statistics | Accuracy + coverage only until ≥ 200 labels | §4.5, §13.3 |
| m13 §14 classification | R7/R22 as a ledger interpretation (L4); rows added for run-frame, routes, chunk flag, decision suppression and Jev vs R36 | §14 |
| m14 prose in traces | Traces never carry branch text, answers or questions | §6.4 rule 5 |
| m15 intel-computed cells | Labels "forecast (computed)" and "Simulated supplier quote"; W5 forecast recompute spot-check | §2.4, §12 W5 |
| Cuts | screening, Jev/OpenAI adapters, calibration maps, per-provider emitters, cron, `route.packs` × 8 → all moved to §13.3 | §4, §13.3 |
| Founder questions 1–5 | Folded into F1–F5 with both recommendations (no disagreement); O-6/O-7 dropped as moot; O-1/O-5 merged | §11 |

---

### Critical files for implementation

- `/Users/satviksawhney/Downloads/projects_26/foodops-os/packages/contracts/src/internal/index.ts`: internal routes to restore and extend (T-040, T-040b).
- `/Users/satviksawhney/Downloads/projects_26/foodops-os/packages/contracts/src/shared/draftables.ts`: the Action registry behind the ontology and the transformed `propose_*` schemas.
- `/Users/satviksawhney/Downloads/projects_26/foodops-os/services/intel/munim_intel/runtime/runner.py`: where the per-run `RunState`, branch Runners and the `finally` flush attach.
- `/Users/satviksawhney/Downloads/projects_26/foodops-os/services/core-api/src/modules/approvals/decide.ts`: the approval path; the base for lineage and fingerprint suppression.
- `/Users/satviksawhney/Downloads/projects_26/foodops-os/tools/worldgen/answer-key/restaurant_group.json`: the independent source for the pack and investigation gates; T-086 extends it.
- `/Users/satviksawhney/Downloads/projects_26/foodops-os/.venv/lib/python3.12/site-packages/google/adk/agents/parallel_agent.py`: the FACT behind the fan-out decision.

**Read-only note.** This revision was written from repository and wheel reads only. Nothing was run and no file was modified.

**Not done in this pass:**
- `canonical_tools` per-step re-resolution is cited from the reviewer's verification plus the `_agent_tools.py` docstring; I did not trace the full call path myself.
- The answer-key kind → detector mapping is specified as a T-086 deliverable, not produced here.