# 10 · Spice Route: the ordering site (India, 3 outlets)

Read 00, 01 and 02 first; 20 lists the rules. Everything here is **synthetic**: the business, outlets, phone numbers,
tax ids and orders are invented, and payment is recorded at the counter, never processed.

| | |
|---|---|
| Mock key | `sfk_mock_spice_route_7f3a91c2` |
| Locale | `en-IN` (`<html lang="en-IN">`) |
| Currency, zone | from the API (`currency` on prices and totals, `tz` on outlets): `INR`, `Asia/Kolkata` on the mock. Never hard-code either. |
| Palette, fonts | 02 §2.1; Bebas Neue + Inter (with `latin-ext` for `₹`) |

## 1 · Brand

**Spice Route** is a North-Indian kitchen with three neighbourhood outlets in Bengaluru (all synthetic). Voice: warm,
quick, generous; short sentences. Tagline: "Three kitchens. One menu. Order ahead, pick up hot." Hero shape: the bowl and
chilli from 02 §6.

## 2 · Site constants

```ts
// file: lib/site.ts
// Spice Route's only site-specific code. Everything else comes from the API or lib/munim.
import { E164_PATTERN } from "./munim/checkout";
import { titleCase } from "./munim/format";

export const SITE = {
  name: "Spice Route",
  locale: "en-IN",
  /** Categories in this order first; any category the API adds later follows in API order. */
  categoryOrder: ["starters", "mains", "breads", "drinks", "desserts"],
} as const;

// The API sends categories and deals as keys only (no display names): label them here, with a fallback.
const CATEGORY_LABEL: Record<string, string> = { starters: "Starters", mains: "Mains", breads: "Breads", drinks: "Drinks", desserts: "Desserts" };
const DEAL_LABEL: Record<string, string> = { "deal.weekday_lunch": "Weekday lunch" };

export const categoryLabel = (slug: string): string => CATEGORY_LABEL[slug] ?? titleCase(slug);
export const dealLabel = (nameKey: string): string => DEAL_LABEL[nameKey] ?? titleCase(nameKey);

/** An Indian mobile number as typed ("98123 45678", "098123-45678", "+91 98123 45678", "919812345678") -> E.164
 *  ("+919812345678"); null when it is not one. */
export function toE164(input: string): string | null {
  const d = input.replace(/[\s()-]/g, "");
  const e = d.startsWith("+") ? d : /^0\d{10}$/.test(d) ? `+91${d.slice(1)}` : /^91\d{10}$/.test(d) ? `+${d}` : /^\d{10}$/.test(d) ? `+91${d}` : null;
  return e !== null && E164_PATTERN.test(e) && (!e.startsWith("+91") || /^\+91[6-9]\d{9}$/.test(e)) ? e : null;
}
```

## 3 · Sitemap

All API calls run in the browser, in client components (`"use client"`), through `munim` from `lib/munim`. The root
layout is a server component that renders only static chrome (demo bar, header shell, footer labels).

| Route | File | Page |
|---|---|---|
| `/` | `app/page.tsx` | Home and outlet picker |
| `/o/[outletId]` | `app/o/[outletId]/page.tsx` | Menu |
| `/o/[outletId]/checkout` | `app/o/[outletId]/checkout/page.tsx` | Checkout |
| `/o/[outletId]/order/[orderId]` | `app/o/[outletId]/order/[orderId]/page.tsx` | Order tracker |
| `/cares` | `app/cares/page.tsx` | Munim Cares |
| `/not-valid` | `app/not-valid/page.tsx` | "This link isn't valid." |
| anything else | `app/not-found.tsx` | the same component as `/not-valid` |

