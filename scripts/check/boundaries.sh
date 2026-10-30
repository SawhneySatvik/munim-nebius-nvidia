#!/usr/bin/env bash
# `make boundaries`: 03-architecture §7 import rules. TypeScript via dependency-cruiser
# (.dependency-cruiser.cjs), Python via import-linter ([tool.importlinter] in pyproject.toml).
# Runs against the tree it is invoked in (the planted-violation gate runs it inside a temp copy).
set -euo pipefail
cd "$(dirname "$0")/../.."
root=$(pwd)
fail=0

# --- TypeScript -------------------------------------------------------------
dirs=()
for d in apps services packages adapters tools e2e evals; do
  [ -d "$d" ] && dirs+=("$d")
done
if [ ${#dirs[@]} -eq 0 ]; then
  echo "boundaries(ts): FAIL — no source directories found under $root" >&2
  exit 1
fi
set +e
ts_out=$("$root/node_modules/.bin/depcruise" \
  --config .dependency-cruiser.cjs --output-type err "${dirs[@]}" 2>&1)
ts_rc=$?
set -e
echo "$ts_out"
modules=$(printf '%s\n' "$ts_out" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) modules.*/\1/p' | tail -1)
# A mis-pathed config would cruise nothing and report "no violations": demand at least one module.
if [ -z "$modules" ] || [ "$modules" -lt 1 ]; then
  echo "boundaries(ts): FAIL — cruised ${modules:-0} modules; expected >= 1" >&2
  fail=1
elif [ $ts_rc -ne 0 ]; then
  echo "boundaries(ts): FAIL (dependency-cruiser exit $ts_rc)" >&2
  fail=1
else
  echo "boundaries(ts): ok — $modules modules cruised"
fi

# --- Python -----------------------------------------------------------------
intel_py=0
if [ -d services/intel/munim_intel ]; then
  intel_py=$(find services/intel/munim_intel -name '*.py' | wc -l | tr -d ' ')
fi
if [ "$intel_py" -eq 0 ]; then
  echo "boundaries(py): SKIPPED — no Python files under services/intel/munim_intel yet"
else
  # Every first-party package of another Python service must be in forbidden_modules, or the
  # contract would silently allow importing it.
  forbidden=$(python3 -c 'import tomllib;c=tomllib.load(open("pyproject.toml","rb"));print(" ".join(m for k in c["tool"]["importlinter"]["contracts"] if k["name"]=="intel imports no other service" for m in k["forbidden_modules"]))')
  pypath="services/intel"
  for svc in services/*/; do
    svc=${svc%/}
    [ "$svc" = "services/intel" ] && continue
    for base in "$svc" "$svc/src"; do
      for init in "$base"/*/__init__.py; do
        [ -f "$init" ] || continue
        pkg=$(basename "$(dirname "$init")")
        pypath="$pypath:$base"
        case " $forbidden " in
          *" $pkg "*) ;;
          *) echo "boundaries(py): FAIL — package '$pkg' ($base) is not in forbidden_modules of pyproject.toml" >&2; fail=1 ;;
        esac
      done
    done
  done
  # uvx, not `uv run`: a workspace member directory without its pyproject.toml (services/intel
  # before T-009a) makes uv refuse to resolve the workspace.
  if PYTHONPATH="$pypath" uvx --quiet --from import-linter==2.15 lint-imports --no-cache; then
    echo "boundaries(py): ok — $intel_py files under services/intel/munim_intel"
  else
    echo "boundaries(py): FAIL" >&2
    fail=1
  fi
fi

exit $fail
