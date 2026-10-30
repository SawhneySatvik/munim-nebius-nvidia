#!/usr/bin/env bash
# Red-proof of the T-087b gates (test/specialists.test.ts). No flags (gotcha 17); run from anywhere:
#   services/core-api/test/redproof-t087b.sh
# Needs the tree to have `specialists` in modules/index.ts MODULES and a regenerated contracts (the clean run is the
# first check and fails loudly otherwise). Each plant breaks one piece of the real router in a throwaway copy; the test
# file must then exit NON-ZERO (gotcha 33) AND a FAIL line must name the gate. Every anchor must match exactly once.
# Logs: scratchpad/redproof-t087b/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t087b"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t087b-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude .claude "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")
API="$copy/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
fail=0
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1); }
T=test/specialists.test.ts
F=src/modules/specialists/index.ts

row RESULT PLANT EXPECT
if run clean "$T"; then row ok clean "$T exit 0"; else row FAIL clean "$T exit 0 (see $OUT/clean.log)"; fail=1; fi

# plant <name> <FAIL-line regex> <perl regex> <literal replacement>
plant() {
  local name=$1 want=$2 n
  cp "$API/$F" "$API/$F.orig"
  n=$(PAT="$3" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$API/$F")
  if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $F"; fail=1; mv "$API/$F.orig" "$API/$F"; return; fi
  PAT="$3" REP="$4" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$API/$F"
  if run "$name" "$T"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "FAIL .*($want)" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming [$want] ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0, FAIL names [$want]"
  fi
  mv "$API/$F.orig" "$API/$F"
}

plant raw-count-in-track-record "\\(3\\)" 'track = \{ snapshot_id: snap.snapshot_id, cells' 'track = { snapshot_id: snap.snapshot_id, proposed: Number(snap.rows[0]?.proposed), cells'
plant team-drops-a-desk "\\(1\\)" 's.kind !== "service"\);' 's.kind !== "service" && s.id !== "people");'
plant unknown-is-200 "\\(5\\)" 'if \(!entry\) throw new ApiError\("not_found"\);' 'if (!entry) return c.json({}, 200);'
plant desk-ignores-pack "\\(2\\)" "WHERE f.pack = \\\$1 AND f.status = 'open'" "WHERE \\\$1::text IS NOT NULL AND f.status = 'open'"
plant outlet-scope-bypass "\\(4\\)" 'withContext\(pools.core, contextOf\(m\), async \(db\) => \{\n      // Kitchen' 'withContext(pools.core, { ...contextOf(m), outlet_ids: "*" }, async (db) => {'$'\n''      // Kitchen'
plant kitchen-always-applicable "\\(5\\)" 'const applicable = entry.id !== "kitchen" \|\|' 'const applicable = true ||'

exit $fail
