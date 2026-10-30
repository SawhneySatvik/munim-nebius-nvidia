# 15 · Suppliers: low stock, simulated quotes, purchase orders, goods received

Read 00, 20, 01, 02 and 03 first. Everything here is **synthetic**. Every supplier is a **simulated** supplier: its
quotes come from a simulated negotiation, no order reaches a real business, and money is recorded only, never paid.
Every supplier name on every surface carries the **"Simulated supplier"** badge. A supplier row without it is a bug.

| | |
|---|---|
| Routes | `/staff/suppliers`, `/staff/suppliers/[supplierId]`, `/staff/purchase-orders/[poId]` (00 §1) |
| Who | Owner and managers (`CAN.suppliers`: owner, manager, judge) |
| Width | 1024 × 768 and 1280 × 800 landscape; every screen at 200 % zoom. 390 px is not required here, but nothing may be lost there. |
| Look | 02 §1: the scallop and swash title in the header; cards; tables like the snapshot drawer's (`.snap-table`) |
| Labels | "Simulated supplier" after every supplier name; "Recorded only — Munim does not process payments." beside every amount on a purchase order; "Simulated supplier: nothing is sent to a real business." on every order form |

The flow this screen carries, end to end:

1. "Running low" lists the stock at this outlet that is below its minimum (`inventory.below_reorder`).
2. Munim's purchasing watcher ran a simulated negotiation with the simulated suppliers and drafted a purchase order
   (`purchasing.po.create.v1`). Its quantity and its price are cells of the negotiation's quote comparison
   (`purchasing.quote_compare`), each with its source chip. That snapshot is minted under the negotiation run's
   outlet scope. When the run covers every outlet (the mock's case), the owner can open it and a manager of one outlet
   cannot: for them both numbers show "Cannot verify" and only "Reject" is offered (01 §6.1).
3. The owner reads the quotes, then taps "Approve as {name}", or "Edit" to type the price or quantity they agreed and
   "Approve with my edits as {name}". Core commits the purchase order and works out its total.
4. When the goods arrive, the owner or a manager records them against the order (`purchasing.grn.receive.v1`). Core
   moves the stock and marks the order received once every line has come in.

A person can also place their own purchase order (§5.2). Nothing is ordered or received without a named person's tap.

## 1 · Purpose and who uses it

The owner restocks before something runs out, compares what the simulated suppliers offered, and keeps every price
their own: the AI proposes a quantity and a price, each with its source, and the person approves them or types their
own. Managers do the same for
their outlets. Counter and kitchen staff do not open these screens.

| Action | owner | manager | staff | judge | Grounded in |
|---|---|---|---|---|---|
| Open the three routes | yes | yes | **no** | yes | `CAN.suppliers` (01 §8). Staff get "role-not-allowed" |
| "Running low" and the quotes (snapshots) | yes | yes | — | yes | `inventory.below_reorder` and `purchasing.quote_compare` are manager and up |
| Approve, approve with my edits, reject a proposed PO | yes | yes (Reject only when they cannot open the quotes) | — | yes | `drafts.approve.v1` and `purchasing.po.create.v1` are `{owner, manager, judge}` (01 §6.1) |
| Place own purchase order | yes | yes | — | yes | `purchasing.po.create.v1` |
| Record goods received | yes | yes | (core allows staff) | yes | `purchasing.grn.receive.v1` is `{owner, manager, staff, judge}`, but `CAN.suppliers` hides the screen from staff (§10) |
| Supplier price lists | yes | yes | (empty for staff) | yes | `GET /v1/suppliers` sends `prices: []` to staff |

## 2 · Routes and layout

Each route is a thin `app/staff/.../page.tsx` that renders a client component from `components/staff/pages/` (02 §3):
`SuppliersScreen`, `SupplierScreen` and `PurchaseOrderScreen`. Each reads `session`, `client`, `outlet`, `outlets` and
`handleAuth` from `useStaff()`. `fmt` is `{ locale: SITE.locale, currency: tenant.base_currency }` and `tz` is
`outlet.tz`. A `supplierId` or `poId` that is not a lowercase UUIDv7 shows "Not found." with no call.

### 2.1 `/staff/suppliers`

Top to bottom, in `.staff-main`:

1. **Header.** A swash `.section-title` with "Suppliers", the `.scallop` edge, and the line "Every supplier here is
   simulated. Quotes and orders are part of the demo; nothing is sent to a real business." On the right: "New
   purchase order" (primary) and "Refresh".
2. **"Running low"**: one row per `inventory.below_reorder` row for this outlet (`lowRowsFor`). Each row shows the
   name, then on hand, minimum and par, each with its chip, in the ingredient's base unit, and "Order this".
3. **"Proposed by Munim"**: one `PoDraftCard` per proposed purchase order for this outlet.
4. **"New purchase order"**: `NewPoForm`, opened in place by the header button or by "Order this".
5. **"Purchase orders"**: the purchase orders touching this outlet, newest first (the API's order). Each row has the
   supplier name with its badge, the status pill (`PO_STATUS`), "Expected {date}", the total (`total_minor`, a row
   field, with "Recorded only — Munim does not process payments.") and "Placed {day time}". The row links to
   `/staff/purchase-orders/{po_id}`.
6. **"Suppliers"**: one card per supplier, with its name and badge, "Pay within {payment_days} days" (when set),
   "Not active" when `active` is false, and a link to `/staff/suppliers/{supplier_id}`.

**At 1280 × 800:** from 1100 px wide, two columns, `minmax(0, 2fr) minmax(320px, 1fr)`. The main column holds 2–5; the
side column holds 6, sticky under the staff bar. **At 1024 × 768:** one column in the order above. Tables scroll
sideways inside their card (`overflow-x: auto`); the page never does. Buttons are at least 48 px.

### 2.2 `/staff/suppliers/[supplierId]`

The header: the supplier's name with its badge, "Pay within {payment_days} days", the notes (plain text) and "Not
active". Then **"Price list"**: a table of `prices[]` (row fields: item, unit, "Price per unit", "Seen on {date}",
`source_ref` as plain text). Empty: "No prices recorded." Then **"Purchase orders"**: this supplier's orders (§2.1's
rows, kept where `supplier.supplier_id` matches), and "New purchase order", which opens `NewPoForm` with this supplier
chosen.

### 2.3 `/staff/purchase-orders/[poId]`

The header: "Purchase order", the supplier's name with its badge, the status pill, "For {outlet names}", "Expected
{date}" or "No expected date", "Placed {day time}" and, for an order Munim proposed, "Approved by {name} · {day time}"
(or "Approved with edits by …") from the order's lineage. Then the lines table: item, "Quantity", "Unit", "Price per
unit". These are row fields **side by side, never multiplied**. Under it: "Total (worked out by Munim)" =
`total_minor`, then "Recorded only — Munim does not process payments.". When `negotiation_run_id` is set, the
`<details>` "Quotes from simulated suppliers" holds a `QuoteTable`. Then **"Goods received"**: one block per goods-received
note against this order ("Received {day time}" + " · recorded by you" for your own, its lines with quantity, unit
and "Cost per unit", and the note as plain text). Empty: "Nothing received yet." Last, while `status` is
`committed`: `ReceiveForm`.

Outlet names come from the shell's `outlets` (the person's outlets). An outlet of a pooled order that is not among
them shows as "another outlet".

## 3 · Data loading

All calls go through `client` from `useStaff()`. Pass every failed result to `handleAuth` first.

**`/staff/suppliers`**

| When | Calls (in parallel unless numbered) | Then |
|---|---|---|
| Mount, and each time `outlet` changes | `getTenant()`, `listSuppliers()`, `listIngredients()`, `listPurchaseOrders()` (kept where `outlet_ids` includes `outlet.id`), `mintSnapshot({ template_id: "inventory.below_reorder", params: {} })` (kept with `lowRowsFor(snapshot, outlet.id)`), and (1) `listDrafts({ status: "proposed", outlet: outlet.id })`, kept with `isPoDraft`; (2) `getDraft(id)` for each; (3) for each distinct non-null `payload.negotiation_run_id`, `mintSnapshot({ template_id: "purchasing.quote_compare", params: quoteParams(id) })` | A proposal with `negotiation_run_id: null` shows "No quote comparison for this proposal." in place of the table |
| After an approve or reject outcome (§5.1) | The proposals chain (1)–(3), and `listPurchaseOrders()` | |
| After "Place order as …" succeeds | Navigate to `/staff/purchase-orders/{entity_id}` | |
| Live wake-up: `watchFor(session, [topic.inbox(session.tenantId)], wake, setLive)` (owner and manager) | The proposals chain (1)–(3) | `inbox.draft` events: a proposal decided on another tablet leaves the list |
| The tab becomes visible again, and "Refresh" | `listPurchaseOrders()` and the proposals chain | Snapshots are re-minted only on load, on outlet change and after a decision |

**`/staff/suppliers/[supplierId]`**: `getSupplier(supplierId)`, `listIngredients()` and `listPurchaseOrders()`. A
404 shows "Not found.".

**`/staff/purchase-orders/[poId]`**: `getTenant()`, `getPurchaseOrder(poId)`, `listIngredients()`,
`listGoodsReceived()` (kept where `po_id` equals this order's), `listSuppliers()` for the quote table, and
`getRowLineage("core.purchase_order:<po id>")` for who approved it, once the order has loaded (the chain that has a
`decision`; a 404 or a failure shows nothing). When
`negotiation_run_id` is set, also `mintSnapshot(purchasing.quote_compare, quoteParams(run))`. After goods are recorded
(or a 409 on that form), refetch the order and the goods received. There is no live topic for purchasing: refetch on
focus and "Refresh".

- The snapshot drawer (02 §4) is mounted once per page. Its `label` uses 02 §4's words, including
  `inventory.below_reorder` "Stock below its minimum" and `purchasing.quote_compare` "Quotes from simulated suppliers".
- **The quotes come only through a snapshot.** There is no quote endpoint. The proposal names its negotiation
  (`negotiation_run_id`), and the screen mints `purchasing.quote_compare` for this person. Their own snapshot is
  always one they may open, which the run's snapshot that the proposal cites (when the run covers every outlet) is not for a
  manager of one outlet.
- Names: lines and snapshot rows carry ids only. Items get their name and base unit from
  `GET /v1/inventory/ingredients` (`ingredientOf`); suppliers get theirs from `GET /v1/suppliers`. `received_by` is a
  member id: show "recorded by you" for your own, and nothing otherwise.

## 4 · Every state

### 4.1 Page states

| State | Shows |
|---|---|
| loading | The header, then skeleton rows and cards at their final size. `role="status"` "Loading" |
| error (one call failed) | That panel only: `ErrorNote` with `staffErrorText(error, "suppliers")`, then "Try again" |
| 401 | `handleAuth` signs out |
| 404 (supplier, order, or a bad id in the URL) | `FullPage` "Not found." with "It may have been removed, or it isn't in your outlets." |
| offline | `.offline-bar` "You're offline. Showing the last update." A command tapped offline fails with "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." (`staffWriteErrorText`), and its attempt is kept |
| live updates off | "Live updates are off. Tap Refresh to update." beside the title |
| role-not-allowed (`can(session, "suppliers")` false: counter and kitchen staff) | `FullPage` "Suppliers are for the owner and managers." with "Ask the owner if you need something ordered." No call is made |
| empty: nothing below its minimum | "Nothing at {outlet.name} is below its minimum." |
| empty: no proposals | "No proposals waiting." |
| empty: no purchase orders | `.state-box` "No purchase orders yet." (02 §9) |
| empty: no suppliers | "No suppliers yet." |
| a proposal without a negotiation | "No quote comparison for this proposal." |
| quotes cannot be opened (mint failed) | "The quotes can't be opened." The proposal's price still shows "Cannot verify" |

### 4.2 Statuses

| Thing | Status → word (tone) |
|---|---|
| Purchase order (`PO_STATUS`) | `committed` "Sent" (work) · `received` "Received" (done) · `cancelled` "Cancelled" (stop) |
| Proposal (`DRAFT_STATUS`) | `proposed` "Waiting for you" is the only status the panel lists. After a decision the card leaves on refetch, and an approved order shows under "Purchase orders" |
| Quote row | "Proposed" on the row the proposal's price cites (`poDraftLines`' `quoteRow`: the viewer's own comparison of the same negotiation lists the same quotes in the same order). No other judgement: no "cheapest", no "best", no "saves" |

### 4.3 "Cannot verify" and source chips

| Where | Traced value (source chip) | "Cannot verify" when |
|---|---|---|
| Running low | On hand (`on_hand_milli`), minimum (`min_qty_milli`), par (`par_qty_milli`), each a `SourcedValue` with `snapRef(snapshot_id, row, column)` and the base unit after it | The mint failed or a cell is missing |
| Supplier's reply | Not shown: no member route serves the reply text or the span each quoted number was read from (00 §7 question 24) | |
| Proposal quantity and price | `DraftField` with `draftValue(...)` (`poDraftLines`): each a ref into the run's quote comparison, with its chip that opens it | Not in `resolved_refs`, or in `unverified_refs` (a manager of one outlet, when the run's snapshot covers every outlet). Then the bar offers Reject only (`approveGate` `untraceable`) |
| Quote table | The whole table is one snapshot: its caption "Quotes from simulated suppliers" carries the chip (it opens the drawer on the cited row). The cells are that snapshot's rows, formatted by `formatCell` | The mint failed: "The quotes can't be opened." |
| Drawer | | 404: "Cannot verify — These rows can't be opened." |

