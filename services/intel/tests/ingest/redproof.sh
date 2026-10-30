#!/usr/bin/env bash
# Red-proof for the T-056 ingestion gates (as tests/tools/redproof.sh): in a throwaway copy of the tree,
#   copy green  ->  plant one defect  ->  pytest exits non-zero AND names the expected test  ->  restore.
# A red that names another test (a crash, an unrelated failure) fails this script. The copy gets its own .venv.
#   services/intel/tests/ingest/redproof.sh
set -euo pipefail
src=$(cd "$(dirname "$0")/../../../.." && pwd)
copy=$(mktemp -d "${TMPDIR:-/tmp}/munim-t056-redproof.XXXXXX")
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv --exclude .run --exclude .env \
  --exclude __pycache__ --exclude scratchpad --exclude .claude "$src/" "$copy/"
# zod_check.mts runs core-api's contracts under node: link node_modules back to the original.
while IFS= read -r nm; do
  rel=${nm#"$src"/}
  mkdir -p "$copy/$(dirname "$rel")"
  ln -s "$nm" "$copy/$rel"
done < <(find "$src" -maxdepth 4 -name node_modules \( -type d -o -type l \) -prune -not -path "$src/node_modules/*" -not -path "$src/scratchpad/*" -not -path "$src/.claude/*")

intel="$copy/services/intel"
failures=0
planted=0
run_pytest() { (cd "$intel" && MUNIM_MODEL_MODE=recorded uv run --quiet --frozen pytest -q -p no:warnings tests/ingest/test_ingest.py) > "$copy/.out" 2>&1; }

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

# plant <label> <expected test name> <file to restore> <command...>
plant() {
  local label=$1 expect=$2 file=$3 code
  shift 3
  planted=$((planted + 1))
  echo "plant: $label"
  cp "$intel/$file" "$copy/.saved"
  if ! "$@"; then
    echo "  FAIL: could not plant"; failures=$((failures + 1))
  else
    set +e; run_pytest; code=$?; set -e
    if [ $code -eq 0 ]; then
      echo "  FAIL: pytest exited 0 with the plant in place"; failures=$((failures + 1))
    elif grep -E '^(FAILED|ERROR)' "$copy/.out" | grep -F -- "$expect" >/dev/null; then
      echo "  red:   pytest exit $code, names '$expect':"
      grep -E '^(FAILED|ERROR)' "$copy/.out" | grep -F -- "$expect" | sed -n '1,4p' | cut -c1-220 | sed 's/^/    /'
    else
      echo "  FAIL: pytest exit $code but does not name '$expect':"; tail -30 "$copy/.out" | sed 's/^/    /'; failures=$((failures + 1))
    fi
  fi
  cp "$copy/.saved" "$intel/$file"
}

Q=munim_intel/ingest/quarantine.py
CL=munim_intel/ingest/claims.py
CO=munim_intel/ingest/columns.py
P=munim_intel/ingest/pipeline.py
I=munim_intel/ingest/invoice.py
E=munim_intel/ingest/embed.py

echo "baseline:"
if run_pytest; then echo "  green: $(tail -1 "$copy/.out")"; else echo "  FAIL: the clean copy is red:"; tail -30 "$copy/.out"; exit 1; fi

plant "(1) the quarantined request offers a tool" "test_extractor_and_vision_requests_offer_no_tool" "$Q" \
  replace "$Q" '    return LlmRequest(model=llm.model, contents=[types.Content(role="user", parts=parts)], config=config)' \
  '    config.tools = [types.Tool(function_declarations=[types.FunctionDeclaration(name="propose_purchasing_po_create")])]
    return LlmRequest(model=llm.model, contents=[types.Content(role="user", parts=parts)], config=config)'
plant "(1) the runtime tool guard is gone" "test_a_request_with_a_tool_is_refused_before_the_model_is_called" "$Q" \
  replace "$Q" '    if tool_count(req) != 0:' '    if False:'
plant "(2) a claim whose quote is not in its source is kept" "test_claim_quotes_are_their_source_text_100_percent" "$CL" \
  replace "$CL" '        at = source.find(c.quote)
        if at < 0 or ' '        at = max(source.find(c.quote), 0)
        if '
plant "(3) a function call in the answer is ignored, not refused" "test_injection_fixtures_execute_no_tool_and_taint_the_run" "$Q" \
  replace "$Q" '        if any(p.function_call is not None for p in parts):' '        if False:'
plant "(3) extraction does not taint the run" "test_any_extraction_taints_the_run_even_when_it_fails" "$Q" \
  replace "$Q" '    state.tainted = True' '    pass'
plant "(4) an expression is accepted as a source column" "test_a_mapping_with_arithmetic_is_refused" "$CO" \
  replace "$CO" '        if e["source"] not in cells:' '        if False:'
plant "(4) a formula key is accepted" "test_a_mapping_with_arithmetic_is_refused" "$CO" \
  replace "$CO" '        if set(e) != ENTRY_KEYS:' '        if not ENTRY_KEYS <= set(e):'
plant "(5) row 2 of the file leaks into the headers sent" "test_map_columns_egress_holds_headers_only" "$CO" \
  replace "$CO" '    headers = tuple(header)' '    headers = (*header, "Koramangala Kitchen", "MASALA-DOSA-01")'
plant "(5) a headerless file is asked about" "test_a_planted_sample_is_refused_before_any_question" "$CO" \
  replace "$CO" '    check_header(header)
    q = MAP_COLUMNS[kind]' '    q = MAP_COLUMNS[kind]'
plant "(W3.2) the quantity stays in the description" "test_quantity_and_unit_are_moved_out_of_a_description_and_a_leftover_digit_abstains" "$I" \
  replace "$I" '            description = bare_description(line.description, line.qty, line.unit)' '            description = line.description'
plant "(W3.2) a leftover digit ships in the description" "test_quantity_and_unit_are_moved_out_of_a_description_and_a_leftover_digit_abstains" "$I" \
  replace "$I" '            if ingredient_id is None and any(ch.isdigit() for ch in description):' '            if False:'
plant "traces carry the invoice number" "test_traces_carry_no_untrusted_text" "$P" \
  replace "$P" 'source=source, draft_id=report.draft_id, status=r.status)' 'source=source, draft_id=report.draft_id, status=r.status, invoice_no=read.invoice_no or "")'
plant "traces carry a claim's predicate" "test_traces_carry_no_untrusted_text" "$P" \
  replace "$P" 'source=f"msg:{mid}", claims=str(len(kept.rows)),' 'source=f"msg:{mid}", claims=str(len(kept.rows)), predicate=got[0].predicate if got else "none",'
plant "invoice numbers are searched from the top of the page" "test_the_true_read_of_that_line_is_a_draft_of_whole_tokens" "$I" \
  replace "$I" '{re.escape(value)}(?!\d)(?![.,]\d)").search(self.text, self.at)' '{re.escape(value)}(?!\d)(?![.,]\d)").search(self.text)'
plant "an unlinked supplier still drafts" "test_invoice_image_becomes_a_draft_whose_numbers_are_page_spans" "$I" \
  replace "$I" '    if supplier_id is None:
        return abstain("supplier_unlinked")' '    supplier_id = supplier_id or "0199e0a0-0000-7000-8000-000000000000"'
plant "a 503 from embeddings is reported as stored" "test_embeddings_are_768_integer_millionths_and_503_is_unavailable" "$E" \
  replace "$E" 'return EmbedOutcome("unavailable", inserted, existing)' 'return EmbedOutcome("stored", inserted, existing)'

# R-C fix cycle 1 (F5, F6, F9, F10)
plant "F5 a number is found inside another" "test_a_value_inside_another_number_or_a_unit_not_after_its_quantity_abstains" "$I" \
  replace "$I" 'rf"(?<!\w)(?<!\d[.,]){re.escape(value)}(?!\d)(?![.,]\d)"' 'rf"{re.escape(value)}"'
plant "F5 the unit is not tied to its quantity" "test_a_value_inside_another_number_or_a_unit_not_after_its_quantity_abstains" "$I" \
  replace "$I" '                if name == "qty_milli" and not re.compile(' '                if False and not re.compile('
plant "F6 quarantined calls skip the budget" "test_a_spent_budget_makes_no_call" "$Q" \
  replace "$Q" '    if budget.models_exhausted():
        raise ModelUnavailable("ai_budget_cap")' '    pass'
plant "F6 the pipeline reads past a spent budget" "test_a_one_megabyte_document_stops_at_the_budget" "$P" \
  replace "$P" 'source=f"doc:{document_id}", reason_code="ai_budget_cap")
                break' 'source=f"doc:{document_id}", reason_code="ai_budget_cap")'
