#!/usr/bin/env bash
# Red-proof for the T-128 backend gates (storefront-pages.test.ts, campaign-demo-r67.test.ts, customers.test.ts; R66, R67).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27).
#   services/core-api/test/redproof-t128.sh   (TMPDIR picks where the copy goes)
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t128-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude video "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  if [ "$rel" = node_modules ]; then ln -s "$(cd "$nm" && pwd -P)" "$copy/node_modules"; continue; fi
  mkdir -p "$copy/$rel"
  for e in "$nm"/* "$nm"/.bin; do
    [ -e "$e" ] || continue
    if [ "$(basename "$e")" = "@munim" ]; then
      mkdir -p "$copy/$rel/@munim"
      for w in "$e"/*; do
        target=$(cd "$w" && pwd -P)
        ln -s "$copy/${target#"$(cd "$src" && pwd -P)"/}" "$copy/$rel/@munim/$(basename "$w")"
      done
    else
      ln -s "$e" "$copy/$rel/$(basename "$e")"
    fi
  done
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/.venv/*")

core="$copy/services/core-api"
failures=0
run_gate() { (cd "$core" && ./node_modules/.bin/vitest run test/storefront-pages.test.ts test/campaign-demo-r67.test.ts test/customers.test.ts) > "$copy/.out" 2>&1; }

replace() {
  python3 - "$copy/$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
PY
}

# plant <label> <expected test name> <file under the repo> <command...>
plant() {
  local label=$1 expect=$2 file=$3
  shift 3
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_gate; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAIL ' "$copy/.out" | grep -qF -- "$expect"; then
    echo "  red:   exits non-zero and names '$expect':"
    grep -E 'FAIL ' "$copy/.out" | head -2 | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

G=services/core-api/src/modules/storefront/pages.ts
D=services/core-api/src/lib/demo.ts
S=services/core-api/src/modules/customers/campaign-sent.ts
T=services/core-api/test/customers.nosend.ts

echo "baseline:"
if run_gate; then echo "  green: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi

plant "S1: the theme is not judged" "S1 save" "$G" \
  replace "$G" 'if (!judgeTheme(p.data.doc.theme).ok) throw' 'if (false) throw'
plant "S1: a stale base is accepted" "S1 save" "$G" \
  replace "$G" 'if (newest !== p.data.based_on_version) throw' 'if (false) throw'
plant "S2: the live version may be published again" "S2 publish" "$G" \
  replace "$G" 'if (live?.page_id === p.data.page_id) throw' 'if (false) throw'
plant "S2: the path id is not checked against the payload" "S2 publish" "$G" \
  replace "$G" "if (pathId !== undefined && (env.data.payload as { page_id: string }).page_id !== pathId) throw" "if (false) throw"
plant "S2: the shopper reads the oldest publish, not the newest" "S2 publish" "$G" \
  replace "$G" 'ORDER BY p.published_at DESC, p.id DESC LIMIT 1' 'ORDER BY p.published_at, p.id LIMIT 1'
plant "R67 W-3: publishing is off the demo deny-list" "S4 demo" services/core-api/src/lib/demo-guard.ts \
  replace services/core-api/src/lib/demo-guard.ts '  "storefront.page.publish.v1",' ''
plant "R67: a business that is not a demo passes the campaign check" "the same proposal on a business that is not a demo" "$D" \
  replace "$D" '  if (!(await isDemoTenant(c))) return false;' ''
plant "R67: any column of the segment is an audience" "demo, any other audience" "$D" \
  replace "$D" 'if (at.column !== "at_risk_count" || ' 'if ('
plant "R67: the audience may come from another snapshot than the segment" "demo, any other audience" "$D" \
  replace "$D" ' || at.snapshot_id !== p?.segment_snapshot_id) return false;' ') return false;'
plant "R67: the segment may be another outlet's" "demo, any other audience" "$D" \
  replace "$D" ' && x.outlet === draft.outlet_ids[0]' ''
plant "R67: recording sent off the demo" "R67: recording a queued campaign as sent" "$S" \
  replace "$S" '    if (!(await isDemoTenant(c))) throw new ApiError("forbidden", "demo_only");' ''
plant "R40 C6: the sent exception covers every file" "R67: the sent status is allowed only in campaign-sent.ts" "$T" \
  replace "$T" 'if (name === SENT_PATTERN && basename(file) === SENT_ALLOWED_IN) continue;' 'if (name === SENT_PATTERN) continue;'
plant "R40 C6: the allowed file is not scanned at all" "R67: the sent status is allowed only in campaign-sent.ts" "$T" \
  replace "$T" 'if (name === SENT_PATTERN && basename(file) === SENT_ALLOWED_IN) continue;' 'if (basename(file) === SENT_ALLOWED_IN) continue;'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
