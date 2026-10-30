#!/usr/bin/env bash
# make export-nebius: the public Munim repository (Apache-2.0), exported from a commit of this repo as one fresh commit.
#
#   scripts/export-nebius.sh [--out DIR] [--ref REV] [--check]
#
#   --out DIR    where the export goes; must not exist (default munim-nebius beside this repo's main checkout)
#   --ref REV    the commit to export (default HEAD). Always a commit, never the working tree, so .env, .run and files no
#                commit holds can never reach the export.
#   --check      also build and test the export on its own in a temp copy: pnpm install --frozen-lockfile (offline), typecheck,
#                boundaries, the AI service's whole suite in recorded mode, the web app's tests, a production build per business
#                that carries only its own business, and worldgen's Kosambari seed-and-recompute and its trimmed-copy checks.
#                The FalkorDB test server (for the graph question's end-to-end test) is copied in from .run/falkordb for the
#                check only (`node scripts/dev/fetch-falkordb.ts` first); it never reaches DIR.
#
# What is exported and why: scripts/export-nebius/rules.py. Gates, each a non-zero exit: the rules' own tests, forbidden words in the
# source before the maps (only the reviewed ones may be there; The Snacky Shack's among them), the package closure, forbidden words
# and secret shapes in the output, process words in the docs it writes, the licence text, relative links, and the commit (one, the
# one identity, the message, no remote, nothing from .env or .run, a LICENSE). DIR is a git repository with that one commit; nothing
# is pushed and no remote is added. Flags take `--x v` or `--x=v`; anything else is refused.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
x="$here/export-nebius"
# Beside the main checkout, also from a linked worktree (whose own parent is elsewhere).
main=$(cd "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
out="$(dirname "$main")/munim-nebius"; ref=HEAD; check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out=${2:?--out needs a directory}; shift 2 ;;
    --out=*) out=${1#--out=}; shift ;;
    --ref) ref=${2:?--ref needs a revision}; shift 2 ;;
    --ref=*) ref=${1#--ref=}; shift ;;
    --check) check=1; shift ;;
    *) echo "export-nebius: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
[ -n "$out" ] || { echo "export-nebius: --out is empty" >&2; exit 2; }
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
[ -e "$out" ] && { echo "export-nebius: $out exists; choose a new --out" >&2; exit 2; }
case "$out/" in "$repo/"*|"$main/"*) echo "export-nebius: --out must be outside this repo" >&2; exit 2 ;; esac
sha=$(git -C "$repo" rev-parse --verify "$ref^{commit}")

work=$(mktemp -d "${TMPDIR:-/tmp}/munim-nebius-export.XXXXXX")
trap 'rm -rf "$work"' EXIT
tree="$work/tree"
cd "$repo"

echo "=== export-nebius: ${sha:0:12} → $out"
python3 "$x/test_rules.py"
python3 "$x/export.py" source "$sha"
python3 "$x/export.py" closure "$sha"
python3 "$x/export.py" tree "$sha" "$tree"
python3 "$x/export.py" words "$tree"
python3 "$x/export.py" secrets "$tree"
python3 "$x/export.py" overlay "$tree"
python3 "$x/export.py" licence "$tree"
python3 "$x/export.py" links "$tree"

if [ $check = 1 ]; then
  echo "=== export-nebius: build and test the export on its own"
  platform=$(node -p 'process.platform + "-" + process.arch')
  [ -x "$repo/.run/falkordb/$platform/redislite/bin/redis-server" ] \
    || { echo "export-nebius: no FalkorDB test server in .run/falkordb/$platform; run node scripts/dev/fetch-falkordb.ts" >&2; exit 1; }
  b="$work/build"; cp -R "$tree" "$b"; cd "$b"
  mkdir -p .run && cp -R "$repo/.run/falkordb" .run/falkordb
  export CI=true MUNIM_MODEL_MODE=recorded NO_COLOR=1
  pnpm install --frozen-lockfile --offline --reporter=silent
  pnpm -r --no-bail run typecheck
  node_modules/.bin/depcruise --config .dependency-cruiser.cjs --output-type err apps services packages adapters tools
  (cd apps/web && node_modules/.bin/vitest run)
  apps/web/scripts/bundle-isolation.sh
  (cd tools/worldgen && node --test test/cli-messages.test.ts test/no-sql.test.ts test/blr_kitchen.test.ts)
  uv run --locked --directory services/intel --with pytest==9.1.1 pytest -q
  cd "$repo"; rm -rf "$b"
fi

mkdir -p "$(dirname "$out")"; cp -R "$tree" "$out"
python3 "$x/export.py" commit "$out"
echo "export-nebius: ok — $out"
