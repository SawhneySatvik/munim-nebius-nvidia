#!/usr/bin/env bash
# Red-proof for intel's pytest gates (T-041). Works only in a throwaway copy of the tree. For each gate:
#   copy green  ->  plant the defect  ->  pytest exits non-zero AND names the expected test  ->  restore.
# A red that does not name the expected text (a crash, an unrelated failure) fails this gate. The copy gets its
# own .venv (the shared one has intel installed editable from the live tree, so it would import the wrong code).
set -euo pipefail
# Stale bytecode can replay a planted module after restore (b-81 found it): never write .pyc in the copy.
export PYTHONDONTWRITEBYTECODE=1
src=$(cd "$(dirname "$0")/../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-intel-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
# .env and .run (secrets) are never copied: the gates need neither.
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad "$src/" "$copy/"
# The run-token fixture runs core's signer under node: link node_modules back to the original.
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*")

intel="$copy/services/intel"
failures=0
# --frozen: install exactly the (possibly planted) lock without re-resolving or rejecting it first.
run_pytest() { (cd "$intel" && uv run --quiet --frozen pytest -q "$@") > "$copy/.out" 2>&1; }

# replace <file under services/intel> <old> <new>: exactly one occurrence, or the plant itself is broken.
replace() {
  python3 - "$intel/$1" "$2" "$3" <<'EOF'
import sys
path, old, new = sys.argv[1:]
text = open(path, encoding="utf8").read()
if text.count(old) != 1:
    sys.exit(f"plant does not apply: {old!r} occurs {text.count(old)} times in {path}")
open(path, "w", encoding="utf8").write(text.replace(old, new))
EOF
}

# plant <label> <expected text> <test file> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 tests=$3 file=$4
  shift 4
  echo "plant: $label"
  cp "$copy/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  elif run_pytest "$tests"; then
    echo "  FAIL: pytest passed with the plant in place"; failures=$((failures + 1))
  elif grep -qF -- "$expect" "$copy/.out"; then
    echo "  red:   pytest exits non-zero and names '$expect':"
    grep -F -- "$expect" "$copy/.out" | sed -n '1,3p' | sed 's/^/    /'
  else
    echo "  FAIL: pytest is red but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
  fi
  cp "$copy/.saved" "$copy/$file"
}

# The baseline and the restore check run the offline gates: every plant below targets one, and the end-to-end suites
# (each seeds worldgen worlds on embedded Postgres) run in `make test`, not twice more here.
echo "baseline:"
if run_pytest --ignore-glob='*_e2e.py'; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

plant "lockfile carries litellm" "FAILED tests/test_lockfile.py::test_the_lock_is_clean" tests/test_lockfile.py uv.lock \
  sh -c "printf '\n[[package]]\nname = \"litellm\"\nversion = \"1.84.0\"\nsource = { registry = \"https://pypi.org/simple\" }\n' >> '$copy/uv.lock'"

plant "signature not checked" "FAILED tests/test_runtoken.py::test_forged_and_expired_tokens_are_refused[other_key-bad_signature]" \
  tests/test_runtoken.py services/intel/munim_intel/runtime/context.py \
  replace munim_intel/runtime/context.py 'public_key.verify(sig, f"{h}.{p}".encode())' 'pass'

plant "expiry not checked" "FAILED tests/test_runtoken.py::test_forged_and_expired_tokens_are_refused[expired-expired]" \
  tests/test_runtoken.py services/intel/munim_intel/runtime/context.py \
  replace munim_intel/runtime/context.py 'if claims.exp <= now():' 'if False:'

plant "tenant binding not checked" "FAILED tests/test_runtoken.py::test_a_token_of_another_tenant_is_refused" \
  tests/test_runtoken.py services/intel/munim_intel/runtime/context.py \
  replace munim_intel/runtime/context.py 'if tenant_id is not None and claims.tenant_id.root != tenant_id:' 'if False:'

plant "a registered tool takes tenant_id" "FAILED tests/test_tools.py::test_no_registered_tool_takes_a_tenant" \
  tests/test_tools.py services/intel/munim_intel/tools/echo.py \
  replace munim_intel/tools/echo.py 'def echo(text: str) -> EchoResult:' 'def echo(text: str, tenant_id: str = "") -> EchoResult:'

plant "gemini-2.5 not refused" "FAILED tests/test_models.py::test_a_gemini_25_model_is_refused" \
  tests/test_models.py services/intel/munim_intel/llm/providers.py \
  replace munim_intel/llm/providers.py 're.compile(r"gemini-2\.5", re.IGNORECASE)' 're.compile(r"(?!)")'

