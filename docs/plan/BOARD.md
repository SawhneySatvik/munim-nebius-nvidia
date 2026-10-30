# BOARD — Munim standalone build (rewritten 9 Oct 2026, 23:10 IST; W3 rewritten 11 Oct 2026), waves W0–W5

Executes ledger R1–R45 (reset: R34–R39; demo data: R44; intelligence layer: R45 + ADR-014; spec `docs/superpowers/specs/2026-10-09-munim-standalone-reset-design.md`).
How each architecture decision changed over the build, and why: `docs/plan/DECISION-EVOLUTION.md`.
**Product:** AI-enabled POS/ERP for restaurants and shops, individual outlets and small chains (R34).
**Method (R38):** per wave — build every ticket in parallel lanes (respecting the dependency arrows inside the
wave) → **wave test run** on a quiet tree → **one adversarial review of the whole wave** (with One-Guarantee scan)
→ ≤ 2 fix cycles → commits by ticket → next wave. All gates run `MUNIM_MODEL_MODE=recorded`.
**Target (R39):** W1 + W2 green and W3 under way by 10:00 IST, 10 Oct. (Met; W1–W3 are closed. The production, Cup and
FalkorDB tickets of 14–16 Oct are the last section of this file; where they stand: `docs/plan/HANDOFF-PROD.md`.)

## Standing rules for every lane

- **Test database:** every DB gate runs on **embedded Postgres 18** (`embedded-postgres` npm, started by the
  `@munim/db` test harness — no Docker, no brew, no Supabase). pgvector is absent there: the only
  vector-dependent migration (`0012_embeddings`) is marked `-- requires: vector`; the runner skips it loudly on
  engines without the extension and its gate runs on the dev Supabase project. The dev app runs on Supabase (F1).
- **Contracts:** `packages/contracts` is organised by module (`src/<module>/**`, `MANIFEST.d/<module>.txt`). A
  module ticket owns its own `src/<module>/` and manifest file. Generated output (`generated/`, `packages/sdk/src/gen/`,
  `services/intel/munim_intel/contracts_gen/`) is never hand-edited; lanes may regenerate locally, and the
  orchestrator's regeneration at the wave test run is authoritative.
- **Migrations:** `db/**` belongs to the migrator lane only. Module lanes request tables, columns and snapshot
  templates in their report; the migrator adds them in the next migration.
- **core-api modules:** each module owns `services/core-api/src/modules/<module>/**` and talks to other modules
  only through their `index.ts`. `services/core-api/src/modules/index.ts` (the registry) is owned by T-004.
- **Never read `.env`** (CLAUDE.md rule 20). Config comes through the config module; names from `.env.example`.
- **No lane runs git.** Reports: files by path, gate output verbatim, what was NOT done, surprises, requests.

## W0 — founder setup

| # | Step | Unblocks |
|---|---|---|
| F1 | ⚠️ password rejected by the pooler (28P01) — founder to reset the DB password and update `.env`; was ✅ 9 Oct 23:45 — Supabase project + `.env` (names in `.env.example`; values never read by agents) | running the dev app, Supabase Auth, the `0012_embeddings` gate |
| F2 | ✅ done — `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY` (free plans; no OpenAI key — OpenAI skipped loudly) | T-059 live provider smoke, W5 provider comparison |
| F3 | Send the ROFR email (`docs/admin/`) | nothing technical |

## Waves

```
W1 foundation      T-001 scaffold (built) · T-002 contracts (resume) → T-003 core-domain
                   M-A migrator: 0001…0006 (roles, platform, tenancy/commands/audit/outbox/evidence/run/guard,
                                 catalogue+orders+customer, inventory+store+purchasing, approvals extras)
                   T-004 core-api base → T-005 commit/outbox/publisher/run tokens · T-006 stream · T-007 worker
                   T-008 approvals module · D-1 pack specs · D-2 screens+flows · D-3 design system (doc lanes)
W2 core modules    M-B migrator: 0007…0012 (finance, documents/imports, people, customers&growth,
                                 compliance&goals, intel tables+views, embeddings)
                   T-020 tenancy+onboarding · T-021 catalogue · T-022 orders/POS · T-023 kitchen · T-024 inventory+store
                   T-025 purchasing · T-026 finance · T-027 people · T-028 customers&growth · T-029 compliance&goals
                   T-030 imports · T-031 platform admin API · T-032 storefront API · T-033 worldgen v1 · T-035 customer accounts
                   T-034 W2 integration suite (after the module tickets)
W3 intelligence    (rewritten 11 Oct from ADR-014 §12 + R45 F1–F10; detail below)
  W3.0             T-041 runtime ✅ · T-052 forecast ✅ · (R44: T-036 ✅ H-1 ✅ W-1 ✅) · M-C1a templates+outlet RLS
                   T-040 internal API + unmounted /v1 reads · T-080 ontology · T-087a specialist registry
  W3.1             M-C3 threads+AI policy+track record · M-C1b · T-040b orphan routes+run-frame · T-042 plugin
                   T-081 DecisionModel · T-043 watchers · T-086 plants · T-090 AI policy · T-087b specialist desks
  W3.2             M-C1c · M-C1d · M-C2 investigations (+modes) · T-044…T-051 the 8 specialists
                   T-055a negotiation rules half · T-056 ingestion · T-058 graph · T-084a lineage · T-088a threads (core)
  W3.3             T-083 investigations (Step) · T-084b · T-082a context · T-082b Manager ask · T-088b threads (intel)
                   T-055b negotiation AI half · T-054 brief · T-057 wiki · T-089a Plan mode
  W3.4             T-053 fan-out (read-only specialists) · T-085 evals per specialist · T-059 live smoke + budgets
                   T-089b Auto mode (last) · T-092a/b W4 read routes
W4 frontends       T-060 design system + ui · T-061 POS · T-062 KDS · T-063 storefront · T-064 console core
                   (Manager conversation, specialist threads + desks, investigation modes) · T-065 dashboards
                   T-066 back office · T-067 onboarding + import wizards · T-068 platform admin UI
                   T-069 manager/staff daily ops · T-075 records · T-077 AI settings (ceilings + monthly cap)
W5 quality         T-070 live evals + provider comparison (+ per specialist, F3 sweep, DM bake-off, F4 moves)
                   T-071 e2e suites · T-072 performance smoke · T-073 README + runbook · T-076 SDK packaging · T-074 sweep
After W5           Gemma fine-tune for intent routing (F6) · FalkorDB graph adapter in use (F7) · Jev/OpenAI DM if they win (F2)
```

## W1 — foundation

| Lane | Ticket | What + refs | Territory (owns) | Gate (positive, red-proven, accept pairs) |
|---|---|---|---|---|
| b-1 | T-001 | **Built, in the W1 review batch.** Scaffold: Makefile, boundaries, CI, db-ping, web landing | (as built) | `make check` green; 5/5 planted violations red then green |
| b-2 | T-002 | Contracts core (resume the partial work in the tree): generators (zod → JSON Schema → OpenAPI 3.1 → TS SDK + Pydantic), shared types (money, ids, refs, grammar data, envelope, reason codes, run token, CloudEvents envelope, trace event), internal-API schemas, W1 commands (tenancy setup, catalogue setup, orders.place, kitchen.ticket.advance, inventory setup + stock.receive, purchasing setup + po.create, drafts.approve/reject), W1 events, country-pack schema + canonical IN/AU pack docs; restructure into `src/<module>/` + `MANIFEST.d/` | `packages/contracts/**`, `packages/sdk/**`, `services/intel/munim_intel/contracts_gen/**` | Generated schema count = Σ `MANIFEST.d` lines; TS↔Pydantic round trip for every manifest entry; stale-generation check red after an unregenerated edit; IN/AU packs validate |
| b-3 | T-003 | core-domain: money + rounding, tz module, country-pack engine (reads pack docs from `@munim/contracts/packs`), command-authority evaluation, envelope syntax + number grammar (`\p{N}`, word lists from contracts) + `RefResolver` port, derivation rule `inventory.consume_order`. Goldens hand-written first. Refs: 03-arch §1.6–§1.7, 04 §4, §11 | `packages/core-domain/**` except `finance/` | Melbourne DST 5 Apr / 4 Oct 2026 business dates; Kolkata control; IN + AU golden receipts byte-equal; 30 grammar rejects + 10 accepts (incl. "Do you…", "quarter-end", "first half") classified as committed |
| m-1 | M-A | Migration runner (`db/migrate.ts`; `-- requires: <ext>` skip rule) + embedded-Postgres test harness (`@munim/db`: `startTestDb()`, role-switch helpers) + static Supabase-ism gate + `0001_roles_schemas` · `0002_platform` (IN/AU packs from contracts, plans, flags, model roles with a provider column, operators, config drafts) · `0003_core_foundation` (tenancy incl. `onboarded_at`, membership roles incl. judge, command log, audit chain, outbox + NOTIFY, `command_authority`, `derivation_rule`, guard trigger + `origin`, `munim_crosstenant` objects, `evidence`, `intel.run`) · `0004_catalogue_orders_customer` · `0005_inventory_store_purchasing` (batches, expiry, barcodes, MRP, returns) · `0006_approvals_extras`. Refs: 02-schema §0–§3, §7–§8; 03-arch §1.2–§1.6 | `db/**` | On embedded PG: migration count 6; isolation (expected set from `pg_attribute`, `NO FORCE` red-proof); tags; service-privilege; book guard (all branches incl. replayed decision); definer owners = 3; audit chain; NOTIFY; transitions; gapless invoice series under 100 concurrent inserts; append-only; duplicate supplier invoice; country fixed after onboarding; static gate 0 hits and 1 on a planted `auth.uid()` |
| b-4 | T-004 | core-api base: Hono app, module registry, two pools (`munim_core`, `munim_svc`), IdP port + Supabase adapter + `idp-local`, `withContext`/`SET LOCAL`, membership/operator/customer resolution, error envelope, `/health` (DB round-trip + migration version) | `services/core-api/src/{app.ts,lib/,auth/,modules/index.ts,health/}`, `services/core-api/package.json`, `adapters/dev/{idp-supabase,idp-local}/` | `/health` 200 with version = latest, 503 with DB stopped; tenant A token reads 0 of B's rows and ≥ 1 own via a probe route |
| b-5 | T-005 | Commit helper: idempotency, audit writer, outbox writer, in-process publisher (POST to intel `/events` with service secret + run token), Ed25519 run-token mint/verify + `intel.run` rows | `services/core-api/src/{commit,runtoken}/`, `adapters/dev/publisher-http/` | Replay → byte-identical body, different hash → 409; 20 commands → 20 audit rows, chain verifies; 20 outbox rows delivered once each to a recording endpoint; forged / expired / ended-run token refused, valid accepted |
| b-6 | T-006 | Stream: `/v1/stream` (bearer, fetch-SSE), 3 LISTEN channels, topic authorisation, `Last-Event-ID` replay; `packages/sdk/src/stream.ts` reader (hand-written, outside `gen/`) | `services/core-api/src/stream/`, `packages/sdk/src/stream.ts` | Two core-api processes: client on 2 receives 10/10 events from 1 in < 2 s; 5 missed events replayed after reconnect; outlet-A member refused on `kds:<B>`, accepted on `kds:<A>` |
| b-7 | T-007 | Worker process: outbox sweeper (`outbox_claim`, advisory lock), `fanout` (per-tenant run tokens → intel `/watch:sweep`, `/brief`), cron registry, graceful shutdown | `services/core-worker/**` except `src/imports/` | 1,000 rows, 2 workers → each id published once; crash after publish → that id twice, others once; cron fires a test job N times in N windows (fake clock) |
| b-8 | T-008 | Approvals module: drafts list/get/approve/edit-approve/reject; `executing` + `exec_txid`; authority on the final payload; `based_on` re-check → `stale`; execution calls the target module's command via its `index.ts` | `services/core-api/src/modules/approvals/**`, `packages/contracts/src/approvals/**` | concurrent approve + edit-approve → 1 execution; changed `based_on` → `stale`, 0 executions; staff approving a price draft → 403, owner → 200 |
| b-9 | T-009 | **W1 integration** (after T-004…T-008): composition roots — `services/core-api/src/dev-root.ts` + `server.ts` wiring (pools from `packages/config`, Ed25519 keys, `createHttpPublisher`, stream, approvals) and `services/core-worker/src/main.ts` (Publisher = `publishOutboxRows` per row on a `munim_svc` login; minter wrapper with `endRun` after intel returns); `make up` starts core-api + worker + web locally; dev Supabase bring-up script (bootstrap roles → `.run/db-roles.json`, migrate 0001–latest + seed packs) run through the config module (no agent reads `.env`); smoke: health 200 with DB round-trip, one command through `executeCommand`, one SSE event received | `services/core-api/src/{dev-root.ts,server.ts}`, `services/core-worker/src/main.ts`, `scripts/dev/**` | on embedded PG: `make up` → health 200, command → outbox → stub intel receives 1 event, SSE client receives it; on dev Supabase: migrations applied = file count (minus skipped), health 200; every UNVERIFIED hosted item from db/README answered (pass/fallback) |
| d-1 | D-1 | Pass-2 doc: one spec per pack (8) + forecast: skill brief, snapshot templates (SQL sketch + columns), detectors + thresholds, finding types, draft command types, visible refusal (`reason_code`), dashboard panel, eval cases with ₹. Refs: 04 §9, PDR §4, R34 (shops first-class) | `docs/plan/packs/**` | 9 files; every pack lists ≥ 2 detectors, ≥ 1 draft type, ≥ 1 refusal; every template's numeric columns name a `core` source |
| d-2 | D-2 | Pass-2 doc: screens per surface (POS, KDS, storefront, console home/inbox/ask/wiki, 8 dashboards, back office, onboarding/import, platform admin, manager/staff ops) + flows (3 stories, onboarding, approval, import, shop sale with barcode) | `docs/plan/screens/**`, `docs/plan/flows/**` | every screen: states list, data source per number (row or snapshot), literal copy in quotes, simulated labels where suppliers appear |
| d-3 | D-3 | Pass-2 doc: design system (tokens, type, spacing, tablet POS ergonomics ≥ 48 px targets, ≥ 16 px inputs, a11y), back-office art direction + asset list + provenance log format | `docs/plan/design-system.md`, `docs/plan/art/**` | token list complete for W4; asset list with sizes; provenance template |

