#!/usr/bin/env bash
# Red-proof of the 0029 gates (T-099: storefront display text, outlet phone, the network listing's outlet_tz). No flags
# (gotcha 17); run from anywhere:
#   db/tests/redproof-0029.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/storefront-0029.test.ts (and tests/cares-0028.test.ts, whose network test judges the re-created function's filters)
# must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must
# then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the migration's own refusal).
# The plant is removed after every run (and on exit). It writes into db/migrations of the tree it runs in: run it in a
# scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the plant included).
# Logs: scratchpad/redproof-0029/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0029_storefront_display.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0029"
TEST=tests/storefront-0029.test.ts
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-18s %s\n' "$1" "$2" "$3"; }

rm -f "$PLANT"
row RESULT PLANT EXPECT
NET_TEST=tests/cares-0028.test.ts
for t in "$TEST" "$NET_TEST"; do
  if "$VITEST" run --reporter=verbose "$t" >"$OUT/clean-$(basename "$t" .ts).log" 2>&1; then row ok clean "$t exit 0"; else row FAIL clean "$t exit 0 (see $OUT)"; fail=1; fi
done

# name | the line (extended regex) that must appear in the red run's log | the test file (default $TEST)
check() {
  local name="$1" want="$2" file="${3:-$TEST}"
  if "$VITEST" run --reporter=verbose "$file" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
# 0030 added `position` to munim_core's UPDATE lists on three of the five tables: taken back first, so 0029's own check judges
# the grants it wrote and names only the perturbation.
postconditions() { echo "REVOKE UPDATE (position) ON core.variant, core.option_group, core.option FROM munim_core;"
  sed -n '/^-- 4. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0029')/assert_catalog('0038')/"; }

# (D1) the diet list gone: 'meat' admitted.
echo "ALTER TABLE core.item DROP CONSTRAINT item_diet_check;" >"$PLANT"
check d1-diet "FAIL .*> D1 .* > CHECKs"
# (D1) the display-name length bound gone on core.variant: '' admitted.
echo "ALTER TABLE core.variant DROP CONSTRAINT variant_display_name_check;" >"$PLANT"
check d1-variant-len "FAIL .*> D1 .* > CHECKs"
# (D1) munim_core loses UPDATE on core.option.display_name: the owner's upsert is refused (42501).
echo "REVOKE UPDATE (display_name) ON core.option FROM munim_core;" >"$PLANT"
check d1-grant "FAIL .*> D1 .* > owner upsert writes all four tables"
# (D2) the E.164 CHECK gone: '12345' admitted.
echo "ALTER TABLE core.outlet DROP CONSTRAINT outlet_phone_check;" >"$PLANT"
check d2-phone "FAIL .*> D2 core.outlet.phone"
# (GUARD) a trigger that runs before book_guard and names the upsert command: a write with no command is admitted.
# (Disabling book_guard itself cannot be planted: the guard also stamps origin, so the world could not be built.)
cat >"$PLANT" <<'SQL'
CREATE FUNCTION core.redproof_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('app.command_type', 'catalogue.item.upsert.v1', true); RETURN NEW; END $$;
CREATE TRIGGER aaa_redproof BEFORE UPDATE ON core.item FOR EACH ROW EXECUTE FUNCTION core.redproof_command();
SQL
check guard-no-cmd "FAIL .*> GUARD .* > no command"
# (GUARD) another command (orders.place.v1) may write core.item.
echo "UPDATE core.command_authority SET target_tables = target_tables || 'core.item'::text WHERE command_type = 'orders.place.v1';" >"$PLANT"
check guard-other-cmd "FAIL .*> GUARD .* > no command"
# (G) munim_svc may write display text.
echo "GRANT UPDATE (display_name) ON core.item TO munim_svc;" >"$PLANT"
check g-svc "FAIL .*> G privileges .* > munim_svc and munim_intel_ro cannot write"
# (G) munim_intel_ro may read display text.
echo "GRANT SELECT (display_name) ON core.item TO munim_intel_ro;" >"$PLANT"
check g-intel-read "FAIL .*> G privileges .* > munim_svc and munim_intel_ro cannot write"
# (G) an extra munim_core UPDATE column (kind, which 0004 never granted).
echo "GRANT UPDATE (kind) ON core.item TO munim_core;" >"$PLANT"
check g-core-list "FAIL .*> G privileges .* > munim_core UPDATE lists, exactly"
# (ISO) a permissive USING (true) policy on core.item (gotcha 22: a dropped policy would stay deny-all).
echo "CREATE POLICY redproof_leak ON core.item FOR SELECT TO munim_core USING (true);" >"$PLANT"
check iso-leak "FAIL .*> ISO .* > tenant B"
# (X1) munim_crosstenant loses SELECT (tz): the network read fails.
echo "REVOKE SELECT (tz) ON core.outlet FROM munim_crosstenant;" >"$PLANT"
check x1-tz-grant "FAIL .*> X1 .* > a live donation at outlet 1"
# (X1) outlet_tz is not the outlet's zone.
cat >"$PLANT" <<'SQL'
DO $$
DECLARE src text := (SELECT prosrc FROM pg_proc WHERE oid = 'core.cares_network_listings(text, uuid, uuid, uuid, integer)'::regprocedure);
BEGIN
  IF position(E'),\n         o.tz\n' IN src) = 0 THEN RAISE EXCEPTION 'plant does not apply'; END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION core.cares_network_listings(p_city text, p_tenant uuid, p_listing uuid, p_after uuid, p_limit integer)
    RETURNS TABLE (listing_id uuid, city_code text, business_name text, outlet_name text, pickup_from timestamptz, pickup_to timestamptz,
                   recipient_name text, recipient_simulated boolean, lines jsonb, outlet_tz text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS %L$f$, replace(src, E'),\n         o.tz\n', E'),\n         ''Etc/UTC''::text\n'));
END $$;
SQL
check x1-wrong-tz "FAIL .*> X1 .* > a live donation at outlet 1"
# (X1) each filter of the re-created function, dropped one at a time (an exact substring of its 0029 body; a plant that does
# not apply raises, the setup fails and no FAIL line names the gate): the network test must then list a hidden listing.
filter_plant() {
  cat >"$PLANT" <<SQL
DO \$plant\$
DECLARE src text := (SELECT prosrc FROM pg_proc WHERE oid = 'core.cares_network_listings(text, uuid, uuid, uuid, integer)'::regprocedure);
BEGIN
  IF position(\$o\$$1\$o\$ IN src) = 0 THEN RAISE EXCEPTION 'plant does not apply'; END IF;
  EXECUTE format(\$f\$CREATE OR REPLACE FUNCTION core.cares_network_listings(p_city text, p_tenant uuid, p_listing uuid, p_after uuid, p_limit integer)
    RETURNS TABLE (listing_id uuid, city_code text, business_name text, outlet_name text, pickup_from timestamptz, pickup_to timestamptz,
                   recipient_name text, recipient_simulated boolean, lines jsonb, outlet_tz text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS %L\$f\$, replace(src, \$o\$$1\$o\$, \$n\$$2\$n\$));
END \$plant\$;
SQL
}
NET_FAIL="FAIL .*> DEF .* > network listings: exactly the 1 live donation"
filter_plant "JOIN core.tenant t ON t.tenant_id = l.tenant_id AND t.status = 'active'" "JOIN core.tenant t ON t.tenant_id = l.tenant_id"
check x1-retired "$NET_FAIL" "$NET_TEST"
filter_plant "
     AND NOT EXISTS (SELECT 1 FROM core.membership j WHERE j.tenant_id = l.tenant_id AND j.role = 'judge' AND j.active)" ""
check x1-judge "$NET_FAIL" "$NET_TEST"
filter_plant "JOIN platform.cares_enablement en ON en.tenant_id = l.tenant_id AND en.enabled" "JOIN platform.cares_enablement en ON en.tenant_id = l.tenant_id"
check x1-not-enabled "$NET_FAIL" "$NET_TEST"
filter_plant "JOIN core.cares_profile pr ON pr.tenant_id = l.tenant_id AND pr.status = 'active'" "JOIN core.cares_profile pr ON pr.tenant_id = l.tenant_id"
check x1-paused "$NET_FAIL" "$NET_TEST"
filter_plant "rc.simulated AND rc.status = 'active'" "rc.simulated"
check x1-inactive-rcpt "$NET_FAIL" "$NET_TEST"
filter_plant "l.status = 'published'" "l.status IN ('published', 'withdrawn')"
check x1-withdrawn "$NET_FAIL" "$NET_TEST"
filter_plant " AND l.pickup_to > now()" ""
check x1-expired "$NET_FAIL" "$NET_TEST"
# (No plant for l.kind = 'donation' alone: an offer has no recipient, so the inner join on platform.cares_recipient hides
# it too — measured, the plant stayed green. Both would have to go for an offer to show.)
# (X1) an extra core.outlet column for munim_crosstenant.
echo "GRANT SELECT (address) ON core.outlet TO munim_crosstenant;" >"$PLANT"
check x1-extra-col "FAIL .*> X1 .* > munim_crosstenant reads exactly"
# (post-conditions) 0029's own check, re-run after each perturbation.
{ echo "ALTER TABLE core.item DROP CONSTRAINT item_diet_check, ADD CONSTRAINT item_diet_check CHECK (diet IN ('veg', 'non_veg', 'egg', 'vegan', 'meat'));"; postconditions; } >"$PLANT"
check pc-checks "0029: storefront display columns not as written: checks"
{ echo "GRANT UPDATE (kind) ON core.item TO munim_core;"; postconditions; } >"$PLANT"
check pc-core-update "0029: storefront display columns not as written: core-update:core.item"
{ echo "GRANT SELECT (phone) ON core.outlet TO munim_intel_ro;"; postconditions; } >"$PLANT"
check pc-others "0029: storefront display columns not as written: others:munim_intel_ro.core.outlet:phone"
{ echo "ALTER TABLE core.option NO FORCE ROW LEVEL SECURITY;"; postconditions; } >"$PLANT"
check pc-rls "0029: storefront display columns not as written: rls:option"
{ echo "GRANT EXECUTE ON FUNCTION core.cares_network_listings(text, uuid, uuid, uuid, integer) TO munim_svc;"; postconditions; } >"$PLANT"
check pc-definer "0029: storefront display columns not as written: definer"
{ echo "GRANT SELECT (address) ON core.outlet TO munim_crosstenant;"; postconditions; } >"$PLANT"
check pc-crosstenant "0029: storefront display columns not as written: crosstenant-outlet"
{ echo "ALTER TABLE core.variant ALTER COLUMN description SET DEFAULT 'x';"; postconditions; } >"$PLANT"
check pc-columns "0029: storefront display columns not as written: columns"

echo "redproof-0029: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
