#!/usr/bin/env bash
# Red-proof for the T-055a/b negotiation gates and T-114's (the person-started route, the licence finding's outlet).
# In a throwaway copy of the tree, for each plant:
#   plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test fails this script; so does a plant that does not apply. The copy gets its
# own .venv (uv --frozen: exactly the copied lock). The gates run on FakeCore + the in-process sim; node (with the tree's
# node_modules linked back) only parses the PO body with core's zod contract.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1 MUNIM_MODEL_MODE=recorded
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t055-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 3 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")

intel="$copy/services/intel"
failures=0
R=tests/negotiate/test_negotiate_rules.py
C=tests/negotiate/test_negotiate_chooser.py
N=services/intel/munim_intel/negotiate

svc=$intel
run_pytest() { (cd "$svc" && uv run --quiet --frozen pytest -q -p no:warnings "$@") > "$copy/.out" 2>&1; }

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

# plant <label> <expected test name> <pytest target> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 target=$3 file=$4
  shift 4
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$target"; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "FAILED $target::$expect" "$copy/.out"; then
    echo "  red:   exit non-zero, FAILED $expect"
  else
    echo "  FAIL: pytest is red but does not name $expect:"; tail -25 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

echo "green first:"
if ! run_pytest tests/negotiate; then echo "  FAIL: the gates are not green before planting"; tail -30 "$copy/.out"; exit 1; fi
echo "  green: $(tail -1 "$copy/.out")"

# T-055a
plant "a(1) best passing quote = highest price" test_gate1_default_policy_three_rfqs_two_counters_one_po $R $N/review.py \
  replace $N/review.py 'return min(passing, key=lambda r:' 'return max(passing, key=lambda r:'
plant "a(1) a third counter allowed" test_gate1_default_policy_three_rfqs_two_counters_one_po $R $N/policy.py \
  replace $N/policy.py 'if counters < policy.max_counters and affordable' 'if counters <= policy.max_counters and affordable'
plant "a(2) minimum-order rule never fails" test_gate2_hidden_minimum_order_refused_ten_of_ten $R $N/review.py \
  replace $N/review.py '            moq > shelf or moq > q["qty_milli"],' '            moq > shelf * 10 or moq > q["qty_milli"] * 10,'
plant "a(3) a2a traces lose the simulated label" test_gate3_every_supplier_label_reads_simulated_supplier $R $N/port.py \
  replace $N/port.py 'LABEL_SLUG = "simulated_supplier"' 'LABEL_SLUG = "supplier"'
plant "a(3) cards lose the simulated label" test_gate3_every_supplier_label_reads_simulated_supplier $R services/suppliers-sim/suppliers_sim/personalities.json \
  replace services/suppliers-sim/suppliers_sim/personalities.json '"label": "Simulated supplier"' '"label": "Supplier"'
plant "a(4) any move accepted, allowed set ignored" test_gate4_planted_accept_above_walk_away_becomes_walk $R $N/policy.py \
  replace $N/policy.py '    for m in o.allowed:' '    for m in MOVES:'
plant "a(4) counter after max rounds accepted" test_gate4_planted_counter_after_max_rounds_becomes_default $R $N/policy.py \
  replace $N/policy.py '    for m in o.allowed:' '    for m in MOVES:'
plant "a(5) litellm planted in uv.lock" test_gate5_lock_clean_with_a2a_red_with_planted_litellm $R uv.lock \
  bash -c "printf '\n[[package]]\nname = \"litellm\"\nversion = \"1.84.0\"\nsource = { registry = \"https://pypi.org/simple\" }\n' >> '$copy/uv.lock'"
plant "a(6) a2a traces under another actor" test_gate6_every_a2a_trace_carries_the_specialist $R $N/run.py \
  replace $N/run.py 'ACTOR = "specialist:inventory_purchasing"' 'ACTOR = "manager"'

# T-055b
plant "b(1) out-of-set choice kept" test_gate1_planted_out_of_set_move_becomes_default $C $N/policy.py \
  replace $N/policy.py '    for m in o.allowed:' '    for m in MOVES:'
plant "b(2) the model's answer is dropped" test_gate2_recorded_moves_are_in_the_allowed_set_every_round $C $N/chooser.py \
  replace $N/chooser.py '        return parse(text)' '        return None'
plant "b(3) note not grammar-checked" test_gate3_planted_digit_gets_the_template_message $C $N/chooser.py \
  replace $N/chooser.py ' or violation(note) is not None:' ':'
