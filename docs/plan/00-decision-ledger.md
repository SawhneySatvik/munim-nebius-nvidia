# Munim — Decision Ledger

**BINDING.** This file outranks every other doc (Shipyard RULES.md §1): ledger > running code >
plan docs (`docs/plan/`) > spec (`docs/specs/2026-10-09-munim-design.md`) > research (`docs/research/`).
An agent may not reverse an entry: flag disagreement once, then comply. Amending requires the founder,
or a 3-agent council under the autonomous protocol (identical prompts, majority, dissent recorded here).
Anything touching a `CLAUDE.md` hard rule, money, or the event rules goes to the founder, never a council.

Convention: one R-series, never renumbered. Each entry cites its source decision (`D-0xx` in
`docs/01-decisions.md`) where one exists.

---

## R1 · Name and shape: Munim, two products in one monorepo (9 Oct 2026)

**Decision.** The product is **Munim**. It is two products in one monorepo with enforced boundaries:
**Munim Core** (deterministic, headless TypeScript back end: POS, QR/web ordering, ledgers, operations,
multi-tenancy, public versioned `/v1` API) and **Munim Intelligence** (Python, Google ADK). The only hard
service boundary is core ↔ intel. `intel` imports only `packages/contracts`; boundaries are enforced by
dependency-cruiser (TS) and import-linter (Python) in CI.

**Rationale.** Founder decision (D-016). R1 research: modular monolith, one trust boundary.

**Consequences.** Repo layout per spec §12. Folder is still named `foodops-os`; renaming is cosmetic.

## R2 · Full OS from day one; segments (9 Oct 2026)

**Decision.** Full OS is in product scope from day one. Go-to-market segments: **restaurant groups
(2–5 outlets)** and **multi-brand cloud kitchens**. Single outlets and stores are supported; the
**store pack is in the Cup demo**. Kiranas are not a go-to-market target. **India first; Australia-ready**
via country packs (currency, tax, time zone, aggregators, number formats — never hard-coded).
**English UI, every string through i18n keys.**

**Rationale.** Founder decision (D-016), overriding R2's "layer first" recommendation and the
independent assessment's descope recommendation. Both halves recorded: research advised a narrower
wedge; the founder chose the full OS.

**Consequences.** Cup slice vs waves is decided separately (OQ-C). Nothing in spec §4 is dropped from
product scope; it is sequenced.

## R3 · Eight domain packs plus a forecast service (9 Oct 2026)

**Decision.** All eight packs are in product scope — (1) catalogue & menu, (2) kitchen operations,
(3) inventory & purchasing, (4) finance, (5) people, (6) customers & growth, (7) compliance & assets,
(8) market & strategy — plus a deterministic **forecast service** used by every pack. Spec §4.1 is the
scope list.

**Rationale.** Founder decision (D-016).

**Consequences.** Each pack gets an agent skill, graph layer, watchers and a dashboard (spec §4.1).

## R4 · Ordering channels and payments: pay at the counter only (9 Oct 2026)

**Decision.** Own **QR/web ordering** (dine-in table QR, pickup ASAP or scheduled slot, the business's
own site) and a **counter POS**. **Aggregator orders are imported, never placed by us.** **Pay at the
counter only:** cash, card and UPI are *recorded*; there are no online payments. A **payment port**
exists for a real gateway later.

**Rationale.** Founder decision (D-016). Supersedes D-010's simulated payment gateway.

**Consequences.** No card data is ever stored. `CLAUDE.md` wording about "simulated payments" is
obsolete and is corrected in the `CLAUDE.md` rewrite.

## R5 · Data in: own events, imports, conversations, documents; no WhatsApp (9 Oct 2026)

**Decision.** Inputs: own POS/ordering events; imports (POS exports, Swiggy/Zomato-shaped payout
reports, bank and UPI statements, invoice photos/PDFs, Tally); conversations logged in-app plus
upload of chat exports/transcripts; documents (menus, contracts, SOPs). **No WhatsApp integration.**

**Rationale.** Founder decision (D-016).

**Consequences.** Ingestion pipeline per spec §7; extraction is quarantined (no tools).

## R6 · Context: Postgres canonical, graph is a projection; Spanner Graph for the Cup (9 Oct 2026)

**Decision.** Postgres holds canonical knowledge (`claims`, `entities`, `edges`, `findings`). The graph
is a **per-tenant projection rebuilt from events**, behind one Graph port with **two adapters:
FalkorDB and Spanner Graph**, one contract test suite. **The Cup deployment uses Spanner Graph.**
Graph tools serve multi-hop questions only; single-hop goes to SQL + hybrid search. Also in scope:
a living wiki, ask-anything, a morning brief with an inbox, and dashboards.

**Rationale.** Founder decision (D-016), overriding R3's recommendation to drop the Spanner adapter.
Cost (~$90/month minimum, R3) accepted by the founder. Feasibility re-verified in R4.

**Consequences.** Budget line for Spanner Enterprise in `DEPLOYMENT`. The graph can be dropped and
rebuilt without loss; a per-tenant checksum detects drift.

## R7 · Simulated supplier agents over A2A, draft-only (9 Oct 2026)

**Decision.** Simulated supplier agents are **separate A2A services** with their own pricing behaviour;
the purchasing specialist negotiates with them over the network. The result is **always a draft
purchase order** that a person approves, edits or rejects. A review step checks each deal against
budget, margin, past commitments and payment terms, and says "cannot verify" rather than guess.
**Labelled as simulated everywhere** (UI, video, deck, README). Any savings figure is a measured
result on synthetic data, not a market claim.

**Rationale.** Founder decision (D-017, resolving spec OQ-I). `CLAUDE.md` rule 5.

**Consequences.** Supplier services are Cloud Run services in the Cup deployment.

## R8 · Agents: domain skills, ADK sub-agents on demand, router + specialists; cite or abstain (9 Oct 2026)

**Decision.**
- Domains are modules (instructions, tools, graph scope, watchers, output schemas). By default one ADK
  agent loads the domain skills it needs; deep cross-domain questions fan out to domain sub-agents in
  parallel. **Presented as a router plus specialists.**
- **Watchers are SQL detectors first**; only findings above a severity threshold get an LLM narration.
  No LLM call per event.
- **Numbers come only from SQL.** Every number shown traces to a SQL snapshot ID.
- **Cite or abstain.** Deterministic validators (number matches snapshot; cited ID exists and belongs to
  the tenant; quoted span is an exact substring) — on failure, "cannot verify".
- **Agents write only findings and drafts**, through core-api's findings/drafts endpoint. The intel
  database role has no write grant on the books.
- **Pixel-art back office** is driven by real trace events and sits on top of a full console (org chart,
  sheets, agent chats, per-agent track record). Nothing is staged; it replays real traces.

**Rationale.** Founder decision (D-016); R3 cost and safety research.

**Consequences.** Trace event schema is a contract (`packages/contracts`). The autonomy question
(auto-apply) is OQ-A, open.

## R9 · Environments: Supabase in dev behind ports; GCP adapters for the Cup (9 Oct 2026)

**Decision.**
- **Dev:** Supabase (Postgres, Auth, Storage, Realtime), reached **only through ports**.
- **Cup:** GCP adapters — Cloud SQL Postgres, Identity Platform, Cloud Storage, Pub/Sub + server-sent
  events from `core-api`, Secret Manager, Spanner Graph, Vertex AI Gemini. Region `asia-south1`.
- RLS keys on `current_setting('app.tenant_id')` set with `SET LOCAL` per transaction; the app connects as
  a non-owner role with `FORCE ROW LEVEL SECURITY`; **never `auth.uid()`**. **No `pgmq`, no `pg_net`.**
  Auth tokens are verified in `core-api` through the IdP port.
- **The Cup repo ships the GCP adapters only.** No Supabase, Vercel or AWS code in anything submitted.

**Rationale.** Founder decision (D-017, resolving spec OQ-H). The T&C requires a build "primarily using
the Google Cloud tech stack" (`docs/admin/cup-tnc-snapshot-2026-10-09.md`); `CLAUDE.md` rule 2 is
stricter (no Supabase in anything submitted) and is satisfied by shipping GCP adapters only.

**Consequences.** The public Cup repo must be a **separate, clean history** (this repo's history will
contain Supabase adapters). Added to the submission checklist. The shipyard `nextjs-supabase` profile's
PostgREST/`auth.uid()`/Supabase-Realtime rules do **not** apply; its universal, migration and testing
rules do.

## R10 · Stack (9 Oct 2026)

**Decision.**
- `apps/web`: Next.js + TypeScript, one codebase with shells `pos/`, `order/`, `console/`.
- `services/core-api` (Hono) and `services/core-worker` (same image: outbox relay, imports, posting
  jobs, schedules).
- `services/intel`: Python, Google ADK.
- `packages/contracts`: zod → OpenAPI / JSON Schema → TypeScript SDK and Pydantic; CloudEvents schemas.
- Cup runtime: Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub, Identity Platform, Spanner Graph,
  Vertex AI Gemini.
- A `Makefile` with `make up` brings everything up locally.
- Versions are pinned by probe in `docs/plan/` STACK, never from memory.

**Rationale.** Founder decision (D-016/D-017).

## R11 · Business model (9 Oct 2026)

**Decision.** Subscription tiers — **Core**, **Intelligence**, **Storefront** — **and** paid bespoke
frontends built on the public SDK (separate deliverables; never fork the core).

**Rationale.** Founder decision (D-016). Pricing hypothesis (₹1,500–3,000/outlet/month for
Intelligence) is unvalidated; ~10 owner interviews before setting prices.

## R12 · FalkorDB Graph Hacks is a separate product, coded from 15 Oct (9 Oct 2026)

**Decision.** The FalkorDB Graph Hacks entry (15–18 Oct) is a **separate product in a separate repo,
coded from 15 Oct**. Munim's FalkorDB adapter is **not** that entry and must not be resubmitted as it.

**Rationale.** FalkorDB rules 3 and 8 (graph must be core; main coding begins after the event starts);
the Cup repo's public history would disqualify it (spec §14).

## R13 · Hard rules carried from `CLAUDE.md` (9 Oct 2026)

**Decision.** Fresh code only (nothing from `projects_26`, nothing from third-party repos — Snacky Shack
and others are ideas only: no code, schema, or table/endpoint names). Google Cloud only for anything
submitted. Nothing proprietary from Juspay; public knowledge and synthetic data only. Simulated means
labelled. Team eligibility is checked before any contributor is added. No push, no remote — the founder
creates the public Cup repo.

