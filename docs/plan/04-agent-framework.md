# 04 — Agent framework (Munim Intelligence)

**Purpose.** The shared runtime every domain pack is built on, so a pack is a module of instructions,
templates, detectors and schemas — not a new system. **Depends on:** ledger R6–R8, R15, R16, R22, R23,
R25–R29; `03-architecture.md` §1.6–§1.9; `02-schema.md` §3–§6. Per-pack specs (pass 2) add only what §9
lists. Revised 9 Oct after the pass-1 review. **Amended 11 Oct 2026 by ADR-014 and ledger R45 (F1–F10):** §1, §2, §3,
§5, §6, §7, §8 and §11 keep their previous text in "Superseded" blocks, each followed by why it changed and what the
change improves; §12 is new. Where this doc and ADR-014 differ, ADR-014 governs, except where the ledger's R45 addenda
F4/F8–F10 supersede ADR-014 passages (see its "Post-ratification notes"). History: `docs/plan/DECISION-EVOLUTION.md`.

---

## 1 · Run context (the tenant is never a model argument)

Every unit of intel work is a **run**, started by core-api, which mints a run token (03-arch §1.7):

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous text:
>
> ```
> RunContext{ run_id, tenant_id, outlet_scope[], actor ("watcher:<pack>" | "brief" | member id), trigger,
>             run_token, budget_left_minor, model_roles, country_pack_ref }
> ```

**Why it changed.** T-041 (7f6418a, frozen) builds `RunContext` from the verified token's claims only. The token never carried budget, model roles or the country pack, and the review found the routes that would supply them had been dropped from T-040 (review M8; ADR-014 §14 C1).

**What this improves.** One source of truth per field: tenant and scope come only from the signed token (unchanged security property), while budget, model roles and the pack come from core reads that are fresh per run, so a budget spent mid-day or a model-role change is seen by the next run instead of being frozen into a token. Testable: T-040b gates the run-frame against hand values.

```
RunContext{ run_id, tenant_id, outlet_scope[], actor ("watcher:<pack>" | "brief" | member id), trigger, run_token }
            -- token claims only (T-041, as built)
RunFrame  { outlets[{name, kind, tz, business_date}], pack{code, version}, currency, budget{soft_left, hard_left},
            thread?{summary_refs, last_turn_ids[≤3], tainted}, addressed_to? }
            -- GET /internal/intel/v1/run-frame (T-040b, T-088a)
model roles -- GET /internal/intel/v1/model-roles (T-040b)
```
- intel builds `RunContext` **only** from a run token verified with core's Ed25519 **public** key
  (CloudEvent `munimrun` extension, or the token on `/ask`, `/brief`, `/watch:sweep`). intel cannot mint
  tokens. For events the token is minted when core publishes; for sweeps and briefs by the `core-worker`
  `fanout` job, one per tenant.
- Tools close over the context. **No tool schema has a `tenant_id` parameter.** Every
  `/internal/intel/v1` call sends the run token; core-api takes tenant and outlet scope from it alone.
- The read-only connection (`munim_intel_ro`) runs `SET LOCAL app.tenant_id / app.outlet_ids` from the
  context per transaction.
- ADK sessions: `InMemorySessionService`, one per request (ADR-007). Nothing in intel writes Postgres.
- Model mode: `MUNIM_MODEL_MODE=recorded` (fixtures, all gates) or `live` (post-probe smoke only).

## 2 · Topology: Manager + specialist skills + read-only branches (R8, R45, ADR-007, ADR-014; was "router + skills + sub-agents")

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous text:
>
> ```
> root (router)
>  ├─ loads skills on demand: catalogue · kitchen · inventory_purchasing · finance · people ·
>  │                           customers · compliance · market     (+ forecast tool, not an agent)
>  ├─ deep question → ParallelAgent[ ≤4 <pack>_analyst ] → merge (SequentialAgent) → envelope
>  └─ negotiation  → purchasing_negotiator → suppliers-sim ×3 (A2A) → deal_review → PO draft
> ```
> - Default: one agent, skills loaded just-in-time (a skill load is a traced tool call); ≤ 12 tools in
>   context (`FACT` R3).
> - Fan-out: branches write `state["<pack>_result"]` via `output_key`; branches do not share state
>   (`FACT` R4 §C); the merge step follows links between findings.
> - The back office draws exactly the trace (§7).