Purchase order totals, line prices, goods-received costs and supplier price lists are **row fields** of the books,
shown as they are. Nothing here is added, multiplied or compared. There is no line total (quantity and price sit side
by side), no reorder quantity worked out from par and on hand, and no "cheaper by" between quotes. The quote snapshot
has no unit column (the quote row has one), so the table says "Units as quoted".

### 4.4 Refusals, by code and reason

| Answer | When | Copy (literal) | Then |
|---|---|---|---|
| 422 `cannot_verify` + `unresolved_ref` | A quote cell no longer traces for this person (core re-reads them on approve) | `ErrorNote` "Cannot verify — some numbers in this draft no longer trace to their source rows." | Refetch the draft |
| 422 `invalid_payload` | An edit whose `typed_by` is not the approver, or a ref swapped for another | "That didn't work. Please check and try again." | A bug: the edit builder (`withEdits`, 01 §6.1) never does this |
| 403 `forbidden` + `authority_denied` | A role or outlet that may not approve, place or receive | "Your role can't do this. Ask the owner." | |
| 409 `already_decided` | Someone decided it first | Toast "Someone else already decided this. It has been refreshed." | Refetch |
| 409 `stale_draft` | The quote comparison changed since it was proposed | Toast "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it." | Refetch: the stale proposal leaves the list |
| 422 `execution_failed` | Approved but not applied | `ErrorNote` "It was approved but could not be applied. Nothing changed." | |
| 409 `conflict` (no reason) on goods received | The order is already received or cancelled | "This purchase order was already received or cancelled. It has been refreshed." | Refetch the order |
| 400 `bad_request` on goods received | A batch-tracked item without a batch code (the form stops this), or a line that does not belong to the order | "Check each line's quantity and batch code, then try again." | |
| 400 `bad_request` on a new order | An unknown or inactive supplier, outlet or item | "That didn't work. Please check and try again." | Refetch the suppliers |
| 409 `idempotency_conflict` | Same key, different body | "That didn't go through. Please try again." | The next tap is a new attempt |
| 429 | | "Too many requests. Please wait a moment and try again." / "Try again in {s} s" | Then the same attempt |
| network / 5xx | | "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." / "Something went wrong on our side. Try again." | The same attempt on the next tap |

### 4.5 Simulated and recorded-only labels (a missing one is a bug)

- `SimulatedSupplier` ("Simulated supplier") after every supplier name: the suppliers list, the supplier page header,
  every purchase-order row and header, every proposal card title, every quote-table row, and every radio choice in
  `NewPoForm`. A `<select>` option cannot carry a badge, so the supplier is chosen with radio cards, each with its
  badge.
- "Recorded only — Munim does not process payments." beside every purchase-order total and on every order form and
  proposal card.
- "Simulated supplier: nothing is sent to a real business." on `NewPoForm` and every proposal card.
- The quote table's footnote: "Quotes from simulated suppliers, recorded during a simulated negotiation. Units as
  quoted."

## 5 · Every action

No update is optimistic. Each action is confirmed by the API, then the screen refetches (§3). Every button is disabled
while its request is in flight and reads "Saving…".

### 5.1 Decide a proposed purchase order

`PoDraftCard` (§7) with 02 §5's `DecisionBar` on 01 §6.1's `lib/munim/drafts.ts`, the same bar as the draft page
(12) and the Cares card (14). Which buttons show is `approveGate`'s answer:

| Tap | Sends | Attempt rule |
|---|---|---|
| "Approve as {name}" (while both numbers trace and nothing is typed) | `POST /v1/drafts/{id}:approve` with `drafts.approve.v1` `{ draft_id, command_type: "purchasing.po.create.v1", edited_payload: null, reason: null }` | `approveAttempt`: the same inputs again = the same envelope |
| "Edit", then a price ("Change it (optional) (INR)" under "Price per {unit}") and/or a quantity ("(kg)") typed, then "Why you changed it", then "Approve with my edits as {name}" | The same, with `edited_payload` = `withEdits(payload, edits, me.member_id)`: each typed number becomes `{ value, typed_by }`; untouched fields keep their ref | A new attempt whenever a typed value or the reason changes |
| "Reject", "Why reject it?" (a reason) and "What's wrong?" (a note), then "Reject as {name}" | `POST /v1/drafts/{id}:reject` with `drafts.reject.v1` `{ draft_id, reason, reason_code }` | `rejectAttempt` |

"Approve with my edits as {name}" is enabled once at least one value is typed (every untraced one, if any) and the
reason is filled (`editsReady`). Each typed value shows as "{value} Edited by {name}" beside the struck-through
proposal and its chip (02 §5). A manager who cannot open the quotes sees both numbers as "Cannot verify" and only
"Reject".

The approve answer's `type` is `purchasing.po.create.v1` and its `entity_id` is the new order. Toast "Approved. The
purchase order is recorded." with "Open the purchase order" linking to it. Core works out the total from the final
quantities and prices.

### 5.2 Place your own purchase order

`NewPoForm` (§7): choose a supplier (radio cards, each with "Simulated supplier"). For each line, choose an item and
type the quantity, unit and "Price per {unit} ({currency})". "Add another item" and "Remove this item" edit the
lines. "Expected on (optional)" is a date. Then "Place order as {name}". It sends `POST /v1/purchase-orders` with
`purchasing.po.create.v1` (`newPoAttempt`): this outlet only, `negotiation_run_id: null`, `currency` =
`tenant.base_currency`. The answer is 201, and the screen navigates to the new order.

- "Order this" on a "Running low" row opens the form with that item on the first line. **The quantity is never
  filled in**: par minus on hand would be arithmetic in the browser. The on-hand, minimum and par cells stay visible
  on the row, each with its chip.
- Under each price input, the chosen supplier's latest price observation for that item and unit is shown as its own
  row: "{source_ref}: {money} per {unit} · {date}". It is never copied into the input.
- "Munim works out the total when you place it." No total is shown before the order exists.

### 5.3 Record goods received

`ReceiveForm` (§7), on a `committed` order:

- "Received at": shown only when the order has more than one of the person's outlets.
- "What came in?": "Everything on this order" (only before anything has come in against it: `canReceiveInFull`) or
  "Part of it", with "How much came in? ({unit})" typed per line. Lines left empty are not sent.
- For a batch-tracked item, a "Batch code" (required) and "Use by (optional)". The button stays disabled until every
  such line has a code.
- "Note (optional)", then "Record as received by {name}".

It sends `POST /v1/goods-received` with `purchasing.grn.receive.v1` (`receiveAttempt`), and the answer is 201. Each
line's cost is the order line's price (`unit_cost_minor: null`); `received_at: null` lets core stamp it; the grn,
line and batch ids are minted inside the attempt. Toast "Goods received. Stock is updated." Then refetch. The status
turns "Received" once every line has come in (core decides that, and only for someone who sees all the order's
outlets).

### 5.4 Other taps

| Tap | Does |
|---|---|
| A source chip | Opens the snapshot drawer on that cell |
| A purchase-order row | `/staff/purchase-orders/{po_id}` |
| A supplier card | `/staff/suppliers/{supplier_id}` |
| "Refresh", "Try again" | §3's refresh row; that panel's calls again |

## 6 · Copy

Literal strings, in "double quotes". Strings already in 01 §9 and 02 are used as they are, not repeated here.

| Where | Copy |
|---|---|
| Header | "Suppliers" · "Every supplier here is simulated. Quotes and orders are part of the demo; nothing is sent to a real business." · "New purchase order" · "Refresh" |
| Role | "Suppliers are for the owner and managers." · "Ask the owner if you need something ordered." |
| Running low | Title "Running low" · "On hand {qty} {unit} [Source]" · "Minimum {qty} {unit} [Source]" · "Par {qty} {unit} [Source]" · "Order this" · empty "Nothing at {outlet} is below its minimum." |
| Proposals | Title "Proposed by Munim" · card "Order from {supplier}" · "For" · "Expected" · "Not set" · "Quantity ({unit})" · "Price per {unit}" · "Munim works out the total when it is approved. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business." · `<summary>` "Quotes from simulated suppliers" · "The quotes can't be opened." · "No quote comparison for this proposal." · lineage "Proposed by Stock & Purchasing · {time}" · empty "No proposals waiting." · "a supplier no longer listed" |
| Quote table | Caption "Quotes from simulated suppliers [Source]" · columns "Supplier", "Round", "Price per unit, as quoted", "Quantity", "Smallest order", "Pay within (days)" · "Proposed" · "Quotes from simulated suppliers, recorded during a simulated negotiation. Units as quoted." · "No quotes were recorded for this negotiation." · "A supplier no longer listed" |
| Decision bar | 02 §5's `DecisionBar` ("Approve as {name}", "Edit", "Approve with my edits as {name}", "Why you changed it", "Why reject it?", "Reject as {name}", …) |
| New order | Title "New purchase order" · "Supplier" · "pay within {days} days" · "Item" · "Choose a stock item" · "Quantity" · "Unit" · "Price per {unit} ({currency})" · "{source_ref}: {money} per {unit} · {date}" · "Remove this item" · "Add another item" · "Expected on (optional)" · "Munim works out the total when you place it. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business." · "Place order as {name}" |
| Orders list | Title "Purchase orders" · "Expected {date}" · "Placed {day time}" · "Recorded only — Munim does not process payments." · empty "No purchase orders yet." |
| Suppliers list | Title "Suppliers" · "Pay within {days} days" · "Not active" · empty "No suppliers yet." |
| Supplier page | "Price list" · columns "Item", "Unit", "Price per unit", "Seen on" · "No prices recorded." · "Purchase orders" |
| Order page | "Purchase order" · "For {outlets}" · "another outlet" · "Expected {date}" · "No expected date" · "Placed {day time}" · "{Approved / Approved with edits} by {name} · {day time}" · columns "Item", "Quantity", "Unit", "Price per unit" · "Total (worked out by Munim)" · "Recorded only — Munim does not process payments." · "Goods received" · "Received {day time}" · " · recorded by you" · "Cost per unit" · "Nothing received yet." |
| Receive form | Title "Record goods received" · "Received at" · "What came in?" · "Everything on this order" · "Part of it" · "How much came in? ({unit})" · "Batch code" · "Use by (optional)" · "Note (optional)" · "Record as received by {name}" |
| Toasts | "Approved. The purchase order is recorded." + link "Open the purchase order" · "Goods received. Stock is updated." · plus the 01 §9 lines for 409s |

## 7 · Code

Save each block at its path. They typecheck against the 0.2.0 SDK, Cobnut's code and 01–03 (§10). The decision
pieces are 01 §6.1's `lib/munim/drafts.ts` and 02 §5's `components/staff/decision.tsx`, shared with 12 and 14.
`components/staff/use-command.ts` is the same file as in 14 §7, printed again so this file stands alone: save it
once.