plant "a JSON schema goes to Gemini as response_schema (R63: 400 on every model)" \
  "FAILED tests/test_gemini_request.py::test_a_quarantined_schema_goes_to_gemini_as_a_json_schema" \
  tests/test_gemini_request.py services/intel/munim_intel/llm/providers.py \
  replace munim_intel/llm/providers.py 'sent = gemini_request(llm_request)' 'sent = llm_request'

plant "a transient provider error is not started over" \
  "FAILED tests/test_model_retry.py::test_two_5xx_then_an_answer_is_an_answer" \
  tests/test_model_retry.py services/intel/munim_intel/llm/providers.py \
  replace munim_intel/llm/providers.py '    left, left_429, waits = RETRIES, RETRIES_429, 0' '    left, left_429, waits = 0, 0, 0'

plant "a 429 is started over as often as a 5xx" \
  "FAILED tests/test_model_retry.py::test_a_429_is_retried_once_after_a_short_wait" \
  tests/test_model_retry.py services/intel/munim_intel/llm/providers.py \
  replace munim_intel/llm/providers.py 'RETRIES_429 = 1' 'RETRIES_429 = 2'

plant "the fixture tokens live only as long as core's ask token" \
  "FAILED tests/test_runtoken.py::test_the_fixture_tokens_outlive_a_slow_suite" \
  tests/test_runtoken.py services/intel/tests/fixtures/mint_tokens.mts \
  replace tests/fixtures/mint_tokens.mts 'const FIXTURE_TTL_S = 24 * 3600;' 'const FIXTURE_TTL_S = 900;'

plant "a narration failure is traced by its raw class name" \
  "FAILED tests/watch/test_hooks.py::test_a_rate_limited_narration_is_traced_by_label_and_the_finding_stands" \
  tests/watch/test_hooks.py services/intel/munim_intel/watch/pipeline.py \
  replace munim_intel/watch/pipeline.py '"error": label_of(e.kind)})' '"error": e.kind})'

plant "a detector failure is traced by its raw class name" \
  "FAILED tests/watch/test_hooks.py::test_a_detector_failing_with_an_underscored_class_name_is_traced_by_label" \
  tests/watch/test_hooks.py services/intel/munim_intel/watch/pipeline.py \
  replace munim_intel/watch/pipeline.py '"type": error_label(e)})' '"type": type(e).__name__})'

plant "the ask ignores its time budget" \
  "FAILED tests/manager/test_live_fallback.py::test_past_its_time_budget_the_ask_stops_and_stores_cannot_verify_with_its_spend_and_traces" \
  tests/manager/test_live_fallback.py services/intel/munim_intel/manager/ask.py \
  replace munim_intel/manager/ask.py 'async with asyncio.timeout_at(deadline):' 'async with asyncio.timeout_at(None):'

plant "recorded mode opens a socket" "NetworkBlocked" tests/test_smoke.py services/intel/munim_intel/llm/recorded.py \
  replace munim_intel/llm/recorded.py '        RecordedLlm.calls += 1' '        __import__("socket").create_connection(("127.0.0.1", 9))
        RecordedLlm.calls += 1'

plant "a secret is not redacted" "FAILED tests/test_config.py::test_a_provider_error_leaves_the_run_redacted_and_unchained" \
  tests/test_config.py services/intel/munim_intel/config.py \
  replace munim_intel/config.py '            text = text.replace(v, f"[redacted:{label}]")' '            pass'

plant "the smoke response is not deterministic" "FAILED tests/test_smoke.py::test_a_recorded_run_is_byte_identical_twice" \
  tests/test_smoke.py services/intel/munim_intel/smoke.py \
  replace munim_intel/smoke.py '        "run_id": ctx.run_id,' '        "run_id": ctx.run_id, "at": __import__("time").time_ns(),'

# C1 S2-6 (R47): every quarantined model call is a spend row of its own role on the run's meter.
plant "a negotiation's extraction posts no spend" \
  "FAILED tests/negotiate/test_negotiate_route.py::test_every_model_request_of_the_negotiation_is_one_spend_row_of_its_role" \
  tests/negotiate/test_negotiate_route.py services/intel/munim_intel/ingest/quarantine.py \
  replace munim_intel/ingest/quarantine.py '    _charge(meter, req, last)
' ''

plant "a failed extraction is not charged" \
  "FAILED tests/ingest/test_ingest.py::test_every_quarantined_call_that_reaches_the_provider_is_one_spend_row" \
  tests/ingest/test_ingest.py services/intel/munim_intel/ingest/quarantine.py \
  replace munim_intel/ingest/quarantine.py '    _charge(meter, req, last)
