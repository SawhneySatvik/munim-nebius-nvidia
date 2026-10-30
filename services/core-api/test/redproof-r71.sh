#!/usr/bin/env bash
# Red-proof of the R71 core-api gate (test/customers.test.ts "C3/R71": the customer views' consent flags — "Send me offers"
# ({marketing}) is email consent only, sms needs its own flag, a channel's own flag wins). No flags (gotcha 17); run from anywhere:
#   services/core-api/test/redproof-r71.sh
# Each plant breaks consentFlags (src/modules/customers/reads.ts) in a throwaway copy of the tree (the live tree is never touched);
# the test file must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND a FAIL line must name the gate. The clean
# copy must exit 0 first. Logs: scratchpad/redproof-r71/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-r71"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-r71-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude '.env.*' \
  --exclude scratchpad --exclude apps/site --exclude deploy/vercel/out --exclude .mypy_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/deploy/vercel/out/*")
API="$copy/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
TEST=test/customers.test.ts
WANT='C3/R71'
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && "$VITEST" run "$TEST" >"$OUT/$1.log" 2>&1); }

row RESULT PLANT EXPECT
if run clean; then row ok clean "$TEST exit 0"; else row FAIL clean "$TEST exit 0 (see $OUT)"; fail=1; fi

# plant <name> <perl regex> <literal replacement>: the regex must match EXACTLY once in reads.ts (0 = a stale anchor, >1 =
# ambiguous) — either fails the red-proof, never a no-op.
plant() {
  local name=$1 file="$API/src/modules/customers/reads.ts" n code
  cp "$file" "$file.orig"
  n=$(PAT="$2" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$file")
  if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s)"; fail=1; mv "$file.orig" "$file"; return; fi
  PAT="$2" REP="$3" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$file"
  run "$name"; code=$?
  if [ "$code" = 0 ]; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "FAIL .*$WANT" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming $WANT ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit $code; $(grep -m1 -E "FAIL .*$WANT" "$OUT/$name.log" | sed -E 's/^ *//' | cut -c1-120)"
  fi
  mv "$file.orig" "$file"
}

# The both-channels rule (ada92b2): marketing stands in for sms too.
plant both-channels 'sms: flag\("sms"\) \?\? false' 'sms: flag("sms") ?? flag("marketing") ?? false'
# No marketing fallback: "Send me offers" counts for nothing.
plant no-fallback 'email: flag\("email"\) \?\? flag\("marketing"\) \?\? false' 'email: flag("email") ?? false'
# No type check: a string such as "yes" reads as consent.
plant no-type-check 'return typeof v === "boolean" \? v : undefined;' 'return v === undefined ? undefined : Boolean(v);'

echo "redproof-r71: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
