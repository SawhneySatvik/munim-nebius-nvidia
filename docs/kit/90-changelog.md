# 90 · Changelog

## v1 freeze: 13 Oct 2026

`/v1` is **frozen as of 13 Oct 2026** for the storefront surface and the Munim Cares public routes. From this date:

* Existing routes, fields, enum values and reason codes are not renamed, removed or re-typed.
* Changes are **additive only** (new optional fields, new routes, new reason codes) and are listed below with a date.
  Treat unknown fields and unknown reason codes as ignorable and unknown enum values as a generic fallback.
* Reason codes are append-only.

### Additions

| Date | Change |
|---|---|
| 12–13 Oct 2026 | **Munim Cares routes added**: `GET /v1/storefront/cares` (a storefront key's own live donation listings), `GET /v1/cares-network/cities`, `GET /v1/cares-network/listings`, `GET /v1/cares-network/listings/{id}`, `GET /v1/cares-network/impact`, `GET /v1/cares-network/snapshots/{id}` (no credentials; use `createPublicClient`), plus the member-side Cares routes for signed-in staff (for example `GET /v1/cares/market`; not for storefronts). |
| 12–13 Oct 2026 | **Cares reason codes added**: `cares_not_available`, `cares_not_enabled`, `cares_not_opted_in`, `cares_city_mismatch`, `recipient_ineligible`, `listing_expired`, `qty_exceeds_on_hand`, `qty_exceeds_listed`, `cooked_hold_exceeded`, `line_expired`, `no_eligible_recipient`, `no_rostered_staff`, `offer_not_enabled`, `offer_closed`, `claim_decided`, `claim_received`, `rate_limited`. Storefronts only ever see `rate_limited`. |
| with the Cares public routes | `createPublicClient` added to the SDK (sends no key, token or tenant). |
| 13 Oct 2026 | Developer docs published (this folder). The SDK's `openStream` is documented here; the stream route `GET /v1/stream` is real but not in the OpenAPI file. **Superseded 13 Oct 2026:** `GET /v1/stream` is in the OpenAPI file as `streamEvents` (row below). |
| 13 Oct 2026 | **Storefront completeness (T-099).** Menu: `display_name` and `description` on items, variants, option groups and options; `diet` (`veg`, `non_veg`, `egg`, `vegan` or null) and `brand_id` on items; `channel_id`, `brands[]`, `prices_include_tax` and `pay_at_counter_methods` on the menu. Outlets: `phone`, `tax_ids[]` (the ids the pack prints on receipts) and `pay_at_counter_methods`. |
| 13 Oct 2026 | **Tax display (T-099).** `POST /v1/storefront/orders:preview` answers `storefront.preview.response`: each line adds `tax_rate_bp` and `tax_components` (IN: CGST + SGST; AU: GST), the order adds `tax_components` and `prices_include_tax`. The placed order adds `tax_minor` and `prices_include_tax`; the order view adds `prices_include_tax` and, per line, `tax_rate_bp` and `tax_component_rates`. |
| 13 Oct 2026 | **Refusal parameters (T-099).** Storefront refusals carry `params` (`line_no`, `item_id`, `variant_id`, `code`, `min_spend_minor`, `shortfall_minor`, `old_total_minor`, `new_total_minor`, `currency`; each only when it applies) beside `error` in `409` / `422` bodies (`storefront.refusal-error`) and on each preview refusal. |
| 13 Oct 2026 | **Pickup windows (T-099).** Reason code `pickup_time_outside_window` added (`422 invalid_payload`): a `promised_at` sent with a `pickup_window_id` must lie inside the window; `promised_at: null` with a window promises its `starts_at`. A request that sent a time outside its window was accepted before and is now refused. |
| 13 Oct 2026 | **Stream and CORS (T-099).** `GET /v1/stream` is in the OpenAPI file as `streamEvents` (text/event-stream; member credentials also accepted). core-api answers CORS on `/v1/storefront/**`, `/v1/stream` and `/v1/cares-network/**` for operator-allowed origins. Country packs v4 list `pay_at_counter_methods` (India cash, card, UPI; Australia cash, card). |
| 13 Oct 2026 | **Replay returns the stored order (fix 2-A).** A replayed storefront place (same `idempotency_key`, same body) now returns the originally stored order even if the pickup window has since filled or the outlet has since paused; before, the fresh checks could refuse a request that had already succeeded. `guest_access_token` is still `null` on a replay. |
| 13 Oct 2026 | **Cares offer hand-overs are all-or-nothing and final in v1.** A business-to-business offer hand-over transfers the whole offered quantity or none: no partial hand-over and no void. (Business-side routes; storefronts do not call them.) |
| 13 Oct 2026 | **`tz` on public Cares listings.** Every item of `GET /v1/storefront/cares` and the `/v1/cares-network/listings` routes carries `tz`, the IANA zone of the listing's outlet (closes G-14). The mock returns it. |
| 13 Oct 2026 | **Mock 429 and limits.** The mock answers `429` (`Retry-After: 5`, `unavailable` / `rate_limited`) when sent `X-Mock-Force-429: 1`; its state is capped (30 orders per business, oldest evicted) and the mock reset helper clears only your key's business. |
| 13 Oct 2026 | **SDK and mock.** The SDK tarball ships compiled JavaScript and `.d.ts` (no `transpilePackages`) and exports `uuidv7()`. The mock API returns every field above and serves `GET /v1/stream` for its orders. |

### Known contract limits at freeze

See [gaps.md](gaps.md). None blocks building against the mock.
