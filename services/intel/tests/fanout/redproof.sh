#!/usr/bin/env bash
# Red-proof for the T-053 gates (BOARD b-53 (1)–(6) and the end-to-end ask). Works only in a throwaway copy of the tree
# (as tests/manager/redproof.sh): copy green -> plant one defect -> the gate's run exits non-zero AND names the expected
# test and, where another failure could also go red, the expected message -> restore. node_modules are linked back to
# the original (the e2e runs core-api); nothing runs pnpm (gotcha 27).
#   services/intel/tests/fanout/redproof.sh
set -euo pipefail
# `--offline` (what `make check` runs, via scripts/check/intel-redproof.sh): only the plants whose gate runs on recorded
# models without core-api or Postgres. The end-to-end and core plants seed worlds on embedded Postgres (minutes each), so
# they stay out of `make check`: run this script by hand, without the flag, after touching fan-out.
offline=0
[ $# -le 1 ] || { echo "redproof: one argument at most (--offline)" >&2; exit 2; }
case "${1:-}" in "") ;; --offline) offline=1 ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t053-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

intel="$copy/services/intel"
failures=0
run_offline() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/fanout/test_fanout.py) > "$copy/.out" 2>&1; }
run_e2e() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/fanout/test_fanout_e2e.py) > "$copy/.out" 2>&1; }

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

