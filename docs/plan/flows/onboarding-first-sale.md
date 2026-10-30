# Flow — sign-up to first sale (≤ 5 screens)

**Refs:** ledger R27, R30, R34 ("onboarding completes in minutes for one owner"); BOARD T-020, T-067
(Playwright counts routes, modals excluded); screens `onboarding-import.md` A, `pos.md` P1–P4.
**Target:** a new owner reaches a committed sale and printed receipt in 5 routes, no approvals on the path.

| # | Screen (route) | User does | API / command | User sees |
|---|---|---|---|---|
| 1 | ON1 `/onboarding/1` | enters email, "Send me a sign-in link"; opens the link | IdP port (Supabase Auth in dev; `idp-local` in gates) | "Check your email" → returns signed in |
| 2 | ON2 `/onboarding/2` | picks "Restaurant" (or "Shop"), types name, picks "India" | none — held client-side | "Country sets your currency, taxes and receipts. It can't be changed later." |
| 3 | ON3 `/onboarding/3` | outlet name, hours preset, FSSAI number; "Create my business" | one provisioning command (tenant + outlet + owner membership + pack defaults + POS device) — route not fixed — T-020; sets `onboarded_at` (country now fixed, R30) | "Setting up…" → step 4 |
| 4 | ON4 `/onboarding/4` | quick-adds "Masala dosa · {price}", "Filter coffee · {price}"; "Start selling" | per row `catalogue.item.upsert.v1` + `catalogue.price.set.v1` (owner's own commands, R27) — route not fixed — T-021 | rows turn to "Added ✓" |
| 5 | `/pos` | modal "Open your first shift" → float "Zero is fine." → "Open shift" | shift open command — route not fixed — T-022 | tiles of the two items with prices (`row core.price.amount_minor`) |
| 5a | `/pos` | taps "Masala dosa", "Charge" | `POST /v1/orders` (`orders.place.v1`) | order total from `row core.order.total_minor`; tender panel |
| 5b | `/pos` tender panel † | "Cash" → keypad → "Record payment" | tender record command — route not fixed — T-022 | "Recorded only — Munim does not process payments." Change shown |
| 5c | `/pos` receipt panel † | — | — | pack receipt (IN: FSSAI no., GST split) + "Your first sale is in the books." + "Go to your console" |

† Tender and receipt are **panels of `/pos`** (`/pos?order=[id]`), not routes (pos.md P3–P4), so the path is
5 routes: ON1, ON2, ON3, ON4, `/pos`. The shift modal is not a route. T-067 counts route changes.

## Branches (off the critical path)

- **Shop:** step 4 = "Scan barcodes" (name, price, MRP) → step 5 scan-to-add (`flows/shop-barcode-sale.md`).
- **"Photograph your menu":** opens `/import` (I1) → vision extraction → catalogue **draft** → approval
  (R28) → returns to ON4 with "Menu import waiting for your review". Never blocks "Start selling".
- **"Just looking? Open the sample business"** (ON1): demo session in a separate demo tenant, badge
  "Sample data — synthetic, for demonstration" (R27 judge member, e.g. "Judge 7f3a (demo)").
- **AU:** step 2 "Australia" → ON3 asks "ABN"; receipt shows "Tax invoice", ABN, "GST included {money}".

## Failure states

| Step | Failure | User sees |
|---|---|---|
| 1 | link expired | "This link has expired. We've sent a new one." |
| 3 | network / 5xx | "Nothing was created. Try again." (same idempotency key → one tenant, never two) |
| 3 | invalid tax id | "This doesn't look like a valid FSSAI licence number." (pack regex) |
| 4 | price ≤ 0 or blank | "Enter a price." |
| 5a | no open shift (modal dismissed) | "Open a shift to start selling." + "Open shift" |
| 5c | FSSAI missing (skipped at 3) | receipt banner "Add your FSSAI licence number in Settings before printing bills." |
| any | back to step 2 after step 3 | country shown read-only with padlock: "Fixed at setup so your books never change currency." |
