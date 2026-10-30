#!/usr/bin/env bash
# Red-proof for the W3.3 wiring gates (brief-items, /brief, /ingest, the ingest TTL, trace labels). In a throwaway copy of
# the tree: copy green -> plant ONE defect -> the named test runner exits NON-ZERO and names the expected test -> restore.
# Judged by exit code (gotcha 33); a red that does not name the expected test fails this script. No flags (gotcha 17).
#   services/intel/tests/brief/redproof_wiring.sh
set -uo pipefail
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-w33-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache --exclude .claude "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")
ln -s "$src/.venv" "$copy/.venv" 2>/dev/null || true

API="$copy/services/core-api"
INTEL="$copy/services/intel"
failures=0

# run <log> <kind> <target>: kind core = a core-api vitest file; intel = a pytest path; contracts = a contracts vitest file.
run() {
  case "$2" in
    core) (cd "$API" && node_modules/.bin/vitest run "$3") ;;
    contracts) (cd "$copy/packages/contracts" && node_modules/.bin/vitest run "$3") ;;
    intel) (cd "$INTEL" && MUNIM_MODEL_MODE=recorded uv run --quiet --locked pytest -q -p no:warnings "$3") ;;
  esac > "$copy/$1.out" 2>&1
}

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

# plant <label> <kind> <target> <expected test name fragment> <file> <old> <new>
plant() {
  local label=$1 kind=$2 target=$3 expect=$4 file=$5 old=$6 new=$7
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! replace "$file" "$old" "$new"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run plant "$kind" "$target"; then
    echo "  FAIL: exit 0 with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "$expect" "$copy/plant.out"; then
    echo "  red:   exit non-zero and names '$expect'"
  else
    echo "  FAIL: red but does not name '$expect':"; tail -25 "$copy/plant.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

echo "baseline:"
for t in "core test/intel-brief.test.ts" "core src/runtoken" "intel tests/test_app.py"; do
  set -- $t
  if run base "$1" "$2"; then echo "  green: $2"; else echo "  FAIL: the clean copy is red ($2):"; tail -25 "$copy/base.out"; exit 1; fi
done

B=services/core-api/src/internal/brief.ts
CI=services/core-api/src/internal/index.ts
T=test/intel-brief.test.ts
plant "brief-items served to any trigger" core $T "(2) paired" $CI '    if (run.trigger !== "brief") throw new ApiError("not_found");' ''
plant "abstained findings are items" core $T "(1) a brief run" $B "AND COALESCE(envelope ->> 'abstained', 'false') = 'false'" ''
plant "the dedupe key rides in the texts" core $T "(1) a brief run" $B 'texts: (f.envelope.segments ?? []).map((s) => s.text),' 'texts: [f.dedupe_key],'
plant "a stored-order list instead of rank order" core $T "(1) a brief run" $B 'return BriefItemsResponse.parse({
    items: items.map(' 'return BriefItemsResponse.parse({
    items: items.reverse().map('
plant "the run scope is ignored (tenant-wide viewer)" core $T "(3) outlet scope" $CI 'return c.json(await runTx(c.var.deps, run, (q) => briefItems(q, run, at)), 200);' 'return c.json(await runTx(c.var.deps, { ...run, scope: ["*"] }, (q) => briefItems(q, { ...run, scope: ["*"] }, at)), 200);'
plant "Label back to any string up to 200" contracts test/trace-label.test.ts "trace payload labels" packages/contracts/src/shared/trace.ts 'const Label = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/);' 'const Label = z.string().max(200);'
plant "ingest falls through to 2 h" core src/runtoken "ingest: an ingest run" services/core-api/src/runtoken/index.ts '    case "ingest": return 30 * 60;
    case "event": case' '    case "event": case "ingest": case'
plant "/brief takes any token" intel tests/test_app.py "test_brief_takes_only_a_brief_token" services/intel/munim_intel/app.py '        if ctx.trigger != "brief":
            return _error(401, "unauthenticated")' ''
plant "/ingest takes any token" intel tests/test_app.py "test_ingest_takes_only_an_ingest_token" services/intel/munim_intel/app.py '        if ctx.trigger != "ingest":
            return _error(401, "unauthenticated")' ''
plant "the brief item keeps a dedupe key field" intel tests/brief/test_brief.py "test_untrusted_text_never_reaches_the_model_or_a_trace_and_no_dedupe_key_exists" services/intel/munim_intel/brief/__init__.py '    draft_ids: tuple[str, ...] = ()' '    draft_ids: tuple[str, ...] = ()
    dedupe_key: str = ""'

# The real-core e2e (about a minute each): the ranking order and the no-dedupe-key scan must be able to fail.
E=tests/brief/test_brief_wiring_e2e.py
plant "e2e: core's ranking reversed" intel $E "test_the_brief_is_the_top_five_by_impact_x_confidence_x_urgency" $B 'return BriefItemsResponse.parse({
    items: items.map(' 'return BriefItemsResponse.parse({
    items: items.reverse().map('
plant "e2e: a dedupe key in the stored brief" intel $E "test_sweep_then_brief_stores_one_answer_with_resolving_refs_and_no_dedupe_key" $B 'texts: (f.envelope.segments ?? []).map((s) => s.text),' 'texts: [f.dedupe_key],'

[ "$failures" -eq 0 ] && echo "ALL RED-PROOFS FIRED" || { echo "$failures red-proof(s) failed"; exit 1; }
