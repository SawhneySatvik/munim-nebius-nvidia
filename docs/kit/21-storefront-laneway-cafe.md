# 21 · Storefront build spec: Laneway Cafe (Australia, 1 outlet, AUD)

Read [00](00-getting-started.md), [10](10-auth-and-errors.md) and [20](20-storefront-spice-route.md) first.
Laneway is the same API flow as Spice Route with one outlet, a coffee-first morning menu, AUD, GST that is
included in prices, and the `Australia/Melbourne` zone. This doc lists the full spec for Laneway and points to
[20 §5](20-storefront-spice-route.md#5--api-calls-per-step) for the shared code (`lib/munim.ts`, `lib/names.ts`,
`lib/checkout.ts`, `lib/track.ts`, `lib/cares.ts`, `lib/format.ts`, `lib/time.ts`; `uuidv7` comes from the SDK), which
contains **no country logic**: copy it unchanged. Mock key: `sfk_mock_laneway_cafe_c42e08d1`. All data is **synthetic**.

```ts
// lib/site.ts  (the only per-site file)
export const SITE = {
  name: "Laneway Cafe",
  locale: "en-AU",
  currency: "AUD",          // for sanity checks only; amounts always come with their own `currency`
  phonePrefix: "+61",
  // PROPOSED copy (the approved text names UPI, India only). It matches the pack's methods: the menu's
  // `pay_at_counter_methods` is ["cash", "card"] for Australia.
  payAtCounter: "Pay at the counter — cash or card.",
} as const;

/** AU mobile "0412 345 678" -> "+61412345678" (E.164, matches ^\+[1-9][0-9]{6,14}$). */
export function toE164AU(input: string): string | null {
  const digits = input.replaceAll(/[\s()-]/g, "");
  const e164 = digits.startsWith("+") ? digits : digits.startsWith("0") ? `${SITE.phonePrefix}${digits.slice(1)}` : `${SITE.phonePrefix}${digits}`;
  return /^\+[1-9][0-9]{6,14}$/.test(e164) ? e164 : null;
}
```

## 1 · Brand direction (original)

**Laneway Cafe** is a small Fitzroy corner cafe: bluestone lane, steamed milk, a chalkboard that changes. Mood:
quick, calm, a little dry-humoured; built for the 7 am rush on a phone with one hand. Layout is a single
column with big coffee tiles first, food second. Imagery: flat shapes and hand-drawn line icons (cup, toast,
bicycle) that you make yourself; nothing from stock or third-party packs.

| Token | Value | Use | Contrast (measured) |
|---|---|---|---|
| `--surface` | `#F4F1EA` (stone) | page background | ink on it 13.01 : 1 |
| `--ink` | `#1F2937` | text | |
| `--muted` | `#4B5563` | secondary text | 6.70 : 1 on surface |
| `--brand-primary` | `#115E59` (deep teal) | buttons, links | white on it 7.58 : 1; on surface 6.72 : 1 |
| `--brand-on-primary` | `#FFFFFF` | text on primary | |
| `--accent` | `#9A3412` (terracotta) | badges, "Busy" | 6.48 : 1 on surface |
| `--danger` | `#B91C1C` | errors | 6.47 : 1 on white |

Typography: headings in a friendly grotesque (for example Instrument Sans or similar, SIL OFL) 28/22/18;
body and numbers in Inter 16/18 with `tabular-nums`. Money renders `$4.80` (`en-AU`); use `A$` only if a screen
could show a second currency (it does not). Never colour-only status.

Required labels on every page: **"Sample shop — orders are not real."** and "Demo: all data is synthetic.
Payments are recorded, never processed."

## 2 · Sitemap

