# Pack — Market & strategy (`market`)

**Depends on:** PDR §4 (weather/festival-aware forecast notes, new-outlet viability, goals and tasks); spec §4.1;
R25 and 02-schema §3 (numeric sources: `core` or the intel allow-list only); R28 (imports are drafts); R5; 02-schema
§2.11 (`goal`, `task`). Prefix `market.`. Conventions, debounce, ladder **L**: `catalogue.md` header; thresholds `INFERENCE`.

## 1 · Purpose and owner question

- **Restaurant:** "What is coming this week — rain, a festival, a local event — what did it do to my orders last time,
  and does a second outlet there pay back?"
- **Shop:** "Which festival weeks move my stock, and is a nearby shop cheaper on my top sellers?"

## 2 · Skill brief

- External facts (weather, festival dates, local events, competitor prices) enter **only** as rows of
  `core.market_signal`, through an approved import draft (R28; format `market_signal_v1`: `on_date, kind, label, outlet_ref,
  value, unit, source` — renames and units only) — a signal the owner has not approved does not exist.
- A signal's effect is measured on this outlet's own history (same weekday, non-signal baseline); with fewer than
  two past occurrences the effect is unknown, not assumed.
- Forecast notes explain the forecast; they never change it (forecast is deterministic, `forecast.md`).
- Viability is arithmetic over the owner's stated case (rent, capex, ticket) and a comparable outlet's closed-period
  margins: break-even orders per day and payback months. It never predicts "success".
- Competitor prices are observations with a date and a document; a gap is a prompt to review price, not a price draft.
- Goals and tasks are drafts (R16); a goal's target is a Ref to the snapshot that justified it.
- Live feeds (weather APIs) are out of scope for v1 (`INFERENCE`; no ADR names one).

## 3 · Snapshot templates

Types: `*_minor`, counts, `*_bp`, `*_milli`, `*_months` = `integer`; `*_id` = `uuid`; `*_on` = `date`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `market.signal_uplift` | past effect of a signal kind/label | `outlet_id`, `kind`, `label?`, `lookback_days` | `label` text, `occurrences` ← `core.market_signal`; `signal_day_orders`, `baseline_orders` ← `core.order`; `uplift_bp` ← both |
| `market.upcoming` | signals in the next N days with past effect | `outlet_id`, `days` | `on_date`, `kind` text, `label` text, `value_milli` ← `core.market_signal`; `hist_uplift_bp`, `occurrences` ← `core.order`, `core.market_signal`; `forecast_orders` ← `intel.forecast_point`; `baseline_orders`, `baseline_sales_minor` ← `core.order`; `expected_extra_sales_minor` (baseline × uplift) ← both |
| `market.ingredient_price` | one ingredient's price signals at the run's outlets over N days (NB-4; `ingredient_price` signals only) | `outlet_id`, `ingredient_id`, `days`, `as_of?` | `signal_id` uuid; `on_date` date; `outlet_id` uuid; `label`, `source` text; `value_minor` ← `core.market_signal`; `currency` text; `value_milli` ← `core.market_signal`; `unit` text; `unit_price_minor` (value ÷ quantity) ← both |
| `market.competitor_gap` | our price vs observed competitor price | `outlet_id`, `days` | `item_id`, `our_price_minor` ← `core.price`; `competitor_price_minor`, `observations` ← `core.market_signal`; `gap_bp` ← both; `monthly_units`, `units_rank`, `units_change_bp` ← `core.order_line`; `gap_exposure_minor` ((our − competitor) × monthly units) ← all |
| `market.viability` | break-even and payback for a case | `viability_case_id` | `rent_minor`, `capex_minor`, `avg_ticket_minor`, `expected_daily_orders` ← `core.viability_case`; `comparable_margin_bp`, `closed_months` ← `core.posting`, `core.period_close`; `breakeven_daily_orders`, `payback_months` ← both |
| `market.goal_progress` | goal pace | `goal_id` | `target_value` ← `core.goal`; `actual_value` ← `core.order`; `elapsed_bp` ← `core.goal`; `pace_bp`, `projected_miss_value` (target − actual ÷ elapsed; minor units when metric = `net_sales`) ← both |
| `market.goal_baseline` | basis for a proposed goal | `outlet_id`, `metric`, `months` | `last_month_value`, `best_month_value` ← `core.order` |
| `cares.listings` | Munim Cares surplus listings at an outlet (ADR-015 §1.6) | `outlet_id`, `status` | `listing_id`, `kind` text, `status` text, `recipient_id`, `pickup_from`, `pickup_to`, `pickup_on`, `pickup_weekday` text, `pickup_slot_start` text ← `core.cares_listing`; `lines` ← `core.cares_listing_line` |
| `cares.impact` | what an outlet shared through Munim Cares in a period, to simulated recipients (ADR-015 §1.6); Σ row first, then `donation`, then `offer`; voided hand-overs excluded | `outlet_id`, `from`, `to` | `kind` text, `handovers` ← `core.cares_handover`; `portions_milli`, `weight_g`, `volume_ml`, `units_milli` ← `core.cares_handover_line`; `value_at_cost_minor` ← `core.stock_movement` |

