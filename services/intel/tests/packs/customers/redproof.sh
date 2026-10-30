#!/usr/bin/env bash
# Red-proof for the T-049 (customers) and T-050 (compliance) pack gates, as tests/watch/redproof.sh does it. The steps,
# in a throwaway copy of the tree:
#   1. copy the tree green;
#   2. plant one defect;
#   3. pytest must exit NON-ZERO and name the expected test;
#   4. restore the file.
# A red that names another test (a crash, an unrelated failure) fails this script. The copy gets its own .venv; its
# node_modules link back to the tree, because the end-to-end gates run core-api, worldgen and embedded Postgres under
# node.
#   services/intel/tests/packs/customers/redproof.sh [customers|compliance|both] [--offline]     (default: both, with e2e)
# `--offline` skips the end-to-end plants (each reseeds the 100-day worlds); `make check` runs it that way.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
only=both
offline=0
for a in "$@"; do
  case "$a" in customers|compliance|both) only=$a ;; --offline) offline=1 ;; *) echo "usage: $0 [customers|compliance|both] [--offline]" >&2; exit 2 ;; esac
done
src=$(cd "$(dirname "$0")/../../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-b48-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .claude --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")

intel="$copy/services/intel"
failures=0
plants=0
run_pytest() { (cd "$intel" && uv run --quiet --frozen pytest -q -p no:warnings "$@") > "$copy/.out" 2>&1; }

# replace <file under the repo> <old> <new>: exactly one occurrence, or the plant itself is broken.
replace() {
  python3 - "$copy/$1" "$2" "$3" <<'EOF'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
EOF
}

# plant <label> <expected test id> <pytest target> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 target=$3 file=$4
  shift 4
  if [ $offline = 1 ] && [[ "$target" == *_e2e.py* ]]; then return 0; fi
  plants=$((plants + 1))
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$target"; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "FAILED $expect" "$copy/.out"; then
    echo "  red:   pytest exits non-zero and names '$expect':"
    grep -F -- "FAILED $expect" "$copy/.out" | sed -n '1,1p' | cut -c1-220 | sed 's/^/    /'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

D=services/intel/munim_intel/watch/detectors
S=services/intel/munim_intel/skills
CO=tests/packs/customers/test_customers_offline.py
CE=tests/packs/customers/test_customers_e2e.py
PO=tests/packs/compliance/test_compliance_offline.py
PE=tests/packs/compliance/test_compliance_e2e.py

# Only this lane's two directories: the other pack lanes' gates are theirs (and may be mid-edit in a shared tree).
MINE=(tests/packs/customers tests/packs/compliance)
if [ $offline = 1 ]; then MINE=("$CO" "$PO"); fi

echo "baseline:"
if run_pytest "${MINE[@]}"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

