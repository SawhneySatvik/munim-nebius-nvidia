#!/usr/bin/env bash
# Red-proof for the T-042 gates. Works only in a throwaway copy of the tree (as scripts/check/intel-redproof.sh):
#   copy green  ->  plant one defect  ->  pytest exits non-zero AND names the expected test  ->  restore.
# A red that names another test (a crash, an unrelated failure) fails this script. The copy gets its own .venv.
#   services/intel/tests/trace/redproof.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t042-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
# core_roundtrip.mts and the run-token fixture run core's code under node: link node_modules back to the original.
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

intel="$copy/services/intel"
T=tests/trace/test_trace_plugin.py
failures=0
run_pytest() { (cd "$intel" && uv run --quiet --frozen pytest -q -p no:warnings "$@") > "$copy/.out" 2>&1; }

# replace <file under services/intel> <old> <new>: exactly one occurrence, or the plant itself is broken.
replace() {
  python3 - "$intel/$1" "$2" "$3" <<'EOF'
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
  cp "$intel/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$target"; then
    echo "  FAIL: pytest passed with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "$expect" "$copy/.out"; then
    echo "  red:   pytest exits non-zero and names '$expect':"
    grep -F -- "$expect" "$copy/.out" | sed -n '1,3p' | sed 's/^/    /'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$intel/$file"
}

P=munim_intel/trace/plugin.py
B=munim_intel/trace/buffer.py
R=munim_intel/runtime/runner.py

echo "baseline:"
if run_pytest tests/trace; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# (1) a misspelt hook is never called: its count is 0
plant "misspelt on_tool_error hook" "FAILED $T::test_each_of_the_14_callbacks_fires_on_the_scripted_run_plus_3_planted_error_runs" \
  "$T::test_each_of_the_14_callbacks_fires_on_the_scripted_run_plus_3_planted_error_runs" $P \
  replace $P 'async def on_tool_error_callback(' 'async def on_tool_eror_callback('

# (2) the error-path flushes, each alone
plant "no flush in on_run_error" "FAILED $T::test_a_model_error_is_flushed_by_on_run_error_alone" $T $P \
  replace $P $'        await self._trace("error", {"where": "run", "error": error_label(error)})\n        await self._flush()' \
  '        await self._trace("error", {"where": "run", "error": error_label(error)})'
plant "no flush in run_agent's finally" "FAILED $T::test_a_cancelled_run_is_flushed_by_the_runners_finally" $T $R \
  replace $R '                    await flush()' '                    pass'

# (3) budget not enforced
plant "budget not checked" "FAILED $T::test_the_budget_stops_at_exactly_the_cap_with_the_template" $T $P \
  replace $P '        if budget.models_exhausted():' '        if False:'

# (4) arguments not validated
plant "args not validated" "FAILED $T::test_invalid_args_give_one_actionable_error_then_the_retry_runs" $T $P \
  replace $P '        problem = _invalid_args(tool, tool_args)' '        problem = None'

# (5) taint: never set; set per Runner (not shared by branch Runners)
plant "search does not taint" "FAILED $T::test_search_then_propose_in_one_runner_is_refused" $T $P \
  replace $P $'        if name in UNTRUSTED_READS:\n            state.tainted = True' $'        if name in UNTRUSTED_READS:\n            pass'
plant "taint per Runner, not per run" "FAILED $T::test_a_branch_that_searched_taints_the_manager" \
  "$T::test_a_branch_that_searched_taints_the_manager" $R \
  replace $R 'plugins = [] if state is None else [MunimPlugin(state, route_labels)]' \
  'plugins = [] if state is None else [MunimPlugin(__import__("dataclasses").replace(state), route_labels)]'

plant "request_quotes not gated" "FAILED $T::test_search_then_request_quotes_is_refused" $T $P \
  replace $P '    return tool.startswith("propose_") or tool == "request_quotes"' '    return tool.startswith("propose_")'

# (6) flush not serialised with allocation
plant "no lock around append" "FAILED $T::test_four_concurrent_branches_of_60_events_are_seq_1_to_240_gapless" $T $B \
  replace $B $'    async def _add(self, model: type[Events] | type[Events1], kind: str, actor: str, payload: dict[str, Any], parent_id: str | None) -> str:\n        async with self._lock:' $'    async def _add(self, model: type[Events] | type[Events1], kind: str, actor: str, payload: dict[str, Any], parent_id: str | None) -> str:\n        if True:'

