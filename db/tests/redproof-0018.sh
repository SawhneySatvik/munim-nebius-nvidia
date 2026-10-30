#!/usr/bin/env bash
# Red-proof of the 0018 gates (db/tests/history.test.ts). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0018.sh
# 1. The clean file must exit 0.
# 2. Per item, a planted db/migrations/0038_redproof_plant.sql undoes that item; the file must then exit non-zero
#    (gotcha 33: judged by the process exit code) AND its FAIL lines must name the item's tests.
# The plant is removed after every run (and on exit). Only history.test.ts runs: an extra migration also turns the
# manifest gates red, which would prove nothing about these items. Do not run another suite while this runs: every
# global setup applies db/migrations, the plant included. Logs: scratchpad/redproof-0018/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
MIG="$ROOT/db/migrations/0018_history_imports.sql"
OUT="$ROOT/scratchpad/redproof-0018"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }
run() { "$VITEST" run tests/history.test.ts >"$OUT/$1.log" 2>&1; }

row RESULT PLANT EXPECT
rm -f "$PLANT"
if run clean; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# core.write_derived as 0018 creates it, re-issued with one edit.
plant_fn() { sed -n '/^CREATE FUNCTION core.write_derived(groups jsonb)/,/^END \$\$;/p' "$MIG" | sed -e 's/^CREATE FUNCTION/CREATE OR REPLACE FUNCTION/' "$@"; }

# name | ';'-separated test-name prefixes that must each be listed as FAIL (extended regex)
check() {
  local name="$1" want="$2" missing="" w
  if run "$name"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  IFS=';' read -ra wants <<<"$want"
  for w in "${wants[@]}"; do grep -E "FAIL .*> ($w)" "$OUT/$name.log" >/dev/null || missing="$missing [$w]"; done
  if [ -n "$missing" ]; then row FAIL "$name" "red, but no FAIL naming:$missing ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0; FAIL: $(grep -oE "FAIL .*> K[0-9] [a-z]+" "$OUT/$name.log" | sed -E 's/.*> //' | sort | uniq -c | tr -s ' ' | tr '\n' ',')"
  fi
  rm -f "$PLANT"
}

cat >"$PLANT" <<'SQL'
ALTER TABLE core.import_run DROP CONSTRAINT import_run_kind_check;
ALTER TABLE core.import_run ADD CONSTRAINT import_run_kind_check
  CHECK (kind IN ('payout_statement', 'bank_statement', 'pos_export', 'tally_export', 'aggregator_orders', 'supplier_invoice',
                  'market_signal', 'menu', 'price_list', 'reviews'));
SQL
check k1-kinds "K1 accepted;K1 refused"
echo "UPDATE core.command_authority SET target_tables = array_remove(target_tables, 'core.waste_log') WHERE command_type = 'imports.run.commit.v1';" >"$PLANT"
check k2-binding "K2 accepted"
echo "UPDATE core.command_authority SET target_tables = target_tables || ARRAY['core.stock_movement', 'core.journal_entry'] WHERE command_type = 'imports.run.commit.v1';" >"$PLANT"
check k2-derived "K2 refused;K3 accepted: a waste movement"
echo "GRANT EXECUTE ON FUNCTION core.write_derived(jsonb) TO munim_svc;" >"$PLANT"
check k3-grant "K3 refused: a posting"
plant_fn -e '/a posting must belong to an entry of its own group/d' >"$PLANT"
check k3-membership "K3 refused: a posting"
plant_fn -e "s/^  PERFORM set_config('app.posting_rule', prev_rule, true), set_config('app.source_ref', prev_src, true);$/  NULL;/" >"$PLANT"
check k3-restore "K3 accepted: a waste movement"
echo "redproof-0018: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
