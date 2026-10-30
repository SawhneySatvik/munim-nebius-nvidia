# 10 · Counter: the till

Read 00, 20, 01, 02 and 03 first. Everything here is **synthetic**: the bakery, the people, the orders and every
amount. Payment is **recorded** at the counter, never processed: there is no card, PIN, wallet or bank field
anywhere.

| | |
|---|---|
| Routes | `/staff/counter` (the till and today's orders), `/staff/counter/orders/[orderId]` (one order: payment, steps, receipt) |
| Who | Roles `owner`, `manager`, `staff`, `judge` (`can(session, "counter")`). On the mock: "Imran Siddiqui (demo)" (counter, Cobnut Hazratganj), "Nandini Mehrotra (demo)" (owner, both outlets), and "Kavya Tandon (demo)" can open it too (staff) |
| Outlet scope | The outlet chosen in the shell's switcher (`useStaff().outlet`). Imran has one outlet, so the bar shows its name and no switcher |
| Devices | Tablets, landscape first: **1024 × 768** and **1280 × 800**, and 200 % zoom. No 390 px layout (00 §4) |
| AI | None. Every number on these two routes is a field of an API response: no source chips, and "Cannot verify" never appears (n/a, see §4) |

## 1 · Purpose

The person at the counter takes a walk-in order in as few taps as possible, sees core's price for it, places it (the
kitchen gets its tickets at once), records how the customer paid, and can show the bill. They also see today's
orders, open any of them, take a payment that is still due, accept or reject a web order, cancel one, or mark a ready
order as picked up. Every one of these is the person's own command (20 §3.2); the shell names them.

## 2 · Routes and layout

Both routes are thin `page.tsx` files that render a client component from `components/staff/pages/` (02 §3).

**`/staff/counter`**, below the demo bar and the staff bar:

- A row of two chips, "New order" and "Today's orders · {n}" (a tab pair; `n` = `items.length` of today's list, "N+"
  while there is another page), then, when live updates are off, "Live updates are off. Tap Refresh to update." with
  "Refresh", and on the right (mock only) **"Simulate a web order"**.
- **New order** uses 02's `.pos` grid. From 900 px it has two columns: the tiles on the left (they scroll with the
  page) and the cart rail on the right (`minmax(320px, 380px)`, sticky, scrolls inside itself).
  - At 1024 × 768 the tile area is about 600 px: three tiles a row.
  - At 1280 × 800 it is about 850 px: five tiles a row.
  - At 200 % zoom (a 640 px viewport) the rail drops under the tiles and nothing is hidden.
- **Tiles** (02 §8 `Tile`): grouped by category, in `SITE.categoryOrder`, each group headed by `CategoryMotif` and
  `categoryLabel(category)` (no swash, no scallop). One tile per menu **entry**: an item with variants has one tile per
  variant ("Hazelnut Praline Cake / ½ kg (serves 4–6)" and "… / 1 kg (serves 8–10)"), so the size is chosen by the
  tile. A sold-out tile keeps its name, wears "Sold out" and does nothing. A tile with option groups shows "Choose".
  A tap on an entry with option groups or a note field (`NOTE_FIELDS`) opens the **options sheet**; any other tap adds
  one straight to the rail.
- **Cart rail**, top to bottom:
  - the title "New order";
  - the kind pair "Takeaway" / "Eat in", and for "Eat in" the field "Table (optional)";
  - the lines (02 `CartRailLine`: name, size and options, the note, the stepper, and the line's `line_total_minor`
    from the preview, "…" until it answers);
  - the preview's "Subtotal" with a "Preview" badge, "Discount" (only when more than 0), "Tax" and "Total";
  - the 64 px **"Place order · {total}"** button, "Clear order", and "Payment is recorded on the next screen.
    Recorded only — Munim does not process payments."