An `outletId` or `orderId` that is not a lowercase UUIDv7 (`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
goes straight to the not-valid page without calling the API.

Carts are **per outlet** (`munim.cart.<outletId>`, 01 §8.4), so changing outlet never clears anything.

## 4 · On every page

| Element | Content |
|---|---|
| Demo bar (top) | "Sample shop — orders are not real." |
| Header | Wordmark "SPICE ROUTE" (links to `/`); on outlet routes the cart button with `cartCount()` |
| Offline banner | While `navigator.onLine` is false or the last call failed with kind `network`: "You're offline. Your cart is kept on this phone." (tracker: "You're offline. Showing the last update.") |
| Footer | "Sample shop — orders are not real." · "Demo: all data is synthetic. Payments are recorded, never processed." · "Recorded only — Munim does not process payments." · link "Munim Cares" · on outlet routes: outlet name, address, phone as a `tel:` link (omit when `phone` is null), and each `tax_ids[]` entry as "{label} {value}" (omit when empty) |
| Mock test panel | Only when `MOCK_CONTROLS_ENABLED` (02 §5) |

## 5 · Pages

Copy in "double quotes" is literal. API copy helpers (`acceptingText`, `refusalText`, `errorText`, `payAtCounterText`,
`RECORDED_ONLY`, `DIET_LABEL`, `STATUS_LABEL`) are in 01 §8.2.

### 5.1 `/`: home and outlet picker

**Calls.** `munim.listOutlets()`; then `munim.getState(outlet_id)` for every outlet in parallel. Each state call fails
on its own: a failed one leaves that card without a badge, never an error page.

**Content.** Hero ("SPICE ROUTE", tagline, button "Order for pickup" scrolling to the outlets) · checker strip · sticker
"Pick your kitchen" · one card per outlet in API order · marquee (category names, "Pickup only", the pay-at-counter
line) · Cares teaser card: "Munim Cares" + "Surplus food from our kitchens, offered to simulated recipients." → `/cares`.

**Outlet card.** Name (display face) · address · state badge: `acceptingText(state, nextOpen)` with an icon (open: ok
dot; busy: clock; paused/closed: moon or pause shape you draw) · while `canOrder`: "Ready in about {readyInMinutes} min"
· if this browser has a cart for that outlet: "{n} in your cart" · button "Order from {name}" → `/o/{outlet_id}`.
`nextOpen` = `formatWhen(state.next_open, state.tz, "en-IN")`, or null.

| State | Shows |
|---|---|
| loading | three skeleton outlet cards |
| `listOutlets` 404 | the not-valid page (`router.replace("/not-valid")`) |
| `outlets: []` | "This menu is being set up. Please check back soon." |
| 429 | "Too many requests. Please wait a moment and try again." with "Trying again in {s} s", then one automatic retry |
| network | offline banner + "Try again" |
| other error | "The menu couldn't load. Please try again." + "Try again" |

### 5.2 `/o/[outletId]`: menu

**Calls.** `munim.getMenu(outletId)` and `munim.listOutlets()` (for the outlet's name, address, phone, tax ids). Refresh
the menu when the tab regains focus and every 60 s while the page is visible. The menu's `accepting` drives the banner.

**Layout.** State banner (02 §5) with `acceptingText(menu.accepting, nextOpen)` and, while `canOrder`, "Ready in about
{readyInMinutes(menu.accepting)} min" · outlet strip (name in the display face, address) · sticky category rail: one chip
per category present in `items` (ordered by `SITE.categoryOrder`, labelled by `categoryLabel`), plus "Deals" when
`deals` is non-empty · marquee · one section per category, items in API order · Deals section · mobile cart bar.

**Item card** (02 §5): diet badge from `diet` (none when null) · `shownName(item)` · `description` (plain text) · price:
`formatMoney(price_minor, currency, "en-IN")` plus a small "+ GST" when `menu.prices_include_tax` is false · for an item
with `variants` (`price_minor` is null): "Choose size" instead of a price · "Add".

| Item situation | Behaviour |
|---|---|
| No variants, no option groups | "Add" adds one (`addToCart(cart, newCartLine(item_id, null, []))`), toast "Added" |
| Has variants or option groups | "Add" opens the item modal (02 §5): variants as a required radio group with each variant's price; option groups per `min_select`/`max_select`/`required` with "+{money}" for non-zero `price_delta_minor`; quantity 1–20; "Add to cart" disabled while `selectionProblems()` returns anything (show the first problem as text) |
| `available: false` | "Sold out" pill, Add disabled with text "Sold out" (a variant with `available: false` is disabled in the modal) |
| Outlet paused or closed | Menu stays browsable; every Add disabled; banner explains |

**Deals section.** One card per `deals[]` entry: `dealLabel(name_key)` · each window as "{formatDays(days)} · {from}–{to}"
(`from`/`to` are outlet-local times; show them as given) · "Applied automatically at checkout when your pickup time is in
this window." Show no percentage or amount: the API sends none.

| State | Shows |
|---|---|
| loading | skeleton banner (reserved height) and six skeleton cards |
| 404 | the not-valid page |
| `items: []` | "This menu is being set up. Please check back soon." |
| network | offline banner; a menu already shown stays; adding to the cart still works (the cart is local) |
| 429 | as §5.1, then retry |
| other error | "The menu couldn't load. Please try again." + "Try again" |
| busy | banner `--accent`: "Busy — about {busy_extra_min} min extra" |
| paused | banner `--ink`: "Not taking orders right now. Back at {nextOpen}." (no time when `next_open` is null) |
| closed | banner `--ink`: "Closed. Opens {nextOpen}." (no time when null) |

### 5.3 Cart drawer

Opens from the header button or the mobile cart bar. While open, it previews the cart (`munim.previewOrder(previewRequest(cart, menu))`,
ASAP slot, debounced 300 ms after each change; ignore responses older than the latest request).

| Part | Content |
|---|---|
| Line | `shownName(item)`, the variant and option names, qty stepper (1–20; "−" at 1 becomes a remove button), the line's `line_total_minor` from the preview (preview line N is cart line N), or before a preview the menu price with "each" |
| Footer | the preview's `total_minor` with a "Preview" badge and "incl. GST" under it (GST is added on top of menu prices, so the total includes it); "Total at checkout" when there is no preview yet |
| Refusals | when `refusals` is non-empty, hide the total and list `refusalText()` for each, with a "Remove" button on `item_sold_out` lines |
| Buttons | "Go to checkout" (disabled while the outlet cannot take orders) |
| Empty | "Your cart is empty." + "Back to menu" |

### 5.4 `/o/[outletId]/checkout`

Heading "Your order". One column, four numbered sections. **Calls:** `getMenu`, `getPickupWindows`, `listOutlets` on
load; `previewOrder` (debounced 300 ms) whenever the lines, the slot or the coupon change; `placeOrder` on "Place order".

**1 · Pickup time.** Radio list. First option "As soon as possible" with "Ready in about {readyInMinutes} min" (the
default; slot `ASAP`). Then the windows from `getPickupWindows`, grouped under `dayLabel(starts_at, tz, "en-IN")` headings
("Today", "Tomorrow", "Wednesday 15 Oct"), each labelled "{formatTime(starts_at)} – {formatTime(ends_at)}" in the outlet's
`tz`. Choosing one sets `{ pickupWindowId: window.pickup_window_id, promisedAt: null }` (the API promises the window's
start). Full windows are never returned. No windows: show only ASAP, plus "No pickup times are available right now."
when the outlet cannot take orders.

**2 · Review.** Each line: name, variant and options, qty, the preview's `line_total_minor`; a "Deal applied" badge when
`deal_refs` is non-empty, named with `dealLabel` of the matching `menu.deals[]` entry (`dealIdsOf(line.deal_refs)`).
Coupon: one text input "Coupon code" (auto upper-case; `COUPON_PATTERN`; on a bad format say "Enter a valid code"
without calling the API) with "Apply" / "Remove"; the applied code goes in `couponCodes`. Price block with a "Preview" badge:

| Row | Value |
|---|---|
| "Subtotal" | `subtotal_minor` |
| "Discount" | "−{discount_minor}" (row hidden when it is 0) |
| one row per `tax_components[]` entry | label "{code} {formatRate(rate_bp)}" (on the mock: "CGST 2.5%", "SGST 2.5%"), value `amount_minor` |
| "Total" | `total_minor` |

Every value is a field of the latest preview, formatted with `formatMoney(…, preview.currency, "en-IN")`. Never add the
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
| "Mobile number" | static "+91" adornment, `inputmode="tel"`, `autocomplete="tel-national"`; sent as `toE164(value)` | "Enter a 10-digit mobile number." |
| "Email" | `inputmode="email"`, `autocomplete="email"`, `EMAIL_PATTERN` | "Enter a valid email address." |
| (both empty) | at least one of mobile or email | "Add a mobile number or an email so the outlet can reach you." |
| "Send me offers" checkbox | unchecked by default; sent as `consent.marketing` | — |

Validate on blur and on submit; on submit move focus to the first invalid field.

**4 · Place.** Text `payAtCounterText(menu.pay_at_counter_methods)` ("Pay at the counter — cash, card or UPI." on the
mock) and `RECORDED_ONLY`. No card fields anywhere. Button "Place order", enabled only when a preview exists, is not in
flight, has no refusals, the form is valid and the outlet can take orders. Then follow 01 §8.4 exactly.

| State | Shows |
|---|---|
| cart empty | "Your cart is empty." + "Back to menu" |
| preview in flight | price block greyed (`aria-busy="true"`), Place disabled |
| placing | button "Placing…", every input disabled |
| network / 5xx | `errorText(e, "checkout")` + "Try again" (same attempt) |
| 429 | "Too many requests. Please wait a moment and try again." + "Try again in {s} s" countdown from `retryAfterMs`, then "Try again" (same attempt) |
| refusal at place | `refusalText()` + re-preview; `preview_total_changed`: show the new preview, the shopper taps again (a new attempt follows from the new total) |
| replay with no saved token | "We couldn't confirm your order on this device. Please check with the outlet." + the outlet phone |
| 404 | the not-valid page |
| success | save the token, clear attempt and cart, `router.replace` to the tracker |

### 5.5 `/o/[outletId]/order/[orderId]`: tracker

**On load.** `token = loadGuestToken(orderId)`. No token: the not-valid page with the extra line "Orders can be followed
only on the device that placed them." Otherwise `trackOrder({ client: munim, baseUrl: API_BASE, storefrontKey:
STOREFRONT_KEY, orderId, guestToken: token, … })` (01 §8.5), plus `getMenu(outletId)` for item names and
`listOutlets()` for the outlet's contact details. Stop tracking on unmount.

**Content.**

| Part | Content |
|---|---|
| Title | "ORDER #{ticket_no}" (display face) |
| Status line (`aria-live="polite"`) | by `status`: placed "Order placed. Waiting for the kitchen to accept it." · accepted "The kitchen accepted your order." · preparing "Your order is being prepared." · ready "Your order is ready for pickup." · completed "Picked up. Enjoy!" · rejected "Sorry — the outlet couldn't take this order." plus, when the last `events[]` entry with `to_status: "rejected"` has a `reason`, ": {titleCase(reason)}." · cancelled "This order was cancelled." |
| Progress | 5 steps with `STATUS_LABEL` words (Placed, Accepted, Preparing, Ready, Picked up); off-path statuses hide the bar |
| Promise | while not final: "Ready at about {formatWhen(promised_at, tz)}". If the latest `events[]` entry of kind `promised_at` moved it later and its `reason` is not `customer_rescheduled`: "(was {formatWhen(from_promised_at)}) The kitchen pushed this back." |
| Live indicator | "Live" (ok dot) while `onLive(true)`; "Updating…" otherwise; hidden once final |
| Order card | lines: name (from the menu; "Item" if unknown), variant name, "{formatQty(qty_milli)} × {formatMoney(unit_price_minor)}" (two fields shown side by side, not multiplied); then "Subtotal", "Discount" (when > 0), "Tax" (`tax_minor`; label "Includes tax" when `prices_include_tax` is true), "Total" — all fields of the order view |
| Payment | `payAtCounterText(outlets.pay_at_counter_methods)` and `RECORDED_ONLY` |
| Changes | "Call the outlet to change this order" with the outlet `phone` as a `tel:` link (address only when `phone` is null). No cancel or reschedule buttons for guests. |

The order view has no per-component tax amounts: show one "Tax" row. Never split `tax_minor` into CGST/SGST yourself.

| State | Shows |
|---|---|
| loading | skeleton title and card |
| two 404s (`onNotFound`) | the not-valid page. On the mock this also happens when the mock forgets the order (see §7) |
| read failure, not 404 | keep the last order; "Can't load your order right now. It is still placed." |
| offline | "You're offline. Showing the last update." |

### 5.6 `/cares`: Munim Cares

**Calls.** `munim.getCares()` once per page view; `munim.getNetworkImpact()` once (any failure hides the network
block; the mock always fails it with 404).

| Part | Content |
|---|---|
| Title | sticker "Munim Cares" |
| Intro | "Surplus food from our kitchens, offered to simulated recipients." |
| Listing card | `outlet_name` · "Pickup {dayLabel(pickup_from, tz)} {formatTime(pickup_from, tz)} – {formatTime(pickup_to, tz)}" using the **listing's own** `tz` · each line: `FOOD_KIND_LABEL[food_kind]` badge, `label` (or `titleCase(label_key)`, else "Food") as plain text, "{formatQty(qty_milli)} {unitLabel(unit)}", and "Use by {formatDate(expires_on)}" when set (prominent for `cooked`) · recipient: `recipient_name` (it already says "(synthetic)") plus a badge "Simulated recipient" |
| Network block (real API only) | `impactTotal(impact)`: "{formatQty(meals_portions_milli.value)} meals shared across Munim" + `impact.labels.recipients` ("to simulated recipients") + `impact.labels.data` ("Measured on synthetic data", always visible) · `data-ref` attribute = `meals_portions_milli.ref` · a `<details>` "Source" showing the ref, `snapshot_id` and `as_of` |
| Note | "Check your local food-donation rules" |
| Labels | the site-wide demo labels |

| State | Shows |
|---|---|
| loading | two skeleton listing cards |
| `items: []` | "No donations are listed right now." |
| 429 | "Too many requests. Please wait a moment and try again." and one retry after `retryAfterMs` |
| 404 | the not-valid page |
| other error | "Donations couldn't load right now." (the rest of the page still renders) |

Do not poll this route (it is rate-limited at 60 requests a minute).

### 5.7 Not valid

Full-page card: title "This link isn't valid." · "Check the address, or start again from the menu." · button "Go to the
menu" → `/`. Used for every 404 (bad key, unknown outlet or order, missing guest token) and every unknown route. Never
say which part was wrong.

## 6 · Signed-in features (not in this build)

Cancel, change pickup time and loyalty need a customer token, and how a storefront gets one is not part of the API yet.
Do not build them. (The client has `cancelOrder`, `reschedulePreview` and `rescheduleOrder` for later.)

## 7 · What the mock contains

The mock answers like the real API but keeps orders **in memory per server instance**: a redeploy, a cold start or
another instance forgets them (then the order reads 404), and each business keeps at most its 30 newest orders.

| Outlet | Phone | Tax ids | State on the mock |
|---|---|---|---|
| Spice Route North | `+919000000101` | GSTIN, FSSAI Lic. No. | open |
| Spice Route Central | `+919000000102` | GSTIN, FSSAI Lic. No. | busy, +15 min |
| Spice Route South | `null` | none | open |

Prep time 20 min. The mock is "open" at any hour unless you force a state (01 §7). Pickup windows: 30-minute slots from
10:00 to 22:00 outlet time, today and tomorrow, capacity 6, some part-booked, at most 24 returned. Prices exclude tax:
GST 5% as CGST 2.5% + SGST 2.5% (`prices_include_tax: false`). One brand. `pay_at_counter_methods`: cash, card, UPI.

| Item | Category | Price | `diet` | Notes |
|---|---|---|---|---|
| Paneer Tikka | starters | ₹280.00 | veg | |
| Butter Chicken | mains | ₹360.00 | non_veg | "Spice level": required, choose 1 (Mild, Medium, Hot); "Extras": 0–3 (Extra naan +₹60.00, Raita +₹40.00) |
| Veg Biryani | mains | ₹240.00 | veg | in the weekday lunch deal |
| Prawn Masala | mains | ₹520.00 | non_veg | sold out at every outlet |
| Lamb Curry | mains | ₹240.00 | non_veg | |
| Chef's Special | mains | ₹300.00 | null | no diet mark; sold out at Central only |
| Mushroom Risotto | mains | ₹390.00 | veg | |
| Garlic Naan | breads | ₹60.00 | veg | |
| Mango Lassi | drinks | variants only: Regular ₹90.00, Large ₹120.00 | veg | `price_minor` null |
| Gulab Jamun | desserts | ₹110.00 | null | no diet mark |

Deal `deal.weekday_lunch`: Monday–Friday 12:00–15:00 outlet time on Veg Biryani, judged at the promised time.

| Coupon | Behaviour |
|---|---|
| `SPICE10` | applies with a minimum spend of ₹300.00 (after deals) |
| `NORTH5` | applies at Spice Route North only; elsewhere `coupon_out_of_scope` |
| `OLDDEAL20` | `coupon_expired` |
| `FIRST100` | `coupon_cap_reached` |
| any other well-formed code | `coupon_invalid` |

Orders move `placed` → `accepted` (45 s) → `preparing` (75 s) → `ready` (110 s) and stop there. The mock never rejects
an order, never pushes one back, and never completes one.

## 8 · Acceptance checklist

`[mock]` = check it against the mock · `[real]` = only possible on the real API · `[unit]` = check with a unit test or
a stubbed response, because the mock cannot produce it.

**Setup and labels**
- [ ] [mock] `npx tsx scripts/smoke.ts` prints "smoke: all ok" with this key.
- [ ] [mock] The home page lists exactly the outlets the API returns (3). With `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY=wrong` the site shows "This link isn't valid." and the network tab shows 404.
- [ ] [mock] "Sample shop — orders are not real." and "Demo: all data is synthetic. Payments are recorded, never processed." on every page, including not-valid and the tracker.
- [ ] [mock] "Recorded only — Munim does not process payments." beside every mention of payment (checkout, tracker, footer).
- [ ] [mock] No `EventSource` anywhere (`grep -r EventSource app lib` is empty); the key and token never appear in a URL (check the network tab) or in `console` output.

**Home and menu**
- [ ] [mock] North shows "Open", Central "Busy — about 15 min extra" and "Ready in about 35 min", South "Open" with no phone and no tax ids in the footer.
- [ ] [mock] With the test panel set to paused: "Not taking orders right now. Back at {time}." with the next opening in Bengaluru time, Add disabled, menu still browsable. Closed: "Closed. Opens {time}."
- [ ] [mock] Prices render "₹280.00" from `price_minor` + `currency` with `en-IN` and "+ GST"; no price appears in the source code (`grep -rn "280\|₹" app lib` finds nothing but formatting code).
- [ ] [mock] Prawn Masala shows "Sold out" everywhere; Chef's Special only at Central; neither can be added.
- [ ] [mock] Paneer Tikka shows "Veg", Butter Chicken "Non-veg", Gulab Jamun and Chef's Special no mark at all.
- [ ] [mock] Butter Chicken opens the modal; "Add to cart" stays disabled with "Choose a spice level" until one is chosen; Extras show "+₹60.00" and "+₹40.00". Mango Lassi asks "Choose one: Regular or Large".
- [ ] [mock] Category chips scroll the page and the active chip follows the scroll; the Deals section shows "Weekday lunch" with "Mon–Fri · 12:00–15:00" and no percentage.
- [ ] [mock] With the test panel's "Force 429" on, the menu shows "Too many requests…" with a countdown, then recovers when it is off.
- [ ] [mock] Offline (devtools) shows "You're offline. Your cart is kept on this phone." and adding to the cart still works.

**Cart and checkout**
- [ ] [mock] The cart badge is a count; no money appears in the cart until a preview returns, then the drawer shows the preview total with "Preview".
- [ ] [mock] Review shows "Subtotal", "CGST 2.5%", "SGST 2.5%", "Total" exactly equal to the preview response fields (compare in the network tab); no `+` or `reduce` touches a `_minor` value in the code.
- [ ] [mock] `SPICE10` with one Paneer Tikka: totals hidden, "Spend ₹20.00 more to use this coupon." (from `params.shortfall_minor`), Place disabled; adding a second Paneer Tikka makes the coupon apply.
- [ ] [mock] `NORTH5` at Central: "This coupon isn't valid at this outlet."; `OLDDEAL20`: "This coupon has expired."; `FIRST100`: "This coupon has reached its limit."; `ZZZ99`: "This coupon isn't valid."; `a!`: "Enter a valid code" with no request sent.
- [ ] [mock] Veg Biryani with a weekday window between 12:00 and 15:00: the line shows "Deal applied · Weekday lunch" and a discount row; with ASAP outside those hours, no deal.
- [ ] [mock] ASAP sends `pickup_window_id: null, promised_at: null`; a chosen window sends its id with `promised_at: null` (check the request body).
- [ ] [mock] Window headings say "Today" / "Tomorrow" in Bengaluru time even with the computer's zone set to `America/New_York`.
- [ ] [mock] `window_full`: pick a window with 1 place left (`capacity_orders - booked` = 1 in the pickup-windows response) and preview it here; within a few seconds, in a second tab of the same browser, place one order into that window; then change anything in the first tab's cart so it previews again: "That pickup time just filled up. Please choose another." and the windows refresh. (The mock keeps bookings per server instance, so if the second order lands on another instance this will not reproduce: then cover it with the `[unit]` stub below.)
- [ ] [unit] A stubbed preview with `refusals: [{ line_no: null, reason_code: "window_full" }]` hides the totals, shows "That pickup time just filled up. Please choose another." and re-fetches the windows.
- [ ] [mock] Mobile "98123 45678" is sent as `"+919812345678"`; "12345" shows "Enter a 10-digit mobile number."; both fields empty shows "Add a mobile number or an email so the outlet can reach you."; inputs do not zoom on an iPhone.
- [ ] [mock] Place sends `order` and `guest` envelopes with UUIDv7 ids; `localStorage["munim.guest.<order_id>"]` exists before the tracker renders.
- [ ] [mock] Double-clicking "Place order" creates one order. After a failed place (set the network offline before tapping, then back online), "Try again" sends a request body byte-identical to the first (same `idempotency_key`, `order_id`, line ids and `consent.at`; compare the two in the network tab). The replay header itself is proven by the smoke test.
- [ ] [mock] Editing the cart after a failed attempt sends new `idempotency_key`s (no `idempotency_conflict`).
- [ ] [mock] Test panel paused, then Place: "{outlet} stopped taking orders a moment ago. Back at {time}."
- [ ] [mock] "Pay at the counter — cash, card or UPI." is shown and there are no card fields anywhere.
- [ ] [unit] `preview_total_changed`, `deal_changed` and `item_unavailable` bodies (stub the response) show their copy and re-run the preview.

**Tracker**
- [ ] [mock] The tracker URL opened in a private window (no token) shows the not-valid page.
- [ ] [mock] The status moves Placed → Accepted (≈45 s) → Preparing (≈75 s) → Ready (≈110 s) without reload, with "Live" showing; the screen reader announces each change.
- [ ] [mock] Blocking `/v1/stream` in devtools shows "Updating…", and the status still advances by polling (15 s), with no error banner.
- [ ] [mock] "Ready at about {time}" is in Bengaluru time with the computer's zone set elsewhere.
- [ ] [mock] Guests see "Call the outlet to change this order" with a `tel:` link (South: address only) and no cancel or reschedule buttons.
- [ ] [unit] A stubbed `rejected` order with `reason: "out_of_stock"` reads "Sorry — the outlet couldn't take this order: Out of stock."; with `reason: null` the clause is gone.
- [ ] [unit] A stubbed `promised_at` event moving the time later with `reason: "kitchen_busy"` shows "(was …) The kitchen pushed this back."; with `customer_rescheduled` it does not.

**Cares**
- [ ] [mock] Two listings render with "Simulated recipient", "Cooked", "12 portions", pickup times in Bengaluru time, and "Check your local food-donation rules".
- [ ] [mock] The network block is hidden (the mock answers 404) and nothing else on the page breaks.
- [ ] [real] On the real API the network block shows the meals figure with "Measured on synthetic data" and a working "Source" disclosure.
- [ ] [unit] A listing `label` of `<b>x</b>` renders as the literal text `<b>x</b>`.

**Quality**
- [ ] [mock] `npm run build` and `npx tsc --noEmit` pass with no errors.
- [ ] [mock] Lighthouse (mobile) on menu and checkout: performance ≥ 90, accessibility ≥ 95; axe: no serious or critical issues.
- [ ] [mock] Every tap target ≥ 48 px, every input ≥ 16 px; the site works at 320 px wide and at 200 % zoom; `prefers-reduced-motion` stops the bob, marquee and drawer slide.
- [ ] [mock] `₹` renders in Inter (not a fallback font) in Chrome and Safari.
- [ ] [mock] Budget: menu route ≤ 170 KB gzipped JavaScript, LCP ≤ 2.5 s and CLS ≤ 0.1 on a mid-range phone over 4G; no image over 100 KB; two font families.
