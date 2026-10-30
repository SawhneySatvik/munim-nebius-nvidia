#!/usr/bin/env bash
# Red-proof for `make boundaries` (T-001 gate). Works only in a throwaway copy of the tree, so the
# live tree (and other lanes' files) is never touched. For each forbidden import:
#   copy green  ->  plant  ->  `make boundaries` red AND names the expected rule  ->  remove  ->  green.
# A red that does not name the expected rule (a crash, a different rule) fails this gate.
set -euo pipefail
src=$(cd "$(dirname "$0")/../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-boundaries-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
# .env and .run (secrets, role passwords) are never copied: the boundary check needs neither.

rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env "$src/" "$copy/"
# Reuse installed dependencies: link every node_modules directory back to the original.
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

# Scaffolding inside the copy, including allowed imports as positive controls
# (web -> packages/ui; module -> other module's index.ts; adapters/dev -> adapters/dev; web's server code -> the
# Identity Platform grant and its dev grant `@munim-dev/web-signin`).
mkdir -p "$copy/services/core-api/src/modules/zz_plant_alpha" "$copy/services/core-api/src/modules/zz_plant_beta" \
  "$copy/adapters/dev/zz-plant" "$copy/services/zz-plant-svc/src" "$copy/packages/ui/zz_plant" \
  "$copy/services/zz-plant-svc/test" "$copy/adapters/dev/idp-local" "$copy/adapters/dev/idp-supabase" "$copy/adapters/dev/publisher-http" \
  "$copy/apps/web/lib/server" "$copy/services/intel/munim_intel" "$copy/services/suppliers-sim/suppliers_sim"
echo 'export const alphaInternal = 1;' > "$copy/services/core-api/src/modules/zz_plant_alpha/service.ts"
echo 'export { alphaInternal } from "./service.js";' > "$copy/services/core-api/src/modules/zz_plant_alpha/index.ts"
echo 'export { alphaInternal } from "../zz_plant_alpha/index.js";' > "$copy/services/core-api/src/modules/zz_plant_beta/index.ts"
echo 'export const uiToken = 1;' > "$copy/packages/ui/zz_plant/index.ts"
echo 'export { uiToken } from "../../../packages/ui/zz_plant/index.js";' > "$copy/apps/web/app/zz_plant_allowed.ts"
echo 'export const devAdapter = 1;' > "$copy/adapters/dev/zz-plant/index.ts"
for a in idp-local idp-supabase publisher-http; do echo 'export const zzPlant = 1;' > "$copy/adapters/dev/$a/zz_plant.ts"; done
echo 'export { zzPlant } from "../idp-local/zz_plant.js";' > "$copy/adapters/dev/zz-plant/zz_plant_allowed.ts"
echo 'export { passwordGrant } from "../../../../adapters/gcp/idp-identity-platform/demo-accounts.ts"; export { devSignin } from "@munim-dev/web-signin";' > "$copy/apps/web/lib/server/zz_plant_allowed.ts"
[ -f "$copy/services/intel/munim_intel/__init__.py" ] || : > "$copy/services/intel/munim_intel/__init__.py"
: > "$copy/services/suppliers-sim/suppliers_sim/__init__.py"
: > "$copy/services/suppliers-sim/suppliers_sim/agents.py"

failures=0
run_boundaries() { make -s -C "$copy" boundaries > "$copy/.out" 2>&1; }

expect_green() {
  if run_boundaries; then
    echo "  green: make boundaries passes ($1)"
  else
    echo "  FAIL: make boundaries is red ($1):"; sed 's/^/    /' "$copy/.out"; failures=$((failures + 1))
  fi
}

# plant <label> <file> <content> <text the failure output must contain>
plant() {
  local label=$1 file=$2 content=$3 expect=$4
  echo "plant: $label"
  printf '%s\n' "$content" > "$copy/$file"
  if run_boundaries; then
    echo "  FAIL: make boundaries passed with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "$expect" "$copy/.out"; then
    echo "  red:   make boundaries fails and names it:"
    grep -F -- "$expect" "$copy/.out" | sed 's/^/    /'
  else
    echo "  FAIL: make boundaries is red but does not name '$expect':"; sed 's/^/    /' "$copy/.out"; failures=$((failures + 1))
  fi
  rm -f "$copy/$file"
  expect_green "plant removed"
}

echo "baseline (scaffolding + allowed imports only):"
expect_green "clean copy"

plant "apps/web imports services/core-api" \
  "apps/web/app/zz_plant_web.ts" \
  'export { alphaInternal } from "../../../services/core-api/src/modules/zz_plant_alpha/index.js";' \
  "error web-imports-only-public-packages:"

plant "apps/web imports an undeclared @munim package (@munim/core-api)" \
  "apps/web/app/zz_plant_web_pkg.ts" \
  'export { app } from "@munim/core-api";' \
  "error web-imports-only-public-packages-unresolved:"

plant "services/intel imports a sibling service (suppliers_sim)" \
  "services/intel/munim_intel/zz_plant.py" \
  'from suppliers_sim import agents' \
  "munim_intel is not allowed to import suppliers_sim"

plant "services/intel imports a Postgres client (sqlalchemy; R25)" \
  "services/intel/munim_intel/zz_plant_db.py" \
  'import sqlalchemy' \
  "munim_intel is not allowed to import sqlalchemy"

plant "services/intel imports litellm (R36)" \
  "services/intel/munim_intel/zz_plant_llm.py" \
  'from litellm import completion' \
  "munim_intel is not allowed to import litellm"

plant "intel run context imports the tools layer above it" \
  "services/intel/munim_intel/runtime/zz_plant.py" \
  'from munim_intel import tools' \
  "munim_intel.runtime is not allowed to import munim_intel.tools"

plant "a service file outside adapters/dev imports adapters/dev" \
  "services/core-api/src/zz_plant_outside.ts" \
  'export { devAdapter } from "../../../adapters/dev/zz-plant/index.js";' \
  "error adapters-dev-stays-in-adapters-dev:"

plant "a file named dev-root.ts (once exempt) imports adapters/dev" \
  "services/zz-plant-svc/src/dev-root.ts" \
  'export { devAdapter } from "../../../adapters/dev/zz-plant/index.js";' \
  "error adapters-dev-stays-in-adapters-dev:"

plant "a service test (test/) imports adapters/dev/idp-local (once exempt)" \
  "services/zz-plant-svc/test/zz_plant_idp.test.ts" \
  'export { zzPlant } from "../../../adapters/dev/idp-local/zz_plant.js";' \
  "error adapters-dev-stays-in-adapters-dev:"

plant "a colocated service test (src/*.test.ts) imports adapters/dev/publisher-http" \
  "services/zz-plant-svc/src/zz_plant_publisher.test.ts" \
  'export { zzPlant } from "../../../adapters/dev/publisher-http/zz_plant.js";' \
  "error adapters-dev-stays-in-adapters-dev:"

plant "apps/web outside lib/server imports the Identity Platform grant" \
  "apps/web/app/zz_plant_web_grant.ts" \
  'export { passwordGrant } from "../../../adapters/gcp/idp-identity-platform/demo-accounts.ts";' \
  "error web-imports-only-public-packages:"

plant "apps/web/lib/server imports a dev adapter other than its one dev grant" \
  "apps/web/lib/server/zz_plant_dev.ts" \
  'export { zzPlant } from "../../../../adapters/dev/idp-supabase/zz_plant.js";' \
  "error web-server-imports-only-public-packages-and-grants:"

plant "apps/web/lib/server imports services/core-api" \
  "apps/web/lib/server/zz_plant_core.ts" \
  'export { alphaInternal } from "../../../../services/core-api/src/modules/zz_plant_alpha/index.js";' \
  "error web-server-imports-only-public-packages-and-grants:"

plant "core-api module imports another module's internals (not index.ts)" \
  "services/core-api/src/modules/zz_plant_beta/zz_plant.ts" \
  'export { alphaInternal } from "../zz_plant_alpha/service.js";' \
  "error core-api-modules-via-index-only:"

if [ $failures -ne 0 ]; then
  echo "planted-violations: FAIL ($failures)" >&2
  exit 1
fi
echo "planted-violations: ok — 14/14 plants turned make boundaries red with the expected rule; green after each removal"
