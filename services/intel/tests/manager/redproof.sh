#!/usr/bin/env bash
# Red-proof for the T-082b gates (BOARD b-82 T-082b (1)–(6), the e2e, and core's HTTP AskPort), T-125's live models with
# a recorded fallback and T-127's over-the-cap rule (offline plants). Works only in a
# throwaway copy of the tree (as tests/context/redproof.sh): copy green -> plant one defect -> the gate's run exits
# non-zero AND names the expected test (and, where another failure could also go red, the expected message) -> restore.
# node_modules are linked back to the original (the e2e and the vitest run core-api); nothing runs pnpm (gotcha 27).
#   services/intel/tests/manager/redproof.sh
set -euo pipefail
# `--offline` (what `make check` runs, via scripts/check/intel-redproof.sh): only the plants whose gate runs on recorded
# models without core-api or Postgres. The end-to-end and core plants seed worlds on embedded Postgres (minutes each), so
# they stay out of `make check`: run this script by hand, without the flag, after touching the Manager or core's AskPort.
offline=0
[ $# -le 1 ] || { echo "redproof: one argument at most (--offline)" >&2; exit 2; }
case "${1:-}" in "") ;; --offline) offline=1 ;; *) echo "redproof: unknown argument ${1}" >&2; exit 2 ;; esac
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t082b-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

intel="$copy/services/intel"
core="$copy/services/core-api"
failures=0
run_offline() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/manager/test_manager.py tests/manager/test_live_fallback.py tests/manager/test_over_cap.py) > "$copy/.out" 2>&1; }
run_e2e() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/manager/test_manager_e2e.py) > "$copy/.out" 2>&1; }
run_vitest() { (cd "$core" && ./node_modules/.bin/vitest run src/modules/threads/askport.test.ts) > "$copy/.out" 2>&1; }
# A2 (events build): what Nemotron needed to answer an Ask, and its live answers replayed (offline: recorded fixtures only).
run_nemotron() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/manager/test_nemotron_ask.py) > "$copy/.out" 2>&1; }

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

