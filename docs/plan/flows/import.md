# Flow — import a file (payout, bank/UPI, POS export, Tally, menu or invoice photo)

**Refs:** ledger R28 (each import run is a draft; mapping = renames + units, no arithmetic; rows commit under
the approver); 03-arch §5.7; 02-schema §2.13; 04 §8; BOARD T-030, T-056. Screens: `onboarding-import.md` B.
**Routes:** none of the import routes is named in 03-arch §1.9 or `contracts/routes.ts` — every call below
is "route not fixed — T-030" (gap G-IMP-3). Approval uses the named draft routes.

| # | Screen | User does | API / server | User sees |
|---|---|---|---|---|
| 1 | I1 `/import` | picks "Zomato payout", drops `payout_sept.csv` | upload → `Blob` port → `core.document` (sha256 unique per tenant) | "Uploaded. Reading your file…" |
| 1a | I1 | (same file again) | sha match → refused | "You've already uploaded this file on {date}." + link to that run |
| 2 | — | — | format detection by `header_signature` against `core.import_format` | known format → skip to 4 |
| 3 | I2 mapping (new format only) | reviews "Your column → Munim field · Unit" | intel proposes mapping (refs to header cells) → `…/drafts` (source `import`) | "Munim only renames columns and reads units. It never calculates during import." Approve / Edit / Reject (reason) as `approval.md` |
| 3a | I2 | "Approve" | `POST /v1/drafts/{id}:approve` → `import_format` row with `decision_id` | "Format saved. Future files like this skip this step." |
| 4 | I3 `/import/[run]` | waits | `core-worker` parses into `core.import_staging` / `core.import_quarantine`; `import_run` row (`rows_ok`, `rows_quarantined`, `control_total_minor`); preview draft created | "Reading your file…" → preview |
| 5 | I3 | reviews | run status read (route not fixed); `snap imports.run_preview` for the staged total | "Rows ready {n}" (row) · "Quarantined {n}" (row) · "Total in file {money}" (row) · "Total of ready rows {money}" ⟨snap⟩ · "✓ Matches the file's total" |
| 6 | I3 | opens "Quarantined ▸" | staging/quarantine rows | per row: row number, reason ("Date not readable", "Order id not found", "Currency differs from your business") — raw text shown as plain text only |
| 7 | I3 | "Approve import" | `POST /v1/drafts/{id}:approve` → staging rows move into book tables (`settlement`/`settlement_line`, `bank_line`, …) as the approver; derived postings via allow-listed rules carry the decision; `finance.reconcile` derives breaks | `D-exec` "Applying…" → I4 "Imported {n} rows under your name." |
| 8 | Finance dashboard | follows link | dashboard snapshots | breaks by channel, unapproved fees tile (story 3) |

## Branches

| Case | User sees |
|---|---|
| Totals do not match | "✕ Doesn't match the file's total by {money}. Check the quarantined rows." — Approve requires a reason (`INFERENCE`; G-IMP-2) |
| Reject | reason required → "Import rejected. Nothing was added to your books." (staging retained as operational, not books) |
| Currency differs from the tenant's (R30) | those rows quarantined: "Currency differs from your business" |
| AU tenant picks an IN-only format | not offered (cards come from the country pack) |
| Same rows already imported (overlapping period) | rows with an existing `external_ref` quarantined: "Already imported on {date}" |
| Parse failure | "We couldn't read this file as {format}." + "Choose another format" |
| **Menu or shelf photo** | vision role → catalogue draft: each item row shows name, price **with the crop of the source photo** (document-span ref); edits "Typed by {name}"; approve → items + prices committed as the approver. Command type for a batch catalogue draft is not in `DRAFTABLE` (gap G-IMP-4). `S-aioff`: "Photo import is unavailable right now. You can add items by hand." |
| **Supplier invoice photo/PDF** | `supplier_invoice` draft with span refs (04 §8); duplicate `(supplier, invoice_no)` → "This invoice is already recorded." (unique constraint) |
| intel down (CSV formats) | known formats parse without intel; only new-format mapping proposals wait — "Mapping suggestions are unavailable. Map the columns yourself." |
