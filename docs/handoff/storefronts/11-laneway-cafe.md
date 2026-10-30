# 11 · Laneway Cafe: the ordering site (Melbourne, 1 outlet)

Read 00, 01 and 02 first; 20 lists the rules. Everything here is **synthetic**: the cafe, its phone number, ABN and
orders are invented, and payment is recorded at the counter, never processed.

| | |
|---|---|
| Mock key | `sfk_mock_laneway_cafe_c42e08d1` |
| Locale | `en-AU` (`<html lang="en-AU">`) |
| Currency, zone | from the API (`currency` on prices and totals, `tz` on the outlet): `AUD`, `Australia/Melbourne` on the mock. Never hard-code either, and never append a fixed `+10:00`/`+11:00` (Melbourne moved to +11:00 on 4 Oct 2026; every instant from the API carries its own offset). |
| Palette, fonts | 02 §2.2; Anton + Montserrat |

## 1 · Brand

**Laneway Cafe** is a small corner cafe in a Fitzroy laneway (synthetic). Voice: quick, calm, a little dry; built for
the 7 am rush on a phone held in one hand. Tagline: "Coffee from the lane. Ordered before you reach the corner." Hero
shape: the takeaway cup with steam curls and the tram-wire zigzag from 02 §6.

## 2 · Site constants

```ts
// file: lib/site.ts
// Laneway Cafe's only site-specific code. Everything else comes from the API or lib/munim.
import { E164_PATTERN } from "./munim/checkout";
import { titleCase } from "./munim/format";

export const SITE = {
  name: "Laneway Cafe",
  locale: "en-AU",
  /** Coffee first: this is a morning-rush site. Any category the API adds later follows in API order. */
  categoryOrder: ["coffee", "food", "bakery"],
} as const;

// The API sends categories and deals as keys only (no display names): label them here, with a fallback.
const CATEGORY_LABEL: Record<string, string> = { coffee: "Coffee", food: "Food", bakery: "Bakery" };
const DEAL_LABEL: Record<string, string> = { "deal.early_bird": "Early bird" };

export const categoryLabel = (slug: string): string => CATEGORY_LABEL[slug] ?? titleCase(slug);
export const dealLabel = (nameKey: string): string => DEAL_LABEL[nameKey] ?? titleCase(nameKey);

/** An Australian number as typed ("0412 345 678", "(03) 9000 0101", "+61 412 345 678", "61412345678") -> E.164
 *  ("+61412345678"); null when it is not one. */
export function toE164(input: string): string | null {
  const d = input.replace(/[\s()-]/g, "");
  const e = d.startsWith("+") ? d : /^0[2-478]\d{8}$/.test(d) ? `+61${d.slice(1)}` : /^61[2-478]\d{8}$/.test(d) ? `+${d}` : /^[2-478]\d{8}$/.test(d) ? `+61${d}` : null;
  return e !== null && E164_PATTERN.test(e) && (!e.startsWith("+61") || /^\+61[2-478]\d{8}$/.test(e)) ? e : null;
}
```

## 3 · Sitemap

One outlet, so no outlet picker and no outlet id in the URL. Resolve it on every page with `munim.listOutlets()` and use
`outlets[0]` (keep its `outlet_id` and `tz`). If the API ever returns more than one outlet, show a simple picker card per
outlet on `/` and keep the chosen id in `sessionStorage` (`laneway.outlet`).

All API calls run in the browser, in client components (`"use client"`), through `munim` from `lib/munim`. The root
layout is a server component that renders only static chrome (demo bar, header shell, footer labels).

| Route | File | Page |
|---|---|---|
| `/` | `app/page.tsx` | Menu (home) |
| `/checkout` | `app/checkout/page.tsx` | Checkout |
| `/order/[orderId]` | `app/order/[orderId]/page.tsx` | Order tracker |
| `/cares` | `app/cares/page.tsx` | Munim Cares |
| `/not-valid` | `app/not-valid/page.tsx` | "This link isn't valid." |
| anything else | `app/not-found.tsx` | the same component as `/not-valid` |

An `orderId` that is not a lowercase UUIDv7 (`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`) goes
straight to the not-valid page without calling the API. The cart is `munim.cart.<outlet_id>` (01 §8.4).