# (7) actor labels
plant "skill tools traced as manager" "FAILED $T::test_every_row_of_a_skill_bearing_run_carries_its_specialist_or_manager" $T $P \
  replace $P '        return check_actor(f"specialist:{pack}") if pack and actor == "manager" else actor' '        return actor'

# no prose: the member's question copied into the route trace; then the same with the label check disabled
plant "question in the route trace" "FAILED $T::test_no_payload_of_any_scripted_run_carries_planted_text" $T $P \
  replace $P '{"agent": agent.name if agent is not None else "none"}' \
  '{"agent": agent.name if agent is not None else "none", "question": "".join(p.text or "" for p in user_message.parts or [])}'
plant "question in the route trace, label check off" "FAILED $T::test_no_payload_of_any_scripted_run_carries_planted_text" \
  "$T::test_no_payload_of_any_scripted_run_carries_planted_text" $B \
  sh -c "cp '$intel/$P' '$copy/.savedP' && python3 - '$intel/$B' '$intel/$P' <<'EOF'
import sys
b, p = sys.argv[1:]
t = open(b).read(); assert t.count('            if not LABEL.match(label):') == 1
open(b, 'w').write(t.replace('            if not LABEL.match(label):', '            if False:'))
t = open(p).read(); old = '{\"agent\": agent.name if agent is not None else \"none\"}'; assert t.count(old) == 1
open(p, 'w').write(t.replace(old, '{\"agent\": agent.name if agent is not None else \"none\", \"question\": \"\".join(p.text or \"\" for p in user_message.parts or [])}'))
EOF"
cp "$copy/.savedP" "$intel/$P"

# round-trip: a seq gap reaches the real core on embedded Postgres
plant "seq off by one" "FAILED tests/trace/test_trace_core_roundtrip.py::test_a_runs_batches_round_trip_to_core_on_embedded_postgres_gapless" \
  tests/trace/test_trace_core_roundtrip.py $B \
  replace $B '"seq": len(self._events) + 1,' '"seq": len(self._events) + 2,'

# W3 close ruling (R-E 1-C, money): one spend row per provider call, posted with the traces, priced and rounded up.
S=munim_intel/trace/spend.py
TS=tests/trace/test_spend.py
plant "spend: a reported call is not charged" "FAILED $TS::test_a_reported_call_is_one_row_with_the_providers_counts_thinking_billed_as_output" $TS $P \
  replace $P '        if self.state.meter is not None and not llm_response.partial:' '        if False:'
plant "spend: a failed call is not charged" "FAILED $TS::test_a_failed_call_is_still_charged_and_posted_by_the_failed_runs_flush" $TS $P \
  replace $P $'        # Spend first (a failed or rate-limited call may still be billed), then the traces.\n        if self.state.meter is not None:' \
  $'        # Spend first (a failed or rate-limited call may still be billed), then the traces.\n        if False:'
plant "spend: an amount rounds down (a small priced call is free)" "FAILED $TS::test_amounts_by_hand_from_the_operator_price_round_up" $TS $S \
  replace $S '    return -(-(usage.input_tokens * price.input_per_mtok_minor + usage.output_tokens * price.output_per_mtok_minor) // 1_000_000)' \
  '    return (usage.input_tokens * price.input_per_mtok_minor + usage.output_tokens * price.output_per_mtok_minor) // 1_000_000'
# R47 D1: operator prices. A live role with no price, or a price in another currency than the run's spend, is refused
# before any model exists; a replay is charged 0 (never a made-up rate); the ask path names the refusal.
LI=munim_intel/llm/__init__.py
plant "D1: a live role with no price is built" "FAILED tests/test_models.py::test_a_live_role_with_no_price_is_refused_before_any_model_exists" \
  tests/test_models.py $LI replace $LI '        raise PriceRefused("price_missing", role)' '        pass'
plant "D1: a price in another currency is accepted (an implied FX of 1)" \
  "FAILED tests/test_models.py::test_a_price_in_another_currency_than_the_runs_spend_is_refused_never_converted" tests/test_models.py $LI \
  replace $LI '    if currency is not None and price.currency != currency:' '    if False:'
