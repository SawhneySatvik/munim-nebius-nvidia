#!/usr/bin/env bash
# Red-proof of the T-095a gates (test/cares.test.ts, test/cares-internal.test.ts). No flags (gotcha 17):
#   services/core-api/test/redproof-cares.sh
# The plants are reverts of the code under test, so they are made in a throwaway rsync copy of the repo, never the shared
# tree: MUNIM_REDPROOF_DIR, default <repo>/scratchpad/redproof-cares (git-ignored); the copy is deleted at the end
# (MUNIM_REDPROOF_KEEP=1 keeps it). Each plant edits one file of the copy (a revert of the rule the gate guards), runs the
# gate file there, and restores that file from the repo. 1. The clean copy must exit 0. 2. Per plant, the file must exit
# non-zero (gotcha 33: the process exit code) AND a FAIL line must name each gate the plant breaks. A plant whose pattern
# matches nothing is itself a failure (a plant that changes nothing proves nothing).
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="${MUNIM_REDPROOF_DIR:-$ROOT/scratchpad/redproof-cares}"
COPY="$WORK/tree"
OUT="$WORK/logs"
case "$(mkdir -p "$COPY" && cd "$COPY" && pwd -P)/" in
  "$(cd "$ROOT" && pwd -P)/") echo "redproof-cares: refusing to plant in the repo itself ($COPY)"; exit 2 ;;
esac
mkdir -p "$OUT"
rsync -a --delete --exclude .git --exclude .env --exclude .run --exclude /scratchpad --exclude .venv --exclude apps/site/.next "$ROOT/" "$COPY/"
API="$COPY/services/core-api"
VITEST="$API/node_modules/.bin/vitest"
cd "$API"
fail=0
BACKUP=""
restore() { if [ -n "$BACKUP" ]; then cp "$ROOT/services/core-api/$BACKUP" "$API/$BACKUP"; BACKUP=""; fi; }
cleanup() { restore; [ "${MUNIM_REDPROOF_KEEP:-}" = "1" ] || rm -rf "$COPY"; }
trap cleanup EXIT
row() { printf '%-6s %-22s %s\n' "$1" "$2" "$3"; }

row RESULT PLANT EXPECT
for f in test/cares.test.ts test/cares-internal.test.ts; do
  if "$VITEST" run "$f" >"$OUT/clean-$(basename "$f" .ts).log" 2>&1; then row ok clean "$f exit 0"; else row FAIL clean "$f exit 0 ($OUT)"; fail=1; fi
done

# plant <name> <file> <perl substitution, applied once> <test file> <';'-separated FAIL-line fragments>
plant() {
  local name="$1" file="$2" expr="$3" test="$4" want="$5" missing="" w
  BACKUP="$file"
  perl -0pi -e "$expr" "$API/$file"
  if cmp -s "$API/$file" "$ROOT/services/core-api/$file"; then row FAIL "$name" "the plant matched nothing in $file"; fail=1; restore; return; fi
  if "$VITEST" run "$test" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; restore; return; fi
  restore
  IFS=';' read -ra wants <<<"$want"
  for w in "${wants[@]}"; do grep -E "FAIL .*($w)" "$OUT/$name.log" >/dev/null || missing="$missing [$w]"; done
  if [ -n "$missing" ]; then row FAIL "$name" "red, but no FAIL naming:$missing ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0; $(grep -cE '^ FAIL ' "$OUT/$name.log") FAIL lines, naming: $want"
  fi
}