## W2 — core modules (each module ticket also owns `packages/contracts/src/<module>/**` and `MANIFEST.d/<module>.txt`)

| Lane | Ticket | What | Territory | Gate |
|---|---|---|---|---|
| m-1 | M-B | `0007_finance` · `0008_documents_imports` · `0009_people` · `0010_customers_growth` (loyalty ledger, campaigns, reservations, reviews, bulk orders) · `0011_compliance_goals_intel` (+ `intel` tables/views: claims, entities, edges, chunks, wiki, forecasts, findings, answers, traces, supplier quotes, spend, outcomes, event claims, watch state) · `0012_embeddings` (`-- requires: vector`) | `db/**` | count 11 on embedded PG with 0012 skipped loudly; balanced/closed-period/currency gates; loyalty never < 0 under 50 concurrent redeems; intel-cannot-write N/N; claim quote mismatch refused; 0012 applies on Supabase when F1 lands |
| b-20 | T-020 | Tenancy + onboarding: one call creates tenant + outlet + owner + defaults from the chosen pack (restaurant / cloud kitchen / shop); outlets, brands, channels, devices, members/invites/roles; country fixed at onboarding | `modules/tenancy/**` | onboarding of 3 kinds × 2 countries → expected default rows (fixture counts); country change after onboarding refused |
| b-21 | T-021 | Catalogue: items/variants/options, versioned recipes, prices per outlet/channel, deals with windows, coupons; barcode lookup | `modules/catalogue/**` | overlapping recipe/price validity refused, adjacent accepted; deal window matrix (12 committed cases) |
| b-22 | T-022 | Orders/POS: place (server pricing, deal re-judge on time change, coupons), tenders (cash/card/UPI recorded), voids, refunds, shifts + cash close, invoice series per device/FY, pickup windows + capacity, table QR orders, consumption via derivation | `modules/orders/**` | tampered totals ignored (20 carts vs hand totals); 11 concurrent vs capacity 10 → 10; shift variance = hand value; staff refund above authority → 403, manager → 200 |
| b-23 | T-023 | Kitchen: tickets, transition table, stations, short ticket numbers, timers, prep lists from forecast/par | `modules/kitchen/**` | illegal transition 409 / legal 200; ticket numbers reset daily per outlet in outlet tz |
| b-24 | T-024 | Inventory + store pack: movements, counts, waste, transfers, reorder levels, batches + FEFO + expiry, barcodes, MRP, returns, negative on-hand alert | `modules/inventory/**` | on-hand after 50 fixture orders = hand values; FEFO picks earliest expiry in 10 committed cases; sale above MRP refused |
| b-25 | T-025 | Purchasing: suppliers (real/simulated), POs (pooled), GRN → receipt movements, supplier invoices (duplicate refused), price observations, returns, payables link | `modules/purchasing/**` | PO → GRN → invoice chain yields expected movements and payable (fixture); duplicate invoice 409 |
| b-26 | T-026 | Finance: chart from pack, posting rules (order completed, tender, GRN, approved supplier invoice, approved settlement), journal, settlements/bank lines, reconciliation breaks, period close, P&L by outlet/brand/channel, GST summary, Tally export | `packages/core-domain/finance/**`, `modules/finance/**` | property test 1,000 docs → 100% balanced; same event twice → 1 entry; P&L of the fixture month = answer key |
| b-27 | T-027 | People: staff, rosters/shifts, attendance, payroll drafts (IN only per pack), advances, tips, training | `modules/people/**` | AU payroll command refused, IN accepted; overtime = fixture |
| b-28 | T-028 | Customers & growth: profiles, loyalty ledger, coupon use, campaigns (drafts only, never auto-sent), reservations, reviews, bulk orders | `modules/customers/**` | loyalty earn on complete / reverse on cancel (fixture); campaign send without approval refused |
| b-29 | T-029 | Compliance & goals: licence calendar from pack, checklists, temperature logs, assets, maintenance, AMCs, goals/tasks | `modules/compliance/**`, `modules/goals/**` | IN pack seeds FSSAI/GST/trade/fire templates; expiring-licence query returns the fixture set |
| b-30 | T-030 | Imports: documents (sha unique), format detection, mapping drafts (renames + units only), parsers (Swiggy/Zomato-shaped, Uber Eats/DoorDash-shaped, POS export, bank/UPI CSV, Tally), staging → preview draft → commit on approval, quarantine | `modules/imports/**`, `services/core-worker/src/imports/**` | 4 sample files per format: rows_ok = key; 3 bad rows quarantined; 0 book rows before approval, rows_ok after |
| b-31 | T-031 | Platform admin API: packs, plans, flags, budgets, model roles (provider + model per role), operators, config drafts | `services/core-api/src/platform/**` | model-role change only via an approved config draft; unknown provider refused |
| b-32 | T-032 | Storefront API: public menu per outlet, accepting-orders state, guest customer, place order, tracker topic, cancel/reschedule windows | `modules/storefront/**` | 6 refusal paths + happy path (committed cases); reschedule re-prices a deal |
| b-35 | T-035 | Customer identity + accounts (R41–R42): customer sign-in through the IdP port (email OTP / magic link + Google via Supabase Auth; `idp-local` in gates), per-merchant profile on first sign-in, guest → account merge by verified email, self-service API (profile, consents, order history, loyalty view, data export, erasure request with anonymisation), customer-token scoping | `modules/customers/accounts/**`, `packages/contracts/src/customers/accounts/**` | customer of merchant A sees 0 rows of merchant B with the same login; guest orders merged = fixture count; erasure anonymises personal fields and keeps order rows (counts); another customer's order → 404 |
| b-33 | T-033 | worldgen v1 via the API only: single restaurant (IN), small chain (3 outlets, IN), shop (IN), AU café; 6 months; ~40 planted problems with ₹ + answer key | `tools/worldgen/**` | determinism across TZ; planted count from the key; each ₹ recomputed by an independent script = key; 0 SQL clients in worldgen |
| t-1 | T-034 | W2 integration suite: order → consumption → postings; PO → GRN → invoice → payable; import → settlement → break; onboarding → first sale | `tests/integration/**` | each flow asserts hand-computed values; suite fails if any derivation is disabled (planted) |

## W3 — intelligence backend (rewritten 11 Oct 2026 from ADR-014 §12 + ledger R45 F1–F10)

### Consolidation (11 Oct 2026, founder: "merge + shared brief") — overrides the row-per-lane split below

To save tokens and shorten the serial migrator chain, these rows are dispatched **as one lane each** (35 → 26 lanes).
Each merged lane carries the union of its rows' territories and **all** of their gates; the row texts below stay as the
spec. Every lane reads `docs/plan/W3-LANE-BRIEF.md` first and only the ADR-014 sections its rows cite. One adversarial
review per sub-wave (Opus for security/money dimensions, Sonnet otherwise).

| Merged lane | Rows | Model | Notes |
|---|---|---|---|
| **m-1 · M-C1bc** | M-C1b + M-C1c | Opus (migrator) | remaining 6 packs' templates in one migration (after M-C1a) |
| **m-1 · M-C23** | M-C3 + M-C2 + the F11 Auto standing grant | Opus (migrator) | threads, AI policy, investigations, grant (+ trigger kind) in one migration; ordered before M-C1d (no dependency on the guard binding) |
| **b-55 · T-055** | T-055a + T-055b | Opus (money) | hybrid negotiation, rules + AI moves (F4) |
| **b-84 · T-084** | T-084a + T-084b | Sonnet | lineage + investigation reads/concurrency |
| **b-92 · T-092** | T-092a + T-092b | Sonnet | W4 read routes |
| **b-44 · Finance** | T-047 | Opus | alone (largest) |
| **b-45 · Inventory & Purchasing** | T-046 | Opus | alone (largest) |
| **b-46 · Kitchen + People** | T-045 + T-048 | Opus | |
| **b-47 · Menu & Pricing + Market** | T-044 + T-051 | Opus | |
| **b-48 · Customers + Compliance** | T-049 + T-050 | Opus (money: loyalty, coupons) | |

