#!/usr/bin/env bash
# Red-proof for the T-047 finance gates (as tests/watch/redproof.sh): in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test (a crash, an unrelated failure) fails this script. The copy gets its own
# .venv; node_modules are linked back (the end-to-end gates run core-api, worldgen and embedded Postgres under node).
#   services/intel/tests/packs/finance/redproof.sh            offline plants + end-to-end plants (each e2e plant seeds 4 worlds)
#   services/intel/tests/packs/finance/redproof.sh --offline  offline plants only
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
mode=all
for a in "$@"; do
  case "$a" in
    --offline) mode=offline ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
src=$(cd "$(dirname "$0")/../../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t047-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")

intel="$copy/services/intel"
U=tests/packs/finance/test_finance_offline.py
E=tests/packs/finance/test_finance_e2e.py
failures=0
planted=0
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

# plant <label> <expected text> <pytest target> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 target=$3 file=$4
  shift 4
  planted=$((planted + 1))
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$target"; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "$expect" "$copy/.out"; then
    echo "  red:   pytest exits non-zero and names '$expect':"
    grep -F -- "$expect" "$copy/.out" | sed -n '1,2p' | sed 's/^/    /'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

D=services/intel/munim_intel/watch/detectors/finance
SK=services/intel/munim_intel/skills/finance/skill.py

echo "baseline:"
if [ "$mode" = all ]; then base=(tests/packs/finance); else base=("$U"); fi
if run_pytest "${base[@]}"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# -- offline ------------------------------------------------------------------------------------------------------
plant "short payout: ≥ read as >" "FAILED $U::test_short_payout_fires_at_the_pack_threshold_on_a_settlement_sigma_row_only" $U $D/short_payout.py \
  replace $D/short_payout.py 'short >= t["short_minor_gte"]' 'short > t["short_minor_gte"]'
plant "missing payout: > read as ≥" "FAILED $U::test_missing_payout_fires_when_the_oldest_order_is_older_than_ten_days" $U $D/missing_payout.py \
  replace $D/missing_payout.py 'oldest > t["days_unsettled_gt"]' 'oldest >= t["days_unsettled_gt"]'
plant "tender gap: ≥ 3 days read as > 3" "FAILED $U::test_tender_gap_fires_on_three_gap_days_of_a_week_and_not_on_two_or_on_a_day_row" $U $D/tender_gap.py \
  replace $D/tender_gap.py 'days >= t["gap_days_gte"]' 'days > t["gap_days_gte"]'
plant "tender gap: critical without a shared shift member" "FAILED $U::test_severities_follow_ladder_l_and_the_pack_floors" $U $D/tender_gap.py \
  replace $D/tender_gap.py '        isinstance(row.get("shift_member_id"), str)' '        True'
plant "tender gap: Σ median multiplied by gap days again (0023 already did)" "FAILED $U::test_severities_follow_ladder_l_and_the_pack_floors" $U $D/tender_gap.py \
  replace $D/tender_gap.py 't["critical_voids_vs_median_bp_gte"] * median' 't["critical_voids_vs_median_bp_gte"] * median * (num(row, "gap_days") or 1)'
plant "gst: only positive differences" "FAILED $U::test_gst_mismatch_fires_on_either_sign_from_the_pack_threshold" $U $D/gst_mismatch.py \
  replace $D/gst_mismatch.py 'abs(diff) >= t["abs_diff_minor_gte"]' 'diff >= t["abs_diff_minor_gte"]'
plant "dispute cites the paid net, not the shortfall" "FAILED $U::test_a_short_payout_dispute_claims_each_line_the_sigma_counted_by_ref" $U $D/short_payout.py \
  replace $D/short_payout.py '    total = d.ref("short_minor")' '    total = d.ref("net_minor")'
# R-B S1-C: the dispute's lines are the lines the Σ counted, by ref, and only when they add up to it
plant "short payout lines: the line rule dropped" "FAILED $U::test_a_short_payout_dispute_claims_each_line_the_sigma_counted_by_ref" $U $D/short_payout.py \
  replace $D/short_payout.py 'return short > 0 and short >= max(t["line_short_minor_gte"], -(-expected * t["line_short_bp_gte"] // 10_000))' 'return short > 0'
