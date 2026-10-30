#!/usr/bin/env bash
# make eval-w3 (T-085): the W3 eval harness with per-specialist reporting (ledger F8 d).
#   measure stage  services/intel/tests/evals/measure.py  seeds the four worlds once and writes .run/eval-w3/measured.json
#   gate stage     evals/w3/gate.py                       prints the tables and exits non-zero on any red
#   evals/w3/run.sh --gate-only                           re-run the gate on the last measurement (the red-proofs use this)
# Recorded models only; the replies are synthetic, so this measures plumbing and the detectors against the answer keys.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
export MUNIM_MODEL_MODE=recorded
export EVAL_W3_OUT="${EVAL_W3_MEASURED:-$root/.run/eval-w3/measured.json}"
export EVAL_W3_MEASURED="$EVAL_W3_OUT"
start=$(date +%s)
cd "$root/services/intel"
case "${1:-}" in
  "") rm -f "$EVAL_W3_OUT"; uv run --frozen python tests/evals/measure.py ;;
  --gate-only) ;;
  *) echo "eval-w3: unknown argument '$1'" >&2; exit 2 ;;
esac
status=0
uv run --frozen python "$root/evals/w3/gate.py" || status=$?
echo "eval-w3 wall time: $(( $(date +%s) - start ))s (exit $status)"
exit "$status"
