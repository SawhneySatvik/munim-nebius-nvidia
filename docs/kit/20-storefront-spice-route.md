# 20 · Storefront build spec: Spice Route (India, 3 outlets, INR)

Read [00](00-getting-started.md) and [10](10-auth-and-errors.md) first. Mock key: `sfk_mock_spice_route_7f3a91c2`.
All people, businesses and amounts are **synthetic**. Locale `en-IN`, currency `INR`, zone `Asia/Kolkata`.

## 1 · Brand direction (original; yours to refine)

**Spice Route** is a neighbourhood North-Indian kitchen group in Bengaluru. Mood: warm, generous, unfussy; a
printed menu board, not a delivery-app grid. Imagery is flat colour blocks and simple geometric spice-route
line patterns you draw yourself (no stock or third-party art; any illustration you add must be your own).

| Token | Value | Use | Contrast (measured) |
|---|---|---|---|
| `--brand-primary` | `#9A3412` (burnt chilli) | buttons, links, active tab | white on it 7.31 : 1 |
| `--brand-on-primary` | `#FFFFFF` | text on primary | |
| `--surface` | `#FFF7ED` (warm cream) | page background | ink on it 16.47 : 1; primary on it 6.88 : 1 |
| `--ink` | `#1C1917` | body text | |
| `--muted` | `#57534E` | secondary text | 7.63 : 1 on white |
| `--ok` | `#14532D` (leaf green) | "Open" | 8.58 : 1 on surface |
| `--danger` | `#B91C1C` | errors, "Sold out" with an icon + label | 6.47 : 1 on white |

Typography: headings in a warm serif such as Fraunces (SIL OFL) at 28/24/20; body and **all numbers** in a
neutral sans such as Inter at 16/18, with `font-variant-numeric: tabular-nums`. The font used for money **must
contain `₹` (U+20B9)**: check it renders, do not assume (UNVERIFIED for any font other than Inter). Radius 8.
Status is never colour alone: always an icon or a word too ("Open", "Busy", "Sold out").

Required labels on every page (footer + a thin top bar): **"Sample shop — orders are not real."** and
"Demo: all data is synthetic. Payments are recorded, never processed."

## 2 · Sitemap

| Route | Page | Needs |
|---|---|---|
| `/` | Home + outlet picker | outlets, per-outlet state |
| `/o/[outletId]` | Menu | menu, state, cart |
| `/o/[outletId]/checkout` | Time, price preview, contact, place | windows, preview, place |
| `/o/[outletId]/order/[orderId]` | Tracker | order read, stream |
| `/cares` | Munim Cares | storefront cares, network impact |
| `/not-valid` (and any 404) | "This link isn't valid." | |

The cart is per outlet, kept in `localStorage` (`munim.cart.<outletId>`) with the checkout attempt ids from
[10 §2](10-auth-and-errors.md). Switching outlet with a non-empty cart asks: "Switching outlets clears your
cart." (proposed copy, not in the approved screen spec). The tracker URL is shareable but only works on a
browser that holds the order's guest token (otherwise `404` -> the not-valid page).

## 3 · What the mock world contains

From the synthetic world definition (the mock mirrors it; if the mock differs, **the mock's responses win**):

| Outlet | Name | Address (synthetic) | Phone | Receipt tax ids |
|---|---|---|---|---|
| North | Spice Route North | 1 Synthetic Road, Bengaluru (synthetic) | from `phone` | GSTIN, FSSAI Lic. No. |
| Central | Spice Route Central | 2 Synthetic Road, Bengaluru (synthetic) | from `phone` | GSTIN, FSSAI Lic. No. |
| South | Spice Route South | 3 Synthetic Road, Bengaluru (synthetic) | `null` (none set) | none |

`GET /v1/storefront/outlets` returns each outlet's `phone` (E.164, or null) and `tax_ids[]` (`code`, `label`,
`value`): show them on the outlet page and the tracker (for example "GSTIN 29…", "FSSAI Lic. No. 1…", using the
`label` as given). The mock's values are synthetic. When `phone` is null, show the address only.

