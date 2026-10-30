# Core architecture

This page describes the parts of Munim that do not depend on where it is hosted. The runtime contract is the code: the
SQL migrations in `db/migrations/` and the zod schemas in `packages/contracts/`. This page explains them.

## Processes

| Process | Code | Job |
|---|---|---|
| Web app | `apps/web` | Storefront and staff screens. Calls the API only through `packages/sdk`, on its own origin. |
| core-api | `services/core-api` | The system of record and the only writer of Postgres. Public `/v1`, internal `/internal/intel/v1`, operator `/platform/v1`, server-sent events on `/v1/stream`. |
| core-worker | `services/core-worker` | One long-running process: outbox sweep every minute, watch fan-out every 15 minutes, each tenant's daily brief at 06:00 local time, import parsing, Auto investigation steps. |
| intel | `services/intel` | Python, Google ADK. The Manager and eight specialists. No database client. |
| suppliers-sim | `services/suppliers-sim` | Three simulated supplier agents over A2A. |
| Postgres | `db/migrations` | One database, four application schemas (`core`, `evidence`, `intel`, `platform`) and a read-only view schema (`intel_ro`). |

Shared code: `packages/contracts` (zod schemas, from which the OpenAPI documents, JSON Schema and intel's Pydantic
models are generated), `packages/core-domain` (framework-free domain logic), `packages/config` (the one config module,
which redacts secrets from errors and logs), `packages/sdk` (the TypeScript client).

Import boundaries are checked in CI-style gates: dependency-cruiser (`.dependency-cruiser.cjs`) for TypeScript and
import-linter (`pyproject.toml`) for Python. The web app imports only the SDK and contracts; core-api modules import each
other only through their `index.ts`; intel imports no other service and no database driver.

## Tenancy and row-level security

Every tenant table carries `tenant_id` first in its keys and has row-level security that is both enabled and forced.
A transaction states who it acts for with `SET LOCAL app.*` settings (tenant, outlets, role, member, command type,
decision, and a few more). The settings are transaction-local, so a pooled connection cannot leak them to the next
request. The tenant comes only from a verified identity or a verified run token, never from a request body and never
from a model.

The runtime database roles are `NOSUPERUSER NOBYPASSRLS` and own no tables. One `NOLOGIN` role with `BYPASSRLS` owns the
few objects that must cross tenants (for example the outbox claim, the active-tenant list, the storefront-key lookup
and the public Cares reads). `CROSSTENANT_OBJECTS` in `db/tests/manifest.ts` lists them, and the database tests assert
exactly that list.

## The book guard

Every `core` table is tagged `munim:book` or `munim:operational` in a table comment. Book tables are the records the
guarantee protects. A trigger, `core.guard_book_write()`, runs before every insert or update on a book table and admits
the change only in one of three cases, stamping the row's `origin` with the reason:

1. **A person's own command.** `core.command_authority` lists the command type, the roles allowed to issue it, its
   scope (tenant, outlet or the person's own order) and the book tables it may write. The writer must hold one of those
   roles and cover the row's outlet.
2. **An approved decision.** `app.decision_id` names a decision whose draft is executing in this very transaction, and
   the draft's command type lists the table.
3. **An allow-listed derivation** of an approved row, such as consuming stock for an order or posting a journal entry,
   named in `core.derivation_rule` and bound by `app.posting_rule` and `app.source_ref`.

Anything else raises `MB001 book_write_refused`. A command that tries a table it is not bound to raises
`MB008 command_table_mismatch`. Core's service role, which runs internal routes and the worker, has no insert or update
grant on any book table, so a service write fails with `42501` before the trigger even runs.

Books are append-only. No runtime role has `DELETE` or `TRUNCATE` on any table. A correction is a reversal or a void
with a reason and an actor. Every command, and every approved draft, writes an entry to `core.audit_log` in the same transaction. The log is a
per-tenant hash chain with a gapless sequence. Journal entries must balance per currency at commit (`MB010 books_unbalanced`).

## Commands, events and drafts

- **Command.** The wire form is `{command_id, idempotency_key, type, payload}`, typed `<module>.<verb>.v<N>`. Tenant and
  actor are not in the body; Core takes them from the verified identity. The same key with the same request returns the
  stored result byte for byte (with `X-Munim-Replayed: true`); the same key with a different request is `409`.
- **Event.** A CloudEvents envelope typed `munim.<module>.<entity>.<verb>.v<N>`, written to `core.outbox` inside the
  command's own transaction. After commit the same request publishes it to intel; the worker re-sends anything left
  unpublished. Delivery is at least once and intel claims each event id once.
- **Draft.** A proposed command with its evidence refs and the snapshots it is based on. Approval is a conditional status
  update, so exactly one decider wins. It re-checks the approver's authority on the final payload, re-runs every
  snapshot the draft is based on (a changed number marks the draft stale), executes the command as the approver, and
  writes the audit entry, all in one transaction. A rejected draft's fingerprint blocks the same proposal for 30 days.
- **Imports are drafts too.** Upload, preview (rows, totals, quarantined lines), approval, then commit under the
  approver. A column mapping is renames and units only, with no arithmetic.

Order status changes go through `core.order_status_transition` and are conditional on the current status. Prices and
totals are re-derived on the server for every order; a client-sent total is ignored.

## Live updates

Triggers on `core.outbox`, `core.draft`, `intel.finding`, `core.investigation` and `intel.trace_event` issue `NOTIFY`
with ids only (`munim_outbox`, `munim_inbox`, `munim_trace`). core-api holds one `LISTEN` connection per process. A wake-up carries no
data: each connected stream re-reads under its own subscriber's row-level security, so a forged notification delivers at
most what that subscriber could already read. `GET /v1/stream?topics=kds:<outlet>,inbox:<tenant>,trace:<run>,order:<id>`
serves them as server-sent events with a resumable cursor in `Last-Event-ID`. Clients use fetch-based SSE so the bearer
token travels in a header.

## Country packs

Nothing in a code path branches on the country. A pack is a versioned JSON document (`packages/contracts/packs/IN.json`
and `AU.json`, seeded into `platform.country_pack`) with the currency, time zones, financial-year start, tax classes and
rounding, tax identifiers, invoice rules, aggregator formats, payroll scope, licence kinds, cash rounding, the
detectors it enables and a chart of accounts. A business's country, currency and financial year are fixed after
onboarding (`MB002`, `MB003`). Money is stored as integer minor units with a currency. Time is `timestamptz` with IANA
zones from the pack, through one tz module.

## Failure modes

| Failure | Behaviour |
|---|---|
| intel is down | AI panels hide. The inbox and approvals still work, because approval needs only core-api. |
| A model call fails or the budget is spent | The recorded answer for that exact call if one exists, else template text with refs. |
| An answer fails validation | The reason code is stored and the screen shows "Cannot verify". |
| Publishing after commit fails | The outbox row stays unpublished; the worker resends it. A row that can never be delivered is dead-lettered after five attempts. |
| Duplicate delivery | intel's event claim answers `409`; no work repeats. |
| A stale draft | A snapshot it relied on changed; it is marked stale and shows what changed. |
| The stream drops | The client reconnects with `Last-Event-ID`. |
