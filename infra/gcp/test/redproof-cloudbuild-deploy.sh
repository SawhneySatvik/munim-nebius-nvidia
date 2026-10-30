#!/bin/bash
# Red-proof for infra/gcp/test/cloudbuild-deploy.test.py: each plant breaks one thing in a copy of the files the test reads,
# and the test must exit non-zero with the named check's FAIL line; then the clean copy must exit 0. A plant whose text is
# not found stops the harness (a plant that does not apply proves nothing). usage: infra/gcp/test/redproof-cloudbuild-deploy.sh
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PY="${PYTHON:-python3}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
fail=0

fresh() { # a copy of what the test reads: infra/gcp, the deploy script, the migration file names
  rm -rf "$WORK/r"; mkdir -p "$WORK/r/scripts" "$WORK/r/db"
  cp -R "$ROOT/infra" "$WORK/r/infra"; cp "$ROOT/scripts/deploy-gcp.sh" "$WORK/r/scripts/"; cp -R "$ROOT/db/migrations" "$WORK/r/db/"
}
# plant <name> <file> <old> <new> <check name>: replaces old with new in the copy ("@new" creates the file, "@rm" deletes it)
plant() {
  local name="$1" file="$WORK/r/$2" old="$3" new="$4" want="$5"
  fresh
  "$PY" - "$file" "$old" "$new" <<'EOF' || { echo "HARNESS  $name: plant text not found"; exit 3; }
import os, sys; p, old, new = sys.argv[1:]
if old == "@new":
    sys.exit(1) if os.path.exists(p) else open(p, "w").write(new)
elif old == "@rm":
    sys.exit(1) if not os.path.exists(p) else os.remove(p)
else:
    s = open(p).read(); sys.exit(1) if old not in s else open(p, "w").write(s.replace(old, new))
EOF
  out="$("$PY" "$WORK/r/infra/gcp/test/cloudbuild-deploy.test.py" "$WORK/r" 2>&1)"; got=$?
  if [ "$got" -ne 0 ] && grep -qF "FAIL  $want" <<<"$out"; then echo "RED   $name (exit $got): FAIL  $want"
  else echo "MISS  $name: exit $got, no 'FAIL  $want'"; grep '^FAIL' <<<"$out" | head -3; fail=1; fi
}
Y=infra/gcp/cloudbuild-deploy.yaml
W=infra/gcp/cloudbuild-web.yaml
NL=$'\n    name: gcr.io/cloud-builders/docker\n    waitFor: [check]'

