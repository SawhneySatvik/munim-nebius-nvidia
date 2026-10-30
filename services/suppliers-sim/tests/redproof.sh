#!/usr/bin/env bash
# Red-proof for the suppliers-sim input bounds (C1 S3-5, R64 X-4: public, no secret, bounded inputs). No flags (gotcha 17).
# In a throwaway copy (the uv workspace root plus services/; the live tree is never touched), for each plant:
#   plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# The clean copy must be green first and again after the plants. Logs: the last failing run is printed.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-sim-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
mkdir -p "$copy/services"
cp "$src/pyproject.toml" "$src/uv.lock" "$copy/"
rsync -a --exclude node_modules --exclude .venv --exclude __pycache__ --exclude .mypy_cache --exclude .ruff_cache \
  --exclude .pytest_cache "$src/services/intel" "$src/services/suppliers-sim" "$copy/services/"
sim="$copy/services/suppliers-sim"
T=tests/test_sim.py
failures=0
run_pytest() { (cd "$sim" && uv run --quiet --frozen pytest -q -p no:warnings "$T") > "$copy/.out" 2>&1; }

# replace <file under services/suppliers-sim> <old> <new> [<old> <new> …]: each old exactly once, or the plant is broken.
replace() {
  python3 - "$sim/$1" "${@:2}" <<'EOF'
import sys
path, pairs = sys.argv[1], sys.argv[2:]
text = open(path, encoding="utf8").read()
for old, new in zip(pairs[::2], pairs[1::2]):
    if text.count(old) != 1:
        sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
    text = text.replace(old, new)
open(path, "w", encoding="utf8").write(text)
EOF
}

# plant <label> <expected test name> <file under services/suppliers-sim> <old> <new> [<old> <new> …]
plant() {
  local label=$1 expect=$2 file=$3
  shift 3
  echo "plant: $label"
  cp "$sim/$file" "$copy/.saved"
  if ! replace "$file" "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "FAILED $T::$expect" "$copy/.out"; then
    echo "  red:   exit non-zero, FAILED $expect"
  else
    echo "  FAIL: pytest is red but does not name $expect:"; tail -25 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$sim/$file"
}

echo "green first:"
if run_pytest; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red"; tail -30 "$copy/.out"; exit 1; fi

A=suppliers_sim/agent.py
P=suppliers_sim/app.py
plant "minor_unit unbounded" test_an_out_of_range_rfq_is_not_understood_and_echoes_nothing $A \
  'whole(msg.get("minor_unit"), 0, 3)' 'whole(msg.get("minor_unit"), -9, 10**8)' 'or mu not in MINOR_UNITS:' 'or mu is None:'
plant "item length unbounded" test_an_out_of_range_rfq_is_not_understood_and_echoes_nothing $A \
  'text(msg.get("item"))' 'str(msg.get("item"))'
plant "counter price unbounded" test_a_counter_out_of_range_is_not_understood_and_leaves_the_offer $A \
  'whole(msg.get("unit_price_minor"), 0, MAX_MINOR)' 'int(msg["unit_price_minor"])'
plant "offers never expire" test_open_offers_expire_and_are_capped $A 'if t - at >= OFFER_TTL_S]' 'if False]'
plant "offers never evicted" test_open_offers_expire_and_are_capped $A 'del self.offers[next(iter(self.offers))]' 'break'
plant "no body limit" test_a_body_over_the_limit_is_413_before_any_handler $P 'middleware=[Middleware(BodyLimit)]' 'middleware=[]'
plant "a chunked body is not counted" test_a_body_over_the_limit_is_413_before_any_handler $P 'if len(body) > self.limit:' 'if False:'

echo "after the plants:"
if run_pytest; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi
if [ $failures -ne 0 ]; then
  echo "sim-redproof: FAIL ($failures)" >&2
  exit 1
fi
echo "sim-redproof: ok — 7/7 plants red naming the expected test; green after restoring"