Core menu at every outlet: `paneer_tikka` (starters, 28000 = ₹280.00), `butter_chicken` (mains, 36000 =
₹360.00), `veg_biryani` (mains, 24000 = ₹240.00), plus mock-only items with variants (Mango Lassi), options
(Butter Chicken: spice level, extras), a sold-out item and one with no diet mark. Tax class `restaurant_5` (GST
5 % on top of the price; `prices_include_tax: false`; the server adds it).

**Names, descriptions and veg marks come from the menu.** Each item, variant, option group and option has
`display_name` and `description` (plain text the owner typed: render as text, never as HTML), and each item a
`diet`: `veg`, `non_veg`, `egg`, `vegan`, or `null` = not marked. Show a veg / non-veg mark from `diet` with a
text label ("Veg", "Non-veg", "Egg", "Vegan"; proposed copy), never colour alone; show **no** mark when `diet` is
null (never guess from the name). When `display_name` is null, fall back to a label for `name_key`. Categories are still plain slugs
([gaps.md](gaps.md) G-01), so keep a category map:

```ts
// lib/names.ts
const CATEGORIES: Record<string, string> = { starters: "Starters", mains: "Mains", breads: "Breads", drinks: "Drinks", desserts: "Desserts" };
/** Title-cased fallback so a new category or an item without a display name never breaks the page. */
export const titleCase = (key: string) => key.replace(/^(item|variant|group|option)\./, "").replaceAll(/[._]+/g, " ").replace(/^./, (c) => c.toUpperCase());
export const categoryLabel = (key: string) => CATEGORIES[key] ?? titleCase(key);
export const itemLabel = (x: { display_name: string | null; name_key: string }) => x.display_name ?? titleCase(x.name_key);
```

## 4 · Pages and states

State names: **load** skeleton · **empty** · **error** · **closed/paused** · **sold out** · **offline**.
Quoted copy is the approved literal text; `(proposed)` copy is mine and not yet in the screen spec.

### 4.1 `/` Home and outlet picker

| Element | Behaviour |
|---|---|
| Hero | Brand name, "Order for pickup" |
| Outlet cards (3) | Name, address, state badge from `GET /v1/storefront/outlets/{outlet_id}/state`: Open / Busy / Not taking orders / Closed. Tap -> `/o/[outletId]`. |
| Cares teaser | Link to `/cares` |

States: **load** three skeleton cards · **error** "The menu couldn't load. Please try again." with Retry ·
**empty** (no outlets) "This menu is being set up. Please check back soon." · **bad key** -> not-valid page ·
**offline** "You're offline. Your cart is kept on this phone." A single failed `/state` call degrades that card to
no badge, not an error page.

### 4.2 `/o/[outletId]` Menu

Header: outlet name, state line, "Ready in about {n} min" (n = `default_prep_min + busy_extra_min` from the
state), cart button with item count. Tabs per `category` (+ "Deals" if `deals` is non-empty). Item row: diet mark,
`display_name`, `description` (one line, truncated), price (`price_minor` + `currency`, "+ GST" because
`prices_include_tax` is false), add button (min 48 px).

| State | Copy / behaviour |
|---|---|
| open | "Open" |
| busy | "Busy — about {busy_extra_min} min extra" |
| paused | "Not taking orders right now. Back at {next_open}." Menu is browsable, add buttons disabled. |
| closed | "Closed. Opens {next_open}." Same: browsable, add disabled. (`next_open` may be null: omit the time.) |
| sold out | item shows "Sold out" (text + icon), add disabled. `available === false`; for variants use each variant's own `available`. |
| empty | "This menu is being set up. Please check back soon." |
| load | skeleton rows |
| error | "The menu couldn't load. Please try again." |
| offline | "You're offline. Your cart is kept on this phone." (cart is local, so adding still works) |

Items with `variants[]` have `price_minor === null`: show the variant picker first. Items with
`option_groups[]` open an options sheet: enforce `min_select` / `max_select` / `required` per group, show each
`price_delta_minor`; the **line price shown is the server's** (use preview, step 4) so the sheet shows
"+₹X" deltas only. Simple items add in one tap with a toast "Added". Deal badge: for `deals[]` show the
`name_key` label and its `windows` rendered in the outlet's zone (e.g. "12:00–15:00 Mon–Fri").

### 4.3 `/o/[outletId]/checkout`

