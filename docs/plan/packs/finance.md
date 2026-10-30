# Pack — Finance (`finance`)

**Depends on:** PDR §1, §4, §7 (S3); R4 K9 and §D items 1–7 (unconsented ad/promo deductions, UPI-QR swap); R21, R28;
02-schema §2.4, §2.7, §2.13; 04 §9 (finance example). Prefix `finance.`. Conventions, debounce, ladder **L**:
`catalogue.md` header; thresholds `INFERENCE`. Every ₹ is a measured result on synthetic data (CLAUDE.md rule 5).

## 1 · Purpose and owner question

- **Restaurant:** "Did Swiggy/Zomato (AU: Uber Eats/DoorDash) pay me what they owe — and did they charge ads or promos I never agreed to?"
- **Shop:** "Does the UPI/card money in my bank match what the counter recorded, and what did I actually make this month?"
- **Both:** "Can I close last month, and what is left to do?"

## 2 · Skill brief

- **Lead with unapproved deductions** (R4 K9): an ad fee or promo share is *unapproved* when `channel_terms` for that
  channel and date says not opted in, or the month's total exceeds the recorded cap / share. No terms → refuse.
- Short payout = expected net (order total − contracted commission − pack tax withheld − our recorded refunds) − paid net, per line.
- Orders completed but absent from any settlement after the channel's cycle are missing payouts, not short ones.
- UPI/card gap: tenders recorded at the counter vs credits on the bank statement, per outlet per day; a gap that
  rises with voids or cancellations on one person's shifts is the QR-swap pattern (R4 §D item 7) — name shifts, not motives.
- P&L by outlet, brand and channel comes only from postings (balanced, closed periods immutable).
- Payouts and bank files arrive as import drafts (R28); nothing is reconciled until the import is approved.
- Disputes are drafted for the owner to send; Munim never contacts an aggregator (PDR §5).
- Tax rules (GST Sec 9(5), AU 10% inclusive) come from the country pack, never from prompt text (R21).
- Posting policies (W2 fix cycle 1, `INFERENCE`): an **aggregator order's refund** is a deduction from what the channel
  owes (Dr sales / output tax, Cr channel receivable) — the channel refunds the customer, never our till — so short
  payout (which subtracts our refunds) includes it; the expected tax withheld is the **order's** tax where the operator
  collects it (Sec 9(5)), the statement's figure otherwise. A supplier invoice settles GRNI with the GRN value of the
  goods it bills that were received; its price/quantity **variance** and non-goods lines (delivery) are COGS
  (purchases method, no separate PPV account). Partial refunds reverse output tax cumulatively, so they sum to the
  order's tax. Points redeemed on a completed order move their value from counter clearing (1110) to loyalty
  redemptions (4100, contra-revenue). An invoice or payout dated in a **closed** month posts on the first day of the
  next open month with `memo_key` `finance.closed_period.from_<yyyy_mm_dd>` (the Tally narration); a person's own
  expense in a closed month is still refused.

## 3 · Snapshot templates

