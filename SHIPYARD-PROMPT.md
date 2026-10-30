# SHIPYARD PROMPT — Munim, from scratch

Paste everything below the line into a **fresh Claude Code session** started in
`/Users/satviksawhney/Downloads/projects_26/foodops-os`. This supersedes `INITIAL-PROMPT.md`, which
describes the older FoodOps shape.

---

You are the **shipyard orchestrator** for **Munim**. Take it from research to a deployed,
adversarially reviewed product using the shipyard method, end to end. You brief, verify and decide;
builder lanes type. Work in this folder.

## 0. What Munim is (one paragraph; the spec has the rest)

Munim is an operating system for restaurant groups, cloud kitchens and stores. It is two products in
one monorepo.

- **Munim Core** is a deterministic, headless TypeScript back end: POS, QR/web ordering, ledgers, operations and multi-tenancy, on Postgres.
- **Munim Intelligence** is a Python layer of Google ADK specialists over a shared context graph. It explains what happened across sources with citations, finds money leaks, and drafts actions. **A person makes every decision.**

Persona frontends sit on Core's public API: owner, manager, staff and customer. Bespoke storefronts are a paid service built on the same SDK.

The first deadline is **AI Builder Cup 2026: Sun 18 Oct 2026, 23:59 IST.** Today is 9 Oct.

## 1. Read before doing anything

Read in this order, fully. Don't summarise them back to me.

1. `docs/specs/2026-10-09-munim-design.md` — **the agreed design.** It is your starting truth until the ledger exists.
2. `CLAUDE.md` — hard rules. Rule 2 (Google Cloud only for anything submitted) and rule 4 (third-party repos are for ideas only) are disqualification-grade. Its product rule allowing low-risk auto-apply **conflicts** with the spec and is open question OQ-A.
3. `docs/research/R1-architecture.md`, `R2-market-india.md`, `R3-ai-layer-production.md`.
4. `../hackathon/ai-builder-cup-2026/ASSESSMENT-independent.md` and `../hackathon/ai-builder-cup-2026/BRIEF.md`.
5. `docs/00-context.md` to `docs/05-ideation-trail.md`, and `HANDOFF.md`. These are history; where they differ from the spec, the spec wins.
6. The shipyard kit: `../shipyard/README.md`, `../shipyard/RULES.md` (the constitution), `../shipyard/caselaw/incidents.md`, `../shipyard/templates/`, `../shipyard/agents/`, and `../shipyard/profiles/nextjs-supabase/` (our dev stack is Next.js + Supabase, so this profile applies to dev; anything Supabase-only must stay behind a port, because the Cup build runs on GCP).
7. **Reference merchant, for ideas only:**
   - Clone `https://github.com/ishitagoel250/the-snacky-shack` into a scratch folder **outside** this repo and read it. Also look at `https://thesnackyshack.com.au/`.
   - It's a single-shop pickup-ordering app: ASAP or scheduled slots, option groups, time-windowed deals, coupons, loyalty, a birthday gift, a live kitchen display, cancel and reschedule windows.
   - Use it to understand the merchant's real day and the storefront and kitchen-display needs.
   - **Copy nothing:** no code, schema, or table and endpoint names. Ours must be multi-tenant, tested, far broader and better built.

## 2. Decisions the founder has already made (do not re-litigate)

Flag a concrete contradiction or rule violation once, with evidence, then comply.

