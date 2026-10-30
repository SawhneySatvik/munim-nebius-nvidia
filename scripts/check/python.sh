#!/usr/bin/env bash
# python.sh lint|typecheck: the Python half of `make lint` / `make typecheck` (T-041). Runs in every service with a
# pyproject.toml, even after one fails, and prints PASS/FAIL per service. Each service's pyproject.toml lists the
# paths ruff and mypy cover. `uv run --locked`: a lock that no longer matches pyproject.toml is a failure, never a
# silent re-lock.
set -uo pipefail
what=${1:-}
cd "$(dirname "$0")/../.."
root=$(pwd)
case "$what" in
  lint) cmds=("ruff check ." "ruff format --check .") ;;
  typecheck) cmds=("mypy") ;;
  *) echo "python.sh: usage: python.sh lint|typecheck" >&2; exit 2 ;;
esac

ran=0; failed=""; results=""
for p in "$root"/services/*/pyproject.toml; do
  [ -f "$p" ] || continue
  d=$(dirname "$p"); rel=${d#"$root"/}; ran=$((ran + 1)); ok=1
  for c in "${cmds[@]}"; do
    echo "python($what): $rel: $c"
    # shellcheck disable=SC2086 — each command is a fixed word list above
    uv run --locked --directory "$d" $c || ok=0
  done
  if [ $ok = 1 ]; then results="$results  PASS  $rel\n"; else results="$results  FAIL  $rel\n"; failed="$failed $rel"; fi
done
echo "--- python($what): per-service results"; printf "$results"
if [ $ran = 0 ]; then echo "python($what): FAIL — no services/*/pyproject.toml" >&2; exit 1; fi
if [ -n "$failed" ]; then echo "python($what): FAIL —$failed" >&2; exit 1; fi
echo "python($what): ok — $ran service(s)"
