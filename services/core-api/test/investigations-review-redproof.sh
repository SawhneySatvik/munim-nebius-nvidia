#!/usr/bin/env bash
# Red-proof for the R-D (W3 close review) fixes in the investigations module (test/investigations-review.test.ts,
# test/investigations-narrateport.test.ts, test/investigations-plan-world.test.ts (2d)).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27).
#   services/core-api/test/investigations-review-redproof.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-rd-redproof.XXXXXX")
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
run_review() { (cd "$core" && ./node_modules/.bin/vitest run test/investigations-review.test.ts) > "$copy/.out" 2>&1; }
run_port() { (cd "$core" && ./node_modules/.bin/vitest run test/investigations-narrateport.test.ts) > "$copy/.out" 2>&1; }
run_world() { (cd "$core" && ./node_modules/.bin/vitest run test/investigations-plan-world.test.ts) > "$copy/.out" 2>&1; }

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

X=services/core-api/src/modules/investigations/index.ts
P=services/core-api/src/modules/investigations/plan.ts
S=services/core-api/src/modules/investigations/step.ts
N=services/core-api/src/modules/investigations/narrateport.ts
F=services/core-api/src/stream/feed.ts
R=services/core-api/src/modules/investigations/redact.ts

echo "baseline:"
for r in run_review run_port run_world; do
  if "$r"; then echo "  green: $r: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: $r is red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

plant "1: the bare endpoint string" run_port "one POST to /investigate:narrate" "$N" \
  replace "$N" 'new URL("./investigate:narrate",' 'new URL("investigate:narrate",'
plant "2: checklist verdicts not redacted" run_review "every item, update and the status are restricted" "$X" \
  replace "$X" '      status: shown ? c.status : RESTRICTED,' '      status: c.status,'
plant "2: view status not redacted" run_review "every item, update and the status are restricted" "$X" \
  replace "$X" '  if (!(await statusVisible(q, m.role, [inv.playbook_id])).has(inv.playbook_id)) {' '  if (false) {'
plant "2: view stop_reason not redacted" run_review "every item, update and the status are restricted" "$X" \
  replace "$X" 'Object.assign(inv, { status: RESTRICTED, stop_reason: restrictedStopReason(inv.stop_reason, inv.created_by, m.member_id) })' 'Object.assign(inv, { status: RESTRICTED })'
plant "2: restricted segments kept" run_review "every item, update and the status are restricted" "$X" \
  replace "$X" '{ ...env, segments: env.segments.filter((_, i) => keep[i]) }' '{ ...env, segments: env.segments }'
plant "2: list status not redacted" run_review "the manager's row reads restricted" "$X" \
  replace "$X" '(visible.includes(x.playbook_id) ? x : { ...x, status: RESTRICTED, stop_reason: restrictedStopReason(x.stop_reason, x.created_by, m.member_id) })' 'x'
plant "2: list stop_reason not redacted" run_review "the manager's row reads restricted" "$X" \
  replace "$X" '{ ...x, status: RESTRICTED, stop_reason: restrictedStopReason(x.stop_reason, x.created_by, m.member_id) }' '{ ...x, status: RESTRICTED }'
plant "2: ?status= matches a restricted row" run_review "the manager's row reads restricted" "$X" \
  replace "$X" '(i.status = $1 AND i.playbook_id = ANY ($5::text[]))' '(i.status = $1 OR $5::text[] IS NULL)'
plant "2: SSE status not redacted" run_review "SSE: the manager's inbox.investigation events carry restricted" "$F" \
  replace "$F" 'return rows.map((x) => (visible.has(x.playbook_id) ? x' 'return rows.map((x) => (true ? x'
plant "2: SSE stop_reason not redacted" run_review "SSE: the manager's inbox.investigation events carry restricted" "$F" \
  replace "$F" '{ ...x, status: "restricted", stop_reason: restrictedStopReason(x.stop_reason, x.created_by, this.ctx.member_id) }' '{ ...x, status: "restricted" }'
plant "T-098: SSE hides ceiling from its creator" run_review "T-098 SSE" "$F" \
  replace "$F" 'restrictedStopReason(x.stop_reason, x.created_by, this.ctx.member_id)' 'null'
plant "T-098: ceiling shown to every restricted viewer, not only the creator" run_review "T-098 SSE" "$R" \
  replace "$R" 'createdBy === viewerId' 'true'
plant "4: no ceiling re-check per plan step" run_review "lowered to step mid-plan" "$P" \
  replace "$P" '    if ((await svc(deps, approver.tenant_id, (q) => ceilingFor(q, m!.role))) === "step") return stop(deps, m, id, "scope");' ''
plant "5: linking does not move the investigation" run_review "linking the narration moves the investigation" "$X" \
  replace "$X" '    await q.query(`UPDATE core.investigation SET updated_at = now() WHERE id = $1`, [id]);' ''
plant "5: taint only from intel's word" run_review "its response is lost → the step is tainted" "$X" \
  replace "$X" ' || (reported === null && !template_);' ';'
plant "6: estimate under the creator's whole scope" run_review "the estimate's scope is {o1}" "$X" \
  replace "$X" 'await mintEstimate(q, m, id, scope as OutletScope);' 'await mintEstimate(q, m, id, (m.outlet_ids === "*" ? ["*"] : m.outlet_ids) as OutletScope);'
plant "3: a flip at the final re-mint is always open" run_world "(2d) R-D: a gate flip at the final re-mint gives waiting" "$S" \
  replace "$S" '      status = again === "done" ? (stepNo >= pb.max_steps ? "exhausted" : "open") : again;' \
               '      status = again === "done" || true ? (stepNo >= pb.max_steps ? "exhausted" : "open") : again;'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
