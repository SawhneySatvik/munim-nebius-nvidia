# W1 fix list (inputs to the W1 wave test + review fix cycle)

Collected from W1 lane reports, 9–10 Oct 2026. Each item names its owner lane. The W1 adversarial review adds to
this list; fix cycles (≤ 2) work from it. Items marked ✔ are already handled.

| # | Owner | Item | Source |
|---|---|---|---|
| 1 | T-001 | `scripts/db-ping.mjs` → founder env names (session pooler) via `packages/config` | env adoption |
| 2 | T-002 | export `./registry`; declare `X-Munim-Tenant`, `X-Munim-Storefront-Key` headers in OpenAPI + SDK | T-004 |
| 3 | T-002 | `CommandResult.replayed` → response header (byte-identical replay) | T-005 |
| 4 | T-002 | TaxId → receipt-field explicit link (`receipt_field`) | T-003 |
| 5 | T-002 | approvals ROUTES; list/detail response schemas (decision, history, unverified_refs, has_more, next_cursor); stale body with `changes`; `already_decided` code | T-008 |
| 6 | T-002 | error envelope field is `message` (code wins over the brief's `message_key`) — doc note | T-004 |
| 7 | T-003 | SKU consumption: `sku` item consumes `stock_ingredient_id` 1:1 (`inventory.consume_sku`) | ruling 00:00 |
| 8 | T-003 | IN Sec 9(5) aggregator orders → record-only receipt, no GST tax-invoice heading | ruling 00:00 |
| 9 | T-004 | error map: MB008 `command_table_mismatch`, `IdempotencyConflict` 409, `CommandTypeMismatch` 422, approvals codes (`already_decided`, `stale_draft`, `invalid_payload`, `cannot_verify`, `execution_failed`) into `lib/errors.ts` | T-005, T-008 |
| 10 | T-004 | `test/world.ts` → m-1's `buildWorld` (MB008-correct) | T-006, T-008 |
| 11 | T-004 | `/health` version rule: highest applied, excluding `-- requires:` files skipped on this engine | T-004, T-008 |
| 12 | T-005 | `executeCommand` with an outer transaction: return outbox rows / publish after the OUTER commit (approvals currently relies on the sweeper) | T-008 |
| 13 | T-005 | `commit.test` red-proof premise now refused by MB008 — rewrite against a still-permitted path | T-006 |
| 14 | T-006 | fixtures → `buildWorld`; command names per 0007 | T-006 |
| 15 | T-007 | drop the exit-code workaround once the `@munim/db` harness fix lands; red-prove non-zero exit again | T-007 |
| 16 | T-008 | move module-local error codes to `lib/errors.ts` (with T-004); test handler registration must not collide with real W2 handlers | T-008 |
| 17 | m-1 | harness exit-code fix (priority); `target_tables` seeds complete; `buildWorld`; outbox `seq` + cursor indexes; `order.guest_access_hash`; storefront keys + `memberships_for_sub`; role bootstrap CLI; `draft.failure_reason` | routed riders |
| 18 | all intel-facing | **Run scoping ruling:** intel runs use the narrowest outlet scope the work needs; outlet-specific drafts come from outlet-scoped runs (so that outlet's manager can verify/approve under R40 C4); tenant-wide drafts are owner-only | T-008 escalation |
| 19 | T-040/M-C | one shared template runner + snapshot minter (approvals has a local one); cell typing convention; template SQL without trailing `;` | T-008 |
| 20 | contracts/D-2 | refs allowed only at numeric leaves — D-2's C2 ref on `valid_from` is a doc error | T-008 |
| 21 | m-1 | **Derivation source state:** `core.derivation_rule` gains a source-state predicate (e.g. supplier invoice must be `approved`, settlement import committed) checked by the guard — today it checks existence only | M-B scan |
| 22 | m-1 | Operational tables with money/qty columns written without the guard (`reconciliation_break`, `market_signal`, `viability_case`, `import_staging.amount_minor`, `import_run.control_total_minor`): restrict writes to their deriving rule / import path (context check), or tag book — decide per table and gate it | M-B scan |
| 23 | m-1 + W2 modules | 19 book tables with a `status` column lack a transition table/trigger (e.g. campaign `cancelled → queued`) — add transitions for each | M-B scan |
| 24 | m-1 | posting rules for refund, expense, payroll (P&L completeness, T-026) | M-B |
| 25 | T-006 | rewrite the "late commit" test for the commit-ordered `outbox.seq` (it now waits on the per-tenant lock by design) | M-B |
| 26 | T-004 | map MB008–MB014 in the error envelope | M-B |
| 27 | m-1 | stale comments in frozen 0001–0005 about old migration numbers — note in README (files are frozen) | M-B |

## From the W1 adversarial review — guarantee + security (verified by the orchestrator against 0007:110-175)

| # | Owner | Sev | Item | Required red-proof |
|---|---|---|---|---|
| 28 | m-1 | 1 | **F1 guard outlet scope** passes any row without an `outlet_id` column (0007 `row_outlet IS NULL`) and the decision branch checks no scope: derive each table's outlet (own `id` for `core.outlet`, parent's outlet for line tables, both ends for `transfer`, PO outlet set) and apply the scope check in the decision branch too | manager scoped to outlet 1 updating outlet 2's `upi_vpa` → MB001; a line-table case; decision branch case |
| 29 | m-1 | 1 | **F2 customer writes**: enforce `own` / `own_order` scopes in the guard (`NEW.customer_id` or parent order's customer = `app.customer_id`); customer contexts get no outlet wildcard and only customer-safe command types | customer tender on another's order → MB001; nulling another order's `customer_id` → MB001 |
| 30 | m-1 | 1 | **F3 per-column binding**: money columns of `core."order"` (and other priced rows) frozen after placement except under a pricing derivation/rule; `origin` never re-stamped by a non-pricing update | `kitchen.ticket.advance.v1` setting `total_minor` → refused |
| 31 | m-1 + T-004 | 1 | **F4 customer RLS**: own-row clause for `role='customer'` on every table a customer may reach; deny on all others (journal, member, audit, outbox, draft, finding, snapshot…); `contextOf` gives customers no outlet wildcard | customer count probe = own rows only; 0 on journal/member/audit |
| 32 | T-008 | 2 | **F5** tenant-wide drafts (`outlet_ids '{}'`) unapprovable even by owners — empty targets mean "needs `'*'`" | owner approves `{}` draft → 200; manager → 403 |
| 33 | T-006 | 2 | **F6** customer `ready` cursor leaks the tenant's newest outbox row — start customer cursors from their own topic rows / now() | customer cursor never references another aggregate |
| 34 | T-005 | 3 | **F7** event `data` not parsed against the registered per-type schema — enforce (no amounts/quantities) | event with a numeric leaf → throws |
| 35 | T-008 | 3 | **F8** `draft_id` missing from the approve request hash — key reuse across drafts returns a stale 200 | reused key on a second draft → 409 |
| 36 | T-004 | 3 | **F9** `.run` created 0755 — create with 0700 | mode assertion |
| 37 | m-1 + T-006 | 2 | **F10 ruling (orchestrator, stricter):** a member sees an intel run / trace only if their outlet scope covers the run's `outlet_scope`; `{*}` runs are owner/advisor-only | outlet-scoped staff on a `{*}` run's `trace:` → 404 |

## From the W1 adversarial review — cross-package correctness (spot-checked: #38, #39 confirmed in code)

| # | Owner | Sev | Item |
|---|---|---|---|
| 38 | b-2 + b-3 | 1 | Movement `ref_type` one form = `core.<table>` (DB form): core-domain `consumeOrder` + golden, contracts `MovementRecordedV1` regex |
| 39 | b-2 | 1 | `catalogue.item.upsert.v1`: `stock_ingredient_id` (required when `kind='sku'`), drop `tax_class` (it lives on `price`), `mrp_minor` + currency, variants / option groups / options / option ingredient deltas arrays |
| 40 | b-2 | 1 | `orders.place.v1`: `coupon_codes`, `loyalty_redeem_points`, `preview_total_minor` comparator; one shared coupon-code regex = DB's `^[A-Z0-9][A-Z0-9-]{2,31}$` |
| 41 | b-2 | 2 | Kitchen ticket states = DB set `queued|preparing|ready|done` (drop `accepted` from contracts; order-level accept stays on the order) |
| 42 | b-2 | 2 | Movement kinds `supplier_return` / `sale_return` in events |
| 43 | b-2 | 2 | Tender: `tendered_minor`/`change_minor` nullable for non-cash; `TenderView.at` (not `recorded_at`); card/UPI amount ≤ due (enforced in T-022) |
| 44 | b-3 | 2 | `evaluateAuthority`: handle `own` and `tenant` scopes, fail closed on any unknown scope |
| 45 | b-4 | 2 | Guest/first sign-in: core-api mints the customer id and puts it on the principal; never take `customer_id` from a payload (storefront, place, preview) |
| 46 | b-4 | 2 | Storefront resolver returns `(tenant_id, channel_id)`; storefront orders use the key's channel, never a payload channel |
| 47 | b-6 + b-4 + SDK | 2 | Guest order tracking path: `guest_access_hash` verification for `order:<id>` without a bearer; SDK stream supports a guest token and does not retry 401 forever |
| 48 | m-1 | 2 | `customers.account.link.v1` target_tables include `core."order"` (claim guest orders) |
| 49 | m-1 + W2 T-024 | 2 | C7 expired-sale override writable: manager-issued override bound to a cart line in a prior transaction, consumed at placement (`orders.place.v1` lists `core.expired_sale_override`); pack flag stays false |
| 50 | b-2 + b-3 | 2 | Recipe unit vs base unit: either unit conversion in core-domain or refuse the recipe at save (contract + handler); never a 500 at sale |
| 51 | b-6 | 2 | Stream cursor ordered by `outbox.seq` (drop the KNOWN LIMIT) |
| 52 | b-2 | 2 | `outlet_ids` may be empty (tenant-wide drafts) in `DraftsRequest` / `DraftView` |
| 53 | b-3 | 2 | `orderTax` takes discounts and option deltas; inclusive-pack discount semantics (gross) defined and tested |
| 54 | m-1 | 3 | Seed missing command types: `kitchen.ticket.accept.v1`→ drop (see #41) or seed, `orders.promise.push_back.v1`, `catalogue.availability.set.v1`, `demo.session.start.v1`, `kitchen.prep_time.set.v1`, `catalogue.deal.end.v1`; doc names `orders.void.v1`/`orders.refund.v1` → `*.record.v1` |
| 55 | b-3 + m-1 | 3 | Rule-id parity test: every `core.derivation_rule.rule_id` has a core-domain rule (or is DB-only and listed) |
| 56 | b-2 + b-3 | 3 | Pack refusals map to `ReasonCode`s (`buyer_identity_required`, `tax_id_missing`, `unknown_tax_class`, `unknown_channel`, `price_above_mrp`) |
| 57 | b-8 | 3 | Template param regex must ignore `:word` inside string literals |
| 58 | b-3 | 3 | `consumeOrder` takes `order.business_date` from the row, never recomputes |

## Orchestrator rulings on the reviewer's founder questions (product rules, no spend; reversible)

| # | Ruling | Owners |
|---|---|---|
| 59 | **Cash rounding** is pack data: AU `cash_rounding_minor: 5` (cash tenders only; rounding recorded on the tender as `rounding_minor`; shift expected cash uses the rounded amount); IN `cash_rounding_minor: 100` (round-off to ₹1, marked INFERENCE) | b-2 (pack + contract), b-3 (engine), m-1 (`tender.rounding_minor`) |
| 60 | **Business-day cutoff** per outlet (`business_day_cutoff`, default 04:00 local): business_date = local date of (now − cutoff); ticket numbers reset at the cutoff | m-1 (column + trigger), b-3 (tz), b-7 (jobs) |
| 61 | **MRP binding:** the sold batch's MRP when a batch is picked, else the item's MRP | b-3, W2 T-022/T-024 |
| 62 | **Multi-zone tenants:** outlet-level jobs run in each outlet's zone; the tenant brief runs at `tenant.home_tz` (default = first outlet's zone) | m-1 (`home_tz`), b-7 |

## From T-009 (integration)

| # | Owner | Item |
|---|---|---|
| 63 | b-4 | `Deps.publish` slot (+ run-token keys for internal routes) so routes reach the `PublishDeps` built in `server.ts` |
| 64 | b-5 | request-path event runs narrow `outlet_scope` from `data.outlet_id` (same as the worker path), then the worker returns to `createRowPublisher` |
| 65 | orchestrator | `make smoke` (tests/smoke) and `scripts/dev/smoke-redproof.sh` wired into `make check` — after the fix cycle |
| 66 | W2 T-020 | owns `/platform/v1/tenants:provision` route (smoke uses an operator-context DB write meanwhile) |
| 67 | orchestrator | hosted bring-up (`make dev-db`) only after W1 DB changes are frozen at the end of the fix cycle; founder resets the DB password first |

## From the W1 gates review + wave test run (Part A: every package green except core-api's 7 known reds)

| # | Owner | Sev | Item |
|---|---|---|---|
| 68 | b-1 | 1 | `make test`/`check` bail at the first failing package/target and hide every other lane's state — run all packages (`--no-bail`), run all check targets, print a per-package summary, exit non-zero if any failed (red-prove) |
| 69 | b-6 | 2 | one hung test poisons its file: `lock_timeout`/`statement_timeout` on test pools, cleanup via `onTestFinished`, fresh tenant per describe |
| 70 | b-7 | 2 | worker static write scan: recurse into subdirectories, catch multi-line and unqualified writes, planted red-proof |
| 71 | b-4 | 2 | `adapters/dev/idp-supabase`: typecheck script + tests with injected fetch (issuer/audience refusal, key rotation refetch, HS256 refused) |
| 72 | b-4 (+b-5, b-6, b-8 tests) | 2 | core-api gates import `createLocalIdp` from `adapters/dev/idp-local`, not T-009's `dev-root.ts` |
| 73 | b-4 | 3 | #15 also covers T-004's global-setup workaround — drop it now that the harness fix landed (red-prove) |
| 74 | b-1 | 3 | `test-db` must not require `.env` (embedded PG); pytest leg prints SKIPPED when no pyproject exists |
| 75 | b-3 | 3 | `tz.test` `local_to_instant` loop: assert the fixture count |
| 76 | b-4 | 3 | #11 health gate expected version from the hand-written `SKIPPED_HERE` in `db/tests/manifest.ts`; `afterAll` stops the private cluster on early failure |

## Fix cycle 2 queue (after m-1 lands the shopper-policy ruling)

| # | Owner | Item |
|---|---|---|
| 77 | b-4 | guest `contextOf`: `app.role='guest'` + `app.guest_access_hash`, NO `customer_id`; shoppers keep `outlet_ids '{}'` |
| 78 | b-6 | remove the shopper `'*'` read override once m-1's shopper policies land; judge counts like owner for `{*}` runs |
| 79 | b-4, b-5, b-6, b-8 | #72 test imports of `idp-local` once b-1's depcruise carve-out lands |
| 80 | W2 T-022/T-023 | every `order_event` is paired with an outbox event (shopper feeds wake on `munim_outbox`) — register the event types |