Types: `*_minor`, `*_bp`, counts, `days_*` = `integer`; `*_id` = `uuid`; `*_on` = `date`; `done` = `boolean`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `finance.unapproved_deductions` | ad/promo charged vs consent per channel-month | `channel_id`, `month` | `channel_id`, `ad_fee_minor`, `promo_share_minor` ← `core.settlement_line`; `ad_allowed_minor`, `promo_allowed_minor` ← `core.channel_terms`, `core.settlement_line`; `unapproved_minor` ← both; `ads_opted_in` boolean |
| `finance.settlement_vs_orders` | per-order expected vs paid (04 §9) | `channel_id`, `from`, `to` | `settlement_line_id`, `matched_order_id`, `order_total_minor` ← `core.order`; `commission_minor`, `net_minor` ← `core.settlement_line`; `expected_commission_minor` ← `core.channel_terms`, `core.order`; `refund_minor` ← `core.refund`; `expected_net_minor` (total − commission − tax withheld − refund) ← all; `short_minor` (+ Σ row) ← all; `settlement_id`, `channel_id` (v2, 0023: one Σ row per settlement first, over the lines that count under §4) |
| `finance.missing_payouts` | completed aggregator orders never settled | `channel_id`, `as_of` | `order_id`, `order_total_minor` ← `core.order`; `expected_net_minor` (+ Σ row) ← `core.order`, `core.channel_terms`; `days_unsettled` ← `core.order_event`; `channel_id` (v2, 0023: one Σ row per channel first, its `days_unsettled` the oldest order's) |
| `finance.tender_vs_bank` | counter tenders vs bank credits per day | `outlet_id`, `method`, `from`, `to` | `business_on`, `tendered_minor` ← `core.tender`; `credited_minor` ← `core.bank_line`; `gap_minor` ← both; `voids`, `void_minor`, `outlet_median_voids` ← `core.void`; `shift_member_id` ← `core.shift`; `week_start`, `gap_days` ← `core.tender`, `core.bank_line` (v2, 0023: one Σ row per ISO week first, over its gap days) |
| `finance.pnl` | P&L by outlet/brand/channel | `period_month`, `group_by` | `key` text, `revenue_minor`, `cogs_minor`, `channel_fees_minor`, `labour_minor`, `other_minor`, `net_minor` ← `core.posting`, `core.journal_entry`, `core.account` |
| `finance.gst_check` | order tax vs tax postings | `period_month`, `outlet_id?` | `outlet_id`, `order_tax_minor` ← `core.order`; `posted_tax_minor` ← `core.posting`; `diff_minor` ← both |
| `finance.close_status` | month-end checklist | `period_month`, `outlet_id?` | `item_code` text, `done`, `open_count` ← `core.shift`, `core.settlement`, `core.bank_line`, `core.reconciliation_break`, `core.supplier_invoice`, `core.goods_received`, `core.stock_count`, `core.payroll_draft`, `core.posting` (one per item, below) |

```sql
-- finance.unapproved_deductions (illustrative)
select s.channel_id, sum(sl.ad_fee_minor) ad_fee_minor, sum(sl.promo_share_minor) promo_share_minor,
  case when ct.ads_opted_in then least(sum(sl.ad_fee_minor), ct.ad_spend_cap_minor) else 0 end ad_allowed_minor,
  sum(sl.gross_minor) filter (where sl.line_kind='order') * ct.promo_share_bp / 10000 promo_allowed_minor, …
from core.settlement s join core.settlement_line sl on sl.settlement_id = s.id
left join core.channel_terms ct on ct.channel_id = s.channel_id
  and :month between ct.valid_from and coalesce(ct.valid_to, 'infinity')
where s.channel_id = :channel_id and date_trunc('month', s.period_to) = :month group by s.channel_id, ct.id;
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `finance.unapproved_ad_fee` | `unapproved_deductions` | `unapproved_minor` ≥ ₹100 (A$2) in a channel-month | `<channel>:<month>` | L; at least `high` when `ads_opted_in` = false |
| `finance.short_payout` | `settlement_vs_orders` | Σ `short_minor` ≥ ₹200 (A$5) per settlement; a line counts only if `short_minor` ≥ max(₹1, 0.5% of `expected_net_minor`) | `<settlement>` | L on monthly Σ |
| `finance.missing_payout` | `missing_payouts` | `days_unsettled` > 10 | `<channel>:<iso_week>` | L on Σ order totals |
| `finance.tender_gap` | `tender_vs_bank` | `gap_minor` ≥ ₹500 (A$10) on ≥ 3 of 7 days | `<outlet>:<method>:<iso_week>` | L; `critical` if the gap days share one `shift_member_id` and `voids` ≥ 2 × `outlet_median_voids` |
| `finance.gst_mismatch` | `gst_check` | \|`diff_minor`\| ≥ ₹10 (A$1) | `<outlet>:<month>` | `high` (filing risk), else L |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `reconciliation_break.unapproved_ad_fee` | per §4 | `unapproved_deductions.unapproved_minor` |
| `reconciliation_break.short_payout` | L | `settlement_vs_orders.short_minor` (Σ row) |
| `reconciliation_break.missing_payout` | L | `missing_payouts.expected_net_minor` (Σ row) |
| `cash_control.tender_gap` | L / `critical` | `tender_vs_bank.gap_minor` |
| `tax.gst_mismatch` | `high` | `gst_check.diff_minor` |

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `finance.dispute.draft.v1` | NEW (named in 04 §9) | `dispute_id`, `channel_id`, `basis` (`unapproved_ad_fee`\|`short_payout`\|`missing_payout`), `lines[]{settlement_line_id\|order_id, **claimed_minor** ← `settlement_vs_orders.short_minor` \| `missing_payouts.expected_net_minor`}` (empty for ad fees), **`total_claimed_minor`** ← `unapproved_deductions.unapproved_minor` \| the Σ row, `currency`; executes as a `core.dispute` row + printable claim |
| `finance.journal.adjust.v1` | NEW (named in 04 §9) | `journal_entry_id`, `entry_date`, `outlet_id`, `reverses_id`, `postings[]{account_id, side (`debit`\|`credit`), **amount_minor** ← e.g. `unapproved_deductions.unapproved_minor`}` (unsigned, so one cell balances both sides), `currency`, `memo_key` — e.g. move a disputed fee to a receivable |
| `finance.period.close.v1` | NEW | `period_close_id`, `outlet_id`, `period_month`, `checklist[]{item_code, evidence_ref}`, **`net_minor`** ← `pnl.net_minor` |

**Month-end close checklist** (`finance.close_status`, item → source): `pos_days_closed` (a `shift` per trading day) ·
`settlements_imported` (every channel cycle has a `settlement`) · `bank_imported` (`bank_line` to month end) ·
`breaks_resolved` (open `reconciliation_break` = 0 or disputed) · `supplier_invoices_matched` (`supplier_invoice` ↔
`goods_received`) · `stock_counted` (`stock_count` in the last 3 days) · `payroll_approved` (IN: `payroll_draft`) ·
`gst_zero_diff` (`gst_check`) · `pnl_produced`. All done → `finance.period.close.v1` draft; N3 times this flow.

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| P&L for an open period with settlement cycles missing (04 §9) | `settlements_missing` (exists) | "Cannot verify: payouts from {channel} for {dates} have not been imported, so this month's profit would be wrong." |
| unapproved-fee question with no `channel_terms` for the date | `consent_record_missing` NEW | "Cannot verify: no ad or promotion agreement with {channel} is recorded, so Munim cannot tell approved charges from unapproved ones. Add the terms you agreed." |
| tender gap asked with no bank lines for the days | `bank_lines_missing` NEW | "Cannot verify: no bank statement covers {dates}, so counter payments cannot be matched." |

## 8 · Dashboard panel

Tiles: unapproved ad/promo ₹ this month ← `finance.unapproved_deductions`; short + missing payouts ₹ ←
`finance.settlement_vs_orders`, `finance.missing_payouts`; UPI/card gap ₹ (7 d) ← `finance.tender_vs_bank`; net profit
← `finance.pnl`; close progress ← `finance.close_status`. Charts: breaks by channel; P&L by outlet / brand / channel ← `finance.pnl`.

## 9 · Graph scope

Nodes `channel`, `outlet`, `brand`, `day`, `person`, `finding`, `draft`; edges `about`, `proposes`, `works_at`
(shift → person for the tender-gap pattern). Rollups only; `neighbourhood` (depth ≤ 2). No money on edges.

## 10 · Eval cases

| # | planted (worldgen via import file / command; terms via member command `finance.channel_terms.set.v1`, NEW) | ₹ key = impact column | expect |
|---|---|---|---|
| F1 | payout files carry ad-fee lines for 3 months; `channel_terms.ads_opted_in` = false | `unapproved_minor` = Σ ad fees | `unapproved_ad_fee`, dispute draft |
| F2 | ads opted in, cap ₹5,000/month, charged ₹8,200 | `unapproved_minor` = 8,200 − 5,000 per month | `unapproved_ad_fee` |
| F3 | commission 28% charged vs 22% contracted on 400 orders | `short_minor` Σ = Σ gross × (2,800 − 2,200) ÷ 10,000 | `short_payout` |
| F4 | 37 completed orders never in any payout | `expected_net_minor` Σ | `missing_payout` |
| F5 | QR swap: weeks 12–20, one manager's shifts, 30% of UPI tenders not credited, voids ×3 | `gap_minor` = Σ (tendered − credited) on those days | `tender_gap`, `critical` |
| F6 | POS export import posts tax on one item at the wrong class | `diff_minor` = \|order tax − posted tax\| | `gst_mismatch` |
| F7 abstain | P&L asked for a month missing one Zomato payout cycle | — | `settlements_missing` |
| F8 trap | ad fees within an opted-in cap; a refund we recorded explains a lower net | 0 | no finding |
