#!/usr/bin/env bash
# Red-proof for the T-046 gates: in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test (a crash, an unrelated failure) fails this script. The copy gets its own
# .venv; node_modules are linked back (the end-to-end gates run core-api, worldgen and embedded Postgres under node).
#   services/intel/tests/packs/inventory_purchasing/redproof.sh            offline plants + end-to-end plants
#   services/intel/tests/packs/inventory_purchasing/redproof.sh --offline   offline plants only (also OFFLINE_ONLY=1)
set -euo pipefail
case "${1:-}" in "") ;; --offline) OFFLINE_ONLY=1 ;; *) echo "usage: $0 [--offline]" >&2; exit 2 ;; esac
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t046-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")

intel="$copy/services/intel"
T=tests/packs/inventory_purchasing
D=$T/test_inventory_purchasing_detectors.py
S=$T/test_inventory_purchasing_skill.py
E=$T/test_inventory_purchasing_e2e.py
failures=0
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

P=services/intel/munim_intel/watch/detectors/inventory_purchasing
K=services/intel/munim_intel/skills/inventory_purchasing/skill.py

echo "baseline (offline):"
if run_pytest "$D" "$S"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# threshold: "≥" read as ">" (the overbilled ₹100 boundary)
plant "overbilled threshold off by one" "FAILED $D::test_each_threshold_fires_at_its_boundary_and_not_one_unit_short[purchasing.overbilled-IN-31]" "$D" \
  $P/overbilled.py replace $P/overbilled.py 'over >= t["overbilled_minor_gte"]' 'over > t["overbilled_minor_gte"]'
# the SKU horizon ignored: every batch judged on the 3-day horizon
plant "expiry SKU horizon ignored" "FAILED $D::test_each_threshold_fires_at_its_boundary_and_not_one_unit_short[inventory.expiry_risk-IN-11]" "$D" \
  $P/expiry_risk.py replace $P/expiry_risk.py 'if row.get("is_sku") is True' 'if False'
# impact column: the latest price instead of the creep impact
plant "price creep cites the wrong impact cell" "FAILED $D::test_every_pack_detector_is_registered_with_the_pack_template_and_impact_column" "$D" \
  $P/price_creep.py replace $P/price_creep.py 'impact_column="creep_impact_minor"' 'impact_column="latest_minor"'
# specialist stamp: a detector filed under another specialist
plant "shrinkage filed under finance" "FAILED $D::test_every_finding_draft_and_trace_carries_the_specialist" "$D" \
  $P/shrinkage.py replace $P/shrinkage.py 'pack="inventory_purchasing",' 'pack="finance",'
# severity: waste ranked on the week's excess, not 4.3 × it
plant "waste severity not monthly" "FAILED $D::test_severities_worked_by_hand_from_the_ladder" "$D" \
  $P/waste_spike.py replace $P/waste_spike.py '* 43 // 10' '* 1'
# dedupe: each listing of a near-duplicate pair its own finding
plant "near-duplicate pair keyed per listing" "FAILED $D::test_both_listings_of_a_near_duplicate_pair_are_one_problem" "$D" \
  $P/near_duplicate_invoice.py replace $P/near_duplicate_invoice.py 'return min(str(w.params["supplier_invoice_id"]), str(row["twin_invoice_id"]))' 'return str(w.params["supplier_invoice_id"])'
# dispute: a zero line claimed (claimed_minor must be positive)
plant "dispute claims a zero line" "FAILED $D::test_the_dispute_claims_each_overbilled_line_by_ref_and_validates_as_a_draft" "$D" \
  $P/overbilled.py replace $P/overbilled.py 'and (num(r, "overbilled_minor") or 0) > 0' ''
# narration: a typed figure
plant "digit in a narration" "FAILED $D::test_narrations_carry_no_digit_or_number_word_and_cite_only_their_templates_columns" "$D" \
  $P/dead_stock.py replace $P/dead_stock.py 'for a long time:' 'for 60 days:'
# narration: a number word (core's grammar abstains the finding: measured once in this lane)
plant "number word in a narration" "FAILED $D::test_narrations_carry_no_digit_or_number_word_and_cite_only_their_templates_columns" "$D" \
  $P/waste_spike.py replace $P/waste_spike.py 'spiked in a recent week:' 'spiked in one week:'
# skill: a digit in the instructions; proposals bound on a read-only load
plant "digit in the skill instructions" "FAILED $S::test_instructions_have_no_digit_and_fit_the_cap" "$S" \
  $K replace $K 'every change before it happens.' 'every change before it happens, within 24 hours.'