Single page, four sections (collapse completed ones). Heading "Your order".

1. **Pickup time**: "ASAP" (default) or a window from `GET .../pickup-windows`, grouped by day (outlet zone).
   Empty list = ASAP only (and "No pickup times are available today." (proposed) if the outlet is closed).
2. **Review**: lines, `Subtotal`, `Discount`, one row per entry of the preview's `tax_components` (India:
   "CGST 2.5%" and "SGST 2.5%", label = `code` + `rate_bp / 100` %, amount = `amount_minor`), then `Total`, all from
   the preview; coupon field (`SAVE10`-style, uppercase, `^[A-Z0-9][A-Z0-9-]{2,31}$`) with Apply; label "Preview".
   Each line also has `tax_rate_bp` and its own `tax_components` if you show a per-line breakdown. Never add the
   components up yourself: `tax_minor` is the server's total.
3. **Your details**: Name (required), Phone **or** email (at least one), marketing consent checkbox
   (unchecked by default; copy "Send me offers" (proposed)). Phone input has `inputmode="tel"` and an
   `+91` prefix; send E.164 (`^\+[1-9][0-9]{6,14}$`).
4. **Place**: text "Pay at the counter — cash, card or UPI." (locked, never changed; it matches the menu's
   `pay_at_counter_methods`, `["cash", "card", "upi"]` for India), button "Place order".

| State | Copy |
|---|---|
| cart empty | "Your cart is empty." + "Back to menu" |
| load (preview in flight) | totals greyed, button disabled |
| preview refusals | inline per refusal (copy in [10 §3](10-auth-and-errors.md)), "Place order" disabled until clear |
| placing | button "Placing…", all inputs disabled |
| offline | "No connection. Your order was not placed." + "Try again" (same idempotency keys) |
| error | "Your order was not placed. Please try again." |

After a successful place: save the guest token, clear the cart, navigate to the tracker. Optional teaser
"Want points next time? Create an account" is hidden behind a flag (needs customer token).

### 4.4 `/o/[outletId]/order/[orderId]` Tracker

Heading "Order #{ticket_no}". Progress: Placed -> Accepted -> Preparing -> Ready -> Picked up
(`completed`). "Ready at about {promised_at}" and, if `promised_at` events show a later time than before,
"(was {earlier} — "The kitchen pushed this back.")". Total from the order read, plus "Pay at the counter".

| Status | Display |
|---|---|
| `placed` / `accepted` / `preparing` / `ready` | progress step highlighted + text label |
| `completed` | "Enjoy!" (the approved "Earned {points} points" only for signed-in customers) |
| `rejected` | "Sorry — the outlet couldn't take this order: {reason}." `{reason}` = last `events[]` entry with `to_status: "rejected"`, field `reason`; render as plain text; if null, omit the clause. |
| `cancelled` | "This order was cancelled." (proposed) |

Guests cannot cancel or reschedule: show "Call the outlet to change this order" with the outlet's `phone` as a
`tel:` link (address only when it is null). Signed-in-only buttons "Change time" / "Cancel order" are
behind the customer-token flag (section 5, step 9). Live indicator: "Live" when the stream is open; "Updating…"
while reconnecting (fall back to polling silently, no error); `404` -> not-valid page; read failure "Can't
load your order right now. It is still placed."; offline "You're offline. Showing the last update."

### 4.5 `/cares` Munim Cares (section 6).

## 5 · API calls per step

All calls: header `X-Munim-Storefront-Key`. `client` is from [00](00-getting-started.md).

