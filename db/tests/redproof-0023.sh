#!/usr/bin/env bash
# Red-proof of the M-C1e (0023) gates. No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0023.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure:
# A. Database gates (tests/mc1e.test.ts; the numeric-source gate is tests/books.test.ts). The clean files must exit 0. Per
#    gate, a planted db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must then exit non-zero
#    AND print a FAIL line naming the gate (or, for a plant the migration refuses, the refusal). The plant is removed after
#    every run (and on exit). Do not run another suite while this runs: every global setup applies db/migrations, the
#    plant included.
# B. World gate (tests/templates-worlds.ts on the four worlds): the clean run must exit 0; with --plant=mc1e (each 0023 Σ
#    or status cell the answer-key checks read, off by one) it must exit non-zero with exactly 11 mc1e FAIL lines — every
#    mc1e key check but the manager rule, which no plant touches. About 2 min per run.
# Logs: scratchpad/redproof-0023/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0023"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }

# --- A. database gates -------------------------------------------------------------------------------------------
rm -f "$PLANT"
row RESULT PLANT EXPECT
for f in mc1e books; do
  if "$VITEST" run --reporter=verbose "tests/$f.test.ts" >"$OUT/db-clean-$f.log" 2>&1; then row ok "clean-$f" "exit 0"; else row FAIL "clean-$f" "exit 0 (see $OUT/db-clean-$f.log)"; fail=1; fi
done

