#!/usr/bin/env bash
# Red-proof of the 0028 gates (Munim Cares, ADR-015 §8 M-D). No flags (gotcha 17); run from anywhere:
#   db/tests/redproof-0028.sh
# Every gate is judged by a process exit code (gotcha 33), not by a test that expects its own failure. tests/cares-0028.test.ts
# and tests/mc1d.test.ts (the G2 binding cases of the Cares rules) must exit 0 clean. Per gate, a planted db/migrations/0038_redproof_plant.sql undoes what the gate checks; the file must
# then exit non-zero AND print a FAIL line naming the gate (or, for a post-condition plant, the migration's own refusal).
# The plant is removed after every run (and on exit). Do not run another suite while this runs: every global setup
# applies db/migrations, the plant included.
# Logs: scratchpad/redproof-0028/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/db/node_modules/.bin/vitest"
MIG="$ROOT/db/migrations/0028_cares.sql"
PLANT="$ROOT/db/migrations/0038_redproof_plant.sql"
OUT="$ROOT/scratchpad/redproof-0028"
TEST=tests/cares-0028.test.ts
MC1D=tests/mc1d.test.ts
mkdir -p "$OUT"
trap 'rm -f "$PLANT"' EXIT
cd "$ROOT/db"
fail=0
row() { printf '%-6s %-20s %s\n' "$1" "$2" "$3"; }

rm -f "$PLANT"
row RESULT PLANT EXPECT
if "$VITEST" run --reporter=verbose "$TEST" "$MC1D" >"$OUT/clean.log" 2>&1; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# name | the line (extended regex) that must appear in the red run's log | the test file (default the Cares gates)
check() {
  local name="$1" want="$2" file="${3:-$TEST}"
  if "$VITEST" run --reporter=verbose "$file" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; rm -f "$PLANT"; return; fi
  if grep -E "$want" "$OUT/$name.log" >/dev/null; then row ok "$name" "exit≠0; $(grep -m1 -E "$want" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-150)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1; fi
  rm -f "$PLANT"
}
postconditions() { sed -n '/^-- 15. Post-conditions/,$p' "$MIG" | sed "s/assert_catalog('0028')/assert_catalog('0038')/"; }
# Rewrites one function's body (it keeps its owner, ACL and settings); refuses if the text to cut is absent. The DO block
# is tagged $do$: an empty replacement renders $q$$q$, whose inner $$ would close a $$-quoted block.
redefine() {
  cat <<SQL
DO \$do\$
DECLARE
  f   regprocedure := '$1'::regprocedure;
  src text := (SELECT prosrc FROM pg_proc WHERE oid = f);
  def text := pg_get_functiondef(f);
BEGIN
  IF position(\$q\$$2\$q\$ IN src) = 0 THEN RAISE EXCEPTION 'plant does not apply'; END IF;
  EXECUTE replace(def, \$q\$$2\$q\$, \$q\$$3\$q\$);
END \$do\$;
SQL
}
# Rewrites one derivation rule's binding (rule, target, text to cut, replacement); refuses if the text is absent.
rebind() {
  cat <<SQL
DO \$do\$
BEGIN
  UPDATE core.derivation_rule SET binding = replace(binding, \$q\$$3\$q\$, \$q\$$4\$q\$)
   WHERE rule_id = '$1' AND target_table = '$2' AND position(\$q\$$3\$q\$ IN binding) > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'plant does not apply'; END IF;
END \$do\$;
SQL
}
G2="FAIL .*> G2 — a derived row must belong to its source \\(relaxed states\\) > per rule row"
LISTINGS='core.cares_network_listings(text,uuid,uuid,uuid,integer)'

