# Pack — Customers & growth (`customers`)

**Depends on:** PDR §4–§5 (campaigns never auto-sent; no WhatsApp, R5); R15, R16, R29 (customer records and outbound
messages are books); R4 §E items 6–7 (coupon caps, append-only loyalty); 02-schema §2.1 (`customer`), §2.3 (`coupon`),
§2.8–§2.11. Prefix `customers.`. Conventions, debounce, ladder **L**: `catalogue.md` header; thresholds `INFERENCE`.

## 1 · Purpose and owner question

- **Restaurant:** "Which coupons are leaking money, which regulars have stopped coming, and what would bring them back?"
- **Shop:** "Are discounts being given to walk-ins who never asked, and are my regular buyers drifting away?"

## 2 · Skill brief

- Coupon leakage (`coupon_leakage`, `staff_coupon_use`, `coupon_daily`) = discount given outside the coupon's intent: per-customer caps evaded through several guest records
  on one phone, staff-applied codes on anonymous counter orders, or a code leaked publicly (sudden spike of one-time users).
- Phone numbers are compared normalised (pack country code) and never shown in full in envelopes — ids and counts only.
- A regular = ≥ 4 orders in the prior 90 days; *at risk* = days since last order > 2 × own median gap.
- Loyalty is an append-only ledger; balances are Σ entries, never a stored figure (R4 §E item 7).
- Campaigns are drafts with the full message text; only consented customers (`customer.consent`) are in the audience;
  sending is a book change and waits for a named person (R15, R16). Channels: email/SMS adapters only (R5).
- Reviews are imported evidence; a rating drop is linked to kitchen or stock findings only through cited rows.
- Never proposes a discount deeper than the dish's margin allows (reads `catalogue.dish_margin`).

## 3 · Snapshot templates

Types: `*_minor`, counts, `*_days`, `*_x100` = `integer`; `*_id` = `uuid`; `*_on` = `date`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `customers.coupon_leakage` | leakage per coupon | `from`, `to` | `coupon_id`, `uses`, `discount_minor` ← `core.coupon_use`; `cap_evasion_uses`, `cap_evasion_minor` ← `core.coupon_use`, `core.customer`, `core.coupon` |
| `customers.staff_coupon_use` | anonymous counter uses per member per week | `outlet_id`, `week_start` | `coupon_id`, `member_id`, `uses`, `cash_uses`, `discount_minor` ← `core.coupon_use`, `core.order`, `core.tender`; `outlet_median_uses` ← `core.coupon_use` |
| `customers.coupon_daily` | daily uses vs 28-day median | `coupon_id`, `to` | `used_on`, `uses`, `median_uses`, `first_time_uses`, `discount_minor`, `excess_discount_minor` (day − median-day discount) ← `core.coupon_use`, `core.order`; `in_campaign_window` boolean ← `core.campaign`, `core.coupon` |
| `customers.churn_segments` | regulars by recency | `outlet_id?`, `as_of` | `customer_id`, `orders_90d`, `median_gap_days`, `days_since_last`, `monthly_spend_minor` (90-day spend ÷ 3) ← `core.order`; `segment` text; Σ row adds `at_risk_count`, `regular_count`, `at_risk_spend_minor` ← `core.order` |
| `customers.review_trend` | rating per week | `outlet_id`, `from`, `to` | `iso_week` text, `reviews`, `avg_rating_x100`, `mean_8w_x100` ← `core.review`; `late_tickets`, `late_change_bp` ← `core.kitchen_ticket` |
| `customers.consented_audience` | who may receive offers | `segment_snapshot_id` | `audience`, `consented` ← `core.customer` |
| `customers.coupon_current` | a coupon's current terms | `coupon_id` | `value_minor`, `value_bp`, `per_customer_cap`, `global_cap`, `min_spend_minor` ← `core.coupon` |