# plant <label> <runner> <expected test name> <expected text or ""> <file under the repo> <command...>
plant() {
  local label=$1 runner=$2 expect=$3 message=$4 file=$5
  shift 5
  if [ $offline = 1 ] && [ "$runner" != run_offline ] && [ "$runner" != run_nemotron ]; then echo "plant: $label — skipped (--offline)"; return 0; fi
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif "$runner"; then
    echo "  FAIL: the gate passed with the plant in place"; failures=$((failures + 1))
  elif grep -E 'FAILED|FAIL ' "$copy/.out" | grep -F -- "$expect" >/dev/null && { [ -z "$message" ] || grep -qF -- "$message" "$copy/.out"; }; then
    echo "  red:   exits non-zero and names '$expect'${message:+ with \"$message\"}:"
    grep -E 'FAILED|FAIL ' "$copy/.out" | sed -n '1,3p' | sed 's/^/    /'
  else
    echo "  FAIL: red but not for '$expect' ${message:+/ \"$message\"}:"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

P=services/intel/munim_intel/manager/paths.py
K=services/intel/munim_intel/manager/ask.py
T=services/intel/munim_intel/tools/answer.py
A=services/intel/munim_intel/app.py
C=services/intel/munim_intel/context/assembler.py
G=services/intel/munim_intel/trace/plugin.py
H=services/core-api/src/modules/threads/askport.ts
L=services/intel/munim_intel/llm/providers.py
D=services/intel/munim_intel/decide/mimic.py
S=services/intel/munim_intel/smoke.py

echo "baseline:"
runners="run_offline run_nemotron run_e2e run_vitest"
[ $offline = 0 ] || runners="run_offline run_nemotron"
for r in $runners; do
  if "$r"; then echo "  green: $r: $(grep -E 'passed|Tests' "$copy/.out" | tail -1)"; else echo "  FAIL: $r is red on the clean copy:"; tail -30 "$copy/.out"; exit 1; fi
done

plant "(1) investigate routed to the answer path" run_offline "test_each_route_intent_takes_the_hand_path" "" "$P" \
  replace "$P" '"investigate": FAN_OUT,' '"investigate": ANSWER,'
plant "(1) the low band does not fall back to explain" run_offline "test_each_route_intent_takes_the_hand_path" "" "$K" \
  replace "$K" 'return answer_or_fallback(ROUTE_INTENT, result) or "explain", result' 'return result.answer or "lookup", result'
plant "(2) an addressed ask binds propose on every path" run_offline "test_propose_is_bound_only_on_draft_request_with_one_addressed_skill" "" "$P" \
  replace "$P" 'return Binding(path, addressed_to, loadable=False, propose=path.propose)' 'return Binding(path, addressed_to, loadable=False, propose=True)'
plant "(3) certification_request runs the model" run_offline "test_a_certification_request_abstains_not_a_certificate_with_zero_model_calls" "" "$P" \
  replace "$P" 'CERTIFICATE = Path("certificate", propose=False, abstain="not_a_certificate")' 'CERTIFICATE = Path("certificate", propose=False)'
plant "(4) an addressed ask keeps load_skill (the model may choose)" run_offline "test_addressing_a_specialist_binds_exactly_that_skills_tools" "" "$P" \
  replace "$P" 'return Binding(path, addressed_to, loadable=False, propose=path.propose)' 'return Binding(path, addressed_to, loadable=True, propose=path.propose)'
plant "(5) kitchen not off for shops" run_offline "test_kitchen_on_a_shop_only_scope_abstains_not_applicable_with_no_model_call" "" "$P" \
  replace "$P" 'NOT_FOR_KINDS: dict[str, frozenset[str]] = {"kitchen": frozenset({"store"})}' 'NOT_FOR_KINDS: dict[str, frozenset[str]] = {}'
plant "(6) the thread taint carry removed" run_offline "test_a_tainted_thread_refuses_the_proposal_and_writes_no_draft" "" "$C" \
  replace "$C" "            self.state.tainted = True" "            pass"
plant "(6) the plugin's taint refusal removed" run_offline "test_a_tainted_thread_refuses_the_proposal_and_writes_no_draft" "" "$G" \
  replace "$G" "if state.tainted and _gated(name):" "if False:"
plant "submit_answer passes an unresolved handle" run_offline "test_submit_answer_refuses_once_then_abstains_with_the_rule" "" "$T" \
  replace "$T" "if out == CANNOT_VERIFY:" "if False:"
plant "submit_answer's refs not taken from the expanded text" run_offline "test_submit_answer_builds_refs_from_the_expansion_and_ends_the_run" "" "$T" \
  replace "$T" "refs = list(dict.fromkeys(ref_id(t) for t in _CANONICAL.findall(out)))" 'refs = [f"snap:{self._answer_id}"]'
plant "a failed run raises instead of storing an abstention" run_offline "test_a_run_that_ends_without_submit_answer_stores_an_abstention" "" "$K" \
  replace "$K" 'log.warning("intel: ask run %s failed: %s", ctx.run_id, e.kind)' 'raise'
plant "an event token buys an ask" run_offline "test_the_ask_endpoint_refuses_other_tokens_and_bad_bodies" "" "$A" \
  replace "$A" '# Only an ask token buys an ask (an event or sweep token must not spend model calls here).
        if ctx.trigger != "ask":' '# Only an ask token buys an ask (an event or sweep token must not spend model calls here).
        if False:'
plant "e2e: the question is not stored unchanged" run_e2e "test_an_addressed_ask_through_real_core" "assert 503 == 200" "$K" \
  replace "$K" "InternalAnswersRequest(question=req.question, envelope=envelope)" "InternalAnswersRequest(question=req.question + ' ', envelope=envelope)"
plant "e2e: the addressed run is not labelled with its specialist" run_e2e "test_an_addressed_ask_through_real_core" "specialist:finance" "$K" \
  replace "$K" 'actor = f"specialist:{req.addressed_to}" if req.addressed_to else "manager"' 'actor = "manager"'
# W3 close: R-E 2-B (submit_answer = core's grammar, no typed ref), R-E 2-A (lazy models), R-E 1-C (spend, money)
plant "R-E 2-B: submit_answer lets a typed bracket through" run_offline "test_submit_answer_refuses_once_then_abstains_with_the_rule" "" "$T" \
  replace "$T" "        if typed_bracket(text):" "        if False:"
plant "R-E 2-B: submit_answer skips core's grammar (a ⟩k suffix passes)" run_offline "test_submit_answer_refuses_once_then_abstains_with_the_rule" "" "$T" \
  replace "$T" "        v = check_grammar(out)" "        v = None"
plant "R-E 2-A: /ask builds its models before the AI-off exit" run_offline "test_a_model_that_cannot_be_built_is_a_model_blocked_abstention_not_a_502" "" "$A" \
  replace "$A" "            out = await answer_ask(ctx, req, frame, client, cfg, models_of)" "            out = await answer_ask(ctx, req, frame, client, cfg, await models_of(client, spend_currency(frame)))"
plant "R-E 2-A: a model that cannot be built is a 502" run_offline "test_a_model_that_cannot_be_built_is_a_model_blocked_abstention_not_a_502" "" "$K" \
  replace "$K" "        except (ProviderUnavailable, RetiredModelRefused, CoreError, httpx.HTTPError) as e:" "        except (CoreError, httpx.HTTPError) as e:"
plant "e2e (money): the Manager's calls are not charged" run_e2e "test_the_ask_posted_one_spend_row_per_model_call_and_cores_budget_left_fell" "" "$K" \
  replace "$K" "    p = prepare(ctx, req, frame, client, b, Branches(models.reason, cfg), meter)" "    p = prepare(ctx, req, frame, client, b, Branches(models.reason, cfg), None)"
plant "e2e (money): the route.intent call is not charged" run_e2e "test_the_ask_posted_one_spend_row_per_model_call_and_cores_budget_left_fell" "" "$K" \
  replace "$K" "            spend.add(\"router\", result.provider, result.model_id, usage, result.price)" "            pass"
plant "e2e (money): AI off at the cap still calls the model" run_e2e "test_at_the_cap_the_next_ask_abstains_model_blocked_with_no_model_call" "" "$K" \
  replace "$K" '    if frame.narration != "model" and not capped:' '    if False:'
# R47 D5: ask before fanning out — an unscored investigate answers alone and offers dig_deeper; a scored one fans out.
plant "D5: an unscored investigate fans out" run_offline "test_an_unscored_investigate_answers_single_agent_and_offers_to_dig_deeper" "" "$P" \
  replace "$P" '    if path is FAN_OUT and addressed_to is None and band == "unscored" and not deep:' '    if False:'
plant "D5: the offer is not stored on the answer" run_offline "test_an_unscored_investigate_answers_single_agent_and_offers_to_dig_deeper" "" "$K" \
  replace "$K" '        envelope = envelope.model_copy(update={"follow_up": follow_up})' '        pass'
plant "D5: a scored investigate answers alone too" run_offline "test_paired_a_scored_investigate_binds_fan_out_and_offers_nothing" "" "$P" \
  replace "$P" '    if path is FAN_OUT and addressed_to is None and band == "unscored" and not deep:' '    if path is FAN_OUT and addressed_to is None:'
# R47 D5 follow-through: the member's `deep` (the offer, tapped) fans out an unscored investigate.
plant "D5: deep is ignored by the path table" run_offline "test_paired_an_unscored_investigate_the_member_asked_to_dig_deeper_fans_out" "" "$P" \
  replace "$P" '    if path is FAN_OUT and addressed_to is None and band == "unscored" and not deep:' '    if path is FAN_OUT and addressed_to is None and band == "unscored":'
plant "D5: deep is not passed from the request" run_offline "test_paired_an_unscored_investigate_the_member_asked_to_dig_deeper_fans_out" "" "$K" \
  replace "$K" '    path, follow_up = path_for(intent, band, req.addressed_to, bool(req.deep))' '    path, follow_up = path_for(intent, band, req.addressed_to)'
plant "D5: deep widens a lookup" run_offline "test_deep_widens_only_an_unaddressed_investigation" "" "$P" \
  replace "$P" '    path = PATHS[intent]' '    path = FAN_OUT if deep else PATHS[intent]'
plant "core: the AskPort has no timeout" run_vitest "the port rejects at its timeout" "" "$H" \
  replace "$H" "        signal: AbortSignal.timeout(timeoutMs)," ""
# T-125 (R56 G-4): live models with a recorded fallback (tests/manager/test_live_fallback.py, recorded fixtures, no network).
FB=test_a_failed_live_call_is_served_from_the_fixture_of_that_exact_call
plant "T-125: the fallback removed" run_offline "$FB" "" "$L" \
  replace "$L" "        replayed = None if fallback is None or key is None else fallback.replay(key[0], key[2])" "        replayed = None"
plant "T-125: the fallback removed (a fixture's answer never reaches the validator)" run_offline \
  "test_a_fallback_answer_passes_the_validator_as_a_live_one_would" "" "$L" \
  replace "$L" "        replayed = None if fallback is None or key is None else fallback.replay(key[0], key[2])" "        replayed = None"
plant "T-125: the fallback always taken (the live call skipped)" run_offline "test_paired_a_successful_live_call_is_used_as_is_and_traced_live" "" "$L" \
  replace "$L" "        if llm.capped:" "        if True:"
plant "T-125: over the cap still calls the provider" run_offline "$FB[over_cap]" "" "$L" \
  replace "$L" $'        if llm.capped:\n            await call.aclose()\n            raise OverCap()\n' ""
plant "T-125: the fallback keyed by the live model id" run_offline "$FB[rate_limited]" "" "$L" \
  replace "$L" 'request_key(req.model_copy(update={"model": fallback.model}))' "request_key(req)"
plant "T-125: a miss swallowed instead of re-raised" run_offline "test_a_400_on_a_logprobs_request_with_no_fixture_is_still_retried_without_logprobs" "" "$L" \
  replace "$L" $'            setattr(e, KEY, "abstained")\n            raise' "            return []"
plant "T-125: an abstained call is not labelled" run_offline "test_with_no_fixture_a_failed_live_call_abstains_exactly_as_today" "" "$L" \
  replace "$L" '            setattr(e, KEY, "abstained")' "            pass"
plant "T-125: a fixture's token counts charged as this call's" run_offline "test_a_fallback_answer_passes_the_validator_as_a_live_one_would" "" "$L" \
  replace "$L" '[r.model_copy(update={"usage_metadata": None}) for r in replayed]' "replayed"
plant "T-125: the plugin does not trace the path" run_offline "$FB" "" "$G" \
  replace "$G" "        if path is not None and not llm_response.partial:" "        if False:"
plant "T-125: the router's path is not on the ask's route trace" run_offline "$FB" "" "$K" \
  replace "$K" '    labels.update(served)' "    pass"
plant "T-125: the router falls back to fixtures recorded mode does not replay" run_offline \
  "test_each_role_falls_back_to_the_fixtures_recorded_mode_replays" "" "$D" \
  replace "$D" "currency=currency, fallback_dir=FIXTURES_DIR, capped=capped))" "currency=currency, capped=capped))"
plant "T-125: the live probe may be served from a fixture" run_offline "test_the_live_probe_is_never_served_from_a_fixture" "" "$S" \
  replace "$S" "currency=None, fallback_dir=None)," "currency=None),"
# T-127 (R58): over the month's AI cap with AI on (live) a run is served capped; AI switched off never gets an AI answer
# (tests/manager/test_over_cap.py: recorded fixtures, the provider planted, no network).
LL=services/intel/munim_intel/llm/__init__.py
OC=test_an_ask_over_the_cap_is_served_from_its_fixture_and_never_with_ai_off
W=services/intel/munim_intel/watch
plant "T-127: AI off over the cap is served (the kill switch ignored)" run_offline "$OC[AI off, over the cap]" "" "$LL" \
  replace "$LL" 'return cfg.model_mode == "live" and ai_enabled is True and budget_level == "hard"' 'return cfg.model_mode == "live" and budget_level == "hard"'
plant "T-127: no budget for the month is served (R47 D2 ignored)" run_offline "$OC[AI on, no budget this month]" "" "$LL" \
  replace "$LL" 'and ai_enabled is True and budget_level == "hard"' 'and ai_enabled is True and budget_level != "ok"'
plant "T-127: recorded mode is served over the cap (gates no longer replay as before)" run_offline "$OC[AI on, over the cap, recorded mode]" "" "$LL" \
  replace "$LL" 'return cfg.model_mode == "live" and ai_enabled is True' 'return ai_enabled is True'
plant "T-127: the ask's AI-off exit removed" run_offline "$OC[AI off, over the cap]" "" "$K" \
  replace "$K" '    if frame.narration != "model" and not capped:' '    if False:'
plant "T-127: the ask builds its models uncapped over the cap" run_offline "$OC[AI on, over the cap]" "" "$K" \
  replace "$K" '            models = await models(client, spend.currency, capped)' '            models = await models(client, spend.currency)'
plant "T-127: the production router built uncapped" run_offline "test_the_production_factories_build_every_model_capped_over_the_cap" "" "$K" \
  replace "$K" '            await router_decision_model(cfg, client, currency=currency, capped=capped),' '            await router_decision_model(cfg, client, currency=currency),'
plant "T-127: the watcher's narrator ignores AI off" run_offline "test_a_watcher_narrates_over_the_cap_only_capped_and_never_with_ai_off" "" "$A" \
  replace "$A" $'    if frame.narration != "model" and not capped:\n        return None\n' ""
plant "T-127: the watcher keeps a model with AI off" run_offline "test_a_watcher_narrates_over_the_cap_only_capped_and_never_with_ai_off" "" "$W/pipeline.py" \
  replace "$W/pipeline.py" 'self.llm = llm if frame.narration == "model" or over_cap(cfg, frame.ai_enabled, frame.budget_level) else None' 'self.llm = llm'
plant "T-127: the watcher's frame drops the kill switch (AI on assumed)" run_offline "test_a_watcher_narrates_over_the_cap_only_capped_and_never_with_ai_off" "" "$W/frame.py" \
  replace "$W/frame.py" 'ai_enabled=body.get("ai_enabled") is True,' 'ai_enabled=True,'

# A2 (events build): tests/manager/test_nemotron_ask.py.
HD=services/intel/munim_intel/tools/handles.py
GN=services/intel/munim_intel/tools/generated.py
AR=services/intel/munim_intel/tools/args.py
CM=services/intel/munim_intel/context/core.md
plant "A2: an outlet handle no longer resolves" run_nemotron "test_an_outlet_handle_reaches_core_as_that_outlets_id" "" "$HD" \
  replace "$HD" '        o = OUTLET.match(handle)' '        o = None'
plant "A2: the week starts on a Sunday" run_nemotron "test_date_windows_are_the_calendar_weeks_and_months_around_the_business_date" "" "$C" \
  replace "$C" '    monday = d - timedelta(days=d.weekday())' '    monday = d - timedelta(days=d.weekday() + 1)'
plant "A2: the date windows leave the run frame" run_nemotron "test_the_frame_block_names_each_outlet_by_its_handle" "" "$C" \
  replace "$C" '    head = "\n".join([head, *(date_windows(d) for d in sorted({o.business_date for o in frame.outlets}))])' '    pass'
plant "A2: the read index skips a specialist" run_nemotron "test_the_manager_sees_every_specialists_reads" "" "$GN" \
  replace "$GN" '        if sp["kind"] != "specialist":' '        if sp["kind"] != "specialist" or sp["id"] == "people":'
plant "A2: the read index stays after a skill is loaded" run_nemotron "test_the_manager_sees_every_specialists_reads" "" "$C" \
  replace "$C" '    index = "" if skills else f"{head}\n{read_index()}\n\n"' '    index = f"{head}\n{read_index()}\n\n"'
plant "A2: the routing examples leave the Manager's prompt" run_nemotron "test_the_manager_sees_every_specialists_reads" "" "$C" \
  replace "$C" '    return f"{index}{ROUTES}\n\n{loaded}"' '    return f"{index}{loaded}"'
plant "A2: the finish tool counts against the tool cap" run_nemotron "test_at_the_tool_cap_a_read_is_refused_and_the_finish_tool_still_runs" "" "$G" \
  replace "$G" 'FINISH_TOOLS = frozenset({"submit_answer", "report"})' 'FINISH_TOOLS: frozenset[str] = frozenset()'
plant "A2: a null word stays a word" run_nemotron "test_the_word_none_is_null_where_an_argument_admits_null" "" "$AR" \
  replace "$AR" '    return {k: None if isinstance(v, str) and v.strip().lower() in NULL_WORDS and admits_null(k) else v for k, v in args.items()}' '    return dict(args)'
plant "A2: a refusal names the first bad segment only" run_nemotron "test_one_refusal_names_every_refused_segment" "" "$T" \
  replace "$T" $'                found.append(str(problem))\n                reason = reason or code' $'                found.append(str(problem))\n                reason = reason or code\n                break'
plant "A2: the discovery blanks digits inside the refs" run_nemotron "test_a_refusal_names_every_rule_a_segment_breaks" "malformed_ref" "$T" \
  replace "$T" '    prose = ANY_REF.split(text)' '    prose, refs = [text], []'
plant "A2: a compound number word is echoed whole" run_nemotron "test_a_refusal_names_every_rule_a_segment_breaks" "" "$T" \
  replace "$T" $'        return f"{v.rule}, {what}, {\'-\'.join(listed)!r}" if listed else f"{v.rule}, {what}"' $'        return f"{v.rule}, {what}, {v.match.lower()!r}"'
plant "A2: the OpenAI-compatible client back to the SDK's two retries" run_nemotron "test_a_live_nemotron_call_outlasts_a_burst_of_rate_limits" "" "$L" \
  replace "$L" '        client = super()._openai_client.with_options(max_retries=OPENAI_RETRIES)' '        client = super()._openai_client'
# Fix cycle 1: an empty read's claim is left out, never moved into a segment citing another cell; O<n> fills outlet slots only.
plant "A2 fix 1: the refusal coaches the empty read's claim into another segment" run_nemotron "test_what_an_empty_read_shows_is_left_out" "" "$T" \
  replace "$T" 'EMPTY_READ = "Leave out what a read without rows shows; say only what cited cells show."' 'EMPTY_READ = "Say what a read without rows shows inside a segment that cites a cell, or leave it out."'
plant "A2 fix 1: the output contract coaches the empty read's claim into another segment" run_nemotron "test_what_an_empty_read_shows_is_left_out" "" "$C" \
  replace "$C" '            "- What a read without rows shows is not stated at all: leave it out, and never invent a handle. The answer speaks\n"' '            "- A read that returned no rows has no cell: say so, if it matters, inside a segment that cites another cell. The answer speaks\n"'
plant "A2 fix 1: a segment may name an outlet none of its cited cells is tied to" run_nemotron "test_a_segment_naming_an_outlet_must_cite_a_cell_of_that_outlet" "" "$T" \
  replace "$T" '        untied = self._untied_outlet(out)' '        untied = None'
plant "A2 fix 1: a figure no outlet has still needs an outlet's tie (the graph's butter answer refused)" run_nemotron "test_a_segment_naming_an_outlet_must_cite_a_cell_of_that_outlet" "" "$T" \
  replace "$T" '        if not per_outlet:' '        if False:'
plant "A2 fix 1: the Manager's submit_answer is built without the run frame's outlets" run_nemotron "test_a_segment_naming_an_outlet_must_cite_a_cell_of_that_outlet" "" "$K" \
  replace "$K" '    outlets = {o.id.root: o.name for o in frame.outlets}' '    outlets: dict[str, str] = {}'
plant "A2 fix 1: the run frame no longer names the question's outlet by handle" run_nemotron "test_the_frame_block_hands_the_model_the_handle" "" "$C" \
  replace "$C" '    if named:' '    if False:'
plant "A2 fix 1: an outlet handle fills any id slot" run_nemotron "test_an_outlet_handle_fills_only_an_outlet_argument" "" "$HD" \
  replace "$HD" '        if o and not outlet:' '        if False:'
plant "A2: any prompt change re-keys the live replays (they miss and abstain)" run_nemotron "test_a_live_nemotron_answer_replays" "" "$CM" \
  replace "$CM" 'Keep answers short and plain.' 'Keep answers short.'

if [ "$failures" -ne 0 ]; then echo "$failures red-proof(s) FAILED"; exit 1; fi
echo "all red-proofs held"
