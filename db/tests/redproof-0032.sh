#!/usr/bin/env bash
# Red-proof of the 0032 gates (T-127: the command authority of purchasing.rfq.request.v1). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0032.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/rfq-authority-0032.test.ts must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the
# gate checks; the file must then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the
# migration's own refusal). The plant is removed after every run (and on exit). It writes into db/migrations of the tree it
# runs in: run it in a scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the
# plant included). Logs: scratchpad/redproof-0032/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0032_rfq_authority.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0032"
TEST=tests/rfq-authority-0032.test.ts
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
postconditions() { sed -n '/^-- 2. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0032')/assert_catalog('0038')/"; }
A="UPDATE core.command_authority SET"
W="WHERE command_type = 'purchasing.rfq.request.v1'"

# (A1, LOG) no row: the authority and the command_log foreign key both refuse the request.
echo "DELETE FROM core.command_authority $W;" >"$PLANT"
check a1-no-row "FAIL .*> LOG the command is on record"
# (A1, G) staff listed.
echo "$A allowed_roles = allowed_roles || 'staff'::text $W;" >"$PLANT"
check a1-staff "FAIL .*> G it writes no book table > staff"
# (A1) a tenant-wide command (every chosen outlet would no longer be judged).
echo "$A scope = 'tenant' $W;" >"$PLANT"
check a1-scope "FAIL .*> A1 the row"
# (A1) only through an approved draft.
echo "$A draft_only = true $W;" >"$PLANT"
check a1-draft "FAIL .*> A1 the row"
# (G) a book table bound to it: an owner's write to it is no longer refused.
echo "$A target_tables = ARRAY['core.budget'] $W;" >"$PLANT"
check g-book "FAIL .*> G it writes no book table > an owner"
# (post-conditions) 0032's own check, re-run after each perturbation.
{ echo "$A role_caps = '{\"manager\": 100}' $W;"; postconditions; } >"$PLANT"
check pc-caps "0032: purchasing.rfq.request.v1 is not the operational-only command written here"
{ echo "$A outlet_column = 'outlet_id' $W;"; postconditions; } >"$PLANT"
check pc-column "0032: purchasing.rfq.request.v1 is not the operational-only command written here"
{ echo "$A allowed_roles = ARRAY['owner', 'judge'] $W;"; postconditions; } >"$PLANT"
check pc-roles "0032: purchasing.rfq.request.v1 is not the operational-only command written here"

echo "redproof-0032: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