**Rationale.** Event T&C + `CLAUDE.md` rules 1–7.

## R14 · Process: SHIPYARD-PROMPT governs (9 Oct 2026)

**Decision.** `SHIPYARD-PROMPT.md` governs this build; `INITIAL-PROMPT.md` and `docs/00–05` are
history. The planning corpus lives in `docs/plan/`; the append-only build journal is `docs/DECISIONS.md`;
`docs/01-decisions.md` remains the pre-ledger decision record.

**Rationale.** Founder answer, 9 Oct 2026 (D-018).

## R15 · The One Guarantee (9 Oct 2026)

**Decision.** **"Nothing changes the books without a named person's approval, and every number shown
traces to a ledger row."** It sits at the top of `CLAUDE.md`. Every ticket's review carries a
guarantee-scan section with both clauses checked, stated even when clean. "The books" means every
core-owned record: ledgers, stock, prices, catalogue, rosters/payroll, customer records and outbound
messages. "Traces to a ledger row" means a SQL snapshot ID whose rows can be opened from the UI; a
number that cannot trace is replaced by "cannot verify".

**Rationale.** Founder chose the spec candidate (recommended) over traceable-only, approval-only and
tamper-evident-only (OQ-B). Both clauses are mechanically checkable: the intel DB role has no write
grant (clause 1); the validator rejects any number not equal to a snapshot value (clause 2).

**Consequences.** Red-proven gates required for both clauses: (a) an attempted write from the intel role
fails; (b) an answer containing a number absent from its trace's snapshots is replaced by "cannot verify".

## R16 · Autonomy: no auto-apply anywhere in v1 (9 Oct 2026)

**Decision.** Every draft — including prep lists and draft rosters — waits for a named person's
approval. No auto-apply path is built. Per-category opt-in is a roadmap item only, not built. The
`CLAUDE.md` product rule allowing low-risk auto-apply is amended accordingly (done 9 Oct).

**Rationale.** Founder chose the recommended option (OQ-A). Simplest to build and to guarantee; aligns
with R15. Rejected: opt-in built now (more paths to test), keeping the CLAUDE.md rule (contradicts R15).

**Consequences.** Agent outcome checks report evidence only; an agent's autonomy never grows.

## R17 · Team roster is submitted; founder is the sole code reviewer (9 Oct 2026)

**Decision.** The teammate's information is already submitted on the Cup roster; no roster change is
planned before the 11 Oct close. The plan assumes the founder alone reviews code; the teammate has no
code lane unless the founder assigns one later.

**Rationale.** Founder answer to OQ-D ("Teammate information is submitted"). Interpretation stated in
one line in the clarify round; correct it if wrong.

**Consequences.** Lane plan has one human review gate. Submission checklist keeps the eligibility note.

## R18 · Cup scope: pure dependency waves, no slice (9 Oct 2026)

**Decision.** No Cup slice is defined. The board builds spec §4 in **dependency waves** until feature
freeze; whatever is green on the live URL ships. Wave 1 is the walking skeleton (SHIPYARD §6). Within
dependency order, work that the three demo stories need goes first (SHIPYARD §6), but no pack is
excluded or deferred by decision. A feature freeze is still needed for video, deck and hardening: the board
sets it as the last wave boundary (assumption: freeze ~16 Oct; the founder can move it).

**Rationale.** Founder chose the widest option over the recommended "stories deep + 8 desks real".
Risk named once: the demo depends on what finishes, and later packs may be thin. Both halves recorded.

**Consequences.** The demo script is written against the stories but each beat has a fallback beat that
uses only earlier-wave features. Unfinished tickets stay on the board, never shown in the demo.

## R19 · Two-pass docs; wave-1 deploy target 11–12 Oct (9 Oct 2026)

**Decision.** Planning corpus in two passes. **Pass 1** (~12 h): PDR, the One Guarantee section of
`CLAUDE.md`, HLD + ADRs, schema-as-contract, agent framework, the board for wave 1 and the demo-story waves.
Build starts when pass 1 is ratified (~10 Oct). **Pass 2** (remaining pack specs, screens, flows, design
system, art pipeline, evals, delivery docs) is written while wave 1 builds. The wave-1 skeleton deploy to
Cloud Run targets 11–12 Oct, meeting `CLAUDE.md`'s 12 Oct public-URL rule.

**Rationale.** Founder chose the recommended option (OQ-C timing). Rejected: full corpus first (misses
12 Oct), minimal docs (rework risk).

## R20 · Realtime via Postgres LISTEN/NOTIFY → SSE (amends R9) (9 Oct 2026)

**Decision.** `core-api` streams server-sent events (kitchen display, brief/inbox, back-office traces)
from Postgres `LISTEN/NOTIFY` fired by the outbox, one listener per instance, replaying missed events by
`Last-Event-ID` from the outbox table. **Pub/Sub stays for core → intel event delivery.** R9's "Pub/Sub +
server-sent events" is amended to this. Same mechanism on Supabase and Cloud SQL; no `pg_net`/`pgmq`.

**Rationale.** R4 K5: Pub/Sub subscribers stall on request-billed Cloud Run (CPU throttled between
requests). Founder chose the recommended option over always-on billing (~$50/month) and polling.

**Consequences.** NOTIFY payloads carry only an outbox id and tenant id (payload limit 8 KB; tenant data
never rides in the notification); the SSE handler re-reads through RLS. SSE requests are re-established
before Cloud Run's 60-minute request cap.

## R21 · Config-driven country packs and a platform master admin (9 Oct 2026)

**Decision.**
- **Country is one setting.** A business selects a country pack; that single choice drives currency and
  minor units, tax rules (GST IN 5%/18% and Sec 9(5) aggregator handling; GST AU 10% inclusive), invoice
  and receipt rules (FSSAI number on IN bills; ABN + "tax invoice" + GST amount on every AU receipt),
  number/date formats, IANA time zones, aggregator import formats (IN: Swiggy/Zomato-shaped; AU: Uber
  Eats/DoorDash-shaped — Menulog exited), compliance calendar templates, chart-of-accounts template,
  payroll scope (AU: rosters only, no payroll) and surcharge rules (AU: none). **No country logic in
  code paths** — code reads the pack.
- **Packs are versioned data** with effective dates, validated by schemas in `packages/contracts`,
  shipped for **IN and AU** in the Cup build.
- **A platform master admin console** (Munim operator, not the merchant) manages, as config: country
  packs, plans/tiers and feature flags (Core, Intelligence, Storefront), tenant provisioning, per-tenant
  LLM budgets, model-role mapping and kill switches. Every config change is a draft approved by a named
  operator and audited — R15 applies to platform config too.
- **Integrity rule:** a business's country can be flipped freely until its first posted ledger entry;
  after that, the flip is refused (books never change currency). The demo shows the flip on a fresh
  tenant, and the AU world is seeded through the same flip.

**Rationale.** Founder free-text answer to OQ-G: "we are config driven, we should have this much
flexibility to provide merchant in that country, with only one country flip. Config driven master admin
dashboard." The integrity rule is the orchestrator's addition, derived from R15; flag it if unwanted.

**Consequences.** New surface: platform admin shell in `apps/web` (e.g. `admin/`). A `platform` schema
outside tenant RLS, reachable only by an operator role. Pass 1 schema includes country-pack and config
tables.

## R22 · Supplier RFQs and counter-offers are non-binding; only a committed PO is a book change (9 Oct 2026)

**Decision.** Requests for quote and counter-offers sent to **simulated** supplier agents over A2A are
non-binding and outside "the books" (R15). The purchasing specialist may negotiate without prior approval.
Every RFQ, quote and counter-offer is traced and visible in the back office and cited in the resulting
**purchase-order draft**, which waits for a named person (R7, R16). No message to a real external party is
ever sent without approval; this ruling covers only the simulated supplier agents.

**Rationale.** Founder chose the recommended option over approving each negotiation.

**Consequences.** R15's "outbound messages" means messages to customers, staff and real external parties.

## R23 · Three simulated suppliers in one Cloud Run service (amends R7) (9 Oct 2026)

**Decision.** One Cloud Run service (`suppliers-sim`) hosts three A2A agents, each with its own path,
agent card (advertising the public https URL, never `localhost`) and pricing personality. Negotiation is
still a real network call from `intel` with a Cloud Run ID token (`roles/run.invoker`). R7's "separate A2A
services" is amended to "separate A2A agents in one service".

**Rationale.** R4 K6; founder chose the recommended option. Four services instead of six.

## R24 · R21 additions confirmed (9 Oct 2026)

**Decision.** The founder confirmed the three orchestrator additions in R21: the master admin is a Munim
operator console, not merchant settings; operator config changes are approved drafts and audited; a
business's country flip is refused after its first posted ledger entry.

## R25 · Intel has no database write grant; every intel write goes through core-api (amends R8) (9 Oct 2026)

**Decision.**
- The `intel` service holds **no write grant on any Postgres table**. Every intel output — claims,
  entities, aliases, edges, embeddings, wiki page versions, forecast runs, trace events, findings and
  drafts — is written through **core-api's internal intel API** (`/internal/intel/v1/*`, service-to-service
  auth, batch endpoints for high-volume writes such as traces and claims). core-api validates and writes.
- **SQL snapshots are minted by core-api**: intel's `sql.query` tool calls a core-api endpoint with an
  allow-listed read-only template ID and parameters; core-api runs it under RLS, stores the rows with a
  hash, and returns rows + snapshot ID. Any number intel shows must come from such a snapshot.
- Intel keeps a **read-only** role for text retrieval only (wiki, claims, full-text and vector search)
  through views in an `intel_ro` schema.
- **The citation/number validator runs in core-api** on every finding, draft and answer envelope before it
  is stored or shown; intel may pre-check to retry or abstain, but core-api decides.
- **Numbers are rendered, not written:** model output refers to snapshot cells (`⟨snap:ID·row·col⟩`) and
  the renderer substitutes values; a free-standing digit in model prose fails validation → "cannot verify".
- The graph store (Spanner Graph / FalkorDB) is a projection outside Postgres; intel's projector writes it
  directly from events received from core. It is neither the books nor evidence.

**Rationale.** Founder chose "everything via core-api" (strictest) over the recommended who-mints-truth
design and over a simple three-schema split. The snapshot-minting, core-side validator and rendered-numbers
rules carry over from the recommended design because they are what makes clause 2 of R15 hold; the
founder can strike them. Cost accepted: more internal endpoints and slower ingestion (mitigated by batching).

