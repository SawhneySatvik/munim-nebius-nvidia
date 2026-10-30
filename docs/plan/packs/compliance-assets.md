# Pack — Compliance & assets (`compliance`)

**Depends on:** PDR §4; spec §4.1 (licences, temperature and hygiene logs, equipment, AMCs, maintenance, energy);
R21 (calendar from the pack); R4 §D §3 (AU: logs are an "evidence record", never a certificate); 02-schema §2.8–§2.11;
IN/AU packs (`compliance_calendar`, `tax_ids`). Prefix `compliance.`. Conventions, debounce, ladder **L**:
`catalogue.md` header; thresholds `INFERENCE`.

## 1 · Purpose and owner question

- **Restaurant:** "Which licence lapses next, were today's temperature and cleaning checks done, and which equipment
  is costing me money?"
- **Shop:** "Are my chillers holding temperature, which registrations are due, and am I paying twice for repairs?"

## 2 · Skill brief

- Required licence kinds come from the country pack as template params (R21). Packs today hold only `tax_ids` (IN
  GSTIN, FSSAI; AU ABN); trade licence, fire NOC (spec §4.1) and AU food-business registration (R4 §D §3) need a pack
  `licence_kinds` list (contracts addition).
- Logs are **evidence records**, not certificates: Munim never says an outlet "is compliant" (§7).
- Coverage = runs done ÷ runs expected by the checklist's frequency in outlet local time.
- A temperature excursion = a reading outside the asset's safe range; consecutive readings matter more than one.
- Equipment ₹ comes only from recorded `maintenance` and `amc` costs and utility `expense` rows.
- Energy is tracked as utility expense per order (no meter table) — a drift signal, not an engineering diagnosis.
- Renewal and maintenance actions are drafts assigned to a named manager (R16); Munim files nothing with a regulator.

## 3 · Snapshot templates

Types: `*_minor`, counts, `days_*`, `*_bp`, `*_milli_c` = `integer`; `*_id` = `uuid`; `*_on` = `date`.

| id | purpose | params | output columns ← numeric source |
|---|---|---|---|
| `compliance.licence_calendar` | licences vs required kinds | `as_of`, `required_kinds[]` | `outlet_id`, `kind` text, `licence_id`, `valid_to`, `days_left` ← `core.licence`; `missing` boolean |
| `compliance.log_coverage` | checklist and temp-log coverage | `outlet_id`, `from`, `to` | `checklist_id`, `expected_runs` ← `core.checklist`; `done_runs` ← `core.checklist_run`; `coverage_bp` ← both; `temp_expected`, `temp_logged` ← `core.asset`, `core.temp_log` |
| `compliance.temp_excursions` | readings out of range per asset-day | `outlet_id`, `from`, `to` | `asset_id`, `logged_on`, `readings`, `out_of_range`, `max_milli_c` ← `core.temp_log`, `core.asset`; `temp_waste_minor` ← `core.stock_movement`, `core.waste_log` |
| `compliance.asset_costs` | repairs, AMCs, overlaps | `outlet_id`, `from`, `to` | `asset_id`, `repairs_under_amc_minor` ← `core.maintenance`, `core.amc`; `amc_overlap_days`, `amc_overlap_minor` ← `core.amc`; `amc_waste_minor` (sum of both) ← all; `preventive_overdue_days`, `last_preventive_cost_minor` ← `core.maintenance` |
| `compliance.energy_per_order` | utility cost per order per month | `outlet_id`, `months` | `month_on`, `utility_minor` ← `core.expense`; `orders` ← `core.order`; `per_order_minor`, `median_per_order_minor`, `energy_excess_minor` ((per_order − median) × orders) ← both |

```sql
-- compliance.asset_costs, repairs billed while an AMC was valid (illustrative)
select m.asset_id, sum(m.cost_minor) filter (where m.kind='breakdown' and a.id is not null) repairs_under_amc_minor
from core.maintenance m left join core.amc a on a.asset_id = m.asset_id
  and m.done_on between a.valid_from and a.valid_to
where m.done_on between :from and :to and m.asset_id in (select id from core.asset where outlet_id=:outlet_id)
group by m.asset_id;
```

## 4 · Detectors