- **Options sheet** (`dialog.modal`, like the storefront's item modal):
  - the diet badge, the name, and the size as a subtitle;
  - one fieldset per option group: radio rows when `max_select` is 1, checkboxes otherwise, "Required" on required
    groups, and "+{price_delta_minor}" beside an option that costs extra (that option's own field; no live line
    price);
  - the note box when `NOTE_FIELDS[name_key]` exists ("Message on the cake (optional)" on the cake, "Gift card message
    (optional)" on Build-a-Box). It is capped at 200 characters and shows a "{n}/200" counter;
  - the quantity stepper, then **"Add to order"**, disabled until every group is satisfied, with the first problem
    under it ("Choose a sponge").
- **Today's orders**: one table in a card. Its columns are "Ticket" (#n, large), "Time", "Kind", "From" ("Counter", or
  the channel's name), "Status" (pill), "Total" and "Open". Then "Load more" while there is another page, and "Payments
  show on each order. Open an order to see what is left to pay." The list row carries no payment fields (§4,
  contract note).

**`/staff/counter/orders/[orderId]`**: the same `.pos` grid.

- Left: the **order card**.
  - "Order #{ticket_no}" and its status pill.
  - A muted line: kind (and table), "Counter" or the channel's name, the time placed, "Invoice {invoice_no}" when
    numbered, "Ready by {time}" when promised.
  - The lines: name, size and options; "{qty} × {unit_price}" (two fields side by side); the line's discount and tax.
  - The note "The cake message and other notes show on the kitchen ticket; this order view doesn't carry them yet."
  - "Subtotal", "Discount" (when more than 0), "Tax" and "Total".
  - The status buttons (§5), then "Show receipt".
- Right: the **tender panel** ("Take payment") or, for a cancelled or rejected order, "This order was cancelled.
  Nothing is left to take." Under it, the 64 px "New order" button back to the till.
- At 1024 the card is about 600 px wide and the panel 380 px. At 200 % zoom the panel drops under the card.

All money is `formatMoney(minor, currency, "en-IN")` of a response field. All times are `formatTime(iso, outlet.tz,
"en-IN")`, in the outlet's zone, never the tablet's.

## 3 · Data loading

**`/staff/counter`**, for the chosen outlet (`useTillSetup`, in parallel):

1. `getMenu(outlet.id, "counter")`: the tiles, their prices, `available`, options, and `business_date`.
2. `listChannels()`: the active `kind: "counter"` channel (its id goes in every preview and order).
3. `listDevices()`: the outlet's `kind: "pos"` device (its id goes in `device_id` and numbers the invoice), or null.

Then:

- `previewOrder(...)` 300 ms after every cart change, on "Try again" and after a refused placement. A response older
  than the latest request is dropped. Going offline does not re-price: the last preview of the same cart stays, so a
  placement that failed offline can be resent unchanged.
- `listOrders({ outlet, business_date: menu.business_date, limit: 50 })` for today's list; "Load more" sends `cursor`.
  "Today" is the menu's `business_date`, never the tablet's clock.
- **Live:** `watchFor(session, [topic.kds(outlet.id)])`. Every event (order placed, status changed, tender recorded,
  ticket created or moved) and every reopen refetches today's list. Nothing is patched from an event.
- The menu, channels and devices are refetched every 60 s while the screen is visible and when the tab comes back,
  so a tile that sold out turns "Sold out". A failed refetch keeps the last menu on screen.

**`/staff/counter/orders/[orderId]`**:

1. An id that is not a lowercase UUIDv7 shows "Not found." without calling the API.
2. `getOrder(orderId)`, then `useTillSetup(order.outlet_id)` for line names, sizes, option names and channel labels.
3. **Live:** `watchFor(session, [topic.order(orderId)])`. Every event and every reopen refetches the order.
4. After every tender, step or refusal: `getOrder` again. The `CommandResult` carries no amounts.
5. "Show receipt" calls `getReceipt(orderId)` once per tap.

## 4 · States

| State | Where | What shows |
|---|---|---|
| Loading | till | Nine skeleton tiles at their final size; the rail shows "Tap an item to start an order." |
| No outlet yet | both | `role="status"` "Loading" while `useStaff().outlet` is null, which is only while the shell loads the outlets (`outletsState: "loading"`). The shell itself shows the other two cases in place of the screen (02 §3.1): a failed load (`staffErrorText` + "Try again") and a person with no outlet ("You aren't set up at any outlet yet. Ask the owner.") |
| Loading | today's list | Five skeleton rows |
| Loading | order route | One skeleton block, `aria-label` "Loading" |
| Empty menu | till | "Nothing is on sale at this counter right now." |
| Empty cart | rail | "Tap an item to start an order."; "Place order" disabled |
| Empty list | today | "No orders yet today." |
| No counter channel | till | Full page "No counter yet" / "This business has no counter channel switched on, so the till can't sell." |
| Error (setup) | till | `staffErrorText(e, "counter")` + "Try again" (e.g. 429: "Too many requests. Please wait a moment and try again.") |
| Error (preview) | rail | `staffErrorText(e, "counter")` + "Try again"; no totals; "Place order" disabled |
| Error (list) | today | The same line + "Try again"; a list already shown stays |
| Error (order read) | order route | `staffErrorText(e, "counter")` + "Try again" |
| Offline | both | `.offline-bar` "You're offline. Showing the last update."; the cart and the last preview stay; a failed preview (a read) says "No connection. Nothing was changed. Try again."; a failed write (place, payment, a step) says "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice.", because a timeout may have reached core and the retry is the same envelope |
| Not found (404) | order route | Full page "Not found." / "It may have been removed, or it isn't in your outlets." + "Back to the counter". Covers a bad id, an unknown order, and another outlet's order. It never says which |
| Not found (404) | till | The same full page when the menu answers 404 (outlet outside the person's scope) |
| 401 | both | `handleAuth`: signed out, back to `/staff/sign-in` |
| Role not allowed | both | Full page "Not for your role" / "The counter and the kitchen are for owners, managers and staff. Ask the owner if you need them." + "Go to your start page" (`can()` false, e.g. `advisor`). A role core refuses anyway gets 403 `authority_denied`: "Your role can't do this. Ask the owner." |
| Preview refusal | rail | Totals hidden; under the refused line `tillRefusalText(reason_code)`, e.g. `item_sold_out` "An item just sold out. Remove it to continue.", `item_unavailable` "An item isn't on sale at this counter right now.", `price_above_mrp`, `expired_batch` (01 §9 copy); a refusal with `line_no: null` as an `ErrorNote`; then "Fix the lines above to see the total." Unknown codes: "This line can't be sold right now. Remove it to continue." |
| Place refusal | rail | The same copy by `reasonCode`, then a fresh preview; `preview_total_changed` "The total changed since the preview. Check it and try again." The next tap is a new attempt, because the total changed |
| 403 | rail | `authority_denied`: "Your role can't do this. Ask the owner." |
| 429 | rail | "Too many requests. Please wait a moment and try again."; the button reads "Try again in {s} s", then the same attempt can be sent |
| Placing | rail | "Placing…"; every line stepper disabled |
| Order statuses | list, order route | Pills with `ORDER_STATUS` words and `ORDER_TONE` tones: "New", "Accepted", "Preparing", "Ready", "Picked up", "Not accepted", "Cancelled" |
| Kinds | list, order route | "Takeaway", "Eat in" (+ " · Table {t}"), "Pickup", "Delivery" |
| Left to pay | tender panel | "Total", "Paid", "Left to pay" (fields); a method pair; the amount box |
| Paid in full | tender panel | "Paid in full" (when `remaining_minor` is 0); no inputs |
| Change to give | tender panel | After a cash tender: "Cash {amount} recorded by {name}." and, when `change_minor` is more than 0, "Change to give: {change_minor}" in 26 px; "Cash rounding: {rounding_minor}" when it is not 0 |
| Ended | order route | "This order was cancelled. Nothing is left to take." / "This order was not accepted. Nothing is left to take."; no tender panel |
| Unpaid hand-over | order route | Tapping "Picked up" on a ready order with something left to pay shows "{remaining} is still to pay. Take the payment first, or hand it over unpaid." and turns the button into "Hand over unpaid" |
| Receipt | order route | "Show receipt" → skeleton ("Loading the receipt") → the bill (§5.6) |
| Receipt 404 | order route | Inline "The receipt isn't available for this order." + "Try again" (never the full page) |
| Receipt 409 `tax_id_missing` | order route | Inline "This outlet's tax ids are missing, so a bill can't be printed. The sale is saved." |
| Receipt offline | order route | "The receipt couldn't load. The sale is saved." + "Try again" |
| Live off | both | "Live updates are off. Tap Refresh to update." + "Refresh". Shown when the stream is refused, or has retried for more than 5 s. The planned reconnect takes about a second and is not shown |
| Simulated labels | both | The demo bar "Sample shop — orders are not real." and the "Demo sign-in" badge (shell); "Recorded only — Munim does not process payments." on the rail, the tender panel and the receipt; "Sample shop — not a real sale." on the receipt; "Simulate a web order" only with Mock controls on. No supplier or recipient appears on these screens |
| "Cannot verify" | — | **n/a.** No AI text or AI number appears on the till or the order route. Every figure is a field of a preview, order, tender or receipt response, never a snapshot ref |

**Contract notes the screens live with** (00 §7; don't work around them):

- The order view and the list carry **no line notes**. The cake message is visible on the kitchen ticket only.
- **`GET /v1/orders` list items have no `paid_minor` or `remaining_minor`.** The list can't say what is still to pay;
  open the order.
- **The member preview has no tax components** and no refusal `params`. The rail shows one "Tax" row and generic
  refusal copy.
- An order completes when its last kitchen ticket is done, **paid or not**. That's why placing leads straight to the
  payment, and "Picked up" warns while money is due.

## 5 · Actions

Every write is a command envelope from `lib/munim/commands.ts`. **One attempt = one frozen envelope:** a retry after
`network`, `rate_limited` or `server` sends it again unchanged (core answers `X-Munim-Replayed: true` and never places
or records twice). Any change to what the person confirmed builds a new attempt with new ids. Every button is disabled
while its request is in flight.

### 5.1 Add to the order (no request)

A tile tap or "Add to order" adds a `TillLine` (entry, option ids, count, note) to component state. An identical line
(same entry, options and note) gets the added count instead. The stepper changes the count (1–20; "−" at 1 removes the
line). "Clear order" empties the rail. The cart is **never stored**: not in `localStorage` (the storefront's
`munim.cart.<outletId>` key belongs to shoppers in the same browser) and not in `sessionStorage`. Each outlet's till
starts empty.

### 5.2 Preview (not a command)

`POST /v1/orders:preview` with `previewBodyFor(ctx, lines)`: the counter channel, the kind, no pickup window, no
coupon, `loyalty_redeem_points: 0`, lines without `line_id` or `note` (the preview's line schema is strict). It writes
nothing. With `refusals`, `lines` is `[]` and every total is 0, so the rail hides totals. There is no optimistic total:
until it answers, each line shows "…" and "Place order" is disabled.

### 5.3 Place order

`POST /v1/orders` with `orders.place.v1`, built by `placeAttempt(prev, ctx, lines, preview.total_minor)`:

- The ids are fresh `uuidv7()` values, frozen with the attempt: `order_id`, every `line_id`, `command_id` and
  `idempotency_key`.
- `device_id` is the outlet's POS device; `table_ref` is set only for "Eat in".
- Each line carries its note, at most 200 characters; a longer note is refused only here, so the box caps it.
- `preview_total_minor` is the total the person saw, and `client_totals: null`.

The fingerprint is the context, every line and that total.

| Answer | What the till does |
|---|---|
| 201 (or a replay) | Clears the cart; goes to `/staff/counter/orders/{entity_id}` with the tender panel open |
| `network`, 5xx | Keeps the attempt; "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." (network) or "Something went wrong on our side. Try again." (5xx); the next tap sends the same body |
| 429 | Keeps the attempt; "Try again in {s} s" from `retryAfterMs`, then the same body |
| 409 `idempotency_conflict` (`key_reused`) | Our bug: the attempt ends with "That didn't go through. Please try again."; nothing is resent on its own, and the person's next tap is a new attempt |
| 409 `conflict` + `reason_code` | The refusal copy (§4); a fresh preview; the attempt ends |
| 403 `authority_denied` | "Your role can't do this. Ask the owner." |
| 404 (channel inactive) / 422 | The attempt ends; `staffErrorText` |

There is no optimistic order: the order route reads it back.

### 5.4 Take payment (recorded only)

`POST /v1/orders/{id}/tenders` with `orders.tender.record.v1`.

- **"Cash"**: the box "Cash handed over (INR)" (the order's currency code) and "Exact amount", which fills in
  `remaining_minor`. It sends `tendered_minor` (the typed amount, through `parseTyped`), `amount_minor: null` and
  `ref: null`. Core works out the amount applied, the change and the cash rounding (₹1 steps on the mock). A
  part-payment in cash is allowed.
- **"Card"** / **"UPI"**: the box "Amount taken (INR)", which starts at `remaining_minor` and can be lowered for a
  split payment, and "Slip or UPI reference (optional)" (1–100 characters, or null). It sends `amount_minor` and
  `tendered_minor: null`. Typing more than `remaining_minor` is a comparison, not a sum: it shows "Card and UPI can't be
  more than what's left to pay." and disables the button.
- An empty, malformed or zero amount shows "Enter an amount like 250 or 250.50." The button reads "Record Cash
  payment" (or Card, UPI), and "Saving…" while in flight.
- The fingerprint is `[order_id, method, amount (and ref)]`. A retry after `network`, `rate_limited` or `server`
  resends it.
- After every answer except `network`, the order is refetched. On success the panel shows the new tender, read back
  from `order.tenders` by its `tender_id`, with its `change_minor` and `rounding_minor`.

| Refusal | Copy |
|---|---|
| 409 `conflict`, no `reason_code` (nothing left to pay) | "Nothing is left to pay on this order." |
| 409 `cash_below_rounding` | "What's left is smaller than the smallest cash step. Take it by card or UPI." |
| 422 `invalid_payload` on card / UPI (over what is left) | "Card and UPI can't be more than what's left to pay." |
| 422 `currency_mismatch` | "That amount is in the wrong currency." |
| 409 `illegal_transition` (the order was cancelled meanwhile) | "This changed on another screen. It has been refreshed." |

The panel also lists every recorded payment: method, reference, "by {name}" when it was this person, and the amount.

### 5.5 Status steps on the order route

One attempt per step, frozen by `stepIds` (fingerprint: order id, the status it was taken from, the step). A 409
`illegal_transition` (another tab or the kitchen moved it first) shows "This changed on another screen. It has been
refreshed." and refetches. After any answer except `network` the order is refetched, and a success says "Order #{n}:
{status}" in the polite toast.

| Button | Shown when | Sends |
|---|---|---|
| "Accept" | `placed` and not a counter order (a web order) | `POST /v1/orders/{id}:accept`, `{order_id}` |
| "Reject…" → reason → "Reject order" | `placed`, web order | `:reject`, `{order_id, reason_code}` |
| "Cancel order…" → reason → "Cancel order" | `placed` or `accepted` | `:advance`, `{order_id, from_status, to_status: "cancelled", reason_code}` |
| "Picked up" | `ready` | `:advance` to `completed`. With something left to pay, the first tap warns and the button becomes "Hand over unpaid" |

- The reason select reads "Why can't you take this order?" or "Why is it cancelled?", then "Choose a reason". The codes
  are `ORDER_REASONS`: "Out of stock", "Kitchen too busy", "Customer asked", "Placed twice", "Closing soon". A
  shopper's tracker title-cases a rejected order's reason, so the codes read well there.
- "Keep it" closes the reason box.
- A paid order cannot be cancelled or rejected: 409 `refund_first` gives "This order has payments. Refund them before
  cancelling." Refunds are not part of this pack.
- A missing reason is 422 `reason_required`: "Choose a reason first." The button is disabled until one is chosen.
- `preparing` has no counter step: the kitchen moves it.

### 5.6 Show receipt (a read)

`GET /v1/orders/{id}/receipt` renders the bill field by field:

- the pack's `title` ("Tax Invoice"), the `operator` on a record receipt, the seller's name and address, each tax id
  as "{label} {value}", and "No. {number} · {date}";
- a table of the lines: name from the menu by `name_key`, "Qty", "Price", "Discount", "Tax", "Total", and under each
  name its components ("CGST 2.5% ₹4.50 · SGST 2.5% ₹4.50");
- "Net", one row per component, "Tax", "Total";
- "Recorded only — Munim does not process payments." and "Sample shop — not a real sale."

No number is derived. Printing is not part of this pack.

### 5.7 Simulate a web order (mock only)

"Simulate a web order" (shown only when `IS_MOCK` and `NEXT_PUBLIC_MUNIM_MOCK_CONTROLS=1`) calls
`simulateWebOrder(session, outlet.id)`. That is 03's `POST /v1/_mock/web-order`, never a Munim route. It makes a
pickup order of two croissants and an oat cold coffee ("Less ice, please") on the "Website (pickup)" channel. Toast:
"A simulated web order was sent to the kitchen." or "The simulated order didn't go through.", then the list refetches.

## 6 · Copy

Literal strings. API-state copy not listed here comes from `staffErrorText` / `reasonText` (01 §9) and `RECORDED_ONLY`
(the storefront's `copy.ts`).

| Where | Copy |
|---|---|
| Tabs | "New order" · "Today's orders · {n}" ("{n}+" with another page) |
| Writes | "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." (place, payment and steps, on `network`) |
| Rail | "New order" · "Takeaway" · "Eat in" · "Table (optional)" · "Tap an item to start an order." · "Subtotal" + badge "Preview" · "Discount" · "Tax" · "Total" · "Place order" · "Place order · {total}" · "Placing…" · "Try again in {s} s" · "Clear order" · "Payment is recorded on the next screen. Recorded only — Munim does not process payments." · "Fix the lines above to see the total." · "This line can't be sold right now. Remove it to continue." |
| Tiles | "Sold out" · "Choose" (02) · category labels from `lib/site.ts` |
| Options sheet | "Required" · "Choose one." · "Choose {min} to {max}." · "Choose up to {max}." · "+{money}" · "Choose a {group}" · "Choose at least {min}: {group}" · "Choose at most {max}: {group}" · the `NOTE_FIELDS` label and hint + " The kitchen sees it exactly as typed." · "{n}/200" · "Add to order" · "The price is confirmed in the order's preview." · close button label "Close" |
| Today's orders | headers "Ticket", "Time", "Kind", "From", "Status", "Total" · "Counter" · "Open" · "Load more" · "No orders yet today." · "Payments show on each order. Open an order to see what is left to pay." |
| Order route | "Order #{n}" · "Invoice {n}" · "Ready by {time}" · "Table {t}" · "The cake message and other notes show on the kitchen ticket; this order view doesn't carry them yet." · "Subtotal" · "Discount" · "Tax" · "Total" · "New order" · "This order was cancelled. Nothing is left to take." · "This order was not accepted. Nothing is left to take." |
| Steps | "Accept" · "Reject…" · "Cancel order…" · "Picked up" · "Hand over unpaid" · "{money} is still to pay. Take the payment first, or hand it over unpaid." · "Why can't you take this order?" · "Why is it cancelled?" · "Choose a reason" · "Out of stock" · "Kitchen too busy" · "Customer asked" · "Placed twice" · "Closing soon" · "Reject order" · "Cancel order" · "Keep it" · "Saving…" · toast "Order #{n}: {status}" |
| Tender panel | "Take payment" · "Total" · "Paid" · "Left to pay" · "Cash" · "Card" · "UPI" (group label "How they paid") · "Cash handed over ({currency})" · "Amount taken ({currency})" · "Exact amount" · "Slip or UPI reference (optional)" · "Record Cash payment" / "Record Card payment" / "Record UPI payment" · "Saving…" · "Enter an amount like 250 or 250.50." · "Card and UPI can't be more than what's left to pay." · "Nothing is left to pay on this order." · "{method} {money} recorded by {name}." · "Change to give: {money}" · "Cash rounding: {money}" · "Paid in full" · "Recorded only — Munim does not process payments. Nothing is charged here: record what the customer paid at the counter." · list label "Payments recorded" · " · by {name}" |
| Receipt | "Show receipt" · "Loading the receipt" · "No. {number} · {date}" · headers "Item", "Qty", "Price", "Discount", "Tax", "Total" · "Net" · "Tax" · "Total" · "Sample shop — not a real sale." · "The receipt isn't available for this order." · "This outlet's tax ids are missing, so a bill can't be printed. The sale is saved." · "The receipt couldn't load. The sale is saved." · "Try again" |
| Full pages | "Not found." / "It may have been removed, or it isn't in your outlets." / "Back to the counter" · "Not for your role" / "The counter and the kitchen are for owners, managers and staff. Ask the owner if you need them." / "Go to your start page" · "No counter yet" / "This business has no counter channel switched on, so the till can't sell." |
| Banners | "You're offline. Showing the last update." · "Live updates are off. Tap Refresh to update." · "Refresh" |
| Mock | "Simulate a web order" · "Sending…" · "A simulated web order was sent to the kitchen." · "The simulated order didn't go through." |

## 7 · Code

Save each block at its path. `lib/munim/till.ts` is plain TypeScript; the hooks follow Cobnut's `lib/hooks.ts`
style. The pages use only 02's pieces (`Tile`, `CartRailLine`, `StatusPill`, `ORDER_TONE`) and Cobnut's
(`QtyStepper`, `DietBadge`, `CategoryMotif`, `ErrorNote`, `FullPage`, `Toast`, `useCountdown`, `useOnline`).
`components/staff/simulate.tsx` is the same file as in 11. Save it once.

### 7.1 The till's logic

```ts
// file: lib/munim/till.ts
// The till's logic, with no React: the counter cart (menu entries, chosen options, a note per line), the preview
// request, one frozen place attempt, one frozen tender attempt, and the words for the counter's own refusals.
// No money is computed here: every amount the till shows is a field of a preview, order, tender or receipt
// response. (`qty * 1000` turns the count the person tapped into the API's thousandths; it is not money.)
import { attemptFor, type CommandAttempt } from "./commands";
import { MAX_QTY, NOTE_MAX } from "./checkout";
import { shownName, titleCase } from "./format";
import type { MunimError } from "./client";
import { reasonText, staffWriteErrorText } from "./staff-copy";
import type { Schemas } from "./types";
import { uuidv7 } from "./uuid";

export type MenuEntry = Schemas["V1CatalogueMenu"]["entries"][number];
export type OrderView = Schemas["V1Order"];
export type TillKind = "takeaway" | "dine_in";

/** One cart line as the person built it: a menu entry (item × variant), the chosen option ids, a whole count, and
 *  the note for the kitchen (the message on a cake). Kept in component state only, never in storage. */
export interface TillLine {
  key: string;
  entry: MenuEntry;
  optionIds: string[];
  qty: number;
  note: string | null;
}

/** Where and how the order is taken. `deviceId` is the outlet's POS device (it numbers the invoice), or null. */
export interface TillContext {
  outletId: string;
  channelId: string;
  deviceId: string | null;
  kind: TillKind;
  /** "Eat in" only: the table as typed (1–20 characters), or null. */
  tableRef: string | null;
}

export { MAX_QTY, NOTE_MAX };

export const newTillLine = (entry: MenuEntry, optionIds: string[], note: string | null = null, qty = 1): TillLine =>
  ({ key: uuidv7(), entry, optionIds: [...optionIds].sort(), qty, note: note?.trim().slice(0, NOTE_MAX) || null });

/** Adds a line, or adds its count to an identical line (same entry, options and note). */
export function addLine(lines: readonly TillLine[], line: TillLine): TillLine[] {
  const same = lines.find((l) => l.entry.item_id === line.entry.item_id && l.entry.variant_id === line.entry.variant_id && l.optionIds.join() === line.optionIds.join() && l.note === line.note);
  if (!same) return [...lines, line];
  return lines.map((l) => (l === same ? { ...l, qty: Math.min(l.qty + line.qty, MAX_QTY) } : l));
}

/** Sets a line's count; 0 removes it. */
export const setQty = (lines: readonly TillLine[], key: string, qty: number): TillLine[] =>
  qty <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, qty: Math.min(qty, MAX_QTY) } : l));

/** Why the options sheet cannot add this yet (empty = fine). Mirrors the API's min / max per group, so the till
 *  never meets a 422 for a missing sponge or too many flavours. */
export function entrySelectionProblems(entry: MenuEntry, optionIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const g of entry.option_groups) {
    const label = g.display_name ?? titleCase(g.name_key);
    const n = g.options.filter((o) => optionIds.includes(o.option_id)).length;
    if (n < g.min_select) out.push(g.min_select === 1 ? `Choose a ${label.toLowerCase()}` : `Choose at least ${g.min_select}: ${label}`);
    if (n > g.max_select) out.push(`Choose at most ${g.max_select}: ${label}`);
  }
  return out;
}

/** True when tapping the tile must open the options sheet (any option group, or a note field for this item). */
export const needsSheet = (entry: MenuEntry, hasNoteField: boolean): boolean => entry.option_groups.length > 0 || hasNoteField;

/** "Hazelnut Praline Cake" and "1 kg (serves 8–10) · Eggless" for a line, from the menu entry. */
export function tillLineLabel(line: Pick<TillLine, "entry" | "optionIds">): { name: string; detail: string } {
  const parts: string[] = [];
  const v = line.entry.variant_display_name ?? (line.entry.variant_name_key ? titleCase(line.entry.variant_name_key) : null);
  if (v) parts.push(v);
  for (const g of line.entry.option_groups) for (const o of g.options) if (line.optionIds.includes(o.option_id)) parts.push(shownName(o));
  return { name: shownName(line.entry), detail: parts.join(" · ") };
}

/** The order's brand: the entries' brand when every line is one brand's, else null. */
export function brandOf(lines: readonly TillLine[]): string | null {
  const ids = new Set(lines.map((l) => l.entry.brand_id));
  const [only] = [...ids];
  return ids.size === 1 && only ? only : null;
}

/** The lines as the preview takes them (no line_id, no note: the preview's line schema is strict). */
export const tillLines = (lines: readonly TillLine[]) =>
  lines.map((l) => ({ item_id: l.entry.item_id, variant_id: l.entry.variant_id, option_ids: l.optionIds, qty_milli: l.qty * 1000, barcode: null }));

export function previewBodyFor(ctx: TillContext, lines: readonly TillLine[]): Schemas["OrdersPreviewRequest"] {
  return {
    outlet_id: ctx.outletId, channel_id: ctx.channelId, brand_id: brandOf(lines), kind: ctx.kind,
    pickup_window_id: null, promised_at: null, coupon_codes: [], loyalty_redeem_points: 0, lines: tillLines(lines),
  };
}

export type PlaceAttempt = CommandAttempt<"orders.place.v1", Schemas["OrdersPlaceV1"]>;

/** What the person confirmed: the context, every line and the preview total they saw. */
export const placeFingerprint = (ctx: TillContext, lines: readonly TillLine[], previewTotalMinor: number): string =>
  JSON.stringify([ctx, lines.map((l) => [l.entry.item_id, l.entry.variant_id, l.optionIds, l.qty, l.note]), previewTotalMinor]);

/** One place attempt: reused as-is when the person taps again after a network error, timeout, 429 or 5xx;
 *  rebuilt with new ids after any change to the cart, the kind, the table or the preview total. */
export function placeAttempt(prev: PlaceAttempt | null, ctx: TillContext, lines: readonly TillLine[], previewTotalMinor: number): PlaceAttempt {
  const req = tillLines(lines);
  return attemptFor(prev, placeFingerprint(ctx, lines, previewTotalMinor), "orders.place.v1", () => ({
    order_id: uuidv7(), outlet_id: ctx.outletId, channel_id: ctx.channelId, brand_id: brandOf(lines), device_id: ctx.deviceId, kind: ctx.kind,
    table_ref: ctx.kind === "dine_in" ? ctx.tableRef : null, pickup_window_id: null, promised_at: null, external_ref: null,
    // Line ids belong to the attempt: a line id another order already used is refused (422).
    lines: req.map((r, i) => ({ line_id: uuidv7(), ...r, note: lines[i]!.note })),
    coupon_codes: [], loyalty_redeem_points: 0,
    preview_total_minor: previewTotalMinor, // the server total the person saw; a different re-price is refused (preview_total_changed)
    client_totals: null, // the server ignores client totals
  }));
}

export type TenderAttempt = CommandAttempt<"orders.tender.record.v1", Schemas["OrdersTenderRecordV1"]>;
export type TenderMethod = Schemas["OrdersTenderRecordV1"]["method"];

/** Cash: what was handed over. Core works out the amount applied, the change and the cash rounding. */
export const cashTender = (prev: TenderAttempt | null, orderId: string, tenderedMinor: number, currency: string): TenderAttempt =>
  attemptFor(prev, JSON.stringify([orderId, "cash", tenderedMinor]), "orders.tender.record.v1", () => ({
    tender_id: uuidv7(), order_id: orderId, method: "cash" as const, tendered_minor: tenderedMinor, amount_minor: null, currency, ref: null,
  }));

/** Card or UPI: the amount taken on the terminal (at most what is left to pay) and the slip or UPI reference. */
export const cardTender = (prev: TenderAttempt | null, orderId: string, method: "card" | "upi", amountMinor: number, currency: string, ref: string | null): TenderAttempt =>
  attemptFor(prev, JSON.stringify([orderId, method, amountMinor, ref]), "orders.tender.record.v1", () => ({
    tender_id: uuidv7(), order_id: orderId, method, tendered_minor: null, amount_minor: amountMinor, currency, ref,
  }));

/** The typed-amount box's starting text for a minor amount ("189.00" for 18900 INR). It only moves the decimal point
 *  for the input; parseTyped (refs.ts) moves it back. Never displayed as a figure and never added to anything. */
export function typedFromMinor(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat("en", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(minor / 10 ** digits);
}

// ---------------------------------------------------------------- reading an order back

/** The menu entry for an order line (item × variant), if the counter menu still has it. */
export const entryFor = (entries: readonly MenuEntry[], itemId: string, variantId: string | null): MenuEntry | undefined =>
  entries.find((e) => e.item_id === itemId && e.variant_id === variantId) ?? entries.find((e) => e.item_id === itemId);

/** Name and "1 kg (serves 8–10) · Eggless" for an order line, from the menu; "Item" when the menu lacks it. */
export function orderLineLabel(entries: readonly MenuEntry[], line: Pick<OrderView["lines"][number], "item_id" | "variant_id" | "option_ids">): { name: string; detail: string } {
  const e = entryFor(entries, line.item_id, line.variant_id);
  return e ? tillLineLabel({ entry: e, optionIds: line.option_ids }) : { name: "Item", detail: "" };
}

/** The tender a command created, read back from the order (amounts, change and rounding are core's). */
export const tenderOf = (order: OrderView, tenderId: string) => order.tenders.find((t) => t.tender_id === tenderId) ?? null;

/** Receipt lines carry an item's name_key only: its display name from the menu, else a label for the key. */
export function itemNames(entries: readonly MenuEntry[]): (nameKey: string) => string {
  const m = new Map(entries.map((e) => [e.name_key, shownName(e)]));
  return (k) => m.get(k) ?? titleCase(k);
}

/** The frozen ids of one status-step attempt (accept, reject, cancel, picked up). The payload is rebuilt from the
 *  same confirmed step and the same from-status, so a retry sends an identical envelope. */
export interface StepIds {
  fingerprint: string;
  command_id: string;
  idempotency_key: string;
}
export const stepIds = (prev: StepIds | null, fingerprint: string): StepIds =>
  prev && prev.fingerprint === fingerprint ? prev : { fingerprint, command_id: uuidv7(), idempotency_key: uuidv7() };

export const KIND_LABEL: Record<string, string> = { takeaway: "Takeaway", dine_in: "Eat in", pickup: "Pickup", delivery: "Delivery" };

/** Reasons for rejecting or cancelling an order (orders.order.reject.v1 / advance to cancelled). Codes, never free
 *  text: the shopper's tracker shows a rejected order's reason title-cased ("Out of stock"). */
export const ORDER_REASONS = [
  { code: "out_of_stock", label: "Out of stock" },
  { code: "kitchen_busy", label: "Kitchen too busy" },
  { code: "customer_asked", label: "Customer asked" },
  { code: "duplicate_order", label: "Placed twice" },
  { code: "outlet_closing", label: "Closing soon" },
] as const;

/** The status steps the counter offers for an order (the kitchen moves the rest through its tickets). */
export function counterSteps(order: Pick<OrderView, "status" | "channel_id">, counterChannelId: string | null): { accept: boolean; reject: boolean; cancel: boolean; pickedUp: boolean } {
  const web = order.channel_id !== counterChannelId;
  return {
    accept: order.status === "placed" && web,
    reject: order.status === "placed" && web,
    cancel: order.status === "placed" || order.status === "accepted",
    pickedUp: order.status === "ready",
  };
}

/** A failed write (place, tender, a status step) in the person's words. A `network` failure may have reached core
 *  (a 15 s timeout counts as one), so it never says "nothing changed": it says the same tap is safe, because the
 *  retry sends the same envelope and core replays it. Everything else is staff-copy's line. */
export const writeErrorText = (e: MunimError): string => staffWriteErrorText(e, "counter");

/** A preview or place refusal in the person's words. */
export const tillRefusalText = (code: string): string => reasonText(code) ?? "This line can't be sold right now. Remove it to continue.";
```

### 7.2 Hooks

```ts
// file: lib/counter-hooks.ts
"use client";
// The till's client hooks: what the counter needs for an outlet (counter menu, counter channel, POS device), the
// debounced preview, today's orders, one order kept fresh by its live topic, and the two writes (place, tender) with
// the one-attempt rule. Screens own the layout; every number they show comes from these responses.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MunimError } from "./munim/client";
import { retryable } from "./munim/commands";
import type { Session } from "./munim/session";
import type { StaffClient } from "./munim/staff";
import { watchFor } from "./munim/staff-app";
import { topic, type LiveState } from "./munim/staff-stream";
import { placeAttempt, previewBodyFor, type PlaceAttempt, type TenderAttempt, type TillContext, type TillLine } from "./munim/till";
import type { Schemas } from "./munim/types";

type Menu = Schemas["V1CatalogueMenu"];
type Channel = Schemas["V1Channels"]["channels"][number];
type Preview = Schemas["OrdersPreviewResponse"];
type Order = Schemas["V1Order"];
type OrderItem = Schemas["V1OrdersList"]["items"][number];

export type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "failed"; error: MunimError };

export interface TillSetup {
  menu: Menu;
  /** The business's active counter channel. */
  counter: Channel;
  /** Every channel, for "Counter" / "Website (pickup)" labels on the order list. */
  channels: Channel[];
  /** The outlet's POS device (numbers the invoice), or null when it has none. */
  deviceId: string | null;
}

/** Counter menu + channels + devices for one outlet, in parallel. `noCounter` = the business has no active counter
 *  channel (the till cannot sell). Refetched every 60 s while visible and when the tab comes back (sold-out tiles
 *  follow the menu), and by `reload` (Try again). A refetch keeps the last good menu on screen until it answers. */
export function useTillSetup(client: StaffClient, outletId: string | null, onAuth: (e: MunimError) => boolean) {
  const [load, setLoad] = useState<Load<TillSetup> | { state: "noCounter" }>({ state: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!outletId) return;
    let live = true;
    void Promise.all([client.getMenu(outletId, "counter"), client.listChannels(), client.listDevices()]).then(([m, c, d]) => {
      if (!live) return;
      const bad = [m, c, d].find((r) => !r.ok);
      if (bad && !bad.ok) {
        const error = bad.error;
        if (!onAuth(error)) setLoad((cur) => (cur.state === "ready" ? cur : { state: "failed", error })); // a failed refetch keeps the menu
        return;
      }
      if (!m.ok || !c.ok || !d.ok) return;
      const counter = c.data.channels.find((x) => x.kind === "counter" && x.active);
      if (!counter) return setLoad({ state: "noCounter" });
      const pos = d.data.devices.find((x) => x.outlet_id === outletId && x.kind === "pos");
      setLoad({ state: "ready", data: { menu: m.data, counter, channels: c.data.channels, deviceId: pos?.id ?? null } });
    });
    return () => { live = false; };
  }, [client, outletId, onAuth, n]);
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") setN((x) => x + 1); };
    const t = setInterval(again, 60_000);
    document.addEventListener("visibilitychange", again);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", again); };
  }, []);
  return { load, reload: useCallback(() => setN((x) => x + 1), []) };
}

export interface PreviewState {
  preview: Preview | null;
  loading: boolean;
  error: MunimError | null;
}

/** Re-prices the cart 300 ms after each change, and whenever `again` changes ("Try again", after a refusal). A
 *  response older than the latest request is dropped, so the rail never shows the total of a cart that no longer
 *  exists. Writes nothing. */
export function useTillPreview(client: StaffClient, ctx: TillContext | null, lines: readonly TillLine[], again: unknown = 0): PreviewState {
  const [state, setState] = useState<PreviewState>({ preview: null, loading: false, error: null });
  const seq = useRef(0);
  const key = JSON.stringify([ctx, lines.map((l) => [l.entry.item_id, l.entry.variant_id, l.optionIds, l.qty]), again]);
  useEffect(() => {
    const mine = ++seq.current;
    if (!ctx || lines.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the preview when the cart empties
      setState({ preview: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      const r = await client.previewOrder(previewBodyFor(ctx, lines));
      if (mine !== seq.current) return;
      setState(r.ok ? { preview: r.data, loading: false, error: null } : { preview: null, loading: false, error: r.error });
    }, 300);
    return () => clearTimeout(t);
    // `key` captures every input that changes the price (the note does not).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client]);
  return state;
}

export type PlaceOutcome = { ok: true; orderId: string } | { ok: false; error: MunimError; keep: boolean };

/** One place attempt per thing the person confirmed. A retry after a network error, timeout, 429 or 5xx sends the
 *  same envelope (core replays it: never two orders). Any other failure ends the attempt, a reused key (409
 *  idempotency_conflict, our bug) included: nothing is sent again without a tap, and the next tap is a new attempt. */
export function usePlace(client: StaffClient) {
  const attempt = useRef<PlaceAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const place = useCallback(async (ctx: TillContext, lines: readonly TillLine[], previewTotalMinor: number): Promise<PlaceOutcome> => {
    setBusy(true);
    try {
      const a = placeAttempt(attempt.current, ctx, lines, previewTotalMinor);
      attempt.current = a;
      const r = await client.placeOrder(a.body);
      if (r.ok) {
        attempt.current = null;
        return { ok: true, orderId: r.data.entity_id };
      }
      const keep = retryable(r.error);
      if (!keep) attempt.current = null;
      return { ok: false, error: r.error, keep };
    } finally {
      setBusy(false);
    }
  }, [client]);
  return { place, busy };
}

/** Today's orders at the outlet, newest first, with "Load more" while there is a next page. */
export function useTodayOrders(client: StaffClient, outletId: string | null, businessDate: string | null, onAuth: (e: MunimError) => boolean) {
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<MunimError | null>(null);
  const fetchPage = useCallback(async (cursor?: string) => {
    if (!outletId || !businessDate) return;
    const r = await client.listOrders({ outlet: outletId, business_date: businessDate, limit: 50, ...(cursor ? { cursor } : {}) });
    if (!r.ok) {
      if (!onAuth(r.error)) setError(r.error);
      return;
    }
    setError(null);
    setItems((prev) => (cursor && prev ? [...prev, ...r.data.items] : r.data.items));
    setNext(r.data.next_cursor);
  }, [client, outletId, businessDate, onAuth]);
  const refresh = useCallback(() => void fetchPage(), [fetchPage]);
  const more = useCallback(() => { if (next) void fetchPage(next); }, [fetchPage, next]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the first page loads when the outlet or day is known
  useEffect(() => { void fetchPage(); }, [fetchPage]);
  return { items, hasMore: next !== null, error, refresh, more };
}

/** Wakes `onWake` on every live event of the topics (and on every reopen). `off` drives "Live updates are off": the
 *  stream was refused, or has been retrying for over 5 s (the planned reconnect, about every 50 s on the mock and 55
 *  min on the real API, takes about a second and is not shown). */
export function useLive(session: Session, topics: readonly string[], onWake: () => void): { state: LiveState; off: boolean } {
  const [state, setState] = useState<LiveState>("connecting");
  const [stuck, setStuck] = useState(false);
  const wake = useRef(onWake);
  useEffect(() => { wake.current = onWake; });
  const key = topics.join(",");
  useEffect(() => {
    if (!key) return;
    return watchFor(session, key.split(","), () => wake.current(), setState);
  }, [session, key]);
  useEffect(() => {
    if (state !== "retrying") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the stream recovered
      setStuck(false);
      return;
    }
    const t = setTimeout(() => setStuck(true), 5000);
    return () => clearTimeout(t);
  }, [state]);
  return { state, off: state === "refused" || stuck };
}

/** One order, refetched on every event of `order:<id>`. `missing` = 404 (not found, or not in the person's outlets). */
export function useOrder(client: StaffClient, session: Session, orderId: string, onAuth: (e: MunimError) => boolean) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<MunimError | null>(null);
  const refresh = useCallback(async () => {
    const r = await client.getOrder(orderId);
    if (r.ok) {
      setOrder(r.data);
      setError(null);
    } else if (!onAuth(r.error)) setError(r.error);
  }, [client, orderId, onAuth]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the order loads once the id is known
  useEffect(() => { void refresh(); }, [refresh]);
  const live = useLive(session, [topic.order(orderId)], () => void refresh());
  return { order, error, missing: error?.kind === "not_found", refresh, liveOff: live.off };
}

/** The tender panel's attempt: kept until it succeeds or fails for good (same rule as placing). */
export function useTender(client: StaffClient, orderId: string) {
  const attempt = useRef<TenderAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const record = useCallback(async (build: (prev: TenderAttempt | null) => TenderAttempt): Promise<{ ok: true; tenderId: string } | { ok: false; error: MunimError }> => {
    setBusy(true);
    const a = build(attempt.current);
    attempt.current = a;
    const r = await client.recordTender(orderId, a.body);
    setBusy(false);
    if (r.ok) {
      attempt.current = null;
      return { ok: true, tenderId: r.data.entity_id };
    }
    if (!retryable(r.error)) attempt.current = null;
    return { ok: false, error: r.error };
  }, [client, orderId]);
  return { record, busy };
}
```

### 7.3 Tender panel and receipt

```tsx
// file: components/staff/order-bits.tsx
"use client";
// The counter's order pieces: the tender panel (cash / card / UPI, recorded only) and the receipt. Every amount is a
// field of GET /v1/orders/{id} or GET /v1/orders/{id}/receipt; the panel never works out change or what is left.
import { useState } from "react";
import { useCountdown } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import { RECORDED_ONLY } from "@/lib/munim/copy";
import { formatMoney, formatQty, formatRate } from "@/lib/munim/format";
import { parseTyped } from "@/lib/munim/refs";
import type { StaffClient } from "@/lib/munim/staff";
import { staffErrorText, TENDER_METHOD } from "@/lib/munim/staff-copy";
import { cardTender, cashTender, tenderOf, typedFromMinor, writeErrorText, type OrderView, type TenderMethod } from "@/lib/munim/till";
import type { Schemas } from "@/lib/munim/types";
import { useTender } from "@/lib/counter-hooks";
import { SITE } from "@/lib/site";
import { ErrorNote } from "../ui";

type Receipt = Schemas["V1OrderReceipt"];
const money = (minor: number, currency: string) => formatMoney(minor, currency, SITE.locale);

/** Copy for a failed tender. Two refusals have no words in staff-copy: "nothing due" (409 conflict, no reason code)
 *  and a card / UPI amount above what is left (422). */
export function tenderErrorText(e: MunimError, method: TenderMethod): string {
  if (e.code === "conflict" && !e.reasonCode) return "Nothing is left to pay on this order.";
  if (e.code === "invalid_payload" && method !== "cash") return "Card and UPI can't be more than what's left to pay.";
  return writeErrorText(e);
}

export function TenderPanel({ client, order, meId, meName, onChanged, onAuth }: {
  client: StaffClient;
  order: OrderView;
  meId: string;
  meName: string;
  /** Refetch the order (the panel calls it after every attempt that reached the server). */
  onChanged: () => void;
  onAuth: (e: MunimError) => boolean;
}) {
  const { record, busy } = useTender(client, order.order_id);
  const [method, setMethod] = useState<TenderMethod>("cash");
  const [text, setText] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [lastTender, setLastTender] = useState<string | null>(null);
  const wait = useCountdown(waitUntil, () => setWaitUntil(null));
  const c = order.currency;
  const typed = parseTyped(text, method === "cash" ? "tendered_minor" : "amount_minor", c);
  const tooMuch = method !== "cash" && typed !== null && typed > order.remaining_minor; // a comparison, not a sum
  const problem = text.trim() === "" ? null : typed === null || typed === 0 ? "Enter an amount like 250 or 250.50." : tooMuch ? "Card and UPI can't be more than what's left to pay." : null;
  const last = lastTender ? tenderOf(order, lastTender) : null;
  const choose = (m: TenderMethod) => {
    setMethod(m);
    setError(null);
    setText(m === "cash" ? "" : typedFromMinor(order.remaining_minor, c)); // card / UPI start at what is left (a field)
  };
  const submit = async () => {
    if (typed === null || typed === 0 || tooMuch) return;
    setError(null);
    const note = ref.trim().slice(0, 100) || null;
    const r = await record((prev) => (method === "cash" ? cashTender(prev, order.order_id, typed, c) : cardTender(prev, order.order_id, method, typed, c, note)));
    if (r.ok) {
      setLastTender(r.tenderId);
      setText("");
      setRef("");
      onChanged();
      return;
    }
    if (onAuth(r.error)) return;
    if (r.error.kind === "rate_limited") setWaitUntil(Date.now() + (r.error.retryAfterMs ?? 5000));
    setError(tenderErrorText(r.error, method));
    if (r.error.kind !== "network") onChanged();
  };

  return (
    <section className="card grid gap-3 p-4" aria-labelledby="pay-title">
      <h2 id="pay-title" className="text-[24px]">Take payment</h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[18px]">
        <dt>Total</dt><dd className="num text-right font-semibold">{money(order.total_minor, c)}</dd>
        <dt>Paid</dt><dd className="num text-right">{money(order.paid_minor, c)}</dd>
        <dt className="font-bold">Left to pay</dt><dd className="num text-right text-[24px] font-bold">{money(order.remaining_minor, c)}</dd>
      </dl>
      {last && (
        <p className="rounded-[14px] p-3 text-[18px] font-semibold" style={{ background: "var(--ok-bg)", color: "var(--ok)" }} role="status">
          {TENDER_METHOD[last.method]} {money(last.amount_minor, c)} recorded{last.recorded_by === meId ? ` by ${meName}` : ""}.
          {last.change_minor !== null && last.change_minor > 0 && <span className="block text-[26px] font-bold">Change to give: {money(last.change_minor, c)}</span>}
          {last.rounding_minor !== null && last.rounding_minor !== 0 && <span className="block text-[15px]">Cash rounding: {money(last.rounding_minor, c)}</span>}
        </p>
      )}
      {order.remaining_minor === 0 ? (
        <p className="text-[20px] font-bold">Paid in full</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="How they paid" className="grid grid-cols-3 gap-2">
            {(["cash", "card", "upi"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} className={`btn ${method === m ? "btn-primary" : "btn-plain"} min-h-16`} onClick={() => choose(m)} disabled={busy}>{TENDER_METHOD[m]}</button>
            ))}
          </div>
          <label className="block font-semibold">
            {method === "cash" ? `Cash handed over (${c})` : `Amount taken (${c})`}
            <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} aria-invalid={problem !== null} />
          </label>
          {method === "cash" && <button type="button" className="btn btn-plain" disabled={busy} onClick={() => setText(typedFromMinor(order.remaining_minor, c))}>Exact amount</button>}
          {method !== "cash" && (
            <label className="block font-semibold">
              Slip or UPI reference (optional)
              <input value={ref} maxLength={100} onChange={(e) => setRef(e.target.value)} disabled={busy} />
            </label>
          )}
          {problem && <p className="font-semibold text-danger">{problem}</p>}
          <button type="button" className="btn btn-primary pay-btn" disabled={busy || wait > 0 || typed === null || typed === 0 || tooMuch} onClick={() => void submit()}>
            {busy ? "Saving…" : wait > 0 ? `Try again in ${wait} s` : `Record ${TENDER_METHOD[method]} payment`}
          </button>
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <p className="text-[14px] text-muted">{RECORDED_ONLY} Nothing is charged here: record what the customer paid at the counter.</p>
      {order.tenders.length > 0 && (
        <ul className="grid gap-1 text-[15px]" aria-label="Payments recorded">
          {order.tenders.map((t) => (
            <li key={t.tender_id} className="flex justify-between gap-2">
              <span>{TENDER_METHOD[t.method]}{t.ref ? ` · ${t.ref}` : ""}{t.recorded_by === meId ? ` · by ${meName}` : ""}</span>
              <span className="num">{money(t.amount_minor, c)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type ReceiptLoad = { state: "idle" } | { state: "loading" } | { state: "ready"; receipt: Receipt } | { state: "failed"; text: string };

/** The receipt's own words for a failed load (the sale itself is saved either way). */
export function receiptErrorText(e: MunimError): string {
  if (e.kind === "not_found") return "The receipt isn't available for this order.";
  if (e.reasonCode === "tax_id_missing") return "This outlet's tax ids are missing, so a bill can't be printed. The sale is saved.";
  if (e.kind === "network") return "The receipt couldn't load. The sale is saved.";
  return staffErrorText(e, "counter");
}

/** GET /v1/orders/{id}/receipt on request, rendered field by field. `names` maps a receipt line's name_key. */
export function ReceiptBlock({ client, orderId, names, onAuth }: { client: StaffClient; orderId: string; names: (nameKey: string) => string; onAuth: (e: MunimError) => boolean }) {
  const [load, setLoad] = useState<ReceiptLoad>({ state: "idle" });
  const open = async () => {
    setLoad({ state: "loading" });
    const r = await client.getReceipt(orderId);
    if (r.ok) setLoad({ state: "ready", receipt: r.data });
    else if (!onAuth(r.error)) setLoad({ state: "failed", text: receiptErrorText(r.error) });
  };
  if (load.state === "idle") return <button type="button" className="btn btn-plain" onClick={() => void open()}>Show receipt</button>;
  if (load.state === "loading") return <div className="skeleton h-64" role="status" aria-label="Loading the receipt" />;
  if (load.state === "failed") return (<div className="space-y-2"><ErrorNote>{load.text}</ErrorNote><button type="button" className="btn btn-plain" onClick={() => void open()}>Try again</button></div>);
  const r = load.receipt;
  const m = (x: number) => money(x, r.currency);
  return (
    <section className="card grid gap-2 p-4 text-[15px]" aria-label="Receipt">
      <h2 className="text-[22px]">{r.title}</h2>
      {r.operator && <p>{r.operator}</p>}
      <p className="font-semibold">{r.seller.name}</p>
      <p className="text-muted">{r.seller.address}</p>
      {r.tax_ids.map((t) => <p key={t.code} className="num">{t.label} {t.value}</p>)}
      <p className="num">No. {r.number} · {r.date}</p>
      <table className="snap-table">
        <thead><tr><th scope="col">Item</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Price</th><th scope="col" className="num">Discount</th><th scope="col" className="num">Tax</th><th scope="col" className="num">Total</th></tr></thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.line_no}>
              <td>{names(l.name_key)}{l.components.length > 0 && <span className="block text-[13px] text-muted">{l.components.map((x) => `${x.code} ${formatRate(x.rate_bp, SITE.locale)} ${m(x.amount_minor)}`).join(" · ")}</span>}</td>
              <td className="num">{formatQty(l.qty_milli, SITE.locale)}</td>
              <td className="num">{m(l.unit_price_minor)}</td>
              <td className="num">{l.discount_minor ? m(l.discount_minor) : "—"}</td>
              <td className="num">{m(l.tax_minor)}</td>
              <td className="num">{m(l.total_minor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4">
        <dt>Net</dt><dd className="num text-right">{m(r.net_minor)}</dd>
        {r.components.map((x) => (<FragmentRow key={x.code} label={`${x.code} ${formatRate(x.rate_bp, SITE.locale)}`} value={m(x.amount_minor)} />))}
        <dt>Tax</dt><dd className="num text-right">{m(r.tax_minor)}</dd>
        <dt className="font-bold">Total</dt><dd className="num text-right font-bold">{m(r.total_minor)}</dd>
      </dl>
      <p className="text-[14px] text-muted">{RECORDED_ONLY}</p>
      <p className="text-[14px] text-muted">Sample shop — not a real sale.</p>
    </section>
  );
}

const FragmentRow = ({ label, value }: { label: string; value: string }) => (<><dt>{label}</dt><dd className="num text-right">{value}</dd></>);
```

### 7.4 The till screen

```tsx
// file: components/staff/pages/counter.tsx
"use client";
// /staff/counter: the till. Left, the counter menu as tiles by category; right, the cart rail priced only by
// POST /v1/orders:preview; one "Place order" attempt, then the order's own page takes the payment. A second tab
// lists today's orders. Nothing on this screen adds money up.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCountdown, useOnline } from "@/lib/hooks";
import { useLive, usePlace, useTillPreview, useTillSetup, useTodayOrders } from "@/lib/counter-hooks";
import { formatMoney, formatTime, shownName } from "@/lib/munim/format";
import { can } from "@/lib/munim/session";
import { ORDER_STATUS, staffErrorText } from "@/lib/munim/staff-copy";
import { topic } from "@/lib/munim/staff-stream";
import {
  addLine, entrySelectionProblems, writeErrorText, KIND_LABEL, MAX_QTY, needsSheet, newTillLine, NOTE_MAX, setQty, tillLineLabel, tillRefusalText,
  type MenuEntry, type TillContext, type TillKind, type TillLine,
} from "@/lib/munim/till";
import type { Schemas } from "@/lib/munim/types";
import { categoryLabel, NOTE_FIELDS, SITE } from "@/lib/site";
import { CategoryMotif } from "../../art";
import { QtyStepper } from "../../cart-bits";
import { CloseIcon } from "../../icons";
import { DietBadge, ErrorNote, FullPage, Toast, useToast } from "../../ui";
import { useStaff } from "../shell";
import { SimulateWebOrder } from "../simulate";
import { ORDER_TONE, StatusPill } from "../source";
import { CartRailLine, Tile } from "../till";

type OrderItem = Schemas["V1OrdersList"]["items"][number];
const money = (minor: number, currency: string) => formatMoney(minor, currency, SITE.locale);

export function CounterPage() {
  const { session, outlet } = useStaff();
  if (!can(session, "counter")) return <NotForRole />;
  if (!outlet) return <div className="state-box" role="status">Loading</div>;
  return <Till key={outlet.id} />;
}

export function NotForRole() {
  return (
    <FullPage title="Not for your role" action={<Link href="/staff" className="btn btn-primary">Go to your start page</Link>}>
      <p>The counter and the kitchen are for owners, managers and staff. Ask the owner if you need them.</p>
    </FullPage>
  );
}

function Till() {
  const { session, client, outlet, handleAuth } = useStaff();
  const router = useRouter();
  const online = useOnline();
  const [toast, say] = useToast();
  const [view, setView] = useState<"new" | "orders">("new");
  const { load, reload } = useTillSetup(client, outlet!.id, handleAuth);
  const setup = load.state === "ready" ? load.data : null;
  const [lines, setLines] = useState<TillLine[]>([]);
  const [kind, setKind] = useState<TillKind>("takeaway");
  const [table, setTable] = useState("");
  const [sheet, setSheet] = useState<MenuEntry | null>(null);
  const [bump, setBump] = useState(0);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const wait = useCountdown(waitUntil, () => setWaitUntil(null));
  const ctx: TillContext | null = useMemo(() => (setup ? { outletId: outlet!.id, channelId: setup.counter.id, deviceId: setup.deviceId, kind, tableRef: kind === "dine_in" ? table.trim().slice(0, 20) || null : null } : null), [setup, outlet, kind, table]);
  const { preview, loading, error: previewError } = useTillPreview(client, ctx, lines, bump);
  const { place, busy } = usePlace(client);
  const orders = useTodayOrders(client, outlet!.id, setup?.menu.business_date ?? null, handleAuth);
  const live = useLive(session, [topic.kds(outlet!.id)], orders.refresh);

  useEffect(() => { if (previewError) handleAuth(previewError); }, [previewError, handleAuth]);
  const refused = preview && preview.refusals.length > 0 ? preview.refusals : null;
  const canPlace = !!ctx && !!preview && !refused && !loading && !busy && wait === 0 && lines.length > 0;

  const doPlace = async () => {
    if (!ctx || !preview || refused) return;
    setPlaceError(null);
    const r = await place(ctx, lines, preview.total_minor);
    if (r.ok) {
      setLines([]);
      router.push(`/staff/counter/orders/${r.orderId}`);
      return;
    }
    if (handleAuth(r.error)) return;
    if (r.error.kind === "rate_limited") setWaitUntil(Date.now() + (r.error.retryAfterMs ?? 5000));
    setPlaceError(r.error.reasonCode ? tillRefusalText(r.error.reasonCode) : writeErrorText(r.error));
    if (!r.keep) setBump((b) => b + 1); // a refusal: re-preview so the rail shows what core says now
  };

  if (load.state === "failed") {
    if (load.error.kind === "not_found") return <FullPage title="Not found."><p>It may have been removed, or it isn&apos;t in your outlets.</p></FullPage>;
    return <main className="staff-main"><ErrorNote>{staffErrorText(load.error, "counter")}</ErrorNote><button type="button" className="btn btn-plain mt-3" onClick={reload}>Try again</button></main>;
  }
  if (load.state === "noCounter") return <FullPage title="No counter yet"><p>This business has no counter channel switched on, so the till can&apos;t sell.</p></FullPage>;

  return (
    <main className="staff-main-wide">
      {!online && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <div role="tablist" aria-label="Counter" className="flex gap-2">
          <button type="button" role="tab" aria-selected={view === "new"} className="chip" aria-current={view === "new" ? "true" : undefined} onClick={() => setView("new")}>New order</button>
          <button type="button" role="tab" aria-selected={view === "orders"} className="chip" aria-current={view === "orders" ? "true" : undefined} onClick={() => setView("orders")}>
            Today&apos;s orders{orders.items ? ` · ${orders.items.length}${orders.hasMore ? "+" : ""}` : ""}
          </button>
        </div>
        {live.off && (
          <p className="text-[14px] text-muted">Live updates are off. Tap Refresh to update. <button type="button" className="btn btn-ghost" onClick={orders.refresh}>Refresh</button></p>
        )}
        <span className="ml-auto"><SimulateWebOrder onDone={(ok) => { say(ok ? "A simulated web order was sent to the kitchen." : "The simulated order didn't go through."); orders.refresh(); }} /></span>
      </div>

      {view === "orders" ? (
        <OrdersList items={orders.items} hasMore={orders.hasMore} error={orders.error ? staffErrorText(orders.error, "counter") : null} onMore={orders.more} onRetry={orders.refresh} counterId={setup?.counter.id ?? null} channels={setup?.channels ?? []} tz={outlet!.tz} />
      ) : (
        <div className="pos">
          <section aria-label="Menu" className="space-y-5">
            {!setup ? <div className="tile-grid">{Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton h-[104px]" aria-hidden="true" />)}</div>
              : setup.menu.entries.length === 0 ? <p className="state-box">Nothing is on sale at this counter right now.</p>
              : grouped(setup.menu.entries).map(([cat, entries]) => (
                <div key={cat}>
                  <h2 className="mb-2 flex items-center gap-2 text-[22px]"><CategoryMotif slug={cat} size={26} /> {categoryLabel(cat)}</h2>
                  <div className="tile-grid">
                    {entries.map((e) => (
                      <Tile key={`${e.item_id}:${e.variant_id ?? "-"}`} entry={e} onAdd={(x) => (needsSheet(x, !!NOTE_FIELDS[x.name_key]) ? setSheet(x) : setLines((ls) => addLine(ls, newTillLine(x, []))))} />
                    ))}
                  </div>
                </div>
              ))}
          </section>

          <aside className="card cart-rail" aria-label="This order">
            <h2 className="text-[24px]">New order</h2>
            <div role="radiogroup" aria-label="Order kind" className="grid grid-cols-2 gap-2">
              {(["takeaway", "dine_in"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} className={`btn ${kind === k ? "btn-primary" : "btn-plain"}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            {kind === "dine_in" && (
              <label className="block font-semibold">Table (optional)<input value={table} maxLength={20} onChange={(e) => setTable(e.target.value)} /></label>
            )}
            {lines.length === 0 ? <p className="text-muted">Tap an item to start an order.</p> : (
              <div aria-busy={loading}>
                {lines.map((l, i) => {
                  const label = tillLineLabel(l);
                  const pl = preview && !refused ? preview.lines[i] : undefined;
                  const why = refused?.filter((r) => r.line_no === i + 1) ?? [];
                  return (
                    <div key={l.key}>
                      <CartRailLine name={label.name} detail={label.detail} note={l.note} qty={l.qty} lineTotal={pl ? money(pl.line_total_minor, preview!.currency) : null} disabled={busy} onQty={(q) => setLines((ls) => setQty(ls, l.key, Math.min(q, MAX_QTY)))} />
                      {why.map((r) => <p key={r.reason_code} className="font-semibold text-danger">{tillRefusalText(r.reason_code)}</p>)}
                    </div>
                  );
                })}
              </div>
            )}
            {refused ? (
              <div className="space-y-1">{refused.filter((r) => r.line_no === null).map((r) => <ErrorNote key={r.reason_code}>{tillRefusalText(r.reason_code)}</ErrorNote>)}<p className="text-muted">Fix the lines above to see the total.</p></div>
            ) : preview && lines.length > 0 ? (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1" aria-busy={loading}>
                <dt>Subtotal <span className="badge">Preview</span></dt><dd className="num text-right">{money(preview.subtotal_minor, preview.currency)}</dd>
                {preview.discount_minor > 0 && (<><dt>Discount</dt><dd className="num text-right">−{money(preview.discount_minor, preview.currency)}</dd></>)}
                <dt>Tax</dt><dd className="num text-right">{money(preview.tax_minor, preview.currency)}</dd>
                <dt className="text-[20px] font-bold">Total</dt><dd className="num text-right text-[24px] font-bold">{money(preview.total_minor, preview.currency)}</dd>
              </dl>
            ) : null}
            {previewError && previewError.kind !== "auth" && (
              <div className="space-y-1"><ErrorNote>{staffErrorText(previewError, "counter")}</ErrorNote><button type="button" className="btn btn-plain" onClick={() => setBump((b) => b + 1)}>Try again</button></div>
            )}
            {placeError && <ErrorNote>{placeError}</ErrorNote>}
            <button type="button" className="btn btn-primary pay-btn" disabled={!canPlace} onClick={() => void doPlace()}>
              {busy ? "Placing…" : wait > 0 ? `Try again in ${wait} s` : preview && !refused && lines.length > 0 ? `Place order · ${money(preview.total_minor, preview.currency)}` : "Place order"}
            </button>
            {lines.length > 0 && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setLines([])}>Clear order</button>}
            <p className="text-[14px] text-muted">Payment is recorded on the next screen. Recorded only — Munim does not process payments.</p>
          </aside>
        </div>
      )}
      <OptionsSheet entry={sheet} onClose={() => setSheet(null)} onAdd={(line) => { setLines((ls) => addLine(ls, line)); setSheet(null); }} />
      <Toast message={toast} />
    </main>
  );
}

/** Entries by category, in the site's order first, then any other category in API order. */
function grouped(entries: readonly MenuEntry[]): [string, MenuEntry[]][] {
  const cats = [...new Set(entries.map((e) => e.category))];
  const order = (c: string) => { const i = (SITE.categoryOrder as readonly string[]).indexOf(c); return i === -1 ? SITE.categoryOrder.length + cats.indexOf(c) : i; };
  return cats.sort((a, b) => order(a) - order(b)).map((c) => [c, entries.filter((e) => e.category === c)]);
}

function OptionsSheet({ entry, onClose, onAdd }: { entry: MenuEntry | null; onClose: () => void; onAdd: (l: TillLine) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (entry && !d.open) d.showModal();
    else if (!entry && d.open) d.close();
  }, [entry]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="sheet-title">
      {entry && <SheetForm key={`${entry.item_id}:${entry.variant_id ?? "-"}`} entry={entry} onClose={onClose} onAdd={onAdd} />}
    </dialog>
  );
}