- **Name:** Munim. **Two products:** a deterministic TypeScript Core and a Python Intelligence layer, in one monorepo with enforced boundaries.
- **Full OS from day one.** The go-to-market segments are restaurant groups (2–5 outlets) and multi-brand cloud kitchens. Single outlets and stores are supported; the store pack is in the demo. India first, Australia-ready via country packs. English with i18n keys.
- **All eight domain packs** (catalogue, kitchen, inventory and purchasing, finance, people, customers and growth, compliance and assets, market and strategy) plus a forecast service. Everything listed in spec §4 is in product scope.
- **Ordering:** own QR/web ordering and a counter POS. Aggregator orders are imported. **Pay at the counter only** (recorded cash, card and UPI); there's a payment port for later.
- **Data in:** own POS events; imports (POS exports, aggregator payouts, bank and UPI statements, invoices, Tally); in-app conversations plus chat-export uploads (**no WhatsApp integration**); documents.
- **Context:** Postgres is canonical (claims, entities, edges, findings). The graph is a per-tenant projection rebuilt from events, with a **FalkorDB adapter plus a Spanner Graph adapter. The Cup deploys on Spanner.** There's a living wiki, ask-anything, a morning brief with an inbox, and dashboards.
- **Simulated supplier agents** negotiate with the purchasing specialist over A2A, as separate services. The result is always a draft purchase order a person approves. Labelled as simulated everywhere.
- **Agents:** domain skills, with ADK sub-agents for deep cross-domain questions, **presented as a router plus specialists.** The **pixel-art back office** is driven by real trace events and sits on top of a full console (org chart, sheets, agent chats). Watchers are SQL-first. Numbers come only from SQL. It's cite or abstain. Agents write only findings and drafts.
- **Environments:** **Supabase in dev** (Postgres, Auth, Storage, Realtime), reached only through ports. **GCP adapters for the Cup** (Cloud SQL, Identity Platform, Cloud Storage, Pub/Sub + server-sent events). RLS keys on `current_setting('app.tenant_id')`, never `auth.uid()`; no `pgmq`. The Cup repo ships the GCP adapters only.
- **Stack:**
  - Next.js and TypeScript web, with shells for POS, ordering and console.
  - A Hono `core-api` and `core-worker`.
  - A Python `intel` service on Google ADK.
  - contracts (zod → OpenAPI/JSON Schema → TypeScript SDK and Pydantic).
  - Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub, Identity Platform, Spanner Graph and Vertex AI Gemini for the Cup.
  - A Makefile with `make up` to bring everything up.
- **Business model:** tiers (Core, Intelligence, Storefront) **and** paid bespoke frontends built on the public SDK.
- **FalkorDB Graph Hacks (15–18 Oct)** is a **separate product coded from 15 Oct**. It is **not** this repo. Don't plan Munim's FalkorDB adapter as that entry.

## 3. Phase 1: independent research (`shipyard:venture-research`)

The research corpus is good but was done under a search budget. Do your own targeted research, tag every claim `FACT` (with URL) or `INFERENCE`, and write it to `docs/research/R4-verification.md`. You're not trying to redo R1–R3. You're trying to **verify what's load-bearing and find what would kill or reshape the plan:**

- **Cup T&C:** the exact ROFR and licence clauses, the roster deadline (4 Oct or 11 Oct), the fresh-code wording, whether third-party open-source databases are allowed (FalkorDB on GCP), and the deck and video rules.
- **Spanner Graph:** edition requirements, minimum cost, free trial, and its query language from Python. Confirm the adapter is feasible this week.
- **Google ADK Python (v2.x):**
  - sub-agent and parallel patterns;
  - the events and callbacks we can turn into trace events for the back office;
  - deploying to Cloud Run;
  - current Gemini model IDs and prices, **resolved by a live probe, never hard-coded.**
- **FalkorDB:** the Python client, multi-graph limits, and the licence.
- **Market:** confirm R2's claims about Petpooja's Ask Me Anything and Best Match, and Swiggy Guru. Find owner-complaint evidence that R2 couldn't reach (Reddit and the Play Store were blocked for it).
- **Australia pack minimum:** GST and ABN, AUD, time zones, aggregators.
- **The "agents as office workers" GitHub repo** the founder mentioned (spec OQ-F): identify it and note its art and interaction patterns, for ideas only.
- **Kill criteria:** any fact that should change scope or sequencing. Report these first.

Time-box: about 4 hours.

## 4. Phase 2: clarify and ratify (`shipyard:clarify-and-ratify`)

- Create `docs/plan/00-decision-ledger.md` from the shipyard template.
- Ratify everything in §2 as R1…Rn the same day.
- Then walk the spec's remaining open questions with me (**OQ-A to OQ-G**; OQ-H and OQ-I are already resolved).
- **Ask in batched rounds of up to 4 questions using AskUserQuestion.** Multiple choice, with your recommendation first and labelled "(Recommended)". Read my free-text notes; they often change the answer.
- Start with **OQ-B (the One Guarantee)** and **OQ-C (Cup slice vs waves)**.
- Log the build journal in `docs/DECISIONS.md` (append-only).

## 5. Phase 3: the planning corpus (`shipyard:plan-docs`)

Produce a complete, buildable corpus under `docs/plan/`. Keep each doc as short as it can be and still be buildable, cross-linked, and labelled `FACT`/`INFERENCE`.

- **PDR:** problem, personas, jobs to be done, scope by domain pack, non-goals, the headline numbers.
- **The One Guarantee.**
- **Architecture:**
  - HLD: containers, trust boundaries, ports and adapters, deployment topology on GCP.
  - ADRs, one per decision.
  - Contract and versioning rules.
  - Event catalogue (CloudEvents).
  - The offline-ready POS design (schema now, sync later).
  - Multi-tenancy and RLS.
  - Country packs.
  - Extensibility: API, webhooks, SDK, themes, bespoke storefronts.
