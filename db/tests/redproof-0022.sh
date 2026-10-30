#!/usr/bin/env bash
# Red-proof of the M-C1d (0022) gates. No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0022.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure:
# A. Database gates (tests/mc1d.test.ts). The clean file must exit 0. Per gate, a planted
#    db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must then exit non-zero AND print a FAIL
#    line naming the gate (or, for a plant the migration itself refuses, the refusal). The plant is removed after every
#    run (and on exit). Do not run another suite while this runs: every global setup applies db/migrations, the plant
#    included.
# B. World gate (tests/templates-worlds.ts on restaurant_group + store): the clean run must exit 0; with --plant=asof
#    (version 2 ignores as_of) it must exit non-zero with the moved-clock FAIL lines. About 1 min per run.
# Logs: scratchpad/redproof-0022/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0022"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }

# --- A. database gates -------------------------------------------------------------------------------------------
rm -f "$PLANT"
row RESULT PLANT EXPECT
if "$VITEST" run --reporter=verbose tests/mc1d.test.ts >"$OUT/db-clean.log" 2>&1; then row ok db-clean "exit 0"; else row FAIL db-clean "exit 0 (see $OUT/db-clean.log)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log
db_check() {
  local name="$1" want="$2"
  if "$VITEST" run --reporter=verbose tests/mc1d.test.ts >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
# (G1) a rule row with no binding: the database refuses it (the plant migration fails, so does every gate).
echo "INSERT INTO core.derivation_rule (rule_id, source_table, target_table) VALUES ('test.unbound', 'core.order', 'core.payable');" >"$PLANT"
db_check g1-unbound 'null value in column "binding"'
# (G1) the database's binding no longer the file's.
echo "UPDATE core.derivation_rule SET binding = binding || ' AND true' WHERE rule_id = 'purchasing.payable_from_invoice';" >"$PLANT"
db_check g1-parity "FAIL .*> G1 — every derivation rule declares its binding > derivation-rules.json binds every target"
# (G2) one rule's binding weakened to its source alone (the count_adjust gap of 0021).
echo "UPDATE core.derivation_rule SET binding = 'n.ref_id = s.id OR s.id IS NOT NULL' WHERE rule_id = 'inventory.count_adjust';" >"$PLANT"
db_check g2-weak "FAIL .*> G2 — a derived row must belong to its source \(relaxed states\) > per rule row"
# (G2) the 0017 guard back (the derivation branch judges the source row only).
sed -n '/^CREATE OR REPLACE FUNCTION core.guard_book_write() RETURNS trigger/,/^REVOKE ALL ON FUNCTION core.guard_book_write() FROM PUBLIC;/p' \
  "$ROOT/db/migrations/0017_w2_fix_cycle_2.sql" >"$PLANT"
db_check g2-guard "FAIL .*> G2 — the two named gaps with their real source states, and the MB008 path > inventory.count_adjust"
# (S1) the F8 CHECK dropped.
echo "ALTER TABLE core.draft DROP CONSTRAINT draft_source_f8;" >"$PLANT"
db_check s1-f8 "FAIL .*> S1 — a draft's source is one of the eight F8 specialists"
# (A1) one version 2 that no longer equals version 1 at today.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'coalesce(:as_of::date, ', 'coalesce(:as_of::date + 1, ') WHERE id = 'inventory.expiry_risk' AND version = 2;" >"$PLANT"
db_check a1-equal "FAIL .*> A1 / A2 — version 2 of the templates > v2 with as_of NULL, and with as_of = today"
# (A2) a requested column renamed in the SQL only (declared ≠ returned).
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, ') AS supplier_id', ') AS supplier') WHERE id = 'inventory.expiry_risk' AND version = 2;" >"$PLANT"
db_check a2-columns "FAIL .*> A1 / A2 — version 2 of the templates > every version 2 and list template returns exactly its declared columns"
# (A2) cost_drift's price id taken from the wrong row (the item's id).
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'p.id AS price_id', 'p.item_id AS price_id') WHERE id = 'catalogue.cost_drift' AND version = 2;" >"$PLANT"
db_check a2-values "FAIL .*> A1 / A2 — version 2 of the templates > A2 values against independent reads"
# (A2) the count list admits open counts.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'sc.status = ''submitted''', 'sc.status <> ''cancelled''') WHERE id = 'inventory.counts';" >"$PLANT"
db_check a2-lists "FAIL .*> A1 / A2 — version 2 of the templates > the list templates"
# (T1) the count variance valued 1% high.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, '/ 1000000.0) AS value', '/ 990000.0) AS value') WHERE id = 'inventory.count_variance';" >"$PLANT"
db_check t1-variance "FAIL .*> T1 — templates no pack owns > inventory.count_variance"

# --- B. world gate -----------------------------------------------------------------------------------------------
if node tests/templates-worlds.ts >"$OUT/worlds-clean.log" 2>&1; then row ok worlds-clean "exit 0"; else row FAIL worlds-clean "exit 0 (see $OUT/worlds-clean.log)"; fail=1; fi
if node tests/templates-worlds.ts --plant=asof >"$OUT/worlds-asof.log" 2>&1; then row FAIL asof "red, but exited 0 ($OUT/worlds-asof.log)"; fail=1
elif grep -E "^FAIL .*clock\+400d" "$OUT/worlds-asof.log" >/dev/null; then row ok asof "exit≠0; $(grep -cE '^FAIL .*clock\+400d' "$OUT/worlds-asof.log") moved-clock FAIL lines, e.g. $(grep -m1 -E '^FAIL .*clock\+400d' "$OUT/worlds-asof.log")"
else row FAIL asof "red, but no moved-clock FAIL line ($OUT/worlds-asof.log)"; fail=1; fi
echo "redproof-0022: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
