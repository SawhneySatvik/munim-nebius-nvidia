#!/usr/bin/env bash
# Red-proof of the T-093 gates (services/core-api/test/imports-t093.test.ts). No flags (gotcha 17):
#   services/core-api/test/redproof-t093.sh
# 1. The clean file must exit 0.
# 2. Per plant (MUNIM_T093_PLANT, read only by the test file), the file must exit non-zero (gotcha 33: judged by the
#    process exit code) AND its FAIL lines must name each gate the plant breaks.
# Logs: scratchpad/redproof-t093/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VITEST="$ROOT/services/core-api/node_modules/.bin/vitest"
OUT="$ROOT/scratchpad/redproof-t093"
mkdir -p "$OUT"
cd "$ROOT/services/core-api"
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }
run() { MUNIM_T093_PLANT="$2" "$VITEST" run test/imports-t093.test.ts >"$OUT/$1.log" 2>&1; }

row RESULT PLANT EXPECT
if run clean ""; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

# plant | ';'-separated test-name fragments that must each appear on a FAIL line (extended regex)
check() {
  local name="$1" want="$2" missing="" w
  if run "$name" "$name"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; return; fi
  IFS=';' read -ra wants <<<"$want"
  for w in "${wants[@]}"; do grep -E "FAIL .*($w)" "$OUT/$name.log" >/dev/null || missing="$missing [$w]"; done
  if [ -n "$missing" ]; then row FAIL "$name" "red, but no FAIL naming:$missing ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0; $(grep -cE '^ FAIL ' "$OUT/$name.log") FAIL lines, naming: $want"
  fi
}

check tender-shifted      "a 7-day log commits 7 closed shifts"
check control-matches     "a tender control-total mismatch is quarantined"
check late-movement-early "3 counts: 6 lines, 5 adjustments"
check draft-only-off      "an owner's own imports\.run\.commit\.v1 cannot write a shift"
check no-close            "a tender control-total mismatch is quarantined;bad rows are quarantined with their reasons;a month closed between the preview"
check replay-reset        "the commit is idempotent: the same key replays"
echo "redproof-t093: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
