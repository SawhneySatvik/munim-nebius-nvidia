# 03 — Architecture (HLD)

**Purpose.** The containers, trust boundaries, contracts and deployment topology every ticket builds
against. **Scope:** Cup build (GCP) and dev (Supabase). **Depends on:** ledger R1, R4, R6–R10, R15, R16,
R20–R29. **Authority:** below the ledger; once code exists, migrations and `packages/contracts` are the
contract and this doc is commentary (Shipyard RULES §1). `FACT` = sourced (R1–R4); `INFERENCE` = design
reasoning; unlabelled statements are decisions of this doc. Revised 9 Oct after the pass-1 review. **Amended 11 Oct
2026 for ADR-014 / ledger R45 (F1–F10):** §1.1, §1.3, §1.8, §1.9, §3, §4, §5, §7 and §10 keep the previous text in
"Superseded" blocks with why and what improves. History of every changed decision: `docs/plan/DECISION-EVOLUTION.md`.

---

## 0 · Standalone profile (R34–R37) — overrides the GCP-specific items below

For this build, wherever this document names a GCP service, read the standalone equivalent:

| Below says | Standalone build uses |
|---|---|
| Cloud SQL Postgres | any Postgres; Supabase-hosted for dev (R31, R35) |
| Pub/Sub topic + push to intel | in-process Publisher: core-api POSTs the transaction's CloudEvents to intel `/events` after commit (service secret + run token); `core-worker` resends unpublished rows |
| Cloud Scheduler → Cloud Run jobs | the long-running `core-worker` process runs the sweeper (1 min), `fanout` (watch sweep 15 min, daily brief), nightly jobs |
| Identity Platform | Supabase Auth behind the `IdP` port; `idp-local` stub in every gate |
| Cloud Storage / Secret Manager | Supabase Storage behind `Blob`; `.env` for secrets (run-token Ed25519 keys included) |
| Spanner Graph | Graph port default = Postgres edge tables + recursive CTEs (`intel.edge`); FalkorDB optional |
| Gemini on Agent Platform, `location=global` | ADK 2.11 native Gemini class + `OpenAILlm` for OpenAI / OpenRouter / NVIDIA; provider per role from `platform.model_role` (R36) |
| Cloud Run IAM, connection budget, deploy table (§8) | parked with the Cup fork (R37); locally each service is one process |

Everything else (schemas, roles, book guard, run tokens, refs, grammar, traces, API surfaces, flows) is unchanged.

## 1 · Shared names (the contract every other doc uses)

Agents must use these names exactly. Changing one is a ledger amendment.

### 1.1 Deployables

| Name | Language / framework | Runs as (Cup) | Job |
|---|---|---|---|
| `web` | Next.js (App Router), TypeScript | Cloud Run service | URL segments `/pos`, `/kds`, `/order`, `/console`, `/admin`. Calls only the public SDK. |
| `core-api` | Hono, TypeScript | Cloud Run service | The only writer of Postgres. Public `/v1`, internal `/internal/intel/v1`, operator `/platform/v1`, SSE `/v1/stream`. Publishes events to Pub/Sub right after commit. |
| `core-worker` | same image as `core-api`, different entrypoints | Cloud Run **jobs** only, triggered by Cloud Scheduler | outbox sweeper (stragglers), import parsing into staging, nightly jobs, DLQ drain |
| `intel` | Python 3.12, `google-adk==2.11.0` (R36) | one local process (Cup: Cloud Run service) | The **Manager** plus **8 specialists' skills and fixed-path workflows** (F8), watchers, narration, the DecisionModel port, negotiation (rules + AI move choice, F4), extraction, wiki, forecast, graph projector, traces. **No Postgres write grant** (R25). All work happens inside a request (`/events`, `/ask`, `/brief`, `/watch:sweep`, `/investigate:narrate`). |
| `suppliers-sim` | Python, `a2a-sdk` server (ADR-008 amended) | one local process (Cup: Cloud Run service) | Three simulated supplier A2A agents in one service (R23), personalities as data. Labelled "Simulated supplier". |

> **Superseded (11 Oct 2026, R45/ADR-014)** — the `intel` and `suppliers-sim` rows:
>
> | `intel` | Python 3.12, Google ADK 2.x | Cloud Run service | Router + specialists, extraction, wiki, forecast, graph projector, traces. **No Postgres write grant** (R25). All work happens inside a request (push, `/ask`, scheduler call). |
> | `suppliers-sim` | Python, ADK `to_a2a` | Cloud Run service (from W2) | Three simulated supplier A2A agents in one service (R23). Labelled simulated. |

**Why it changed.** F8 names the Manager and 8 specialists; ADR-014 moved negotiation to rules + a bounded AI move choice (F4) and replaced ADK's experimental `to_a2a`/`RemoteA2aAgent` with plain `a2a-sdk` behind a `SupplierPort` (ADR-014 §10, §14 P3); the standalone build runs local processes (R35, R37).

**What this improves.** The row now says what actually runs and who owns it, so territory and trust reviews start from the right picture; no dependence on experimental ADK A2A wrappers.


### 1.2 Postgres schemas and roles

