# Pack — Kitchen operations (`kitchen`)

**Depends on:** PDR §4; 02-schema §2.4 (`kitchen_ticket`, `order_event`, `void`, `refund`), §2.5 (`waste_log`); R4 §E
items 11–13; R16; 04 §5, §9; contracts `commands/orders.ts` (`kitchen.ticket.advance.v1`). Prefix `kitchen.`.
Conventions (thresholds `INFERENCE`, debounce, ladder **L**, params, ₹ keys, Σ rows, Refs): `catalogue.md` header.

## 1 · Purpose and owner question

- **Restaurant / cloud kitchen:** "Which station or dish is making orders late, what is lateness costing me, and what
  prep time should we promise?"
- **Shop:** not applicable — the pack is off for `outlet.kind = 'store'` (spec §4.1 marks it restaurant-only).

## 2 · Skill brief

- Ticket time = `ready_at − accepted_at`; lateness = `ready_at − due_at`; per station, per item, per 30-min slot.
- Judges a slot against the same slot's own history and load; a busy festival night is not drift.
- Lateness ₹ = refunds with reason `late` + orders cancelled after `due_at` — only recorded money, never "lost sales".
- Remakes (voids with reason `remake`) and over-prep (waste with reason `overprep`) are the other kitchen ₹ leaks.
- Prep time proposals compare observed p80 with the configured prep time (`core.prep_time`, schema gap).
- Prep lists = forecast demand × recipe − on-hand, capped by par; always a draft for the manager (R16).
- Status changes only via `order_status_transition`; findings name stations, dishes and slots, never people.

## 3 · Snapshot templates

Types: `*_sec`, `*_minor`, `*_milli`, `*_bp`, counts = `integer`; `*_id` = `uuid`; `station`, `slot_start` = `text`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `kitchen.ticket_times` | p50/p80 per station/item/slot | `outlet_id`, `from`, `to` | `station`, `item_id`, `slot_start`, `tickets`, `p50_sec`, `p80_sec`, `late_tickets` ← `core.kitchen_ticket`; `configured_prep_sec` ← `core.prep_time` |
| `kitchen.ticket_drift` | this week vs trailing 4 weeks, same slot | `outlet_id`, `week_start` | `station`, `slot_start`, `tickets_now`, `p80_now_sec`, `p80_base_sec`, `drift_bp`, `load_ratio_bp` ← `core.kitchen_ticket`; `late_loss_minor` (Σ row) ← `core.refund`, `core.order`, `core.order_event` |
| `kitchen.remakes_overprep` | remake voids and over-prep waste per week | `outlet_id`, `week_start` | `station`, `remakes` ← `core.void`; `remake_minor` ← `core.void`, `core.order_line`; `orders` ← `core.order`; `overprep_minor`, `median_overprep_minor` ← `core.stock_movement`, `core.waste_log` |
| `kitchen.prep_need` | tomorrow's prep quantities | `outlet_id`, `business_date` | `ingredient_id`, `forecast_qty_milli` ← `intel.forecast_point`, `core.recipe_line`; `on_hand_qty_milli` ← `core.stock_movement`; `par_qty_milli` ← `core.reorder_level`; `prep_qty_milli` ← all |
| `kitchen.ticket_coverage` | tickets with both timestamps | `outlet_id`, `from`, `to` | `tickets`, `timed_tickets`, `coverage_bp` ← `core.kitchen_ticket` |

