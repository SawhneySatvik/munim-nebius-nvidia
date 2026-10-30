#!/usr/bin/env bash
# Red-proof of the 0035 gates (R71: customers.consented_audience v2 — "Send me offers" is email consent only). No flags
# (gotcha 17); run from anywhere:
#   db/tests/redproof-0035.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/consent-0035.test.ts must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the
# gate checks; the file must then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the
# migration's own refusal). The plant is removed after every run (and on exit). It writes into db/migrations of the tree it
# runs in: run it in a scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the
# plant included). Logs: scratchpad/redproof-0035/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0035_r71_consented_audience.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0035"
TEST=tests/consent-0035.test.ts
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }

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
postconditions() { sed -n '/^-- 2. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0035')/assert_catalog('0038')/"; }
V2="WHERE id = 'customers.consented_audience' AND version = 2"
# v2 <old> <new>: replace a fragment of v2's SQL, only when present (a stale fragment leaves v2 green → the check fails loudly).
v2() { echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$p\$$1\$p\$, \$p\$$2\$p\$) $V2 AND strpos(sql, \$p\$$1\$p\$) > 0;"; }
# v2re <regex> <replacement>: the same with a regular expression (every match), only when it matches.
v2re() { echo "UPDATE evidence.snapshot_template SET sql = regexp_replace(sql, \$p\$$1\$p\$, \$p\$$2\$p\$, 'g') $V2 AND sql ~ \$p\$$1\$p\$;"; }
M="CASE WHEN jsonb_typeof(c.consent -> 'marketing') = 'boolean' THEN (c.consent ->> 'marketing')::boolean END"

# (C1) the both-channels rule (ada92b2's reading): marketing stands in for sms too → {marketing: true, email: false} counted.
v2 "THEN (c.consent ->> 'sms')::boolean END, false)" "THEN (c.consent ->> 'sms')::boolean END, $M, false)" >"$PLANT"
check c1-both-channels "FAIL .*> C1 who is counted \(R71\)"
# (C1) no marketing fallback (v1's rule): "Send me offers" counts for nothing.
v2 "$M," "" >"$PLANT"
check c1-no-fallback "FAIL .*> C1 who is counted \(R71\)"
# (C1) no type check (the casts unguarded): "maybe" raises 22P02, "yes" and 1 read as consent.
v2re "CASE WHEN jsonb_typeof\(c\.consent -> '[a-z]+'\) = 'boolean' THEN (\(c\.consent ->> '[a-z]+'\)::boolean) END" '\1' >"$PLANT"
check c1-no-type-check "FAIL .*> C1 who is counted \(R71\)"
# (C1) v2 back to v1's SQL.
echo "UPDATE evidence.snapshot_template n SET sql = o.sql FROM evidence.snapshot_template o WHERE n.id = 'customers.consented_audience' AND n.version = 2 AND o.id = n.id AND o.version = 1;" >"$PLANT"
check c1-v1-sql "FAIL .*> C1 who is counted \(R71\)"
# (ERASE) the erased_at clause dropped: the row inserted erased with {marketing: true} is counted.
v2re 'c\.erased_at IS NULL\s+AND ' '' >"$PLANT"
check erase-dropped "FAIL .*> ERASE an erased customer"
# (SCOPE) v2's minter-scope clause made always true: a one-outlet minter opens an every-outlet segment.
v2 "(SELECT current_setting('app.outlet_ids', true)) = '{*}'" "true" >"$PLANT"
check scope-open "FAIL .*> SCOPE a minter holding one outlet"
# (SHAPE) v2 at another role.
echo "UPDATE evidence.snapshot_template SET min_role = 'owner' $V2;" >"$PLANT"
check shape-role "FAIL .*> SHAPE version 2"
# (post-conditions) 0035's own check, re-run after each perturbation.
{ echo "UPDATE evidence.snapshot_template SET min_role = 'owner' $V2;"; postconditions; } >"$PLANT"
check pc-role "0035: customers.consented_audience v2 not as written: shape"
{ echo "UPDATE evidence.snapshot_template SET columns = jsonb_set(columns, '{1,numeric_source}', '\"count:core.customer\"') $V2;"; postconditions; } >"$PLANT"
check pc-columns "0035: customers.consented_audience v2 not as written: shape"
{ v2 "SELECT DISTINCT (r ->> 'customer_id')::uuid" "SELECT (r ->> 'customer_id')::uuid"; postconditions; } >"$PLANT"
check pc-sql "0035: customers.consented_audience v2 not as written: sql"
{ echo "INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) SELECT id, 3, sql, params_schema, columns, min_role FROM evidence.snapshot_template $V2;"; postconditions; } >"$PLANT"
check pc-version "0035: customers.consented_audience v2 not as written: version"

echo "redproof-0035: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