**Added 11 Oct (T-086 findings):** **T-093 · history kinds for shifts and stock counts** (Opus; migrator rider in M-C1bc + core imports):
`shift_log_v1` (float, counted cash, tenders by shift; orders exports `expectedCash`) and `stock_count_v1`
(`inventory.count_adjust` rule bound to `imports.run.commit.v1`). Needed so investigation H0 ("data complete": POS days
closed) can complete on dated history, and for the cash-variance plants. Dispatch in W3.2 before T-083.
**Ruling for T-083 (share sign):** a bridge row "explains" the change when it moves in the same direction as the total:
supported iff `share_bp × sign(margin_delta) ≥ 1,000`; waste (H2) is a valuation row (consumption posts nothing under the
purchases method, W2-R5), offset by `cogs_volume_mix`, and is judged on its own quantity rule, not on margin share.

Migrator chain after consolidation: **M-C1a → M-C23 → M-C1bc → M-C1d** (4 steps, was 6). Kept separate (size or
architectural weight): T-040, T-040b, T-080, T-042, T-043, T-081, T-082a, T-082b, T-083, T-088a, T-088b, T-089a, T-089b,
T-053, T-054, T-057, T-056, T-058, T-059, T-085, T-086, T-087b, T-090.


**Sources, in authority order:** the ledger R45 and its addenda F8, F9 and F10, then ADR-014 §11–§12, then this table.
- Where ADR-014's body still describes the pre-addendum design, **the ledger wins and this board follows it.** The affected parts are the deterministic-only negotiator (§3.2 #5, §12 T-055, §13.2, §14 L4/P6), "ask answers never re-read" (§6.4 rule 4) and member-triggered-only investigations (§0.5, §7.2, §13.3).
- These passages are listed in ADR-014 "Post-ratification notes".

**The intel lanes own `services/intel/munim_intel/<area>/**`.** Core lanes own `services/core-api/src/modules/<module>/**` together with their contracts module.

**Model tiers** (policy from DECISIONS 10 Oct 09:55):
- **Opus** for the migrator and for money, security or orchestrator work. Each Opus row gives its reason in one word.
- **Sonnet** for conventional work.

**Gate rules (ADR-014 §12):**
- Every gate asserts a positive quantity and can fail.
- Expected counts come from an **independent, hand-kept source** named in the gate: the ledger F8 list, the pack md tables, `MANIFEST.d`, `db/tests/manifest.ts`, the worldgen answer keys plus `detector-map.json`, the ADR §7.5 table, or a hand-labelled list committed with the ticket.
- No gate compares an artifact with itself.
- Every gate runs `MUNIM_MODEL_MODE=recorded` and is red-proven, including a non-zero process exit (gotcha 33).

**Specialists (F8).** These are the specialist ids and display names. The registry is in `packages/contracts/src/intel/specialists.ts` (T-087a).

| Pack | Specialist |
|---|---|
| `catalogue` | Menu & Pricing |
| `kitchen` | Kitchen |
| `inventory_purchasing` | Inventory & Purchasing |
| `finance` | Finance |
| `people` | People |
| `customers` | Customers & Growth |
| `compliance` | Compliance & Assets |
| `market` | Market & Strategy |

Shared and orchestrator entries:
- **Forecast** is a shared service, not a specialist.
- The orchestrator is the **Manager**. Its ADK agent name stays the constant `munim` (ADR-014 §6.1). The display identity lives only in labels.

Actor labels:

| Run or event | Label |
|---|---|
| Watcher run | `watcher:<pack>` (existing CHECK in 0003) |
| Specialist trace | `specialist:<pack>` |
| Manager trace | `manager` |
| Branch trace | `branch:<pack>` |
| Draft source | `intel:<pack>` (existing CHECK) |
| Finding | its `pack` column (existing) |

Pack and specialist map 1:1, so **no new attribution column is needed** (checked against 0003:299 and 0012:441).

**Migrator queue** (serial; numbers are assigned on landing): M-C1a → M-C3 → M-C1b → M-C1c → M-C1d → M-C2.

**The dependency H-1 is satisfied** (0018, 8088c47).

### W3.0 — done and start now

| Lane | Ticket | Model | Depends on | What | Territory | Gate |
|---|---|---|---|---|---|---|
| b-41 | T-041 | — | — | **DONE 7f6418a.** intel runtime (uv, `google-adk==2.11.0`, RunContext from an Ed25519 token, provider registry, RecordedLlm, FastAPI). Frozen as committed (ADR-014 §10). | (as built) | as built: 0 `tenant_id` tool params (1 planted); forged token refused; recorded run byte-identical; lock gate red with a planted `litellm` |
| b-52 | T-052 | — | — | **DONE e05dd79.** Deterministic forecast engine: seasonal-naive plus `weighted_seasonal_v1`, a 4-origin backtest, a per-series strict-win choice | (as built) | as built: beats naive on 4/4 synthetic worlds; output byte-identical |
| d-1 / h-1 / w-1 | T-036 · H-1 · W-1 | — | — | **DONE (R44).**<ul><li>T-036 dev-only local IdP selector: 3aa4c93.</li><li>H-1 dated history through approved imports (0018) plus a batched commit, 865 → 8.9 ms per bill: 8088c47.</li><li>W-1 worldgen on dated history, 60 plants, `make demo` 77.9 s on embedded: aaca235.</li></ul> | (as built) | as built |
| m-1 | M-C1a | Opus (migrator) | 0018 | ADR-014 §12 M-C1a, covering:<ul><li>outlet-scoped RLS on the outlet-data tables (R1-m9);</li><li>`numeric_source` as a list (§14 C6);</li><li>the template `min_role` gains an `advisor` rung, which settles the reverted W2-R8;</li><li>templates: catalogue (6) and finance (7, including `finance.pnl`), plus `finance.margin_bridge`.</li></ul> | `db/**` | (1) Template ids = 14, parsed by a script from the pack md §3 tables plus ADR §7.3.<br>(2) Each returns exactly its spec columns on `restaurant_group` and `store`.<br>(3) Numeric-source gate: 0 violations, including list elements; a planted intel column → red.<br>(4) Manager scope: an outlet-A manager minting each outlet-scoped template sees ≥ 1 own row and 0 outlet-B rows; red with RLS dropped.<br>(5) `margin_bridge`: Σ rows = `margin_delta_minor` exactly on 2 worlds; a planted mis-sum → red.<br>(6) An advisor mints `finance.pnl` → 201; staff → 403 (pair). |
| b-40 | T-040 | Opus (security) | — | Internal API, W1 subset: `events:claim`, `watch:claim`, `snapshots`, `findings`, `drafts`, `answers`, `traces:batch`. Plus:<ul><li>the validator resolver;</li><li>draft idempotency, open-duplicate merge and `recently_rejected` suppression **in core** (§5.5, §14 C5/C7);</li><li>**mounting the 7 public routes that contracts declare but core-api does not serve**: `GET /v1/findings`, `GET /v1/inbox`, `GET /v1/snapshots/{id}`, `POST /v1/snapshots` (member mint, R40 C4), `GET /v1/runs?finding=`, `GET /v1/runs/{id}`, `GET /v1/traces/{run}`;</li><li>`GET /v1/runs` as a list (G-OFF-1).</li></ul>The 7 are missing today because `modules/index.ts` lists `evidence, findings, inbox, runs, traces, internal`, the directories do not exist, and `loadRouters` skips them silently. | `services/core-api/src/internal/**`, `modules/{evidence,findings,inbox,runs,traces}/**` except `inbox/ranking.ts`; `packages/contracts/src/internal/**`; the `loadRouters` loader in `services/core-api/src/modules/index.ts` (gate 10 only; the registry list stays as T-004 left it) | (1) A free digit → abstained with a reason.<br>(2) A bare-number draft → 422; with refs → 201.<br>(3) A cross-tenant ref → refused.<br>(4) A 500-event trace batch is gapless.<br>(5) Same id and body → byte-identical response; different body → 409.<br>(6) An open duplicate → the existing id, 0 new rows.<br>(7) A rejected fingerprint within 30 days → `recently_rejected`; at 31 days → accepted.<br>(8) Each of the 8 public routes returns ≥ 1 fixture row and 0 rows of another outlet.<br>(9) Route-table diff (contracts `ROUTES` vs mounted) = 0 for these modules.<br>(10) A registry entry whose directory is missing fails boot. Red-proven by deleting one router dir; today it boots silently. |
| b-80 | T-080 | Opus (security) | M-C1a (functions so far) | `make ontology`, the model-facing schema transform, lint and freshness. No per-provider emitters (ADR §2.4, §5.2). | `tools/ontology/**`, `packages/contracts/generated/ontology.json`, `services/intel/munim_intel/contracts_gen/ontology.py` | (1) Actions = count of `proposal.` lines in `MANIFEST.d` (22).<br>(2) Object tables and FKs = counts in `db/tests/manifest.ts`.<br>(3) Functions = the M-C1 parsed ids landed so far.<br>(4) 20/20 agent-exposed transformed schemas pass lint; a planted `oneOf` → red.<br>(5) New-entity id fields are absent from the model schemas (hand list from pack §6).<br>(6) An edited migration or contract without regeneration → red.<br>(7) A renamed Pydantic class leaves tool names unchanged (R3-m10). |
| b-87 | T-087a | Sonnet | — | **Specialist registry (F8).** Contracts data, one entry per specialist: id = pack, display-name i18n key, desk key, `@`-mention aliases, owned detectors, owned agent-exposed templates, proposable draftables. Plus the Manager entry and the Forecast service entry. Validated against the pack md files and, once T-080 lands, `ontology.json`. | `packages/contracts/src/intel/specialists.ts`, `MANIFEST.d/intel.txt` (registry lines) | (1) Specialists = 8, the hand list in ledger R45 F8. Exactly 1 `manager` and 1 `forecast` service.<br>(2) Each of the 8 pack files in `docs/plan/packs/` (excluding `forecast.md`) maps to exactly 1 specialist (script over filenames).<br>(3) Every detector id in the pack md tables is owned by exactly 1 specialist: 0 unowned, 0 double-owned; a planted duplicate → red.<br>(4) Each of the 20 agent-exposed draftables is proposable by ≥ 1 specialist (shared ones such as `goals.task.create` are allowed).<br>(5) Mention aliases are unique across specialists (a planted clash → red). |

### W3.1