```ts
// file: lib/munim/supply-flow.ts
// Suppliers on the staff side (15): stock below its minimum, an AI purchase-order proposal and the simulated
// suppliers' quotes behind it, the approver's typed prices, a person's own purchase order, and goods received.
// Every supplier here is simulated. No line total, PO total, reorder quantity or "cheaper by" is worked out in the
// browser: core totals every PO, and a person types every quantity and price. Plain TypeScript, no React.
import type { MunimError } from "./client";
import { attemptFor, type CommandAttempt } from "./commands";
import { draftValue, parseRef, type DraftValue, type Snapshot } from "./refs";
import { staffErrorText } from "./staff-copy";
import type { Schemas } from "./types";
import { uuidv7 } from "./uuid";

type Draft = Schemas["V1Draft"];
export type Supplier = Schemas["V1Supplier"];
export type PurchaseOrder = Schemas["V1PurchaseOrder"];
export type GoodsReceived = Schemas["V1GoodsReceived"];
type Ingredient = Schemas["V1InventoryIngredients"]["items"][number];

/** Owner, manager and judge (CAN.suppliers; purchasing.po.create.v1 and drafts.approve.v1). */
export const SUPPLIER_ROLES = ["owner", "manager", "judge"] as const;

// ---- stock below its minimum (inventory.below_reorder rows: tenant-wide, so keep this outlet's) ----
export interface LowRow {
  row: number;
  ingredientId: string;
  /** The ingredient's own name (a text cell). */
  name: string;
}
export const lowRowsFor = (s: Snapshot, outletId: string): LowRow[] =>
  s.rows.flatMap((r, row) => (r.outlet_id === outletId && typeof r.ingredient_id === "string" ? [{ row, ingredientId: r.ingredient_id, name: String(r.ingredient_name ?? "") }] : []));

// ---- an AI purchase-order proposal (purchasing.po.create.v1 draft) ----
export type PoPayload = Extract<Draft["payload"], { po_id: string; negotiation_run_id: string | null }>;
export type PoDraft = Draft & { payload: PoPayload };
export const isPoDraft = (d: Draft): d is PoDraft => d.command_type === "purchasing.po.create.v1";

export interface PoDraftLine {
  index: number;
  line: PoPayload["lines"][number];
  /** Quantity and price are cells of the negotiation's quote comparison (core's negotiation review): each with its
   *  chip, or "Cannot verify" for a person who may not open that snapshot (the run's outlet scope). */
  qty: DraftValue;
  price: DraftValue;
  /** The quote comparison row the price cites. The viewer's own comparison of the same negotiation lists the same
   *  quotes in the same order (core sorts by round, then supplier), so this row is marked "Proposed" there. */
  quoteRow: number | null;
}
export function poDraftLines(d: PoDraft, unverified: readonly string[]): PoDraftLine[] {
  return d.payload.lines.map((line, index) => {
    const cited = parseRef(String(line.unit_price_minor));
    return {
      index,
      line,
      qty: draftValue(line.qty_milli, `/lines/${index}/qty_milli`, d.resolved_refs, unverified),
      price: draftValue(line.unit_price_minor, `/lines/${index}/unit_price_minor`, d.resolved_refs, unverified),
      quoteRow: cited?.kind === "snap" ? cited.row : null,
    };
  });
}

// ---- the simulated suppliers' quotes (purchasing.quote_compare, minted by the viewer for the negotiation) ----
export const quoteParams = (negotiationRunId: string) => ({ negotiation_run_id: negotiationRunId });
export interface QuoteRow {
  row: number;
  quoteId: string;
  supplierId: string;
}
export const quoteRows = (s: Snapshot): QuoteRow[] =>
  s.rows.flatMap((r, row) => (typeof r.quote_id === "string" && typeof r.supplier_id === "string" ? [{ row, quoteId: r.quote_id, supplierId: r.supplier_id }] : []));

// ---- a person's own purchase order (purchasing.po.create.v1) ----
export interface NewPoLine {
  ingredientId: string;
  /** Typed, in thousandths of `unit`. */
  qtyMilli: number;
  unit: string;
  /** Typed, in minor units per one `unit`. */
  unitPriceMinor: number;
}
export type CreatePoAttempt = CommandAttempt<"purchasing.po.create.v1", Schemas["PurchasingPoCreateV1"]>;
/** One outlet (the one the person is working in). Core numbers the lines and works out the total. */
export function newPoAttempt(prev: CreatePoAttempt | null, input: { supplierId: string; outletId: string; currency: string; expectedOn: string | null; lines: readonly NewPoLine[] }): CreatePoAttempt {
  return attemptFor(prev, JSON.stringify(["po", input]), "purchasing.po.create.v1", () => ({
    po_id: uuidv7(),
    supplier_id: input.supplierId,
    outlet_ids: [input.outletId],
    currency: input.currency,
    expected_on: input.expectedOn,
    negotiation_run_id: null,
    lines: input.lines.map((l) => ({ ingredient_id: l.ingredientId, qty_milli: l.qtyMilli, unit: l.unit, unit_price_minor: l.unitPriceMinor })),
  }));
}
/** Units a person may order in: the ingredient's base unit or the larger one core converts. */
export const orderUnits = (baseUnit: string): string[] => (baseUnit === "g" ? ["kg", "g"] : baseUnit === "ml" ? ["l", "ml"] : [baseUnit]);

// ---- goods received (purchasing.grn.receive.v1) ----
export interface ReceiveLine {
  poLineId: string;
  ingredientId: string;
  /** Typed, in thousandths of `unit` (or the PO line's own quantity for "Received in full"). */
  qtyMilli: number;
  unit: string;
  /** Required for a batch-tracked ingredient, null for the others (core refuses either mistake with 400). */
  batch: { code: string; expiresOn: string | null } | null;
}
/** "Received in full" sends each PO line's own quantity, so it is offered only before any goods came in against the PO
 *  (anything else would need "ordered minus received", which the browser never works out). */
export const canReceiveInFull = (po: PurchaseOrder, grns: readonly GoodsReceived[]): boolean =>
  po.status === "committed" && !grns.some((g) => g.po_id === po.po_id);
export const fullLines = (po: PurchaseOrder, ingredients: readonly Ingredient[], batch: (poLineId: string) => ReceiveLine["batch"]): ReceiveLine[] =>
  po.lines.map((l) => ({ poLineId: l.po_line_id, ingredientId: l.ingredient_id, qtyMilli: l.qty_milli, unit: l.unit, batch: ingredients.find((i) => i.ingredient_id === l.ingredient_id)?.tracked_by_batch ? batch(l.po_line_id) : null }));

export type ReceiveAttempt = CommandAttempt<"purchasing.grn.receive.v1", Schemas["PurchasingGrnReceiveV1"]>;
/** The cost of each line is the PO line's price (unit_cost_minor null); core stamps the time and the receiver. */
export function receiveAttempt(prev: ReceiveAttempt | null, po: PurchaseOrder, outletId: string, lines: readonly ReceiveLine[], note: string | null): ReceiveAttempt {
  return attemptFor(prev, JSON.stringify(["grn", po.po_id, outletId, lines, note]), "purchasing.grn.receive.v1", () => ({
    grn_id: uuidv7(),
    outlet_id: outletId,
    supplier_id: po.supplier.supplier_id,
    po_id: po.po_id,
    received_at: null,
    note,
    lines: lines.map((l) => ({
      grn_line_id: uuidv7(),
      po_line_id: l.poLineId,
      ingredient_id: l.ingredientId,
      qty_milli: l.qtyMilli,
      unit: l.unit,
      unit_cost_minor: null,
      currency: po.currency,
      batch: l.batch ? { batch_id: uuidv7(), batch_code: l.batch.code, expires_on: l.batch.expiresOn, mrp_minor: null } : null,
    })),
  }));
}

/** Goods-received refusals carry no reason code: name them here, by code. */
export function receiveErrorText(e: MunimError): string {
  if (e.code === "conflict" && !e.reasonCode) return "This purchase order was already received or cancelled. It has been refreshed.";
  if (e.code === "bad_request") return "Check each line's quantity and batch code, then try again.";
  return staffErrorText(e, "suppliers");
}

/** An ingredient's name and base unit; lines and rows carry ids only. */
export const ingredientOf = (ingredients: readonly Ingredient[], id: string): { name: string; baseUnit: string } => {
  const i = ingredients.find((x) => x.ingredient_id === id);
  return { name: i?.name ?? "Stock item", baseUnit: i?.base_unit ?? "" };
};
```

```ts
// file: components/staff/use-command.ts
"use client";
// One person's command from a form (publish a listing, record a hand-over, withdraw, place a purchase order, receive
// goods): one frozen attempt per thing confirmed (01 §4). Tapping the same button again after a network error, 429
// or 5xx resends the same envelope (the attempt's fingerprint is unchanged); any change to the form is a new attempt.
// A 429 disables the button for Retry-After and shows the wait. A network failure may have reached core, so its line is
// the write one (01 §9 staffWriteErrorText): the same tap is safe.
import { useRef, useState } from "react";
import { useCountdown } from "@/lib/hooks";
import type { MunimError, Result } from "@/lib/munim/client";
import { retryable, type CommandAttempt, type Envelope } from "@/lib/munim/commands";
import { staffWriteErrorText, type StaffWhere } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";

export function useCommand<T extends string, P>(where: StaffWhere, onAuth: (e: MunimError) => boolean) {
  const attempt = useRef<CommandAttempt<T, P> | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt, () => setRetryAt(null));

  /** Builds (or reuses) the attempt and sends it. null = a send was already in flight (a double tap). */
  const send = async (
    make: (prev: CommandAttempt<T, P> | null) => CommandAttempt<T, P>,
    call: (body: Envelope<T, P>) => Promise<Result<Schemas["CommandResult"]>>,
    text: (e: MunimError) => string = (e) => staffWriteErrorText(e, where),
  ): Promise<Result<Schemas["CommandResult"]> | null> => {
    if (inFlight.current) return null;
    const a = make(attempt.current);
    attempt.current = a;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const r = await call(a.body);
    inFlight.current = false;
    setBusy(false);
    if (r.ok || !retryable(r.error)) attempt.current = null;
    if (!r.ok && !onAuth(r.error)) {
      setError(text(r.error));
      if (r.error.retryAfterMs) setRetryAt(Date.now() + r.error.retryAfterMs);
    }
    return r;
  };
  return { busy, error, wait, send, reset: () => { attempt.current = null; setError(null); } };
}
```

```tsx
// file: components/staff/suppliers/quotes.tsx
"use client";
// The simulated suppliers' quotes in one negotiation: a purchasing.quote_compare snapshot the viewer minted, shown as
// its rows in the order core sorted them (round, then supplier). The whole table is that snapshot, so its caption
// carries the one source chip; the browser compares nothing (no "cheapest", no "saves").
import { formatCell, snapRef, type CellFormat, type Snapshot } from "@/lib/munim/refs";
import { quoteRows, type Supplier } from "@/lib/munim/supply-flow";
import { SimulatedSupplier, SourcedValue, StatusPill } from "../source";

const COLUMNS = [
  { name: "round", label: "Round" },
  { name: "unit_price_minor", label: "Price per unit, as quoted" },
  { name: "qty_milli", label: "Quantity" },
  { name: "min_order_qty_milli", label: "Smallest order" },
  { name: "payment_days", label: "Pay within (days)" },
] as const;

export function QuoteTable({ snapshot, suppliers, citedRow, fmt, onOpen }: {
  snapshot: Snapshot;
  suppliers: readonly Supplier[];
  /** The row the proposal's price cites (poDraftLines' quoteRow): it is marked "Proposed". */
  citedRow: number | null;
  fmt: CellFormat;
  onOpen: (snapshotId: string, refToken: string) => void;
}) {
  const rows = quoteRows(snapshot);
  if (rows.length === 0) return <p className="text-muted">No quotes were recorded for this negotiation.</p>;
  const cited = rows.find((r) => r.row === citedRow) ?? rows[0]!;
  return (
    <div className="overflow-x-auto">
      <table className="snap-table">
        <caption className="pb-2 text-left font-semibold">
          <SourcedValue text="Quotes from simulated suppliers" refToken={snapRef(snapshot.snapshot_id, cited.row, "unit_price_minor")} onOpen={onOpen} />
        </caption>
        <thead>
          <tr><th scope="col">Supplier</th>{COLUMNS.map((c) => <th key={c.name} scope="col" className="num">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const s = suppliers.find((x) => x.supplier_id === q.supplierId);
            return (
              <tr key={q.quoteId} aria-current={q.row === citedRow ? "true" : undefined}>
                <td>
                  <span className="flex flex-wrap items-center gap-2">{s?.name ?? "A supplier no longer listed"} <SimulatedSupplier />{q.row === citedRow && <StatusPill tone="new">Proposed</StatusPill>}</span>
                </td>
                {COLUMNS.map((c) => <td key={c.name} className="num">{formatCell(snapshot.rows[q.row]![c.name] ?? null, c.name, fmt)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[14px] text-muted">Quotes from simulated suppliers, recorded during a simulated negotiation. Units as quoted.</p>
    </div>
  );
}
```

