#!/usr/bin/env bash
# Red-proof for the T-084b and T-089a gates (test/investigations-plan.test.ts, test/investigations-plan-world.test.ts).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27).
#   services/core-api/test/investigations-plan-redproof.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t089a-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  if [ "$rel" = node_modules ]; then ln -s "$(cd "$nm" && pwd -P)" "$copy/node_modules"; continue; fi
  mkdir -p "$copy/$rel"
  for e in "$nm"/* "$nm"/.bin; do
    [ -e "$e" ] || continue
    if [ "$(basename "$e")" = "@munim" ]; then
      mkdir -p "$copy/$rel/@munim"
      for w in "$e"/*; do
        target=$(cd "$w" && pwd -P)
        ln -s "$copy/${target#"$(cd "$src" && pwd -P)"/}" "$copy/$rel/@munim/$(basename "$w")"
      done
    else
      ln -s "$e" "$copy/$rel/$(basename "$e")"
    fi
  done
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/.venv/*")

core="$copy/services/core-api"
failures=0
run_plan() { (cd "$core" && ./node_modules/.bin/vitest run test/investigations-plan.test.ts) > "$copy/.out" 2>&1; }
run_world() { (cd "$core" && ./node_modules/.bin/vitest run test/investigations-plan-world.test.ts) > "$copy/.out" 2>&1; }

replace() {
  python3 - "$copy/$1" "$2" "$3" <<'EOF'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
EOF
}

# plant <label> <runner> <expected test name> <file under the repo> <command...>
plant() {
  local label=$1 runner=$2 expect=$3 file=$4
  shift 4
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif "$runner"; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAIL ' "$copy/.out" | grep -qF -- "$expect"; then
    echo "  red:   exits non-zero and names '$expect':"
    grep -E 'FAIL ' "$copy/.out" | head -3 | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

P=services/core-api/src/modules/investigations/plan.ts
X=services/core-api/src/modules/investigations/index.ts
S=services/core-api/src/modules/investigations/step.ts

echo "baseline:"
for r in run_plan run_world; do
  if "$r"; then echo "  green: $r: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: $r is red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

# --- T-084b ---
plant "(2) :cancel does not cancel" run_plan ":cancel → cancelled, then :continue → 409" "$X" \
  replace "$X" "        await q.query(\`UPDATE core.investigation SET status = 'cancelled' WHERE id = \$1\`, [id]);" ''
plant "list reads with an all-outlet context" run_plan "RLS scope: the owner sees" "$X" \
  replace "$X" '    return c.json(await withContext(c.var.deps.pools.core, contextOf(m), async (db) => {' \
                '    return c.json(await withContext(c.var.deps.pools.core, { ...contextOf(m), outlet_ids: "*", role: "owner" }, async (db) => {'
# Since 0025 (N1) a trigger on core.investigation sends the same munim_inbox notify as core's notifyInbox (Postgres
# delivers the pair once), so the plant takes both off: the step's notifyInbox, and the trigger, disabled by the test in its
# own database (the migration is untouched). The test file is restored after the plant.
T=services/core-api/test/investigations-plan.test.ts
no_inbox_wake() {
  cp "$copy/$T" "$copy/.saved-test" &&
    replace "$S" '  await notifyInbox(q, m.tenant_id, id);
  return { replayed: false, narrate, scope, playbook: pb };' '  return { replayed: false, narrate, scope, playbook: pb };' &&
    replace "$T" '  db = await openDb();
' '  db = await openDb();
  await db.admin("ALTER TABLE core.investigation DISABLE TRIGGER notify_inbox");
'
}
plant "SSE: a step does not wake inbox streams (core's notify and the 0025 trigger off)" run_plan \
  "the owner sees step 1 land before the approval returns" "$S" no_inbox_wake
mv "$copy/.saved-test" "$copy/$T"

# --- T-089a ---
plant "(1) the estimate cites another column" run_plan "the estimate is a resolving snapshot ref" "$P" \
  replace "$P" 'estimate_ref: ref("estimate_minor")' 'estimate_ref: ref("per_step_minor")'
plant "(1) a number typed into the preview" run_plan "0 bare digits in the preview" "$P" \
  replace "$P" 'items: pb.items.map((i) => ({ item_id: i.item_id, label_key: i.label_key,' \
                'items: pb.items.map((i) => ({ item_id: i.item_id, label_key: `${i.label_key}.${String(rows[row]?.estimate_minor)}`,'
plant "(1) no history reads as computed" run_plan "no spend history yet" "$P" \
  replace "$P" 'status: ok ? "computed" as const : "cannot_verify" as const' 'status: "computed" as const'
plant "(2) waiting does not stop with a reason" run_plan "stops after 1 step at waiting" "$P" \
  replace "$P" '    if (after.status === "waiting") return stop(deps, m, id, "waiting");' ''
plant "(3) no budget check" run_plan "the cap reached by step 1's spend" "$P" \
  replace "$P" '    if (!cap || cap.left_minor <= 0) return stop(deps, m, id, "budget");' ''
plant "(4) the request's stale principal steps on" run_plan "narrowed to outlet 1 during step 1" "$P" \
  replace "$P" '    m = await currentMember(deps, approver);' '    m = approver;'
plant "(5) :approve-plan skips the ceiling" run_plan "manager lowered to step by the owner" "$P" \
  replace "$P" '    await assertModeAllowed(q, m, "plan");' ''
plant "(5) create skips the ceiling" run_plan "staff (ceiling step)" "$X" \
  replace "$X" '      await assertModeAllowed(q, m, mode);' ''
plant "(6) a replayed approval runs the plan again" run_plan "step 2's transaction dies" "$P" \
  replace "$P" '  if (replayed) return { replayed, member: m };' ''
plant "(7) the steps run after the response" run_plan "every started_at ≤ the DB clock read after the response" "$P" \
  replace "$P" '  return { replayed, member: await runPlan(deps, m, id, step) };' '  void runPlan(deps, m, id, step);
  return { replayed, member: m };'
plant "abstain does not stop" run_plan "abstained answer on step 1" "$P" \
  replace "$P" '    if (after.abstained) return stop(deps, m, id, "abstain");' ''
plant "idempotency: a repeated approval is refused" run_plan "data incomplete here (no bank lines)" "$P" \
  replace "$P" '    if (inv.plan_approved_by !== null) return true;' '    if (inv.plan_approved_by !== null) throw new ApiError("conflict");'
plant "clause 1: approval writes an audit row" run_plan "0 book, audit, command, draft or decision rows change" "$P" \
  replace "$P" '    await notifyInbox(q, m.tenant_id, id);
    return false;' "    await q.query(\`INSERT INTO core.audit_log (tenant_id, actor, action, entity, entity_id) VALUES (\$1, \$2, 'investigations.plant.v1', 'core.investigation', \$3)\`,
      [m.tenant_id, JSON.stringify({ kind: 'member', id: m.member_id, role: m.role }), id]);
    return false;"
plant "(2c) the plan stops after its first step" run_world "(2c) a planted flip of the frozen item" "$P" \
  replace "$P" '    if (after.status !== "open") return m;' '    return m;'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