if [ "$only" != compliance ]; then
  # thresholds read from the pack, "≥" kept
  plant "cap evasion: ≥ read as >" "$CO::test_cap_evasion_fires_at_the_pack_threshold_and_not_one_below" $CO $D/customers/coupon_cap_evasion.py \
    replace $D/customers/coupon_cap_evasion.py 'amount >= t["cap_evasion_minor_gte"]' 'amount > t["cap_evasion_minor_gte"]'
  # the seed-day plant is found only through a window that ends on the business date
  plant "cap evasion: window ends the day before" "$CE::test_g1_cap_evasion_is_found_once_with_the_key_impact" "$CE::test_g1_cap_evasion_is_found_once_with_the_key_impact" \
    $D/customers/coupon_cap_evasion.py \
    replace $D/customers/coupon_cap_evasion.py '"to": outlet.business_date.isoformat()}' '"to": (outlet.business_date - timedelta(days=1)).isoformat()}'
  plant "staff coupon: ratio leg dropped" "$CO::test_staff_coupon_needs_both_ten_uses_and_three_times_the_median" $CO $D/customers/staff_applied_coupon.py \
    replace $D/customers/staff_applied_coupon.py ' and uses * 10_000 >= t["uses_vs_outlet_median_bp_gte"] * median' ''
  plant "staff coupon: cash rule dropped" "$CO::test_staff_coupon_g2_at_pack_scale_is_high_when_most_uses_are_cash" $CO $D/customers/staff_applied_coupon.py \
    replace $D/customers/staff_applied_coupon.py 'return at_least(s, "high") if cash' 'return s if cash'
  # wg-1 re-planted CK-G2 above the uses floor, so a ">=" → ">" plant no longer bites there; the e2e's own rule is the
  # cash lift (12 of 12 cash → high).
  plant "staff coupon e2e: cash rule dropped" "$CE::test_g2_staff_code_needs_its_reduced_scale_and_then_is_found_with_the_key_impact" \
    "$CE::test_g2_staff_code_needs_its_reduced_scale_and_then_is_found_with_the_key_impact" $D/customers/staff_applied_coupon.py \
    replace $D/customers/staff_applied_coupon.py 'return at_least(s, "high") if cash' 'return s if cash'
  plant "lapsing: no-customer guard dropped" "$CO::test_regulars_lapsing_fires_on_fifteen_or_ten_percent_of_regulars" $CO $D/customers/regulars_lapsing.py \
    replace $D/customers/regulars_lapsing.py ' or at_risk < 1:' ':'
  plant "lapsing: customer rows fire" "$CO::test_regulars_lapsing_reads_the_sigma_row_only" $CO $D/customers/regulars_lapsing.py \
    replace $D/customers/regulars_lapsing.py 'if row.get("customer_id") is not None or at_risk' 'if at_risk'
  plant "lapsing: impact on the wrong Σ cell" "$CE::test_g4_lapsed_regulars_are_found_at_each_world_and_the_key_customers_are_the_at_risk_rows" \
    "$CE::test_g4_lapsed_regulars_are_found_at_each_world_and_the_key_customers_are_the_at_risk_rows" $D/customers/regulars_lapsing.py \
    replace $D/customers/regulars_lapsing.py 'impact_column="at_risk_spend_minor",' 'impact_column="regular_count",'
  plant "rating drop: ≤ read as <" "$CO::test_rating_drop_half_a_star_on_ten_reviews_medium_and_high_with_late_tickets" $CO $D/customers/rating_drop.py \
    replace $D/customers/rating_drop.py 'avg <= mean - t["rating_drop_x100_gte"]' 'avg < mean - t["rating_drop_x100_gte"]'
  plant "coupon spike: G6 campaign day judged" "$CO::test_coupon_spike_g3_fires_and_the_g6_campaign_day_does_not" $CO $D/customers/coupon_spike.py \
    replace $D/customers/coupon_spike.py 'if row.get("in_campaign_window") is not False:' 'if row.get("in_campaign_window") is None:'
  plant "coupon spike: the driver's listed coupons ignored (W3.2)" "$CO::test_coupon_spike_mints_coupon_daily_once_per_coupon_the_driver_lists" $CO \
    services/intel/munim_intel/watch/pipeline.py replace services/intel/munim_intel/watch/pipeline.py \
    '                windows += await self._enumerate(spec, spec.driver, outlet, thresholds)' '                pass'
  plant "coupon spike e2e: the listing's ids ignored (W3.2)" "$CE::test_g3_the_leaked_code_is_found_through_the_coupon_listing_with_the_key_impact" \
    "$CE::test_g3_the_leaked_code_is_found_through_the_coupon_listing_with_the_key_impact" $D/customers/coupon_spike.py \
    replace $D/customers/coupon_spike.py 'Driver("customers.coupon_leakage", coupons_used, "coupon_id", window)' 'Driver("customers.coupon_leakage", coupons_used, "uses", window)'
  plant "narration: a typed figure" "$CO::test_every_window_matches_its_template_params_and_every_narration_is_digit_free" $CO $D/customers/rating_drop.py \
    replace $D/customers/rating_drop.py 'over the weeks before; ' 'over the 8 weeks before; '
  plant "specialist: filed under finance" "$CO::test_every_finding_and_trace_carries_the_customers_specialist" $CO $D/customers/rating_drop.py \
    replace $D/customers/rating_drop.py '        pack="customers",' '        pack="finance",'
  # R-B S1-A: the no-op coupon.set stays unwired (any mapping on the detector is a draft core would not execute).
  plant "coupon.set re-wired" "$CO::test_cap_evasion_drafts_nothing_because_core_would_change_nothing" $CO \
    $D/customers/coupon_cap_evasion.py replace $D/customers/coupon_cap_evasion.py '        tenant_level=True,' '        tenant_level=True, mapping=lambda d: None,'
  plant "skill: a draftable it does not own" "$CO::test_skill_is_valid_against_the_ontology_and_binds_at_most_twenty_tools" $CO $S/customers/skill.py \
    replace $S/customers/skill.py 'DRAFTABLES: tuple[str, ...] = ()' 'DRAFTABLES: tuple[str, ...] = ("goals.task.create.v1",)'
  # R-B S1-B / S1-D: the campaign and coupon.set back in the propose set
  plant "skill: the campaign and coupon.set proposable again" "$CO::test_skill_is_valid_against_the_ontology_and_binds_at_most_twenty_tools" $CO $S/customers/skill.py \
    replace $S/customers/skill.py 'DRAFTABLES: tuple[str, ...] = ()' 'DRAFTABLES: tuple[str, ...] = ("customers.campaign.create.v1", "catalogue.coupon.set.v1")'
  plant "skill: a number word in the instructions" "$CO::test_skill_is_valid_against_the_ontology_and_binds_at_most_twenty_tools" $CO $S/customers/skill.py \
    replace $S/customers/skill.py 'Never type' 'Never type one'
