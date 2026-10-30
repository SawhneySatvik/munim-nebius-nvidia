#!/usr/bin/env bash
# Red-proof for the T-115 display-order gates (display-order.test.ts, and catalogue.test.ts's menu read).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27).
#   services/core-api/test/redproof-t115.sh   (TMPDIR picks where the copy goes)
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t115-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
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
run_gate() { (cd "$core" && ./node_modules/.bin/vitest run test/display-order.test.ts test/catalogue.test.ts) > "$copy/.out" 2>&1; }
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

H=services/core-api/src/modules/catalogue/handlers.ts
M=services/core-api/src/modules/catalogue/menu.ts
R=services/core-api/src/modules/storefront/read.ts
T=services/core-api/src/modules/catalogue/routes.ts
MENU="storefront menu: items in the order added"

echo "baseline:"
if run_gate; then echo "  green: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi

plant "read: items within a category by name, not position" "$MENU" "$M" \
  replace "$M" 'ORDER BY s.category, s.item_position, s.name_key,' 'ORDER BY s.category, s.name_key,'
plant "read: variants by name, not position" "$MENU" "$M" \
  replace "$M" 's.variant_position NULLS FIRST, s.variant_name_key' 's.variant_name_key'
plant "read: option groups by name, not position" "$MENU" "$M" \
  replace "$M" 'ORDER BY g.position, g.name_key, g.id,' 'ORDER BY g.name_key, g.id,'
plant "read: options by name, not position (also catalogue.test's spice group)" "menu: one entry per sellable" "$M" \
  replace "$M" 'g.id, o.position, o.name_key, o.id' 'g.id, o.name_key, o.id'
plant "read: storefront outlets by name" "storefront outlets: in the order opened" "$R" \
  replace "$R" 'FROM core.outlet ORDER BY created_at, name, id' 'FROM core.outlet ORDER BY name, id'
plant "read: the member item list's variants by id" "resending the item with its sizes reversed" "$T" \
  replace "$T" 'ORDER BY position, name_key, id`,' 'ORDER BY id`,'
plant "write: a variant's position is not its array index" "$MENU" "$H" \
  replace "$H" 'for (const [vi, v] of variants.entries()) {' 'for (const [_vi, v] of variants.entries()) { const vi = 0;'
plant "write: an option's position is not its array index" "$MENU" "$H" \
  replace "$H" 'for (const [oi, o] of opts.entries()) {' 'for (const [_oi, o] of opts.entries()) { const oi = 0;'
plant "write: a new item takes no position" "$MENU" "$H" \
  replace "$H" '(SELECT coalesce(max(position) + 1, 0) FROM core.item)' '0'
plant "write: an update leaves a variant's position as it was" "resending the item with its sizes reversed" "$H" \
  replace "$H" 'active = $4, position = $5${shown(v, args).set}' 'active = $4${shown(v, args).set}'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
