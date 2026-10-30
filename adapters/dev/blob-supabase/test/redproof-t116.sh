#!/usr/bin/env bash
# Red-proof for the T-116 gates: blob-supabase's two-process gate and the shared BlobStore contract as both adapters run it
# (adapters/dev/blob-supabase/test, adapters/gcp/blob-gcs/test). Works only in a throwaway copy of the tree: copy green -> plant
# one defect -> the gate's run exits non-zero AND names the expected test -> restore. node_modules link back to the original,
# except the workspace packages (@munim/*), which link into THIS copy; nothing runs pnpm (gotcha 27).
#   adapters/dev/blob-supabase/test/redproof-t116.sh   (TMPDIR picks where the copy goes)
set -euo pipefail
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t116-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  if [ "$rel" = node_modules ]; then ln -s "$(cd "$nm" && pwd -P)" "$copy/node_modules"; continue; fi
  mkdir -p "$copy/$rel"
  for e in "$nm"/* "$nm"/.bin; do
    [ -e "$e" ] || continue
    if [ "$(basename "$e")" = "@munim" ]; then
      mkdir -p "$copy/$rel/@munim"
      for w in "$e"/*; do
        target=$(cd "$w" && pwd -P)
        ln -s "$copy/${target#"$(cd "$src" && pwd -P)"/}" "$copy/$rel/@munim/$(basename "$w")"
      done
    else
      ln -s "$e" "$copy/$rel/$(basename "$e")"
    fi
  done
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/.venv/*")

failures=0
# gate supabase|gcs: the adapter's whole suite; the run's output lands in $copy/.out.
gate() {
  case $1 in
    supabase) (cd "$copy/adapters/dev/blob-supabase" && node node_modules/vitest/vitest.mjs run) ;;
    gcs) (cd "$copy/adapters/gcp/blob-gcs" && node node_modules/vitest/vitest.mjs run) ;;
  esac > "$copy/.out" 2>&1
}
replace() {
  python3 - "$copy/$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
PY
}

# plant <label> <expected test name> <file under the repo> supabase|gcs <command...>
plant() {
  local label=$1 expect=$2 file=$3 which=$4
  shift 4
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif gate "$which"; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAIL ' "$copy/.out" | grep -qF -- "$expect"; then
    echo "  red:   exits non-zero and names '$expect':"
    grep -E 'FAIL ' "$copy/.out" | head -2 | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

T=adapters/dev/blob-supabase/test/two-process.test.ts
E=services/core-api/src/env-root.ts
B=services/core-api/src/blob-store.ts
A=adapters/dev/blob-supabase/index.ts
G=adapters/gcp/blob-gcs/index.ts
TWO="an upload through core-api here is parsed by a tick in another process"

echo "baseline:"
for g in supabase gcs; do
  if gate "$g"; then echo "  green $g: $(grep -E 'Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

plant "two-process: the second process points at an empty store" "$TWO" "$T" supabase \
  replace "$T" 'MUNIM_IDP: "supabase", SUPABASE_PROJECT_URL: standin.url,' 'MUNIM_IDP: "supabase", SUPABASE_PROJECT_URL: (await startStorageStandin({ secretKey: SECRET, bucket: BUCKET })).url,'
plant "env-root ignores MUNIM_BLOB (back to a per-instance directory)" "$TWO" "$E" supabase \
  replace "$E" 'const blobs = blobStoreFromEnv(config);' 'const blobs = blobStoreFromEnv({ ...config, blob: "fs" });'
plant "the chooser's dev-mapping branch is a per-process directory" "$TWO" "$B" supabase \
  replace "$B" '      return config.devAdapter("blob", config.blob) as BlobStore;' '      return localBlobStore(fsDir);'
plant "supabase adapter: no x-upsert (a re-put is refused)" "put twice overwrites with the new bytes" "$A" supabase \
  replace "$A" ', "x-upsert": "true" }' ' }'
plant "supabase adapter: Storage's 400-with-statusCode-404 not read as not found" "a missing key rejects: blob get: not found" "$A" supabase \
  replace "$A" 'if (res.status === 404 || (res.status === 400 && (await notFoundBody(res)))) throw' 'if (res.status === 404) throw'
plant "supabase adapter: the URL in the unreachable error" "an unreachable store rejects without leaking the URL" "$A" supabase \
  replace "$A" 'throw new Error(`blob ${what}: storage unreachable`);' 'throw new Error(`blob ${what}: storage unreachable at ${url}`);'
plant "supabase adapter: a key outside <tenant>/<sha256> sent anyway" "refuses a key that is not <tenant>/<sha256>, before any request" "$A" supabase \
  replace "$A" '    if (!KEY.test(key)) throw new Error("blob key is not <tenant>/<sha256>");' '    if (!KEY.test(key)) void 0;'
plant "gcs adapter (the shared contract runs there too): a missing object is a bare HTTP 404" "a missing key rejects: blob get: not found" "$G" gcs \
  replace "$G" '      if (res.status === 404) throw new Error("blob get: not found");' ''

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
