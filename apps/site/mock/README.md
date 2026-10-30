# Munim mock storefront API

**Simulated.** Synthetic data only, no real people or brands, nothing is paid (every order says "Pay at the counter").
Every response carries `X-Munim-Mock: true`. Built to the real contract (`packages/contracts`, `public.json` under
`/v1/storefront/**` and `GET /v1/stream`): same paths, same request/response shapes, same error envelope and reason codes, so a site built against
this mock works against the real core-api by swapping the base URL and the key.

Base URL: `<site>/mock` (so `GET <site>/mock/v1/storefront/outlets`). CORS is open (`*`) so a separate site can call it.

## Keys (one per business)

Send as header `X-Munim-Storefront-Key`. A missing or wrong key is a plain `404 not_found` (never 401/403), same as an unknown route.

| Business | Key | Country / currency / tz |
|---|---|---|
| Spice Route Group (synthetic), 3 outlets in Bengaluru | `sfk_mock_spice_route_7f3a91c2` | IN / INR / Asia/Kolkata |
| Laneway Cafe (synthetic), Laneway Cafe Fitzroy | `sfk_mock_laneway_cafe_c42e08d1` | AU / AUD / Australia/Melbourne |

## Routes (all under `/mock`)

| Method + path | operationId |
|---|---|
| GET `/v1/storefront/outlets` | storefrontOutlets |
| GET `/v1/storefront/outlets/{outlet_id}/menu` | storefrontMenu |
| GET `/v1/storefront/outlets/{outlet_id}/state` | storefrontState |
| GET `/v1/storefront/outlets/{outlet_id}/pickup-windows` | storefrontPickupWindows |
| POST `/v1/storefront/orders:preview` | storefrontPreviewOrder |
| POST `/v1/storefront/orders` | storefrontPlaceOrder (201) |
| GET `/v1/storefront/orders/{id}` | storefrontGetOrder |
| POST `/v1/storefront/orders/{id}:cancel` | storefrontCancelOrder |
| POST `/v1/storefront/orders/{id}:reschedule-preview` | storefrontReschedulePreview |
| POST `/v1/storefront/orders/{id}:reschedule` | storefrontRescheduleOrder |
| GET `/v1/storefront/cares` | getStorefrontCares |
| GET `/v1/stream?topics=order:<id>` | streamEvents (text/event-stream) |

Mock-only helpers (not in the contract, need the key): `GET /v1/_mock/labels` (see below), `POST /v1/_mock/reset` (forgets the orders,
replays and window bookings of the business your key belongs to; the other business is untouched), and `GET /v1/_mock/ping` (no key).

**Live order tracking**: `GET /v1/stream?topics=order:<id>` with the key and the order's guest token (or the customer's
`Authorization`), read with the SDK's `openStream` (never `EventSource`). As core: `ready` first; a fresh stream starts after
the events that already exist and `Last-Event-ID: n=<k>` replays from there; each status change is one event
`{"id", "type": "order.status", "data": {order_id, from_status, to_status, ...}}`. Another order, a `kds:` / `inbox:` /
`trace:` topic or no credential is `404`; a malformed topic or cursor `400`. The mock ends a stream after about 50 s with
a `reconnect` hint (serverless time limit); `openStream` reconnects and misses nothing. Polling
`GET /v1/storefront/orders/{id}` every 3 to 5 s also works.

## Who is calling

- **Guest** (no `Authorization`): `POST /orders` needs `guest` (a `storefront.guest.create.v1` envelope). The response holds a one-time
  `guest_access_token`; send it as `X-Munim-Guest-Token` to read that order. Wrong or missing token: 404. A guest cannot cancel or
  reschedule (`403 forbidden`, reason `guest_cannot_change`, "Call the outlet to change this order").
- **Signed-in customer**: send `Authorization: Bearer mock-customer-<name>` (name: `a-z 0-9 _ -`, up to 40 chars; any name works, there is
  no real sign-in). `guest` must be `null`, `guest_access_token` comes back `null`. Cancel, reschedule and their preview require this.
  Another name sees your order as 404. Any other `Authorization` value: 401.

## Behaviour to build against

