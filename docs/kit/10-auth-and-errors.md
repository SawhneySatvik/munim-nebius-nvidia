# 10 · Auth, idempotency, errors, money and time

Read this once before either site spec. Everything here is from the frozen `/v1` contract.

## 1 · Credentials a storefront uses

| Credential | Header | When | Notes |
|---|---|---|---|
| Storefront key | `X-Munim-Storefront-Key` | **Every** storefront call | Public. Resolves business and sales channel. |
| Guest access token | `X-Munim-Guest-Token` | Reading/streaming **one** guest order | Returned **once** by `POST /v1/storefront/orders` as `guest_access_token`. With the key, it reads only that order. |
| Customer token | `Authorization: Bearer <token>` | Signed-in customer: account, loyalty, cancel, reschedule | Optional everywhere. **How a storefront obtains it is not part of `/v1`** (see [gaps.md](gaps.md)). Both v1 sites ship guest-only; mark signed-in features "needs customer token". |

Tenant, channel, customer and outlet permissions are **never** taken from a request body. The `channel_id` you
send is overwritten with the key's own (see "Channel id" below).

### Guest token handling (important)

1. The token is in the `201` response of the place call and **nowhere else**, ever again. A replay of the
   same place request returns `guest_access_token: null`.
2. Persist it **before** you render anything: `localStorage` key `munim.guest.<order_id>` (and nothing else
   about the customer). If the first response is lost (tab closed, network drop) the order exists but this
   browser can no longer track it. See [gaps.md](gaps.md); in the UI say "We couldn't confirm your order on
   this device. Check with the outlet using your phone number."
3. Never put the token in a URL or analytics event. Send it only as the header.

### Channel and brand id

The preview and place payloads *require* a UUIDv7 `channel_id` (and `device_id: null`, `external_ref: null`).
**Send the menu's `channel_id`** (the key's channel; core overwrites the field with it anyway). For `brand_id`,
send the items' `brand_id` when the whole cart is one brand's (`menu.brands[]` lists the brands selling at the
outlet), else `null`.

## 2 · Idempotency keys

Writes (`POST /v1/storefront/orders`, cancel, reschedule) are *commands*. The command envelope is in the JSON
body (there is no `Idempotency-Key` header):

```json
{ "command_id": "<uuidv7>", "idempotency_key": "<8-100 chars of A-Z a-z 0-9 _ . : ->", "type": "orders.place.v1", "payload": { } }
```

| Rule | Why |
|---|---|
| Make `command_id`, `order_id`, each `line_id` and the `idempotency_key` with `uuidv7()` once per **checkout attempt**, store them in memory/sessionStorage with the cart. | Same key + same request body returns the **original result** even if the window has since filled or the outlet has paused (header `X-Munim-Replayed: true`, `isReplayed(response)`). |
| On a network error or timeout, **retry with the same keys and the same body.** | Never double-places; the guest identity is derived from the order's key, so a *new* key creates a *different* guest. |
| If the shopper changes anything (cart, window, coupon, name), generate **new** keys and a new `order_id`. | Same key + different body is `409` `idempotency_conflict`: "This request key was already used for a different request." |
| Keep the guest envelope's key stable across retries of the same attempt too. | The guest and the order are placed in one transaction. |

## 3 · The error envelope

Every non-2xx response has this body (text is composed by the server from a fixed table, never raw text; show
it only as a fallback):

```json
{ "error": { "code": "conflict", "message": "That pickup time just filled up. Please choose another.", "reason_code": "window_full" } }
```

`code` is the machine class; `reason_code` is set when it is one of the named refusals. Always switch on
`reason_code` first, then `code`, and treat unknown values as generic.

### Error `code` values a storefront can see

| Error code | HTTP | What the UI should show |
|---|---|---|
| `bad_request` | 400 | Malformed body or query (a bug in your code). Show: "Your order was not placed. Please try again." |
| `unauthenticated` | 401 | Customer token missing/expired. Offer "Sign in again" if signed in, else generic error. |
| `forbidden` | 403 | Used with `guest_cannot_change`. Otherwise generic error. |
| `not_found` | 404 | **Bad storefront key, bad guest token, wrong order id, non-storefront channel.** Show the "This link isn't valid." page (never reveal which). |
| `conflict` | 409 | A named refusal; look at `reason_code` (table below). |
| `idempotency_conflict` | 409 | Your bug: key reused with a different body. Regenerate keys, retry once. |
| `invalid_payload` | 422 | Wrong shape/value (e.g. unknown pickup window). Generic error; log the request id, not the body. |
| `unavailable` | 503, or 429 with `reason_code: "rate_limited"` | "We're having trouble right now. Please try again in a moment." Retry with backoff; on `429` wait `Retry-After` (§5). |
| `internal` | 500 | Same as 503 copy. |