```tsx
// file: components/staff/suppliers/po-draft.tsx
"use client";
// An AI proposal to buy from a simulated supplier (a purchasing.po.create.v1 draft). Its quantity and price are cells
// of the negotiation's quote comparison, each with its source chip. It changes nothing until a person taps "Approve as
// …" or "Approve with my edits as …" (a typed price or quantity, labelled as theirs); the buttons follow 01 §6.1's
// approveGate, so someone who cannot open the quotes is offered Reject only.
import { useState } from "react";
import { approveGate, lineageLine, numericFields, withEdits, type Outcome } from "@/lib/munim/drafts";
import { formatDate, formatDayTime } from "@/lib/munim/format";
import type { CellFormat, Snapshot } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { DRAFT_STATUS, specialistName } from "@/lib/munim/staff-copy";
import { ingredientOf, poDraftLines, type PoDraft, type Supplier } from "@/lib/munim/supply-flow";
import type { Schemas } from "@/lib/munim/types";
import { DecisionBar, useDecision } from "../decision";
import { DraftField } from "../draft-field";
import { DRAFT_TONE, SimulatedSupplier, StatusPill } from "../source";
import { QuoteTable } from "./quotes";

type Detail = Schemas["V1DraftDetail"] & { draft: PoDraft };

export function PoDraftCard({ detail, quotes, suppliers, ingredients, outletName, session, client, fmt, tz, onOpen, onOutcome }: {
  detail: Detail;
  /** purchasing.quote_compare minted for this viewer with the proposal's negotiation_run_id; null while loading;
   *  "none" for a proposal that names no negotiation run. */
  quotes: Snapshot | null | "failed" | "none";
  suppliers: readonly Supplier[];
  ingredients: readonly Schemas["V1InventoryIngredients"]["items"][number][];
  outletName: (id: string) => string;
  session: Session;
  client: StaffClient;
  fmt: CellFormat;
  tz: string;
  onOpen: (snapshotId: string, refToken: string) => void;
  onOutcome: (o: Outcome) => void;
}) {
  const d = detail.draft;
  const lines = poDraftLines(d, detail.unverified_refs);
  const supplier = suppliers.find((s) => s.supplier_id === d.payload.supplier_id);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const dec = useDecision(client, d, "suppliers", onOutcome);
  const gate = approveGate(detail, numericFields(detail), session.me);
  const proposer = specialistName(d.source.replace(/^intel:/, ""));
  const put = (path: string) => (v: number | null) =>
    setEdits((e) => { const n = { ...e }; if (v === null) delete n[path]; else n[path] = v; return n; });

  return (
    <article className="card grid gap-3 p-5" aria-label="Proposed purchase order">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[22px]">Order from {supplier?.name ?? "a supplier no longer listed"}</h3>
        <SimulatedSupplier />
        <StatusPill tone={DRAFT_TONE[d.status] ?? "new"}>{DRAFT_STATUS[d.status] ?? d.status}</StatusPill>
        <span className="text-muted">· {proposer}</span>
      </header>
      <div className="draft-field"><p className="font-semibold">For</p><p>{d.payload.outlet_ids.map(outletName).join(", ")}</p></div>
      <div className="draft-field"><p className="font-semibold">Expected</p><p>{d.payload.expected_on ? formatDate(d.payload.expected_on, fmt.locale) : "Not set"}</p></div>
      {lines.map((l) => {
        const ing = ingredientOf(ingredients, l.line.ingredient_id);
        return (
          <div key={l.index} className="rounded-[var(--radius-field)] border-[1.5px] border-bg-deep p-3">
            <p className="font-semibold">{ing.name}</p>
            <DraftField label={`Quantity (${l.line.unit})`} value={l.qty} column="qty_milli" fmt={fmt} onOpen={onOpen}
              lineUnit={l.line.unit} edit={edits[`/lines/${l.index}/qty_milli`] ?? null} editorName={session.me.name} editing={editing} onEdit={put(`/lines/${l.index}/qty_milli`)} />
            <DraftField label={`Price per ${l.line.unit}`} value={l.price} column="unit_price_minor" fmt={fmt} onOpen={onOpen}
              edit={edits[`/lines/${l.index}/unit_price_minor`] ?? null} editorName={session.me.name} editing={editing} onEdit={put(`/lines/${l.index}/unit_price_minor`)} />
          </div>
        );
      })}
      <p className="text-[14px] text-muted">Munim works out the total when it is approved. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business.</p>
      <details open>
        <summary className="min-h-12 cursor-pointer font-semibold">Quotes from simulated suppliers</summary>
        <div className="mt-3">
          {quotes === null ? <div className="skeleton h-24" role="status" aria-label="Loading" />
            : quotes === "none" ? <p className="text-muted">No quote comparison for this proposal.</p>
            : quotes === "failed" ? <p className="text-muted">The quotes can&apos;t be opened.</p>
            : <QuoteTable snapshot={quotes} suppliers={suppliers} citedRow={lines[0]?.quoteRow ?? null} fmt={fmt} onOpen={onOpen} />}
        </div>
      </details>
      <p className="lineage">{lineageLine(detail, (iso) => formatDayTime(iso, tz, fmt.locale), null)}</p>
      <DecisionBar
        name={session.me.name} gate={gate} commandType={d.command_type} edits={edits} editing={editing}
        onEdit={(on) => { setEditing(on); if (!on) setEdits({}); }}
        busy={dec.busy} error={dec.error} retry={dec.retry} wait={dec.wait}
        onApprove={() => dec.approve(null, null)}
        onApproveEdited={(reason) => dec.approve(withEdits(d.payload, edits, session.me.member_id), reason)}
        onReject={dec.reject}
      />
    </article>
  );
}
```

```tsx
// file: components/staff/suppliers/new-po.tsx
"use client";
// A person's own purchase order (purchasing.po.create.v1: owner, manager) to a simulated supplier, for the outlet they
// are working in. They choose the supplier and type every quantity and price; the supplier's last price observation is
// shown beside the price as its own row, never copied in. Core numbers the lines and works out the total.
import { useState } from "react";
import type { MunimError } from "@/lib/munim/client";
import { dayKey, formatDate, formatMoney } from "@/lib/munim/format";
import { parseTyped } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { newPoAttempt, orderUnits, type NewPoLine, type Supplier } from "@/lib/munim/supply-flow";
import type { Schemas } from "@/lib/munim/types";
import { uuidv7 } from "@/lib/munim/uuid";
import { ErrorNote } from "../../ui";
import { SimulatedSupplier } from "../source";
import { useCommand } from "../use-command";

interface Draft {
  key: string;
  ingredientId: string;
  qty: string;
  unit: string;
  price: string;
}

export function NewPoForm({ suppliers, ingredients, outletId, currency, locale, tz, prefillIngredient, session, client, onAuth, onCreated }: {
  suppliers: readonly Supplier[];
  ingredients: readonly Schemas["V1InventoryIngredients"]["items"][number][];
  outletId: string;
  /** The business's base currency (GET /v1/tenant). */
  currency: string;
  locale: string;
  /** The outlet's zone, for the price observation's date. */
  tz: string;
  /** "Order this" on a below-minimum row: that ingredient is the first line (its quantity is never filled in). */
  prefillIngredient: string | null;
  session: Session;
  client: StaffClient;
  onAuth: (e: MunimError) => boolean;
  onCreated: (poId: string) => void;
}) {
  const fresh = (ingredientId = ""): Draft => ({ key: uuidv7(), ingredientId, qty: "", unit: "", price: "" });
  const [supplierId, setSupplierId] = useState(suppliers.find((s) => s.active)?.supplier_id ?? "");
  const [lines, setLines] = useState<Draft[]>(() => [fresh(prefillIngredient ?? "")]);
  const [expectedOn, setExpectedOn] = useState("");
  const cmd = useCommand<"purchasing.po.create.v1", Schemas["PurchasingPoCreateV1"]>("suppliers", onAuth);
  const supplier = suppliers.find((s) => s.supplier_id === supplierId);
  const set = (key: string, patch: Partial<Draft>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); cmd.reset(); };
  const unitOf = (l: Draft) => { const units = orderUnits(ingredients.find((i) => i.ingredient_id === l.ingredientId)?.base_unit ?? ""); return units.includes(l.unit) ? l.unit : (units[0] ?? ""); };
  const parsed: (NewPoLine | null)[] = lines.map((l) => {
    const q = parseTyped(l.qty, "qty_milli", currency);
    const p = parseTyped(l.price, "unit_price_minor", currency);
    return l.ingredientId && q && p !== null ? { ingredientId: l.ingredientId, qtyMilli: q, unit: unitOf(l), unitPriceMinor: p } : null;
  });
  const ready = supplierId !== "" && parsed.every((p) => p !== null);
  /** The supplier's latest price observation for this ingredient in this unit (prices come oldest first). */
  const lastPrice = (l: Draft) => supplier?.prices.filter((p) => p.ingredient_id === l.ingredientId && p.unit === unitOf(l)).at(-1) ?? null;

  const place = async () => {
    if (!ready) return;
    const input = { supplierId, outletId, currency, expectedOn: expectedOn === "" ? null : expectedOn, lines: parsed as NewPoLine[] };
    const r = await cmd.send((prev) => newPoAttempt(prev, input), (body) => client.createPurchaseOrder(body));
    if (r?.ok) onCreated(r.data.entity_id);
  };

  return (
    <section className="card grid gap-4 p-5" aria-labelledby="new-po">
      <h2 id="new-po" className="text-[24px]">New purchase order</h2>
      <fieldset className="grid gap-2">
        <legend className="font-semibold">Supplier</legend>
        {suppliers.filter((s) => s.active).map((s) => (
          <label key={s.supplier_id} className="choice flex flex-wrap items-center gap-2">
            <input type="radio" name="po-supplier" checked={supplierId === s.supplier_id} onChange={() => { setSupplierId(s.supplier_id); cmd.reset(); }} />
            {s.name} {s.label && <SimulatedSupplier />}
            {s.payment_days !== null && <span className="text-muted">· pay within {s.payment_days} days</span>}
          </label>
        ))}
      </fieldset>
      {lines.map((l) => {
        const units = orderUnits(ingredients.find((i) => i.ingredient_id === l.ingredientId)?.base_unit ?? "");
        const p = lastPrice(l);
        return (
          <div key={l.key} className="grid gap-2 rounded-[var(--radius-field)] border-[1.5px] border-bg-deep p-3">
            <label className="block font-semibold">
              Item
              <select value={l.ingredientId} onChange={(e) => set(l.key, { ingredientId: e.target.value, unit: "" })}>
                <option value="">Choose a stock item</option>
                {ingredients.filter((i) => i.active).map((i) => <option key={i.ingredient_id} value={i.ingredient_id}>{i.name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="block font-semibold">
                Quantity
                <input inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} />
              </label>
              {units.length > 1 && (
                <label className="block font-semibold">
                  Unit
                  <select value={unitOf(l)} onChange={(e) => set(l.key, { unit: e.target.value })}>
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
              )}
              <label className="block font-semibold">
                Price per {unitOf(l) || "unit"} ({currency})
                <input inputMode="decimal" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} />
              </label>
            </div>
            {p && <p className="text-[14px] text-muted">{p.source_ref}: {formatMoney(p.unit_price_minor, p.currency, locale)} per {p.unit} · {formatDate(dayKey(p.observed_at, tz), locale)}</p>}
            {lines.length > 1 && <button type="button" className="btn btn-plain justify-self-start" onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); cmd.reset(); }}>Remove this item</button>}
          </div>
        );
      })}
      <button type="button" className="btn btn-plain justify-self-start" onClick={() => { setLines((ls) => [...ls, fresh()]); cmd.reset(); }}>Add another item</button>
      <label className="block font-semibold">
        Expected on (optional)
        <input type="date" value={expectedOn} onChange={(e) => { setExpectedOn(e.target.value); cmd.reset(); }} />
      </label>
      <p className="text-[14px] text-muted">Munim works out the total when you place it. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business.</p>
      <button type="button" className="btn btn-primary justify-self-start" disabled={!ready || cmd.busy || cmd.wait > 0} onClick={() => void place()}>
        {cmd.busy ? "Saving…" : cmd.wait > 0 ? `Try again in ${cmd.wait} s` : `Place order as ${session.me.name}`}
      </button>
      {cmd.error && <ErrorNote>{cmd.error}</ErrorNote>}
    </section>
  );
}
```

