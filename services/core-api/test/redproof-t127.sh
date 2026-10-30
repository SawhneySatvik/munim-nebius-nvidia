#!/usr/bin/env bash
# Red-proof of the T-127 core-api gates (test/finance-budget.test.ts: POST /v1/finance/budgets; test/run-frame.test.ts: the
# run-frame's ai_enabled). No flags (gotcha 17); run from anywhere:  services/core-api/test/redproof-t127.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); the test file
# must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND a FAIL line must name the gate. The clean copy must
# exit 0 first. The roles a budget admits are the database's (0008's command_authority row, judged by the book guard): their
# red-proofs are the guard's (db/tests). Logs: scratchpad/redproof-t127/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t127"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t127-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")
API="$copy/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
fail=0
row() { printf '%-6s %-24s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1); }

B=test/finance-budget.test.ts
F=test/run-frame.test.ts
row RESULT PLANT EXPECT
for t in "$B" "$F"; do
  if run "clean-$(basename "$t" .test.ts)" "$t"; then row ok clean "$t exit 0"; else row FAIL clean "$t exit 0 (see $OUT)"; fail=1; fi
done

judge() {
  local name=$1 want=$2
  if [ "$3" = 0 ]; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "FAIL .*($want)" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming [$want] ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0, FAIL names [$want]"
  fi
}

# plant <name> <test file> <file under services/core-api> <FAIL-line regex> <perl regex> <literal replacement>
# The regex must match EXACTLY once (0 = a stale anchor, >1 = ambiguous): either fails the red-proof, never a no-op.
plant() {
  local name=$1 test=$2 file=$3 want=$4 n
  cp "$API/$file" "$API/$file.orig"
  n=$(PAT="$5" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$API/$file")
  if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $file"; fail=1; mv "$API/$file.orig" "$API/$file"; return; fi
  PAT="$5" REP="$6" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$API/$file"
  run "$name" "$test"; judge "$name" "$want" $?
  mv "$API/$file.orig" "$API/$file"
}

C=src/modules/finance/commands.ts
I=src/modules/finance/index.ts
R=src/internal/frame.ts
plant budget-no-route        "$B" $I '\(1\) the owner sets'        '\.post\("\/v1\/finance\/budgets", requireMember' '.post("/v1/finance/budgets-unmounted", requireMember'
plant budget-always-insert   "$B" $C '\(3\) set again'             'if \(prior\) \{' 'if (false) {'
plant budget-any-outlet      "$B" $C '\(3\) set again'             'WHERE outlet_id IS NOT DISTINCT FROM \$1 AND' 'WHERE'
plant budget-no-before       "$B" $C '\(3\) set again'             'before: \{ amount_minor: Number\(prior\.amount_minor\) \}, ' ''
plant budget-currency-kept   "$B" $C '\(5\) not the first'         'if \(kept\.currency !== p\.currency\) throw new ApiError\("currency_mismatch"\);' ''
plant frame-ai-always-on     "$F" $R 'the kill switch off'         'ai_enabled: aiOn,' 'ai_enabled: true,'
plant frame-ai-from-budget   "$F" $R 'at the cap'                  'ai_enabled: aiOn,' 'ai_enabled: narration === "model",'

[ "$fail" = 0 ] && echo "redproof-t127: all plants red, clean green" || echo "redproof-t127: FAILED"
exit "$fail"
