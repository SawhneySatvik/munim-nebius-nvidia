#!/usr/bin/env bash
# Proves the business-graph export's gates can fail: each plant goes into a throwaway clone of this repo (committed there, so the
# export sees it as it sees any commit), the clone's export runs, and it must exit non-zero with the gate's own message. The
# clean clone must exit 0. This repo is never changed.   scripts/export-falkor/redproof.sh [plant-name…] (none = all)
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/munim-falkor-redproof.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

clone() {  # a clone of HEAD with this checkout's export scripts (they may be newer than HEAD)
  local d="$tmp/$1"
  git clone --quiet --no-local "$repo" "$d" && git -C "$d" checkout --quiet --detach "$(git -C "$repo" rev-parse HEAD)"
  rm -rf "$d/scripts/export-falkor" && cp -R "$here" "$d/scripts/export-falkor" && rm -rf "$d/scripts/export-falkor/__pycache__"
  cp "$repo/scripts/export-falkor.sh" "$d/scripts/export-falkor.sh"
  echo "$d"
}
commit() { git -C "$1" add -A && git -C "$1" -c user.name=plant -c user.email=plant@example.test -c commit.gpgsign=false commit --quiet --no-verify -m plant; }

# name ~ what to do in the clone (a shell snippet, run inside it; `commit` makes it part of HEAD) ~ the text the failure must name
PLANTS=(
  'word~printf "// asked %s%s about it\n" Cla ude > services/core-api/src/zz-plant.ts && commit .~source: 1 forbidden word'
  'secret~printf "export const k = \"%s-%s\";\n" nvapi 0123456789abcdefSYNTHETIC0123456789 > adapters/falkordb/test/zz-plant.ts && commit .~secrets: 1 secret-shaped'
  'env-file~printf "X=1\n" > services/core-api/.env && git add -f services/core-api/.env && commit .~1 .env or .run file'
  'cypher-drift~sed -i.bak "s/i.unit AS unit/i.unit AS units/" adapters/falkordb/cypher/read/ingredient.cypher && rm adapters/falkordb/cypher/read/ingredient.cypher.bak && commit .~cypher: 31 Cypher files, 31 cypher blocks in docs/cypher.md; 1 missing'
  'map-drift~sed -i.bak "s/The detector works: the Postgres templates read intel.edge, and now cannot./The detector works./" adapters/falkordb/test/core-api.test.ts && rm adapters/falkordb/test/core-api.test.ts.bak && commit .~did not apply as expected'
  'overlay-word~printf "\nThe founder wrote this.\n" >> scripts/export-falkor/root/docs/graph-model.md~overlay: 1 process word'
  'broken-link~printf "\n[gone](./docs/nope.md)\n" >> scripts/export-falkor/root/README.md~1 name no exported file'
  'keep-rule~sed -i.bak "/graph\/postgres\//d" scripts/export-falkor/rules.py && rm scripts/export-falkor/rules.py.bak~FAIL  left out: services/core-api/src/internal/graph/postgres/visible.sql'
  'overlay-collision~mkdir -p scripts/export-falkor/root/services/core-api && cp services/core-api/README.md scripts/export-falkor/root/services/core-api/README.md~would replace an exported file'
)

want=("$@")
failed=0
run() {  # name, snippet, expected text
  local d; d=$(clone "$1") || { echo "FAIL  $1: clone"; failed=1; return; }
  (cd "$d" && eval "$2") >/dev/null 2>&1 || { echo "FAIL  $1: the plant did not apply"; failed=1; return; }
  local out rc
  out=$(cd "$d" && scripts/export-falkor.sh --out "$tmp/out-$1" 2>&1); rc=$?
  if [ "$1" = clean ]; then
    if [ $rc -eq 0 ]; then echo "ok    clean: exit 0"; else echo "FAIL  clean: exit $rc"; echo "$out" | tail -5; failed=1; fi
  elif [ $rc -ne 0 ] && grep -qF -- "$3" <<<"$out"; then
    echo "ok    $1: exit $rc, names \"$3\""
  else
    echo "FAIL  $1: exit $rc, expected \"$3\""; echo "$out" | tail -5; failed=1
  fi
  rm -rf "$d" "$tmp/out-$1"
}
[ ${#want[@]} -eq 0 ] || [[ " ${want[*]} " == *" clean "* ]] && run clean ":" ""
for p in "${PLANTS[@]}"; do
  IFS='~' read -r name snippet text <<<"$p"
  [ ${#want[@]} -eq 0 ] || [[ " ${want[*]} " == *" $name "* ]] || continue
  run "$name" "$snippet" "$text"
done
[ $failed -eq 0 ] && echo "export-falkor redproof: ok" || { echo "export-falkor redproof: FAIL" >&2; exit 1; }
