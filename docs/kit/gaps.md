# Gaps: what the storefront contract does not give you yet

Each item says what you can do **today**. None of these are invented in the other docs; where a doc relies on a
workaround it links here. IDs are stable (G-01…); closed items are listed at the end with the change that closed them.

## Open

| ID | Gap | Impact on the sites | Do this today |
|---|---|---|---|
| G-01 (categories) | **Categories have no display names.** Items, variants, option groups and options now carry `display_name` / `description` (and items a `diet` mark), but `category` is still a plain slug. No images. | Category tabs need a label. | Ship a small category name map with a title-case fallback (20 §3). |
| G-05 | **Guest token is shown once.** A lost first response (tab closed, network drop) leaves an order the browser cannot track, and a replay returns `guest_access_token: null`. | Rare unrecoverable tracking. | Persist the token before rendering; on failure say the order may exist and to ask the outlet. Needs an order-lookup-by-phone route to fix properly. |
| G-06 | **How a storefront gets a customer token is not in `/v1`.** Account, loyalty, cancel and reschedule require it (`GET /v1/account`, `GET /v1/account/loyalty`). Guests cannot cancel or reschedule (`403 guest_cannot_change`). | v1 sites are guest-only; change/cancel and loyalty UI are behind a flag. | Build the flag; mark checklist items `[ct]`. On the mock, `Authorization: Bearer mock-customer-<name>` stands in for a token (see the mock page). |
| G-08 (partly) | **Rate limits on order routes.** The Cares routes are limited (60 a minute per client address; `GET /v1/storefront/cares` per address and key) and answer `429` with `Retry-After`, body `code: "unavailable"`, `reason_code: "rate_limited"`. Order and menu routes have no documented limit, and the OpenAPI responses list no `429`. The mock sends a `429` when you send the request header `X-Mock-Force-429: 1` (`Retry-After: 5`, the real body). | Order and menu routes have no real limit to test against; the mock header is the way to exercise your handler. | Handle `429` on every call via `Retry-After` (10 §5). |
| G-11 (partly) | **Deal names in refusal params.** Refusals now carry typed `params` (line, item, coupon code, min-spend shortfall, old and new totals), but `deal_rejudged` names no deal. | `{deal}` in the approved copy. | Match the preview line's `deal_refs` ids to `menu.deals[]`; if nothing matches, say "promotional" (10 §3). |

## Closed on 13 Oct 2026 (T-099)

| ID | Was | Now |
|---|---|---|
| G-01 (items) | No display names, descriptions or diet marks. | `display_name`, `description` on items, variants, option groups and options; `diet` (`veg`, `non_veg`, `egg`, `vegan`, or null) on items. Plain text: render as text. |
| G-02 | No channel or brand id. | The menu returns `channel_id` and `brands[]`; each item has `brand_id`. |
| G-03 | No tax split, rates or inclusive flag. | Preview lines carry `tax_rate_bp` and `tax_components` (IN: CGST + SGST halves; AU: GST); the preview has order `tax_components` and `prices_include_tax`; the menu, placed order and order view say `prices_include_tax`; order lines carry their rates. |
| G-04 | No outlet phone or tax ids. | Outlets carry `phone` (or null) and `tax_ids[]` (code, label, value) for the ids the pack prints on receipts: GSTIN and FSSAI Lic. No. in India, ABN in Australia. |
| G-07 | `GET /v1/stream` not in `public.json`. | It is the `streamEvents` operation (text/event-stream); read it with `openStream`. The mock serves it too. |
| G-09 | No CORS. | core-api answers CORS on `/v1/storefront/**`, `/v1/stream` and `/v1/cares-network/**` for the exact origins the operator allows (10 §8). |
| G-10 | SDK shipped as TypeScript source. | The tarball ships compiled JavaScript and `.d.ts`: no `transpilePackages`. It also exports `uuidv7()`. |
| G-12 | `promised_at` for a chosen window unspecified. | Send the window id with `promised_at: null` (core promises the window's `starts_at`) or an instant inside the window; outside it is `422` `pickup_time_outside_window`. |
| G-13 | Pay-at-counter methods per country. | Outlets and menu return `pay_at_counter_methods` from the country pack: India cash, card, UPI; Australia cash, card. |
| G-14 | Cares listing time zone. | Closed by the `tz` field (IANA zone) on every Cares listing, 13 Oct 2026. An earlier doc workaround (match `outlet_name` to the outlets list; "one zone per business") was wrong: an Australian business can span several zones. Render pickup times in the listing's `tz`. |
| G-15 | Mock keys were placeholders. | The keys and coupon codes are on the site's Mock API page (`/developers/mock`) and in 00. |
| G-16 | Small seed menus without options or variants. | The mock seeds options (Butter Chicken, Flat White, Latte, Smashed Avocado on Sourdough) and variants (Mango Lassi, Iced Latte), a GST-free line, sold-out and off-sale items, and an item with no diet mark. |
