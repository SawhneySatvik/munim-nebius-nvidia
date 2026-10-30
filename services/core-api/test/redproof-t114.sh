#!/usr/bin/env bash
# Red-proof of the T-114 gates (test/rfq.test.ts, test/intel-finding-outlet.test.ts). No flags (gotcha 17); run from
# anywhere:  services/core-api/test/redproof-t114.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); the
# test file must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND a FAIL line must name the gate.
# The clean copy must exit 0 first. `no-authority` plants nothing in the code: it runs rfq.test.ts with migration 0032's
# command_authority row deleted (RFQ_NO_AUTHORITY_ROW=1) and proves every request is refused without it.
# Logs: scratchpad/redproof-t114/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t114"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t114-redproof.XXXXXX")
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
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1); }

R=test/rfq.test.ts
F=test/intel-finding-outlet.test.ts
row RESULT PLANT EXPECT
for t in "$R" "$F"; do
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

(cd "$API" && RFQ_NO_AUTHORITY_ROW=1 "$VITEST" run "$R" >"$OUT/no-authority.log" 2>&1); judge no-authority '\(1\) the owner asks' $?

Q=src/modules/purchasing/rfq.ts
P=src/modules/purchasing/index.ts
W=src/internal/writes.ts
plant first-outlet-only  "$R" $Q '\(3\) staff are refused'  'if \(!p\.outlet_ids\.every\(' 'if (!p.outlet_ids.slice(0, 1).every('
plant replay-negotiates  "$R" $P '\(2\) a replay'           'after && !out\.replayed \?' 'after ?'
plant run-scope-all      "$R" $Q '\(1\) the owner asks'     'const scope = p\.outlet_ids as OutletScope;' 'const scope = ["*"] as OutletScope;'
plant cardless-supplier  "$R" $Q '\(1\) the owner asks'     ' AND a2a_card_url IS NOT NULL' ''
plant run-not-ended      "$R" $Q '\(1\) the owner asks|\(4\) intel failing' 'await endRun\(\{ svc \}, m\.tenant_id, claims\.run_id\);' ''
plant outlet-unchecked   "$F" $W '\(1\)–\(3\) the row|\(4\) a scoped run' 'if \(cell\.rows\[0\]\?\.v !== o\)' 'if (false)'
plant null-outlet-read   "$F" $W '\(1\)–\(3\) the row' 'if \(req\.outlet_ids && impact\)' 'if (req.outlet_ids !== undefined && impact)'

[ "$fail" = 0 ] && echo "redproof-t114: all plants red, clean green" || echo "redproof-t114: FAILED"
exit "$fail"
