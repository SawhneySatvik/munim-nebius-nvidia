#!/usr/bin/env bash
# Red-proof of the T-092a/b gates (test/read-routes.test.ts). No flags (gotcha 17); run from anywhere:
#   services/core-api/test/redproof-t092.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); the test file
# must then exit NON-ZERO (gotcha 33: judged by the process exit code, not by a failing line). The clean copy must exit 0 first.
# The copy regenerates contracts/generated (the test reads the OpenAPI document and the registry), so it never depends on a
# stale shared-tree artifact. Logs: scratchpad/redproof-t092/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t092"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t092-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude .claude "$src/" "$copy/"
for rel in $(cd "$src" && find . -maxdepth 4 -name node_modules -not -path "./scratchpad/*" -not -path "./.claude/*" -prune | sed 's|^\./||'); do
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$src/$rel" "$copy/$rel"
done
(cd "$copy/packages/contracts" && node scripts/gen.ts >"$OUT/gen.log" 2>&1 && node scripts/ontology.ts >>"$OUT/gen.log" 2>&1) || { echo "FAIL contracts gen in the copy (see $OUT/gen.log)"; exit 1; }
API="$copy/services/core-api"
TEST=test/read-routes.test.ts
fail=0
row() { printf '%-6s %-24s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && node_modules/.bin/vitest run "$TEST" >"$OUT/$1.log" 2>&1); }

row RESULT PLANT EXPECT
if run clean; then row ok clean "$TEST exit 0"; else row FAIL clean "$TEST exit 0 (see $OUT/clean.log)"; fail=1; fi

# plant <gate+name> <file under services/core-api> <perl regex> <replacement> [<regex> <replacement>]…
# Every regex must match EXACTLY once (0 = a stale anchor, >1 = ambiguous): either fails the red-proof, never a no-op.
plant() {
  local name=$1 file=$2 n
  shift 2
  cp "$API/$file" "$API/$file.orig"
  while [ $# -ge 2 ]; do
    n=$(PAT="$1" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$API/$file")
    if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $file"; fail=1; mv "$API/$file.orig" "$API/$file"; return; fi
    PAT="$1" REP="$2" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$API/$file"
    shift 2
  done
  run "$name"
  local code=$?
  if [ "$code" = 0 ]; then row FAIL "$name" "$TEST exited 0 with the plant in"; fail=1
  else row ok "$name" "$TEST exit $code ($(grep -c ' × ' "$OUT/$name.log") failing tests)"; fi
  mv "$API/$file.orig" "$API/$file"
}

R=src/lib/reads.ts
# gate 1 — outlet isolation
plant g1-rls-widened "$R" 'withContext\(c\.var\.deps\.pools\.core, contextOf\(memberOf\(c\)\), fn\)' 'withContext(c.var.deps.pools.core, contextOf({ ...memberOf(c), outlet_ids: "*" }), fn)'
plant g1-deal-scope-dropped src/modules/catalogue/routes.ts "FROM core\\.deal\\s+WHERE \\(\\\$1::uuid\\[\\] IS NULL OR outlet_ids = '\\{\\}' OR outlet_ids && \\\$1::uuid\\[\\]\\)" 'FROM core.deal WHERE (true)'
plant g1-transfer-either-end src/modules/inventory/routes.ts 'from_outlet_id = \$1 OR to_outlet_id = \$1' 'from_outlet_id = $1'
plant g1-cursor-ignored src/modules/orders/routes.ts 'AND \(\$6::uuid IS NULL OR o\.id < \$6\)' 'AND true'
plant g1-kind-filter-ignored src/modules/inventory/read.ts 'AND \(\$5::text IS NULL OR kind = \$5\)' 'AND true'
plant g1-ref-filter-ignored src/modules/inventory/read.ts 'AND \(\$6::uuid IS NULL OR ref_id = \$6\)' 'AND true'
plant g1-finance-open-to-managers src/modules/finance/routes.ts 'p\.kind !== "member" \|\| !ROLES\.has\(p\.role\) \|\| p\.outlet_ids !== "\*"' 'p.kind !== "member"'
plant g1-dst-utc-day src/modules/orders/routes.ts '\(\(w\.starts_at AT TIME ZONE ou\.tz\) - ou\.business_day_cutoff\)::date = \$2::date' "(w.starts_at AT TIME ZONE 'UTC')::date = \$2::date"
plant g1-pickup-cutoff-dropped src/modules/orders/routes.ts '\(\(w\.starts_at AT TIME ZONE ou\.tz\) - ou\.business_day_cutoff\)::date = \$2::date' '(w.starts_at AT TIME ZONE ou.tz)::date = $2::date'
plant g1-dst-waste-cutoff-dropped src/modules/inventory/routes.ts '\(\(w\.at AT TIME ZONE ou\.tz\) - ou\.business_day_cutoff\)::date = \$2\)' '(w.at AT TIME ZONE ou.tz)::date = $2)'
plant g1-dst-shift-cutoff-dropped src/modules/orders/routes.ts '\(\(s\.opened_at AT TIME ZONE ou\.tz\) - ou\.business_day_cutoff\)::date >= \$4\)' '(s.opened_at AT TIME ZONE ou.tz)::date >= $4)'
plant g1-dst-attendance-cutoff-dropped src/modules/people/routes.ts '\(\(a\.clock_in_at AT TIME ZONE ou\.tz\) - ou\.business_day_cutoff\)::date >= \$2\)' '(a.clock_in_at AT TIME ZONE ou.tz)::date >= $2)'
plant g1-platform-not-operator-only src/platform/index.ts 'router\.use\("/platform/v1/\*", requireOperator\);' ''
# gate 5b — staff-own privacy filters on the roster list and on attendance; wiki / conversations refuse staff
plant g5-roster-list-unfiltered src/modules/people/routes.ts 'AND \(NOT \$4::boolean OR EXISTS \(SELECT 1 FROM core\.roster_shift x WHERE x\.tenant_id = r\.tenant_id AND x\.roster_id = r\.id AND x\.staff_id = \$5::uuid\)\)' ''
plant g5-attendance-unfiltered src/modules/people/routes.ts 'AND \(NOT \$4::boolean OR a\.staff_id = \$5::uuid\) AND' 'AND'
plant g5-wiki-open-to-staff src/modules/findings/routes.ts 'memberOf\(c\)\.role === "staff"' 'false'
plant g5-conversations-open-to-staff src/modules/imports/routes.ts 'memberOf\(c\)\.role === "staff"' 'false'
# gate 2 — route-table diff
plant g2-route-dropped src/modules/orders/routes.ts '\.get\("/v1/shifts", requireMember' '.get("/v1/shiftz", requireMember'
plant g2-wiki-versions-dropped src/modules/findings/routes.ts '/versions`, requireMember' '/versionz`, requireMember'
# gate 3 — a real response parses against its contract
plant g3-response-type-changed src/modules/finance/routes.ts 'net_minor: Number\(s\.net_minor\), currency: s\.currency, created_at' 'net_minor: String(s.net_minor), currency: s.currency, created_at'
plant g3-extra-field src/modules/people/routes.ts 'staff_id: s\.staff_id, starts_at: s\.starts_at\.toISOString\(\)' 'staff_id: s.staff_id, wage: 1, starts_at: s.starts_at.toISOString()'
# gate 4 — a write verb is 405
plant g4-405-removed "$R" '405, \{ Allow: allow \}' '404, { Allow: allow }'
# gate 5 — a staff member's roster read returns only their own shifts
plant g5-staff-filter-removed src/modules/people/routes.ts 'AND \(NOT \$2::boolean OR staff_id = \$3::uuid\) ORDER BY starts_at' 'ORDER BY starts_at'
plant g5-null-id-means-everyone src/modules/people/routes.ts 'AND \(NOT \$2::boolean OR staff_id = \$3::uuid\) ORDER BY starts_at' 'AND ($3::uuid IS NULL OR staff_id = $3::uuid) ORDER BY starts_at'

if [ "$fail" = 0 ]; then echo "redproof-t092: every plant turned the gate red (non-zero exit); clean is green"; else echo "redproof-t092: FAILED"; fi
exit "$fail"