**Consequences.** R8's "agents write only findings and drafts" is amended: intel writes nothing to the
database directly. W1 gates: (a) a write attempted with intel's DB credentials fails; (b) an answer with a
free digit or a snapshot ref that does not resolve is replaced by "cannot verify". Both red-proven.

## R26 · Guarantee clause 2 scope: rows trace as themselves; snapshots for intel and aggregates (9 Oct 2026)

**Decision.** A number on a core screen that *is* a record's own field (order total, receipt line, tender,
ticket timer, tracker state, a stock movement's quantity) traces by being that row, openable in one click.
**Snapshot refs are required** for every number that intel says (envelopes, findings, drafts, brief, wiki,
answers, back-office labels) and for every dashboard or aggregate number (sums, ratios, P&L, ₹ found).
Draft payload numbers proposed by intel are refs too (a snapshot cell, a quote row, a document span),
resolved by core-api at insert and shown beside the value; a person's edit is labelled as typed by them.

**Rationale.** Founder chose the recommended option over "snapshots everywhere" (heavy on the POS path).

## R27 · Named person: a member's own command is its approval; command authority table (9 Oct 2026)

**Decision.** A *named person* is a signed-in identity acting as itself: a member (owner, manager, staff,
advisor) for tenant books; a customer only for their own order, coupon use and profile; an operator only
for platform config and tenant provisioning. A member's own command (refund, waste log, count, price edit)
**is** its approval, gated by `core.command_authority(command_type → minimum role, scope)`; approving a
draft is checked against the **final** payload after any edit. Judges get **one ephemeral named member per
demo session** (e.g. "Judge 7f3a (demo)"), never a shared account. No four-eyes rule in v1.

**Rationale.** Founder chose the recommended option over four-eyes for money.

## R28 · Each import run is a draft (9 Oct 2026)

**Decision.** Every import (payout, bank/UPI statement, POS export, Tally, aggregator orders) parses into
a staging preview — rows, ₹ total, rows quarantined, control-total match — and becomes a **draft**; on
approval the rows commit under the approver's name and derived postings carry that decision. A file
format's column mapping is also an approved draft, and the mapping grammar is **column renames plus
declared units only — no arithmetic**. Raw documents and quarantine rows are not books.

**Rationale.** Founder chose the recommended option over approving a format once.

## R29 · "The books" is a closed tag list (9 Oct 2026)

**Decision.** Every `core` table is tagged `book` or `operational` in its migration (table comment
`munim:book` / `munim:operational`), checked by a test.
- **Book:** money (journal, postings, tenders, refunds, settlements, bank lines, expenses, payables,
  receivables, budgets, tax drafts), stock (movements, batches, counts, waste), prices and catalogue (items,
  variants, options, recipes, prices, deals, coupons), rosters/payroll/advances/tips, customer and loyalty
  records, licences, purchase orders, supplier invoices, tenant/outlet/membership/country, outbound
  messages to customers, staff or real external parties.
- **Operational:** outbox publish state, device heartbeats, pickup-window counters, command log, kitchen
  ticket progress, import staging and quarantine, documents, conversations, drafts and decisions, audit log.
- A trigger on every book table refuses a write unless `app.role` is a member role with `app.member_id`
  set, or `app.decision_id` points at an approved decision, or `app.posting_rule` names an allow-listed
  deterministic rule whose source document is itself book-approved. Service roles get no grants on book
  tables beyond what that trigger admits.

**Rationale.** Founder chose the recommended option over moving operational state out of core.

## R30 · Country is fixed at onboarding (amends R21, R24) (9 Oct 2026)

**Decision.** A business chooses its country pack during onboarding (`tenancy.provision.v1` / the onboarding
flow). When onboarding completes (`core.tenant.onboarded_at` set), `country_code` and `base_currency` are
immutable — a trigger refuses any later change. Every currency-bearing row still asserts
`currency = tenant.base_currency`. The demo shows the country choice on a fresh sign-up (IN vs AU), not a
later flip. Replaces R21's "flip until the first posted ledger entry" and R24's third bullet.

**Rationale.** Founder answer: "On boarding". Simpler than any lock trigger; no stale-currency rows possible.

## R31 · Development runs on a hosted free Supabase project; Docker, Homebrew Postgres and gcloud deferred (9 Oct 2026)

**Decision.**
- Dev database, auth and storage = **one hosted free Supabase project** (region Mumbai) created by the
  founder; credentials only in a local, git-ignored `.env` (template `.env.example`). No Docker, no Homebrew
  Postgres, no local Supabase stack.
- `make up` runs the services as local processes against that project. Migrations and LISTEN use the
  direct/session connection; app pools may use the transaction pooler (`SET LOCAL` works there; LISTEN does not).
- **Plain-Postgres verification is deferred to Cloud SQL** (founder choice). Until then a **static gate**
  refuses Supabase-only constructs in `db/` (`auth.*`, `storage.*`, `pgmq`, `pg_net`, `supabase_*`,
  `graphql`, any extension not on the Cloud SQL list) and is red-proven by a planted construct.
- FalkorDB, Spanner and Pub/Sub emulators are not run locally; the in-process publisher is used in dev.
  Graph-adapter work (W2) uses whatever runs without Docker, or waits for GCP.
- **gcloud lands later.** All deploy tickets (T-011b, T-011c) are blocked until it does. The `CLAUDE.md`
  "public URL by 12 Oct" rule is amended to "first public URL as soon as gcloud is set up" (founder
  deferral). Risk named once: the deploy date is now set by the founder's GCP setup, not by the build.

**Rationale.** Founder: "skip the gcloud and brew install, instead use supabase postgres for development for
now. gcloud lands way later." Recommendation to test on plain Postgres from day one was declined; recorded.

## R32 · Cloud SQL size: smallest tier, one instance per service (9 Oct 2026)

**Decision.** One Cloud SQL Postgres instance, `db-f1-micro`; core-api and intel `--max-instances 1`
(≈ 11 connections steady, ≈ 18 during a deploy, cap ≈ 25). Raise only on a measured need (founder spend
decision).

**Rationale.** Founder chose the recommended option after confirming one database serves everything.

## R33 · Pass 1 ratified; R20 amended to three id-only NOTIFY channels (9 Oct 2026)

**Decision.** The pass-1 corpus (`01-pdr`, `02-schema`, `03-architecture` + ADR-001…013, `04-agent-framework`,
`CLAUDE.md`, `BOARD.md`) is ratified with the changes in R30–R32. R20 is amended: SSE fans out from three
id-only channels — `munim_outbox`, `munim_trace`, `munim_inbox` — not only the outbox. The autonomous build
starts (SHIPYARD §7); the founder is asked only at escalations (hard rules, money, ledger, event rules) and
is the escalation point, not a per-diff reviewer (clarifies R17).

**Rationale.** Founder: "Ratify with changes" → changes confirmed as "just these".

## R34 · Product focus: standalone AI-enabled POS/ERP for individual outlets and small chains (9 Oct 2026)

**Decision.** This build delivers one complete product for **restaurants and shopkeepers — individual outlets
and small chains**. The store pack is first-class. Onboarding completes in minutes for one owner. Nothing in
this build is shaped by the AI Builder Cup or FalkorDB; the founder forks event repos later. Amends R2's
go-to-market segments (2–5 outlet groups and cloud kitchens remain supported, not the lead).

**Rationale.** Founder: "just focus on delivering a world class ai enable pos/erm … for the restaurant and shop
keepers (We are targeting individual and small chains)". Spec: `docs/superpowers/specs/2026-10-09-munim-standalone-reset-design.md`.

## R35 · Agnostic architecture for the standalone build (amends R6, R9, R20, R23) (9 Oct 2026)

**Decision.** Any Postgres, no vendor features (R31 gate). Graph port with **Postgres edge tables as the default
adapter**, FalkorDB optional, no Spanner. Events: outbox → in-process publisher in core-api after commit → HTTP
push to intel `/events`; a long-running `core-worker` process sweeps unpublished rows and runs cron (watch sweep,
brief, nightly) and the per-tenant fan-out — no Pub/Sub, no Cloud Scheduler. SSE from LISTEN/NOTIFY over a
direct/session connection. Identity and storage: Supabase Auth/Storage behind ports; `idp-local` for gates.
Suppliers-sim is one local service. Hosting target chosen later.

**Rationale.** Founder chose "any Postgres + graph as a port" and directed provider/DB agnosticism.

## R36 · AI runtime: ADK 2.11 with native provider adapters, no LiteLLM; provider per role (amends R10, ADR-010) (9 Oct 2026)

**Decision.** `google-adk==2.11.0` pinned. Gemini via ADK's native class; OpenAI, OpenRouter and NVIDIA via
ADK's `OpenAILlm` (`base_url` + `api_key`), with a thin subclass where a provider needs request quirks. **No
LiteLLM**: never install ADK's `[eval]`, `[extensions]`, `[all]` or `[test]` extras; a red-proven lockfile check
fails if `litellm` appears. The operator assigns provider + model per role (router, reason, extract, narrate,
vision, embed) in the platform admin (`platform.model_role`); merchants never see providers. The eval harness
runs the same suites across providers and prints a comparison. Keys in `.env`: `GEMINI_API_KEY`,
`OPENAI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`. All gates still run `MUNIM_MODEL_MODE=recorded`.

**Rationale.** Founder chose ADK + native adapters over Pydantic AI and an in-house loop (R5 research).

## R37 · Event-specific entries parked; CLAUDE.md rule 2 scoped to the future Cup fork (9 Oct 2026)

**Decision.** Parked, not repudiated (revived when a fork is made): the Spanner-for-the-Cup part of R6; R9's GCP
adapters; R19's deploy target; R23's Cloud Run wording; R31's gcloud/deploy bullets; R32 (Cloud SQL size);
ADR-012 and `make export-cup`; Cup delivery tickets. `CLAUDE.md` hard rule 2 ("Google Cloud only") binds the
Cup fork, not this standalone build. R12 (FalkorDB entry is a separate product from 15 Oct) is reaffirmed.
Other hard rules (fresh code, no Juspay knowledge, no reuse of references, simulated means labelled) still bind.

**Rationale.** Founder: "no ai builder cup no fulkan db" for this build; "I will fork it … some other time".

## R38 · Process: per-wave testing and per-wave adversarial review (9 Oct 2026)