## 4 · On every page

| Element | Content |
|---|---|
| Demo bar (top) | "Sample shop — orders are not real." |
| Header | Wordmark "LANEWAY CAFE" (links to `/`) and the cart button with `cartCount()` |
| Offline banner | While `navigator.onLine` is false or the last call failed with kind `network`: "You're offline. Your cart is kept on this phone." (tracker: "You're offline. Showing the last update.") |
| Footer | "Sample shop — orders are not real." · "Demo: all data is synthetic. Payments are recorded, never processed." · "Recorded only — Munim does not process payments." · link "Munim Cares" · the outlet's name, address, phone as a `tel:` link (omit when `phone` is null), and each `tax_ids[]` entry as "{label} {value}" (the ABN on the mock; omit when empty) |
| Mock test panel | Only when `MOCK_CONTROLS_ENABLED` (02 §5) |

## 5 · Pages

Copy in "double quotes" is literal. API copy helpers (`acceptingText`, `refusalText`, `errorText`, `payAtCounterText`,
`RECORDED_ONLY`, `DIET_LABEL`, `STATUS_LABEL`) are in 01 §8.2. Times use the outlet's `tz` and `"en-AU"`.

### 5.1 `/`: menu (home)

**Calls.** `munim.listOutlets()`, then `munim.getMenu(outlet_id)`. Refresh the menu when the tab regains focus and every
60 s while the page is visible. The menu's `accepting` drives the banner.

**Layout, top to bottom.** The state line comes first because it matters most at 7 am:

1. State banner (02 §5, reserved 56 px): `acceptingText(menu.accepting, nextOpen)` and, while `canOrder`, "Ready in about
   {readyInMinutes(menu.accepting)} min". Must be visible above the fold at 360 × 640.
2. Hero: "LANEWAY CAFE", the tagline, the cup shape with `.bob`. Keep it short on phones (≤ 40 % of the first screen).
3. Sticky category rail: one chip per category present (ordered by `SITE.categoryOrder`, labelled by `categoryLabel`),
   plus "Deals" when `deals` is non-empty.
4. Checker strip, marquee (category names, deal names, "Pickup only", the pay-at-counter line).
5. One section per category; **coffee tiles are at least 64 px tall** and add in one tap.
6. Deals section, Cares teaser ("Munim Cares" + "Surplus food from our cafe, offered to simulated recipients." → `/cares`),
   mobile cart bar.

`nextOpen` = `formatWhen(accepting.next_open, accepting.tz, "en-AU")`, or null.

**Item card** (02 §5): diet badge from `diet` (none when null) · `shownName(item)` · `description` (plain text) · price
`formatMoney(price_minor, currency, "en-AU")` ("$4.80"; prices include GST here, so no suffix) · for an item with
`variants` (`price_minor` is null): "Choose size" instead of a price · "Add".

| Item situation | Behaviour |
|---|---|
| No variants and no **required** option group | "Add" adds one (`addToCart(cart, newCartLine(item_id, null, []))`), toast "Added". Long-press or a small "Options" link opens the modal for milk choices |
| Has variants, or a required option group | "Add" opens the item modal (02 §5): variants as a required radio group with each variant's price; option groups per `min_select`/`max_select`/`required` with "+{money}" for non-zero `price_delta_minor`; quantity 1–20; "Add to cart" disabled while `selectionProblems()` returns anything (show the first problem as text) |
| `available: false` | "Sold out" pill, Add disabled with text "Sold out" (a variant with `available: false` is disabled in the modal) |
| Outlet paused or closed | Menu stays browsable; every Add disabled; banner explains |

**Deals section.** One card per `deals[]` entry: `dealLabel(name_key)` · each window as "{formatDays(days)} · {from}–{to}"
(`from`/`to` are outlet-local times; show them as given, e.g. "Every day · 07:00–09:00") · "Applied automatically at
checkout when your pickup time is in this window." Show no percentage or amount: the API sends none.