| Schema | Holds | Written by (role) | Read by |
|---|---|---|---|
| `core` | Tenancy, catalogue, orders, inventory, purchasing, finance, people, customers, compliance, approvals, audit, outbox, documents, imports. Every table tagged `munim:book` or `munim:operational` (R29). | `munim_core` (member-driven `/v1` routes and draft execution); `munim_svc` (internal routes, worker) only where §1.3 admits | `munim_core`, `munim_svc`, views |
| `evidence` | SQL snapshots + snapshot templates | `munim_svc` (core-api snapshot minting under the run's RLS context); templates by migrations | `munim_core`, `munim_svc`, views |
| `intel` | Claims, entities, aliases, edges, embeddings, wiki versions, forecasts, findings, answers, trace events, supplier quotes, runs, event claims, watch state, spend | `munim_svc` (core-api internal routes, R25) | `munim_core`, `munim_svc`, views |
| `platform` | Country packs, plans, flags, tenant registry (mirror), model roles, operators, config drafts, platform audit | `munim_platform` (`/platform/v1`) | `munim_core`, `munim_svc` |
| `intel_ro` | Views only (text retrieval) | — | `munim_intel_ro` |

Roles (all `NOSUPERUSER NOBYPASSRLS` except the two named below):
`munim_migrator` (owns schemas; migrations only, never at runtime) · `munim_crosstenant` (`NOLOGIN
BYPASSRLS`; owns **exactly three** objects: `core.outbox_claim()`, `core.active_tenants()` and the view
`platform.tenant_registry` — a gate asserts the list) · `munim_view_owner` (owns `intel_ro` views;
NOBYPASSRLS, so RLS applies through them) · `munim_core` (login; member routes and draft execution) ·
`munim_svc` (login; internal routes and jobs; SELECT on `core`/`evidence`/`intel`, INSERT on the
operational tables of §1.3, **no** INSERT/UPDATE on any book table) · `munim_platform` · `munim_intel_ro`
(USAGE on `intel_ro` + SELECT on its views). `0001` revokes table privileges and function EXECUTE from
PUBLIC in our schemas (`ALTER DEFAULT PRIVILEGES`); every function lists its EXECUTE grantees.
`evidence` snapshot minting is ordinary core-api code running as `munim_svc` under the run's RLS context —
no SECURITY DEFINER.

### 1.3 Who may write a book table (R15, R27, R29)

Two layers. **Grants:** only `munim_core` holds INSERT/UPDATE on book tables; `munim_svc` (internal routes,
jobs) has none, so a service write fails with `42501` before any trigger runs. **Trigger:** on every
`munim:book` table, `core.guard_book_write()` admits a row change by `munim_core` only if one holds, and
stamps the row's `origin` column (`{kind, member_id | decision_id | rule_id + source_ref}`):
1. **Own command (R27):** `app.role ∈ {owner, manager, staff, advisor, customer, operator, judge}` with the
   matching principal id set, and `core.command_authority` lists that role for `app.command_type` within
   the row's outlet scope;
2. **Approved draft:** `app.decision_id` → a decision whose draft has `status = 'executing'` and
   `exec_txid = txid_current()` (set by the approve route in this same transaction — a decision id cannot be
   replayed later);
3. **Deterministic derivation:** `(app.posting_rule, source table, target table)` is a row of
   `core.derivation_rule` (seeded by migration; ids match `packages/core-domain/*/rules` by test) and
   `app.source_ref` names an existing book row of that source table. Every existing book row passed the
   guard when written, so the chain always ends at a person or a decision.

Otherwise the trigger raises SQLSTATE `MB001 book_write_refused`. Draft and import execution happen on the
member's `/v1/drafts/{id}:approve` request, so they already run in the `munim_core` pool — no role switching.

> **Superseded (11 Oct 2026, R45/ADR-014)** — the `munim_svc` operational INSERT list:
>
> `munim_svc` INSERTs only operational rows: `core.draft`, `core.outbox`, `core.import_staging`,
> `core.import_quarantine`, `core.document`, `intel.*`, `evidence.snapshot`.

**Why it changed.** Investigations (ADR-014 §7.2, M-C2) are a core module over two operational tables; Auto mode (F10) runs steps from core-worker, which connects as `munim_svc`. Threads (F9) and the AI policy (F10) are new tables whose write path must be explicit.

**What this improves.** Every new write path is named with its role before the migration lands, so the service-privilege and tag gates can assert it (M-C2, M-C3), and the spend cap cannot be changed by a service.

`munim_svc` INSERTs only operational rows: `core.draft`, `core.outbox`, `core.import_staging`,
`core.import_quarantine`, `core.document`, `intel.*`, `evidence.snapshot`, and — for core-worker **Auto**
investigation steps only (F10, T-089b) — `core.investigation_step` and the investigation status/summary columns
(ADR-014 §14 C9). Thread rows (`core.ai_thread`, `core.ai_thread_turn`) are written in the member's `/v1/ask` request
(`munim_core`). The AI policy (`core.ai_policy`, `core.ai_budget_cap`) is **book** (R29 lists budgets): written only by
the owner's own command; `munim_svc` has no grant.

### 1.4 Tenancy context (every transaction)

```
SET LOCAL app.tenant_id    = '<uuid>';
SET LOCAL app.outlet_ids   = '{<uuid>,…}' | '{*}';
SET LOCAL app.role         = 'owner|manager|staff|advisor|customer|operator|service';
SET LOCAL app.member_id    = '<uuid>';              -- people only
SET LOCAL app.command_type = '<module.verb.vN>';    -- when executing a command
SET LOCAL app.decision_id  = '<uuid>';              -- when executing an approved draft
SET LOCAL app.posting_rule = '<rule id>'; SET LOCAL app.source_ref = '<table:pk>';  -- derived rows
```
Policies use `(select current_setting('app.tenant_id', true))::uuid` (missing → NULL → 0 rows, never an
error). Outlet-scoped tables are listed in `02-schema.md` §0. **Never `auth.uid()`.** `tenant_id` leads
every key. `FACT` (Postgres): any role can set custom `app.*` settings, so RLS isolates *requests*, and the
tenant on intel's read connection is trusted only because it comes from a verified run token (§1.7).

### 1.5 IDs, money, time

- IDs: UUIDv7, client-generated for commands. Human numbers (invoice, ticket) are separate series.
- Money: `bigint` minor units + `char(3)` currency. Rounding half-up per line; tax per pack rule; totals
  are sums of rounded lines.
- Time: `timestamptz`; business dates in the outlet's IANA zone from the pack; one tz module.

### 1.6 Commands, events, drafts, audit

- **Command:** `{command_id, idempotency_key, type, tenant_id, actor, payload}`; types
  `<module>.<verb>.v<N>` (e.g. `orders.place.v1`). Same key + same request hash → original result; same
  key + different hash → `409`.
- **Event (CloudEvents 1.0):** `type = "munim.<module>.<entity>.<past-tense-verb>.v<N>"`, e.g.
  `munim.orders.order.placed.v1`, `munim.inventory.movement.recorded.v1`; `source =
  "/tenants/<tenant_id>/<module>"`; `subject = <entity id>`; extensions `tenantid`, `munimrun` (run token,
  §1.7). Written to `core.outbox` in the command's transaction (Debezium-compatible columns).
- **Publishing:** after commit, the same core-api request publishes the transaction's outbox rows via the
  Publisher port and marks them `published_at` (CPU is allocated during the request — `FACT` R4 K5).
  A Cloud Scheduler job runs the `core-worker` sweeper every minute, which claims unpublished rows older
  than 30 s through `core.outbox_claim(batch_size)` (SECURITY DEFINER owned by `munim_crosstenant`,
  EXECUTE granted to `munim_svc` only; returns outbox rows only) and publishes them. Delivery is at least
  once; consumers dedupe (§1.7).
- **Draft:** `{id, outlet_ids, command_type, command_payload, evidence refs, based_on[], status}`.
  Draft status `proposed → executing → executed | failed`, or `proposed → rejected | stale`; the person's
  verdict (`approved`, `edited`, `rejected`) lives on `core.decision`. Approval:
  `UPDATE … SET status='executing', exec_txid = txid_current() WHERE id=$1 AND status='proposed'`
  (exactly one winner); re-check `core.command_authority` against the **final** payload; re-run each
  `based_on` snapshot template and compare its expected cells — any mismatch → `stale`, the transaction
  commits only that status. Otherwise the command executes as the approver with `app.decision_id`, writes
  the audit entry, sets `executed`, all in one transaction. Nothing auto-applies (R16).
- **Audit log:** `core.audit_log`, append-only, per-tenant chain `hash = sha256(prev_hash ‖
  canonical_json(entry))`.

### 1.7 Runs, evidence, answers (R25, R26)

- **Run token:** core-api mints an **Ed25519-signed** JWT (private key in Secret Manager, readable only by
  `sa-core`/`sa-worker`; intel holds only the public key, so intel cannot mint) `{run_id, tenant_id,
  outlet_scope, trigger, exp}` — `exp` 2 h for event runs (covers Pub/Sub retries), 15 min for interactive
  runs — and records `intel.run`. It rides in the CloudEvent `munimrun` extension and in every core→intel
  call (`/ask`, `/brief`, `/watch:sweep`). On every `/internal/intel/v1` call core-api verifies the
  signature **and** that `intel.run` has that `run_id` for that tenant and `ended_at is null`; tenant and
  outlet scope come only from the token.
- **Event claim:** intel calls `POST /internal/intel/v1/events:claim {event_id}` before work; a second
  claim of the same id → `409` → intel acks and stops (durable dedupe, no LLM re-spend).
- **Snapshot:** `POST /internal/intel/v1/snapshots {template_id, params}` → core-api (as `munim_svc`, with
  `SET LOCAL` of the token's tenant **and outlet scope**) runs the template under RLS and inserts
  `evidence.snapshot` with rows (cap 500) + sha256. `GET /v1/snapshots/{id}` shows the rows to any member
  of the tenant whose outlet scope covers them — this is how a person "opens the ledger rows" (R15).
  Numeric output columns of templates may come only from `core` tables or the deterministic allow-list
  (`intel.forecast_point` with `inputs_snapshot_id`, `intel.supplier_quote`, `intel.intel_spend`) —
  enforced by a template-scan test.
- **Refs:** `⟨snap:<id>·<row>·<column>⟩` (number, date or text cell); `⟨cite:<kind>:<id>[·<start>-<end>]⟩`
  with kinds `row`, `doc`, `msg`, `claim`, `snapshot`. The renderer substitutes snapshot cells (formatted by
  the pack) and quoted spans (from the source) — **the model never types a number or a quotation**.
- **Number grammar (one definition in `packages/contracts/grammar`):** model prose is rejected if, outside
  refs, it contains any `\p{N}` character (all Unicode numerics: digits, ½, ², Ⅻ), an **unambiguous**
  number word (English cardinals one…ninety-nine as whole words, hundred, thousand, million, billion,
  lakh, crore, dozen; Devanagari number words), a digit-free magnitude form (`k`, `L`, `Cr` only when
  attached to a ref), or `%`. Ambiguous words (`do`, `teen`, `half`, `quarter`, `double`) are **not**
  listed; the committed suite includes false-positive controls ("Do you…", "quarter-end close").
- **Answer envelope:** `{answer_id, segments[{text, refs[]}], abstained, reason_code?}`. core-api validates;
  on failure it stores `abstained = true` with an enum `reason_code` and refs, and composes the shown
  message itself from i18n ("Cannot verify: …") — intel never writes the reason text.

### 1.8 Trace events (back office replays these)

> **Superseded (11 Oct 2026, R45/ADR-014)** — the previous §1.8 paragraph:
>
> `intel.trace_event(tenant_id, run_id, seq, id, parent_id, kind, actor, payload, at)`, `kind ∈ {route,
> skill_load, subagent_start, subagent_end, tool_call, tool_result, a2a_send, a2a_receive, finding, draft,
> abstain, error}`. Flushed by intel **synchronously** every 50 events and at run end (before the HTTP
> response), via `POST /internal/intel/v1/traces:batch`. Insert fires `NOTIFY munim_trace,
> '<tenant>:<run_id>:<seq>'`; replay reads `intel.trace_event` by `(run_id, seq)`. Payloads carry ids and
> short labels only. Inbox changes (findings, drafts) fire `NOTIFY munim_inbox, '<tenant>:<id>'`, replayed
> from `core.draft` / `intel.finding` by `updated_at`. Traces and findings never go through the outbox.

**Why it changed.** F8 requires every trace to carry its specialist as actor; review m14 found prose could reach traces through branch reports; ADK skips `after_run_callback` when a run errors (FACT, installed `runners.py` ~1649), so traces were lost on failure. The `review` kind was added by rider G-OFF-3 (0012).

**What this improves.** The back office can draw each specialist from the actor alone; no untrusted text rides in traces; no lost traces on failure.

`intel.trace_event(tenant_id, run_id, seq, id, parent_id, kind, actor, payload, at)`, `kind ∈ {route,
skill_load, subagent_start, subagent_end, tool_call, tool_result, a2a_send, a2a_receive, finding, draft,
abstain, error, review}`. Flushed by intel **synchronously** every 50 events, at run end (before the HTTP
response) **and on run error** (`on_run_error_callback` + the runner's `finally`; 14-callback plugin, ADR-007), via
`POST /internal/intel/v1/traces:batch`. Insert fires `NOTIFY munim_trace, '<tenant>:<run_id>:<seq>'`; replay reads
`intel.trace_event` by `(run_id, seq)`. Payloads carry ids and short labels only — **never prose** (no branch report
text, answers, questions or thread text). **Actor labels (F8):** `manager`, `specialist:<pack>`, `branch:<pack>`,
`watcher:<pack>`, `brief`. Inbox changes (findings, drafts) fire `NOTIFY munim_inbox, '<tenant>:<id>'`, replayed
from `core.draft` / `intel.finding` by `updated_at`. Traces and findings never go through the outbox.

### 1.9 API surfaces

| Prefix | Caller | Auth | Notes |
|---|---|---|---|
| `/v1/*` | `web`, SDK, bespoke storefronts | IdP ID token (members), storefront key + optional customer token | OpenAPI 3.1 from zod |
| `/v1/stream?topics=…` | `web` | member/customer token in the `Authorization` header — browsers use **fetch-based SSE** (a `ReadableStream` reader in `packages/sdk`) that sends headers and `Last-Event-ID` on every reconnect; no `EventSource` | topics `kds:<outlet>` (member of outlet), `inbox:<tenant>` (owner/manager), `trace:<run>` (tenant member), `order:<id>` (that order's customer); Cloud Run `--timeout=3600`, client reconnects at 55 min |
| `/v1/findings`, `/v1/inbox`, `/v1/snapshots/{id}`, `/v1/runs/{id}` (+ `?finding=`), `/v1/traces/{run}` | `web` | member token | W1 read paths |
| `/v1/ask` | `web` | member token | W3 (T-082b, T-088a): `{question, thread_id?}`; core parses a leading `@Specialist`, proxies to intel, validates, composes the signature "{Specialist} · via Manager" |
| `/v1/specialists`, `/v1/specialists/{id}`, `/v1/threads`, `/v1/threads/{id}` | `web` | member token | W3 (T-087b, T-088a): desks (findings, drafts, track record as snapshot refs) and threads |
| `/v1/investigations` (+ `{id}`, `:continue`, `:approve-plan`, `:cancel`) | `web` | member token | W3 (T-083, T-084b, T-089a/b): Step / Plan / Auto within the role ceiling |
| `/v1/ai/policy` | `web` | owner token (others read) | W3 (T-090): per-role mode ceilings + monthly AI cap (book) |
| `/v1/drafts/{id}/lineage`, `/v1/lineage`, `/v1/draftables`, `/v1/findings/{id}:dismiss` | `web`, SDK | member token | W3 (T-084a) |
| `/internal/intel/v1/*` | `intel` only | run token (Ed25519, run row checked) **and** service identity (Cup: Cloud Run ID token of `sa-intel`; dev: shared secret) | T-040: `events:claim`, `watch:claim`, `snapshots`, `findings`, `drafts` (idempotent; open-duplicate merge; `recently_rejected`), `answers`, `traces:batch`. T-040b: `quotes:batch`, `claims/entities/aliases/edges/chunks/embeddings/wiki/forecasts:batch`, `spend`, `GET model-roles`, `GET run-frame` (outlets, tz, pack, currency, budget left, thread excerpt) |
| `/platform/v1/*` | `web` `/admin` | operator token | W1: `tenants:provision` only (T-006); W2: packs, plans, flags, budgets, model roles — drafts (R24) |
| intel `/events` | Pub/Sub push | OIDC token of `sa-pubsub-push`; `ackDeadlineSeconds = 300` | |
| intel `/ask`, `/brief`, `/watch:sweep` | core-api; `core-worker` `fanout` job | Cloud Run ID token + per-tenant run token | Cloud Scheduler never calls intel directly: it starts the `fanout` job, which lists tenants via `core.active_tenants()` and mints one run token per tenant |

> **Superseded (11 Oct 2026, R45/ADR-014)** — the `/v1/ask` and `/internal/intel/v1/*` rows:
>
> | `/v1/ask` | `web` | member token | W2 (T-035): proxies to intel, validates |
> | `/internal/intel/v1/*` | `intel` only | run token (Ed25519, run row checked) **and** service identity (Cup: Cloud Run ID token of `sa-intel`; dev: shared secret) | W1: `events:claim`, `watch:claim`, `snapshots`, `findings`, `drafts`, `answers`, `traces:batch`. W2: `quotes:batch` (T-025); `claims/entities/edges/embeddings/wiki/forecasts:batch`, `spend` (T-036) |

**Why it changed.** The ticket refs were stale (T-035 is customer accounts and T-036 the dev IdP; the intel routes were never built in W2 — the W2 review found `findings/inbox/runs/traces/evidence` declared in contracts but not mounted). ADR-014 §8 and §14 C1/C2 add the run-frame, model-roles, lineage, investigations; F8–F10 add specialists, threads and the AI policy.

**What this improves.** One table names every route with the ticket that serves it, which T-040 (9) and T-084a (5) gate as a route-table diff against contracts.


## 2 · Containers and data flow

```
 customer ─► web /order ─┐      owner/manager/staff ─► web /console /pos /kds        operator ─► web /admin
                         ▼                                   ▼                                  ▼
          ┌──────────────────────────────── core-api (Hono) ─────────────────────────────────┐
          │ /v1 · /v1/stream (SSE) · /internal/intel/v1 · /platform/v1                         │
          │ commit → publish outbox rows → Pub/Sub (in request)                                │
          └──┬──────────▲───────────────────────────────────▲──────────────┬─────────────────┘
   SQL (RLS) │ LISTEN    │ NOTIFY (ids only)                 │ HTTPS: run token + ID token
             ▼           │                                   │ (claims, snapshots, findings, drafts, traces)
     ┌──────── Cloud SQL Postgres 16 (asia-south1) ──────────┴───┐
     │ core · evidence · intel · platform · intel_ro (views)      │◄── SELECT views only (munim_intel_ro)
     └──────▲─────────────────────────────────────────────────────┘                     │
            │ outbox_claim() sweeper (Cloud Run job, every 1 min)                       │
       core-worker jobs                     Pub/Sub `munim-events` ──push──► intel (ADK) ┘
                                                                              │   │
                                             Spanner Graph (trial project) ◄──┘   └─ A2A ─► suppliers-sim
                                                                              │
                                                                   Gemini (global endpoint)
```

## 3 · Trust boundaries

| # | Boundary | Rule | Enforced by |
|---|---|---|---|
| T1 | Browser ↔ core-api | Authenticated; prices and totals re-derived server-side; client totals ignored | handlers + tampered-total tests |
| T2 | Tenant ↔ tenant | Forced RLS on every tenant table; context via `SET LOCAL` from a verified identity or an Ed25519 run token whose run row core checks; only `munim_crosstenant` (3 objects) crosses tenants | Postgres + isolation suite (expected set from `tenant_id` columns) + definer-owner gate |
| T3 | Outlet ↔ outlet | `app.outlet_ids` in outlet-scoped policies; snapshots minted with the run's outlet scope | Postgres + manager-scope suite |
| T4 | intel ↔ books | intel has no write grant; internal routes run as `munim_svc`, which cannot touch book tables; book trigger (§1.3) | grants + trigger + planted-route gate |
| T5 | Model output ↔ screen | Number grammar; refs resolve in-tenant; quotes rendered from source; draft numbers are refs (R26) | core-api validator + renderer |
| T6 | Untrusted text ↔ tools | Quarantined extractor (no tools); **run-level taint**: once any context in a run (incl. a branch, a supplier reply, or a tainted thread turn in the window) reads untrusted text, `propose_*` and `request_quotes` are refused for the rest of the run; tainted summaries are never re-read; Q&A has no outbound channel | intel structure + injection suite (T-042 (5), T-053, T-082b (6), T-088b (3), T-055b (4)) |
| T7 | intel ↔ suppliers-sim | Service identity (dev secret; Cup ID token); RFQs non-binding (R22); the AI picks only from the rule-allowed move set and types no prices (F4); replies → no-tools extractor; PO only as a draft emitted by deal-review code | `NegotiationPolicy` + draft lifecycle (T-055a/b) |
| T8 | Operator ↔ tenants | `platform` via `/platform/v1` only; provisioning and flips are operator commands (R27) | separate role + route guard |

> **Superseded (11 Oct 2026, R45/ADR-014)** — rows T6 and T7:
>
> | T6 | Untrusted text ↔ tools | Quarantined extractor (no tools); plan before reading; Q&A has no outbound channel | intel structure + injection suite |
> | T7 | intel ↔ suppliers-sim | ID token; RFQs non-binding (R22); PO only as a draft | IAM + draft lifecycle |

**Why it changed.** Review B1 showed per-session taint could be laundered through a branch report or a re-read summary; F9 threads re-read context; F4 lets a model choose negotiation moves.

**What this improves.** The boundary is stated as one per-run flag with named gates, covering every new path that re-reads text or talks to a supplier.


**One Guarantee scan (R15, R26–R29):** clause 1 — book tables admit writes only from a person's own command,
an approved decision, or an allow-listed derivation of an approved row (§1.3); intel and services have no
other path; imports are drafts (R28); operator config is drafts (R24); demo tenants are retired, never
deleted. Clause 2 — core screens show rows as themselves; everything intel says and every aggregate renders
from snapshot cells minted by core-api; the model types no numbers or quotations; draft numbers are refs.
Channels: NOTIFY carries ids only; SSE re-reads under RLS; error/abstain text is composed by core; traces
carry ids. Each clause has a W1 gate (BOARD).

## 4 · Ports and adapters

| Port | Interface | Dev adapter | Cup adapter |
|---|---|---|---|
| `Sql` | pg pool + `withContext(ctx, fn)` | Supabase Postgres (local) **or** Homebrew PG16 + pgvector | Cloud SQL Postgres 16 (Cloud Run built-in Cloud SQL connection, unix socket; no VPC connector) |
| `Blob` | `put/get/signedUrl` | Supabase Storage | Cloud Storage |
| `Publisher` | `publish(cloudEvent[])` | in-process: POST to intel `/events` | Pub/Sub |
| `Stream` | SSE from LISTEN/NOTIFY | same | same |
| `IdP` | `verify(token)` | Supabase Auth JWKS (dev); `idp-local` JWKS stub (all gates) | Identity Platform JWKS |
| `Scheduler` | `every(name, cron, target)` | in-process timers (dev only) | Cloud Scheduler → Cloud Run job / intel endpoint |
| `Secrets` | `get(name)` | `.env` | Secret Manager |
| `Graph` (Py) | 5 templates + `upsert/delete_tenant` | **Postgres edges + recursive CTEs (default, R35, F7)**; FalkorDB (pinned 4.x) optional, later | Spanner Graph (parked with the Cup fork, R37) |
| `DecisionModel` (Py) | `decide(ctx, state, questions) → results` (choice / score / predicate; bands only) | `RecordedDecision` (gates); `LlmMimic` on the `router` role (F2) | same; Jev / OpenAI Decisions only after the W5 bake-off (ADR-014 §13.3) |
| `SupplierPort` (Py) | `rfq`, `counter`, `accept` over A2A | `a2a-sdk` client → local `suppliers-sim` | same, Cloud Run |
| `Model` (Py) | ADK `BaseLlm` subclass + `generate_json(role, schema, input)` | `RecordedLlm` (fixtures) or Gemini API | Gemini, `location=global` |
| `Payments` | `record(tender)` | recorded | recorded |

> **Superseded (11 Oct 2026, R45/ADR-014)** — the `Graph` row:
>
> | `Graph` (Py) | 5 templates + `upsert/delete_tenant` | FalkorDB (pinned 4.x) | Spanner Graph (GoogleSQL, one graph, tenant in keys) |

**Why it changed.** R35 made Postgres edges the default graph and parked Spanner (R37); F7 confirmed FalkorDB only later. ADR-014 added two ports: DecisionModel (§4) and SupplierPort (§10).

**What this improves.** The table matches what the standalone build runs; both new ports have recorded adapters, so every gate stays offline (rule 17).


`MUNIM_MODEL_MODE=recorded|live`: every W1–W3 gate runs in `recorded` mode against committed fixtures;
`live` is used only by the post-probe smoke test. W1 narration is template text with refs. Embeddings use
`output_dimensionality = 768` (pgvector index limit). Dev adapters live only under `adapters/dev/`.

## 5 · Key flows

1. **Order to kitchen.** `/pos` or `/order` → `POST /v1/orders` → core writes order, lines, consumption
   movements (posting rule from the order), kitchen tickets, outbox; commit; publish; `NOTIFY` → SSE to
   `kds:<outlet>`.
2. **Event to intel.** Pub/Sub push → intel `/events` → `events:claim` → projector (W2) → for each pack whose
   detector watches this type: `watch:claim {pack}` (core returns go if the pack's last run for the tenant is
   older than the debounce window, `0 s` in tests, `15 min` in prod — leading edge) → run the detector inside
   the same request. Every 15 min Cloud Scheduler starts the `core-worker` `fanout` job, which calls intel
   `/watch:sweep` once per active tenant with that tenant's run token (trailing coverage).
3. **Watcher to inbox.** detector snapshot → above threshold → narration (template in W1, model later) with
   refs → `POST /internal/intel/v1/findings` (+ draft with ref-valued numbers and `based_on`) → validated →
   `NOTIFY munim_inbox` → SSE.
4. **Draft to books.** approve → conditional status update → authority + `based_on` re-check → execute as
   approver with `app.decision_id` + audit → commit → publish.

> **Superseded (11 Oct 2026, R45/ADR-014)** — flows 5 and 6:
>
> 5. **Ask.** `POST /v1/ask` → core mints run token → intel `/ask` → router → tools → envelope → core
>    validates → stream to `web` (or "Cannot verify").
> 6. **Negotiation (W2).** purchasing skill → suppliers-sim A2A (RFQ, ≤ 2 counters, traced) → quotes written
>    via `quotes:batch` to `intel.supplier_quote` → deal review over quote snapshots → PO draft (numbers are
>    quote refs) → inbox.

**Why it changed.** The ask path now has a DecisionModel route step, a Manager, forced skills for `@Specialist`, threads and read-only fan-out (ADR-014 §3.3, F8, F9); negotiation is hybrid (F4) and lands in W3, not W2; investigations are a new flow (F1, F10).

**What this improves.** Each flow names the deterministic step that bounds the model, so reviewers can check clause 1 and clause 2 per hop.

5. **Ask (F8, F9).** `POST /v1/ask {question, thread_id?}` → core parses `@Specialist`, mints a run token → intel
   `/ask` → run-frame (incl. thread excerpt + taint) → `route.intent` → Manager + skill(s), or ≤ 4 read-only branches on
   `investigate` → `submit_answer` → core validates, composes "{Specialist} · via Manager" → stream (or "Cannot verify").
6. **Negotiation (W3, F4).** Inventory & Purchasing `request_quotes` (or a shortfall) → `NegotiationPolicy` allowed moves
   → per round an AI typed choice within them (default on error/budget) → suppliers-sim A2A (RFQ, ≤ 2 counters, traced;
   replies → no-tools extractor) → `quotes:batch` → deterministic deal review → PO draft from review code (quote refs) →
   inbox.
7. **Import (W2).** upload → raw document → mapping draft if the format is new → approved → worker job
   parses into staging → preview draft (rows, ₹ total, quarantined, control total) → approved → rows commit
   under the approver (R28).
8. **Investigation (F1, F10).** `POST /v1/investigations {mode}` (ceiling checked) → Step: each `:continue`; Plan: approve
   once, core runs the steps inside that request; Auto: core-worker resumes on new data → each step: core mints the playbook templates in the
   creator's current scope, evaluates verdicts, writes the step → intel `/investigate:narrate` (one L1 call) → stop at
   waiting / draft / abstain / budget / scope change.

## 6 · Auth lanes

| Lane | Identity | Authorisation |
|---|---|---|
| Member | Identity Platform user, one pool | `core.membership` (role, outlet scope) + `core.command_authority` |
| Customer | storefront key; optional email-OTP account | own orders only |
| Operator | Identity Platform user in `platform.operator` | `/platform/v1`; provisioning and flips are operator commands |
| Judge | landing-page button runs `demo.session.start.v1`: creates an **ephemeral named member** (role `judge`, e.g. "Judge 7f3a (demo)") and, as that member's own command, clones the seeded world into a fresh demo tenant (R27) | owner rights in that demo tenant; old demo tenants retired, never deleted |
| Service | `sa-core`, `sa-intel`, `sa-worker`, `sa-suppliers`, `sa-pubsub-push` | ID-token audience + allow-list; run tokens for tenant scope |

## 7 · Repo layout

```
apps/web/                 Next.js: app/{pos,kds,order,console,admin}/…
services/core-api/        src/modules/<module>/{routes,service,repo}.ts · src/internal/ · src/platform/ · src/stream/
services/core-worker/     job entrypoints only; imports core-api modules
services/intel/           munim_intel/{runtime,llm,manager,context,decide,skills/<pack>,tools,events,watch,brief,negotiate,
                          investigate,threads,fanout,ingest,wiki,forecast,graph,trace,contracts_gen}   (ADR-014; 11 Oct)
services/suppliers-sim/   three agents + personalities (labelled simulated)
packages/core-domain/     money, tz, country-pack engine, posting rules, command authority, envelope grammar + resolver port
packages/contracts/       zod → OpenAPI/JSON Schema → TS SDK + Pydantic; CloudEvents; grammar; internal API schemas
packages/sdk/  packages/ui/
adapters/gcp/             Cup adapters      adapters/dev/   Supabase/FalkorDB/in-process adapters (never exported)
db/migrations/ db/seeds/ db/tests/          migrator lane only
tools/worldgen/  evals/  infra/  scripts/
Makefile
```

> **Superseded (11 Oct 2026, R45/ADR-014)** — the `services/intel/` line of the layout above:
>
> services/intel/           munim_intel/{runtime,router,skills/<pack>,tools,watch,ingest,wiki,forecast,graph,trace}

**Why it changed.** ADR-014 and F8–F10 introduced the Manager, the context assembler, the DecisionModel port, negotiation, investigation narration and threads; `router/` became `manager/` + `decide/` (route.intent).

**What this improves.** Lane territories in BOARD W3 map 1:1 onto these directories, so parallel lanes do not collide.

Boundaries (CI): `apps/web` imports only `packages/{sdk,ui,contracts}` (sign-in uses the SDK's IdP client
interface; the Supabase client is injected from `adapters/dev`); core-api modules import each other only via
`index.ts`; nothing outside the dev composition root imports `adapters/dev`; intel imports only generated
contract models.

## 8 · Deployment (Cup)

| Resource | Setting |
|---|---|
| Region | `asia-south1`; Gemini `global`; Spanner trial in its own project |
| `web`, `core-api`, `intel` | request-billed; `--max-instances` core-api 2, intel 2, web 3; min-instances 1 for the three from freeze through judging; core-api `--timeout=3600` (SSE) |
| `suppliers-sim` | min 0, max 1 (W2); agent card URL from env `PUBLIC_URL` |
| `core-worker` | Cloud Run jobs via Cloud Scheduler (`sa-scheduler` holds `run.invoker` on the jobs): `outbox-sweep` (1 min, `--parallelism 1`, a Postgres advisory lock prevents overlap), `fanout` (15 min watch sweep; daily brief per tenant), `dlq-drain` (5 min), `nightly` |
| Cloud SQL | Postgres 16, `--edition=ENTERPRISE --tier=db-f1-micro`, public IP + Cloud Run built-in connection (IAM), no VPC connector |
| Pub/Sub | `munim-events` → push to intel `/events` (OIDC, ack 300 s), DLQ `munim-events-dlq` after 5 attempts (service agent granted publisher/subscriber) |
| Identity Platform | one pool; authorised domains include the `web` run.app URL |
| IAM | `sa-core`: `cloudsql.client`, `pubsub.publisher`, `secretmanager.secretAccessor` (incl. run-token private key); `sa-worker`: same + `pubsub.subscriber` on the DLQ subscription + `run.invoker` on intel; `sa-intel`: `cloudsql.client`, `aiplatform.user`, `secretmanager.secretAccessor` (public key only), `run.invoker` on core-api and suppliers-sim, `spanner.databaseUser` in the trial project (W2); `sa-pubsub-push`: `run.invoker` on intel; `sa-scheduler`: `run.invoker` on jobs |
| Budget | alerts at $50 / $100 |

**Connection budget (`max_connections` ≈ 25 on `db-f1-micro`, 50 on `db-g1-small`, both including
reserved slots — `FACT` per review, Cloud SQL flags page).** Steady state: core-api 2 instances × (`munim_core`
pool 3 + `munim_svc` pool 1 + 1 LISTEN) = 10 · intel 2 × 2 (`munim_intel_ro`) = 4 · jobs (sweep, fanout,
nightly/dlq) 3 × 1 = 3 · migrations 1 → **18**. A core-api deploy briefly runs old and new revisions
together (+10 → 28), which **exceeds f1-micro**. Pools are lazy (min 0, idle timeout 10 s). The tier is an
open founder spend decision (BOARD deploy notes): f1-micro with deploys only at quiet times, or g1-small
(≈ $27/month) with headroom.

Cost: `INFERENCE` ≈ $55–70/month expected + Spanner $0 (trial) or ≈ $126 (paid) — R4 §1.

## 9 · Failure modes

| Failure | Behaviour |
|---|---|
| intel down | AI panels hidden behind the typed `intel.enabled` flag; the inbox and approvals still work (approval needs only core) |
| Validator fails | `reason_code` stored; core composes "Cannot verify: …" |
| Publish after commit fails | row stays unpublished; sweeper publishes within ~1 min |
| Push fails | Pub/Sub retries → DLQ → `dlq-drain` creates an operator alert |
| Duplicate delivery | `events:claim` 409 → ack, no work |
| Graph down / drift | SQL + search fallback; nightly checksum → rebuild |
| Gemini error / budget | retry → cheaper role → template text with refs; hard cap → rules only |
| SSE dropped | reconnect with `Last-Event-ID` |
| Stale draft | `based_on` mismatch → `stale`, shown with what changed |
| Health | `/health` does a DB round-trip and reports the migration version; 200 only if both pass |

## 10 · ADR index

`docs/plan/adr/`: ADR-001 modular monolith · ADR-002 Postgres + forced RLS · ADR-003 intel has no write
grant · ADR-004 outbox, publish-after-commit, sweeper · ADR-005 SSE from LISTEN/NOTIFY · ADR-006 graph
projection, Spanner for the Cup (Spanner parked, R37; Postgres edges default, R35/F7) · ADR-007 ADK Manager + specialist
skills + read-only branch Runners, in-memory sessions (amended 11 Oct) · ADR-008 suppliers-sim A2A in one service via
`a2a-sdk`, hybrid negotiation (amended 11 Oct) · ADR-009 Identity Platform + Postgres memberships · ADR-010 Gemini roles,
global endpoint · ADR-011 country packs + platform schema · ADR-012 dev adapters excluded from the Cup repo
· ADR-013 the book guard (R26–R29) · **ADR-014 the intelligence layer (ratified R45, 11 Oct; review in `ADR-014-review.md`)**.

> **Superseded (11 Oct 2026, R45/ADR-014)** — the ADR index entries for ADR-006/007/008:
>
> projection, Spanner for the Cup · ADR-007 ADK router + skills + sub-agents, in-memory sessions · ADR-008
> suppliers-sim A2A in one service …

**Why it changed.** ADR-007 and ADR-008 were amended by ADR-014; ADR-014 was added.

**What this improves.** The index points at the governing decision instead of the superseded one.
