# Story 3 — Month-end close on payout files + POS export; breaks explained; P&L produced

**Refs:** PDR §7 S3, §6 N3; R4 K9 (lead with unapproved ad fees); ledger R28; D-1 `packs/finance.md`
(`finance.unapproved_deductions`, `finance.settlement_vs_orders`, `finance.missing_payouts`, `finance.pnl`,
`finance.close_status`, `finance.gst_check`; drafts `finance.dispute.draft.v1`, `finance.period.close.v1`;
refusals `settlements_missing`, `consent_record_missing`); `flows/import.md`; `flows/approval.md`.
**World:** Swiggy- and Zomato-*shaped* synthetic payout files, a POS export and a bank CSV for September.
No real aggregator data; the UI never implies one. Close time (N3) is measured from step 1 to step 12.

| # | Screen | User does | API | User sees |
|---|---|---|---|---|
| 1 | Finance dashboard `/console/d/finance` | opens "Close September" | `snap finance.close_status` | checklist: "POS days closed", "Payouts imported", "Bank imported", "Breaks resolved", "Supplier invoices matched", "Stock counted", "Payroll approved" (IN), "GST difference zero", "P&L produced" — each ✓/✕ from snapshot cells |
| 2 | P&L tile (early) | taps "Net profit" | `snap finance.pnl` → validator | **"Cannot verify: payouts from Zomato for {dates} have not been imported, so this month's profit would be wrong."** (`settlements_missing`) + "Import payouts" |
| 3–5 | Import wizard | imports Swiggy payout, Zomato payout, POS export, bank CSV — each a preview draft approved | `flows/import.md` steps 1–7 (×4) | four "Imported {n} rows under your name." |
| 6 | Finance dashboard | returns | `snap finance.unapproved_deductions`, `finance.settlement_vs_orders`, `finance.missing_payouts` | **first tile: "Unapproved ad and promo fees this month ⟨snap⟩"**; breaks by channel table |
| 7 | Rows drawer | taps the ad-fee cell | `GET /v1/snapshots/{id}` | settlement lines with ad-fee column, date, channel, and the `channel_terms` row showing no consent for those dates |
| 8 | Ask C3 | "Why is Swiggy short this month?" | `POST /v1/ask` | cited sentences: fees ⟨snap⟩ on ⟨snap⟩ orders ⟨cite:row:core.settlement_line⟩ with no agreed terms ⟨cite:row⟩ |
| 8a | Ask (branch) | asks about a channel with no recorded terms | — | "Cannot verify: no ad or promotion agreement with {channel} is recorded, so Munim cannot tell approved charges from unapproved ones. Add the terms you agreed." |
| 9 | Inbox → draft C2 | reviews "Dispute · Swiggy · unapproved ad fees" | draft get (route not fixed — T-008) | `finance.dispute.draft.v1`: lines with `claimed_minor` refs, total ref; banner "Munim records and prints this claim. It never sends it — you do." |
| 10 | C2 | "Approve" | `POST /v1/drafts/{id}:approve` | "Dispute recorded. Print or download the claim." (gap G-FIN-1: type not yet `DRAFTABLE`) |
| 11 | Finance dashboard | checklist now all ✓ | `snap finance.close_status`, `finance.pnl`, `finance.gst_check` | P&L by outlet / brand / channel (snapshot), "GST difference zero ✓" |
| 12 | Inbox → draft C2 | reviews "Close September · Outlet B" → "Approve" | `finance.period.close.v1` draft (net ⟨`finance.pnl` cell⟩, checklist evidence refs) → `POST /v1/drafts/{id}:approve` | "September is closed. Entries dated in September are now refused." → `core.period_close` row |
| 13 | Finance dashboard | "Export for Tally" | Tally export — route not fixed — T-026 | file download; advisor (CA) can do this read-only |

## Branches

| Case | User sees |
|---|---|
| A posting dated in the closed period (later import) | refused: "September is closed. Post a correction in an open month." (`reason_code TBD`) |
| Close approved while a payout is still missing | close draft is never proposed — checklist item stays ✕ with `settlements_missing` copy |
| Break explained as a timing difference | finding resolved with refs to the next cycle's settlement line — no draft |
| Advisor opens close | read-only: drafts visible, Approve hidden; "Read-only access" |
| AU tenant | Uber Eats- and DoorDash-shaped formats; GST labels from the AU pack; no payroll item in the checklist |

**What the story proves:** imports are drafts committed under a named approver (R28); breaks are explained with
refs, led by unapproved ad fees; the refusal on an incomplete month; the P&L appears only once it can trace.
