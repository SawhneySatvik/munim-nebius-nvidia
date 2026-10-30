#!/usr/bin/env bash
# Runs a heavy command (make check, make test-db, red-proof suites, next build, full pytest, renders) in one of two shared
# slots across every lane on this machine (R62 S-4: at most two heavy runs at once). Usage: scripts/dev/heavy.sh <command…>
set -u
BASE="${TMPDIR:-/tmp}/munim-heavy.lock"
SLOTS=("$BASE" "$BASE.2")
waited=0
lock=""
while [ -z "$lock" ]; do
  for s in "${SLOTS[@]}"; do
    if mkdir "$s" 2>/dev/null; then lock="$s"; break; fi
    # A slot left by a dead process is cleared (the owner's PID is recorded inside).
    owner=$(cat "$s/pid" 2>/dev/null || echo "")
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -rf "$s"; fi
  done
  if [ -z "$lock" ]; then
    [ $((waited % 60)) -eq 0 ] && echo "heavy: both slots busy, waiting ($waited s)" >&2
    sleep 5; waited=$((waited + 5))
  fi
done
echo $$ > "$lock/pid"
trap 'rm -rf "$lock"' EXIT INT TERM
"$@"