plant "D1: a replay is charged at a made-up rate" "FAILED $TS::test_a_replay_with_no_price_is_still_a_row_with_its_tokens_at_zero" $TS $S \
  replace $S $'    if price is None:\n        return 0' $'    if price is None:\n        return usage.input_tokens'
AK=munim_intel/manager/ask.py
plant "D1: the ask's abstention does not name the price refusal" \
  "FAILED tests/manager/test_manager.py::test_live_an_unpriced_or_foreign_priced_role_is_a_model_blocked_abstention_before_any_call" \
  tests/manager/test_manager.py $AK replace $AK 'e.code if isinstance(e, PriceRefused) else None)' 'None)'
no_spend_flush() {
  cp "$intel/$R" "$copy/.savedR" &&
    replace $P $'        if self.state.meter is not None:\n            await self.state.meter.buffer.flush()' '' &&
    replace $R '*([state.meter.buffer.flush] if state.meter is not None else [])' '*[]'
}
plant "spend: a failed run's rows are never flushed" "FAILED $TS::test_a_failed_call_is_still_charged_and_posted_by_the_failed_runs_flush" $TS $P \
  no_spend_flush
cp "$copy/.savedR" "$intel/$R"
plant "spend: a refused flush loses its rows" "FAILED $TS::test_a_flush_is_idempotent_and_a_refused_flush_keeps_its_rows_for_the_next" $TS $S \
  replace $S $'                chunk = self._entries[self._sent : self._sent + BATCH_CAP]\n' $'                chunk = self._entries[self._sent : self._sent + BATCH_CAP]\n                self._sent += len(chunk)\n'

# W3 close (fx-ai), run here because this script is in `make check`: R-E 2-C (the fixture-miss guard), the ruling's
# live-call timeout, R-E 3 (the live smoke's call count on failure).
C=tests/conftest.py
plant "a swallowed recorded-fixture miss passes its test" \
  "FAILED tests/test_fixture_guard.py::test_an_unmarked_swallowed_miss_fails_and_a_marked_one_or_none_passes" tests/test_fixture_guard.py $C \
  replace $C '    if missed and item.get_closest_marker("fixture_miss_expected") is None and report.passed:' '    if False:'
plant "a miss in a module-scoped fixture is not counted (read after setup)" \
  "FAILED tests/test_fixture_guard.py::test_an_unmarked_swallowed_miss_fails_and_a_marked_one_or_none_passes" tests/test_fixture_guard.py $C \
  replace $C $'    item.stash[_MISSES_BEFORE] = RecordedFixtureMissing.raised\n    yield\n' $'    yield\n    item.stash[_MISSES_BEFORE] = RecordedFixtureMissing.raised\n'
L=munim_intel/llm/providers.py
plant "a live call has no timeout" "FAILED tests/test_models.py::test_a_live_call_past_its_timeout_fails_like_a_provider_error" tests/test_models.py $L \
  replace $L '    async with asyncio.timeout(seconds):' '    if True:'
SL=tests/live/smoke_live.py
plant "the live smoke counts a failed call as one" \
  "FAILED tests/live/test_smoke_live.py::test_a_present_key_with_a_failing_call_exits_nonzero_without_leaking_text" tests/live/test_smoke_live.py $SL \
  replace $SL 'Cell("failed", err(e), None, calls=worst_calls(provider, role))' 'Cell("failed", err(e), None)'

M=munim_intel/decide/mimic.py
plant "the DecisionModel's retry is not charged" \
  "FAILED tests/decide/test_decide.py::test_both_calls_of_a_rejected_then_retried_route_are_spend_rows" tests/decide/test_decide.py $M \
  replace $M '            usage.append(_usage(retry, last))' '            pass'

echo "after the plants:"
if run_pytest tests/trace; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi

if [ $failures -ne 0 ]; then
  echo "t042-redproof: FAIL ($failures)" >&2
  exit 1
fi
echo "t042-redproof: ok — 27/27 plants turned the T-042, spend (R47 D1 prices), fixture-guard, timeout, smoke-count and DecisionModel-spend gates red naming the expected test; green after restoring"
