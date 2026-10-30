# Decision evolution — how Munim's architecture changed, and why (9–11 Oct 2026)

One readable page, ordered by topic, covering every architecture decision that changed between the first plan (9 Oct)
and now (11 Oct, ledger R45 + addenda F8–F10). **This page is a map, not an authority:** the ledger
([`00-decision-ledger.md`](00-decision-ledger.md)) binds, ADRs and plan docs follow, and the build journal
([`../DECISIONS.md`](../DECISIONS.md)) is the audit trail. Superseded text is kept in place, in "Superseded" blocks, in
[`03-architecture.md`](03-architecture.md), [`04-agent-framework.md`](04-agent-framework.md),
[`adr/ADR-007.md`](adr/ADR-007.md) and [`adr/ADR-008.md`](adr/ADR-008.md), and in the ADR-014 "Post-ratification notes"
and the BOARD's collapsed old W3 rows.

**Entry format.**
- **Before → After**
- **Decided by:** the ledger or DECISIONS reference, and who decided.
- **Why**
- **What it improves**
- **Watch / next:** the measurement that would make us revisit it, or the next improvement.

`FACT` / `INFERENCE` labels follow CLAUDE.md conventions.

---

## A · Product and scope

### A1 · Cup-shaped build → standalone POS/ERP for individual outlets and small chains
- **Before → After:**
  - **Before:** go-to-market was restaurant groups of 2–5 outlets and cloud kitchens (R2). The build was shaped by the AI Builder Cup: no slice, waves to a freeze (R18); a Cloud Run deploy by 11–12 Oct (R19); GCP adapters only in the submitted repo (R9).
  - **After:** one standalone, provider- and DB-agnostic product for restaurants and shopkeepers, individual outlets and small chains, with the store pack first-class (R34). Cup and FalkorDB entries are parked, not repudiated (R37). CLAUDE.md hard rule 2 binds only a future Cup fork.
- **Decided by:** founder, 9 Oct 23:10. Ledger [R34](00-decision-ledger.md), [R37](00-decision-ledger.md); DECISIONS "Standalone reset ratified (R34–R39)".
- **Why:** the founder said "just focus on delivering a world class ai enable pos/erm … for the restaurant and shop keepers", and "no ai builder cup no fulkan db" for this build.
- **What it improves:**
  - No event deadlines or vendor locks distort the design.
  - Onboarding for a single owner becomes a first-class requirement.
  - Every external dependency sits behind a port.
- **Watch / next:** the fork is re-planned when the founder creates it. Re-snapshot the T&C before any event submission (gotcha 19).

### A2 · Simulated payment gateway → pay at the counter only, recorded
- **Before → After:** D-010's simulated gateway → cash, card and UPI *recorded*; no online payments; a payment port kept for later ([R4](00-decision-ledger.md)).
- **Decided by:** founder (D-016).
- **Why:** an online payment flow, even simulated, adds risk and implies real money handling (hard rule 5).
- **What it improves:** no card data is ever stored, and the tender rows are plain book rows.
- **Watch / next:** a real gateway is a founder money decision behind the existing port.

### A3 · Full developer platform (recommended) → SDK only
- **Before → After:** the full developer platform that was recommended (API keys, OAuth apps, signed webhooks) → the public `/v1` API plus `@munim/sdk` only ([R43](00-decision-ledger.md)).
- **Decided by:** founder, 10 Oct.
- **Why:** scope and time.
- **What it improves:** one typed client and no key lifecycle to secure now.
- **Watch / next:** T-076 must prove the example storefront uses only SDK imports. Revisit when a third party asks for webhooks.

### A4 · Country flip until the first posting → country fixed at onboarding
- **Before → After:** "flip until the first posted ledger entry" (R21, R24) → `country_code` and `base_currency` immutable once onboarding completes ([R30](00-decision-ledger.md)).
- **Decided by:** founder ("On boarding").
- **Why:** this is simpler than any lock trigger, and no stale-currency rows are possible.
- **What it improves:** one trigger and no partial-currency books.
- **Watch / next:** the demo shows IN vs AU by a fresh sign-up. A real migration between countries would be an export plus a new tenant, never a flip.

## B · Infrastructure and environments