**Why it changed.** (1) **`ParallelAgent` facts now come from the installed source, not from R4:** `google-adk==2.11.0` marks it `@deprecated` "in favor of Workflow" (`.venv/…/google/adk/agents/parallel_agent.py:246`) and its docstring says "Session state is shared by every branch" and that a branch "sees the events that led to the fan-out" (`:259–262`) — so "branches do not share state (`FACT` R4 §C)" above was **wrong**, and shared state would let a branch that read untrusted text launder it to the orchestrator (review B1). (2) **"≤ 12 tools in context (`FACT` R3)" was mislabelled:** R3 cites Shopify seeing degradation past about **20** tools (`FACT`, R3 §3); 12 was a design choice, and under it no two-skill pair fits (smallest pair = 18 tools; review M2). The founder chose ≤ 20 (F3), to be measured at 10/15/20 in T-070. (3) A separate `purchasing_negotiator` agent was replaced by the hybrid negotiation of F4 (§6). (4) Founder F8: the router is presented as the **Manager**, and each skill belongs to a named specialist.

**What this improves.** Safety: run-level taint and read-only branches close the laundering hole (gated in T-042 (5), T-053). Precision: each branch starts clean (≤ 1k brief + shared prefix). Cost: one agent by default; fan-out only on `investigate`, ≤ 4 branches, disabled at the soft cap. Testability: the tool cap is a stated design number with a W5 measurement instead of a mis-cited fact.

```
Manager  (one LlmAgent per request, ADK name `munim`; ADR-007, ADR-014 §3)
 ├─ route.intent (DecisionModel, router role) → path:
 │    lookup / explain / out_of_scope → load_skill (≤ 2 skills, ≤ 20 tools)
 │    @Specialist addressed            → that specialist's skill, forced (F9)
 │    draft_request                    → exactly 1 skill + its propose_* tools (untainted runs only)
 │    investigate                      → fan_out: ≤ 4 read-only branch Runners ("branch:<pack>") → BranchReports
 │    certification_request            → abstain not_a_certificate (no LLM)
 ├─ specialists' skills: Menu & Pricing · Kitchen · Inventory & Purchasing · Finance · People ·
 │                       Customers & Growth · Compliance & Assets · Market & Strategy   (+ forecast tool)
 └─ submit_answer → core validator → stream ("{Specialist} · via Manager" composed by core)
Deterministic paths (no agent): watchers, brief ranking, negotiation rules + deal review (§6), investigations (§12).
```
- Default: one agent, skills loaded just in time through `load_skill` / `PackToolset` (toolsets are re-resolved every
  model step — FACT, installed `flows/llm_flows/tools/_agent_tools.py`); **≤ 20 tools per context — a design choice
  (F3), not a FACT;** T-070 measures accuracy at 10/15/20.
- Fan-out (F5): `asyncio.gather` over ≤ 4 branch `Runner`s, each with its own `InMemorySessionService`; branches share
  only the per-run `RunState` (budget, taint flag, handle table, trace buffer); they hold read tools, `abstain` and
  `report` only. Not `ParallelAgent` (deprecated; shared state — above).
- Only the Manager proposes, only on `draft_request`, only in an untainted run (ADR-014 §0.3–0.4).
- The back office draws exactly the trace (§7).
## 3 · Tools (the only capabilities an agent has)

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous text:
>
> | Tool | Calls | Returns | Notes |
> |---|---|---|---|
> | `sql.query(template_id, params)` | `POST /internal/intel/v1/snapshots` | `{snapshot_id, columns, rows}` | **Only source of numbers.** Allow-listed templates per pack. |
> | `graph.query(template, args)` | Graph port | node/edge ids + labels | multi-hop only; no display numbers on edges |
> | `search(text, kinds[], k)` | `intel_ro.chunk_search` / `claim_search` | hits as `⟨cite⟩` refs | |
> | `wiki.read(page)` | `intel_ro.wiki_current` | body + refs | |
> | `forecast.get(…)` | snapshot template over `forecast_point` | snapshot | deterministic |
> | `finding.write(envelope, impact_ref, dedupe_key)` | `POST /internal/intel/v1/findings` | id or validation error | |
> | `draft.write(command_type, payload, evidence, based_on)` | `POST /internal/intel/v1/drafts` | id or validation error | every number in `payload` is a ref (R26); `based_on` lists the snapshot cells the proposal assumes |
> | `negotiate(rfq)` | suppliers-sim (A2A) via our wrapper; quotes stored via `quotes:batch` | quote snapshot | non-binding (R22) |
>
> Runtime calls that are not model tools: `events:claim`, `watch:claim`, `traces:batch`, `spend`.
> There is **no path that changes the books** except a person approving a draft (R15, R16, R25, ADR-013).