```tsx
// file: components/staff/suppliers/receive.tsx
"use client";
// Goods received against a purchase order (purchasing.grn.receive.v1): the person types what came in (or "Received in
// full" before anything has come in), with a batch code for batch-tracked stock. Core prices each line from the PO,
// moves the stock and marks the PO received once every line has come in. Nothing is worked out here.
import { useState } from "react";
import type { MunimError } from "@/lib/munim/client";
import { parseTyped } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { canReceiveInFull, fullLines, ingredientOf, receiveAttempt, receiveErrorText, type GoodsReceived, type PurchaseOrder, type ReceiveLine } from "@/lib/munim/supply-flow";
import type { Schemas } from "@/lib/munim/types";
import { ErrorNote } from "../../ui";
import { useCommand } from "../use-command";

export function ReceiveForm({ po, grns, outlets, ingredients, session, client, currency, onAuth, onDone }: {
  po: PurchaseOrder;
  /** Goods already received against this PO (GET /v1/goods-received, filtered by po_id). */
  grns: readonly GoodsReceived[];
  /** The PO's outlets the person works in; goods come in at one of them. */
  outlets: readonly { id: string; name: string }[];
  ingredients: readonly Schemas["V1InventoryIngredients"]["items"][number][];
  session: Session;
  client: StaffClient;
  currency: string;
  onAuth: (e: MunimError) => boolean;
  /** Refetch the PO and its goods received; `text` is the toast, null when the error note already says it. */
  onDone: (text: string | null) => void;
}) {
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [chosenMode, setMode] = useState<"full" | "part">("full");
  // "Everything on this order" exists only before anything has come in against it.
  const mode = canReceiveInFull(po, grns) ? chosenMode : "part";
  const [qty, setQty] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<Record<string, { code: string; expiresOn: string }>>({});
  const [note, setNote] = useState("");
  const cmd = useCommand<"purchasing.grn.receive.v1", Schemas["PurchasingGrnReceiveV1"]>("suppliers", onAuth);
  const tracked = (ingredientId: string) => ingredients.find((i) => i.ingredient_id === ingredientId)?.tracked_by_batch === true;
  const batchOf = (poLineId: string): ReceiveLine["batch"] => {
    const b = batch[poLineId];
    return b && b.code.trim() !== "" ? { code: b.code.trim(), expiresOn: b.expiresOn === "" ? null : b.expiresOn } : null;
  };
  const lines: ReceiveLine[] = mode === "full"
    ? fullLines(po, ingredients, batchOf)
    : po.lines.flatMap((l) => {
        const q = parseTyped(qty[l.po_line_id] ?? "", "qty_milli", currency);
        return q ? [{ poLineId: l.po_line_id, ingredientId: l.ingredient_id, qtyMilli: q, unit: l.unit, batch: tracked(l.ingredient_id) ? batchOf(l.po_line_id) : null }] : [];
      });
  const ready = outletId !== "" && lines.length > 0 && lines.every((l) => !tracked(l.ingredientId) || l.batch !== null);
  const edit = () => cmd.reset();

  const submit = async () => {
    const r = await cmd.send((prev) => receiveAttempt(prev, po, outletId, lines, note.trim() === "" ? null : note.trim()), (body) => client.receiveGoods(body), receiveErrorText);
    if (r?.ok) onDone("Goods received. Stock is updated.");
    else if (r && !r.ok && r.error.code === "conflict") onDone(null);
  };

  return (
    <section className="card grid gap-4 p-5" aria-labelledby="receive">
      <h2 id="receive" className="text-[24px]">Record goods received</h2>
      {outlets.length > 1 && (
        <label className="block font-semibold">
          Received at
          <select value={outletId} onChange={(e) => { setOutletId(e.target.value); edit(); }}>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      {canReceiveInFull(po, grns) && (
        <fieldset className="grid gap-2">
          <legend className="font-semibold">What came in?</legend>
          <label className="choice"><input type="radio" name="grn-mode" checked={mode === "full"} onChange={() => { setMode("full"); edit(); }} /> Everything on this order</label>
          <label className="choice"><input type="radio" name="grn-mode" checked={mode === "part"} onChange={() => { setMode("part"); edit(); }} /> Part of it</label>
        </fieldset>
      )}
      {po.lines.map((l) => {
        const ing = ingredientOf(ingredients, l.ingredient_id);
        return (
          <div key={l.po_line_id} className="grid gap-2 rounded-[var(--radius-field)] border-[1.5px] border-bg-deep p-3">
            <p className="font-semibold">{ing.name}</p>
            {mode === "part" && (
              <label className="block font-semibold">
                How much came in? ({l.unit})
                <input inputMode="decimal" value={qty[l.po_line_id] ?? ""} onChange={(e) => { setQty((q) => ({ ...q, [l.po_line_id]: e.target.value })); edit(); }} />
              </label>
            )}
            {tracked(l.ingredient_id) && (
              <div className="flex flex-wrap gap-3">
                <label className="block font-semibold">
                  Batch code
                  <input value={batch[l.po_line_id]?.code ?? ""} maxLength={60} onChange={(e) => { setBatch((b) => ({ ...b, [l.po_line_id]: { code: e.target.value, expiresOn: b[l.po_line_id]?.expiresOn ?? "" } })); edit(); }} />
                </label>
                <label className="block font-semibold">
                  Use by (optional)
                  <input type="date" value={batch[l.po_line_id]?.expiresOn ?? ""} onChange={(e) => { setBatch((b) => ({ ...b, [l.po_line_id]: { code: b[l.po_line_id]?.code ?? "", expiresOn: e.target.value } })); edit(); }} />
                </label>
              </div>
            )}
          </div>
        );
      })}
      <label className="block font-semibold">
        Note (optional)
        <textarea rows={2} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); edit(); }} />
      </label>
      <button type="button" className="btn btn-primary justify-self-start" disabled={!ready || cmd.busy || cmd.wait > 0} onClick={() => void submit()}>
        {cmd.busy ? "Saving…" : cmd.wait > 0 ? `Try again in ${cmd.wait} s` : `Record as received by ${session.me.name}`}
      </button>
      {cmd.error && <ErrorNote>{cmd.error}</ErrorNote>}
    </section>
  );
}
```

The pages: `SuppliersScreen`, `SupplierScreen` and `PurchaseOrderScreen` (the loads in §3, the panels in §2, the
"Running low" rows with one `SourcedValue` per cell, the order and supplier lists, the toasts and the drawer) and their
three thin `page.tsx` files. `suppliers.tsx` also exports the pieces the other two reuse: the role and not-found
pages, the panel's waiting state and the purchase-order row.