| State | Shows |
|---|---|
| loading | skeleton banner (reserved height) and six skeleton tiles |
| `listOutlets` or menu 404 | the not-valid page |
| `outlets: []` or `items: []` | "This menu is being set up. Please check back soon." |
| network | offline banner; a menu already shown stays; adding to the cart still works (the cart is local) |
| 429 | "Too many requests. Please wait a moment and try again." with "Trying again in {s} s", then one automatic retry |
| other error | "The menu couldn't load. Please try again." + "Try again" |
| busy | banner `--accent`: "Busy — about {busy_extra_min} min extra" |
| paused | banner `--ink`: "Not taking orders right now. Back at {nextOpen}." (no time when `next_open` is null) |
| closed | banner `--ink`: "Closed. Opens {nextOpen}." (no time when null). A visitor in another zone on Sunday night sees Monday's Melbourne opening time. |

### 5.2 Cart drawer

Opens from the header button or the mobile cart bar. While open, it previews the cart
(`munim.previewOrder(previewRequest(cart, menu))`, ASAP slot, debounced 300 ms after each change; ignore responses older
than the latest request).

| Part | Content |
|---|---|
| Line | `shownName(item)`, the variant and option names, qty stepper (1–20; "−" at 1 becomes a remove button), the line's `line_total_minor` from the preview (preview line N is cart line N), or before a preview the menu price with "each" |
| Footer | the preview's `total_minor` with a "Preview" badge and "incl. GST" under it; "Total at checkout" when there is no preview yet |
| Refusals | when `refusals` is non-empty, hide the total and list `refusalText()` for each, with a "Remove" button on `item_sold_out` lines |
| Buttons | "Go to checkout" (disabled while the outlet cannot take orders) |
| Empty | "Your cart is empty." + "Back to menu" |

### 5.3 `/checkout`

Heading "Your order". One column, four numbered sections. **Calls:** `listOutlets`, `getMenu`, `getPickupWindows` on
load; `previewOrder` (debounced 300 ms) whenever the lines, the slot or the coupon change; `placeOrder` on "Place order".

**1 · Pickup time.** Default "As soon as possible" with "Ready in about {readyInMinutes} min" (slot `ASAP`). A "Choose a
time" disclosure lists the windows from `getPickupWindows`, grouped under `dayLabel(starts_at, tz, "en-AU")` headings
("Today", "Tomorrow", "Wednesday 15 Oct"), each "{formatTime(starts_at)} – {formatTime(ends_at)}" in Melbourne time.
Choosing one sets `{ pickupWindowId: window.pickup_window_id, promisedAt: null }`. Full windows are never returned. No
windows: ASAP only, plus "No pickup times are available right now." when the outlet cannot take orders.

**2 · Review.** Each line: name, variant and options, qty, the preview's `line_total_minor`; a "GST-free" badge when the
line's `tax_rate_bp` is 0; a "Deal applied" badge when `deal_refs` is non-empty, named with `dealLabel` of the matching
`menu.deals[]` entry (`dealIdsOf(line.deal_refs)`). Coupon: one text input "Coupon code" (auto upper-case;
`COUPON_PATTERN`; on a bad format say "Enter a valid code" without calling the API) with "Apply" / "Remove". Price block
with a "Preview" badge:

| Row | Value |
|---|---|
| "Subtotal" | `subtotal_minor` |
| "Discount" | "−{discount_minor}" (row hidden when it is 0) |
| "Total" | `total_minor` |
| under the total, small: one line per `tax_components[]` entry | "Includes {code} {formatRate(rate_bp)}: {amount_minor}" (on the mock, one Flat White: "Includes GST 10%: $0.44"); none when the list is empty |

Prices include GST (`prices_include_tax: true`), so GST is **contained in** the total, never a row that adds to it.
Every value is a field of the latest preview, formatted with `formatMoney(…, preview.currency, "en-AU")`. Never add the
components up or derive one row from another. When `refusals` is non-empty, **hide the whole price block** and show each
refusal's `refusalText()` with its action:

| Refusal | Action offered |
|---|---|
| `item_sold_out`, `item_unavailable` | "Remove" on that line (from `params.line_no`) |
| `coupon_*` | "Remove coupon" |
| `window_full` | re-fetch windows, switch the slot to ASAP, re-preview |
| `outlet_paused` | re-read `getState`; Place stays disabled while it cannot take orders |

**3 · Your details.** Labels above inputs.

