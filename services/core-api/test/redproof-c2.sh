#!/usr/bin/env bash
# Red-proof of the C2 core-api gates (test/security-c2.test.ts: the R64 X-2 demo deny-list, run mints within the member's role,
# body and cart caps, the devices role check, the onboarding cap) and of the seed order the deny-list needs (tools/worldgen
# test/worlds.test.ts). No flags (gotcha 17); run from anywhere:  services/core-api/test/redproof-c2.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); the test file
# must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND a FAIL line must name the gate. The clean copy must
# exit 0 first. Logs: scratchpad/redproof-c2/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-c2"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-c2-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad \
  --exclude apps/site "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")
API="$copy/services/core-api"
WG="$copy/tools/worldgen"
VITEST="$API/node_modules/.bin/vitest"
fail=0
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }
# run <log name> <test file>: vitest for core-api tests, node --test for worldgen's.
run() {
  case "$2" in
    worldgen:*) (cd "$WG" && node --test "${2#worldgen:}" >"$OUT/$1.log" 2>&1) ;;
    *) (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1) ;;
  esac
}

S=test/security-c2.test.ts
W=worldgen:test/worlds.test.ts
row RESULT PLANT EXPECT
for t in "$S" "$W"; do
  if run "clean-$(basename "${t#worldgen:}" .test.ts)" "$t"; then row ok clean "$t exit 0"; else row FAIL clean "$t exit 0 (see $OUT)"; fail=1; fi
done

judge() {
  local name=$1 want=$2
  if [ "$3" = 0 ]; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "(FAIL|not ok).*($want)" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming [$want] ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0, FAIL names [$want]"
  fi
}

# plant <name> <test> <file under the copy's root> <FAIL-line regex> <perl regex> <literal replacement>
# The regex must match EXACTLY once (0 = a stale anchor, >1 = ambiguous): either fails the red-proof, never a no-op.
plant() {
  local name=$1 test=$2 file="$copy/$3" want=$4 n
  cp "$file" "$file.orig"
  n=$(PAT="$5" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$file")
  if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $3"; fail=1; mv "$file.orig" "$file"; return; fi
  PAT="$5" REP="$6" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$file"
  run "$name" "$test"; judge "$name" "$want" $?
  mv "$file.orig" "$file"
}

G=services/core-api/src/lib/demo-guard.ts
E=services/core-api/src/commit/execute.ts
K=services/core-api/src/modules/tenancy/storefront-keys.ts
M=services/core-api/src/modules/evidence/mint.ts
A=services/core-api/src/app.ts
P=services/core-api/src/modules/orders/place.ts
C=services/core-api/src/modules/storefront/checkout.ts
T=services/core-api/src/modules/tenancy/commands.ts
plant guard-never        "$S" $G 'member invite: refused'       'if \(r\.rows\[0\]\?\.locked === true\)' 'if (false)'
plant guard-always       "$S" $G 'admitted on plain'            'is_demo AND onboarded_at IS NOT NULL AS locked' 'true AS locked'
plant guard-no-onboarded "$S" $G 'during setup'                 'is_demo AND onboarded_at IS NOT NULL AS locked' 'is_demo AS locked'
plant guard-no-demo      "$S" $G 'admitted on plain'            'is_demo AND onboarded_at IS NOT NULL AS locked' 'onboarded_at IS NOT NULL AS locked'
plant guard-unhooked     "$S" $E 'member invite: refused'       'await refuseOnDemo\(c, command\.type\);' ''
plant revoke-unhooked    "$S" $K 'storefront key revoke'        'await refuseOnDemo\(db, "tenancy\.storefront_key\.revoke"\);' ''
plant mint-no-run-rank   "$S" $M "staff member's Ask"           'if \(minter\.kind === "run" && UUID\.test\(minter\.actor\)\)' 'if (false)'
plant no-body-limit      "$S" $A 'over 256 KiB'                 'app\.use\(bodyLimits\);' ''
plant internal-limit-cut "$S" $A 'larger caps'                  '\[\/\^\\\/internal\\\/intel\\\/v1\\\/\/, limit\(16 \* 1024 \* KIB\)\],' ''
plant no-cart-bounds     "$S" $P 'storefront preview: 100'      'if \(lines\.length > CART_BOUNDS\.lines \|\|' 'if (false &&'
plant storefront-unbound "$S" $C 'storefront place'             'assertCartBounds\(req\.order\.payload\.lines\);' ''
plant devices-any-role   "$S" $T 'staff on their own outlet'    'if \(!verdict\?\.allow\) throw new ApiError\("forbidden", "authority_denied"\);' ''
plant onboard-no-cap     "$S" $T 'at most 5 businesses'         'if \(Number\(owned\.rows\[0\]!\.n\) >= ONBOARD_TENANT_CAP\)' 'if (false)'
# The seed: completing onboarding before the demo people are invited (as it did before C2) is refused by the deny-list.
plant seed-onboards-early "$W" tools/worldgen/src/kit.ts 'planted == key' \
  '    \/\/ Onboarding is completed by runWorld once' '    await api.cmd("owner", "/v1/tenant:update", "tenancy.tenant.update.v1", "onboarding:complete", { complete_onboarding: true });
    // Onboarding is completed by runWorld once'

[ "$fail" = 0 ] && echo "redproof-c2: all plants red, clean green" || echo "redproof-c2: FAILED"
exit "$fail"