# plant <label> <runner> <expected test name> <expected text or ""> <file under the repo> <command...>
plant() {
  local label=$1 runner=$2 expect=$3 message=$4 file=$5
  shift 5
  if [ $offline = 1 ] && [ "$runner" != run_offline ]; then echo "plant: $label — skipped (--offline)"; return 0; fi
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif "$runner"; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAILED' "$copy/.out" | grep -F -- "$expect" >/dev/null && { [ -z "$message" ] || grep -qF -- "$message" "$copy/.out"; }; then
    echo "  red:   exits non-zero and names '$expect'${message:+ with \"$message\"}:"
    grep -E 'FAILED' "$copy/.out" | grep -F -- "$expect" | sed -n '1,2p' | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect' ${message:+/ \"$message\"}:"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

F=services/intel/munim_intel/fanout/tool.py
K=services/intel/munim_intel/manager/ask.py
G=services/intel/munim_intel/trace/plugin.py

echo "baseline:"
runners="run_offline run_e2e"
[ $offline = 0 ] || runners=run_offline
for r in $runners; do
  if "$r"; then echo "  green: $r: $(grep -E 'passed' "$copy/.out" | tail -1)"; else echo "  FAIL: $r is red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

plant "(1) prepare() binds no fan_out on investigate" run_offline "test_each_recorded_question_gets_its_hand_label" "" "$K" \
  replace "$K" '        fan_out = FanOutTool(ctx, client, handles, state, frame, branches)' '        fan_out = None'
plant "(1) an addressed investigate fans out too" run_offline "test_each_recorded_question_gets_its_hand_label[@Finance dig into why net fell" "" "$K" \
  replace "$K" 'if b.path is FAN_OUT and b.skill is None and branches is not None:' 'if b.path is FAN_OUT and branches is not None:'
plant "(2) branches run one after another" run_offline "test_at_least_three_branches_run_in_parallel" "every branch starts before any ends" "$F" \
  replace "$F" '        tasks = [asyncio.ensure_future(self._branch(p, question)) for p in packs]' \
  '        tasks = [asyncio.ensure_future(asyncio.sleep(0, r)) for r in [await self._branch(p, question) for p in packs]]'
plant "(3) the member's message (an orchestrator event) rides into each branch" run_offline \
  "test_each_branch_first_request_holds_no_orchestrator_event_and_fits_16k" "" "$F" \
  replace "$F" '        packs = list(dict.fromkeys(args["specialists"]))' \
  '        packs = list(dict.fromkeys(args["specialists"]))
        question = f"{tool_context.user_content.parts[0].text}\n{question}"'
plant "(4) branches bound with propose_*" run_offline "test_a_branch_declares_its_skills_read_tools_and_report_only" "" "$F" \
  replace "$F" '            propose=False,' '            propose=True,'
plant "(4) branches may load skills" run_offline "test_a_branch_declares_its_skills_read_tools_and_report_only" "" "$F" \
  replace "$F" '            loadable=False,' '            loadable=True,'
plant "(5) a branch report never says tainted" run_offline "test_a_branch_that_reads_a_planted_injection_taints_the_orchestrator" \
  "the orchestrator's RunState is tainted" "$F" \
  replace "$F" '        return branch_report(pack, done, state.tainted)' '        return branch_report(pack, done, False)'
plant "(5) the plugin no longer ORs a BranchReport's taint into the run" run_offline \
  "test_a_branch_that_reads_a_planted_injection_taints_the_orchestrator" "the orchestrator's RunState is tainted" "$G" \
  replace "$G" $'        if _carries_taint(result):\n            self.state.tainted = True' $'        if _carries_taint(result):\n            pass'
plant "(6) the per-branch model-call cap lifted" run_offline "test_a_branch_that_never_reports_is_stopped_at_its_call_cap_and_abstains" \
  "stopped exactly at the cap" "$F" \
  replace "$F" 'return Budget(max_model_calls=6, max_input_tokens=60_000, max_tool_calls=8)' \
  'return Budget(max_model_calls=60, max_input_tokens=60_000, max_tool_calls=8)'
plant "(6) fixture-reported input usage not counted" run_offline "test_run_totals_are_within_the_fan_out_caps" "" "$G" \
  replace "$G" '            self.state.budget.input_tokens += usage.prompt_token_count or 0' '            self.state.budget.input_tokens += 0'
plant "(e2e) the Manager cannot fan out" run_e2e \
  "test_why_was_this_week_bad_fans_out_and_merges_at_least_three_branches_into_one_answer_whose_refs_resolve" "" "$K" \
  replace "$K" '        fan_out = FanOutTool(ctx, client, handles, state, frame, branches)' '        fan_out = None'
plant "(e2e) branches run one after another" run_e2e \
  "test_why_was_this_week_bad_fans_out_and_merges_at_least_three_branches_into_one_answer_whose_refs_resolve" "max(starts.values()) < min(ends.values())" "$F" \
  replace "$F" '        tasks = [asyncio.ensure_future(self._branch(p, question)) for p in packs]' \
  '        tasks = [asyncio.ensure_future(asyncio.sleep(0, r)) for r in [await self._branch(p, question) for p in packs]]'

# W3 close: R-E 1-C (money: every branch's calls and the route.intent call charged), R-E 2-C (the band compared),
# R-E 3 (siblings cancelled on an unhandled branch error)
P=services/intel/munim_intel/decide/port.py
plant "(money) a branch's calls are not charged" run_offline "test_every_model_call_of_a_fan_out_ask_is_one_spend_row" "" "$F" \
  replace "$F" 'handles=run.handles, meter=run.meter)' 'handles=run.handles, meter=None)'
plant "(money) the route.intent call is not charged" run_offline "test_every_model_call_of_a_fan_out_ask_is_one_spend_row" "" "$K" \
  replace "$K" '            spend.add("router", result.provider, result.model_id, usage, result.price)' '            pass'
plant "(e2e, money) a branch's calls are not charged" run_e2e \
  "test_why_was_this_week_bad_fans_out_and_merges_at_least_three_branches_into_one_answer_whose_refs_resolve" "" "$F" \
  replace "$F" 'handles=run.handles, meter=run.meter)' 'handles=run.handles, meter=None)'
plant "(R-E 2-C) the route band is not what the fixture says" run_offline "test_each_recorded_question_gets_its_hand_label" "" "$P" \
  replace "$P" '    return "high" if p_bp >= HIGH_BP else "medium"' '    return "high"'
plant "(R-E 3) siblings keep running after a branch raises" run_offline "test_a_branch_that_raises_cancels_its_siblings_before_the_error_leaves" "" "$F" \
  replace "$F" '            for t in tasks:
                t.cancel()' '            for t in tasks:
                pass'

if [ "$failures" -ne 0 ]; then echo "redproof: $failures plant(s) did not go red as expected" >&2; exit 1; fi
echo "redproof: every plant went red"
