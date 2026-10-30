# POS — `/pos` (tablet-first, restaurants and shops)

**Ticket:** T-061 (UI), T-022 (orders API), T-021 (catalogue, barcode lookup), T-024 (batches, MRP).
**i18n prefix:** `pos.*`. **Who:** staff, manager, owner of the device's outlet. **Device:** registered
`core.device(kind='pos')`; its `invoice_series` numbers receipts. Standard states per `00-README.md` §3.
**Tablet:** every tap target ≥ 48 px (item tiles 96 px), every input ≥ 16 px, numeric keypad for qty/cash.
**No AI on the POS path** (R26: POS numbers are row fields; nothing here calls intel), so `S-abst`/`S-aioff` = n/a.

## P1 · Counter sale — `/pos`

Purpose: build an order in as few taps as possible; restaurants by tile, shops by barcode scan. Heading: "New sale"
```
┌ Outlet A · Counter ▾ (Counter|Takeaway|Table)  [Scan ▢]  "Search items"      Staff: Ravi ▾ ┐
│ [Mains] [Breads] [Drinks] [Combos]          │ Order #— (new)                              │
│ ┌──────┐┌──────┐┌──────┐┌──────┐          │ 1 × Paneer tikka         {money}   [–][+]  │
│ │Paneer││Dal   ││Naan  ││Lassi │          │   + extra cheese        {money}            │
│ │{mon.}││{mon.}││SOLD  ││{mon.}│          │ 2 × Butter naan          {money}   [–][+]  │
│ └──────┘└──────┘└OUT───┘└──────┘          │ ─────────────────────────────────          │
│                                            │ "Total is confirmed on Charge"             │
│                                            │ [ "Hold" ]          [ "Charge" ]  (64 px)   │
└────────────────────────────────────────────┴────────────────────────────────────────────┘
```
- **Tile price** = `row core.price.amount_minor` for (item/variant, outlet, channel_kind) in force now.
- **Option delta** = `row core.option.price_delta_minor`. Line amounts shown before Charge are display-only
  echoes of those rows × qty; **no cart total is shown** until the server prices the order (gap G-POS-1).
- Simple items add in one tap; items with option groups open P2. Sold-out per outlet shows "Sold out" and the
  tile is inert (gap: no sold-out column in 02-schema §2.3 — G-CAT-1).