| Lane | Ticket | Model | Depends on | What | Territory | Gate |
|---|---|---|---|---|---|---|
| m-1 | M-C3 | Opus (migrator) | M-C1a, T-087a | **Specialists, threads and AI policy (F8–F10).**<ul><li>`core.ai_thread(tenant_id, id, specialist null, created_by, outlet_scope, summary jsonb (cited segments from **untainted** turns only))` and `core.ai_thread_turn(tenant_id, thread_id, turn_no ≥ 1 gapless, member_id, answer_id → intel.answer, addressed_to null, tainted bool)`. Both **operational**. They are **not** `core.conversation`/`core.message` (0009), which hold ingested, untrusted chats.</li><li>`core.ai_policy(tenant_id, role, mode_ceiling ∈ {step, plan, auto})` and `core.ai_budget_cap(tenant_id, monthly_cap_minor, currency)`. Both are **book**: R29 lists budgets, and they are written only by the owner's own command (`ai_policy.ceiling.set.v1`, `ai_policy.cap.set.v1`; core book commands of `modules/ai_policy`, never intel writes in `command_authority`, owner only).</li><li>The template `intel.agent_track_record` (the rider from D-2). It is per specialist: proposed, approved, edited, rejected, stale and abstained counts. Numeric sources are `core.decision`/`core.draft` counts and `intel.trace_event` abstain counts only (R40 C5); never `confidence_bp`.</li><li>The template `intel.ai_budget_left`: cap, operator limit, spent this month, from `intel.intel_spend`.</li></ul> | `db/**` | (1) The isolation expected set grows by 4 (`db/tests/manifest.ts`, by hand).<br>(2) Tag gate: 2 operational and 2 book.<br>(3) intel-cannot-write N+4/N+4.<br>(4) `ai_policy` written by `munim_svc` → 42501. By the owner's own command → 1 row plus 1 audit row. By a manager → MB001.<br>(5) A turn gap is refused; a consecutive turn is accepted.<br>(6) On a fixture with 3 approved, 2 rejected, 1 stale and 1 abstained for `finance`, `agent_track_record` = those hand values, and 0 rows for `kitchen`.<br>(7) Numeric-source gate stays green; a planted `confidence_bp` column → red. |
| m-1 | M-C1b | Opus (migrator) | M-C3 | Templates: inventory_purchasing (10 new), kitchen (5) and forecast (5) | `db/**` | as M-C1a (1)–(4), counts from the pack md |
| b-40 | T-040b | Opus (money) | T-040, M-C3 | Restored orphan routes (review M8):<ul><li>`forecasts:batch`, `quotes:batch`;</li><li>knowledge batches (claims, entities, aliases, edges, chunks, embeddings, wiki);</li><li>`spend`;</li><li>`GET model-roles`;</li><li>`GET run-frame`: outlets, kinds, tz, business dates, pack code/version, currency, and **budget soft/hard left**, where the effective cap = min(owner cap, operator `platform.llm_budget.limit_minor`) — see open item O-2.</li></ul>Contracts + SDK. | `services/core-api/src/internal/**` (batch + frame files), `packages/contracts/src/internal/**` | (1) 500 claims → 500 rows; a quote mismatch → MB012 refused.<br>(2) model-roles returns 6 rows = the 0015 seed list (hand count).<br>(3) run-frame for a manager scoped to 1 of 3 outlets lists exactly 1 outlet.<br>(4) Budget left after 3 recorded spends = min(cap, limit) − Σ (hand values), checked with both cap < limit and cap > limit.<br>(5) Every new route is in the OpenAPI (route-table diff). |
| b-42 | T-042 | Opus (security) | T-041 | `MunimPlugin`:<ul><li>14 callbacks (FACT `plugins/base_plugin.py`);</li><li>a per-run `RunState` (budget, taint, handle table, `TraceBuffer`);</li><li>flush in `on_run_error` and in `finally`;</li><li>actor labels per the specialist table above.</li></ul> | `trace/`, `runtime/state.py` | (1) Each of the 14 callbacks fires ≥ 1 across the scripted run plus 3 planted-error runs; a misspelt hook → 0 → red.<br>(2) A planted model exception → traces flushed (rows ≥ 1); red without the error-path flush.<br>(3) Fixture usage above the cap stops at exactly the cap and returns the template fallback.<br>(4) Invalid args → 1 actionable error + 1 retry = 2 `tool_call` traces.<br>(5) Search then propose in one run → propose refused (1), 0 drafts; without search → accepted (1).<br>(6) 4 concurrent branches × 60 events → seq 1..240 gapless.<br>(7) Every trace row of a skill-bearing run carries `specialist:<pack>` or `manager` (count = rows). |
| b-81 | T-081 | Opus (security) | T-041 | `DecisionModel` port, `RecordedDecision`, `LlmMimic` (router role only, F2), and egress allow-lists. Questions: `route.intent`, `map.columns`. | `decide/` | (1) A planted out-of-enum answer → `decision_invalid` → fallback, 1/1.<br>(2) Probabilities sum to 10,000 ±1 on every recorded result that has them.<br>(3) A planted non-allow-listed field (a tenant UUID; a sample cell) is refused before the network, 2/2. The allow-listed request carries exactly the listed fields.<br>(4) No logprobs → band `low` → fallback (1). |
| b-43 | T-043 | Opus (money) | T-040, T-080, T-087a, M-C1a | Watcher pipeline as intel code, covering:<ul><li>`DetectorSpec`;</li><li>`DraftMapping` with **canonical refs**;</li><li>template narration, plus model narration at or above `high`;</li><li>`confidence_bp` from coverage cells (§14 C3).</li></ul>Every finding and draft is stamped with its specialist (`pack`, `intel:<pack>`). | `events/`, `watch/` | (1) 3 deliveries → 1 finding.<br>(2) Just below the threshold → 0; just above → 1.<br>(3) 0 LLM calls with narration off (call counter).<br>(4) `confidence_bp` = the coverage cell named in the pack (hand list).<br>(5) Findings and drafts with a wrong or absent specialist = 0 over the fixture run; a planted mismatch → red. |
| b-86 | T-086 | Sonnet | W-1 | **Worldgen plants** (review M4):<ul><li>add the missing pack §10 plants: C1–C3, C5–C6, K1, K4–K6, M1–M4, FC2/FC2b/FC4, P2, G1–G3, G5–G6, F5–F8, A4, A7;</li><li>`margin_fall` month pairs with hand-computed bridge components;</li><li>`answer-key/detector-map.json`;</li><li>switch `verify/pending-inputs.ts` to the read routes now present (channel terms, staff, reorder levels).</li></ul>Through the API and approved imports only. | `tools/worldgen/**` | (1) The new plants per world equal the list above, and each ₹ is recomputed by the independent verify script = key.<br>(2) Bridge components and residual = the verify script's recomputation.<br>(3) 0 unmapped answer-key kinds.<br>(4) Determinism and no-SQL gates stay green.<br>(5) The pending-inputs list shrinks by the 3 kinds served today. |
| b-90 | T-090 | Opus (money) | M-C3, T-040b, **O-2 (founder) before dispatch** | **AI policy (F10 "who").** A core module covering:<ul><li>per-role mode ceilings (defaults: owner `auto`, manager `plan`, staff `step` from ledger F10; advisor `step` and judge `plan` are INFERENCE — see open item O-3);</li><li>the tenant's monthly AI cap (owner's own command; never above the operator limit — see O-2);</li><li>`GET/PUT /v1/ai/policy`;</li><li>enforcement helpers used by investigations (ceiling) and by the run-frame budget (cap → `budget.hard_left`). **Run tokens are never refused for budget**, so watchers and template briefs keep working at the hard cap: rules only, per 04 §10 and rule 11.</li></ul> | `modules/ai_policy/**`, `packages/contracts/src/ai_policy/**` | (1) Onboarding seeds 5 policy rows with the defaults above (hand list).<br>(2) Staff asks for Plan → 403 `mode_above_ceiling`; manager Plan → 201; manager Auto → 403; owner Auto → 201 (4/4).<br>(3) A cap above the operator limit → 422 `cap_above_platform_budget`; at or below it → 200 with 1 audit row, and the clause-1 scan is clean.<br>(4) A manager PUT → 403.<br>(5) Spend at the cap → the next run-frame says `hard` and the ask takes the rules-only path (1). |
| b-87 | T-087b | Sonnet | M-C3, T-040 | **Specialist identity + desk API (F8, F9 b).** `GET /v1/specialists` and `GET /v1/specialists/{id}` (desk). The desk carries:<ul><li>open findings (`pack`);</li><li>drafts (`source = intel:<pack>`);</li><li>the track record as a **member-minted `intel.agent_track_record` snapshot ref** (R40 C4/C5);</li><li>the threads addressed to it.</li></ul> | `modules/specialists/**`, `packages/contracts/src/specialists/**` | (1) The list length = 8 from the **ledger F8 hand list** (not the registry it serves).<br>(2) On a fixture with 3 finance and 1 kitchen findings, the finance desk lists 3 and the kitchen desk lists 1.<br>(3) Track-record counts appear only as snapshot refs: 0 bare digits in computed fields (payload scan; a planted literal → red).<br>(4) An outlet-A manager sees 0 outlet-B findings on any desk.<br>(5) Kitchen on a store-only tenant → 200 with `applicable: false` (1). |

### W3.2