**Decision.** For this build the per-ticket loop (RULES §7) becomes per-wave: all tickets in a wave are built in
parallel lanes → a **wave test run** (every ticket gate + cross-ticket integration, quiet tree) → **one
adversarial review of the whole wave**, with a One-Guarantee scan → ≤ 2 fix cycles → commits by ticket → next
wave. Fully autonomous; the founder is asked only for money, hard rules, the ledger, or a blocker only they can
clear.

**Rationale.** Founder: "build all the tickets in wave, testing per wave, adversarial review properly of entire
wave and then to next. It should be mostly autonomous."

## R39 · Board rewritten backend-first; morning target (9 Oct 2026)

**Decision.** `docs/plan/BOARD.md` is replaced by a complete board: W0 setup, W1 foundation, W2 core modules,
W3 intelligence backend, W4 frontends, W5 evals/e2e/polish + sweep, covering all of spec §4 (nothing deferred to
an unwritten round). Target: W1 and W2 green and W3 under way by 10:00 IST, 10 Oct — contingent on W0.

**Rationale.** Founder: "build the most of the backend by tomorrow morning 10:00 AM … rewrite the tickets and
waves properly and completely."

## R40 · Number-rule scope rulings C1–C7 (3-agent council; amends R15/R26 scope) (9 Oct 2026)

**Decision.** (Majority of three council members; dissent below.)
- **C1 Preview and tender.** `POST /v1/orders:preview` runs core's one pricing function and **writes nothing**
  (no order, outbox, window booking, coupon use or stock). Each line cites the `price`/`option`/`deal`/`coupon`
  rows and pack tax-rule version it used, as openable refs; labelled "Preview". Placement re-prices; a different
  total is flagged before commit. The tender row stores `tendered_minor` and `change_minor`; "Remaining" is
  computed by core from the order row and that order's tender rows in one read. The client never computes them.
- **C2 Loyalty balance.** Each `loyalty_entry` stores `balance_after`, set by core under the per-customer row lock;
  the balance shown is the latest entry's `balance_after` (a row's own field); the full list stays openable.
- **C3 Count badges.** A badge is the length of the list the client holds from the same response, same RLS and
  outlet scope, and opens that list; a capped list shows "N+". A separate server count, or a count with no openable
  list, needs a snapshot.
- **C4 Member-minted snapshots.** `POST /v1/snapshots {template_id, params}` mints allow-listed migration templates
  for a member; tenant and outlet scope come from the verified member token (intersected with params, never from
  params alone). `evidence.snapshot` gains `minted_by_member_id`; exactly one of `run_id` / `minted_by_member_id`
  is set; `munim_core` gets INSERT on `evidence.snapshot`. `GET /v1/snapshots/{id}` checks outlet scope **and** the
  template's minimum role; a snapshot wider than the viewer's scope renders "Cannot verify" for that viewer. The
  same pattern serves operators on `/platform/v1` (`minted_by_operator_id`) for admin aggregates.
- **C5 Numbers about the AI.** The template numeric-source allow-list becomes **column-level**. From
  `intel.outcome` and `intel.answer` only row counts and core-set columns (`answer.abstained`, `reason_code`,
  outcome-check status) are allowed; `finding.confidence_bp` and any intel-supplied value are excluded (show
  confidence as a band, never a figure). Track record comes from `core.decision`. An outcome's measured effect is a
  core-template snapshot ref stored on the outcome row. `intel.intel_spend` was already allowed.
- **C6 Order-status messages.** The live tracker (SSE `order:<id>`) shows row fields only. Each status email/SMS is
  a book row in an outbound-message table, created only by an allow-listed derivation from the member's status
  command (`order_event`) or the customer's own placement, from a fixed i18n template whose numbers are row fields;
  no model text; intel never triggers one. **Channel and provider (email now? SMS?) are the founder's money call**
  — until decided, only the in-app tracker ships. WhatsApp stays banned (R5).
- **C7 Expired stock.** At placement core refuses a sale whose FEFO pick draws from an expired batch (business date
  in the outlet's IANA zone); a batch-tracked item with only expired stock cannot be sold by going negative. Override
  `inventory.expired_sale.override.v1`: a manager or owner signed in as themselves, reason code + note, bound to
  one order line, batch and quantity, single-use, cited in the movement's `origin`. Whether the override exists at
  all is a **country-pack flag `expired_sale_override` (default `false` for IN and AU)** — food-safety caution.
- Orchestrator derivation (same logic): import preview totals are computed by core over the staging rows returned
  in the same response.

**Rationale.** Council of three, identical prompts, 9 Oct 2026. Votes: C1 MODIFY 3/3; C2 MODIFY 3/3 (2 for
`balance_after`); C3 ACCEPT 1, MODIFY 2; C4 ACCEPT 2, MODIFY 1 (hygiene adopted); C5 MODIFY 3/3; C6 MODIFY 3/3
(channel to founder); C7 MODIFY 3/3. Dissent recorded: one member held C2 should instead be "full list in one
read, sum must match"; one contested any council say on channel choice (adopted — sent to founder); two raised
FSSAI/use-by legality for overrides (adopted as the default-off pack flag).

**Consequences.** Riders: T-022 (preview route, tender columns), T-028 (`balance_after`), T-024 (expired refusal +
override), T-040 / T-031 (member and operator mint routes, role check), T-060 (badge rule in the renderer), M-A /
M-B (columns, grants, check constraints), contracts (new commands and reason codes).

## R41 · End-customer identity: one login, per-merchant profiles (10 Oct 2026)

**Decision.** A merchant's customer signs in with one identity (an IdP user, same email everywhere), but each
merchant holds its own separate `core.customer` profile (tenant-scoped, RLS) with its own consents, order history and
loyalty; nothing is shared or visible across merchants. `core.customer.idp_sub` (nullable) links the profile to the
login; unique per tenant. The first sign-in at a merchant creates that merchant's profile by the customer's own
command; a guest profile with the same verified email is merged into it (guest orders claimed). Customers can view
and edit their profile and consents, see their order history and loyalty (`balance_after`, R40), request a data export,
and request erasure (personal fields anonymised; legally required book rows such as orders and invoices are kept with
the customer reference anonymised). Customer tokens act only on that customer's own rows in that merchant (R27).

**Rationale.** Founder chose the recommended option. The merchant is the data fiduciary for its customers.

## R42 · Customer sign-in: email OTP / magic link + Google (10 Oct 2026)

**Decision.** Supabase Auth behind the `IdP` port provides email OTP / magic link and Google sign-in for customers
(free); guest checkout remains. Phone OTP waits for an SMS-provider decision (money). Gates use `idp-local`.

**Rationale.** Founder chose email OTP + Google sign-in.

## R43 · Developer platform scope: SDK only, for now (10 Oct 2026)

**Decision.** The public, versioned `/v1` API plus `@munim/sdk` — a typed TypeScript client with auth helpers for
member and customer tokens, the storefront key, and the fetch-based SSE reader — packaged so a custom or third-party
frontend can be built with it (docs + a minimal example storefront that uses only the SDK). **Not now:** developer
API keys and scopes, OAuth apps, signed webhooks, per-key rate limits, dated API versions. Public storefront routes
keep their abuse protection (per-IP + storefront-key rate limiting, 03-arch §6) — that is security, not a developer
feature.

**Rationale.** Founder chose "SDK only" over the full developer platform (recommended) and keys-without-webhooks.
Both halves recorded; the full platform remains a later round.

---

## R44 · Demo data: dev-only local sign-in, dated history via approved imports, fast seeding (10 Oct 2026)

**Decision.** (a) A **dev-only local IdP selector** (`MUNIM_IDP=local`) lets `make up` accept idp-local tokens so
`make seed` / `make demo` run without real Supabase sign-ins. It is an explicit opt-in, refuses to start outside a dev
environment (production mode → boot failure), logs loudly at boot, is reported by `/health`, keeps its signing key under
`.run/` (never committed), and lives under `adapters/dev/`. Supabase Auth stays the R42 path for every real sign-in.
(b) **Dated (synthetic) history arrives only through the approved-import path** (R28): new history import kinds (POS
bills with lines/channel/brand/customer, waste, stock counts, shifts and tenders, refunds/voids as applicable) commit
under a named approver's decision, keep their own business dates, take no live invoice/ticket numbers, respect closed
periods, and are labelled synthetic. Live commands (`orders.place.v1`, waste, refund, shift, count) never accept a
backdated time. (c) **Seeding must be fast**: a measured target per world against the hosted dev DB, achieved by
server-side batching inside the import commit (core-domain logic unchanged, guard triggers still fire per row) and by
seeding worlds in parallel — never by reordering a world's own request log (worldgen determinism gates stay).

**Rationale.** Founder: "I guess we can do this, also for a demo it will be great, plus we can have dated mocked
history. Plus it is taking too much time to seed the DB." Backdating live commands was rejected (orchestrator +
advisor): it would break invoice/ticket sequencing, shift reconciliation and closed periods, and let a cashier rewrite
the past without an approver (One Guarantee clause 1).

---

## R45 · Intelligence-layer architecture: ADR-014 ratified with founder decisions F1–F7 (11 Oct 2026)

**Decision.** `docs/plan/adr/ADR-014-intelligence-layer.md` (Opus synthesis of research R6a/R6b/R6c, one independent
review `ADR-014-review.md`, revised) is ratified as the W3 architecture, with:
- **F1 — investigations:** member-triggered `:continue`; core-run playbook; deterministic verdicts; completion needs a
  balanced margin bridge with a bounded residual. Cron auto-continue deferred until member-triggered steps are in use (superseded by F10).
- **F2 — decision models:** W3 uses the LLM-mimic adapter on the existing `router` role only, with a per-question
  egress allow-list; no new data processor. Jev / OpenAI Decisions only as a W5 bake-off under the §13.3 entry criteria.
- **F3 — tool cap:** ≤ 20 tools per context (R3's evidence; 04 §2's "12 (FACT)" was mislabelled); `propose_*` bound only
  on `draft_request`; T-070 measures accuracy at 10/15/20.
- **F4 — negotiation (founder: "a mix of both"):** **AI picks moves, rules bound them.** Rules hold the hard limits
  (target and walk-away price, max rounds, allowed concessions); each round the AI chooses accept / counter / walk away
  from the rule-allowed set (a typed choice) and writes the message; supplier replies are read by the no-tools
  extractor into typed fields (untrusted, run is tainted); the deal review is deterministic; the PO is a draft a person
  approves. RFQs stay non-binding to simulated suppliers (R22). This is the reading of R7/R22's "the purchasing
  specialist negotiates".