# (BOOK) a Cares table untagged as a book.
echo "COMMENT ON TABLE core.cares_claim IS 'munim:operational';" >"$PLANT"
check book-tag "FAIL .*> BOOK .* > munim:book, RLS forced"
# (BOOK) RLS not forced on the listing table.
echo "ALTER TABLE core.cares_listing NO FORCE ROW LEVEL SECURITY;" >"$PLANT"
check book-noforce "FAIL .*> BOOK .* > munim:book, RLS forced"
# (BOOK) the customer deny policy dropped (the outlet policy admits shoppers; customer_scope is what denies them).
echo "DROP POLICY customer_scope ON core.cares_listing;" >"$PLANT"
check shopper-deny "FAIL .*> BOOK .* > shoppers"
# (SVC) munim_svc may write a Cares book.
echo "GRANT INSERT ON core.cares_listing TO munim_svc;" >"$PLANT"
check svc-write "FAIL .*> SVC .* > munim_svc: SELECT only"
# (SVC) intel may read a Cares platform table.
echo "GRANT USAGE ON SCHEMA platform TO munim_intel_ro; GRANT SELECT ON platform.cares_city TO munim_intel_ro;" >"$PLANT"
check intel-read "FAIL .*> SVC .* > munim_svc: SELECT only"
# (GUARD) the profile table's book_guard swapped for one that stamps origin and admits every write.
cat >"$PLANT" <<'SQL'
CREATE FUNCTION core.plant_open_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN NEW.origin := coalesce(NEW.origin, '{}'); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION core.plant_open_guard() FROM PUBLIC;
DROP TRIGGER book_guard ON core.cares_profile;
CREATE TRIGGER book_guard BEFORE INSERT OR UPDATE ON core.cares_profile FOR EACH ROW EXECUTE FUNCTION core.plant_open_guard();
SQL
check guard "FAIL .*> GUARD .* > no command → MB001"
# (GUARD) the listing status moves no longer pinned to their commands (a staff hand-over withdraws).
redefine 'core.cares_listing_rules()' "IF TG_OP = 'UPDATE' THEN" "IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF; IF false THEN" >"$PLANT"
check listing-moves "FAIL .*> GUARD — each Cares row operation belongs to one command > a staff hand-over closes a listing"
# (GUARD) a listing may be inserted under the hand-over command.
redefine 'core.cares_listing_rules()' "IF cmd IS DISTINCT FROM 'cares.listing.publish.v1' THEN" "IF cmd NOT IN ('cares.listing.publish.v1', 'cares.handover.record.v1') THEN" >"$PLANT"
check sibling-listing "FAIL .*> GUARD — each Cares row operation belongs to one command > inserts and moves under a sibling command"
# (GUARD) a claim may be inserted under the receive command.
redefine 'core.cares_claim_rules()' "IF cmd IS DISTINCT FROM 'cares.claim.create.v1' THEN" "IF cmd NOT IN ('cares.claim.create.v1', 'cares.claim.receive.v1') THEN" >"$PLANT"
check sibling-claim-ins "FAIL .*> GUARD — each Cares row operation belongs to one command > inserts and moves under a sibling command"
# (GUARD) a hand-over may be voided under the record command.
redefine 'core.cares_handover_rules()' "AND NOT (cmd = 'cares.handover.void.v1' AND NEW.status = 'voided')" "AND false" >"$PLANT"
check sibling-void "FAIL .*> GUARD — each Cares row operation belongs to one command > inserts and moves under a sibling command"
# (GUARD) a claim's status may move under any claim command.
redefine 'core.cares_claim_rules()' "IF NEW.status IS DISTINCT FROM OLD.status" "IF false" >"$PLANT"
check sibling-claim "FAIL .*> GUARD — each Cares row operation belongs to one command > inserts and moves under a sibling command"
# (GUARD) received_qty_milli may be set under create.
redefine 'core.cares_claim_line_rules()' "AND cmd IS DISTINCT FROM 'cares.claim.receive.v1'" "AND false" >"$PLANT"
check sibling-received "FAIL .*> GUARD — each Cares row operation belongs to one command > inserts and moves under a sibling command"
# (GUARD) the resolver reads only app.command_type: an approved draft (no own command) is refused.
cat >"$PLANT" <<'SQL'
CREATE OR REPLACE FUNCTION core.cares_command(tenant uuid) RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT nullif(current_setting('app.command_type', true), '')
$$;
SQL
check decision-path "FAIL .*> GUARD — each Cares row operation belongs to one command > an approved publish draft"
# (SUM) the Σ-per-listing-line bound gone.
echo "DROP TRIGGER cares_rules ON core.cares_handover_line;" >"$PLANT"
check sum-bound "FAIL .*> SUM, VOID, REV .* > Σ above the listing line"
# (VOID) a voided hand-over no longer final (book_status_transition alone never sees voided → voided).
cat >"$PLANT" <<'SQL'
CREATE OR REPLACE FUNCTION core.cares_handover_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN RETURN NEW; END $$;
SQL
check void-final "FAIL .*> SUM, VOID, REV .* > VOID: a second void"
# (REV) the void rule without its cumulative bound.
echo "UPDATE core.derivation_rule SET binding = \$b\$n.kind = 'cares_reversal' AND n.ref_type = 'core.cares_handover' AND n.ref_id = s.id AND n.outlet_id = s.outlet_id\$b\$ WHERE rule_id = 'inventory.cares_handover_void';" >"$PLANT"
check rev-cumulative "FAIL .*> SUM, VOID, REV .* > REV: donation out"
# (REV) the named sign CHECK gone (a positive donation is admitted).
echo "ALTER TABLE core.stock_movement DROP CONSTRAINT stock_movement_sign_check;" >"$PLANT"
check stock-sign "FAIL .*> SUM, VOID, REV .* > REV: donation out"
# (ALLOC) one accepted claim per offer: the partial unique index gone.
echo "DROP INDEX core.cares_allocation_one_accepted;" >"$PLANT"
check alloc-unique "FAIL .*> ALLOC, RECV .* > ALLOC: one accepted claim per offer"
# (RECV) received_qty_milli no longer write-once.
echo "DROP TRIGGER cares_rules ON core.cares_claim_line;" >"$PLANT"
check recv-once "FAIL .*> ALLOC, RECV .* > RECV \\(A offers"
# (DEF) munim_svc may run a definer read.
echo "GRANT EXECUTE ON FUNCTION core.cares_market_offers(uuid) TO munim_svc;" >"$PLANT"
check def-svc-exec "FAIL .*> DEF .* > owner munim_crosstenant"
# (DEF) munim_crosstenant may read a price column.
echo "GRANT SELECT (total_minor) ON core.cares_claim TO munim_crosstenant;" >"$PLANT"
check def-columns "FAIL .*> DEF .* > munim_crosstenant: exactly the"
# (DEF) the network shows a judge tenant's listing.
redefine 'core.cares_network_listings(text,uuid,uuid,uuid,integer)' "AND NOT EXISTS (SELECT 1 FROM core.membership j WHERE j.tenant_id = l.tenant_id AND j.role = 'judge' AND j.active)" "" >"$PLANT"
check def-judge "FAIL .*> DEF .* > network listings: exactly the 1 live donation"
# (DEF) the network shows a paused business's listing.
redefine 'core.cares_network_listings(text,uuid,uuid,uuid,integer)' "pr.status = 'active'" "true" >"$PLANT"
check def-paused "FAIL .*> DEF .* > network listings: exactly the 1 live donation"
# (DEF) market offers trust any member id (forged member → rows).
redefine 'core.cares_market_offers(uuid)' "AND ms.member_id = nullif(current_setting('app.member_id', true), '')::uuid" "" >"$PLANT"
check def-forged "FAIL .*> DEF .* > market offers"
# (DEF) inbound claims without the outlet-coverage rule (staff of another outlet → rows).
redefine 'core.cares_inbound_claims(uuid)' "AND (l.outlet_id = ANY (ms.outlet_ids) OR (cardinality(ms.outlet_ids) = 0 AND ms.role IN ('owner', 'judge')))" "" >"$PLANT"
check def-staff-out "FAIL .*> DEF .* > inbound claims"
# (DEF) claim outcome without the caller's tenant (a non-party owner sees the buyer's outcome through its own membership).
{ redefine 'core.cares_claim_outcome(uuid)' "ms.tenant_id = c.tenant_id AND " ""
  redefine 'core.cares_claim_outcome(uuid)' "c.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND " ""; } >"$PLANT"
