#!/usr/bin/env bash
# Red-proof of the T-127b gates (R59: the Cobnut seed prices the live AI roles at 0 INR, writes three months of AI and purchases
# budgets, and reads back that a live AI run is ready). No flags (gotcha 17); run from anywhere:  tools/worldgen/test/redproof-t127b.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); test/cobnut.test.ts
# must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND its log must name the gate. The clean copy exits 0 first.
# Logs: scratchpad/redproof-t127b/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t127b"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t127b-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")
WG="$copy/tools/worldgen"
fail=0
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }
run() { (cd "$WG" && env -u NODE_TEST_CONTEXT node --test test/cobnut.test.ts >"$OUT/$1.log" 2>&1); }

row RESULT PLANT EXPECT
if run clean; then row ok clean "test/cobnut.test.ts exit 0"; else row FAIL clean "test/cobnut.test.ts exit 0 (see $OUT)"; fail=1; fi

# plant <name> <file under tools/worldgen> <log regex> <perl regex> <literal replacement>: the regex must match EXACTLY once.
plant() {
  local name=$1 file=$2 want=$3 n
  cp "$WG/$file" "$WG/$file.orig"
  n=$(PAT="$4" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$WG/$file")
  if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $file"; fail=1; mv "$WG/$file.orig" "$WG/$file"; return; fi
  PAT="$4" REP="$5" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$WG/$file"
  if run "$name"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif grep -Eq "$want" "$OUT/$name.log"; then row ok "$name" "exit≠0; $(grep -m1 -Eo "$want" "$OUT/$name.log" | cut -c1-110)"
  else row FAIL "$name" "red, but no line matching '$want' ($OUT/$name.log)"; fail=1
  fi
  mv "$WG/$file.orig" "$WG/$file"
}

K=src/kit.ts
C=src/worlds/cobnut.ts
# A live role left unpriced: the seed's read-back names it.
plant role-unpriced   $K 'live AI is not ready: model_role router has no INR price' 'if \(!row && !c\.api\.lenient\) throw new Error\(`no platform\.model_role row for \$\{role\}`\);' 'if (role === "router") continue;'
# The AI budget for this month only: the read-back names the missing months.
plant ai-one-month    $C 'live AI is not ready: no INR AI budget row for' 'aiBudget: \{ limitMinor: 10_000, months: MONTHS \}' 'aiBudget: { limitMinor: 10_000, months: 1 }'
# The purchases budget for this month only (the deal review answers budget_missing from next month).
plant purchases-once  $C 'not ok .*two outlets, four people' 'for \(let i = 0; i < MONTHS; i\+\+\) \{' 'for (let i = 0; i < 1; i++) {'
# A role already priced is priced again (a real price would be overwritten).
plant reprice         $K 'not ok .*two outlets, four people' 'if \(row && row\.input_price_per_mtok_minor !== null' 'if (false && row && row.input_price_per_mtok_minor !== null'
# A reseed of the same world dies on an operator draft it applied the first time (core answers its approval 409).
plant approve-409     $K 'not ok .*a reseed of the same world' 'expect: \[200, 201, 409\]' 'expect: [200, 201]'
# An already-decided draft taken as done whatever its status (a rejected draft would pass for applied).
plant approve-status  $K 'not ok .*a reseed of the same world' 'if \(d\.status !== "applied"\) throw' 'if (false) throw'

[ "$fail" = 0 ] && echo "redproof-t127b: all plants red, clean green" || echo "redproof-t127b: FAILED"
exit "$fail"