**Why it changed.** Generic `sql.query` and `draft.write` tools let a model pick any template or command type and type raw UUIDs; R6a (Palantir typed actions, FACT) and R6b (Anthropic tool design, FACT) favour one typed tool per action; proposal schemas need a transform before any provider's strict mode accepts them (22/22 use `pattern`, 13/22 `anyOf` — review m4). Findings are written by deterministic watcher code, not by a model tool. Negotiation became a workflow (§6).

**What this improves.** Precision: the model fills typed, flat parameters and writes handles (`S2.r3.col`) instead of UUIDs, which fail closed when wrong. Safety: there is no generic write tool; `propose_*` exists only on `draft_request` in untainted runs; new-entity ids are minted by the tool layer. Testability: tool schemas are generated from contracts and linted (T-080).

| Tool | Generated from / calls | Bound when |
|---|---|---|
| `read_<template>` | one per agent-exposed template; `POST /internal/intel/v1/snapshots`; returns a handle digest (≤ 2k tokens, 50 rows/page) | the specialist's skill is loaded (Manager) or briefed (branch) |
| `propose_<command>` | the draftable's proposal schema, transformed (ADR-014 §5.2); `POST /internal/intel/v1/drafts` | Manager only, `draft_request`, exactly 1 skill, run not tainted; 20 of 22 actions agent-exposed |
| `request_quotes` | starts the negotiation workflow (§6) | same rule as `propose_*`; non-binding (R22) |
| `forecast_points` | `forecast.points` template | kitchen, inventory_purchasing, people, market |
| `search` | `intel_ro.chunk_search` / `claim_search` → `⟨cite⟩` refs | customers, compliance, market — **taints the run** |
| `graph_<template>` | the 5 graph templates (Graph port, Postgres edges) | catalogue, inventory_purchasing |
| `load_skill` · `fan_out` · `abstain` · `report` / `submit_answer` | Manager control tools | per ADR-014 §5.1 |
## 4 · Output contract: cite or abstain

Every model output that reaches a person is an envelope (03-arch §1.7):
```json
{ "segments": [ { "text": "Paneer cost rose ⟨snap:S1·0·pct_change⟩ since ⟨snap:S1·0·from_date⟩ at ⟨snap:S1·0·outlet_name⟩ ⟨cite:row:core.supplier_price:…⟩.",
                  "refs": ["snap:S1", "row:core.supplier_price:…"] } ],
  "abstained": false }
```
**Validator** — syntax and grammar in `packages/core-domain/envelope` (framework-free, with a `RefResolver`
port); the DB-backed resolver and the authoritative check in core-api (T-007); intel calls core to
pre-check. Checks:
1. Every `⟨snap:ID·r·c⟩` resolves in-tenant; row and column exist.
2. **Number grammar** (03-arch §1.7): no `\p{Nd}`, number words (EN/HI list), magnitude suffixes or `%`
   outside refs. Dates are refs. Quotations are `⟨cite:doc|msg:…·start-end⟩` refs rendered from source.
3. Every `⟨cite⟩` resolves to an id in the tenant.
4. Every fact-bearing segment carries ≥ 1 ref.
5. Findings: `impact_ref` is a snapshot cell. Drafts: every numeric payload field is a ref; `based_on`
   cells exist.

Failure → intel may retry once with the error; then core-api stores `abstained = true, reason_code` and
composes "Cannot verify: …" from i18n. Abstention rate is tracked next to accuracy.

## 5 · Watchers, findings, the brief

- **Watcher = detector template + threshold**, per pack. On an event the detector watches, intel asks
  `watch:claim {pack}`; core says go only if the pack's `last_run_at` for the tenant is older than the
  window (15 min prod, 0 in tests) — leading edge — and the detector runs **inside the push request**.
  Every 15 min the `fanout` job calls `/watch:sweep` per tenant for trailing coverage.