check def-nonparty "FAIL .*> DEF .* > claim outcome"
# (DEF) network impact without the operator identity (a forged operator id → rows).
redefine 'core.cares_network_impact(date,date,text)' "x.id = nullif(current_setting('app.operator_id', true), '')::uuid AND " "" >"$PLANT"
check def-operator "FAIL .*> DEF .* > network impact"
# (TPL) the definer-reference CHECK case-sensitive again (an upper-case call slips through).
echo "ALTER TABLE evidence.snapshot_template DROP CONSTRAINT snapshot_template_cares_definers, ADD CONSTRAINT snapshot_template_cares_definers CHECK (sql !~ 'cares_(network_listings|market_offers|inbound_claims|claim_outcome|network_impact)' OR (id ~ '^platform\.' AND min_role = 'operator'));" >"$PLANT"
check tpl-case "FAIL .*> TPL .* > only an operator platform"
# (TPL) a member template may call a definer function.
echo "ALTER TABLE evidence.snapshot_template DROP CONSTRAINT snapshot_template_cares_definers;" >"$PLANT"
check tpl-definers "FAIL .*> TPL .* > only an operator platform"
# (REC) a non-simulated recipient admitted.
echo "ALTER TABLE platform.cares_recipient DROP CONSTRAINT cares_recipient_simulated_check;" >"$PLANT"
check rec-simulated "FAIL .*> REC .* > simulated = false"
# (REC) a recipient named without "(simulated)" admitted.
echo "ALTER TABLE platform.cares_recipient DROP CONSTRAINT cares_recipient_name_simulated_check;" >"$PLANT"
check rec-name "FAIL .*> REC .* > simulated = false"
# (NET) a network snapshot published twice / by any draft.
echo "DROP TRIGGER snapshot_rules ON platform.network_snapshot;" >"$PLANT"
check net-once "FAIL .*> NET .* > snapshot: operator template only"

