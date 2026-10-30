# Lane C report — P4 (Kosambari Kitchens, Bengaluru) and P5 (The Snacky Shack)

Status: **P4 done** (the live Ask is blocked on lane A's intel mode: exact need below). **P5 done.**

**Orchestrator, before the first push of `intelligence` or any P6 export — The Snacky Shack is a real business and its
owner has not consented (EV-4: nothing of it goes outside this repo until they do).** Whether pushing `intelligence` to a
private remote counts as "outside this repo" is not mine to decide; flagging it. P5 cannot be excluded by leaving out
files alone, because its hunks also live in shared files:
- Snacky-only files: `tools/worldgen/src/worlds/snacky_shack.ts`, `tools/worldgen/answer-key/demo/snacky_shack.json`,
  `tools/worldgen/test/snacky_shack.test.ts`, `apps/web/lib/businesses/snacky_shack.ts`.
- Shared files carrying Snacky hunks: `apps/web/lib/businesses/index.ts` (the registry import and entry),
  `apps/web/lib/businesses/art.tsx` (burger art), `apps/web/app/fonts.ts` (Bowlby One), `apps/web/app/globals.css`
  (`[data-site="snacky_shack"]` blocks), `tools/worldgen/src/run.ts` (`DEMO_WORLDS`), `tools/worldgen/src/cli.ts` (a
  comment), `apps/web/tests/businesses.test.ts` (its cases).
A public export without the Shack needs those hunks removed, not just the four files.

**How to commit (read first).** Several files carry both P4 and P5 hunks (listed under "Shared" at the end of P5). They
cannot be split by file. Commit **P4** = its own files + the shared files + `apps/web/lib/businesses/snacky_shack.ts`
(the shared `lib/businesses/index.ts` imports it statically, so the web does not build without it); then **P5** = the
rest of P5's files. Or commit both as one. `.screenshots/` is git-ignored (`.gitignore:10`), so the screenshots are
evidence on disk, not commit content.

## P4 — A synthetic Indian business: Kosambari Kitchens (synthetic), a South Indian cloud kitchen in Bengaluru

**State: done**, with one dependency on lane A for the live Ask (exactly what is below).

### Files (commit these for P4; repo-relative)

Created:
- tools/worldgen/src/worlds/blr_kitchen.ts
- tools/worldgen/answer-key/demo/blr_kitchen.json
- tools/worldgen/test/blr_kitchen.test.ts
- apps/web/lib/businesses/index.ts (shared)
- apps/web/lib/businesses/cobnut.ts (shared: P5 adds `country`)
- apps/web/lib/businesses/blr_kitchen.ts (shared: P5 adds `country`)
- apps/web/lib/businesses/art.tsx (shared)
- apps/web/tests/businesses.test.ts (shared: P5 adds its cases)

Edited:
- tools/worldgen/src/run.ts (shared)
- tools/worldgen/src/cli.ts (shared)
- tools/worldgen/verify/run.ts
- scripts/dev/local-operator.ts
- apps/web/lib/site.ts (shared)
- apps/web/lib/munim/page-theme.ts
- apps/web/components/storefront-theme.tsx
- apps/web/app/layout.tsx
- apps/web/app/fonts.ts (shared)
- apps/web/app/globals.css (shared)
- apps/web/app/(shop)/story/page.tsx
- apps/web/components/pages/home.tsx
- apps/web/components/pages/menu.tsx
- apps/web/components/pages/checkout.tsx (shared)
- apps/web/components/art.tsx (shared) — **outside the brief's listed territory, owned by no lane** (git-clean before I touched it):
  the header wordmark, hero art and category motifs live here; each export now hands over to the business's own art
  (a short `if (OWN)` branch each); Cobnut's drawing code is untouched.
- apps/web/components/chrome.tsx — **outside the listed territory, owned by no lane** (git-clean before): the footer's
  name and line now come from the profile; Cobnut's text and text nodes are identical.

Not mine (other lanes' work in the same tree, do not attribute to C): apps/web/components/staff/**, apps/web/app/staff/**,
apps/web/lib/munim/{drafts,refs,template-words,models}.ts, apps/web/tests/{chips,models}.test.ts, apps/web/tests/ev-p3-shots.ts,
scripts/dev/nemotron-roles.ts, db/migrations/0036_*, docs/plan/lanes/B.report.md, apps/web/AGENTS.md (written by next dev).
No new dependency (no package.json / lockfile change).

### What was built

- **World `blr_kitchen`** (IN pack, Asia/Kolkata, INR, kind cloud_kitchen): "Kosambari Kitchens (synthetic)", three kitchens
  (Indiranagar, HSR Layout, Whitefield; synthetic addresses, pattern-valid synthetic GSTIN/FSSAI, current FSSAI licences),
  the four demo people with the picker's keys (owner Shalini Rao, manager Manjunath Hegde over HSR + Whitefield, counter
  Divya Shetty and kitchen Prakash Nayak at Indiranagar) plus four rostered staff, 15 dishes in 6 categories (dosas, idli
  and vada, rice and bath, tiffin boxes, sweets, coffee and drinks) with a variant item (Mysore Pak boxes) and an
  option-group combo (Tiffin Box), recipes over 14 ingredients, three simulated suppliers with price lists, a morning-tiffin
  deal, two coupons, six months of dated history (bills, waste, Swiggy/Zomato statements, rent) through the approved
  import path, delivery-heavy (Swiggy 40, Zomato 36, own site 14, pickup 10), today's live orders and KDS tickets,
  pickup windows, storefront key and guest orders, a purchases budget and an AI budget (three months, operator-approved).
- **Planted situations** (hand-kept key `answer-key/demo/blr_kitchen.json`, apart from the four evaluation keys so their
  coverage gate is unchanged): BK-F3 Swiggy takes 30% against a contracted 22% on 18 Indiranagar orders (₹483.84);
  BK-F1 Zomato bills ads at HSR Layout that were never opted in (₹550); BK-I1 urad dal creeps from ₹125 to ₹145/kg (+16%,
  ₹3,000); BK-P1 Whitefield's cook clocks out an hour late on 18 of 26 shifts (₹3,240).
- **Its own UI** (one web, many businesses): `apps/web/lib/businesses/` holds a profile per business (name, short, tagline,
  locale, category order and labels, deal labels, diet words, note fields, built-in storefront page, wordmark, meta,
  footer, story). `NEXT_PUBLIC_MUNIM_SITE` picks it (the value `restart-svc.sh` already exports = the world name; unset =
  cobnut). `SITE` keeps its exact shape and fields, so every importer (lane B's included) compiles unchanged.
  Kosambari wears banana-leaf green / turmeric / steel (`#2d6a2e` / `#8f5b00` / `#f7dc8f`, judged by core's contrast rule
  on publish), Baloo Tamma 2 as its display face (preload off, so Cobnut never fetches it), a hand-drawn dosa-on-banana-
  leaf hero and steel-tumbler mark, its own category motifs, story page, footer and wording ("Pick your kitchen",
  "Change kitchen"). The seed **publishes the same page through the T-128 mechanism** (save + publish as the owner,
  before onboarding completes, since publish is demo-protected afterwards); the built-in page equals it, so the shop
  never changes look when the published page answers. Page background and ink stay locked (core judges against them).
- **Cobnut unchanged**: with `NEXT_PUBLIC_MUNIM_SITE` unset, `SITE`, `BUILT_IN`, the diet words, labels, metadata and
  `<html>` attributes are Cobnut's exact values (no `data-site` attribute; template strings keep single text nodes so the
  rendered HTML has no extra comment markers). Not byte-identical in one place: the root layout's CSS now also declares
  Baloo Tamma 2's @font-face (unused and never preloaded on Cobnut).
- **Tooling**: `run.ts` gains `DEMO_WORLDS` (`cobnut`, `blr_kitchen`; P5 adds `snacky_shack`); `cli.ts` treats every demo world as cobnut was
  treated (fresh seed per run, writes `storefront-key` / `site.env` / `demo-tokens.json` under `<run>/<world>/`, prints the
  seed and planted ids and a verify line, reports live-AI readiness instead of pricing roles); cobnut's output is unchanged.
  `verify/run.ts` finds a demo world's key in `answer-key/demo/` and takes `--seed=` (a demo world reseeds with a fresh
  seed). `local-operator.ts` takes `--world=<w>` (default cobnut) and refuses a database not on 127.0.0.1.
  The new world never calls `aiRolePrices` (never writes `platform.model_role`); it only reads readiness.