| Field | Rules | Error copy |
|---|---|---|
| "Name" | required, trimmed, 1–200 chars, `autocomplete="name"` | "Enter your name." |
| "Phone" | `inputmode="tel"`, `autocomplete="tel"`; sent as `toE164(value)` | "Enter an Australian phone number, like 0412 345 678." |
| "Email" | `inputmode="email"`, `autocomplete="email"`, `EMAIL_PATTERN` | "Enter a valid email address." |
| (both empty) | at least one of phone or email | "Add a phone number or an email so the cafe can reach you." |
| "Send me offers" checkbox | unchecked by default; sent as `consent.marketing` | — |

Validate on blur and on submit; on submit move focus to the first invalid field.

**4 · Place.** Text `payAtCounterText(menu.pay_at_counter_methods)` ("Pay at the counter — cash or card." on the mock)
and `RECORDED_ONLY`. No card fields anywhere. Button "Place order", enabled only when a preview exists, is not in flight,
has no refusals, the form is valid and the outlet can take orders. Then follow 01 §8.4 exactly.

| State | Shows |
|---|---|
| cart empty | "Your cart is empty." + "Back to menu" |
| preview in flight | price block greyed (`aria-busy="true"`), Place disabled |
| placing | button "Placing…", every input disabled |
| network / 5xx | `errorText(e, "checkout")` + "Try again" (same attempt) |
| 429 | "Too many requests. Please wait a moment and try again." + "Try again in {s} s" countdown from `retryAfterMs`, then "Try again" (same attempt) |
| refusal at place | `refusalText()` + re-preview; `preview_total_changed`: show the new preview, the shopper taps again (a new attempt follows from the new total) |
| replay with no saved token | "We couldn't confirm your order on this device. Please check with the cafe." + the cafe phone |
| 404 | the not-valid page |
| success | save the token, clear attempt and cart, `router.replace("/order/{order_id}")` |

### 5.4 `/order/[orderId]`: tracker