plant "b(4) extractor does not taint the run" test_gate4_injected_reply_taints_and_po_still_from_review_code $C services/intel/munim_intel/ingest/quarantine.py \
  replace services/intel/munim_intel/ingest/quarantine.py '    state.tainted = True' '    pass'
plant "b(5) chooser ignores its budget" test_gate5_calls_bounded_and_budget_stop_completes_by_default $C $N/chooser.py \
  replace $N/chooser.py 'if self.calls_left <= 0 or self.state.budget.models_exhausted():' 'if False:'
plant "b(5) counters offered past the run budget" test_gate5_run_budget_stop_makes_no_further_call_and_still_reviews $C $N/run.py \
  replace $N/run.py 'leg.counters, affordable=affordable)' 'leg.counters)'
plant "b(6) PO for the highest passing price" test_gate6_recorded_po_supplier_is_the_answer_key $C $N/review.py \
  replace $N/review.py 'return min(passing, key=lambda r:' 'return max(passing, key=lambda r:'

# W3.2 wiring: the run's budget and the deal-review traces
W=tests/negotiate/test_negotiate_wiring.py
plant "w(1) budget sized one call short" test_the_budget_is_twelve_model_calls_for_three_suppliers $W $N/run.py \
  replace $N/run.py 'suppliers * (policy.max_counters + 1) + policy.decision_rounds, max_tool_calls=0' \
  'suppliers * (policy.max_counters + 1) + policy.decision_rounds - 1, max_tool_calls=0'
plant "w(2) review verdicts not traced" test_a_run_inside_that_budget_counters_reviews_and_traces_one_review_per_accepted_quote $W $N/run.py \
  replace $N/run.py '            await state.traces.review(' '            0 and await state.traces.review('

# clause 2 on the supplier path: extracted fields must be found in the reply
G=tests/negotiate/test_negotiate_grounding.py
plant "grounding check removed" test_a_planted_invented_price_drops_the_quote_and_the_po_goes_elsewhere $G $N/extract.py \
  replace $N/extract.py '        if at is None:' '        if False:'
plant "price compared at the wrong scale" test_every_recorded_reply_is_grounded_or_dropped_as_the_world_says $G $N/extract.py \
  replace $N/extract.py 'Decimal(f.unit_price_minor) / 10**rfq.minor_unit' 'Decimal(f.unit_price_minor)'

# R-C fix cycle 1. F1: each field bound to its own token; every number claimed; the RFQ's quantity. First the reviewer's
# three plants with grounding off (the model's fields used as read — what they won before the fix), then each guard alone.
prefix_grounding() { # by value only, any token, as before the fix
  replace $N/extract.py ' and span not in spans.values() and context(*span)' '' &&
    replace $N/extract.py '    if f.qty_milli != rfq.qty_milli:' '    if False:' &&
    replace $N/extract.py '            return Extracted(None, "unbound_number")' '            break'
}
for mode in swap omit days; do
  plant "F1 $mode, grounded by value only (pre-fix)" "test_reviewer_plants_on_the_discounter_no_longer_win_the_po[$mode]" $G $N/extract.py \
    prefix_grounding
done
plant "F1 days: a price read off any token" "test_reviewer_plants_on_the_discounter_no_longer_win_the_po[days]" $G $N/extract.py \
  replace $N/extract.py '        return currency.search(reply, 0, s) is not None and per_unit.match(reply, e) is not None' '        return True'
plant "F1 omit: an unclaimed number is let through" "test_reviewer_plants_on_the_discounter_no_longer_win_the_po[omit]" $G $N/extract.py \
  replace $N/extract.py '            return Extracted(None, "unbound_number")' '            break'
plant "F1 swap: the quantity is not the RFQ's" "test_reviewer_plants_on_the_discounter_no_longer_win_the_po[swap]" $G $N/extract.py \
  replace $N/extract.py '    if f.qty_milli != rfq.qty_milli:' '    if False:'
plant "F1 two fields on one token" "test_ground_refuses_a_field_off_its_token_or_an_omitted_one[min_order_qty_milli-1200000-not_in_reply:min_order_qty_milli]" $G $N/extract.py \
  replace $N/extract.py ' and span not in spans.values() and ' ' and '
plant "F1 gate 2 measured on grounding: omitted minimum passes" test_gate2_an_omitted_minimum_order_drops_the_quote_ten_of_ten $R $N/extract.py \
  replace $N/extract.py '            return Extracted(None, "unbound_number")' '            break'