### Gates and results

- `node --test test/blr_kitchen.test.ts` (embedded Postgres 18, intel stub, no .env; seeded with the key's seed at
  as-of 2026-10-10, 60 days): `# tests 6 / # pass 6 / # fail 0`, exit 0, 43 s. Covers: tenant/outlets/people/demo flag,
  suppliers all simulated, AI budget rows; planted == key and every entry recomputes from the read routes
  (verify/recompute.ts); the published storefront page = the hand-typed theme and = apps/web's built-in page for this
  business, published by the owner; 15 menu items, variants, Whitefield's sold-out dosa; **no `model_role` config draft
  written** and readiness reported role by role; plan-mode request log identical in UTC, Asia/Kolkata,
  America/Los_Angeles and Australia/Melbourne.
- **Red-proofs**: (1) in-test: a key one paisa off fails exactly `BK-F3` (48385 vs 48384); (2) process exit: with
  `BK-I1` damaged to 300001 in the key file the run printed `# pass 4 / # fail 2` and **exit 1**
  (`BK-I1: key 300001 but recomputed 300000`), file restored byte-identical (cmp); (3) changing apps/web's Kosambari
  badge by one word makes the gate fail: `not ok 4 … the published page differs from apps/web's built-in page for this
  business`, `# pass 5 / # fail 1`, **exit 1**; profile restored (cmp). Re-run green after: `# tests 6 / # pass 6`.
- **Full worldgen suite** `node --test "test/*.test.ts"` (= `pnpm --filter worldgen test`), final run with both new
  worlds: `# tests 97 / # pass 96 / # fail 1` — the one failure is the known R67 `test/cobnut.test.ts:174:3`
  (`7 !== 6`), pre-existing. (`ok 1 - blr_kitchen`, `ok 12 - snacky_shack`, `ok 14 - worlds`, `ok 8 - determinism`,
  `ok 7 - answer-key coverage`, `ok 3 - cli: worlds and messages`.)
- `tools/worldgen` typecheck (`tsc -p .`): exit 0. `apps/web` typecheck (`tsc --noEmit`): exit 0, 0 errors (with lane B's
  in-progress files present). `apps/web` eslint on every web file I touched: exit 0.
