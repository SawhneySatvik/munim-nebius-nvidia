# Onboarding, import wizard, settings

**Tickets:** T-067 (UI), T-020 (tenancy + onboarding), T-030 (imports), T-056 (menu/invoice vision), T-021.
**i18n prefixes:** `onboarding.*`, `import.*`, `settings.*`. **Who:** a new owner (A); owner/manager (B, C).
Tablet- and phone-friendly: targets ≥ 48 px, inputs ≥ 16 px. Flow: `flows/onboarding-first-sale.md`.

## A · Onboarding — first sale in ≤ 5 screens (T-067 counts routes; modals do not count)

**ON1 · Sign up — `/onboarding/1`.** Email + "Send me a sign-in link" (IdP port; Supabase Auth in dev).
Secondary link "Just looking? Open the sample business" → judge/demo session (`demo.session.start.v1`, R27),
a separate tenant badged "Sample data". States: `S-empty` n/a · `S-off` "No connection. The link wasn't sent." · `S-deny` n/a · `S-abst` n/a · `S-load` on send · `S-err` "We couldn't send the link. Check
the address and try again." · link expired → "This link has expired. We've sent a new one."
Purpose: an identity in one step. Heading: "Start with Munim".

**ON2 · Your business — `/onboarding/2`.**
```
┌ What do you run?                                              step 2 of 4 ┐
│ ( Restaurant )  ( Cloud kitchen )  ( Shop )        ← 96 px cards          │
│ Business name [                    ]                                       │
│ Country  ( India )  ( Australia )                                          │
│ "Country sets your currency, taxes and receipts. It can't be changed later."│
│ [ "Continue" ]                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```
Nothing is saved yet (held client-side). Kind drives defaults (stations, KDS on/off, store pack panels).
States: `S-load`/`S-err`/`S-off` n/a (nothing is sent) · `S-empty` "Choose what you run and your country." ("Continue" disabled) · `S-deny` n/a · `S-abst` n/a.
Purpose: kind, name and country (country locks at ON3). Heading: "What do you run?".

**ON3 · Your first outlet — `/onboarding/3`.** Outlet name, address, hours (preset "Every day 09:00–22:00",
editable), pack tax ids (IN: "GSTIN (optional)", "FSSAI licence number"; AU: "ABN"). "Create my business" →
one provisioning call (tenant + outlet + owner membership + pack defaults + one POS device, T-020) and sets
`tenant.onboarded_at` — **country locks here (R30)**. Route not fixed — T-020 (the only named provisioning
route is operator-only `/platform/v1/tenants:provision`; gap G-ONB-1). States: `S-empty` "Add your outlet's name." · `S-deny` n/a · `S-abst` n/a · `S-load` "Setting up…" ·
`S-off`/`S-err` "Nothing was created. Try again." (same idempotency key) · invalid tax id → field error
"This doesn't look like a valid {label}." (pack regex).
Purpose: create the business in one call. Heading: "Your first outlet".

**ON4 · Add what you sell — `/onboarding/4`.** Three paths:
- **Quick add** (default): rows "Name · Price" (+ "Category"); "Add another". Each row is the owner's own
  command `catalogue.item.upsert.v1` + `catalogue.price.set.v1` (R27 — no draft; it is their own typing).
- **Shop: "Scan barcodes"** — scan → name, price, MRP (MRP required for packaged goods in IN pack) → same commands.
- **"Photograph your menu"** → opens the import wizard (B) as a **branch**: the extracted catalogue is a draft
  needing approval (R28), so it never blocks the 5-screen path. Returning shows "Menu import waiting for your
  review" on the console home.
"Start selling" enabled after ≥ 1 item. `S-empty` "Add at least one item to start selling."
States: `S-load` row "Adding…" · `S-err` row "Not added. Try again." · `S-off` std · `S-deny` n/a (owner) · `S-abst` n/a (photo branch: see I3).
Purpose: put at least one thing on sale. Heading: "Add what you sell".

**ON5 = `/pos`** (pos.md P1) with a one-time modal "Open your first shift" (opening float — "Zero is fine.")
and a coach mark "Tap an item, then Charge." After the first receipt: "Your first sale is in the books." +
"Go to your console".
States: as `pos.md` P1–P4.

## B · Import wizard — `/import`, `/import/[run]` (flow: `flows/import.md`)

