# Storefront — `/order/[key]` (customer ordering: table QR, pickup, own site)

**Ticket:** T-063 (UI), T-032 (storefront API), T-028 (loyalty, coupons). **i18n prefix:** `order.*`.
**Who:** customer — guest (phone or email) or optional account; auth = storefront key (+ customer token).
**Pay at the counter only (R4):** no card fields anywhere. Phone-first; tap targets ≥ 48 px; inputs ≥ 16 px
(iOS zoom). White-label: logo, colours, layout preset from `settings/storefront`. A bad `[key]` → `S-404`
("This link isn't valid.") — never 403 (gotcha 16). Demo tenants show "Sample shop — orders are not real."

## O1 · Menu — `/order/[key]` (and `/order/[key]/table/[ref]` for dine-in QR)

Purpose: browse the outlet's live menu and build a cart for pickup or a table. Heading: "{outlet name}"

```
┌ [logo] Outlet A           ● Open · "Ready in about {n} min"      [Cart 2] ┐
│ "Pickup" ( ASAP ▾ | Today 12:30–12:45 ▾ )   or   "Table 4" (QR)          │
│ [Deals] [Mains] [Breads]                                                 │
│ Paneer tikka  {money}  [ + ]      Lunch combo {money}  "Deal 12–3 pm"     │
│ Butter naan   "Sold out"          Lassi  {money}  [ + ]                   │
└──────────────────────────────────────────────────────────────────────────┘
```
- Prices: `row core.price.amount_minor` for the outlet and channel (`table_qr`|`pickup`|`own_site`);
  option deltas `row core.option.price_delta_minor`. Deal badge: `row core.deal.windows` (outlet tz).
- **Accepting state** (R4 §E 2) from `row core.outlet.accepting_orders` + `outlet_calendar`:
  open → "Open"; busy → "Busy — about {busy_extra_min} min extra" (`row core.outlet.busy_extra_min`);
  paused → "Not taking orders right now. Back at {next_open}." (menu browsable, add disabled);
  closed → "Closed. Opens {next_open}." "Ready in about" = outlet default prep (gap G-KDS-1) + busy extra.
- Simple items add in one tap (toast "Added"); items with options open the options sheet (as POS P2) with a
  live line price; sold-out per outlet visible before checkout (R4 §E 4).
- Pickup windows: only windows with `booked < capacity_orders` are listed (`row core.pickup_window`);
  full windows hidden (R4 §E 1). Public menu/state read: route not fixed — T-032.
States: `S-err` "The menu couldn't load. Please try again." · `S-deny` n/a (public with a valid key; bad key → `S-404`) · `S-load` · `S-empty` "This menu is being set up. Please check back soon." · `S-off` "You're offline.
Your cart is kept on this phone." · `S-sse` n/a (no stream until an order exists) · `S-abst`/`S-aioff` n/a.

## O2 · Checkout — `/order/[key]/checkout`

Purpose: confirm the time, see the server's price breakdown, place the order. Heading: "Your order"

