# Munim — product design spec

**Date:** 9 Oct 2026 · **Status:** agreed in a brainstorming session; **not yet ratified** into a shipyard
decision ledger. · **Supersedes:** `docs/02-product-shape.md` wherever they differ (the earlier shape is
kept for history).

Convention: `FACT` = sourced (see `docs/research/R1–R3`), `INFERENCE` = reasoning. Once a shipyard
ledger exists, the ledger outranks this spec (shipyard RULES §1).

Inputs this spec draws on:
- `docs/research/R1-architecture.md` (scalable SaaS architecture)
- `docs/research/R2-market-india.md` (Indian market, incumbents, wedge)
- `docs/research/R3-ai-layer-production.md` (multi-tenant AI layer, cost, safety)
- `../hackathon/ai-builder-cup-2026/ASSESSMENT-independent.md` (Cup odds, rules, FalkorDB rules)
- The Snacky Shack repo (`github.com/ishitagoel250/the-snacky-shack`), read for ideas only (CLAUDE.md rule 4)

---

## 1. The product in one paragraph

**Munim** (the traditional shop accountant who knows every number) is an operating system for
restaurant groups, cloud kitchens and stores. It has two products:
- **Munim Core** is a deterministic, headless back end with its own POS, ordering, ledgers and operations. It runs a business correctly with no AI at all.
- **Munim Intelligence** is a layer of AI specialists over one shared context graph built from everything the business produces: orders, imports, invoices, statements, conversations and documents. The specialists explain what happened across sources, with citations, find money leaks, and draft actions. **A person makes every decision.**

Customers reach Core and Intelligence through persona frontends (owner, manager, staff, customer). Custom-branded storefronts are a paid service built on the same public SDK.

**Positioning (from R2):** sell outcomes, not "an AI brain".
- The pitch: ₹ recovered, the month closed for you, every number explained.
- "Ask your business anything" is already free: Petpooja Ask Me Anything (Jul 2026) and Swiggy Guru (Aug 2026). `FACT` (R2)
- The open gap is joining the sources. Nobody combines POS, aggregators, supplier invoices, bank/UPI statements and Tally, and explains every mismatch with cited rows. `INFERENCE` (R2)

## 2. Users, markets and segments

| Persona | Uses |
|---|---|
| Owner | Everything across outlets: morning brief, inbox, ask anything, wiki, dashboards, the back office |
| Outlet manager | The same, limited to their outlets, plus daily ops: counts, waste, roster, cash close, checklists |
| Kitchen and floor staff | POS (counter and table), kitchen display, prep list, waste and temperature logs, handover notes |
| Advisor (accountant) | Read-only finance and reports |
| Customer | The business's ordering site: menu, table QR, pickup (scheduled or ASAP), deals, loyalty, feedback |

- **Markets:** India first. Australia-ready, meaning currency, tax (GST IN vs GST AU and ABN), time zone, aggregators and number formats are per-country packs and never hard-coded. Snacky Shack (Geelong, AU) is a design reference for the storefront and kitchen display.
- **Segments:**
  - **Go-to-market:** restaurant groups with 2–5 outlets, and multi-brand cloud kitchens.
  - **Supported by the same core:** single outlets and stores.
  - **Store pack:** part of the design and the Cup demo; sold later.
  - Kiranas are explicitly not a go-to-market target (R2: lowest revenue per customer).
