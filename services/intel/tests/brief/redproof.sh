#!/usr/bin/env bash
# Red-proof for the T-054 gates (as tests/graph/redproof.sh): in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test fails this script.
#   services/intel/tests/brief/redproof.sh
set -euo pipefail
# `--offline` (what `make check` runs, via scripts/check/intel-redproof.sh): only the plants whose gate runs on recorded
# models without core-api or Postgres. The end-to-end and core plants seed worlds on embedded Postgres (minutes each), so
# they stay out of `make check`: run this script by hand, without the flag, after touching the daily brief.
offline=0
[ $# -le 1 ] || { echo "redproof: one argument at most (--offline)" >&2; exit 2; }
case "${1:-}" in "") ;; --offline) offline=1 ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t054-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")

intel="$copy/services/intel"
W=services/intel/munim_intel/brief
T=tests/brief/test_brief.py
E=tests/brief/test_brief_e2e.py
failures=0
run_pytest() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings "$@") > "$copy/.out" 2>&1; }

replace() { # replace <file> <old> <new>: exactly one occurrence, or the plant itself is broken
  python3 - "$copy/$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
PY
}

# plant <label> <test file> <expected failing test id (prefix)> <file to restore> <command...>
plant() {
  local label=$1 tests=$2 expect=$3 file=$4
  shift 4
  if [ $offline = 1 ] && [[ "$tests" == *_e2e.py ]]; then echo "plant: $label — skipped (--offline)"; return 0; fi
  echo "plant: $label"
  mkdir -p "$copy/.saved" && cp -R "$copy/$file" "$copy/.saved/"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$tests"; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "FAILED $expect" "$copy/.out"; then
    echo "  red:   pytest exit non-zero and names $expect"
    grep -F -- "FAILED" "$copy/.out" | sed 's/^/    /' | sed -n '1,6p'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  rm -rf "$copy/$file"; cp -R "$copy/.saved/$(basename "$file")" "$copy/$file"; rm -rf "$copy/.saved"
}

echo "baseline:"
skip_e2e=()
[ $offline = 0 ] || skip_e2e=(--ignore-glob='*_e2e.py')
if run_pytest tests/brief ${skip_e2e[@]+"${skip_e2e[@]}"}; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# (1) gate 3: a second model call
plant "a second model call" $T "$T::test_one_recorded_model_call_words_every_item_and_each_is_signed" $W/__init__.py \
  replace $W/__init__.py '    events = await run_agent(agent, ctx, message(handled), cfg, state=state, actor="brief")' \
  '    events = await run_agent(agent, ctx, message(handled), cfg, state=state, actor="brief")
        events = await run_agent(agent, ctx, message(handled), cfg, state=state, actor="brief")'

# (2) gate 4: the hard cap is ignored -> a model call after the budget is out
plant "hard cap ignored" $T "$T::test_hard_cap_ai_off_and_a_failed_call_each_give_the_complete_template_brief_with_no_model_call" $W/__init__.py \
  replace $W/__init__.py '    if not handled or state.budget.models_exhausted():' '    if not handled:'

# replace2 <file> <old1> <new1> <old2> <new2>: both, as one plant
replace2() { replace "$1" "$2" "$3" && replace "$1" "$4" "$5"; }

# (3) a typed digit survives the drop rule (both the digit scan and core's grammar off)
plant "digits in model lines are kept" $T "$T::test_a_planted_digit_or_forged_ref_or_second_line_is_dropped_to_the_template" $W/__init__.py \
  replace2 $W/__init__.py 'ch.isnumeric() or ch.isdigit() or ch in' 'ch in' ' and check_grammar(text) is None' ''

# (4) a ref the model typed survives (the typed-bracket check and the own-refs check off)
plant "typed and foreign refs are kept" $T "$T::test_a_planted_digit_or_forged_ref_or_second_line_is_dropped_to_the_template" $W/__init__.py \
  replace2 $W/__init__.py 'if not tokens or any(t not in allowed for t in tokens) or len(text) > 1800:' 'if not tokens or len(text) > 1800:' \
  ' or typed_bracket(line):' ':'

# (9) R-E 1-A: a number word or a ⟩k suffix survives (core's grammar not run on model lines)
plant "number words and suffixes are kept" $T "$T::test_a_planted_digit_or_forged_ref_or_second_line_is_dropped_to_the_template" $W/__init__.py \
  replace $W/__init__.py ' and check_grammar(text) is None' ''

