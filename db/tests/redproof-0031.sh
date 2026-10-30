#!/usr/bin/env bash
# Red-proof of the 0031 gates (T-117: the tick ledger). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0031.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/tick-ledger-0031.test.ts must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the
# gate checks; the file must then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the
# migration's own refusal). The plant is removed after every run (and on exit). It writes into db/migrations of the tree it
# runs in: run it in a scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the
# plant included). Logs: scratchpad/redproof-0031/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0031_tick_ledger.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0031"
TEST=tests/tick-ledger-0031.test.ts
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
postconditions() { sed -n '/^-- 3. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0031')/assert_catalog('0038')/"; }

# (T1) no key: a repeated claim of one (job, slot) is admitted.
echo "ALTER TABLE core.tick_claim DROP CONSTRAINT tick_claim_pkey;" >"$PLANT"
check t1-no-key "FAIL .*> T1 claims > a \(job, slot\) is claimed once"
# (T1) a key that also covers claimed_at: every claim is new.
echo "ALTER TABLE core.tick_claim DROP CONSTRAINT tick_claim_pkey, ADD CONSTRAINT tick_claim_pkey PRIMARY KEY (job, slot_at, claimed_at);" >"$PLANT"
check t1-wide-key "FAIL .*> T1 claims > a \(job, slot\) is claimed once"
# (T1) the outcome list gone: 'done' admitted.
echo "ALTER TABLE core.tick_claim DROP CONSTRAINT tick_claim_outcome_check;" >"$PLANT"
check t1-outcome "FAIL .*> T1 claims > CHECKs"
# (T1) finished_at and outcome no longer set together.
echo "ALTER TABLE core.tick_claim DROP CONSTRAINT tick_claim_finished_check;" >"$PLANT"
check t1-finished "FAIL .*> T1 claims > CHECKs"
# (G) munim_svc may DELETE a claim (releasing it would let the slot run again).
echo "GRANT DELETE ON core.tick_claim TO munim_svc;" >"$PLANT"
check g-svc-delete "FAIL .*> G privileges > munim_svc cannot change the key"
# (G) munim_svc may move a claim to another slot.
echo "GRANT UPDATE (slot_at) ON core.tick_claim TO munim_svc;" >"$PLANT"
check g-svc-key "FAIL .*> G privileges > munim_svc cannot change the key"
# (G) munim_core may read the ledger.
echo "GRANT SELECT ON core.tick_claim TO munim_core;" >"$PLANT"
check g-core-read "FAIL .*> G privileges > munim_core, munim_platform and munim_intel_ro"
# (G) munim_intel_ro may read one column (a column grant the table-level ACL scan does not show).
echo "GRANT SELECT (job) ON core.tick_claim TO munim_intel_ro;" >"$PLANT"
check g-intel-col "FAIL .*> G privileges > (munim_core, munim_platform and munim_intel_ro|the catalog)"
# (SHAPE) tagged as a book.
echo "COMMENT ON TABLE core.tick_claim IS 'munim:book';" >"$PLANT"
check shape-tag "FAIL .*> SHAPE"
# (post-conditions) 0031's own check, re-run after each perturbation.
{ echo "ALTER TABLE core.tick_claim DROP CONSTRAINT tick_claim_pkey; CREATE UNIQUE INDEX tick_claim_pkey ON core.tick_claim (job, slot_at);"; postconditions; } >"$PLANT"
check pc-key "0031: tick ledger not as written: key"
{ echo "ALTER TABLE core.tick_claim DROP CONSTRAINT tick_claim_outcome_check, ADD CONSTRAINT tick_claim_outcome_check CHECK (outcome IN ('ok', 'failed', 'aborted', 'done'));"; postconditions; } >"$PLANT"
check pc-checks "0031: tick ledger not as written: checks"
{ echo "ALTER TABLE core.tick_claim ALTER COLUMN claimed_at DROP DEFAULT;"; postconditions; } >"$PLANT"
check pc-columns "0031: tick ledger not as written: columns"
{ echo "GRANT UPDATE ON core.tick_claim TO munim_svc;"; postconditions; } >"$PLANT"
check pc-acl "0031: tick ledger not as written: .*acl"
{ echo "GRANT UPDATE (claimed_at) ON core.tick_claim TO munim_svc;"; postconditions; } >"$PLANT"
check pc-column-acl "0031: tick ledger not as written: column-acl"
{ echo "GRANT SELECT ON core.tick_claim TO munim_platform;"; postconditions; } >"$PLANT"
check pc-others "0031: tick ledger not as written: .*others:munim_platform"
{ echo "ALTER TABLE core.tick_claim ENABLE ROW LEVEL SECURITY;"; postconditions; } >"$PLANT"
check pc-table "0031: tick ledger not as written: table"
{ echo "CREATE TRIGGER aaa_redproof BEFORE INSERT ON core.tick_claim FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();"; postconditions; } >"$PLANT"
check pc-extra "0031: tick ledger not as written: extra"
{ echo "INSERT INTO core.tick_claim (job, slot_at) VALUES ('fanout-brief', '2026-10-15T01:00:00Z');"; postconditions; } >"$PLANT"
check pc-rows "0031: tick ledger not as written: rows"

echo "redproof-0031: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