| Lane | Ticket | Model | Depends on | What | Territory | Gate |
|---|---|---|---|---|---|---|
| m-1 | M-C1c | Opus (migrator) | M-C1b | Templates: people (6) + customers (7) | `db/**` | as M-C1a (1)–(4) |
| m-1 | M-C1d | Opus (migrator) | M-C1c | Templates: compliance (5) + market (6) + the non-pack deferred list (committed `M-C-extra.txt`, from the W2-FIX-LIST "Deferred to W3" block). Also generalise the guard derivation branch so it binds the written row to its source (W2 carry-over). This **changes ADR-013's book guard**, which could be a non-additive change (escalation check by the orchestrator). The lane report needs a guarantee-scan section. | `db/**` | (1)–(4) as M-C1a.<br>(5) A derivation write whose row does not match `app.source_ref` → MB001; a matching write → accepted. |
| m-1 | M-C2 | Opus (migrator) | M-C1d | `core.investigation` and `core.investigation_step` (operational, gapless), **with the F10 columns**:<ul><li>`mode ∈ {step, plan, auto}`;</li><li>`plan_approved_by`, `plan_approved_at`;</li><li>`stop_reason ∈ {draft, abstain, budget, scope, waiting}` (null while running);</li><li>`step.triggered_by ∈ {member, plan, auto}`.</li></ul>Also:<ul><li>`intel_ro.investigation_current` (owner `munim_view_owner` + assertion + grants);</li><li>`munim_svc` INSERT on `core.investigation_step` **and UPDATE on `core.investigation (status, checklist, steps_done, stop_reason, updated_at)`** for core-worker Auto steps (§14 C9);</li><li>the template `intel.investigation_cost_estimate` (numeric source `intel.intel_spend` per-step history × remaining checklist items; labelled "estimate (computed)").</li></ul> | `db/**` | (1) The isolation expected set grows by 2.<br>(2) Both tables tagged operational.<br>(3) A step gap is refused; a consecutive step is accepted.<br>(4) View owner = `munim_view_owner` (red when altered).<br>(5) intel-cannot-write N+1/N+1.<br>(6) `mode = auto` with `plan_approved_by` null → refused; with it set → accepted.<br>(7) The cost estimate on a fixture with 4 recorded step spends = the hand value.<br>(8) Service privilege: `munim_svc` UPDATE of those 5 columns → accepted; of `created_by` or `outlet_scope` → 42501. |
| b-44 … b-51 | T-044 … T-051 | Opus (money): T-044, T-046, T-047, T-048, T-049 · Sonnet: T-045, T-050, T-051 | T-043, T-080, T-087a, their pack's M-C1 split; T-086 for T-044, T-045 and T-051 | **One specialist each (F8).** Each ticket owns that specialist's:<ul><li>fixed-path workflows: detectors, `DraftMapping`s, its share of playbooks;</li><li>its **skill** (`SkillSpec`: instructions ≤ 1.5k, read/propose tools ≤ 20);</li><li>its identity copy (i18n keys: name, role line, desk blurb);</li><li>its **eval cases** against the answer keys.</li></ul>No per-pack agent code.<br>The tickets: T-044 Menu & Pricing · T-045 Kitchen · T-046 Inventory & Purchasing (stock and quotes; negotiation is T-055) · T-047 Finance · T-048 People · T-049 Customers & Growth · T-050 Compliance & Assets · T-051 Market & Strategy. | `skills/<pack>/`, `watch/detectors/<pack>/`, `evals/<pack>/` | Per specialist:<br>• every answer-key problem mapped to its detectors (`detector-map.json`) is found, with impact cell = `impact_minor`;<br>• false alarms ≤ 2;<br>• ≥ 1 refusal case with its named `reason_code`;<br>• each draft-bearing plant yields a payload whose refs resolve to the pack §6 cells (count from pack §6);<br>• SkillSpec valid and ≤ 20 tools;<br>• 100% of its findings, drafts and traces carry its specialist label (count = rows produced). |
| b-55 | T-055a | Opus (money) | T-040b, M-C1b, T-042, T-087a | **Negotiation, rule half (F4).**<ul><li>`suppliers-sim`: `a2a-sdk` server, 3 personalities as data, card URL public (gotcha 6), labelled "Simulated supplier".</li><li>`SupplierPort` client.</li><li>`NegotiationPolicy` from the pack plus rules: target and walk-away price, max rounds (2), allowed concessions. It computes the **rule-allowed move set** each round and the **default move**: counter = best rival (pack §6), with the counter price set by the rule, never by a model.</li><li>Supplier replies go to the no-tools extractor, which produces typed quote fields (the run is tainted).</li><li>`quotes:batch`.</li><li>Deterministic deal review (5 rules).</li><li>**The PO draft is emitted by deal-review code** (canonical quote refs; never `propose_*`).</li><li>Adds `google-adk[a2a]`.</li></ul> | `services/suppliers-sim/**`, `negotiate/` (rules, port, review), `skills/inventory_purchasing/negotiate/` | (1) With the default policy only: 3 RFQs and ≤ 2 counters traced; the I7/S1 plant yields 1 PO draft for the answer-key supplier with quote refs.<br>(2) The hidden minimum-order clause is refused 10/10.<br>(3) Every supplier label reads "Simulated supplier" (count = screens and cards).<br>(4) A planted chooser that answers "accept" on a quote above walk-away → walk (1/1); "counter" after max rounds → not in the allowed set → default (1/1).<br>(5) Lock gate red with a planted `litellm`, green without.<br>(6) Every a2a trace carries `specialist:inventory_purchasing`. |
| b-56 | T-056 | Opus (security) | T-040b, T-081 | Ingestion: quarantined extractor and vision; `map.columns` through T-081 (headers only); exact-alias entity linking (no DM). Adds `purchasing.invoice.record.v1` as a draftable request to contracts (ADR §2.1). | `ingest/` | (1) Extractor tool count 0.<br>(2) Claim quotes are source substrings 100%.<br>(3) Injection fixtures → 0 tool calls.<br>(4) A mapping draft with arithmetic → refused.<br>(5) The `map.columns` body holds 0 cell values; a planted sample → refused. |
| b-58 | T-058 | Sonnet | T-040b | Graph port + Postgres-edges adapter + projector + 5 templates; FalkorDB behind the same contract suite, skipped with no server (F7) | `graph/`, `adapters/dev/graph-falkordb/` | (1) 5/5 templates on the fixture = expected.<br>(2) Tenant filter removed → isolation red. |
| b-84 | T-084a | Sonnet | T-040 | Lineage routes, `/v1/draftables`, `findings:dismiss`, the reject `reason_code`; mount or delete the unmounted SDK operations (R3-m5) | `modules/lineage/**`, `modules/approvals/reject*` (reason code only) | (1) Lineage of a price row changed by an approved draft returns the 6-hop chain.<br>(2) Planted rejected, stale and failed drafts (3) each appear with reason, changes or sqlstate.<br>(3) `/v1/draftables` length = `proposal.` lines in `MANIFEST.d`.<br>(4) Another outlet's row → 404.<br>(5) Every mounted `/v1` route has an OpenAPI operation. |
| b-88 | T-088a | Opus (security) | M-C3, T-040, T-087a | **Threads and addressing, core half (F9).**<ul><li>`POST /v1/ask {question, thread_id?}`: core parses a leading `@Name` against the registry aliases (deterministic, never a model) into `addressed_to`.</li><li>`GET /v1/threads?specialist=`, `GET /v1/threads/{id}`.</li><li>Turn rows.</li><li>The **rolling cited summary is deterministic**: the last ≤ 8 validated, cited segments of the thread's **untainted** turns, each with refs; oldest dropped. This keeps ADR §6.2 (no LLM summariser). Segments from a tainted turn never enter the summary, which mirrors ADR §6.4's exclusion of tainted step summaries; that closes the B1 path of a tainted turn aging out of the window while its prose stays in the summary.</li><li>run-frame `thread.tainted` = OR of the last ≤ 3 turns.</li><li>run-frame gains `thread{summary_refs, last_turn_ids[≤ 3], tainted}`.</li><li>**The signature "{Specialist} · via Manager" is composed by core from i18n.** intel never sends signature text.</li></ul> | `modules/threads/**`, `packages/contracts/src/threads/**`, run-frame thread block | (1) 12 committed mention cases (`@Finance`, `@finance`, `@Menu`, an email `a@b.c` is not a mention, `@Foo` → 422 `unknown_specialist`, …) = the hand-labelled list.<br>(2) Turns are gapless under 2 concurrent asks.<br>(3) Another member's thread outside their scope → 404.<br>(4) A thread with 1 tainted turn inside the last 3 → run-frame `tainted: true`.<br>(4b) The same turn aged out of the last 3 → its segments appear 0 times in the summary and `tainted: false`. Red when the summary exclusion is removed (its segment present while `tainted: false`).<br>(5) The answer payload from intel holds 0 signature strings; the response holds exactly 1 composed signature. |

### W3.3