- `apps/web` vitest, **whole suite** (lane B's in-progress tests included): `Test Files 13 passed (13)`, `Tests 151 passed
  (151)`. (t128 + storefront alone: 47 passed — Cobnut's page-theme and storefront behaviour unchanged.)
- **Cobnut on :3000 (lane B's server, running this tree; read only, not restarted)**: `HTTP 200`,
  `<html lang="en-IN" class="fraunces_… inter_…">` with no `data-site`, `<title>Cobnut Bakehouse — order ahead, pick up
  warm (sample shop)</title>`, `Cobnut <span class="italic text-secondary max-sm:hidden">Bakehouse</span>` (wordmark) and
  `Cobnut <span class="italic text-secondary">Bakehouse</span>` (hero), 0 mentions of the new faces.
- Boundaries: `depcruise --config .dependency-cruiser.cjs apps tools` → `no dependency violations found (758 modules,
  2354 dependencies cruised)` (final tree).
  (An earlier version of businesses.test.ts imported core-domain/worldgen from apps/web, which the rule forbids; that
  check moved to the worldgen side.)

### Live, on the shared local stack (local DB confirmed: `local-db host: 127.0.0.1`; core-api `/health` idp `local`)

- `node scripts/dev/local-operator.ts --world=blr_kitchen` → `local-operator: added: worldgen-blr_kitchen-operator`.
- `MUNIM_SEED_OPERATOR=1 MUNIM_RUN_DIR=.run/local make seed WORLD=blr_kitchen` → `worldgen: blr_kitchen seeded (956 writes,
  as_of=2026-10-23, days=183); tenant d70a52ad-31d7-750d-a74d-29cef3788f53`, `seed blr_kitchen-mvlhg0tk; planted 4: BK-F1
  BK-F3 BK-I1 BK-P1`, `live AI: ready`, `seed exit 0`. Site files written to `.run/local/blr_kitchen/` (never printed).
- Live verify of the seeded tenant: `verify/run.ts --world=blr_kitchen --as-of=2026-10-23 --days=183
  --seed=blr_kitchen-mvlhg0tk` → `PASS BK-F1 55000`, `PASS BK-F3 48384`, `PASS BK-I1 300000`, `PASS BK-P1 324000`,
  `verify: 4/4 entries recomputed to the key`, exit 0.
- **Cited answers from its own books, all four plants**: after the 03:15 watcher run the tenant's findings include
  `reconciliation_break.short_payout` 48384, `reconciliation_break.unapproved_ad_fee` 55000, `purchasing.price_creep`
  300000 and `people.overtime_drift` 324000 — every impact a resolved snapshot ref equal to the key (plus unplanted
  `people.labour_pct_high` ×4 and `catalogue.recipe_waste_gap` ×5, the kind Cobnut also carries).
- Storefront on **:3001** in its own theme, screenshots (git-ignored, on disk):
  `.screenshots/EV-P4/home-phone.png`, `home-desktop.png`, `menu-phone.png`, `menu-desktop.png`, `story-phone.png`,
  `story-desktop.png`, plus `staff-owner-home-desktop.png`; console errors 0 (taken after the published page's badge
  and the outlet cards rendered). The orange "N 1 Insight" pill in them is Next's dev overlay (dev server only).

### Open issues

1. **Ask Munim on this tenant abstains — needs lane A.** intel has run in `model mode recorded` since 01:25:01 (first line
   of `.run/intel.log`; `restart-svc.sh intel` sets no `MUNIM_MODEL_MODE`, and intel defaults to recorded). Every
   unrecorded question fails `RecordedFixtureMissing` and the stored answer is `abstained: true, reason_code: missing_ref`
   (my ask: "How were sales across my three kitchens last week?", HTTP 200 in 68 ms, run 01a16ab5-a2b8-…). The tenant is
   ready for live AI (seed: `live AI: ready` — INR prices on router/reason/narrate/extract and an AI budget row for Oct–Dec).
   Lane A: restart intel with `MUNIM_MODEL_MODE=live`; then the Ask can be retried unchanged on :3001. Re-checked at
   the end of my run: `.run/intel.log` still has one "model mode" line, `model mode recorded` (01:25:01), so I did not
   retry. A good first question: "Why was my Swiggy payout at Indiranagar short?" (BK-F3; pass only with non-empty
   `resolved_refs` and a Nemotron id in the run's trace).
2. *Resolved by the orchestrator mid-run*: `restart-svc.sh web` used an absolute API URL and the browser was refused by
   CORS (storefront calls failed here too: preflight → 404, `blocked by CORS policy`). Before the fix I ran :3001/:3002
   from a scratch copy of that branch with `NEXT_PUBLIC_MUNIM_API=/api MUNIM_API_ORIGIN=…` (same pid file); the
   screenshots above were taken that way. After the fix I restarted both with `scripts/dev/restart-svc.sh web blr_kitchen
   3001` and `… snacky_shack 3002` (both `GET / -> 200`), and **staff demo sign-in works on :3001**: owner → `/staff/home`
   as "Shalini Rao", outlets "Kosambari Indiranagar / HSR Layout / Whitefield", no "Cobnut" in the page text, 0 console
   errors (`.screenshots/EV-P4/staff-owner-home-desktop.png`).
3. Turbopack dev did not pick up a `globals.css` edit until the :3001 server restarted (TSX edits hot-reloaded).
4. Staff side shows Cobnut words in lane B's files: the demo picker's names (`lib/munim/session.ts` DEMO_PEOPLE; replaced
   by `/v1/me` names after sign-in) and the aria-labels "Cobnut Bakehouse staff, home" (`components/staff/shell.tsx`,
   `sign-in.tsx`). The storefront builder's preset list still offers "Cobnut original" first (PRESETS unchanged on purpose).
5. **42 stale `inventory.dead_stock` findings on the Kosambari tenant.** The 03:00 IST watcher run (every 15 min) fired
   while the seed was still importing history: opening stock was in, the history's consumption was not. The same
   snapshot now returns 0 rows (`POST /v1/snapshots inventory.dead_stock {days: 60, as_of: 2026-10-23}` → `rows 0`),
   but findings do not auto-close (dedupe per month), so the inbox carries 42 of them. I did not dismiss them (42 owner
   commands on a shared tenant; your call). Options: dismiss them as the owner (`POST /v1/findings/{id}:dismiss`), or
   reseed starting just after a quarter-hour (the seed takes ~6 min) — a reseed is a second tenant for the same owner
   sign-in, which `verify/run.ts` then refuses (it wants exactly one; `MUNIM_SEED_SUB_TAG` avoids that). Cobnut has the
   same exposure; The Snacky Shack's seed finished between runs.

### Guarantee scan (both clauses)

- *Nothing changes the books without a named person's approval*: every write the world makes is a named demo person's own
  command or an operator-approved platform draft (AI budget), through core-api's `/v1` and `/platform/v1` only (gate d: no
  SQL in worldgen src); history enters as import runs the owner approves; the storefront page is the owner's own save and
  publish. The seed writes no `platform.model_role` row (asserted: 0 `model_role:%` drafts). The web changes are
  presentation only (no write path added). Clean.
- *Every number shown traces to a ledger row*: no figure is typed into the UI; menu prices, totals and tax come from the
  API; the new copy carries no free digits other than labels ("three kitchens", "Box of 4"/"Box of 8" as variant names
  from the API). The findings above render numbers only from resolved snapshot refs. Clean.

## P5 — The Snacky Shack (real menu, synthetic history), Geelong, AU pack

**State: done.** (No Ask in P5's done-when; live AI on this tenant is "not ready: no AUD price", reported as expected.)

### Files (P5; repo-relative)

Created:
- tools/worldgen/src/worlds/snacky_shack.ts
- tools/worldgen/answer-key/demo/snacky_shack.json
- tools/worldgen/test/snacky_shack.test.ts
- apps/web/lib/businesses/snacky_shack.ts (commit with P4: the shared index.ts imports it)

Shared with P4 (final state carries both; see "How to commit"): tools/worldgen/src/run.ts (`DEMO_WORLDS` gains
`snacky_shack`), tools/worldgen/src/cli.ts (comment), apps/web/lib/businesses/index.ts (`country` field, registry),
apps/web/lib/businesses/cobnut.ts and blr_kitchen.ts (`country: "IN"`), apps/web/lib/businesses/art.tsx (burger mark,
smash-burger hero, motifs), apps/web/app/fonts.ts (Bowlby One, preload off), apps/web/app/globals.css (Snacky tokens,
heading weight, underline), apps/web/lib/site.ts (`PHONE_PREFIX`, `toE164` reads AU mobiles for an AU business; India's
function unchanged), apps/web/components/pages/checkout.tsx (the number prefix from the business: `+61` here),
apps/web/tests/businesses.test.ts (Snacky profile + AU phone cases).

### What was built

- **Source discipline.** From `/Users/satviksawhney/Downloads/projects_26/the-snacky-shack` I read only
  `prisma/schema.prisma` lines 55–104 (MenuCategory, MenuItem, OptionType, ItemOptionGroup, ItemOption) and
  `prisma/seed.js` lines 1–303 (option-group helpers and the `CATEGORIES` menu array). Before that I located
  personal-data lines by line number only (`grep -c`/`cut -c1-12`: lines 311–312, inside `main()`), and never read
  `main()`, the User/Order/Offer/Deal/Review/ShopSettings models, or any other file. Nothing personal was copied, even to
  scratch. The menu was transcribed by hand as data (names, descriptions, prices, option groups); no code was taken.
  CLAUDE.md hard rule 4 names that repo "ideas only"; EV-4 (founder, 24 Oct) is the override that allows its menu.
- **World `snacky_shack`** (AU pack: Australia/Melbourne, AUD, GST inside the price; kind restaurant):
  "The Snacky Shack (real menu, synthetic history)", one shop "The Snacky Shack Geelong" at a synthetic address with a
  pattern-valid synthetic ABN; the four demo people, all "(synthetic)" (Sam Carter owner, Priya Nair manager, Jack Wilson
  counter, Mei Chen kitchen); the **real menu: 53 items in 11 categories** with its add-ons, required and optional single
  choices and three sizes (prices in cents, GST inside); invented recipes over 17 ingredients, two simulated suppliers,
  six months of synthetic history (≈38–60 bills a day across counter, own site, Uber Eats, DoorDash; statements, rent),
  a cook and a counter hand rostered across the October change, today's orders and KDS tickets, storefront key and guest
  orders, purchases budget, AI budget rows (AUD). **No diet is recorded on any item** (nothing claimed about a real
  shop's food). Planted: SS-F3 DoorDash takes 30% against 25% on 15 orders (A$37.50); SS-I1 beef patties creep from
  A$1.40 to A$1.65 (A$300).
- **Its own theme — smash burgers, loud and warm**: ketchup red / toasted bun / melted cheese (`#c62f12` / `#8a3a00` /
  `#ffcf3f`, judged by core), radius soft, Bowlby One display face, a hand-drawn smash-burger-and-fries hero, burger mark,
  motifs per category, published through the T-128 page mechanism by the owner and equal to the web's built-in page.
  Every page says "real menu, synthetic history" (badge, title, footer, story).

