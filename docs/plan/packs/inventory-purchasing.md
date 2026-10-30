# Pack — Inventory & purchasing (`inventory_purchasing`)

**Depends on:** PDR §4, §7; R7, R16, R22, R23, R34; 02-schema §2.5–§2.6, §4; 04 §3, §6; R4 §D item 8 (overbilling).
Prefixes `inventory.`, `purchasing.` (as 02-schema's `inventory.below_reorder`). Conventions (thresholds `INFERENCE`, ladder
**L**, params, ₹ keys, Σ rows, Refs): `catalogue.md` header. Every supplier name, card and screen carries "Simulated supplier".

## 1 · Purpose and owner question

- **Restaurant:** "Will I run out before the next delivery, which supplier is quietly charging more, and where is stock going to waste?"
- **Shop:** "What is expiring on my shelves, what has not sold in months, what has gone missing, and was I billed what I agreed?"

## 2 · Skill brief

- On-hand = Σ `stock_movement.qty_milli`, valued at last receipt cost; negative on-hand is an alert. Shop SKUs stock
  through a 1:1 stock record (`item.stock_ingredient_id`, schema gap); batches carry expiry and MRP; FEFO = earliest `expiry_on` first.
- Shrinkage exists only between two counts (else §7). Returns: customer = `kind='return'`, qty > 0, `ref_type='core.refund'`;
  supplier = qty < 0, `ref_type='core.supplier_return'` (convention, no new kind).
- Price creep compares like units (normalised to `ingredient.base_unit`) per supplier against its own pre-creep level.
- Overbilling = invoice line above PO price or received qty; exact duplicates are refused by the DB, near ones are findings.
- Negotiation: **simulated** suppliers only, non-binding (R22); output is one PO draft (R16); deal review is deterministic
  SQL + rules and the model only narrates it.

## 3 · Snapshot templates

Types: `*_minor`, `*_milli`, `*_bp`, `*_days`, counts = `integer`; `*_id` = `uuid`; `*_on` = `date`; `*_at` = `timestamptz`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `inventory.below_reorder` | on-hand vs min/par (02-schema) | `outlet_id` | `ingredient_id`, `on_hand_qty_milli` ← `core.stock_movement`; `min_qty_milli`, `par_qty_milli` ← `core.reorder_level` |
| `inventory.shortfall` | need over lead time vs stock + open POs | `outlet_id`, `lead_days` | `ingredient_id`, `need_qty_milli`, `proposed_min_qty_milli`, `proposed_par_qty_milli` ← `intel.forecast_point`, `core.recipe_line`; `on_hand_qty_milli` ← `core.stock_movement`; `open_po_qty_milli` ← `core.po_line`, `core.purchase_order`; `shortfall_qty_milli` ← all; `stockout_on` (first day projected on-hand < 0) |
| `inventory.waste_week` | waste ₹ vs 8-week median | `outlet_id`, `week_start` | `ingredient_id`, `waste_minor`, `median_minor`, `excess_minor` ← `core.stock_movement` |
| `inventory.expiry_risk` | batch stock that will not be used before expiry | `outlet_id`, `days` | `batch_id`, `expiry_on`, `days_to_expiry`, `is_sku` boolean, `remaining_qty_milli` ← `core.stock_movement`, `core.batch`; `use_before_expiry_qty_milli` ← `intel.forecast_point`, `core.recipe_line`; `at_risk_qty_milli`, `at_risk_minor` ← all |
| `inventory.shrinkage` | count variance per count | `count_id` | `ingredient_id`, `expected_qty_milli`, `counted_qty_milli` ← `core.stock_count_line`; `loss_minor`, `counted_value_minor` (Σ row) ← `core.stock_movement` |
| `inventory.dead_stock` | stock with no consumption in N days | `outlet_id`, `days` | `ingredient_id`, `on_hand_qty_milli`, `value_minor` ← `core.stock_movement`; `last_sold_at` |
| `purchasing.price_creep` | price per base unit vs pre-creep level, per supplier | `as_of` | `supplier_id`, `ingredient_id`, `baseline_minor` (lowest 8-week rolling median in 180 d), `latest_minor`, `creep_bp`, `observations` ← `core.supplier_price`; `creep_impact_minor` (Σ lines > 1.05 × baseline of (price − baseline) × qty) ← `core.supplier_invoice_line` |
| `purchasing.invoice_vs_po` | invoice vs PO price and GRN qty | `supplier_invoice_id` | `line_id`, `po_price_minor` ← `core.po_line`; `invoice_price_minor`, `invoice_qty_milli` ← `core.supplier_invoice_line`; `received_qty_milli` ← `core.grn_line`; `overbilled_minor` (+ Σ row) ← all |
| `purchasing.invoice_duplicates` | pairs: same supplier and total, numbers equal once non-alphanumerics are stripped | `supplier_invoice_id` | `twin_invoice_id`, `total_minor` ← `core.supplier_invoice`; `days_apart` ← same |
| `purchasing.quote_compare` | quotes of one negotiation | `negotiation_run_id` | `quote_id`, `supplier_id`, `round`, `unit_price_minor`, `qty_milli`, `min_order_qty_milli`, `payment_days` ← `intel.supplier_quote` |
| `purchasing.deal_inputs` | review inputs for one quote | `quote_id` | `quote_total_minor`, `quote_payment_days` ← `intel.supplier_quote`; `budget_left_minor` ← `core.budget`, `core.purchase_order`; `open_commit_qty_milli` ← `core.po_line`; `need_qty_milli`, `use_in_shelf_life_qty_milli` ← `intel.forecast_point`, `core.ingredient`; `margin_at_quote_bp` (lowest across dishes using it) ← `core.recipe_line`, `core.order_line`, `intel.supplier_quote`; `margin_floor_bp`, `min_payment_days` ← `core.business_policy` |