| Lane | Ticket | Model | Depends on | What | Territory | Gate |
|---|---|---|---|---|---|---|
| b-83 | T-083 | Opus (orchestrator) | M-C2, M-C1a, T-086, T-087a | **Investigations, Step mode (F1, F10 default).**<ul><li>`modules/investigations` (core-api);</li><li>`core-domain/investigations/playbooks.ts` (`margin_fall`), where each item names its owning specialist;</li><li>intel `/investigate:narrate` (L1, signed by the owning specialist).</li></ul> | `services/core-api/src/modules/investigations/**`, `packages/core-domain/investigations/**`, intel `investigate/` | On `restaurant_group` with the T-086 plants:<br>(1) Bridge Σ = margin delta = key.<br>(2) Supported items = the key's list.<br>(3) A missing settlement → H0 `cannot_verify`, status `waiting`; approve the import + `:continue` → H0 supported.<br>(4) A planted flip of a frozen item at the final re-mint → reopened, not `done`.<br>(5) A member scoped to outlet 1 opening an all-outlet investigation → 404.<br>(6) Narration tool count = 0 and step `tainted` = false.<br>(7) Intel down → template summary, status still computed.<br>(8) Item → specialist matches the ADR §7.5 table (7 items, hand list). |
| b-84 | T-084b | Sonnet | T-083 | Investigation routes, SDK, SSE on the existing topics | `modules/investigations/routes*`, contracts | (1) `:continue` twice concurrently → 1 step (gapless).<br>(2) `:cancel` → `cancelled`, then `:continue` → 409. |
| b-82 | T-082a | Opus (orchestrator) | T-080, T-042, T-040b | Context assembler (§6.1), the run `RunState` handle table, handle expansion, the SkillSpec loader and `PackToolset`. Adds block 6b, the **thread excerpt** (≤ 1.5k): summary segments plus the last ≤ 3 turns, from the run-frame. | `context/`, `skills/loader.py` | (1) Every assembled call ≤ its per-call cap on the hand-labelled question list.<br>(2) Two tenants, same question → byte-identical system instruction through block 4 (real `LlmRequest`).<br>(3) A planted unexpanded handle → "cannot verify".<br>(4) A second `load_skill` above 20 tools → refused.<br>(5) A tainted step summary in block 6 → 0 bytes in context; untainted → present.<br>(6) Thread excerpt: turns older than the last 3 → 0 bytes; the last 3 → present (ids asserted). |
| b-82 | T-082b | Opus (orchestrator) | T-082a, T-081, T-088a, ≥ 1 of T-044…T-051 | **Manager ask, end to end (F8, F9 a).**<ul><li>`route.intent` → path table.</li><li>`addressed_to` **forces that specialist's skill** (no `load_skill` choice) and sets the answer's specialist.</li><li>The `draft_request` binding rule.</li><li>`submit_answer`.</li><li>A thread whose run-frame says `tainted` starts the run tainted.</li></ul> | `manager/`, `tools/answer.py` | (1) For each of the 6 `route.intent` values, the path = the hand-written path table.<br>(2) `propose_*` is bound only on `draft_request` with 1 skill, and 0 otherwise.<br>(3) `certification_request` → `not_a_certificate`, 0 LLM calls.<br>(4) `@X` for each of the 8 specialists → exactly that skill's tools bound (8/8, tool list inspected).<br>(5) `@Kitchen` on a store-only tenant → abstain `not_applicable` (1).<br>(6) A tainted thread → `propose_*` refused (1), 0 drafts; an untainted thread → accepted (1). Red when the carry is removed. |
| b-88 | T-088b | Opus (security) | T-082a, T-088a | **Specialist threads, intel half (F9 b).** A thread run is the same Manager-owned validated path with the thread excerpt in context. No separate agent and no separate write path. | `threads/` | (1) Answers in a specialist thread carry that specialist, 10/10 recorded turns.<br>(2) The rolling summary refs all resolve after 5 turns (0 dangling).<br>(3) An injected review read in turn 2 → turn 3 starts tainted (asserted from `RunState`) → `propose_*` refused (1).<br>(4) Traces carry 0 thread prose (payload scan).<br>(5) At turn 6, after the injected turn 2 has aged out of the window, 0 bytes of turn 2 appear in the assembled context. Red when the summary exclusion is removed. |
| b-55 | T-055b | Opus (money) | T-055a, T-042 | **Negotiation, AI half (F4).** Each round one L1 call on the `reason` role makes a **typed choice** from the rule-allowed set (accept / counter / walk away), re-validated in Python. It also writes ≤ 2 sentences of message prose. **Prices in the message are rendered from the rule's values by code; the prose passes the number grammar.** Budget, error or out-of-set → the rule's default move. | `negotiate/chooser.py` | (1) A planted out-of-set move → default, 1/1.<br>(2) Recorded run: chosen move ∈ allowed set on every round (count = rounds).<br>(3) Message prose holds 0 free digits over all recorded messages; a planted digit → template message (1).<br>(4) A reply with a planted injection → extractor tool count 0, `RunState.tainted` = true, `propose_*` refused (1), and the PO draft is still produced by deal-review code with quote refs only (1).<br>(5) Model calls ≤ rounds + 1 retry; at a budget stop → 0 further calls, default policy completes.<br>(6) Recorded fixtures: PO supplier = answer key on I7/S1. |
| b-54 | T-054 | Sonnet | T-043 | Brief and ranking (deterministic) plus ≤ 1 narration call; each brief item is signed by its specialist | `brief/`, `services/core-api/src/modules/inbox/ranking.ts` | (1) Top 5 = the answer-key ranking.<br>(2) 0 duplicate dedupe keys.<br>(3) ≤ 1 model call.<br>(4) The hard-cap fallback passes the validator. |
| b-57 | T-057 | Sonnet | T-040b, T-056 | Wiki compiler: pages per node kind, cited-only sentences, dirty tracking, versions | `wiki/` | (1) A planted uncited sentence is dropped.<br>(2) Only dirty pages are rebuilt (count). |
| b-89 | T-089a | Opus (money) | T-083, T-090, M-C2 | **Investigation Plan mode (F10).**<ul><li>`POST /v1/investigations {…, mode}` with the ceiling check.</li><li>A plan preview: checklist items, specialists involved, estimated AI cost as a **snapshot ref** of `intel.investigation_cost_estimate`, labelled "estimate (computed)".</li><li>`:approve-plan`, the member's own command on an operational row.</li><li>The approved steps run **synchronously inside the `:approve-plan` request**, so the member's verified token supplies the scope for the R40 C4 member-minted snapshots. That is ≤ 10 steps of one narrate call each, with progress streamed on the existing SSE topics. Each step runs through the `:continue` code path in its own transaction, `triggered_by = plan`.</li><li>Steps stop at waiting, a linked draft, an abstain, the budget or a scope change, recording `stop_reason`.</li><li>There is no core-api background loop (R35: background work is core-worker's, which is Auto). A dropped request leaves durable state, and `:continue` resumes.</li></ul> | `modules/investigations/plan*`, contracts | (1) The `margin_fall` preview lists 7 items and the specialists from the ADR §7.5 hand table, with the cost as a ref (0 bare digits).<br>(2) After approval with the missing-settlement world → stops after 1 step at `waiting`; on the complete world → runs to `done` in the hand-counted steps with 0 further member calls.<br>(3) Cap reached mid-plan → `stop_reason = budget`, 0 further model calls.<br>(4) Membership narrowed mid-plan → next step `cancelled` (1).<br>(5) A member whose ceiling is `step` → 403 on `:approve-plan`.<br>(6) A planted kill between steps → steps gapless; `:continue` resumes at `steps_done + 1`.<br>(7) 0 steps run after the approving request has returned (step timestamps ≤ response time). |

### W3.4

| Lane | Ticket | Model | Depends on | What | Territory | Gate |
|---|---|---|---|---|---|---|
| b-53 | T-053 | Opus (orchestrator) | T-082b | **Fan-out (F5): specialists acting read-only.** `fan_out` runs ≤ 4 branch Runners, each with its own `InMemorySessionService` (not `ParallelAgent`). Branches are labelled `branch:<pack>` and return `BranchReport{tainted}`; the Manager merges in `submit_answer`. | `fanout/` | (1) 20 recorded questions → the hand-labelled classifications, including 4 abstentions.<br>(2) ≥ 3 parallel branches traced.<br>(3) Each branch's first `LlmRequest` holds 0 orchestrator events and ≤ 16k tokens.<br>(4) Branch tool lists hold 0 `propose_*`.<br>(5) A branch that reads a planted injection → orchestrator `RunState.tainted` = true; red when propagation is removed.<br>(6) Run totals are within the §3.4 caps on fixture-reported usage. |
| b-85 | T-085 | Sonnet | T-044…T-051, T-083 | **W3 eval harness with per-specialist reporting (F8 d).** `make eval-w3` prints:<ul><li>N1 per world and per specialist;</li><li>false alarms, refusal pass and draft-ref resolution per specialist;</li><li>investigation verdicts;</li><li>the per-category recorded plumbing table.</li></ul> | `evals/w3/**`, `Makefile` target | (1) A threshold set above the **answer-key ratio** (or a PDR §6 target) → red.<br>(2) A specialist with 0 plants in a world prints "no plants", not 100%. Kitchen on `store` is "n/a"; a planted 100% for a no-plant row → red.<br>(3) A transcript-only assertion in a golden file → lint red.<br>(4) Rows = 8 specialists × 4 worlds (ledger F8 × worldgen list). |
| b-59 | T-059 | Sonnet | T-042, T-081 (can start earlier) | Live smoke, the DM mimic probe (logprobs per provider), and **budget measurement**: tokens per call kind, cache-hit where reported | `services/intel/tests/live/` | Prints the provider × role matrix (ok / skipped / failed + latency) and a measured-tokens table. Its rows = the 10 rows of ADR-014 §3.4 (hand count); a missing row → red. It **exits non-zero if any provider whose key is present reports `failed`** (a planted bad model id → red). Skipped loudly without keys. The §3.4 caps are re-based from this table by the orchestrator before T-089b and W4. |
| b-89 | T-089b | Opus (security) | T-089a, T-059, **open item O-1** | **Investigation Auto mode (F10), built last.**<ul><li>A core-worker job resumes `auto` investigations on an approved import commit for the tenant, and daily.</li><li>Each step re-intersects the stored scope with the creator's **current** membership (cancel when gone, review M7), re-checks the ceiling (downgrade to `plan` when lowered) and the monthly cap.</li><li>0 drafts created; existing drafts are linked.</li></ul> | `services/core-worker/src/investigations/**`, `modules/investigations/auto*` | (1) An import commit resumes exactly the 1 `auto` investigation waiting on that import kind, of 2 open (1 auto + 1 plan).<br>(2) Creator removed → 0 steps, `cancelled`.<br>(3) Outlet narrowed → 0 outlet-B rows in the new snapshots.<br>(4) At the cap → 0 resumptions, `stop_reason = budget`.<br>(5) Ceiling lowered → 0 auto steps.<br>(6) Two workers → 1 step per resume (advisory lock), gapless.<br>(7) Drafts created by Auto = 0. |
| b-92 | T-092a | Sonnet | T-040 | **W4 read routes, part 1** (W2 review R3 spec-drift list, rebuilt 11 Oct; D8). Orders and shifts lists, finance settlement and bank lines, disputes, period closes, and inventory (ingredients, waste, counts, transfers). Plus the filter gaps: imports runs cursor/kind/status, movements kind/ref, drafts source, findings pack. Committed hand list: `docs/plan/W4-READ-ROUTES.md` (rows 1–10 + 4 filters). | each module's `read.ts` + `routes.ts` read-only additions; contracts `src/<module>/routes.ts` | (1) Each listed route returns the fixture row count (hand values) and 0 rows of another outlet.<br>(2) Route-table diff vs the hand list = 0 missing.<br>(3) Every route has an OpenAPI operation and a response parsed against a real response.<br>(4) A write verb on any new path → 405. |
| b-92 | T-092b | Sonnet | T-040, T-057 (wiki rows) | **W4 read routes, part 2.**<ul><li>people: rosters, where staff see their own; attendance; advances; payroll drafts;</li><li>catalogue: items including inactive; recipes; prices including future-dated; deals; coupons;</li><li>outlet calendar; member pickup windows; `GET /v1/customers/{id}`; wiki pages and versions;</li><li>conversations (read-only, untrusted text rendered as text);</li><li>`/platform/v1/budgets/{tenant}/spend`.</li></ul>Hand list rows 11–22 and 24–26 (row 23, the runs list, is T-040). | as T-092a | (1)–(4) as T-092a.<br>(5) A staff member's roster read returns only their own shifts (1 of 5). |

**W2 carry-overs kept visible** (not dropped by the rewrite):

| Item | Owner |
|---|---|
| Guard derivation-row binding | M-C1d (5) |
| `deal_changed` needs preview deal refs on place | T-074 sweep, or a W4 POS rider if T-061 needs it |
| D3 counter-sale customer attach | T-061 rider (orders contract) |
| D5 option-delta `active` in consumption · D6 re-judge after variants · D7 void-payroll advance reversal rows | T-074 sweep |
| R1-m9 | M-C1a |
| R3-m5 | T-084a |
| R3-m10 | T-080 (7) |
| D8 dated history | done (H-1) |
| D8 read routes | T-092a/b |
| D9 | done (T-036) |
| D10 plants | T-086 |

**Open items, routed and not settled by this board:**

| # | Item | Authority |
|---|---|---|
| O-1 | **Identity for unattended Auto steps.** R40 C4 takes snapshot scope from a member token, and ADR §14 says `RunTrigger` does not change. Auto needs either worker-minted run tokens with a new trigger value (an additive contract change) whose scope = stored ∩ the creator's current membership, or a ruling on member-minted snapshots without a live token. This may be an auth-flow change (CLAUDE.md escalation). A new trigger also means widening the `intel.run.trigger` and `actor` CHECKs (0003:239–240) in a migrator slot. (Plan mode avoids this by running inside the approving request.) | Orchestrator; founder if an auth-flow change. Blocks T-089b only. |
| O-2 | **The owner's monthly cap vs the operator-set `platform.llm_budget.limit_minor`.** The board assumes effective cap = min(owner cap, operator limit) and refuses an owner cap above the limit. | Founder (money). **Blocks T-090 dispatch.** T-040b may build min() behind a single comparison that changes if the ruling differs. |
| O-3 | Default ceilings for **advisor** (`step`) and **judge** (`plan`). The ledger names only owner, manager and staff (INFERENCE: advisors are read-only finance users per R27; judge Auto would spend founder money unattended). | Orchestrator; reversible by the owner setting. |

<details>
<summary>Superseded W3 rows (board of 9 Oct 2026, 23:10) — kept for history</summary>

**Why they changed.** ADR-014 and its independent review (B1, M1–M9) replaced several things:
- `ParallelAgent` fan-out (deprecated, and its branches share session state: FACT, installed `agents/parallel_agent.py:246–261`);
- a router plus per-pack agent code;
- model-chosen investigation completion;
- one serial M-C migration.

The founder then decided F1–F10 (R45).

**What this improves:**
- the gates count against independent answer keys instead of fixtures;
- migrations are split per pack, so templates unblock tools earlier;
- taint is run-level;
- there is a single owner of output.

| Lane | Ticket | What | Territory | Gate |
|---|---|---|---|---|
| m-1 | M-C | `0013_snapshot_templates` for all packs (from D-1) + dashboard templates | `db/**` | template-numeric-source gate; each template runs on the worldgen fixture and returns the D-1 columns |
| b-40 | T-040 | Internal API: events:claim, watch:claim, snapshots, findings, drafts (refs + based_on), answers, traces:batch, quotes:batch, knowledge batches, spend; validator resolver; `/v1/findings`, `/v1/inbox`, `/v1/snapshots/{id}`, `/v1/runs/{id}`, `/v1/traces/{run}` | `services/core-api/src/internal/**`, `modules/{evidence,findings,inbox,runs,traces}/**` except `inbox/ranking.ts` | free digit → abstained + reason; bare-number draft 422 / refs 201; cross-tenant ref refused; 500-event trace batch gapless |
| b-41 | T-041 | intel runtime: FastAPI, `RunContext` from Ed25519 token (public key only), tools, internal client, `RecordedLlm`, provider registry (Gemini native; OpenAI/OpenRouter/NVIDIA via an `OpenAILlm` subclass), role → model from platform; `google-adk==2.11.0`; lockfile check (no `litellm`) | `runtime/`, `tools/`, `llm/`, `services/intel/pyproject.toml`, `uv.lock` | 0 `tenant_id` tool params (1 planted); forged token refused; recorded run byte-identical twice; lockfile check red with a planted `litellm` |
| b-42 | T-042 | Trace plugin (7 callbacks, branch → actor, synchronous flush) | `trace/` | each callback ≥ 1 row; misspelled hook → 0 → red |
| b-43 | T-043 | Events + watcher framework: `/events`, claims, leading-edge watch claim, detector registry, narration (template + model), finding/draft writers | `events/`, `watch/` | 3 deliveries → 1 finding; just-below threshold → 0; just-above → 1 |
| b-44…b-51 | T-044…T-051 | One per pack from D-1: catalogue, kitchen, inventory & purchasing, finance, people, customers, compliance, market | `skills/<pack>/` | per pack: planted problems found with ₹ = key, false alarms ≤ 2, ≥ 1 refusal case passes |
| b-52 | T-052 | Forecast: seasonal-naive + one better method, WAPE on holdout, `forecast_run` via core | `forecast/` | method beats naive on ≥ 2 of 4 worlds or prints FAIL and ships naive |
| b-53 | T-053 | Ask + router + fan-out ("why was this week bad?"): skills JIT, ParallelAgent ≤ 4, merge, envelope | `router/`, `fanout/` | 20 recorded questions → committed classifications (incl. 4 abstentions); ≥ 3 parallel branches traced |
| b-54 | T-054 | Brief + inbox ranking (impact × confidence × urgency, dedupe, drafts attached), daily via worker fanout | `brief/`, `services/core-api/src/modules/inbox/ranking.ts` | top 5 = answer-key ranking; 0 duplicate dedupe keys |
| b-55 | T-055 | suppliers-sim (3 A2A agents, personalities as data) + negotiation tool + quotes + deal review with refusal + PO draft | `services/suppliers-sim/**`, `skills/inventory_purchasing/negotiate/` | 3 RFQs + ≤ 2 counters traced; hidden clause refused 10/10; 1 PO draft with quote refs; every label "Simulated supplier" |
| b-56 | T-056 | Ingestion: invoice vision → supplier-invoice draft (span refs), documents/chats → claims (quarantined extractor, no tools), chunks + embeddings (768-d) via core | `ingest/` | extractor tool count 0; claim quotes equal source substrings 100%; injection fixtures → 0 tool calls |
| b-57 | T-057 | Wiki compiler: pages per node kind, cited-only sentences, dirty tracking, versions | `wiki/` | uncited sentence dropped (planted); only dirty pages rebuilt (count) |
| b-58 | T-058 | Graph port + Postgres-edges adapter + projector + 5 templates; FalkorDB adapter behind the same contract suite (skipped when no server) | `graph/`, `adapters/dev/graph-falkordb/` | 5/5 templates on the fixture = expected; tenant filter removed → isolation red |
| b-59 | T-059 | Live provider smoke: one call per provider per role when its key is present (`MUNIM_MODEL_MODE=live`); skipped loudly when absent | `services/intel/tests/live/` | prints a provider × role matrix of ok / skipped / failed with latency |

</details>

## W4 — frontends (`apps/web/app/<surface>/**` each; `packages/ui` owned by T-060)

W4 lanes consume the W3 read routes (T-040's mounted reads, T-092a/b) and the specialist, thread, investigation and AI-policy APIs (T-087b, T-088a, T-084b, T-089a/b, T-090). A W4 screen whose route is not yet served is a rider back to the owning W3 ticket, never a client-side workaround.

| Lane | Ticket | What | Gate |
|---|---|---|---|
| b-60 | T-060 | Design system in `packages/ui` from D-3; ref renderer (`⟨snap⟩`/`⟨cite⟩`) | token snapshot test; renderer: 0 digits outside refs, planted free digit → "Cannot verify" |
| b-61 | T-061 | POS `/pos`: counter + tables + barcode scan (shops), options sheet, tenders, voids with reason, shift close; tablet-first | Playwright: sale → receipt matches API totals; screenshots of every D-2 state |
| b-62 | T-062 | KDS `/kds`: SSE tickets, timers, amber/red, stations | ticket < 2 s after order; late colouring at the D-2 thresholds |
| b-63 | T-063 | Storefront `/order`: QR + pickup, deals, coupons, loyalty, guest checkout, self-updating tracker | happy path + 6 refusals show D-2 copy; tracker < 2 s |
| b-64 | T-064 | Console core `/console`: brief + inbox home, approvals with diff + reason, wiki, group ↔ outlet switch. **Amended 11 Oct (R45 F8–F10):** <ul><li>the **main conversation via the Manager**: ask anyone or `@Specialist`, answers signed "{Specialist} · via Manager" (composed by core), citations drawer;</li><li>**specialist desk pages and threads** (T-087b, T-088a): findings, drafts, track record as snapshot refs, direct conversation;</li><li>**investigations** (T-083/T-089a/b): start with a mode picker limited to the member's ceiling, Step `Continue`, Plan approval screen (checklist, specialists, estimated AI cost labelled "estimate (computed)"), Auto status with `stop_reason`.</li></ul>Was: "ask with citations drawer" only. | approve on screen commits (DB 0 → 1); citations open the snapshot rows; `@Finance` question → answer signed "Finance · via Manager" (1); a staff member sees only Step in the picker (1 option of 3); Plan screen shows 0 bare digits outside refs; screenshots of every D-2 state + the new desk/thread/plan states |
| b-65 | T-065 | Eight dashboards with agent panels — **each panel is its specialist's** (name, desk link; F8) | each number matches the committed expected list per world; each panel's specialist = the pack's (8/8) |
| b-66 | T-066 | Back office: pixel office from fresh assets (provenance log, sha per file) + ops console (org chart, sheets, chat log, track record), replaying traces only. **Amended 11 Oct (F8):** the org chart is the Manager + the 8 named specialists (+ Forecast as a service); each desk draws its `specialist:<pack>` / `branch:<pack>` trace actors; track record from `intel.agent_track_record` snapshots. Also owns `art/office/**` (drops git-ignored), `apps/web/public/office/**`, `scripts/art/**`; contract = `docs/plan/art/ART-DIRECTION.md` trace-kind → drawing map | replay draws exactly the trace's actors; provenance entries = asset files |
| b-67 | T-067 | Onboarding wizard (type, country, outlet, first menu) + import wizard (menu photo → catalogue draft; POS/payout/bank uploads) | a new owner reaches a first sale in ≤ 5 screens (Playwright count) |
| b-68 | T-068 | Platform admin `/admin`: tenants, packs, plans, flags, budgets, provider + model per role; budget page shows each tenant's owner cap beside the operator limit (O-2) and spend rows (T-092b) | role change goes through a config draft (pending → applied) |
| b-69 | T-069 | Manager/staff daily ops: counts, waste, roster, cash close, checklists, temp logs, handover | each form round-trips to its module (fixture) |
| b-77 | T-077 | **AI settings page (new 11 Oct, F10):** owner-only settings for per-role investigation-mode ceilings and the monthly AI cap (T-090); shows the operator limit and spend as snapshot refs; refusal copy for a cap above the limit | owner change → 1 book row + audit (DB 0 → 1); manager sees the page read-only (no save control); cap above limit shows the `cap_above_platform_budget` copy |
| b-75 | T-075 | Back-of-house records: suppliers, POs, receiving against a PO, manual supplier invoice, customer / staff / licence / asset records (spec first: `docs/plan/screens/records.md`) | each record screen round-trips; receiving a PO creates the expected movements (fixture) |

## W4-spine — the demo screens (R50, 13 Oct 2026) — REVERTED 13 Oct by the founder (R52); kept for the record

Shared dev backend (orchestrator-owned): `MUNIM_IDP=local PORT=8790 MUNIM_INTEL=real make up LOCAL_DB=1` + `PORT=8790 make demo WORLDS=restaurant_group`. Lanes never start their own core-api; each runs only its own `next dev` on its own port (3101+). Port 8787 is never used. Gates that assert counts run on embedded PG, not on the shared instance.

| Wave | Lane | Ticket | What (cut per R50) |
|---|---|---|---|
| A | b-60 | T-060 | `packages/ui` (tokens, components, ref renderer, Cannot-verify, simulated + recorded-only labels) + `apps/web` foundation: same-origin `/api` proxy to core-api, token-source port (dev local IdP now), fetch-based SSE client, i18n, console chrome |
| A | b-100s | T-100a | worldgen: Cares data for `restaurant_group` (enrolment, simulated NGOs, near-expiry stock) |
| B | b-63 | T-063 | Spice Route storefront `/order/[key]`: menu, cart via `/v1/orders:preview`, guest checkout, live tracker, Cares section |
| B | b-61 | T-061 | POS `/pos`: counter, options, tender ("Recorded only"), receipt, void with reason |
| B | b-62 | T-062 | KDS `/kds`: SSE ticket board, timers, amber/red, bump |
| B | b-64 | T-064 | Console `/console`: home brief + inbox, draft detail (approve/edit/reject with reason, named approver), Ask with citations drawer |
| B | b-100 | T-100 | Cares console: listing drafts, offers, network page, impact (synthetic labels) |

## W5 — quality

| Lane | Ticket | What | Gate |
|---|---|---|---|
| b-70 | T-070 | Eval harness: N1–N5, injection, tenant isolation, **provider comparison** (same suites across providers with keys present). **Narrowed 11 Oct (ADR-014 §12 W5; recorded-mode goldens moved to T-085):** live measurements — pass^5, per-category accuracy incl. the F3 tool-count sweep (10/15/20), DM accuracy + coverage and the Jev/OpenAI bake-off if their entry criteria are met (F2), **per-specialist live table** (F8), negotiation move-choice vs the deterministic default on synthetic worlds (F4; any "savings" labelled a measured result on synthetic data), out-of-band judge reports, the forecast recompute spot-check | `make eval` prints 5 numbers + baselines, a provider table and a specialist table; raising a threshold above measured → red |
| b-71 | T-071 | e2e suites: 3 stories + onboarding + shop flow | all pass on `make up`; each fails with its key feature disabled |
| b-72 | T-072 | Performance smoke (autocannon): order placement and SSE fan-out at small-chain load | p95 order placement < 300 ms locally (printed) |
| b-73 | T-073 | README (product, simulation disclosure), runbook, `.env` guide | links resolve; every `make` target documented |
| b-76 | T-076 | SDK packaging (R43): `@munim/sdk` publish-ready (typed client, member/customer auth helpers, storefront key, SSE reader), API reference generated from OpenAPI, and `examples/storefront-min` built only on the SDK | the example places an order and tracks it against the local stack using only `@munim/sdk` imports (dependency scan = SDK + framework only); `npm pack` dry-run lists exactly the intended files |
| b-95 | T-095 | **Munim Cares (R46, R48 F-2): scoped and designed in `docs/plan/adr/ADR-015-munim-cares.md` (12 Oct, reviewed + 1 revision).** Tickets M-D (0028), T-095a…f per ADR-015 §8; order M-D ∥ T-095c → T-095a ∥ b ∥ d ∥ f → T-095e → wave review. | ADR-015 §8 gates |
| — | T-074 | Sweep: inherited items, quiet tree | `make check`, `make test-db`, `make eval` green |

## Riders routed from D-2 (screens + flows gaps) — binding scope for the named tickets

| Gap | Owner | Rider |
|---|---|---|
| Routes for tender, void, refund, shift open/close, cart preview (`POST /v1/orders:preview`) | T-022 | name routes in `packages/contracts/src/orders/routes.ts`; preview uses the same pricing function |
| KDS accept / reject / push-back (re-judges deals, writes `order_event`) | T-023 + T-022 | commands `kitchen.ticket.accept.v1`, `…reject.v1`, `orders.promise.push_back.v1` |
| Barcode lookup, item/price commands, per-outlet sold-out | T-021 | `catalogue.availability.set.v1` |
| Storefront menu + guest order routes, 7 refusal codes | T-032 | reason codes added to contracts in its module |
| Draft get + decided-drafts list | T-008 | — |
| Self-serve onboarding route | T-020 | — |
| Import routes, preview totals, mismatch-approve-with-reason | T-030 | — |
| Tally export route | T-026 | — |
| Runs list | T-040 | — |
| "Get quotes" (start negotiation) | T-055a (was T-055; split 11 Oct) | — |
| Platform routes beyond provisioning | T-031 | — |
| Draftable command list (prep list, prep time, roster, payroll, dispute, journal adjust, period close, recipe, deal, import run, import mapping, catalogue batch) | each owning module ticket | register in approvals' draftable registry via its `index.ts` |
| Trace kind for deal-review verdicts | T-042 / T-055a | add `review` trace kind in contracts (routed to the contracts lane) |
| `demo.session.start.v1` | T-020 | — |
| Templates with no pack owner (`orders.*` today strip, `finance.shift_tenders`, `inventory.count_variance`, `intel.agent_track_record`) | M-C1d (the first three, via `M-C-extra.txt`) · M-C3 (`intel.agent_track_record`, per specialist) — split named 11 Oct | migrator adds; dashboards and specialist desks consume |
| Screens specced nowhere: suppliers, POs, receiving goods, manual supplier invoice, customer / staff / licence / asset records | new **T-075** (W4) | back-of-house records screens; spec in `docs/plan/screens/records.md` written by the T-075 lane first |
| Number-rule cases (preview totals, loyalty balance, badges, member-minted dashboard snapshots, AI-about-AI numbers, status channel, expired stock) | ledger | 3-agent council convened 9 Oct 23:40 |

## Launch table (live)

| Lane | Ticket | State |
|---|---|---|
| b-1 | T-001 | built — in the W1 review batch |
| b-2 | T-002 | BUILT + extension built (70 schemas, 99 tests) — in W1 review batch |
| m-1 | M-A | BUILT — 0001–0006 frozen (sha256 in DECISIONS), 105 DB tests, 25+ red-proofs (in W1 review batch) |
| d-1 | D-1 | BUILT — 9 pack specs (in W1 review batch); riders routed |
| d-2 | D-2 | BUILT — 17 files; 16 gaps routed as riders (in W1 review batch) |
| d-3 | D-3 | BUILT — design-system.md, art/ART-DIRECTION.md, art/provenance.template.md (in W1 review batch) |
| b-3 | T-003 | BUILT — 92 tests, 13 red-proofs (in W1 review batch) |
| b-4 | T-004 | BUILT — 32 tests, 12 red-proofs; found the exit-code bug (in W1 review batch) |
| b-5 | T-005 | BUILT — 29 tests + red-proofs; closed a command-type binding hole in code (in W1 review batch) |
| b-7 | T-007 | BUILT — 29 tests, 17 red-proofs, 3 bugs fixed (in W1 review batch) |
| b-9 | T-009 | BUILT — wiring, make up/down/dev-db, smoke 4/4 + 6 red-proofs, secret scan 0 hits; **dev Supabase bring-up BLOCKED ON FOUNDER (pooler 28P01 — reset DB password)** (in W1 review batch) |
| b-6 | T-006 | BUILT — 14 tests, 10 red-proofs, own bug fixed (in W1 review batch) |
| b-8 | T-008 | BUILT — 12 tests, 10 red-proofs (in W1 review batch) |
| m-1 | M-B | BUILT — 0007 riders + 0008–0013; 167 DB tests; exit-code fix; buildWorld (in W1 review batch) |
| W2 | T-020…T-035, fix-lane migrations 0015–0017 (M-B was 0007–0013) | CLOSED (see Status) |
| d-1 | T-036 | DONE 3aa4c93 — dev-only local IdP selector (R44a) |
| h-1 | H-1 | DONE 8088c47 — 0018 history imports + batched commit (865 → 8.9 ms/bill hosted) |
| w-1 | W-1 | DONE aaca235 — worldgen on dated history, 60 plants, `make demo` 77.9 s embedded |
| b-41 | T-041 | DONE 7f6418a — intel runtime (frozen) |
| b-52 | T-052 | DONE e05dd79 — forecast engine, beats naive on 4/4 worlds |
| — | W3.0 rest (M-C1a, T-040, T-080, T-087a) | ready to dispatch (board rewritten 11 Oct) |

## Status

| Wave | State |
|---|---|
| W0 | F1, F2 with the founder |
| W1 | **CLOSED 10 Oct 04:55** — 2 fix cycles; final quiet-tree `make check: ok` (7/7 targets; 594 tests: db 209, contracts 130, core-domain 110, core-api 84, worker 36, config 10, publisher 10, idp-supabase 4, web 1; smoke 4/4 + 6 red-proofs); committed 466f8d6…609ab6a |
| W2 | **CLOSED 10 Oct evening** — 14 modules + T-033 worldgen + T-034 integration; review (3 dimensions) + 2 fix cycles; quiet `make check` 7/7, ≈1,326 tests; Supabase at 0017 with live worlds verified (see DECISIONS) |
| W3 | **CLOSED 12 Oct** — see `docs/plan/HANDOFF-W3.md` (state, gates, founder decisions F-1…F-8, carried items). Architecture R45, ADR-014; Munim Cares (R46, R48, ADR-015; migration 0028) was added on top |
| W4–W5 | **Superseded.** The W4-spine restaurant frontend was reverted (R52); the frontends are `apps/web` (Cobnut, imported from the teammate's repo, R53–R54) and `apps/site` (the Munim site, R61). Quality work (W5) became the production phases below |
| Production, Cup, FalkorDB (R54–R69) | **In progress, 16 Oct** — the table at the end of this file; state in `docs/plan/HANDOFF-PROD.md` |

## Deploy notes

Hosting was chosen in R54–R55: the standalone build runs on **Vercel + the hosted Supabase project** (`deploy/vercel`; projects
munim-api and munim-cobnut); the Cup runs on **Google Cloud** (`infra/gcp`, `scripts/deploy-gcp.sh`, `adapters/gcp`), built from
the export `make export-cup` writes (R37, R57, R60). Neither deploy is run by `make check`.

- **Reseeding:** worldgen tenants derive from (seed, world) and are operator-provisioned as demo (`MUNIM_SEED_OPERATOR=1` + a `platform.operator` row for `worldgen-<world>-operator`); reseed into a fresh database or with a new `--seed`.

## Production, Cup and FalkorDB tickets (R51–R69, 13–16 Oct 2026)

Plans: `05-production-and-split.md` (R54, R55), `06-gaps-and-split.md` (R56), `07-submission-plan.md` (R62); lane briefs in
`prod-briefs/`; state and evidence in `HANDOFF-PROD.md` and `docs/DECISIONS.md`. Commit ids are the current history (rewritten 15 Oct
to strip AI attribution). "Migration" rows were written by the migrator lane only (rule 6).

| Ticket | What | State |
|---|---|---|
| T-100, T-100a, T-101, T-102 | Cares console and Cares world data; finding prose fix; `GET /v1/me` and `@munim/sdk` 0.2.0 | DONE (14be67f, a8ac0d1, 1f17458, 37ba87c, 778ad02) |
| T-110 | Cobnut Bakehouse imported into `apps/web` with its history; workspace SDK | DONE (68bb04b, 55e4166) |
| T-111 | The Cobnut world: `make seed WORLD=cobnut` | DONE (64fb0d7) |
| T-112 | `apps/web` on the final owner-screens pack, production mode (outlet gate over every target outlet, per-type role gate) | DONE (88ef98c) |
| T-113 | `munim-api` serverless deploy adapter (env-only config) | DONE (9c20ef9) |
| T-114 | A person starts a supplier negotiation: `purchasing.rfq.request.v1`, `POST /v1/rfq-requests` | DONE (b6dda3c, 5974eb2) |
| T-115 | Menu and outlet display order. **Migration 0030** | DONE (9f43b76) |
| T-116, T-117 | Uploads in a shared blob store; a tick ledger so a tick never repeats a slot's work. **Migration 0031** | DONE (31b6b43, 851046e) |
| T-118 | The prep-time draft and the ticket-drift finding are mock-only (server-stamped ticket times) | NOT BUILT (first to cut, R56); they stay mock-only and the demo script says so |
| T-119 | First-deploy measured checks on Vercel (region, rewrite, SSE reconnect, tick route, no Git) | DONE (go-live lane; `HANDOFF-PROD.md`) |
| T-120 | `adapters/gcp`: Identity Platform behind the IdP port, Cloud Storage `BlobStore` | DONE (8f5a220) |
| T-121 | `infra/gcp`: Dockerfiles, Cloud Build, `scripts/deploy-gcp.sh` (asia-south1) | DONE (4e851e3); the founder runs the deploy from the runbook in `infra/gcp/README.md` |
| T-122, T-123 | Provider-neutral names in exported code; `make export-cup` with the allowlist, text map, filtered one-author history and forbidden-word and secret gates | DONE (841b2d1; C-4 2891592); `--history` is run at C5 |
| T-124 | Cup submission docs (README, architecture, deck outline, video script) | IN PROGRESS: the docs lane (C4) |
| T-125 | Live models with a recorded fallback for failed or rate-limited calls | DONE (eba2d32) |
| T-126 | Vercel wiring: `deploy/vercel/deploy.mjs`, founder-run `env-setup.ts`, regional | DONE (43db237, 3581b92) |
| T-127, T-127b | The demo path on the real system: **migrations 0032, 0033**, budget route, run-level over-cap, Cobnut suppliers; live AI ready at ₹0 role prices (R59) | DONE (e491210, aa9d399) |
| T-128 | Every remaining screen (R66, R67): investigations, the office, all-outlets view, storefront page builder (**migration 0034**), campaigns | DONE (c3acaa2) |
| T-130 | FalkorDB rules snapshot (`docs/admin/`) | DONE 15 Oct |
| C1 | Security review of the Cup export (0 severity 1, 7 severity 2, 21 severity 3) | DONE (R64; `HANDOFF-PROD.md`) |
| C2 | Fix cycle for C1, each fix red-proved; demo deny-list in core, run-token scope by role, body caps, security headers | DONE (5e60917, c784ea8); open: per-IP rate limiter (hop count unmeasured), unique index on the invoice series |
| C3 | Clean-up before the docs and export (this section's update, export gate words, Ask shows outlet names, runbook operator step, T-128 leftovers) | Lane work done, awaiting the orchestrator's commit; the consent reader (`customers.consented_audience`) needs a migration |
| C4 | Docs for the export: `docs/shared/`, per-module READMEs, `scripts/export-cup/root/` | IN PROGRESS (docs lane) |
| C5, C6 | Final Cup export with history; submission pack (video script, deck outline, deploy checklist) | QUEUED (`07-submission-plan.md`; after C3 and C4) |
| Film | The Munim launch film, two cuts (R65) | DONE (09810cc, 05ccff5, 32e4bde) |
| F1 (T-131 design) | FalkorDB graph design: model, Cypher, two graph-first features, the embedded-server spike (`falkordb/design.md`, R68) | DONE (7fb7080) |
| F3 (T-131 build) | The graph core, the intel skill, `/v1/graph/*` routes (mounted only with a graph backend), the supplier map screen | IN PROGRESS in its own git worktree (`~/.cache/munim-wt/f3`, branch `f3-falkordb`) |
| F4 (T-132, T-133) | `make export-falkor` (fresh history), docs, deploy runbook | QUEUED (after F3) |