### Gates and results

- `node --test test/snacky_shack.test.ts` (embedded PG, as-of 2026-10-10, 60 days): `# tests 7 / # pass 7 / # fail 0`,
  exit 0. Covers: AU tenant (AUD, AU, Melbourne), four "(synthetic)" members, simulated suppliers, AUD AI budget rows;
  planted == key + recompute; **AU golden on the tenant**: DD-SS-SH bills total 5000 with tax 455 (5,000 × 10/110 =
  454.5 → 455, half up) and, rung at 18:40 Melbourne, land at **08:40 UTC on 3 Oct (AEST) and 07:40 UTC from 4 Oct (AEDT)**
  — hand-typed rows; every history bill's business date equals its Melbourne date; **PII scan** of every text/json
  column of every core table with a tenant_id (≥100 columns) for emails, phones and unmarked names: 0 findings, with
  the predicate red-proven first on known values (flags `someone@gmail.com`, `0412 345 678`, `+61 3 5222 0000`, an
  unmarked name; passes the synthetic ones, dates, ABN); storefront page = PAGE = web built-in page; 53 items, 11
  categories, spot prices, the Fries size group, no diet; no `model_role` draft written and readiness reports
  `model_role <role> has no AUD price` ×4; plan log identical in four zones at 183 days (both DST changes).
