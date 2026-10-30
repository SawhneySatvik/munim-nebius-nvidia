#!/usr/bin/env bash
# Red-proof for the T-082a context gates (BOARD b-82 (1)–(6)). Works only in a throwaway copy of the tree (as
# tests/tools/redproof.sh): copy green -> plant one defect -> pytest exits non-zero AND names the expected test (and,
# where a missing fixture could also go red, the expected assertion message) -> restore. Plants that change a model
# request re-record the fixtures in the copy first, so the red is the gate's assertion, never RecordedFixtureMissing.
#   services/intel/tests/context/redproof.sh
set -euo pipefail
# `--offline` is accepted for a uniform call from scripts/check/intel-redproof.sh: every plant here is already offline
# (recorded models, no core-api or Postgres).
[ $# -le 1 ] || { echo "redproof: one argument at most (--offline)" >&2; exit 2; }
case "${1:-}" in "" | --offline) ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t082a-context-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"

intel="$copy/services/intel"
failures=0
run_pytest() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/context) > "$copy/.out" 2>&1; }
record() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen python tests/context/test_context_assembler.py --record) > /dev/null 2>&1; }

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

# plant <label> <expected test name> <expected text in the output, or ""> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 message=$3 file=$4
  shift 4
  echo "plant: $label"
  cp "$intel/$file" "$copy/.saved"
  rm -rf "$copy/.fixtures" && cp -R "$intel/tests/context/fixtures" "$copy/.fixtures"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest; then
    echo "  FAIL: pytest passed with the plant in place"; failures=$((failures + 1))
  elif grep -E '^FAILED' "$copy/.out" | grep -F -- "$expect" >/dev/null && { [ -z "$message" ] || grep -qF -- "$message" "$copy/.out"; }; then
    echo "  red:   pytest exits non-zero and names '$expect'${message:+ with \"$message\"}:"
    grep -E '^FAILED' "$copy/.out" | sed -n '1,4p' | sed 's/^/    /'
  else
    echo "  FAIL: pytest is red but not for '$expect' ${message:+/ \"$message\"}:"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$intel/$file"
  rm -rf "$intel/tests/context/fixtures" && cp -R "$copy/.fixtures" "$intel/tests/context/fixtures"
}

A=munim_intel/context/assembler.py
E=munim_intel/context/expand.py
L=munim_intel/skills/loader.py

echo "baseline:"
if run_pytest; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

no_compaction() { replace "$A" "compact(req, keep_model_turns=2)" "pass" && replace "$A" "compact(req, keep_model_turns=0)" "pass"; }
tenant_in_block_1() { replace "$A" "[CORE_RULES, output_contract" "[CORE_RULES + self.frame.currency, output_contract" && record; }
cache_on() { replace "$L" "self._use_invocation_cache = False" "self._use_invocation_cache = True" && record; }

plant "(1) no compaction" "test_every_assembled_call_is_within_its_per_call_cap" "" "$A" no_compaction

plant "(1) over the cap still calls the model" "test_at_the_cap_the_step_is_answered_cannot_verify_without_a_model_call" "" "$A" \
  replace "$A" "return request_tokens(req) <= self.cap" "return True"

plant "(1) orchestrator material enters a branch" "test_a_branch_gets_block_5_and_no_orchestrator_material" "" "$A" \
  replace "$A" 'if self.kind == "branch":' "if False:"

plant "(2) tenant data (the currency) planted into block 1" "test_two_tenants_same_question_get_a_byte_identical_prefix_through_block_4" \
  "blocks 1–3 differ across tenants" "$A" tenant_in_block_1

plant "(2b) ADK's per-invocation toolset cache left on" "test_a_mid_run_load_skill_binds_on_the_next_model_step" "" "$L" cache_on

plant "(3) an unexpanded handle passes through" "test_unexpanded_or_forged_handles_render_cannot_verify" "" "$E" \
  replace "$E" "return CANNOT_VERIFY if _BRACED.search(out) else out" "return out"

plant "(3) a forged canonical ref passes" "test_unexpanded_or_forged_handles_render_cannot_verify" "" "$E" \
  replace "$E" "if any(not _known(t, handles, exact, vouched_ids) for t in ANY_REF.findall(text)):" "if False:"

plant "(3) R-E 2-B: a typed ref of a minted snapshot passes on its id, row and column unchecked" \
  "test_a_typed_ref_is_checked_for_its_row_and_column_not_only_its_id" "" "$E" \
  replace "$E" "            return cell" "            return True"

plant "(3) R-E 2-B: a vouched canonical ref vouches its id, not the exact token" \
  "test_a_typed_ref_is_checked_for_its_row_and_column_not_only_its_id" "" "$E" \
  replace "$E" "    vouched_ids = _ids(r for r in refs if not r.startswith(SNAP_OPEN))" "    vouched_ids = _ids(refs)"

plant "(3) the step summary is not rendered through expand" "test_a_planted_handle_in_a_step_summary_renders_cannot_verify_in_context" "" "$A" \
  replace "$A" "{expand(s.text, handles, refs=s.refs)}" "{s.text}"

plant "(4) no tool cap" "test_a_second_load_above_twenty_tools_is_refused_and_binds_nothing" "" "$L" \
  replace "$L" "if len(self.tools) + len(new) > TOOL_CAP:" "if False:"

plant "(4) payroll_scope not passed from the frame" "test_payroll_scope_from_the_frame_reaches_the_people_toolset" "" "$L" \
  replace "$L" '{"payroll_scope": self._payroll_scope}' '{"payroll_scope": "drafts"}'

plant "(5) tainted step summaries kept" "test_a_tainted_step_summary_contributes_zero_bytes_and_untainted_ones_are_present" "" "$A" \
  replace "$A" "steps = [s for s in inv.steps if not s.tainted][-STEP_SUMMARIES:]" "steps = list(inv.steps)[-STEP_SUMMARIES:]"

plant "(6) R-E 3: the thread block names its last turns by id" "test_thread_excerpt_marks_a_follow_up_and_carries_no_turn_answer_or_ref_id" "" "$A" \
  replace "$A" '"evidence is not carried over: read it again with your tools to cite it."' \
  '"evidence is not carried over: read it again with your tools to cite it." + " ".join(str(t.root) for t in thread.last_turn_ids)'

plant "(6) a first turn gets a thread block" "test_thread_excerpt_marks_a_follow_up_and_carries_no_turn_answer_or_ref_id" "" "$A" \
  replace "$A" "    if thread is None or not (thread.last_turn_ids or thread.summary_refs):" "    if thread is None:"

plant "(6) a tainted thread does not taint the run" "test_a_tainted_thread_starts_the_run_tainted" "" "$A" \
  replace "$A" "            self.state.tainted = True" "            pass"

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
