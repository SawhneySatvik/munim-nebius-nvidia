#!/usr/bin/env bash
# Red-proof of the T-128 gates (R67: the Cobnut seed plants six lapsing regulars and, for a margin-fall investigation, the month pair's
# discount plant, its closed shifts and its bank lines). No flags (gotcha 17); run from anywhere:  tools/worldgen/test/redproof-t128.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); test/cobnut.test.ts
# must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND its log must name the gate. The clean copy exits 0 first.
# Logs: scratchpad/redproof-t128/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t128"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t128-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude video "$src/" "$copy/"
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
C=src/worlds/cobnut.ts
# No lapsing regulars: the churn segment counts none at risk.
plant no-regulars    $C 'not ok .*six regulars stopped coming' 'const people = await customers\(c, "IN", 20, 6\);' 'const people = await customers(c, "IN", 20, 0);'
# The discount plant in both months alike: deals no longer explain the margin's fall.
plant no-discount    $C 'not ok .*a margin-fall plan runs to done' 'tag === "S" \? \{ lines: \[\{ item: "cardamom_knot", qty: 2, discBp: 5000 \}\] \} : \{\}' '{}'
# No shift log: the months' tills are not closed, so the investigation waits for the books.
plant no-shifts      $C 'not ok .*a margin-fall plan runs to done' 'k\.importFile\(c, "history:shifts:CB"' 'void ("history:shifts:CB"'
# Bank lines stop a week before the later month ends: bank_imported stays open.
plant short-bank     $C 'not ok .*a margin-fall plan runs to done' 'filter\(\(d\) => d <= last\)' 'filter((d) => d <= addDays(last, -7))'

[ "$fail" = 0 ] && echo "redproof-t128: all plants red, clean green" || echo "redproof-t128: FAILED"
exit "$fail"