```
┌ Your order · Pickup Today 12:30–12:45  [Change]                          ┐
│ 1 × Lunch combo                 {money}                                  │
│     Deal "Lunch combo" applied  –{money}                                 │
│ Coupon [ SAVE10      ] [Apply]   → "SAVE10  –{money}"                     │
│ Subtotal {money} · Discount {money} · Tax {money} · Total {money}         │
│ Phone or email [            ]   Name [        ]                          │
│ "Pay at the counter — cash, card or UPI."                                 │
│ [ "Place order" ]                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Breakdown** is the server's pricing of the cart at the chosen promised time (deal judged at the promised
  time — R4 §E 5; coupon stacking shown line by line — §E 6). Before placement these are a *price preview*
  (gap G-POS-1, same as POS); after "Place order" every number is a row of the committed `core.order`.
- Guest: `storefront.guest.create.v1` then `orders.place.v1` (route for storefront place not fixed — T-032;
  `POST /v1/orders` is the member route). Server re-derives everything; client totals ignored (rule 9).
- After placing: "Want points next time? Create an account" (optional, R4 §E 8).

**Refusals (the "6 refusals" T-063 tests; literal, `order.refuse.*`):**
| # | Case | Copy | Code |
|---|---|---|---|
| R1 | window filled while checking out (server capacity re-check) | "That pickup time just filled up. Please choose another." | `reason_code TBD` (`window_full`) |
| R2 | outlet paused/closed at place time | "Outlet A stopped taking orders a moment ago. Back at {next_open}." | TBD (`outlet_paused`) |
| R3 | item sold out at place time | "{item} just sold out. Remove it to continue." | TBD (`sold_out`) |
| R4 | deal no longer applies at the new time (re-judge) | "The {deal} deal isn't available at {time}. Your total changed from {old} to {new}." | TBD (`deal_rejudged`) |
| R5 | coupon fails | cap: "This coupon has reached its limit." · min spend: "Spend {money} more to use this coupon." · scope: "This coupon isn't valid at this outlet." · validity: "This coupon has expired." | TBD (`coupon_*`) |
| R6 | cancel/reschedule window passed | "It's too late to change this order online. Please call the outlet." | TBD (`change_window_closed`) |
| R7 | deal edited while in cart | "The {deal} deal was updated. Please review your cart." | TBD (`deal_changed`) |
States: `S-empty` "Your cart is empty." + "Back to menu" · `S-deny` n/a · `S-abst` n/a (no intel) · `S-load` · `S-off` "No connection. Your order was not placed." + "Try again" (same idempotency key) ·
`S-err` "Your order was not placed. Please try again."

## O3 · Tracker — `/order/[key]/t/[order]`

Purpose: follow the order live; change or cancel within the window. Heading: "Order #{ticket_no}"

```
┌ Order #47 · Outlet A                         ● Live                    ┐
│ Placed ✓ → Accepted ✓ → Preparing ● → Ready → Picked up               │
│ "Ready at about 12:40"   (was 12:30 — "The kitchen pushed this back.") │
│ Total {money} · "Pay at the counter"                                   │
│ [ "Change time" ]  [ "Cancel order" ]   "You can change this for 04:12" │
└────────────────────────────────────────────────────────────────────────┘
```
- Self-updating via `GET /v1/stream?topics=order:<id>` (customer token); polling fallback every 15 s when the
  stream fails (R4 §E 9). Status = `row core.order.status`; times = `row core.order.promised_at` and
  `order_event` rows (promise change history); total = `row core.order.total_minor`.
- Rejected: "Sorry — the outlet couldn't take this order: {reason}." (reason from `order_event.reason`,
  chosen from the KDS list, never free model text).
- Countdown = outlet cancel/reschedule window − elapsed (gap G-SF-1: window length has no column in 02-schema).
  Cancel → "Cancel this order?" → one atomic reversal of points, coupon and recorded tender (R4 §E 10).
  Reschedule re-prices deals (R4) and shows R4 copy if the total changes.
- Non-email status channel (R4 §E 9; SMS or push) — gap G-SF-2 (R5 bans WhatsApp; nothing else chosen).
States: `S-empty` n/a · `S-err` "Can't load your order right now. It is still placed." · `S-off` "You're offline. Showing the last update." · `S-deny` change after the window → R6 copy · `S-abst` n/a · `S-load` · `S-sse` "Updating…" (falls back to polling, no error) · `S-404` for a wrong order id ·
completed → "Enjoy! Earned {points} points." (points = `row core.loyalty_entry.points` of the earn entry).

## O4 · Account (optional) — loyalty

Purpose: see points and their entries; optional account. Heading: "Your points"

Balance = Σ `loyalty_entry` (aggregate). Customers cannot open snapshots (`/v1/snapshots` is member-only), so
the balance is shown **with its entries listed beneath** (each a row: "Earned", "Redeemed", "Reversed",
"Adjusted — {reason}"). Gap G-SF-3: R26 has no customer-facing aggregate rule.
States: `S-load` · `S-empty` "No points yet. You earn points when an order is completed." · `S-err` std · `S-off` "You're offline." · `S-deny` another customer's account → `S-404` · `S-abst` n/a.

## R4 §E coverage

| §E | Where | §E | Where | §E | Where |
|---|---|---|---|---|---|
| 1 | O1 windows, O2 R1 | 6 | O2 breakdown, R5 | 11 | `kds.md` K1 |
| 2 | O1 accepting state, R2 | 7 | O4, O3 completed | 12 | `kds.md` K1 thresholds |
| 3 | O2 server pricing | 8 | O2 guest + account offer | 13 | `kds.md` push-back |
| 4 | O1 options, sold-out, R3 | 9 | O3 stream + polling, G-SF-2 | 14 | `kds.md` alert |
| 5 | O2 deal at promise, R4, R7 | 10 | O3 countdown, atomic cancel | 15 | `manager-staff-ops.md` M4 |
