#!/usr/bin/env bash
# make export-falkor: the FalkorDB repository (business-graph), exported from a commit of this repo as one fresh commit.
#
#   scripts/export-falkor.sh [--out DIR] [--ref REV] [--check]
#
#   --out DIR    where the export goes; must not exist (default business-graph beside this repo's main checkout)
#   --ref REV    the commit to export (default HEAD). Always a commit, never the working tree, so .env, .run and files no
#                commit holds can never reach the export.
#   --check      also build and test the export on its own in a temp copy: pnpm install --frozen-lockfile (offline), typecheck,
#                boundaries, the graph adapter's suites and every other graph test (TypeScript and Python), the deploy's staging
#                test, and that MUNIM_GRAPH=postgres refuses. FalkorDB's test server is copied in from .run/falkordb for the
#                check only (`node scripts/dev/fetch-falkordb.ts` first); it never reaches DIR.
#
# What is exported and why: scripts/export-falkor/rules.py. Gates, each a non-zero exit: the rules' own tests, forbidden words in the
# source before the map (only the reviewed ones may be there), the package closure, forbidden words and secret shapes in the output,
# process words in the docs it writes, docs/cypher.md against the Cypher files, relative links, and the commit (one, the one
# identity, the message, no remote, nothing from .env or .run). DIR is a git repository with that one commit; nothing is pushed.
# Flags take `--x v` or `--x=v`; anything else is refused.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
x="$here/export-falkor"
# Beside the main checkout, also from a linked worktree (whose own parent is elsewhere).
main=$(cd "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
out="$(dirname "$main")/business-graph"; ref=HEAD; check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out=${2:?--out needs a directory}; shift 2 ;;
    --out=*) out=${1#--out=}; shift ;;
    --ref) ref=${2:?--ref needs a revision}; shift 2 ;;
    --ref=*) ref=${1#--ref=}; shift ;;
    --check) check=1; shift ;;
    *) echo "export-falkor: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
[ -e "$out" ] && { echo "export-falkor: $out exists; choose a new --out" >&2; exit 2; }
case "$out/" in "$repo/"*|"$main/"*) echo "export-falkor: --out must be outside this repo" >&2; exit 2 ;; esac
sha=$(git -C "$repo" rev-parse --verify "$ref^{commit}")

work=$(mktemp -d "${TMPDIR:-/tmp}/munim-falkor-export.XXXXXX")
trap 'rm -rf "$work"' EXIT
tree="$work/tree"
cd "$repo"

echo "=== export-falkor: ${sha:0:12} → $out"
python3 "$x/test_rules.py"
python3 "$x/export.py" source "$sha"
python3 "$x/export.py" closure "$sha"
python3 "$x/export.py" tree "$sha" "$tree"
python3 "$x/export.py" words "$tree"
python3 "$x/export.py" secrets "$tree"
python3 "$x/export.py" overlay "$tree"
python3 "$x/export.py" cypher "$tree"
python3 "$x/export.py" links "$tree"

if [ $check = 1 ]; then
  echo "=== export-falkor: build and test the export on its own"
  platform=$(node -p 'process.platform + "-" + process.arch')
  [ -x "$repo/.run/falkordb/$platform/redislite/bin/redis-server" ] \
    || { echo "export-falkor: no FalkorDB test server in .run/falkordb/$platform; run node scripts/dev/fetch-falkordb.ts" >&2; exit 1; }
  b="$work/build"; cp -R "$tree" "$b"; cd "$b"
  mkdir -p .run && cp -R "$repo/.run/falkordb" .run/falkordb
  export CI=true MUNIM_MODEL_MODE=recorded
  pnpm install --frozen-lockfile --offline --reporter=silent
  pnpm -r --no-bail run typecheck
  node_modules/.bin/depcruise --config .dependency-cruiser.cjs --output-type err apps services packages adapters tools
  (cd adapters/falkordb && node_modules/.bin/vitest run)
  (cd packages/contracts && node_modules/.bin/vitest run test/graph.test.ts test/guarantee.test.ts)
  (cd packages/config && node_modules/.bin/vitest run)
  (cd services/core-api && node_modules/.bin/vitest run test/graph-routes.test.ts)
  (cd apps/web && node_modules/.bin/vitest run tests/supplier-map.test.ts)
  node --test deploy/vercel/test/build.test.ts
  uv run --locked --directory services/intel --with pytest==9.1.1 pytest -q tests/graph
  # No Postgres graph in this build: asking for one refuses by name.
  node --input-type=module -e '
    const { graphFromConfig } = await import("./services/core-api/src/graph.ts");
    const asked = (graph) => graphFromConfig({ graph, graphModes: ["falkordb"], graphAdapter: () => ({ mode: "falkordb" }) }, () => {});
    await asked("postgres").then(() => { console.error("export-falkor: FAIL — MUNIM_GRAPH=postgres was accepted"); process.exit(1); },
      (e) => { if (e.message !== "no graph backend postgres in this build") { console.error(`export-falkor: FAIL — ${e.message}`); process.exit(1); } });
    if ((await asked(undefined)).mode !== "falkordb") { console.error("export-falkor: FAIL — unset MUNIM_GRAPH is not FalkorDB"); process.exit(1); }
    console.log("graph: MUNIM_GRAPH=postgres refuses (no graph backend postgres in this build); unset is falkordb");'
  cd "$repo"; rm -rf "$b"
fi

mkdir -p "$(dirname "$out")"; cp -R "$tree" "$out"
python3 "$x/export.py" commit "$out"
echo "export-falkor: ok — $out"
