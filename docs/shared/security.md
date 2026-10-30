# Security

This page states the threat model and where each defence lives in the code. Every defence named here has a test; the
tests are listed in each repository's `docs/testing.md`.

## What is protected

1. **The books.** Nothing changes them without a named person's approval (the One Guarantee).
2. **Tenant isolation.** One business must never read or write another's rows, or learn that another exists.
3. **Truthful numbers.** A number a person reads comes from a snapshot cell, not from model text.
4. **Secrets.** Keys, passwords and tokens never reach a log, a trace, an error or a repository.

## Who can act

| Actor | Identity | What it can reach |
|---|---|---|
| Staff and owners | An identity-provider ID token plus `X-Munim-Tenant` | `/v1`, as the role and outlets stored in `core.membership`. Roles never come from token claims. |
| Customers | A storefront key, plus an optional customer token | Their own orders and profile on `/v1/storefront` and `/v1/account`. |
| Guests | A storefront key plus a guest token for one order | That order only, read-only. The token is returned once and only its SHA-256 is stored. |
| Operators | An identity-provider token for a row in `platform.operator` | `/platform/v1` only. |
| intel | A shared service secret and a run token | `/internal/intel/v1`, for the tenant and outlets named in the token. |
| Anonymous | Nothing | `/health`, and the credential-free public Cares reads. |

Tokens are verified against the provider's published keys. Only RS256, ES256 and EdDSA are accepted; `alg: none` and
shared-secret algorithms are refused before any key lookup.

## Controls

### The books cannot be changed by the AI

- intel has no database client (an import-linter contract forbids one, and also forbids `litellm`).
- The database role that serves intel's routes and the worker, `munim_svc`, has no insert or update grant on any of the
  105 book tables. A write fails with `42501` before any trigger runs.
- A fourth login role, `munim_intel_ro`, can read only the `intel_ro` views. The tests assert that it is refused insert,
  update, delete and truncate on every one of the 170 tables, and can execute no function in the application schemas.
  No service connects as it today; it exists so the "intel cannot write" claim is a grant fact that can fail a test.
- Book writes also pass the trigger described in `architecture.md`: a person's own command, an approved decision or an
  allow-listed derivation. There is no bypass for any role, including the migration owner.

### Tenant isolation

- Row-level security is enabled and forced on every table with a `tenant_id`; the runtime roles own no tables and cannot
  bypass it. Outlet-scoped tables add an outlet policy, and child rows follow their parent.
- Context comes from `SET LOCAL` inside the transaction, never a session-level `SET`.
- A missing context returns zero rows, not an error.
- A request for another tenant's id, or a bad storefront key, answers `404`, the same as "does not exist".

### Identity between services

- Run tokens are Ed25519, minted only by core, and carry the tenant. The shared service secret is compared in constant
  time. Internal routes need both.
- NOTIFY payloads are ids only. A stream re-reads under the subscriber's own row-level security.

### Untrusted text

- Supplier replies, uploaded documents and reviews are read only by a tool-less extractor. A run that has read untrusted
  text can no longer propose a draft.
- The web app has no raw-HTML rendering (`dangerouslySetInnerHTML` appears nowhere under `apps/web`), so text from a model or a user renders as text.

### Errors, traces, logs

- An error body is `{error: {code, message, reason_code}}` where `message` comes from a fixed table keyed by `code`.
  SQL, driver and model text are logged redacted and never returned.
- Trace payloads are labels: snake_case keys and strings of at most 200 characters, enforced by a database check.
- The config module redacts every registered secret from errors and logs. Gates never read an environment file.

### Edge

- Request bodies are capped (256 KiB by default, 8 MiB for document upload, 16 MiB for intel's batches).
- CORS is an exact-origin allow-list for the public browser routes only (`/v1/storefront`, `/v1/stream`,
  `/v1/cares-network`). Credentials are headers, never cookies, so no credentialed wildcard exists.
- The credential-free Cares routes are rate-limited per client address (60 a minute, per instance).
- The web app sets `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and
  `Permissions-Policy` on every response (`apps/web/next.config.ts`, checked by `apps/web/scripts/csp-check.ts`).
- Customer erasure (`POST /v1/account:erase`) anonymises a profile and is final.

### Demo protection

On a business marked as a demo, once it is onboarded, core refuses the few commands that would break the demo for the
next visitor: revoking a storefront key, inviting, re-roling or deactivating a member, changing the monthly AI cap, and
publishing a storefront page. The refusal is `403 forbidden` with reason `demo_protected`
(`services/core-api/src/lib/demo-guard.ts`). Every other action works and is audited under the person chosen.

## Not defended

- Core's rate limiter is per instance. N instances admit N times the limit.
- Draft, finding and investigation streams have no commit-ordered column. A change that commits while a client is
  disconnected and behind its cursor, or in a transaction open longer than the look-back, is not replayed.
- Tax rules in a country pack are data with `_unverified` markers where the source was secondary. They are not legal
  advice.