- Only above-threshold results are narrated (template text with refs in W1; model narration later), at
  most 10 per tenant per day (R3 X1).

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous text:
>
> - **Finding** = envelope + `type`, `severity`, `impact_ref`, `confidence_bp`, `dedupe_key` (7-day merge).

**Why it changed.** `confidence_bp` was described as a model self-assessment; R6b (self-verdicts are unreliable, pilot) and R40 C5 (no intel-supplied value is a displayed number) rule that out (ADR-014 §14 C3). Findings now also carry their specialist (F8).

**What this improves.** Confidence becomes reproducible (a coverage cell from the same snapshot) and is shown only as a band, so no model opinion reaches a screen as a number; attribution lets each specialist's desk and track record count its own findings.

- **Finding** = envelope + `type`, `severity`, `impact_ref`, `confidence_bp` (**deterministic, from the pack's
  coverage cell; shown only as a band**), `dedupe_key` (7-day merge), and `pack` = its specialist (F8).
- Narration: template text always; model narration only for severity ≥ `high`, ≤ 10 per tenant per day. The brief is
  ranked deterministically with ≤ 1 narration call (T-054). Investigations are core-owned (§12).
- **Morning brief** = a run at close of business (batch model call) with a 06:00-outlet-time interactive
  fallback, triggered per tenant by the `fanout` job; ranked by impact × confidence × urgency with drafts attached.
  Rules-only fallback (budget cap or model error) uses templates that emit refs and pass the validator.

## 6 · Negotiation and deal review (R7, R22, R23, R45 F4)

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous text:
>
> 1. **Trigger:** forecast + stock position shows a shortfall, or a person asks.
> 2. **RFQ:** the same RFQ to the three simulated agents; ≤ 2 counter rounds; every message is an
>    `a2a_send/receive` trace; every quote is written to `intel.supplier_quote` via `quotes:batch` (marked
>    simulated). Model prose about quotes uses quote-snapshot refs only.
> 3. **Deal review** (deterministic checks, model narration second), in parallel: budget remaining, margin
>    floor after the new price, open commitments, payment terms. Each returns `pass | fail(reason_code, refs)
>    | cannot_verify(reason_code)`.
> 4. **Output:** one PO draft (`purchasing.po.create.v1`, quantities and prices as quote refs, `based_on` =
>    stock and budget cells) for the best passing deal; refused deals shown with reason and refs (the S1
>    refusal). If none passes, no draft — a finding explains why.
> 5. Every supplier name, card and screen carries "Simulated supplier".
>
> Personalities (data): `steady` (fair, firm), `discounter` (low first quote with a hidden minimum-order
> clause the review must catch), `premium` (higher price, better terms).

**Why it changed.** The original left open who chooses each move ("purchasing_negotiator" agent, §2). The ADR draft made it fully deterministic; the founder chose **hybrid** (F4: "a mix of both") — AI picks moves, rules bound them. A2A moved from ADK `RemoteA2aAgent`/`to_a2a` to plain `a2a-sdk` behind a `SupplierPort` (ADR-008 amended).

**What this improves.** The model contributes judgement (whether to push or accept) without being able to choose a price outside the rules or any number at all; a model outage or exhausted budget degrades to the pack's deterministic counter rule, so the demo path and gates stay reproducible; the PO still exists only as a draft emitted by deterministic review code.

1. **Trigger:** forecast + stock position shows a shortfall, or a person asks (`request_quotes`, §3). Owner: the
   Inventory & Purchasing specialist (F8).
2. **Rules (`NegotiationPolicy`, from the pack):** target and walk-away price, max rounds (2), allowed concessions.
   Each round they compute the **allowed move set** and a **default move** (counter = best rival, pack §6). Any price
   in a counter is set by the rule.
3. **Move (F4):** one L1 call on the `reason` role makes a **typed choice** — accept / counter / walk away — from the
   allowed set, re-validated in Python, and writes ≤ 2 sentences of message prose; prices in the message are rendered
   from the rule's values by code and the prose passes the number grammar. Out-of-set, error or budget → default.
4. **RFQ and replies:** the same RFQ to the three simulated agents over A2A (`a2a-sdk`, `SupplierPort`); every message
   is an `a2a_send/receive` trace (actor `specialist:inventory_purchasing`); replies are read by the **no-tools
   extractor** into typed quote fields (the run is tainted from then on); quotes are written via `quotes:batch`
   (marked simulated). Model prose about quotes uses quote-snapshot refs only.