# name | test file | the line (extended regex) that must appear in the red run's log
db_check() {
  local name="$1" file="$2" want="$3"
  if "$VITEST" run --reporter=verbose "tests/$file.test.ts" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
v2() { echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$p\$$2\$p\$, \$p\$$3\$p\$) WHERE id = '$1' AND version = 2 AND strpos(sql, \$p\$$2\$p\$) > 0;" >"$PLANT"; }

# (0023 post-conditions) the migration's own check, re-run after one version 2 drifts from v1's role → it refuses.
{ echo "UPDATE evidence.snapshot_template SET min_role = 'manager' WHERE id = 'finance.tender_vs_bank' AND version = 2;"
  sed -n '/^-- 11. Post-conditions/,$p' "$ROOT/db/migrations/0023_mc1e_template_versions.sql" | sed "s/assert_catalog('0023')/assert_catalog('0038')/"; } >"$PLANT"
# (since 0024 the re-run also names finance.settlement_vs_orders, whose latest is v3; tender_vs_bank is named only by the drift)
db_check pc-role mc1e "0023: version-2 templates not as written: .*finance\.tender_vs_bank"
# (C) a requested column renamed in the SQL only (declared ≠ returned).
v2 compliance.licence_calendar "AS manager_member_id" "AS manager"
db_check c-columns mc1e "FAIL .*> C — columns, roles and params of the nine version 2s > exactly the nine"
# (C) Σ rows sorted last.
v2 finance.settlement_vs_orders "ORDER BY z.k, z.period_to" "ORDER BY -z.k, z.period_to"
db_check c-sigma-first mc1e "FAIL .*> C — columns, roles and params of the nine version 2s > Σ rows come first"
# (S) licence_calendar no longer narrows core.outlet (tenant-visible) to the minter's outlets.
v2 compliance.licence_calendar "(SELECT current_setting('app.outlet_ids', true)) = '{*}'" "true"
db_check s-outlets mc1e "FAIL .*> S — outlet scope"
# (S) the settlement policy widened to tenant-only (a permissive policy beside it; gotcha 22).
echo "CREATE POLICY wide ON core.settlement USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid));" >"$PLANT"
db_check s-policy mc1e "FAIL .*> S — outlet scope"
# (V) version 2's week rows no longer version 1's (the overtime cost off).
v2 people.overtime_drift "* s.ot_multiplier_bp / 600000" "* s.ot_multiplier_bp / 590000"
db_check v-kept mc1e "FAIL .*> V — version 1 kept inside version 2"
# (H) every line counts (overpaid and rounding-level lines summed in).
v2 finance.settlement_vs_orders "coalesce(l.expected_net - l.net_minor > 0" "coalesce(true OR l.expected_net - l.net_minor > 0"
db_check h-line-rule mc1e "FAIL .*> H — hand values > settlement_vs_orders"
# (H) expected net from the statement's gross again (v1), not the matched order's total.
v2 finance.settlement_vs_orders "coalesce(o.total_minor, sl.gross_minor) - round" "sl.gross_minor - round"
db_check h-net-base mc1e "FAIL .*> H — hand values > settlement_vs_orders"
# (H) the channel's age the youngest order's, not the oldest's.
v2 finance.missing_payouts "max(m.days_unsettled)::bigint AS days_unsettled" "min(m.days_unsettled)::bigint AS days_unsettled"
db_check h-oldest mc1e "FAIL .*> H — hand values > missing_payouts"
# (H) a week's shift member named even when its gap days' members differ.
v2 finance.tender_vs_bank "CASE WHEN count(gd.shift_member_id) = count(*) AND count(DISTINCT gd.shift_member_id) = 1" "CASE WHEN true"
db_check h-shift mc1e "FAIL .*> H — hand values > tender_vs_bank"
# (H) the week's voids compared with one day's median (b-44's request).
v2 finance.tender_vs_bank "(max(gd.outlet_median_voids) * count(*))::bigint" "max(gd.outlet_median_voids)::bigint"
db_check h-median mc1e "FAIL .*> H — hand values > tender_vs_bank"
# (H) a day after the statement's last credit counted as a gap day.
v2 finance.tender_vs_bank "WHERE dr.business_on <= (SELECT max(bl.value_date) FROM bl)" "WHERE true"
db_check h-reach mc1e "FAIL .*> H — hand values > tender_vs_bank"
# (H) missing payouts' channel Σ off by one.
v2 finance.missing_payouts "sum(m.expected_net)::bigint AS expected_net_minor" "(1 + sum(m.expected_net))::bigint AS expected_net_minor"
db_check h-missing mc1e "FAIL .*> H — hand values > missing_payouts"
# (H) gst_check's outlet filter on the postings dropped.
v2 finance.gst_check "AND (:outlet_id::uuid IS NULL OR je.outlet_id = :outlet_id::uuid)" ""
db_check h-gst mc1e "FAIL .*> H — hand values > gst_check"
# (H) the coupon's outlets as a Postgres array literal, not JSON.
v2 customers.coupon_current "to_jsonb(k.outlet_ids)::text" "k.outlet_ids::text"
db_check h-coupon mc1e "FAIL .*> H — hand values > coupon_current"
# (H) expired read as missing again (v1).
v2 compliance.licence_calendar "THEN 'expired'" "THEN 'missing'"
db_check h-expired mc1e "FAIL .*> H — hand values > licence_calendar"
# (H) the manager rule inverted (most outlets first) / an inactive membership admitted.
v2 compliance.licence_calendar "ORDER BY cardinality(ms.outlet_ids), ms.member_id LIMIT 1" "ORDER BY cardinality(ms.outlet_ids) DESC, ms.member_id LIMIT 1"
db_check h-mgr-rule mc1e "FAIL .*> H — hand values > licence_calendar"
v2 compliance.licence_calendar "ms.role = 'manager' AND ms.active AND" "ms.role = 'manager' AND"
db_check h-mgr-active mc1e "FAIL .*> H — hand values > licence_calendar"
v2 compliance.log_coverage "mg.outlet_id = coalesce(:outlet_id::uuid, c.outlet_id)" "mg.outlet_id = :outlet_id::uuid"
db_check h-log-mgr mc1e "FAIL .*> H — hand values > log_coverage"
# (H) the staff member's Σ off by one minute.
v2 people.overtime_drift "sum(w.extra_min)::bigint AS extra_min" "(1 + sum(w.extra_min))::bigint AS extra_min"
db_check h-overtime mc1e "FAIL .*> H — hand values > overtime_drift"
# (H) the whole-window rows dropped (per-slot rows only, as v1).
v2 kitchen.ticket_times "    FROM t GROUP BY t.station, t.item_id
  UNION ALL" "    FROM t WHERE false GROUP BY t.station, t.item_id
  UNION ALL"
db_check h-tickets mc1e "FAIL .*> H — hand values > ticket_times"
# (D1) the dismiss command opens a book table.
echo "UPDATE core.command_authority SET target_tables = ARRAY['core.licence'] WHERE command_type = 'findings.dismiss.v1';" >"$PLANT"
db_check d1-book mc1e "FAIL .*> D1 — findings.dismiss.v1"
# (numeric sources) an intel-typed value named as one source of a version-2 column.
echo "UPDATE evidence.snapshot_template SET columns = jsonb_set(columns, '{8,numeric_source}', '[\"core.settlement_line.net_minor\", \"intel.finding.confidence_bp\"]') WHERE id = 'finance.settlement_vs_orders' AND version = 2;" >"$PLANT"
db_check numeric-src books "finance.settlement_vs_orders@2.short_minor: numeric_source 'intel.finding.confidence_bp' not allowed"

# --- B. world gate -----------------------------------------------------------------------------------------------
if node tests/templates-worlds.ts >"$OUT/worlds-clean.log" 2>&1; then row ok worlds-clean "exit 0"; else row FAIL worlds-clean "exit 0 (see $OUT/worlds-clean.log)"; fail=1; fi
if node tests/templates-worlds.ts --plant=mc1e >"$OUT/worlds-mc1e.log" 2>&1; then row FAIL worlds-mc1e "red, but exited 0 ($OUT/worlds-mc1e.log)"; fail=1
else
  n=$(grep -cE '^FAIL .* mc1e ' "$OUT/worlds-mc1e.log")
  if [ "$n" = 11 ]; then row ok worlds-mc1e "exit≠0; $n mc1e FAIL lines, e.g. $(grep -m1 -E '^FAIL .* mc1e ' "$OUT/worlds-mc1e.log" | cut -c1-150)"
  else row FAIL worlds-mc1e "red, but $n mc1e FAIL lines, want 11 ($OUT/worlds-mc1e.log)"; fail=1; fi
fi
echo "redproof-0023: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