- **Scan** (shops): camera or USB/BT scanner (keyboard wedge). Flow in `flows/shop-barcode-sale.md`.
  Unknown barcode → toast "No item with this barcode." + "Add item" (owner/manager only; staff see "Ask a
  manager to add it."). Lookup: catalogue barcode lookup — route not fixed — T-021.
- **Charge** → `POST /v1/orders` (`orders.place.v1`, client UUIDv7 + idempotency key). On 201 → P3 with the
  committed order. Client totals are never sent as authority (rule 9).
- **Hold** keeps the cart locally on this device only (not a record) — "Held — not saved to the books."

States: `S-err` std · `S-abst`/`S-aioff` n/a (no intel on the POS path) · `S-load` (tile skeleton) · `S-empty` catalogue: "No items yet." + "Add your first item" (→ settings
menu) · `S-off` on Charge: "No connection. Nothing was saved." + "Retry" (same key) · `S-deny` when the
member's role lacks `orders.place.v1` · refusal `409 window_full`/`outlet_paused` n/a at counter.
Refusals from place (literal, `pos.refuse.*`): price above MRP → "This price is above the printed MRP. Sale
refused." (`reason_code TBD`); item inactive → "This item is no longer on sale."

## P2 · Options sheet

Purpose: pick options with a live line price. Heading: "{item name}"

Bottom sheet over P1. Option groups with `min_select`/`max_select`/`required` shown as "Choose 1",
"Choose up to 3", "Required". Live line price = item price row + Σ selected option delta rows (display echo).
"Add to order" disabled until every required group is satisfied; tapping it anyway shakes the group and says
"Choose an option for {group}." Close: swipe down or "Cancel". Targets 56 px rows.
States: `S-load`, `S-empty`, `S-err`, `S-off`, `S-deny`, `S-abst` all n/a — no network call here (options arrive with the catalogue; failures surface on Charge).

## P3 · Tender — panel of `/pos` (`/pos?order=[id]`; replaces the order pane, keeps the counter one screen)

Purpose: record how the customer paid, against the committed order. Heading: "Take payment"

```
┌ Order #47 · Invoice {invoice_no}          Total {money}  ← row core.order.total_minor ┐
│ Subtotal {money} · Discount {money} · Tax {money}   ← rows subtotal/discount/tax_minor │
│ [ Cash ] [ Card ] [ UPI ]   Amount [ {money} ]  (keypad, 16 px+)                        │
│ Recorded: Cash {money} ✓   Remaining {money}   Change {money}                           │
│ "Recorded only — Munim does not process payments."                                       │
│ [ "Record payment" ]                       [ "Void order" ]                               │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- Each tender → command *proposed* `orders.tender.record.v1` (route not fixed — T-022) → `row core.tender`.
- **Remaining / Change** are derived from `order.total_minor` − Σ tender rows: an aggregate. `INFERENCE`:
  shown as arithmetic over rows on this screen; flagged G-POS-2 (R26 needs a ruling: snapshot or row field).
- Card/UPI: "Enter the reference from the terminal or UPI app (optional)." → `tender.ref`.
States: `S-load` amount skeleton until the order row loads · `S-empty` n/a (opens only for a committed order) · `S-err` std · `S-abst` n/a · `S-off` (retry same key) · `S-deny` · over-tender cash → shows change; over-tender card/UPI →
"Card and UPI cannot exceed the amount due."

## P4 · Receipt — panel of `/pos` (`/pos?order=[id]&view=receipt`)

Purpose: show and print the committed order exactly as recorded. Heading: "Receipt"

Renders the order row and lines exactly; pack-driven fields: IN "FSSAI Lic. No. {fssai}", GSTIN, tax split;
AU "Tax invoice", ABN, "GST included {money}" (R21). Every number is a row field of `order`/`order_line`/
`tender`. Buttons: "Print", "New sale" (64 px). Footer for demo tenants: "Sample data — not a real sale."
Missing pack-required tax id → banner "Add your FSSAI licence number in Settings before printing bills."
(no refusal of the sale; `INFERENCE`).
States: `S-load` skeleton · `S-empty` n/a · `S-err`/`S-off` "The receipt couldn't load. The sale is saved." + "Try again" · `S-deny` n/a (anyone who can sell can reprint) · `S-abst` n/a.

## P5 · Tables — `/pos/tables`

Purpose: see and reopen open dine-in orders by table. Heading: "Tables"

Grid of `table_ref`s with open orders (status, elapsed since `order.created_at`, total row). Tap → that order
(P1 in edit mode). Table QR orders arrive here as `placed` with source "QR". `S-empty`: "No open tables."
SSE topic: none exists for POS (gap G-POS-3: `kds:<outlet>` is the only outlet topic; POS needs order events).
States: `S-load` grid skeleton · `S-err` std · `S-off` std (grid frozen, banner) · `S-deny` n/a (any POS member) · `S-abst` n/a.

## P6 · Void / refund — `/pos/refund/[id]`

Purpose: reverse all or part of an order, with a reason, within the member's authority. Heading: "Void or refund"

Pick lines or "Whole order", reason code (list from pack: "Wrong item", "Customer cancelled", "Quality",
"Other") + note (required for "Other"), then "Void" (before tender) or "Refund {money}" (after).
Commands *proposed* `orders.void.v1`, `orders.refund.v1` (route not fixed — T-022), authority from
`command_authority.max_amount_minor`: staff above the cap → `S-deny` "Refunds above {money} need a manager."
Result rows `core.void` / `core.refund`; refund method = original tender method by default.
States: `S-load` · `S-empty` n/a · `S-err` std · `S-off` std (retry resends the same key — never a double refund) · `S-abst` n/a.

## P7 · Shift open / close (entry points)

Purpose: open a drawer session so sales belong to a shift. Heading: "Open shift"

Open: "Opening float" keypad → `row core.shift.float`. Close lives in `manager-staff-ops.md` (cash close).
POS refuses Charge with no open shift: "Open a shift to start selling." + "Open shift".
States: `S-load`/`S-empty` n/a · `S-err` std · `S-off` std · `S-deny` "Only a manager can open a shift on this device." (when authority says so) · `S-abst` n/a.
