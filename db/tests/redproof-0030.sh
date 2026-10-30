#!/usr/bin/env bash
# Red-proof of the 0030 gates (T-115: display order). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0030.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/display-order-0030.test.ts must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the
# gate checks; the file must then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the
# migration's own refusal). The plant is removed after every run (and on exit). It writes into db/migrations of the tree it
# runs in: run it in a scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the
# plant included). Logs: scratchpad/redproof-0030/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0030_display_order.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0030"
TEST=tests/display-order-0030.test.ts
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-18s %s\n' "$1" "$2" "$3"; }

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
postconditions() { sed -n '/^-- 3. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0030')/assert_catalog('0038')/"; }

# (P1) the non-negative bound gone on core.option: -1 admitted.
echo "ALTER TABLE core.option DROP CONSTRAINT option_position_check;" >"$PLANT"
check p1-option-check "FAIL .*> P1 .* > CHECKs"
# (P1) munim_core loses UPDATE on core.variant.position: the owner's upsert is refused (42501).
echo "REVOKE UPDATE (position) ON core.variant FROM munim_core;" >"$PLANT"
check p1-grant "FAIL .*> P1 .* > existing rows read 0"
# (P1) munim_core may UPDATE core.item.position (no command carries it: set on INSERT only).
echo "GRANT UPDATE (position) ON core.item TO munim_core;" >"$PLANT"
check p1-item-update "FAIL .*> P1 .* > CHECKs"
# (P1) the default is not 0: existing rows no longer keep their order.
echo "ALTER TABLE core.variant ALTER COLUMN position SET DEFAULT 5;" >"$PLANT"
check p1-default "FAIL .*> P1 .* > existing rows read 0"
# (GUARD) a trigger that runs before book_guard and names the upsert command: a write with no command is admitted.
cat >"$PLANT" <<'SQL'
CREATE FUNCTION core.redproof_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('app.command_type', 'catalogue.item.upsert.v1', true); RETURN NEW; END $$;
CREATE TRIGGER aaa_redproof BEFORE UPDATE ON core.variant FOR EACH ROW EXECUTE FUNCTION core.redproof_command();
SQL
check guard-no-cmd "FAIL .*> GUARD .* > no command"
# (G) munim_svc may write position.
echo "GRANT UPDATE (position) ON core.variant TO munim_svc;" >"$PLANT"
check g-svc "FAIL .*> G privileges .* > munim_svc and munim_intel_ro cannot write"
# (G) munim_intel_ro may read position.
echo "GRANT SELECT (position) ON core.option_group TO munim_intel_ro;" >"$PLANT"
check g-intel-read "FAIL .*> G privileges .* > munim_svc and munim_intel_ro cannot write"
# (G) an extra munim_core UPDATE column (kind, which 0004 never granted).
echo "GRANT UPDATE (kind) ON core.item TO munim_core;" >"$PLANT"
check g-core-list "FAIL .*> G privileges .* > munim_core UPDATE lists, exactly"
# (ISO) a permissive USING (true) policy on core.option (gotcha 22: a dropped policy would stay deny-all).
echo "CREATE POLICY redproof_leak ON core.option FOR SELECT TO munim_core USING (true);" >"$PLANT"
check iso-leak "FAIL .*> ISO .* > tenant B"
# (post-conditions) 0030's own check, re-run after each perturbation.
{ echo "ALTER TABLE core.item DROP CONSTRAINT item_position_check, ADD CONSTRAINT item_position_check CHECK (position >= -1);"; postconditions; } >"$PLANT"
check pc-checks "0030: display order columns not as written: checks"
{ echo "ALTER TABLE core.option ALTER COLUMN position SET DEFAULT 1;"; postconditions; } >"$PLANT"
check pc-columns "0030: display order columns not as written: columns"
{ echo "GRANT UPDATE (position) ON core.item TO munim_core;"; postconditions; } >"$PLANT"
check pc-core-update "0030: display order columns not as written: core-update:core.item"
{ echo "GRANT SELECT (position) ON core.variant TO munim_intel_ro;"; postconditions; } >"$PLANT"
check pc-others "0030: display order columns not as written: others:munim_intel_ro.core.variant"
{ echo "ALTER TABLE core.option_group NO FORCE ROW LEVEL SECURITY;"; postconditions; } >"$PLANT"
check pc-rls "0030: display order columns not as written: rls:option_group"
{ echo "COMMENT ON TABLE core.variant IS 'munim:operational';"; postconditions; } >"$PLANT"
check pc-book "0030: display order columns not as written: book:variant"

echo "redproof-0030: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
