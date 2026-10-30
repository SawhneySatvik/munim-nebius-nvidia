#!/bin/bash
# Red-proof of the W3.2 review fix cycle 1 gates (core side: R-A 1–4, 6–10, R-B S1-C/S1-D, and the R-A 8 plants for
# intel-payroll-scope and workflow gate 8). No flags (gotcha 17); run from anywhere:
#   services/core-api/test/redproof-w32fix.sh
# Works on a throwaway copy of the tree (the live tree is never touched). The copy gets its OWN per-package node_modules
# (relative @munim symlinks resolve inside the copy). Each test file must exit 0 clean first; each plant must then exit
# NON-ZERO (gotcha 33) AND leave a FAIL line naming the gate. Every anchor must match EXACTLY once.
# Logs: scratchpad/redproof-w32fix/ (git-ignored).
set -u
src="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$src/scratchpad/redproof-w32fix"
mkdir -p "$OUT"
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-w32fix-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env --exclude scratchpad --exclude .claude "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  cp -a "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")
ln -s "$src/node_modules" "$copy/node_modules"
API="$copy/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
fail=0
row() { printf '%-6s %-24s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && "$VITEST" run "$2" >"$OUT/$1.log" 2>&1); }

G=test/intel-graph.test.ts
D=test/intel-drafts-w32.test.ts
P=test/intel-payroll-scope.test.ts
B=test/intel-batches.test.ts
I=test/imports-t093.test.ts
F=test/finance-month.test.ts
L=test/lineage.test.ts

row RESULT PLANT EXPECT
for f in $G $D $P $B $I $F $L; do
  if run "clean-$(basename "$f" .test.ts)" "$f"; then row ok clean "$f exit 0"; else row FAIL clean "$f exit 0 (see $OUT)"; fail=1; fi
done

# plant <name> <file relative to services/core-api> <test file> <FAIL-line regex> <perl regex> <replacement> [<regex> <replacement>]…
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

V=src/internal/graph/postgres/visible.sql
# R-A 1: every node visible to an outlet-scoped run (the pre-fix graph) → outlet 2's rows come back.
plant graph-nodes-open       $V $G '\(4\) neighbourhood of ghee|\(4\) price_shock_path|\(4\) claim_support|\(4\) a start node' \
  'WHERE :outlet_ids::uuid\[\] IS NULL\n      OR e\.kind' 'WHERE true OR e.kind'
# R-A 1: edges to nodes the run may not see kept → a hidden finding's claim and a hidden customer come back.
plant graph-hidden-ends      $V $G '\(4\) claim_support' \
  '    JOIN vnode s ON s\.id = g\.src_entity_id\n    JOIN vnode d ON d\.id = g\.dst_entity_id' '    LEFT JOIN vnode s ON s.id = g.src_entity_id
    LEFT JOIN vnode d ON d.id = g.dst_entity_id'
# R-A 1: the outlet-anchored kinds (sold, wasted, works_at) without an outlet end → outlet 2's waste day comes back.
plant graph-anchor-off       $V $G '\(4\) neighbourhood of ghee' \
  " OR g\.kind NOT IN \('sold', 'wasted', 'works_at'\) OR 'outlet' IN \(s\.kind, d\.kind\)\)" ' OR true)'
# R-A 1: both of the above → a hidden outlet bridges to an item reached only through it.
plant graph-bridge           $V $G '\(4\) a start node' \
  '    JOIN vnode s ON s\.id = g\.src_entity_id\n    JOIN vnode d ON d\.id = g\.dst_entity_id' '    LEFT JOIN vnode s ON s.id = g.src_entity_id
    LEFT JOIN vnode d ON d.id = g.dst_entity_id' \
  " OR g\.kind NOT IN \('sold', 'wasted', 'works_at'\) OR 'outlet' IN \(s\.kind, d\.kind\)\)" ' OR true)'
# R-A 9: the deleted `--` strip put back → comments no longer reach the statement.
plant graph-comment-strip    src/internal/graph/postgres/index.ts $G '\(5\) comments are kept' \
  'readFileSync\(new URL\(`\.\/\$\{name\}\.sql`, import\.meta\.url\), "utf8"\)\.trim\(\)' 'readFileSync(new URL(`./${name}.sql`, import.meta.url), "utf8").replace(/--.*$/gm, "").trim()'
# R-A 4: invoice_no excepted whatever its shape.
plant invoice-shape-off      src/internal/drafts.ts $D 'invoice_no' \
  '\n      \|\| identifiersIn\(req\.command_type, req\.payload\)\.some\(\(t\) => !IDENTIFIER\.test\(t\)\)\)' ')'
# R-B S1-B / S1-D: the customers specialist may propose campaigns and coupons again.
plant campaign-open          ../../packages/contracts/src/intel/specialists.ts $D 'campaign' \
  '\[\](?=,\n    \),\n    e\(\n      "compliance",)' '["customers.campaign.create.v1", "catalogue.coupon.set.v1"]'
# R-A 8: payroll outside the pack's payroll_scope admitted.
plant payroll-scope-off      src/internal/drafts.ts $P 'AU \(roster_only\)' \
  'if \(PAYROLL\.has\(req\.command_type\) && \(await payrollScope\(c\)\) !== "drafts"\)' 'if (false)'
