#!/usr/bin/env bash
# Red-proof for the T-088b gates (BOARD b-88 T-088b (1)–(5)) and the two W3.3 ruling follow-ups (unaddressed draft →
# specialist_needed; block 2 built from the folded abstain). Works only in a throwaway copy of the tree (as
# tests/manager/redproof.sh): copy green -> plant one defect -> the gate's run exits non-zero AND names the expected test
# (and, where another failure could also go red, the expected message) -> restore. node_modules entries are linked back to
# the original (the e2e runs core-api), except the workspace links (@munim/*), which point into the copy so that core-api
# loads the copy's contracts (plant (4) edits them); nothing runs pnpm (gotcha 27).
#   services/intel/tests/threads/redproof.sh
set -euo pipefail
# `--offline` (what `make check` runs, via scripts/check/intel-redproof.sh): only the plants whose gate runs on recorded
# models without core-api or Postgres. The end-to-end and core plants seed worlds on embedded Postgres (minutes each), so
# they stay out of `make check`: run this script by hand, without the flag, after touching threads (intel's Manager or core's threads module).
offline=0
[ $# -le 1 ] || { echo "redproof: one argument at most (--offline)" >&2; exit 2; }
case "${1:-}" in "") ;; --offline) offline=1 ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t088b-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$rel"
  for e in "$nm"/* "$nm"/.[!.]*; do
    [ -e "$e" ] || [ -L "$e" ] || continue
    [ "${e##*/}" = "@munim" ] || ln -s "$e" "$copy/$rel/"
  done
  if [ -d "$nm/@munim" ]; then
    # pnpm's workspace links are relative (../../../../packages/x), so the same target resolves inside the copy.
    mkdir "$copy/$rel/@munim"
    for l in "$nm"/@munim/*; do ln -s "$(readlink "$l")" "$copy/$rel/@munim/${l##*/}"; done
  fi
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

intel="$copy/services/intel"
failures=0
run_offline() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/manager/test_manager.py tests/context) > "$copy/.out" 2>&1; }
run_e2e() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/manager/test_threads_e2e.py) > "$copy/.out" 2>&1; }
record_context() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen python tests/context/test_context_assembler.py --record) > /dev/null 2>&1; }

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

# plant <label> <runner> <expected test name> <expected text or ""> <files to restore, space-separated> <command...>
plant() {
  local label=$1 runner=$2 expect=$3 message=$4 files=$5
  shift 5
  if [ $offline = 1 ] && [ "$runner" != run_offline ]; then echo "plant: $label — skipped (--offline)"; return 0; fi
  echo "plant: $label"
  for f in $files; do cp "$copy/$f" "$copy/$f.saved"; done
  rm -rf "$copy/.ctxfix" && cp -R "$intel/tests/context/fixtures" "$copy/.ctxfix"
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
  for f in $files; do mv "$copy/$f.saved" "$copy/$f"; done
  rm -rf "$intel/tests/context/fixtures" && cp -R "$copy/.ctxfix" "$intel/tests/context/fixtures"
}

P=services/intel/munim_intel/manager/paths.py
K=services/intel/munim_intel/manager/ask.py
C=services/intel/munim_intel/context/assembler.py
G=services/intel/munim_intel/trace/plugin.py
R=services/intel/munim_intel/graph/tools.py
S=services/core-api/src/modules/threads/summary.ts
I=services/core-api/src/modules/threads/index.ts
X=services/intel/tests/manager/ask_stack.mts
B=services/intel/munim_intel/trace/buffer.py
T=packages/contracts/src/shared/trace.ts

echo "baseline:"
runners="run_offline run_e2e"
[ $offline = 0 ] || runners=run_offline
for r in $runners; do
  if "$r"; then echo "  green: $r: $(grep -E 'passed' "$copy/.out" | tail -1)"; else echo "  FAIL: $r is red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

# The summary exclusion has two lines: summary.ts and 0020's summary_untainted trigger. Removing only the first makes the
# trigger refuse turn 2's ask (a 503 — red for the wrong reason), so the plant takes both; the migration is untouched.
no_summary_exclusion() {
  replace "$S" "if (t.tainted || " "if (" &&
    replace "$X" "  const db = await startTestDb();" '  const db = await startTestDb();
  await db.admin("ALTER TABLE core.ai_thread DISABLE TRIGGER summary_untainted");'
}
# The Manager's block 1 takes tenant data (the Manager uses the base assembler).
manager_tenant_in_block_1() {
  replace "$C" "[CORE_RULES, output_contract" "[CORE_RULES + self.frame.currency, output_contract" && record_context
}