| # | Step | Call | Use |
|---|---|---|---|
| 1 | Pick outlet | `GET /v1/storefront/outlets` then `GET /v1/storefront/outlets/{outlet_id}/state` per outlet | names, `tz`, `address`, `phone`, `tax_ids`, `pay_at_counter_methods`; `state`, `next_open` |
| 2 | Menu | `GET /v1/storefront/outlets/{outlet_id}/menu` | items (display text, diet), deals, accepting, `channel_id`, `brands`, `prices_include_tax`; refresh when the tab regains focus and every 60 s while open |
| 3 | Item options | (from step 2) `variants[]`, `option_groups[]` | no extra call |
| 4 | Preview cart | `POST /v1/storefront/orders:preview` | server totals, `tax_components` (CGST / SGST), `refusals[]` with `params`; re-run on any change of lines, window, coupon (debounce 300 ms) |
| 5 | Pickup windows | `GET /v1/storefront/outlets/{outlet_id}/pickup-windows` | only windows with spare capacity are returned; re-fetch on `window_full` |
| 6 | Guest checkout | built into place (guest envelope) | name, phone/email, consent |
| 7 | Place order | `POST /v1/storefront/orders` | returns `order_id`, `ticket_no`, `guest_access_token` (once) |
| 8 | Track | `GET /v1/stream?topics=order:<id>` via `openStream` + `GET /v1/storefront/orders/{id}` | live status; full read |
| 9 | Change (signed-in only) | `POST /v1/storefront/orders/{id}:reschedule-preview`, `:reschedule`, `:cancel` | needs customer token; guests get `403 guest_cannot_change` |
| 10 | Coupons / loyalty | `coupon_codes` in preview and place; `GET /v1/account/loyalty` (signed-in) | guests: coupons yes, loyalty no (`loyalty_redeem_points` is forced to 0) |

### Cart, preview and place (copy these)

```ts
// lib/checkout.ts
import { uuidv7 } from "@munim/sdk";
import { client } from "./munim";

export type CartLine = { lineId: string; itemId: string; variantId: string | null; optionIds: string[]; qtyMilli: number };
export type Slot = { windowId: string | null; promisedAt: string | null }; // ASAP = both null
export type Contact = { name: string; phoneE164: string | null; email: string | null; marketing: boolean };

/** Ids and keys for ONE checkout attempt. Persist with the cart; reuse on retry; regenerate on any change. */
export type Attempt = { orderId: string; orderCmd: string; orderKey: string; guestCmd: string; guestKey: string };
export const newAttempt = (): Attempt => ({ orderId: uuidv7(), orderCmd: uuidv7(), orderKey: uuidv7(), guestCmd: uuidv7(), guestKey: uuidv7() });
export const newLine = (itemId: string, variantId: string | null, optionIds: string[], qty: number): CartLine =>
  ({ lineId: uuidv7(), itemId, variantId, optionIds, qtyMilli: qty * 1000 });

/** `params` (ids and server amounts) fills the refusal copy: see 10 §3. */
type Refusal = { line_no: number | null; reason_code: string; params?: { item_id?: string; code?: string; shortfall_minor?: number; currency?: string } };

/** `channelId` is the menu's `channel_id` (the key's channel; core overwrites the field with it anyway). */
export async function previewCart(outletId: string, channelId: string, lines: CartLine[], slot: Slot, couponCodes: string[]) {
  const { data, error, response } = await client.POST("/v1/storefront/orders:preview", {
    body: {
      outlet_id: outletId,
      channel_id: channelId,
      brand_id: null,
      kind: "pickup",
      pickup_window_id: slot.windowId,
      promised_at: slot.promisedAt,
      coupon_codes: couponCodes,
      loyalty_redeem_points: 0,
      lines: lines.map((l) => ({ item_id: l.itemId, variant_id: l.variantId, option_ids: l.optionIds, qty_milli: l.qtyMilli, barcode: null })),
    },
  });
  if (!data) return { ok: false as const, status: response.status, error };
  // data.refusals is a normal 200 field: render inline, disable "Place order" while non-empty.
  const refusals: Refusal[] = data.refusals;
  return { ok: true as const, preview: data, refusals };
}

export async function placeOrder(outletId: string, channelId: string, lines: CartLine[], slot: Slot, couponCodes: string[], contact: Contact, previewTotalMinor: number, a: Attempt) {
  const { data, error, response } = await client.POST("/v1/storefront/orders", {
    body: {
      order: {
        command_id: a.orderCmd,
        idempotency_key: a.orderKey,
        type: "orders.place.v1",
        payload: {
          order_id: a.orderId,
          outlet_id: outletId,
          channel_id: channelId,
          brand_id: null,
          device_id: null,
          kind: "pickup",
          table_ref: null,
          pickup_window_id: slot.windowId,
          promised_at: slot.promisedAt,
          external_ref: null,
          lines: lines.map((l) => ({ line_id: l.lineId, item_id: l.itemId, variant_id: l.variantId, option_ids: l.optionIds, qty_milli: l.qtyMilli, barcode: null, note: null })),
          coupon_codes: couponCodes,
          loyalty_redeem_points: 0,
          preview_total_minor: previewTotalMinor, // the server's total the shopper saw; a different re-price is refused
          client_totals: null,
        },
      },
      guest: {
        command_id: a.guestCmd,
        idempotency_key: a.guestKey,
        type: "storefront.guest.create.v1",
        payload: { name: contact.name, phone: contact.phoneE164, email: contact.email, consent: { marketing: contact.marketing, at: new Date().toISOString() } },
      },
      contact: null,
    },
  });
  // A refusal's 409 / 422 body is `{ error, params? }`: switch on error.error.reason_code, fill copy from error.params.
  if (!data) return { ok: false as const, status: response.status, error };
  // PERSIST FIRST: this token is never shown again (a replay returns null).
  if (data.guest_access_token) localStorage.setItem(`munim.guest.${data.order_id}`, data.guest_access_token);
  return { ok: true as const, placed: data, replayed: response.headers.get("X-Munim-Replayed") === "true" };
}
```

