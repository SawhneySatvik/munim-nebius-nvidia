#!/usr/bin/env bash
# make export-cup (T-123): the Google Cloud submission repo, exported from a commit of this repo (R54 P-4/P-5).
#
#   scripts/export-cup.sh [--out DIR] [--ref REV] [--check] [--history]
#
#   --out DIR    where the export goes; must not exist (default food-ops-cup beside this repo, R60)
#   --ref REV    the commit to export (default HEAD). Always a commit, never the working tree, so .env, .run and
#                files no commit holds can never reach the export.
#   --check      also build and test the export on its own in a temp copy: pnpm install --frozen-lockfile (offline),
#                typecheck, boundaries, every workspace test, next build of apps/web, intel's and suppliers-sim's pytest
#   --history    DIR becomes a git repository: this repo's history filtered to the export (a throwaway clone; this
#                repo is never rewritten), whose HEAD tree equals the tree export. Never pushed, no remote.
#
# What is exported and why: scripts/export-cup/rules.py. Gates, each a non-zero exit: forbidden words in the source
# before the map (only the reviewed ones may be there), the package closure, forbidden words and secret shapes in the
# output, an import of adapters/dev; with --history, the history-wide gate over every object, path, message and
# identity. Flags take `--x v` or `--x=v`; anything else is refused (gotcha 17).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
x="$here/export-cup"
out="$(cd "$repo/.." && pwd)/food-ops-cup"; ref=HEAD; check=0; history=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out=${2:?--out needs a directory}; shift 2 ;;
    --out=*) out=${1#--out=}; shift ;;
    --ref) ref=${2:?--ref needs a revision}; shift 2 ;;
    --ref=*) ref=${1#--ref=}; shift ;;
    --check) check=1; shift ;;
    --history) history=1; shift ;;
    *) echo "export-cup: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
[ -e "$out" ] && { echo "export-cup: $out exists; choose a new --out" >&2; exit 2; }
case "$out/" in "$repo/"*) echo "export-cup: --out must be outside this repo" >&2; exit 2 ;; esac
sha=$(git -C "$repo" rev-parse --verify "$ref^{commit}")
command -v git-filter-repo >/dev/null || [ $history = 0 ] || { echo "export-cup: --history needs git-filter-repo (brew install git-filter-repo)" >&2; exit 1; }

work=$(mktemp -d "${TMPDIR:-/tmp}/munim-cup-export.XXXXXX")
trap 'rm -rf "$work"' EXIT
tree="$work/tree"
cd "$repo"

echo "=== export-cup: ${sha:0:12} → $out"
python3 "$x/test_rules.py"  # the secret-shape gate can still catch each shape it names (and passes the placeholders)
python3 "$x/export.py" source "$sha"
python3 "$x/export.py" closure "$sha"
python3 "$x/export.py" tree "$sha" "$tree"
python3 "$x/export.py" words "$tree"
python3 "$x/export.py" secrets "$tree"
python3 "$x/export.py" imports "$tree"

if [ $check = 1 ]; then
  echo "=== export-cup: build and test the export on its own"
  b="$work/build"; cp -R "$tree" "$b"; cd "$b"
  export CI=true MUNIM_MODEL_MODE=recorded
  pnpm install --frozen-lockfile --offline --reporter=silent
  pnpm -r --no-bail run typecheck
  node_modules/.bin/depcruise --config .dependency-cruiser.cjs --output-type err apps services packages adapters tools
  pnpm -r --no-bail run test
  (cd apps/web && node_modules/.bin/next build)
  # The demo sign-in compiled without a dev grant: Identity Platform's endpoint is in the server bundle, the dev host's is not.
  grep -rqF "accounts:signInWithPassword" apps/web/.next/server || { echo "export-cup: FAIL — web's server bundle lacks the Identity Platform grant" >&2; exit 1; }
  ! grep -rqF "/auth/v1/token" apps/web/.next/server || { echo "export-cup: FAIL — a dev sign-in grant is compiled into web" >&2; exit 1; }
  uv run --locked --directory services/intel --with pytest==9.1.1 pytest -q
  uv run --locked --directory services/suppliers-sim --with pytest==9.1.1 pytest -q
  cd "$repo"; rm -rf "$b"
fi

if [ $history = 1 ]; then
  echo "=== export-cup: filtered history"
  src="$work/src"
  git clone --quiet --no-local "$repo" "$src"
  git -C "$src" checkout --quiet --detach "$sha"
  git -C "$src" branch --quiet --force main "$sha" && git -C "$src" checkout --quiet main
  mkdir "$work/history"
  python3 "$x/history.py" filter "$src" "$work/history" "$tree" "$out"
  python3 "$x/history.py" gate "$out" "$tree"
else
  mkdir -p "$(dirname "$out")"; cp -R "$tree" "$out"
fi
echo "export-cup: ok — $out"