```sql
-- customers.coupon_leakage, cap-evasion part (illustrative)
with u as (select cu.coupon_id, regexp_replace(c.phone,'\D','','g') ph, cu.discount_minor,
                  row_number() over (partition by cu.coupon_id, regexp_replace(c.phone,'\D','','g') order by cu.at) n
           from core.coupon_use cu join core.customer c on c.id = cu.customer_id where cu.at between :from and :to)
select u.coupon_id, count(*) filter (where n > k.per_customer_cap) cap_evasion_uses,
       coalesce(sum(discount_minor) filter (where n > k.per_customer_cap),0) cap_evasion_minor
from u join core.coupon k on k.id = u.coupon_id group by u.coupon_id;
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `customers.coupon_cap_evasion` | `coupon_leakage` | `cap_evasion_minor` ≥ ₹500 (A$10) in 30 days | `<coupon>:<month>` | L |
| `customers.staff_applied_coupon` | `staff_coupon_use` | `uses` ≥ 10 and ≥ 3 × `outlet_median_uses` | `<coupon>:<member>:<iso_week>` | L; ≥ `high` if `cash_uses` > half of `uses` |
| `customers.coupon_spike` | `coupon_daily` | `uses` ≥ 5 × `median_uses`, `uses` ≥ 20, `first_time_uses` ≥ 70% of `uses`, and not `in_campaign_window` | `<coupon>:<date>` | L on `excess_discount_minor` |
| `customers.regulars_lapsing` | `churn_segments` | `at_risk_count` ≥ 15 or ≥ 10% of `regular_count` | `<outlet>:<iso_week>` | L on `at_risk_spend_minor` |
| `customers.rating_drop` | `review_trend` | `avg_rating_x100` ≤ `mean_8w_x100` − 50 and `reviews` ≥ 10 | `<outlet>:<iso_week>` | `medium`; `high` if `late_change_bp` ≥ 2,500 |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `customers.coupon_cap_evasion` | L | `coupon_leakage.cap_evasion_minor` |
| `customers.staff_applied_coupon` | L / `high` | `staff_coupon_use.discount_minor` |
| `customers.coupon_spike` | L | `coupon_daily.excess_discount_minor` |
| `customers.regulars_lapsing` | L | `churn_segments.at_risk_spend_minor` (Σ row) |
| `customers.rating_drop` | `medium` / `high` | `review_trend.avg_rating_x100` |

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `customers.campaign.create.v1` | NEW | `campaign_id`, `name`, `segment_snapshot_id`, **`audience_count`** ← `consented_audience.consented`, `channel` (`email`\|`sms`), `message_key` + `placeholders` (refs only), `coupon_id`, `send_at` — executes as queued, never auto-sent |
| `catalogue.coupon.set.v1` | NEW (shared with `catalogue`): **not wired until executable** (R-B S1-A, DECISIONS 11 Oct) | `coupon_id`, and `code`, `kind`, `value_minor` / `value_bp` / `min_spend_minor`, `requires_customer`, `outlet_ids`, `valid_from` ← the same-named `customers.coupon_current` cells, copied exactly (core refuses any change to them). `per_customer_cap` / `global_cap` / `active` ← their cells, unchanged (a null stays null). **Every copied cell is cited in `based_on`**, so a newer change makes the draft stale instead of being reverted. The tightening is the one change core's coupon.set can make here: **`valid_to` ← a `coupon_current` cell giving the start of the outlet's next business day** (computed by core in the outlet's zone; needs `coupon_current` v3), or the current `valid_to` if earlier. Never `requires_customer`. A lower cap needs a lifetime-uses cell (`coupon_leakage.uses` is a window count) | ends a leaking coupon |

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| campaign asked for a segment where `consented` = 0 | `no_marketing_consent` NEW | "Cannot draft: none of the customers in {segment} agreed to receive offers, so no message was prepared." |
| churn asked with < 90 days of order history | `insufficient_history` NEW (shared) | "Cannot verify: {outlet} has less order history than Munim needs to tell regulars who left from occasional visitors." |

## 8 · Dashboard panel

Tiles: coupon leakage ₹ (30 d) ← `customers.coupon_leakage`; regulars at risk ← `customers.churn_segments`; their monthly
spend ← `customers.churn_segments`; rating this week ← `customers.review_trend`. Charts: coupon uses per day vs median ←
`customers.coupon_daily`; rating vs late tickets per week ← `customers.review_trend`.

## 9 · Graph scope

Nodes `customer`, `outlet`, `item`, `day`, `finding`, `draft`; edges `sold`, `about`, `proposes`, `mentions` (review
claim → item). Templates: `claim_support`, `neighbourhood` (depth ≤ 2). No phone numbers or money on nodes/edges.

## 10 · Eval cases

| # | planted (worldgen via storefront/POS commands) | ₹ key = impact column | expect |
|---|---|---|---|
| G1 | cap-1 welcome coupon used 9× via 3 guest records on one phone, plus 20 similar phones | `cap_evasion_minor` = Σ discount on uses beyond cap per phone | `coupon_cap_evasion` + `coupon.set` draft (`requires_customer`) |
| G2 | one cashier applies a staff code to 60 anonymous cash orders in 4 weeks | `discount_minor` (staff_coupon_use) = Σ discount | `staff_applied_coupon`, `high` |
| G3 | code leaks: one day 180 uses vs median 6, 85% first-time | `excess_discount_minor` = day discount − median-day discount | `coupon_spike` |
| G4 | 40 regulars stop ordering after week 18 | `at_risk_spend_minor` = Σ prior-90-day spend ÷ 3 | `regulars_lapsing` + campaign draft |
| G5 abstain | campaign for lapsed regulars, none consented | — | `no_marketing_consent` |
| G6 trap | spike on a coupon attached to an approved, executed campaign | 0 | no `coupon_spike` |
