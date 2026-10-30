#!/usr/bin/env bash
# Proves the site's vitest gates can fail: each plant goes into a fresh temp copy of apps/site (plus the two inputs it
# reads: pnpm-workspace.yaml, tsconfig.base.json, public.json) and `vitest run` must exit non-zero naming the expected test.
# A clean copy must exit 0. Usage: apps/site/scripts/redproof.sh
set -uo pipefail
site=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$site/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fresh() {
  rm -rf "$work/copy"
  mkdir -p "$work/copy/apps" "$work/copy/packages/contracts/generated/openapi" "$work/copy/docs"
  cp "$repo/pnpm-workspace.yaml" "$repo/tsconfig.base.json" "$work/copy/"
  cp "$repo/packages/contracts/generated/openapi/public.json" "$repo/packages/contracts/generated/openapi/internal.json" "$work/copy/packages/contracts/generated/openapi/"
  rsync -a --exclude node_modules --exclude .next --exclude /mock --exclude /app/mock "$site/" "$work/copy/apps/site/"
  ln -s "$site/node_modules" "$work/copy/apps/site/node_modules"
}

run() { (cd "$work/copy/apps/site" && node_modules/.bin/vitest run test/ 2>&1); }

fail=0
check() { # name, expected failing test (substring), python edit
  local name=$1 expect=$2 edit=$3
  fresh
  (cd "$work/copy/apps/site" && python3 -c "$edit") || { echo "REDPROOF $name: plant did not apply" >&2; fail=1; return; }
  out=$(run); rc=$?
  if [ $rc -ne 0 ] && grep -q -- "$expect" <<<"$out"; then
    echo "PASS  $name — vitest exit $rc, failing: $(grep -m1 -- "$expect" <<<"$out" | sed 's/^ *//')"
  else
    echo "FAIL  $name — vitest exit $rc; expected a failure naming '$expect'" >&2
    fail=1
  fi
}

# helper for the python edits: replace exactly once or exit 1
R='import sys
def sub(path, old, new):
    s = open(path).read()
    if s.count(old) != 1: sys.exit(f"{path}: anchor found {s.count(old)} times")
    open(path, "w").write(s.replace(old, new))
def sub_all(path, old, new):
    s = open(path).read()
    if s.count(old) < 1: sys.exit(f"{path}: anchor not found")
    open(path, "w").write(s.replace(old, new))
'

fresh
out=$(run); rc=$?
if [ $rc -eq 0 ]; then echo "PASS  clean copy — vitest exit 0"; else echo "FAIL  clean copy — vitest exit $rc" >&2; echo "$out" | tail -20 >&2; fail=1; fi

check "raw HTML path in Markdown" "in a paragraph" "$R
sub('components/Markdown.tsx', 'return <p key={key}>{inlines(b.c)}</p>;', 'return <p key={key} dangerouslySetInnerHTML={{ __html: b.c.map((i) => (i.t === \"text\" ? i.v : \"\")).join(\"\") }} />;')"

check "javascript: link allowed" "javascript:alert(1) gets no href" "$R
sub('lib/markdown.ts', 'if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith(\"//\") || href === \"\") return null;', 'if (href === \"\") return null; if (/^[a-z]+:/i.test(href)) return href;')"

check "an operation dropped from the reference" "every operation is placed in exactly one section" "$R
sub('lib/openapi.ts', '    .map(({ op }) => op);', '    .map(({ op }) => op).slice(0, -1);')"

check "a path family falls into 'other'" "none left in 'other'" "$R
sub('lib/openapi.ts', 'keys: [\"kitchen\"] }', 'keys: [] }')"

check "Cares label removed" "/cares carries the Cares labels literally" "$R
sub_all('app/cares/page.tsx', 'Recorded, never processed', 'Recorded')"

check "hard-coded contact fallback" "unset or malformed" "$R
sub('lib/contact.ts', 'return EMAIL.test(v) ? v : null;', 'return EMAIL.test(v) ? v : \"hello@example.com\";')"

check "money figure on the landing page" "shows no money figures" "$R
sub('app/page.tsx', 'Each feature says honestly where it stands today.', 'Each feature says honestly where it stands today. Owners found ₹40,000 a month.')"

check "served document re-pruned by \$ref" "is public.json as generated" "$R
sub('lib/openapi.ts', 'return spec;\n}\n\n/** The shared', 'return { ...spec, components: { ...spec.components, schemas: Object.fromEntries(Object.entries(spec.components.schemas).filter(([k]) => k !== \"StreamEvent\")) } };\n}\n\n/** The shared')"

check "StreamEvent page dropped" "has a page" "$R
sub('lib/openapi.ts', 'return Object.keys(spec.components.schemas);', 'return Object.keys(spec.components.schemas).filter((k) => k !== \"StreamEvent\");')"

check "stream op back to 'No body.'" "event-stream body" "$R
sub('components/Operation.tsx', 'r.media === \"text/event-stream\"', 'false')"

check "Australia 'flip' copy back" "no 'flip' or 'switching'" "$R
sub('app/page.tsx', 'Australia on its own country pack', 'Australia by a country-pack flip')"

check "Cares illustration shows best before today" "nothing expiring today" "$R
sub('app/cares/page.tsx', 'Packaged bread rolls, best before in 3 days', 'Bread rolls, best before today')"

check "Cares status back to 'In progress'" "Cares is 'Built · screens in progress'" "$R
sub('app/cares/page.tsx', '<StatusChip status=\"built\" />', '<StatusChip status=\"progress\" />')"

[ $fail -eq 0 ] && echo "redproof: ok" || { echo "redproof: FAIL" >&2; exit 1; }
