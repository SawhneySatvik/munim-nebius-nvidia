#!/usr/bin/env bash
# Red-proof of the 0033 gates (T-127: the latest forecast run per outlet). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0033.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/forecast-outlet-0033.test.ts must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the
# gate checks; the file must then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the
# migration's own refusal). The plant is removed after every run (and on exit). It writes into db/migrations of the tree it
# runs in: run it in a scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the
# plant included). Logs: scratchpad/redproof-0033/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0033_forecast_per_outlet.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0033"
TEST=tests/forecast-outlet-0033.test.ts
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }

rm -f "$PLANT"
row RESULT PLANT EXPECT
if "$VITEST" run --reporter=verbose "$TEST" >"$OUT/clean.log" 2>&1; then row ok clean "$TEST exit 0"; else row FAIL clean "$TEST exit 0 (see $OUT)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log
check() {
  local name="$1" want="$2"
  if "$VITEST" run --reporter=verbose "$TEST" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
postconditions() { sed -n '/^-- 2. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0033')/assert_catalog('0038')/"; }
# The new version's SQL put back to the version it extends: the tenant-wide pick again.
previous() { echo "UPDATE evidence.snapshot_template n SET sql = o.sql FROM evidence.snapshot_template o WHERE n.id = '$1' AND n.version = $2 AND o.id = n.id AND o.version = $2 - 1;"; }

# (F1) each new version back to the tenant-wide pick: a one-outlet run resets the other outlet again.
for t in kitchen.prep_need:2 forecast.points:2 inventory.shortfall:3 inventory.expiry_risk:3 purchasing.deal_inputs:4 market.upcoming:3; do
  previous "${t%%:*}" "${t##*:}" >"$PLANT"
  check "f1-${t%%:*}" "FAIL .*> F1 the latest run per outlet > a newer run at outlet A alone"
done
# (F1) the pick per outlet, but every outlet's points joined to every picked run (the outlet join dropped): counted twice.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, ' AND p.outlet_id = fr.outlet_id', '') WHERE id = 'inventory.shortfall' AND version = 3;" >"$PLANT"
check f1-join "FAIL .*> F1 the latest run per outlet"
# (F2) the oldest run per outlet instead of the newest.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'ORDER BY r.created_at DESC, r.id DESC LIMIT 1) lr', 'ORDER BY r.created_at, r.id LIMIT 1) lr') WHERE id = 'forecast.points' AND version = 2;" >"$PLANT"
check f2-oldest "FAIL .*> (F2 a newer run is read for its own outlet|F1 the latest run per outlet)"
# (SCOPE) a policy that opens every forecast point to every reader: the manager's pick reaches outlet B.
echo "CREATE POLICY redproof_open ON intel.forecast_point AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);" >"$PLANT"
check scope-open "FAIL .*> SCOPE a scoped minter"
# (post-conditions) 0033's own check, re-run after each perturbation.
{ echo "UPDATE evidence.snapshot_template SET min_role = 'owner' WHERE id = 'kitchen.prep_need' AND version = 2;"; postconditions; } >"$PLANT"
check pc-role "0033: template versions not as written: .*version:kitchen.prep_need"
{ echo "INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) SELECT id, 5, (SELECT sql FROM evidence.snapshot_template WHERE id = 'purchasing.deal_inputs' AND version = 3), params_schema, columns, min_role FROM evidence.snapshot_template WHERE id = 'purchasing.deal_inputs' AND version = 4;"; postconditions; } >"$PLANT"
check pc-reader "0033: template versions not as written: .*reader:purchasing.deal_inputs"
{ echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'LIMIT 1) lr', 'LIMIT 1) lr WHERE now() IS NOT NULL') WHERE id = 'market.upcoming' AND version = 3;"; postconditions; } >"$PLANT"
check pc-clock "0033: template versions not as written: .*clock:market.upcoming"

echo "redproof-0033: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