5. **Deal review** (deterministic checks, model narration second): budget remaining, margin floor after the new
   price, open commitments, payment terms, minimum-order clauses. Each returns `pass | fail(reason_code, refs) |
   cannot_verify(reason_code)`.
6. **Output:** deal-review code emits one PO draft (`purchasing.po.create.v1`, quantities and prices as quote refs,
   `based_on` = stock and budget cells) for the best passing deal — never `propose_*`; refused deals shown with reason
   and refs (the S1 refusal). If none passes, no draft — a finding explains why.
7. Every supplier name, card and screen carries "Simulated supplier".

Personalities (data): `steady` (fair, firm), `discounter` (low first quote with a hidden minimum-order
clause the review must catch), `premium` (higher price, better terms).
## 7 · Trace events (the back office's only input)

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous text:
>
> - One ADK plugin implements `before_agent_callback`, `after_agent_callback`, `before_model_callback`,
>   `after_model_callback`, `before_tool_callback`, `after_tool_callback`, `on_event_callback` (exact
>   names — `FACT` R4 K14), each with a red-proven fired test.
> - `Event.branch` → `actor` for parallel lanes.
> - Flushed **synchronously** every 50 events and at run end, before the HTTP response returns.
> - Payloads: ids and short labels; never raw untrusted text.

**Why it changed.** The installed `BasePlugin` (ADK 2.11.0, `plugins/base_plugin.py`) has **14** callbacks, not 7 (FACT); `after_run_callback` is skipped when a run errors (FACT, `runners.py` ~1649), so traces were lost on failure (review m1). With no `ParallelAgent`, `Event.branch` is not set; actors come from our labels. Specialist identity (F8) needs a fixed actor vocabulary.

**What this improves.** No lost traces on failure (flush in `on_run_error_callback` and `finally`, idempotent by `seq`); every callback has a fired-test, so a misspelt hook cannot silently disable budgets or taint; the back office can draw each specialist's desk from the actor label alone.

- One `MunimPlugin(BasePlugin)` implements **all 14 callbacks** (exact names — gotcha 4; list in ADR-014 §10), each
  with a red-proven fired test (T-042).
- **Actor labels:** `manager`, `specialist:<pack>`, `branch:<pack>`, `watcher:<pack>`, `brief`.
- Flushed every 50 events, at run end, **and** in `on_run_error_callback` + the runner's `finally`, before the HTTP
  response returns; one `TraceBuffer` per run assigns gapless `seq` across concurrent branches.
- Payloads: ids and short labels (≤ 200 chars); **never** prose — no branch report text, answer segments, member
  questions or thread text (ADR-014 §6.4 rule 5).
## 8 · Ingestion and extraction (W2+; quarantined)

- Imports: the model proposes a column mapping **once per new file format** (renames + units, no
  arithmetic) as a draft; each import **run** is also a draft with a parsed preview (R28).
- Invoices: vision role → typed fields → a `supplier_invoice` draft whose numbers are document-span refs
  (crop shown beside each value).
- Documents and chats: chunk → embed (768-d) → claims by an extractor with **no tools** and a schema;
  every claim's quote is checked against the source at insert.

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous text:
>
> - Entity merges only above a confidence threshold; else proposed in the inbox.

**Why it changed.** A confidence-thresholded merge needs a decision model (`link.entity`) that would send personal names to a provider; it is deferred with entry criteria (ADR-014 §13.3, review M9).

**What this improves.** No personal data leaves for entity linking in W3; merges are exact and reproducible.

- Entity linking is **exact-alias only** in W3 (no decision model); anything else stays unlinked. Column mapping uses
  the `map.columns` decision question with **headers only** in its egress (T-081, T-056).
- Injection posture: no tools on extraction; plan before reading; Q&A has no outbound channel; drafts show
  full text, render no links or images, never auto-send.

## 9 · What a domain pack provides (pass-2 per-pack spec lists exactly these)

