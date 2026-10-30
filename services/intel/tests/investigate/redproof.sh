#!/usr/bin/env bash
# Red-proof for the T-083 gates (BOARD b-83 (1)–(8), idempotency and concurrency). Works only in a throwaway copy of the
# tree: copy green -> plant one defect -> the gate's run exits non-zero AND names the expected test (and, where another
# failure could also go red, the expected text) -> restore. node_modules are linked back to the original (the e2e and
# the vitest run core-api); nothing runs pnpm (gotcha 27). Needs the regenerated contracts (Pydantic models with the
# investigations schemas) and `investigations` in core-api's MODULES or the tests' own mount.
#   services/intel/tests/investigate/redproof.sh
set -euo pipefail
# `--offline` (what `make check` runs, via scripts/check/intel-redproof.sh): only the plants whose gate runs on recorded
# models without core-api or Postgres. The end-to-end and core plants seed worlds on embedded Postgres (minutes each), so
# they stay out of `make check`: run this script by hand, without the flag, after touching investigations (intel narrate or core's investigations module).
offline=0
[ $# -le 1 ] || { echo "redproof: one argument at most (--offline)" >&2; exit 2; }
case "${1:-}" in "") ;; --offline) offline=1 ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t083-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
# Each package's node_modules entries link back to the original, except the workspace packages (@munim/*), which link
# into THIS copy — a plant in packages/core-domain must reach core-api through `@munim/core-domain`.
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  if [ "$rel" = node_modules ]; then ln -s "$(cd "$nm" && pwd -P)" "$copy/node_modules"; continue; fi
  mkdir -p "$copy/$rel"
  for e in "$nm"/* "$nm"/.bin; do
    [ -e "$e" ] || continue
    if [ "$(basename "$e")" = "@munim" ]; then
      mkdir -p "$copy/$rel/@munim"
      for w in "$e"/*; do
        target=$(cd "$w" && pwd -P)
        ln -s "$copy/${target#"$(cd "$src" && pwd -P)"/}" "$copy/$rel/@munim/$(basename "$w")"
      done
    else
      ln -s "$e" "$copy/$rel/$(basename "$e")"
    fi
  done
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/.venv/*")

intel="$copy/services/intel"
core="$copy/services/core-api"
failures=0
run_unit() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/investigate/test_narrate.py) > "$copy/.out" 2>&1; }
run_e2e() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/investigate/test_investigate_e2e.py) > "$copy/.out" 2>&1; }
run_core() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/investigate/test_narrate_core_e2e.py) > "$copy/.out" 2>&1; }
run_vitest() { (cd "$core" && ./node_modules/.bin/vitest run test/investigations.test.ts) > "$copy/.out" 2>&1; }

replace() {
  python3 - "$copy/$1" "$2" "$3" <<'EOF'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
EOF
}

# Two replacements in one file, as one plant.
replace2() { replace "$1" "$2" "$3" && replace "$1" "$4" "$5"; }

# plant <label> <runner> <expected test name> <expected text or ""> <file under the repo> <command...>
plant() {
  local label=$1 runner=$2 expect=$3 message=$4 file=$5
  shift 5
  if [ $offline = 1 ] && [ "$runner" != run_unit ]; then echo "plant: $label — skipped (--offline)"; return 0; fi
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif "$runner"; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAILED|FAIL |×' "$copy/.out" | grep -F -- "$expect" >/dev/null && { [ -z "$message" ] || grep -qF -- "$message" "$copy/.out"; }; then
    echo "  red:   exits non-zero and names '$expect'${message:+ with \"$message\"}:"
    grep -E 'FAILED|FAIL ' "$copy/.out" | sed -n '1,3p' | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect' ${message:+/ \"$message\"}:"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

S=services/core-api/src/modules/investigations/step.ts
X=services/core-api/src/modules/investigations/index.ts
B=packages/core-domain/investigations/playbooks.ts
D=packages/core-domain/investigations/index.ts
N=services/intel/munim_intel/investigate/__init__.py
A=services/intel/munim_intel/app.py

echo "baseline:"
runners="run_unit run_core run_vitest run_e2e"
[ $offline = 0 ] || runners=run_unit
for r in $runners; do
  if "$r"; then echo "  green: $r: $(grep -E 'passed|Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: $r is red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

# --- the restaurant_group gates (e2e) ---
plant "(1) the bridge minted for the months swapped" run_e2e "test_gate3_held_settlement_waits_and_gate1_bridge_is_the_keys_before" "" "$B" \
  replace "$B" 'const MONTHS = { period_month: "$period_month", compare_month: "$compare_month" } as const;' \
                'const MONTHS = { period_month: "$compare_month", compare_month: "$period_month" } as const;'
plant "(2) the bar raised above the key's waste share" run_e2e "test_gate2_supported_items_are_the_keys_list" "" "$B" \
  replace "$B" 'components, min_bp: 1000 });' 'components, min_bp: 2100 });'
plant "(3) H0 without the settlements item" run_e2e "test_gate3_held_settlement_waits" "" "$B" \
  replace "$B" 'items: ["pos_days_closed", "settlements_imported", "bank_imported"]' 'items: ["pos_days_closed", "bank_imported"]'
plant "(4) the final re-mint deleted" run_e2e "test_gate4_a_planted_flip_of_a_frozen_item_at_the_final_remint_reopens_not_done" "" "$S" \
  replace "$S" '  if (status === "done") {' '  if (status === "done" && false) {'
plant "(6) core signs every item with the playbook owner" run_e2e "test_gate6_narration_signed_digit_free_resolving_untainted_without_tools" "" "$X" \
  replace "$X" 'narrated.map((u) => signature(u.specialist))' 'narrated.map(() => signature("finance"))'

# --- core (vitest) ---
plant "(8) an item's specialist changed" run_vitest "7 items, each with the hand-listed specialist" "" "$B" \
  replace "$B" 'bridgeItem("labour", "people",' 'bridgeItem("labour", "finance",'
plant "(a) volume/mix judged on revenue_volume alone" run_vitest "volume/mix is judged on revenue_volume + cogs_volume_mix together" "" "$B" \
  replace "$B" '["revenue_volume", "cogs_volume_mix"]' '["revenue_volume"]'
plant "(a) the share's sign ignored" run_vitest "the 1,000 bp bar" "" "$D" \
  replace "$D" 'score * sign >= rule.min_bp' 'Math.abs(score) >= rule.min_bp'
plant "(c) a template sentence types a number" run_vitest "(c) template narration is digit-free and cites" "" "$B" \
  replace "$B" 'does not explain this margin change {cells}.' 'does not explain this margin change by 0 {cells}.'
plant "(5) GET reads with an all-outlet context" run_vitest "the outlet-1 manager: GET → 404" "" "$X" \
  replace "$X" 'const view = await withContext(c.var.deps.pools.core, contextOf(m), (q) => investigationView(q, m, c.req.param("id")));' \
                'const view = await withContext(c.var.deps.pools.core, { ...contextOf(m), outlet_ids: "*", role: "owner" }, (q) => investigationView(q, m, c.req.param("id")));'
plant "(5) create takes a scope wider than the creator's" run_vitest "creating an all-outlet investigation → 404" "" "$X" \
  replace "$X" '    if (!covers(m.outlet_ids, scope)) throw new ApiError("not_found");' ''
plant "(i) a repeated step is not a replay" run_vitest ":continue {step_no: 1} twice → one step" "" "$S" \
  replace "$S" '    if (s.rows[0]?.member_id === m.member_id) return { replayed: true, narrate: [], scope, playbook: pb };' ''
plant "(i) a repeated create is not a replay" run_vitest "create twice with one id" "" "$X" \
  replace "$X" '        return { replayed: true, view: (await investigationView(q, m, id))! };' '        throw new ApiError("conflict");'
plant "(k) no row lock and the next number taken by the database" run_vitest "exactly 1 step row" "" "$S" \
  replace2 "$S" 'FROM core.investigation i WHERE i.id = $1 FOR UPDATE`' 'FROM core.investigation i WHERE i.id = $1`' \
                'VALUES ($1, $2, $3, $4, $6, $5)`, [m.tenant_id, id, stepNo, m.member_id,' 'VALUES ($1, $2, NULL, $3, $5, $4)`, [m.tenant_id, id, m.member_id,'
plant "(7) no template when intel is down" run_vitest "(7) intel down" "" "$X" \
  replace "$X" '      writeAnswer(q, run, { question, envelope: { answer_id: answerId, segments: template, abstained: false, reason_code: null } }));' \
                '      Promise.resolve(q && run && null));'

plant "clause 1: a step writes an audit row" run_vitest "0 book, audit, command, draft or decision rows change" "" "$S" \
  replace "$S" '    [id, status, JSON.stringify(pb.items.map((i) => checklist.get(i.item_id)!)), stepNo]);' \
               '    [id, status, JSON.stringify(pb.items.map((i) => checklist.get(i.item_id)!)), stepNo]);
  await q.query(`INSERT INTO core.audit_log (tenant_id, actor, action, entity, entity_id) VALUES ($1, $2, '"'"'investigations.plant.v1'"'"', '"'"'core.investigation'"'"', $3)`,
    [m.tenant_id, JSON.stringify({ kind: "member", id: m.member_id, role: m.role }), id]);'
plant "(m) an answer with another segment count is linked" run_vitest "(m) intel stores a segment more" "" "$X" \
  replace "$X" '    if (!env.abstained && env.segments.length !== step.narrate.length) return;' ''

# --- intel (unit) ---
plant "(6) the narration agent is given a tool" run_unit "test_one_call_no_tools_handles_not_values_and_untainted" "" "$N" \
  replace2 "$N" 'agent = LlmAgent(name="narrate", model=llm, instruction=INSTRUCTION)' 'agent = LlmAgent(name="narrate", model=llm, instruction=INSTRUCTION, tools=[_echo])' \
                '_LINE = re.compile(' 'def _echo(text: str) -> str:
    return text


_LINE = re.compile('
plant "(6) a model line with a typed number stands" run_unit "test_an_unusable_line_is_core_template_for_that_item_only" "a typed digit" "$N" \
  replace "$N" '    return out if check_grammar(out) is None else None' '    return out'
plant "(6) R-E 1-B: a ⟩k suffix line stands (core's grammar not run)" run_unit "test_an_unusable_line_is_core_template_for_that_item_only" \
  "a magnitude suffix" "$N" \
  replace "$N" '    return out if check_grammar(out) is None else None' '    return out'
plant "(6) R-E 1-B: a ref the model typed stands" run_unit "test_an_unusable_line_is_core_template_for_that_item_only" "typed itself" "$N" \
  replace "$N" ' or typed_bracket(text):' ':'
plant "(6) R-E 1-B: a segment the contract refuses is a 500 that logs the model's text" run_unit \
  "test_a_line_the_contract_refuses_is_template_and_no_model_text_reaches_a_log" "" "$N" \
  replace "$N" $'    try:\n        Segment.model_validate(seg)\n    except ValidationError:\n        return None\n    return seg' \
  $'    Segment.model_validate(seg)\n    return seg'
plant "(6) R-E 1-B, real core: a {C4}k line reaches core, which abstains the step's answer" run_core \
  "test_a_suffix_line_keeps_its_items_template_and_core_stores_the_answer" "" "$N" \
  replace "$N" '    return out if check_grammar(out) is None else None' '    return out'
plant "(money) the narration call is not charged" run_unit "test_one_call_no_tools_handles_not_values_and_untainted" "" "$N" \
  replace "$N" '        state.meter = Meter(SpendBuffer(client.write_spend, spend_currency(frame)), "narrate", provider_of(llm), llm.model, price_of(llm))' '        pass'
plant "(6) a line citing another item's cell stands" run_unit "test_an_unusable_line_is_core_template_for_that_item_only" "another item" "$N" \
  replace "$N" '        text = sentence(lines[item.item_id], table) if item.item_id in lines else None' \
                  '        text = sentence(lines[item.item_id], {k: v for t in tables for k, v in t.items()}) if item.item_id in lines else None'
plant "(6) AI off still calls the model" run_unit "test_ai_off_no_frame_or_a_failed_run_is_all_template" "" "$N" \
  replace "$N" '    if llm is not None and frame is not None and (frame.narration == "model" or frame_over_cap(cfg, frame)):' '    if llm is not None:'
plant "(I1) an auto_step token is refused a narration" run_unit \
  "test_an_auto_step_token_buys_a_narration_and_its_call_is_charged_and_an_event_token_does_not" "" "$A" \
  replace "$A" '        if ctx.trigger not in ("ask", "auto_step"):' '        if ctx.trigger != "ask":'
plant "(6) an event token buys a narration" run_unit "test_the_route_takes_ask_tokens_only_and_refuses_bad_bodies" "" "$A" \
  replace "$A" '        if ctx.trigger not in ("ask", "auto_step"):' '        if False:'
# T-127 (R58): over the month's cap with AI on (live) the step narrates with a model built capped; never with AI off.
plant "T-127 over the cap a live step keeps the template" run_unit "test_over_the_cap_a_live_step_narrates_and_never_with_ai_off" "" "$N" \
  replace "$N" '(frame.narration == "model" or frame_over_cap(cfg, frame))' 'frame.narration == "model"'
plant "T-127 AI off over the cap narrates (the kill switch ignored)" run_unit "test_over_the_cap_a_live_step_narrates_and_never_with_ai_off" "" "$N" \
  replace "$N" '(frame.narration == "model" or frame_over_cap(cfg, frame))' '(frame.narration == "model" or frame.budget is not None)'
plant "T-127 (money) the app builds the narrate model uncapped over the cap" run_unit \
  "test_over_the_cap_the_app_builds_the_narration_model_capped_and_no_call_reaches_the_provider" "" "$A" \
  replace "$A" '                    llm = await narrate_model(client, spend_currency(frame), capped)' '                    llm = await narrate_model(client, spend_currency(frame), False)'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