### B1 · GCP-specific stack → DB- and provider-agnostic ports
- **Before → After:**
  - **Before:** Cloud SQL, Pub/Sub, Identity Platform, Spanner and Vertex Gemini in the Cup build, with Supabase in dev behind ports (R9, R10).
  - **After:** any Postgres with no vendor features, enforced by a static gate. Postgres edges for the graph. An in-process publisher plus a long-running `core-worker` (no Pub/Sub, no Cloud Scheduler). Supabase Auth/Storage behind ports. Hosting is chosen later ([R35](00-decision-ledger.md)).
- **Decided by:** founder ("any Postgres + graph as a port"; provider/DB agnosticism), 9 Oct.
- **Why:** the standalone product must not depend on one cloud. R4 K5 had also shown that Pub/Sub subscribers stall on request-billed Cloud Run.
- **What it improves:**
  - It runs on any Postgres.
  - Gates run without a cloud.
  - One fewer moving part (no Pub/Sub DLQ).
- **Watch / next:** the static Supabase-ism gate (R31) must stay red-proven. Plain-Postgres behaviour is verified on embedded PG 18 (B4).

### B2 · Pub/Sub + SSE → LISTEN/NOTIFY SSE (three id-only channels) → in-process publisher + worker sweeper
- **Before → After:**
  1. Pub/Sub + SSE (R9).
  2. SSE from LISTEN/NOTIFY, with Pub/Sub kept for core → intel ([R20](00-decision-ledger.md)).
  3. Three id-only channels, `munim_outbox`, `munim_trace` and `munim_inbox` ([R33](00-decision-ledger.md)).
  4. Core → intel became an HTTP push after commit, with a `core-worker` sweeper for stragglers ([R35](00-decision-ledger.md)).
- **Decided by:** founder (R20 recommended option; R33 ratification; R35).
- **Why:**
  - Subscribers stall when CPU is throttled between requests (R4 K5, FACT).
  - Traces and the inbox needed their own channels.
  - The standalone build drops Pub/Sub.
- **What it improves:**
  - Tenant data never rides in a notification: ids only, and SSE re-reads under RLS.
  - One delivery path, testable on embedded PG.
- **Watch / next:** if a deploy target throttles CPU, re-measure the sweeper lag (T-007 gate) before adding a queue.

### B3 · Separate supplier services → one service with three agents → local `a2a-sdk` service
- **Before → After:**
  1. Separate A2A services (R7).
  2. One service hosting three agents ([R23](00-decision-ledger.md)).
  3. One local process (R35), on plain `a2a-sdk` instead of ADK `to_a2a`/`RemoteA2aAgent` ([ADR-008 amended](adr/ADR-008.md); ADR-014 §10, §14 P3).
- **Decided by:** founder (R23); ADR-014 (ratified R45).
- **Why:**
  - Four services instead of six.
  - ADK's A2A wrappers are Experimental and turn each supplier into an agent loop on our side (R5).
- **What it improves:** fewer deployables, no ADK-internal coupling, and a deterministic default negotiator (E4).
- **Watch / next:** `google-adk[a2a]` pulls `a2a-sdk[http-server]`. The litellm lock gate must stay green after T-055a adds it.

### B4 · Supabase / Homebrew test DB → embedded Postgres 18 from npm
- **Before → After:** gates on the dev Supabase project or a local Postgres → `embedded-postgres` 18 started by the `@munim/db` harness. No Docker, brew or Supabase in any gate. The one vector migration is skipped loudly there.
- **Decided by:** orchestrator, reversible. DECISIONS "9 Oct 23:10 … test DB = embedded Postgres".
- **Why:** this took the founder's Supabase setup off the critical path for every gate, and adds a plain-Postgres check on top of Supabase.
- **What it improves:** every gate is reproducible offline, and the W1/W2 suites ran with it, about 1,326 tests.
- **Watch / next:**
  - Gotcha 33: the embedded-PG exit hook once turned a failing run into exit 0. Every new gate must red-prove a non-zero exit.
  - pgvector is gated only on Supabase.

### B5 · Deploy target 11–12 Oct → "when gcloud is set up" → parked
- **Before → After:**
  1. Wave-1 Cloud Run deploy 11–12 Oct ([R19](00-decision-ledger.md)).
  2. "First public URL as soon as gcloud is set up" ([R31](00-decision-ledger.md)).
  3. Parked with the Cup fork ([R37](00-decision-ledger.md)); "hosting is chosen later" (R35).
