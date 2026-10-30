#!/usr/bin/env bash
# Red-proof of the 0027 gates (T-098, ledger R45 F10). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0027.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure. tests/ceiling-0027.test.ts
# must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must
# then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the migration's own refusal).
# The plant is removed after every run (and on exit). Do not run another suite while this runs: every global setup
# applies db/migrations, the plant included.
# Logs: scratchpad/redproof-0027/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0027_t098_auto_ceiling_downgrade.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0027"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-18s %s\n' "$1" "$2" "$3"; }

rm -f "$PLANT"
row RESULT PLANT EXPECT
if "$VITEST" run --reporter=verbose tests/ceiling-0027.test.ts >"$OUT/clean.log" 2>&1; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log
check() {
  local name="$1" want="$2"
  if "$VITEST" run --reporter=verbose tests/ceiling-0027.test.ts >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
postconditions() { sed -n '/^-- 4. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0027')/assert_catalog('0038')/"; }

# (C1) the stop_reason list without 'ceiling' (0020's CHECK back).
cat >"$PLANT" <<'SQL'
ALTER TABLE core.investigation DROP CONSTRAINT investigation_stop_reason_check,
  ADD CONSTRAINT investigation_stop_reason_check CHECK (stop_reason IN ('draft', 'abstain', 'budget', 'scope', 'waiting'));
SQL
check c1-no-ceiling "FAIL .*> C1 .* > 'ceiling' accepted"
# (C2) the derivation trigger gone: the svc ceiling stop on an auto row now fails closed on the CHECK.
echo "DROP TRIGGER ceiling_downgrade ON core.investigation;" >"$PLANT"
check c2-no-trigger "FAIL .*> C2 .* > auto row: SET stop_reason = 'ceiling'"
# (C2) the trigger downgrades to step, not plan.
echo "CREATE OR REPLACE FUNCTION core.investigation_ceiling_downgrade() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS \$\$
BEGIN IF NEW.stop_reason = 'ceiling' AND OLD.mode = 'auto' AND NEW.mode = 'auto' THEN NEW.mode := 'step'; END IF; RETURN NEW; END \$\$;" >"$PLANT"
check c2-to-step "FAIL .*> C2 .* > auto row: SET stop_reason = 'ceiling'"
# (priv) munim_svc may write mode (the GRANT the trigger replaces).
echo "GRANT UPDATE (mode) ON core.investigation TO munim_svc;" >"$PLANT"
check svc-mode-grant "FAIL .*> munim_svc writes no mode itself > auto → plan, plan → auto"
# (G) the auto step rule no longer requires mode auto (a downgraded row's grant would still step).
cat >"$PLANT" <<'SQL'
DO $$
DECLARE src text := (SELECT prosrc FROM pg_proc WHERE oid = 'core.investigation_step_rules()'::regprocedure);
BEGIN
  IF position($q$current_user = 'munim_svc' AND inv.mode = 'auto'$q$ IN src) = 0 THEN RAISE EXCEPTION 'plant does not apply'; END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION core.investigation_step_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS %L$f$,
                 replace(src, $q$current_user = 'munim_svc' AND inv.mode = 'auto'$q$, $q$current_user = 'munim_svc' AND inv.mode IN ('auto', 'plan')$q$));
END $$;
SQL
check g-inert "FAIL .*> G the standing grant after the downgrade"
# (CHK) 'ceiling' admitted on an auto row.
echo "ALTER TABLE core.investigation DROP CONSTRAINT investigation_ceiling_not_auto;" >"$PLANT"
check chk-dropped "FAIL .*> CHK .* > an auto row inserted with 'ceiling'"
# (A1) the auto-entry guard gone: munim_core re-enters auto without a plan approval.
echo "DROP TRIGGER auto_entry ON core.investigation;" >"$PLANT"
check a1-no-guard "FAIL .*> A1 .* > an approved plan → auto"
# (A1) the guard keyed on plan_approved_at (stamped by investigation_rules, which fires after it): approveAuto's own update refused.
echo "CREATE OR REPLACE FUNCTION core.investigation_auto_entry() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS \$\$
BEGIN IF NEW.mode = 'auto' AND OLD.mode IS DISTINCT FROM 'auto' AND NOT (OLD.plan_approved_at IS NULL AND NEW.plan_approved_at IS NOT NULL) THEN
RAISE EXCEPTION 'illegal_transition' USING ERRCODE = 'MB004'; END IF; RETURN NEW; END \$\$;" >"$PLANT"
check a1-wrong-column "FAIL .*> A1 .* > the approval"
# (post-conditions) 0027's own check, re-run after the trigger is disabled.
{ echo "ALTER TABLE core.investigation DISABLE TRIGGER ceiling_downgrade;"; postconditions; } >"$PLANT"
check pc-trigger "0027: core.investigation ceiling downgrade not as written: trigger:ceiling_downgrade"
# (post-conditions) re-run after munim_svc gains UPDATE on mode.
{ echo "GRANT UPDATE (mode) ON core.investigation TO munim_svc;"; postconditions; } >"$PLANT"
check pc-svc-grants "0027: core.investigation ceiling downgrade not as written: svc-grants"
# (post-conditions) re-run after the auto-entry guard is disabled.
{ echo "ALTER TABLE core.investigation DISABLE TRIGGER auto_entry;"; postconditions; } >"$PLANT"
check pc-a1-trigger "0027: core.investigation ceiling downgrade not as written: trigger:auto_entry"
# (post-conditions) re-run after a function becomes callable by PUBLIC.
{ echo "GRANT EXECUTE ON FUNCTION core.investigation_auto_entry() TO PUBLIC;"; postconditions; } >"$PLANT"
check pc-public-exec "0027: core.investigation ceiling downgrade not as written: function:core.investigation_auto_entry"

echo "redproof-0027: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
