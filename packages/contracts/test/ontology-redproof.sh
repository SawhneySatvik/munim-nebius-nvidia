#!/usr/bin/env bash
# Red-proof for the T-080 ontology gates (test/ontology.test.ts). Works only in a throwaway copy of the tree:
#   copy green  ->  plant one defect  ->  vitest exits non-zero AND names the expected gate  ->  restore.
# Plants inside ontology.json are re-stamped (body sha256) and kept lint-clean, so only the targeted gates fire (a dropped
# action or function also moves the counts gates (2) and (5) check); the freshness plants edit an input instead. A red that names another gate fails this script.
#   packages/contracts/test/ontology-redproof.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t080-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
ln -s "$src/node_modules" "$copy/node_modules"
ln -s "$src/packages/contracts/node_modules" "$copy/packages/contracts/node_modules"

pkg="$copy/packages/contracts"
ONT="$pkg/generated/ontology.json"
failures=0
# NO_COLOR: on GitHub (CI set, output not a terminal) vitest colours its report, and the escape codes sit before "FAIL", so the
# gate-id match below found nothing and the script died silently under pipefail (CI run 38967265063, 17 Oct; same family as gotcha 44).
run_vitest() { (cd "$pkg" && NO_COLOR=1 node_modules/.bin/vitest run test/ontology.test.ts) > "$copy/.out" 2>&1; }

# mutate <js expression over `d`>: edit ontology.json, then re-stamp its body so the freshness gate stays green.
mutate() {
  node --input-type=module -e "
    import { readFileSync, writeFileSync } from 'node:fs';
    import { bodyDigest } from '$pkg/src/ontology/stamp.ts';
    const d = JSON.parse(readFileSync('$ONT', 'utf8'));
    $1;
    d.stamp.body_sha256 = bodyDigest(d);
    writeFileSync('$ONT', JSON.stringify(d, null, 2) + '\n');"
}

# plant <label> <expected failing gate ids, e.g. "(1) (3)"> <file to restore> <command...>
# Exactly the expected gates must fail, with a non-zero vitest exit.
plant() {
  local label=$1 expect=$2 file=$3
  shift 3
  echo "plant: $label"
  cp "$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_vitest; then
    echo "  FAIL: vitest passed with the plant in place"; failures=$((failures + 1))
  else
    local red
    red=$(grep -E '^ *FAIL .*> ontology.json > \(' "$copy/.out" | sed -E 's/.*> ontology.json > (\([0-9][a-c]?\)).*/\1/' | sort -u | tr '\n' ' ' | sed 's/ $//') || true  # no match = '' = reported below, never a silent exit
    if [ "$red" = "$expect" ]; then
      echo "  red:   vitest exits non-zero; failing gates: $red"
    else
      echo "  FAIL: expected failing gates '$expect', got '$red':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
    fi
  fi
  cp "$copy/.saved" "$file"
}

echo "baseline:"
if run_vitest; then echo "  green: $(grep -E 'Tests ' "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

plant "an agent-exposed action dropped" "(1) (2) (5) (6)" "$ONT" \
  mutate "d.actions = d.actions.filter((a) => a.command_type !== 'goals.goal.create.v1')"
plant "a oneOf in a propose schema" "(2)" "$ONT" \
  mutate "d.actions.find((a) => a.command_type === 'catalogue.price.set.v1').model_schema.properties.currency = { oneOf: [{ type: 'string' }] }"
plant "a migration edited without regeneration" "(3)" "$copy/db/migrations/0019_mc1a_templates_outlet_rls.sql" \
  sh -c "printf '\n-- planted\n' >> '$copy/db/migrations/0019_mc1a_templates_outlet_rls.sql'"
plant "a contract edited without regeneration" "(3)" "$pkg/src/shared/draftables.ts" \
  sh -c "printf '\n// planted\n' >> '$pkg/src/shared/draftables.ts'"
plant "ontology.json edited by hand (not re-stamped)" "(1) (3)" "$ONT" \
  sh -c "sed -i.bak 's/\"auto_apply\": false/\"auto_apply\": true/' '$ONT' && rm -f '$ONT.bak'"
plant "an object type dropped" "(4a)" "$ONT" \
  mutate "d.objects = d.objects.filter((o) => o.name !== 'core.price')"
plant "a function dropped" "(4c) (5)" "$ONT" \
  mutate "d.functions = d.functions.filter((f) => f.id !== 'finance.pnl')"
plant "a tenant_id parameter in a read schema" "(5)" "$ONT" \
  mutate "const s = d.functions.find((f) => f.id === 'catalogue.dish_margin').model_schema; s.properties.tenant_id = { type: 'string' }; s.required.push('tenant_id')"
plant "a new-entity id left in a model schema" "(6)" "$ONT" \
  mutate "const s = d.actions.find((a) => a.command_type === 'purchasing.po.create.v1').model_schema; s.properties.po_id = { type: 'string' }; s.required.push('po_id')"
plant "a foreign template bound to a specialist" "(7)" "$ONT" \
  mutate "d.specialists.find((s) => s.id === 'catalogue').templates.push('finance.pnl')"

if [ $failures -ne 0 ]; then echo "ontology red-proof: FAIL — $failures plant(s) not caught" >&2; exit 1; fi
echo "ontology red-proof: ok — every plant turned its gate red with a non-zero exit"