fi

if [ "$only" != customers ]; then
  plant "missed logs: today counted" "$PE::test_a6_closing_checklist_four_of_seven_is_high" "$PE::test_a6_closing_checklist_four_of_seven_is_high" $D/compliance/missed_logs.py \
    replace $D/compliance/missed_logs.py 'last = outlet.business_date - timedelta(days=1)' 'last = outlet.business_date'
  plant "missed logs: weekly checklists judged" "$PO::test_missed_logs_boundaries_daily_only_and_the_temperature_row" $PO $D/compliance/missed_logs.py \
    replace $D/compliance/missed_logs.py 'return (num(row, "expected_runs") or 0) >= t["window_days"]' 'return True'
  plant "temp excursion: one reading is enough (A8)" "$PO::test_temp_excursion_a1_is_high_and_the_a8_single_reading_is_silent" $PO $D/compliance/temp_excursion.py \
    replace $D/compliance/temp_excursion.py 'bad >= t["out_of_range_gte"]' 'bad >= t["out_of_range_gte"] - 1'
  plant "temp excursion: high floor dropped" "$PE::test_a1_temperature_excursions_are_found_on_both_days_with_the_key_waste" \
    "$PE::test_a1_temperature_excursions_are_found_on_both_days_with_the_key_waste" $D/compliance/temp_excursion.py \
    replace $D/compliance/temp_excursion.py 'return at_least(ladder.of(num(row, "temp_waste_minor") or 0), "high")' 'return ladder.of(num(row, "temp_waste_minor") or 0)'
  plant "amc waste: ≥ read as >" "$PO::test_amc_waste_threshold_and_severity" $PO $D/compliance/amc_waste.py \
    replace $D/compliance/amc_waste.py 'waste >= t["amc_waste_minor_gte"]' 'waste > t["amc_waste_minor_gte"]'
  plant "amc waste: impact on the repairs alone" "$PE::test_a2_a3_amc_waste_is_found_per_asset_with_the_key_impact" \
    "$PE::test_a2_a3_amc_waste_is_found_per_asset_with_the_key_impact" $D/compliance/amc_waste.py \
    replace $D/compliance/amc_waste.py 'impact_column="amc_waste_minor",' 'impact_column="repairs_under_amc_minor",'
  plant "maintenance draft: estimate from the wrong cell" "$PO::test_maintenance_overdue_fires_after_fourteen_days_and_drafts_a_schedule_with_refs" $PO \
    $D/compliance/maintenance_overdue.py \
    replace $D/compliance/maintenance_overdue.py 'cost = d.ref("last_preventive_cost_minor") if' 'cost = d.ref("repairs_under_amc_minor") if'
  plant "energy: zero baseline fires (offline)" "$PO::test_energy_drift_a4_at_one_point_three_times_the_median_and_never_on_a_zero_baseline" $PO \
    $D/compliance/energy_drift.py replace $D/compliance/energy_drift.py 'return median > 0 and excess > 0 and per' 'return per'
  plant "energy: zero baseline fires (worlds)" "$PE::test_false_alarms_are_at_most_two_per_world" "$PE::test_false_alarms_are_at_most_two_per_world" \
    $D/compliance/energy_drift.py replace $D/compliance/energy_drift.py 'return median > 0 and excess > 0 and per' 'return per'
  plant "licence rule: critical at < 7" "$PO::test_licence_rule_a5_twenty_days_is_high_seven_is_critical_missing_is_critical" $PO \
    $D/compliance/licence_expiring.py replace $D/compliance/licence_expiring.py 'days <= t["critical_days_left_lte"]' 'days < t["critical_days_left_lte"]'
  plant "licence: missing reported for an unverified kind (W3.2)" "$PO::test_missing_fires_only_for_a_verified_kind_and_expiry_for_any_kind_held_at_this_outlet" $PO \
    $D/compliance/licence_expiring.py replace $D/compliance/licence_expiring.py '(mode == REQUIRED or not _missing(r))' 'True'
  plant "licence: expired read as missing again (0023)" "$PO::test_missing_fires_only_for_a_verified_kind_and_expiry_for_any_kind_held_at_this_outlet" $PO \
    $D/compliance/licence_expiring.py replace $D/compliance/licence_expiring.py '    return row.get("status") == "missing"' '    return row.get("status") in ("missing", "expired")'
  plant "licence_expiring left out of a real sweep" "$PO::test_registered_in_a_real_sweep_not_only_when_a_test_imports_it" $PO $D/compliance/__init__.py \
    replace $D/compliance/__init__.py 'from munim_intel.watch.detectors.compliance import licence_expiring as licence_expiring
