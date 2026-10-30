# 00 · Getting started

> Everything in Munim is **synthetic and simulated**. The businesses are invented, the suppliers and
> donation recipients are simulated, and payments are *recorded, never processed*. Your sites must say so
> (see the labels in each storefront spec).

## What Munim is

Munim is an operating system for restaurant groups and small shops. **Munim Core** is the system of record:
orders, menus, prices, stock, kitchen tickets, ledgers and a public `/v1` HTTP API. **Munim Intelligence** is a
separate AI layer that explains what happened, finds money leaks and *drafts* actions for a person to approve.

One rule outranks every feature, and your storefronts live inside it: **nothing changes the books without a
named person's approval, and every number shown traces to a ledger row.** For you this means: prices, taxes,
totals, ticket numbers and quantities are **always rendered from API responses**. You never calculate a number
that the customer relies on, and you never type one.

## What you are building

Two customer storefronts (website for ordering pickup) for two demo businesses:

| Site | Business | Where | Currency | Zone | Spec |
|---|---|---|---|---|---|
| Spice Route | Spice Route Group (synthetic), 3 outlets: North, Central, South | Bengaluru, India | INR | `Asia/Kolkata` | [20-storefront-spice-route.md](20-storefront-spice-route.md) |
| Laneway Cafe | Laneway Cafe Fitzroy (synthetic), 1 outlet | Melbourne, Australia | AUD | `Australia/Melbourne` | [21-storefront-laneway-cafe.md](21-storefront-laneway-cafe.md) |

Each site: browse the menu, build a cart, see a server-priced preview, pick a pickup time, check out as a
guest, place the order, and follow it live. Both also show the "Munim Cares" food-donation section.

## Base URLs

| Environment | Base URL | Notes |
|---|---|---|
| Mock (build against this) | `<site>/mock`, i.e. the mock API served by your own site, for example `http://localhost:3000/mock` | Same paths and shapes as the real API; routes below are appended: `<site>/mock/v1/storefront/outlets`. |
| Real API | provided later | You must not hard-code it: read it from one env var (`NEXT_PUBLIC_MUNIM_API`). |

The real API is the same `/v1` contract (frozen, see [90-changelog.md](90-changelog.md)), so switching is one
env var plus one key.

## Storefront keys

Every storefront call carries a public **storefront key** in the `X-Munim-Storefront-Key` header. The key
resolves the business *and* the sales channel (your site is the channel). You never send a tenant id or a
channel id that matters.

| Site | Mock key |
|---|---|
| Spice Route | `sfk_mock_spice_route_7f3a91c2` |
| Laneway Cafe | `sfk_mock_laneway_cafe_c42e08d1` |

The same keys, the coupon codes and everything else the mock does are on the site's **Mock API** page
(`/developers/mock`); you do not need the Munim repository. Put the key in an env var
(`NEXT_PUBLIC_MUNIM_STOREFRONT_KEY`); the key is public by design, but treat it like a password in logs (never log
it, never put it in a URL). The real API's keys come later, with its URL.

## Install the SDK

The typed client is `@munim/sdk`, shipped as a tarball:

```bash
# from the folder that contains the tarball you downloaded from /downloads/munim-sdk.tgz
npm install ./munim-sdk.tgz     # or: pnpm add ./munim-sdk.tgz
```

What you get (all of it is real; nothing below is invented):

| Export | What it is |
|---|---|
| `uuidv7()` | A fresh UUIDv7 for every client-made id (`command_id`, `order_id`, `line_id`, ...). |
| `createMunimClient({ baseUrl, storefrontKey, guestToken?, token?, fetch? })` | Typed client (built on `openapi-fetch`): `client.GET(path, opts)` / `client.POST(path, opts)`. Paths and bodies are type-checked against the OpenAPI contract. |
| `createPublicClient({ baseUrl })` | Same, but sends **no** credentials. Use for `/v1/cares-network/*` only. |
| `openStream({ baseUrl, topics, guestToken, headers, onEvent, onState })` | Fetch-based SSE reader for `GET /v1/stream` (reconnect, backoff, `Last-Event-ID`). Use this instead of `EventSource`. The mock serves the stream too. |
| `StreamRefused`, `parseSse` | Stream error class and parser. |
| `STOREFRONT_KEY_HEADER`, `GUEST_TOKEN_HEADER`, `REPLAYED_HEADER` | Header names. |
| `isReplayed(response)` | True when a response is a replay of an earlier identical command. |
| `OPERATIONS`, types `paths`, `components`, `Schemas` | Every operation string; generated types. |

