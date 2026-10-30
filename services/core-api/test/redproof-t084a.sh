#!/bin/bash
# Red-proof of the T-084a gates (test/lineage.test.ts, test/routes-contract.test.ts). No flags (gotcha 17); run from anywhere:
#   services/core-api/test/redproof-t084a.sh
# Works on a throwaway copy of the tree (the live tree is never touched, and gen never runs in it). The copy gets its OWN
# per-package node_modules (relative @munim symlinks resolve inside the copy, so a plant in packages/contracts is seen), the
# `lineage` entry in MODULES (the orchestrator adds it in the real tree) and a fresh `contracts gen`.
# The clean copy must exit 0 first; each plant must then exit NON-ZERO (gotcha 33) AND leave a FAIL line naming the gate.
# Every regex must match EXACTLY once. Logs: scratchpad/redproof-t084a/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t084a"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t084a-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude .claude "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  cp -a "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")
ln -s "$src/node_modules" "$copy/node_modules"
API="$copy/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
grep -q '"lineage"' "$API/src/modules/index.ts" || sed -i.bak 's/  "traces",/  "traces",\n  "lineage",/' "$API/src/modules/index.ts"
(cd "$copy/packages/contracts" && node scripts/gen.ts >"$OUT/gen.log" 2>&1) || { echo "FAIL gen (see $OUT/gen.log)"; exit 1; }
fail=0
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1); }

row RESULT PLANT EXPECT
for f in test/lineage.test.ts test/routes-contract.test.ts; do
  if run "clean-$(basename "$f" .test.ts)" "$f"; then row ok clean "$f exit 0"; else row FAIL clean "$f exit 0 (see $OUT)"; fail=1; fi
done

# plant <name> <file relative to services/core-api> <test file> <FAIL-line regex> <perl regex> <replacement> [<regex> <replacement>]…
plant() {
  local name=$1 file=$2 test=$3 want=$4 n
  shift 4
  cp "$API/$file" "$API/$file.orig"
  while [ $# -ge 2 ]; do
    n=$(PAT="$1" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$API/$file")
    if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $file"; fail=1; mv "$API/$file.orig" "$API/$file"; return; fi
    PAT="$1" REP="$2" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$API/$file"
    shift 2
  done
  if run "$name" "$test"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "FAIL .*($want)" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming [$want] ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0, FAIL names [$want]"
  fi
  mv "$API/$file.orig" "$API/$file"
}

L=test/lineage.test.ts
C=src/modules/lineage/chain.ts
plant no-decision-hop    $C $L '\(1\) a price row' \
  'let decisionId = audit\?\.decision_id \?\? null;' 'let decisionId: string | null = null;'
plant no-run-hop         $C $L '\(1\) a price row' \
  'const runId = draft\?\.run_id \?\? finding\?\.run_id \?\? null;' 'const runId: string | null = null;'
plant no-sqlstate        $C $L '\(2\)\(3\) rejected, stale and failed' \
  'sqlstate: failed\?\.after\?\.sqlstate \?\? null' 'sqlstate: null'
plant no-changes         $C $L '\(2\)\(3\) rejected, stale and failed' \
  'changes: \(stale\?\.after\?\.changes \?\? \[\]\)' 'changes: ([] as Array<{ ref: string; now_ref: string | null }>)'
plant no-reason-code     src/modules/approvals/decide.ts $L '\(2\)\(3\) rejected, stale and failed' \
  '\.\.\.\(reasonCode \? \{ reason_code: reasonCode \} : \{\}\)' ''
plant draftables-short   ../../packages/contracts/src/lineage/index.ts $L '\(3\) /v1/draftables' \
  'items: draftableTypes\(\)\.map' 'items: draftableTypes().slice(1).map'
plant row-visibility-off src/modules/lineage/index.ts $L '\(4\) another outlet' \
  'if \(!\(await visibleIds\(db, `\$\{schema\}\.\$\{table\}`, \[id\]\)\)\.has\(id\)\) throw new ApiError\("not_found"\);' ''
plant decision-unscoped  $C $L '\(4\) another outlet' \
  '         JOIN core\.draft dr ON dr\.tenant_id = d\.tenant_id AND dr\.id = d\.draft_id\n' ''
plant draft-scope-off    src/modules/lineage/index.ts $L '\(4\) another outlet' \
  'if \(!chain\.draft\) throw new ApiError\("not_found"\);' ''
plant dismiss-no-replay  src/modules/findings/index.ts $L 'findings:dismiss' \
  'env\.data, dismiss\);' '{ ...env.data, idempotency_key: `fresh-${Math.random()}-key` }, dismiss);'
plant route-undocumented ../../packages/contracts/src/lineage/index.ts test/routes-contract.test.ts 'mounted ⊆ documented' \
  'path: "/v1/draftables"' 'path: "/v1/draftables-renamed"'

[ "$fail" = 0 ] && echo "redproof-t084a: all plants red, clean green" || echo "redproof-t084a: FAILED"
exit "$fail"
