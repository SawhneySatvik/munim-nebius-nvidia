# R1 — Architecture research: from hackathon build to real business

Status: research input, not a decision. Every claim is tagged `FACT` (with source), `INFERENCE`
(reasoning) or `UNVERIFIED`. Written 8 Oct 2026.

---

## 1. Recommendation in 10 lines

1. **Day one is four deployables plus Postgres.** `core-api` is a TypeScript modular monolith. `core-worker` is the same image with an outbox relay, jobs and sync. `web` is one Next/PWA codebase with three shells: POS, QR ordering and owner console. `intel` is one Python ADK service, with the 8 agents as modules. `INFERENCE`
2. **The only hard service boundary on day one is core ↔ intel.** The language split and the trust boundary (propose-only) justify it. Everything else is a module boundary, enforced by lint rules, not by the network. `INFERENCE`
3. **Use one Postgres** (Cloud SQL `asia-south1`) in the pool model, with `tenant_id` leading every key and `FORCE ROW LEVEL SECURITY`. The `intel` service reads through views in a separate schema with a read-only role. `INFERENCE`
4. **Run events through a transactional outbox table**, with a polling relay to a `Publisher` port (Pub/Sub on GCP, in-process in dev). Use CloudEvents envelopes and versioned JSON Schemas. `INFERENCE`
5. **FalkorDB is a projection** that can be rebuilt from events. It is never a source of truth, so it can be dropped or swapped for Spanner Graph without loss. `INFERENCE`
6. **The POS is offline-capable from the schema up:** client-generated UUIDv7 IDs, per-device invoice series, append-only stock deltas and server-derived ledger postings. Ship the sync engine after the Cup. `INFERENCE`
7. **Extensibility, in order:** public REST API and signed webhooks first, then theming and white-label for the customer-facing ordering site, then domain packs as config. A marketplace comes last. `INFERENCE`
8. **Split `intel-ingest` (documents/chats) and `intel-forecast` (batch)** into their own Cloud Run jobs only when they compete with interactive agent latency or memory. `INFERENCE`
9. **Split a core module out only on one of these signals:** a different scaling profile (as with Shopify's storefront renderer), a security or compliance isolation need (as with card vaulting), or more than one team colliding on deploys. `FACT` for the Shopify precedent, `INFERENCE` for the rule.
10. **Shard with Citus or a pods model only when the measured write load or tenant size demands it.** The schema decisions in section 5 keep that path open at almost no cost today. `INFERENCE`

---

## 2. Pushback list

| # | Founder idea | Why it does not hold up | Better alternative |
|---|---|---|---|
| P1 | **"Intelligence services become microservices SaaS"** (one service per agent) | Segment went to more than 140 services and 120+ repos. Three full-time engineers spent most of their time keeping it running, and Segment moved back to one service. `FACT` [Segment](https://www.twilio.com/en-us/blog/developers/best-practices/goodbye-microservices). Fowler: almost all successful microservice stories started as a monolith that was later split, and moving functionality between services is much harder than inside a monolith. `FACT` [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html). Prime Video consolidated one distributed monitoring component into a single process and cut that component's cost by about 90%. `FACT` (the original post now redirects; secondary account: [dev.to](https://dev.to/indika_wimalasuriya/amazon-prime-videos-90-cost-reduction-throuh-moving-to-monolithic-k4a)). Eight agents share one model client, one tool registry, one eval harness and one approval contract. Splitting them adds eight deploys and no new isolation. `INFERENCE` | One `intel` service, with the agents as modules behind a coordinator. Sell "intelligence" as a **product tier and an API surface**, not as a deployment topology. `INFERENCE` |
| P2 | **"Frontend can be changed per customer"** | Shopify deprecated `checkout.liquid` because per-merchant customisations were hard to test and maintain, needed complicated upgrades and ran JavaScript outside a sandbox. Checkouts that were not migrated were reset to the default. `FACT` [Shopify changelog](https://changelog.shopify.com/posts/the-checkout-liquid-theme-file-is-being-deprecated). Toast and Square do not fork their POS UI per customer. They expose APIs and a partner marketplace. `FACT` [Toast partner overview](https://doc.toasttab.com/doc/devguide/apiPartnerIntegrationOverview.html), [Square developer](https://developer.squareup.com/docs). A bespoke frontend per small restaurant multiplies QA, upgrades and support with every customer: services revenue at software margins. `INFERENCE` | **One product UI.** Use design tokens and white-label (logo, colours, domain, layout presets) **only on the customer-facing QR/web ordering**. Add named extension slots, not forks. Anyone who wants a fully custom frontend builds it on the **public API**, and it is their code, not ours. `INFERENCE` |
| P3 | **"Make the backend a separate headless product"** now | Headless is the right **shape**: Medusa and Saleor are API-first backends. `FACT` [Medusa modules](https://docs.medusajs.com/learn/fundamentals/modules), [Saleor apps](https://docs.saleor.io/developer/extending/apps/overview). Medusa is also a modular monolith. Modules are isolated, with no direct relations across them, and use links, queries and workflows instead. `FACT` [Medusa isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation). As a **second product with its own go-to-market** at 1–2 engineers, it splits focus before restaurants have bought product 1. `INFERENCE` | Build **API-first internally**: our own UI uses only the public, versioned API. That makes "headless" a pricing decision later, not a rewrite. `INFERENCE` |
| P4 | **"Way too scalable"** on day one | Rough arithmetic, `INFERENCE`. At 1,000 outlets × 400 orders a day × about 25 rows per order (lines, stock moves, postings, outbox), the system writes about 10M rows a day. That averages about 115 writes per second, with peaks around 5× that. One Postgres handles this. Shopify needed about 150 Debezium connectors and pods because it runs millions of shops. `FACT` [Shopify CDC](https://shopify.engineering/capturing-every-change-shopify-sharded-monolith), [Shopify pods](https://shopify.engineering/a-pods-architecture-to-allow-shopify-to-scale). That is a year-five problem, if it ever comes. | Separate **scale-ready decisions**, which are cheap now and expensive later, from **scale infrastructure**, which is expensive now and cheap to add later. Scale-ready: `tenant_id` leading every primary and foreign key, as Citus requires (`FACT` [Citus](https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html)), UUIDv7 IDs, outbox, idempotency keys. Scale infrastructure: Kafka, Debezium, sharding. Defer it. |
| P5 | **"Cloud-agnostic: Supabase for dev, GCP for deploy"** | (a) The project's own hard rule 2 bans Supabase in anything submitted to the Cup. `FACT` (`foodops-os/CLAUDE.md`). (b) Supabase features do not carry over to GCP. Supabase Queues is built on `pgmq` (`FACT` [Supabase Queues](https://supabase.com/docs/guides/queues)). Cloud SQL's extension list has no `pgmq` or `pg_net`, though it does have `pg_cron` and `pgvector`. `FACT` [Cloud SQL extensions](https://docs.cloud.google.com/sql/docs/postgres/extensions), checked by grep on 8 Oct 2026. RLS written against `auth.uid()` depends on Supabase Auth's helpers. `FACT` [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). (c) Hohpe: avoiding lock-in has its own costs in complexity, new dependencies and features you cannot use, and it is easy to over-invest. `FACT` [Hohpe](https://martinfowler.com/articles/oss-lockin.html). | **Target vanilla Postgres** (Docker locally, Cloud SQL deployed). Set `SET LOCAL app.tenant_id` per transaction (session-level `SET` leaks through transaction-mode poolers, `INFERENCE`). Use a non-owner app role and `FORCE ROW LEVEL SECURITY` (`FACT` [AWS RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)). Verify any OIDC JWT in the API. Keep ports only where the cloud differs: `Publisher`, `BlobStore`, `Secrets`, `IdP`, `LLM`. `INFERENCE` |
| P6 | **FalkorDB (plus optional Spanner Graph) as core intel infrastructure on day one** | It is another stateful system to back up, secure per tenant and operate. Two graph adapters means two test matrices for one or two engineers. `INFERENCE` | Treat the graph as a **projection rebuilt from the event log**: tenant-scoped, disposable, one adapter. Use Postgres (recursive CTEs plus `pgvector`) until a graph query cannot be served there. `INFERENCE` |
| P7 | **Data residency forces per-tenant silos** (implied by "scalable SaaS") | DPDP uses a negative list for cross-border transfers. Localisation applies only to notified Significant Data Fiduciaries, and Section 16 is expected to commence around 13 May 2027. `FACT` per law-firm summaries ([KS&K](https://ksandk.com/data-protection-and-data-privacy/cross-border-data-transfers-dpdp-act-india/), [Bar & Bench](https://www.barandbench.com/columns/the-dpdp-cross-border-transfer-rules-arent-live-yet-so-why-are-contracts-being-redrafted-as-if-they-are)). The exact dates are `UNVERIFIED` against the Gazette. RBI's 2018 localisation directive binds **payment system providers**, not merchants. `FACT` [RBI](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11244). | Use the pool model in an Indian region (`asia-south1`/`asia-south2`), which is good for latency anyway. Keep the bridge or silo option open for a future enterprise chain through `tenant_id`-keyed export and restore. `INFERENCE` |

---

## 3. Research by topic

### 3.1 Modular monolith vs microservices

- Shopify runs 2.8M lines of Ruby as one monolith split into 37 components. It extracts services only for a reason: storefront rendering, which is a high-throughput read path, and card vaulting, which is sensitive data. `FACT` [Shopify](https://shopify.engineering/shopify-monolith)
- Packwerk enforces declared dependencies and public APIs between packages, statically, inside pull requests. `FACT` [Packwerk](https://shopify.engineering/enforcing-modularity-rails-apps-packwerk)
- The extracted storefront renderer could be deployed worldwide without the monolith. `FACT` [Shopify](https://shopify.engineering/how-shopify-reduced-storefront-response-times-rewrite)

**Recommendations.** `INFERENCE` for each.
- Use a pnpm monorepo with `packages/<module>` and a public `index.ts` per module.
- Enforce boundaries with `eslint-plugin-boundaries` or `dependency-cruiser` in CI. This is the TypeScript equivalent of Packwerk.
- Modules: `catalog`, `orders`, `inventory`, `purchasing`, `ledger`, `staff`, `customers`, `compliance`, `approvals`, `tenancy`.
- Modules never join across each other's tables. They call through the module's API or react to events.

### 3.2 Headless, API-first, and per-customer frontends

- Saleor apps are separate processes. They use webhooks (sync and async), scoped permissions and a manifest, and can render inside the Saleor Dashboard. `FACT` [Saleor](https://docs.saleor.io/developer/extending/apps/overview)
- commercetools lets merchants extend its admin through Custom Applications and Custom Views, which merchants develop and host themselves. `FACT` [commercetools](https://docs.commercetools.com/merchant-center-customizations/overview)
- Toast charges $25 per location per month for partner integrations, runs a certification process, and limits Partner Connect to restaurants with 1–9 locations. `FACT` [Toast](https://doc.toasttab.com/doc/devguide/apiPartnerIntegrationOverview.html), [Toast support](https://support.toasttab.com/en/article/Set-Up-Toast-Partner-Integrations)
- The common pattern is **a stable API, extension slots and a marketplace**, not per-customer forks. `INFERENCE`

**Recommendations.** `INFERENCE` for each.
- Publish an OpenAPI 3.1 spec as the contract, and generate the TypeScript SDK that our own UI uses.
- Theming is limited to tokens and presets, applied only to customer-facing surfaces.

### 3.3 Multi-tenancy on Postgres

- AWS defines three models: silo (dedicated resources), pool (shared resources) and bridge (a mix). In every model, tenants still share identity, onboarding and operations. `FACT` [AWS SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html)
- The usual RLS pattern sets `current_setting('app.current_tenant')` and uses a non-owner role. Table owners bypass RLS unless `FORCE` is set. `FACT` [AWS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- **RLS performance.** Supabase's benchmarks: indexing the policy column took a query from 171 ms to under 0.1 ms. Wrapping the identity function in `(select …)` took 179 ms to 9 ms. A security-definer helper took 178 s to 12 ms. `FACT` [Supabase RLS perf](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv). These numbers measure `auth.uid()`. A `current_setting` policy should benefit the same way when wrapped and indexed. `INFERENCE`
- **Citus** expects the tenant ID to be the distribution column and part of every primary and foreign key. It can move a large tenant to its own shard with `isolate_tenant_to_new_shard`. `FACT` [Citus](https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html)
- **Noisy neighbours:** per-tenant statement timeouts, API rate limits, intel reads on a replica. `INFERENCE`
- **Per-tenant backup and restore:** the pool model has no per-tenant snapshots, so build a tested `tenant_export(tenant_id)` (logical JSONL), reused for DPDP erasure and portability. `INFERENCE`

### 3.4 Offline-first POS

**What incumbents do.**
- Toast elects a wired "local hub" device that relays orders to other devices on the LAN while the restaurant is offline. Online ordering does not work offline. `FACT` [Toast local sync](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html), [Toast offline](https://doc.toasttab.com/doc/platformguide/adminOfflineModeOverview.html)
- Square's offline card payments must sync within 24 hours. Declines and expiries are the seller's loss. `FACT` [Square](https://squareup.com/help/au/en/article/7777-process-card-payments-with-offline-mode)
- Petpooja runs offline for up to 5 days, keeps the GST bill series, and stops aggregator and EDC card flows while offline. `FACT` [Petpooja](https://blog.petpooja.com/industry-business-guides/restaurant-pos-without-internet/)

**Sync tools.**
- **PowerSync** syncs Postgres to SQLite on the client. Client writes upload to *your* API, which must apply them synchronously, so the server stays authoritative. `FACT` [PowerSync](https://docs.powersync.com/handling-writes/writing-client-changes)
- **Electric** syncs reads only. Writes go through your API. `FACT` [Electric](https://electric.ax/docs/guides/writes)
- **Zero** rejects writes while disconnected. `FACT` [Zero](https://zero.rocicorp.dev/docs/offline)
- **Replicache** is in maintenance mode. `FACT` [Replicache](https://replicache.dev/)

**Conflict rules.** `INFERENCE` for each.
- **Orders** have a single writer, the device that created them. They are append-only and use idempotency keys.
- **Stock** changes are deltas that commute. Allow negative stock and raise an alert; never block a sale.
- **Money** is never merged. Ledger postings are derived on the server from finalised orders.
- **Card payments** are not taken offline. Offline payments are cash or "record only".

**Fit.** PowerSync, or a hand-rolled event-log upload, matches "the core validates and commits". CRDTs do not fit money. `INFERENCE`

### 3.5 Core → intel events

- The outbox pattern publishes a message **if and only if** the transaction commits. Delivery is at least once, so consumers must be idempotent. `FACT` [microservices.io](https://microservices.io/patterns/data/transactional-outbox.html)
- Debezium's outbox router expects the columns `id`, `aggregatetype`, `aggregateid`, `type` and `payload`. `FACT` [Debezium](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)
- Cloud SQL supports logical decoding (`pgoutput`, `wal2json`) through a flag that needs a restart. `FACT` [Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/replication/configure-logical-replication)
- CloudEvents became a CNCF graduated project in January 2024. `FACT` [CloudEvents](https://cloudevents.io/)
- **Plan.** Use those Debezium column names now with a polling relay, so moving to CDC later is a configuration change. Version schemas as `foodops.order.finalised.v1`. Changes within a version are additive only, and a breaking change gets a new version, dual-published for a deprecation window. `INFERENCE`

### 3.6 Extensibility model

- Stripe pins each account to a dated API version and converts responses back through "version change modules". It has made nearly 100 breaking changes without breaking integrations. `FACT` [Stripe](https://stripe.com/blog/api-versioning)
- Standard Webhooks specifies signed payloads with `webhook-id` and `webhook-timestamp` headers. `FACT` [Standard Webhooks](https://www.standardwebhooks.com/)

**Order of work.** `INFERENCE` for each.
1. Public API with dated versions.
2. Standard Webhooks, sent from the outbox.
3. **Domain packs.** These are data, not code: chart of accounts, tax rules, units, KDS stations, menu templates and agent prompts per vertical (QSR, cafe, cloud kitchen, kirana).
4. App marketplace. Build it only once outside developers ask for it.

### 3.7 Cloud-agnostic in practice

Portable already: Postgres, containers, OIDC, S3-style blobs. Breaks: auth helpers, queues (`pgmq`), realtime, edge functions (see P5). `INFERENCE`

**Recommendation.** Write five narrow ports and run the integration tests against Cloud SQL-compatible Postgres only. `INFERENCE`

---

## 4. Target architecture

```
DAY ONE (Cup, 18 Oct)                                  all INFERENCE
 ┌──────────── web (one codebase, PWA) ────────────┐
 │ POS shell │ QR/web ordering (themed) │ Owner console + approvals │
 └───────────────────────┬──────────────────────────┘
                         │ public OpenAPI (versioned)
 ┌───────────── core-api (TS modular monolith, Cloud Run) ─────────────┐
 │ catalog│orders│inventory│purchasing│ledger│staff│customers│approvals │
 │ tenancy (RLS ctx) │ outbox write in same txn                         │
 └───────┬─────────────────────────────────────────┬────────────────────┘
         │                                         │ core-worker (same image)
   Cloud SQL Postgres (asia-south1)                │ outbox relay → Publisher port
   schemas: core.* (RLS) │ intel_ro.* views        ▼
         ▲ read-only role                    Pub/Sub topic(s)
         │                                         │
 ┌───────┴──── intel (Python ADK, Cloud Run) ──────┴───┐   suppliers-sim (A2A)
 │ coordinator + 8 agent modules │ eval/refusal │ proposals → core approvals API │
 └──────────────────────────────────────────────────────┘

YEAR ONE (if signals fire)
 web ──► API gateway (rate limit per tenant, keys, webhooks out)
 core-api (modular monolith) ──► Postgres primary ─► read replica ─► intel, BI
        └─ outbox ─► CDC (Debezium/Datastream) ─► Pub/Sub ─► { intel-agents,
                                                              intel-ingest (job),
                                                              intel-forecast (job),
                                                              graph-projector → FalkorDB,
                                                              webhook-dispatcher }
 POS devices: SQLite + sync (PowerSync-style) ⇄ core-api upload endpoint
 Silo option: one enterprise tenant on its own Cloud SQL via tenant_export/import
```

---

## 5. Decisions to make now (expensive to change later)

| Decision | Why now | Tag |
|---|---|---|
| `tenant_id` on every row, **leading** every PK/FK and index | Citus requires the distribution column in keys, and adding it later rewrites every table | `FACT` [Citus](https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html) |
| Add `outlet_id` alongside `tenant_id` | D-004 (outlet managers see only their outlet) needs it in the RLS policies | `INFERENCE` |
| Money as `bigint` paise plus a currency code; no floats; rounding rules written down | Reconciliation and GST totals must be exact | `INFERENCE` |
| Client-generated UUIDv7 IDs and idempotency keys on every command | A precondition for offline sync and safe retries | `INFERENCE` |
| Invoice series per device or terminal (e.g. `OUT1-T2-000123`), restarting each financial year | Offline bills must stay sequential without a central counter. Petpooja preserves the GST series offline (`FACT` [Petpooja](https://blog.petpooja.com/industry-business-guides/restaurant-pos-without-internet/)). The CGST Rule 46 requirement for consecutive, financial-year-unique serials is `UNVERIFIED` | mixed |
| Append-only stock movements and double-entry postings; corrections are reversals | Gives audit, offline merging and agent citations their evidence | `INFERENCE` |
| Outbox table with Debezium-compatible columns, plus CloudEvents envelopes and `.v1` schemas | Keeps the move from polling to CDC a configuration change | `FACT` [Debezium](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html) |
| Intel gets **no write grant**; proposals go only through the approvals API | Enforces D-007 in the database, not only in the prompt | `INFERENCE` |
| `SET LOCAL` tenant context, a non-owner role and `FORCE RLS` | Avoids silent bypasses through the table owner or the connection pooler | `FACT` [AWS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) |
| Our own UI uses only the public API | Makes "headless" free later | `INFERENCE` |
| Per-tenant export and erasure tool | Covers backup and restore, DPDP rights, and a future move to a silo | `INFERENCE` |