For a window, send its `pickup_window_id` with `promised_at: null`: the server promises the window's `starts_at`.
(An explicit `promised_at` must lie inside `[starts_at, ends_at)`, else `422` `pickup_time_outside_window`.) ASAP is
`pickup_window_id: null, promised_at: null`.

### Reading and tracking an order

```ts
// lib/track.ts
import { openStream, type Schemas } from "@munim/sdk";
import { API, KEY, trackingClient } from "./munim";

export async function readOrder(orderId: string) {
  const guestToken = localStorage.getItem(`munim.guest.${orderId}`);
  if (!guestToken) return { ok: false as const, status: 404 };      // not this browser's order -> not-valid page
  const { data, response } = await trackingClient(guestToken).GET("/v1/storefront/orders/{id}", { params: { path: { id: orderId } } });
  return data ? { ok: true as const, order: data } : { ok: false as const, status: response.status };
}

/** Live updates with a 15 s polling fallback. Returns a stop function. */
export function trackOrder(orderId: string, onOrder: (o: Schemas["StorefrontOrderView"]) => void, onLive: (live: boolean) => void) {
  const guestToken = localStorage.getItem(`munim.guest.${orderId}`);
  if (!guestToken) return () => {};
  let poll: ReturnType<typeof setInterval> | undefined;
  const refresh = async () => { const r = await readOrder(orderId); if (r.ok) onOrder(r.order); };
  const startPolling = () => { poll ??= setInterval(refresh, 15_000); };
  const stopPolling = () => { if (poll) clearInterval(poll); poll = undefined; };

  void refresh();
  const stream = openStream({
    baseUrl: API,
    topics: [`order:${orderId}`],
    guestToken,
    headers: () => ({ "X-Munim-Storefront-Key": KEY }),
    // Event types are `order.status` and `order.promised_at`; the payload carries ids and statuses only (no
    // reason text), so on ANY event re-read the order: that is also how you get `events[].reason`.
    onEvent: () => void refresh(),
    onState: (s) => { onLive(s === "open"); if (s === "open") stopPolling(); else startPolling(); },
  });
  stream.done.catch(() => startPolling());   // StreamRefused (e.g. 404): keep polling, show the last update
  return () => { stream.close(); stopPolling(); };
}
```

The stream is a fetch-based reader (sends the guest token and storefront key as headers, resumes with
`Last-Event-ID`, backs off on failures). **Do not use `EventSource`**: it cannot send those headers. The server
closes streams after 55 minutes (the mock after about 50 seconds) and the reader reconnects by itself without
missing an event. The mock serves `GET /v1/stream`: its orders move `placed` → `accepted` (45 s) → `preparing`
(75 s) → `ready` (110 s), one event each.

### Status mapping for the progress bar

| `status` | Step | Terminal |
|---|---|---|
| `placed` | 1 Placed | no |
| `accepted` | 2 Accepted | no |
| `preparing` | 3 Preparing | no |
| `ready` | 4 Ready | no |
| `completed` | 5 Picked up | yes |
| `rejected`, `cancelled` | off-path message | yes |

