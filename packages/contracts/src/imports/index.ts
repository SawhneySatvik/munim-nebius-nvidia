// Imports (T-030; R5, R28, 02-schema §2.13, flows/import.md, screens/onboarding-import.md B). A file is uploaded
// as a raw document (sha256 unique per tenant), its format is recognised by header signature, core-worker parses
// it into staging + quarantine rows, and the run becomes a draft. Nothing reaches the books until a person
// approves `imports.run.commit.v1`. A tenant's own file layout is a mapping draft (`imports.format.approve.v1`):
// column renames plus declared units — never formulas or arithmetic (R28).
import { z } from "zod";
import { defineDraftable } from "../shared/draftables.ts";
import { CurrencyCode, IsoDateTime, MinorAmount, Uuid7 } from "../shared/primitives.ts";
import type { Route } from "../shared/routes.ts";
import { READ_ROUTES, READ_SCHEMAS } from "./read-routes.ts";

/** The file kinds this module parses (core.import_run.kind, a subset of core.document.kind). `pos_bills` and
 *  `waste_log` are dated history (R44b, 0018): bills with lines, tenders, refunds and voids; waste entries.
 *  `shift_log` and `stock_count` are dated history too (T-093, 0021): closed drawer sessions; counted stock with its adjustments. */
export const ImportKind = z.enum(["payout_statement", "bank_statement", "pos_export", "tally_export", "market_signal", "pos_bills", "waste_log",
  "shift_log", "stock_count"]);
export type ImportKind = z.infer<typeof ImportKind>;

export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

/** One mapping entry: a column of the file (by its exact header text) renamed to a Munim field, with the unit
 *  the column is written in. No other key exists, so a formula has nowhere to live (R28). */
export const MappingEntry = z.strictObject({
  source: z.string().min(1).max(100),
  target: z.string().regex(/^[a-z][a-z0-9_]*$/),
  unit: z.string().regex(/^[a-z][a-z0-9_]{0,15}$/).optional(),
});

/** Approving a mapping saves the format; later files whose header hashes to `header_signature` skip I2. */
export const ImportsFormatApproveV1 = z.strictObject({
  format_id: Uuid7,
  kind: ImportKind,
  name: z.string().min(1).max(100),
  /** The file's header cells, in order; `header_signature` is sha256 of them (core recomputes it). */
  header: z.array(z.string().min(1).max(100)).min(1).max(100),
  header_signature: Sha256Hex,
  mapping: z.array(MappingEntry).min(1).max(100),
});

/** Approving an import run commits its staged rows into the books under the approver. The figures the
 *  person saw (rows, totals) are fixed on the run row once previewed (0014), so the payload carries no numbers. */
export const ImportsRunCommitV1 = z.strictObject({ import_run_id: Uuid7 });

export const FORMAT_APPROVE = defineDraftable("imports.format.approve.v1", ImportsFormatApproveV1);
export const RUN_COMMIT = defineDraftable("imports.run.commit.v1", ImportsRunCommitV1);

export const ImportRunStatus = z.enum(["parsing", "previewed", "committed", "rejected", "failed"]);

export const DocumentView = z.strictObject({
  document_id: Uuid7,
  kind: z.string(),
  media_type: z.string(),
  filename: z.string().nullable(),
  byte_size: z.int().positive(),
  sha256: Sha256Hex,
  uploaded_by: Uuid7.nullable(),
  created_at: IsoDateTime,
});

/** One import run: every number is the run row's own field. The staged-rows total is a snapshot
 *  (`imports.run_preview`, pending M-C) and is not part of this view. */
export const ImportRunView = z.strictObject({
  import_run_id: Uuid7,
  document_id: Uuid7,
  kind: ImportKind,
  parser: z.string().nullable(),
  format_id: Uuid7.nullable(),
  status: ImportRunStatus,
  rows_ok: z.int().nonnegative(),
  rows_quarantined: z.int().nonnegative(),
  /** The total printed in the file; null when the file states none. */
  control_total_minor: MinorAmount.nullable(),
  currency: CurrencyCode.nullable(),
  /** Whether the staged rows add up to the file's printed total (null: the file prints none). A mismatch
   *  can still be approved, with a reason. */
  total_matches: z.boolean().nullable(),
  draft_id: Uuid7.nullable(),
  decision_id: Uuid7.nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});

export const ImportsUploadRequest = z.strictObject({
  kind: ImportKind,
  filename: z.string().min(1).max(255),
  media_type: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  /** The file's bytes, base64 (≤ 5 MiB decoded). */
  content_base64: z.string().min(1).max(7_000_000),
});