- **Red-proofs**: in-test, a key one cent off fails exactly `SS-I1` (30001 vs 30000); process exit: `SS-F3` damaged to
  3751 → `# pass 6 / # fail 1`, **exit 1** (`SS-F3: key 3751 but recomputed 3750`), key restored (cmp).
- **AU golden-receipt and DST gates** (verification-gate table): `packages/core-domain` `vitest run test/packs.test.ts
  test/tz.test.ts` → `Test Files 2 passed, Tests 27 passed` (receipt-AU.txt byte-equal, AU tax totals by channel, the
  Melbourne DST suite for 2026-04-05 and 2026-10-04 with the Kolkata control).
- apps/web: `vitest run tests/businesses.test.ts tests/storefront.test.ts tests/t128.test.ts` → `Tests 53 passed`
  (includes AU mobile parsing: `0412 345 678`, `412345678`, `+61 412 345 678`, `61412345678` → `+61412345678`; landline,
  Indian and short numbers → null; Cobnut still `+91`). `tsc --noEmit` exit 0; eslint on touched files exit 0.
  Boundaries `depcruise … apps tools` → `no dependency violations found (758 modules)`.

### Live, on the shared local stack

- `local-db host: 127.0.0.1`; `local-operator: added: worldgen-snacky_shack-operator`.
- `MUNIM_SEED_OPERATOR=1 MUNIM_RUN_DIR=.run/local make seed WORLD=snacky_shack` → `worldgen: snacky_shack seeded (766
  writes, as_of=2026-10-24, days=183); tenant edfb68a3-cd51-7d04-97d4-7e1eb63d061c`, `seed snacky_shack-mvli64c3;
  planted 2: SS-F3 SS-I1`, `live AI: not ready (AI declines and rules still run): model_role router has no AUD price; …
  reason …; narrate …; extract …` (expected: `platform.model_role` is lane A's and priced in INR), `seed exit 0`.
- Live verify: `PASS SS-F3 3750`, `PASS SS-I1 30000`, `verify: 2/2 entries recomputed to the key`, exit 0.
- **Live PII scan** of the seeded tenant on the local DB (read-only session, same predicate; phone allow-list exactly the
  series worldgen mints for this world, `^\+61400[12]\d{5}$`): `397 columns, 109715 distinct values, 32 person names,
  4 emails, 26 phones; findings 0`, exit 0. Red-proof of the live scan: the same scan on the Cobnut tenant (its people
  are invented but not marked "(synthetic)", its phones are outside this allow-list) → `findings 37`, exit 1. The test
  re-ran green with the tightened allow-list: `# tests 7 / # pass 7 / # fail 0`.
- Storefront on **:3002** in its own theme (same-origin run, see P4 open issue 2), screenshots (git-ignored, on disk):
  `.screenshots/EV-P5/home-phone.png`, `home-desktop.png`, `menu-phone.png`, `menu-desktop.png`, `story-phone.png`,
  `story-desktop.png`; console errors 0.

### Open issues (P5)

1. **Live AI on this tenant**: every live role lacks an AUD price (`platform.model_role` is platform-wide, one price
   currency, lane A's). Not fixed by design (repricing would break Cobnut's INR AI). Needs a decision: per-currency
   prices on model roles, or an AUD row set — lane A / founder.
2. Our page copy (tagline "Smashed hot on the plate, stacked high, and ready when you get here.", card and story text)
   is written by us, around the shop's real menu; the owner should see it before anything goes public.
3. :3002 now runs from the fixed `restart-svc.sh` (see P4 open issue 2).
4. "Water" is priced with GST like everything else (`gst_10`); bottled water may be GST-free in Australia — not modelled.

### Guarantee scan (both clauses)

- *Books*: every write is a demo person's own command or an operator-approved draft through core-api; history via
  owner-approved imports; the page via the owner's save + publish; **no `model_role` write** (asserted 0 drafts).
  The checkout change only formats the shopper's own number (E.164) before the existing order command. Clean.
- *Numbers trace*: prices, GST and totals come from the API (the GST/DST assertions read core's own order rows); no
  figure is typed into the UI. Clean.

## Left running (stop by PID only)

- :3001 Kosambari — `.run/web-blr_kitchen.pid`, log `.run/web-blr_kitchen.log`, build dir `apps/web/.next-blr_kitchen`.
- :3002 The Snacky Shack — `.run/web-snacky_shack.pid`, log `.run/web-snacky_shack.log`, build dir `apps/web/.next-snacky_shack`.
- Both started by `scripts/dev/restart-svc.sh web <world> <port>`; demo sign-in tokens last about an hour from the last
  mint (`scripts/dev/restart-svc.sh tokens <world>` re-mints). `apps/web/tsconfig.json` is unmodified (checked after
  every start). :3000 was never touched.

## Founder to-dos (from this lane)

1. **The Snacky Shack owner's written consent** before anything of it leaves this repo (menu, name, our page copy). It
   is local-only tonight; nothing was deployed or pushed by me.
2. Decide AUD pricing for the model roles (or per-currency prices) if The Snacky Shack should run live AI.
3. Optionally clear Kosambari's 42 stale dead-stock findings (P4 open issue 5).
4. Next.js 16.4.0's security-upgrade notice appeared on every other `next dev` start on :3001/:3002 (each re-run
   continued, as COMMON.md says); I did not run the upgrade.

## Fix cycle 1 (review findings F1, m1, m2, m4)

**State: done, with one open item for the orchestrator: :3000 is down.** My `apps/web/next.config.ts` edit made :3000's
`next dev` restart itself (`⚠ Found a change in next.config.ts. Restarting the server…`, `.run/web.log`), and the restart stopped
at Next's security-upgrade notice (`This command stopped to show the upgrade recommendation`); its pid is gone and nothing listens
on :3000. I did not restart it (brief: never touch :3000). **Bring it back with `scripts/dev/restart-svc.sh web`** (run it a second
time if the notice stops it again). Any edit to `next.config.ts` restarts every `next dev` on this tree.

### Files (repo-relative; the orchestrator commits exactly these)

Created:
- apps/web/lib/businesses/types.ts
- apps/web/lib/businesses/current.ts
- apps/web/lib/businesses/fonts.ts
- apps/web/lib/businesses/cobnut/index.ts
- apps/web/lib/businesses/cobnut/profile.ts
- apps/web/lib/businesses/cobnut/art.tsx
- apps/web/lib/businesses/cobnut/fonts.ts
- apps/web/lib/businesses/blr_kitchen/index.ts
- apps/web/lib/businesses/blr_kitchen/profile.ts
- apps/web/lib/businesses/blr_kitchen/art.tsx
- apps/web/lib/businesses/blr_kitchen/fonts.ts
- apps/web/lib/businesses/blr_kitchen/theme.css
- apps/web/lib/businesses/snacky_shack/index.ts
- apps/web/lib/businesses/snacky_shack/profile.ts
- apps/web/lib/businesses/snacky_shack/art.tsx
- apps/web/lib/businesses/snacky_shack/fonts.ts
- apps/web/lib/businesses/snacky_shack/theme.css
- apps/web/scripts/bundle-isolation.sh
- apps/web/tests/business-au.test.ts

Edited:
- apps/web/lib/businesses/index.ts
- apps/web/lib/site.ts
- apps/web/next.config.ts
- apps/web/app/fonts.ts
- apps/web/app/globals.css
- apps/web/app/layout.tsx
- apps/web/app/(shop)/story/page.tsx
- apps/web/components/art.tsx
- apps/web/components/chrome.tsx
- apps/web/components/pages/checkout.tsx
- apps/web/components/pages/tracker.tsx
- apps/web/tests/businesses.test.ts
- tools/worldgen/test/blr_kitchen.test.ts
- tools/worldgen/test/snacky_shack.test.ts

Deleted (plain `rm`, not staged; stage each deletion by name):
- apps/web/lib/businesses/art.tsx
- apps/web/lib/businesses/cobnut.ts
- apps/web/lib/businesses/blr_kitchen.ts
- apps/web/lib/businesses/snacky_shack.ts

Moves, for the reader: `lib/businesses/<id>.ts` → `lib/businesses/<id>/profile.ts` (plus `tz` and `dataWords`); the two other
businesses' drawings in `lib/businesses/art.tsx` → `lib/businesses/{blr_kitchen,snacky_shack}/art.tsx`; Cobnut's drawings in
`components/art.tsx` → `lib/businesses/cobnut/art.tsx` (SVG unchanged); the `html[data-site=…]` blocks in `app/globals.css` →
`lib/businesses/{blr_kitchen,snacky_shack}/theme.css`. `app/globals.css` is now byte-identical to its pre-lane-C version
(`b0779d7~1`). Baloo Tamma 2 and Bowlby One no longer need `preload: false`: each face is now only in its own business's build.
Not mine in the tree: apps/web/AGENTS.md (written by next dev). No dependency added (no package.json or lockfile change).
`apps/web/tsconfig.json` and `vitest.config.ts` are unchanged. Restarting :3001 and :3002 rewrote tsconfig.json; I restored it
from my copy and it now equals HEAD.

### How a build gets one business (F1)

- `lib/businesses/current.ts` (`export * from "./cobnut"`) and `lib/businesses/fonts.ts` (`export * from "./cobnut/fonts"`) stand
  for "this build's business". `next.config.ts` reads `NEXT_PUBLIC_MUNIM_SITE`: unset or empty means cobnut; otherwise it must
  match `^[a-z_]+$` and `lib/businesses/<id>/index.ts` must exist, or the build throws. It sets `turbopack.resolveAlias`
  `"@/lib/businesses/current"` → `./lib/businesses/<id>/index.ts` and `"@/lib/businesses/fonts"` → `./lib/businesses/<id>/fonts.ts`.
  - Probed first in an isolated copy: a `resolveAlias` key wins over the tsconfig `@/*` path.
  - tsc, vitest, eslint and dependency-cruiser read the two files as written (Cobnut, the typed default), so no tsconfig, vitest or
    `tsconfig.depcruise.json` change was needed. A bare `@business/*` specifier would have failed depcruise's
    `no-unresolvable-imports`.
- Who imports the two aliased specifiers:
  - `"@/lib/businesses/current"`: only `lib/businesses/index.ts`, which re-exports `BUSINESS` and `ART` and keeps `SITE_ATTR`.
  - `"@/lib/businesses/fonts"`: only `app/fonts.ts`.
- What each business directory holds:
  - `profile.ts`: pure data; worldgen's tests load it by path under node.
  - `art.tsx`: `ART: { Mark, Hero, motif }`.
  - `index.ts`: re-exports `BUSINESS` and `ART`.
  - `fonts.ts`: its own `next/font` call, plus `import "./theme.css"` for the two non-Cobnut businesses.
- `fonts.ts` stays out of `index.ts` because `next/font` only runs inside Next's compiler, and the unit tests load the page modules.
- `components/art.tsx` keeps its four exports (`HeroArt`, `Hazelnut`, `CategoryMotif`, `Wordmark`), now drawing through `ART`. Shared
  files no longer name either of the other businesses, even in comments: server `.js.map` files carry `sourcesContent`.

### Gates and results (this tree)

- `pnpm --filter web test`: `Test Files  14 passed (14)` / `Tests  175 passed (175)`.
- `pnpm --filter web typecheck`: `tsc --noEmit`, exit 0.
- `pnpm --filter web lint`: `✖ 1 problem (0 errors, 1 warning)`, exit 0. The warning is `tests/traces.test.ts:62`, not mine.
- `apps/web/scripts/bundle-isolation.sh` (38 s, exit 0). It deleted the dist dirs on exit and put tsconfig.json and next-env.d.ts back:
  ```
  cobnut: 887 files scanned (cache/ excluded): 0 hits of /snacky|shack|kosambari|bowlby|baloo/i; own name "Cobnut" 307; home title 1; 13 font files
  blr_kitchen: 885 files scanned (cache/ excluded): 0 hits of /snacky|shack|bowlby/i; own name "Kosambari" 199; home title 1; 11 font files
  snacky_shack: 882 files scanned (cache/ excluded): 0 hits of /kosambari|baloo/i; own name "Snacky" 300; home title 1; 8 font files
  bundle-isolation: PASS (cobnut blr_kitchen snacky_shack)
  ```
  - What it does: a production `next build` per business into a fresh `apps/web/.next-build-<id>` (Cobnut with the variable
    unset, as munim-cobnut builds it). It retries once only on Next's `SecurityFatalError` notice.
  - What it scans: everything the build wrote except `cache/`, which holds Turbopack's cache and tsc's `.tsbuildinfo`; that file
    lists every project file and is never served or deployed.
  - What else it requires: that build's own `<title>` in `server/app/index.html`, at least one hit of its own name, and at least
    100 files.
  - Exit codes: 1 on any leak or missing positive, 2 on a failed build or unknown argument.
- **Before the fix**, Cobnut's build from the b0779d7 tree had 447 hits of `/snacky|shack|kosambari|bowlby|baloo/i` outside
  `cache/` (server/ 388, static/ 59), with 18 font files.
- **Red-proof**, run in an isolated in-repo copy (`scratchpad/evc-web`, deleted since) so the running dev servers never saw the plant.
  - The plant: put back a used static import in `lib/businesses/index.ts` (`import { SNACKY_SHACK } from "./snacky_shack/profile"`,
    a `const ALL = { snacky_shack: SNACKY_SHACK }` record, and `SITE_ATTR` reading `ALL[BUSINESS.id]`).
  - The result: `cobnut: 887 files scanned (cache/ excluded): 216 hits …`, then `FAIL: the cobnut build carries another business,
    in:` with 7 files, including the client chunk `static/chunks/2x9sj02xiwy_d.js`, and `bundle-isolation: FAIL`, **exit 1**.
  - Then the file was restored (`cmp`: byte-identical). The copy's files were `cmp`-equal to this tree's before it was deleted.
- **Unknown site fails the build**: `NEXT_PUBLIC_MUNIM_SITE=nope` gives exit 1, `NEXT_PUBLIC_MUNIM_SITE=nope names no business (known:
  blr_kitchen, cobnut, snacky_shack)`. `../cobnut` gives the same, exit 1.
- **Cobnut's output is unchanged**: a production build before (b0779d7 tree) and after.
  - **20/20 prerendered HTML pages** are identical once `<script>` tags and hashed `/_next/static` names are removed. The `<html>`
    tag is byte-identical, font classes included: `<html lang="en-IN" class="BjCqPq_variable iBXOgW_variable">`.
  - **79/80 RSC payloads** are identical once chunk-loader tags, client-module rows and row ids are removed. The 80th (the home
    page's segment) lists one fewer client-module ref.
  - The only differences are chunking: one fewer `<script src>` (12 → 11 on `/`) and 5 fewer font files (18 → 13).
- worldgen, now loading the moved profiles: `node --test test/blr_kitchen.test.ts test/snacky_shack.test.ts` gives `# tests 13` /
  `# pass 13` / `# fail 0` (embedded PG). That run includes the published page == apps/web built-in page check for both.
  `tsc -p .` exit 0.
- Boundaries: `depcruise --config .dependency-cruiser.cjs apps tools` gives `no dependency violations found (789 modules, 2370
  dependencies cruised)`.
- **:3001 and :3002**: restarted with `scripts/dev/restart-svc.sh web blr_kitchen 3001` and `… snacky_shack 3002`. Each needed a
  second run after the security notice stopped it.
  - Both pages answered `200`.
  - :3001: `<html lang="en-IN" class="baloo_tamma_2_…variable inter_…variable" data-site="blr_kitchen">`, Kosambari's title.
  - :3002: `<html lang="en-AU" class="bowlby_one_…variable inter_…variable" data-site="snacky_shack">`, the Shack's title.
  - Screenshots, with 0 console errors on each. Headings set in "Baloo Tamma 2" with `.btn-primary` rgb(45, 106, 46) on :3001, and
    "Bowlby One" with rgb(198, 47, 18) on :3002:
    `.screenshots/EV-P4/home-desktop-fix1.png`, `.screenshots/EV-P4/story-phone-fix1.png`,
    `.screenshots/EV-P5/home-desktop-fix1.png`, `.screenshots/EV-P5/story-phone-fix1.png`.
- **:3000: FAILED, down** (see the top of this section). The last read-only check found nothing listening on :3000. Cobnut's
  unchanged output is shown by the production-build comparison above, not by :3000.

### m1, m2, m4

- **m1**: new profile field `dataWords { foot, staffBar, storyBadge }`. Cobnut's and Kosambari's are the exact old strings ("Demo:
  all data is synthetic.", "synthetic data", "all of this is synthetic"). The Shack's say "real menu, synthetic history".
  - Used in `components/chrome.tsx` (`DEMO_FOOT`, `DEMO_TOP_STAFF`, and the line-15 comment fixed) and in the story badge.
  - Live: :3002 `/story` shows `A sample shop · real menu, synthetic history` and `Demo: real menu, synthetic history. Payments are
    recorded, never processed.`; :3001 keeps `all of this is synthetic` and `Demo: all data is synthetic. …`.
  - Test: `businesses.test.ts` "only The Snacky Shack's menu is real …".
- **m2**: `lib/site.ts` now has one table per country (`MOBILE`: prefix, parser, error). It exports `PHONE_ERROR`; checkout uses it.
  - AU wording: "Enter a mobile number starting with 04, like 0412 345 678." India's is unchanged.
  - `toE164Au` also reads `+61 (0)4…` and `0061…`. India's parser is untouched.
  - New `tests/business-au.test.ts` swaps `@/lib/businesses/current` for the Shack's module (`vi.mock`, what the alias does in its
    build). It asserts `BUSINESS.id`, `PHONE_PREFIX === "+61"`, the error words, 8 accepted forms and 7 refused ones: 17 tests.
  - Red-proof: with `PHONE_PREFIX` pinned to India's and the `0061` rule removed, `Tests  3 failed | 14 passed (17)` (`expected '+91'
    to be '+61'`, both `0061` cases null) and process **exit 1**. Restored (`cmp`), back to 17 passed.
- **m4**: new profile field `tz` (Cobnut and Kosambari `Asia/Kolkata`, the Shack `Australia/Melbourne`). The tracker falls back to
  `BUSINESS.tz`.

### Not done / deferred

- **m5 (seeds, not reseeded tonight, as instructed)**: UPI tenders in Geelong (`tools/worldgen/src/worlds/snacky_shack.ts:308`,
  `tools/worldgen/src/history.ts:99`), and water priced with GST.
- **m6**: no gate yet proves the watchers find the AU plants.
- `components/staff/source.tsx:136` still says "Demo: all data is synthetic." on every business's staff screens, the Shack's
  included. That file is lane B's; it could read `BUSINESS.dataWords.foot`.
- A public export without the Shack is now mostly directory exclusions:
  - `apps/web/lib/businesses/snacky_shack/`.
  - `apps/web/tests/business-au.test.ts`.
  - The Shack's cases in `apps/web/tests/businesses.test.ts`.
  - The Shack's line in `apps/web/scripts/bundle-isolation.sh` (it names the Shack to forbid it).
  - The worldgen files listed at the top of this report.
- `lib/site.ts` keeps per-country mobile rules in apps/web. That predates this fix; the web may not import the country pack
  (boundary rule). CLAUDE.md rule 7, noted not changed.
- Next 16.4.0's security-upgrade notice stopped `next build` and `next dev` on alternate runs. I did not run the upgrade (founder's
  decision, COMMON.md).

### Guarantee scan (both clauses)

- *Nothing changes the books without a named person's approval*: the change is build-time module selection, presentation (labels,
  fallback time zone) and the shopper's own number formatting before the existing order command. No write path, command or
  draft was added or changed. Clean.
- *Every number shown traces to a ledger row*: no figure is typed into the UI. The new words carry no amounts. Times still render
  from the API's order rows in the outlet's zone; only the fallback zone, used before the menu answers, now comes from the profile.
  Clean.