plant "short payout lines: another settlement's lines claimed" "FAILED $U::test_a_short_payout_dispute_claims_each_line_the_sigma_counted_by_ref" $U $D/short_payout.py \
  replace $D/short_payout.py 'if r.get("settlement_id") == settlement and isinstance' 'if isinstance'
plant "short payout lines: Σ check dropped" "FAILED $U::test_a_short_payout_dispute_claims_each_line_the_sigma_counted_by_ref" $U $D/short_payout.py \
  replace $D/short_payout.py 'if not picked or sum(num(r, "short_minor") or 0 for _, r in picked) != num(d.row, "short_minor"):' 'if not picked:'
plant "missing payout lines: none claimed" "FAILED $U::test_a_missing_payout_dispute_claims_each_unsettled_order_of_its_channel_by_ref" $U $D/missing_payout.py \
  replace $D/missing_payout.py '            "lines": lines,' '            "lines": [],'
plant "missing payout: keyed on the week again" "FAILED $U::test_missing_payout_is_keyed_on_its_set_of_unsettled_orders_not_the_week" $U $D/missing_payout.py \
  replace $D/missing_payout.py 'f"{dedupe(r, w)}:{orders_key(rows, r['"'"'channel_id'"'"'])}"' 'f"{dedupe(r, w)}:{w.key}"'
# R-B S2-B: a median of 0 is never "twice the median"
plant "tender gap: critical at a median of 0" "FAILED $U::test_severities_follow_ladder_l_and_the_pack_floors" $U $D/tender_gap.py \
  replace $D/tender_gap.py '        and median > 0
        and voids > 0
' ''
plant "a digit in the skill instructions" "FAILED $U::test_skill_instructions_carry_no_digit_and_no_number_word_and_fit_the_budget" $U $SK \
  replace $SK 'Never type a digit.' 'Never type a digit like 5.'
plant "bank_lines_missing never refused" "FAILED $U::test_each_pack_7_refusal_fires_on_its_condition_and_not_on_the_accept_case" $U $SK \
  replace $SK 'return None if any(isinstance(c, int) and c > 0 for c in credited) else "bank_lines_missing"' 'return None'

if [ "$mode" = all ]; then
  # -- end to end (each seeds the four worlds) --------------------------------------------------------------------
  plant "missing payout impact read from expected net" "FAILED $E::test_sweeps_find_every_finance_plant_with_impact_equal_to_the_key_and_no_false_alarm" "$E" $D/missing_payout.py \
    replace $D/missing_payout.py '        impact_column="order_total_minor",' '        impact_column="expected_net_minor",'
  plant "RG-F8: an ad fee inside the cap is flagged" "FAILED $E::test_rg_f8_ad_fee_within_the_opted_in_cap_and_a_refund_lower_net_raise_nothing" "$E" $D/unapproved_ad_fee.py \
    replace $D/unapproved_ad_fee.py 'amount >= t["unapproved_minor_gte"]' 'amount >= 0'
  plant "tender gap looks back two weeks" "FAILED $E::test_sweeps_find_every_finance_plant_with_impact_equal_to_the_key_and_no_false_alarm" "$E" $D/tender_gap.py \
    replace $D/tender_gap.py 'WEEKS_BACK = 6' 'WEEKS_BACK = 2'
  # R-B S1-C: lines against the keys, and the open-dispute pairing (without lines core cannot see the overlap)
  plant "short payout disputes claim no line" "FAILED $E::test_each_draft_bearing_plant_yields_one_dispute_citing_the_pack_6_cell" "$E" $D/short_payout.py \
    replace $D/short_payout.py '            "lines": lines,' '            "lines": [],'
  plant "missing payout lines dropped: the second claim goes through" "FAILED $E::test_approving_the_held_cycle_raises_rg_f4_alone_and_no_order_is_claimed_twice" "$E" $D/missing_payout.py \
    replace $D/missing_payout.py '            "lines": lines,' '            "lines": [],'
fi

echo "after the plants:"
if run_pytest "$U"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi

if [ $failures -ne 0 ]; then
  echo "t047-redproof: FAIL ($failures of $planted)" >&2
  exit 1
fi
echo "t047-redproof: ok — $planted/$planted plants turned the T-047 gates red (non-zero exit) naming the expected test; green after restoring"