| Route | Page |
|---|---|
| `/` | Menu (home): single outlet, no picker. If `GET /v1/storefront/outlets` ever returns more than one, show the outlet picker from [20 §4.1](20-storefront-spice-route.md#41--home-and-outlet-picker). |
| `/checkout` | Time, price preview, details, place |
| `/order/[orderId]` | Tracker |
| `/cares` | Munim Cares |
| `/not-valid` and any 404 | "This link isn't valid." |

## 3 · What the mock world contains

| Outlet | Address (synthetic) | Zone | Tax | Phone, tax ids |
|---|---|---|---|---|
| Laneway Cafe Fitzroy | 5 Synthetic Lane, Fitzroy VIC (synthetic) | `Australia/Melbourne` | GST 10 %, **included** in prices (class `gst_10`; `prices_include_tax: true`) | `phone`; `tax_ids` ABN (synthetic) |

Menu: Flat White (`flat_white`, coffee, 480 = $4.80), Latte (`latte`, coffee, 500 = $5.00), Smashed Avocado on
Sourdough (`avocado_toast`, food, 1850 = $18.50), plus mock-only items: options (milk on the coffees, add-ons on the
toast), variants (Iced Latte), a GST-free line (Sourdough Loaf, class `gst_free`: rate 0, no components) and a
sold-out item. Names, descriptions and the `diet` mark come from the menu (`display_name`, `description`, `diet`,
as in [20 §3](20-storefront-spice-route.md#3--what-the-mock-world-contains)); keep the category map for `coffee`,
`food`, `bakery` (G-01).

**Melbourne specifics**

* Zone `Australia/Melbourne`. Clocks moved to AEDT (+11:00) on Sunday 4 Oct 2026; all instants in the mock
  carry their offset, so pass them straight to `Intl.DateTimeFormat({ timeZone })`. Never append a fixed `+10:00`.
* Hours come from `GET .../state`, never hard-coded (the seed's trading is morning to early afternoon, but
  treat that as data). "Closed. Opens {next_open}." shows the next opening in Melbourne time: a Sunday-night
  visitor from another zone must see Monday's local time.
* Currency `AUD`, locale `en-AU`, phone `+61`. GST: the menu and preview say `prices_include_tax: true`, so the
  GST is *contained* in the prices and the total. The preview's `tax_components` has one entry
  (`{ code: "GST", rate_bp: 1000, amount_minor }`): label it "Includes GST 10% {amount}" (proposed) under the total,
  not as a row that adds to it. Do not compute it.
* Food-donation note is the generic one only: "Check your local food-donation rules". No Australian law text.
* Pay-at-counter wording for AU is proposed in `SITE.payAtCounter` above (approved copy is India-specific).

## 4 · Pages and states

Quoted copy is approved literal text; `(proposed)` is mine. The state tables of [20 §4](20-storefront-spice-route.md#4--pages-and-states)
apply as written (menu: open/busy/paused/closed/sold out/empty/load/error/offline; checkout: empty/load/refusals/placing/offline/error;
tracker: statuses, rejected, cancelled, live, polling, 404). Laneway-specific points:

| Page | Specifics |
|---|---|
| `/` Menu | Hero strip with the state line and "Ready in about {n} min" (n = `default_prep_min + busy_extra_min`) as the **first thing** under the logo: it is a morning-rush site. Coffee category first, big tiles (min 64 px tall), one-tap add with a toast "Added". "Deals" tab only if `deals[]` non-empty (render `windows` in Melbourne time). Closed/paused: "Closed. Opens {next_open}." / "Not taking orders right now. Back at {next_open}." (menu browsable, add disabled). Sold out: "Sold out". |
| `/checkout` | Default **ASAP** (`pickup_window_id: null`, `promised_at: null`); "Choose a time" opens windows grouped by day in Melbourne (Today / Tomorrow / weekday); a chosen window is sent with `promised_at: null`. Preview rows: Subtotal, Discount, Total, then "Includes GST 10% {amount}" from `tax_components` (see tax note), label "Preview". Contact: Name; phone (`toE164AU`) or email; marketing consent unchecked. Locked text: `SITE.payAtCounter`. Button "Place order". |
| `/order/[orderId]` | Same tracker as Spice Route: Placed -> Accepted -> Preparing -> Ready -> Picked up; "Ready at about {time}"; "Pay at the counter"; guests: "Call the outlet to change this order" + the outlet `phone` as a `tel:` link. Footer: the outlet's ABN from `tax_ids`. |
| `/cares` | Same as [20 §6](20-storefront-spice-route.md#6--munim-cares-section) with Melbourne times. |

Error and refusal copy: use [10 §3](10-auth-and-errors.md) verbatim. Coupon example in the approved copy is
`SAVE10`; the mock's codes (`LANE5`, `OLDBREW15`, `FIRST50`) are on the Mock API page.

## 5 · API calls per step

Identical to [20 §5](20-storefront-spice-route.md#5--api-calls-per-step); for this site:

| # | Step | Call |
|---|---|---|
| 1 | Resolve the outlet | `GET /v1/storefront/outlets` (use `outlets[0]`; keep its `tz`) |
| 2 | Menu + state | `GET /v1/storefront/outlets/{outlet_id}/menu` (refresh on focus and every 60 s) |
| 3 | Windows | `GET /v1/storefront/outlets/{outlet_id}/pickup-windows` |
| 4 | Preview | `POST /v1/storefront/orders:preview` with `kind: "pickup"` |
| 5 | Place (guest) | `POST /v1/storefront/orders` with `orders.place.v1` + `storefront.guest.create.v1` envelopes |
| 6 | Track | `openStream` topic `order:<id>` + `GET /v1/storefront/orders/{id}`; 15 s polling fallback |
| 7 | Change | signed-in only: `POST /v1/storefront/orders/{id}:reschedule-preview`, `:reschedule`, `:cancel` |
| 8 | Cares | `GET /v1/storefront/cares`; `GET /v1/cares-network/impact` via `createPublicClient` |

Guest checkout cannot redeem loyalty (the server zeroes `loyalty_redeem_points`) and cannot cancel or
reschedule (`403 guest_cannot_change`): the UI shows "Call the outlet to change this order". Coupons work for
guests (`coupon_codes`, uppercase, `^[A-Z0-9][A-Z0-9-]{2,31}$`).

A quick smoke test of the shared flow against the Laneway mock (run once before building UI):

```ts
// scripts/smoke.ts
import { client } from "../lib/munim";
import { previewCart, newLine } from "../lib/checkout";
import { itemLabel } from "../lib/names";

const { data: o } = await client.GET("/v1/storefront/outlets");
const outlet = o!.outlets[0]!;
const { data: menu } = await client.GET("/v1/storefront/outlets/{outlet_id}/menu", { params: { path: { outlet_id: outlet.outlet_id } } });
const item = menu!.items.find((i) => i.available && i.price_minor !== null)!;
const r = await previewCart(outlet.outlet_id, menu!.channel_id, [newLine(item.item_id, null, [], 1)], { windowId: null, promisedAt: null }, []);
console.log(itemLabel(item), r.ok ? { currency: r.preview.currency, total: r.preview.total_minor, gst: r.preview.tax_components, included: r.preview.prices_include_tax } : r.status);
```

## 6 · Munim Cares section

Exactly as [20 §6](20-storefront-spice-route.md#6--munim-cares-section): listings with "Simulated recipient",
the network total "Meals shared across Munim — to simulated recipients" with "Measured on synthetic data",
and "Check your local food-donation rules". Laneway extras: pickup times for a listing in Melbourne time; a
`cooked` line should show its `expires_on` prominently. Untrusted `label` text is rendered as text only.

## 7 · Accessibility and performance

Same floors as [20 §7](20-storefront-spice-route.md#7--accessibility-and-performance): inputs ≥ 16 px, taps ≥ 48 px
(coffee tiles ≥ 64 px), text ≥ 4.5 : 1 (palette measured above), visible focus, 320 px and 200 % zoom, `lang="en-AU"`,
`aria-live="polite"` for status. Budget: LCP ≤ 2.0 s on 4G (first screen is one request: menu), ≤ 150 KB gzipped JS on `/`,
two font families max, no layout shift when state banner loads (reserve its height).

## 8 · Acceptance checklist (testable against the mock)

**Setup and labels**
- [ ] Wrong key -> "This link isn't valid." (404 in network tab). Right key -> menu loads with one outlet and no picker.
- [ ] "Sample shop — orders are not real." on every page; cares page has the three required labels.
- [ ] No `EventSource`; no key/token in any URL.

**Menu**
- [ ] State line + "Ready in about {n} min" appear above the fold at 360 × 640.
- [ ] Prices show as `$4.80`, `$5.00`, `$18.50` from API minor units; no typed prices in source.
- [ ] Closed/paused/busy copy correct; closed shows next opening in Melbourne time (spoof browser zone to `America/New_York` and confirm the time does not move).
- [ ] Sold-out item cannot be added; empty/error/load/offline states present.

**Checkout**
- [ ] ASAP place works with `pickup_window_id: null`, `promised_at: null`; choosing a window sends its id.
- [ ] Totals equal preview fields exactly; GST is shown as included (`prices_include_tax: true`) with the amount from `tax_components`; the Sourdough Loaf line carries no GST.
- [ ] `0412 345 678` is sent as `+61412345678`; invalid phone blocks submit.
- [ ] Guest token stored before navigation; retry with the same keys returns the same order (`X-Munim-Replayed: true`); edited cart gets new keys.
- [ ] Refusals show the copy from the error doc (`window_full`, `item_sold_out`, `outlet_paused`, coupon codes, `preview_total_changed`).
- [ ] No card fields; locked pay-at-counter text present ("cash or card", matching `pay_at_counter_methods`).

**Tracker**
- [ ] Not-valid page without the stored token; live status changes without reload; polling fallback after killing the stream.
- [ ] Times in Melbourne zone; guest sees "Call the outlet to change this order". `[ct]` reschedule/cancel flows as in 20.

**Cares**
- [ ] Listings, "Simulated recipient", impact figure with "Measured on synthetic data" and Source disclosure; `<b>` in a label is literal; 429 handled.

**Quality**
- [ ] Lighthouse mobile performance ≥ 90, accessibility ≥ 95; axe clean of serious issues; inputs ≥ 16 px; taps ≥ 48 px; 320 px and 200 % zoom OK.