# the file's shape
plant "not YAML"                    $Y 'options:' 'options: [' "parses as YAML"
plant "an unknown top-level key"    $Y 'options:' 'opts:' "top-level keys are Cloud Build's"
plant "legacy logging"              $Y 'logging: CLOUD_LOGGING_ONLY' 'logging: LEGACY' "logging is CLOUD_LOGGING_ONLY"
plant "the 10-minute timeout"       $Y 'timeout: 2400s' 'timeout: 600s' "a timeout over the 10-minute default"
plant "no machine type"             $Y $'  machineType: E2_HIGHCPU_8\n' '' "a machine type is set"
plant "a duplicate step id"         $Y 'id: push-web' 'id: push-core-worker' "every step has a name and a unique id"
plant "waiting for a later step"    $Y 'waitFor: [build-core-api]' 'waitFor: [build-web]' "every waitFor names an earlier step"
# substitutions
plant "an undeclared _X"            $Y '"MUNIM_DEMO_TENANT_ID=${_DEMO_TENANT_ID}"]' '"MUNIM_DEMO_TENANT_ID=${_DEMO_TENANT_ID}", "X=${_UNDECLARED}"]' "every \$NAME is a declared _X"
plant "a shell \$ not escaped"      $Y '[ -n "$$TAG" ]' '[ -n "$TAG" ]' "every \$NAME is a declared _X"
plant "a declared _X unused"        $Y '  _DEMO_TENANT_ID: ""' $'  _DEMO_TENANT_ID: ""\n  _EXTRA: ""' "every declared substitution is used"
# Dockerfiles
plant "a missing Dockerfile"        $Y '-f, infra/gcp/docker/intel.Dockerfile' '-f, infra/gcp/docker/intl.Dockerfile' "every Dockerfile it names exists"
plant "an allowlist missing"        infra/gcp/docker/suppliers-sim.Dockerfile.dockerignore '@rm' '' "every Dockerfile a build ran exists, with its .dockerignore"
plant "a Dockerfile never built"    infra/gcp/docker/extra.Dockerfile '@new' $'FROM scratch\n' "it builds every Dockerfile in infra/gcp/docker"
plant "BuildKit off"                $Y $'id: build-intel'"$NL"$'\n    env: ["DOCKER_BUILDKIT=1"]' $'id: build-intel'"$NL" "every docker build has BuildKit on"
# the deploy step
plant "deploy without --skip-build" $Y '--tag, $SHORT_SHA, --skip-build]' '--tag, $SHORT_SHA]' "one deploy step"
plant "deploy that builds"          $Y '--tag, $SHORT_SHA, --skip-build]' '--tag, $SHORT_SHA]' "the deploy step built nothing"
plant "deploy with another tag"     $Y '--tag, $SHORT_SHA, --skip-build]' '--tag, latest, --skip-build]' "deploy-gcp.sh deploys exactly the pushed images"
plant "deploy not in the SDK image" $Y $'id: deploy\n    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim' $'id: deploy\n    name: gcr.io/cloud-builders/docker' "the deploy step runs bash in a Google Cloud SDK image"
plant "a push the deploy skips"     $Y 'waitFor: [push-intel, push-suppliers-sim, push-core-api, push-core-worker, push-web]' 'waitFor: [push-intel, push-suppliers-sim, push-core-api, push-core-worker]' "the deploy step waits for every push"
plant "a build not after check"     $Y $'id: build-web'"$NL" $'id: build-web\n    name: gcr.io/cloud-builders/docker\n    waitFor: [\'-\']' "every build waits for the check step"
plant "tenant not passed to web"    $Y '"MUNIM_DEMO_TENANT_ID=${_DEMO_TENANT_ID}"]' '"MUNIM_DEMO_TENANT_ID=6f1c2a3b-4d5e-4f60-8a7b-000000000000"]' "web is deployed with the trigger's demo tenant"
# images
plant "a push of another tag"       $Y 'args: [push, "asia-south1-docker.pkg.dev/$PROJECT_ID/munim/intel:$SHORT_SHA"]' 'args: [push, "asia-south1-docker.pkg.dev/$PROJECT_ID/munim/intel:latest"]' "five images built and the same five pushed"
plant "images: missing one"         $Y $'  - asia-south1-docker.pkg.dev/$PROJECT_ID/munim/web:$SHORT_SHA\n' '' "\`images:\` lists exactly the pushed images"
plant "file's image name drifts"    $Y 'munim/web:$SHORT_SHA' 'munim/webapp:$SHORT_SHA' "deploy-gcp.sh deploys exactly the pushed images"
plant "script's repo drifts"        scripts/deploy-gcp.sh 'REPO="munim"' 'REPO="munim-images"' "deploy-gcp.sh deploys exactly the pushed images"
# web's build
plant "web build args drift"        $W '      - -t' $'      - --build-arg=EXTRA=1\n      - -t' "web gets cloudbuild-web.yaml's build arguments"
plant "web origin drifts"           $Y 'MUNIM_API_ORIGIN=https://munim-core-api-$PROJECT_NUMBER' 'MUNIM_API_ORIGIN=https://munim-coreapi-$PROJECT_NUMBER' "web's core-api origin and storefront key"
plant "storefront secret unwired"   $Y 'secretEnv: ["STOREFRONT_KEY"]' 'secretEnv: []' "a good trigger build runs every step"
# refusals
plant "empty tenant not refused"    $Y '[[ "$$TENANT" =~' 'true || [[ "$$TENANT" =~' "an empty _DEMO_TENANT_ID refuses before any build"
plant "any tenant accepted"         $Y '[[ "$$TENANT" =~' '[ -n "$$TENANT" ] || [[ "$$TENANT" =~' "a malformed _DEMO_TENANT_ID refuses before any build"
plant "empty commit not refused"    $Y '[ -n "$$TAG" ] ||' 'true ||' "an empty SHORT_SHA refuses before any build"
plant "schema check off"            $Y '[ "$$have" -ge "$$want" ]' '[ "$$have" -ge 0 ]' "a database behind this commit's migrations refuses the deploy"
plant "no version passes"           $Y '[ -n "$$have" ] || {' '[ -n "$$have" ] || have=9999 || {' "core-api /health without a version refuses the deploy"
plant "unreachable passes"          $Y '[ -n "$$have" ] || {' '[ -n "$$have" ] || have=9999 || {' "core-api /health unreachable refuses the deploy"
plant "schema reads another URL"    $Y 'asia-south1.run.app/health' 'asia-south1.run.app/healthz' "the schema step reads core-api's /health"

fresh
out="$("$PY" "$WORK/r/infra/gcp/test/cloudbuild-deploy.test.py" "$WORK/r" 2>&1)"; got=$?
if [ "$got" -eq 0 ]; then echo "GREEN clean copy (exit 0, $(grep -c '^PASS' <<<"$out") checks)"; else echo "MISS  clean copy: exit $got"; grep '^FAIL' <<<"$out"; fail=1; fi
exit $fail