- **F5 — fan-out:** ≤ 4 read-only branches for `investigate`; budgets re-based on T-059 measurements; if unmet, W3 ships
  single-agent and keeps fan-out for the demo S1 path.
- **F6 — fine-tuned Gemma:** **planned after W5, for intent routing** (founder overruled "not in v1"): needs training
  compute + hosting (founder money, approved in principle), a new provider value in `platform.model_role` (R36
  amendment at that time) and a labelled decision log (`intel.model_decision`).
- **F7 — graph store:** Postgres edges + recursive CTEs now; FalkorDB adapter later behind the same port.

**Rationale.** Founder chose via structured questions after reviewing the synthesis; recommendations accepted except F4
(hybrid) and F6 (fine-tune after W5).

**Addendum F8 — specialists (11 Oct 2026, founder).** Munim has **8 named specialist agents as domain team members**,
one per existing pack: Menu & Pricing (catalogue), Kitchen, Inventory & Purchasing, Finance, People, Customers & Growth,
Compliance & Assets, Market & Strategy; Forecast is a shared service; the orchestrator is the "Manager" at reception.
Each specialist **owns** (a) its fixed-path workflows in code (watchers, detectors, playbooks, draft mappings, its share of
negotiation per F4), (b) its **skill** (instructions + typed read/propose tools + templates) that the Manager loads for
questions, (c) an **identity** (name, role, desk, track record of approved/rejected/abstained findings and drafts) shown
in the back office and console, and (d) its own **evals** against the worldgen answer keys. Fan-out branches (F5) are
specialists acting read-only. The model runs only for narration and open questions (ADR-014 §0 lines 1–3 unchanged);
specialists are not eight always-on LLM agents (option B rejected) nor ADK workflow-agent subclasses (option C rejected:
ties us to ADK 2.x internals). Every trace, finding and draft carries its specialist as the actor.

