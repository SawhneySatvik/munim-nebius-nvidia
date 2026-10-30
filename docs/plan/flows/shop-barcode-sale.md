# Flow — shop sale with barcode scan

**Refs:** ledger R34 (store pack first-class), R26; BOARD T-021 (barcode lookup), T-024 (batches, FEFO,
MRP, "sale above MRP refused"), T-022; screens `pos.md` P1, P3, P4; D-1 `packs/catalogue.md`
(`catalogue.sku_mrp_check`, MRP is a ceiling — a finding, never a draft).
**Hardware:** USB/Bluetooth scanner as keyboard wedge (focus-trapped input, ≥ 16 px) or the tablet camera.

| # | Screen | User does | API / command | User sees |
|---|---|---|---|---|
| 1 | `/pos` (Counter) | scans a packet of biscuits | barcode lookup — route not fixed — T-021 (`core.item.barcode`) | line "1 × Biscuits 200 g · {price}" (`row core.price.amount_minor`), beep + flash; scanner stays focused |
| 2 | `/pos` | scans the same code again | (client) qty +1 | "2 ×" on the same line |
| 3 | `/pos` | scans a loose-item code (weighed) | lookup | qty keypad opens "Enter weight (kg)" (≥ 16 px) |
| 4 | `/pos` | "Charge" | `POST /v1/orders` (`orders.place.v1`): server re-prices, checks MRP, picks batches **first-expiry-first-out** for consumption (derivation `inventory.consume_order`) | committed order; total = `row core.order.total_minor` |
| 5 | `/pos` tender panel | "UPI" → enters reference → "Record payment" | tender record — route not fixed — T-022 | "Recorded only — Munim does not process payments." |
| 6 | `/pos` receipt panel | "Print" / "New sale" | — | receipt lines incl. MRP column where the pack requires it; batch not printed |
| 7 | (later) console | — | stock movements per batch (`row core.stock_movement`, kind `sale_consumption`, `batch_id`) | inventory dashboard expiring/dead-stock tiles update on next snapshot |

## Branches and refusals (literal copy, `pos.refuse.*` / `pos.scan.*`)

| Case | Where | Behaviour | Copy |
|---|---|---|---|
| Unknown barcode | step 1 | no line added; error tone | "No item with this barcode." + owner/manager: "Add item" (sheet: name, price, MRP, barcode prefilled → `catalogue.item.upsert.v1` + `catalogue.price.set.v1`); staff: "Ask a manager to add it." |
| Price above MRP | step 4 (server) | order refused, nothing committed | "This price is above the printed MRP. Sale refused." (`reason_code TBD`; catalogue pack raises a finding for the owner) |
| Only expired stock left | step 4 | `INFERENCE`: sale allowed only if non-expired on-hand covers it; otherwise refused | "Only expired stock of {item} is left. Remove it or write it off." (`reason_code TBD`; gap G-SHOP-1 — T-024 defines FEFO, not an expiry refusal) |
| Negative on-hand | step 4 | allowed (02-schema §2.5), raises an alert | no cashier message; manager sees finding "Sold more {item} than recorded in stock" |
| Item inactive | step 1 | not added | "This item is no longer on sale." |
| Scanner disconnected | step 1 | typed input still works | "Scanner not detected. Type the code or use the camera." |
| Camera blocked | step 1 | — | "Allow camera access to scan, or type the code." |
| Return (customer brings back) | `/pos/refund/[id]` | refund lines; `return` movement into the original batch | "Refund {money} recorded. Stock returned to batch {batch}." |
| No connection | step 4 | `S-off` | "No connection. Nothing was saved." + "Retry" (same idempotency key) |

**Numbers:** every number the cashier sees is a row field (price, order totals, tender). FEFO batch choice
is a server derivation, visible later as movement rows. No intel on this path.
