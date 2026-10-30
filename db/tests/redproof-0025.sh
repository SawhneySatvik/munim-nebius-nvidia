#!/usr/bin/env bash
# Red-proof of the 0025 gates (W3 close). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0025.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure. tests/w3close.test.ts
# must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must
# then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the migration's own refusal).
# The plant is removed after every run (and on exit). Do not run another suite while this runs: every global setup
# applies db/migrations, the plant included.
# Logs: scratchpad/redproof-0025/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0025_w3_close.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0025"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-18s %s\n' "$1" "$2" "$3"; }

rm -f "$PLANT"
row RESULT PLANT EXPECT
if "$VITEST" run --reporter=verbose tests/w3close.test.ts >"$OUT/clean.log" 2>&1; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log
check() {
  local name="$1" want="$2"
  if "$VITEST" run --reporter=verbose tests/w3close.test.ts >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
# v2 <old> <new>: replace a fragment of v2's SQL (only when present, so a stale fragment leaves v2 green → the check fails loudly).
v2() { echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$p\$$1\$p\$, \$p\$$2\$p\$) WHERE id = 'intel.investigation_cost_estimate' AND version = 2 AND strpos(sql, \$p\$$1\$p\$) > 0;" >"$PLANT"; }
postconditions() { sed -n '/^-- 4. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0025')/assert_catalog('0038')/"; }
HAND="FAIL .*> E1 .* > hand values"

# (E1) the denominator counts only steps with spend (the R-D 4 bug: a zero-spend linked step drops out) → 446 ÷ 5.
v2 'SELECT count(*) AS steps FROM linked' 'SELECT count(*) AS steps FROM linked l WHERE EXISTS (SELECT 1 FROM intel.intel_spend s WHERE s.tenant_id = l.tenant_id AND s.run_id = l.run_id)'
check e1-denominator "$HAND"
# (E1) unlinked steps (no run) counted → 446 ÷ 8.
v2 ' AND st.run_id IS NOT NULL' ''
check e1-unlinked "$HAND"
# (E1) per item again (v1's unit) → × remaining_items.
v2 'round(sp.spent::numeric / n.steps) * fut.steps' 'round(sp.spent::numeric / n.steps) * rem.items'
check e1-per-item "$HAND"
# (E1) no max_steps − steps_done bound → the capped investigation reads 5 steps.
v2 'least(inv.max_steps - inv.steps_done, rem.items)' 'rem.items'
check e1-no-cap "$HAND"
# (E1) a terminal investigation still has steps to run.
v2 "WHEN inv.status IN ('open', 'waiting') THEN" 'WHEN true THEN'
check e1-terminal "$HAND"
# (E1) the NULL-currency group (linked steps with no spend) kept as a row.
v2 ' WHERE sp.currency IS NOT NULL' ''
check e1-null-currency "FAIL .*> E1 .* > (hand values|another playbook)"
# (N1) the trigger gone → only core's explicit notify arrives.
echo "DROP TRIGGER notify_inbox ON core.investigation;" >"$PLANT"
check n1-dropped "FAIL .*> N1 .*"
# (N1) the trigger on another channel.
echo "DROP TRIGGER notify_inbox ON core.investigation; CREATE TRIGGER notify_inbox AFTER INSERT OR UPDATE ON core.investigation FOR EACH ROW EXECUTE FUNCTION core.notify_ids('munim_outbox');" >"$PLANT"
check n1-channel "FAIL .*> N1 .*"
# (G1) the id grant gone → the page query is refused.
echo "REVOKE SELECT (id) ON intel.intel_spend FROM munim_platform;" >"$PLANT"
check g1-revoked "FAIL .*> G1 .*"
# (G1) the operator also reads run_id.
echo "GRANT SELECT (run_id) ON intel.intel_spend TO munim_platform;" >"$PLANT"
check g1-run-id "FAIL .*> G1 .*"
# (G1) the operator reads the tenant's AI cap.
echo "GRANT USAGE ON SCHEMA core TO munim_platform; GRANT SELECT ON core.ai_budget_cap TO munim_platform;" >"$PLANT"
check g1-cap "FAIL .*> G1 .*"
# (post-conditions) 0025's own check, re-run after the trigger is re-created under its name on another channel.
{ echo "DROP TRIGGER notify_inbox ON core.investigation; CREATE TRIGGER notify_inbox AFTER INSERT OR UPDATE ON core.investigation FOR EACH ROW EXECUTE FUNCTION core.notify_ids('munim_inbox_x');"
  postconditions; } >"$PLANT"
check pc-trigger "0025: trigger core.investigation notify_inbox not as written"
# (post-conditions) re-run after v2 drifts back to the per-item product.
{ echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'round(sp.spent::numeric / n.steps) * fut.steps', 'round(sp.spent::numeric / n.steps) * rem.items') WHERE id = 'intel.investigation_cost_estimate' AND version = 2;"
  postconditions; } >"$PLANT"
check pc-v2-sql "0025: intel.investigation_cost_estimate v2 not as written: sql"
# (post-conditions) re-run after the operator gains the tenant's AI cap.
{ echo "GRANT USAGE ON SCHEMA core TO munim_platform; GRANT SELECT ON core.ai_budget_cap TO munim_platform;"
  postconditions; } >"$PLANT"
check pc-grant "0025: munim_platform privileges on intel.intel_spend / core.ai_budget_cap not as written"

echo "redproof-0025: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
