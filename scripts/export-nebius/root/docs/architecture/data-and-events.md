# Data model, tenancy and events

PostgreSQL is Munim's system of record. The schema separates operational/business records from evidence, intelligence workflow state and platform configuration. Supabase can host the PostgreSQL database and related auth/storage integrations, but the application data model and access controls are defined in this repository's SQL migrations.

## Schema responsibilities

| Schema | Responsibility |
|---|---|
| `core` | Tenants, outlets, members, orders, catalogue, inventory, suppliers, finance, people, customer records, drafts, decisions, audit log and outbox. |
| `platform` | Country packs, plans, model roles, AI budgets, operators and reviewed configuration drafts. |
| `intel` | Runs, findings, investigations, trace events, graph edges and provider spend. |
| `evidence` | Stored source documents and their extracted/source-reference data. |
| `intel_ro` | Read-only views exposed to the dedicated read-only database role; application Intelligence currently obtains snapshots through Core rather than connecting directly. |

Migrations in `db/migrations/` are the source of truth for columns, keys, indexes, triggers and grants. `docs/plan/02-schema.md` is a broad design/reference document and may describe planned or superseded areas; verify exact current tables from the migrations before using it as an operational inventory.

## Key invariants

- Tenant and outlet IDs are carried on business records and enforced with row-level security policies.
- Money uses integer minor units and currency. Timestamps use `timestamptz` with business time zones from country-pack configuration.
- Orders derive prices and totals on the server. Client totals are not trusted.
- Journal postings balance per currency. Inventory on-hand is derived from stock movements rather than overwritten balances.
- Audit entries are appended with a per-tenant hash chain; command and approval state changes are transactional.
- Book-table writes pass an explicit command/approved-decision context or an allow-listed deterministic derivation.

## Command and event transaction

A command has a stable ID and idempotency key. Core checks tenant identity, authority, expected state and payload, runs the change in a transaction, appends the audit entry, and inserts a CloudEvents-style row into `core.outbox` in that same transaction. Repeating an idempotency key with the same request returns the stored result; reusing it with a different request conflicts.

After commit, Core publishes the event to Intelligence. A worker retries rows left unpublished. Intelligence claims event IDs once, so at-least-once delivery does not repeat work. Notifications carry IDs only; clients and workers re-read under their own authorization context. PostgreSQL `LISTEN/NOTIFY` wakes streams, while clients resume server-sent event feeds with a cursor.

## Snapshots and evidence

Intelligence does not issue arbitrary SQL. It asks Core to execute a registered read template in the active tenant/outlet scope and receives a bounded snapshot digest. Every number displayed by an AI answer is resolved from that snapshot. Document citations identify source spans; graph handles identify nodes/edges. This keeps source identity explicit from data access through the UI.

## Graph storage

The supply graph connects suppliers, ingredients, recipes/dishes and outlets to answer impact questions such as which menu items are exposed to a price change. Graph access is behind a graph port; the in-tree PostgreSQL implementation uses relational edge storage and recursive queries. FalkorDB is an optional adapter, not a required production dependency in the default profile. The video/demo should name the backend actually enabled in the target deployment.

Implementation pointers: `db/migrations/`, `packages/contracts/generated/ontology.json`, `services/core-api/src/`, `services/core-worker/`, `services/intel/munim_intel/graph/`, `services/core-api/src/internal/graph/`.