plant "(1) intel ignores addressed_to (no skill loaded in code)" run_e2e "test_answers_in_a_specialist_thread_carry_that_specialist" "" "$P" \
  replace "$P" "return Binding(path, addressed_to, loadable=False, propose=path.propose)" "return Binding(path, None, loadable=True, propose=False)"
plant "(1) core does not address an unaddressed turn to the thread's specialist" run_e2e "test_answers_in_a_specialist_thread_carry_that_specialist" "" "$I" \
  replace "$I" "addressedTo(question) ?? existing?.specialist ?? null" "addressedTo(question)"
plant "(2) the summary points at the wrong segment" run_e2e "test_the_rolling_summary_refs_all_resolve_after_five_turns" "0 dangling" "$S" \
  replace "$S" "segment: i, refs" "segment: i + 1, refs"
plant "(3) the thread taint carry into RunState removed" run_e2e "test_an_injected_read_in_turn_two_starts_turn_three_tainted" "" "$C" \
  replace "$C" "            self.state.tainted = True" "            pass"
plant "(3) a graph result row does not taint" run_e2e "test_an_injected_read_in_turn_two_starts_turn_three_tainted" "" "$R" \
  replace "$R" '"tainted": bool(shown)' '"tainted": False'
plant "(3) the plugin's taint refusal removed" run_e2e "test_an_injected_read_in_turn_two_starts_turn_three_tainted" "refused (1)" "$G" \
  replace "$G" "if state.tainted and _gated(name):" "if False:"
# Two guards keep prose out of a trace: intel's check_payload (buffer.py LABEL) and core's trace contract (the same Label
# pattern since W3.3), which also reaches intel through the generated Pydantic models. Either alone refuses the planted
# question (core answers 422 invalid_payload and nothing is stored), so the plant takes both off and regenerates the
# contracts in the copy; then the scan is the only guard. The second gen after the plant restores the generated files.
regen_contracts() { (cd "$copy" && node packages/contracts/scripts/gen.ts) > "$copy/.gen" 2>&1; }
question_in_route_trace() {
  replace "$B" "if not LABEL.match(label):" "if False:" &&
    replace "$T" 'const Label = z.string().regex(/^(?![0-9][0-9.]{3,}$)[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/);' 'const Label = z.string().max(200);' &&
    regen_contracts &&
    replace "$K" '{"intent": intent, "band": band, "path": b.path.name}' '{"intent": intent, "band": band, "path": b.path.name, "q": req.question}'
}
plant "(4) the route trace carries the question (intel's and core's label checks off)" run_e2e "test_traces_carry_no_thread_prose" "thread prose in" \
  "$K $B $T" question_in_route_trace
[ $offline = 1 ] || regen_contracts || { echo "  FAIL: contracts gen did not restore after plant (4)"; failures=$((failures + 1)); }
# Since R-E 3 the summary never reaches the model (block 6b names no ref), so the exclusion shows in what core sends.
plant "(5) the summary exclusion removed (summary.ts and the 0020 trigger)" run_e2e "test_at_turn_six_the_aged_out_injected_turn_leaves_zero_bytes" \
  "tainted turns are excluded from the summary" "$S $X" no_summary_exclusion
plant "ruling: an unaddressed draft request runs read-only" run_offline "test_an_unaddressed_draft_request_abstains_specialist_needed" "" "$P" \
  replace "$P" "    if path.propose:
        return Binding(path, None, loadable=False, propose=False, abstain=\"specialist_needed\")
" ""
plant "ruling: block 2 ignores the folded abstain" run_offline "test_block_2_is_built_from_the_folded_abstain_and_the_manager_needs_no_override" "" "$C" \
  replace "$C" "folded = next((t for t in self.toolset.tools if isinstance(t, SubmitAnswerTool)), None)" "folded = None"
plant "ruling: tenant data planted into the Manager's block 1" run_offline \
  "test_two_tenants_get_a_byte_identical_prefix_through_block_4_in_the_managers_context" "blocks 1–3 differ across tenants" "$C" manager_tenant_in_block_1

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
