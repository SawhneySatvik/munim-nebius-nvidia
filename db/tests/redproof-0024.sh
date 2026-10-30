#!/usr/bin/env bash
# Red-proof of the 0024 gates (W3.2 review fixes). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0024.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure:
# A. Database gates (tests/w32fix.test.ts). The clean file must exit 0. Per gate, a planted
#    db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must then exit non-zero AND print a FAIL
#    line naming the gate (or, for a post-condition plant, the migration's own refusal). The plant is removed after every
#    run (and on exit). Do not run another suite while this runs: every global setup applies db/migrations, the plant
#    included.
# B. World gate (tests/templates-worlds.ts on the four worlds): the clean run must exit 0; with --plant=m0024 (v3's Σ
#    short_minor off by one) it must exit non-zero with exactly 6 m0024 FAIL lines (per world with a settlement: v3 = core's
#    breaks, and the F3 statement's v3 Σ = the key). About 2 min per run.
# Logs: scratchpad/redproof-0024/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0024_w32_review_fixes.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0024"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }

# --- A. database gates -------------------------------------------------------------------------------------------
rm -f "$PLANT"
row RESULT PLANT EXPECT
if "$VITEST" run --reporter=verbose tests/w32fix.test.ts >"$OUT/db-clean.log" 2>&1; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/db-clean.log)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log
db_check() {
  local name="$1" want="$2"
  if "$VITEST" run --reporter=verbose tests/w32fix.test.ts >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
v3() { echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$p\$$1\$p\$, \$p\$$2\$p\$) WHERE id = 'finance.settlement_vs_orders' AND version = 3 AND strpos(sql, \$p\$$1\$p\$) > 0;" >"$PLANT"; }
postconditions() { sed -n '/^-- 6. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0024')/assert_catalog('0038')/"; }

# (S1) the unique index gone → a duplicate count is accepted.
echo "DROP INDEX core.stock_count_outlet_counted_at_key;" >"$PLANT"
db_check s1-index "FAIL .*> S1 — one stock count per outlet per instant > refused"
# (S2) the CHECK gone → a real supplier with a card URL is accepted.
echo "ALTER TABLE core.supplier DROP CONSTRAINT supplier_a2a_simulated_only;" >"$PLANT"
db_check s2-check "FAIL .*> S2 — only a simulated supplier has an A2A endpoint"
# (Q1) the chunk CHECK narrowed back to 0012's → the run-held chunk is refused.
echo "ALTER TABLE intel.chunk DROP CONSTRAINT chunk_source_check; ALTER TABLE intel.chunk ADD CONSTRAINT chunk_source_check CHECK (num_nonnulls(document_id, message_id) = 1);" >"$PLANT"
db_check q1-chunk-narrow "FAIL .*> Q1 .* > intel.chunk: a run-held chunk"
# (Q1) the chunk CHECK opened → a chunk with no source at all is accepted.
echo "ALTER TABLE intel.chunk DROP CONSTRAINT chunk_source_check;" >"$PLANT"
db_check q1-chunk-open "FAIL .*> Q1 .* > intel.chunk: a run-held chunk"
# (Q1) the span trigger gone → every MB012 refusal is accepted.
echo "DROP TRIGGER spans_match ON intel.supplier_quote;" >"$PLANT"
db_check q1-trigger "FAIL .*> Q1 .* > refused \(MB012\)"
# (Q1) the trigger echoes the intel-supplied key in its error.
{ sed -n '/^CREATE FUNCTION intel.supplier_quote_spans_match/,/^END \$\$;/p' "$MIG" | sed 's/^CREATE FUNCTION/CREATE OR REPLACE FUNCTION/' \
    | sed "s/spans a field that is not a numeric quote field', NEW.id/spans the field % that is not a numeric quote field', NEW.id, k/"; } >"$PLANT"
db_check q1-echo "FAIL .*> Q1 .* > refused \(MB012\)"
# (Q1) the both-or-neither CHECK gone → spans without a chunk are accepted.
echo "ALTER TABLE intel.supplier_quote DROP CONSTRAINT supplier_quote_spans_with_chunk;" >"$PLANT"
db_check q1-pairing "FAIL .*> Q1 .* > refused: spans without a chunk"
# (R1) the run CHECK narrowed back to 0020's → an ingest run is refused.
echo "ALTER TABLE intel.run DROP CONSTRAINT run_trigger_check; ALTER TABLE intel.run ADD CONSTRAINT run_trigger_check CHECK (trigger IN ('event', 'watch_sweep', 'ask', 'brief', 'auto_step'));" >"$PLANT"
db_check r1-narrow "FAIL .*> R1 — an ingestion run"
# (R1) the run CHECK gone → an unknown trigger is accepted.
echo "ALTER TABLE intel.run DROP CONSTRAINT run_trigger_check;" >"$PLANT"
db_check r1-open "FAIL .*> R1 — an ingestion run"
# (F5) v3 LEFT-joins the order again → the unmatched lines come back as rows.
v3 'JOIN core."order" o ON o.tenant_id = sl.tenant_id AND o.id = sl.matched_order_id' 'LEFT JOIN core."order" o ON o.tenant_id = sl.tenant_id AND o.id = sl.matched_order_id'
db_check f5-join "FAIL .*> F5 .* > an unmatched line adds 0"
# (F5) v3 without core's defaults (both coalesces: greatest() skips one NULL, so only both restore v2's "never counts").
echo "UPDATE evidence.snapshot_template SET sql = replace(replace(sql, 'coalesce(th.line_minor, 1)', 'th.line_minor'), 'coalesce(th.line_bp, 0)', 'th.line_bp') WHERE id = 'finance.settlement_vs_orders' AND version = 3 AND strpos(sql, 'coalesce(th.line_minor, 1)') > 0;" >"$PLANT"
db_check f5-defaults "FAIL .*> F5 .* > no line thresholds in the pack"
# (post-conditions) 0024's own check, re-run after the index is re-created under its name with other columns (gotcha 1).
{ echo "DROP INDEX core.stock_count_outlet_counted_at_key; CREATE UNIQUE INDEX stock_count_outlet_counted_at_key ON core.stock_count (tenant_id, counted_at, outlet_id);"
  postconditions; } >"$PLANT"
db_check pc-index "0024: indexes not as written: stock_count_outlet_counted_at_key"
# (post-conditions) re-run after v3 drifts from v2's role.
{ echo "UPDATE evidence.snapshot_template SET min_role = 'manager' WHERE id = 'finance.settlement_vs_orders' AND version = 3;"
  postconditions; } >"$PLANT"
db_check pc-v3-role "0024: finance.settlement_vs_orders v3 not as written: shape"

# --- B. world gate -----------------------------------------------------------------------------------------------
if node tests/templates-worlds.ts >"$OUT/worlds-clean.log" 2>&1; then row ok worlds-clean "exit 0"; else row FAIL worlds-clean "exit 0 (see $OUT/worlds-clean.log)"; fail=1; fi
if node tests/templates-worlds.ts --plant=m0024 >"$OUT/worlds-m0024.log" 2>&1; then row FAIL worlds-m0024 "red, but exited 0 ($OUT/worlds-m0024.log)"; fail=1
else
  n=$(grep -cE '^FAIL .* m0024 ' "$OUT/worlds-m0024.log")
  if [ "$n" = 6 ]; then row ok worlds-m0024 "exit≠0; $n m0024 FAIL lines, e.g. $(grep -m1 -E '^FAIL .* m0024 ' "$OUT/worlds-m0024.log" | cut -c1-150)"
  else row FAIL worlds-m0024 "red, but $n m0024 FAIL lines, want 6 ($OUT/worlds-m0024.log)"; fail=1; fi
fi
echo "redproof-0024: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
