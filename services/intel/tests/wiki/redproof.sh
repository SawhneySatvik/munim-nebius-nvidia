#!/usr/bin/env bash
# Red-proof for the T-057 gates (as tests/graph/redproof.sh): in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test fails this script.
#   services/intel/tests/wiki/redproof.sh
set -euo pipefail
# `--offline` (what `make check` runs, via scripts/check/intel-redproof.sh): only the plants whose gate runs on recorded
# models without core-api or Postgres. The end-to-end and core plants seed worlds on embedded Postgres (minutes each), so
# they stay out of `make check`: run this script by hand, without the flag, after touching the wiki compiler.
offline=0
[ $# -le 1 ] || { echo "redproof: one argument at most (--offline)" >&2; exit 2; }
case "${1:-}" in "") ;; --offline) offline=1 ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t057-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")

intel="$copy/services/intel"
W=services/intel/munim_intel/wiki
T=tests/wiki/test_wiki.py
E=tests/wiki/test_wiki_e2e.py
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
if run_pytest tests/wiki ${skip_e2e[@]+"${skip_e2e[@]}"}; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# (1) gate 1: no ref requirement -> the planted uncited sentence is posted
plant "uncited sentences are kept" $T "$T::test_a_planted_uncited_sentence_is_dropped" $W/pages.py \
  replace $W/pages.py '    if not tokens or any(t not in allowed for t in tokens):' '    if False:'

# (2) a ref the page did not mint is kept (forged ref typed by the model)
# (the typed-bracket drop runs first on model text since R-E 2-B, so both checks go, as one plant over the directory)
foreign_refs_kept() {
  replace $W/pages.py '    if not tokens or any(t not in allowed for t in tokens):' '    if not tokens:' &&
    replace $W/compiler.py '    raw = [expand(s, table) for s in said if not typed_bracket(s)]' '    raw = [expand(s, table) for s in said]'
}
plant "foreign refs are kept" $T "$T::test_digits_forged_refs_and_quotations_are_dropped" $W foreign_refs_kept

# replace2 <file> <old1> <new1> <old2> <new2>: both, as one plant
replace2() { replace "$1" "$2" "$3" && replace "$1" "$4" "$5"; }

# (3) a typed digit is kept (the digit scan and core's grammar both off)
plant "digits in prose are kept" $T "$T::test_digits_forged_refs_and_quotations_are_dropped" $W/pages.py \
  replace2 $W/pages.py 'ch.isnumeric() or ch.isdigit() or ch in' 'ch in' '    if len(sentence) > 2000 or check_grammar(sentence) is not None:' '    if len(sentence) > 2000:'

# (3b) R-E 1-A: a number word or a ⟩k suffix is kept (core's grammar not run)
plant "number words and suffixes are kept" $T "$T::test_digits_forged_refs_and_quotations_are_dropped" $W/pages.py \
  replace $W/pages.py '    if len(sentence) > 2000 or check_grammar(sentence) is not None:' '    if len(sentence) > 2000:'

# (3c) a ref the model typed (one the page holds) is kept
plant "typed refs are kept" $T "$T::test_digits_forged_refs_and_quotations_are_dropped" $W/compiler.py \
  replace $W/compiler.py '    raw = [expand(s, table) for s in said if not typed_bracket(s)]' '    raw = [expand(s, table) for s in said]'

# (3d) R-E 3: a title with a number word is shown
plant "titles skip the grammar" $T "$T::test_recorded_prose_is_cited_and_untrusted_text_reaches_neither_the_model_nor_a_trace" $W/pages.py \
  replace $W/pages.py ' and check_grammar(e.name) is None' ''

# (4) gate 2: a constant fingerprint -> a changed input is never rebuilt
plant "constant fingerprint" $T "$T::test_only_dirty_pages_are_rebuilt" $W/pages.py \
  replace $W/pages.py '    return hashlib.sha256(json.dumps(doc' '    return "x" + hashlib.sha256(json.dumps({}'

# (5) gate 2: the fingerprint includes the snapshot id -> a re-mint rebuilds every page
plant "fingerprint includes the snapshot id" $T "$T::test_only_dirty_pages_are_rebuilt" $W/pages.py \
  replace $W/pages.py '[[k.key, k.value, k.phrase] for k in _cells(e)]' '[[k.key, k.value, k.phrase, k.ref] for k in _cells(e)]'

# (6) gate 2: neighbours are not in the fingerprint -> a new edge rebuilds nothing
plant "fingerprint ignores neighbours" $T "$T::test_only_dirty_pages_are_rebuilt" $W/pages.py \
  replace $W/pages.py '"neighbours": [[n.entity_id, n.kind] for n in _neighbours(e)],' '"neighbours": [],'

# (7) the version is not the page's next -> core refuses (real core, embedded Postgres)
plant "version is always 1" $E "$E::test_pages_post_to_real_core" $W/compiler.py \
  replace $W/compiler.py '    version = (prior.version if prior else 0) + 1' '    version = 1'

# (8) the model sees the entity's name -> untrusted text reaches the request (and the trace gate's model request)
plant "prompt carries the entity name" $T "$T::test_recorded_prose_is_cited_and_untrusted_text_reaches_neither_the_model_nor_a_trace" $W/prose.py \
  replace $W/prose.py '    return f"Entity kind: {e.kind}\n' '    return f"Entity kind: {e.kind} named {e.name}\n'

[ "$failures" -eq 0 ] && echo "ALL RED-PROOFS FIRED" || { echo "$failures red-proof(s) failed"; exit 1; }
