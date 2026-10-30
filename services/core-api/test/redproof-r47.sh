#!/usr/bin/env bash
# Red-proof for the R47 D1, D3, D5 and D7 core gates (platform.test.ts, tenancy.test.ts, run-frame.test.ts, threads.test.ts).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27).
#   services/core-api/test/redproof-r47.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-r47-redproof.XXXXXX")
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
run_gate() { (cd "$core" && ./node_modules/.bin/vitest run test/platform.test.ts test/tenancy.test.ts test/run-frame.test.ts test/intel-api.test.ts test/threads.test.ts) > "$copy/.out" 2>&1; }

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

V=services/core-api/src/platform/validate.ts
D=services/core-api/src/platform/drafts.ts
R=services/core-api/src/platform/read.ts
C=services/core-api/src/modules/tenancy/commands.ts
F=services/core-api/src/internal/frame.ts
W=services/core-api/src/internal/writes.ts
T=services/core-api/src/modules/threads/index.ts

echo "baseline:"
if run_gate; then echo "  green: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi

plant "D1: a partial price group is accepted (silently unpriced)" "refusals leave no draft" "$V" \
  replace "$V" "      only(patch, priced.length === 3 ?" "      only(patch, Object.keys(patch)); void (priced.length === 3 ?"
plant "D1: a negative price is accepted" "refusals leave no draft" "$V" \
  replace "$V" 'if (!Number.isSafeInteger(i) || (i as number) < 0 || !Number.isSafeInteger(o) || (o as number) < 0) throw bad();' 'if (!Number.isSafeInteger(i) || !Number.isSafeInteger(o)) throw bad();'
plant "D1: the prices are not applied" "accept: the prices apply on approve" "$D" \
  replace "$D" '[p.role, p.provider, p.model_id, p.prices?.input ?? null, p.prices?.output ?? null, p.prices?.currency ?? null]);' '[p.role, p.provider, p.model_id, null, null, null]);'
plant "D1: a price-only change un-probes the role" "a price-only change keeps the probe" "$D" \
  replace "$D" 'THEN platform.model_role.probed_at ELSE NULL END' 'THEN NULL ELSE NULL END'
plant "D1: the internal/platform read drops the prices" "accept: the prices apply on approve" "$R" \
  replace "$R" 'input_price_per_mtok_minor: num(x.input_price_per_mtok_minor)' 'input_price_per_mtok_minor: null'
plant "D7: target above walk-away is accepted" "target ≤ walk-away on the effective pair" "$C" \
  replace "$C" '> (next.negotiation_walkaway_bp ?? NEGOTIATION_DEFAULTS.walkaway_bp)) throw new ApiError("invalid_payload");' '> 99999) throw new ApiError("invalid_payload");'
plant "D7: a bound set alone drops the other (no carry-over)" "target ≤ walk-away on the effective pair" "$C" \
  replace "$C" 'negotiation_walkaway_bp: p.negotiation_walkaway_bp ?? cur?.negotiation_walkaway_bp ?? null,' 'negotiation_walkaway_bp: p.negotiation_walkaway_bp ?? null,'
plant "D7: the frame ignores the owner's bounds" "R47 D7: negotiation bounds in the frame" "$F" \
  replace "$F" 'target_bp: pol?.t ?? NEGOTIATION_DEFAULTS.target_bp' 'target_bp: NEGOTIATION_DEFAULTS.target_bp'
plant "D7: the frame serves a future-dated version" "R47 D7: negotiation bounds in the frame" "$F" \
  replace "$F" 'valid_from <= $1::date AND (valid_to IS NULL OR valid_to > $1::date)' 'true'
plant "D3: the margin floor is not taken from the command" "floor ≤ target margin" "$C" \
  replace "$C" 'margin_floor_bp: p.margin_floor_bp ?? cur?.margin_floor_bp ?? null,' 'margin_floor_bp: cur?.margin_floor_bp ?? null,'
plant "D3: minimum payment days set alone are not carried over" "floor ≤ target margin" "$C" \
  replace "$C" 'min_payment_days: p.min_payment_days ?? cur?.min_payment_days ?? null,' 'min_payment_days: p.min_payment_days ?? null,'
plant "D3: a floor above the target is accepted" "floor ≤ target margin" "$C" \
  replace "$C" 'next.margin_floor_bp > next.target_margin_bp) throw new ApiError("invalid_payload");' 'false) throw new ApiError("invalid_payload");'
plant "D5: deep is not carried to intel" "flag reaches intel" "$T" \
  replace "$T" 'thread: block, deep }));' 'thread: block, deep: false }));'
plant "D5: core's abstention drops the follow-up" "follow_up is stored and served" "$W" \
  replace "$W" 'reason_code: reason, ...(env.follow_up ? { follow_up: env.follow_up } : {}) } : env;' 'reason_code: reason } : env;'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