# F2: the tokenizer.
plant "F2 lakh grouping not read" "test_tokens_read_western_and_lakh_grouping_whole[INR 1,20,000.00-120000.00]" $G $N/extract.py \
  replace $N/extract.py '(?:\d{1,2}(?:,\d{2})+,\d{3}|\d{1,3}(?:,\d{3})+|\d+)' '(?:\d{1,3}(?:,\d{3})+|\d+)'
plant "F2 a trailing comma cuts the decimals" "test_tokens_read_western_and_lakh_grouping_whole[INR 1,234.50,-1234.50]" $G $N/extract.py \
  replace $N/extract.py '(?:\.\d+)?(?!\d|[.,]\d)")' '(?:\.\d+)?(?![\d,])")'
# F4: simulated suppliers only, checked before any send.
plant "F4 negotiate sends before checking" test_a_supplier_of_another_kind_refuses_the_run_before_any_send tests/negotiate/test_negotiate_simulated.py $N/run.py \
  replace $N/run.py '    for s in suppliers:
        await port.check(s)' '    pass'
plant "F4 kind not checked" test_a_supplier_of_another_kind_refuses_the_run_before_any_send tests/negotiate/test_negotiate_simulated.py $N/port.py \
  replace $N/port.py '        if s.kind != "simulated":' '        if False:'
plant "F4 card name not checked" test_a_card_not_named_simulated_supplier_is_refused tests/negotiate/test_negotiate_simulated.py $N/port.py \
  replace $N/port.py '            if LABEL not in card.name:' '            if False:'
plant "F4 card URL origin not checked" test_a_card_url_off_the_configured_origin_is_refused tests/negotiate/test_negotiate_simulated.py $N/port.py \
  replace $N/port.py '        if origin(s.card_url) != self._origin:' '        if False:'
plant "F4 interface origin not checked" test_a_card_advertising_another_origin_is_refused tests/negotiate/test_negotiate_simulated.py $N/port.py \
  replace $N/port.py 'any(origin(i.url) != self._origin for i in card.supported_interfaces)' 'False'
plant "F4 the core read keeps every kind" test_the_core_read_keeps_simulated_rows_with_a_card_only tests/negotiate/test_negotiate_simulated.py $N/port.py \
  replace $N/port.py '        if r["kind"] == "simulated" and r["a2a_card_url"]' '        if r["a2a_card_url"]'
# F7: a need of 0; polish: a PO below the minimum order.
plant "F7 need 0 read as an overlap" test_a_need_of_zero_cannot_be_verified_not_an_overlap $R $N/review.py \
  replace $N/review.py '            "missing_ref" if need == 0 else None,' '            None,'
plant "a PO below the supplier's minimum passes" test_a_po_below_the_suppliers_minimum_order_fails_review $R $N/review.py \
  replace $N/review.py '            moq > shelf or moq > q["qty_milli"],' '            moq > shelf,'
# F8: the extractor goes through the quarantine (a function call refused whole).
plant "F8 a function call in the extractor's answer is ignored" test_a_function_call_from_the_extractor_drops_that_reply_and_runs_nothing $R services/intel/munim_intel/ingest/quarantine.py \
  replace services/intel/munim_intel/ingest/quarantine.py '            if any(p.function_call is not None for p in parts):' '            if False:'
# Polish: rounds <= 3, deterministic quote ids, the reference price cited.
plant "a third counter configurable" test_a_third_counter_is_refused_at_config $W $N/policy.py \
  replace $N/policy.py '        if not 0 <= self.max_counters <= 2:' '        if self.max_counters < 0:'
plant "quote ids from the wall clock" test_quote_ids_are_the_same_for_the_same_run $W $N/run.py \
  replace $N/run.py '                "id": uuid7(t0, f"{ctx.run_id}/quote/{leg.supplier.id}/{round_}"),' '                "id": uuid7(__import__("time").time_ns() // 1_000_000, f"{ctx.run_id}/quote/{leg.supplier.id}/{round_}/{__import__("time").time_ns()}"),'
plant "the reference price not cited" test_the_po_cites_the_last_price_its_bounds_came_from $W $N/review.py \
  replace $N/review.py '            req.shortfall_ref,
            req.reference_ref,' '            req.shortfall_ref,'
plant "a note rides in a trace" test_no_trace_carries_a_note_or_reply_text $W $N/run.py \
  replace $N/run.py '        await state.traces.append("a2a_send", ACTOR, {"supplier": leg.supplier.id, "move": move, "round": str(round_), "label": LABEL_SLUG})' '        await state.traces.append("a2a_send", ACTOR, {"supplier": leg.supplier.id, "move": move, "round": str(round_), "label": LABEL_SLUG, "text": text})'

