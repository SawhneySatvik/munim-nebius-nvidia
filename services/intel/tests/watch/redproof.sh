#!/usr/bin/env bash
# Red-proof for the T-043 gates (as tests/trace/redproof.sh): in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits NON-ZERO and names the expected test  ->  restore.
# A red that does not name the expected test (a crash, an unrelated failure) fails this script. The copy gets its own
# .venv; node_modules are linked back (the end-to-end gates run core-api, worldgen and embedded Postgres under node).
# The note-a gate (test_a_tenant_wide_sweep_files_each_finding_under_its_own_outlet) needs the core-api change T-043
# filed; until it is applied that gate is deselected here and the script says so.
#   services/intel/tests/watch/redproof.sh
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t043-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .mypy_cache --exclude .ruff_cache "$src/" "$copy/"
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*")

intel="$copy/services/intel"
U=tests/watch/test_watch.py
E=tests/watch/test_watch_e2e.py
deselect=()
if ! grep -q "T-043 (T-040 note a)" "$copy/services/core-api/src/internal/index.ts"; then
  echo "note: core-api lacks the T-043 note-a change; its gate is deselected"
  deselect=(--deselect "$E::test_a_tenant_wide_sweep_files_each_finding_under_its_own_outlet")
fi
failures=0
run_pytest() { (cd "$intel" && uv run --quiet --frozen pytest -q -p no:warnings ${deselect[@]+"${deselect[@]}"} "$@") > "$copy/.out" 2>&1; }

# replace <file under the repo> <old> <new>: exactly one occurrence, or the plant itself is broken.
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

# plant <label> <expected text> <pytest target> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 target=$3 file=$4
  shift 4
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$target"; then
    echo "  FAIL: pytest passed (exit 0) with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "$expect" "$copy/.out"; then
    echo "  red:   pytest exits non-zero and names '$expect':"
    grep -F -- "$expect" "$copy/.out" | sed -n '1,2p' | sed 's/^/    /'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

I=services/intel/munim_intel
EV=$I/events/__init__.py
PL=$I/watch/pipeline.py
AD=$I/watch/detectors/finance/unapproved_ad_fee.py
MP=$I/mapping/__init__.py

echo "baseline:"
if run_pytest tests/watch; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

# W3 close ruling (money): a sweep's narration call is one spend row (app.watch builds the meter; WatchRun carries it)
plant "narration calls not charged" "FAILED $E::test_sweeps_find_the_answer_key_plants_of_both_reference_detectors" "$E" $PL \
  replace $PL '            meter=meter,' '            meter=None,'

# (1) event dedupe: without the claim every delivery runs the detectors
plant "events:claim skipped" "FAILED $E::test_three_deliveries_of_one_event_make_one_claim_one_detector_run_one_finding" "$E" $EV \
  replace $EV '    if await core.claim_event(event.id.root) is None:' '    if False:'
plant "events:claim skipped (offline)" "FAILED $U::test_three_deliveries_of_one_event_run_the_detectors_once" $U $EV \
  replace $EV '    if await core.claim_event(event.id.root) is None:' '    if False:'

# (2) threshold: "≥" read as ">"
plant "threshold off by one" "FAILED $U::test_just_below_the_threshold_finds_nothing_and_at_it_finds_one" $U $AD \
  replace $AD 'amount >= t["unapproved_minor_gte"]' 'amount > t["unapproved_minor_gte"]'

# (3) narration off still calls the model
plant "kill switch ignored" "FAILED $U::test_narration_off_makes_zero_model_calls_and_writes_the_template" $U $PL \
  replace $PL '        self.llm = llm if frame.narration == "model" or over_cap(cfg, frame.ai_enabled, frame.budget_level) else None' '        self.llm = llm'

# (4) confidence not from the coverage cell
plant "coverage cell ignored" "FAILED $U::test_confidence_is_the_coverage_cell_the_pack_names_else_full" $U $I/detect/__init__.py \
  replace $I/detect/__init__.py '        if self.coverage_column is None:' '        if True:'

# free digit: narration without the template first — the refused prose is all the finding has, so it is abstained.
# (core's grammar itself cannot be planted here: core-domain loads through node_modules, linked to the live tree.)
plant "narration replaces the template" "FAILED $E::test_a_free_digit_in_narration_is_abstained_and_the_template_stays" "$E" $PL \
  replace $PL '        res = await self._post_finding({**base, "envelope": {"finding_id": fid, **envelope}, **named}, spec)' \
  $'        if self.llm is not None and severity in NARRATE_AT:\n            envelope = {**envelope, "segments": await model_segments(spec, severity, snap, i, hit.impact_row, llm=self.llm, ctx=self.ctx, cfg=self.cfg, state=self.state, handles=self.handles)}\n        res = await self._post_finding({**base, "envelope": {"finding_id": fid, **envelope}, **named}, spec)'