- **Names**: items, variants, option groups and options carry `display_name` / `description` (plain text), items a `diet` mark (`veg`, `non_veg`, `egg`, `vegan`; Gulab Jamun and Chef's Special are null = not marked) and `brand_id`. The menu has `channel_id` (send it in preview / place), `brands` (Spice Route has one, Laneway none), `prices_include_tax` and `pay_at_counter_methods`. Categories are plain slugs; `GET /v1/_mock/labels` still returns `{labels: {name_key: "English text"}, coupons, outlets, channel_id, off_sale_item_ids}`, with category labels under `category.<name>`.
- **Outlets**: `phone` and `tax_ids` (synthetic GSTIN and FSSAI Lic. No. for Spice Route North and Central, ABN for Laneway; Spice Route South has neither), plus `pay_at_counter_methods` (IN cash, card, UPI; AU cash, card).
- **Money**: minor units + currency (`INR` paise, `AUD` cents). Prices in the menu are the row price; `options_minor` on a preview line is per unit; quantity is `qty_milli` (1000 = 1).
- **Totals are always re-derived on the server.** `client_totals` is accepted and ignored. IN prices are tax-exclusive (GST 5% = CGST 2.5% + SGST 2.5%, each rounded half-up); AU prices are tax-inclusive (GST 10% included, `tax = price / 11` half-up). `subtotal_minor = total - tax + discount`. Rules come from the IN/AU packs (v4). The preview lines carry `tax_rate_bp` and `tax_components`, the preview the order's `tax_components` and `prices_include_tax`; the placed order and order view carry `prices_include_tax` (and `tax_minor` / per-line rates).
- **Deals**: Spice Route "weekday lunch" (Mon-Fri 12:00-15:00 Bengaluru time, 10% off Veg Biryani); Laneway "early bird" (daily 07:00-09:00 Melbourne time, 10% off Flat White). Judged at `promised_at` (or now when null), so rescheduling can change the total.
- **Coupons** (percent per line, after deals; min spend judged after deals):
  Spice Route `SPICE10` (10%, min Rs 300), `NORTH5` (5%, North outlet only), `OLDDEAL20` (expired), `FIRST100` (cap reached);
  Laneway `LANE5` (5%, min A$10), `OLDBREW15` (expired), `FIRST50` (cap reached). Unknown code: `coupon_invalid`.
- **Loyalty** is not simulated: `loyalty_redeem_points > 0` returns `409 loyalty_refused`.
- **Order kinds**: only `pickup` and `takeaway` (else 422).
- **Pickup windows**: today's and tomorrow's 30-minute slots in the outlet's hours (Spice Route 10:00-22:00, capacity 6; Laneway 07:00-15:00, capacity 4). Some are already part-booked; full ones are hidden. Your orders count against capacity. Send a window with `promised_at: null` (the window's start is promised) or a time inside it; outside it is `422 pickup_time_outside_window`.
- **Accepting state**: always open (Spice Route Central is `busy`, +15 min). Force a state for testing with request header `X-Mock-Force-Accepting: open|busy|paused|closed` (applies to `state`, `menu`, `orders:preview` and `POST /orders`, which then refuse with `outlet_paused`).
- **Order progression** (poll the order): `placed` at 0 s, `accepted` at 45 s, `preparing` at 75 s, `ready` at 110 s. `events` lists each real transition. Cancel and reschedule work only while `placed` and inside 60 s (`cancel_window_min` / `reschedule_window_min` = 1), else `409` + `change_window_closed`.
- **Idempotency**: `idempotency_key` in the command envelope. Same key + same body returns the stored response with header `X-Munim-Replayed: true` (a replayed place has `guest_access_token: null`); same key + different body is `409 idempotency_conflict`. Each business is a separate scope. (The body must be identical including `command_id`.)
- **Limits (so a shared public key cannot be abused)**: every in-memory map is capped and evicts the oldest entry first; each business keeps at most 30 orders, so one visitor can hold at most 30 window seats, and an evicted order gives its seat back. Your oldest orders can therefore disappear (404) after you place 30 more under the same key; use `POST /v1/_mock/reset` between runs.
- **Cares listings** (`GET /v1/storefront/cares`) carry `tz`, the IANA zone of the listing's outlet (`Asia/Kolkata`, `Australia/Melbourne`), so render `pickup_from` / `pickup_to` in it.
- **State is in memory per server instance.** A redeploy, cold start or another serverless instance forgets orders (you then get 404 for an order you placed). Do not store order ids beyond a demo session; do not rely on order persistence across instances.

## Errors you can trigger on purpose

Envelope: `{"error": {"code", "message", "reason_code"}}`, plus `params` beside `error` when a refusal has parameters (line and item, coupon `code`, `min_spend_minor` / `shortfall_minor`, `old_total_minor` / `new_total_minor`, `currency`). Place and reschedule refusals are `409 conflict` with the reason code (as core does); preview returns refusals in `refusals[]` with 200, each with its `params`.

| Do this | Result |
|---|---|
| Unknown `item_id` | 404 `not_found` |
| Spice Route `seasonal_kulfi` / Laneway `seasonal_pie` (ids in `off_sale_item_ids`) | 409 `conflict` / `item_unavailable` |
| Spice Route Prawn Masala (all outlets), Chef's Special at Central, Laneway Banana Bread | preview: `refusals` `item_sold_out` with `line_no`; place: 409 `item_sold_out` |
| `X-Mock-Force-Accepting: paused` | preview refusal / place 409 `outlet_paused` |
| Fill a pickup window (place `capacity - booked` orders into it, then one more) | 409 `window_full` |
| Bad coupon / expired / cap / min spend / out of scope | `coupon_invalid`, `coupon_expired`, `coupon_cap_reached`, `coupon_min_spend`, `coupon_out_of_scope` |
| `preview_total_minor` not equal to the server total | 409 `preview_total_changed` |
| Reschedule with a stale `preview_total_minor` | 409 `deal_rejudged` with `params.old_total_minor` / `new_total_minor` |
| A `promised_at` outside the chosen pickup window | 422 `invalid_payload` / `pickup_time_outside_window` |
| Request header `X-Mock-Force-429: 1` (any route, valid key) | `429` + `Retry-After: 5`, body `{"error": {"code": "unavailable", "reason_code": "rate_limited"}}` (the real limiter's shape); nothing is changed. A wrong key is still `404` |
| Body not JSON / wrong shape or an extra key | 400 `bad_request` / 422 `invalid_payload` |

## Tests

From the repo: `apps/site/node_modules/.bin/vitest run --root apps/site mock` (the tests import the real zod schemas from `packages/contracts/src`
to validate every response; the mock's runtime code has no dependencies outside `apps/site`).
Tax rules in `packs.ts` are a copy of the packs; `packs.test.ts` fails if they drift.
