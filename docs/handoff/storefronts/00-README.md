# 00 · Read me first: two ordering sites on Munim

**Munim** is an operating system for restaurant groups and small shops. Its core keeps the books (orders, menus,
prices, stock) and exposes a public HTTP API; a person approves every change. Your job is the customer-facing part:
two pickup-ordering websites that read and write only through that API.

## What you are building

Two separate, production-ready **Next.js (App Router, TypeScript)** sites, each a pickup-ordering storefront for a
synthetic business:

| Site | Business (all synthetic) | Spec |
|---|---|---|
| **Spice Route** | North-Indian kitchen, 3 outlets in Bengaluru, INR | `10-spice-route.md` |
| **Laneway Cafe** | One cafe in Fitzroy, Melbourne, AUD | `11-laneway-cafe.md` |

Each site: browse the menu, build a cart, see a server-priced preview, pick a pickup time, check out as a guest, place
the order, follow it live, and see the business's "Munim Cares" food donations. Payment happens at the counter and is
only recorded there; nothing is ever charged.

You build against a **mock API** now. The real API comes later and has the same paths and shapes, so switching is two
environment variables. Live demo of the project (for context only): https://munim-rho.vercel.app. The API contract,
the mock keys and the coupon codes are public on its developer pages, and everything you need is in these files.

## Read in this order

| File | What it gives you |
|---|---|
| `00-README.md` | This page: setup, done, hand-back |
| `20-rules.md` | The rules: event rules, demo labels, money, credentials. Read before writing code. |
| `01-api-client.md` | The API, the hand-written client (no SDK), shared helpers, the smoke test |
| `02-design.md` | The design system: tokens, type, components, CSS, motion, accessibility |
| `10-spice-route.md` / `11-laneway-cafe.md` | Every page, state, string, API call and acceptance check for one site |

If you use an AI coding assistant, give it 00, 20, 01, 02 and one site file, and build one site at a time.

## Setup (per site)

Node 20 or newer. Commands for Spice Route; for Laneway Cafe use `laneway-cafe` and its key.

```bash
npx create-next-app@latest spice-route --ts --tailwind --eslint --app --use-npm --import-alias "@/*" --yes
#   --yes takes the defaults for everything else, including no src/ directory
cd spice-route
curl -fsSL https://munim-rho.vercel.app/developers/openapi.json -o openapi.json
npm i -D openapi-typescript@7.13.0 tsx
npx openapi-typescript ./openapi.json -o ./lib/munim/schema.d.ts
```

Create `.env.local` (git-ignored by `create-next-app`):

```bash
NEXT_PUBLIC_MUNIM_API=https://munim-rho.vercel.app/mock
NEXT_PUBLIC_MUNIM_STOREFRONT_KEY=sfk_mock_spice_route_7f3a91c2
# Laneway Cafe: NEXT_PUBLIC_MUNIM_STOREFRONT_KEY=sfk_mock_laneway_cafe_c42e08d1
NEXT_PUBLIC_MUNIM_MOCK_CONTROLS=1
```

Then:

1. Save every `// file:` block from `01-api-client.md` at its path (`lib/munim/*`, `scripts/smoke.ts`).
2. Run the smoke test and see "smoke: all ok" (01 §9). Do not start on UI until it passes.
3. Save `app/globals.css` and `app/fonts.ts` from `02-design.md`, and `lib/site.ts` from your site file.
4. Build the pages in the site file's order: layout, home/menu, item modal and cart, checkout, tracker, Cares, not-valid.

The mock answers CORS for any origin, so `npm run dev` on `localhost:3000` works directly. For the real API, the
founder will send its URL and keys, and needs your site's origin (e.g. `https://spice-route.example.com`) to allow
it. Until then the site only talks to the mock.

## Definition of done

- [ ] Every item in the site file's acceptance checklist is ticked: `[mock]` items verified on the mock, `[unit]` items
      covered by a unit test or a stubbed response, `[real]` items left for the real API.
- [ ] Every rule in `20-rules.md` holds.
- [ ] `npx tsx scripts/smoke.ts` prints "smoke: all ok"; `npm run build` and `npx tsc --noEmit` pass; ESLint is clean.
- [ ] Every state named in the site file (loading, empty, error, offline, sold out, busy, paused, closed, each refusal,
      not-valid, each order status) can be reached with the mock, the test panel or a stubbed response.
- [ ] Lighthouse mobile: performance ≥ 90 and accessibility ≥ 95 on the menu and checkout pages.
- [ ] Deployed to a preview URL (Vercel is fine) with the mock env vars.

## What to send back

1. The repository (a git link or a zip) with a README covering: how to run it, the env vars, the dated log of the
   shapes and icons you drew, and anything you changed from these specs and why.
2. The smoke test output, pasted as text.
3. Screenshots of every state from the site file at 390 px wide (and the menu and checkout at 1280 px), named
   `<page>-<state>.png`. No screenshot may show a guest token or storefront key.
4. The Lighthouse reports (mobile) for the menu and checkout pages.
5. The preview URL.
6. A list of every place where the API or these files were unclear or seemed wrong. Do not work around the API
   silently.