# (5) specialist stamp: a finding filed under the wrong specialist; a draft proposed by another
plant "findings stamped finance" "FAILED $E::test_every_finding_and_draft_carries_its_specialist" "$E" $PL \
  replace $PL '            "pack": spec.pack,' '            "pack": "finance",'
plant "drafts stamped catalogue (offline)" "FAILED $U::test_every_finding_draft_and_trace_carries_its_specialist" $U $MP \
  replace $MP '        "pack": pack,' '        "pack": "catalogue",'

# (6) re-detection: a finding id stable across runs never merges; a draft id keyed on the snapshot is a new proposal
plant "finding id not fresh per run" "FAILED $E::test_a_re_detection_merges_with_zero_new_rows" "$E" $PL \
  replace $PL 'fid = uuid7(run_start_ms(self.ctx.run_id), f"{self.ctx.run_id}\0{dedupe}")' 'fid = uuid7(1, dedupe)'
plant "draft id keyed on the snapshot" "FAILED $E::test_a_re_detection_merges_with_zero_new_rows" "$E" $MP \
  replace $MP 'did = draft_id(finding_id, p)' 'did = draft_id(d.snapshot_id, p)'

# end to end: the plants are found because the detector reads the pack's threshold — a wrong one finds nothing
plant "threshold read 100x too high" "FAILED $E::test_sweeps_find_the_answer_key_plants_of_both_reference_detectors" "$E" $AD \
  replace $AD 'amount >= t["unapproved_minor_gte"]' 'amount >= 100 * t["unapproved_minor_gte"]'

# (b) the plugin ignores a generated tool's own check
plant "plugin skips validate_args" "FAILED $U::test_the_plugin_refuses_a_generated_tools_invalid_arguments_with_its_own_message" $U $I/trace/plugin.py \
  replace $I/trace/plugin.py '    if callable(validate):' '    if False:'

# registry: a detector filed under another specialist
plant "above_mrp filed under finance" "FAILED $U::test_every_registered_detector_belongs_to_its_specialist_in_the_registry" \
  "$U::test_every_registered_detector_belongs_to_its_specialist_in_the_registry" $I/watch/detectors/catalogue/above_mrp.py \
  replace $I/watch/detectors/catalogue/above_mrp.py '        pack="catalogue",' '        pack="finance",'

# W3.2 integration hooks (offline): follow-up mints, mapping abstain, invalid findings, the one SkillSpec shape
H=tests/watch/test_hooks.py
plant "follow-up minted but not handed to the mapping" "FAILED $H::test_a_follow_up_is_minted_after_the_finding_with_the_detections_ids_and_reaches_the_mapping" $H $PL \
  replace $PL '                await self._draft(spec, spec.mapping, replace(d, follow=follow), finding_id)' '                await self._draft(spec, spec.mapping, d, finding_id)'
plant "a mapping's abstention dropped silently" "FAILED $H::test_a_mapping_abstention_is_traced_as_its_reason_code_and_the_accept_case_drafts" $H $PL \
  replace $PL $'            self.report.drafts["abstained"] += 1\n            await self.trace("abstain", spec.pack, {"detector": spec.id, "reason": reason})' \
    $'            return\n            await self.trace("abstain", spec.pack, {"detector": spec.id, "reason": reason})'
plant "an abstention's text reaches the trace" "FAILED $H::test_a_reason_code_outside_the_contracts_list_never_reaches_a_trace" $H $PL \
  replace $PL '                reason: str = ReasonCode.model_validate(proposal.reason_code).root' '                reason = proposal.reason_code'
plant "an invalid finding crashes the run" "FAILED $H::test_a_finding_the_contract_refuses_is_traced_and_the_run_goes_on" $H $PL \
  replace $PL '            req = InternalFindingsRequest.model_validate(body)
        except ValidationError:' '            req = InternalFindingsRequest.model_validate(body)
        except KeyError:'
SK=tests/packs/test_skills.py
plant "a number word in a skill's instructions" "FAILED $SK::test_each_skill_binds_only_its_registry_tools_within_the_cap_and_cites_without_numbers[market]" $SK \
  $I/skills/market/skill.py replace $I/skills/market/skill.py 'With too few past occurrences' 'With fewer than two past occurrences'
