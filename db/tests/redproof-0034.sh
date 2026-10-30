#!/usr/bin/env bash
# Red-proof of the 0034 gates (T-128: the storefront page books; R67 the demo campaign "recorded as sent" command). No flags
# (gotcha 17); run from anywhere:
#   db/tests/redproof-0034.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure.
# tests/storefront-page-0034.test.ts must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the
# gate checks; the file must then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the
# migration's own refusal). The plant is removed after every run (and on exit). It writes into db/migrations of the tree it
# runs in: run it in a scratch copy, and run no other suite there meanwhile (every global setup applies db/migrations, the
# plant included). Logs: scratchpad/redproof-0034/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0034_t128_storefront_page_campaign_sent.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0034"
TEST=tests/storefront-page-0034.test.ts
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
postconditions() { sed -n '/^-- 6. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0034')/assert_catalog('0038')/"; }
A="UPDATE core.command_authority SET"

# (P) the save at outlet scope: a single-outlet manager may then write the tenant-level page.
echo "$A scope = 'outlet' WHERE command_type = 'storefront.page.save.v1';" >"$PLANT"
check p-scope "FAIL .*> P who writes the storefront page > save"
# (P) staff listed for the save.
echo "$A allowed_roles = allowed_roles || 'staff'::text WHERE command_type = 'storefront.page.save.v1';" >"$PLANT"
check p-staff "FAIL .*> P who writes the storefront page > save"
# (P) a manager may publish.
echo "$A allowed_roles = allowed_roles || 'manager'::text WHERE command_type = 'storefront.page.publish.v1';" >"$PLANT"
check p-publish "FAIL .*> P who writes the storefront page > publish"
# (P) an UPDATE grant: a saved version could be rewritten in place.
echo "GRANT UPDATE ON core.storefront_page_version TO munim_core;" >"$PLANT"
check p-update "FAIL .*> P who writes the storefront page > insert-only"
# (R) an open shopper read of the versions (unpublished drafts would show).
{ echo "DROP POLICY customer_scope ON core.storefront_page_version;";
  echo "CREATE POLICY customer_scope ON core.storefront_page_version AS RESTRICTIVE FOR ALL USING (true);"; } >"$PLANT"
check r-open "FAIL .*> R who reads it > a shopper"
# (R) no guest policy: a guest token reads the tenant's page rows.
echo "DROP POLICY guest_scope ON core.storefront_page_publish; DROP POLICY guest_scope ON core.storefront_page_version;" >"$PLANT"
check r-guest "FAIL .*> R who reads it > a shopper"
# (R) tenant isolation widened (gotcha 22: widened, not dropped).
{ echo "DROP POLICY tenant_isolation ON core.storefront_page_version;";
  echo "CREATE POLICY tenant_isolation ON core.storefront_page_version USING (true);"; } >"$PLANT"
check r-tenant "FAIL .*> R who reads it > the owner sees"
# (A3) a manager may record a campaign as sent.
echo "$A allowed_roles = allowed_roles || 'manager'::text WHERE command_type = 'customers.campaign.record_sent.v1';" >"$PLANT"
check a3-manager "FAIL .*> A3 recording a campaign as sent"
# (A3) sent may go back to queued.
echo "INSERT INTO core.book_status_transition (table_name, from_status, to_status) VALUES ('core.campaign', 'sent', 'queued');" >"$PLANT"
check a3-back "FAIL .*> A3 recording a campaign as sent > queued"
# (post-conditions) 0034's own check, re-run after each perturbation.
{ echo "GRANT SELECT ON core.storefront_page_version TO munim_svc;"; postconditions; } >"$PLANT"
check pc-svc "0034: not as written: .*others:munim_svc"
{ echo "$A draft_only = true WHERE command_type = 'storefront.page.publish.v1';"; postconditions; } >"$PLANT"
check pc-draft "0034: not as written: .*authority:storefront.page.publish.v1"
{ echo "DROP INDEX core.storefront_page_publish_page_id_fk_idx; CREATE INDEX storefront_page_publish_page_id_fk_idx ON core.storefront_page_publish (tenant_id, published_at);"; postconditions; } >"$PLANT"
check pc-index "0034: not as written: .*fk-index:storefront_page_publish_page_id_fk_idx"

echo "redproof-0034: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