C=src/modules/cares/commands.ts
T=test/cares.test.ts
plant no-listing-lock   $C 's/(WHERE tenant_id = \$\{T\} AND id = \$1) FOR UPDATE`/$1`/' $T "two concurrent accepts"
plant no-listed-bound   $C 's/\n\s*if \(Number\(line\.handed\) \+ x\.qty_milli > Number\(line\.qty\)\) throw conflict\("qty_exceeds_listed"\);//' $T "Σ per line ≤ the listed qty"
plant no-enablement     $C 's/if \(!en\?\.enabled\) throw conflict\("cares_not_enabled"\);//' $T "not enabled"
plant no-city-check     $C 's/if \(!city\?\.ok\) throw invalid\("cares_city_mismatch"\);//' $T "profile.set: a city in another country"
plant no-decided-check  $C 's/if \(\(await ownClaim\(c, p\.claim_id\)\)\.verdict !== "none"\) throw conflict\("claim_decided"\);/await ownClaim(c, p.claim_id);/' $T "buyer side: cancel after accept"
plant receive-unhanded  $C 's/ \|\| !o\.lines\.some\(\(x\) => x\.handed_qty_milli > 0\)//' $T "buyer side: cancel after accept"
plant no-recipe-waste   ../../packages/core-domain/cares/index.ts 's/BigInt\(10000 \+ rl\.waste_pct_bp\)/10000n/' $T "6 cooked portions"
plant no-void-reversal  src/modules/inventory/cares.ts 's/HAVING sum\(qty_milli\) < 0 ORDER BY ingredient_id, batch_id`, \[handoverId\]/HAVING sum(qty_milli) < -1 AND false ORDER BY ingredient_id, batch_id`, [handoverId]/' $T "6 cooked portions"
plant no-draft-handler  src/modules/cares/index.ts 's/registerDraftHandler\(cmd\.listingPublish\);//' $T "an approved intel draft creates exactly 1 listing"
plant fresh-key         src/modules/cares/index.ts 's/env\.data as CommandEnvelope, handler\)/{ ...(env.data as CommandEnvelope), idempotency_key: `k-\$\{Math.random()\}` }, handler)/' $T "replay is byte-identical;every Cares command was replayed"
plant no-labels         src/modules/cares/read.ts 's/"Measured on synthetic data"/"Measured"/' $T "GET profile"
plant frame-always-on   src/internal/frame.ts 's/cares_active: r\.cares/cares_active: true/' test/cares-internal.test.ts "run-frame cares_active"
plant task-any-pack     src/internal/drafts.ts 's/ && req\.pack !== "people"\) \{/ \&\& false) {/' test/cares-internal.test.ts "a task draft naming a Cares listing"
plant republish         src/platform/drafts.ts 's/if \(s\.rows\[0\]\.published\) throw new ApiError\("conflict"\);//' test/cares-internal.test.ts "publishes a network snapshot once"
plant offer-void-allowed $C 's/\n\s*if \(l\.kind === "offer"\) throw conflict\("offer_handover_final"\);//' $T "an offer's hand-over is final;then A's void → offer_handover_final"
plant void-refused-all  $C 's/if \(l\.kind === "offer"\) throw conflict\("offer_handover_final"\);/throw conflict("offer_handover_final");/' $T "6 cooked portions"
plant partial-offer     $C 's/throw conflict\("handover_must_be_complete"\);//' $T "A's staff hand over 20 kg"
plant no-outlet-before  $C 's/before: was \? \{ city_code: was\.city_code, active: was\.active \} : null,//' $T "profile.set: a city in another country"
plant close-not-declined $C 's/if \(o\.verdict !== "declined"\) throw new ApiError\("illegal_transition"\);/if (o.verdict === "declined") throw new ApiError("illegal_transition");/' $T "close after decline"
plant receive-half      src/modules/inventory/cares.ts 's/qty_milli: Number\(l\.received\), unit: l\.unit,/qty_milli: Number(l.received) \/ 2, unit: l.unit,/' $T "Σ surplus_in = \+20000"
plant kill-switch-read  src/modules/cares/index.ts 's/(export const router = methodGuard\(\n  new Hono<AppEnv>\(\))/$1\n    .use("\/v1\/cares\/*", async (c, next) => { const f = await c.var.deps.pools.core.query("SELECT value FROM platform.feature_flag WHERE key = \x27intel.enabled\x27"); if (f.rows[0]?.value === false) throw new ApiError("unavailable"); await next(); })/' $T "every Cares route still answers"

# Test-side plants (MUNIM_CARES_PLANT, read only by cares.test.ts): the clause-1 scan and the audit chain judge rows the code
# under test cannot forge (the guard stamps origin; the chain is a trigger), so the plant forges what the gate reads.
tplant() {
  local name="$1" want="$2" missing="" w
  if MUNIM_CARES_PLANT="$name" "$VITEST" run "$T" >"$OUT/$name.log" 2>&1; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1; return; fi
  IFS=';' read -ra wants <<<"$want"
  for w in "${wants[@]}"; do grep -E "FAIL .*($w)" "$OUT/$name.log" >/dev/null || missing="$missing [$w]"; done
  if [ -n "$missing" ]; then row FAIL "$name" "red, but no FAIL naming:$missing ($OUT/$name.log)"; fail=1
  else row ok "$name" "exit≠0; $(grep -cE '^ FAIL ' "$OUT/$name.log") FAIL lines, naming: $want"
  fi
}
tplant forged-origin "clause 1: every Cares book row"
tplant audit-tamper  "audit chains verify"
echo "redproof-cares: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