- **Market entry:** the full OS from day one (founder decision, overriding R2's recommendation to start with the layer). Import adapters still let a business keep its existing POS while it adopts Munim.
- **Language:** English. Every string goes through i18n keys so languages can be added later.

## 3. Principles (candidate One Guarantee in §15)

1. **Decisions stay with the person.** Agents read, explain, recommend and draft. Nothing reaches the books, prices, stock, staff or customers without a named person's approval. The default is no auto-apply anywhere (see OQ-A).
2. **Numbers come only from SQL.** The graph and models explain why. They never compute money or stock. Every number shown traces to a SQL snapshot ID.
3. **Cite or abstain.** Every claim links to its evidence (row, document span, message line). If it can't be verified, the answer is "cannot verify".
4. **Tamper-evident books.** Ledgers are append-only, and the audit log is hash-chained. Bills are never deleted, only voided with a reason and an actor. This answers the 2025–26 tax probe that alleges bulk bill deletion in POS software. `FACT` (R2)
5. **The AI is optional.** If Intelligence is off or down, its features are hidden and the business runs normally.
6. **Simulated means labelled.** Anything simulated (synthetic data, test suppliers) is labelled as such in the UI, video, deck and README (CLAUDE.md rule 5).

## 4. Scope

### 4.1 Domain packs (each has its own agent skill, graph layer, watchers and dashboard)

| # | Pack | Covers | Vertical |
|---|---|---|---|
| 1 | Catalogue & menu | Items (dish, SKU or combo), variants, option groups, recipes, pricing, true margin, launches, menu A/B tests, deals with time windows | both |
| 2 | Kitchen operations | Kitchen display, prep lists, ticket times, SOP adherence, station load | restaurant |
| 3 | Inventory & purchasing | Stock ledger, waste, reorder levels, suppliers, POs, goods received, price creep, transfers, **simulated supplier agents negotiating over A2A** (§8.1); store depth: batches and expiry (first-expiry-first-out), shrinkage, dead stock, returns, MRP, barcodes | both |
| 4 | Finance | Double-entry ledger, P&L by outlet, brand and channel, aggregator settlements and economics, GST, cash control, credit and payables, cash flow and budgets, Tally export | both |
| 5 | People | Rosters, attendance, hiring, training, payroll drafts, advances, tips | both |
| 6 | Customers & growth | CRM, loyalty, marketing and offers, coupon leakage, reputation, reservations, bulk orders | both |
| 7 | Compliance & assets | Licence calendar (FSSAI, GST, trade licence, fire NOC), temperature and hygiene logs, equipment, AMCs, maintenance, energy | both |
| 8 | Market & strategy | Weather, festivals, events, competitor prices, new-outlet viability, owner goals and tasks | both |
| — | Forecast service | Demand per outlet, item, day and slot; deterministic statistics; used by every pack | both |

### 4.2 Ordering and payments
- **Channels:**
  - Own QR and web ordering: dine-in table QR, pickup (ASAP or scheduled slot), and the business's own website.
  - Counter POS.
  - Aggregator orders imported (Swiggy, Zomato; later Uber Eats and DoorDash for AU), never placed by us.
- **Payments: pay at the counter only.** Cash, card and UPI are *recorded* at pickup or table. There are no online payments in this version. A payment port exists so a real gateway can be added later.

### 4.3 Data that comes in
- Own POS and ordering events.
- Imports: POS exports, Swiggy/Zomato payout reports, bank and UPI statements, invoice photos and PDFs, Tally.
- Conversations: logged in-app (owner notes, staff handover, supplier messages), plus upload of any chat export or transcript.
- Documents: menus, contracts, SOPs.
- **No WhatsApp integration.**

### 4.4 Surfaces
- **Owner console:**
  - **Home = morning brief + inbox**, ranked by ₹ × confidence × urgency, with drafts attached.
  - Ask anything, with citations.
  - The living wiki.
  - 8 domain dashboards.
  - A switch between group and outlet views.
  - **The back office** (§9).
- **Manager console:** the same, scoped to their outlets, plus daily-ops screens.
- **Staff:** POS, kitchen display, prep list, logs, handover (tablet-first).
- **Customer storefront:** themable, white-label (logo, colours, domain, layout presets).
- **Onboarding:**
  1. Sign up and choose a type (restaurant, cloud kitchen or store).
  2. Import wizard: photograph the menu or shelf and Gemini vision builds the catalogue; upload POS exports and invoices.
  3. Optionally load sample data.
- **Multi-tenant signup from day one,** plus seeded demo businesses.

## 5. Architecture

### 5.1 Two products, four deployables (R1)
```
web (Next.js, one codebase, shells: pos/ · order/ · console/)      bespoke storefronts (separate repos, public SDK)
        │  public, versioned /v1 API (+ signed webhooks)                   │
        ▼                                                                    ▼
core-api (TypeScript, Hono, modular monolith) ── Postgres (system of record, RLS, tenant_id-led keys)
core-worker (same image: outbox relay, imports, posting jobs, schedules)   │ read-only views (intel role)
                                                                            │ + event stream (CloudEvents)
intel (Python, Google ADK) ◄────────────────────────────────────────────────┘
  router + specialist skills/sub-agents · ingestion · wiki compiler · forecast · graph projector · trace stream
  writes ONLY findings and drafts, through core-api's findings/drafts endpoint
```
- **Core is API-first.** Our own frontends use only the public `/v1` API, so "headless" is a pricing decision, not a rewrite. `INFERENCE` (R1)
- **The only hard service boundary is core ↔ intel**, where the language changes and the trust boundary sits. Everything else is a module boundary enforced by lint rules. Split further only on a measured signal: a different scaling profile, an isolation or compliance need, or several teams colliding on deploys. `INFERENCE` (R1)
- **No microservices per agent, and no per-customer forks of the product UI.** `FACT`-backed pushback in R1 (Segment, Fowler, Shopify `checkout.liquid`).

### 5.2 Ports and adapters (only where clouds actually differ: R1, R3)

| Port | Dev (Supabase, founder's preference) | GCP (Cup adapter) | Later |
|---|---|---|---|
| SQL | Supabase Postgres (local CLI or project) | Cloud SQL Postgres (`asia-south1`) | same |
| Blob | Supabase Storage | Cloud Storage | — |
| Realtime (kitchen display, brief, back office) | Supabase Realtime | Pub/Sub → server-sent events from `core-api` | — |
| Publisher (events) | outbox relay, in-process | Pub/Sub | — |
| IdP | Supabase Auth | Identity Platform (Firebase Auth) | — |
| Secrets | `.env` | Secret Manager | — |
| Graph | FalkorDB | **Spanner Graph adapter** (founder decision) | FalkorDB |
| LLM | Gemini | Gemini on Vertex AI | Nemotron etc. (Nebius, post-Cup) |

- **Supabase in dev, GCP adapters for the Cup** (founder decision, OQ-H resolved). Supabase is reached only through the ports above, so swapping to the Cup adapters is configuration. Three rules keep the swap honest:
  - RLS policies key on `current_setting('app.tenant_id')`, set per transaction with `SET LOCAL`, never on `auth.uid()`. The app connects as a non-owner role with RLS forced.
  - No `pgmq` or `pg_net`. Events go through the outbox and the Publisher port.
  - Auth tokens are verified in `core-api` through the IdP port, not by database helpers.
  
  These hold on both Supabase and Cloud SQL. `FACT`/`INFERENCE` (R1)
- **The Cup repo ships the GCP adapters only.** Supabase adapters stay out of anything submitted (CLAUDE.md rule 2), in line with the founder's plan to publish the Cup build as its own repo.
- **The LLM port is narrow:** stateless JSON-in, JSON-out calls only. Accept Gemini lock-in for Live, Batch and ADK. `INFERENCE` (R3)

### 5.3 Graph strategy (founder: Postgres canonical + projection, plus a Spanner adapter for the Cup)
- **Postgres holds the canonical knowledge:** `claims`, `entities`, `edges` and `findings` tables.
- **The graph store is a per-tenant projection rebuilt from events.** It can be dropped and rebuilt without losing anything. A per-tenant checksum detects drift.
- **Two graph adapters,** FalkorDB and Spanner Graph, behind one Graph port with one contract test suite. The Cup deployment uses Spanner Graph. Spanner Graph needs Enterprise edition, about $90 a month minimum. `FACT` (R3) — budget for it.
- **Graph tools are used only for multi-hop questions.** Single-hop questions go to SQL plus hybrid search (R3, X12).

### 5.4 Built in now because they're expensive to add later (R1)
- `tenant_id` leads every primary and foreign key, so a Citus or sharding path stays open.
- Client-generated UUIDv7 IDs and idempotency keys on every command.
- An outbox in the same transaction as each change, publishing CloudEvents with versioned JSON Schemas.
- **An offline-ready POS schema:** per-device invoice series, append-only stock movements, ledger postings derived on the server. The sync engine itself comes after the Cup.
- Money as integer minor units (paise or cents) with a currency code.
- Data stored in an Indian region.

### 5.5 Extensibility, in order
1. Public REST API and signed webhooks.
2. White-label themes for the storefront.
3. Domain packs as configuration.
4. Bespoke storefronts as a paid service on the public SDK.
5. An app marketplace, last.

## 6. Data model

### 6.1 Core (Postgres) modules
- **tenancy:** business, outlets, brands, channels, members, roles scoped to outlets, country pack.
- **catalogue:** items, variants, option groups, versioned recipes, price lists per outlet and channel, deals with time windows, barcodes.
- **orders/POS:** orders, lines, recorded payments (cash, card, UPI), voids with reason, refunds, shifts with cash counts, kitchen tickets, pickup slots.
- **inventory:** an append-only movement ledger, batches and expiry, counts, reorder levels.
- **purchasing:** suppliers, POs, goods received, supplier invoices, price observations, returns.
- **finance:** a double-entry ledger whose deterministic posting rules refuse malformed entries; also settlements, expenses, payables and receivables, credit, tax and budgets.
- **people:** staff, shifts, attendance, payroll drafts, advances, tips, training, hiring.
- **customers:** profiles, loyalty ledger, campaigns, coupons, reservations, bulk orders, reviews.
- **compliance & assets:** licences, checklists and logs, assets, maintenance.
- **goals and tasks.**
- **approvals and audit:** draft → command → executed under the approver's name; a hash-chained audit log.
- **outbox.**

### 6.2 The context graph (common core plus domain layers)
```
COMMON CORE   Business ─ Outlet ─ Brand ─ Channel · Item{dish|sku|combo} ─ Ingredient ─ Supplier · Person ─ Customer · Day/Shift
DOMAIN LAYERS Catalogue: Item ─USES{qty,unit,valid_from/to}→ Ingredient · PriceVersion
              Inventory: StockSnapshot · WasteEvent · PO · Supplier ─QUOTED{price,at}→ Ingredient
              Finance:   DailySales(outlet,item,channel) · Settlement · Fee · ReconciliationBreak
              People:    Person ─WORKED→ Shift ─AT→ Outlet ·  Customers: Review ─MENTIONS→ Item
KNOWLEDGE     Message/Document ─STATES→ Claim{span, confidence, valid_from/to} ─ABOUT→ core node
AGENT         Finding{type, ₹impact, severity, status} ─SUPPORTED_BY→ Claim|SQLSnapshot|Message
              Draft ─PROPOSES→ command · Decision{approved|rejected, by, why}
WIKI          Page ─ABOUT→ core node
```
- **Individual orders stay in Postgres.** The graph holds daily rollups.
- **Prices, recipes and roles have validity windows.**
- **Name matching favours precision:** aliases carry a confidence score and merge only on strong evidence.
- **Rejected drafts and their reasons are remembered** as owner preferences.

## 7. Ingestion, wiki and retrieval

**The pipeline:**
```
source → connector → raw store (immutable, content-hashed) → normalise → extract → resolve → canonical tables → project to graph → index → mark wiki pages dirty → wake watchers
```
- **POS events** go through a deterministic projector; no LLM is involved.
- **Imports:**
  - The LLM proposes a column mapping **once per file format** and a person confirms it. After that, parsing is deterministic.
  - Bad rows are quarantined to the inbox.
- **Invoices** go through Gemini vision into typed fields.
- **Documents** are split into chunks, embedded with pgvector, and have claims extracted.
- **Conversations** have claims extracted with exact spans.
- **Claims never overwrite records.** Disagreeing claims are linked with a contradiction edge.
- **Extraction is quarantined:** the extractor has no tools. It turns text into claims as data only, which is the prompt-injection defence (R3).

**The living wiki:**
- **Pages:** one per dish/SKU, ingredient, supplier, outlet, person and customer segment, plus one per domain and one for the whole business.
- **Facts come from SQL and the graph.** The narrative is written only from cited facts; a validator drops any sentence without a citation.
- **Incremental:** only pages whose cited claims changed are rebuilt, nightly in batch on the cheapest model. Pages that are read daily are precomputed. (R3 X2)
- **Versioned,** with a diff view, and exportable as plain markdown files.

**Retrieval:** read the wiki first, then SQL, graph and search as needed. Search is keyword (Postgres full-text) plus meaning (pgvector), merged with reciprocal rank fusion, then expanded through the graph from the entities they match.

## 8. Intelligence: router and specialists

**Presentation:** a router plus specialist agents per domain, shown in the back office (§9).

**Implementation (cost-aware, R3):**
- **Domains are modules.** Each has instructions, tools, a graph scope, watchers and output schemas.
- **By default, one ADK agent loads the domain skills it needs.**
- **Deep cross-domain questions** ("why was this week bad?") fan out to domain sub-agents in parallel via ADK. The coordinator then follows the links between their findings.
- **The view is driven by what ran.** Every routing step, skill load, sub-agent run, tool call and finding is a trace event, so the back office shows exactly what actually executed.

**Tools:**
- Read: `sql.query` (read-only domain views), `graph.query` (read-only templates), `search`, `wiki.read`.
- Write: `finding.write` and `draft.write` only.
- **No tool can change the books.** The intel database role makes this physical.

**Watchers are SQL detectors first.** A severity threshold filters what they flag, and only the roughly 5 findings a day that pass get an LLM-written description. They never call an LLM per event. (R3 X1)

**Morning brief:**
- Submitted to batch at close of business, with an interactive fallback if it isn't back by 06:00 (R3 X7).
- Ranked by ₹ × confidence × urgency, with duplicates removed and drafts attached.

**How a draft moves:**
1. Draft → inbox.
2. The person approves, edits or rejects it, giving a reason.
3. The core carries out the change and audits it under their name.
4. After a set period, an outcome check runs ("did margin move?").
5. The result is shown as that agent's track record. **The agent's autonomy never grows; only the evidence about it does.**

**Validation:**
- Every number must match a SQL snapshot.
- Every cited ID must exist and belong to the tenant.
- Every quote must match its source.
- On any failure the answer is "cannot verify". These checks are deterministic code, not an LLM judge (R3 X10).

**Models:** roles behind the port (router and extraction on Flash-Lite, reasoning on Flash or Pro, plus vision and embeddings). Usage is metered per plan with a per-tenant token bucket and a ₹ spend ledger. Queues are split by priority class, not by tenant (R3 X8).

**Cost target: about ₹570–780 LLM cost per outlet per month.** The naive design would cost about ₹8,400. `INFERENCE` (R3)

### 8.1 Simulated supplier agents (A2A)
- The purchasing specialist asks several **simulated** supplier agents for quotes and counter-offers. Each supplier is a separate A2A service with its own pricing behaviour, so negotiation is a real network call.
- **The result is always a draft.** The negotiation produces a recommended purchase order with the quotes and reasoning cited, and a person approves, edits or rejects it. No agent commits to a supplier.
- A review step checks each proposed deal against budget, margin, past commitments and payment terms before it reaches the inbox, and says "cannot verify" rather than guess.
- Simulated suppliers are labelled as simulated everywhere (CLAUDE.md rule 5). Any "savings" figure is a measured result on synthetic data, not a market claim.
- Shown in the back office as the purchasing specialist talking to supplier desks.

## 9. The back office

- **Front: a pixel-art office.**
  - The router sits at reception.
  - Each specialist has a desk: Catalogue, Kitchen, Purchasing, Finance, People, Customers, Compliance, Market.
  - The common graph is the shared board on the wall.
  - Drafts land on the owner's desk.
  - It's playful and memorable, a feel-good feature.
- **Underneath: the full operations console.**
  - The specialists' org chart.
  - **Sheets** of findings, queries, drafts and outcomes.
  - The full **chat log** of each agent's work.
  - Per-agent track record.
- Everything is replayed from trace events. **Nothing is staged.**
- The founder named a viral GitHub repo showing agents as pixel office workers as inspiration. The exact repo is still to be identified (OQ-F).

## 10. Evaluation and headline numbers

- **World generator** (seeded, reproducible), with six months of data for:
  - a 3-outlet restaurant group,
  - a 2-brand cloud kitchen,
  - a store.
- **About 40 planted problems with known ₹ impact:**
  - supplier price creep;
  - short aggregator payouts and commission miscalculations;
  - a duplicate supplier invoice;
  - a waste spike;
  - a void and deleted-bill pattern;
  - overtime drift;
  - a best-selling dish that loses money;
  - expired stock;
  - a GST mismatch.
- **Numbers, reproducible in CI:**
  1. ₹ found vs ₹ planted, plus false alarms.
  2. Answer accuracy with correct citations on 200 owner questions, vs plain retrieval.
  3. Month-end close time vs an estimate of doing it by hand.
  4. LLM ₹ per outlet per month.
  5. Forecast error vs a naive baseline.
- **Suites:** leak recall, Q&A, citation validity, prompt injection (adversarial documents and chats), and tenant isolation.

## 11. Demo (AI Builder Cup)

**Video, under 3 minutes:**
- **Hook:** "Meena's three outlets lost ₹1.8 lakh last month. Nobody could say why."
- **Morning brief.**
- **"Why was this week bad?":** the office fans out, specialists pass notes, and a cited answer arrives.
- **Margin leak.**
- **Month-end close** on Swiggy/Zomato-shaped payout files plus a POS export.
- **Close:** a card with the numbers and an architecture card.

**Deck (PDF):**
1. The problem.
2. The gap: nobody joins the sources.
3. The product and the back office.
4. Architecture: two products, ports, Spanner and FalkorDB.
5. The numbers.
6. Unit economics.
7. Roadmap.

## 12. Engineering

**Repo:** one monorepo holding two products, with enforced boundaries (dependency-cruiser and import-linter; `intel` sees only `contracts`).
```
apps/web/             Next.js shells: pos/ · order/ · console/ (incl. back office, org chart, sheets, agent chats)
services/core-api/    TS (Hono) — headless core, /v1, webhooks
services/core-worker/ TS — outbox relay, imports, posting jobs, schedules
services/intel/       Python — ADK router/specialists, ingestion, wiki, forecast, graph projector, traces
packages/core-domain/ TS framework-free domain logic (ledgers, posting rules, approvals, tenancy, country packs)
packages/contracts/   zod → OpenAPI + JSON Schema → TS client/SDK + Pydantic; CloudEvents schemas
packages/sdk/         public TypeScript SDK (used by our shells and by bespoke storefronts)
packages/ui/          design system, tokens, storefront themes
db/                   SQL migrations, RLS, intel read-only views, seeds
tools/worldgen/       synthetic worlds + planted-issue answer key
evals/                suites above
infra/                Supabase local stack + docker-compose (FalkorDB, Pub/Sub emulator) · GCP Cloud Run/Terraform
Makefile              up · down · seed WORLD= · contracts · lint · test · eval · deploy-gcp
```

**Testing:**
- **Core domain:**
  - Property tests: every ledger balances, posting the same event twice changes nothing, stock moves follow the rules.
  - RLS isolation tests.
- **Adapters:** one contract suite per port, run against every adapter.
- **Intelligence:** tool tests, the validator, the injection suite, and eval thresholds as CI gates.
- **End to end (Playwright):** an order → stock and ledger → a finding → a draft → approval → the change committed.
- **Load:** a k6 smoke test at about 1,000 outlets.

**Deployment (Cup, GCP `asia-south1`):**
- Cloud Run services for `web`, `core-api` and `intel`.
- Cloud Run jobs for the worker, nightly wiki and forecast.
- Cloud SQL, Cloud Storage, Pub/Sub, Secret Manager, Identity Platform, Spanner Graph and Vertex AI Gemini.
- GitHub Actions with workload identity.

**When things fail:**
- Idempotent retries everywhere.
- Event delivery retries with backoff, then a dead-letter queue, then an inbox alert.
- Bad import rows are quarantined.
- If Intelligence is down, AI features are hidden.
- LLM errors: retry, then a cheaper model, then budget-exhausted messaging.
- Validation failures become "cannot verify".
- If the graph store is down, graph tools fall back to SQL and search.
- If the graph drifts, it's rebuilt from events.

## 13. Business model

- **Subscriptions:**
  - **Core:** POS and operations.
  - **Intelligence:** agents, wiki, brief, back office; metered questions and voice minutes.
  - **Storefront:** themed ordering site.
- **Services:** bespoke storefronts or frontends, built on the public SDK. The customer's frontend is a separate deliverable that never forks the core.
- **Pricing hypothesis:** about ₹1,500–3,000 per outlet per month for Intelligence, backed by a "₹ found in month one" promise (R2). To be validated with about 10 owner interviews before setting prices.

## 14. Event constraints

**AI Builder Cup (deadline 18 Oct 2026, 23:59 IST):**
- Fresh code.
- **Google Cloud only for anything submitted.** No Supabase, Vercel or AWS in the submitted build or its repo. Supabase is the dev environment only; the Cup build runs on the GCP adapters.
- Gemini/ADK.
- A live URL, a video under 3 minutes, a public repo and a PDF deck.
- The organiser gets a 6-month right of first refusal plus a perpetual marketing licence (D-002 accepted).
- Juspay: public knowledge and synthetic data only.

**FalkorDB Graph Hacks (15–18 Oct):**
- **A separate product, coded from 15 Oct.**
- Rule 8: the main coding must begin after the event starts.
- Rule 3: the graph must be the core, not decoration.
- **Munim's FalkorDB adapter must not be resubmitted as that entry.** The repo history is public, and the rules disqualify "attempts to manipulate the judging process".

**Snacky Shack:** ideas only. Do not copy its code, schema, or table and endpoint names (CLAUDE.md rule 4).

## 15. Open questions for the shipyard clarify round

- **OQ-A:** Product autonomy. Recommended: the default is **no auto-apply**. Should owners be able to opt into auto-apply per category (e.g. prep lists) after the Cup? Note that the existing `CLAUDE.md` product rule allowing low-risk auto-apply conflicts with principle 1 and must be amended.
- **OQ-B:** The One Guarantee. Candidate: *"Nothing changes the books without a named person's approval, and every number shown traces to a ledger row."*
- **OQ-C:** Cup slice vs full scope. Everything is in product scope. The board needs waves that reach a deployed, demoable slice before 18 Oct. The 12 Oct deploy milestone (D-007) needs re-confirming against today's date.
- **OQ-D:** Teammate eligibility and role. Is the roster open until 11 Oct per the independent assessment, or 4 Oct per BRIEF.md?
- **OQ-E:** The ROFR clause. Read the exact text, and draft a clarification email for the founder to send.
- **OQ-F:** Identify the "agents as office workers" repo for the back-office visual reference.
- **OQ-H: resolved (9 Oct).** Supabase in dev; GCP adapters for the Cup (§5.2).
- **OQ-I: resolved (9 Oct).** Simulated supplier agents over A2A are back in scope, draft-only (§8.1).
- **OQ-G:** The Australia pack. What's the minimum in the Cup build: locale, currency and tax only?

## 16. Risks (stated once)

- **Scope versus a 10-day window** with one mostly-solo builder. The independent assessment rated the widest scope at a 1–3% chance of the top 50. Mitigation: shipyard waves, deploy early, and the demo stories drive the first wave.
- **Incumbents are fast:** Petpooja could ship the cross-source layer. Defence: neutrality across POS systems and aggregators, actions rather than answers, and tamper-evident books.
- **Spanner Graph cost and a second adapter** for graphs a few MB in size (R3 X5). Accepted by the founder.
