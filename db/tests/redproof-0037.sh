#!/usr/bin/env bash
# Red-proof of the 0037 gates (NB-4: the cited saving and the ingredient-price signal). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0037.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/saving-signal-0037.test.ts must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the
# gate checks; the file must then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the
# migration's own refusal). The plant is removed after every run (and on exit). It writes into db/migrations of the tree it
# runs in: run it in a scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the
# plant included). Logs: scratchpad/redproof-0037/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0037_nb4_quote_saving_ingredient_price.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0037"
TEST=tests/saving-signal-0037.test.ts
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-20s %s\n' "$1" "$2" "$3"; }

rm -f "$PLANT"
row RESULT PLANT EXPECT
if NO_COLOR=1 "$VITEST" run --reporter=verbose "$TEST" >"$OUT/clean.log" 2>&1; then row ok clean "$TEST exit 0"; else row FAIL clean "$TEST exit 0 (see $OUT)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log
check() {
  local name="$1" want="$2"
  if NO_COLOR=1 "$VITEST" run --reporter=verbose "$TEST" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
postconditions() { sed -n '/^-- 5. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0037')/assert_catalog('0038')/"; }
# sql <id> <version> <old> <new>: replace a fragment of that version's SQL, only when present (a stale fragment leaves it green →
# the check fails loudly).
sql() { echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$p\$$3\$p\$, \$p\$$4\$p\$) WHERE id = '$1' AND version = $2 AND strpos(sql, \$p\$$3\$p\$) > 0;"; }
qc() { sql purchasing.quote_compare 2 "$1" "$2"; }
ip() { sql market.ingredient_price 1 "$1" "$2"; }
# The value CHECK re-added with one clause missing (the 0037 text otherwise).
value_check() { echo "ALTER TABLE core.market_signal DROP CONSTRAINT market_signal_ingredient_price_value_check, ADD CONSTRAINT market_signal_ingredient_price_value_check CHECK (kind <> 'ingredient_price' OR ($1));"; }
S1="FAIL .*> S1 purchasing.quote_compare v2"

# (S1) the run anchor dropped: the receipt after the run (the PO's own price) becomes the reference.
qc " AND m.at <= r.issued_at" "" >"$PLANT"
check s1-no-anchor "$S1"
# (S1) a cost-less receipt taken as a price paid (its currency is NULL too — 0016's fill trigger and the 0005 pairing CHECK —
# so the currency filter alone also keeps it out: both are dropped).
qc "m.unit_cost_per_1000_minor IS NOT NULL AND m.currency = q.currency AND " "" >"$PLANT"
check s1-costless "$S1"
# (S1) the run's outlets not narrowed: another outlet's receipt becomes the reference (and the owner and manager disagree).
qc "('*' = ANY (r.outlet_scope) OR m.outlet_id::text = ANY (r.outlet_scope))" "true" >"$PLANT"
check s1-no-scope "$S1"
# (S1) truncation instead of rounding.
qc "round((rf.ref - q.unit_price_minor) * q.qty_milli / 1000.0)" "trunc((rf.ref - q.unit_price_minor) * q.qty_milli / 1000.0)" >"$PLANT"
check s1-trunc "$S1"
# (S1) floating point: round() on a double rounds half to even (2.5 → 2, −2.5 → −2).
qc "q.qty_milli / 1000.0)::bigint AS saving_minor" "q.qty_milli / 1000.0::float8)::bigint AS saving_minor" >"$PLANT"
check s1-float "$S1"
# (S1) the reference converted the wrong way (÷ f instead of × f).
qc "CASE WHEN m.unit = q.unit THEN 1 ELSE cv.f END / 1000.0" "CASE WHEN m.unit = q.unit THEN 1 ELSE 1 / cv.f END / 1000.0" >"$PLANT"
check s1-conversion "$S1"
# (S1) v1's row order changed in v2 (draft refs would point at other quotes).
qc " ORDER BY q.round, q.supplier_id, q.created_at, q.id" " ORDER BY q.unit_price_minor, q.id" >"$PLANT"
check s1-row-order "FAIL .*> S1 .*v2 = v1's columns"
# (M1) the NULL hole: a quantity-less price passes when the CHECK omits IS NOT NULL.
value_check "value_minor IS NOT NULL AND value_milli > 0 AND source ~ '^[a-z0-9][a-z0-9._:-]{0,79}\$'" >"$PLANT"
check m1-null-quantity "FAIL .*> M1 .*accepted inside an approved import"
# (M1) prose accepted as a source.
value_check "value_minor IS NOT NULL AND value_milli IS NOT NULL AND value_milli > 0" >"$PLANT"
check m1-prose-source "FAIL .*> M1 .*accepted inside an approved import"
# (M1) the ingredient allowed on any kind.
echo "ALTER TABLE core.market_signal DROP CONSTRAINT market_signal_ingredient_price_check, ADD CONSTRAINT market_signal_ingredient_price_check CHECK (kind <> 'ingredient_price' OR ingredient_id IS NOT NULL);" >"$PLANT"
check m1-any-kind "FAIL .*> M1 .*accepted inside an approved import"
# (M2) upcoming v4 back to v3's SQL: the price shows as an upcoming event.
echo "UPDATE evidence.snapshot_template n SET sql = o.sql FROM evidence.snapshot_template o WHERE n.id = 'market.upcoming' AND n.version = 4 AND o.id = n.id AND o.version = 3;" >"$PLANT"
check m2-upcoming "FAIL .*> M2 a price observation"
# (M2) signal_uplift v3 back to v2's SQL: price days drop out of the normal-day baseline.
echo "UPDATE evidence.snapshot_template n SET sql = o.sql FROM evidence.snapshot_template o WHERE n.id = 'market.signal_uplift' AND n.version = 3 AND o.id = n.id AND o.version = 2;" >"$PLANT"
check m2-uplift "FAIL .*> M2 a price observation"
# (M3) the outlet narrowing dropped: outlet B's signal shows at outlet A and to A's manager.
ip "(s.outlet_id IS NULL OR s.outlet_id IN (SELECT id FROM ou))" "true" >"$PLANT"
check m3-outlet "FAIL .*> M3 market.ingredient_price"
# (M3) the window dropped: a 45-day-old signal shows.
ip "s.on_date > td.today - :days::int AND " "" >"$PLANT"
check m3-window "FAIL .*> M3 market.ingredient_price"
# (M3) the per-unit price from the wrong side (value_milli ÷ value_minor).
ip "round(s.value_minor * 1000.0 / s.value_milli)" "round(s.value_milli * 1000.0 / s.value_minor)" >"$PLANT"
check m3-unit-price "FAIL .*> M3 market.ingredient_price"
# (READ) a later upcoming version that reads every kind again.
echo "INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) SELECT id, 5, replace(sql, \$p\$ NOT IN ('competitor_price', 'ingredient_price')\$p\$, \$p\$ <> 'competitor_price'\$p\$), params_schema, columns, min_role FROM evidence.snapshot_template WHERE id = 'market.upcoming' AND version = 4;" >"$PLANT"
check read-blind "FAIL .*> READ every reader"
# (post-conditions) 0037's own check, re-run after each perturbation.
{ echo "ALTER TABLE core.market_signal DROP CONSTRAINT market_signal_kind_check, ADD CONSTRAINT market_signal_kind_check CHECK (kind IN ('weather', 'festival', 'holiday', 'local_event', 'competitor_price', 'other'));"; postconditions; } >"$PLANT"
check pc-kind "0037: not as written: kind check"
# Gotcha 1: an index of the same name on other columns.
{ echo "DROP INDEX core.market_signal_ingredient_id_fk_idx; CREATE INDEX market_signal_ingredient_id_fk_idx ON core.market_signal (tenant_id, ingredient_id);"; postconditions; } >"$PLANT"
check pc-index "0037: not as written: index"
{ echo "GRANT UPDATE (ingredient_id) ON core.market_signal TO munim_core;"; postconditions; } >"$PLANT"
check pc-core-update "0037: not as written: grants:munim_core"
{ echo "GRANT INSERT (ingredient_id) ON core.market_signal TO munim_svc;"; postconditions; } >"$PLANT"
check pc-svc-insert "0037: not as written: grants:munim_svc"
{ echo "GRANT SELECT (ingredient_id) ON core.market_signal TO munim_intel_ro;"; postconditions; } >"$PLANT"
check pc-intel-read "0037: not as written: grants:munim_intel_ro"
{ qc " AND m.at <= r.issued_at" ""; postconditions; } >"$PLANT"
check pc-anchor "0037: not as written: quote_compare:purchasing.quote_compare"
{ echo "UPDATE evidence.snapshot_template SET columns = columns - 8 WHERE id = 'purchasing.quote_compare' AND version = 2;"; postconditions; } >"$PLANT"
check pc-columns "0037: not as written: quote_compare:purchasing.quote_compare"
{ echo "UPDATE evidence.snapshot_template n SET sql = o.sql FROM evidence.snapshot_template o WHERE n.id = 'market.upcoming' AND n.version = 4 AND o.id = n.id AND o.version = 3;"; postconditions; } >"$PLANT"
check pc-sig "0037: not as written: sig:market.upcoming"
{ ip "coalesce(:as_of::date, " "coalesce(NULL::date, "; postconditions; } >"$PLANT"
check pc-clock "0037: not as written: clock:market.ingredient_price"
{ echo "INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) VALUES ('market.planted', 1, 'SELECT s.kind FROM core.market_signal s', '{}', '[{\"name\": \"kind\", \"type\": \"text\"}]', 'manager');"; postconditions; } >"$PLANT"
check pc-reader "0037: not as written: reader:market.planted"

echo "redproof-0037: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
