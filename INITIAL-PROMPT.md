# INITIAL PROMPT — paste everything below the line into a fresh Claude Code session started in
# `/Users/satviksawhney/Downloads/projects_26/foodops-os`

---

You are picking up a hackathon product from a discussion session. Work in this folder.

## 0. Orient first (do not skip, do not summarise back at length)
Read, in order: `HANDOFF.md`, `CLAUDE.md`, `docs/00-context.md`, `docs/01-decisions.md`,
`docs/02-product-shape.md`, `docs/03-landscape.md`, `docs/04-open-questions.md`,
`docs/05-ideation-trail.md`. Skim `../hackathon/ai-builder-cup-2026/BRIEF.md` only if a fact is in doubt.

The product: an operating system for 2–5 outlet food groups — a deterministic core (orders/POS,
menu & recipes, stock ledger, purchasing, simulated payments, finance) with seven AI agents on top
(Dish, Inventory, Finance, Analytics, Forecast, Procurement, Staffing) that propose and never write
directly. Target: AI Builder Cup 2026, deadline **Sun 18 Oct 2026, 23:59 IST**. Fresh code only. Google
Cloud only. The user is mostly solo. The decisions in `docs/01-decisions.md` are the user's — do not
re-litigate D-002, D-004–D-012. Challenge only where you find a concrete contradiction or a rule
violation, and say exactly what and why.

## 1. How to work with me
- I decide; you recommend. Do **not** push me to lock things. Present options, lead with the widest
  workable one, name the risk once, then build what I choose.
- Ask **one question per message**, multiple choice with a recommendation first (use AskUserQuestion).
  Read my free-text additions carefully — they often change the answer.
- Be terse. Put detail in files, not chat. If I sound frustrated, you misread me: one line, then fix it.
- Use the shipyard skills where they fit: `shipyard:clarify-and-ratify`, `shipyard:plan-docs`,
  `shipyard:ticket-board`; later `shipyard:orchestrate-build`, `shipyard:adversarial-review`,
  `shipyard:round-close`. Use `superpowers:brainstorming` discipline for the requirements round, but
  do not write code until the docs are ratified.

## 2. Phase A — re-clear requirements (target: ≤ 3 hours of my time)
Start with the five blockers from `docs/04-open-questions.md`: **OQ-1** (read the exact ROFR clause in
the T&C at the Google Doc linked from the BRIEF, and draft a clarification email for me to send),
**OQ-2** product name, **OQ-3** headline claimable number, **OQ-5** teammate, **OQ-6/7** locale and
languages. Then walk the product features surface by surface and agent by agent and confirm, per item:
in/out of the Cup slice, minimum "real" behaviour, and the visible refusal/eval check for each agent.
Output: `docs/06-requirements/PRD.md`, `FEATURES.md` (MoSCoW with the Cup-slice cut and an explicit
"cut order" if the 8 Oct checkpoint is missed), `NFR.md`, and a binding **decision ledger**
`docs/07-decision-ledger.md` (R-numbered, like the Sanad ledger). Log every answer in
`docs/01-decisions.md` first.

## 3. Phase B — architecture and stack (target: ratified within the first day)
Write ADRs in `docs/08-architecture/adr/` and ratify the stack with me. Resolve OQ-13…OQ-18 (book of
record, ADK/A2A topology on Cloud Run, Gemini model roles with a live probe, auth and per-outlet
roles, realtime for KDS and brief, forecasting method that must beat a naive baseline). Respect: Cloud
Run + Cloud SQL Postgres + BigQuery + ADK + A2A supplier services + Gemini/Gemini Live unless I
overrule; modular monolith unless you show me a concrete reason not to; **no Vercel/Supabase/AWS**.
Cost is my own money — estimate monthly GCP spend.

## 4. Phase C — the complete documentation set
Produce all of the following. Each doc: purpose, scope, decisions it depends on, then the content.
Mark `FACT`/`INFERENCE`. Cross-link. Keep each doc as short as it can be and still be buildable.

```
docs/06-requirements/   PRD.md · FEATURES.md · NFR.md
docs/07-decision-ledger.md
docs/08-architecture/
  HLD.md                       context, containers, deployment topology on GCP, trust boundaries
  STACK.md                     ratified stack + versions pinned by probe
  SECURITY-AND-ROLES.md        per-outlet roles, credential-less agents, approval model, audit log
  DEPLOYMENT.md                Cloud Run services, Cloud SQL, BigQuery, secrets, CI/CD, cost, 12 Oct milestone
  adr/ADR-001…                 one per decision
docs/09-data/
  DB-DESIGN.md                 ERD, entities, ledger invariants (stock, money), constraints, indexes,
                               multi-tenant/outlet scoping, migration plan (single migrator)
  EVENTS-AND-COMMANDS.md       the command/event model the agents propose against
  SYNTHETIC-DATA.md            3 outlets × 6 months, seeded generator, planted anomalies for the three demo stories
  ADAPTERS.md                  import adapters (CSV/aggregator-shaped), validation, rejection reasons
docs/10-agents/
  AGENT-FRAMEWORK.md           shared runtime: typed read tools, propose-only writes, evidence/citation envelope, refusal contract
  REVIEW-GATE.md               parallel reviewers, policies, "cannot verify" behaviour
  A2A-SUPPLIERS.md             simulated supplier agents, personalities, protocol, disclosure
  AGENT-<name>.md ×7           Dish, Inventory, Finance, Analytics, Forecast, Procurement, Staffing
  VOICE.md                     Gemini Live: scope, latency budget, fallbacks
  EVALS.md                     harness, baselines, the headline number, red-proven gates
docs/11-lld/
  LLD-<module>.md              orders-pos · menu-recipes · stock-ledger · purchasing · payments-sim ·
                               finance · auth-roles · brief-approvals · kds · web-ordering · adapters
docs/12-ux/
  SCREENS.md · FLOWS.md · DESIGN-SYSTEM.md   owner brief/approval queue first; dashboards with agent panels
docs/13-delivery/
  PLAN.md                      day-by-day to 18 Oct, 8 Oct core checkpoint, 12 Oct deploy, 17 Oct submit
  TICKET-BOARD.md              shipyard board: lanes, file territories, dependency waves, serial migrator queue, done-when gates that can fail
  DEMO-SCRIPT.md               the 3-minute montage, second by second
  DECK-OUTLINE.md              PDF deck outline
  SUBMISSION-CHECKLIST.md      live URL, <3 min video, public repo, PDF deck, disclosures, ROFR note
  CLAUDE.md update             fold ratified rules into the root CLAUDE.md
```
Update `docs/README.md` status as each document lands. Commit after each phase (init a git repo here
first; do not push or create a remote — I do that).

## 5. Gates
- No code until Phases A and B are ratified by me and the PRD, HLD, DB-DESIGN and AGENT-FRAMEWORK exist.
- The docs phase is **time-boxed to 48 hours**. If it threatens the schedule, tell me which docs to cut —
  the ticket board and DB design are the last to go.
- Anything touching a rule in `CLAUDE.md` stops and asks me.

## 6. First message
After orienting, send me **one short message**: what you understood in three lines, anything in the
repo that contradicts the handoff, and **your first question** (start with OQ-1, the ROFR clause —
read it yourself first and show me the exact wording).
