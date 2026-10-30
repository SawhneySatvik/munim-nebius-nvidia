#!/usr/bin/env bash
# Red-proof of the T-040b gates (test/intel-batches.test.ts, test/run-frame.test.ts, intel's tests/watch/test_frame_source.py).
# No flags (gotcha 17); run from anywhere:   services/core-api/test/redproof-t040b.sh
# Each plant breaks one piece of the real code in a throwaway copy of the tree (the live tree is never touched); the named
# test file must then exit NON-ZERO (gotcha 33: judged by the process exit code) AND a FAIL line must name the gate. The
# clean copy must exit 0 first. Logs: scratchpad/redproof-t040b/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-t040b"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t040b-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude .claude \
  --exclude __pycache__ "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")
API="$copy/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
fail=0
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }
# run <log> <test>: a core-api vitest file, or (a .py path) intel's pytest.
run() {
  case "$2" in
    *.py) (cd "$copy/services/intel" && uv run --locked --with pytest==9.1.1 pytest -q "$2" >"$OUT/$1.log" 2>&1) ;;
    *) (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1) ;;
  esac
}

row RESULT PLANT EXPECT
for f in test/intel-batches.test.ts test/run-frame.test.ts tests/watch/test_frame_source.py; do
  if run "clean-$(basename "$f" | cut -d. -f1)" "$f"; then row ok clean "$f exit 0"; else row FAIL clean "$f exit 0 (see $OUT)"; fail=1; fi
done

# plant <name> <test file> <FAIL-line regex> <file under the repo> <perl regex> <literal replacement> [<file> <regex> <replacement>]…
# Every regex must match EXACTLY once (0 = a stale anchor, >1 = ambiguous): either fails the red-proof, never a no-op.
plant() {
  local name=$1 test=$2 want=$3 n f touched=()
  shift 3
  while [ $# -ge 3 ]; do
    f=$copy/$1
    [ -e "$f.orig" ] || { cp "$f" "$f.orig"; touched+=("$f"); }
    n=$(PAT="$2" perl -0777 -ne 'my $n = () = /$ENV{PAT}/g; print $n' "$f")
    if [ "$n" != 1 ]; then row FAIL "$name" "anchor matched $n time(s) in $1"; fail=1; for t in "${touched[@]}"; do mv "$t.orig" "$t"; done; return; fi
    PAT="$2" REP="$3" perl -0777 -i -pe 's/$ENV{PAT}/$ENV{REP}/' "$f"
    shift 3
  done
  if run "$name" "$test"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  elif ! grep -E "(FAIL|FAILED) .*($want)" "$OUT/$name.log" >/dev/null; then row FAIL "$name" "red, but no FAIL naming [$want] ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0, FAIL names [$want]"
  fi
  for t in "${touched[@]}"; do mv "$t.orig" "$t"; done
}

B=test/intel-batches.test.ts
F=test/run-frame.test.ts
BATCH=services/core-api/src/internal/batches.ts
FRAME=services/core-api/src/internal/frame.ts
DRAFTS=services/core-api/src/internal/drafts.ts

# (1) a retry must insert 0: without ON CONFLICT the second identical batch is not idempotent.
plant retry-not-idempotent $B "500 claims" $BATCH '\n       ON CONFLICT \(tenant_id, id\) DO NOTHING RETURNING 1\)' '
       RETURNING 1)'
