# API

The contract is code. The zod schemas in [`packages/contracts/src/`](../packages/contracts/src/) generate two OpenAPI
documents, kept in the repository:

| Document | Covers | Size |
|---|---|---|
| [`packages/contracts/generated/openapi/public.json`](../packages/contracts/generated/openapi/public.json) | `/v1` and `/platform/v1` | 225 paths, 272 operations |
| [`packages/contracts/generated/openapi/internal.json`](../packages/contracts/generated/openapi/internal.json) | `/internal/intel/v1` | 21 paths |

The TypeScript client is [`packages/sdk`](../packages/sdk/) (`@munim/sdk`). intel's Pydantic models are generated from the
same schemas (`services/intel/munim_intel/contracts_gen/`). All data is synthetic, suppliers are simulated and payments are
recorded, never processed.

## Surfaces and authentication

| Surface | Who calls it | Credentials |
|---|---|---|
| `/v1` member routes | Staff and owners (most of the operations), including `/v1/graph/*` | `Authorization: Bearer <ID token>` and `X-Munim-Tenant: <tenant id>` |
| `/v1/storefront`, `/v1/account` | Customers and guests | `X-Munim-Storefront-Key`, plus `Authorization: Bearer <customer token>` (optional) or `X-Munim-Guest-Token` (one order) |
| `/v1/cares-network` | Anyone | None. Read-only and rate-limited per client address. |
| `/platform/v1` | Platform operators | `Authorization: Bearer <ID token>` of a row in `platform.operator` |
| `/internal/intel/v1` | intel only | `x-munim-service-secret` **and** `Authorization: Bearer <run token>` |
| `/health` | Anyone | None. Returns `{status, migration_version, idp}` or `503`. |

- The member's role and outlet scope come from `core.membership`, never from token claims. `GET /v1/me` returns them.
- A bad or missing token is `401`. A tenant, storefront key or profile that does not resolve is `404`, so a caller cannot
  learn that another tenant exists. On `/internal/…` a bad secret or token is `404` too.

## Commands

Every change is a command, `{command_id, idempotency_key, type, payload}`, with `type` a dotted name ending in `.v<N>`. The
tenant and the actor are not in the body: core takes them from the verified identity. The same idempotency key with the
same request returns the stored response byte for byte (`X-Munim-Replayed: true`); with a different request it is
`409 idempotency_conflict`. Prices and totals are re-derived on the server. More in
[`core-architecture.md`](./core-architecture.md#commands-events-and-drafts).

## The graph routes

Three reads, served only by a graph backend (in this build, FalkorDB). Each first brings the business's graph up to date
with the books, then runs the queries in [`cypher.md`](./cypher.md). Owner, manager and judge roles; staff are `403`. The
outlet scope is the membership's, whatever the request says. Every leaf of every response is a string, a boolean, `null` or a
list: **no number**. A count on screen is the length of a list here; a figure is a snapshot cell.

### `GET /v1/graph/ingredients/{id}`: what a price change of one ingredient touches

```json
{
  "ingredient": {"id": "…", "name": "Butter (synthetic)", "unit": "…"},
  "sources": [{"supplier_id": "…", "name": "Riverbank Dairy (simulated)", "simulated": true, "relation": "supplies"}],
  "dishes": [{"item_id": "…", "name": "Hazelnut Croissant", "recipe_id": "…",
              "outlets": [{"outlet_id": "…", "name": "Cobnut Hazratganj", "available": true}]}],
  "outlets": [{"outlet_id": "…", "name": "Cobnut Hazratganj"}],
  "findings": [{"finding_id": "…", "type": "…", "severity": "…", "impact_ref": "⟨snap:…⟩", "about_ids": ["…"]}],
  "drafts": [{"draft_id": "…", "command_type": "…", "about_ids": ["…"]}],
  "graph": {"projected_at": "…"}
}
```

`relation` is `supplies` or `quoted`. `recipe_id` is the recipe version the dish's margin row is costed from (`null` for a
shop item stocked as the ingredient). `outlets` is the distinct list. A finding's `impact_ref` is the snapshot cell its
impact is in, which the screen opens. `404` when the graph holds no such ingredient.

### `GET /v1/graph/suppliers/{id}`: what depends on one supplier

```json
{
  "supplier": {"supplier_id": "…", "name": "Riverbank Dairy (simulated)", "simulated": true},
  "ingredients": [{"ingredient_id": "…", "name": "Butter (synthetic)", "only_source": true,
                   "other_sources": [], "quoted_by": [{"supplier_id": "…", "name": "Steady Wholesale (simulated)", "simulated": true}],
                   "dishes": [{"item_id": "…", "name": "…", "outlets": [{"outlet_id": "…", "name": "…", "available": true}]}],
                   "outlets": [{"outlet_id": "…", "name": "…"}]}],
  "findings": [], "drafts": [],
  "graph": {"projected_at": "…"}
}
```

`only_source` is whether `other_sources` is empty. `quoted_by` lists simulated suppliers that quoted but do not supply.

### `GET /v1/graph/sole-sources`: ingredients on the menu with one supplier on record, or none

```json
{
  "ingredients": [{"ingredient_id": "…", "name": "Bread flour (synthetic)", "sources": []},
                  {"ingredient_id": "…", "name": "Butter (synthetic)", "sources": [{"supplier_id": "…", "name": "Riverbank Dairy (simulated)", "simulated": true}]}],
  "graph": {"projected_at": "…"}
}
```

### `POST /internal/intel/v1/graph:query`

intel's only way to the graph: `{template, args}` with one of `price_shock_path`, `dish_margin_drivers`,
`supplier_dependency`, `neighbourhood`, and only that template's id argument and, for a walk, `depth` 1 to 3. The tenant and
outlet scope come from the run token. Returns `{rows}`. Anything else, `claim_support` included, is `422 invalid_payload`.

## Errors

Every error body has one shape. `message` is chosen by core from a fixed table keyed by `code`; it is never an exception,
a database or graph server error, or model output.

```json
{ "error": { "code": "graph_unavailable", "message": "The graph isn't answering right now. Your books are fine; try again in a minute.", "reason_code": null } }
```

| HTTP | `code` |
|---|---|
| 400 | `bad_request` |
| 401 | `unauthenticated` |
| 403 | `forbidden`, `book_write_refused`, `override_refused`, `decision_refused`, `command_table_mismatch` |
| 404 | `not_found` |
| 409 | `conflict`, `country_locked`, `illegal_transition`, `customer_erased`, `period_closed`, `loyalty_refused`, `sequence_gap`, `investigation_refused`, `idempotency_conflict`, `already_decided`, `stale_draft`, `chart_incomplete` |
| 422 | `currency_mismatch`, `books_unbalanced`, `claim_quote_mismatch`, `out_of_pack_scope`, `command_type_mismatch`, `invalid_payload`, `unregistered_command_type`, `cannot_verify`, `execution_failed` |
| 429 | `unavailable` with `reason_code: rate_limited` |
| 500 | `internal` |
| 503 | `unavailable`, `graph_unavailable` (the graph database is not answering) |

The table is `STATUS` in [`services/core-api/src/lib/errors.ts`](../services/core-api/src/lib/errors.ts). `reason_code` is a
stable machine key; the full list is `REASON_CODES` in
[`packages/contracts/src/shared/reason-codes.ts`](../packages/contracts/src/shared/reason-codes.ts).
