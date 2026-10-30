#!/usr/bin/env bash
# The one-business-per-build gate. For each business, a production build of apps/web with NEXT_PUBLIC_MUNIM_SITE=<id> (Cobnut's with
# the variable unset, as munim-cobnut builds it) into its own fresh dist dir (MUNIM_WEB_DIST_DIR=.next-build-<id>), then a grep of
# everything that build wrote, except cache/ (Turbopack's and tsc's caches: the .tsbuildinfo there lists every project file; never
# served or deployed), for the words of the businesses that build must not carry. A real business that has not agreed to be shown
# must never ship inside another's build (next.config.ts). Each build must also carry its own home page title (the build picked its
# own business) and its own name.
#   apps/web/scripts/bundle-isolation.sh [cobnut|blr_kitchen|snacky_shack ...]    (default: all three)
# Exit 0 clean; 1 when a build carries another business or misses its own; 2 on a failed build or a bad argument. The dist dirs are
# deleted on exit, and tsconfig.json and next-env.d.ts (next build rewrites both for its dist dir) are put back as they were.
set -euo pipefail
cd "$(dirname "$0")/.."

# What each build must not carry (extended regex, case-insensitive), its own name, and its home page's <title> (typed from
# lib/businesses/<id>/profile.ts meta.title).
forbidden() { case $1 in cobnut) echo 'snacky|shack|kosambari|bowlby|baloo' ;; blr_kitchen) echo 'snacky|shack|bowlby' ;; snacky_shack) echo 'kosambari|baloo' ;; esac; }
own() { case $1 in cobnut) echo 'Cobnut' ;; blr_kitchen) echo 'Kosambari' ;; snacky_shack) echo 'Snacky' ;; esac; }
title() {
  case $1 in
    cobnut) echo 'Cobnut Bakehouse — order ahead, pick up warm (sample shop)' ;;
    blr_kitchen) echo 'Kosambari Kitchens — dosas and filter coffee, order ahead (sample shop)' ;;
    snacky_shack) echo 'The Snacky Shack — smash burgers, real menu, synthetic history (sample shop)' ;;
  esac
}

if [ $# -eq 0 ]; then sites=(cobnut blr_kitchen snacky_shack); else sites=("$@"); fi
for s in "${sites[@]}"; do
  case $s in cobnut | blr_kitchen | snacky_shack) ;; *) echo "bundle-isolation: unknown business '$s' (cobnut, blr_kitchen, snacky_shack)" >&2; exit 2 ;; esac
done

keep=$(mktemp -d)
cp tsconfig.json "$keep/tsconfig.json"
if [ -f next-env.d.ts ]; then cp next-env.d.ts "$keep/next-env.d.ts"; fi
cleanup() {
  for s in "${sites[@]}"; do rm -rf ".next-build-$s"; done
  cp "$keep/tsconfig.json" tsconfig.json
  if [ -f "$keep/next-env.d.ts" ]; then cp "$keep/next-env.d.ts" next-env.d.ts; fi
  rm -rf "$keep"
}
trap cleanup EXIT

build() {
  if [ "$1" = cobnut ]; then
    env -u NEXT_PUBLIC_MUNIM_SITE MUNIM_WEB_DIST_DIR=".next-build-$1" node_modules/.bin/next build > "$keep/build-$1.log" 2>&1
  else
    env NEXT_PUBLIC_MUNIM_SITE="$1" MUNIM_WEB_DIST_DIR=".next-build-$1" node_modules/.bin/next build > "$keep/build-$1.log" 2>&1
  fi
}

fail=0
for s in "${sites[@]}"; do
  dist=.next-build-$s
  rm -rf "$dist"
  # Next 16.4.0 stops a fresh build once with a security-upgrade notice; the same command then continues (COMMON.md: never run the
  # upgrade). Any other failure is a failed build.
  if ! build "$s"; then
    if grep SecurityFatalError "$keep/build-$s.log" > /dev/null && build "$s"; then :; else
      echo "bundle-isolation: $s: next build failed; the end of its log:" >&2
      tail -n 25 "$keep/build-$s.log" >&2
      exit 2
    fi
  fi
  pattern=$(forbidden "$s")
  files=$(find "$dist" -path "$dist/cache" -prune -o -type f -print | wc -l | tr -d ' ')
  hits=$({ grep -rIoiE "$pattern" --exclude-dir=cache "$dist" || true; } | wc -l | tr -d ' ')
  mine=$({ grep -rIoF "$(own "$s")" --exclude-dir=cache "$dist" || true; } | wc -l | tr -d ' ')
  titled=$({ grep -oF "<title>$(title "$s")</title>" "$dist/server/app/index.html" || true; } | wc -l | tr -d ' ')
  fonts=$(find "$dist/static/media" -name '*.woff2' | wc -l | tr -d ' ')
  echo "$s: $files files scanned (cache/ excluded): $hits hits of /$pattern/i; own name \"$(own "$s")\" $mine; home title $titled; $fonts font files"
  if [ "$hits" -gt 0 ]; then
    echo "  FAIL: the $s build carries another business, in:"
    { grep -rIciE "$pattern" --exclude-dir=cache "$dist" || true; } | { grep -v ':0$' || true; } | sed -n '1,40p' | sed 's/^/    /'
    fail=1
  fi
  if [ "$files" -lt 100 ]; then echo "  FAIL: only $files files: not a whole build"; fail=1; fi
  if [ "$mine" -lt 1 ]; then echo "  FAIL: its own name is not in its own build"; fail=1; fi
  if [ "$titled" -lt 1 ]; then echo "  FAIL: its home page does not carry its own title"; fail=1; fi
  rm -rf "$dist"
done
if [ $fail -eq 0 ]; then echo "bundle-isolation: PASS (${sites[*]})"; else echo "bundle-isolation: FAIL" >&2; fi
exit $fail
