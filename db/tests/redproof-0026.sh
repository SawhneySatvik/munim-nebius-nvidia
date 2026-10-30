#!/usr/bin/env bash
# Red-proof of the 0026 gates (ledger R47 D1, D3, D6, D7). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0026.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure. tests/w3decisions.test.ts
# must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must
# then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the migration's own refusal).
# Last, node db/tests/templates-worlds.ts --plant=m0026 must exit non-zero with the world checks (RG-P2, store) red.
# The plant is removed after every run (and on exit). Do not run another suite while this runs: every global setup
# applies db/migrations, the plant included.
# Logs: scratchpad/redproof-0026/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0026_w3_founder_decisions.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0026"
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-18s %s\n' "$1" "$2" "$3"; }

rm -f "$PLANT"
row RESULT PLANT EXPECT
if "$VITEST" run --reporter=verbose tests/w3decisions.test.ts >"$OUT/clean.log" 2>&1; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log
check() {
  local name="$1" want="$2"
  if "$VITEST" run --reporter=verbose tests/w3decisions.test.ts >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
# tpl <id> <version> <old> <new>: replace a fragment of a template version's SQL (only when present, so a stale fragment leaves
# the version green → the check fails loudly).
tpl() { echo "UPDATE evidence.snapshot_template SET sql = replace(sql, \$p\$$3\$p\$, \$p\$$4\$p\$) WHERE id = '$1' AND version = $2 AND strpos(sql, \$p\$$3\$p\$) > 0;" >"$PLANT"; }
# 0033 added purchasing.deal_inputs v4 (the forecast run per outlet): taken back first, so 0026's own check (v3 the latest) judges
# the versions it wrote and names only the perturbation.
postconditions() { echo "DELETE FROM evidence.snapshot_template WHERE id = 'purchasing.deal_inputs' AND version = 4;"
  sed -n '/^-- 5. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0026')/assert_catalog('0038')/"; }
LVD="people.labour_vs_demand"
DI="purchasing.deal_inputs"

# (D1) a free model (price 0) refused.
echo "ALTER TABLE platform.model_role DROP CONSTRAINT model_role_price_nonnegative, ADD CONSTRAINT model_role_price_nonnegative CHECK (input_price_per_mtok_minor > 0 AND output_price_per_mtok_minor > 0);" >"$PLANT"
check d1-free "FAIL .*> D1 .* > munim_platform sets a price"
# (D1) a half-set price admitted.
echo "ALTER TABLE platform.model_role DROP CONSTRAINT model_role_price_all_or_none;" >"$PLANT"
check d1-half-set "FAIL .*> D1 .* > munim_platform sets a price"
# (D1) munim_svc may write the prices.
echo "GRANT UPDATE (input_price_per_mtok_minor, output_price_per_mtok_minor, price_currency) ON platform.model_role TO munim_svc;" >"$PLANT"
check d1-svc-write "FAIL .*> D1 .* > only munim_platform writes them"
# (D1) intel reads the prices.
echo "GRANT USAGE ON SCHEMA platform TO munim_intel_ro; GRANT SELECT ON platform.model_role TO munim_intel_ro;" >"$PLANT"
check d1-intel-read "FAIL .*> D1 .* > only munim_platform writes them"
# (D1) the database rewrites what a signed draft applies (a trigger clearing prices on a model change).
cat >"$PLANT" <<'SQL'
CREATE FUNCTION platform.redproof_clear_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.model_id IS DISTINCT FROM OLD.model_id THEN NEW.input_price_per_mtok_minor := NULL; NEW.output_price_per_mtok_minor := NULL; NEW.price_currency := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER redproof_clear_price BEFORE UPDATE ON platform.model_role FOR EACH ROW EXECUTE FUNCTION platform.redproof_clear_price();
SQL
check d1-rewrite "FAIL .*> D1 .* > as signed"
# (D1) a price invented in the seed.
echo "UPDATE platform.model_role SET input_price_per_mtok_minor = 15, output_price_per_mtok_minor = 0, price_currency = 'USD' WHERE role = 'embed';" >"$PLANT"
check d1-seeded "FAIL .*> D1 .* > the six 0015 roles carry no price"
# (D7) a column default stamps 95% on every new policy row (the world's row included).
echo "ALTER TABLE core.business_policy ALTER COLUMN negotiation_target_bp SET DEFAULT 9500;" >"$PLANT"
check d7-default "FAIL .*> D7 .* > the world's existing policy is unset"
# (D7) the target range gone.
echo "ALTER TABLE core.business_policy DROP CONSTRAINT business_policy_negotiation_target_check;" >"$PLANT"
check d7-range "FAIL .*> D7 .* > accepts 9000 / 12000"
# (D7) a target above the walk-away admitted when both are set.
echo "ALTER TABLE core.business_policy DROP CONSTRAINT business_policy_negotiation_order_check;" >"$PLANT"
check d7-order "FAIL .*> D7 .* > accepts 9000 / 12000"
# (D7) the policy row becomes updatable in place.
echo "GRANT UPDATE (negotiation_target_bp) ON core.business_policy TO munim_core;" >"$PLANT"
check d7-update "FAIL .*> D7 .* > only the owner's own policy command"
# (D6) the excess filled most expensive first → 16,500.
tpl "$LVD" 2 'ORDER BY a.rate, a.staff_id' 'ORDER BY a.rate DESC, a.staff_id'
check d6-desc "FAIL .*> D6 .* > hand values at outlet 3"
# (D6) the blended rate of everyone present (v1's rule) → 14,400.
tpl "$LVD" 2 'sum(least(w.mins, greatest(ex.excess - w.before, 0)) * w.rate) / 60' 'sum(w.mins * w.rate * ex.excess / nullif(ex.att, 0)) / 60'
check d6-blended "FAIL .*> D6 .* > hand values at outlet 3"
# (D6) the norm read across outlets → outlet 2 gets outlet 3's norm.
tpl "$LVD" 2 'WHERE b.outlet_id = h.outlet_id AND b.slot = h.slot' 'WHERE b.slot = h.slot'
check d6-merged-norm "FAIL .*> D6 .* > per outlet"
# (D6) the Σ rows last.
tpl "$LVD" 2 'ORDER BY r.grp, r.outlet_id' 'ORDER BY -r.grp, r.outlet_id'
check d6-sigma-last "FAIL .*> D6 .* > hand values at outlet 3"
# (D3) no SKU path → the SKU margins NULL.
tpl "$DI" 3 'UNION ALL SELECT sku.bp FROM sku' 'UNION ALL SELECT sku.bp FROM sku WHERE false'
check d3-no-sku "FAIL .*> D3 .* > hand values"
# (D3) the highest shelf price, not the lowest → 3,143.
tpl "$DI" 3 'SELECT min(CASE WHEN pk.inclusive THEN pr.amount_minor' 'SELECT max(CASE WHEN pk.inclusive THEN pr.amount_minor'
check d3-highest "FAIL .*> D3 .* > hand values"
# (D3) tax-inclusive prices not stripped → AU 4,545.
tpl "$DI" 3 "pr.amount_minor * 10000.0 / (10000 + coalesce((tc.c ->> 'rate_bp')::integer, 0))" 'pr.amount_minor * 1.0'
check d3-gross "FAIL .*> D3 .* > hand values"
# (D3) prices of outlets outside the run's scope → 2,000 for the outlet-1 run.
tpl "$DI" 3 'FROM core.price pr JOIN ou ON ou.id = pr.outlet_id' 'FROM core.price pr JOIN ou ON true'
check d3-scope "FAIL .*> D3 .* > hand values"
# (D3) price validity by the wall clock, not as_of → 2,727 at as_of 1 Mar.
tpl "$DI" 3 'pr.valid_from <= ou.today AND (pr.valid_to IS NULL OR pr.valid_to > ou.today)' 'pr.valid_from <= current_date AND (pr.valid_to IS NULL OR pr.valid_to > current_date)'
check d3-asof "FAIL .*> D3 .* > hand values"
# (D3) packaging judged on margin too.
tpl "$DI" 3 '(EXISTS (SELECT 1 FROM costed) OR EXISTS (SELECT 1 FROM sku)) AS margin_rule_applies' 'true AS margin_rule_applies'
check d3-applies "FAIL .*> D3 .* > hand values"
# (columns) a v3 column renamed in the SQL only.
tpl "$DI" 3 'AS margin_rule_applies' 'AS margin_applies'
check cols-renamed "FAIL .*> both new versions return exactly their declared columns"
# (post-conditions) 0026's own check, re-run after the all-or-none price check is dropped.
{ echo "ALTER TABLE platform.model_role DROP CONSTRAINT model_role_price_all_or_none;"; postconditions; } >"$PLANT"
check pc-d1-checks "0026: D1 platform.model_role prices not as written: checks"
# (post-conditions) re-run after a trigger appears on platform.model_role.
{ echo "CREATE TRIGGER redproof_touch BEFORE UPDATE ON platform.model_role FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();"; postconditions; } >"$PLANT"
check pc-d1-trigger "0026: D1 platform.model_role prices not as written: triggers"
# (post-conditions) re-run after a column default appears on a bound.
{ echo "ALTER TABLE core.business_policy ALTER COLUMN negotiation_walkaway_bp SET DEFAULT 11000;"; postconditions; } >"$PLANT"
check pc-d7-default "0026: D7 core.business_policy negotiation bounds not as written: columns"
# (post-conditions) re-run after v2 drifts to most-expensive-first.
{ echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'ORDER BY a.rate, a.staff_id', 'ORDER BY a.rate DESC, a.staff_id') WHERE id = '$LVD' AND version = 2;"
  postconditions; } >"$PLANT"
