#!/usr/bin/env bash
# Red-proof for the T-099 storefront completeness gates (storefront-t099.test.ts, cors.test.ts, storefront.test.ts, stream.test.ts).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27).
#   services/core-api/test/redproof-t099.sh   (TMPDIR picks where the copy goes)
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t099-redproof.XXXXXX")
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
run_gate() { (cd "$core" && ./node_modules/.bin/vitest run test/storefront-t099.test.ts test/cors.test.ts test/storefront.test.ts test/stream.test.ts) > "$copy/.out" 2>&1; }

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
P=services/core-api/src/modules/catalogue/pricing.ts
K=services/core-api/src/modules/storefront/checkout.ts
R=services/core-api/src/modules/storefront/read.ts
O=services/core-api/src/modules/storefront/orders.ts
L=services/core-api/src/lib/cors.ts
A=services/core-api/src/app.ts

# Mounts CORS after the routers (a router's limiter then sees the preflight first).
cors_late() {
  replace "$A" '  app.use(cors(opts.corsOrigins ?? []));
' '' && replace "$A" '  app.notFound((c) =>' '  app.use(cors(opts.corsOrigins ?? []));
  app.notFound((c) =>'
}

echo "baseline:"
if run_gate; then echo "  green: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi

plant "G-01: the upsert ignores display text" "an upsert naming display text writes it" "$H" \
  replace "$H" 'const named = (["display_name", "description", "diet"] as const).filter' 'const named = ([] as Array<"display_name" | "description" | "diet">).filter'
plant "G-01: the menu read drops the item's display name" "an upsert naming display text writes it" "$M" \
  replace "$M" '              i.display_name, i.description, i.diet,' '              NULL::text AS display_name, i.description, i.diet,'
plant "G-02: the menu's channel id is not the key's" "IN menu: the key's channel id" "$R" \
  replace "$R" '    channel_id,
    channel_kind: kind,' '    channel_id: outlet.id,
    channel_kind: kind,'
plant "G-02: inactive brands listed" "IN menu: the key's channel id" "$R" \
  replace "$R" 'FROM core.brand WHERE active AND $1::uuid' 'FROM core.brand WHERE $1::uuid'
plant "G-03: preview lines lose their component amounts" "IN preview: rate 500" "$K" \
  replace "$K" 'tax_rate_bp: cls.rate_bp, tax_components: d.components };' 'tax_rate_bp: cls.rate_bp, tax_components: [] };'
plant "G-03: the line rate is not the class rate" "AU preview: rate 1000" "$K" \
  replace "$K" 'tax_rate_bp: cls.rate_bp, tax_components: d.components };' 'tax_rate_bp: 500, tax_components: d.components };'
plant "G-03: the preview's inclusive flag is fixed" "AU preview: rate 1000" "$K" \
  replace "$K" '      prices_include_tax: pack.tax.price_display === "inclusive",
      refusals:' '      prices_include_tax: false,
      refusals:'
plant "G-03: the order view drops component rates" "IN place and order view" "$O" \
  replace "$O" 'tax_component_rates: cls ? cls.components.map((k) => ({ code: k.code, rate_bp: k.rate_bp })) : []' 'tax_component_rates: []'
plant "G-04: tax-id labels are the codes, not the pack's labels" "after the owner's outlet update" "$R" \
  replace "$R" 'label: t.label, value' 'label: t.code, value'
plant "G-11: the shortfall is the whole minimum" "coupon_min_spend: preview and place" "$P" \
  replace "$P" 'shortfall_minor: Number(c.min_spend_minor) - afterDeals' 'shortfall_minor: Number(c.min_spend_minor)'
plant "G-11: placement refuses without parameters (no pre-check)" "coupon_min_spend: preview and place" "$K" \
  replace "$K" 'if (pre.refusals[0]) throw refused(pre.refusals[0].reason_code, pre.refusals[0].params);' 'void pre;'
plant "G-11: deal_rejudged carries no totals" "reschedule re-prices a time-boxed deal" "$O" \
  replace "$O" 'throw refused("deal_rejudged", {' 'throw refused("deal_rejudged"); void ({'
plant "G-12: a promise outside its window is accepted" "a promise before the window" "$R" \
  replace "$R" 'if (p !== null && (p < win.starts_at.getTime() || p >= win.ends_at.getTime()))' 'if (p !== null && p < 0)'
plant "G-12: the window end is inclusive" "a promise before the window" "$R" \
  replace "$R" 'p >= win.ends_at.getTime()' 'p > win.ends_at.getTime()'
plant "G-09: CORS on every /v1 route" "neither does a member route" "$L" \
  replace "$L" '/^\/v1\/(storefront|cares-network)(\/|$)/.test(path)' 'path.startsWith("/v1/")'
plant "G-09: no headers on an error response" "a listed origin's 404" "$L" \
  replace "$L" '    if (ok) {
      c.res.headers.set' '    if (ok && c.res.status < 400) {
      c.res.headers.set'
plant "G-09: the origin list is ignored (any origin echoed)" "a non-listed origin gets no CORS header" "$L" \
  replace "$L" 'const ok = origin !== undefined && allowed.has(origin);' 'const ok = origin !== undefined;'
plant "G-09: preflight not answered" "preflight from an allowed origin" "$L" \
  replace "$L" 'if (c.req.method === "OPTIONS" && ok &&' 'if (false && ok &&'
plant "G-09: the event stream is not a CORS path" "over a real server, the 200 event stream carries" "$L" \
  replace "$L" 'path === "/v1/stream" || /^' '/^'
plant "G-09: CORS mounted after the routers (the limiter counts preflights)" "preflights to /v1/cares-network/listings are not counted" "$A" cors_late
plant "2-A: the replay guard below the storefront's own refusals" "capacity-1 window" "$K" \
  replace "$K" 'const own = placed ? [] : await ownRefusals(' 'const own = await ownRefusals('
plant "2-A: a placed key still runs the guest's own create (re-minted envelope → 500)" "capacity-1 window" "$K" \
  replace "$K" 'if (req.guest && !placed) {' 'if (req.guest) {'
plant "pricedPack: an unreadable pack version falls back to the tenant's pack" "missing pack row and an unparseable one" "$R" \
  replace "$R" '  return p.success ? p.data : null;' '  return p.success ? p.data : tenantPack(c);'
plant "preview: the two readings in separate snapshots" "a price committed between the preview and the detail read" "$K" \
  replace "$K" '  }, { snapshot: true });' '  });'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
