# Dashboards — `/console/d/<pack>` (eight packs)

**Ticket:** T-065 (UI), M-C (templates), T-044…T-051 (agent panels). **i18n prefix:** `console.dash.<pack>.*`.
**Who:** owner, manager (their outlets), advisor (read-only), judge. Desktop + tablet; targets ≥ 48 px.
**Every number on a dashboard is an aggregate → a snapshot ref (R26).** Template ids from D-1 where
`docs/plan/packs/<pack>.md` exists (all eight packs + forecast at time of writing).

## Shared layout (all eight)

Purpose: one pack's numbers, charts and agent panel for the chosen scope and period. Heading: "{pack name}"

```
┌ Catalogue & menu · All outlets ▾ · Last 30 days ▾          "Updated {time}"  [Refresh] ┐
│ ┌ tile ───────┐ ┌ tile ───────┐ ┌ tile ───────┐ ┌ tile ───────┐                         │
│ │ ⟨snap⟩      │ │ ⟨snap⟩      │ │ ⟨snap⟩      │ │ ⟨snap⟩      │  each tile → Rows drawer│
│ └ label ──────┘ └ label ──────┘ └ label ──────┘ └ label ──────┘                         │
│ ┌ chart (rows of one snapshot) ───────────────┐ ┌ AGENT PANEL ─────────────────────────┐ │
│ │                                             │ │ Findings for this pack (open)        │ │
│ │                                             │ │ Drafts waiting · [Review]            │ │
│ └ "Source: {template} · {n} rows" ────────────┘ │ "Ask the {pack} specialist…"         │ │
│ TABLE (rows of a snapshot; sortable; row → record)  └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- Period + scope params → one snapshot per tile/chart (template id + params). "Updated" = `snapshot.created_at`.
  Who mints dashboard snapshots outside an intel run is unresolved (gap G-CON-1).
- Charts draw only rows of their snapshot; caption "Source: {template} · {n} rows" opens the Rows drawer.
- **Agent panel** = `GET /v1/findings` filtered by `pack` + inbox drafts with `source = intel:<pack>`; ask box
  deep-links to `/console/ask` with the pack pre-selected. Hidden under `S-aioff` (dashboard stays).
- **Store-only tenants** (all outlets `kind = store`): Kitchen dashboard hidden from nav; Inventory shows the
  store-depth panel. **Cloud kitchens:** brand filter appears beside scope.
States (all eight): `S-off` std (tiles keep the last snapshot, stamped with its time) · `S-load` (tile skeletons; no zero placeholder) · `S-empty` "Not enough data yet. This
fills in after your first {n} days of sales." · `S-abst` per tile: tile shows "cannot verify" + reason
(README §4 or pack code) · `S-err` per tile (others still render) · `S-deny` manager selecting an outlet
outside scope → the option is absent · `S-aioff` agent panel hidden.

## 1 · Catalogue & menu — `/console/d/catalogue` (D-1 `packs/catalogue.md`)

Purpose: which items earn and which leak money. Heading: "Catalogue & menu". States: shared block.

| Element | Source |
|---|---|
| Tile "Dishes losing money" · "Lost to negative-margin dishes" | `snap catalogue.dish_margin` |
| Tile "Given away by deals" | `snap catalogue.deal_cost` |
| Tile "Items priced above MRP" (shops) | `snap catalogue.sku_mrp_check` |
| Chart menu-engineering quadrant ("Stars", "Plough-horses", "Puzzles", "Dogs") | `snap catalogue.menu_matrix` |
| Chart cost vs price per item | `snap catalogue.price_vs_cost_change` |
Refusals: `recipe_missing` "Cannot verify: {item} has no recipe for this period, so its true margin is
unknown. Add a recipe to see it." · `cost_price_missing` (pack copy). Drafts: `catalogue.price.set.v1`.

## 2 · Kitchen ops — `/console/d/kitchen` (D-1 `packs/kitchen.md`; restaurants only)

Purpose: where ticket times slip, by station and slot. Heading: "Kitchen". States: shared block.

| Element | Source |
|---|---|
| Tile "Ticket time (p80) today" · "Late tickets, 7 days" | `snap kitchen.ticket_times` |
| Tile "Refunds on late orders" | `snap kitchen.ticket_drift` |
| Tile "Tickets with timestamps" | `snap kitchen.ticket_coverage` |
| Heatmap station × 30-min slot · drift vs baseline | `snap kitchen.ticket_times`, `snap kitchen.ticket_drift` |
Refusal: `ticket_times_missing` (pack copy). Drafts: `kitchen.prep_time.set.v1`, `kitchen.prep_list.create.v1`.

## 3 · Inventory & purchasing — `/console/d/inventory` (D-1 `packs/inventory-purchasing.md`)

Purpose: stock at risk, waste, supplier prices, negotiations. Heading: "Inventory & purchasing". States: shared block.

| Element | Source |
|---|---|
| Tile "Below reorder level" + table | `snap inventory.below_reorder` |
| Tile "Expiring in 7 days" · "Dead stock" (store depth) · "Shrinkage" | `snap inventory.expiry_risk`, `inventory.dead_stock`, `inventory.shrinkage` |
| Tile "Waste this week" | `snap inventory.waste_week` |
| Tile "Overbilled, 90 days" | `snap purchasing.invoice_vs_po` |
| Chart price per supplier over time (legend "{name} · Simulated supplier" where simulated) | `snap purchasing.price_creep` |
| Negotiation strip (latest run): quote cards, each "Simulated supplier · {name}", round, verdict | `snap purchasing.quote_compare` (over `intel.supplier_quote`) |
Refusals: `count_missing`, `expiry_missing`, deal-review `moq_exceeds_need` "Refused: {supplier} (Simulated
supplier) requires a minimum order of {moq}, more than {outlet} can use before it expires." (pack copy).
Drafts: `purchasing.po.create.v1`, `inventory.reorder_level.set.v1` (+ D-1 NEW transfer, dispute, return).

## 4 · Finance — `/console/d/finance` (D-1 `packs/finance.md`)

Purpose: money in vs money expected, breaks, P&L, close. Heading: "Finance". States: shared block.

| Element | Source |
|---|---|
| Tile "Unapproved ad and promo fees this month" (shown first, R4 K9) | `snap finance.unapproved_deductions` |
| Tile "Short and missing payouts" · breaks by channel | `snap finance.settlement_vs_orders`, `finance.missing_payouts` |
| Tile "Card/UPI vs bank gap, 7 days" | `snap finance.tender_vs_bank` |
| Tile "Net profit" · P&L by outlet / brand / channel | `snap finance.pnl` |
| Close progress + checklist (→ `flows/story-3-month-end-close.md`) | `snap finance.close_status` |
| GST check (labels from the pack) | `snap finance.gst_check` |
Refusals: `settlements_missing` "Cannot verify: payouts from {channel} for {dates} have not been imported, so
this month's profit would be wrong." · `consent_record_missing` · `bank_lines_missing` (pack copy). Drafts
(D-1 NEW, not yet `DRAFTABLE`): `finance.dispute.draft.v1`, `finance.journal.adjust.v1`,
`finance.period.close.v1` (gap G-FIN-1). Button "Export for Tally" (advisor allowed).

## 5 · People — `/console/d/people` (D-1 `packs/people.md`)

Purpose: labour cost against demand, overtime, attendance. Heading: "People". States: shared block.

| Element | Source |
|---|---|
| Tile "Labour % of sales this week" | `snap people.labour_pct` |
| Tile "Overtime cost, 4 weeks" | `snap people.overtime_drift` |
| Tile "Excess labour cost, 30 days" · chart attended vs needed per slot | `snap people.labour_vs_demand` |
| Tile "Attendance recorded" | `snap people.attendance_coverage` |
| Tile "Open advances" (IN only) | `snap people.advances_open` |
AU tenants: payroll absent; asking gives `payroll_out_of_scope` "Not available: for businesses in {country},
Munim prepares rosters only. Run payroll in your payroll software." · `attendance_missing` (pack copy).
Drafts (D-1 NEW): `people.roster.create.v1`, `people.payroll_draft.create.v1` (IN).

## 6 · Customers & growth — `/console/d/customers` (D-1 `packs/customers-growth.md`)

Purpose: coupon leakage, regulars at risk, reviews. Heading: "Customers & growth". States: shared block.

| Element | Source |
|---|---|
| Tile "Coupon leakage, 30 days" · chart coupon uses per day vs median | `snap customers.coupon_leakage`, `customers.coupon_daily` |
| Tile "Regulars at risk" · "Their monthly spend" | `snap customers.churn_segments` |
| Tile "Rating this week" · chart rating vs late tickets | `snap customers.review_trend` |
| Reviews list | `row core.review` |
Campaign drafts show the full message and "Never sent automatically." Refusals: `no_marketing_consent`
"Cannot draft: none of the customers in {segment} agreed to receive offers, so no message was prepared." ·
`insufficient_history` (pack copy).

## 7 · Compliance & assets — `/console/d/compliance` (D-1 `packs/compliance-assets.md`)

Purpose: licences, logs and equipment as evidence. Heading: "Compliance & assets". States: shared block.

| Element | Source |
|---|---|
| Licence timeline per outlet (FSSAI, GST, trade, fire — from the pack) | `row core.licence` (expiry is a row field) |
| Tile "Licences due in 30 days" | `snap compliance.licence_calendar` |
| Tile "Log coverage this week" · chart coverage by checklist per day | `snap compliance.log_coverage` |
| Tile "Temperature excursions, 7 days" | `snap compliance.temp_excursions` |
| Tile "Repairs paid under AMC, 90 days" · "Utility per order" | `snap compliance.asset_costs`, `compliance.energy_per_order` |
Refusals: `not_a_certificate` "Cannot verify: Munim keeps licence, temperature and cleaning records as
evidence. It cannot certify that {outlet} is compliant." · `log_coverage_missing` (pack copy).

## 8 · Market & strategy — `/console/d/market` (D-1 `packs/market-strategy.md`, `packs/forecast.md`)

Purpose: demand forecast, events ahead, goals. Heading: "Market & strategy". States: shared block.

| Element | Source |
|---|---|
| Tile "Events in the next 7 days" · "Items where we are dearer" · "Goals off track" | `snap market.upcoming`, `market.competitor_gap`, `market.goal_progress` |
| Chart past uplift by signal label · viability case card (only when asked) | `snap market.signal_uplift`, `market.viability` |
| Tile "Forecast error (WAPE) vs naive, 28 days" · "Bias" · "Last trained" | `snap forecast.accuracy`, `forecast.freshness` |
| Chart forecast band vs actual per day | `snap forecast.points`, `forecast.accuracy` |
| Goals and tasks (rows) | `row core.goal`, `row core.task` |
Refusals: `signal_source_missing` "Cannot verify: no weather or festival calendar has been imported for
{outlet} for {dates}. Import one to see what is coming." · `insufficient_history` · `forecast_stale` (pack copy).