- **Decided by:** founder.
- **Why:** gcloud is not installed, and the standalone reset.
- **What it improves:** the build is no longer gated on cloud setup.
- **Watch / next:** the R32 connection budget (≈ 25 connections on `db-f1-micro`) must be re-checked when a host is chosen.

### B6 · ADK + LiteLLM for non-Gemini models → ADK 2.11 native adapters, no LiteLLM, provider per role
- **Before → After:**
  - **Before:** "ADK reaches other models via LiteLLM" (R3/R4; ADR-010).
  - **After:** `google-adk==2.11.0`. Gemini runs on the native class; OpenAI-compatible providers (OpenRouter, NVIDIA) run through `OpenAILlm`. LiteLLM is never installed, and a red-proven lock gate enforces that. The provider and model are chosen per role in `platform.model_role` ([R36](00-decision-ledger.md)).
- **Decided by:** founder, choosing ADK over Pydantic AI and an in-house loop, from [R5 research](../research/R5-agent-runtime.md).
- **Why:** R5 found ADK 2.10+ ships `OpenAILlm` (FACT), which makes LiteLLM unnecessary; the `[eval]`, `[extensions]`, `[all]` and `[test]` extras pull it in.
- **What it improves:** a smaller supply-chain surface, an operator-level provider switch, and a provider comparison in evals.
- **Watch / next:**
  - R36 lists `OPENAI_API_KEY` among the `.env` keys, but CLAUDE.md rule 20 says there is no OpenAI key, so OpenAI paths are skipped loudly.
  - Any OpenAI Decisions adapter waits for a key (E5).

## C · The One Guarantee and data integrity

### C1 · Agents write findings and drafts → intel has no DB write grant at all
- **Before → After:** "agents write only findings and drafts … the intel role has no write grant on the books" ([R8](00-decision-ledger.md)) → **no write grant on any table**. Every intel output goes through core-api's internal API. Core mints snapshots and validates every envelope, and numbers are rendered, never typed ([R25](00-decision-ledger.md)).
- **Decided by:** founder, who chose the strictest option over the recommended "who-mints-truth" design.
- **Why:** one choke point makes clause 2 mechanically checkable.
- **What it improves:** an intel compromise cannot write Postgres. The validator lives in one place, core.
- **Watch / next:** the cost was more internal endpoints. W3 restores the orphaned ones (T-040b, review M8). Ingestion latency is measured in T-056.

### C2 · Low-risk auto-apply → nothing auto-applies in v1
- **Before → After:** the CLAUDE.md product rule allowed low-risk auto-apply → every draft waits for a named person ([R16](00-decision-ledger.md)). F10's Auto *investigation* mode keeps this: steps are read-only, and drafts still need approval.
- **Decided by:** founder (OQ-A).
- **Why:** it is the simplest path to guarantee and aligns with R15.
- **What it improves:** one write path to test.
- **Watch / next:** per-category opt-in stays a roadmap item. Revisit only with measured approval rates per draft type (T-070 track records).

### C3 · Number rule as written → council rulings C1–C7
- **Before → After:** R26's "rows trace as themselves; snapshots for intel and aggregates" → [R40](00-decision-ledger.md) rulings. They cover:
  - preview writes nothing;
  - tenders store tendered and change;
  - loyalty `balance_after`;
  - badge = list length;
  - member-minted snapshots;
  - numbers about the AI come only from core-set columns (shown as bands);
  - order-status messages as derived book rows;
  - expired-stock refusal behind a pack flag.
- **Decided by:** a 3-agent council, majority with dissent recorded, 9 Oct.
- **Why:** D-2 screens surfaced cases R26 did not literally cover.
- **What it improves:**
  - Every screen number has a defined trace.
  - Specialist track records (F8) inherit C5: counts from `core.decision`, never `confidence_bp`.
- **Watch / next:** the Plan-mode "estimated AI cost" and the specialist track record are new numbers. Both are snapshot templates (M-C2, M-C3) and must pass the numeric-source gate.

### C4 · `origin` re-stamping: never → re-stamped on derivation UPDATEs → never (restored)
- **Before → After:**
  1. 10 Oct 03:40, orchestrator: `origin` is creation provenance and is never re-stamped; updates trace through `audit_log.decision_id` → `decision.decided_by`.
  2. ~13:45: gotcha 34 was "corrected" to say derivation UPDATEs re-stamp `origin`.
  3. W2 fix cycle 2: **0017 restores never-re-stamp** for every branch, including derivations.