```tsx
// file: components/staff/pages/suppliers.tsx
"use client";
// /staff/suppliers (15): stock below its minimum at this outlet, Munim's purchase-order proposals with the simulated
// suppliers' quotes behind them, a person's own purchase order, the purchase orders touching this outlet and the
// simulated suppliers. Every figure is a cell of a snapshot this screen minted (on load, on an outlet change and after
// a decision only: each mint writes a snapshot row) or a row field shown as it is; nothing is totalled, multiplied or
// compared here. Owners and managers only. Also exports the pieces the supplier and purchase-order pages reuse.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import type { Outcome } from "@/lib/munim/drafts";
import { formatDate, formatDayTime, formatMoney } from "@/lib/munim/format";
import { cellOf, formatCell, snapRef, type CellFormat, type Snapshot } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { watchFor } from "@/lib/munim/staff-app";
import { PO_STATUS, staffErrorText } from "@/lib/munim/staff-copy";
import { topic, type LiveState } from "@/lib/munim/staff-stream";
import { ingredientOf, isPoDraft, lowRowsFor, quoteParams, type PoDraft, type PurchaseOrder, type Supplier } from "@/lib/munim/supply-flow";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE } from "@/lib/site";
import { useStaff } from "../shell";
import { CannotVerify, SimulatedSupplier, SnapshotDrawer, SourcedValue, StatusPill, type PillTone } from "../source";
import { NewPoForm } from "../suppliers/new-po";
import { PoDraftCard } from "../suppliers/po-draft";
import { ErrorNote, FullPage, Toast, useToast } from "../../ui";

type Outlet = Schemas["V1Outlets"]["outlets"][number];
type Detail = Schemas["V1DraftDetail"] & { draft: PoDraft };
type OpenRef = (snapshotId: string, refToken: string) => void;
/** What every panel needs first: the tenant (currency), the simulated suppliers and the stock items (names, units). */
interface Base {
  tenant: Schemas["V1Tenant"];
  suppliers: Supplier[];
  ingredients: Schemas["V1InventoryIngredients"]["items"];
}
type PanelName = "base" | "low" | "proposals" | "orders";

const DECIDED_ELSEWHERE = "Someone else already decided this. It has been refreshed.";
const STALE = "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it.";
const RECORDED_ONLY = "Recorded only — Munim does not process payments.";
export const PO_TONE: Record<string, PillTone> = { committed: "work", received: "done", cancelled: "stop" };

/** The three supplier routes: the person's role cannot open them. No call is made. */
export function NotForSuppliers() {
  return (
    <FullPage title="Suppliers are for the owner and managers.">
      <p>Ask the owner if you need something ordered.</p>
    </FullPage>
  );
}

/** An unknown or malformed supplier or purchase-order id. */
export function NotFoundPage() {
  return (
    <FullPage title="Not found.">
      <p>It may have been removed, or it isn&apos;t in your outlets.</p>
    </FullPage>
  );
}

/** A panel that has no data yet: its error with "Try again", or a skeleton at the panel's size. */
export function PanelWait({ error, onRetry, height }: { error: MunimError | undefined; onRetry: () => void; height: string }) {
  if (!error) return <div className={`skeleton ${height}`} role="status" aria-label="Loading" />;
  return (
    <div className="space-y-2">
      <ErrorNote>{staffErrorText(error, "suppliers")}</ErrorNote>
      <button type="button" className="btn btn-plain" onClick={onRetry}>Try again</button>
    </div>
  );
}

/** One purchase order in a list: the supplier with its badge, the status, the expected date, the total core worked out
 *  (a row field) and when it was placed. Opens the order's page. */
export function PoRow({ po, tz }: { po: PurchaseOrder; tz: string }) {
  return (
    <li>
      <Link href={`/staff/purchase-orders/${po.po_id}`} className="card grid gap-1 p-4 text-ink no-underline">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {po.supplier.name} {po.supplier.label && <SimulatedSupplier />}
          <StatusPill tone={PO_TONE[po.status] ?? "new"}>{PO_STATUS[po.status] ?? po.status}</StatusPill>
        </span>
        {po.expected_on && <span>Expected {formatDate(po.expected_on, SITE.locale)}</span>}
        <span>
          <span className="num font-semibold">{formatMoney(po.total_minor, po.currency, SITE.locale)}</span>{" "}
          <span className="text-[14px] text-muted">{RECORDED_ONLY}</span>
        </span>
        <span className="text-[15px] text-muted">Placed {formatDayTime(po.created_at, tz, SITE.locale)}</span>
      </Link>
    </li>
  );
}

/** One cell of a snapshot this screen minted, with its source chip; "Cannot verify" when the cell is not there. */
function SnapCell({ snapshot, row, column, after, fmt, onOpen }: { snapshot: Snapshot; row: number; column: string; after: string; fmt: CellFormat; onOpen: OpenRef }) {
  const v = cellOf(snapshot, { kind: "snap", snapshotId: snapshot.snapshot_id, row, column });
  return v === undefined ? <CannotVerify /> : <SourcedValue text={`${formatCell(v, column, fmt)}${after}`} refToken={snapRef(snapshot.snapshot_id, row, column)} onOpen={onOpen} />;
}

export function SuppliersScreen() {
  const { session, outlet } = useStaff();
  if (!can(session, "suppliers")) return <NotForSuppliers />;
  if (!outlet) return <main className="wrap staff-main"><div className="state-box" role="status">Loading</div></main>;
  // A new outlet starts from nothing: every panel, form and pending answer belongs to the outlet it was loaded for.
  return <SuppliersOutlet key={outlet.id} outlet={outlet} />;
}

function SuppliersOutlet({ outlet }: { outlet: Outlet }) {
  const { session, client, outlets, handleAuth } = useStaff();
  const router = useRouter();
  const me = session.me;
  // inbox:<tenant> is owner and manager only.
  const watches = me.role === "owner" || me.role === "manager";
  const [base, setBase] = useState<Base | null>(null);
  const [low, setLow] = useState<Snapshot | null>(null);
  const [proposals, setProposals] = useState<Detail[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Snapshot | "failed">>({});
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [errors, setErrors] = useState<Partial<Record<PanelName, MunimError>>>({});
  const [form, setForm] = useState<{ prefill: string | null } | null>(null);
  const [approved, setApproved] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const [toast, setToast] = useToast();
  const online = useOnline();
  // The negotiations whose quotes this page has minted: a refresh, a focus or a live wake-up does not mint them again.
  const minted = useRef(new Set<string>());

  const fail = useCallback((panel: PanelName, e: MunimError) => {
    if (!handleAuth(e)) setErrors((x) => ({ ...x, [panel]: e }));
  }, [handleAuth]);
  const done = useCallback((panel: PanelName) => setErrors((x) => ({ ...x, [panel]: undefined })), []);

  const loadBase = useCallback(async () => {
    const [t, s, i] = await Promise.all([client.getTenant(), client.listSuppliers(), client.listIngredients()]);
    if (!(t.ok && s.ok && i.ok)) {
      const bad = [t, s, i].find((x) => !x.ok);
      if (bad && !bad.ok) fail("base", bad.error);
      return;
    }
    setBase({ tenant: t.data, suppliers: s.data.items, ingredients: i.data.items });
    done("base");
  }, [client, fail, done]);

  const loadOrders = useCallback(async () => {
    const r = await client.listPurchaseOrders();
    if (!r.ok) return fail("orders", r.error);
    setOrders(r.data.items.filter((p) => p.outlet_ids.includes(outlet.id)));
    done("orders");
  }, [client, outlet.id, fail, done]);

  const mintLow = useCallback(async () => {
    const r = await client.mintSnapshot({ template_id: "inventory.below_reorder", params: {} });
    if (!r.ok) return fail("low", r.error);
    setLow(r.data);
    done("low");
  }, [client, fail, done]);

  /** The proposals chain: (1) proposed drafts at this outlet, kept when they are purchase orders; (2) each one's
   *  detail (only it carries unverified_refs); (3) this person's own quote comparison for each negotiation, minted
   *  again only when `remint` (load and after a decision). */
  const loadProposals = useCallback(async (remint: boolean) => {
    const r = await client.listDrafts({ status: "proposed", outlet: outlet.id });
    if (!r.ok) return fail("proposals", r.error);
    const got = await Promise.all(r.data.items.map((i) => i.draft).filter(isPoDraft).map((d) => client.getDraft(d.draft_id)));
    const bad = got.find((x) => !x.ok);
    if (bad && !bad.ok) return fail("proposals", bad.error);
    const details: Detail[] = got.flatMap((x) => (x.ok && isPoDraft(x.data.draft) ? [{ ...x.data, draft: x.data.draft }] : []));
    setProposals(details);
    done("proposals");
    const runs = [...new Set(details.flatMap((d) => (d.draft.payload.negotiation_run_id ? [d.draft.payload.negotiation_run_id] : [])))];
    const minting = await Promise.all(runs.filter((run) => remint || !minted.current.has(run)).map(async (run) => {
      const q = await client.mintSnapshot({ template_id: "purchasing.quote_compare", params: quoteParams(run) });
      if (q.ok) minted.current.add(run);
      else handleAuth(q.error);
      return [run, q.ok ? q.data : "failed"] as const;
    }));
    if (minting.length > 0) setQuotes((prev) => ({ ...prev, ...Object.fromEntries(minting) }));
  }, [client, outlet.id, fail, done, handleAuth]);

  const loadAll = useCallback(() => {
    void loadBase();
    void loadOrders();
    void mintLow();
    void loadProposals(true);
  }, [loadBase, loadOrders, mintLow, loadProposals]);

  /** "Refresh" and focus: the purchase orders and the proposals. */
  const refresh = useCallback(() => {
    void loadOrders();
    void loadProposals(false);
  }, [loadOrders, loadProposals]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the responses
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [refresh]);

  useEffect(() => {
    if (!watches) return;
    return watchFor(session, [topic.inbox(session.tenantId)], () => void loadProposals(false), setLive);
  }, [watches, session, loadProposals]);

  if (errors.base && !base) {
    return (
      <main className="wrap staff-main space-y-3">
        <h1 className="section-title">Suppliers</h1>
        <ErrorNote>{staffErrorText(errors.base, "suppliers")}</ErrorNote>
        <button type="button" className="btn btn-plain" onClick={loadAll}>Try again</button>
      </main>
    );
  }

  const tz = outlet.tz;
  const fmt: CellFormat | null = base ? { locale: SITE.locale, currency: base.tenant.base_currency } : null;
  const open: OpenRef = (snapshotId, refToken) => setDrawer({ snapshotId, refToken });
  const offline = !online || Object.values(errors).some((e) => e?.kind === "network");
  const liveOff = watches && live !== "open" && live !== "connecting";
  const lowRows = low ? lowRowsFor(low, outlet.id) : [];
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "another outlet";

  const openForm = (prefill: string | null) => {
    setForm({ prefill });
    requestAnimationFrame(() => document.getElementById("new-po")?.scrollIntoView({ block: "start" }));
  };
  const onOutcome = (o: Outcome) => {
    if (o.kind === "signed_out") {
      handleAuth(o.error);
      return;
    }
    if (o.kind === "done" && o.type === "drafts.reject.v1") setToast("Rejected. Nothing was changed.");
    if (o.kind === "done" && o.type !== "drafts.reject.v1") {
      setToast("Approved. The purchase order is recorded.");
      setApproved(o.entityId);
    }
    if (o.kind === "decided_elsewhere") setToast(DECIDED_ELSEWHERE);
    if (o.kind === "stale") setToast(STALE);
    void loadProposals(true);
    void loadOrders();
  };

  return (
    <main className="wrap staff-main space-y-5">
      {offline && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="section-title">Suppliers</h1>
          <div className="flex flex-wrap items-center gap-3">
            {liveOff && <p className="text-[15px] text-muted" role="status">Live updates are off. Tap Refresh to update.</p>}
            <button type="button" className="btn btn-primary" disabled={!base} onClick={() => openForm(null)}>New purchase order</button>
            <button type="button" className="btn btn-plain" onClick={refresh}>Refresh</button>
          </div>
        </div>
        <div className="scallop" aria-hidden="true" />
        <p className="text-muted">Every supplier here is simulated. Quotes and orders are part of the demo; nothing is sent to a real business.</p>
      </header>

      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="low-title" className="space-y-3">
            <h2 id="low-title" className="text-[24px]">Running low</h2>
            {!low || !base || !fmt ? <PanelWait error={errors.low} onRetry={() => void mintLow()} height="h-32" />
              : lowRows.length === 0 ? <p className="state-box">Nothing at {outlet.name} is below its minimum.</p>
              : (
                <ul className="grid gap-3">
                  {lowRows.map((r) => {
                    const ing = ingredientOf(base.ingredients, r.ingredientId);
                    const unit = ing.baseUnit ? ` ${ing.baseUnit}` : "";
                    return (
                      <li key={r.ingredientId} className="card grid gap-2 p-4">
                        <p className="font-semibold">{r.name || ing.name}</p>
                        <p>
                          On hand <SnapCell snapshot={low} row={r.row} column="on_hand_milli" after={unit} fmt={fmt} onOpen={open} /> · Minimum{" "}
                          <SnapCell snapshot={low} row={r.row} column="min_qty_milli" after={unit} fmt={fmt} onOpen={open} /> · Par{" "}
                          <SnapCell snapshot={low} row={r.row} column="par_qty_milli" after={unit} fmt={fmt} onOpen={open} />
                        </p>
                        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => openForm(r.ingredientId)}>Order this</button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </section>

          <section aria-labelledby="proposals-title" className="space-y-3">
            <h2 id="proposals-title" className="text-[24px]">Proposed by Munim</h2>
            {approved && <Link href={`/staff/purchase-orders/${approved}`} className="btn btn-secondary">Open the purchase order</Link>}
            {!proposals || !base || !fmt ? <PanelWait error={errors.proposals} onRetry={() => void loadProposals(true)} height="h-48" />
              : proposals.length === 0 ? <p className="state-box">No proposals waiting.</p>
              : proposals.map((d) => {
                const run = d.draft.payload.negotiation_run_id;
                return (
                  <PoDraftCard
                    key={d.draft.draft_id} detail={d} quotes={run ? (quotes[run] ?? null) : "none"} suppliers={base.suppliers} ingredients={base.ingredients}
                    outletName={outletName} session={session} client={client} fmt={fmt} tz={tz} onOpen={open} onOutcome={onOutcome}
                  />
                );
              })}
          </section>

          {form && base && (
            <NewPoForm
              key={form.prefill ?? "blank"} suppliers={base.suppliers} ingredients={base.ingredients} outletId={outlet.id} currency={base.tenant.base_currency}
              locale={SITE.locale} tz={tz} prefillIngredient={form.prefill} session={session} client={client} onAuth={handleAuth}
              onCreated={(poId) => router.push(`/staff/purchase-orders/${poId}`)}
            />
          )}

          <section aria-labelledby="orders-title" className="space-y-3">
            <h2 id="orders-title" className="text-[24px]">Purchase orders</h2>
            {!orders ? <PanelWait error={errors.orders} onRetry={() => void loadOrders()} height="h-40" />
              : orders.length === 0 ? <div className="state-box"><p>No purchase orders yet.</p></div>
              : <ul className="grid gap-3">{orders.map((po) => <PoRow key={po.po_id} po={po} tz={tz} />)}</ul>}
          </section>
        </div>

        <aside aria-labelledby="suppliers-title" className="space-y-3 self-start min-[1100px]:sticky min-[1100px]:top-[132px]">
          <h2 id="suppliers-title" className="text-[24px]">Suppliers</h2>
          {!base ? <div className="skeleton h-40" role="status" aria-label="Loading" />
            : base.suppliers.length === 0 ? <p className="state-box">No suppliers yet.</p>
            : (
              <ul className="grid gap-3">
                {base.suppliers.map((s) => (
                  <li key={s.supplier_id}>
                    <Link href={`/staff/suppliers/${s.supplier_id}`} className="card grid gap-1 p-4 text-ink no-underline">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">{s.name} {s.label && <SimulatedSupplier />}</span>
                      {s.payment_days !== null && <span>Pay within {s.payment_days} days</span>}
                      {!s.active && <span className="text-muted">Not active</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </aside>
      </div>

      {fmt && <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />}
      <Toast message={toast} />
    </main>
  );
}
```