Only the server moves status; never advance the bar on a client timer.

## 6 · Munim Cares section

`GET /v1/storefront/cares` returns `{ items: [...] }`: the live donation listings of **this business only**
(uncached; a bad key is `404`). Each item: `listing_id`, `city_code`, `business_name`, `outlet_name`, `tz`
(the IANA zone of that outlet),
`pickup_from`, `pickup_to`, `recipient_name`, `recipient_simulated` (always `true`) and `lines[]`
(`food_kind` = `cooked | raw | packaged`, `label`, `label_key`, `qty_milli`, `unit`, `expires_on`).

Required copy (literal, unconditional, never hidden):

* Page title: "Munim Cares" · intro (proposed): "Surplus food from our kitchens, offered to simulated recipients."
* On every listing: the recipient is labelled **"Simulated recipient"** (the NGO name from the API already ends in "(simulated)"; show both).
* Network total (from `GET /v1/cares-network/impact`, no credentials, use `createPublicClient`): "Meals shared across Munim — to simulated recipients" + **"Measured on synthetic data"** always.
* Footer note: **"Check your local food-donation rules"**.
* Plus the site-wide labels ([section 1](#1--brand-direction-original-yours-to-refine)).

```ts
// lib/cares.ts
import { createPublicClient } from "@munim/sdk";
import { API, client } from "./munim";

export async function loadCares() {
  const { data, response } = await client.GET("/v1/storefront/cares");
  if (response.status === 429) return { ok: false as const, retryAfter: Number(response.headers.get("Retry-After")) || 5 };
  return data ? { ok: true as const, items: data.items } : { ok: false as const, retryAfter: null };
}

export async function loadImpact() {
  const pub = createPublicClient({ baseUrl: API });   // sends no key or token
  const { data } = await pub.GET("/v1/cares-network/impact", { params: { query: {} } });
  if (!data) return null;
  const total = data.rows[0];                          // the first row is the all-cities total
  if (!total) return null;
  return {
    asOf: data.as_of,
    snapshotId: data.snapshot_id,
    meals: total.meals_portions_milli,                 // { value, ref }: value is thousandths of a portion
    synthetic: total.all_synthetic.value,
  };
}
```

Rendering rules: listing `label` and `business_name` are untrusted text: render as **text only** (React
escapes by default; never `dangerouslySetInnerHTML`). Quantity = `qty_milli / 1000` + `unit` (display only).
Meals = `meals.value / 1000` shown as a whole number with the label; put `meals.ref` (a `⟨snap:…⟩` reference)
in a `data-ref` attribute and in a "Source" disclosure that links to `GET /v1/cares-network/snapshots/{id}` so
the figure traces. Show pickup times in the listing's own `tz` (an Australian business can have outlets in several zones, so do not assume one zone per business). Empty: "No donations are listed right now." (proposed). 429: show
"Too many requests. Please wait a moment and try again." and retry after `Retry-After`. A failed Cares call
**hides the section** or shows the empty state; it never breaks the page.

## 7 · Accessibility and performance

* Inputs and selects `font-size ≥ 16px` (iOS zoom). Tap targets ≥ 48 × 48 px including the stepper and chips.
* Text contrast ≥ 4.5 : 1, large text and control edges ≥ 3 : 1 (palette above is measured). Visible focus ring
  (≥ 3 : 1) on every control; full keyboard path for menu -> checkout -> place; no keyboard traps in the options sheet / cart drawer.
* Status never by colour alone. Order status changes announced via an `aria-live="polite"` region.
* Works at 320 px width and 200 % zoom; `lang="en-IN"`.
* Respect `prefers-reduced-motion`.
* Performance budget (mobile, mid-range Android, 4G): LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms; ≤ 170 KB gzipped
  JavaScript on the menu route; no image over 100 KB; fonts: at most two families, `font-display: swap`, subset
  to Latin; menu fetched once per view (not per item); preview debounced; stream opened only on the tracker page.

## 8 · Acceptance checklist (every item is testable against the mock)

Tick when verified. `[ct]` = needs a customer token; skip on the guest-only build.

**Setup and labels**
- [ ] With the correct key the home page lists exactly the outlets the API returns (3 in the mock) and with a wrong key shows "This link isn't valid." (HTTP 404 observed in the network tab).
- [ ] "Sample shop — orders are not real." appears on every page.
- [ ] Cares and tracker pages show "Simulated recipient" / "Check your local food-donation rules" (section 6).
- [ ] No page uses `EventSource`; no request puts a key or token in a URL.

**Menu**
- [ ] Each outlet shows its own state line: Open / "Busy — about {n} min extra" / paused / closed copy (use the mock's controls for each state).
- [ ] A sold-out item shows "Sold out" and cannot be added.
- [ ] Money shows as `₹280.00` style from `price_minor` + `currency` with `en-IN`; no price is typed in code.
- [ ] Menu empty / error / loading / offline states render the approved copy.

**Checkout**
- [ ] Preview request fires on cart/slot/coupon change and the displayed Subtotal/Discount/Tax/Total equal the response fields exactly (no client arithmetic; grep the code for `+`/`reduce` on `_minor`).
- [ ] A refusal in `refusals[]` blocks "Place order" and shows the mapped copy.
- [ ] Choosing a window sends `pickup_window_id` with `promised_at: null`; ASAP sends `null` + `null`.
- [ ] Review shows "CGST 2.5%" and "SGST 2.5%" rows equal to the preview's `tax_components`; menu items show the veg / non-veg mark from `diet` (none for Gulab Jamun, whose `diet` is null) and their `display_name`.
- [ ] The outlet page shows the outlet's phone and its GSTIN / FSSAI Lic. No. from `tax_ids`; Spice Route South (no phone, no ids) shows the address only.
- [ ] Phone `+91 98xxxxxxxx` is sent as E.164; invalid phone blocks submit with an inline message (no zoom on iOS).
- [ ] Place sends `order` and `guest` envelopes with UUIDv7 ids; the response's `guest_access_token` is stored before navigation.
- [ ] Double-click on "Place order" yields one order (button disabled while pending; a forced retry with the same keys returns the same `order_id`).
- [ ] After editing the cart following a failed attempt, new keys are used (no `idempotency_conflict`).
- [ ] `window_full`, `item_sold_out`, `outlet_paused`, `deal_rejudged`, coupon codes and `preview_total_changed` each show their copy when the mock injects them; `coupon_min_spend` (SPICE10 on one Paneer Tikka) says "Spend ₹20.00 more to use this coupon." from `params.shortfall_minor`.
- [ ] The text "Pay at the counter — cash, card or UPI." is present and there are no card fields anywhere.

**Tracker**
- [ ] Opening the tracker URL in a browser without the stored token shows the not-valid page.
- [ ] Status advances live when the mock changes it, without reload; killing the stream falls back to 15 s polling with no error banner.
- [ ] Rejected shows the reason clause as plain text; a pushed-back `promised_at` shows "(was … — "The kitchen pushed this back.")".
- [ ] Times are in `Asia/Kolkata` even when the browser zone is different (change the OS zone to test).
- [ ] Guests see "Call the outlet to change this order", no cancel/reschedule buttons. `[ct]` Signed-in: reschedule-preview shows the server's re-priced total and `deal_rejudged` copy; cancel works inside the window and `change_window_closed` copy after it.

**Cares**
- [ ] Listings render with "Simulated recipient", food kind, quantity, expiry, pickup window; a `label` containing `<b>x</b>` renders as literal text.
- [ ] Impact figure appears with "Measured on synthetic data" and a Source disclosure.
- [ ] 429 shows the wait message and retries after `Retry-After`. To trigger it on the mock, send the request header `X-Mock-Force-429: 1` (any route, valid key): the mock answers `429`, `Retry-After: 5` and the real body (`code: "unavailable"`, `reason_code: "rate_limited"`).

**Quality**
- [ ] Lighthouse mobile: performance ≥ 90, accessibility ≥ 95 on menu and checkout.
- [ ] Axe shows no serious/critical issues; all inputs ≥ 16 px; all taps ≥ 48 px (measure in devtools).
- [ ] Works at 320 px and 200 % zoom.