# ---- fix cycle fx-md ----------------------------------------------------------------------------------------------
# (1) the hand-over movement no longer pinned to the ingredient's base unit: 0.2 kg + 199.8 g pass against a 200 g line.
rebind inventory.cares_handover core.stock_movement "n.unit = (SELECT g.base_unit FROM core.ingredient g WHERE g.tenant_id = s.tenant_id AND g.id = n.ingredient_id) AND " "" >"$PLANT"
check unit-base-g2 "$G2" "$MC1D"
rebind inventory.cares_handover core.stock_movement "n.unit = (SELECT g.base_unit FROM core.ingredient g WHERE g.tenant_id = s.tenant_id AND g.id = n.ingredient_id) AND " "" >"$PLANT"
check unit-base-pair "FAIL .*> SUM, VOID, REV .* > REV units"
# (1) the receive's cumulative sums across units again (a g line's allowance pays for a second kg).
{ rebind inventory.cares_claim_receive core.stock_movement "m.kind = 'surplus_in' AND m.unit = n.unit AND" "m.kind = 'surplus_in' AND"
  rebind inventory.cares_claim_receive core.stock_movement "cl.ingredient_id = n.ingredient_id AND cl.unit = n.unit)" "cl.ingredient_id = n.ingredient_id)"; } >"$PLANT"