**Addendum F9 — talking to specialists (11 Oct 2026, founder: "ask anyone manager answers and then individual too kinda
mix").** (a) **One main conversation**: ask anything, or address a specialist (`@Finance …`); the Manager routes, the named
specialist's skill does the work, and the answer is signed "Finance · via Manager". (b) **Each specialist also has its own
thread and desk page**: its findings, drafts, track record, and the conversations addressed to it, where you can keep
talking to that specialist directly. Both paths run through the same Manager-owned, core-validated answer path (one owner
of output, cite-or-abstain, number grammar); a specialist thread is not a separate agent with its own write path. Thread
context is bounded: a rolling, cited summary per thread plus the last few turns (context engineering per ADR-014 §6),
never an unbounded transcript; untrusted text in a thread taints the run as usual.

**Addendum F10 — investigation modes (11 Oct 2026, founder; amends F1).** Like Claude Code / Codex modes, the person
picks a mode per investigation: **Step** (default — press `:continue` each step), **Plan** (core shows the checklist,
specialists involved and estimated AI cost; the person approves the plan once, then every step runs without further
clicks), **Auto** (as Plan, and also resumes when new data lands, e.g. the next day's import, within a spend cap). In
every mode: steps are read-only (snapshots + narration) and the run stops at a draft, an abstain, the budget, or a scope
change; **every draft still needs a named person's approval (R16 unchanged)**; the creator's outlet scope is re-intersected
with current membership at each step and the investigation is cancelled if access is gone (review M7); verdicts and
completion stay deterministic. **Who:** the owner sets the highest mode per role and the tenant's monthly AI spend cap
(e.g. owner ≤ Auto, manager ≤ Plan, staff ≤ Step); each person picks within that. Auto requires core-worker scheduling
(core territory), so it is built after Step and Plan.

**Addendum F11 — open items O-1, O-2, M-C1d (11 Oct 2026, founder).**
- **O-2 (money) — AI spend cap:** the effective monthly cap is the **lower of** the owner's cap and the operator's
  `platform.llm_budget.limit_minor`; an owner cannot set a cap above the operator's limit (refused).
- **O-1 — Auto authority:** choosing Auto creates a **standing grant** from that member: limited to read-only steps of that
  one investigation, within the member's outlet scope, revocable, re-checked against current membership at every step,
  cancelled when access changes. Needs a new run trigger kind and a small schema change (migrator; additive).
- **M-C1d — guard binding:** approved: the book guard requires every derived row to belong to its source record
  (non-additive security tightening). Ships only after every existing flow, the integration suite and all four worldgen
  worlds run against it; anything it would newly refuse is reported before it lands.

---


## R46 · Munim Cares: surplus and near-expiry food for donation (founder, 11 Oct 2026) — W5, scope open

**Decision (founder).** A standalone feature, built in **W5**: surplus food and items close to expiry are listed on a
public **Munim Cares** page, and the intelligence layer helps the business decide what to donate, when and to whom, so
donations reach people in need. It is positioned and demoed as its own feature (hackathon highlight). **Scope, page
design and partner model are to be discussed with the founder after W3 closes** — nothing here is final beyond "build it
in W5".

**Constraints already binding (orchestrator notes, not new rules):**
- *The One Guarantee holds.* Publishing a listing or contacting a recipient is a message to a real external party
  (R15), so every listing and every hand-off is an approved draft; the AI suggests, a named person publishes.
- *Simulated means labelled* (hard rule 5). In the build, recipients and NGOs are simulated or synthetic, labelled so,
  and any "meals donated" figure is a measured result on synthetic data.
- *Numbers trace.* Quantities and dates on a listing come from snapshot cells (stock, batch expiry, waste/overprep).
- *Inputs already exist:* `inventory.expiry_risk` (v2, with ingredient, unit and supplier), `inventory.dead_stock`,
  `kitchen.overprep`, the expiry/waste detectors (T-046, T-045) and the drafts/approvals path.
- *Open for the discussion:* food-safety and liability rules per country pack (IN, AU) — research them before any copy
  claims compliance (UNVERIFIED today); who the recipients are; whether the page is per-merchant or network-wide; how
  it fits the customer site (R41).


## R47 · W3 close founder decisions (founder, 11 Oct 2026, AskUserQuestion rounds)

| # | Topic | Decision |
|---|---|---|
| D1 | AI prices | **Operator sets per-role prices** (input/output per 1M tokens on each `platform.model_role`, an approved config draft, R24). Spend uses them; a live role with no price refuses live calls. Replaces the placeholder table. |
| D2 | No budget row | **Fail closed** — no `platform.llm_budget` row for the month → AI declines (`model_blocked`), rules still run; an owner cap needs a same-currency operator budget. Every demo tenant gets monthly rows. |
| D3 | Shop / non-recipe deals | **Margin from selling price** for items with no recipe (selling price − quoted unit cost); items with no selling price (packaging) skip the margin rule and are judged on need, budget and minimum order. |
| D4 | Auto cadence | **Resume only when data changed** — the daily pass steps an Auto investigation only if a relevant import or new data arrived since its last step. |
| D5 | Unscored fan-out | **Ask before fanning out** — on an unscored routing guess the Manager answers single-agent and offers "dig deeper across specialists?" as a one-tap follow-up; a scored `investigate` may fan out. |
| D6 | P2 overstaffing rate | **The extra staff's rate** (people beyond the demand norm), not the blended crew rate. |
| D7 | Negotiation bounds | **Owner setting per business** (business policy), default **95% target / 110% walk-away** when unset. |
| D8 | OpenRouter / NVIDIA | **Pick the best free model per role**, probed: list free models, choose by capability (tool calling, JSON/enum output, context), one tiny live check each, recorded as fallbacks behind Gemini. |
| D9 | Demo targets | **Labour 30%, margin 65%** for the demo businesses, set through the owner's own `tenancy.policy.set.v1`. |
| D10 | Role mode defaults | **Advisor Step, judge Plan** (owner Auto, manager Plan, staff Step unchanged). |

Munim Cares (R46) scope stays open for the post-W3 discussion.

## R48 · Post-W3 founder decisions (founder, 12 Oct 2026)

| # | Topic | Decision |
|---|---|---|
| F-1 | Frontend split | **Integration kit first.** W4 becomes W4-K: SDK packaged, API reference + per-screen guides, AI contract + reference renderer + conformance check, one-command local dev kit with recorded AI, `/v1` frozen with a changelog. The screens are built in a **separate repo** against the kit (by the teammate or the founder), using only the SDK, the API contract and the AI contract. Backend changes after the freeze go through the changelog. |
| F-4 | AI price currency | **Prices per currency.** A role carries a price in each currency the operator sets (INR, AUD, …); a business is billed in its own currency (an Australian business sets and pays in AUD). No conversion and no FX table. A live call for a business whose currency has no price on that role is refused (as D1). |
| F-2 | Munim Cares (R46) | **Will be built** (AskUserQuestion, 12 Oct). Donations of cooked food, vegetables, perishables and other near-expiry stock. <ul><li>**Recipients:** listed NGOs / food banks the owner picks from (simulated in the demo and labelled); no open public claims, no individual volunteers in v1.</li><li>**Where:** one network Munim Cares page across all opted-in businesses (by city) **plus** a Cares section on each business's own storefront. Every listing is published by the owner's approval (R15: an outward message is a book change).</li><li>**AI:** spot surplus (near-expiry, overprep, forecast surplus → a listing draft), match recipients (distance, cooked/raw accepted, capacity, pickup window → ranked, the owner confirms), use idle staff (an overstaffed slot suggests packing/hand-over, linked to the labour detector), impact report (meals, kg, waste avoided — snapshot cells, labelled as measured on synthetic data).</li><li>**Cross-merchant deals = shared surplus offers:** a business may offer surplus to other businesses at a discount (B2B), not only donate. Joint supplier buying is out of Cares.</li></ul> |

**Cares design answers (founder, 12 Oct, on ADR-015's questions):** (1) B2B surplus offers are **record only** in v1 — price and total
on the offer/claim, labelled "Recorded, never processed"; no tax invoice, payable or receivable. (2) Recipients are **simulated only**
(DB-enforced, invented names, labelled). (3) **Build the network impact total** ("meals shared across Munim") as an operator-minted
public snapshot so it still traces to the ledger. (4) **Generic legal note only:** screens say "Check your local food-donation rules";
no researched legal claims, never "compliant" or "protected".

F-3, F-5…F-8 (HANDOFF-W3 §4) remain open.

## R49 · Integration kit and Munim site (founder, 13 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| K-1 | Scope | Add the **SDK (packaged), the API suite (developer portal) and the Munim landing page** to the build. The teammate receives the **website**, not the codebase. |
| K-2 | Teammate's sites | He builds **two customer storefront websites**: **Spice Route** (3-outlet restaurant group, Bengaluru, INR) and **Laneway Cafe Fitzroy** (Melbourne, AUD), from detailed docs in the portal. |
| K-3 | API access | A **mock API** served by the site itself (`<site>/mock`, contract-valid, synthetic data, two mock storefront keys) — zero setup, zero cost; the real API URL and storefront keys come later. |
| K-4 | Site shape | **One site**: landing page at `/`, Munim Cares at `/cares`, the API suite under `/developers` (reference from OpenAPI, SDK, guides, AI contract, changelog, downloads). |
| K-5 | Hosting | The founder deploys on **Vercel** — this standalone build only (R37). Hard rule 2 still binds the Cup fork: its site and services run on Google Cloud, no Vercel. The core API's SSE and the long-running worker need a long-running host, not serverless functions; that is decided when the real API is deployed. |

## R50 · Screens: the demo spine, built fresh (founder, 13 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| S-1 | No third-party UI | The founder proposed reusing an existing third-party site's frontend; refused under hard rules 1 and 4 and R13 (Snacky Shack stays ideas only — no code, assets, copy, schema or names). Every screen is written fresh in this repo. |
| S-2 | Libraries | Open-source libraries are allowed **only as npm dependencies** (lockfile diff read before commit). No registry copy-in of third-party component source (e.g. shadcn-style `add`). The Cup T&C (re-snapshot `docs/admin/cup-tnc-snapshot-2026-10-13.md`) is silent on libraries. |
| S-3 | Scope | **Demo spine only:** `packages/ui` + the web foundation (T-060); the **Spice Route** storefront at `/order/[key]` (T-063, one store; the route stays generic, so a second store needs data only); POS counter + tender + receipt (T-061); KDS board (T-062); console home + inbox + draft approval + Ask with citations (T-064, cut); Munim Cares console and approval (T-100). Every other W4 ticket (T-065…T-069, T-075, T-077) is deferred. |
| S-4 | AI in the demo | **Recorded replies only**, scoped to the Spice Route world and the Cares flow; unrecorded asks degrade to hidden (rule 11). Recording new demo fixtures needs one live run — the founder is asked before it (cost). |
| S-5 | Cup timeline | The founder confirms the Cup launched on or before 9 Oct 2026 (first commit 9 Oct 13:51 IST). |

## R51 · After the screens wave (founder, 13 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| A-1 | AI in the demo | **Live Gemini, with recorded replies as the backup.** Needs the founder's per-role AI prices (F-3) and a budget cap; amends R50 S-4. |
| A-2 | `GET /v1/me` | **Add it**: a read-only member route returning the caller's own member id, name, role and outlet ids, so the console, POS and Cares screens stop guessing scope (additive API contract, founder-approved). |
| A-3 | Clean-up | **Before the split**: ambiguous terms, internal plan references in code comments, structure — each step lands only with `make check` green; no risky moves near the deadline. |
| A-4 | Split / FalkorDB | **Do not split now; the founder will ask explicitly.** No event-repo or FalkorDB work until then. |

## R52 · Restaurant frontend reverted; re-plan (founder, 13 Oct 2026)

**Decision.** The founder rejected the W4-spine restaurant frontend ("whatever frontend you made is shit") and asked for it to be
reverted and the plan gone through again. Reverted in one commit: `apps/web` back to its pre-wave placeholder, `packages/ui`,
`e2e/` and `docs/plan/screens/cares.md` removed, `pnpm-lock.yaml` restored. The Munim site (`apps/site`) is untouched. Kept
(not frontend): worldgen Cares seed and demo-world provisioning (`is_demo = true`), the intel "basis points" wording, the
Makefile `next dev -H 127.0.0.1 -p 3000` fix, the site scan fix. The unfinished `GET /v1/me` lane was stopped and parked in
`git stash` ("T-102 /v1/me — unfinished"); R51 A-2 is on hold with the rest of the plan. The frontend approach is open.

## R53 · Frontend by the teammate from handoff packs; private GitHub repo (founder, 14 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| H-1 | Who builds the frontend | **The teammate (Manjeet) builds it from handoff packs** in their own repo (`IIITManjeet/Cobnut-Bakehouse`), against an in-app mock that follows the `/v1` contract exactly; only env vars change for the real API. The founder confirms Manjeet meets the eligibility rule (hard rule 6). Munim's role: the packs, the contract, the backend. Supersedes the R50 S-3 build plan; the storefront was built first (Cobnut Bakehouse, live on its own preview URL). |
| H-2 | Demo business | **Cobnut Bakehouse** (synthetic bakery, two Lucknow outlets: Hazratganj, Gomti Nagar), so the video runs customer → kitchen → owner in one brand. Outlets are kind `restaurant` (a bakery with a kitchen; the KDS board serves restaurants and cloud kitchens only). A Cobnut world is seeded into the real backend for filming. |
| H-3 | Owner screens | All four groups: counter (POS) + kitchen (KDS); owner home + approvals inbox; Ask Munim; Cares + suppliers. Spec'd in `docs/handoff/owner-screens/`. |
| H-4 | Look | **Same as Cobnut** (the teammate's warm patisserie look: cream, hazelnut, rose; serif display; outlined rounded cards; pill tags; scalloped edges). Owner screens reuse the storefront's tokens and components. |
| H-5 | SDK | The teammate uses `@munim/sdk` from the site's tarball URL (no registry); the storefront pack's "no SDK" line is superseded. A contract change ships as a **new versioned tarball** (`munim-sdk-<version>.tgz`); a published tarball is never overwritten, because a consumer's lockfile pins its integrity. |
| H-6 | GitHub | Code goes to a **private GitHub repo** (`SawhneySatvik/food-ops`). The founder creates it; Claude pushes `main` only when the founder says so, after a history scan for secrets. Amends CLAUDE.md "never push, never create a remote": still never create; push on the founder's word. |
| H-7 | `GET /v1/me` | Resumed (R51 A-2) as T-102: the owner screens need the caller's role and outlet scope. |

## R54 · One repo, production here first, then a lean Cup split (founder, 15 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| P-1 | Frontend | **Cobnut moves into this repo as `apps/web`, with Manjeet's commit history** (fetched by URL, no remote). His repo freezes; Claude owns the frontend from here. Amends R52 (apps/web) and R53 H-1 (teammate builds in their own repo). The handoff packs become history. |
| P-2 | Order | This repo is made **production-ready first**; the Cup split comes only after, so the two do not drift and every record stays here. The Cup repo is an export of this repo and is never edited by hand. Plan: `docs/plan/05-production-and-split.md`. |
| P-3 | Standalone hosting | **Vercel + Supabase now; Google Cloud at the split.** GCP adapters and infra are written in this repo and included in the export; hard rule 2 still binds the Cup repo. |
| P-4 | Cup repo contents | **Lean: only the code the live URL runs**, plus README and one architecture doc. Left out: plan, ledger, research, DECISIONS, handoff packs, admin, `apps/site`, `adapters/dev`, the AU pack, other worlds. On the founder's account, no Google or Hack2skill collaborators. (T&C: the repo must be public and hold the deployed source.) |
| P-5 | Licence and history | **No licence file** (all rights reserved). The Cup repo **keeps history**, filtered to the exported paths, with commit messages scanned. Amends R37's clean-history default. The FalkorDB repo starts from a **fresh history** (R12). |
| P-6 | SDK in `apps/web` | `@munim/sdk` as a workspace dependency; the versioned tarballs (R53 H-5) stay for outside builders. |
| P-7 | Mock | The in-app mock is dev and test only; production builds call core-api on the same origin (`/api/*` rewrite), which removes the CORS question. |

## R55 · Standalone production settings (founder, 15 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| S-1 | Demo sign-in | **Person picker; demo passwords stay server-side; reseed on demand.** Anyone can sign in as a demo person on the public URL, and the audit log records that person; every screen shows "Sample data". The books are append-only, so a messy demo is replaced by seeding a fresh Cobnut tenant and pointing the site at it. |
| S-2 | Vercel plan | **Hobby.** Events publish after commit inside each request; the catch-up sweep and scheduled jobs run once a day. |
| S-3 | Projects | Two new Vercel projects, deployed to production: **munim-cobnut** (`apps/web`) and **munim-api** (core-api, intel, suppliers-sim). munim-rho (`apps/site`, SDK downloads) is untouched. Vercel files live under `deploy/vercel/`, outside the Cup export. |
| S-4 | Database | The **existing hosted Supabase project** (migrations 0027–0029 applied there; the Cobnut world seeded there). Dev and demo share it. |

## R56 · Trimmed production gate, known gaps fixed, then both splits (founder, 15 Oct 2026, chat + AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| G-1 | Phase 4 | **Skipped:** the production-URL smoke pass with `make eval`, the screenshot set for visual sign-off, and the whole-frontend adversarial review (amends plan 05 phase 4 and, for this phase only, R38's per-wave review). **Kept:** every ticket's own gates (`make check`; `make test-db` when migrations change — CLAUDE.md verification gate) and the clean-up. Claude flagged once that the review is where guarantee breaches are usually found. |
| G-2 | Known gaps | **Fixed before the split** instead: shared blob store for uploads/imports, an idempotent tick (no repeated brief), the mock-only kitchen drafts made real where it can be done without weakening server-stamped times, and the first-deploy UNVERIFIED items. Plan: `docs/plan/06-gaps-and-split.md`. |
| G-3 | Splits | **Go for both:** the Cup repo on Google Cloud (plan 05 phase 5, detailed in plan 06) and the FalkorDB repo. **FalkorDB eligibility is the founder's call** ("will manage that"): Claude flagged once that a Munim-based entry conflicts with R12 and the event's rule 8 (main coding after 15 Oct) and rule 3 (graph as the core). R12 stays on record; the founder owns the submission decision. |
| G-4 | AI (F-3) | Gemini on the **free tier**; the founder creates a GCP API key for it. **No AI tests and no live runs**: every gate and the production deploys stay `MUNIM_MODEL_MODE=recorded`; live only on the founder's word. F-3 (prices, budget cap) closes as "free tier, recorded". **Amended same day (founder): the Cup's live URL runs live Gemini** (free tier, the founder's key via Secret Manager, spend cap per R47). Today an over-cap or failed call abstains (rule 11: template, never an error); T-125 adds a recorded fallback for calls that have a recorded fixture (the curated Ask questions), so free-tier rate limits during judging do not blank them. Every gate and the standalone Vercel deploy stay recorded. |
| G-5 | Region | **Mumbai for everything:** Supabase (already Mumbai), Vercel functions `bom1`, Google Cloud `asia-south1`. |
| G-6 | Push | `SawhneySatvik/food-ops` (private) is the remote; the history was rewritten to remove AI attribution; Claude pushes only on the founder's word. |

## R57 · Session goal, push cadence, Vercel secrets (founder, 15 Oct 2026, chat + AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| E-1 | Repos | The Google submission is a **separate repo**, exported from this one (R54 P-4); this repo keeps every record. The FalkorDB export comes **after** the Cup. All code for both is written here. |
| E-2 | Goal of this session | This repo is a **complete, demo-ready Munim on Vercel + Supabase** (munim-cobnut + munim-api, monitorable remotely), and **all Cup code is ready** (T-122, T-123, T-125, infra/gcp, the submission docs). The founder does the GCP setup tonight. |
| E-3 | Push | Claude pushes `main` to `SawhneySatvik/food-ops` **after each green milestone** (`make check` green), after scanning the new history for `.env`, `.run/`, keys and **any AI or Claude attribution** (no co-author trailer, no "Generated with"). Each push drives the Vercel deploys through GitHub. |
| E-4 | Vercel secrets | A script the founder runs once (`deploy/vercel/env-setup.ts`) reads values through `packages/config` and sends them to both Vercel projects, printing names only; it also sets the values Claude's tooling generates (run-token keys, service and cron secrets, demo password, role passwords from `.run/`). Claude never opens `.env` or sees a value. |
| E-5 | Remote founder | The founder works remotely from 15 Oct afternoon, so **nothing in the build waits on the founder**. Deploys run from this machine with the logged-in Vercel CLI (`deploy/vercel/deploy.sh`); the GitHub Actions deploys stay optional (`workflow_dispatch`) until the founder adds their secrets. The founder's only step for going live is one line typed from the remote session, `! node deploy/vercel/env-setup.ts` (rule 20 keeps `.env` values out of Claude's hands). Founder-only items (GCP tonight, pushes of new repos, video) never block code. |

## R58 · Live Gemini on the standalone Vercel demo too (founder, 15 Oct 2026, AskUserQuestion)

**Decision.** Amends R56 G-4: the standalone Vercel deploy (munim-api) runs `MUNIM_MODEL_MODE=live` like the Cup — the
founder's free-tier Gemini key (sent by `deploy/vercel/env-setup.ts`), the R47 spend cap, and T-125's recorded fallback when
a call fails or is rate-limited. Every gate and test stays `recorded`.

**Rationale.** Recorded answers replay only on the exact seeded world on the recording day (Lane C, T-114 §4) and the
recorded negotiation only at an exact 1 kg shortfall, so a recorded-only demo would show "Cannot verify" from the next day.

## R59 · AI prices on the free tier (founder, 15 Oct 2026, AskUserQuestion)

**Decision.** Closes F-3 for live use (R47 D1/D2, R58): every live role (`router`, `reason`, `narrate`, `extract`) is priced
**₹0 per 1M tokens** in and out, because the founder's Gemini key is free tier (Google bills nothing; its rate limits are the
real limit and a 429 falls back to the recorded answer, T-125). A nominal monthly `platform.llm_budget` row of **₹100** keeps
R47 D2's fail-closed check satisfied. Both are operator-approved config drafts (R24) by the synthetic seed operator, as for
Cares enablement. If billing is ever enabled on that key, real prices are set first.

## R60 · The Cup repo: name, author, history (founder, 16 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| C-1 | Name and remote | **`food-ops-cup`**. The founder creates the GitHub repo; Claude only **prepares it locally** (a sibling folder, `projects_26/food-ops-cup`, made by `make export-cup`) and pushes only on the founder's word. |
| C-2 | Author | **One author: the founder** (`Satvik Sawhney`, the founder's own commit email in this repo) on every exported commit, author and committer, including the teammate's 12 imported commits (at the founder's request; the teammate stays on the registered roster, R17). |
| C-3 | History | The export **follows this repo's real history**, filtered to the exported paths (R54 P-5), with commit messages reduced to what the submission needs: a plain description of the change; no ticket or ledger ids, no internal process, no tooling or AI attribution, nothing the hard rules forbid. |
| C-4 | AU pack | The Cup export **keeps the Australia country pack** (founder, 16 Oct; amends R54 P-4): it is static configuration the contracts package loads, and it shows the one-pack-flip design. The other demo worlds stay out. |

## R61 · Munim site redesign: "Ledger, softened" (founder, 16 Oct 2026, AskUserQuestion)

**Decision.** The Munim site (`apps/site`: marketing home, Munim Cares, developer portal) is redesigned in warm
neo-brutalism, blend "Ledger, softened": the bahi-khata's ledger red and turmeric on ruled paper, with market-signage
shapes (12px radius, pill buttons, 4px hard shadows); Bricolage Grotesque, Atkinson Hyperlegible, IBM Plex Mono. The
developer portal uses a quiet variant. `apps/web` (Cobnut storefront and staff screens) keeps Cobnut's own brand. A
reference home page goes to the founder as a Vercel preview before any other page is built (memory: visual sign-off
first). Spec: `docs/superpowers/specs/2026-10-16-munim-site-ledger-softened-design.md`.

## R62 · Finish both entries, then stop developing (founder, 16 Oct 2026, chat + AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| S-1 | Order | After the autonomous build: **the Cup suite end to end** (security review and fixes, clean-up, judge-ready docs and architecture, commit history, video script, deck outline, deploy runbook), **then FalkorDB** the same way. No feature development after that. Plan: `docs/plan/07-submission-plan.md`. |
| S-2 | Deploys | Claude **finishes the standalone Vercel go-live**. The Cup (GCP) and FalkorDB deploys are the **founder's**, from runbooks Claude writes. |
| S-3 | Docs | Written by **Sonnet** (main docs) and **Haiku** (per-module, glossary, link checks); AI judges are expected to read the whole project. |
| S-4 | Machine load | At most two agents at a time; heavy commands one at a time through `scripts/dev/heavy.sh` (a shared lock). |
| S-5 | FalkorDB server | Try an **embedded FalkorDB** process first (no Docker); fall back to a FalkorDB Cloud free instance from the founder. |

## R63 · Live diagnostic calls for the go-live fixes (founder, 16 Oct 2026, AskUserQuestion)

**Decision.** The go-live fix lane may make **up to about 20 real Gemini calls** (free tier, the founder's key, through
`munim_intel.config`) from this machine to diagnose and verify the HTTP 400s from `gemini-3.5-flash-lite` (quote extraction
and the Ask router). Every test and gate stays recorded. The redesigned Munim site went to production the same night on the
founder's word (munim-rho).

## R64 · Security review (C1) decisions (founder, 16 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| X-1 | Labels | **Unchanged.** Hard rule 5 stands; the in-app "Sample data"/"Simulated" labels stay as they are (founder: "let labels be"). The Cup's GCP seed uses the **synthetic seed operator** like the Vercel seed, so the tenant is flagged demo (label shown) and gets its AI budget (R59). |
| X-2 | Demo person | **Keep the four-person picker (R55 S-1)**; on demo tenants core refuses the commands that break the demo for others: storefront key revoke/rotate, member invite/deactivate/role change, and AI-cap changes. Every other action works and is audited under the persona. R27's per-session judge members are not built. |
| X-3 | Number grammar | The gaps C1 found (scale words after a figure; number words, romanised Hindi and other scripts' numerals) are **accepted as known gaps** and **documented in no public repo** (this private repo only). |
| X-4 | Orchestrator calls (not founder) | Self-serve sign-up off in the IdP for the demo, plus a per-identity tenant cap; operator config stays enforced as drafts in route code (S4-4, known limit, private); the `origin.kind = 'migration'` backfill is named as an explicit exception in internal guarantee scans (S4-5); suppliers-sim stays public (simulated, no data) with bounded inputs (S4-7). |

## R65 · The Munim launch film (founder, 16 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| V-1 | Cuts | Two cuts from one scene library: a **Cup cut strictly under 3:00** (T&C) and a **full tour** (~6 min). 16:9, 1920×1080. |
| V-2 | Footage | **Everything recreated** in a HyperFrames composition (like the founder's Snacky Shack film; method only, no files reused, hard rules 1 and 4). |
| V-3 | Story | "A day at Cobnut Bakehouse", framed as **Munim's** film (Cobnut is a business that runs on Munim). |
| V-4 | Voice and music | Local Kokoro TTS narrator + captions; an **original** instrumental composed in code; SFX synthesised. |
| V-5 | Labels | In-app demo labels hidden in the recreated screens; **one disclosure card** in the film (hard rule 5). |
| V-6 | Unbuilt features | Shown as if built (founder's call; flagged once that judges read the repo): the storefront page builder, campaign messages (sent only on approval), an Australian outlet, the AI-office visual. **Payment processing is never shown as real** (hard rule 5: recorded, not processed). |

Spec: `docs/superpowers/specs/2026-10-16-munim-launch-film-design.md`.

## R66 · Finish all remaining frontend (founder, 16 Oct 2026, chat)

**Decision.** With the design locked, one lane (T-128) builds every screen the Munim site still lists as "screens in
progress" or "not started" — investigations (Step/Plan/Auto), the specialists and Manager desk view (the AI office),
many outlets and brands, theming and the drag-and-drop page builder, customer campaign messages (recorded, never sent to a
real provider), an Australian outlet — in Cobnut's look (R61), with the smallest additive backend where missing, and
updates the site's status lines to what is true. Founder questions are relayed as they arise.

## R67 · Screens-wave answers (founder, 16 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| W-1 | Campaigns | On **demo tenants only** (`is_demo`, set by an operator) an AI-drafted campaign does not require marketing consent for its synthetic audience ("bypass it for the demo"); the owner still approves, and "Sent (simulated): no message left Munim" is recorded as the owner's action. Real tenants keep the 11 Oct consent ruling. |
| W-2 | Australia | Not shown live; the AU pack stays in code and tests, and the film shows it from its mock. |
| W-3 | Page builder | On demo tenants: edit, preview, save and history work; **publish is refused** (joins the R64 X-2 deny-list). |
| W-4 | Investigations | The Cobnut world seeds closed shifts and bank lines so a live investigation completes; then a hosted reseed. |
| W-5 | Orchestrator calls | The brand switch shows only with 2+ brands; the orchestrator ships the new SDK tarball and does every hosted reseed. |

## R68 · The FalkorDB entry (founder, 16 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| G-1 | Hosting | A **live URL on FalkorDB Cloud** (free instance; the founder creates it and adds `MUNIM_FALKORDB_URL` to `.env`), plus a full local setup with embedded FalkorDB in the README. Claude checks the free tier allows the rebuild's commands first. |
| G-2 | API and writer | Three additive public routes (`/v1/graph/ingredients/{id}`, `/v1/graph/suppliers/{id}`, `/v1/graph/sole-sources`) and a `graph_unavailable` error. **Core is the only writer of the graph** (projected from the books; intel only reads) — narrows R25's "intel's projector writes it". |
| G-3 | Repo | **`business-graph`**, one fresh commit under the founder's name, prepared locally; the founder creates the GitHub repo and says push. |

Design: `docs/plan/falkordb/design.md` (F1). The embedded-FalkorDB spike passed on this Mac (falkordblite's Redis 8.6.2 + FalkorDB 4.x module; no Docker).

## R69 · Ask on the lite model (founder, 16 Oct 2026, AskUserQuestion)

**Decision.** The live demos' reasoning role moves from `gemini-3.8-flash` to **`gemini-3.5-flash-lite`** (a larger free-tier
quota; already working live for extraction), through the operator's approved config draft (R24), at ₹0 per R59. Same on the
Cup's GCP deploy (runbook step). Reason: the 3.8-flash free-tier daily quota ran out during the production journey and Ask
answered "Cannot verify".

## Open (to be ratified in the clarify round)

| ID | Question | Status |
|---|---|---|
| OQ-A | Autonomy | **ratified R16** |
| OQ-B | The One Guarantee | **ratified R15** |
| OQ-C | Cup slice; docs vs deploy | **ratified R18, R19** |
| OQ-D | Teammate | **ratified R17** (roster submitted) |
| OQ-E | ROFR: clause read; clarification email drafted (`docs/admin/`) — founder to send | founder action |
| OQ-F | "Agents as office workers" repo for back-office reference | research (R4) |
| OQ-G | Australia pack | **ratified R21** (config-driven packs + master admin) |
| K5 | Realtime | **ratified R20** (amends R9) |
| K6 | Suppliers topology | **ratified R23** |
| R8-W | Intel write path | **ratified R25** (amends R8) |
| G-1…G-4 | Guarantee definitions from the pass-1 review | **ratified R26–R29** |
| P1 | Pass-1 ratification, country lock, dev env, DB size | **ratified R30–R33** |
| RS | Standalone reset (focus, agnostic, runtime, parked entries, process, board) | **ratified R34–R39** |
| C1–C7 | Number-rule scope (council) | **ratified R40** |
| X-1 | Customer accounts, sign-in, developer platform scope | **ratified R41–R43** |
| F-CH | Customer status channel + provider (email / SMS) | **open — founder (money)** |
| DD | Demo data: dev local sign-in, dated history, seeding speed | **ratified R44** |
| AI | Intelligence-layer architecture (ADR-014, F1–F7) | **ratified R45** |
| CARES | Munim Cares — surplus / near-expiry donation page + AI help (W5) | **recorded R46; scope open, discuss after W3** |
| W3-FD | W3 close founder decisions D1–D10 | **ratified R47** |
| POST-W3 | Integration kit first (separate frontend repo), per-currency AI prices, Munim Cares to be built | **ratified R48** (Cares scope ratified 12 Oct) |
| KIT | SDK + API suite + landing page on one site; teammate builds Spice Route and Laneway Cafe storefronts against a mock API; Vercel for the standalone build | **ratified R49** |
| SCREENS | Demo spine built fresh; Spice Route storefront; recorded AI only; npm dependencies only | **ratified R50** |
| POST-SCREENS | Live Gemini + recorded backup; add `GET /v1/me`; clean-up before the split; no split until the founder asks | **ratified R51** |
| REVERT | Restaurant frontend (W4-spine) reverted; plan to be re-gone-through with the founder | **recorded R52** |
| HANDOFF | Teammate builds from handoff packs; Cobnut demo business; private GitHub repo | **ratified R53** |
| ASK-LITE | Reasoning role on gemini-3.5-flash-lite for the live demos | **ratified R69** |
| GRAPH | FalkorDB entry: Cloud live URL, /v1/graph routes, core sole graph writer, repo business-graph | **ratified R68** |
| SCREENS-W | Campaign consent bypass on demo, no AU live, builder publish refused on demo, investigations seeded | **ratified R67** |
| SCREENS-ALL | T-128: build every remaining screen; site status lines updated | **ratified R66** |
| FILM | Munim launch film: two cuts, recreated UI, Kokoro VO, original music, labels hidden + disclosure card | **ratified R65** |
| SEC-C1 | Labels unchanged; picker + demo deny-list; number-grammar gaps private | **ratified R64** |
| LIVE-DIAG | Up to ~20 live Gemini calls to fix the go-live 400s | **ratified R63** |
| FINISH | Cup suite end to end, then FalkorDB; founder deploys both; Claude finishes Vercel; light machine load | **ratified R62** |
| SITE-LOOK | Munim site redesign, Ledger softened; Cobnut keeps its brand; reference page first | **ratified R61** |
| CUP-REPO | food-ops-cup prepared locally; one author (the founder); real history with plain messages | **ratified R60** |
| AI-PRICES | ₹0 per-role prices on the free tier + ₹100 monthly budget rows | **ratified R59** |
| LIVE-VERCEL | Live Gemini + recorded fallback on the Vercel demo too | **ratified R58** |
| SESSION-15 | Separate Cup repo by export; demo-ready Vercel + Cup code this session; push per green milestone; founder-run env script | **ratified R57** |
| PROD-SPLIT | Cobnut into `apps/web`; production on Vercel + Supabase first; lean Cup export, no licence, filtered history | **ratified R54** |
| PROD-SET | Demo picker + reseed; Vercel Hobby; munim-cobnut + munim-api; existing Supabase project | **ratified R55** |
| GAPS-SPLIT | Trimmed phase 4; known gaps fixed; Cup + FalkorDB splits; free-tier recorded AI; Mumbai | **ratified R56** |

## R70 · Cup submission answers (founder, 16 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| A-1 | Eligibility | Both team members confirmed eligible (21+, working, JAPAC); the roster stands. |
| A-2 | Form, tooling | The form says nothing about tooling; the drafted sentence is removed. |
| A-3 | The film | Submitted as it is, as the product's video; nothing is said anywhere about how it was made; no extra screen recording. |
| A-4 | Theme | Retail & Commerce, as registered. |


## R71 · What "Send me offers" consents to (founder, 16 Oct 2026, AskUserQuestion)

**Decision.** The storefront's "Send me offers" box (stored as `consent.marketing`) is consent for **email only**. SMS needs
its own `consent.sms`. A channel's own flag always wins over `marketing` (a withdrawn email stays withdrawn). The
`customers.consented_audience` template gets a version 2 in migration 0035 (migrator lane), and core-api's customer reads
map `{marketing}` to `{email}` by the same rule.

## R72 · FalkorDB stays on its branch (founder, 17 Oct 2026, AskUserQuestion)

**Decision.** The FalkorDB build lives on branch `f3-falkordb` in this repo (pushed to food-ops as a branch, never merged
into main). main's later fixes are merged **into** the branch; `business-graph` is exported from the branch as one fresh
commit. food-ops main stays free of graph-adapter code (no `/v1/graph` routes, SDK stays 0.3.0 on main). This replaces
the plan to merge F3 into main.

## R73 · The FalkorDB branch is the Vercel demo; business-graph is its own repo (founder, 17 Oct 2026)

**Decision.** `business-graph` is an independent GitHub repo (the FalkorDB submission), generated from a **`falkordb`
branch on food-ops** (renamed from `f3-falkordb`) that holds the same code. The existing Vercel projects deploy from that
branch — no new Vercel projects: munim-cobnut's production branch and the munim-api workflow move to `falkordb`; munim-rho
(the site) stays on main. The graph switches on (`MUNIM_GRAPH`, `MUNIM_FALKORDB_URL`) once the founder's FalkorDB Cloud
instance exists; until then the branch deploys exactly like main. main's fixes keep flowing into the branch. The only
infrastructure left is Google Cloud for the Cup. Amends R72 (the branch is now also the Vercel source).

## R74 · Final films, FalkorDB track, no FalkorDB security pass (founder, 17 Oct 2026, AskUserQuestion)

| # | Topic | Decision |
|---|---|---|
| V-1 | Cup video | **About 4:00**, showing more features (founder's call, made after the orchestrator quoted the Cup T&C: "a video demonstration strictly under three (3) minutes in length" — a mandatory artifact). The approved 2:55 cut stays on disk as the fallback. |
| V-2 | FalkorDB video | The Cup story (the 2:55 base) plus a ~35 s graph scene after the negotiation: the graph built from the books, a butter price rise traced, the supplier map, Ask answering from the graph; end card with business-graph and the live URL. About 3:30. |
| V-3 | Films | The first full draft is satisfactory (founder). |
| F-1 | FalkorDB track | Agents That Act on Connected Data. |
| F-2 | FalkorDB security pass | Cut (design review and the red-proved gates stand). |
| D-1 | Deadline | Both repos complete by 08:15 IST 17 Oct, then a detailed handoff document. |

## R77 · The Nebius demo gets its own Vercel and Supabase projects (founder, 27 Oct 2026, AskUserQuestion)

**Decision.** The Nebius entry's hosted demo runs on a **new Vercel project pair** (web + api) and a **second free
Supabase project**, never on munim-cobnut / munim-api / the Supabase project behind the Cup and FalkorDB demos, which stay
unchanged while they are judged. Migration 0036 (the `nebius` provider CHECKs) is applied only to the new database. Keep
it up until judging ends (mid-December). An exception to R73 ("no new Vercel projects"), limited to this entry. Same
round: the `nebius` contracts change is approved (EVENTS-STATUS to-do 0); the licence and the Token Factory key wait.