export const ImportsUploadResponse = z.strictObject({
  /** true: this exact file was uploaded before — `document` and `run` are the existing ones. */
  duplicate: z.boolean(),
  document: DocumentView,
  /** null when the format is not recognised: map the columns (I2), then create the run. */
  run: ImportRunView.nullable(),
  /** The file's header cells when no known format matched (for the mapping screen); else null. */
  header: z.array(z.string()).nullable(),
});

export const ImportsRunCreateRequest = z.strictObject({ document_id: Uuid7 });

export const ImportsRunsResponse = z.strictObject({ runs: z.array(ImportRunView), next_cursor: Uuid7.nullable() });

export const StagedRow = z.strictObject({
  row_no: z.int().positive(),
  target_table: z.string(),
  /** A parsed row: flat column -> scalar (renames + units only, R28; no nested values). */
  data: z.record(z.string(), z.union([z.string(), z.int(), z.boolean(), z.null()])),
  amount_minor: MinorAmount.nullable(),
  external_ref: z.string().nullable(),
});
/** `raw` is the file's untrusted text: shown as plain text only. */
export const QuarantinedRow = z.strictObject({
  row_no: z.int().positive(),
  raw: z.string(),
  reason_code: z.string().regex(/^[a-z][a-z0-9_]*$/),
});
export const ImportRunRowsResponse = z.strictObject({ staged: z.array(StagedRow), quarantined: z.array(QuarantinedRow) });

/** A member maps a new layout by hand (I2 without suggestions): the header comes from the stored document. */
export const ImportsFormatProposeRequest = z.strictObject({
  document_id: Uuid7,
  kind: ImportKind,
  name: z.string().min(1).max(100),
  mapping: z.array(MappingEntry).min(1).max(100),
});
export const ImportsFormatProposeResponse = z.strictObject({ draft_id: Uuid7 });

/** NB-6: a supplier invoice, a photo or a PDF, stored as core.document kind `supplier_invoice` and read by intel's vision
 *  role into a `purchasing.invoice.record.v1` draft whose every figure is a span of the page. Nothing is recorded until a
 *  person approves that draft, typing each figure (R16, R26). */
export const InvoiceMediaType = z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
/** What came of the read, as a code (never the page's text or a figure): `drafted` (a draft waits for a person), `abstained`
 *  (the page was not read into one; the run's trace says why), `draft_refused` (core's draft check refused it), `model_blocked`
 *  (AI is off, over budget or has no vision model; record the invoice by hand). */
export const InvoiceReadStatus = z.enum(["drafted", "abstained", "draft_refused", "model_blocked"]);
export const ImportsInvoiceUploadRequest = z.strictObject({
  filename: z.string().min(1).max(255),
  media_type: InvoiceMediaType,
  /** The file's bytes, base64 (≤ 5 MiB decoded). */
  content_base64: z.string().min(1).max(7_000_000),
});
export const ImportsInvoiceUploadResponse = z.strictObject({
  /** true: these exact bytes were uploaded before — `document` is the existing one. */
  duplicate: z.boolean(),
  document: DocumentView,
  /** The ingest run that read the page (its trace shows how); null when nothing was read: a draft already cites the document. */
  run_id: Uuid7.nullable(),
  status: InvoiceReadStatus.nullable(),
  /** The draft that cites the document (this read's, or the earlier one's); null when there is none. */
  draft_id: Uuid7.nullable(),
});
/** A document's text as Munim read it (an invoice: the vision model's transcript of the page), as its chunks at their
 *  offsets: what a draft's ⟨cite:doc:<id>·<start>-<end>⟩ spans point into. A span is read from the chunk that holds it
 *  whole; chunks may leave gaps (whitespace is not stored). Untrusted text: render it as text, never as HTML. */
export const DocumentTextView = z.strictObject({
  document_id: Uuid7,
  chunks: z.array(z.strictObject({ char_start: z.int().min(0), text: z.string().min(1) })).max(1000),
});

/** NB-7b: "check the market price" of one ingredient. intel searches the web (or answers from a recorded synthetic page) and
 *  proposes a `market_signal_v2` file; core stores it and previews it as an import run. Nothing reaches `core.market_signal`
 *  until a person approves the run's draft (R28). The answer carries ids and a code, never a price. */
export const MarketPriceCheckStatus = z.enum(["previewed", "no_price", "unavailable"]);
export const MarketPriceCheckRequest = z.strictObject({ ingredient_id: Uuid7 });
export const MarketPriceCheckResponse = z.strictObject({
  status: MarketPriceCheckStatus,
  /** true: the same proposal (same file today) was already made — its run and draft come back. */
  duplicate: z.boolean(),
  import_run_id: Uuid7.nullable(),
  /** The `imports.run.commit.v1` draft a person approves; null when no price was found or the preview held nothing. */
  draft_id: Uuid7.nullable(),
});