check unit-receive "$G2" "$MC1D"
# (2) the receive's batch may be an UPDATE of an existing batch / carry an MRP / a supplier; transfer_in's likewise an UPDATE.
rebind inventory.cares_claim_receive core.batch "o.id IS NULL AND " "" >"$PLANT"
check receive-batch-insert "$G2" "$MC1D"
rebind inventory.cares_claim_receive core.batch "n.mrp_minor IS NULL AND " "" >"$PLANT"
check receive-batch-mrp "$G2" "$MC1D"
rebind inventory.cares_claim_receive core.batch "n.supplier_id IS NULL AND " "" >"$PLANT"
check receive-batch-supplier "$G2" "$MC1D"
rebind inventory.cares_claim_receive core.batch "n.grn_line_id IS NULL AND " "" >"$PLANT"
check receive-batch-grn "$G2" "$MC1D"
rebind inventory.transfer_in core.batch "o.id IS NULL AND " "" >"$PLANT"
check transfer-batch-insert "$G2" "$MC1D"
# (3) the publish's draft may target another snapshot.
redefine 'platform.network_snapshot_rules()' "AND d.target = 'cares_public_impact:' || NEW.id::text" "" >"$PLANT"
check net-target "FAIL .*> NET .* > snapshot: operator template only"
# (3) a proposed (never approved) draft publishes.
redefine 'platform.cares_draft_applied()' "AND d.status = 'applied' AND d.decided_at = now()" "AND d.status IN ('proposed', 'applied')" >"$PLANT"
check net-applied "FAIL .*> NET .* > snapshot: operator template only"
# (3) the snapshot's deferred check gone.
echo "DROP TRIGGER draft_applied ON platform.network_snapshot;" >"$PLANT"
check net-deferred "FAIL .*> NET .* > snapshot: operator template only"
# (3) an old applied draft may be replayed onto a later enablement write.
redefine 'platform.cares_draft_applied()' "AND d.decided_at = now()" "" >"$PLANT"
check enable-replay "FAIL .*> NET .* > enablement: written only"
# (3) an enablement may cite another tenant's draft.
redefine 'platform.cares_enablement_rules()' "AND d.target = 'cares_enablement:' || NEW.tenant_id::text" "" >"$PLANT"
check enable-target "FAIL .*> NET .* > enablement: written only"
# (3) the enablement's deferred check gone (a proposed draft enables).
echo "DROP TRIGGER draft_applied ON platform.cares_enablement;" >"$PLANT"
check enable-deferred "FAIL .*> NET .* > enablement: written only"
# (4) a hand-over command closes a listing with no hand-over in its transaction.
redefine 'core.cares_listing_rules()' "IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'closed'" "IF false" >"$PLANT"
check close-needs-handover "FAIL .*> GUARD — each Cares row operation belongs to one command > a staff hand-over closes a listing"
# (5) the line no longer re-reads the listing's status under the lock (a withdraw between header and line slips through).
redefine 'core.cares_handover_line_bound()' "IF (l_kind, l_status) IS DISTINCT FROM ('donation', 'published') AND (l_kind, l_status) IS DISTINCT FROM ('offer', 'allocated') THEN" "IF false THEN" >"$PLANT"
check handover-reread "FAIL .*> SUM, VOID, REV .* > a withdraw committed between"
# (Σ) the listing row lock gone: two concurrent hand-overs both commit.
redefine 'core.cares_handover_line_bound()' "WHERE l.tenant_id = NEW.tenant_id AND l.id = h_listing FOR UPDATE;" "WHERE l.tenant_id = NEW.tenant_id AND l.id = h_listing;" >"$PLANT"
check handover-lock "FAIL .*> SUM, VOID, REV .* > two concurrent hand-overs"
# (6) the network total computed under a tenant context.
redefine 'core.cares_network_impact(date,date,text)' "AND nullif(current_setting('app.tenant_id', true), '') IS NULL" "" >"$PLANT"
check impact-tenant "FAIL .*> DEF .* > network impact"
# (7) a claim received with no allocation.
echo "ALTER TABLE core.cares_claim DROP CONSTRAINT cares_claim_received_allocation;" >"$PLANT"
check recv-allocation-check "FAIL .*> ALLOC, RECV .* > RECV \\(A offers"
# (7) received_qty_milli no longer the handed qty.
redefine 'core.cares_claim_line_rules()' "AND (x ->> 'handed_qty_milli')::bigint = NEW.received_qty_milli" "" >"$PLANT"
check recv-handed "FAIL .*> ALLOC, RECV .* > RECV \\(A offers"
# (7) the claim's allocation_id any uuid.
redefine 'core.cares_claim_rules()' "AND NOT EXISTS (SELECT 1 FROM core.cares_claim_outcome(NEW.id) o WHERE o.verdict = 'accepted' AND o.allocation_id = NEW.allocation_id)" "AND false" >"$PLANT"
check recv-alloc-outcome "FAIL .*> ALLOC, RECV .* > RECV \\(A offers"
# (8) the outcome reads a donation's status; a non-b2b offerer's status.
redefine 'core.cares_claim_outcome(uuid)' "AND l.kind = 'offer'" "" >"$PLANT"
check outcome-kind "FAIL .*> DEF .* > claim outcome"
redefine 'core.cares_claim_outcome(uuid)' "AND pr.status = 'active' AND pr.b2b_enabled" "AND pr.status = 'active'" >"$PLANT"
check outcome-b2b "FAIL .*> DEF .* > claim outcome"
# (9) each actor column unbound from the signed-in member.
redefine 'core.cares_listing_rules()' "IF NEW.published_by::text" "IF false AND NEW.published_by::text" >"$PLANT"
check actor-published "FAIL .*> GUARD .* > actor columns"
redefine 'core.cares_handover_rules()' "IF NEW.recorded_by::text" "IF false AND NEW.recorded_by::text" >"$PLANT"
check actor-recorded "FAIL .*> GUARD .* > actor columns"
redefine 'core.cares_handover_rules()' "IF NEW.status = 'voided' AND NEW.voided_by::text" "IF false AND NEW.voided_by::text" >"$PLANT"
check actor-voided "FAIL .*> GUARD .* > actor columns"
redefine 'core.cares_claim_rules()' "IF NEW.created_by::text" "IF false AND NEW.created_by::text" >"$PLANT"
check actor-created "FAIL .*> GUARD .* > actor columns"
redefine 'core.cares_allocation_rules()' "IF NEW.decided_by::text" "IF false AND NEW.decided_by::text" >"$PLANT"
check actor-decided "FAIL .*> GUARD .* > actor columns"
# (10) a cooked line published through an approved draft.
redefine 'core.cares_listing_line_rules()' "IF NEW.food_kind = 'cooked' AND core.cares_decision_command(NEW.tenant_id) IS NOT NULL THEN" "IF false THEN" >"$PLANT"
check cooked-draft "FAIL .*> GUARD .* > an approved publish draft"
# (11) an accepted allocation of a withdrawn offer.
redefine 'core.cares_allocation_rules()' "OR (NEW.verdict = 'accepted' AND l_status IS DISTINCT FROM 'published')" "" >"$PLANT"
check alloc-published "FAIL .*> ROWS .* > a hand-over of a withdrawn donation"
# (12) and the network filters: a retired recipient, a retired tenant, enablement off, a withdrawn or an expired listing shown.
redefine "$LISTINGS" "AND rc.simulated AND rc.status = 'active'" "AND rc.simulated" >"$PLANT"
check net-recipient "FAIL .*> DEF .* > network listings: exactly the 1 live donation"
redefine "$LISTINGS" "JOIN core.tenant t ON t.tenant_id = l.tenant_id AND t.status = 'active'" "JOIN core.tenant t ON t.tenant_id = l.tenant_id" >"$PLANT"
check net-retired "FAIL .*> DEF .* > network listings: exactly the 1 live donation"
redefine "$LISTINGS" "JOIN platform.cares_enablement en ON en.tenant_id = l.tenant_id AND en.enabled" "JOIN platform.cares_enablement en ON en.tenant_id = l.tenant_id" >"$PLANT"
check net-enablement "FAIL .*> DEF .* > network listings: exactly the 1 live donation"
redefine "$LISTINGS" "l.status = 'published' AND l.pickup_to > now()" "l.status IN ('published', 'withdrawn') AND l.pickup_to > now()" >"$PLANT"
check net-withdrawn "FAIL .*> DEF .* > network listings: exactly the 1 live donation"
redefine "$LISTINGS" "AND l.pickup_to > now()" "" >"$PLANT"
check net-expired "FAIL .*> DEF .* > network listings: exactly the 1 live donation"
# (market) the offerer's / the caller's b2b flag ignored.
redefine 'core.cares_market_offers(uuid)' "pr.tenant_id = l.tenant_id AND pr.status = 'active' AND pr.b2b_enabled" "pr.tenant_id = l.tenant_id AND pr.status = 'active'" >"$PLANT"
check market-offerer-b2b "FAIL .*> DEF .* > market offers"
redefine 'core.cares_market_offers(uuid)' "pr.tenant_id = ms.tenant_id AND pr.status = 'active' AND pr.b2b_enabled" "pr.tenant_id = ms.tenant_id AND pr.status = 'active'" >"$PLANT"
check market-caller-b2b "FAIL .*> DEF .* > market offers"
# (post-conditions) re-run after the base-unit pin is cut / the received-allocation CHECK dropped.
{ rebind inventory.cares_handover core.stock_movement "n.unit = (SELECT g.base_unit FROM core.ingredient g WHERE g.tenant_id = s.tenant_id AND g.id = n.ingredient_id) AND " ""; postconditions; } >"$PLANT"
check pc-bindings "0028: Munim Cares not as written: bindings"
{ echo "ALTER TABLE core.cares_claim DROP CONSTRAINT cares_claim_received_allocation;"; postconditions; } >"$PLANT"
check pc-claim-check "0028: Munim Cares not as written: claim-check"

