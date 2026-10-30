#!/usr/bin/env bash
# pnpm-all.sh <script> [allow-none]: run <script> in EVERY workspace package that defines it, even after one fails
# (--no-bail; pnpm's default stops at the first failure and hides every later package — W1 fix #68,
# gotcha 33), then print one PASS/FAIL line per package and exit non-zero if any failed or none ran
# (with allow-none, none running prints SKIPPED instead — for lint, which no package defines yet).
set -uo pipefail
script=$1
allow_none=${2:-}
cd "$(dirname "$0")/../.."
root=$(pwd)
summary="$root/pnpm-exec-summary.json"   # where --report-summary writes; removed below
rm -f "$summary"

pnpm -r --no-bail --if-present --report-summary run "$script"
rc=$?

if [ ! -f "$summary" ]; then
  echo "pnpm-all($script): FAIL — pnpm wrote no execution summary (exit $rc)" >&2
  exit 1
fi
node -e '
  const [file, root, script, rc, allowNone] = process.argv.slice(1);
  const s = Object.entries(require(file).executionStatus ?? {});
  const ran = s.filter(([, v]) => v.status !== "queued" && v.status !== "skipped");
  const failed = ran.filter(([, v]) => v.status !== "passed");
  console.log(`--- ${script}: per-package results`);
  for (const [dir, v] of ran) console.log(`  ${v.status === "passed" ? "PASS" : "FAIL"}  ${dir.slice(root.length + 1) || "."}`);
  if (ran.length === 0 && allowNone === "allow-none" && rc === "0") { console.log(`${script}: SKIPPED — no workspace package defines it yet`); process.exit(0); }
  if (ran.length === 0) { console.error(`${script}: FAIL — no workspace package ran it`); process.exit(1); }
  if (failed.length || rc !== "0") {
    console.error(`${script}: FAIL — ${failed.length} of ${ran.length} package(s): ${failed.map(([d]) => d.slice(root.length + 1)).join(", ")}`);
    process.exit(1);
  }
  console.log(`${script}: ok — ${ran.length} package(s)`);
' "$summary" "$root" "$script" "$rc" "$allow_none"
out=$?
rm -f "$summary"
exit $out