export const SCHEMAS = {
  ...READ_SCHEMAS,
  "imports.format.approve.v1": ImportsFormatApproveV1,
  "imports.run.commit.v1": ImportsRunCommitV1,
  "proposal.imports.format.approve.v1": FORMAT_APPROVE.proposal,
  "proposal.imports.run.commit.v1": RUN_COMMIT.proposal,
  "v1.imports.document": DocumentView,
  "v1.imports.run": ImportRunView,
  "v1.imports.upload.request": ImportsUploadRequest,
  "v1.imports.upload.response": ImportsUploadResponse,
  "v1.imports.run.create.request": ImportsRunCreateRequest,
  "v1.imports.runs.response": ImportsRunsResponse,
  "v1.imports.run.rows.response": ImportRunRowsResponse,
  "v1.imports.format.propose.request": ImportsFormatProposeRequest,
  "v1.imports.format.propose.response": ImportsFormatProposeResponse,
  "v1.imports.invoice-upload.request": ImportsInvoiceUploadRequest,
  "v1.imports.invoice-upload.response": ImportsInvoiceUploadResponse,
  "v1.imports.document-text": DocumentTextView,
  "v1.imports.market-price.request": MarketPriceCheckRequest,
  "v1.imports.market-price.response": MarketPriceCheckResponse,
};

const id = [{ name: "id", uuid: true }];
export const ROUTES: readonly Route[] = [
  ...READ_ROUTES,
  { surface: "public", method: "post", path: "/v1/imports/documents", operationId: "uploadImportDocument", summary: "Upload a file (sha256 unique per tenant: the same file again returns the existing document); a recognised format starts a run", auth: "member", request: "v1.imports.upload.request", response: "v1.imports.upload.response", status: 200 },
  { surface: "public", method: "post", path: "/v1/imports/runs", operationId: "createImportRun", summary: "Start a run for an uploaded document whose format is now known (after its mapping was approved)", auth: "member", request: "v1.imports.run.create.request", response: "v1.imports.run", status: 201 },
  { surface: "public", method: "get", path: "/v1/imports/runs", operationId: "listImportRuns", summary: "Import runs, newest first; kind and status filter, cursor = the last run's id (T-092a)", auth: "member", response: "v1.imports.runs.response", status: 200,
    query: [{ name: "kind", required: false, schema: { type: "string", enum: ImportKind.options } }, { name: "status", required: false, schema: { type: "string", enum: ImportRunStatus.options } },
      { name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } }, { name: "cursor", required: false, schema: { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" } }] },
  { surface: "public", method: "get", path: "/v1/imports/runs/{id}", operationId: "getImportRun", summary: "One import run (status, rows ready, rows quarantined, the file's total)", auth: "member", response: "v1.imports.run", status: 200, pathParams: id },
  { surface: "public", method: "get", path: "/v1/imports/runs/{id}/rows", operationId: "getImportRunRows", summary: "Staged rows and quarantined rows (with reasons) of one run", auth: "member", response: "v1.imports.run.rows.response", status: 200, pathParams: id },
  { surface: "public", method: "post", path: "/v1/imports/formats:propose", operationId: "proposeImportFormat", summary: "Propose a column mapping (renames + units only) for a document's layout, as a draft to approve", auth: "member", request: "v1.imports.format.propose.request", response: "v1.imports.format.propose.response", status: 201 },
  { surface: "public", method: "post", path: "/v1/imports/invoices", operationId: "uploadSupplierInvoice", summary: "Upload a supplier invoice (photo or PDF); intel reads it into a draft whose every figure is a span of the page, for a person to approve", auth: "member", request: "v1.imports.invoice-upload.request", response: "v1.imports.invoice-upload.response", status: 200 },
  { surface: "public", method: "get", path: "/v1/imports/documents/{id}/text", operationId: "getDocumentText", summary: "A document's text as Munim read it, in chunks at their offsets (what a draft's page spans point into); untrusted text", auth: "member", response: "v1.imports.document-text", status: 200, pathParams: id },
  { surface: "public", method: "post", path: "/v1/imports/market-price", operationId: "checkMarketPrice", summary: "Check the web price of one ingredient; intel proposes a market-signal import that a person approves (nothing is written until then)", auth: "member", request: "v1.imports.market-price.request", response: "v1.imports.market-price.response", status: 200 },
];
