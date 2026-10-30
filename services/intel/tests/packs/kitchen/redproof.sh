#!/usr/bin/env bash
# Red-proof for the b-46 gates (T-045 Kitchen, T-048 People), as tests/watch/redproof.sh: in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test (a crash, an unrelated failure) fails this script. The e2e plants rerun the
# 100-day stack (~90 s each); `--offline` skips them.
#   services/intel/tests/packs/kitchen/redproof.sh [--offline]
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
offline=0
case "${1:-}" in "") ;; --offline) offline=1 ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
src=$(cd "$(dirname "$0")/../../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-b46-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache --exclude .claude "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")

intel="$copy/services/intel"
failures=0
run_pytest() { (cd "$intel" && uv run --quiet --frozen pytest -q -p no:warnings "$@") > "$copy/.out" 2>&1; }

replace() {
  python3 - "$copy/$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
PY
}

# plant <label> <expected test> <pytest target> <file> <old> <new>
plant() {
  local label=$1 expect=$2 target=$3 file=$4 old=$5 new=$6
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! replace "$file" "$old" "$new"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$target"; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "FAILED $expect" "$copy/.out"; then
    echo "  red:   pytest exits non-zero and names '$expect'"
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

K=munim_intel/watch/detectors/kitchen
P=munim_intel/watch/detectors/people
I=services/intel
KO=tests/packs/kitchen/test_kitchen_offline.py
PO=tests/packs/people/test_people_offline.py
KE=tests/packs/kitchen/test_kitchen_e2e.py
PE=tests/packs/people/test_people_e2e.py

echo "baseline:"
targets=("$KO" "$PO")
[ $offline = 1 ] || targets+=("$KE" "$PE")
if run_pytest "${targets[@]}"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# kitchen — offline
plant "drift bar read as >" "$KO::test_ticket_drift_fires_at_the_bars_cites_the_sigma_rows_loss_and_skips_a_loaded_slot" $KO $I/$K/ticket_drift.py \
  'drift >= t["drift_bp_gte"]' 'drift > t["drift_bp_gte"]'
plant "K6 load bar read as <=" "$KO::test_ticket_drift_fires_at_the_bars_cites_the_sigma_rows_loss_and_skips_a_loaded_slot" $KO $I/$K/ticket_drift.py \
  'load < t["load_ratio_bp_lt"]' 'load <= t["load_ratio_bp_lt"]'
plant "drift impact on the slot row, not the Σ row" "$KO::test_ticket_drift_fires_at_the_bars_cites_the_sigma_rows_loss_and_skips_a_loaded_slot" $KO $I/$K/ticket_drift.py \
  'return [Hit(i, total, ' 'return [Hit(i, i, '
plant "no medium floor for a 300 s gap" "$KO::test_ticket_drift_severity_floor_needs_a_300_second_gap" $KO $I/$K/ticket_drift.py \
  'if gap >= t["medium_p80_gap_sec_gte"] else s' 'if False else s'
plant "remake share ignores the week's orders" "$KO::test_remakes_judge_a_station_against_the_weeks_orders_on_the_sigma_row" $KO $I/$K/remakes.py \
  '>= t["remake_share_bp_gte"] * orders' '>= 0'
plant "over-prep ignores the median" "$KO::test_overprep_fires_on_the_sigma_row_at_one_and_a_half_times_the_median_and_one_thousand_rupees" $KO $I/$K/overprep.py \
  'amount * 10_000 >= t["overprep_vs_median_bp_gte"] * median' 'True'
plant "prep time judged on per-slot rows too" "$KO::test_prep_time_gap_one_finding_per_dish_on_its_whole_window_row_with_a_prep_time_draft_citing_p80" $KO $I/$K/prep_time_gap.py \
  ' or row.get("slot_start") is not None:' ':'
plant "prep time draft cites the configured time" "$KO::test_prep_time_gap_one_finding_per_dish_on_its_whole_window_row_with_a_prep_time_draft_citing_p80" $KO $I/$K/prep_time_gap.py \
  '    p80 = d.ref("p80_sec")' '    p80 = d.ref("configured_prep_sec")'
plant "kitchen runs at shops" "$KO::test_a_shop_mints_no_kitchen_template_and_restaurants_and_cloud_kitchens_do" $KO $I/$K/weeks.py \
  'frozenset({"restaurant", "cloud_kitchen"})' 'frozenset({"restaurant", "cloud_kitchen", "store"})'
plant "a digit in the kitchen skill" "$KO::test_the_kitchen_skill_is_valid_cites_without_digits_and_binds_seven_tools" $KO $I/munim_intel/skills/kitchen/skill.py \
  'a busy festival night is load' 'a busy night (2x orders) is load'
plant "a digit in a kitchen narration" "$KO::test_kitchen_narrations_have_no_digit_and_cite_only_their_templates_columns" $KO $I/$K/ticket_drift.py \
  'against {p80_base_sec} in the weeks' 'against {p80_base_sec} in the 4 weeks'
plant "ticket coverage floor read as <=" "$KO::test_the_kitchen_refusals_fire_below_the_coverage_floor_and_without_a_forecast" $KO $I/munim_intel/skills/kitchen/skill.py \
  'cov < COVERAGE_FLOOR_BP else None' 'cov <= COVERAGE_FLOOR_BP else None'

# people — offline
plant "overtime without the growth clause" "$PO::test_overtime_drift_needs_600_minutes_in_four_weeks_and_a_growing_last_week" $PO $I/$P/overtime_drift.py \
  ' and extra[last] * 7 > extra.get(first, 0) * days_so_far:' ':'
plant "overtime: a partial last week compared whole (R-B polish)" "$PO::test_overtime_drift_compares_a_partial_last_week_per_day" $PO $I/$P/overtime_drift.py \
  'extra[last] * 7 > extra.get(first, 0) * days_so_far' 'extra[last] > extra.get(first, 0)'
plant "overtime bar read as >" "$PO::test_overtime_drift_needs_600_minutes_in_four_weeks_and_a_growing_last_week" $PO $I/$P/overtime_drift.py \
  'total >= t["extra_min_gte"]' 'total > t["extra_min_gte"]'
plant "overtime impact on the last week, not the member's Σ row" "$PO::test_overtime_drift_needs_600_minutes_in_four_weeks_and_a_growing_last_week" $PO $I/$P/overtime_drift.py \
  'hits.append(Hit(week[last], s, ' 'hits.append(Hit(week[last], week[last], '
plant "over-staffed against a zero need" "$PO::test_p2_fixture_overstaffed_slot_on_four_of_six_tuesdays" $PO $I/$P/overstaffed_slot.py \
  'needed is not None and needed > 0 and' 'needed is not None and'
plant "over-staffed on 3 of 6" "$PO::test_p2_fixture_overstaffed_slot_on_four_of_six_tuesdays" $PO $I/$P/overstaffed_slot.py \
  'if len(over) >= t["slots_gte"]:' 'if len(over) >= t["slots_gte"] - 1:'
# R47 D6: labour_vs_demand v2 — the impact and the ladder are the weekday-slot's own Σ cell; one finding per weekday-slot.
plant "P2 impact on the slot row, not the Σ" "$PO::test_p2_fixture_overstaffed_slot_on_four_of_six_tuesdays" $PO $I/$P/overstaffed_slot.py \
  'hits.append(Hit(over[-1], sigma[k], severity(rows[sigma[k]], t, ladder)))' 'hits.append(Hit(over[-1], over[-1], severity(rows[sigma[k]], t, ladder)))'
plant "P2 severity from a slot row, not the Σ" "$PO::test_p2_severity_is_the_sigma_cell_not_a_sum_of_slot_rows" $PO $I/$P/overstaffed_slot.py \
  'hits.append(Hit(over[-1], sigma[k], severity(rows[sigma[k]], t, ladder)))' 'hits.append(Hit(over[-1], sigma[k], severity(rows[over[-1]], t, ladder)))'
plant "P2 one Σ claimed for every slot" "$PO::test_p2_each_overstaffed_weekday_slot_is_its_own_finding_on_its_own_sigma" $PO $I/$P/overstaffed_slot.py \
  'hits.append(Hit(over[-1], sigma[k], severity(rows[sigma[k]], t, ladder)))' 'hits.append(Hit(over[-1], min(sigma.values()), severity(rows[sigma[k]], t, ladder)))'
plant "P2 one finding per outlet, not per weekday-slot" "$PO::test_p2_each_overstaffed_weekday_slot_is_its_own_finding_on_its_own_sigma" $PO \
  $I/$P/overstaffed_slot.py 'return sorted(hits, key=lambda h: h.row)' 'return sorted(hits, key=lambda h: h.row)[-1:]'
plant "a snapshot at the 500-row cap judged" "$PO::test_p2_a_snapshot_at_cores_500_row_cap_is_not_judged" $PO $I/munim_intel/watch/pipeline.py \
  'if body["row_count"] >= ROW_CAP:' 'if body["row_count"] > ROW_CAP:'
plant "labour weeks need not be consecutive" "$PO::test_labour_pct_high_needs_two_consecutive_weeks_at_or_over_a_policy_target" $PO $I/$P/labour_pct_high.py \
  'then - first == timedelta(weeks=1)' 'True'
plant "labour target made up when the policy has none" "$PO::test_labour_pct_high_needs_two_consecutive_weeks_at_or_over_a_policy_target" $PO $I/$P/labour_pct_high.py \
  'pct is not None and target is not None and pct >= target' 'pct is not None and pct >= (target or 3500)'
plant "advance age read as >=" "$PO::test_advance_unrecovered_is_in_only_and_fires_from_two_thousand_rupees_after_sixty_days" $PO $I/$P/advance_unrecovered.py \
  'days > t["days_since_given_gt"]' 'days >= t["days_since_given_gt"]'
plant "a people narration cites a column its template lacks" "$PO::test_people_narrations_have_no_digit_and_cite_only_their_templates_columns" $PO $I/$P/advance_unrecovered.py \
  '{days_since_given} days after' '{days_open} days after'
plant "attendance coverage floor read as <=" "$PO::test_the_attendance_refusal_fires_below_the_coverage_floor" $PO $I/munim_intel/skills/people/skill.py \
  'cov < COVERAGE_FLOOR_BP else None' 'cov <= COVERAGE_FLOOR_BP else None'
plant "P6: payroll bound outside a drafts pack (W3.2)" "$PO::test_p6_payroll_is_refused_outside_a_drafts_pack_and_bound_inside_one" $PO \
  $I/munim_intel/skills/people/skill.py 'return None if payroll_scope == "drafts" else "payroll_out_of_scope"' 'return None'

if [ $offline = 0 ]; then
  # end to end: the answer-key plants are found because of what the detectors read — a wrong window or bar finds less
  plant "kitchen looks back two weeks" "$KE::test_sweeps_find_the_kitchen_plants_the_section_4_bars_admit" $KE $I/$K/weeks.py \
    'WEEKS_BACK = 8' 'WEEKS_BACK = 2'
  plant "kitchen runs at the store (e2e)" "$KE::test_a_shop_gets_no_kitchen_snapshot_and_a_restaurant_does" $KE $I/$K/weeks.py \
    'frozenset({"restaurant", "cloud_kitchen"})' 'frozenset({"restaurant", "cloud_kitchen", "store"})'
  plant "advance bar 100x" "$PE::test_sweeps_find_the_people_plants_the_section_4_bars_admit" $PE $I/$P/advance_unrecovered.py \
    'owed >= t["outstanding_minor_gte"]' 'owed >= 100 * t["outstanding_minor_gte"]'
  plant "overtime judged on the first week" "$PE::test_overtime_rule_on_the_plants_rows_fires_at_their_own_totals_and_not_one_minute_above" $PE $I/$P/overtime_drift.py \
    'hits.append(Hit(week[last], s, ' 'hits.append(Hit(min(week.values()), s, '
fi

echo "after the plants:"
if run_pytest "${targets[@]}"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi

if [ $failures -ne 0 ]; then
  echo "b46-redproof: FAIL ($failures)" >&2
  exit 1
fi
echo "b46-redproof: ok — every plant turned its gate red (non-zero exit) naming the expected test; green after restoring"