# (10) R-E 1-A: a later line stands in for an item's refused one
plant "a later line stands in for a refused one" $T "$T::test_a_planted_digit_or_forged_ref_or_second_line_is_dropped_to_the_template" $W/__init__.py \
  replace $W/__init__.py 'first = len(hs) == 1 and hs[0] not in seen' 'first = len(hs) == 1 and hs[0] not in {h for h, _ in handled if index[h] in out}'

# (11) R-E 1-A: a brief core abstains is not re-posted as the template
plant "no template re-post" $T "$T::test_a_brief_core_abstains_is_reposted_template_only_under_its_own_id" $W/__init__.py \
  replace $W/__init__.py '    if resp.abstained and report.model_items:' '    if False:'

# (12) R-E 1-A, real core: the same, against core's validator
plant "no template re-post (real core)" $E "$E::test_a_brief_core_abstains_is_reposted_as_the_template_and_that_one_stands" $W/__init__.py \
  replace $W/__init__.py '    if resp.abstained and report.model_items:' '    if False:'

# (13) R-E 1-A, real core: a ⟩k line reaches core and the stored brief is abstained
plant "suffix lines reach core" $E "$E::test_a_number_word_or_a_suffix_line_never_reaches_core_and_the_brief_stands" $W/__init__.py \
  replace2 $W/__init__.py ' and check_grammar(text) is None' '' '    if resp.abstained and report.model_items:' '    if False:'

# (14) R-E 3: refs[] holds snapshot cells only (a cited document is not declared)
plant "refs are snapshot cells only" $T "$T::test_a_stored_text_citing_a_document_lists_that_cite_in_refs" $W/__init__.py \
  replace $W/__init__.py '        segments.append({"text": text, "refs": ref_ids(text)})' \
  '        segments.append({"text": text, "refs": [r for r in ref_ids(text) if r.startswith("snap:")]})'

# (5) the item carries a dedupe key (review R-B: it must not exist to be rendered)
plant "BriefItem has a dedupe_key" $T "$T::test_untrusted_text_never_reaches_the_model_or_a_trace_and_no_dedupe_key_exists" $W/__init__.py \
  replace $W/__init__.py '    draft_ids: tuple[str, ...] = ()' '    draft_ids: tuple[str, ...] = ()
    dedupe_key: str = ""'

# (6) the model sees the stored text (untrusted text reaches the request)
plant "prompt carries the stored text" $T "$T::test_untrusted_text_never_reaches_the_model_or_a_trace_and_no_dedupe_key_exists" $W/__init__.py \
  replace $W/__init__.py "f\"kind {i.kind.split('.')[-1].replace('_', ' ')}" "f\"text {i.texts[0]} kind {i.kind.split('.')[-1].replace('_', ' ')}"

# (7) the signature is dropped
plant "no specialist signature" $T "$T::test_one_recorded_model_call_words_every_item_and_each_is_signed" $W/__init__.py \
  replace $W/__init__.py '        text = body + _signature(item)' '        text = body'

# (8) gate 4, real core: the template fallback carries a digit -> core's validator abstains the brief
plant "template fallback with a planted digit" $E "$E::test_template_brief_passes_core_validator_and_planted_digit_or_forged_ref_does_not" $W/__init__.py \
  replace $W/__init__.py '    body = " ".join(kept)' '    body = " ".join(kept) + " 3 more"'

# (15) R-D 5: the strict xfail admits AssertionError only — a crash inside the ranking check is a real red, not an xfail
WE=tests/brief/test_brief_wiring_e2e.py
plant "the top-five check crashes (KeyError) under the xfail" $WE "$WE::test_the_top_five_is_the_hand_ranking" services/intel/$WE \
  replace services/intel/$WE "got.append(by_impact.get((i[\"pack\"], impact), f\"extra:{i['type']}:{impact}:{i['severity']}\"))" \
  "got.append(by_impact[(i[\"pack\"], impact)])"

# (16) R-D 5: the pair runs the same hand_ids path, so a broken mapping turns it red
plant "hand_ids maps to the wrong ids" $WE "$WE::test_the_hand_ranking_gate_can_pass" services/intel/$WE \
  replace services/intel/$WE 'by_impact = {(r["pack"], r["impact_minor"]): r["id"] for r in HAND["rows"] if r["impact_minor"] is not None}' \
  'by_impact = {(r["pack"], r["impact_minor"]): r["pack"] for r in HAND["rows"] if r["impact_minor"] is not None}'

[ "$failures" -eq 0 ] && echo "ALL RED-PROOFS FIRED" || { echo "$failures red-proof(s) failed"; exit 1; }
