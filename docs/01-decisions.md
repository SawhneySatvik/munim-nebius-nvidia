# 01 — Decisions (append-only)

Format: what was decided · who decided · why · what would reverse it.
"User" = Satvik. Status `Decided` means the user chose it in the 4 Oct 2026 session.
Nothing here is a ratified spec yet — the next session re-clears requirements (see HANDOFF).

---

## D-001 · Do not build in BFSI
**Decided by user, 4 Oct 2026.** BFSI (and fraud especially) is the most crowded, most generic choice.
Rejected: fraud case copilot, settlement-break resolver, RBI circular agent, insurance exclusion checker.
*Reverses if:* the user says so. Do not re-propose BFSI ideas unprompted.
(Note: a finance *agent* inside the food product is fine — that is a feature, not the theme.)

## D-002 · Purpose: a real product seed; the Cup is its first public milestone
**Decided by user** (chose "Real product seed"). Accepts the organiser's 6-month right of first
refusal as a known risk. **Follow-ups:** read the exact clause; draft a clarification request to the
organiser for the user to send before 18 Oct (OQ-1).
*Reverses if:* the clause turns out to prohibit commercialisation in a way the user will not accept.

## D-003 · Theme: Retail & Commerce
**Decided (implied by the product).** Food-business operations is "Intelligent Customer and Business
Experiences".

## D-004 · First user: small multi-outlet food group (2–5 outlets)
**Decided by user** (chose the widest option over the recommended single outlet).
*Consequences:* central/pooled purchasing across outlets (stronger negotiation story), outlet
comparison analytics, per-outlet roles (an outlet manager sees only their outlet), transfers between
outlets, a heavier data model and demo.

## D-005 · Orders: native order suite **plus** import adapters
**Decided by user** (recommended option). We build our own ordering so we own the data end to end;
adapters (CSV/API) pull orders from existing POS and aggregators.
*Why:* a fixed schema we control makes analytics reliable; adapters keep the "works with what you
already run" story that incumbents (locked to their own POS) cannot tell.

## D-006 · AI decision areas in v1: all four, plus a deterministic core with agents on top
**Decided by user:** menu & pricing engineering · demand forecast + prep plan · procurement &
supplier negotiation · staffing & rostering — **plus** the user's own addition: *a proper POS
deterministic layer, then AI agents on top — inventory, finance, analytics, dish agents, etc.*
Architecture principle (agreed): the core is the system of record; agents read through typed tools
and propose commands; the core validates and commits.

## D-007 · Autonomy: propose → core validates → owner approves money/stock
**Decided by user** (recommended option). Low-risk actions (prep list, draft roster) may auto-apply.
Anything that spends money, changes stock, or changes prices needs owner approval (voice or tap).
*Why:* strongest story, safest demo, and it is the product's central trust guarantee.

## D-008 · Cup submission slice: core + **all seven agents, each thin**
**Decided by user** (chose the widest option over the recommended "core + 3 agents").
Agents: Dish, Inventory, Finance, Analytics, Forecast, Procurement, Staffing.
**Risk named once, then committed:** breadth of shallow agents is what a 40%-technical rubric can
punish. **Mitigations adopted:** one shared agent framework (typed read tools, propose-only writes,
cited output) so each thin agent is cheap; each agent must have ≥1 visible refusal or eval check;
if the core is not correct by ~8 Oct, **cut agents, never the core**.
*Do not re-litigate this decision.* Engineer for it.

## D-009 · Core UX: daily brief + approval queue is home; dashboards with agent panels beneath; voice/chat is a surface
**Decided by user:** option 1 (daily brief + approval queue) **and** option 3 (domain dashboards, each
with an agent panel). Voice/chat (option 2) is "just a feature / surface required", not the primary
experience. Voice/chat should be reachable from anywhere (Gemini Live for voice).

## D-010 · Native order-suite surfaces: POS + customer web/QR ordering + kitchen display + payments
**Decided by user:** all four. **Payments are simulated** — a mock gateway producing realistic events
(authorise, capture, refund, chargeback, settlement files with fees) that feed the finance ledger so
the Finance agent has real reconciliation work. Sits behind a port; a real rail can replace it later.

## D-011 · Build method: Shipyard-style parallel agent lanes
**Decided by user** (recommended option). The user will be **working mostly alone**; the teammate's
contribution is limited. Therefore the plan must minimise what the user builds by hand and put the
user at review gates. Use the shipyard skills (clarify-and-ratify, plan-docs, ticket-board,
orchestrate-build, adversarial-review, round-close).

## D-012 · Demo video leads with all three stories
**Decided by user** ("all"). 3-minute montage: (1) Monday-morning brief — forecast → procurement
negotiation → review gate refuses one out-of-policy deal → voice approval (~80 s, the spine);
(2) hidden margin leak (~45 s); (3) month-end close — payments reconciled, P&L produced (~35 s).
Tight; each beat must be scripted from day one.