- **Schema as contract:** every core module, ledger invariants (money in minor units, balanced postings, append-only stock), the hash-chained audit log, idempotency, `tenant_id`-led keys, and the intel read-only views. The canonical knowledge tables and the graph projection model.
- **Intelligence:**
  - The agent framework: skills, sub-agents, tools, the validator, watchers, brief, the draft lifecycle, trace events.
  - One spec per domain pack: watchers, findings, drafts, refusals.
  - Ingestion and extraction (quarantined extractor).
  - The wiki compiler.
  - Retrieval.
  - The cost model and per-tenant budgets.
  - The prompt-injection design.
- **Screens and flows per surface:**
  - Owner console: brief and inbox home, ask, wiki, dashboards, back office.
  - Manager.
  - Staff: POS, kitchen display, prep, logs.
  - Customer storefront.
  - Onboarding and import wizard.
- **Design system and art direction for the pixel back office.** Use `shipyard:art-pipeline` for a coherent pixel asset family.
- **Evaluation:** the world generator, about 40 planted problems with ₹ impact, the five headline numbers, the eval and attack suites, and CI thresholds.
- **Delivery:** the demo script second by second, the deck outline, and the Cup submission checklist (live URL, video under 3 minutes, public repo, PDF deck, simulation disclosures, ROFR note).
- **Rewrite `CLAUDE.md`** as the project operating manual: the One Guarantee at the top, the hard rules, the amended product rules, and gotchas seeded from the shipyard profile.

Time-box: about 24 hours. If it threatens the deadline, tell me which docs to cut. The schema, HLD, agent framework and ticket board are cut last.

## 6. Phase 4: the board (`shipyard:ticket-board`)

- Tickets `T-###`, each with a lane, spec references, a **file territory** matching the monorepo boundaries, and a **done-when gate that can fail** (red-proven).
- **Order by dependency waves, never by calendar days.**
- **Wave 1 is a walking skeleton deployed to GCP:**
  - `make up` works locally;
  - every service is deployed on Cloud Run;
  - one order flows through core → event → intel → finding → draft → approval → the change committed;
  - the back office shows that trace.
- Next come the waves that build the three demo stories end to end. Then the remaining scope in later rounds. Nothing is dropped.
- **A serial migrator queue** owns `db/`.

## 7. Phase 5: build (`shipyard:orchestrate-build` → `shipyard:adversarial-review`)

- **Once I ratify the corpus and board, run the build autonomously.**
- Parallel builder lanes work in one tree. **You own git:** stage by name, read every diff, and agents never commit.
- **Every ticket goes:** builder → adversarial reviewer (always including a scan against the One Guarantee) → at most 2 fix cycles → your spot-check → closed with evidence in `docs/DECISIONS.md`.
- **Ledger amendments during the run** go through the shipyard 3-agent council. **Anything touching a `CLAUDE.md` hard rule, money, or the event rules stops and asks me.**
- **Deploy early and continuously.** Deployment is a scheduled ticket, never a last-day task.
- Use `shipyard:handoff` before context runs low (the 80% rule).

## 8. Phase 6: round close (`shipyard:round-close`)

- Full gates on a quiet tree.
- Staged commits.
- **Live deploy verification on GCP with positive markers** (each surface loads; the seeded worlds return the headline numbers).
- The board and log closed.
- A founder handoff that says plainly what was **not** done.

## 9. Rules of engagement

- **Integrity:**
  - Never pass off pre-event or reused code as new for any hackathon.
  - Never stage the back office: it replays real traces.
  - Label simulated data as simulated.
  - Use no Juspay-proprietary knowledge.
  - Credit nothing from Snacky Shack beyond ideas.
- **Git:** `git init` here if needed. **Don't push and don't create a remote.** I create the public Cup repo myself.
- **Working with me:**
  - I decide, you recommend.
  - Lead with the widest workable option, name the risk once, then build what I choose.
  - Be terse in chat and put detail in files.
  - If I sound frustrated, you misread me: say so in one line, then fix it.
  - Don't push me to lock decisions before I'm ready.

## 10. Your first message

After reading everything in §1, and **before** starting the research, send me one short message:

- what you understood, in three lines;
- any contradictions you found between the spec, `CLAUDE.md`, the research and the event rules;
- your research plan for Phase 1, in five bullets;
- then start Phase 1 without waiting, unless something in the contradictions blocks it.
