#!/usr/bin/env bash
# Red-proof for the supplier map's gates (tests/supplier-map.test.ts, T-131): plant one defect at a time, run the test file,
# require a NON-ZERO exit that names the expected test, restore. A plant that does not apply, or a run that stays green,
# fails this script. Files are restored on any exit (trap).
#   apps/web/tests/redproof-map.sh
set -uo pipefail
cd "$(dirname "$0")/.."
T=tests/supplier-map.test.ts
saved=$(mktemp -d "${TMPDIR:-/tmp}/munim-map-redproof.XXXXXX")
restore() { for f in "$saved"/*; do [ -e "$f" ] && cp "$f" "$(basename "$f" | tr '%' '/')"; done; rm -rf "$saved"; }
trap restore EXIT
failures=0

# plant <label> <expected test name (substring)> <file> <old> <new>
plant() {
  local label=$1 expect=$2 file=$3 old=$4 new=$5
  echo "plant: $label"
  cp "$file" "$saved/$(echo "$file" | tr '/' '%')"
  if ! python3 - "$file" "$old" "$new" <<'PY'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
PY
  then echo "  FAIL: could not plant"; failures=$((failures + 1)); return; fi
  node_modules/.bin/vitest run "$T" > "$saved/.out" 2>&1
  local rc=$?
  if [ $rc -eq 0 ]; then echo "  FAIL: vitest exit 0 with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "$expect" "$saved/.out"; then echo "  red:   vitest exit $rc and names \"$expect\""
  else echo "  FAIL: vitest exit $rc but does not name \"$expect\""; failures=$((failures + 1)); fi
  cp "$saved/$(echo "$file" | tr '/' '%')" "$file"
}

plant "a quoted-by supplier without its badge" "every supplier name wears its badge" \
  components/staff/pages/supplier-map.tsx '{list.map((s) => <SupplierName key={s.supplier_id} s={s} />)}' '{list.map((s) => <span key={s.supplier_id}>{s.name}</span>)}'
plant "a 503 shown as the generic error" "graph offline (503 graph_unavailable)" \
  components/staff/pages/supplier-map.tsx '{graphDown(data) ? <p className="font-semibold" role="alert">{t("map.down")}</p>' '{false ? <p className="font-semibold" role="alert">{t("map.down")}</p>'
plant "the mock answers /v1/graph/* without a graph backend" "every route is 404, before any sign-in" \
  mock-server/staff.ts 'if (path.startsWith("/v1/graph/") && graphMode() === "off") return notFound();' ''
plant "a margin shown whatever recipe its row costs" "a margin: its row only when it costs the recipe" \
  lib/munim/graph.ts '(r.recipe_version_id ?? null) === recipeId && ' ''
plant "the flag's unset value shows the links" "unset, empty or postgres" \
  lib/server/graph-flag.ts 'if (v === "" || v === "postgres") return false;' 'if (v === "postgres") return false;
  if (v === "") return true;'
plant "a number in a graph answer" "no answer carries a number" \
  mock-server/graph.ts 'quoted_by: names(c,' 'n: 1, quoted_by: names(c,'

# Clean: the same file green, exit 0.
node_modules/.bin/vitest run "$T" > "$saved/.out" 2>&1
rc=$?
if [ $rc -eq 0 ] && grep -qE "Tests +[1-9][0-9]* passed" "$saved/.out"; then echo "clean: vitest exit 0, $(grep -oE 'Tests +[0-9]+ passed' "$saved/.out")"
else echo "clean: FAIL (exit $rc)"; failures=$((failures + 1)); fi

[ $failures -eq 0 ] && echo "redproof-map: ok" || echo "redproof-map: FAIL ($failures)"
exit $((failures > 0))