function SheetForm({ entry, onClose, onAdd }: { entry: MenuEntry; onClose: () => void; onAdd: (l: TillLine) => void }) {
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [qty, setQtyN] = useState(1);
  const [note, setNote] = useState("");
  const problems = entrySelectionProblems(entry, optionIds);
  const noteField = NOTE_FIELDS[entry.name_key];
  const toggle = useCallback((ids: string[], id: string, single: boolean) =>
    setOptionIds((cur) => (single ? [...cur.filter((x) => !ids.includes(x)), id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])), []);
  const label = tillLineLabel({ entry, optionIds: [] });
  return (
    <form method="dialog" className="p-6" onSubmit={(e) => { e.preventDefault(); if (problems.length === 0) onAdd(newTillLine(entry, optionIds, note, qty)); }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <DietBadge diet={entry.diet} />
          <h2 id="sheet-title" className="mt-2 text-[28px]">{shownName(entry)}</h2>
          {label.detail && <p className="text-[18px] font-semibold">{label.detail}</p>}
        </div>
        <button type="button" className="btn btn-plain btn-round flex-none" onClick={onClose} aria-label="Close"><CloseIcon /></button>
      </div>
      {entry.option_groups.map((g) => {
        const single = g.max_select === 1;
        const ids = g.options.map((o) => o.option_id);
        const chosen = optionIds.filter((x) => ids.includes(x)).length;
        return (
          <fieldset key={g.option_group_id} className="mt-5">
            <legend className="font-bold">{shownName(g)} {g.required && <span className="badge ml-2">Required</span>}</legend>
            <p className="text-[14px] text-muted">{g.description ?? (single ? "Choose one." : g.min_select > 0 ? `Choose ${g.min_select} to ${g.max_select}.` : `Choose up to ${g.max_select}.`)}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {g.options.map((o) => {
                const on = optionIds.includes(o.option_id);
                return (
                  <label key={o.option_id} className="choice min-h-14">
                    <input type={single ? "radio" : "checkbox"} name={g.option_group_id} checked={on} disabled={!single && !on && chosen >= g.max_select} onChange={() => toggle(ids, o.option_id, single)} />
                    <span className="flex-1">{shownName(o)}</span>
                    {o.price_delta_minor !== 0 && <span className="num text-[14px] font-semibold">+{money(o.price_delta_minor, o.currency)}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      {noteField && (
        <div className="mt-5">
          <label htmlFor="till-note" className="font-bold">{noteField.label}</label>
          <p id="till-note-hint" className="text-[14px] text-muted">{noteField.hint} The kitchen sees it exactly as typed.</p>
          <textarea id="till-note" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby="till-note-hint" className="mt-2" />
          <p className="num text-right text-[14px] text-muted">{note.length}/{NOTE_MAX}</p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <QtyStepper qty={qty} name={shownName(entry)} onChange={(q) => setQtyN(Math.max(1, q))} />
        <button type="submit" className="btn btn-primary min-h-16 flex-1 sm:flex-none" disabled={problems.length > 0}>Add to order</button>
      </div>
      <p className="mt-3 min-h-6 text-[14px]">{problems[0] ? <span className="font-semibold text-danger">{problems[0]}</span> : <span className="text-muted">The price is confirmed in the order&apos;s preview.</span>}</p>
    </form>
  );
}

function OrdersList({ items, hasMore, error, onMore, onRetry, counterId, channels, tz }: {
  items: OrderItem[] | null;
  hasMore: boolean;
  error: string | null;
  onMore: () => void;
  onRetry: () => void;
  counterId: string | null;
  channels: { id: string; name: string }[];
  tz: string;
}) {
  if (error && !items) return <div className="space-y-2"><ErrorNote>{error}</ErrorNote><button type="button" className="btn btn-plain" onClick={onRetry}>Try again</button></div>;
  if (!items) return <div className="grid gap-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-16" aria-hidden="true" />)}</div>;
  if (items.length === 0) return <p className="state-box">No orders yet today.</p>;
  return (
    <div className="card overflow-x-auto p-2">
      {error && <ErrorNote>{error}</ErrorNote>}
      <table className="snap-table text-[16px]">
        <thead><tr><th scope="col">Ticket</th><th scope="col">Time</th><th scope="col">Kind</th><th scope="col">From</th><th scope="col">Status</th><th scope="col" className="num">Total</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.order_id}>
              <td className="num text-[20px] font-bold">#{o.ticket_no}</td>
              <td className="num">{formatTime(o.created_at, tz, SITE.locale)}</td>
              <td>{KIND_LABEL[o.kind]}{o.table_ref ? ` · Table ${o.table_ref}` : ""}</td>
              <td>{o.channel_id === counterId ? "Counter" : (channels.find((c) => c.id === o.channel_id)?.name ?? "Web")}</td>
              <td><StatusPill tone={ORDER_TONE[o.status]!}>{ORDER_STATUS[o.status]}</StatusPill></td>
              <td className="num">{money(o.total_minor, o.currency)}</td>
              <td><Link className="btn btn-plain" href={`/staff/counter/orders/${o.order_id}`}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && <button type="button" className="btn btn-plain mt-2 w-full" onClick={onMore}>Load more</button>}
      <p className="p-2 text-[14px] text-muted">Payments show on each order. Open an order to see what is left to pay.</p>
    </div>
  );
}
```

### 7.5 The order route

```tsx
// file: components/staff/pages/counter-order.tsx
"use client";
// /staff/counter/orders/[orderId]: one order at the counter. The order as core stored it, the tender panel, the
// counter's status steps (accept / reject a web order, cancel, picked up), and the receipt. It refetches on every
// event of order:<id>; nothing is patched from an event and nothing is added up.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useOnline } from "@/lib/hooks";
import { useOrder, useTillSetup } from "@/lib/counter-hooks";
import type { MunimError } from "@/lib/munim/client";
import { retryable } from "@/lib/munim/commands";
import { formatMoney, formatQty, formatTime } from "@/lib/munim/format";
import { can } from "@/lib/munim/session";
import { ORDER_STATUS, staffErrorText } from "@/lib/munim/staff-copy";
import { counterSteps, itemNames, KIND_LABEL, ORDER_REASONS, orderLineLabel, stepIds, writeErrorText, type StepIds } from "@/lib/munim/till";
import { SITE, UUID7 } from "@/lib/site";
import { ErrorNote, FullPage, Toast, useToast } from "../../ui";
import { ReceiptBlock, TenderPanel } from "../order-bits";
import { useStaff } from "../shell";
import { ORDER_TONE, StatusPill } from "../source";
import { NotForRole } from "./counter";

const money = (minor: number, currency: string) => formatMoney(minor, currency, SITE.locale);

export function CounterOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { session } = useStaff();
  if (!can(session, "counter")) return <NotForRole />;
  if (!UUID7.test(orderId)) return <NotFound />;
  return <OrderScreen key={orderId} orderId={orderId} />;
}

const NotFound = () => (
  <FullPage title="Not found." action={<Link href="/staff/counter" className="btn btn-primary">Back to the counter</Link>}>
    <p>It may have been removed, or it isn&apos;t in your outlets.</p>
  </FullPage>
);

type Step = { verb: "accept" | "reject" | "advance"; to: "accepted" | "rejected" | "cancelled" | "completed"; reason: string | null };

function OrderScreen({ orderId }: { orderId: string }) {
  const { session, client, outlets, handleAuth } = useStaff();
  const online = useOnline();
  const [toast, say] = useToast();
  const { order, error, missing, refresh, liveOff } = useOrder(client, session, orderId, handleAuth);
  const { load } = useTillSetup(client, order?.outlet_id ?? null, handleAuth);
  const setup = load.state === "ready" ? load.data : null;
  const names = itemNames(setup?.menu.entries ?? []);
  const tz = outlets.find((o) => o.id === order?.outlet_id)?.tz ?? "UTC";
  const ids = useRef<StepIds | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<"reject" | "cancel" | null>(null);
  const [reason, setReason] = useState<string>("");
  const [unpaidOk, setUnpaidOk] = useState(false);

  if (missing) return <NotFound />;
  if (!order) {
    if (error) return <main className="staff-main"><ErrorNote>{staffErrorText(error, "counter")}</ErrorNote><button type="button" className="btn btn-plain mt-3" onClick={() => void refresh()}>Try again</button></main>;
    return <main className="staff-main"><div className="skeleton h-96" role="status" aria-label="Loading" /></main>;
  }

  const steps = counterSteps(order, setup?.counter.id ?? null);
  const ended = order.status === "cancelled" || order.status === "rejected";
  const run = async (s: Step) => {
    setBusy(s.to);
    setStepError(null);
    const fp = JSON.stringify([order.order_id, order.status, s]);
    const r = await send(s, fp);
    setBusy(null);
    if (r.ok) {
      setReasonFor(null);
      setReason("");
      say(`Order #${order.ticket_no}: ${ORDER_STATUS[s.to]}`);
    } else if (!handleAuth(r.error)) setStepError(writeErrorText(r.error)); // refund_first, reason_required, a stale step, a dropped connection
    void refresh();
  };
  const send = async (s: Step, fp: string): Promise<{ ok: true } | { ok: false; error: MunimError }> => {
    const id = order.order_id;
    const { command_id, idempotency_key } = (ids.current = stepIds(ids.current, fp));
    const r = s.verb === "accept" ? await client.acceptOrder(id, { command_id, idempotency_key, type: "orders.order.accept.v1", payload: { order_id: id } })
      : s.verb === "reject" ? await client.rejectOrder(id, { command_id, idempotency_key, type: "orders.order.reject.v1", payload: { order_id: id, reason_code: s.reason ?? "" } })
      : await client.advanceOrder(id, { command_id, idempotency_key, type: "orders.order.advance.v1", payload: { order_id: id, from_status: order.status, to_status: s.to === "completed" ? "completed" : "cancelled", reason_code: s.reason } });
    if (r.ok || !retryable(r.error)) ids.current = null;
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  };

  return (
    <main className="staff-main-wide">
      {!online && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <div className="pos">
        <section className="card grid gap-3 p-4" aria-labelledby="order-title">
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="order-title" className="text-[34px]">Order #{order.ticket_no}</h1>
            <StatusPill tone={ORDER_TONE[order.status]!}>{ORDER_STATUS[order.status]}</StatusPill>
            {liveOff && <span className="text-[14px] text-muted">Live updates are off. Tap Refresh to update. <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>Refresh</button></span>}
          </div>
          <p className="text-muted">
            {KIND_LABEL[order.kind]}{order.table_ref ? ` · Table ${order.table_ref}` : ""} · {order.channel_id === setup?.counter.id ? "Counter" : (setup?.channels.find((c) => c.id === order.channel_id)?.name ?? "Web")} · {formatTime(order.created_at, tz, SITE.locale)}
            {order.invoice_no !== null && ` · Invoice ${order.invoice_no}`}
            {order.promised_at && ` · Ready by ${formatTime(order.promised_at, tz, SITE.locale)}`}
          </p>
          <ul className="grid gap-2">
            {order.lines.map((l) => {
              const label = setup ? orderLineLabel(setup.menu.entries, l) : { name: "…", detail: "" };
              return (
                <li key={l.line_id} className="cart-line">
                  <div><p className="text-[18px] font-semibold">{label.name}</p>{label.detail && <p className="text-[15px] text-muted">{label.detail}</p>}</div>
                  {/* Two fields side by side, never multiplied. */}
                  <p className="num text-right">{formatQty(l.qty_milli, SITE.locale)} × {money(l.unit_price_minor, order.currency)}{l.line_discount_minor > 0 && <span className="block text-[14px]">Discount {money(l.line_discount_minor, order.currency)}</span>}<span className="block text-[14px] text-muted">Tax {money(l.tax_minor, order.currency)}</span></p>
                </li>
              );
            })}
          </ul>
          <p className="text-[14px] text-muted">The cake message and other notes show on the kitchen ticket; this order view doesn&apos;t carry them yet.</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt>Subtotal</dt><dd className="num text-right">{money(order.subtotal_minor, order.currency)}</dd>
            {order.discount_minor > 0 && (<><dt>Discount</dt><dd className="num text-right">−{money(order.discount_minor, order.currency)}</dd></>)}
            <dt>Tax</dt><dd className="num text-right">{money(order.tax_minor, order.currency)}</dd>
            <dt className="text-[20px] font-bold">Total</dt><dd className="num text-right text-[22px] font-bold">{money(order.total_minor, order.currency)}</dd>
          </dl>

          <div className="flex flex-wrap gap-2">
            {steps.accept && <button type="button" className="btn btn-primary min-h-16" disabled={busy !== null} onClick={() => void run({ verb: "accept", to: "accepted", reason: null })}>{busy === "accepted" ? "Saving…" : "Accept"}</button>}
            {steps.reject && <button type="button" className="btn btn-plain min-h-16" disabled={busy !== null} onClick={() => setReasonFor("reject")}>Reject…</button>}
            {steps.cancel && <button type="button" className="btn btn-plain min-h-16 text-danger" disabled={busy !== null} onClick={() => setReasonFor("cancel")}>Cancel order…</button>}
            {steps.pickedUp && (order.remaining_minor === 0 || unpaidOk
              ? <button type="button" className="btn btn-secondary min-h-16" disabled={busy !== null} onClick={() => void run({ verb: "advance", to: "completed", reason: null })}>{busy === "completed" ? "Saving…" : order.remaining_minor === 0 ? "Picked up" : "Hand over unpaid"}</button>
              : <button type="button" className="btn btn-plain min-h-16" onClick={() => setUnpaidOk(true)}>Picked up</button>)}
          </div>
          {steps.pickedUp && unpaidOk && order.remaining_minor > 0 && <p className="font-semibold text-danger">{money(order.remaining_minor, order.currency)} is still to pay. Take the payment first, or hand it over unpaid.</p>}
          {reasonFor && (
            <fieldset className="grid gap-2">
              <legend className="font-bold">{reasonFor === "reject" ? "Why can't you take this order?" : "Why is it cancelled?"}</legend>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a reason</option>
                {ORDER_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary min-h-16" disabled={!reason || busy !== null} onClick={() => void run(reasonFor === "reject" ? { verb: "reject", to: "rejected", reason } : { verb: "advance", to: "cancelled", reason })}>
                  {busy ? "Saving…" : reasonFor === "reject" ? "Reject order" : "Cancel order"}
                </button>
                <button type="button" className="btn btn-plain min-h-16" disabled={busy !== null} onClick={() => setReasonFor(null)}>Keep it</button>
              </div>
            </fieldset>
          )}
          {stepError && <ErrorNote>{stepError}</ErrorNote>}
          <ReceiptBlock client={client} orderId={order.order_id} names={names} onAuth={handleAuth} />
        </section>

        <aside className="grid gap-3">
          {ended ? <p className="card p-4 text-[18px] font-semibold">This order was {order.status === "rejected" ? "not accepted" : "cancelled"}. Nothing is left to take.</p>
            : <TenderPanel client={client} order={order} meId={session.me.member_id} meName={session.me.name} onChanged={() => void refresh()} onAuth={handleAuth} />}
          <Link href="/staff/counter" className="btn btn-primary pay-btn">New order</Link>
        </aside>
      </div>
      <Toast message={toast} />
    </main>
  );
}
```

### 7.6 Mock button and pages

```tsx
// file: components/staff/simulate.tsx
"use client";
// Mock only: the "Simulate a web order" button (03 §6). A shopper's storefront order cannot reach the mock kitchen
// (it lives in the shopper's signed token), so this places a synthetic pickup order at the chosen outlet. Never
// rendered against the real API, where real storefront orders arrive on their own.
import { useState } from "react";
import { IS_MOCK } from "@/lib/munim";
import { MOCK_CONTROLS_ENABLED } from "@/lib/munim/mock-controls";
import { simulateWebOrder } from "@/lib/munim/staff-app";
import { useStaff } from "./shell";

export function SimulateWebOrder({ onDone }: { onDone: (ok: boolean) => void }) {
  const { session, outlet } = useStaff();
  const [busy, setBusy] = useState(false);
  if (!IS_MOCK || !MOCK_CONTROLS_ENABLED || !outlet) return null;
  return (
    <button type="button" className="btn btn-plain" disabled={busy} onClick={async () => {
      setBusy(true);
      const ok = await simulateWebOrder(session, outlet.id);
      setBusy(false);
      onDone(ok);
    }}>
      {busy ? "Sending…" : "Simulate a web order"}
    </button>
  );
}
```

```tsx
// file: app/staff/counter/page.tsx
import { Suspense } from "react";
import { CounterPage } from "@/components/staff/pages/counter";

export default function Page() {
  return <Suspense fallback={<div className="state-box" aria-busy="true" />}><CounterPage /></Suspense>;
}
```

```tsx
// file: app/staff/counter/orders/[orderId]/page.tsx
import { Suspense } from "react";
import { CounterOrderPage } from "@/components/staff/pages/counter-order";

export default function Page() {
  // The order id is only known at request time: the client reads it inside Suspense (as the storefront's tracker does).
  return <Suspense fallback={<div className="state-box" aria-busy="true" />}><CounterOrderPage /></Suspense>;
}
```

## 8 · What the mock gives the till

Cobnut Hazratganj on the counter channel: 18 entries (03 §3).

| Entry | Price (before GST) | Notes |
|---|---|---|
| Hazelnut Croissant | ₹180.00 | In the morning-bake deal (Mon–Sat 08:00–11:00 outlet time): a "Discount" row appears |
| Pain au Chocolat · Cardamom Knot | ₹170.00 · ₹140.00 | Cardamom Knot is in the deal too |
| Pistachio Danish | ₹210.00 | **Sold out** everywhere |
| Hazelnut Praline Cake ½ kg / 1 kg | ₹750.00 / ₹1,400.00 | "Sponge" required: "Classic (contains egg)" or "Eggless" (+₹80.00); "Message on the cake (optional)" |
| Gianduja Mousse Cup · Rose Pistachio Tres Leches | ₹260.00 · ₹240.00 | Tres Leches is sold out at Gomti Nagar only |
| Brown Butter Hazelnut Cookie · Eggless Choc-Chip · Oat & Jaggery | ₹90.00 · ₹80.00 · ₹85.00 | Oat & Jaggery comes to ₹89.26 with GST: a cash payment shows rounding |
| Build-a-Box of 6 / 9 / 12 | ₹540.00 / ₹780.00 / ₹1,020.00 | "Flavours" 2–4 (Kesar badam +₹60.00), "Gift wrap" 0–1 (+₹50.00), "Gift card message (optional)" |
| Truffle Tin | ₹650.00 | |
| Hazelnut Hot Chocolate Regular / Large | ₹160.00 / ₹210.00 | Goes to the bar station |
| Cold Coffee | ₹150.00 | "Milk" required: Dairy or Oat (+₹40.00); bar station |

GST is 5 % on top, shown as one "Tax" row. Today's seeded orders at Hazratganj are tickets 1–7 (03 §4): 1 and 2
"Picked up", 3 "Ready" (paid by UPI), 4 and 5 "Preparing", 6 and 7 "New". New orders continue the numbering.

## 9 · Acceptance checklist

`[mock]` = check on the extended mock · `[unit]` = a unit test or a stubbed response · `[real]` = only on the real API.

**Setup and labels**
- [ ] [mock] Signed in as "Imran Siddiqui (demo)", `/staff/counter` shows "Cobnut Hazratganj" in the bar (no switcher), the demo bar, the "Demo sign-in" badge, 18 tiles in five category groups, and "Pistachio Danish" with "Sold out" (a tap adds nothing).
- [ ] [mock] As "Nandini Mehrotra (demo)", switching to Gomti Nagar shows "Rose Pistachio Tres Leches" sold out there and an empty rail; switching back starts Hazratganj's rail empty too.
- [ ] [unit] A session with role `advisor` sees "Not for your role" on both routes; the nav has no "Counter" chip.
- [ ] [mock] "Recorded only — Munim does not process payments." is on the rail, the tender panel and the receipt; there is no card-number, PIN or bank field anywhere (`grep -rn "card number\|cvv\|pin" components/staff` finds nothing).

**Building and pricing**
- [ ] [mock] One Hazelnut Croissant outside the morning-bake hours: the line and "Total" read ₹189.00, exactly the preview's `line_total_minor` and `total_minor` (compare in the network tab); inside them a "Discount" row appears.
- [ ] [mock] The "1 kg (serves 8–10)" cake tile opens the sheet; "Add to order" stays disabled with "Choose a sponge" until one is chosen; "Eggless" shows "+₹80.00"; the message box stops at 200 characters and shows "{n}/200". The rail line reads "1 kg (serves 8–10) · Eggless" and "Note: “…”".
- [ ] [mock] Build-a-Box allows 2 to 4 flavours (a fifth box is disabled) and shows "+₹60.00" on Kesar badam.
- [ ] [mock] No preview request carries `note` or `line_id` (request body), and changing the stepper quickly sends previews whose late answers never overwrite a newer total.
- [ ] [mock] No `+`, `-`, `*`, `reduce` or sum touches a `_minor` value in `components/staff` or `lib/munim/till.ts`. The only arithmetic is `qty * 1000` in `tillLines` (a tapped count into thousandths), the stepper's count, and `typedFromMinor`, which only moves the decimal point to prefill the amount box.
- [ ] [unit] A stubbed preview with `refusals: [{ line_no: 1, reason_code: "item_sold_out" }]` hides the totals, shows "An item just sold out. Remove it to continue." under line 1 and disables "Place order".
- [ ] [unit] A stubbed place answer 409 `conflict` / `preview_total_changed` shows "The total changed since the preview. Check it and try again.", re-previews, and the next tap sends a new `idempotency_key`.

**Placing**
- [ ] [mock] "Place order · {total}" places one order (201) and opens `/staff/counter/orders/{id}` with "Order #8" (the next ticket number) and "Take payment"; the kitchen display shows ticket 8 within a second (live event).
- [ ] [mock] Double-tapping "Place order" creates one order. With DevTools offline, tap it: "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice."; back online, tap again: the request body is byte-identical to the first (same `command_id`, `idempotency_key`, `order_id`, line ids), and only one order exists.
- [ ] [mock] With the till loaded, switch Mock controls "Force 429" on and add a line: the rail shows "Too many requests. Please wait a moment and try again." + "Try again" and no total. With a preview already on the rail, switch it on and tap "Place order": the button counts down "Try again in 5 s"; switch it off and tap again: the request body is identical to the refused one.
- [ ] [unit] A stubbed 429 on the first `getMenu` shows the same line with "Try again" in place of the tiles.
- [ ] [mock] "Eat in" with "Table (optional)" "T4" sends `kind: "dine_in"`, `table_ref: "T4"`; the list shows "Eat in · Table T4".

**Payment**
- [ ] [mock] On a new ₹189.00 order: "Cash", type 200, "Record Cash payment" → "Cash ₹189.00 recorded by Imran Siddiqui (demo)." and "Change to give: ₹11.00"; "Left to pay" ₹0.00 and "Paid in full". Every figure equals the order response.
- [ ] [mock] An Oat & Jaggery Cookie (₹89.26): cash 100 records ₹89.00 and shows "Change to give: ₹11.00" and "Cash rounding: -₹0.26" (the tender row's fields). Another one: "Card" with "Amount taken" 89 records ₹89.00 and leaves ₹0.26; "Cash" with 1 then gives "What's left is smaller than the smallest cash step. Take it by card or UPI."; "UPI" with the prefilled 0.26 pays it.
- [ ] [mock] Card with an amount above "Left to pay" shows "Card and UPI can't be more than what's left to pay." and the button is disabled; a stubbed 422 gives the same line.
- [ ] [mock] Two tabs on the same order: pay it in full in one; recording again in the other shows "Nothing is left to pay on this order." and refreshes to "Paid in full".
- [ ] [mock] Offline, "Record Cash payment" fails with "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice."; back online the same tap resends the identical body and only one tender is listed.
- [ ] [mock] In the options sheet, choose 3 and "Add to order" twice for the same line (the Cold Coffee with Oat): the rail shows one line with 6.

**Today's orders and steps**
- [ ] [mock] "Today's orders · 7" (before any new order) lists tickets newest first with the right pills ("Picked up", "Ready", "Preparing", "New"); placing an order or moving a ticket on the kitchen display in another tab updates the list without a reload.
- [ ] [mock] "Simulate a web order" adds a "New" order from "Website (pickup)"; its page offers "Accept" and "Reject…". "Reject…" → "Out of stock" → "Reject order" turns it "Not accepted" and hides the tender panel.
- [ ] [mock] Ticket 6 (a counter order, "New") offers only "Cancel order…"; cancelling with "Customer asked" turns it "Cancelled" and it leaves the kitchen board.
- [ ] [mock] Cancelling a paid order gives "This order has payments. Refund them before cancelling."
- [ ] [mock] Ticket 3 ("Ready", paid) shows "Picked up" → "Picked up" pill. A ready, unpaid order warns "{money} is still to pay…" and needs "Hand over unpaid".
- [ ] [mock] Open the same "New" web order in two tabs; accept it in one; "Accept" in the other shows "This changed on another screen. It has been refreshed." and the page shows "Accepted".
- [ ] [mock] As Imran, opening a Gomti Nagar order's URL (copied from Nandini's list) shows "Not found." with no hint; `/staff/counter/orders/not-an-id` shows the same page without a request.

**Receipt**
- [ ] [mock] (needs 03's receipt route, this pack's addition) "Show receipt" on a Hazratganj order shows "Tax Invoice", the outlet's GSTIN and FSSAI numbers, "No. HZG-…", each line with "CGST 2.5% … · SGST 2.5% …", and totals equal to the order's.
- [ ] [mock] (same) On a Gomti Nagar order: "This outlet's tax ids are missing, so a bill can't be printed. The sale is saved."
- [ ] [unit] A stubbed 404 shows "The receipt isn't available for this order." inline (not the full page); a stubbed `V1OrderReceipt` with `name_key: "item.hazelnut_croissant"` shows "Hazelnut Croissant".
- [ ] [real] The real API's receipt for a counter order at an outlet with its tax ids renders with the device's series in "No. …".

**Live and quality**
- [ ] [mock] Blocking `/v1/stream` in DevTools shows "Live updates are off. Tap Refresh to update." after about 5 s; "Refresh" reloads the list. The mock's planned reconnect (about every 50 s) shows nothing.
- [ ] [mock] No `EventSource` (`grep -r EventSource app lib components` is empty); the token and tenant appear in no URL (network tab) and no console line.
- [ ] [mock] At 1024 × 768 and 1280 × 800 every tile is ≥ 104 px tall, every button ≥ 48 px, "Place order", the tender buttons and the step buttons ≥ 64 px; every input is ≥ 16 px; at 200 % zoom no action is lost.
- [ ] [mock] Placing, paying and every step are announced in the polite region; status is never colour alone (each pill has its word).
- [ ] [real] Against the real API (once the founder answers 00 §7 question 1) the same flows pass unchanged: a counter order numbers its invoice from the POS device, and a cash tender's change and rounding come back on the tender row.

## 10 · Screenshots

Name them `staff-counter-<state>-<width>.png` at **1024** and **1280** (both widths for every state):

`till-loading`, `till-empty-cart`, `till-cart-preview`, `till-deal-discount`, `options-sheet-cake`,
`options-sheet-problem`, `till-refusal` (stubbed), `till-placing`, `till-offline`, `till-429`, `orders-today`,
`orders-empty` (stubbed), `order-take-payment`, `order-change-to-give`, `order-cash-rounding`,
`order-cash-below-rounding`, `order-paid-in-full`, `order-web-new`, `order-reject-reason`, `order-cancelled`,
`order-unpaid-handover`, `order-stale-409`, `order-not-found`, `receipt`, `receipt-tax-id-missing`,
`receipt-not-available` (stubbed), `live-off`, `not-for-role` (stubbed).

No screenshot shows a token or a tenant id.