# (post-conditions) 0028's own check, re-run after munim_core gains UPDATE on a listing's kind.
{ echo "GRANT UPDATE (kind) ON core.cares_listing TO munim_core;"; postconditions; } >"$PLANT"
check pc-core-update "0028: Munim Cares not as written: core-update:core.cares_listing"
# (post-conditions) re-run after an index is re-created under its name with other columns (gotcha 1).
{ echo "DROP INDEX core.cares_claim_offer_idx; CREATE INDEX cares_claim_offer_idx ON core.cares_claim (offer_listing_id);"; postconditions; } >"$PLANT"
check pc-index "0028: Munim Cares not as written: index:cares_claim_offer_idx"
# (post-conditions) re-run after munim_crosstenant gains a cost column.
{ echo "GRANT SELECT (unit_cost_minor) ON core.stock_movement TO munim_crosstenant;"; postconditions; } >"$PLANT"
check pc-crosstenant "0028: Munim Cares not as written: crosstenant-columns"
# (post-conditions) re-run after a definer becomes callable by munim_svc.
{ echo "GRANT EXECUTE ON FUNCTION core.cares_inbound_claims(uuid) TO munim_svc;"; postconditions; } >"$PLANT"
check pc-definer "0028: Munim Cares not as written: definer:core.cares_inbound_claims"
# (post-conditions) re-run after the voided-final trigger is disabled.
{ echo "ALTER TABLE core.cares_handover DISABLE TRIGGER cares_rules;"; postconditions; } >"$PLANT"
check pc-trigger "0028: Munim Cares not as written: trigger:core.cares_handover.cares_rules"

echo "redproof-0028: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