check pc-v2-sql "0026: template versions not as written: sql:people.labour_vs_demand"
# (post-conditions) re-run after v3 reads the wall clock once more.
{ echo "UPDATE evidence.snapshot_template SET sql = replace(sql, 'pr.valid_from <= ou.today', 'pr.valid_from <= current_date') WHERE id = '$DI' AND version = 3;"
  postconditions; } >"$PLANT"
check pc-v3-clock "0026: template versions not as written: sql:purchasing.deal_inputs"

# (worlds) RG-P2 priced most expensive first and the store's SKU path dropped → every m0026 world check red.
if node "$ROOT/db/tests/templates-worlds.ts" --plant=m0026 >"$OUT/worlds.log" 2>&1; then row FAIL worlds "red, but exited 0 ($OUT/worlds.log)"; fail=1
else
  n=$(grep -cE "^FAIL (restaurant_group|store) m0026 " "$OUT/worlds.log")
  others=$(grep -E "^FAIL " "$OUT/worlds.log" | grep -cvE "^FAIL (restaurant_group|store) m0026 ")
  if [ "$n" = 4 ] && [ "$others" = 0 ]; then row ok worlds "exit≠0; 4 m0026 checks red (3 RG-P2 + store), no other check"
  else row FAIL worlds "expected exactly the 4 m0026 checks red, got $n m0026 and $others other ($OUT/worlds.log)"; fail=1; fi
fi

echo "redproof-0026: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