| Item | Example (finance) |
|---|---|
| Skill instructions (≤ 1.5k tokens) | when to reconcile, how to explain a break |
| Snapshot templates (routed to the migrator lane) | `finance.settlement_vs_orders(period, channel)` |
| Detectors (template + threshold) | `short_payout`: expected − paid above the pack threshold |
| Finding types + severities | `reconciliation_break.short_payout` |
| Draft command types | `finance.dispute.draft.v1`, `finance.journal.adjust.v1` |
| Graph scope | settlement / channel / order rollups |
| **Visible refusal** (CLAUDE.md) | P&L for an open period with missing settlements → `reason_code = settlements_missing` with date refs |
| Dashboard panel | breaks by channel (snapshot refs) |
| Eval cases | planted short payouts + unapproved ad fees with known ₹ |

## 10 · Models, cost and budgets

- Roles → models in `platform.model_role` (ADR-010), set by an approved config draft from the probe;
  never 2.5 (R4 K1).
- Every call records `intel_spend` via core; before each call the run checks the tenant budget. Soft cap
  → cheaper role → template text; hard cap → rules only.
- Tenant-invariant prompt prefix first, tenant data last (implicit caching, R3).

## 11 · Gates owned by the framework (red-proven; recorded model; each refusal paired with an accept)

| Gate | Positive expected quantity | Red-proof |
|---|---|---|
| Number grammar | 30 committed cases (ASCII, Devanagari and full-width digits, ½, ², Ⅻ, EN cardinals, Devanagari number words, `%`, typed quotation, typed date) → 30/30 rejected; 10 clean envelopes incl. false-positive controls ("Do you…", "quarter-end close", "first half") → 10/10 accepted | remove one rule → its case passes → red |
| Raw intel output validated | 50 recorded raw outputs (incl. planted bad ones from fixtures) → classifications match the committed expected list | flip a fixture → red |
| Draft numbers are refs | a draft with a bare number → refused; with refs → accepted, values shown beside | accept bare numbers → red |
| Stale drafts | `based_on` cell changed before approval → `stale`, 0 executions; unchanged → 1 execution | skip the re-check → red |
| Concurrent approval | approve + edit-approve at once → exactly 1 execution | drop the conditional update → red |
| Hooks fire | each of **14** callbacks ≥ 1 across the scripted run + 3 planted-error runs (T-042) | misspell one → red |
| Tenant binding | tool-schema scan finds 0 `tenant_id` params; a run token for A cannot mint a snapshot in B | add the param → scan = 1 → red |
| Event dedupe | 3 deliveries of one event → 1 claim, 1 finding | skip the claim → red |
| Quarantined extractor | extractor tool count = 0 | add a tool → red |
| Refusal per pack | each implemented pack: ≥ 1 eval whose expected output is an abstention with a named `reason_code` | remove the missing condition from the fixture world → expectation fails → red |

> **Superseded (11 Oct 2026, R45/ADR-014)** — previous "Hooks fire" row of the table above:
>
> | Hooks fire | each of 7 callbacks ≥ 1 on the scripted run | misspell one → red |

**Why it changed.** ADK 2.11 has 14 plugin callbacks (FACT, installed `plugins/base_plugin.py`), including the error callbacks that carry the failure-path flush.

**What this improves.** The failure path is gated too; a gate over 7 hooks would pass with the error flush missing.

## 12 · Specialists, conversations and investigation modes (new, 11 Oct 2026 — R45 F8, F9, F10)

**Why this section exists.** The founder decided after ADR-014's revision that the eight packs are presented and
owned as **named specialists** (F8), that people talk to them both through the Manager and directly (F9), and that
investigations run in three modes (F10). None of this adds an agent with its own write path or changes the One
Guarantee. **What it improves:** each pack has one accountable owner for its detectors, skill, evals and track record
(measurable per specialist in T-085/T-070); people can follow up with the specialist that raised a finding without
losing the cited context; long investigations stop needing a click per step where the owner allows it.

### 12.1 Specialists (F8)

