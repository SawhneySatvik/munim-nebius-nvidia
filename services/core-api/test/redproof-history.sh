#!/usr/bin/env bash
# Red-proof of the h-1 history-import gates (services/core-api/test/imports-history.test.ts). No flags (gotcha 17):
#   services/core-api/test/redproof-history.sh
# 1. The clean file must exit 0.
# 2. Per plant (MUNIM_H1_PLANT, read only by the test file), the file must exit non-zero (gotcha 33: judged by the
#    process exit code) AND its FAIL lines must name each gate the plant breaks.
# Logs: scratchpad/redproof-history/ (git-ignored).
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VITEST="$ROOT/services/core-api/node_modules/.bin/vitest"
OUT="$ROOT/scratchpad/redproof-history"
mkdir -p "$OUT"
cd "$ROOT/services/core-api"
fail=0
row() { printf '%-6s %-16s %s\n' "$1" "$2" "$3"; }
run() { MUNIM_H1_PLANT="$2" "$VITEST" run test/imports-history.test.ts >"$OUT/$1.log" 2>&1; }

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

check book-row-early "> synthetic_bills_1\.csv"
check draft-only-off "an owner's own imports\.run\.commit\.v1"
check item-exists    "> synthetic_bills_2\.csv"
check no-close       "> synthetic_waste_1\.csv;a month closed between the preview and the approval"
check equivalence    "bills_1 \+ waste_1"
check seams-timing   "1,000 POS bills"
check svc-execute    "core\.write_derived: munim_svc may not call it"
echo "redproof-history: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