```tsx
// file: components/staff/pages/supplier.tsx
"use client";
// /staff/suppliers/[supplierId] (15): one simulated supplier, its recorded prices (row fields, shown as they are), its
// purchase orders touching this outlet, and a new purchase order to it. Owners and managers only.
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useOnline } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import { dayKey, formatDate, formatMoney } from "@/lib/munim/format";
import { can } from "@/lib/munim/session";
import { staffErrorText } from "@/lib/munim/staff-copy";
import { ingredientOf, type PurchaseOrder, type Supplier } from "@/lib/munim/supply-flow";
import type { Schemas } from "@/lib/munim/types";
import { SITE, UUID7 } from "@/lib/site";
import { useStaff } from "../shell";
import { SimulatedSupplier } from "../source";
import { NewPoForm } from "../suppliers/new-po";
import { ErrorNote } from "../../ui";
import { NotForSuppliers, NotFoundPage, PanelWait, PoRow } from "./suppliers";

type Outlet = Schemas["V1Outlets"]["outlets"][number];

export function SupplierScreen() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const { session, outlet } = useStaff();
  if (!can(session, "suppliers")) return <NotForSuppliers />;
  if (!UUID7.test(supplierId)) return <NotFoundPage />;
  if (!outlet) return <main className="wrap staff-main"><div className="state-box" role="status">Loading</div></main>;
  return <SupplierOutlet key={`${outlet.id}:${supplierId}`} outlet={outlet} supplierId={supplierId} />;
}

function SupplierOutlet({ outlet, supplierId }: { outlet: Outlet; supplierId: string }) {
  const { session, client, handleAuth } = useStaff();
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | "not_found" | null>(null);
  const [tenant, setTenant] = useState<Schemas["V1Tenant"] | null>(null);
  const [ingredients, setIngredients] = useState<Schemas["V1InventoryIngredients"]["items"] | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [error, setError] = useState<MunimError | null>(null);
  const [ordersError, setOrdersError] = useState<MunimError | undefined>(undefined);
  const [form, setForm] = useState(false);
  const online = useOnline();

  const loadOrders = useCallback(async () => {
    const r = await client.listPurchaseOrders();
    if (!r.ok) {
      if (!handleAuth(r.error)) setOrdersError(r.error);
      return;
    }
    setOrders(r.data.items.filter((p) => p.supplier.supplier_id === supplierId && p.outlet_ids.includes(outlet.id)));
    setOrdersError(undefined);
  }, [client, handleAuth, supplierId, outlet.id]);

  const load = useCallback(async () => {
    void loadOrders();
    const [s, t, i] = await Promise.all([client.getSupplier(supplierId), client.getTenant(), client.listIngredients()]);
    if (!s.ok && s.error.kind === "not_found") return setSupplier("not_found");
    if (!(s.ok && t.ok && i.ok)) {
      const bad = [s, t, i].find((x) => !x.ok);
      if (bad && !bad.ok && !handleAuth(bad.error)) setError(bad.error);
      return;
    }
    setSupplier(s.data);
    setTenant(t.data);
    setIngredients(i.data.items);
    setError(null);
  }, [client, handleAuth, supplierId, loadOrders]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the responses
    void load();
  }, [load]);

  if (supplier === "not_found") return <NotFoundPage />;
  if (error && !supplier) {
    return (
      <main className="wrap staff-main space-y-3">
        <ErrorNote>{staffErrorText(error, "suppliers")}</ErrorNote>
        <button type="button" className="btn btn-plain" onClick={() => void load()}>Try again</button>
      </main>
    );
  }
  if (!supplier || !tenant || !ingredients) return <main className="wrap staff-main"><div className="skeleton h-96" role="status" aria-label="Loading" /></main>;

  const tz = outlet.tz;
  const offline = !online || error?.kind === "network" || ordersError?.kind === "network";

  return (
    <main className="wrap staff-main max-w-[960px] space-y-5">
      {offline && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <header className="space-y-2">
        <h1 className="section-title flex flex-wrap items-center gap-3">{supplier.name} {supplier.label && <SimulatedSupplier />}</h1>
        <div className="scallop" aria-hidden="true" />
        {supplier.payment_days !== null && <p>Pay within {supplier.payment_days} days</p>}
        {supplier.notes && <p className="whitespace-pre-wrap text-muted">{supplier.notes}</p>}
        {!supplier.active && <p className="font-semibold">Not active</p>}
      </header>

      <section aria-labelledby="prices-title" className="card space-y-3 p-5">
        <h2 id="prices-title" className="text-[24px]">Price list</h2>
        {supplier.prices.length === 0 ? <p className="text-muted">No prices recorded.</p> : (
          <div className="overflow-x-auto">
            <table className="snap-table">
              <thead>
                <tr><th scope="col">Item</th><th scope="col">Unit</th><th scope="col" className="num">Price per unit</th><th scope="col">Seen on</th></tr>
              </thead>
              <tbody>
                {supplier.prices.map((p) => (
                  <tr key={p.price_id}>
                    <td>{ingredientOf(ingredients, p.ingredient_id).name}</td>
                    <td>{p.unit}</td>
                    <td className="num">{formatMoney(p.unit_price_minor, p.currency, SITE.locale)}</td>
                    <td>{formatDate(dayKey(p.observed_at, tz), SITE.locale)} <span className="text-muted">· {p.source_ref}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="orders-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="orders-title" className="text-[24px]">Purchase orders</h2>
          {supplier.active && <button type="button" className="btn btn-primary" onClick={() => setForm(true)}>New purchase order</button>}
        </div>
        {!orders ? <PanelWait error={ordersError} onRetry={() => void loadOrders()} height="h-32" />
          : orders.length === 0 ? <div className="state-box"><p>No purchase orders yet.</p></div>
          : <ul className="grid gap-3">{orders.map((po) => <PoRow key={po.po_id} po={po} tz={tz} />)}</ul>}
      </section>

      {form && (
        // Only this supplier is offered, so the form opens with it chosen.
        <NewPoForm
          suppliers={[supplier]} ingredients={ingredients} outletId={outlet.id} currency={tenant.base_currency} locale={SITE.locale} tz={tz}
          prefillIngredient={null} session={session} client={client} onAuth={handleAuth} onCreated={(poId) => router.push(`/staff/purchase-orders/${poId}`)}
        />
      )}
    </main>
  );
}
```

```tsx
// file: components/staff/pages/purchase-order.tsx
"use client";
// /staff/purchase-orders/[poId] (15): one purchase order to a simulated supplier. Its lines are row fields side by
// side (never multiplied), its total is the one core worked out, the quotes behind it (when a negotiation proposed it)
// are a snapshot this page mints, and goods received are recorded against it by a named person. No live topic carries
// purchasing, so the page refetches on focus, on "Refresh" and after goods are recorded. Owners and managers only.
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import { personName } from "@/lib/munim/drafts";
import { formatDate, formatDayTime, formatMoney, formatQty } from "@/lib/munim/format";
import type { CellFormat, Snapshot } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { PO_STATUS, staffErrorText, VERDICT } from "@/lib/munim/staff-copy";
import { ingredientOf, quoteParams, type GoodsReceived, type PurchaseOrder, type Supplier } from "@/lib/munim/supply-flow";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE, UUID7 } from "@/lib/site";
import { useStaff } from "../shell";
import { SimulatedSupplier, SnapshotDrawer, StatusPill } from "../source";
import { QuoteTable } from "../suppliers/quotes";
import { ReceiveForm } from "../suppliers/receive";
import { ErrorNote, Toast, useToast } from "../../ui";
import { NotForSuppliers, NotFoundPage, PO_TONE } from "./suppliers";

/** The rest of the page, loaded once: the tenant (currency), the stock items (names) and the suppliers (quote rows). */
interface Base {
  tenant: Schemas["V1Tenant"];
  ingredients: Schemas["V1InventoryIngredients"]["items"];
  suppliers: Supplier[];
}

export function PurchaseOrderScreen() {
  const { poId } = useParams<{ poId: string }>();
  const { session, outlet } = useStaff();
  if (!can(session, "suppliers")) return <NotForSuppliers />;
  if (!UUID7.test(poId)) return <NotFoundPage />;
  if (!outlet) return <main className="wrap staff-main"><div className="state-box" role="status">Loading</div></main>;
  return <PurchaseOrderView key={poId} poId={poId} />;
}

function PurchaseOrderView({ poId }: { poId: string }) {
  const { session, client, outlet, outlets, handleAuth } = useStaff();
  const me = session.me;
  const [po, setPo] = useState<PurchaseOrder | "not_found" | null>(null);
  const [grns, setGrns] = useState<GoodsReceived[] | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  const [quotes, setQuotes] = useState<Snapshot | "failed" | null>(null);
  /** Who approved the proposal that made this order (GET /v1/lineage), or null: a person's own order, or no answer. */
  const [approval, setApproval] = useState<Schemas["V1LineageRow"]["chains"][number]["decision"]>(null);
  const [error, setError] = useState<MunimError | null>(null);
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const [toast, setToast] = useToast();
  const online = useOnline();
  // The quote comparison is minted once per page: a refresh or a focus does not write another snapshot row.
  const minted = useRef(false);

  const failed = useCallback((e: MunimError) => {
    if (!handleAuth(e)) setError(e);
  }, [handleAuth]);

  /** The order's lineage: the chain that holds a decision (a later chain, such as goods received, has none). A 404 or
   *  any other failure shows nothing: the line is extra, never in the way. */
  const loadApproval = useCallback(async () => {
    const r = await client.getRowLineage(`core.purchase_order:${poId}`);
    if (r.ok) setApproval(r.data.chains.find((c) => c.decision !== null)?.decision ?? null);
    else handleAuth(r.error);
  }, [client, poId, handleAuth]);

  /** The order and the goods received against it (then who approved it): on load, on focus, on "Refresh" and after
   *  the receive form answers. */
  const loadOrder = useCallback(async () => {
    const [p, g] = await Promise.all([client.getPurchaseOrder(poId), client.listGoodsReceived()]);
    if (!p.ok && p.error.kind === "not_found") return setPo("not_found");
    if (!p.ok) return failed(p.error);
    if (!g.ok) return failed(g.error);
    setPo(p.data);
    setGrns(g.data.items.filter((x) => x.po_id === poId));
    setError(null);
    void loadApproval();
    const run = p.data.negotiation_run_id;
    if (run && !minted.current) {
      minted.current = true;
      const q = await client.mintSnapshot({ template_id: "purchasing.quote_compare", params: quoteParams(run) });
      if (!q.ok) {
        minted.current = false;
        handleAuth(q.error);
      }
      setQuotes(q.ok ? q.data : "failed");
    }
  }, [client, poId, failed, handleAuth, loadApproval]);

  const loadBase = useCallback(async () => {
    const [t, i, s] = await Promise.all([client.getTenant(), client.listIngredients(), client.listSuppliers()]);
    if (!(t.ok && i.ok && s.ok)) {
      const bad = [t, i, s].find((x) => !x.ok);
      if (bad && !bad.ok) failed(bad.error);
      return;
    }
    setBase({ tenant: t.data, ingredients: i.data.items, suppliers: s.data.items });
  }, [client, failed]);

  const load = useCallback(() => {
    void loadOrder();
    void loadBase();
  }, [loadOrder, loadBase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the responses
    load();
  }, [load]);

  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") void loadOrder(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [loadOrder]);

  if (po === "not_found") return <NotFoundPage />;
  if (error && (!po || !base)) {
    return (
      <main className="wrap staff-main space-y-3">
        <h1 className="section-title">Purchase order</h1>
        <ErrorNote>{staffErrorText(error, "suppliers")}</ErrorNote>
        <button type="button" className="btn btn-plain" onClick={load}>Try again</button>
      </main>
    );
  }
  if (!po || !grns || !base) return <main className="wrap staff-main"><div className="skeleton h-96" role="status" aria-label="Loading" /></main>;

  const tz = outlets.find((o) => po.outlet_ids.includes(o.id))?.tz ?? outlet?.tz ?? base.tenant.home_tz ?? "UTC";
  const fmt: CellFormat = { locale: SITE.locale, currency: base.tenant.base_currency };
  const offline = !online || error?.kind === "network";
  const mine = outlets.filter((o) => po.outlet_ids.includes(o.id)).map((o) => ({ id: o.id, name: o.name }));
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "another outlet";
  const name = (ingredientId: string) => ingredientOf(base.ingredients, ingredientId).name;

  return (
    <main className="wrap staff-main max-w-[960px] space-y-5">
      {offline && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="section-title">Purchase order</h1>
          <button type="button" className="btn btn-plain" onClick={() => void loadOrder()}>Refresh</button>
        </div>
        <div className="scallop" aria-hidden="true" />
        <p className="flex flex-wrap items-center gap-2 text-[20px] font-semibold">
          {po.supplier.name} {po.supplier.label && <SimulatedSupplier />}
          <StatusPill tone={PO_TONE[po.status] ?? "new"}>{PO_STATUS[po.status] ?? po.status}</StatusPill>
        </p>
        <p>For {po.outlet_ids.map(outletName).join(", ")}</p>
        <p>{po.expected_on ? `Expected ${formatDate(po.expected_on, SITE.locale)}` : "No expected date"}</p>
        <p className="text-[15px] text-muted">Placed {formatDayTime(po.created_at, tz, SITE.locale)}</p>
        {approval && approval.verdict !== "rejected" && (
          <p className="text-[15px] text-muted">{VERDICT[approval.verdict]} by {personName(approval.decided_by)} · {formatDayTime(approval.decided_at, tz, SITE.locale)}</p>
        )}
      </header>

      <section aria-label="Lines" className="card space-y-3 p-5">
        <div className="overflow-x-auto">
          <table className="snap-table">
            <thead>
              <tr><th scope="col">Item</th><th scope="col" className="num">Quantity</th><th scope="col">Unit</th><th scope="col" className="num">Price per unit</th></tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.po_line_id}>
                  <td>{name(l.ingredient_id)}</td>
                  <td className="num">{formatQty(l.qty_milli, SITE.locale)}</td>
                  <td>{l.unit}</td>
                  <td className="num">{formatMoney(l.unit_price_minor, po.currency, SITE.locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[20px] font-semibold">Total (worked out by Munim) <span className="num">{formatMoney(po.total_minor, po.currency, SITE.locale)}</span></p>
        <p className="text-[14px] text-muted">Recorded only — Munim does not process payments.</p>
      </section>

      {po.negotiation_run_id && (
        <details className="card p-5">
          <summary className="min-h-12 cursor-pointer font-semibold">Quotes from simulated suppliers</summary>
          <div className="mt-3">
            {quotes === null ? <div className="skeleton h-24" role="status" aria-label="Loading" />
              : quotes === "failed" ? <p className="text-muted">The quotes can&apos;t be opened.</p>
              : <QuoteTable snapshot={quotes} suppliers={base.suppliers} citedRow={null} fmt={fmt} onOpen={(snapshotId, refToken) => setDrawer({ snapshotId, refToken })} />}
          </div>
        </details>
      )}

      <section aria-labelledby="grn-title" className="space-y-3">
        <h2 id="grn-title" className="text-[24px]">Goods received</h2>
        {grns.length === 0 ? <p className="text-muted">Nothing received yet.</p> : grns.map((g) => (
          <article key={g.grn_id} className="card space-y-2 p-5">
            <p className="font-semibold">Received {formatDayTime(g.received_at, tz, SITE.locale)}{g.received_by === me.member_id ? " · recorded by you" : ""}</p>
            <div className="overflow-x-auto">
              <table className="snap-table">
                <thead>
                  <tr><th scope="col">Item</th><th scope="col" className="num">Quantity</th><th scope="col">Unit</th><th scope="col" className="num">Cost per unit</th></tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.grn_line_id}>
                      <td>{name(l.ingredient_id)}</td>
                      <td className="num">{formatQty(l.qty_milli, SITE.locale)}</td>
                      <td>{l.unit}</td>
                      <td className="num">{formatMoney(l.unit_cost_minor, l.currency, SITE.locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {g.note && <p className="whitespace-pre-wrap">{g.note}</p>}
          </article>
        ))}
      </section>

      {po.status === "committed" && mine.length > 0 && (
        // Keyed on what has come in, so the form starts empty again after a part delivery.
        <ReceiveForm
          key={grns.length} po={po} grns={grns} outlets={mine} ingredients={base.ingredients} session={session} client={client} currency={po.currency}
          onAuth={handleAuth} onDone={(text) => { if (text) setToast(text); void loadOrder(); }}
        />
      )}

      <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />
      <Toast message={toast} />
    </main>
  );
}
```