```sql
-- market.signal_uplift (illustrative)
with d as (select (o.promised_at at time zone ou.tz)::date day, count(*) n from core."order" o
           join core.outlet ou on ou.id = o.outlet_id where o.outlet_id=:outlet_id and o.status='completed'
             and o.promised_at > now() - make_interval(days=>:lookback_days) group by 1),
     s as (select distinct on_date, label from core.market_signal where kind=:kind and (outlet_id=:outlet_id or outlet_id is null))
select s.label, count(*) occurrences, avg(d.n)::int signal_day_orders,
       (select avg(n) from d d2 where extract(dow from d2.day) = extract(dow from s.on_date)
          and d2.day not in (select on_date from s))::int baseline_orders, …
from s join d on d.day = s.on_date group by s.label;
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `market.event_ahead` | `upcoming` | event within 7 days, \|`hist_uplift_bp`\| ≥ 2,000 on ≥ 2 `occurrences`, and `forecast_orders` within ±5% of `baseline_orders` (not yet reflected) | `<outlet>:<label>:<on_date>` | L on `expected_extra_sales_minor` |
| `market.competitor_undercut` | `competitor_gap` | `gap_bp` ≥ 1,000 (we are ≥ 10% dearer), `units_rank` ≤ 20, `observations` ≥ 2 (`days` = 30) | `<outlet>:<item>:<month>` | `low`; `medium` if `units_change_bp` ≤ −1,500 |
| `market.goal_off_track` | `goal_progress` | `pace_bp` < 7,000 with `elapsed_bp` ≥ 5,000 | `<goal>:<iso_week>` | `medium`; `high` if `elapsed_bp` ≥ 8,000 |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `market.event_ahead` | L | `upcoming.expected_extra_sales_minor` |
| `market.competitor_undercut` | `low` / `medium` | `competitor_gap.gap_exposure_minor` |
| `market.goal_off_track` | `medium` / `high` | `goal_progress.projected_miss_value` (₹ only for `net_sales` goals) |

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `goals.goal.create.v1` | NEW | `goal_id`, `outlet_id`, `metric` (`net_sales`\|`orders`), **`target`** ← `goal_baseline.best_month_value`, `due_on` |
| `goals.task.create.v1` | NEW (shared with `compliance`; `people` drafts it for Munim Cares) | `task_id`, `outlet_id`, `title_key`, `assignee_member_id`, `due_on`, `finding_id` — e.g. "raise paneer par before Diwali"; no numeric leaves |

Cross-pack: an `event_ahead` finding links the `inventory.shortfall` run and `kitchen.prep_list.create.v1` drafts; market
itself proposes no stock or price change.

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| weather/festival question with no approved `market_signal` rows for the outlet and dates | `signal_source_missing` NEW | "Cannot verify: no weather or festival calendar has been imported for {outlet} for {dates}. Import one to see what is coming." |
| viability asked with no comparable outlet having closed months, or the case lacks rent or capex | `insufficient_history` NEW (shared) | "Cannot verify: Munim needs closed months from a comparable outlet and the new site's rent and setup cost to work out break-even." |

## 8 · Dashboard panel

Tiles: events in the next 7 days ← `market.upcoming`; items where we are dearer ← `market.competitor_gap`; goals off
track ← `market.goal_progress`. Charts: past uplift by signal label ← `market.signal_uplift`; viability case card
(break-even orders/day, payback months) ← `market.viability`.

## 9 · Graph scope

Nodes `business`, `outlet`, `item`, `day`, `claim`, `page`, `finding`, `draft`; edges `sold`, `mentions`,
`supported_by`, `about`, `proposes`. Templates: `claim_support`, `neighbourhood` (depth ≤ 3) — no numbers on edges.

## 10 · Eval cases

| # | planted (worldgen via import files / commands) | ₹ key = impact column | expect |
|---|---|---|---|
| M1 | festival imported for next Friday; two past occurrences at +60% orders; forecast flat | `expected_extra_sales_minor` = baseline × 6,000 ÷ 10,000 | `event_ahead` |
| M1b | rain imported for Saturday; 3 past rain Saturdays at −30% orders; forecast flat | \|`expected_extra_sales_minor`\| = baseline × 3,000 ÷ 10,000 | `event_ahead` (over-prep risk) |
| M2 | competitor price list (import) 15% under our top SKU for 6 weeks | `gap_exposure_minor` = (our − competitor) × monthly units | `competitor_undercut` |
| M3 | goal: net sales target for the month; actual pace 55% at day 20 | `projected_miss_value` = target − actual ÷ (elapsed_bp ÷ 10,000) | `goal_off_track` |
| M4 | viability case: rent, capex, avg ticket; comparable outlet margin from 4 closed months | non-₹: `breakeven_daily_orders` = rent ÷ (ticket × margin) ÷ 30, recomputed by the key | figures equal key, cited |
| M5 abstain | "Will it rain on Saturday?" — no signals imported | — | `signal_source_missing` |
| M6 trap | regional festival in calendar with 2 past occurrences at +3% | 0 | no `event_ahead` |
