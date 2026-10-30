#!/usr/bin/env bash
# Proves the Nebius export's gates can fail: each plant goes into a throwaway clone of this repo (committed there, so the export sees
# it as it sees any commit), the clone's export runs, and it must exit non-zero with the gate's own message. The clean clone must exit
# 0. This repo is never changed.   scripts/export-nebius/redproof.sh [plant-name…] (none = all)
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/munim-nebius-redproof.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

clone() {  # a clone of HEAD (sharing this repo's objects, read only) with this checkout's export scripts (they may be newer than HEAD)
  local d="$tmp/$1"
  git clone --quiet --shared --no-checkout "$repo" "$d" && git -C "$d" checkout --quiet --detach "$(git -C "$repo" rev-parse HEAD)"
  rm -rf "$d/scripts/export-nebius" && cp -R "$here" "$d/scripts/export-nebius" && rm -rf "$d/scripts/export-nebius/__pycache__"
  cp "$repo/scripts/export-nebius.sh" "$d/scripts/export-nebius.sh"
  echo "$d"
}
commit() { git -C "$1" add -A && git -C "$1" -c user.name=plant -c user.email=plant@example.test -c commit.gpgsign=false commit --quiet --no-verify -m plant; }

# The Shack's words for the plants, from parts (the plant must be the only mention the gates can find).
SN="Sna""cky"; SH="Sha""ck"; sn="sna""cky"; DISH="Moo & Clu""ck"
# name ~ what to do in the clone (a shell snippet, run inside it; `commit` makes it part of HEAD) ~ the text the failure must name
PLANTS=(
  "shack-word~printf '// the %s %s menu\n' $SN $SH > services/core-api/src/zz-plant.ts && commit .~source: 2 forbidden word"
  "shack-path~printf 'export const x = 1;\n' > apps/web/lib/businesses/cobnut/${sn}-note.ts && commit .~(path)"
  "shack-dish~printf '{\"name\": \"%s Burger\"}\n' \"$DISH\" > tools/worldgen/src/zz-plant.json && commit .~source: 1 forbidden word"
  "shack-overlay~printf '\nAlso %s %s.\n' $SN $SH >> scripts/export-nebius/root/README.md~words: 2 forbidden word"
  'map-drift~sed -i.bak "s/\"blr_kitchen\", \"snacky_shack\"\] as const/\"blr_kitchen\", \"snacky_shack\", \"x\"] as const/" tools/worldgen/src/run.ts && rm tools/worldgen/src/run.ts.bak && commit .~no longer matches once'
  'secret~printf "export const k = \"%s-%s\";\n" nvapi 0123456789abcdefSYNTHETIC0123456789 > adapters/dev/env/zz-plant.ts && commit .~secrets: 1 secret-shaped'
  'env-file~printf "X=1\n" > services/core-api/.env && git add -f services/core-api/.env && commit .~1 .env or .run file'
  'licence~sed -i.bak "s/Version 2.0, January 2004/Version 2.0, January 2005/" scripts/export-nebius/root/LICENSE && rm scripts/export-nebius/root/LICENSE.bak~FAIL  licence: the Apache License 2.0 passes'
  'overlay-word~printf "\nThe founder wrote this.\n" >> scripts/export-nebius/root/README.md~overlay: 1 process word'
  'broken-link~printf "\n[gone](./docs/nope.md)\n" >> scripts/export-nebius/root/README.md~1 name no exported file'
  'keep-rule~sed -i.bak "/a real business, not shown without/d" scripts/export-nebius/rules.py && rm scripts/export-nebius/rules.py.bak~FAIL  left out: apps/web/lib/businesses/snacky_shack/profile.ts'
  'overlay-collision~mkdir -p scripts/export-nebius/root/services/core-api && cp services/core-api/README.md scripts/export-nebius/root/services/core-api/README.md~would replace an exported file'
)

want=("$@")
failed=0
run() {  # name, snippet, expected text
  local d; d=$(clone "$1") || { echo "FAIL  $1: clone"; failed=1; return; }
  (cd "$d" && eval "$2") >/dev/null 2>&1 || { echo "FAIL  $1: the plant did not apply"; failed=1; return; }
  local out rc
  out=$(cd "$d" && scripts/export-nebius.sh --out "$tmp/out-$1" 2>&1); rc=$?
  if [ "$1" = clean ]; then
    if [ $rc -eq 0 ]; then echo "ok    clean: exit 0"; else echo "FAIL  clean: exit $rc"; echo "$out" | tail -5; failed=1; fi
  elif [ $rc -ne 0 ] && grep -F -- "$3" <<<"$out" >/dev/null; then
    echo "ok    $1: exit $rc, names \"$3\""
  else
    echo "FAIL  $1: exit $rc, expected \"$3\""; echo "$out" | tail -5; failed=1
  fi
  rm -rf "$d" "$tmp/out-$1"
}
{ [ ${#want[@]} -eq 0 ] || [[ " ${want[*]} " == *" clean "* ]]; } && run clean ":" ""
for p in "${PLANTS[@]}"; do
  IFS='~' read -r name snippet text <<<"$p"
  [ ${#want[@]} -eq 0 ] || [[ " ${want[*]} " == *" $name "* ]] || continue
  run "$name" "$snippet" "$text"
done
[ $failed -eq 0 ] && echo "export-nebius redproof: ok" || { echo "export-nebius redproof: FAIL" >&2; exit 1; }
