# NB-6 report: items 1–4 done

**Routes.**
- `POST /v1/imports/invoices`: all-outlet owner/manager/judge. Stores the blob, commits `core.document`, calls intel `/ingest` with RLS-read aliases. A cited replay returns its draft unread.
- `GET /v1/imports/documents/{id}/text`: chunks for the span chips.

**Token.** After the commit core mints an `ingest` run (actor = member, scope `*`). intel checks signature and trigger; core's internal API takes the tenant from the token only. The run ends in `finally`.

**Fixture.** Lalbagh Nut & Spice (simulated), hazelnuts, 2 kg at ₹1,560.00, tax ₹156.00, 22 Oct, "SAMPLE - synthetic", headless Chrome.

**Live, Nemotron VL.** Approvals were scripts using the owner's token, not a person.
- Invoice `LNS-2026-0412` drafted with spans, approved with figures typed, recorded (327600).
- Hazratganj negotiation cites `⟨snap:01a17d99-3a46-7933-8b74-fabe2e013386·5·saving_minor⟩` = 1588 beside reference 148000 (1480 × 1.073 = 1588.04). PO committed.
- Audit chain ok, 781 rows.
- PDF accepted, then `model_error:InternalServerError`: abstains.

**Screen** (`/staff/suppliers`). Upload with photo preview; invoice cards marking every page-read value (figures typed, never pre-filled); the PO saving with source chips. 48 px targets, 16 px inputs, no overflow at 390 px. 12 shots in `.screenshots/NB-6/` (script: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/17d52a76-6c16-450b-8619-6bfd30c0f605/scratchpad/nb6-shots.mjs`, not kept). No `model_blocked` shot (platform-wide switch). Left proposed for the film: invoice `01a17dbd-8e3e`, PO `01a17dba-16f0` (Gomti Nagar, ₹12.61).

**Red-proofs**
- Cross-tenant token, FK dropped: `(200, None, 'draft_refused')`.
- Saving refs.
- Forged figure.
- Trace label.
- Outlet check, replay, `endRun`, text 404.
- Code points.

**Tests**
- contracts 262.
- core-api 6 files, `142 passed (142)`.
- web 189, mock mode included.
- intel: full run `1 failed, 980 passed` (fixture guard, fixed), before the second regen; after it, targeted 169 and mypy on 263 files.

**Guarantee scan**
- **Books:** approved decisions only.
- **Numbers:** spans the person types, and a SQL saving cell. Traces carry ids.

**Notes**
- No founder visual sign-off.
- The inbox draft page shows "Cannot verify" for spans.
- Vercel's body limit (~4.5 MB, UNVERIFIED) caps hosted photos below 5 MiB.
- A later-dated invoice turns the saving negative.

**Files**
```
packages/contracts/MANIFEST.d/imports.txt
packages/contracts/MANIFEST.d/internal.txt
packages/contracts/src/imports/index.ts
packages/contracts/src/internal/index.ts
packages/contracts/test/samples/imports.ts
packages/contracts/test/samples/internal.ts
packages/contracts/generated/ontology.json
packages/contracts/generated/openapi/internal.json
packages/contracts/generated/openapi/public.json
packages/contracts/generated/sources.sha256.json
packages/contracts/generated/json-schema/internal.ingest.request.schema.json
packages/contracts/generated/json-schema/internal.ingest.response.schema.json
packages/contracts/generated/json-schema/v1.imports.document-text.schema.json
packages/contracts/generated/json-schema/v1.imports.invoice-upload.request.schema.json
packages/contracts/generated/json-schema/v1.imports.invoice-upload.response.schema.json
packages/sdk/src/gen/client.ts
packages/sdk/src/gen/openapi.ts
services/core-api/src/modules/imports/index.ts
services/core-api/src/modules/imports/invoice.ts
services/core-api/src/server.ts
services/core-api/test/imports-invoice.test.ts
services/intel/munim_intel/app.py
services/intel/munim_intel/contracts_gen/models.py
services/intel/munim_intel/contracts_gen/names.py
services/intel/munim_intel/ingest/quarantine.py
services/intel/munim_intel/ingest/route.py
services/intel/munim_intel/negotiate/review.py
services/intel/tests/test_app.py
services/intel/tests/test_openai_request.py
services/intel/tests/fixtures/record_nemotron.py
services/intel/tests/fixtures/invoice/lalbagh-hazelnut.html
services/intel/tests/fixtures/invoice/lalbagh-hazelnut.png
services/intel/tests/fixtures/nemotron/invoice_hazelnut.json
services/intel/tests/ingest/test_ingest_route.py
services/intel/tests/negotiate/test_negotiate_saving.py
apps/web/lib/munim/invoice-flow.ts
apps/web/lib/munim/supply-flow.ts
apps/web/lib/munim/staff.ts
apps/web/components/staff/suppliers/invoices.tsx
apps/web/components/staff/suppliers/po-draft.tsx
apps/web/components/staff/pages/suppliers.tsx
apps/web/tests/invoice.test.ts
docs/plan/lanes/NB-6.report.md
```
Outside the stated territory (forced): `contracts/src/imports`, `MANIFEST.d`, samples, `server.ts`, `app.py`, `test_app.py`, `test_openai_request.py`, `lib/munim/staff.ts`. Not mine: `apps/web/AGENTS.md`.