**On load.** `token = loadGuestToken(orderId)`. No token: the not-valid page with the extra line "Orders can be followed
only on the device that placed them." Otherwise `trackOrder({ client: munim, baseUrl: API_BASE, storefrontKey:
STOREFRONT_KEY, orderId, guestToken: token, … })` (01 §8.5), plus `listOutlets()` and `getMenu(order.outlet_id)` for the
cafe's details and item names. Stop tracking on unmount.

| Part | Content |
|---|---|
| Title | "ORDER #{ticket_no}" (display face) |
| Status line (`aria-live="polite"`) | placed "Order placed. Waiting for the cafe to accept it." · accepted "The cafe accepted your order." · preparing "Your order is being made." · ready "Your order is ready. Come and grab it." · completed "Picked up. Enjoy!" · rejected "Sorry — the cafe couldn't take this order." plus, when the last `events[]` entry with `to_status: "rejected"` has a `reason`, ": {titleCase(reason)}." · cancelled "This order was cancelled." |
| Progress | 5 steps with `STATUS_LABEL` words (Placed, Accepted, Preparing, Ready, Picked up); off-path statuses hide the bar |
| Promise | while not final: "Ready at about {formatWhen(promised_at, tz)}". If the latest `events[]` entry of kind `promised_at` moved it later and its `reason` is not `customer_rescheduled`: "(was {formatWhen(from_promised_at)}) The kitchen pushed this back." |
| Live indicator | "Live" (ok dot) while `onLive(true)`; "Updating…" otherwise; hidden once final |
| Order card | lines: name (from the menu; "Item" if unknown), variant name, "{formatQty(qty_milli)} × {formatMoney(unit_price_minor)}" (two fields side by side, not multiplied); then "Subtotal", "Discount" (when > 0), "Total", and "Includes GST: {tax_minor}" when `prices_include_tax` is true ("Tax: {tax_minor}" otherwise) — all fields of the order view |
| Payment | `payAtCounterText(outlets.pay_at_counter_methods)` and `RECORDED_ONLY` |
| Changes | "Call the outlet to change this order" with the cafe `phone` as a `tel:` link (address only when `phone` is null). No cancel or reschedule buttons for guests. |
| Footer extra | the cafe's ABN from `tax_ids` |

| State | Shows |
|---|---|
| loading | skeleton title and card |
| two 404s (`onNotFound`) | the not-valid page. On the mock this also happens when the mock forgets the order (see §7) |
| read failure, not 404 | keep the last order; "Can't load your order right now. It is still placed." |
| offline | "You're offline. Showing the last update." |

### 5.5 `/cares`: Munim Cares

**Calls.** `munim.getCares()` once per page view; `munim.getNetworkImpact()` once (any failure hides the network block;
the mock always fails it with 404).

| Part | Content |
|---|---|
| Title | sticker "Munim Cares" |
| Intro | "Surplus food from our cafe, offered to simulated recipients." |
| Listing card | `outlet_name` · "Pickup {dayLabel(pickup_from, tz)} {formatTime(pickup_from, tz)} – {formatTime(pickup_to, tz)}" using the **listing's own** `tz` · each line: `FOOD_KIND_LABEL[food_kind]` badge, `label` (or `titleCase(label_key)`, else "Food") as plain text, "{formatQty(qty_milli)} {unitLabel(unit)}", and "Use by {formatDate(expires_on)}" when set (prominent for `cooked`) · recipient: `recipient_name` (it already says "(synthetic)") plus a badge "Simulated recipient" |
| Network block (real API only) | `impactTotal(impact)`: "{formatQty(meals_portions_milli.value)} meals shared across Munim" + `impact.labels.recipients` ("to simulated recipients") + `impact.labels.data` ("Measured on synthetic data", always visible) · `data-ref` attribute = `meals_portions_milli.ref` · a `<details>` "Source" showing the ref, `snapshot_id` and `as_of` |
| Note | "Check your local food-donation rules" (no Australian legal text) |
| Labels | the site-wide demo labels |

| State | Shows |
|---|---|
| loading | two skeleton listing cards |
| `items: []` | "No donations are listed right now." |
| 429 | "Too many requests. Please wait a moment and try again." and one retry after `retryAfterMs` |
| 404 | the not-valid page |
| other error | "Donations couldn't load right now." (the rest of the page still renders) |

Do not poll this route (it is rate-limited at 60 requests a minute).

### 5.6 Not valid

Full-page card: title "This link isn't valid." · "Check the address, or start again from the menu." · button "Go to the
menu" → `/`. Used for every 404 (bad key, unknown order, missing guest token) and every unknown route. Never say which
part was wrong.

## 6 · Signed-in features (not in this build)

Cancel, change pickup time and loyalty need a customer token, and how a storefront gets one is not part of the API yet.
Do not build them. (The client has `cancelOrder`, `reschedulePreview` and `rescheduleOrder` for later.)

## 7 · What the mock contains

The mock answers like the real API but keeps orders **in memory per server instance**: a redeploy, a cold start or
another instance forgets them (then the order reads 404), and each business keeps at most its 30 newest orders.

| Outlet | Address | Phone | Tax ids | State on the mock |
|---|---|---|---|---|
| Laneway Cafe Fitzroy | 5 Synthetic Lane, Fitzroy VIC (synthetic) | `+61390000101` | ABN | open |

Prep time 8 min. The mock is "open" at any hour unless you force a state (01 §7). Pickup windows: 30-minute slots from
07:00 to 15:00 Melbourne time, today and tomorrow, capacity 4, some part-booked, at most 24 returned. Prices include GST
10% (`prices_include_tax: true`); the Sourdough Loaf is GST-free. No brands (`brands: []`, so `brand_id` is null).
`pay_at_counter_methods`: cash, card.

| Item | Category | Price | `diet` | Notes |
|---|---|---|---|---|
| Flat White | coffee | $4.80 | veg | "Milk": optional, choose up to 1 (Oat milk +$0.80, Almond milk +$0.80); in the early-bird deal |
| Latte | coffee | $5.00 | veg | "Milk" as above |
| Smashed Avocado on Sourdough | food | $18.50 | vegan | "Add-ons": 0–2 (Poached egg +$3.00, Feta +$2.50) |
| Long Black | coffee | $4.50 | vegan | |
| Iced Latte | coffee | variants only: Regular $6.00, Large $7.00 | veg | `price_minor` null |
| Sourdough Loaf | bakery | $9.00 | vegan | GST-free (`tax_rate_bp` 0, no tax components) |
| Banana Bread | bakery | $7.00 | egg | sold out |

Deal `deal.early_bird`: every day 07:00–09:00 Melbourne time on Flat White, judged at the promised time.

| Coupon | Behaviour |
|---|---|
| `LANE5` | applies with a minimum spend of $10.00 (after deals) |
| `OLDBREW15` | `coupon_expired` |
| `FIRST50` | `coupon_cap_reached` |
| any other well-formed code | `coupon_invalid` |

Orders move `placed` → `accepted` (45 s) → `preparing` (75 s) → `ready` (110 s) and stop there. The mock never rejects
an order, never pushes one back, and never completes one.

## 8 · Acceptance checklist

`[mock]` = check it against the mock · `[real]` = only possible on the real API · `[unit]` = check with a unit test or
a stubbed response, because the mock cannot produce it.

**Setup and labels**
- [ ] [mock] `npx tsx scripts/smoke.ts` prints "smoke: all ok" with this key.
- [ ] [mock] With the right key the menu loads with one outlet and no picker. With `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY=wrong` the site shows "This link isn't valid." and the network tab shows 404.
- [ ] [mock] "Sample shop — orders are not real." and "Demo: all data is synthetic. Payments are recorded, never processed." on every page, including not-valid and the tracker.
- [ ] [mock] "Recorded only — Munim does not process payments." beside every mention of payment (checkout, tracker, footer).
- [ ] [mock] No `EventSource` anywhere (`grep -r EventSource app lib` is empty); the key and token never appear in a URL (check the network tab) or in `console` output.

**Menu**
- [ ] [mock] The state line and "Ready in about 8 min" are visible above the fold at 360 × 640.
- [ ] [mock] Prices render "$4.80", "$5.00", "$18.50" from `price_minor` + `currency` with `en-AU`; no price appears in the source code.
- [ ] [mock] Test panel busy: "Busy — about 15 min extra" and "Ready in about 23 min". Paused: "Not taking orders right now. Back at {time}." Closed: "Closed. Opens {time}." Add is disabled in both and the menu stays browsable.
- [ ] [mock] With the computer's zone set to `America/New_York`, the closed state's opening time is still Melbourne time (07:00 on the mock).
- [ ] [mock] Banana Bread shows "Sold out" and cannot be added; Banana Bread shows "Egg", Long Black "Vegan", Flat White "Veg".
- [ ] [mock] Flat White adds in one tap; its milk options are reachable; Iced Latte asks "Choose one: Regular or Large"; Smashed Avocado shows "+$3.00" and "+$2.50".
- [ ] [mock] Coffee tiles are at least 64 px tall; the Deals section shows "Early bird" with "Every day · 07:00–09:00" and no percentage.
- [ ] [mock] With "Force 429" on, the menu shows "Too many requests…" with a countdown, then recovers when it is off.
- [ ] [mock] Offline (devtools) shows "You're offline. Your cart is kept on this phone." and adding to the cart still works.

**Cart and checkout**
- [ ] [mock] The cart badge is a count; no money appears in the cart until a preview returns, then the drawer shows the preview total with "Preview".
- [ ] [mock] Review shows "Subtotal", "Total" and "Includes GST 10%: {amount}" exactly equal to the preview response fields; GST is not added as a row; no `+` or `reduce` touches a `_minor` value in the code.
- [ ] [mock] A Sourdough Loaf line shows "GST-free"; a cart of only Sourdough Loaf shows no "Includes GST" line.
- [ ] [mock] `LANE5` on one Flat White, with ASAP outside 07:00–09:00 Melbourne time: totals hidden, "Spend $5.20 more to use this coupon." (from `params.shortfall_minor`). Inside 07:00–09:00 the early-bird deal lowers the spend first, so the shortfall the API sends is larger; show whatever it sends.
- [ ] [mock] `OLDBREW15`: "This coupon has expired."; `FIRST50`: "This coupon has reached its limit."; `ZZZ99`: "This coupon isn't valid."; `a!`: "Enter a valid code" with no request sent.
- [ ] [mock] Flat White with a window between 07:00 and 09:00: the line shows "Deal applied · Early bird" and a discount row.
- [ ] [mock] ASAP sends `pickup_window_id: null, promised_at: null`; a chosen window sends its id with `promised_at: null`.
- [ ] [mock] Window headings say "Today" / "Tomorrow" in Melbourne time even with the computer's zone set elsewhere.
- [ ] [mock] `window_full`: pick a window with 1 place left (`capacity_orders - booked` = 1 in the pickup-windows response) and preview it here; within a few seconds, in a second tab of the same browser, place one order into that window; then change anything in the first tab's cart so it previews again: "That pickup time just filled up. Please choose another." and the windows refresh. (The mock keeps bookings per server instance, so if the second order lands on another instance this will not reproduce: then cover it with the `[unit]` stub below.)
- [ ] [unit] A stubbed preview with `refusals: [{ line_no: null, reason_code: "window_full" }]` hides the totals, shows "That pickup time just filled up. Please choose another." and re-fetches the windows.
- [ ] [mock] "0412 345 678" is sent as `"+61412345678"`; "12345" shows "Enter an Australian phone number, like 0412 345 678."; both fields empty shows "Add a phone number or an email so the cafe can reach you."; inputs do not zoom on an iPhone.
- [ ] [mock] Place sends `order` and `guest` envelopes with UUIDv7 ids; `localStorage["munim.guest.<order_id>"]` exists before the tracker renders.
- [ ] [mock] Double-clicking "Place order" creates one order. After a failed place (set the network offline before tapping, then back online), "Try again" sends a request body byte-identical to the first (same `idempotency_key`, `order_id`, line ids and `consent.at`; compare the two in the network tab). The replay header itself is proven by the smoke test.
- [ ] [mock] Editing the cart after a failed attempt sends new `idempotency_key`s (no `idempotency_conflict`).
- [ ] [mock] Test panel paused, then Place: "Laneway Cafe Fitzroy stopped taking orders a moment ago. Back at {time}."
- [ ] [mock] "Pay at the counter — cash or card." is shown and there are no card fields anywhere.
- [ ] [unit] `preview_total_changed`, `deal_changed` and `item_unavailable` bodies (stub the response) show their copy and re-run the preview.

**Tracker**
- [ ] [mock] The tracker URL opened in a private window (no token) shows the not-valid page.
- [ ] [mock] The status moves Placed → Accepted (≈45 s) → Preparing (≈75 s) → Ready (≈110 s) without reload, with "Live" showing; the screen reader announces each change.
- [ ] [mock] Blocking `/v1/stream` in devtools shows "Updating…", and the status still advances by polling (15 s), with no error banner.
- [ ] [mock] "Ready at about {time}" is in Melbourne time with the computer's zone set elsewhere.
- [ ] [mock] Guests see "Call the outlet to change this order" with a `tel:` link and no cancel or reschedule buttons; the footer shows the ABN.
- [ ] [unit] A stubbed `rejected` order with `reason: "out_of_stock"` reads "Sorry — the cafe couldn't take this order: Out of stock."; with `reason: null` the clause is gone.
- [ ] [unit] A stubbed `promised_at` event moving the time later with `reason: "kitchen_busy"` shows "(was …) The kitchen pushed this back."; with `customer_rescheduled` it does not.

**Cares**
- [ ] [mock] Two listings render with "Simulated recipient", "Cooked", "6 portions" / "10 portions", pickup times in Melbourne time, and "Check your local food-donation rules".
- [ ] [mock] The network block is hidden (the mock answers 404) and nothing else on the page breaks.
- [ ] [real] On the real API the network block shows the meals figure with "Measured on synthetic data" and a working "Source" disclosure.
- [ ] [unit] A listing `label` of `<b>x</b>` renders as the literal text `<b>x</b>`.

**Quality**
- [ ] [mock] `npm run build` and `npx tsc --noEmit` pass with no errors.
- [ ] [mock] Lighthouse (mobile) on `/` and `/checkout`: performance ≥ 90, accessibility ≥ 95; axe: no serious or critical issues.
- [ ] [mock] Every tap target ≥ 48 px (coffee tiles ≥ 64 px), every input ≥ 16 px; works at 320 px wide and at 200 % zoom; `prefers-reduced-motion` stops the bob, marquee and drawer slide.
- [ ] [mock] Budget: `/` ≤ 150 KB gzipped JavaScript, LCP ≤ 2.0 s and CLS ≤ 0.1 on a mid-range phone over 4G (no layout shift when the state banner loads); two font families.
