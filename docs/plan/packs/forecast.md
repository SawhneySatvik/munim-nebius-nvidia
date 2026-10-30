# Forecast service (`forecast`)

**Depends on:** R3 (deterministic forecast used by every pack); PDR §4, §6 (N5: WAPE vs seasonal-naive); 02-schema §3
(allow-listed numeric source `intel.forecast_point` with `inputs_snapshot_id`), §4; 03-arch §1.7; 04 §2–§3 (a tool, not an
agent); BOARD T-052 (beats naive on ≥ 2 of 4 worlds, or prints FAIL and ships naive). Prefix `forecast.`. Conventions,
debounce, ladder **L**: `catalogue.md` header; thresholds and method weights `INFERENCE`.

## 1 · Purpose and owner question

- **Both:** "How many of each item will we sell tomorrow, by slot?" — asked by packs more than by people: kitchen prep
  lists, inventory shortfall and reorder, people rosters, market notes. Shops forecast per SKU per day (slots optional).

## 2 · Skill brief (what the service does; no model call anywhere in it)

- Python in `intel/forecast`, deterministic, seeded; reads history **only** through snapshots; writes runs and points
  through core-api `forecasts:batch` (R25). Same inputs → byte-identical points.
- **Baseline — seasonal-naive:** ŷ(d) = y(d − 7) per outlet × item; slot split by the outlet's 8-week slot profile.
- **Better — `weighted_seasonal_v1`:** ŷ(d) = L × Σₖ wₖ·y(d − 7k), k = 1..4, w = (0.4, 0.3, 0.2, 0.1), skipping closed
  and signal days; level L = last-7-day actual ÷ last-7-day fitted, clipped to [0.8, 1.25]; on an approved
  `market_signal` day with ≥ 2 past occurrences, × measured uplift clipped to [0.5, 2.0].
- Intervals: p10/p90 of holdout residuals per outlet → `lo_qty_milli`, `hi_qty_milli`.
- **WAPE** = Σ|y − ŷ| ÷ Σ y over every outlet-item-day in the holdout; **bias** = Σ(ŷ − y) ÷ Σ y. Holdout: last 28 days,
  4 weekly origins, 7-day horizon.
- Serving rule (deterministic code, not an agent decision): per outlet, serve the method with the lower trailing 14-day WAPE.
- Scope: items covering 80% of an outlet's units (≤ 40 per outlet) individually; the rest as one `other` series.
  Ingredient demand is derived downstream (forecast × `recipe_line`), never stored.
- Fewer than 28 days of history → no points for that series (§7).

## 3 · Snapshot templates

Types: `*_milli`, `*_bp`, counts = `integer`; `*_id` = `uuid`; `business_on` = `date`; `slot_start` = `text`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `forecast.sales_history` | daily units per series (input) | `outlet_id`, `item_id`, `from`, `to` | `business_on`, `qty_milli` ← `core.order_line`, `core.order`; `closed` boolean ← `core.outlet_calendar` |
| `forecast.slot_profile` | share of units by slot (input) | `outlet_id`, `weeks`, `slot_minutes` | `weekday` integer, `slot_start`, `share_bp` ← `core.order_line`, `core.order` |
| `forecast.points` | served forecast (`forecast.get`) | `outlet_id`, `from`, `to`, `item_id?` | `item_id`, `business_on`, `slot_start`, `qty_milli`, `lo_qty_milli`, `hi_qty_milli` ← `intel.forecast_point`; `method` text |
| `forecast.accuracy` | live accuracy by method | `outlet_id`, `from`, `to` | `method` text, `actual_qty_milli` ← `core.order_line`; `forecast_qty_milli` ← `intel.forecast_point`; `wape_bp`, `bias_bp`, `days` ← both; `over_forecast_cost_minor` (Σ max(ŷ − y, 0) × recipe cost) ← + `core.recipe_line`, `core.supplier_price`; `under_forecast_sales_minor` (Σ max(y − ŷ, 0) × unit price) ← + `core.price` |
| `forecast.freshness` | latest run per outlet | — | `outlet_id`, `trained_through` date, `points` ← `intel.forecast_point` |

The 500-row snapshot cap (02-schema §3) is why inputs are one snapshot per series (≤ 182 days) plus one slot profile
(≤ 336 rows); each point's `inputs_snapshot_id` is its series snapshot.

