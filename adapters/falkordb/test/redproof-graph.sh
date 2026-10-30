#!/usr/bin/env bash
# Proves the graph gates can fail (design §10; gotcha 33): each plant edits one file in place, runs the one test file that must
# catch it, and requires a non-zero exit AND the named test failing; the file is restored from a copy whatever happens. The clean
# runs are the suites themselves, which must exit 0. Usage: adapters/falkordb/test/redproof-graph.sh [plant-name…] (none = all)
# Heavy (five plants seed two Cobnut tenants each): run it through scripts/dev/heavy.sh.
# Runs in the tree it is invoked from; run it on a quiet tree (it edits tracked files for seconds at a time).
set -uo pipefail
cd "$(dirname "$0")/../../.."
root=$(pwd)
out=$(mktemp -d "${TMPDIR:-/tmp}/munim-graph-redproof.XXXX")
planted=()
# A FalkorDB test server whose test process died (a plant can stop the harness from killing it) is adopted by init: kill it.
kill_orphans() {
  local pid
  for pid in $(pgrep -f "$root/.run/falkordb/.*/redis-server" || true); do
    [ "$(ps -o ppid= -p "$pid" | tr -d ' ')" = 1 ] && kill "$pid" 2>/dev/null
  done
  return 0
}
# Whatever ends the script (a timeout, Ctrl-C), every planted file is put back before the copies are deleted.
restore() {
  local f
  for f in ${planted[@]+"${planted[@]}"}; do cp "$out/$(echo "$f" | tr / _).bak" "$f"; done
  planted=()
}
trap 'restore; kill_orphans; rm -rf "$out"' EXIT INT TERM
fails=0

# name ~ file(s) to edit ~ perl substitution ~ package dir ~ test file ~ a failing test's name must contain ~ (optional) a passing one's
PLANTS=(
  'outlets~adapters/falkordb/cypher/read/*.cypher~s/\$outlets IS NULL OR/true OR/g~adapters/falkordb~test/queries.test.ts~scoped to Gomti Nagar'
  'quoted~adapters/falkordb/cypher/read/supplier_reach.cypher~s/\[:quoted\]/[:supplies]/~adapters/falkordb~test/queries.test.ts~quoted by Steady Wholesale'
  'ro-as-query~adapters/falkordb/src/client.ts~s/\.roQuery<Row>\(/.query(/~adapters/falkordb~test/guard.test.ts~a CREATE planted in a read text'
  'constant-key~adapters/falkordb/src/swap.ts~s/return `munim:\$\{tenantId\}`;/return "munim:shared";/~adapters/falkordb~test/guard.test.ts~never carry tenant B'
  'harness-no-kill~adapters/falkordb/test/harness.ts~s/child\.kill\("SIGTERM"\);/return;/~adapters/falkordb~test/harness.test.ts~stops by PID and frees its port'
  'clock-in-checksum~adapters/falkordb/projection.sql~s/'"'"'as_of'"'"', :as_of::date,/'"'"'as_of'"'"', :as_of::date, '"'"'at'"'"', clock_timestamp(),/~adapters/falkordb~test/projection.test.ts~re-run with unchanged books writes nothing'
  'no-count-check~adapters/falkordb/src/project.ts~s/if \(created\(await c\.write\(key, w\.text, \{ rows \}\), w\.kind\) !== rows\.length\) throw new GraphUnavailable\("short_write"\);/await c.write(key, w.text, { rows });/~adapters/falkordb~test/projection.test.ts~an edge whose endpoint is missing'
  'tenant-predicates~adapters/falkordb/projection.sql~s/\b(?:[a-z]+\.)?tenant_id = :tenant_id\b/true/g~adapters/falkordb~test/projection.test.ts~the predicate alone~RLS alone'
  'postgres-fallback~adapters/falkordb/src/index.ts~s/      await fresh\(caller\);\n      return run\(name, args, caller\);/      try { await fresh(caller); return await run(name, args, caller); } catch { const m = await import("..\/..\/..\/services\/core-api\/src\/internal\/graph\/index.ts"); return (await m.postgresGraph())!.template(name, args, caller); }/~adapters/falkordb~test/core-api.test.ts~FalkorDB stopped'
  'worker-never-writes~services/core-worker/src/graph/index.ts~s/\.wrote \? "rebuilt" : "unchanged"/.wrote ? "unchanged" : "unchanged"/~adapters/falkordb~test/core-api.test.ts~the tick builds every active tenant'
  'routes-unguarded~services/core-api/src/modules/graph/index.ts~s/if \(!c\.var\.deps\.graph\?\.read \|\| !c\.var\.deps\.graph\.fresh\) throw/if (false) throw/~services/core-api~test/graph-routes.test.ts~the Postgres backend serves no graph route'
  'check-args-open~services/core-api/src/internal/graph/index.ts~s/  if \(Object\.keys\(args\)\.some\(\(k\) => !allowed\.has\(k\)\)\) throw new ApiError\("invalid_payload"\);\n//~services/core-api~test/graph-routes.test.ts~a tenant_id argument'
  'graph-secret-unregistered~packages/config/src/index.ts~s/, \.\.\.graphs\.flatMap\(\(g\) => g\.secretNames\)\]/]/~packages/config~test/config.test.ts~is redacted from logs'
  'graph-mode-unchecked~packages/config/src/index.ts~s/if \(graph !== undefined && graph !== "postgres" && !graphModes\.includes\(graph\)\) \{/if (false) {/~packages/config~test/config.test.ts~refuses by name'
  'contract-count~packages/contracts/src/graph/index.ts~s/    only_source: z\.boolean\(\),/    only_source: z.boolean(),\n    dish_count: z.int().min(0),/~packages/contracts~test/graph.test.ts~no number, integer or untyped leaf'
)

