#!/usr/bin/env bash
# Red-proof of the T-040 gates (test/intel-api.test.ts, test/routes-contract.test.ts, the router loader). No flags
# (gotcha 17); run from anywhere:   services/core-api/test/redproof-t040.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); the
# named test file must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND a FAIL line must name the
# gate. The clean copy must exit 0 first. Gate 10 is judged by booting the router loader itself.
# Logs: scratchpad/redproof-t040/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t040"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t040-redproof.XXXXXX")
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

row RESULT PLANT EXPECT
for f in test/intel-api.test.ts test/routes-contract.test.ts; do
  if run "clean-$(basename "$f" .test.ts)" "$f"; then row ok clean "$f exit 0"; else row FAIL clean "$f exit 0 (see $OUT)"; fail=1; fi
done

# plant <name> <file under services/core-api> <test file> <FAIL-line regex> <perl regex> <literal replacement> [<regex> <replacement>]…
# Every regex must match EXACTLY once (0 = a stale anchor, >1 = ambiguous): either fails the red-proof, never a no-op.
plant() {
  local name=$1 file=$2 test=$3 want=$4 n
  shift 4
  cp "$API/$file" "$API/$file.orig"
  while [ $# -ge 2 ]; do
    n=$(PAT="$1" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$API/$file")
    if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $file"; fail=1; mv "$API/$file.orig" "$API/$file"; return; fi
    PAT="$1" REP="$2" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$API/$file"
    shift 2
  done
  if run "$name" "$test"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "FAIL .*($want)" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming [$want] ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0, FAIL names [$want]"
  fi
  mv "$API/$file.orig" "$API/$file"
}

T=test/intel-api.test.ts
plant param-scope-off src/modules/evidence/mint.ts $T "an outlet param is intersected" \
  'if \(scope\[0\] !== "\*" && outlets\.some' 'if (false && outlets.some'
plant finding-registry-off src/internal/writes.ts $T '\(2\) a bare number' \
  '\|\| !SPECIALIST_REGISTRY\.specialists\.some\(\(x\) => x\.id === req\.pack && x\.kind === "specialist"\)\)' ')'
plant validator-off src/internal/writes.ts $T '\(1\) a valid finding' \
  ': await validateFinding\(req\.envelope, dbResolver\(c, run\.scope\)\);' ': { ok: true as const };'
plant bare-numbers src/internal/drafts.ts $T '\(2\) a bare number' \
  'const parsed = DraftsRequest\.safeParse\(raw\);' 'const parsed = { success: true, data: raw } as ReturnType<typeof DraftsRequest.safeParse>;'
plant snap-resolves-all src/internal/resolver.ts $T '\(3\) a ref into another tenant' \
  '\? OK : MISSING;\n        \}\n        case "snapshot"' '|| true ? OK : MISSING;
        }
        case "snapshot"'
plant snap-outlet-rule src/internal/resolver.ts $T '\(3\) a ref into another tenant' \
  'const covered = s !== null && \(scope\[0\] === "\*" \|\|' 'const covered = s !== null && (true ||'
plant traces-unsorted src/internal/writes.ts $T '\(4\)|500 events' \
  '\.sort\(\(a, b\) => a\.seq - b\.seq\)' '' '\n        ORDER BY e\.seq`' '`'
plant registry-off src/internal/drafts.ts $T '\(2\) a bare number' \
  'if \(!specialist\?\.draftables\.includes\(req\.command_type\) && !specialist\?\.workflow_draftables\.includes\(req\.command_type\)\) throw' 'if (false) throw'
plant same-id-replay src/internal/drafts.ts $T '\(5\) same id' \
  'if \(same\.rows\[0\]\) \{' 'if (false) {'
plant no-open-merge src/internal/drafts.ts $T '\(6\) the same proposal' \
  'if \(hit\?\.open\) return' 'if (false) return'
plant reject-window-0 src/internal/drafts.ts $T '\(7\) a person rejects' \
  'const REJECTION_WINDOW = "30 days";' 'const REJECTION_WINDOW = "0 days";'
plant reject-window-10y src/internal/drafts.ts $T '\(7\) a person rejects' \
  'const REJECTION_WINDOW = "30 days";' 'const REJECTION_WINDOW = "3650 days";'
plant findings-all-outlets src/modules/findings/index.ts $T 'GET /v1/findings' \
  'withContext\(c\.var\.deps\.pools\.core, contextOf\(m\), async \(db\) => \{\n    const r = await db\.query<FindingRow' 'withContext(c.var.deps.pools.core, { ...contextOf(m), outlet_ids: "*" }, async (db) => {
    const r = await db.query<FindingRow'
plant snapshot-any-outlet src/modules/evidence/mint.ts $T 'GET /v1/snapshots' \
  'if \(m\.outlet_ids !== "\*" && \(s\.outlet_scope' 'if (false && (s.outlet_scope'
plant runs-all-outlets src/modules/runs/index.ts $T 'GET /v1/runs' \
  'return c\.json\(await withContext\(c\.var\.deps\.pools\.core, contextOf\(m\)' 'return c.json(await withContext(c.var.deps.pools.core, { ...contextOf(m), outlet_ids: "*" }'
plant traces-all-outlets src/modules/traces/index.ts $T 'GET /v1/traces' \
  'withContext\(c\.var\.deps\.pools\.core, contextOf\(m\)' 'withContext(c.var.deps.pools.core, { ...contextOf(m), outlet_ids: "*" }'
plant route-renamed src/internal/index.ts test/routes-contract.test.ts 'documented ⊆ mounted|mounted ⊆ documented' \
  '\$\{P\}/model-roles`' '${P}/model-role`'

# Gate 10: a router directory listed in modules/index.ts but missing must stop the boot. Control: the W2 loader
# (`continue` on a missing file) boots the same tree silently — the defect this gate exists for.
# Expected router counts come from the MODULES list itself (+ stream, internal, platform), never a literal that drifts.
ROUTERS=$(( $(awk '/^export const MODULES = \[/{f=1; next} f && /^\]/{exit} f && /^  "/{n++} END{print n+0}' "$API/src/modules/index.ts") + 3 ))
boot() { (cd "$API" && node -e 'import("./src/modules/index.ts").then((m) => m.loadRouters()).then((r) => console.log("booted", r.length))' >"$OUT/$1.log" 2>&1); }
mv "$API/src/modules/traces" "$API/src/modules/traces.removed"
if boot gate10; then row FAIL gate10-boot "booted with modules/traces missing ($OUT/gate10.log)"; fail=1
elif ! grep -q "modules/traces/index.ts is listed" "$OUT/gate10.log"; then row FAIL gate10-boot "failed for another reason ($OUT/gate10.log)"; fail=1
else row ok gate10-boot "exit≠0: modules/traces/index.ts is listed … but does not exist"
fi
cp "$API/src/modules/index.ts" "$API/src/modules/index.ts.orig"
perl -0777 -i -pe 's/if \(!existsSync\(file\)\) throw new Error\([^;]*\);/if (!existsSync(file)) continue;/' "$API/src/modules/index.ts"
if boot gate10-control && grep -qx "booted $((ROUTERS - 1))" "$OUT/gate10-control.log"; then row ok gate10-ctl "W2 loader: exit 0, $((ROUTERS - 1)) routers (silent)"
else row FAIL gate10-ctl "the W2 loader did not boot silently ($OUT/gate10-control.log)"; fail=1
fi
mv "$API/src/modules/index.ts.orig" "$API/src/modules/index.ts"
mv "$API/src/modules/traces.removed" "$API/src/modules/traces"
if boot gate10-clean && grep -qx "booted $ROUTERS" "$OUT/gate10-clean.log"; then row ok gate10-clean "exit 0, $ROUTERS routers"; else row FAIL gate10-clean "($OUT/gate10-clean.log)"; fail=1; fi

echo "redproof-t040: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
