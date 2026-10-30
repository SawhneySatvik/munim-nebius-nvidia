# Pack — People (`people`)

**Depends on:** PDR §4–§5 (no AU payroll); R16, R21; R4 K10 and §D item 7 (AU: rosters only); 02-schema §2.8–§2.11;
04 §5, §9; IN/AU packs (`payroll_scope`). Prefix `people.`. Conventions, debounce, ladder **L**: `catalogue.md`
header; thresholds `INFERENCE`. Spec §10 plants "overtime drift".

## 1 · Purpose and owner question

- **Restaurant:** "Am I paying for more hours than the day's orders need, and where is overtime creeping in?"
- **Shop:** "Is the counter staffed to footfall, and are advances to staff being recovered?"
- **AU (both):** rosters only — "Is next week's roster right for the forecast?" Payroll stays in the owner's payroll software.

## 2 · Skill brief

- Labour cost = attended minutes × `staff.wage_rate_minor` (hourly; monthly staff pro-rated by contract minutes).
- Overtime drift is measured against the **roster**, not a statutory limit: attended minutes beyond rostered minutes,
  costed at `ot_multiplier_bp`. Munim does not interpret labour law (`INFERENCE`: safer than encoding thresholds).
- Demand per slot comes from `intel.forecast_point`; the productivity norm is the outlet's own 8-week median orders
  per labour-hour for that slot — never an industry benchmark.
- Rosters and payroll drafts are drafts (R16); payroll exists only where the pack's `payroll_scope = 'drafts'` (IN).
- Findings name shifts and slots; they never rank or judge individual people's worth.
- Overtime is judged per **whole ISO week** (outlet-local Monday–Sunday) and paid in the month the week **ends**: a
  payroll month covers the ISO weeks whose Sunday falls in it, for both base hours and overtime (R2-S2-7; a week split
  at the month boundary would pay overtime on one half that the other half cancels). `INFERENCE`, W2 fix cycle 1.
- Advances are append-only entries (`given` / `recovered`); outstanding = Σ given − Σ recovered. A `given` advance and a
  direct `recovered` one post staff advances (1250) against the bank (`finance.post_advance`); a recovery made through a
  payroll is posted by that payroll.
- Without attendance for the period, it refuses rather than assuming rostered = worked.

## 3 · Snapshot templates

Types: `*_minor`, `*_min`, `*_bp`, counts = `integer`; `*_id` = `uuid`; `business_on` = `date`; `slot_start` = `text`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `people.labour_vs_demand` | hours vs demand per slot | `outlet_id`, `from`, `to`, `slot_minutes` | `business_on`, `slot_start`, `attended_min` ← `core.attendance`; `rostered_min` ← `core.roster_shift`; `orders` ← `core.order`; `forecast_orders` ← `intel.forecast_point`; `needed_min` ← `core.order`, `core.attendance` (8-week median norm); `excess_cost_minor` ← `core.attendance`, `core.staff` |
| `people.overtime_drift` | attended beyond roster per staff per week | `outlet_id`, `from`, `to` | `staff_id`, `iso_week` text, `rostered_min` ← `core.roster_shift`; `attended_min` ← `core.attendance`; `extra_min` ← both; `extra_cost_minor` ← both + `core.staff` |
| `people.labour_pct` | labour cost ÷ net sales per week | `outlet_id`, `from`, `to` | `iso_week` text, `labour_minor` ← `core.attendance`, `core.staff`; `net_sales_minor` ← `core.order`; `labour_bp` ← both; `target_bp` ← `core.business_policy`; `excess_labour_minor` (labour − target × sales) ← all |
| `people.attendance_coverage` | rostered shifts with attendance | `outlet_id`, `from`, `to` | `rostered_shifts` ← `core.roster_shift`; `attended_shifts` ← `core.attendance`; `coverage_bp` ← both |
| `cares.pickup_crew` | rostered staff covering a Munim Cares listing's pickup slot, cheapest rate first (rates order only, never output; ADR-015 §1.6) | `outlet_id`, `listing_id` | `staff_id`, `member_id` ← `core.roster_shift`, `core.staff` |
| `people.advances_open` | outstanding advances | `outlet_id` | `staff_id`, `outstanding_minor` ← `core.advance`; `days_since_given` ← `core.advance` |
| `people.payroll_lines` (IN) | per-staff pay for a month | `outlet_id`, `period_month` | `staff_id`, `base_minor` ← `core.staff`, `core.attendance`; `overtime_minor` ← `core.attendance`, `core.roster_shift`, `core.staff`; `advance_recovery_minor` ← `core.advance`; `tips_minor` ← `core.tip_pool`; `net_minor` ← all |