Generic fallback copy (D-2 `S-err`): checkout "Your order was not placed. Please try again."; menu "The menu
couldn't load. Please try again."; tracker "Can't load your order right now. It is still placed."

### Reason codes a shopper can hit

Copy in "double quotes" is the literal approved text (screen spec O2/O3). `{braces}` are parameters. A refusal
carries its typed **`params`** where it has any: beside `error` in a `409` / `422` body, and on each entry of a
preview's `refusals[]`. `params` holds ids and server-computed amounts only (never text): `line_no`, `item_id`,
`variant_id`, `code` (the coupon as sent), `min_spend_minor`, `shortfall_minor`, `old_total_minor`,
`new_total_minor`, `currency`. Each field is present only when the refusal has it. The "Fill from" column says
which to use.

```json
{ "error": { "code": "conflict", "message": "Spend a little more to use this coupon.", "reason_code": "coupon_min_spend" },
  "params": { "code": "SPICE10", "min_spend_minor": 30000, "shortfall_minor": 2000, "currency": "INR" } }
```

| Reason code | Where | HTTP | Copy | Fill from / action |
|---|---|---|---|---|
| `window_full` | preview `refusals[]`, place | 409 | "That pickup time just filled up. Please choose another." | Re-fetch `GET .../pickup-windows`, return to the time step. |
| `outlet_paused` | preview `refusals[]`, place | 409 | "{outlet} stopped taking orders a moment ago. Back at {next_open}." | `{outlet}` from outlets list; `{next_open}` from `GET .../state` (`next_open`, may be null: then drop the second sentence). Format in the outlet's zone. |
| `item_sold_out` | preview `refusals[]` (has `line_no`), place | 409 | "{item} just sold out. Remove it to continue." | `{item}` = the menu `display_name` of `params.item_id` (or the cart line at `params.line_no`, 1-based). Mark the item sold out locally and offer "Remove". |
| `item_unavailable` | place / reschedule | 409 | Server `message` ("This item is not available.") | Treat like `item_sold_out`: refresh the menu. |
| `deal_rejudged` | reschedule | 409 | "The {deal} deal isn't available at {time}. Your total changed from {old} to {new}." | `{time}` = the time the shopper picked; `{old}` / `{new}` = `params.old_total_minor` / `params.new_total_minor` in `params.currency`. `{deal}`: the deal id inside the preview line's `deal_refs` (`⟨cite:row:core.deal:<id>⟩`) matched to `menu.deals[]` by `deal_id`; if unmatched say "promotional" (gaps G-11). Re-preview and require a new tap. |
| `deal_changed` | place | 409 | "The {deal} deal was updated. Please review your cart." | Same `{deal}` lookup. Re-preview. |
| `preview_total_changed` | place | 409 | "The total changed since the preview. Review it and try again." | Re-run preview, show the new server total, ask the shopper to confirm again. (This is a command code; it is not in the storefront list but real checkouts hit it.) |
| `coupon_invalid` | preview `refusals[]`, place | 409 | "This coupon isn't valid." | `params.code` says which coupon; clear it. |
| `coupon_expired` | same | 409 | "This coupon has expired." | |
| `coupon_out_of_scope` | same | 409 | "This coupon isn't valid at this outlet." | |
| `coupon_cap_reached` | same | 409 | "This coupon has reached its limit." | |
| `coupon_min_spend` | same | 409 | "Spend {money} more to use this coupon." | `{money}` = `params.shortfall_minor` in `params.currency` (the server's figure, after deals and before tax). Never compute it yourself. |
| `pickup_time_outside_window` | preview, place, reschedule | 422 (`invalid_payload`) | Server `message` ("That pickup time is outside the pickup window you chose.") | Your bug: for a chosen window send `promised_at: null` (the window's start is promised) or an instant inside `[starts_at, ends_at)`. |
| `change_window_closed` | cancel, reschedule | 409 | "It's too late to change this order online. Please call the outlet." | Hide the change buttons. |
| `guest_cannot_change` | cancel, reschedule, with a guest token | 403 | "Call the outlet to change this order" | Guests never see cancel/reschedule buttons; show this text and the outlet address. |
| `rate_limited` | Cares public/storefront routes | 429 | "Too many requests. Please wait a moment and try again." | See "Rate limits". |

A preview refusal is returned inside a **`200`** response (`refusals: [{line_no, reason_code, params?}]`), not as
an error: render it inline and disable "Place order" until the list is empty.

Not for shoppers (do not special-case): `cannot_verify`, `stale_draft`, `authority_denied`, `period_closed`,
`model_blocked` and the rest of the member/back-office codes. Unknown code: show `error.message`.

## 4 · 404 on a bad key

A missing, wrong or revoked storefront key, a wrong guest token, and an order that is not yours **all return
`404 not_found`**, never 401/403 and never a hint which part was wrong. Build one full-page "not found" state
(`"This link isn't valid."`) and use it for any 404 on the first menu/outlets call and on the tracker page.

## 5 · Rate limits (429 + Retry-After)

core-api limits `/v1/cares-network/*` to 60 requests a minute per client address and `/v1/storefront/cares` to 60 a
minute per (address, key). Over the limit the response is `429` with a `Retry-After` header (whole seconds) and the
body `{"error": {"code": "unavailable", "reason_code": "rate_limited", ...}}`. Order and menu routes have no
documented limit (gaps G-08), but handle `429` on **any** call:

```ts
// lib/errors.ts (excerpt)
export function retryAfterMs(res: Response, fallbackMs = 2000): number {
  const s = Number(res.headers.get("Retry-After"));
  return Number.isFinite(s) && s > 0 ? Math.min(s, 60) * 1000 : fallbackMs;
}
```

Wait that long (disable the button, show a countdown), then retry the same request with the same idempotency
keys. Don't poll the Cares route faster than once per 5 seconds; fetch it once per page view. The mock never sends
a `429`.

## 6 · Money

* Every amount is an **integer in minor units** (paise, cents) with a separate `currency` (`INR`, `AUD`). Field
  names end in `_minor`. Quantities are `qty_milli` = thousandths (`1000` = 1).
* **Never compute a total as truth.** The only totals on screen are `subtotal_minor`, `discount_minor`,
  `tax_minor`, `total_minor` from the preview response (before placing) and from `GET /v1/storefront/orders/{id}`
  (after). The server re-derives everything at placement and ignores what you send. Sending
  `client_totals` is allowed but pointless: send `null`.
* A cart badge showing a running sum before any preview is **not allowed**: show the item count and
  "Total at checkout" until a preview exists. A line price in the menu is the server's `price_minor` for display.
* Show a "Preview" label on the checkout price breakdown (the response has `label: "preview"`).
* Format with `Intl.NumberFormat` using the business's locale (`en-IN`, `en-AU`). Dividing by the currency's
  minor-unit exponent **for display only** is fine:

```ts
// lib/format.ts
export function formatMoney(minor: number, currency: string, locale: string): string {
  const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  return nf.format(minor / 10 ** digits);   // display only; never feed this back into an API call
}

/** "1" for qty_milli 1000, "0.5" for 500. */
export const formatQty = (milli: number): string => String(milli / 1000);
```

India groups in lakhs (`₹1,23,456.00` via `en-IN`); Australia uses `$1,234.50` via `en-AU`. Negative amounts
use the real minus sign: `Intl` does this for you.

## 7 · Time zones

* Every instant is ISO-8601 with an offset (`2026-10-14T12:30:00+05:30`). Every outlet has an IANA `tz`
  (`Asia/Kolkata`, `Australia/Melbourne`) in `GET /v1/storefront/outlets` and the state response.
* **Render all times in the outlet's zone, not the browser's**, even if the shopper travels:

```ts
// lib/time.ts
export function formatTime(iso: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
export function formatDay(iso: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}
```

* Use one library (`Intl`) only; never mix date libraries. Never do offset arithmetic by hand. Melbourne changes
  clocks on 4 Oct 2026 (to AEDT, +11:00): if you ever see +10:00 vs +11:00 offsets in one list, that is correct.
* Deal windows (`deals[].windows`) are in the outlet's local time (ISO weekday 1 = Monday + local time range;
  an overnight range wraps past midnight).
* "Ready in about N min" = `accepting.default_prep_min + accepting.busy_extra_min` (two server fields, shown as
  returned; `busy_extra_min` counts only while `state === "busy"`).

## 8 · Calling the real API from a browser (CORS)

The mock is served by your own site, so it is same-origin. The real core-api answers CORS only on the public
browser routes (`/v1/storefront/**`, `/v1/stream`, `/v1/cares-network/**`) and only for the **exact origins** its
operator allows (no `*`). Send the operator your site's origin (for example `https://spice-route.example`) before you
switch `NEXT_PUBLIC_MUNIM_API`. Preflights are answered for the headers a storefront sends
(`X-Munim-Storefront-Key`, `X-Munim-Guest-Token`, `Last-Event-ID`, `Content-Type`, `Authorization`); responses
expose `X-Munim-Replayed` and `Retry-After`. Credentials are headers, never cookies. An origin that is not allowed gets no CORS headers, so the
browser blocks the call: until your origin is on the list, call the real API through your own site (a rewrite or
proxy route).
