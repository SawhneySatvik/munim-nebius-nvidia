#!/usr/bin/env bash
# Red-proof of the M-C23 (0020) gates. No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0020.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure: the clean files
# must exit 0; per gate, a planted db/migrations/0038_redproof_plant.sql undoes exactly what the gate checks, and the
# named test file must then exit non-zero AND print a FAIL line naming that gate. The plant is removed after every run
# (and on exit). Do not run another suite while this runs: every global setup applies db/migrations, the plant included.
# Logs: scratchpad/redproof-0020/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0020"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-14s %s\n' "$1" "$2" "$3"; }

FILES="tests/mc23.test.ts tests/isolation.test.ts tests/grants.test.ts tests/books.test.ts tests/catalog.test.ts tests/intel.test.ts"
rm -f "$PLANT"
row RESULT PLANT EXPECT
# shellcheck disable=SC2086
if "$VITEST" run --reporter=verbose $FILES >"$OUT/clean.log" 2>&1; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# name | test file | the FAIL line (extended regex, after "> ") that must appear
check() {
  local name="$1" file="$2" want="$3"
  if "$VITEST" run --reporter=verbose "$file" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "FAIL .*> $want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; FAIL: $(grep -m1 -oE "FAIL .*> $want[^>]*" "$OUT/$name.log" | sed -E 's/.*> //')"
  else row FAIL "$name" "red, but no FAIL line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
# Rewrites one function's body in place: the plant edits the live definition, so it undoes exactly one clause.
fn_plant() { # function signature | text to find | replacement
  cat >"$PLANT" <<SQL
DO \$plant\$
DECLARE src text := pg_get_functiondef('$1'::regprocedure);
BEGIN
  IF position(\$f\$$2\$f\$ IN src) = 0 THEN RAISE EXCEPTION 'plant: clause not found in $1'; END IF;
  EXECUTE replace(src, \$f\$$2\$f\$, \$f\$$3\$f\$);
END \$plant\$;
SQL
}

# M-C3 (1)/(1) M-C2: isolation over the new tables (expected set from the manifest).
echo "CREATE POLICY leak ON core.investigation USING (true);" >"$PLANT"
check iso-rows tests/isolation.test.ts "as tenant A"
# M-C3 (2): tags.
echo "COMMENT ON TABLE core.ai_policy IS 'munim:operational';" >"$PLANT"
check tags tests/grants.test.ts "tagged tables = all tables in core"
# M-C3 (3)/M-C2 (5): intel cannot write N/N. SELECT too: without it Postgres refuses the INSERT on the policy's columns
# (naming the table), so the write would still look refused; with it the INSERT gets past the privilege and fails only
# inside the summary trigger (naming core.ai_thread_turn) — which the gate must not count as a refusal.
echo "GRANT USAGE ON SCHEMA core TO munim_intel_ro; GRANT SELECT, INSERT ON core.ai_thread TO munim_intel_ro;" >"$PLANT"
check intel-write tests/grants.test.ts "INSERT/UPDATE/DELETE/TRUNCATE as munim_intel_ro"
# M-C3 (4): owner-only policy writes.
echo "UPDATE core.command_authority SET allowed_roles = allowed_roles || ARRAY['manager'] WHERE command_type = 'ai_policy.ceiling.set.v1';" >"$PLANT"
check owner-only tests/mc23.test.ts "manager → MB001"
# M-C3 (5): gapless turns.
fn_plant 'core.ai_thread_turn_number()' 'ELSIF NEW.turn_no <> coalesce(last_no, 0) + 1 THEN' 'ELSIF false THEN'
check turn-gap tests/mc23.test.ts "a gap → MB014"
# M-C3 (5) / B1: the summary cites untainted turns only.
echo "DROP TRIGGER summary_untainted ON core.ai_thread;" >"$PLANT"
check summary-taint tests/mc23.test.ts "summary: a segment of a tainted turn"
# M-C3 (6): track record counts.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$s\$WHERE dc.verdict = 'rejected'\$s\$, \$s\$WHERE dc.verdict IN ('rejected', 'approved')\$s\$) WHERE id = 'intel.agent_track_record';" >"$PLANT"
check track-record tests/mc23.test.ts "finance: 3 approved"
# M-C3 (7): numeric sources — a planted confidence_bp element.
echo "UPDATE evidence.snapshot_template SET columns = jsonb_set(columns, '{1,numeric_source}', '[\"count:core.draft\", \"intel.finding.confidence_bp\"]') WHERE id = 'intel.agent_track_record';" >"$PLANT"
check numeric-src tests/books.test.ts "template numeric sources: every numeric column"
# M-C2 (3): gapless steps.
fn_plant 'core.investigation_step_rules()' 'ELSIF NEW.step_no <> coalesce(last_no, 0) + 1 THEN' 'ELSIF false THEN'
check step-gap tests/mc23.test.ts "\(3\) a step gap"
# M-C2 (4): the view's owner.
echo "ALTER VIEW intel_ro.investigation_current OWNER TO munim_migrator;" >"$PLANT"
check view-owner tests/mc23.test.ts "\(4\) intel_ro.investigation_current is owned by munim_view_owner"
# M-C2 (6): auto needs an approved plan.
echo "ALTER TABLE core.investigation DROP CONSTRAINT investigation_auto_needs_plan;" >"$PLANT"
check auto-plan tests/mc23.test.ts "\(6\) mode auto"
# M-C2 (7): the cost estimate.
echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$s\$NOT coalesce((x ->> 'frozen')::boolean, false)\$s\$, 'true') WHERE id = 'intel.investigation_cost_estimate';" >"$PLANT"
check cost-estimate tests/mc23.test.ts "\(7\) cost estimate"
# M-C2 (8): munim_svc's UPDATE columns.
echo "GRANT UPDATE (created_by) ON core.investigation TO munim_svc;" >"$PLANT"
check svc-update tests/mc23.test.ts "\(8\) munim_svc UPDATE"
# M7: viewer scope ⊇ investigation scope.
echo "CREATE POLICY wide ON core.investigation USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid));" >"$PLANT"
check scope-m7 tests/mc23.test.ts "M7: an outlet-1 manager"
# F11: a step under a revoked grant.
fn_plant 'core.investigation_step_rules()' 'AND g.revoked_at IS NULL AND m.active' 'AND m.active'
check revoked-step tests/mc23.test.ts "a step and a run under a REVOKED grant"
# F11: the new trigger kind only with a live grant.
fn_plant 'intel.run_auto_step_grant()' 'AND g.revoked_at IS NULL' ''
check revoked-run tests/mc23.test.ts "a step and a run under a REVOKED grant"
# F11: re-checked against the member's CURRENT membership.
fn_plant 'core.investigation_step_rules()' 'ELSE g.outlet_scope::uuid[] <@ ms.outlet_ids END' 'ELSE true END'
check narrowed tests/mc23.test.ts "membership narrowed"
# pg_index: a same-name index on other columns (gotcha 1).
echo "DROP INDEX core.investigation_grant_one_live; CREATE UNIQUE INDEX investigation_grant_one_live ON core.investigation_grant (tenant_id, member_id) WHERE revoked_at IS NULL;" >"$PLANT"
check pg-index tests/mc23.test.ts "pg_index: the 21 new indexes"
# Revoke-then-grant: a PUBLIC grant on a new table.
echo "GRANT SELECT ON core.ai_policy TO PUBLIC;" >"$PLANT"
check public-grant tests/mc23.test.ts "privileges on the seven tables"
echo "redproof-0020: $([ $fail = 0 ] && echo PASS || echo FAIL)"
[ $fail = 0 ]
