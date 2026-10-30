#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the Git-connected projects. Exit 0 = skip the build, exit 1 = build.
#   munim-cobnut (Root Directory apps/web):   bash ../../deploy/vercel/ignore-build.sh web
#   munim-rho    (Root Directory apps/site):  bash ../../deploy/vercel/ignore-build.sh site
# It diffs against VERCEL_GIT_PREVIOUS_SHA (the last successful deployment of the branch), not HEAD^: a push of many
# commits builds only its tip, so HEAD^ would miss the changes in the commits before it. Anything unclear builds.
set -u

case "${1:-}" in
  # apps/web reads @munim/sdk (packages/sdk) and, through tsconfig paths and relative imports, adapters/dev and adapters/gcp.
  web) inputs=(apps/web packages/sdk adapters/dev adapters/gcp) ;;
  # apps/site reads docs/kit and the generated OpenAPI file while prerendering (apps/site/lib/repo.ts), and extends tsconfig.base.json.
  site) inputs=(apps/site docs/kit packages/contracts/generated tsconfig.base.json) ;;
  *) echo "ignore-build: usage: ignore-build.sh web|site" >&2; exit 1 ;;
esac
inputs+=(package.json pnpm-lock.yaml pnpm-workspace.yaml)

# The events build (docs/plan/08-events-build.md, EV-5) runs local only: a push of `intelligence` never deploys, not even
# a preview. Remove this when the founder picks that branch's deploy target.
if [ "${VERCEL_GIT_COMMIT_REF:-}" = intelligence ]; then echo "ignore-build: intelligence is local only (EV-5): skip"; exit 0; fi

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$prev" ]; then echo "ignore-build: no previous successful deployment of this branch: build"; exit 1; fi
cd "$(git rev-parse --show-toplevel)" || exit 1
# The clone is shallow (depth 10): a previous sha that is not in it cannot be diffed.
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then echo "ignore-build: ${prev:0:9} is not in this clone: build"; exit 1; fi

if git diff --quiet "$prev" HEAD -- "${inputs[@]}"; then
  echo "ignore-build: no change in $1's inputs since ${prev:0:9}: skip"
  exit 0
fi
echo "ignore-build: $1's inputs changed since ${prev:0:9}: build"
exit 1
