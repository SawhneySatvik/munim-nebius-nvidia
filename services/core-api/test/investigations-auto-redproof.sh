#!/usr/bin/env bash
# Red-proof for the T-089b gates (test/investigations-auto.test.ts).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27).
#   services/core-api/test/investigations-auto-redproof.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t089b-redproof.XXXXXX")
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
run_auto() { (cd "$core" && ./node_modules/.bin/vitest run test/investigations-auto.test.ts) > "$copy/.out" 2>&1; }

replace() {
  python3 - "$copy/$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
PY
}
replace2() { replace "$1" "$2" "$3" && replace "$1" "$4" "$5"; }

# plant <label> <expected test name> <file under the repo> <command...>
plant() {
  local label=$1 expect=$2 file=$3
  shift 3
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_auto; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAIL ' "$copy/.out" | grep -qF -- "$expect"; then
    echo "  red:   exits non-zero and names '$expect':"
    grep -E 'FAIL ' "$copy/.out" | head -3 | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

A=services/core-api/src/modules/investigations/auto.ts
S=services/core-api/src/modules/investigations/step.ts
X=services/core-api/src/modules/investigations/index.ts
R=services/core-api/src/modules/investigations/redact.ts
# C2 (C1 S2-4): an Auto step's run mint ranks its creator's current role in mint.ts (the step's own pre-check was folded into it).
M=services/core-api/src/modules/evidence/mint.ts

echo "baseline:"
if run_auto; then echo "  green: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi

plant "approve: no ceiling check for auto" "a manager (default ceiling plan) → 403" "$A" \
  replace "$A" '  await assertModeAllowed(q, m, "auto");' ''
plant "approve: no standing grant" "1 live grant of the owner for the scope" "$A" \
  replace "$A" '     SELECT tenant_id, $2, id, created_by, outlet_scope FROM core.investigation WHERE id = $1`, [id, uuidv7()]);' \
               '     SELECT tenant_id, $2, id, created_by, outlet_scope FROM core.investigation WHERE false`, [id, uuidv7()]);'
plant "(1) any import kind resumes" "(1) refusals" "$A" \
  replace "$A" 'r.kind = ANY ($1::text[])' '(r.kind IS NOT NULL OR r.kind = ANY ($1::text[]))'
plant "(6) no re-check inside the lock" "(1)+(6) a bank-statement import" "$A" \
  replace "$A" '    if (since >= gate.at) return none;' ''
plant "daily ignores the day's boundary" "daily: nothing waiting" "$A" \
  replace2 "$A" '                     i.plan_approved_at) < $1' "                     i.plan_approved_at) < \$1::timestamptz + interval '2 days'" \
                '    if (since >= gate.at) return none;' ''
plant "D4: the daily pass steps with no new data" "daily: nothing waiting since" "$A" \
  replace "$A" '  if (gate.kind === "since" && gate.needsNewData && !(await newData(q, inv.params, since))) return none;' ''
plant "D4: an import never counts as new data" "D4: data outside" "$A" \
  replace "$A" '  return r.rows[0]!.fresh;' '  return false;'
plant "D4: any journal entry counts, whatever its month" "D4: data outside" "$A" \
  replace "$A" "x.created_at > \$1 AND x.entry_date >= w.lo AND x.entry_date < w.hi" "x.created_at > \$1"
plant "(7) a pass creates a draft" "(7) + clause 1" "$A" \
  replace "$A" '  return { kind: "stepped", m, step_no: stepNo, step, run };' \
               "  await q.query(\`INSERT INTO core.draft (tenant_id, id, outlet_ids, source, command_type, command_payload) VALUES (\$1, \$2, '{}', 'intel:finance', 'imports.run.commit.v1', '{}')\`, [tenantId, uuidv7()]);
  return { kind: \"stepped\", m, step_no: stepNo, step, run };"
plant "(2) a removed creator is not cancelled" "T-089b (2): creator removed" "$A" \
  replace "$A" "    await q.query(\`UPDATE core.investigation SET status = 'cancelled', stop_reason = 'scope' WHERE id = \$1\`, [id]);" ''
plant "(3) the stored scope is not re-intersected" "T-089b (3): outlet narrowed" "$A" \
  replace "$A" '  if (!m || !covers(m.outlet_ids, inv.outlet_scope)) {' '  if (!m) {'
plant "(4) no budget check" "T-089b (4): at the cap" "$A" \
  replace "$A" '  if (!cap || cap.left_minor <= 0) {' '  if (!cap) {'
plant "(5) no ceiling re-check" "ceiling lowered" "$A" \
  replace "$A" '  if (RANK[await ceilingFor(q, m.role)] < RANK.auto) {' '  if (false) {'
plant "T-098 a ceiling stop records scope (no downgrade)" "ceiling lowered" "$A" \
  replace "$A" "    await q.query(\`UPDATE core.investigation SET stop_reason = 'ceiling' WHERE id = \$1\`, [id]);" \
               "    await q.query(\`UPDATE core.investigation SET stop_reason = 'scope' WHERE id = \$1\`, [id]);"
plant "T-098 the ceiling is checked only when there is new data" "T-098 ceiling lowered" "$A" \
  replace2 "$A" '  if (gate.kind === "since" && gate.needsNewData && !(await newData(q, inv.params, since))) return none;' '' \
                '  if (RANK[await ceilingFor(q, m.role)] < RANK.auto) {' \
                '  if (gate.kind === "since" && gate.needsNewData && !(await newData(q, inv.params, since))) return none;
  if (RANK[await ceilingFor(q, m.role)] < RANK.auto) {'
plant "T-098 the creator's view hides ceiling" "T-098 ceiling lowered" "$X" \
  replace "$X" 'stop_reason: restrictedStopReason(inv.stop_reason, inv.created_by, m.member_id)' 'stop_reason: null'
plant "T-098 the creator's list hides ceiling" "T-098 ceiling lowered" "$X" \
  replace "$X" 'stop_reason: restrictedStopReason(x.stop_reason, x.created_by, m.member_id)' 'stop_reason: null'
plant "T-098 the creator sees every stop reason (waiting names the verdict)" "T-098 ceiling lowered" "$R" \
  replace "$R" 'stopReason === "ceiling" && viewerId' 'stopReason !== null && viewerId'
plant "role: an Auto run mints above the creator's role" "mints no advisor-level template" "$M" \
  replace "$M" '  if (minter.kind === "run" && UUID.test(minter.actor)) {' '  if (false) {'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