```sql
-- kitchen.ticket_drift (illustrative)
with t as (select station, to_char(date_bin('30 min', accepted_at, :week_start), 'HH24:MI') slot,
                  extract(epoch from ready_at-accepted_at)::int sec, accepted_at >= :week_start is_now
           from core.kitchen_ticket where outlet_id=:outlet_id and ready_at is not null and accepted_at is not null
             and accepted_at >= :week_start - interval '28 days' and accepted_at < :week_start + interval '7 days')
select station, slot,
       percentile_disc(0.8) within group (order by sec) filter (where is_now)     p80_now_sec,
       percentile_disc(0.8) within group (order by sec) filter (where not is_now) p80_base_sec,
       count(*) filter (where is_now) * 4 * 10000 / nullif(count(*) filter (where not is_now),0) load_ratio_bp
from t group by station, slot;
-- late_loss_minor: Σ refund.amount_minor (reason 'late') + Σ order.total_minor cancelled after due_at, same week
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `kitchen.ticket_drift` | `ticket_drift` | `drift_bp` ≥ 2,500, `tickets_now` ≥ 30, `load_ratio_bp` < 13,000 | `<outlet>:<station>:<slot>:<iso_week>` | L on 4.3 × `late_loss_minor`; at least `medium` if `p80_now_sec` − `p80_base_sec` ≥ 300 |
| `kitchen.remakes` | `remakes_overprep` | `remake_minor` ≥ ₹1,000 (A$20) in a week and `remakes` ≥ 2% of `orders` | `<outlet>:<station>:<iso_week>` | L |
| `kitchen.overprep` | `remakes_overprep` | `overprep_minor` ≥ 1.5 × `median_overprep_minor` and ≥ ₹1,000 (A$20) | `<outlet>:<iso_week>` | L |
| `kitchen.prep_time_gap` | `ticket_times` | \|`p80_sec` − `configured_prep_sec`\| ≥ 180 and `tickets` ≥ 50 (14-day window) | `<outlet>:<item>:<station>` | `medium` if slower than promised, else `low` |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `kitchen.ticket_drift` | L / `medium` | `ticket_drift.late_loss_minor` (Σ row) |
| `kitchen.remakes` | L | `remakes_overprep.remake_minor` |
| `kitchen.overprep` | L | `remakes_overprep.overprep_minor` |
| `kitchen.prep_time_gap` | `medium` / `low` | `ticket_times.p80_sec` (non-₹) |

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `kitchen.prep_time.set.v1` | NEW | `outlet_id`, `item_id`, `station`, **`prep_sec`** ← `ticket_times.p80_sec`, `valid_from` |
| `kitchen.prep_list.create.v1` | NEW | `prep_list_id`, `outlet_id`, `business_date`, `lines[]{ingredient_id, **qty_milli** ← `prep_need.prep_qty_milli`, unit}`; `based_on` = forecast and on-hand cells |

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| "why are orders late" when `ticket_coverage.coverage_bp` < 8,000 | `ticket_times_missing` NEW | "Cannot verify: too few tickets at {outlet} were marked accepted and ready to measure kitchen times. Ask staff to bump tickets on the KDS." |
| prep list asked for a date with no current forecast | `forecast_stale` NEW (shared with `forecast`) | "Cannot verify: there is no current forecast for {outlet} on {date}, so a prep list cannot be drafted." |

## 8 · Dashboard panel

Tiles: p80 ticket time today ← `kitchen.ticket_times`; late tickets (7 d) ← `kitchen.ticket_times`; lateness ₹ (7 d) ←
`kitchen.ticket_drift`; remake + over-prep ₹ (7 d) ← `kitchen.remakes_overprep`; timestamp coverage ← `kitchen.ticket_coverage`.
Charts: p80 by station × slot heatmap ← `kitchen.ticket_times`; drift vs baseline ← `kitchen.ticket_drift`.

## 9 · Graph scope

Nodes `outlet`, `item`, `day`, `finding`, `draft`; edges `sold`, `about`, `proposes`. Template: `neighbourhood` (depth ≤ 2)
from a kitchen finding to the dishes and day involved. No money on edges.

## 10 · Eval cases

| # | planted (worldgen, via API) | ₹ key = impact column | expect |
|---|---|---|---|
| K1 | tandoor: from week 14, Fri–Sat 20:00–21:30 tickets ready 7 min later; 4% of those orders refunded `late` | `late_loss_minor` = Σ late refunds | `ticket_drift` |
| K1b | outlet 2 fryer: weekday lunch tickets +6 min; 3% of orders cancelled after `due_at` | `late_loss_minor` = Σ late-cancelled order totals | `ticket_drift` |
| K2 | grill: 3% of orders voided `remake` for 4 weeks | `remake_minor` = Σ remake void amounts | `remakes` |
| K3 | prep lists ignored: waste `overprep` ×2.5 for 2 weeks | `overprep_minor` (week) | `overprep` |
| K4 | biryani configured 600 s, real p80 900 s over 300 tickets | non-₹ (p80 = 900 s) | `prep_time_gap` + prep-time draft citing the cell |
| K5 abstain | one outlet's staff never bump "ready" for a week | — | `ticket_times_missing` |
| K6 trap | Diwali night: ticket times +30% while orders +80% in the slot | 0 | no `ticket_drift` (`load_ratio_bp` ≥ 13,000) |