```sql
-- inventory.expiry_risk (illustrative; forecast = latest served run, joined here, never a param)
with u as (select fp.business_on, sum(fp.qty_milli * rl.qty_milli / rv.yield_qty_milli) q, rl.ingredient_id
           from intel.forecast_point fp join core.recipe_version rv on rv.item_id = fp.item_id
           join core.recipe_line rl on rl.recipe_version_id = rv.id where fp.outlet_id = :outlet_id group by 1, 3)
select b.id batch_id, b.expiry_on, sum(m.qty_milli) remaining_qty_milli,
       (select coalesce(sum(q),0) from u where u.ingredient_id = b.ingredient_id and u.business_on < b.expiry_on) use_before_expiry_qty_milli, …
from core.batch b join core.stock_movement m on m.batch_id = b.id
where b.outlet_id = :outlet_id and b.expiry_on <= current_date + :days group by b.id having sum(m.qty_milli) > 0;
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `inventory.shortfall` | `shortfall` | `shortfall_qty_milli` > 0 at `lead_days` = 2 | `<outlet>:<ingredient>:<date>` | `high` if `stockout_on` ≤ tomorrow, else `medium` |
| `inventory.waste_spike` | `waste_week` | `waste_minor` ≥ 1.5 × `median_minor` and `excess_minor` ≥ ₹1,500 (A$30) | `<outlet>:<ingredient>:<iso_week>` | L on 4.3 × `excess_minor` |
| `inventory.expiry_risk` | `expiry_risk` | `days_to_expiry` ≤ 3 (≤ 7 if `is_sku`) and `at_risk_minor` ≥ ₹500 (A$10) | `<batch>` | L |
| `inventory.shrinkage` | `shrinkage` | `loss_minor` ≥ 2% of `counted_value_minor` or ≥ ₹2,000 (A$40) | `<count_id>` | L |
| `inventory.dead_stock` | `dead_stock` | row present at `days` = 60 and `value_minor` ≥ ₹1,000 (A$20) | `<outlet>:<ingredient>:<month>` | `low`; `medium` ≥ ₹10,000 |
| `purchasing.price_creep` | `price_creep` | `creep_bp` ≥ 500 and `observations` ≥ 2 | `<supplier>:<ingredient>:<iso_week>` | L |
| `purchasing.overbilled` | `invoice_vs_po` | Σ `overbilled_minor` ≥ ₹100 (A$2) per invoice | `<invoice>` | L |
| `purchasing.near_duplicate_invoice` | `invoice_duplicates` | row present and `days_apart` ≤ 7 | `<invoice>` | L on `total_minor` |

## 5 · Finding types (id = detector id; severity per §4)

`inventory.shortfall` → `shortfall.shortfall_qty_milli` (non-₹) · `inventory.waste_spike` → `waste_week.excess_minor` ·
`inventory.expiry_risk` → `expiry_risk.at_risk_minor` · `inventory.shrinkage` → `shrinkage.loss_minor` · `inventory.dead_stock` →
`dead_stock.value_minor` · `purchasing.price_creep` → `price_creep.creep_impact_minor` · `purchasing.overbilled` →
`invoice_vs_po.overbilled_minor` (Σ row) · `purchasing.near_duplicate_invoice` → `invoice_duplicates.total_minor`.

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `purchasing.po.create.v1` | draftable | `po_id`, `supplier_id`, `outlet_ids`, `currency`, `expected_on`, `negotiation_run_id`, `lines[]{ingredient_id, **qty_milli** ← `quote_compare.qty_milli`, unit, **unit_price_minor** ← `quote_compare.unit_price_minor`}`; `based_on` = `shortfall`, `deal_inputs.budget_left_minor` |
| `inventory.reorder_level.set.v1` | draftable | `outlet_id`, `ingredient_id`, **`min_qty_milli`** ← `shortfall.proposed_min_qty_milli`, **`par_qty_milli`** ← `shortfall.proposed_par_qty_milli` |
| `inventory.transfer.create.v1` | NEW | `transfer_id`, `from_outlet_id`, `to_outlet_id`, `lines[]{ingredient_id, batch_id, **qty_milli** ← `expiry_risk.at_risk_qty_milli`}` |
| `purchasing.invoice.dispute.v1` | NEW | `dispute_id`, `supplier_invoice_id`, `lines[]{invoice_line_id, **claimed_minor** ← `invoice_vs_po.overbilled_minor`}` or **`total_claimed_minor`** ← `invoice_duplicates.total_minor`; executes as a `core.dispute` row + debit note — the owner sends it, Munim never does |
| `cares.listing.publish.v1` | NEW; workflow draftable only, from `expiry_risk` when Munim Cares is on for the outlet (ADR-015 §4); transfer and supplier-return remain unbuilt | `listing_id`, `outlet_id`, `kind` = donation, `recipient_id` ← `cares.recipient_match` row 0, `pickup_from`/`pickup_to` ← the same row, `lines[]{line_id, food_kind, ingredient_id, batch_id, **qty_milli** ← `expiry_risk.at_risk_qty_milli`, unit, **expires_on** ← `expiry_risk.expiry_on`}`; abstains `no_eligible_recipient` when the match returns no row |
| `purchasing.supplier_return.create.v1` | NEW | `supplier_return_id`, `supplier_id`, `lines[]{batch_id, ingredient_id, **qty_milli** ← `expiry_risk.at_risk_qty_milli`}` |

**Negotiation (04 §6).** Trigger: `inventory.shortfall` finding or a person's ask. RFQ `{ingredient_id, qty_milli ← shortfall.shortfall_qty_milli, needed_by, outlet_ids}` to all three agents; ≤ 2 counter rounds (counter = best rival `quote_compare.unit_price_minor`); every message an `a2a_send/receive` trace; quotes → `quotes:batch`. Personalities are data in `suppliers-sim` (prices in basis points of the tenant's last `supplier_price`; values `INFERENCE`):
`steady {first_bp:10200, concede_bp_per_round:150, floor_bp:9900, min_order_factor:0, payment_days:15}` ·
`discounter {first_bp:9000, concede_bp_per_round:50, floor_bp:8800, min_order_factor:3.0 (in terms, not headline), payment_days:7}` ·
`premium {first_bp:11200, concede_bp_per_round:200, floor_bp:10600, min_order_factor:0, payment_days:30}`.
**Deal review** — one `deal_inputs` snapshot per quote, checks in parallel, each `pass | fail(code, refs) | cannot_verify(code)`:
`quote_total_minor` > `budget_left_minor` → `budget_exceeded` NEW (no budget row → `budget_missing` NEW); `margin_at_quote_bp` <
`margin_floor_bp` → `margin_below_floor` NEW; `min_order_qty_milli` > `use_in_shelf_life_qty_milli` → `moq_exceeds_need` NEW;
`open_commit_qty_milli` ≥ `need_qty_milli` → `open_commitment_overlap` NEW; `quote_payment_days` < `min_payment_days` →
`payment_terms_worse` NEW. Best passing quote → one PO draft; refused quotes shown with code + refs; none passes → finding, no draft.

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| shrinkage asked for a period with no completed count | `count_missing` NEW | "Cannot verify: no stock count was completed at {outlet} in this period, so missing stock cannot be measured." |
| expiry asked for an item not tracked by batch | `expiry_missing` NEW | "Cannot verify: {item} is not tracked by batch, so its expiry dates are unknown." |
| discounter quote (S1) | `moq_exceeds_need` NEW | "Refused: {supplier} (Simulated supplier) requires a minimum order of {moq}, more than {outlet} can use before it expires." |

## 8 · Dashboard panel

Tiles: below reorder ← `inventory.below_reorder`; ₹ expiring in 7 d ← `inventory.expiry_risk`; waste ₹ this week ← `inventory.waste_week`; dead stock ₹ ← `inventory.dead_stock`; overbilled ₹ (90 d) ← `purchasing.invoice_vs_po`. Charts: price per supplier over time ← `purchasing.price_creep`; negotiation rounds ← `purchasing.quote_compare`.

## 9 · Graph scope

Nodes `ingredient`, `supplier`, `item`, `outlet`, `day`, `finding`, `draft`; edges `supplies`, `quoted`, `uses`, `wasted`, `proposes`. Templates: `supplier_dependency`, `price_shock_path`.

## 10 · Eval cases

| # | planted (worldgen via API / import file) | ₹ key = impact column | expect |
|---|---|---|---|
| I1 | supplier invoices (import) raise tomato 14% from week 10 | `creep_impact_minor` = Σ (price − pre-creep median) × qty | `price_creep` |
| I2 | invoice line ₹6/kg above PO on 120 kg | `overbilled_minor` = 6 × 120 | `overbilled` + dispute draft |
| I3 | "INV-1042" and "INV1042", same total, 2 days apart | `total_minor` | `near_duplicate_invoice` |
| I4 | shop: 40 yoghurt units in a batch that cannot sell before expiry | `at_risk_minor` = 40 × unit cost | `expiry_risk` + transfer draft |
| I5 | shop: count shows 6% short on one SKU | `loss_minor` = \|count_adjust\| × cost | `shrinkage` |
| I6 | waste logs ×2.4 on one ingredient for a week | `excess_minor` = (week − median) | `waste_spike` |
| I7 S1 | shortfall → 3 quotes; discounter cheapest with min order 3× need | non-₹ (refusal case) | discounter refused `moq_exceeds_need`; PO draft for best passing |
| I8 abstain | shrinkage asked at an outlet with no counts | — | `count_missing` |
| I9 trap | supplier switches 1 kg → 500 g pack at half price | 0 (per base unit unchanged) | no `price_creep` |