' ''
  plant "task: assignee guessed when the outlet has no manager" "$PO::test_licence_and_log_findings_draft_a_task_for_the_outlets_manager_and_abstain_without_one" $PO \
    $D/compliance/tasks.py replace $D/compliance/tasks.py '    if not isinstance(manager, str):
        return Abstain("assignee_missing")' '    if not isinstance(manager, str):
        manager = d.outlet.id'
  plant "licence: _unverified flag dropped from the frame (W3.2)" "$PO::test_licence_windows_follow_the_packs_kinds_for_the_outlets_kind" $PO \
    services/intel/munim_intel/watch/frame.py replace services/intel/munim_intel/watch/frame.py '"unverified": bool(k.get("_unverified"))' '"unverified": False'
  plant "licence e2e: unverified kinds never minted (W3.2)" "$PE::test_a5_each_licence_is_found_once_with_its_days_left" \
    "$PE::test_a5_each_licence_is_found_once_with_its_days_left" $D/compliance/licence_expiring.py \
    replace $D/compliance/licence_expiring.py 'for mode, unverified in ((REQUIRED, False), (HELD, True)):' 'for mode, unverified in ((REQUIRED, False),):'
  # R-B S2-D: a business-held licence is one finding and one tenant-wide task; a missing licence narrates no null cell
  plant "licence: a business-held kind filed once per outlet" "$PO::test_a_business_held_licence_is_filed_once_tenant_wide_and_an_outlet_held_one_per_outlet" $PO \
    $D/compliance/licence_expiring.py replace $D/compliance/licence_expiring.py '        and (holder == OUTLET or first.get(r.get("kind")) == outlet)
' ''
  plant "licence: a business-held task filed under an outlet" "$PO::test_a_business_held_licence_is_filed_once_tenant_wide_and_an_outlet_held_one_per_outlet" $PO \
    $D/compliance/licence_expiring.py replace $D/compliance/licence_expiring.py 'tenant_wide=business)' 'tenant_wide=False)'
  plant "licence: a missing licence narrates its null date cells" "$PO::test_a_missing_licence_narrates_its_status_never_its_null_date_cells" $PO \
    $D/compliance/licence_expiring.py replace $D/compliance/licence_expiring.py '        narration_for=narration_for,
' ''
  plant "specialist: findings filed under customers" "$PE::test_every_finding_is_filed_under_its_outlet_and_carries_the_compliance_specialist" \
    "$PE::test_every_finding_is_filed_under_its_outlet_and_carries_the_compliance_specialist" $D/compliance/amc_waste.py \
    replace $D/compliance/amc_waste.py '        pack="compliance",' '        pack="customers",'
  plant "skill: a digit in the instructions" "$PO::test_skill_is_valid_against_the_ontology_and_binds_at_most_twenty_tools" $PO $S/compliance/skill.py \
    replace $S/compliance/skill.py 'Munim files nothing with a regulator.' 'Munim files nothing with a regulator in 2026.'
fi

echo "after the plants:"
if run_pytest "${MINE[@]}"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi

if [ $failures -ne 0 ]; then
  echo "b48-redproof: FAIL ($failures of $plants)" >&2
  exit 1
fi
echo "b48-redproof: ok — $plants/$plants plants turned the pack gates red (non-zero exit) naming the expected test; green after restoring"
