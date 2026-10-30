#!/usr/bin/env bash
# Red-proof for the T-117 gates: core-worker's tick.test.ts and poison.test.ts, and core-api's serverless.test.ts (the tick route).
# Works only in a throwaway copy of the tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the
# expected test -> restore. node_modules link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy; nothing runs pnpm (gotcha 27). Needs db/migrations/0031 in the tree (the ledger table).
#   services/core-worker/test/redproof-t117.sh   (TMPDIR picks where the copy goes)
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t117-redproof.XXXXXX")
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

failures=0
# gate worker|api: the run's output lands in $copy/.out.
gate() {
  case $1 in
    worker) (cd "$copy/services/core-worker" && ./node_modules/.bin/vitest run test/tick.test.ts test/poison.test.ts) ;;
    api) (cd "$copy/services/core-api" && ./node_modules/.bin/vitest run test/serverless.test.ts) ;;
  esac > "$copy/.out" 2>&1
}
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

# plant <label> <expected test name> <file under the repo> worker|api <command...>
plant() {
  local label=$1 expect=$2 file=$3 which=$4
  shift 4
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif gate "$which"; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAIL ' "$copy/.out" | grep -qF -- "$expect"; then
    echo "  red:   exits non-zero and names '$expect':"
    grep -E 'FAIL ' "$copy/.out" | head -2 | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

W=services/core-worker/src/worker.ts
C=services/core-worker/src/cron.ts
S=services/core-worker/src/sweeper.ts

# The old in-memory count: per process, never written to the row.
in_memory() {
  replace "$S" 'export const POISON_ATTEMPTS = 5;' $'export const POISON_ATTEMPTS = 5;\nconst MEM = new Map<string, number>();' &&
    replace "$S" 'const attempts = await recordPoison(pool, row);' 'const attempts = (MEM.get(row.id) ?? 0) + 1; MEM.set(row.id, attempts);'
}

echo "baseline:"
for g in worker api; do
  if gate "$g"; then echo "  green $g: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

plant "tick: no ledger (every call runs every job)" "replay: a second tick in the same slot runs nothing" "$W" worker \
  replace "$W" 'AbortSignal.timeout(o.budgetMs), this.#ledger)' 'AbortSignal.timeout(o.budgetMs))'
plant "tick route: no ledger (a repeated call runs every job)" "runs every core-worker job once for the aligned slot" "$W" api \
  replace "$W" 'AbortSignal.timeout(o.budgetMs), this.#ledger)' 'AbortSignal.timeout(o.budgetMs))'
plant "tick: the claim's answer ignored (an existing claim counts as new)" "replay: a second tick in the same slot runs nothing" "$W" worker \
  replace "$W" 'return rows[0]!.claimed ? { last: rows[0]!.last } : null;' 'return { last: rows[0]!.last };'
plant "runOnce: windows do not tile (a later call's window reaches back a whole period)" "later: a manual call two hours after the scheduled tick" "$C" worker \
  replace "$C" 'if (claim.last && claim.last > slot.prev) window = { at: slot.at, prev: claim.last };' ''
plant "tick: a lock key per call (two ticks run at once)" "lock: two concurrent ticks in one slot" "$W" worker \
  replace "$W" 'pg_try_advisory_xact_lock(hashtextextended($1, 0))' 'pg_try_advisory_xact_lock(hashtextextended($1 || random()::text, 0))'
plant "runOnce: a job the budget stopped before it started is claimed" "unstarted: a job the budget stopped before it started" "$C" worker \
  replace "$C" $'      if (signal.aborted) {\n        out[job.name] = "aborted";' $'      if (signal.aborted) {\n        await ledger?.claim(job.name, slot.at);\n        out[job.name] = "aborted";'
plant "sweeper: poison counted in this process's memory (the old PoisonRows)" "the count lives on the row" "$S" worker in_memory
plant "sweeper: intel being down counted against the row" "intel down is not poison" "$S" worker \
  replace "$S" '        log("outbox-sweep.publish_failed",' '        await recordPoison(pool, row);
        log("outbox-sweep.publish_failed",'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