The tarball ships compiled JavaScript with `.d.ts` types (ESM, browsers and Node 20+), so Next.js needs no
`transpilePackages` setting. Check the download against `munim-sdk.tgz.sha256` (`shasum -a 256 munim-sdk.tgz`).

The API needs UUIDv7 for client-made ids; `crypto.randomUUID()` makes v4 and is rejected. Use the SDK's
`uuidv7()`:

```ts
import { uuidv7 } from "@munim/sdk";
const orderId = uuidv7();
```

One client module:

```ts
// lib/munim.ts
import { createMunimClient } from "@munim/sdk";

export const API = process.env.NEXT_PUBLIC_MUNIM_API ?? "/mock";
export const KEY = process.env.NEXT_PUBLIC_MUNIM_STOREFRONT_KEY ?? "";

/** Anonymous storefront client. For one guest order's tracking, create a second one with `guestToken`. */
export const client = createMunimClient({ baseUrl: API, storefrontKey: KEY });
export const trackingClient = (guestToken: string) => createMunimClient({ baseUrl: API, storefrontKey: KEY, guestToken });
```

## Your first request: list the menu

With the SDK:

```ts
import { client } from "./lib/munim";

const { data: outlets, error: e1 } = await client.GET("/v1/storefront/outlets");
if (e1 || !outlets) throw new Error("could not load outlets");          // show the S-err state, not e1.error.message verbatim

const outlet = outlets.outlets[0]!;
const { data: menu, error: e2 } = await client.GET("/v1/storefront/outlets/{outlet_id}/menu", {
  params: { path: { outlet_id: outlet.outlet_id } },
});
if (e2 || !menu) throw new Error("could not load the menu");

for (const item of menu.items) {
  // display_name is the owner's plain text (null: use your own label for name_key); diet is veg / non_veg / egg / vegan or null.
  // price_minor is integer minor units (paise / cents); null when the item is sold by variant.
  console.log(item.display_name ?? item.name_key, item.diet ?? "", item.available ? "" : "(sold out)", item.price_minor, item.currency);
}
console.log("prices include tax:", menu.prices_include_tax, "pay at the counter by:", menu.pay_at_counter_methods);
console.log("accepting:", menu.accepting.state, "next open:", menu.accepting.next_open);
```

With plain `fetch` (no SDK):

```ts
const API = process.env.NEXT_PUBLIC_MUNIM_API ?? "/mock";
const headers = { "X-Munim-Storefront-Key": process.env.NEXT_PUBLIC_MUNIM_STOREFRONT_KEY ?? "" };

const outletsRes = await fetch(`${API}/v1/storefront/outlets`, { headers });
if (!outletsRes.ok) throw new Error(`outlets: HTTP ${outletsRes.status}`);   // 404 = bad key, see 10-auth-and-errors.md
const { outlets } = (await outletsRes.json()) as { outlets: { outlet_id: string; name: string; tz: string }[] };

const menuRes = await fetch(`${API}/v1/storefront/outlets/${outlets[0]!.outlet_id}/menu`, { headers });
const menu = (await menuRes.json()) as { items: { name_key: string; display_name: string | null; price_minor: number | null; currency: string }[] };
console.log(menu.items.map((i) => `${i.display_name ?? i.name_key} ${i.price_minor} ${i.currency}`));
```

## Endpoints your sites use (all `auth: storefront key`)

| Purpose | Method and path |
|---|---|
| Outlets of this business | `GET /v1/storefront/outlets` |
| Menu, deals, accepting state | `GET /v1/storefront/outlets/{outlet_id}/menu` |
| Accepting state alone (cheap poll) | `GET /v1/storefront/outlets/{outlet_id}/state` |
| Pickup windows with spare capacity | `GET /v1/storefront/outlets/{outlet_id}/pickup-windows` |
| Price a cart (writes nothing) | `POST /v1/storefront/orders:preview` |
| Place order (guest or signed-in) | `POST /v1/storefront/orders` |
| Read my order (guest token) | `GET /v1/storefront/orders/{id}` |
| Live order updates (SSE, operation `streamEvents`) | `GET /v1/stream?topics=order:<id>` via `openStream` |
| Cancel / reschedule (signed-in customers only) | `POST /v1/storefront/orders/{id}:cancel`, `:reschedule-preview`, `:reschedule` |
| Munim Cares section | `GET /v1/storefront/cares` |
| Cares network total (no credentials) | `GET /v1/cares-network/impact` |

Reading order: [10-auth-and-errors.md](10-auth-and-errors.md) first, then your site spec.
