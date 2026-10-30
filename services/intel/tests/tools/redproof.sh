#!/usr/bin/env bash
# Red-proof for the T-080 generated-tool gates. Works only in a throwaway copy of the tree (as tests/trace/redproof.sh):
#   copy green  ->  plant one defect  ->  pytest exits non-zero AND names the expected test  ->  restore.
# A red that names another test (a crash, an unrelated failure) fails this script. The copy gets its own .venv.
#   services/intel/tests/tools/redproof.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t080-tools-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
# grammar_check.mts runs core-domain's grammar under node: link node_modules back to the original.
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

intel="$copy/services/intel"
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

# plant <label> <expected test name> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 file=$3
  shift 3
  echo "plant: $label"
  cp "$intel/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest tests/tools tests/test_tools.py; then
    echo "  FAIL: pytest passed with the plant in place"; failures=$((failures + 1))
  elif grep -E '^FAILED' "$copy/.out" | grep -F -- "$expect" >/dev/null; then
    echo "  red:   pytest exits non-zero and names '$expect':"
    grep -E '^FAILED' "$copy/.out" | sed -n '1,4p' | sed 's/^/    /'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$intel/$file"
}

G=munim_intel/tools/generated.py
H=munim_intel/tools/handles.py

echo "baseline:"
if run_pytest tests/tools tests/test_tools.py; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

plant "a specialist binds every template, not its registry entry" "test_each_specialist_toolset_is_within_its_registry_entry" "$G" \
  replace "$G" 'for t in entry["templates"] if t in fns]' 'for t in fns]'
plant "prose handles are not expanded" "test_handle_round_trip_expands_to_canonical_and_an_unexpanded_handle_fails_the_number_grammar" "$H" \
  replace "$H" 'return PROSE_HANDLE.sub(one, text)' 'return text'
plant "a run_id parameter in every read schema" "test_no_generated_tool_takes_a_tenant_run_or_actor" "$G" \
  replace "$G" '            schema=fn["model_schema"],' '            schema={**fn["model_schema"], "properties": {**fn["model_schema"]["properties"], "run_id": {"type": "string"}}},'
plant "each toolset gets its own handle table (no shared counter)" "test_one_handle_table_per_run_shared_counter_across_toolsets" "$G" \
  replace "$G" 'ReadTemplateTool(fns[t], client, handles) for t in entry' 'ReadTemplateTool(fns[t], client, HandleTable()) for t in entry'
plant "new-entity ids are not minted" "test_propose_expands_handles_mints_ids_and_posts_only_canonical_refs" "$G" \
  replace "$G" 'container[parts[-1]] = uuid7(ts, f"{draft_id}{pointer}")' 'del container, pointer'
plant "tool names taken from the Pydantic class" "test_a_renamed_pydantic_class_leaves_tool_names_unchanged" "$G" \
  replace "$G" '            name=action["tool"],' '            name="propose_" + CONTRACTS[action["contract"]].lower(),'
plant "a core error passed through raw" "test_propose_errors_are_actionable_and_never_raw" "$G" \
  replace "$G" '    if e.reason_code:' '    if e.reason_code:
        return f"{e.code} {e.reason_code} {e}"
    if e.reason_code:'
plant "the digest shows id cells by value" "test_read_digest_is_capped_shows_no_uuid_and_pages_reread_the_stored_snapshot" "$G" \
  replace "$G" '(f"{handle}.r{i}.{c}" if c in ids and r.get(c) is not None else r.get(c))' 'r.get(c)'

# W3 close (R-E 1-A/1-B/2-B): intel's grammar must give core's verdict on every probe (tests/tools/test_grammar_parity.py).
GR=munim_intel/tools/grammar.py
P=test_intel_and_core_give_identical_verdicts_on_every_probe
plant "grammar: no magnitude-suffix rule" "$P" "$GR" replace "$GR" '    suf = _suffix(prose, suffixes)' '    suf = None'
plant "grammar: malformed refs not refused" "$P" "$GR" replace "$GR" '            return Violation("malformed_ref", m.group(0))' '            pass'
plant "grammar: no number words" "$P" "$GR" \
  replace "$GR" '        if lw in words or any(p in words for p in lw.split("-")):' '        if False:'
plant "grammar: single quotes bounded by Python's \\w (underscore counts)" "$P" "$GR" \
  replace "$GR" '        if s[i] in _OPEN_SINGLE and (i == 0 or not _lmn(s[i - 1])):' \
  '        if s[i] in _OPEN_SINGLE and (i == 0 or not (s[i - 1].isalnum() or s[i - 1] == "_")):'

if [ $failures -ne 0 ]; then echo "tools red-proof: FAIL — $failures plant(s) not caught" >&2; exit 1; fi
echo "tools red-proof: ok — every plant turned its gate red with a non-zero exit"
