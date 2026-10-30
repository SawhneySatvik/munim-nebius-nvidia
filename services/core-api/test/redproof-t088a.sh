#!/usr/bin/env bash
# Red-proof of the T-088a gates (test/threads.test.ts). No flags (gotcha 17); run from anywhere:
#   services/core-api/test/redproof-t088a.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); the
# test file must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND a FAIL line must name the gate.
# The clean copy must exit 0 first. Logs: scratchpad/redproof-t088a/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t088a"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t088a-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude .claude "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")
API="$copy/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
# Until the orchestrator lists `threads` in modules/index.ts (T-004's file), mount it in the copy only.
grep -q '"threads"' "$API/src/modules/index.ts" || perl -0 -i -pe 's/  "traces",\n\] as const;/  "traces",\n  "threads",\n] as const;/' "$API/src/modules/index.ts"
grep -q '"threads"' "$API/src/modules/index.ts" || { echo "FAIL could not mount threads in the copy"; exit 1; }
fail=0
row() { printf '%-6s %-20s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1); }

T=test/threads.test.ts
row RESULT PLANT EXPECT
if run clean "$T"; then row ok clean "$T exit 0"; else row FAIL clean "$T exit 0 (see $OUT)"; fail=1; fi

# plant <name> <file under services/core-api> <FAIL-line regex> <perl regex> <literal replacement>
# The regex must match EXACTLY once (0 = a stale anchor, >1 = ambiguous): either fails the red-proof, never a no-op.
plant() {
  local name=$1 file=$2 want=$3 n
  cp "$API/$file" "$API/$file.orig"
  n=$(PAT="$4" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$API/$file")
  if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $file"; fail=1; mv "$API/$file.orig" "$API/$file"; return; fi
  PAT="$4" REP="$5" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$API/$file"
  if run "$name" "$T"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "FAIL .*($want)" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming [$want] ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0, FAIL names [$want]"
  fi
  mv "$API/$file.orig" "$API/$file"
}

M=src/modules/threads/mention.ts
S=src/modules/threads/summary.ts
I=src/modules/threads/index.ts
plant case-sensitive  $M '\(1\) leading'        'ALIAS\.get\(m\[1\]!\.toLowerCase\(\)\)' 'ALIAS.get(m[1]!)'
plant not-leading     $M '\(1\) leading'        '\^\\s\*@' '@'
plant summary-taint   $S '\(4b\) the tainted'   'if \(t\.tainted \|\| ' 'if ('
plant block-taint     $S '\(4\) taint'          'tainted: last\.rows\.some\(\(x\) => x\.tainted\)' 'tainted: false'
plant carry-off       $I '\(4\) taint'          'reported\.tainted \|\| \(block\?\.tainted \?\? false\)' 'reported.tainted'
plant scope-off       $I '\(3\) outlet scope'   'const out = await withContext\(c\.var\.deps\.pools\.core, contextOf\(m\),' 'const out = await withContext(c.var.deps.pools.core, { tenant_id: m.tenant_id, outlet_ids: "*", role: "owner" },'
plant run-scope       $I '\(3\) outlet scope'   'existing \? existing\.outlet_scope : ' ''
plant fixed-turn-no   $I '\(2\) gapless'        'VALUES \(\$1, \$2, NULL, ' 'VALUES ($1, $2, 1, '
plant run-match-off   $I 'the ask path'         'AND run_id = \$2' 'AND $2::uuid IS NOT NULL'
plant two-signatures  $I '\(5\) @Finance'       'turn: \{ turn_id: turnId, ' 'turn: { signature: answer!.signature, turn_id: turnId, '
plant signature-pass  $I '\(5\) a signature'     'IntelAskResponse\.safeParse\(' '((v: any) => ({ success: true as const, data: v }))('
plant question-off    $I '\(5\) a signature'     'AND question = \$3' 'AND $3::text IS NOT NULL'

[ "$fail" = 0 ] && echo "redproof-t088a: all plants red, clean green" || echo "redproof-t088a: FAILED"
exit "$fail"