- **Decided by:** orchestrator. DECISIONS "b-8 fix cycle closed; provenance rule for updates confirmed", "W2 paused by the founder", "W2 review + two fix cycles complete"; [CLAUDE.md gotcha 34](../../CLAUDE.md).
- **Why:** re-stamping lets a later actor overwrite who *created* a book row. A clause-1 scan that reads `origin` then misses UPDATEs. The W2 review (R1-M4) caught the drift.
- **What it improves:** creation provenance is immutable, and every later change is traced through the hash-chained audit log.
- **Watch / next:** the clause-1 scan's origin re-stamp plant (`redproof.sh`) must stay red-proven. M-C1d also binds a derivation's written row to its source (a W2 carry-over).

### C5 · Advisor read access to finance templates: decided in W2 → reverted → advisor rung in W3
- **Before → After:**
  1. W2-R8 gave advisors P&L/GST read.
  2. Reverted, because template `min_role` had no advisor rung (0003 CHECK).
  3. The rewritten W3 board puts an `advisor` rung in M-C1a.
- **Decided by:** orchestrator rulings (W2-FIX-LIST W2-R8; DECISIONS 13:45 and evening). Board rewrite, 11 Oct.
- **Why:** R27 makes advisors read-only finance users, but the role ladder could not express it.
- **What it improves:** advisors see the finance templates and nothing else, gated as a pair (advisor 201 / staff 403).
- **Watch / next:** if more roles need template-level reads, move `min_role` from a ladder to a role set.

### C6 · Backdated live commands (rejected) → dated history via approved imports
- **Before → After:** the proposal to let live commands (`orders.place.v1`, waste, refund, shift, count) accept a past time was rejected → dated synthetic history arrives **only** through approved import kinds. These keep their own business dates, take no live invoice or ticket numbers, respect closed periods, and are labelled synthetic ([R44b](00-decision-ledger.md); H-1, 0018, 8088c47).
- **Decided by:** founder, on the orchestrator's and advisor's recommendation.
- **Why:** backdating would break invoice and ticket sequencing, shift reconciliation and closed periods, and would let a cashier rewrite the past without an approver (clause 1).
- **What it improves:** long-window detectors and investigations get months of history with no hole in the guarantee.
- **Watch / next:** T-086 adds the remaining plants through the same path. A new history kind needs its own quarantine rules (D4 shows how).

### C7 · Seeding through the live API → history imports + batched commit + parallel worlds
- **Before → After:**
  - **Before:** worldgen v1 seeded every world through the public API, one command at a time. The store world's 183 days were seeded this way.
  - **After:**
    - history files go through approved imports with a server-side **batched commit**: the guard still fires per row, and core-domain logic is unchanged;
    - commit time on hosted Supabase went from **865 ms to 8.9 ms per bill**, so 1,000 bills take 8.9 s;
    - batched output is equivalent per row to unbatched on 755 orders;
    - worlds seed in parallel, and `make demo` builds 4 worlds and 60 plants in **77.9 s** on embedded PG.
  - Sources: [R44c](00-decision-ledger.md); H-1 8088c47; W-1 aaca235.
- **Decided by:** founder ("it is taking too much time to seed the DB"); lanes h-1 and w-1.
- **Why:** slow seeding blocked demos and long-window gates.
- **What it improves:** about a 97× faster commit per bill on hosted, deterministic worlds, and clock-independent gates.
- **Watch / next:**
  - Keep the per-row equivalence gate.
  - Measure the hosted time per world again if a guard trigger grows.
  - Never reorder a world's request log for speed.

### C8 · Supabase-only sign-in for seeding → dev-only local IdP selector
- **Before → After:** `make seed` needed real, confirmed Supabase sign-ins (R42 path; D9) → `MUNIM_IDP=local` accepts idp-local tokens. It requires `MUNIM_ENV=dev`, refuses to start under `NODE_ENV=production`, prints a loud boot banner, and `/health` reports it. The key lives under `.run/` ([R44a](00-decision-ledger.md); T-036 3aa4c93).
- **Decided by:** founder. This is an auth-flow change, so it was escalated (D9).
- **Why:** synthetic personas could not sign in without real mailboxes.
- **What it improves:** seeding and demos run unattended, and real sign-ins still go only through Supabase Auth.
- **Watch / next:** the production-mode refusal must stay red-proven. Never let `adapters/dev` leak into a non-dev composition root (boundaries gate).

