# W2 fix list (inputs to the W2 integration, wave test and review fix cycles)

Collected from the 14 W2 lane reports, 10 Oct 2026 (checkpoint commits d2ea7ff…a285dfa, "lane build, pre-review").
Quiet-tree `make check` at the checkpoint: lint ✅ typecheck ✅ smoke ✅ smoke-redproof ✅ · boundaries ❌ (2) ·
test ❌ (core-api 500 ✓ / 11 ✗ approvals fixtures; contracts 151 ✓ / 5 ✗ draftables) · boundaries-redproof ❌ (baseline).
Items marked ✔ are handled. The W2 adversarial review appends to this list.

## Rulings (orchestrator, 10 Oct — founder told "unless you say otherwise"; recorded in DECISIONS)

| # | Ruling |
|---|---|
| W2-R1 | **Version take-over.** A new price/recipe version whose `valid_from` falls inside the key's open-ended row closes that row at the new start (audited before/after). Every other overlap stays refused (409 / draft `failed`). |
| W2-R2 | **Guests do not cancel/reschedule online** (guest scope stays write-free); they get a clean refusal code `guest_cannot_change` with copy "Call the outlet to change this order". Signed-in customers can. |
| W2-R3 | **Refund authority per role.** `orders.refund.record.v1` allows staff, manager, owner, judge; caps per role live in `command_authority` (staff lowest, seeded; manager higher; owner uncapped). `evaluateAuthority` reads the per-role cap. |
| W2-R4 | **Loyalty policy per tenant.** `core.business_policy` gains `loyalty_earn_per_minor` (default 1000 = 1 point per ₹10 / A$10) and `loyalty_point_value_minor` (default 10). Customers module reads it; no constant. |
| W2-R5 | **Finance policies** (defaults, documented in packs/finance.md): purchases method for COGS (GRN → COGS vs GRNI); refund tax pro rata to the order; expenses paid from bank; the five structural accounts (1110, 1250, 2050, 4900, 6900) move into `IN.json`/`AU.json` charts. |
| W2-R6 | **Cancelled/rejected orders restore stock** via a seeded reversal rule (`inventory.reverse_order_consumption`, source state cancelled/rejected); consumption stays at placement (T-024 recommendation, adopted by T-022). |
| W2-R7 | **Storefront change windows:** cancel ≤ `cancel_window_min` (5) and reschedule ≤ `reschedule_window_min` (30) minutes after `created_at`, only while the order is `placed`. Overnight hours: not in v1 (documented). |
| W2-R8 | **P&L / GST templates** stay `min_role = owner` for now: `snapshot_template.min_role` is a staff<manager<owner ladder with no `advisor` value (0003 CHECK). Advisor read access to finance templates is decided in W3 M-C with the template runner's role model (advisors are read-only finance users per R27). |
| W2-R10 | **Loyalty on refunds:** a refund reverses the order's earned points in full when the order becomes fully refunded (cumulative refunds = paid); a partial refund keeps them (0011 allows one reversal per earn; 0016 refund path). |
| W2-R9 | **Kitchen never writes `core.order`.** Order status moves go through `orders.advanceOrder` (one place for completion derivations + #80 outbox pairing). |

## Batch A — migrator (`0015_w2_fix.sql`; db/** only)

| # | Sev | Item | Source |
|---|---|---|---|
| A1 | 1 | **Draft-only commands enforced by the DB.** First find how a direct `customers.campaign.create.v1` own command is already refused with MB001 (T-028 proved it) and reuse that mechanism — do not invent a second one. Apply it to exactly: `imports.run.commit.v1`, `finance.journal.adjust.v1`, plus any other command whose pack/ledger text says draft-only (list them in the report). Red-prove an own-command attempt for each → MB001, paired with the approved-draft accept. | T-026, T-030 |
| A2 | 1 | `finance.post_settlement` source_state requires `import_run_id IS NOT NULL` and the run `committed`. Red-prove a NULL-run settlement → refused. | T-026 |
| A3 | 1 | **Outlet RLS** on `core.licence, asset, checklist, amc, maintenance, goal, task` (outlet rows visible to members scoped to that outlet; `outlet_id IS NULL` rows tenant-wide). Isolation gate over each. | T-029 |
| A4 | 2 | Seed `command_authority`: `tenancy.onboard.v1` (owner, tenant scope, targets = `tenancy.provision.v1` incl. `core.account`), `tenancy.member.bind.v1` (all member roles, outlet scope, `core.member`), `tenancy.member.role.set.v1` + `tenancy.member.deactivate.v1` (owner), `purchasing.grn.receive.v1` (owner/manager/staff/judge, outlet; `goods_received, grn_line, batch, purchase_order`), `storefront.order.cancel.v1` + `storefront.order.reschedule.v1` (customer, own_order; `order, order_event` + customer targets), an orders status command `orders.order.advance.v1` (owner/manager/staff/judge, outlet; `order, order_event`) and `orders.order.accept.v1` / `orders.order.reject.v1` (#41), `people.payroll_draft.status.v1` (owner; paid_externally/void). | T-020, T-022, T-023, T-025, T-027, T-032 |
| A5 | 2 | W2-R3 refund caps per role (shape + seed); staff in `allowed_roles`. | T-022 |
| A6 | 2 | Derivation rules: W2-R6 stock reversal; `customers.loyalty_reverse` admits refunds of completed orders (or a new `customers.loyalty_reverse_refund`); finance reversals for supplier invoice approved→disputed/void and payroll approved→void (and the `reverses_id` unique index must not block a re-post after reversal); `finance.post_advance`; `inventory.transfer_in` may write `core.batch` (expiry carried); `core.transfer` receivable by a manager scoped to the destination outlet only. | T-022, T-024, T-026, T-027, T-028 |
| A7 | 2 | `imports.run.commit.v1` may write `core.order` + `core.tender` for POS-export imports (order triggers admit an imported `completed` order with no device, origin = decision); `core.import_run.failure_reason`; `core.expense.import_run_id` + unique `(tenant_id, external_ref)`. | T-030 |
| A8 | 2 | Grants: UPDATE on `core.order_line (unit_price_minor, line_discount_minor, tax_minor)` under `orders.reprice` (push-back + reschedule keep lines = header); UPDATE `core.coupon (requires_customer, min_spend_minor, outlet_ids)`; erasure `customer_target_tables` += `reservation, bulk_order, order_line` (note fields; placeholders where NOT NULL); `purchasing.invoice.dispute.v1` may set `supplier_invoice.status = disputed`; a void may write `order_event` and move status. | T-021, T-022, T-032, T-035, T-025 |
| A9 | 2 | Columns/indexes: W2-R4 loyalty policy; partial unique `loyalty_entry (tenant_id, order_id) WHERE kind='earn'`; unique `reconciliation_break (settlement_line_id, kind)`; `prep_list_line.done_at`; `option_ingredient_delta.active`; `tender.shift_id`; `core.customer.merged_into`. | T-021, T-022, T-023, T-026, T-028, T-035 |
| A10 | 2 | Definer `core.customer_claim_verified_email_guests()` exactly per the T-035 spec (no args; caller's own verified row; moves orders/reservations/bulk orders; marks guest `merged_into`; leaves loyalty rows; EXECUTE to `munim_core` only; revoke PUBLIC). | T-035 |
| A11 | 3 | Seed `platform.model_role` defaults (non-2.5 Gemini ids from the R36 table); an operator-level snapshot template `platform.spend_by_tenant`. | T-031 |
| A12 | 3 | buildWorld: full pack chart via the same rows `seedChart` writes (or call it), world period close moved so October fixtures post; deal rule with `kind`/`item_ids`; AU price on an AU tax class. | T-021, T-030, T-022 |

## Batch B — integration, independent of Batch A (i-1 Opus: B1–B7 · i-2 Sonnet: B8–B15)

| # | Owner | Sev | Item | Source |
|---|---|---|---|---|
| B1 | i-1 | 1 | Register the 7 `munim.orders.*` event schemas in `contracts/src/events/index.ts` + `MANIFEST.d/events.txt` + `test/samples/events.ts`; remove the `vi.mock` from the orders tests. Without it every status/tender/void/refund/shift write is a 500 in the running app. | T-022 |
| B2 | i-1 | 1 | W2-R9: kitchen `advanceHandler` calls `orders.advanceOrder` **inline** (no nested `executeCommand`; the active command stays `kitchen.ticket.advance.v1`, whose `target_tables` must keep `core.order` + `core.order_event` or MB008 fires); completion via kitchen derives loyalty earn + sale posting + paired outbox event; red-prove. `orders.order.advance.v1` (A4) is the POS route's command, not this path. | T-022, T-023 |
| B3 | i-1 | 2 | Worker: wire `importParseJob` into the worker's job loop; Blob store into `Deps`. Platform pool (`munim_platform`) into `Pools`/`server.ts`. `AccountMissing` → `ApiError` (no 500). | T-030, T-031, T-026 |
| B4 | i-1 | 2 | Storefront against the **real** `placeOrder`/`previewOrder`/`itemsForSale`/`ensureProfile` (no fakes in the default path); re-prove its 7 refusals end to end; `line_id` contract break absorbed; W2-R2 guest refusal code. | T-032, T-022 |
| B5 | i-1 | 2 | Orders: consume the guest hash from storefront; cancel-time reversals (loyalty, coupon use, stock per W2-R6) wired once A lands. | T-022, T-032 |
| B6 | i-1 | 2 | People payroll + purchasing GRN/invoice + finance seams: confirm the real `postFor` path in each (the lane fakes are test-only). | T-025, T-027 |
| B7 | i-1 | 3 | core-domain `rules.ts`: merge `RULES` from `core-domain/finance`; drop the 8 `finance.post_*` + `finance.reconcile_settlement` from `NOT_IN_CORE_DOMAIN_YET`. | T-026 |
| B8 | i-2 | 2 | `approvals.test.ts` fixture patch (T-021 §4: `restaurant_5`, swiggy/zomato channels, 2026-11-01) + the "free draftable" registry test against a still-undraftable type. | T-021 |
| B9 | i-2 | 2 | `contracts/test/draftables.test.ts`: assert the full W1+W2 draftable set from MANIFEST, use a non-draftable example. | T-002 |
| B10 | i-2 | 2 | Boundaries: goals + compliance register draft handlers via the catalogue global-flag pattern (no `approvals/handlers.ts` import). | T-029 |
| B11 | i-2 | 1 | Supplier return unit conversion (kg↔g, l↔ml; refuse other pairs) — 1000× on-hand error today. | T-024 |
| B12 | i-2 | 2 | **SDK coverage (R43):** every W2 route is in its module's contracts `ROUTES` with request + response schemas (tenancy onboarding / me/tenants / members:bind, compliance, goals, people, customers, kitchen, …). Gate: every mounted `/v1` route in core-api has an OpenAPI operation (route table diff, red-proven). | T-020, T-029 |
| B13 | i-2 | 2 | Reason codes + messages in contracts / `lib/errors.ts`: `not_applicable`, `item_unavailable`, `reason_required`, `deal_changed`, `duplicate_invoice`, `guest_cannot_change`, storefront refusal codes; `GUEST_TOKEN_HEADER` into contracts; `Identity.email_verified` on the IdP port (idp-local reads the claim; Supabase adapter maps `email_confirmed_at`). | T-023, T-021, T-030, T-032, T-035 |
| B16 | i-2 | 1 | **Member bind requires a verified email** (T-020 trusts the token's email claim): an unverified identity whose email matches a pending invite must be refused (no bind); red-prove. | T-020 review |
| B17 | i-1 | 1 | **Money flake:** T-022 saw a placed total 1214 vs 1216 once. Run the place suite ≥ 20× on a quiet tree and ≥ 5× under parallel load; trace deal → coupon → tax rounding order (inclusive + exclusive) for any input-order or concurrency dependence; fix or prove deterministic. | T-022 |
| B14 | i-2 | 2 | Accounts export complete: + `order_event`, `tender`, `refund`, `coupon_use`, `void`, `sale_return` rows of that customer. | T-035 |
| B15 | i-2 | 3 | Packs: W2-R5 structural accounts into IN/AU charts (finance resolves roles by code list, unchanged); W2-R8 template min_role. | T-026 |

## After A + B — wired to the new schema (T-034 lane), then worldgen (T-033)

| # | Item |
|---|---|
| C1 | Remove every test-only `command_authority` shim (tenancy, purchasing, storefront) — the seeded rows must carry the gates. |
| C2 | Tenancy member role set / deactivate routes; payroll status route; orders status / accept / reject routes; storefront cancel/reschedule on the seeded commands; POS-export import commit; loyalty policy read; email merge live (T-035 gate un-skipped). |
| C3 | T-034 integration suite: order → consumption → postings → loyalty; PO → GRN → invoice → payable → posting; import → settlement → break; onboarding → first sale (through `/v1/onboarding`); storefront guest + signed-in checkout → kitchen → completion; cancel → reversals. Hand-computed values; each flow fails if any derivation is disabled (planted). |
| C4 | T-033 worldgen: 4 synthetic worlds (restaurant group 3 outlets, cloud kitchen, store, AU café), ~6 months, planted problems with a hand-kept answer key; seeded only through commands/derivations (no raw inserts into books). |

## Deferred to W3 (M-C snapshot templates — requested by W2 lanes)
people.labour_vs_demand, overtime_drift, labour_pct, attendance_coverage, advances_open, payroll_lines · customers.consented_audience,
coupon_leakage, coupon_daily, staff_coupon_use, churn_segments, review_trend, coupon_current · compliance.licence_calendar,
log_coverage, temp_excursions, asset_costs, energy_per_order, goals progress · kitchen.prep_need, ticket_times, ticket_drift,
remakes_overprep, ticket_coverage · purchasing.invoice_vs_po, invoice_duplicates, price_creep · inventory.below_reorder, shortfall,
on_hand, count_variance · finance.unapproved_deductions, settlement_vs_orders, missing_payouts, tender_vs_bank, close_status,
shift_tenders (+ installed: pnl, gst_check, gst_summary) · orders.today, open tables · imports.run_preview.

## Not in v1 (recorded, not built)
Overnight opening hours; per-tenant feature flags and plan assignment (platform); tenant retire; stale config drafts (`based_on`);
debit-note table; printable dispute claim; promo-share breaks; `reconcile_order` / `reconcile_bank`; module events beyond orders/kitchen.

## From T-034 / T-033 (resume, 10 Oct afternoon) — open, routed to the W2 fix cycles unless noted

| # | Sev | Item | Source |
|---|---|---|---|
| D1 | 2 | Backfill a default `core.business_policy` row for tenants without one (migrator; hosted DB has none yet) | T-034 |
| D2 | 2 | `purchasing.invoice.dispute.v1` may move `core.payable` to `disputed` (today stays `open`) | T-034 |
| D3 | 2 | A cashier can attach a known customer to a counter order (`orders.place.v1` contract gap) — loyalty on counter sales | T-034, T-033 |
| D4 | 2 | POS-export parse quarantines guesses: unknown `order_type`, unknown `payment_mode` (else 1110 never clears), bill numbers repeating across outlets (UNIQUE collision fails the whole approval) | T-034 |
| D5 | 3 | Consumption honours `option_ingredient_delta.active` | T-034 |
| D6 | 3 | Push-back/reschedule re-judge of a line whose item later gained variants → 409 today; decide | T-034 |
| D7 | 3 | Void-payroll advance reversals as book rows (today a read-side exclusion) | T-034 |
| D8 | W3 | **Dated history for worldgen/intel:** `placed_at`/`business_date` (historical-entry command or approved-import path) for orders, waste, void, refund, tender, shift, count; `pos_export` with lines/channel/brand; read routes for shifts, settlement lines, waste, attendance, advances; imports runs cursor + kind filter. Without them all plants sit in the last 14 days and long-window detectors (N1) may not fire | T-033 |
| D9 | founder | Dev IdP selector (`MUNIM_IDP=local`, dev-only) so `make seed` runs without real Supabase sign-ins — auth-flow change → founder | T-033 |
| D10 | 3 | Worldgen pack plants not yet planted (C1–C3, C5–C6, K*, P2, P4–P7, G1, G4–G6, F5–F8, A4, A7, A8, I7–I9, FC*, M*) — most need D8 | T-033 |

## W2 adversarial review (HEAD dbe80ec) — fix cycle 1 routing

Reviewers: R1 guarantee/security (Opus, 0 blocker · 5 major · 13 minor), R2 money/stock (Opus, ran 13 failing probes:
`scratchpad/r2/int.test.ts` asserts the correct values — flip to green as red-proofs; `pure.test.ts` asserts current
wrong values), R3 contracts/SDK/gates (Sonnet, 8 major · 12 minor). Orchestrator spot-checked R2 S1-1 and S1-3 in code.
Codes: R1-M#, R1-m#, R2-S#-#, R3-M#, R3-m#.

| Lane | Model | Items |
|---|---|---|
| **m-4** migrator (0016) | Opus | order_event `seq` (per order, monotonic) for R3-M1; posting rule for a loyalty redemption (R2-S1-4: clears 1110 by the redeemed value — debit a loyalty liability/discount account per pack) and the pack account; tighten `customers.loyalty_reverse` (refund path only per refunded order, once) (R1-m5); `finance.reconcile_settlement`/`reconcile_bank` require a committed run (R1-m5); `order_line_pricing_frozen` checks the reprice source state (R1-m5); guest token hash cleared on claim (R1-m5); D1 business_policy backfill; D2 dispute may move `core.payable`; merge moves `coupon_use.customer_id` (R1-m4); unit-cost precision for per-base-unit cost (R2-S2-8: cost per 1000 base units, or a scale column — migrator decides with the inventory owner's shape); erasure DB support per R1-M1 if any column/target is missing |
| **f-1** orders · storefront · kitchen | Opus | R2-S1-1 (reschedule must merge, not replace, `pricing_snapshot`: keep loyalty/picks/coupons/pack/judged_at — and loyalty value must trace to `core.loyalty_entry`); R2-S1-2 + R1-M2 (audit every `order_line` re-price row with before/after; `expired_sale_override` use audited); R2-S1-3 (refuse cancel/reject while unrefunded tenders exist — the POS refunds first); R2-S2-1 (re-price excludes the order's own coupon use); R2-S2-2 (push-back passes customer_id); R2-S2-3 (coupon order fixed at placement and reused); R2-S2-5 (void rules: no whole-order void after line voids beyond total; whole-order void moves status per 0015); R2-S2-6 (push-back/reschedule refused once tendered, or re-price capped — choose refuse); R2-S3-1 (tiny cash remainder → clean refusal, not 500); R2-S3-3 recipe stamp from the order's business date; R2-S3-4 + stale comments; R2-S3-6 + R1-M3 (refund cap cumulative per role per order); R2-S3-7 coupon_use discount re-split; R3-M1 (order_event ordering by seq once m-4 lands); R3-M2 (orders + people seams fail closed: no stand-ins on any default path); R3-M3 (orders place/lifecycle/AU gates on the REAL seams with hand values; delete `installFakes` pricing path or keep it only for isolated unit tests that are labelled so; B17 re-run on real pricing with evidence); R1-m1 + R3-m2 (storefront cancel reason is a code from a fixed list; free text not stored); R3-M8 orders/catalogue emitters (`item_unavailable`, `reason_required` for cancel/reject, `deal_changed`) |
| **f-2** finance · people · inventory · purchasing · customers · tenancy | Opus | R2-S1-4 (post the loyalty redemption; 1110 clears); R2-S1-5 (post advances under `finance.post_advance`); R2-S1-6 (invoice vs GRN price/qty variance posted — COGS/PPV — so GRNI clears; unmatched invoice lines expensed); R2-S1-7 (transfer receive creates the destination batch with expiry + MRP); R2-S2-4 (refund of a completed order reverses earned points pro rata); R2-S2-7 (overtime by whole ISO week, allocated to the month of each day or of the week end — document); R2-S2-8 (unit cost precision, with m-4); R2-S2-9 (short payout uses the order's tax, not the file's); R2-S2-10 (aggregator refunds: recorded as a channel deduction, not a tender refund — or refused with a clear code; pick and document); R2-S3-2 (partial refund tax: last refund takes the remainder); R2-S3-5 (first post of an invoice/settlement dated in a closed month posts on the first open day, labelled); R1-M2 roster_shift + outlet_calendar audited with before/after; R1-m11 wage change audit with amounts; R1-m3 staff cannot edit a signed-in customer's name/phone/email; R1-m2 staff search cannot match on masked fields |
| **f-3** security · accounts · auth · integration | Opus | R1-M1 erasure (reservation, bulk_order, order_line notes, merged guest profiles; gate asserts every PII column across those tables); R1-M4 (scan: assert no other-tenant captured rows after the mark; derivation rows checked against the rule's source_state; new integration flows for push-back, reschedule, override, roster edit, hours change, refunds, merge, erasure — each with clause-1 + hand values); R1-M5 (idp-supabase: AbortSignal timeout, bounded LRU cache; only bind/onboarding need `email_verified` — don't call GoTrue for member/customer routes); R1-m12 (log pg errors by code + constraint only); R1-m7 stale comment; R1-m6 tenant-existence oracle on onboarding (same response for exists/new, or server-minted tenant id); R3-m6/m7 (record a derivation plant per flow in a committed redproof script; plant each untested scan branch) |
| **f-4** contracts · SDK · gates · worldgen | Sonnet | R3-M4 (approvals.test relative dates); R3-M5 (every response schema parsed against a real response in at least one test; tighten `unknown`/open records: KDS options, storefront deal windows, platform records, imports staged data); R3-M6 (SDK guest-token security scheme + client option; 400 documented; one malformed-envelope code across modules; `ErrorBody.code` = the enum); R3-M8 contracts side (REASON_MESSAGES for price_above_mrp, expired_batch, preview_total_changed, unit_mismatch, tax_id_missing, period_closed, model_blocked; storefront coupon expired vs scope codes); R3-M7 (worldgen no-SQL gate catches createRequire/require/dynamic/multiline/child_process/bare `@munim/*` except sdk+tz, red-proven; verify reads cash_variance/short_commission/ad_cap/overtime/reorder inputs from rows, not the key) + R2-S3-8; R3-m1 duplicate `/platform/v1/snapshots` + a route-uniqueness gate; R3-m3 no silent skip; R3-m4; R3-m8 provision fails loud; R3-m9; R3-m11 document `line_id` |

Deferred (recorded, not cycle 1): R1-m8 platform 401 for anon (by design: operator surface is not secret), R1-m9 tenant-only
RLS on outlet-data tables (latent until templates — W3 M-C must scope templates by outlet), R1-m13 dev-only extensions
USAGE, R3-m5 unmounted SDK ops + R3-m10 Pydantic class stability (W3), R3-m12 kitchen.test ordering (taste), spec-drift
read routes for W4 (R3 list), D3–D10.
