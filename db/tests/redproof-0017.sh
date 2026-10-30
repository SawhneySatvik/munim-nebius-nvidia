#!/usr/bin/env bash
# Red-proof of the 0017 gates (db/tests/w2fixcycle2.test.ts). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0017.sh
# 1. The clean file must exit 0.
# 2. Per item, a planted db/migrations/0038_redproof_plant.sql undoes that item; the file must then exit non-zero
#    (gotcha 33: judged by the process exit code) AND its FAIL lines must name the item's tests.
# The plant is removed after every run (and on exit). Only w2fixcycle2.test.ts runs: an extra migration also turns the
# manifest gates red, which would prove nothing about these items. Logs: scratchpad/redproof-0017/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0017"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }
run() { "$VITEST" run tests/w2fixcycle2.test.ts >"$OUT/$1.log" 2>&1; }

row RESULT PLANT EXPECT
rm -f "$PLANT"
if run clean; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# The guard exactly as 0015 issued it (re-stamps origin on a derivation UPDATE).
plant_restamp() { sed -n '/^CREATE OR REPLACE FUNCTION core.guard_book_write()/,/^REVOKE ALL ON FUNCTION core.guard_book_write()/p' "$ROOT/db/migrations/0015_w2_fix.sql"; }
# The 0017 claim function without its merge step.
plant_nomerge() {
  sed -n '/^CREATE FUNCTION core.customer_claim_guest_token()/,/^END \$\$;/p' "$ROOT/db/migrations/0017_w2_fix_cycle_2.sql" \
    | sed -e 's/^CREATE FUNCTION/CREATE OR REPLACE FUNCTION/' \
          -e 's/UPDATE core.customer x SET merged_into = me WHERE x.tenant_id = t AND x.id = guest;/NULL;/' \
          -e 's/merged := true;/NULL;/'
}

# name | ';'-separated test-name prefixes that must each be listed as FAIL (extended regex)
check() {
  local name="$1" want="$2" missing="" w
  if run "$name"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  IFS=';' read -ra wants <<<"$want"
  for w in "${wants[@]}"; do grep -E "FAIL .*> ($w)" "$OUT/$name.log" >/dev/null || missing="$missing $w"; done
  if [ -n "$missing" ]; then row FAIL "$name" "red, but no FAIL naming:$missing ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0; FAIL: $(grep -oE "FAIL .*> [A-Z0-9-]+ [a-z+]*" "$OUT/$name.log" | sed -E 's/.*> //' | sort -u | tr '\n' ',')"
  fi
  rm -f "$PLANT"
}

plant_restamp >"$PLANT"; check restamp "O1 reprice;O1 merge\+erase;C1 claim\+erase;R2-S3-7"
echo "DROP TRIGGER under_invoice_approve ON core.payable;" >"$PLANT"; check p1-narrowing "P1 refusals"
echo "UPDATE core.command_authority SET target_tables = array_remove(target_tables, 'core.payable') WHERE command_type = 'purchasing.invoice.approve.v1';" >"$PLANT"
check p1-binding "P1 accepted"
plant_nomerge >"$PLANT"; check c1-merge "C1 claim\+erase"
echo "DROP TRIGGER pricing_frozen ON core.coupon_use;" >"$PLANT"; check coupon-freeze "R2-S3-7:"
echo "DELETE FROM core.derivation_rule WHERE rule_id = 'orders.reprice' AND target_table = 'core.coupon_use';" >"$PLANT"
check coupon-rule "R2-S3-7:;R2-S3-7 storefront"
echo "redproof-0017: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
