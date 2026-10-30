# Pack — Catalogue & menu (`catalogue`)

**Depends on:** PDR §4, §7 (S2); 02-schema §2.3–§2.6; 04 §3–§5, §9; contracts `commands/catalogue.ts`, `drafts.ts`,
`reason-codes.ts`, `proposal.ts`. Template prefix: `catalogue.` (02-schema §3: a module's templates ship in its migration).
**Conventions for every pack file.** Thresholds are `INFERENCE` (no repo doc fixes them) and live as data under a new
country-pack key `detectors.<detector_id>` (contracts addition), IN in ₹, AU in A$. Debounce is 04 §5: leading edge
15 min prod / 0 in tests, 7-day `dedupe_key` merge, ≤ 10 narrated findings per tenant per day. Severity ladder **L**
(monthly ₹ impact; AU in brackets): `critical` ≥ ₹50,000 (A$1,000) · `high` ≥ ₹10,000 (A$200) · `medium` ≥ ₹2,000
(A$40) · `low` otherwise. **Params carry ids, dates and shape only** (no computed quantity); owner policy numbers
(target margin, margin floor, labour target, payment days) come from a `core.business_policy` row joined in SQL.
Every **₹ eval key is the finding's `impact_ref` column** (N1 compares them); non-₹ evals are marked "non-₹" and
excluded from N1. A "Σ row" is a final total row with null ids that the template emits. Every draft numeric leaf is a
Ref (`toProposal`) to the cell named after `←`. `NEW` = not yet in `packages/contracts`.

## 1 · Purpose and owner question

- **Restaurant:** "Which dishes actually make money once today's supplier prices and real waste count — and what should I charge?"
- **Shop:** "Which SKUs earn their shelf space, and which am I selling below cost or above MRP?"

## 2 · Skill brief

- True unit cost = recipe lines × latest observed supplier price × (1 + max(recipe waste, observed waste)) ÷ yield.
- A shop SKU is costed through its 1:1 stock record (`item.stock_ingredient_id`, schema gap) at last landed cost.
- Menu engineering: popularity (share of units) × contribution margin → star / plough-horse / puzzle / dog.
- Price per outlet and channel differs; aggregator channels carry commission — compare like with like.
- A deal's cost is `order_line.line_discount_minor` at the promised time, not list price.
- Never states a margin without a current recipe version and a supplier price for every line (§7).
- Price drafts start tomorrow or later, never back-dated; the proposed price is a template cell, never intel arithmetic.
- MRP is a ceiling: a shop price above MRP is a `critical` finding, never a price draft upward.

## 3 · Snapshot templates

Types: `*_minor`, `*_milli`, `*_bp`, counts, `*_version` = `integer`; `*_id` = `uuid`; `*_from` = `date`; `class` = `text`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `catalogue.dish_margin` | true cost, margin, suggested price | `outlet_id`, `channel_kind`, `from`, `to` | `item_id`, `recipe_version_id`, `units_sold`, `units_rank`, `net_sales_minor` ← `core.order_line`; `unit_cost_minor` ← `core.recipe_line`, `core.supplier_price`, `core.stock_movement`; `observed_waste_bp` ← `core.stock_movement`; `recipe_waste_bp` (qty-weighted) ← `core.recipe_line`; `margin_minor`, `loss_minor` (= −margin when < 0), `margin_bp` ← all; `excess_waste_minor` ← `core.recipe_line`, `core.stock_movement`, `core.supplier_price`; `suggested_price_minor` ← all + `core.business_policy`; `lines_unpriced` ← `core.recipe_line` |
| `catalogue.menu_matrix` | popularity × margin class | `outlet_id`, `from`, `to` | `item_id`, `units_share_bp` ← `core.order_line`; `margin_minor` ← as above; `class` |
| `catalogue.cost_drift` | cost moved since price set | `outlet_id`, `since` | `item_id`, `price_minor` ← `core.price`; `cost_then_minor`, `cost_now_minor`, `cost_change_bp` ← `core.supplier_price`, `core.recipe_line`; `cost_drift_minor` (Σ sales since `since` × (cost that day − cost_then)) ← + `core.order_line` |
| `catalogue.deal_cost` | discount per deal vs margin | `outlet_id`, `from`, `to` | `deal_id`, `orders` ← `core.order`; `discount_minor` ← `core.order_line`; `deal_loss_minor` (−margin after discount, if < 0) ← `core.order_line`, `core.recipe_line`, `core.supplier_price` |
| `catalogue.sku_price_check` | shop: price vs MRP and landed cost | `outlet_id`, `from`, `to` | `item_id`, `price_minor` ← `core.price`; `mrp_minor` ← `core.batch`, `core.item`; `landed_cost_minor` ← `core.stock_movement`; `units` ← `core.order_line`; `above_mrp_minor`, `below_cost_minor` ← all |
| `catalogue.recipe_current` | current recipe for a revision draft | `item_id`, `outlet_id` | `recipe_version_id`, `next_version`, `yield_qty_milli` ← `core.recipe_version`; `ingredient_id`, `qty_milli`, `waste_pct_bp` ← `core.recipe_line`; `observed_waste_bp` ← `core.stock_movement` |

```sql
-- catalogue.dish_margin, cost part (illustrative; unit conversion via ingredient.base_unit omitted)
with rv as (select * from core.recipe_version where :to between valid_from and coalesce(valid_to,'infinity')),
lp as (select distinct on (ingredient_id) ingredient_id, unit_price_minor from core.supplier_price
       where observed_at <= :to order by ingredient_id, observed_at desc),
ow as (select ingredient_id, -sum(qty_milli) filter (where kind='waste') * 10000
              / nullif(-sum(qty_milli) filter (where kind='sale_consumption'),0) bp
       from core.stock_movement where outlet_id=:outlet_id and at between :from and :to group by 1)
select rv.item_id, count(*) filter (where lp.ingredient_id is null) lines_unpriced,
       sum(rl.qty_milli*lp.unit_price_minor*(10000+greatest(rl.waste_pct_bp,coalesce(ow.bp,0)))/10000)/rv.yield_qty_milli unit_cost_minor
from rv join core.recipe_line rl on rl.recipe_version_id=rv.id left join lp using (ingredient_id) left join ow using (ingredient_id)
group by rv.item_id, rv.yield_qty_milli;
-- suggested_price_minor = unit_cost_minor * 10000 / (10000 - bp.target_margin_bp), bp = core.business_policy row
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `catalogue.negative_margin` | `dish_margin` | `margin_minor` < 0 and `units_sold` ≥ 20 (14-day window) | `<outlet>:<item>:<iso_week>` | L on `loss_minor` × 30 ÷ 14; ≥ `high` if `units_rank` ≤ 10 |
| `catalogue.cost_drift` | `cost_drift` | `cost_change_bp` ≥ 800 and `cost_now_minor` − `cost_then_minor` ≥ ₹5 (A$0.10) | `<outlet>:<item>:<price_id>` | L |
| `catalogue.recipe_waste_gap` | `dish_margin` | `observed_waste_bp` ≥ `recipe_waste_bp` + 300 and `units_sold` ≥ 20 | `<outlet>:<item>:<iso_week>` | L |
| `catalogue.deal_loss` | `deal_cost` | `deal_loss_minor` > 0 on ≥ 30 orders in 14 days | `<deal_id>:<iso_week>` | L |
| `catalogue.above_mrp` (shop) | `sku_price_check` | `price_minor` > `mrp_minor` (any amount) | `<outlet>:<item>` | `critical` (legal exposure, `INFERENCE`) |
| `catalogue.below_cost` (shop) | `sku_price_check` | `below_cost_minor` > 0 | `<outlet>:<item>` | L |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `catalogue.negative_margin` | L / `high` | `dish_margin.loss_minor` |
| `catalogue.cost_drift` | L | `cost_drift.cost_drift_minor` |
| `catalogue.recipe_waste_gap` | L | `dish_margin.excess_waste_minor` |
| `catalogue.deal_loss` | L | `deal_cost.deal_loss_minor` |
| `catalogue.above_mrp` | `critical` | `sku_price_check.above_mrp_minor` |
| `catalogue.below_cost` | L | `sku_price_check.below_cost_minor` |

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `catalogue.price.set.v1` | draftable | `price_id`, `item_id`, `variant_id`, `outlet_id`, `channel_kind`, **`amount_minor`** ← `dish_margin.suggested_price_minor`, `currency`, `tax_class`, `valid_from` (≥ tomorrow), `valid_to` |
| `catalogue.recipe.version.create.v1` | in `COMMANDS`; NEW in `DRAFTABLE` | `recipe_version_id`, `item_id`, `variant_id`, **`version`** ← `recipe_current.next_version`, `valid_from`, `valid_to`, **`yield_qty_milli`** ← `recipe_current.yield_qty_milli`, `lines[]{ingredient_id, **qty_milli** ← `recipe_current.qty_milli`, unit, **waste_pct_bp** ← `recipe_current.observed_waste_bp`}` |
| `catalogue.deal.end.v1` | NEW | `deal_id`, `valid_to` (no numeric leaves) — ends a loss-making deal |

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| margin asked; no recipe version valid in the period | `recipe_missing` (exists) | "Cannot verify: {item} has no recipe for this period, so its true margin is unknown. Add a recipe to see it." |
| recipe exists but `lines_unpriced` > 0 | `cost_price_missing` NEW | "Cannot verify: no supplier price is recorded for {ingredient}, so the cost of {item} is incomplete." |

## 8 · Dashboard panel

Tiles: dishes losing money ← `catalogue.dish_margin`; ₹ lost on them (30 d) ← `catalogue.dish_margin.loss_minor`; ₹ lost on
deals ← `catalogue.deal_cost`; SKUs above MRP ← `catalogue.sku_price_check`. Charts: menu quadrant ← `catalogue.menu_matrix`;
cost vs price per item ← `catalogue.cost_drift`.

## 9 · Graph scope

Nodes `item`, `ingredient`, `supplier`, `outlet`, `channel`, `finding`, `draft`; edges `uses`, `quoted`, `supplies`, `sold`,
`wasted`, `proposes`, `about`. Templates: `dish_margin_drivers`, `price_shock_path`.

## 10 · Eval cases

| # | planted (worldgen, via API) | ₹ key = impact column | expect |
|---|---|---|---|
| C1 S2 | best seller: paneer invoices +22% from week 9 (invoice import); price unchanged | `cost_drift_minor` = Σ sales after week 9 × Δunit cost | `cost_drift` + price draft |
| C2 | recipe waste 2%; waste logs make observed 11% on one ingredient | `excess_waste_minor` = Σ units × qty × price × (observed − recipe) | `recipe_waste_gap` + recipe draft |
| C3 | 2-for-1 deal on a low-margin dish, 15:00–18:00 | `deal_loss_minor` = Σ deal orders × −margin after discount | `deal_loss` |
| C4 | shop: SKU priced ₹2 above batch MRP on 140 sales | `above_mrp_minor` = 140 × 2 | `above_mrp`, `critical` |
| C5 abstain | new dish sold 60 times, no recipe version | — | `recipe_missing` |
| C6 trap | cost +9% on a dish whose price the owner raised the same week | 0 | no finding (margin held) |