# same id + another body must be 409, not a silent `existing`.
plant body-compare-off $B "the same id with another body" $BATCH 'if \(differ\.rows\[0\]!\.n > 0\) throw new ApiError\("idempotency_conflict"\);\n  const inserted' 'const inserted'
# (3) core.outlet is tenant-visible: without core's filter a 1-outlet run sees 3.
plant scope-filter-off $F "a run scoped to 1 of 3" $FRAME 'const inScope = run\.scope\[0\] === "\*" \? o\.rows : o\.rows\.filter\(\(r\) => \(run\.scope as string\[\]\)\.includes\(r\.id\)\);' 'const inScope = o.rows;'
# (4) the owner cap alone (not the lower of cap and limit) → the cap > limit hand value fails.
plant owner-cap-only $F "after 3 recorded spends" $FRAME 'hard_left_minor: cap\.left_minor,' 'hard_left_minor: (cap.owner_cap_minor ?? cap.operator_limit_minor) - cap.spent_minor,'
# (5) narration that ignores the budget → `model` at the cap.
plant narration-ignores-cap $F "at the cap" $FRAME 'aiOn && budget\?\.level === "ok"' 'aiOn && budget !== null'
# (5) a run refused at the cap (rules only must still be served).
plant refused-at-cap $F "at the cap" $FRAME '  const flag = await c\.query' '  if (budget?.level === "hard") throw new ApiError("forbidden");
  const flag = await c.query'
# (6) the outlet's cutoff ignored → business dates move (Kolkata 01:30 and both Melbourne transitions).
plant cutoff-ignored $F "canonical IN world|Melbourne" $FRAME 'businessDate\(at, r\.tz, r\.cutoff\)' 'businessDate(at, r.tz, "00:00")'
# (6, drafts) the prose-leaf grammar off → a note with a digit is proposed.
plant prose-grammar-off $B "a note with a digit" $DRAFTS 'if \(proseIn\(req\.command_type, req\.payload\)\.some' 'if (false && proseIn(req.command_type, req.payload).some'
# (7) the F8 enum AND core's registry check both off → pack `inventory` accepted (either alone still refuses it: 422).
# The copy's node_modules resolve @munim/contracts to the live tree, so the enum is bypassed where core-api parses: the
# body is parsed with a valid pack and the sent pack put back.
plant pack-unchecked $B "pack .inventory." \
  $DRAFTS 'const parsed = DraftsRequest\.safeParse\(raw\);' 'const parsed = DraftsRequest.safeParse({ ...(raw as object), pack: "catalogue" }); if (parsed.success) (parsed.data as { pack: string }).pack = (raw as { pack: string }).pack;' \
  $DRAFTS 'find\(\(x\) => x\.id === req\.pack && x\.kind === "specialist"\)' 'find((x) => x.kind === "specialist" && x.draftables.includes(req.command_type))'
# spend in another currency would escape the cap.
plant spend-currency-off $B "stamped by core" $BATCH 'if \(entries\.some\(\(e\) => e\.currency !== cur\.rows\[0\]!\.currency\)\) throw new ApiError\("currency_mismatch"\);' ''
# a forecast's inputs snapshot must be citable by the run, not only a row of the tenant.
plant forecast-snapshot-scope-off $B "a run and 2 points" $BATCH '\.status !== "ok"\) throw new ApiError\("cannot_verify", "unresolved_ref"\)' '.status === "never") throw new ApiError("cannot_verify", "unresolved_ref")'
# a wiki body is validated by core.
plant wiki-unvalidated $B "wiki: a cited body" $BATCH 'const v = await validateSegments\(p\.body, resolver\);' 'const v = { ok: true as const } as Awaited<ReturnType<typeof validateSegments>>;'
# intel: a served frame must become the run's Frame (a source that always answers None keeps every sweep idle).
plant intel-frame-none tests/watch/test_frame_source.py "test_a_served_frame" services/intel/munim_intel/watch/frame.py 'return frame_from_run_frame\(res\.json\(\)\)' 'return None'
# intel: an unexpected narration mode must not become a frame.
plant intel-narration-unchecked tests/watch/test_frame_source.py "test_anything_else" services/intel/munim_intel/watch/frame.py '    if narration not in \("model", "template"\):\n        raise ValueError\("narration"\)\n' ''

if [ "$fail" = 0 ]; then echo "redproof-t040b: every plant red with a non-zero exit, clean green"; else echo "redproof-t040b: FAILED"; fi
exit "$fail"