run_plant() {
  local name=$1 glob=$2 sub=$3 pkg=$4 test=$5 expect=$6 green=${7:-}
  local files=() f
  for f in $glob; do files+=("$f"); done
  [ ${#files[@]} -gt 0 ] || { echo "redproof $name: FAIL — no file matches $glob"; fails=$((fails+1)); return; }
  for f in "${files[@]}"; do cp "$f" "$out/$(echo "$f" | tr / _).bak"; done
  planted=("${files[@]}")
  perl -0pi -e "$sub" "${files[@]}"
  local changed=0
  for f in "${files[@]}"; do cmp -s "$f" "$out/$(echo "$f" | tr / _).bak" || changed=1; done
  (cd "$root/$pkg" && node_modules/.bin/vitest run "$test" --reporter=verbose > "$out/$name.log" 2>&1)
  local rc=$?
  restore
  kill_orphans
  local red
  red=$(grep -c "×" "$out/$name.log" || true)
  if [ $changed = 0 ]; then
    echo "redproof $name: FAIL — the plant changed nothing"; fails=$((fails+1))
  elif [ $rc = 0 ]; then
    echo "redproof $name: FAIL — the gate stayed green (exit 0)"; fails=$((fails+1))
  elif ! grep -q "×.*$expect" "$out/$name.log"; then
    echo "redproof $name: FAIL — exit $rc but no failing test names \"$expect\""; tail -20 "$out/$name.log"; fails=$((fails+1))
  elif [ -n "$green" ] && ! grep -q "✓.*$green" "$out/$name.log"; then
    echo "redproof $name: FAIL — \"$green\" should stay green and did not"; fails=$((fails+1))
  else
    echo "redproof $name: ok — exit $rc, $red failing test(s), including \"$expect\""
  fi
}

want=("$@")
for p in "${PLANTS[@]}"; do
  IFS='~' read -r name glob sub pkg test expect green <<< "$p"
  if [ ${#want[@]} -gt 0 ] && [[ ! " ${want[*]} " == *" $name "* ]]; then continue; fi
  run_plant "$name" "$glob" "$sub" "$pkg" "$test" "$expect" "$green"
done

if [ $fails -gt 0 ]; then echo "redproof-graph: FAIL — $fails plant(s) not caught"; exit 1; fi
echo "redproof-graph: ok — every plant caught"