### C9 · Wipe and reseed hosted demo data (recommended) → keep and add alongside
- **Before → After:** the orchestrator recommended wiping the hosted project and reseeding → existing verified worlds and synthetic users are kept, and new demo businesses are created alongside. No destructive operation runs on the founder's project.
- **Decided by:** founder. DECISIONS "10 Oct ~23:15 · R44 lanes + hosted demo data".
- **Why:** the store world was already verified live.
- **What it improves:** no data loss, and there is a live regression baseline.
- **Watch / next:** demo scripts must select tenants by name, not by "the only tenant".

## D · The graph

### D1 · Spanner Graph for the Cup + FalkorDB → Postgres edges now, FalkorDB later
- **Before → After:**
  1. One Graph port with FalkorDB and Spanner adapters, using Spanner for the Cup at about $90 a month ([R6](00-decision-ledger.md)).
  2. Postgres edge tables plus recursive CTEs as the default, FalkorDB optional, no Spanner ([R35](00-decision-ledger.md); Spanner parked in R37).
  3. Postgres edges only now, with the FalkorDB adapter later behind the same port ([R45 F7](00-decision-ledger.md)).
- **Decided by:** founder.
- **Why:**
  - SQL is canonical, and the graph serves multi-hop questions only.
  - Spanner cost and the GoogleSQL dialect only made sense for the Cup.
  - GraphRAG is not core for SQL-structured data (R6a, INFERENCE).