# R-A 8: gate 8 — a workflow type admitted from any pack that lists it, not only the proposer's. The contracts' based_on
# rule refuses it too, so (as redproof-t040b's pack-unchecked) the body is parsed under the workflow's own pack and the
# sent pack put back; then core's step 0 alone stands between another pack and the draft.
plant workflow-any-pack      src/internal/drafts.ts $B 'the same workflow type from another pack' \
  'const parsed = DraftsRequest\.safeParse\(raw\);' 'const parsed = DraftsRequest.safeParse({ ...(raw as object), pack: "inventory_purchasing" }); if (parsed.success) (parsed.data as { pack: string }).pack = (raw as { pack: string }).pack;' \
  '&& !specialist\?\.workflow_draftables\.includes\(req\.command_type\)\)' '&& !SPECIALIST_REGISTRY.specialists.some((x) => x.workflow_draftables.includes(req.command_type)))'
# R-A 8: gate 8 — approve-as-proposed: an unresolved document span taken as a value instead of cannot_verify.
plant span-as-value          src/modules/approvals/payload.ts $B 'approve as proposed' \
  '      if \(!c\) unresolved\.push\(v\);' '      if (!c) return 1;'
C=src/modules/imports/counts.ts
# R-A 3: back-dated counts admitted at the preview.
plant later-count-preview    $C $I 'later_count_exists' \
  'if \(later\.size\) \{' 'if (false) {'
# R-A 3: … and at the approval.
plant later-count-approval   $C $I 'a later count approved after' \
  '\n        \|\| \(await countedLater\(c, head\.outlet_id, ls, head\.at\)\)\.size\)' ')'
# R-A 2: no per-outlet lock before the re-checks.
plant shift-lock-off         src/modules/imports/shifts.ts $I 'two overlapping shift files approved at once' \
  '  await lockOutlets\(c, "shift", shifts\.map\(\(x\) => x\.outlet_id\)\);\n' ''
plant count-lock-off         $C $I 'two count files of one ingredient approved at once' \
  '  await lockOutlets\(c, "stock_count", staged\.map\(\(l\) => l\.outlet_id\)\);\n' ''
# Follow-up: a persistent conflict at approval back to 409 `conflict` (the draft stays proposed; every retry meets it again).
plant shift-clash-409        src/modules/imports/shifts.ts $I 'overlapping shift windows: the first commits|two overlapping shift files approved at once' \
  '  if \(clash\.rowCount\) throw new ApiError\("stale_draft", "stale_draft"\);' '  if (clash.rowCount) throw new ApiError("conflict");'
plant count-held-409         $C $I 'a later count approved after|the same count \(outlet and instant\)' \
  '\(await countedLater\(c, head\.outlet_id, ls, head\.at\)\)\.size\) throw new ApiError\("stale_draft", "stale_draft"\);' '(await countedLater(c, head.outlet_id, ls, head.at)).size) throw new ApiError("conflict");'
plant dispute-held-409       src/modules/finance/commands.ts $F 'two dispute drafts naming one order' \
  'throw \(await decisionId\(c\)\) \? new ApiError\("stale_draft", "stale_draft"\) : new ApiError\("conflict"\);' 'throw new ApiError("conflict");'
# Follow-up: the live count takes no outlet lock → a back-dated history count lands under a live count submitted meanwhile.
plant live-count-lock-off    src/modules/inventory/handlers.ts $I 'a live count submitted while' \
  '    await lockOutlets\(c, "stock_count", \[p\.outlet_id\]\);\n' ''
# R-A 6: a handler's stale_draft not turned into a stale draft (the pre-fix 409 loop / 422).
plant drift-not-stale        src/modules/approvals/decide.ts $I 'R-A 6: an imported cash bill|R-A 6: an earlier count' \
  'if \(e instanceof ApiError && e\.code === "stale_draft"\) \{' 'if (false) {'
# R-A 10: live device-less cash counted as drawer cash (the tender leg, then the refund leg).
plant live-cash-counted      src/modules/imports/shifts.ts $I 'R-A 10' \
  "AND o\.pricing_snapshot \? 'import_run_id'\n                AND t\.at" 'AND t.at'
plant live-refund-counted    src/modules/imports/shifts.ts $I 'R-A 10' \
  "AND o\.pricing_snapshot \? 'import_run_id'\n                AND f\.at" 'AND f.at'
# R-A 6: a bill's re-derived tax that moved since the preview refused as invalid_payload again (the draft stays proposed).
plant bills-drift-422        src/modules/imports/commit.ts $I 'a staged bill whose tax is no longer' \
  '      throw new ApiError\("stale_draft", "stale_draft"\);\n    \}\n    const t = priced\.tax;' '      throw new ApiError("invalid_payload");
    }
    const t = priced.tax;'
# R-B S1-C: a line already in an open dispute admitted; a repeated line in one claim admitted.
plant dispute-open-line      src/modules/finance/commands.ts $F 'R-B S1-C' \
  '      if \(held\.rowCount\) throw \(await decisionId\(c\)\)[^\n]*\n' ''
plant dispute-repeat-line    src/modules/finance/commands.ts $F 'R-B S1-C' \
  'if \(new Set\(orders\)\.size !== orders\.length \|\| new Set\(settled\)\.size !== settled\.length\) throw new ApiError\("invalid_payload"\);' ''
# R-A 7: touched rows unfiltered.
plant touched-unfiltered     src/modules/lineage/chain.ts $L 'touched rows are filtered per row' \
  'return r\.rows\.filter\(\(a\) => shown\.get\(a\.entity\)!\.has\(a\.entity_id\)\)' 'return r.rows'

[ "$fail" = 0 ] && echo "redproof-w32fix: all plants red, clean green" || echo "redproof-w32fix: FAILED"
exit "$fail"