```sql
-- people.overtime_drift (illustrative)
with r as (select staff_id, to_char(starts_at,'IYYY-IW') wk, sum(extract(epoch from ends_at-starts_at)/60)::int m
           from core.roster_shift where outlet_id=:outlet_id and starts_at between :from and :to group by 1,2),
     a as (select staff_id, to_char(clock_in_at,'IYYY-IW') wk, sum(extract(epoch from clock_out_at-clock_in_at)/60)::int m
           from core.attendance where outlet_id=:outlet_id and clock_in_at between :from and :to group by 1,2)
select a.staff_id, a.wk iso_week, r.m rostered_min, a.m attended_min, greatest(a.m-coalesce(r.m,0),0) extra_min,
       greatest(a.m-coalesce(r.m,0),0) * s.wage_rate_minor * s.ot_multiplier_bp / 600000 extra_cost_minor
from a left join r using (staff_id, wk) join core.staff s on s.id = a.staff_id;
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `people.overtime_drift` | `overtime_drift` | Σ `extra_min` ≥ 600 (10 h) per staff in 4 weeks and week 4 > week 1 | `<outlet>:<staff>:<iso_week>` | L on 4-week `extra_cost_minor` |
| `people.overstaffed_slot` | `labour_vs_demand` | `attended_min` ≥ 1.5 × `needed_min` on ≥ 4 of the last 6 same-weekday slots | `<outlet>:<weekday>:<slot>` | L on monthly `excess_cost_minor` |
| `people.labour_pct_high` | `labour_pct` | `labour_bp` ≥ `target_bp` (policy; seeded 3,500) for 2 consecutive weeks | `<outlet>:<iso_week>` | L on 4.3 × weekly `excess_labour_minor` |
| `people.advance_unrecovered` (IN) | `advances_open` | `outstanding_minor` ≥ ₹2,000 and `days_since_given` > 60 | `<staff>:<month>` | L |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `people.overtime_drift` | L | `overtime_drift.extra_cost_minor` (4-week Σ row) |
| `people.overstaffed_slot` | L | `labour_vs_demand.excess_cost_minor` |
| `people.labour_pct_high` | L | `labour_pct.excess_labour_minor` |
| `people.advance_unrecovered` | L | `advances_open.outstanding_minor` |

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `people.roster.create.v1` | NEW | `roster_id`, `outlet_id`, `week_start`, `shifts[]{roster_shift_id, staff_id, starts_at, ends_at, role}` — no numeric leaves; `based_on` = `forecast_orders` and `needed_min` cells |
| `goals.task.create.v1` | NEW; workflow draftable only, from `overstaffed_slot` (ADR-015 §4; before it, that finding drafted nothing) | `task_id`, `outlet_id`, `title_key` = `cares.task.pack_and_hand_over`, `assignee_member_id` ← `cares.pickup_crew.member_id`, `due_on` ← `cares.listings.pickup_on`, `finding_id`, `cares_listing_id` ← `cares.listings.listing_id` — no numeric leaves; abstains `no_rostered_staff` when no one is rostered on the slot |
| `people.payroll_draft.create.v1` | NEW, IN only (pack `payroll_scope = 'drafts'`) | `payroll_draft_id`, `outlet_id`, `period_month`, `lines[]{staff_id, **base_minor** ← `payroll_lines.base_minor`, **overtime_minor** ← `payroll_lines.overtime_minor`, **advance_recovery_minor** ← `payroll_lines.advance_recovery_minor`, **tips_minor** ← `payroll_lines.tips_minor`, **net_minor** ← `payroll_lines.net_minor`}`, `currency` |

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| overtime or labour cost asked where `attendance_coverage.coverage_bp` < 8,000 | `attendance_missing` NEW | "Cannot verify: attendance was not recorded for most shifts at {outlet} in {dates}, so hours worked are unknown." |
| payroll asked by an AU tenant (pack `payroll_scope = 'roster_only'`) | `payroll_out_of_scope` NEW | "Not available: for businesses in {country}, Munim prepares rosters only. Run payroll in your payroll software." |

## 8 · Dashboard panel

Tiles: labour % of sales this week ← `people.labour_pct`; overtime cost (4 weeks) ← `people.overtime_drift`; excess
labour cost (30 d) ← `people.labour_vs_demand`; attendance coverage ← `people.attendance_coverage`; open advances (IN) ←
`people.advances_open`. Charts: attended vs needed minutes per slot ← `people.labour_vs_demand`.

## 9 · Graph scope

Nodes `person`, `outlet`, `day`, `finding`, `draft`; edges `works_at`, `about`, `proposes`. Template:
`neighbourhood` (depth ≤ 2). Wage rates never ride on edges.

## 10 · Eval cases

| # | planted (worldgen via attendance/roster commands) | ₹ key = impact column | expect |
|---|---|---|---|
| P1 | one cook clocks out +45 min after roster on 70% of shifts from week 8 | `extra_cost_minor` = Σ extra_min ÷ 60 × rate × OT multiplier | `overtime_drift` |
| P2 | two extra staff Tue–Wed 15:00–18:00 while orders flat | `excess_cost_minor` = Σ excess min ÷ 60 × rate | `overstaffed_slot` |
| P3 | ₹15,000 advance (IN), no recovery for 90 days | `outstanding_minor` = 15,000 | `advance_unrecovered` |
| P4 | new hires at one outlet push labour to 41% of sales for 3 weeks | `excess_labour_minor` = Σ (labour − 3,500 bp × sales) | `labour_pct_high` |
| P5 abstain | outlet stops recording attendance for 3 weeks; overtime asked | — | `attendance_missing` |
| P6 abstain | AU café owner asks for payroll | — | `payroll_out_of_scope` |
| P7 trap | festival week: long shifts were **rostered** in advance and worked as rostered | 0 | no `overtime_drift` |
