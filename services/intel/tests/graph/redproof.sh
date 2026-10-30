#!/usr/bin/env bash
# Red-proof for the T-058 gates (as tests/watch/redproof.sh): in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test fails this script. Plant 1 also asserts the paired RLS test stays GREEN
# (RLS masks a missing predicate, which is why the admin-role test is the gate).
#   services/intel/tests/graph/redproof.sh
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t058-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")
# The butter question's stack starts the FalkorDB test server that `make falkordb-fetch` put under .run/ (left out above).
if [ -d "$src/.run/falkordb" ]; then mkdir -p "$copy/.run" && ln -s "$src/.run/falkordb" "$copy/.run/falkordb"; fi

intel="$copy/services/intel"
T=tests/graph/test_graph.py
G=services/intel/munim_intel/graph
# The five templates are core-owned SQL (T-058 wiring); intel keeps names and arguments only.
GS=services/core-api/src/internal/graph/postgres
failures=0
run_pytest() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings "$@") > "$copy/.out" 2>&1; }
# The butter question's end-to-end gate seeds a world (minutes): plants (1)-(10) run without it, (11)-(12) run only it.
E2E=tests/graph/test_butter_question_e2e.py
TARGET=(tests/graph "--ignore=$E2E")

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
strip_tenant_predicates() {
  local n=0
  for f in "$copy/$GS"/*.sql; do
    n=$((n + $(grep -cE '[a-z]+\.tenant_id = :tenant_id' "$f")))
    sed -E -i.bak 's/[a-z]+\.tenant_id = :tenant_id/true/g' "$f" && rm "$f.bak"
  done
  # Every template reads the graph only through visible.sql's vnode / vedge (R-A 1), which carries the 7 predicates (by
  # hand: entity, staff, order, finding, claim, message, edge); fewer, or one left, means the plant missed.
  [ "$n" -ge 7 ] && ! grep -q ':tenant_id' "$copy/$GS"/*.sql
}

# plant <label> <expected failing test id> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 file=$3
  shift 3
  echo "plant: $label"
  mkdir -p "$copy/.saved" && cp -R "$copy/$file" "$copy/.saved/"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "${TARGET[@]}"; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "FAILED $expect" "$copy/.out"; then
    echo "  red:   pytest exit non-zero and names $expect"
    grep -F -- "FAILED" "$copy/.out" | sed 's/^/    /' | sed -n '1,12p'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  rm -rf "$copy/$file"; cp -R "$copy/.saved/$(basename "$file")" "$copy/$file"; rm -rf "$copy/.saved"
}

echo "baseline:"
if run_pytest "${TARGET[@]}" -rs; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# (1) gate 2: no tenant predicate -> the admin-role (predicate-only) isolation test is red; the RLS-layer test stays green
plant "tenant predicates stripped from every template" "$T::test_the_sql_predicate_alone_isolates_tenants" $GS strip_tenant_predicates
if grep -qF "FAILED $T::test_rls_isolates_tenants_under_the_service_role" "$copy/.out"; then
  echo "  FAIL: the RLS-layer test went red too; the two layers are not independent"; failures=$((failures + 1))
else echo "  paired: the RLS-layer test stayed green with the predicate stripped (RLS alone isolates under munim_svc)"; fi

# (2) gate 3: an edge id that depends on the run -> a re-run adds edges
plant "edge id keyed on the clock" "$T::test_projector_rerun_adds_zero_edges" $G/project.py \
  replace $G/project.py '    seed = f"edge:{kind}:{src}:{dst}:{claim_id or '"''"'}:{source_ref or '"''"'}"' \
  '    import time; seed = f"edge:{kind}:{src}:{dst}:{claim_id or '"''"'}:{source_ref or '"''"'}:{time.monotonic_ns()}"'

# (3) gate 1: a wrong template result
plant "price_shock_path ignores sold edges" "$T::test_template_equals_the_hand_computed_rows[postgres-price_shock_path]" $GS \
  replace $GS/price_shock_path.sql "g.kind IN ('uses', 'sold')" "g.kind IN ('uses')"

# (4) the tenant can never be an argument
plant "tenant_id accepted as an argument" "$T::test_a_tenant_id_or_any_other_argument_is_refused" $G/port.py \
  replace $G/port.py '    if set(args) - allowed:' '    if False:'

# (5) core's route lets a tenant_id through when intel's own check is bypassed (the route must refuse on its own)
# checkArgs is the backend-neutral graph:query check, one directory up from the Postgres templates.
plant "core's graph check_args admits any key" "$T::test_core_refuses_what_check_args_refuses_and_another_tenant_gets_no_rows" services/core-api/src/internal/graph/index.ts \
  replace services/core-api/src/internal/graph/index.ts '  if (Object.keys(args).some((k) => !allowed.has(k))) throw new ApiError("invalid_payload");' ''

# (6) a graph tool result never taints the run (an entity name may be document text)
plant "graph tool results never taint" "tests/graph/test_graph_tools.py::test_a_finding_handle_goes_to_core_as_its_id_and_ids_come_back_as_g_handles_with_taint" \
  $G/tools.py replace $G/tools.py '"tainted": bool(shown)' '"tainted": False'

# (7) a claim node's name shows the model its uuid
plant "graph tool shows a claim node's uuid in its name" "tests/graph/test_graph_tools.py::test_a_claim_or_finding_nodes_name_carries_a_handle_never_its_uuid" \
  $G/tools.py replace $G/tools.py '        m = NODE_NAME.match(value)' '        m = None'

# (8) handle reuse off: every id is a new G handle, so a dish the graph reached never meets its margin row (R68)
plant "graph ids never reuse a snapshot cell" "tests/graph/test_graph_tools.py::test_an_id_a_snapshot_of_this_run_holds_comes_back_as_that_cells_path_any_other_as_g" \
  $G/tools.py replace $G/tools.py 'return self._handles.cell_holding(value) or self._handles.add_node(value)' 'return self._handles.add_node(value)'

# (9) the graph database not answering reads as an ordinary refusal (R68: it must say offline)
plant "graph_unavailable treated as a refusal" "tests/graph/test_graph_tools.py::test_the_graph_database_not_answering_is_offline_never_a_refusal_or_an_answer" \
  $G/tools.py replace $G/tools.py '            if e.code == "graph_unavailable":' '            if False:'

# (10) a graph tool's declaration drifts from the one the committed fixtures were recorded with (D7)
plant "graph tool description changed" "tests/graph/test_graph_tools.py::test_the_graph_tool_declarations_are_the_ones_the_committed_fixtures_were_recorded_with" \
  $G/tools.py replace $G/tools.py '"price_shock_path": "Which dishes' '"price_shock_path": "Which menu dishes'

# (11)-(12): the recorded answer to the butter question, edited (the one reason fixture whose response is submit_answer)
BUTTER=services/intel/tests/graph/fixtures/butter/reason
edit_answer() { # edit_answer <old> <new>: in the one recorded submit_answer response, exactly once
  python3 - "$copy/$BUTTER" "$1" "$2" <<'EOF'
import json, pathlib, sys
d, old, new = sys.argv[1:]
hits = [p for p in sorted(pathlib.Path(d).glob("*.json")) if "submit_answer" in json.dumps(json.loads(p.read_text("utf8"))["responses"])]
if len(hits) != 1:
    sys.exit(f"plant does not apply: {len(hits)} recorded submit_answer responses")
text = hits[0].read_text("utf8")
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times")
hits[0].write_text(text.replace(old, new), "utf8")
EOF
}
TARGET=("$E2E")
echo "baseline (the butter question):"
if run_pytest "${TARGET[@]}"; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi
# (11) a number the model typed: intel's grammar refuses it, the retry has no fixture, and the answer is not a clean one
plant "a typed digit in the butter answer" "$E2E::test_the_butter_question_names_the_graphs_dishes_and_every_number_is_a_price_cell" \
  $BUTTER edit_answer 'at its latest price.' 'at its latest price of 5 per kilo.'
# (12) a dish the graph reached, left out of the answer
plant "a butter dish left out of the answer" "$E2E::test_the_butter_question_names_the_graphs_dishes_and_every_number_is_a_price_cell" \
  $BUTTER edit_answer 'Cardamom Knot, ' ''

[ "$failures" -eq 0 ] && echo "ALL RED-PROOFS FIRED" || { echo "$failures red-proof(s) failed"; exit 1; }
