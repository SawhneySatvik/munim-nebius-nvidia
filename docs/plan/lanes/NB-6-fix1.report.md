# NB-6 fix cycle 1

1. FATAL `services/core-api/src/app.ts:44`: LIMITS now `^/v1/imports/(documents|invoices)$` at 8 MiB. Test (7a) uploads ~1 MiB and reaches the handler; 8 MiB+1 body is 413 `bad_request`; (7b) 5 MiB+1 file gets the route's own 422 `invalid_payload`. Red (entry removed): 7a/7b fail. Green.
2. MAJOR `invoice.ts` cited lookup: `status IN ('proposed','executing','executed')`. Deviation: I kept executing/executed so a recorded invoice's re-upload still returns its draft (else a second draft could double-record). Rejected/stale are dead. Test (7c) rejected draft, re-upload reads again. Red/green.
3. MAJOR `services/intel/munim_intel/ingest/pipeline.py:30-38`: chunk id seed includes sha256 of the chunk text. Test `test_a_re_read_with_a_different_transcript_writes_new_chunk_ids` (red: ids equal; green). Consequence handled: a re-read leaves old chunks, so `documentText` now returns only the newest read's run chunks (test 6 extended).
4. MINOR `invoice.ts`: forwards `bytes.toString("base64")` (7d); magic check PNG/JPEG/WebP/PDF vs media_type, mismatch 422 (7d); aliases: active supplier/ingredient names first, then learned aliases newest first, LIMIT 5000 (7e: 5000 sent, "Learned 5100" dropped); text route restricted to `supplier_invoice` (404 otherwise, test 6).

Red run (all five edits reverted): 6 failed | 6 passed. Green: imports-invoice 12/12; core-api full 81 files, 1116 passed; intel `tests/ingest` 44 passed; core-api tsc clean.

Not done: intel pytest beyond tests/ingest; no service restart; live re-read not exercised; make check not run. Files: app.ts (one line), invoice.ts, test/imports-invoice.test.ts, pipeline.py, tests/ingest/test_ingest.py. NB-7's files untouched.