| Specialist | Pack | Owns (fixed paths, in code) | Skill | Track record |
|---|---|---|---|---|
| Menu & Pricing | `catalogue` | margin/menu-matrix detectors, price/recipe/deal draft mappings | `skills/catalogue` | `intel.agent_track_record` (per specialist: proposed, approved, edited, rejected, stale, abstained — counts from `core.decision`/`core.draft` and abstain traces, R40 C5) |
| Kitchen | `kitchen` (restaurants only) | ticket-time, remake, prep detectors; prep-time/prep-list mappings | `skills/kitchen` | same |
| Inventory & Purchasing | `inventory_purchasing` | reorder, price creep, waste, expiry; negotiation rules + deal review (§6) | `skills/inventory_purchasing` | same |
| Finance | `finance` | payout breaks, unapproved fees, close status; margin bridge items of `margin_fall` | `skills/finance` | same |
| People | `people` | labour vs forecast, overtime | `skills/people` | same |
| Customers & Growth | `customers` | coupon leakage, churn | `skills/customers` | same |
| Compliance & Assets | `compliance` | licence expiries, missed logs | `skills/compliance` | same |
| Market & Strategy | `market` | weather/festival notes, viability | `skills/market` | same |

- **Forecast** is a shared deterministic service (T-052), not a specialist. **The Manager** (ADK name `munim`) routes,
  owns the final output, and is the only proposer (on `draft_request`).
- Specialists are **not** eight always-on LLM agents (rejected option B) and **not** ADK workflow-agent subclasses
  (rejected option C). The model runs only for narration and open questions (ADR-014 §0 lines 1–3).
- Registry: `packages/contracts/src/intel/specialists.ts` (T-087a). Attribution uses existing columns — `intel.finding.pack`,
  `core.draft.source = intel:<pack>`, trace actor labels (§7) — because pack and specialist are 1:1.
- Identity (name, role line, desk) is i18n copy; the desk page (`GET /v1/specialists/{id}`, T-087b) shows its findings,
  drafts, track record (snapshot refs only) and threads.

### 12.2 Conversations (F9)

- **Main conversation:** `POST /v1/ask {question, thread_id?}`. A leading `@Name` is parsed **by core** against the
  registry aliases (deterministic; an unknown name → `unknown_specialist`). The Manager runs the path in §2 with that
  specialist's skill forced; core composes the signature "{Specialist} · via Manager" from i18n.
- **Specialist threads and desks:** the same path with `thread_id`. There is no separate agent and no separate write path.
- **Bounded thread context** (block 6b of ADR-014 §6.1, ≤ 1.5k tokens): a **deterministic rolling summary** — the last
  ≤ 8 validated, cited segments of the thread's **untainted** turns with their refs (no LLM summariser; ADR-014 §6.2) —
  plus the last ≤ 3 turns. Older turns are never sent.
- **Taint carries across turns:** segments from a tainted turn **never enter the summary** (as ADR-014 §6.4 excludes
  tainted step summaries), and a tainted turn inside the last 3 marks the excerpt tainted; a run started from a tainted
  excerpt is tainted from its first step, so `propose_*` and `request_quotes` are refused (gated in T-082b (6),
  T-088a (4, 4b), T-088b (3, 5)). This narrows ADR-014 §6.4 rule 4 ("answers never re-read"), which F9 supersedes.
- Thread rows (`core.ai_thread`, `core.ai_thread_turn`) are **operational**; they are not `core.conversation` /
  `core.message` (ingested chats, untrusted).

### 12.3 Investigation modes (F10, amends F1)

| Mode | Who starts steps | Built in |
|---|---|---|
| **Step** (default) | the member, one `:continue` per step | T-083 |
| **Plan** | the member approves the plan once (checklist, specialists involved, estimated AI cost as a snapshot ref labelled "estimate (computed)"); core runs the steps back-to-back **inside that approving request** (≤ 10 steps, progress on SSE; the member's token supplies the scope) | T-089a |
| **Auto** | as Plan, and core-worker also resumes when new data lands (e.g. an approved import) within the monthly cap | T-089b (last; open item O-1 on unattended identity) |

In every mode: steps are read-only (snapshots + one narration call); the run stops at a linked draft, an abstain, the
budget, a scope change or `waiting` (`stop_reason`); **every draft still needs a named person's approval (R16)**; the
creator's scope is re-intersected with current membership each step (cancel when gone); verdicts and completion are
computed by core (ADR-014 §7.4).

**Who:** the owner sets the highest mode per role and the tenant's monthly AI cap (T-090; book rows written by the
owner's own command, R27/R29). Defaults: owner Auto, manager Plan, staff Step (ledger); advisor Step and judge Plan
(INFERENCE, open item O-3). The effective cap is min(owner cap, operator limit) pending the founder's ruling (O-2).