plant "a skill owning another specialist's draftable" "FAILED $SK::test_each_skill_binds_only_its_registry_tools_within_the_cap_and_cites_without_numbers[market]" $SK \
  $I/skills/market/skill.py replace $I/skills/market/skill.py 'DRAFTABLES = ("goals.goal.create.v1", "goals.task.create.v1")' 'DRAFTABLES = ("goals.goal.create.v1", "goals.task.create.v1", "catalogue.price.set.v1")'
plant "load_skill takes any pack" "FAILED $SK::test_the_registry_names_eight_specialists_and_each_has_a_skill" $SK $I/skills/__init__.py \
  replace $I/skills/__init__.py '    if pack not in PACKS:' '    if pack == "nobody":'

# R-B S2-A: containment, declared thresholds; S2-C: tenant-level detectors (offline)
plant "containment re-raises: one detector's defect ends the sweep" "FAILED $H::test_a_detector_that_raises_is_traced_by_type_and_the_other_packs_still_run" $H $PL \
  replace $PL '    async def _failed(self, spec: DetectorSpec, where: str, e: Exception) -> None:' $'    async def _failed(self, spec: DetectorSpec, where: str, e: Exception) -> None:\n        raise e'
plant "a mapping's defect is not contained" "FAILED $H::test_a_mapping_that_raises_costs_its_draft_only" $H $PL \
  replace $PL '                await self._failed(spec, "mapping", e)' '                raise'
plant "the error trace carries the exception's message" "FAILED $H::test_a_detector_that_raises_is_traced_by_type_and_the_other_packs_still_run" $H $PL \
  replace $PL '"type": error_label(e)})' '"type": str(e)})'
plant "a pack missing a declared threshold runs anyway" "FAILED $H::test_a_pack_missing_a_declared_threshold_abstains_the_detector_and_an_undeclared_read_is_an_error" $H $PL \
  replace $PL 'if pack_thresholds is None or any(k not in pack_thresholds for k in spec.thresholds):' 'if pack_thresholds is None:'
plant "the detector is handed undeclared keys" "FAILED $H::test_a_pack_missing_a_declared_threshold_abstains_the_detector_and_an_undeclared_read_is_an_error" $H $PL \
  replace $PL 'thresholds = {k: pack_thresholds[k] for k in spec.thresholds}' 'thresholds = dict(pack_thresholds)'
plant "a detector reads a key it does not declare" "FAILED $H::test_every_detector_declares_the_threshold_keys_its_code_reads_and_both_packs_carry_them" $H \
  $I/watch/detectors/finance/tender_gap.py replace $I/watch/detectors/finance/tender_gap.py \
  'thresholds=("critical_voids_vs_median_bp_gte", "gap_days_gte"),' 'thresholds=("gap_days_gte",),'
plant "tenant-level minted per outlet" "FAILED $H::test_a_tenant_level_detector_mints_once_with_the_latest_business_date_and_drafts_tenant_wide" $H $PL \
  replace $PL '            outlets = [max(outlets, key=lambda o: o.business_date)] if outlets else []' '            pass'
plant "tenant-level drafts filed under the visited outlet" "FAILED $H::test_a_tenant_level_detector_mints_once_with_the_latest_business_date_and_drafts_tenant_wide" $H $PL \
  replace $PL '            proposal = replace(proposal, outlet_ids=[])' '            pass'
plant "tenant-level runs in a scoped run" "FAILED $H::test_a_tenant_level_detector_abstains_in_a_run_scoped_to_some_outlets" $H $PL \
  replace $PL '            if self.ctx.outlet_scope != ("*",):' '            if False:'
# R-B polish: `as_of` is the run-frame's business date, never null (core's clock)
plant "a detector mints a null as_of again" "FAILED $H::test_every_as_of_a_sweep_mints_is_the_outlets_business_date" $H \
  $I/watch/detectors/inventory_purchasing/dead_stock.py replace $I/watch/detectors/inventory_purchasing/dead_stock.py \
  '"as_of": outlet.business_date.isoformat()}' '"as_of": None}'

echo "after the plants:"
if run_pytest tests/watch; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi

if [ $failures -ne 0 ]; then
  echo "t043-redproof: FAIL ($failures)" >&2
  exit 1
fi
echo "t043-redproof: ok — 31/31 plants (13 T-043 + 7 W3.2 + 10 R-B fix cycle + 1 W3 close spend) turned the gates red (non-zero exit) naming the expected test; green after restoring"
