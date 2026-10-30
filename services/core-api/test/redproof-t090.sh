#!/usr/bin/env bash
# Red-proof of the T-090 gates (test/ai-policy.test.ts). No flags (gotcha 17); run from anywhere:
#   services/core-api/test/redproof-t090.sh
# Each plant breaks one piece of the real module in a throwaway copy of the tree (the live tree is never touched); the
# test file must then exit NON-ZERO (gotcha 33: judged by the process exit code). The clean copy must exit 0 first.
# The copy mounts ai_policy in modules/index.ts if the tree does not yet (the registry line is the orchestrator's).
# Logs: scratchpad/redproof-t090/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t090"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t090-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude .claude "$src/" "$copy/"
for rel in $(cd "$src" && find . -maxdepth 4 -name node_modules -not -path "./scratchpad/*" -not -path "./.claude/*" -prune | sed 's|^\./||'); do
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$src/$rel" "$copy/$rel"
done
API="$copy/services/core-api"
grep -q '"ai_policy"' "$API/src/modules/index.ts" || perl -0777 -i -pe 's/  "traces",\n\] as const;/  "traces",\n  "ai_policy",\n] as const;/' "$API/src/modules/index.ts"
grep -q '"ai_policy"' "$API/src/modules/index.ts" || { echo "FAIL could not mount ai_policy in the copy"; exit 1; }
TEST=test/ai-policy.test.ts
fail=0
row() { printf '%-6s %-20s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && node_modules/.bin/vitest run "$TEST" >"$OUT/$1.log" 2>&1); }

row RESULT PLANT EXPECT
if run clean; then row ok clean "$TEST exit 0"; else row FAIL clean "$TEST exit 0 (see $OUT/clean.log)"; fail=1; fi

# plant <name> <file under services/core-api> <perl regex> <replacement> [<regex> <replacement>]…
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

P=src/modules/ai_policy/policy.ts
C=src/modules/ai_policy/commands.ts
I=src/modules/ai_policy/index.ts
plant staff-default-plan "$P" 'staff: "step"' 'staff: "plan"'
plant ceiling-never-refuses "$P" 'RANK\[mode\] > RANK\[await' 'RANK[mode] > 99 + RANK[await'
plant row-ignored "$P" 'return r\.rows\[0\]\?\.mode_ceiling \?\? defaultCeiling\(role\);' 'return defaultCeiling(role);'
plant cap-at-limit-refused "$C" 'BigInt\(p\.monthly_cap_minor\) > BigInt' 'BigInt(p.monthly_cap_minor) >= BigInt'
plant cap-check-removed "$C" 'if \(BigInt\(p\.monthly_cap_minor\) > BigInt\(limit\.limit_minor\)\) throw' 'if (false) throw'
plant budget-any-currency "$C" ' AND currency = \$1`, \[currency\]\);' '`, []);'
plant effective-is-limit "$P" 'effective_cap_minor: n\("effective_cap_minor"\)' 'effective_cap_minor: n("operator_limit_minor")'
# Core holds no role check of its own (the guard is the authority): the only way past it is a forged identity, role and scope.
plant manager-as-owner "$I" 'withContext\(pools\.core, contextOf\(m\), fn\)' 'withContext(pools.core, contextOf({ ...m, role: "owner", outlet_ids: "*" }), fn)' 'role: m\.role \}' 'role: "owner" }'
plant replay-is-new-command "$I" '    env\.data, handler\);' '    { ...env.data, idempotency_key: crypto.randomUUID() }, handler);'
plant audit-wrong-value "$C" 'after: \{ role: p\.role, mode_ceiling: p\.mode_ceiling \}' 'after: { role: p.role, mode_ceiling: "step" }'

if [ "$fail" = 0 ]; then echo "redproof-t090: every plant turned the gate red (non-zero exit); clean is green"; else echo "redproof-t090: FAILED"; fi
exit "$fail"