## D-013 · Stack constraints (derived from event rules, not yet a stack decision)
Cloud Run (core + API) · Cloud SQL Postgres (book of record) · BigQuery (analytics) · ADK for agents ·
simulated supplier agents as **separate A2A services** (so negotiation is a real network call) ·
Gemini (Flash for tool-calling) and Gemini Live for voice. **Modular monolith** recommended over
microservices-per-agent (too much infra for one person in 14 days) and over Firestore-only (weak for
stock ledgers and money). *The next session ratifies the stack formally via ADRs.*

## D-014 · Inspirations: ideas only, nothing reused
Xyne Spaces (permission-scoped context, credential-less agents) — a **Juspay** product, so extra care.
Greptile (a parallel-agent review gate), AIBMOS (unified agent control plane), a friend's private
ordering-site repo (a typical freelancer-built food ordering site). **No code, schema or naming is
carried over.** The friend is a pilot idea at most, never a contributor (team-eligibility rule).

## D-015 · Interpretation of "ORM"
The user wrote "ORM" several times. Interpreted as **an operations management system for food
businesses**, not an object-relational mapper. **Unconfirmed — verify in the next session.**

---

## D-016 · Re-scoped as Munim: a two-product OS with a shared context graph (9 Oct 2026)
**Decided by user** in a brainstorming session (8–9 Oct 2026). The full design is in
`docs/specs/2026-10-09-munim-design.md`, which supersedes `02-product-shape.md` where they differ.

**Main points:**
- The product is named **Munim**.
- It is **two products** in one monorepo: a deterministic TypeScript Core (headless, public `/v1` API) and a Python Intelligence layer (Google ADK).
- **Decisions stay with the person.** Agents only explain, recommend and draft. This conflicts with the low-risk auto-apply rule in `CLAUDE.md`; resolution is open question OQ-A.
- **Full OS from day one.** Go-to-market segments are restaurant groups and cloud kitchens. India first, Australia-ready.
- **Pay at the counter only.** No WhatsApp integration.
- **Graph:** Postgres is canonical; the graph is a projection. There is a FalkorDB adapter plus a Spanner Graph adapter, and the Cup deploys on Spanner.
- **Agents:** domain skills, with ADK sub-agents on demand, presented as a router plus specialists in a trace-driven pixel back office.
- **Business model:** tiers plus paid bespoke frontends built on the SDK.

**Research** (`docs/research/R1–R3`) was weighed. The founder overrode R2's recommendation to start with the layer only.

**Next step:** run `SHIPYARD-PROMPT.md` in a fresh session. It ratifies all of this into a shipyard ledger.

*Reverses if:* the founder amends the shipyard ledger.

---

## D-017 · Supabase in dev, GCP adapters for the Cup; supplier agents back (9 Oct 2026)
**Decided by user**, resolving spec OQ-H and OQ-I.
- **Supabase is the development environment** (Postgres, Auth, Storage, Realtime). The Cup build runs on GCP adapters (Cloud SQL, Identity Platform, Cloud Storage, Pub/Sub). Supabase is reached only through ports. RLS keys on `current_setting('app.tenant_id')`, never `auth.uid()`, and there's no `pgmq`. The Cup repo ships the GCP adapters only, which satisfies `CLAUDE.md` rule 2.
- **Simulated supplier agents over A2A are back in scope.** They are draft-only: a negotiation ends in a draft purchase order a person approves. They are labelled as simulated everywhere (`CLAUDE.md` rule 5).
- Section 7 (repo, Makefile, testing, deployment, failures) is confirmed as written.
*Reverses if:* the founder amends the shipyard ledger.

---

## D-018 · SHIPYARD-PROMPT governs; INITIAL-PROMPT is history (9 Oct 2026)
**Decided by user.** The session was started with the text of `INITIAL-PROMPT.md`; asked which prompt
governs, the user chose `SHIPYARD-PROMPT.md`. The Munim spec and D-016/D-017 are the starting truth;
the planning corpus goes to `docs/plan/`. Also recorded: the live T&C (snapshot
`docs/admin/cup-tnc-snapshot-2026-10-09.md`) says roster changes close **11 Oct**, not 4 Oct; the ROFR
clause text is saved and a clarification email is drafted at `docs/admin/rofr-clarification-email.md`.
*Reverses if:* the founder says so.

## D-019 · One Guarantee, no auto-apply, roster submitted (9 Oct 2026)
**Decided by user** in clarify round 1. Ratified as ledger R15–R17 (`docs/plan/00-decision-ledger.md`),
which is now the binding record; this log is history from here on.
- One Guarantee: "Nothing changes the books without a named person's approval, and every number shown
  traces to a ledger row."
- No auto-apply anywhere in v1; `CLAUDE.md` product rule amended.
- Teammate information is already submitted on the roster; founder is the sole code reviewer.
