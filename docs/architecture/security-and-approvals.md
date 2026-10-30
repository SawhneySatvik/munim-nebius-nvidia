# Security boundary and human approvals

Munim is designed so model output cannot directly change the books. The database and Core API enforce the boundary; prompts alone do not.

## Trust boundaries

1. **Browser to Core:** public API requests are authenticated; Core resolves tenant, member role and outlet scope from trusted identity and membership records.
2. **Core to Intelligence:** Core mints a short-lived signed run token. Tenant, actor and scope come from this token, not from model tool arguments.
3. **Intelligence to models:** the service sends only the scoped prompt/tool context needed for the task to the configured provider. Provider keys stay in server-side secrets.
4. **Untrusted supplier/document content:** extraction has no tools; tainted runs cannot propose changes.
5. **Proposal to committed command:** a human with suitable authority approves a draft. Core recomputes or checks its source snapshots and applies the action with an audit record in one transaction.

## Why model output is not trusted

Models may propose wording, classifications, extracted fields or a bounded negotiation action. Core validates evidence references, tenant ownership, numeric sourcing, output shape, authorization and current state. Unknown or mismatched evidence yields “Cannot verify.”

Intelligence has no database client, and its runtime role has no write grant on book tables. Database guards also reject writes that lack the approved command/decision context. This is defense in depth: even a malformed tool call or prompt cannot itself execute a business command.

## Draft lifecycle

```text
proposed → reviewed by named person → authority + snapshot recheck → command + audit commit
       ↘ rejected / stale / failed
```

The approval transaction rechecks the approver's authority against the final payload, checks the snapshots the proposal relied on, executes the command as the approver, and writes the decision/audit record. A changed base snapshot makes the draft stale rather than silently applying a decision against old facts.

## Tenant isolation and secret handling

RLS is forced on tenant-bearing tables; service roles do not own tables or bypass RLS. Context is set transaction-locally. Cross-tenant IDs return the same not-found response as absent records. Traces carry bounded labels/IDs, not raw model output, supplier text or credentials. Errors use fixed public messages with redacted internals.

Demo records are synthetic, suppliers and Cares recipients are simulated, and payments are recorded rather than processed. The demo environment is not a live merchant payment or supplier integration.

Implementation pointers: `docs/shared/security.md`, `db/migrations/0001_roles_schemas.sql`, `services/core-api/src/internal/intel/`, `services/core-api/src/`, `services/intel/munim_intel/runtime/`, `packages/core-domain/envelope/validator.ts`.