| id | template | threshold | dedupe_key suffix | severity |
|---|---|---|---|---|
| `compliance.licence_expiring` | `licence_calendar` | `days_left` ≤ 30, or `missing` | `<outlet>:<kind>:<valid_to>` | `critical` if ≤ 7 days, expired or missing; else `high` |
| `compliance.missed_logs` | `log_coverage` | `coverage_bp` < 9,000 over 7 days (any daily checklist or temp log) | `<outlet>:<checklist>:<iso_week>` | `medium`; `high` < 6,000 |
| `compliance.temp_excursion` | `temp_excursions` | `out_of_range` ≥ 2 for one asset-day | `<asset>:<date>` | `high`; L on `temp_waste_minor` if larger |
| `compliance.amc_waste` | `asset_costs` | `amc_waste_minor` ≥ ₹1,000 (A$20) in 90 days | `<asset>:<quarter>` | L |
| `compliance.maintenance_overdue` | `asset_costs` | `preventive_overdue_days` > 14 | `<asset>:<due_on>` | `medium` |
| `compliance.energy_drift` | `energy_per_order` | `per_order_minor` ≥ 1.3 × `median_per_order_minor` (prior 3 months) | `<outlet>:<month>` | L on `energy_excess_minor` |

## 5 · Finding types

| type | severity | impact column |
|---|---|---|
| `compliance.licence_expiring` | `high` / `critical` | `licence_calendar.days_left` |
| `compliance.missed_logs` | `medium` / `high` | `log_coverage.coverage_bp` |
| `compliance.temp_excursion` | `high` / L | `temp_excursions.temp_waste_minor` when > 0, else `out_of_range` (non-₹) |
| `compliance.amc_waste` | L | `asset_costs.amc_waste_minor` |
| `compliance.maintenance_overdue` | `medium` | `asset_costs.preventive_overdue_days` (non-₹) |
| `compliance.energy_drift` | L | `energy_per_order.energy_excess_minor` |

## 6 · Draft command types

| command | status | payload fields (Ref ← cell) |
|---|---|---|
| `goals.task.create.v1` | NEW (shared with `market`) | `task_id`, `outlet_id`, `title_key`, `assignee_member_id`, `due_on`, `finding_id` — e.g. renew a licence, fix log discipline; no numeric leaves |
| `compliance.maintenance.schedule.v1` | NEW | `maintenance_id`, `asset_id`, `kind` (`preventive`\|`inspection`), `due_on`, **`estimated_cost_minor`** ← `asset_costs.last_preventive_cost_minor`, `vendor_note` |

## 7 · Visible refusals

| condition | `reason_code` | copy |
|---|---|---|
| "Are we compliant / FSSAI-ready / audit-ready?" | `not_a_certificate` NEW | "Cannot verify: Munim keeps licence, temperature and cleaning records as evidence. It cannot certify that {outlet} is compliant." |
| temperature question for an asset-day with no readings | `log_coverage_missing` NEW | "Cannot verify: no temperature readings were logged for {asset} on {dates}, so Munim cannot say whether it stayed in range." |

## 8 · Dashboard panel

Tiles: licences due in 30 days ← `compliance.licence_calendar`; log coverage this week ← `compliance.log_coverage`;
excursions (7 d) ← `compliance.temp_excursions`; repairs paid under AMC (90 d) ← `compliance.asset_costs`; utility per
order ← `compliance.energy_per_order`. Charts: licence timeline per outlet; coverage by checklist per day.

## 9 · Graph scope

Nodes `outlet`, `day`, `finding`, `draft`, `page`; edges `about`, `proposes`, `supported_by` (finding → log rows via
claims). Template: `neighbourhood` (depth ≤ 2). Assets and licences are not graph labels in 02-schema §6 — none added.

## 10 · Eval cases

| # | planted (worldgen via commands) | ₹ key = impact column | expect |
|---|---|---|---|
| A1 | chiller logs 9–11 °C on 3 readings a day for 2 days; 14 kg dairy wasted with reason `temperature` | `temp_waste_minor` = Σ waste value | `temp_excursion` `high` |
| A2 | 3 breakdown repairs billed on a fridge under a valid AMC | `amc_waste_minor` = Σ repair costs | `amc_waste` |
| A3 | AMC renewed early: two AMCs overlap 75 days | `amc_waste_minor` = 75 × annual cost ÷ 365 | `amc_waste` |
| A4 | compressor fault: utility expense +40% for 2 months, orders flat | `energy_excess_minor` | `energy_drift` |
| A5 | outlet 2 FSSAI licence `valid_to` in 20 days | non-₹ (`days_left` = 20) | `licence_expiring` `high` + task draft |
| A6 | closing checklist done 4 of 7 days | non-₹ (coverage = 4 ÷ 7) | `missed_logs` `high` |
| A7 abstain | "Is outlet 1 FSSAI compliant?" | — | `not_a_certificate` |
| A8 trap | a single 9 °C reading during a delivery, next reading in range | 0 | no `temp_excursion` (needs ≥ 2 in 24 h) |