' '    if failed is None:
        _charge(meter, req, last)
'

plant "extraction charged as the meter's own role" \
  "FAILED tests/negotiate/test_negotiate_route.py::test_every_model_request_of_the_negotiation_is_one_spend_row_of_its_role" \
  tests/negotiate/test_negotiate_route.py services/intel/munim_intel/ingest/quarantine.py \
  replace munim_intel/ingest/quarantine.py 'Meter(state.meter.buffer, role, provider_of(llm), llm.model, price_of(llm))' 'state.meter'

# C2 item 9 (production, 16 Oct): ADK's `_ResourceExhaustedError` (a 429) is no label; the model-error callback must trace a
# label-safe name and charge the call before any trace can fail.
plant "a model error is traced under its raw class name" \
  "FAILED tests/trace/test_spend.py::test_a_rate_limited_call_is_charged_and_traced_under_a_valid_label" \
  tests/trace/test_spend.py services/intel/munim_intel/trace/plugin.py \
  replace munim_intel/trace/plugin.py '{"where": "model", "error": error_label(error)}' '{"where": "model", "error": type(error).__name__}'

plant "a failed call is charged after its traces" \
  "FAILED tests/trace/test_spend.py::test_a_failed_calls_spend_is_recorded_before_any_trace_can_fail" \
  tests/trace/test_spend.py services/intel/munim_intel/trace/plugin.py \
  replace munim_intel/trace/plugin.py '        # Spend first (a failed or rate-limited call may still be billed), then the traces.
        if self.state.meter is not None:
            self.state.meter.record(Usage(self._estimate, 0, estimated=True))
        path = served_by(error)
        if path is not None:
            await self._trace("route", {"model_path": path})
        await self._trace("error", {"where": "model", "error": error_label(error)})
' '        path = served_by(error)
        if path is not None:
            await self._trace("route", {"model_path": path})
        await self._trace("error", {"where": "model", "error": error_label(error)})
        if self.state.meter is not None:
            self.state.meter.record(Usage(self._estimate, 0, estimated=True))
'

echo "after the plants:"
if run_pytest --ignore-glob='*_e2e.py'; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the restored copy is red"; tail -30 "$copy/.out"; failures=$((failures + 1)); fi

if [ $failures -ne 0 ]; then
  echo "intel-redproof: FAIL ($failures)" >&2
  exit 1
fi
echo "intel-redproof: ok — 16/16 plants turned intel's pytest red naming the expected test; green after restoring"
# T-042 trace gates carry their own red-proof (13 plants, own throwaway copy).
bash "$src/services/intel/tests/trace/redproof.sh"
# T-080 generated tools + ontology gates (own throwaway copies).
bash "$src/services/intel/tests/tools/redproof.sh"
# T-043 watch pipeline gates.
bash "$src/services/intel/tests/watch/redproof.sh"
# W3.2 pack red-proofs, offline plants only (each lane's script; catalogue and market carry none). Their end-to-end plants
# reseed the 100-day worlds per plant (minutes each), so they stay out of `make check`; run them by hand, without
# `--offline`:  services/intel/tests/packs/<pack>/redproof.sh   (customers/redproof.sh covers customers + compliance,
# kitchen/redproof.sh kitchen + people).
for rp in "$src"/services/intel/tests/packs/*/redproof.sh; do
  bash "$rp" --offline
done
# W3.2 wiring: ingestion (T-056), negotiation + suppliers-sim (T-055) and graph (T-058, its templates through core's real
# graph:query route on embedded Postgres) — offline (recorded models, no network), each in its own throwaway copy.
bash "$src/services/intel/tests/ingest/redproof.sh"
bash "$src/services/intel/tests/negotiate/redproof.sh"
# C1 S3-5 (R64 X-4): the public sim's input bounds and body limit (own throwaway copy, ~35 s).
bash "$src/services/suppliers-sim/tests/redproof.sh"
bash "$src/services/intel/tests/graph/redproof.sh"
bash "$src/packages/contracts/test/ontology-redproof.sh"
# W3.3 per-area red-proofs (brief, investigations, context, Manager, fan-out, threads, wiki), offline plants only: each
# skips the plants whose gate runs an end-to-end suite or core-api's vitest (worlds on embedded Postgres). Run the full
# set by hand, without `--offline`, after touching an area (each prints "skipped (--offline)" for what this run leaves out):
#   services/intel/tests/{brief,investigate,context,manager,fanout,threads,wiki}/redproof.sh
for area in brief investigate context manager fanout threads wiki; do
  bash "$src/services/intel/tests/$area/redproof.sh" --offline
done