```tsx
// file: app/staff/suppliers/page.tsx
import type { Metadata } from "next";
import { SuppliersScreen } from "@/components/staff/pages/suppliers";

export const metadata: Metadata = { title: "Suppliers" };

export default function Page() {
  return <SuppliersScreen />;
}
```

```tsx
// file: app/staff/suppliers/[supplierId]/page.tsx
import type { Metadata } from "next";
import { SupplierScreen } from "@/components/staff/pages/supplier";

export const metadata: Metadata = { title: "A supplier" };

export default function Page() {
  return <SupplierScreen />;
}
```

```tsx
// file: app/staff/purchase-orders/[poId]/page.tsx
import type { Metadata } from "next";
import { PurchaseOrderScreen } from "@/components/staff/pages/purchase-order";

export const metadata: Metadata = { title: "A purchase order" };

export default function Page() {
  return <PurchaseOrderScreen />;
}
```

## 8 · Acceptance checklist

`[mock]` = check it on the extended mock (03) · `[unit]` = a unit test or a stubbed response ·
`[real]` = only on the real API.

**Labels and rules**
- [ ] [mock] Every supplier name on all three routes (lists, headers, order rows, proposal card, quote rows, the new-order radios) is followed by "Simulated supplier". `grep -rn "supplier.name\|s.name" components/staff/suppliers components/staff/pages` shows a `SimulatedSupplier` beside each.
- [ ] [mock] "Recorded only — Munim does not process payments." is beside every order total and on the new-order form and the proposal card. No card, UPI or bank field exists.
- [ ] [mock] No line total, order total or reorder quantity is worked out in the browser: `grep -rnE "\* *[a-z_.]*(qty|price)|reduce\(" components/staff/suppliers components/staff/pages` finds nothing.

**Roles**
- [ ] [mock] Signed in as Imran Siddiqui (demo) or Kavya Tandon (demo): no "Suppliers" chip in the nav; `/staff/suppliers` typed by hand shows "Suppliers are for the owner and managers." and the network tab shows no call.
- [ ] [unit] A manager session (one outlet) sees only purchase orders touching their outlet. On a proposal for that outlet whose quote cells they can open (stub them out of `unverified_refs`), "Approve as …" shows; on the mock's proposal, whose quotes cover every outlet, they get Reject only (below). A proposal that also covers another outlet shows no buttons and "Only the owner can decide this one: it covers outlets beyond yours." A stubbed 403 `authority_denied` shows "Your role can't do this. Ask the owner."

**Running low and the proposal**
- [ ] [mock] As Nandini Mehrotra (demo) at Cobnut Hazratganj: "Running low" shows Roasted hazelnuts (synthetic) with on hand, minimum and par, each with a "Source" chip that opens "Stock below its minimum". At Cobnut Gomti Nagar: "Nothing at Cobnut Gomti Nagar is below its minimum."
- [ ] [mock] "Order this" opens "New purchase order" with the hazelnuts chosen and the quantity empty.
- [ ] [mock] "Proposed by Munim" shows "Order from Lalbagh Nut & Spice (simulated) Simulated supplier". The quantity ("9") and "Price per kg" ("₹1,410.00") each have a chip that opens the quote comparison with round two of Lalbagh outlined; "Approve as Nandini Mehrotra (demo)", "Edit" and "Reject" show.
- [ ] [mock] "Quotes from simulated suppliers" lists three quotes (two from Lalbagh, one from Riverbank), each with its badge; round two of Lalbagh is "Proposed"; the caption chip opens the drawer on that row.
- [ ] [mock] "Approve as …" (on a fresh mock): the request's `edited_payload` is `null`; the new order shows under "Purchase orders" as "Sent", ₹1,410.00 per kg, with core's total.
- [ ] [mock] On a fresh mock: "Edit", type "1390" under the price, "Why you changed it", then "Approve with my edits as Nandini Mehrotra (demo)". The request's `lines[0].unit_price_minor` is `{ "value": 139000, "typed_by": <Nandini's member_id> }` and `qty_milli` is still the ref. The new order shows ₹1,390.00 per kg.
- [ ] [mock] "Approve with my edits" stays disabled with nothing typed, or with no reason.
- [ ] [mock] A second tab approves first: "Someone else already decided this. It has been refreshed."
- [ ] [mock] Mock controls "Next approve" → "stale" / "can't apply" / "already decided": each shows its copy (§4.4).
- [ ] [unit] A stubbed 422 `cannot_verify` refetches the draft; a stubbed proposal with `negotiation_run_id: null` shows "No quote comparison for this proposal."
- [ ] [unit] A manager session with one outlet and the quote cells in `unverified_refs` (the run's comparison covers every outlet) shows both numbers as "Cannot verify" and "Reject" only.
- [ ] [real] On the real API, a negotiation's proposal cites its quote comparison for quantity and price, and they trace for the owner. Check whether a manager of one outlet can open that comparison (it depends on how the run is scoped, 00 §7 question 16) and note what they see.
- [ ] [real] The approval card does not show the supplier's reply behind each quoted number (00 §7 question 24).

**Own order and goods received**
- [ ] [mock] A new order with one line (flour, "25" kg at "48") answers 201 and opens the order page with "Total (worked out by Munim)" from the response. Double-tapping "Place order as …" makes one order.
- [ ] [mock] After a failed place (offline, then online), the next tap sends a byte-identical body (same `idempotency_key`, same `po_id`).
- [ ] [mock] On the approved hazelnut order: "Everything on this order" without a batch code keeps the button disabled. With a code, "Record as received by …" answers 201, the status turns "Received", and the form disappears.
- [ ] [mock] On a fresh order: "Part of it", "4" kg with a batch code → still "Sent", and "Everything on this order" is no longer offered. The rest → "Received".
- [ ] [mock] A second tab recording goods after the order is received gets "This purchase order was already received or cancelled. It has been refreshed."
- [ ] [mock] Last week's butter order shows "Received" and its goods-received block "Received {day time}", and no
      "Approved by" line (a person placed it; its lineage has no decision).
- [ ] [mock] The order made by approving the hazelnut proposal shows "Approved by Nandini Mehrotra (demo) · {day time}"
      (or "Approved with edits by …"), read from `GET /v1/lineage?row=core.purchase_order:<id>`; it stays after the
      order is received (the receive chain has no decision, and the page keeps the one that has).
- [ ] [real] A goods-received note on the real API creates batches and stock movements (the next `inventory.below_reorder` mint no longer lists the item once it is above its minimum).

**Quality**
- [ ] [mock] Offline shows "You're offline. Showing the last update."; Force 429 shows the wait on the buttons.
- [ ] [mock] Unknown ids (`/staff/purchase-orders/not-an-id`, or a well-formed unknown one) show "Not found.".
- [ ] [mock] At 1024 × 768 and 1280 × 800 nothing overlaps; the quote table scrolls inside its card; every button is at least 48 px; at 200 % zoom every action is still reachable.
- [ ] [unit] A supplier note or goods-received note of `<b>x</b>` renders as that literal text.

## 9 · Screenshots

Named `staff-suppliers-<state>-<width>.png` (00 §5), at 1024 and 1280:

`staff-suppliers-owner-1280.png`, `staff-suppliers-owner-1024.png` (all panels) · `staff-suppliers-loading-1280.png` ·
`staff-suppliers-running-low-empty-1024.png` (Gomti Nagar) · `staff-suppliers-proposal-1280.png` (quantity and
price with chips, quotes open) · `staff-suppliers-proposal-editing-1280.png` ("Edited by Nandini Mehrotra (demo)") ·
`staff-suppliers-new-po-1024.png` · `staff-suppliers-po-sent-1280.png` (order page, receive form) ·
`staff-suppliers-po-part-received-1024.png` · `staff-suppliers-po-received-1280.png` ·
`staff-suppliers-grn-conflict-1024.png` · `staff-suppliers-supplier-1280.png` (supplier page with its price list) ·
`staff-suppliers-drawer-1280.png` · `staff-suppliers-role-not-allowed-1024.png` (Imran) ·
`staff-suppliers-not-found-1024.png` · `staff-suppliers-offline-1024.png` · `staff-suppliers-429-1024.png`. No
screenshot shows a token or a tenant id.

## 10 · What this file relies on in 01, 02 and 03, and one open question

All merged into the foundation files:

- **01 `staff.ts`:** `ReceiveGoodsCommand`, `listGoodsReceived()`, `getGoodsReceived(id)` and `receiveGoods(body)` (201).
  **01 §6.1 `drafts.ts`** and **02 §5 `decision.tsx`** decide the proposal.
- **03:** `GET /v1/goods-received`, `GET /v1/goods-received/{id}` and `POST /v1/goods-received`, with core's rules (a
  batch for batch-tracked stock and none for the rest, the order line's price when the cost is null, 409 for an order
  that is not committed, received once every line has come in), the seeded goods-received note for last week's
  butter order, and the purchase-order proposal citing its quote comparison for quantity and price.

**Open question for the founder (do not work around it):** core lets counter and kitchen staff record goods received
(`purchasing.grn.receive.v1` includes `staff`), but `CAN.suppliers` keeps them off these screens. Deliveries usually
come in at the counter. Until the founder decides whether staff get a receive-only view, only owners and managers
record them here.