# R47 D3: deal_inputs v3 — a no-recipe item margined on its selling price, the margin rule skipped where it does not apply.
plant "D3 the margin rule judged where it does not apply" test_d3_an_item_with_no_selling_price_skips_the_margin_rule_and_is_judged_on_the_rest $R $N/review.py \
  replace $N/review.py '        if d["margin_rule_applies"]' '        if True'
plant "D3 the margin rule skipped everywhere" test_d3_a_shop_item_no_recipe_uses_passes_on_its_selling_price_margin $R $N/review.py \
  replace $N/review.py '        if d["margin_rule_applies"]' '        if False'
# R47 D7: the owner's bounds from core's run-frame, never intel constants.
plant "D7 bounds are intel constants" test_d7_the_owners_bounds_from_the_run_frame_change_the_allowed_moves $R $N/policy.py \
  replace $N/policy.py '    return NegotiationPolicy(target_bp=frame.negotiation.target_bp, walk_away_bp=frame.negotiation.walkaway_bp)' \
  '    return NegotiationPolicy(target_bp=9_500, walk_away_bp=11_000)'

# the PO body against core's zod DraftsRequest
Z=tests/negotiate/test_negotiate_zod.py
plant "PO price leaf a bare number" test_po_draft_parses_with_core_zod_and_a_bare_number_is_refused $Z $N/review.py \
  replace $N/review.py '"unit_price_minor": snap_ref(cs, win.row, "unit_price_minor"),' '"unit_price_minor": 792,'

# T-114: a person's request for quotes (`POST /negotiate`, route.py) and the compliance finding that names its outlet.
T=tests/negotiate/test_negotiate_route.py
K=tests/packs/compliance/test_compliance_offline.py
L=services/intel/munim_intel/watch/detectors/compliance/licence_expiring.py
echo "green first (T-114 compliance):"
if ! run_pytest $K; then echo "  FAIL: $K is not green before planting"; tail -30 "$copy/.out"; exit 1; fi
echo "  green: $(tail -1 "$copy/.out")"
plant "T-114 the shortfall minted without v2's as_of (core answers 422)" test_two_outlets_forecast_then_one_po_draft_covering_both $T $N/route.py \
  replace $N/route.py ', "lead_days": LEAD_DAYS, "as_of": as_of.isoformat()}' ', "lead_days": LEAD_DAYS}'
plant "T-114 a zero shortfall still negotiates" test_no_shortfall_contacts_no_supplier_and_calls_no_model $T $N/route.py \
  replace $N/route.py ' and int(r["shortfall_qty_milli"]) > 0' ''
plant "T-114 any run token buys a negotiation" test_the_route_refuses_before_reaching_a_supplier_or_a_model $T $N/route.py \
  replace $N/route.py 'return ctx if ctx.trigger == "ask" else _error(401, "unauthenticated")' 'return ctx'
plant "T-114 the body's outlets not checked against the token's scope" test_the_route_refuses_before_reaching_a_supplier_or_a_model $T $N/route.py \
  replace $N/route.py 'if sorted(o.root for o in req.outlet_ids) != sorted(ctx.outlet_scope):' 'if False:'
plant "T-114 the draft covers only the first outlet" test_two_outlets_forecast_then_one_po_draft_covering_both $T $N/route.py \
  replace $N/route.py 'outlet_ids=tuple(body["outlet_ids"]),' 'outlet_ids=tuple(body["outlet_ids"][:1]),'
plant "T-114 AI off still sends" test_ai_off_or_no_supplier_stops_before_anything_is_forecast_or_sent $T $N/route.py \
  replace $N/route.py 'if frame.narration != "model" and not capped:' 'if False:'
# T-127 (R58): over the month's cap with AI on (live) the models are built capped; AI off, no budget or recorded mode build none.
plant "T-127 over the cap the route stops (model_blocked)" test_over_the_cap_negotiates_capped_and_ai_off_never_builds_a_model $T $N/route.py \
  replace $N/route.py 'if frame.narration != "model" and not capped:' 'if frame.narration != "model":'
plant "T-127 the models built uncapped over the cap" test_over_the_cap_negotiates_capped_and_ai_off_never_builds_a_model $T $N/route.py \
  replace $N/route.py 'await models(client, spend_currency(frame), capped)' 'await models(client, spend_currency(frame))'