- **What it improves:** no extra datastore. Isolation is the same RLS as everything else, and lineage never uses the graph.
- **Watch / next:**
  - Promote FalkorDB only on measured slow multi-hop templates (T-058's 5 templates on the largest world).
  - The FalkorDB Graph Hacks entry stays a separate product (R12).

## E · The intelligence layer

### E1 · Router plus 8 specialist LLM agents → deterministic first, then a Manager plus 8 specialists as team members
- **Before → After:**
  1. Spec idea: a coordinator plus 8 domain agents as separate LLM hops.
  2. [R8](00-decision-ledger.md): one ADK agent loads domain skills on demand, fan-out for deep questions, "presented as a router plus specialists". Watchers are SQL first.
  3. [ADR-014](adr/ADR-014-intelligence-layer.md) §0: **deterministic first.** Watchers, forecast, brief, negotiation rules, deal review, investigations and outcomes are code. The LLM writes prose; agents are used only for open questions.
  4. [R45 F8](00-decision-ledger.md): **8 named specialists as domain team members**, one per pack: Menu & Pricing, Kitchen, Inventory & Purchasing, Finance, People, Customers & Growth, Compliance & Assets, Market & Strategy. Each owns its fixed-path workflows, its skill, its identity and track record, and its evals. Forecast is shared. The orchestrator is the **Manager**, and every trace, finding and draft carries its specialist as actor.
- **Decided by:**
  - R3 research X3 recommended the collapse.
  - ADR-014 was ratified (R45).
  - The founder chose F8, rejecting "8 always-on LLM agents" (option B) and "ADK workflow-agent subclasses" (option C).
- **Why:**
  - Each extra hop re-sends prompt, tools and context. Shopify saw degradation past about 20 tools ([R3](../research/R3-ai-layer-production.md), FACT).
  - Anthropic and OpenAI advise starting simple ([R6a](../research/R6a-agentic-architecture-round1.md), FACT).
  - The founder wanted an accountable team the owner can talk to and judge.
- **What it improves:**
  - **Cost:** at most 1 + 4 agents per run; most paths make 0 or 1 LLM call.
  - **Precision:** each pack has one owner for its detectors and evals.
  - **Trust:** a per-specialist track record from core rows (R40 C5).
  - **Testability:** a per-specialist eval table (T-085).
- **Watch / next:** T-085 and T-070 report per specialist. A specialist whose live false-alarm rate or abstention rate is out of line gets its skill or detectors tuned, never more autonomy (R16).

### E2 · `ParallelAgent` fan-out → per-branch Runners, read-only, at most 4
- **Before → After:** `ParallelAgent[≤ 4 analysts]` with `output_key`s merged by a `SequentialAgent` ([ADR-007](adr/ADR-007.md) original; 04 §2 claimed branches "do not share state", citing R4 §C) → `asyncio.gather` over ≤ 4 branch `Runner`s, each with its own `InMemorySessionService`. Branches share only the per-run `RunState`, are read-only (no `propose_*`), and return `BranchReport{tainted}`. Used only for `investigate` ([R45 F5](00-decision-ledger.md)).
- **Decided by:** ADR-014 and review M5/m2; the founder chose F5.
- **Why (FACT, from the installed `google-adk==2.11.0`):**
  - `ParallelAgent` is `@deprecated` "in favor of Workflow" (`agents/parallel_agent.py:246`).
  - Its docstring says "**Session state is shared by every branch**" (`:259–262`), so the old FACT label was wrong.
  - Shared state let a tainted branch launder text to the orchestrator (review B1).
- **What it improves:**
  - **Safety:** run-level taint, and branches cannot propose.
  - **Precision:** clean branch contexts.
  - **Cost:** explicit per-branch budgets, and no fan-out at the soft cap.
- **Watch / next:** T-059 measures tokens. If the §3.4 caps are not met, W3 ships single-agent ask and keeps fan-out for the demo S1 path (F5).

### E3 · "≤ 12 tools (FACT)" → ≤ 20 tools per context, labelled a design choice
- **Before → After:** 04 §2's "≤ 12 tools in context (`FACT` R3)" → **≤ 20 per context, a design choice**. `propose_*` is bound only on `draft_request` ([R45 F3](00-decision-ledger.md)).
- **Decided by:** review M2; the founder chose F3.
- **Why:**
  - R3 actually cites degradation past about **20** tools (Shopify, FACT), so 12 was mislabelled.
  - Under 12, no two-skill pair fits: the smallest pair is 18.
- **What it improves:** the single-agent two-skill path is reachable, and the number is honest about its evidence.
- **Watch / next:** T-070 measures per-category accuracy at 10, 15 and 20 tools. Lower the cap if 20 measurably hurts template selection.

### E4 · Negotiation: an LLM negotiator → deterministic → hybrid
- **Before → After:**
  1. "The purchasing specialist negotiates" (R7, R22), with a `purchasing_negotiator` agent in 04 §2/§6.
  2. The ADR-014 draft made a **deterministic negotiator**, with counter = best rival (pack §6).
  3. [R45 F4](00-decision-ledger.md) made it **hybrid**:
     - rules hold the hard limits (target and walk-away price, max rounds, allowed concessions);
     - each round the AI makes a typed choice — accept, counter or walk away — from the rule-allowed set, and writes the message;
     - supplier replies go to the no-tools extractor, and the run is tainted;
     - the deal review is deterministic;
     - the PO is a draft emitted by review code.
- **Decided by:** the founder ("a mix of both"). [ADR-008 amended](adr/ADR-008.md); BOARD T-055a/b.
- **Why:** the model adds judgement, but must never choose a price outside the rules, type a number, or propose from a tainted context.
- **What it improves:**
  - A model outage or budget stop degrades to the deterministic default, so the demo stays reproducible.
  - Prices in messages are rendered by code.
  - RFQs stay non-binding (R22) and labelled "Simulated supplier".
- **Watch / next:** T-070 measures the AI's move choice against the default on synthetic worlds. Any "savings" is labelled a measured result on synthetic data (hard rule 5). Drop to the default if it does not beat the rule.

### E5 · Decision models: none → DecisionModel port with an LLM mimic → W5 bake-off → Gemma fine-tune after W5
- **Before → After:**
  1. No typed-decision layer.
  2. A `DecisionModel` port (choice, score or predicate; bands only). W3 ships `route.intent` and `map.columns` on the **existing `router` role** through an LLM-mimic adapter, with per-question egress allow-lists ([R45 F2](00-decision-ledger.md)).
  3. TypeSafe Jev and OpenAI Decisions run only as a **W5 bake-off** under written entry criteria (ADR-014 §13.3).
  4. A **fine-tuned Gemma for intent routing after W5** ([F6](00-decision-ledger.md)): the founder overruled "not in v1", and approved training and hosting money in principle.
- **Decided by:** founder (F2, F6), from [R6c](../research/R6c-decision-models.md) (secondary sources dated after the model's knowledge cutoff).
- **Why:**
  - Bounded questions deserve typed answers with probabilities.
  - A new processor (Jev via OpenRouter) is an egress decision.
  - No labels exist yet for calibration or fine-tuning.
- **What it improves:**
  - No new data processor in W3.
  - Every decision re-validates in Python and falls back deterministically.
  - A decision model never gates policy, numbers or approvals (ADR-014 §4.4).
- **Watch / next:**
  - Calibration (Brier, ECE) starts at ≥ 200 labels per question.
  - Gemma needs ≥ 2,000 labels, a measured gap, an R36 amendment and `intel.model_decision`.
  - Logprob availability per provider is probed by T-059.

### E6 · Investigations: none → Step only → Step / Plan / Auto
- **Before → After:**
  1. No long-horizon tasks.
  2. ADR-014 draft (260b4de): the model set item verdicts, and cron continued the steps. The review (M3, M7) found that "computed completion" was hollow and that cron froze the creator's outlet scope.
  3. [R45 F1](00-decision-ledger.md): a **core-owned playbook**, member-triggered `:continue`, deterministic verdicts, and completion that needs a balanced `finance.margin_bridge` with a bounded residual.
  4. [F10](00-decision-ledger.md): **Step** (default), **Plan** (approve once; core runs the steps inside that request) and **Auto** (Plan, plus resume on new data within a cap; core-worker; built last). The owner sets the highest mode per role and the monthly AI cap. Drafts always need approval, and scope is re-checked at every step.
- **Decided by:** review M3/M7 → founder F1 → founder F10 ("like Claude Code / Codex modes").
- **Why:**
  - `margin_fall` is a known path, and models declaring completion early is a documented failure ([R6b](../research/R6b-agentic-architecture-round2.md), FACT).
  - Clicking every step is tedious where the owner trusts the plan.
- **What it improves:**
  - Completion is computed from ledger cells, never declared by a model.
  - Plan and Auto remove clicks without removing approval.
  - The cap bounds spend.
- **Watch / next:**
  - Open items: O-1, identity for unattended Auto steps (R40 C4 vs worker-minted run tokens); O-2, the owner cap vs the operator limit (founder, money).
  - Agentic (LLM-chosen) hypotheses only if a playbook-less question class shows value in W5.

### E7 · Ask with no history re-read → main conversation via the Manager + specialist threads and desks
- **Before → After:** ADR-014 §6.4: "ask answers are never re-read into later contexts in v1" → [R45 F9](00-decision-ledger.md):
  - **one main conversation**: ask anyone, or `@Specialist`; the Manager routes, and the answer is signed "{Specialist} · via Manager";
  - **per-specialist threads and desk pages**;
  - both on the same validated answer path;
  - thread context is a bounded rolling cited summary plus the last turns.
- **Decided by:** founder ("ask anyone manager answers and then individual too kinda mix").
- **Why:** follow-up questions need context, and owners think in terms of who handles what.
- **What it improves:**
  - Context stays bounded: a deterministic summary of cited segments from untainted turns only (no LLM summariser) plus ≤ 3 turns.
  - Taint carries across turns: an injected review in turn 2 blocks drafts in turn 3, and its prose never enters the summary, so it cannot resurface after aging out.
  - Signatures are composed by core, never by the model.
- **Watch / next:** T-088b gates the taint carry. Measure whether ≤ 8 summary segments lose needed context (W5 live), before growing the window.

### E8 · Per-session taint → run-level taint
- **Before → After:** taint was ADK session state per Runner → a single `RunState.tainted` flag per run. A branch report ORs into it, persisted step summaries carry `tainted` and are excluded when tainted, and thread turns carry it (F9).
- **Decided by:** review **B1** (blocker); ADR-014 revision.
- **Why:** a branch that read an injected review could pass prose to an untainted orchestrator holding `propose_*`.
- **What it improves:** 0 `propose_*` anywhere in a run after untrusted text, gated and red-proven by removing propagation (T-042, T-053, T-082b, T-088b).
- **Watch / next:** the T-080 lint requires every read tool to declare `untrusted: bool`, so a new untrusted source cannot ship without a flag.

### E9 · `confidence_bp` from the model → a deterministic coverage cell, shown as a band
- **Before → After:** `FindingsRequest.confidence_bp` was a "model self-assessment" → the pack's coverage cell from the same snapshot, shown only as a band (ADR-014 §14 C3).
- **Decided by:** ADR-014, from R6b (self-verdicts are unreliable) and R40 C5.
- **Why:** model opinion is not evidence.
- **What it improves:** confidence is reproducible, and no AI-supplied figure appears on screen.
- **Watch / next:** if coverage cells prove too coarse, add data-completeness inputs, never model scores.

### E10 · A 7-callback trace plugin → 14 callbacks with an error-path flush
- **Before → After:** 7 named callbacks (04 §7, R4 K14) → all **14** `BasePlugin` callbacks (FACT, installed `plugins/base_plugin.py`). Traces flush in `on_run_error_callback` and in the runner's `finally`. Actor labels are `manager`, `specialist:<pack>` and `branch:<pack>`.
- **Decided by:** review m1/m2; ADR-014 §10.
- **Why:** `after_run_callback` is skipped when a run errors (FACT, `runners.py` ~1649), so traces were lost on failure.
- **What it improves:** no lost traces, and every hook has a fired-test.
- **Watch / next:** re-run the fired-tests on any ADK pin change (ADK broke things in 2.4–2.10, R5).

## F · Process

### F1 · Per-ticket review → per-wave test run and adversarial review
- **Before → After:** the RULES §7 per-ticket loop → per wave: parallel lanes, then a quiet-tree wave test, then **one adversarial review of the whole wave** with a guarantee scan, then ≤ 2 fix cycles, then commits by ticket ([R38](00-decision-ledger.md)).
- **Decided by:** founder.
- **Why:** autonomy and throughput.
- **What it improves:** cross-ticket defects are found together. W1 found four severity-1 DB-layer breaks this way, and W2 found 7 money sev-1s, with 13 failing HTTP probes turned green.
- **Watch / next:** keep the review dimension split (guarantee/security, money/stock, contracts/SDK), which found distinct defects in W2.

### F2 · All lanes on Opus → tiered models
- **Before → After:** every lane on the strongest model → **Opus** for the migrator and for money, stock, security and orchestrator work; **Sonnet** for conventional and doc lanes.
- **Decided by:** founder ("use cheaper models where possible"), after the API weekly rate limit stopped W2. DECISIONS "10 Oct 09:55".
- **Why:** rate limits and cost.
- **What it improves:** the W2 relaunch completed. The W3 board states one reason per Opus row.
- **Watch / next:** compare the fix-cycle defect counts per tier at each wave review. Move a ticket class to Opus if its Sonnet lanes produce sev-1s.

### F3 · Uncommitted lane trees → checkpoint commits before review
- **Before → After:** lanes left work uncommitted until the wave closed → W2 lanes were committed per ticket as "lane build, pre-review" before the review. Lanes keep scratch files in `scratchpad/<lane>-<ticket>/`.
- **Decided by:** orchestrator, as a deliberate departure. DECISIONS "W2 modules built".
- **Why:** two scratchpad collisions on a 289-file uncommitted tree.
- **What it improves:** parallel lanes can no longer clobber each other's work unseen.
- **Watch / next:** the wave is closed only after review and fix cycles. A checkpoint commit is never "done".

### F4 · Three independent ADR reviewers → one Opus reviewer
- **Before → After:** the plan was 3 reviewers with identical prompts, majority plus dissent (DECISIONS "10 Oct ~23:55") → **one Opus reviewer** who checked every claim against the repo and the installed wheel ([ADR-014-review](adr/ADR-014-review.md)).
- **Decided by:** founder.
- **Why:** time.
- **What it improves:** one deep review with file and line verification found 1 blocker, 9 majors and 15 minors, all routed into the ADR revision.
- **Watch / next:** the W3 wave review should use the split dimensions (F1) to compensate for the single architecture reviewer.

### F5 · Board W3 rows from 9 Oct → rewritten from ADR-014 §12 + R45 F1–F10
- **Before → After:** the R39 board's W3 (one M-C migration, a `ParallelAgent` fan-out, per-pack agent code) → sub-waves W3.0–W3.4. Changes:
  - a split migrator queue;
  - the specialist registry, desks and track record;
  - threads;
  - the AI policy;
  - Plan and Auto modes;
  - per-specialist evals;
  - T-092a/b W4 read routes, rebuilt in [`W4-READ-ROUTES.md`](W4-READ-ROUTES.md) because the W2 R3 list was never saved.
- **Decided by:** founder ("rewrite the wave 3 board"); docs lane, 11 Oct.
- **Why:** ADR-014 and F8–F10 changed the work.
- **What it improves:** every ticket has a model tier, dependencies, and a gate that counts against an independent source.
- **Watch / next:** the old rows are kept collapsed in BOARD. Contradictions between the ADR body and the ledger are listed in ADR-014's post-ratification notes.