plant "F6 a provider error leaves with its text" "test_a_provider_error_never_surfaces_its_text" "$Q" \
  replace "$Q" '        failed = f"model_error:{type(e).__name__}"' '        raise ModelUnavailable(f"model_error:{e}") from e'
plant "F10 a claim's subject need not be in its quote" "test_a_claim_whose_quote_does_not_carry_it_is_dropped" "$CL" \
  replace "$CL" 'not (_in_quote(c.subject, c.quote) and _in_quote(c.object, c.quote))' 'False'
plant "F10 a three-letter quote is a claim" "test_a_claim_whose_quote_does_not_carry_it_is_dropped" "$CL" \
  replace "$CL" 'MIN_QUOTE_CHARS = 12' 'MIN_QUOTE_CHARS = 1'
plant "F9 a recorded fixture goes missing" "ERROR tests/ingest/test_ingest.py::" "munim_intel/ingest/fixtures/$(cd "$intel/munim_intel/ingest/fixtures" && grep -l '"recorded/extract"' *.json | xargs grep -l 'Tomatoes will come' | head -1)" \
  rm "$intel/munim_intel/ingest/fixtures/$(cd "$intel/munim_intel/ingest/fixtures" && grep -l '"recorded/extract"' *.json | xargs grep -l 'Tomatoes will come' | head -1)"
# T-127 (T-125's open items): live extraction falls back to this package's fixtures, and the path is traced under the run's actor.
LF=test_a_live_extraction_that_fails_is_served_from_the_ingest_fixtures_and_traced
plant "T-127 live extraction falls back to fixtures/recorded (the wrong directory)" "$LF" "$Q" \
  replace "$Q" 'currency=currency, fallback_dir=FIXTURES_DIR, capped=capped)' 'currency=currency, capped=capped)'
plant "T-127 the path a live call took is not traced" "$LF" "$Q" \
  replace "$Q" '        await state.traces.append("route", actor or ACTOR.get(), labels)' '        pass'
plant "T-127 the path traced under the default actor, not the run's" "$LF" "$P" \
  replace "$P" 'claims_mod.extract(self.extract_llm, text, self.state, self.actor)' 'claims_mod.extract(self.extract_llm, text, self.state)'

if [ $failures -ne 0 ]; then echo "t056-redproof: FAIL ($failures of $planted)" >&2; exit 1; fi
echo "t056-redproof: ok — $planted/$planted plants turned the T-056 gates red (non-zero exit) naming the expected test"