plant "T-127 the production reason model built uncapped" test_the_production_factories_build_every_model_capped_over_the_cap tests/manager/test_over_cap.py $N/route.py \
  replace $N/route.py 'await llm_for_role("reason", cfg, client, currency=currency, capped=capped),' 'await llm_for_role("reason", cfg, client, currency=currency),'
plant "T-114 the anchor is the first last price, not the lowest" test_two_outlets_forecast_then_one_po_draft_covering_both $T $N/route.py \
  replace $N/route.py 'p_row = min(held)[1]' 'p_row = held[0][1]'
plant "T-114 an outlet-held licence finding names no outlet" test_an_outlet_held_licence_finding_names_its_outlet_and_a_business_held_one_none $K $L \
  replace $L 'return outlet if w.key.split(":")[1] == OUTLET and isinstance(outlet, str) else None' 'return None'
plant "T-114 a business-held licence finding names an outlet" test_an_outlet_held_licence_finding_names_its_outlet_and_a_business_held_one_none $K $L \
  replace $L 'return outlet if w.key.split(":")[1] == OUTLET and isinstance(outlet, str) else None' 'return outlet if isinstance(outlet, str) else None'
plant "T-114 core's contract refuses a null outlet_ids (every unnamed finding 422)" test_an_outlet_held_licence_finding_names_its_outlet_and_a_business_held_one_none $K packages/contracts/src/internal/index.ts \
  replace packages/contracts/src/internal/index.ts 'outlet_ids: z.array(Uuid7).length(1).nullish(),' 'outlet_ids: z.array(Uuid7).length(1).optional(),'

# suppliers-sim's own gates (cards public and labelled, no default URL)
svc="$copy/services/suppliers-sim"
S=tests/test_sim.py
M=services/suppliers-sim/suppliers_sim/app.py
echo "green first (suppliers-sim):"
if ! run_pytest tests; then echo "  FAIL: suppliers-sim is not green before planting"; tail -30 "$copy/.out"; exit 1; fi
echo "  green: $(tail -1 "$copy/.out")"
plant "sim: a missing public URL defaults to localhost" test_no_public_url_no_server $S $M \
  replace $M '    if not url:' '    if not (url := url or "http://localhost:8000"):'
plant "sim: cards advertise a fixed localhost URL" test_every_card_is_labelled_and_public $S $M \
  replace $M 'AgentInterface(url=f"{public_url}/' 'AgentInterface(url=f"http://localhost:8000/'

# F9: a missing recorded fixture fails the test that missed it (teardown ERROR), never a silent rule default. With the
# round-2 chooser fixture gone, gate 6 still ends at the answer key (the rule default reaches the same PO), so its body
# passes: only the miss check can turn it red.
svc=$intel
missing=$(cd "$intel/tests/negotiate/fixtures/recorded" && grep -l '"recorded/reason"' *.json | xargs grep -l 'Decision round 2 of' | xargs grep -l 'Supplier A:' | head -1)
echo "plant: F9 a recorded chooser fixture goes missing ($missing)"
mv "$intel/tests/negotiate/fixtures/recorded/$missing" "$copy/.missing"
# The ERROR line ends at the test id, or carries " - <message>": pytest adds the message whenever CI is set (GitHub sets it) and
# trims it to the terminal width otherwise, which for this id leaves none. An exact-line match passed here and never on GitHub.
if run_pytest $C; then
  echo "  FAIL: pytest passed (exit 0) with a fixture missing"; failures=$((failures + 1))
elif grep -qE "^ERROR ${C//./\\.}::test_gate6_recorded_po_supplier_is_the_answer_key( - .*)?\$" "$copy/.out" \
  && ! grep -qF "FAILED $C::test_gate6_recorded_po_supplier_is_the_answer_key" "$copy/.out" \
  && grep -qF "AssertionError: recorded fixtures missing: ['" "$copy/.out"; then
  echo "  red:   exit non-zero, ERROR test_gate6_recorded_po_supplier_is_the_answer_key (its body passed; recorded fixtures missing)"
else
  echo "  FAIL: pytest is red but the miss check did not fire:"; grep -E "^(FAILED|ERROR)" "$copy/.out" | cut -c1-200 | sed 's/^/    /'; failures=$((failures + 1))
fi
mv "$copy/.missing" "$intel/tests/negotiate/fixtures/recorded/$missing"

if [ "$failures" -ne 0 ]; then echo "redproof: FAIL — $failures plant(s) did not turn the gates red as expected" >&2; exit 1; fi
echo "redproof: ok — every plant turned its gate red (non-zero exit, named test)"
