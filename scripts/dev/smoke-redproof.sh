#!/usr/bin/env bash
# Red-proof for the W1 smoke (T-009): each plant breaks one piece of the real wiring in a throwaway copy of the
# tree; `node --test tests/smoke/smoke.test.ts` must then exit non-zero AND name the expected failing test.
# A clean copy must exit 0 first. The live tree (and other lanes' files) is never touched; the copy has no .env.
set -euo pipefail
src=$(cd "$(dirname "$0")/../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-smoke-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

failures=0
run() { (cd "$copy" && node --test tests/smoke/smoke.test.ts > "$copy/.out" 2>&1); }

echo "baseline (clean copy):"
if run; then echo "  green: exit 0, $(grep -c '^ok ' "$copy/.out") ok"; else echo "  FAIL: clean copy is red"; grep -E '^(not )?ok ' "$copy/.out"; failures=$((failures+1)); fi

# plant <label> <file> <perl regex> <literal replacement> <failing test prefix>
# The regex must match EXACTLY once in the file (0 = a stale anchor, >1 = an ambiguous one): either is a gate
# failure, never a silent no-op. The replacement is inserted literally (no interpolation).
plant() {
  local label=$1 file=$2 pat=$3 rep=$4 expect=$5 n
  n=$(PAT="$pat" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$copy/$file")
  if [ "$n" != 1 ]; then
    echo "plant: $label — FAIL: anchor matched $n time(s) in $file (expected exactly 1)"; failures=$((failures+1)); return
  fi
  cp "$copy/$file" "$copy/$file.orig"
  PAT="$pat" REP="$rep" perl -0777 -pi -e 's/$ENV{PAT}/$ENV{REP}/' "$copy/$file"
  set +e; run; rc=$?; set -e
  if [ $rc -ne 0 ] && grep -q "^not ok .* - $expect" "$copy/.out"; then
    echo "plant: $label — red: exit $rc; $(grep '^not ok ' "$copy/.out" | tr '\n' ' ')"
  else
    echo "plant: $label — FAIL: exit $rc, expected '$expect' to fail"; grep -E '^(not )?ok ' "$copy/.out" | sed 's/^/    /'; failures=$((failures+1))
  fi
  mv "$copy/$file.orig" "$copy/$file"
}

plant "core-api publisher wired to a dead URL" services/core-api/src/server.ts \
  'createHttpPublisher\(\{ url: w\.intelUrl' 'createHttpPublisher({ url: "http://127.0.0.1:9"' "S2 "
plant "core-api LISTEN not configured (stream falls back, never opens on this URL)" services/core-api/src/server.ts \
  'connectionString: w\.listenUrl' 'connectionString: "postgresql://nobody@127.0.0.1:9/x"' "S2 "
plant "/health reports one version below the highest applied" services/core-api/src/health/index.ts \
  'SELECT max\(version\)::int AS version' 'SELECT max(version)::int - 1 AS version' "S1 "
plant "worker publisher wired to a dead URL" services/core-worker/src/main.ts \
  'createHttpPublisher\(\{ url: w\.intelUrl' 'createHttpPublisher({ url: "http://127.0.0.1:9"' "S3 "
plant "event runs tenant-wide (outlet-scope ruling #18 dropped in outbox.ts)" services/core-api/src/commit/outbox.ts \
  'if \(typeof data\?\.outlet_id === "string"' 'if (false && typeof data?.outlet_id === "string"' "S3 "
# b-7's validated plant: drop the minter's `end` (endRun), so the fan-out cannot end its runs.
plant "fan-out runs never ended" services/core-worker/src/main.ts \
  '    end: \(tenantId, runId\) => endRun\(\{ svc \}, tenantId, runId\),\n' '' "S4 "

echo "smoke red-proof: $failures failure(s)"
exit $failures
