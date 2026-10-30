# W2 lane brief — read this before your ticket (10 Oct 2026)

Wave 2 builds the core modules on top of the closed, committed wave 1. Every W2 lane follows this brief plus its own
ticket row in `docs/plan/BOARD.md` (W2 table + "Riders routed from D-2"). Fix list history: `docs/plan/W1-FIX-LIST.md`.

## Read first (the code is the contract — read the source, not docs about it)
1. `CLAUDE.md` — One Guarantee, non-negotiables 1–20, gotchas 1–34.
2. `db/README.md`, `db/migrations/0001–0014` — tables, `core.command_authority` (command names, roles, scope,
   `target_tables`, `customer_target_tables`), `core.derivation_rule` (+ `source_state`), `core.book_scope`,
   `core.book_status_transition`, MB001–MB014. **Use the seeded command names**; if one is missing or wrong, report it
   (the migrator adds/renames it) — never invent a name that isn't seeded.
3. `docs/plan/packs/<your pack>.md` (D-1), `docs/plan/screens/*.md` + `flows/*.md` (D-2) — what the UI needs from you.
4. `docs/plan/00-decision-ledger.md` — esp. R15, R16, R21, R25–R30, R40–R43 — and `docs/DECISIONS.md` rulings since 9 Oct.
5. Wave-1 code you build on:
   - `services/core-api/src/app.ts`, `lib/db.ts` (`withContext`, `asSystem`), `lib/errors.ts` (`ApiError`, codes),
     `auth/resolve.ts` (`requireMember`, `requireCustomer`, `requireGuest`, `requireOperator`, `contextOf`).
   - `services/core-api/src/commit/**` — `executeCommand(ctx, command, {type, run})`, `replayHeaders`,
     `publishCommitted`. **Never set `app.command_type` yourself.**
   - `services/core-api/src/modules/approvals/**` — `registerDraftHandler({type, run})` for your draftable commands.
   - `packages/contracts` — module layout, `defineDraftable`, event schemas (an event type with no registered schema
     cannot be written), `MANIFEST.d/<module>.txt`, `pnpm -F @munim/contracts gen`.
   - `packages/core-domain` — money, tz/`businessDate`/`localDate`, packs (`orderTax`, `cashTender`, receipts),
     authority, consumption rules.
   - `db/src` — `startTestDb()`, `buildWorld()`, `ownerCtx`, `uuidv7` for fixtures.

## How a module is built
- **Territory:** `services/core-api/src/modules/<module>/**`, `packages/contracts/src/<module>/**`,
  `packages/contracts/MANIFEST.d/<module>.txt`, `services/core-api/test/<module>*.test.ts`, plus anything your ticket
  row names. The module registry already mounts your `index.ts` (export `router: Hono<AppEnv>`, full paths).
- **Writes:** every book write goes through `executeCommand` with a handler whose `type` is the seeded command and that
  writes only that command's `target_tables`. Status changes follow `book_status_transition`. Derived rows (stock
  movements, postings, loyalty earn, payables…) are written under `app.posting_rule` + `app.source_ref` of a seeded
  `derivation_rule` whose `source_state` holds — inside the same transaction.
- **Shoppers:** customer/guest routes use `requireCustomer` / `requireGuest`; `contextOf` gives them no outlet wildcard;
  core-owned bookkeeping writes inside a shopper request use `asSystem`. Never take `customer_id` or a channel from a
  payload — they come from the principal.
- **Draftables:** commands the AI may propose register with `defineDraftable` (contracts, your module) and
  `registerDraftHandler` (core-api, your module). Numeric proposal fields are Refs.
- **Events:** each event your module emits has a registered contracts schema (ids + categories only, never amounts);
  order/kitchen events carry `data.outlet_id` (stream `kds:` topics + run scope).
- **Numbers on screens:** a row's own fields trace as themselves; aggregates and dashboard numbers come from snapshot
  templates (W3/M-C adds templates — list the ones your screens need in your report).
- **Errors:** `ApiError` codes only; no SQL/driver/model text.
- **Schema needs:** you cannot edit `db/**`. Put exact table/column/command/rule requests in your report; the migrator
  batches them into the W2 fix cycle. Code against the documented shape meanwhile and say what is pending.

## Gates (every lane)
- vitest + embedded Postgres via `buildWorld`; expected values hand-written in fixtures (never derived from the code
  under test); each refusal paired with an accept; every new gate red-proven with a **non-zero process exit**.
- `make check` from the root — paste the per-target summary. Other lanes are live: report their failures, don't fix them.
- One Guarantee scan in your report (clause 1: every book write is a person's own command or an approved decision or a
  listed derivation; clause 2: every number shown is a row's own field or a snapshot cell).
- **No git. Never read `.env`.** Report: files by path, verification verbatim, red-proofs, what you did NOT do, requests.

## Cross-module seams (fixed names — the owner implements, callers import from the owner's `index.ts`)

All run inside the caller's transaction (`tx` = the role-scoped client already under `withContext`/`executeCommand`)
and write only what their seeded rule/command allows. If a seam you call has not landed yet, code against this
signature, test with a local fake, and report; T-034 (W2 integration) wires the real ones.

| Owner | Function | Purpose |
|---|---|---|
| T-021 catalogue | `priceLines(tx, {outlet_id, channel_kind, at, lines, coupon_codes?}) → {lines[{…, price_ref, option_refs, deal_refs, coupon_refs, unit_price_minor, line_discount_minor, tax_minor}], refusals[]}` | the one pricing function (preview, place, reprice) using core-domain `orderTax` |
| T-021 catalogue | `itemsForSale(tx, outlet_id, channel_kind)` | menu read for POS/storefront incl. availability |
| T-020 tenancy | `provisionTenant(tx, spec) → {tenant_id, outlet_ids, owner_member_id}` | used by `/v1/onboarding` (T-020) and `/platform/v1/tenants:provision` (T-031) |
| T-022 orders | `placeOrder(ctx, command) / previewOrder(ctx, request)` | used by T-032 storefront |
| T-024 inventory | `deriveOrderConsumption(tx, order_id)` (rules `inventory.consume_order` / `consume_sku`), `deriveGoodsReceipt(tx, grn_id)` (`inventory.receive_grn`), `pickSaleBatches(tx, outlet_id, lines) → {picks, refusals}` (FEFO, expiry, MRP binding) | called by T-022 and T-025 |
| T-026 finance | `postFor(tx, rule_id, source_ref)` | derived journal entries for every seeded posting rule; called by the module that owns the source row's lifecycle |
| T-028 customers | `loyaltyRedeem(tx, order_id, points)`, `loyaltyEarnFor(tx, order_id)`, `loyaltyReverseFor(tx, order_id)` | called by T-022 |
| T-035 accounts | `ensureProfile(ctx) → customer_id` | first sign-in profile, used by T-032 when a signed-in shopper checks out |