**I1 · Choose and upload.** Cards (pack-driven list): "Menu or shelf photo", "POS export", payout reports
(IN: "Swiggy payout", "Zomato payout"; AU: "Uber Eats payout", "DoorDash payout" — `-shaped` formats,
synthetic in demos), "Bank or UPI statement", "Supplier invoice (photo or PDF)", "Tally export". Drop zone +
"Choose file". Upload → raw document (sha unique: duplicate → "You've already uploaded this file on {date}."
with a link). Route not fixed — T-030.
States: `S-load` upload progress · `S-empty` n/a · `S-err` "Upload failed. Nothing was imported." · `S-off` std · `S-deny` staff → `/import` absent · `S-abst` n/a.
Purpose: pick a file type and upload. Heading: "Import data".

**I2 · Column mapping (new format only).** Table: "Your column" → "Munim field" + "Unit" (e.g. "paise",
"rupees", "cents"). **Renames and units only — no formulas** (R28): copy "Munim only renames columns and
reads units. It never calculates during import." Proposed by intel (refs to header cells) → draft → Approve /
Edit / Reject with reason (as `approval.md`). Known formats skip I2.
States: `S-load` "Suggesting a mapping…" · `S-empty` n/a · `S-err` std · `S-off` std · `S-deny` as I1 · `S-abst` a suggestion failing validation → "Cannot verify: …", manual mapping only · `S-aioff` "Mapping suggestions are unavailable. Map the columns yourself."
Purpose: approve how a new format's columns map. Heading: "Match your columns".

**I3 · Preview (`/import/[run]`).**
```
┌ Zomato payout · Sept · file payout_sept.csv            status: "Waiting for your approval" ┐
│ Rows ready {n} ← row import_run.rows_ok   Quarantined {n} ← row import_run.rows_quarantined │
│ Total in file {money} ← row import_run.control_total_minor                                   │
│ Total of ready rows {money} ⟨snap imports.run_preview⟩   ✓ "Matches the file's total"       │
│ [Ready rows ▸] [Quarantined ▸ reason per row]                                                │
│ [ "Approve import" ]  [ "Reject" ]                                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```
- Staged-rows total = `snap imports.run_preview` (pending D-1/M-C; not a pack template — gap G-IMP-1).
- Mismatch → "✕ Doesn't match the file's total by {money}. Check the quarantined rows." (Approve still
  allowed with a reason — `INFERENCE`; flagged G-IMP-2).
- Menu/invoice photo variant: each extracted value shows the **crop of the source** beside it (document-span
  ref, 04 §8); edits show "Typed by {name}".
States: `S-err` std · `S-off` std (approve retry resends the same key) · `S-abst` photo variant: a value whose span ref fails reads "cannot verify" and must be typed · `S-load` "Reading your file…" (worker parse; polls run status) · `S-empty` "No rows found in this
file." · parse error "We couldn't read this file as {format}." · `S-deny` staff → hidden from nav ·
`S-aioff` (photo imports only): "Photo import is unavailable right now. You can add items by hand."
Purpose: check what will enter the books before approving. Heading: "{format} · {period}".

**I4 · Done.** "Imported {n} rows under your name." + links to the committed rows / dashboard.
States: `S-load` until the decision returns; all others n/a.
Purpose: confirm what was committed, and by whom. Heading: "Import complete".

## C · Settings — `/console/settings/*` (owner's own commands; no drafts — R27)

Purpose: change the business's own setup (own commands). Heading: "Settings"

| Tab | Fields | Notes |
|---|---|---|
| business | name, country (**read-only**, padlock), currency (read-only), FY start | country tooltip "Fixed at setup so your books never change currency." (R30) |
| outlets | hours, dated overrides (holidays), accepting state open/busy +N/paused, pickup window length / lead / capacity, cancel window (gap G-SF-1), default prep time (gap G-KDS-1) | manager: own outlet hours + accepting state |
| members | invite by email, role, outlet scope | `tenancy.member.invite.v1` |
| devices | register POS/KDS, invoice series | `tenancy.device.register.v1` |
| storefront | logo, colours, layout preset, table QR codes, storefront key rotate | rotate copy "Old QR codes stop working immediately." |
| menu | items, variants, options, prices per outlet/channel, recipes, deals, coupons, barcode, MRP, sold-out | sold-out toggle per outlet (gap G-CAT-1) |
States: `S-empty` n/a (defaults from onboarding) · `S-err` std · `S-abst` n/a · `S-load` · `S-deny` (hidden tabs) · save → toast "Saved." · `S-off` "Not saved — no connection."
Routes for all settings commands: not fixed — T-020/T-021.