plant "propose tools on a read-only load" "FAILED $S::test_the_read_binding_is_the_twelve_reads_and_the_draft_binding_adds_the_five_proposals" "$S" \
  $K replace $K 'return build_toolset(PACK, ctx, client, handles, propose=propose)' 'return build_toolset(PACK, ctx, client, handles, propose=True)'
# W3.2: the shortfall's business-date severity, the driver's listed ids, the dispute's line rows
plant "shortfall severity ignores the business date" "FAILED $D::test_a_stockout_tomorrow_is_high" "$D" \
  services/intel/munim_intel/detect/__init__.py replace services/intel/munim_intel/detect/__init__.py \
  'Hit(i, i, sev(r, t, ladder, w, outlet) if sev is not None else self.severity(r, t, ladder))' 'Hit(i, i, self.severity(r, t, ladder))'
plant "invoice listing ignored" "FAILED $D::test_a_sweep_lists_invoices_and_counts_then_mints_one_id_keyed_template_per_listed_id" "$D" \
  $P/overbilled.py replace $P/overbilled.py 'DRIVER = Driver("purchasing.invoices", invoices_listed, "supplier_invoice_id", lambda i, _o, _t: window(i))' \
  'DRIVER = Driver("purchasing.invoices", invoices_listed, "total_minor", lambda i, _o, _t: window(i))'
plant "dispute handed no line rows" "FAILED $D::test_every_finding_draft_and_trace_carries_the_specialist" "$D" \
  $P/overbilled.py replace $P/overbilled.py 'return dispute(d, str(d.params["supplier_invoice_id"]), d.rows)' 'return dispute(d, str(d.params["supplier_invoice_id"]), [])'

if [ "${OFFLINE_ONLY:-0}" != 1 ]; then
  # end to end (each plant reseeds the four 100-day worlds: about two minutes each)
  plant "e2e: price creep threshold 100x" "FAILED $E::test_sweeps_find_the_reachable_answer_key_plants_with_impact_equal_to_the_key" "$E" \
    $P/price_creep.py replace $P/price_creep.py 'creep >= t["creep_bp_gte"]' 'creep >= 100 * t["creep_bp_gte"]'
  plant "e2e: one observation is a creep (RG-C6 trap)" "FAILED $E::test_the_held_mushroom_price_is_not_a_creep_and_paneer_is_its_listed_also" "$E" \
    $P/price_creep.py replace $P/price_creep.py 'seen >= t["observations_gte"]' 'seen >= 1'
  plant "e2e: waste excess floor ignored" "FAILED $E::test_every_false_alarm_is_dead_stock_or_a_waste_plant_of_another_detector" "$E" \
    $P/waste_spike.py replace $P/waste_spike.py 'excess >= t["excess_minor_gte"]' 'excess >= 0'
  plant "e2e: counts listing ignored (W3.2)" "FAILED $E::test_id_keyed_detectors_find_their_plants_through_the_sweeps_listings" "$E" \
    $P/shrinkage.py replace $P/shrinkage.py 'Driver("inventory.counts", counts_listed, "count_id",' 'Driver("inventory.counts", counts_listed, "outlet_id",'
  plant "e2e: the pipeline's dispute gets no line rows (W3.2)" "FAILED $E::test_each_overbilled_invoice_gets_its_dispute_from_the_pipeline" "$E" \
    $P/overbilled.py replace $P/overbilled.py 'return dispute(d, str(d.params["supplier_invoice_id"]), d.rows)' 'return dispute(d, str(d.params["supplier_invoice_id"]), [])'
  # R-B polish: ST-I4 is found because the sweep pins `as_of` to the run-frame date (no skip left to hide behind)
  plant "e2e: expiry minted on another day than the business date" "FAILED $E::test_the_store_batch_expiring_soon_is_found_inside_its_window" "$E" \
    $P/expiry_risk.py replace $P/expiry_risk.py '"as_of": outlet.business_date.isoformat()}' '"as_of": outlet.business_date.replace(day=1).isoformat()}'
  plant "e2e: xfail gate is live (no dead stock → strict XPASS)" "XPASS(strict)" "$E" \
    $P/dead_stock.py replace $P/dead_stock.py 'value >= t["value_minor_gte"]' 'value >= 1000 * t["value_minor_gte"]'
fi

echo "after the plants (offline):"
if run_pytest "$D" "$S"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi

if [ $failures -ne 0 ]; then
  echo "t046-redproof: FAIL ($failures)" >&2
  exit 1
fi
echo "t046-redproof: ok — every plant turned its T-046 gate red (non-zero exit) naming the expected test; green after restoring"
