#!/usr/bin/env bash
# Red-proof of the W2 integration suite (R1-M4, R3-m6/m7). No flags (gotcha 17); run from anywhere:
#   tests/integration/redproof.sh
# 1. The clean suite must exit 0.
# 2. Per flow, one derivation switched off on its clone (MUNIM_INT_PLANT=rule:<id>, harness.ts: a BEFORE trigger
#    silently drops every row written under that rule) — the flow must exit non-zero on a failed assertion.
#    Flows with no derivation get a scan plant instead (price-draft, people-hours).
# 3. Every clause-1 branch planted into a real flow (MUNIM_INT_PLANT=scan:<branch>, guarantee.ts plant()) — the flow
#    must exit non-zero AND its output must name that branch's finding.
# Judged by the process exit code (gotcha 33), never by a "failed" line alone. Prints a table; exits 1 if the clean
# pass failed, any plant stayed green / went red for another reason, or a plant's file was already red (INCONC). Logs: $OUT (git-ignored scratch).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VITEST="$ROOT/services/core-api/node_modules/.bin/vitest"
CONFIG="$ROOT/tests/integration/vitest.config.ts"
OUT="$ROOT/scratchpad/redproof-integration"
mkdir -p "$OUT"
cd "$ROOT"
fail=0
row() { printf '%-6s %-34s %-48s %s\n' "$1" "$2" "$3" "$4"; }

run() { # name plant [file] → exit code; output in $OUT/<name>.log
  MUNIM_INT_PLANT="$2" "$VITEST" run --config "$CONFIG" ${3:+"$3"} >"$OUT/$1.log" 2>&1
}

row RESULT FLOW PLANT EXPECT
if run clean ""; then row ok "(all flows)" "none" "exit 0"; else row FAIL "(all flows)" "none" "exit 0 (see $OUT/clean.log)"; fail=1; fi
# Files already red without a plant: a plant there proves nothing (reported INCONCLUSIVE, never ok).
RED_CLEAN="$(grep -oE 'FAIL +[a-z0-9-]+\.test\.ts' "$OUT/clean.log" | awk '{print $2}' | sort -u | tr '\n' ' ')"

# flow file | plant | what the failure must show (extended regex)
PLANTS=(
  "counter-sale.test.ts|rule:finance.post_order|AssertionError"
  "storefront.test.ts|rule:customers.loyalty_earn|AssertionError"
  "onboarding.test.ts|rule:finance.post_tender|AssertionError"
  "purchasing.test.ts|rule:finance.post_grn|AssertionError"
  "import-settlement.test.ts|rule:finance.post_settlement|AssertionError"
  "order-changes.test.ts|rule:orders.reprice|AssertionError"
  "override.test.ts|rule:inventory.consume_sku|AssertionError"
  "accounts-erasure.test.ts|rule:customers.merge_verified_email|AssertionError"
  "import-history.test.ts|rule:inventory.record_waste|AssertionError"
  "import-history.test.ts|rule:finance.post_refund|AssertionError"
  "import-history.test.ts|scan:decision_unaudited|not audited by the transaction that wrote it"
  "price-draft.test.ts|scan:decision_unaudited|not audited by the transaction that wrote it"
  "people-hours.test.ts|scan:update_unaudited|with no audit entry in that transaction"
  "intel-internal.test.ts|scan:command_unlogged|not logged by the transaction that wrote it"
  "counter-sale.test.ts|scan:command_unlogged|not logged by the transaction that wrote it"
  "counter-sale.test.ts|scan:command_unlisted|does not list core\\."
  "counter-sale.test.ts|scan:decision_missing|no executed approved draft"
  "import-settlement.test.ts|scan:decision_unaudited|not audited by the transaction that wrote it"
  "counter-sale.test.ts|scan:rule_missing|no such rule for core\\."
  "counter-sale.test.ts|scan:source_missing|source core\\.[a-z_]+:[0-9a-f-]+ missing"
  "counter-sale.test.ts|scan:state_insert|was not in the rule's source_state when written"
  "counter-sale.test.ts|scan:derivation_unaudited|audited no command or decision"
  "counter-sale.test.ts|scan:state_unevaluated|source_state not evaluated when written"
  "counter-sale.test.ts|scan:unknown_kind|origin kind planted_kind"
  "counter-sale.test.ts|scan:migration_unaudited|origin migration: not audited"
  "counter-sale.test.ts|scan:no_capture|inserted with no captured transaction"
  "counter-sale.test.ts|scan:update_unaudited|with no audit entry in that transaction"
  "counter-sale.test.ts|scan:state_update|was not in the rule's source_state when written"
  "counter-sale.test.ts|scan:other_tenant|for another tenant"
  "counter-sale.test.ts|scan:restamp|origin re-stamped by an update"
)
n=0
for p in "${PLANTS[@]}"; do
  IFS='|' read -r file plant want <<<"$p"
  n=$((n + 1))
  name="$(printf '%02d' "$n")-${plant//[:.]/_}"
  if [[ " $RED_CLEAN " == *" $file "* ]]; then
    row INCONC "$file" "$plant" "not run: the file fails without a plant"; fail=1
  elif run "$name" "$plant" "$file"; then
    row FAIL "$file" "$plant" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -qE -- "$want" "$OUT/$name.log"; then
    row FAIL "$file" "$plant" "red for another reason: no \"$want\" ($OUT/$name.log)"; fail=1
  else
    row ok "$file" "$plant" "exit≠0, \"$want\""
  fi
done
echo "redproof: $([ $fail = 0 ] && echo PASS || echo FAIL) — clean + ${#PLANTS[@]} plants"
exit $fail