```sql
-- forecast.sales_history (illustrative)
select (o.promised_at at time zone ou.tz)::date business_on, sum(ol.qty_milli) qty_milli, false closed
from core.order_line ol join core."order" o on o.id = ol.order_id and o.status = 'completed'
join core.outlet ou on ou.id = o.outlet_id
where o.outlet_id = :outlet_id and ol.item_id = :item_id and o.promised_at >= :from and o.promised_at < :to
group by 1 order by 1;   -- closed days unioned from core.outlet_calendar overrides
```

**Outputs** (`intel` schema; columns this pack needs): `forecast_run(id, run_id, method, trained_through, horizon_days,
holdout_days, wape_bp, baseline_wape_bp, bias_bp, created_at)` and `forecast_point(id, forecast_run_id, outlet_id,
item_id null = 'other', business_on, slot_start null = whole day, qty_milli, lo_qty_milli, hi_qty_milli, method,
inputs_snapshot_id)`. Every run writes **both** methods' points so live WAPE vs naive is always computable.

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `forecast.accuracy_drift` | `accuracy` | served method's 14-day `wape_bp` > naive's + 500 | `<outlet>:<iso_week>` | `medium` |
| `forecast.bias` | `accuracy` | \|`bias_bp`\| ≥ 1,500 over 14 days | `<outlet>:<iso_week>` | `medium`; `high` ≥ 3,000 |
| `forecast.stale` | `freshness` | `trained_through` < yesterday (outlet tz) for an active outlet | `<outlet>:<date>` | `high` (prep lists and shortfalls start refusing) |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `forecast.accuracy_drift` | `medium` | `accuracy.wape_bp` (non-₹) |
| `forecast.bias` | `medium` / `high` | `accuracy.over_forecast_cost_minor` if bias > 0, else `under_forecast_sales_minor` |
| `forecast.stale` | `high` | `freshness.trained_through` (non-₹) |

## 6 · Draft command types

None of its own — a deliberate deviation from BOARD D-1's literal "≥ 1 draft type" gate: forecast is a deterministic
service, not an agent (R3, 04 §2), and writes runs through `forecasts:batch` (R25), which changes no books. Its numbers reach people
as Refs inside other packs' drafts — `kitchen.prep_list.create.v1`, `purchasing.po.create.v1`,
`inventory.reorder_level.set.v1`, `people.roster.create.v1` — each citing `forecast.points` cells in `based_on`.

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| a series has under 28 days of sales | `insufficient_history` NEW (shared) | "Cannot verify: {item} at {outlet} has too little sales history to forecast yet." |
| a consumer asks for a date with no current run | `forecast_stale` NEW (shared with `kitchen`) | "Cannot verify: the forecast for {outlet} has not been refreshed since {date}." |

## 8 · Dashboard panel (inside each outlet's console; feeds N5)

Tiles: WAPE served method vs naive (28 d) ← `forecast.accuracy`; bias ← `forecast.accuracy`; last trained ←
`forecast.freshness`. Charts: forecast band vs actual per day ← `forecast.points`, `forecast.accuracy`.

## 9 · Graph scope

None. Forecasts are not projected; points are numbers and stay in `intel.forecast_point`.

## 10 · Eval cases (`evals/forecast`, all four worlds)

| # | planted (worldgen) | ₹ key = impact column | expect |
|---|---|---|---|
| FC1 | N5: no plant; 6 months per world | non-₹: WAPE(method), WAPE(naive) on holdout | method < naive on ≥ 2 of 4 worlds, else FAIL printed and naive served |
| FC2 | level shift: one outlet's orders −25% from week 20 | `over_forecast_cost_minor` over the bias window | `bias` fires within 14 days |
| FC3 | festival with 2 past occurrences at +60%, imported as signal | `under_forecast_sales_minor`, naive vs method (non-finding; N5 detail) | method's ₹ < naive's |
| FC2b | level shift up: a new office opens nearby, outlet orders +30% from week 22 | `under_forecast_sales_minor` over the bias window | `bias` (negative) fires within 14 days |
| FC4 | the nightly run skipped for one outlet | — | `forecast.stale` `high`; prep list refuses `forecast_stale` |
| FC5 abstain | item launched 10 days ago | — | no points; `insufficient_history` |
| FC6 trap | outlet closed for a holiday (calendar override) | 0 | closed day excluded; no `accuracy_drift` |

₹ cases are FC2, FC2b (findings) and FC3 (comparison) — one short of the ≥ 4 target: the service's other plants are
accuracy, freshness and abstention cases that carry no money of their own.
