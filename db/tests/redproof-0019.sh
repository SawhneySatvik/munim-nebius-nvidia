#!/usr/bin/env bash
# Red-proof of the M-C1a (0019) gates. No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0019.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure:
# A. Database gates (tests/templates.test.ts, books.test.ts, isolation.test.ts). The clean files must exit 0. Per gate, a
#    planted db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must then exit non-zero AND list
#    a FAIL line naming the gate. The plant is removed after every run (and on exit). Do not run another suite while
#    this runs: every global setup applies db/migrations, the plant included.
# B. World gates (tests/templates-worlds.ts on restaurant_group + store). The clean run must exit 0; with --plant=mis-sum
#    (gate 5) and --plant=column (gate 2) it must exit non-zero with that gate's FAIL line. These plants touch only the
#    run's own database. Each world run seeds two worlds through core-api (about 1 min).
# Logs: scratchpad/redproof-0019/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0019"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-12s %s\n' "$1" "$2" "$3"; }

# --- A. database gates -------------------------------------------------------------------------------------------
FILES="tests/templates.test.ts tests/books.test.ts tests/isolation.test.ts"
rm -f "$PLANT"
row RESULT PLANT EXPECT
# shellcheck disable=SC2086
if "$VITEST" run --reporter=verbose $FILES >"$OUT/db-clean.log" 2>&1; then row ok db-clean "exit 0"; else row FAIL db-clean "exit 0 (see $OUT/db-clean.log)"; fail=1; fi

# name | test file | the FAIL line (extended regex, after "> ") that must appear
db_check() {
  local name="$1" file="$2" want="$3"
  if "$VITEST" run --reporter=verbose "$file" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "FAIL .*> $want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; FAIL: $(grep -m1 -oE "FAIL .*> $want[^>]*" "$OUT/$name.log" | sed -E 's/.*> //')"
  else row FAIL "$name" "red, but no FAIL line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
echo "DELETE FROM evidence.snapshot_template WHERE id = 'finance.close_status';" >"$PLANT"
db_check g1-ids tests/templates.test.ts "gate 1 — template ids > 14 ids parsed"
echo "UPDATE evidence.snapshot_template SET columns = jsonb_set(columns, '{2,numeric_source}', '[\"core.order_line.qty_milli\", \"intel.finding.confidence_bp\"]') WHERE id = 'catalogue.dish_margin';" >"$PLANT"
db_check g3-source tests/books.test.ts "template numeric sources: every numeric column"
echo "CREATE POLICY wide ON core.journal_entry USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid));" >"$PLANT"
db_check g4-scope tests/templates.test.ts "gate 4 — manager scope > an outlet-A manager minting"
cat >"$PLANT" <<'SQL'
UPDATE evidence.snapshot_template SET sql = replace(sql, 'SELECT 10, ''unexplained'', v.mp', 'SELECT 10, ''unexplained'', 1 + v.mp')
 WHERE id = 'finance.margin_bridge';
SQL
db_check g5-bridge tests/templates.test.ts "gate 5 — margin_bridge balances exactly > owner and outlet-A manager"
echo "UPDATE evidence.snapshot_template SET min_role = 'owner' WHERE id = 'finance.pnl';" >"$PLANT"
db_check g6-advisor tests/templates.test.ts "gate 6 — the advisor rung"
echo "CREATE POLICY wide ON core.staff USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid));" >"$PLANT"
db_check rls-outlet tests/isolation.test.ts "outlet scope > scoped to outlet 1: outlet 2's rows invisible"

# --- B. world gates ----------------------------------------------------------------------------------------------
if node tests/templates-worlds.ts >"$OUT/worlds-clean.log" 2>&1; then row ok worlds-clean "exit 0"; else row FAIL worlds-clean "exit 0 (see $OUT/worlds-clean.log)"; fail=1; fi
# name | the FAIL line (extended regex) the plant must produce
world_check() {
  local name="$1" want="$2"
  if node tests/templates-worlds.ts --plant="$name" >"$OUT/worlds-$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/worlds-$name.log)"; fail=1; return; fi
  if grep -E "^FAIL .*$want" "$OUT/worlds-$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -cE '^FAIL ' "$OUT/worlds-$name.log") FAIL lines, e.g. $(grep -m1 -E "^FAIL .*$want" "$OUT/worlds-$name.log")"
  else row FAIL "$name" "red, but no FAIL line matching '$want' ($OUT/worlds-$name.log)"; fail=1; fi
}
world_check mis-sum "\(5\) owner: bridge does not balance"
world_check column "\(2\) catalogue\.dish_margin: columns"
echo "redproof-0019: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
