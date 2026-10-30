#!/usr/bin/env bash
# Red-proof of the M-C1bc + T-093 (0021) gates. No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0021.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure:
# A. Database gates (tests/mc1bc.test.ts, books.test.ts). The clean files must exit 0. Per gate, a planted
#    db/migrations/0038_redproof_plant.sql undoes what the gate checks; the named file must then exit non-zero AND print a
#    FAIL line naming the gate. The plant is removed after every run (and on exit). Do not run another suite while this
#    runs: every global setup applies db/migrations, the plant included.
# B. World gates (tests/templates-worlds.ts on restaurant_group + store). The clean run must exit 0; with
#    --plant=mc1bc-column (gate 2) and --plant=key (the answer-key checks) it must exit non-zero with that gate's FAIL line.
#    These plants touch only the run's own database. Each world run seeds two worlds through core-api (about 1 min).
# Logs: scratchpad/redproof-0021/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0021"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-14s %s\n' "$1" "$2" "$3"; }

# --- A. database gates -------------------------------------------------------------------------------------------
FILES="tests/mc1bc.test.ts tests/books.test.ts"
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
# (1) a pack template missing.
echo "DELETE FROM evidence.snapshot_template WHERE id = 'people.payroll_lines';" >"$PLANT"
db_check g1-ids tests/mc1bc.test.ts "gate 1 — template ids > 48 new ids"
# (2) one output column renamed.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'AS coverage_bp', 'AS coverage') WHERE id = 'kitchen.ticket_coverage';" >"$PLANT"
db_check g2-columns tests/mc1bc.test.ts "gate 2 — spec columns and params \(fixture world\) > every template returns exactly"
# (3) a numeric column sourced from an intel value that is not on the allow-list.
echo "UPDATE evidence.snapshot_template SET columns = jsonb_set(columns, '{2,numeric_source}', '[\"core.coupon_use.discount_minor\", \"intel.finding.confidence_bp\"]') WHERE id = 'customers.coupon_leakage';" >"$PLANT"
db_check g3-source tests/books.test.ts "template numeric sources: every numeric column"
# (4) one outlet policy widened (gotcha 22: widened, not dropped).
echo "CREATE POLICY wide_0022 ON core.stock_movement USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid));" >"$PLANT"
db_check g4-scope tests/mc1bc.test.ts "gate 4 — manager scope > an outlet-A manager sees"
# (4b) a template reading a tenant-visible child without its parent.
echo "INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) VALUES ('test.advances_alone', 1,
  'SELECT sum(a.amount_minor) AS n FROM core.advance a', '{}', '[{\"name\": \"n\", \"type\": \"integer\", \"numeric_source\": \"core.advance.amount_minor\"}]', 'manager');" >"$PLANT"
db_check child-read tests/mc1bc.test.ts "tenant-visible children are read through their parent \(0021\) > every template reading"
# T-093 (kinds): the 0018 CHECK back on core.document.
cat >"$PLANT" <<'SQL'
ALTER TABLE core.document DROP CONSTRAINT document_kind_check;
ALTER TABLE core.document ADD CONSTRAINT document_kind_check
  CHECK (kind IN ('supplier_invoice', 'payout_statement', 'bank_statement', 'pos_export', 'tally_export', 'aggregator_orders',
                  'market_signal', 'menu', 'price_list', 'chat_export', 'agreement', 'licence', 'other', 'pos_bills', 'waste_log'));
SQL
db_check t093-kinds tests/mc1bc.test.ts "T-093 — history kinds shift_log and stock_count > accepted: a shift_log"
# T-093 (binding): the import no longer writes stock counts.
echo "UPDATE core.command_authority SET target_tables = array_remove(target_tables, 'core.stock_count') WHERE command_type = 'imports.run.commit.v1';" >"$PLANT"
db_check t093-binding tests/mc1bc.test.ts "T-093 — history kinds shift_log and stock_count > refused: a stock count under"
# T-093 (draft-only): the import command runnable as an own command.
echo "UPDATE core.command_authority SET draft_only = false WHERE command_type = 'imports.run.commit.v1';" >"$PLANT"
db_check t093-own tests/mc1bc.test.ts "T-093 — history kinds shift_log and stock_count > refused: a shift under the own"
# T-093 (source state): count_adjust from any count.
echo "UPDATE core.derivation_rule SET source_state = 'true' WHERE rule_id = 'inventory.count_adjust';" >"$PLANT"
db_check t093-state tests/mc1bc.test.ts "T-093 — history kinds shift_log and stock_count > count_adjust admits a movement only"

# --- B. world gates ----------------------------------------------------------------------------------------------
if node tests/templates-worlds.ts >"$OUT/worlds-clean.log" 2>&1; then row ok worlds-clean "exit 0"; else row FAIL worlds-clean "exit 0 (see $OUT/worlds-clean.log)"; fail=1; fi
world_check() {
  local name="$1" want="$2"
  if node tests/templates-worlds.ts --plant="$name" >"$OUT/worlds-$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/worlds-$name.log)"; fail=1; return; fi
  if grep -E "^FAIL .*$want" "$OUT/worlds-$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -cE '^FAIL ' "$OUT/worlds-$name.log") FAIL lines, e.g. $(grep -m1 -E "^FAIL .*$want" "$OUT/worlds-$name.log")"
  else row FAIL "$name" "red, but no FAIL line matching '$want' ($OUT/worlds-$name.log)"; fail=1; fi
}
world_check mc1bc-column "\(2\) inventory\.waste_week: columns"
world_check key "key RG-K3 inventory\.waste_week"
echo "redproof-0021: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
