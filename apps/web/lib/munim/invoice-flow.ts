// file: lib/munim/invoice-flow.ts
// A supplier invoice on the staff side (NB-6): a photo or PDF uploaded to core (POST /v1/imports/invoices), read by Munim's
// vision model into a purchasing.invoice.record.v1 draft whose every figure is a span of the page as Munim read it
// (⟨cite:doc:<document>·<start>-<end>⟩). A span is not a snapshot cell: the person types each figure they checked against the
// page (R26). Nothing here fills a figure in from the page text, and nothing is added up: core totals the invoice when the
// draft is approved. The suppliers are simulated. Plain TypeScript, no React.
import type { MunimError } from "./client";
import { staffErrorText } from "./staff-copy";
import type { Schemas } from "./types";

type Draft = Schemas["V1Draft"];
export type InvoicePayload = Extract<Draft["payload"], { supplier_invoice_id: string; invoice_no: string }>;
export type InvoiceDraft = Draft & { payload: InvoicePayload };
export const isInvoiceDraft = (d: Draft): d is InvoiceDraft => d.command_type === "purchasing.invoice.record.v1";
export type DocumentChunk = Schemas["V1ImportsDocumentText"]["chunks"][number];
export type InvoiceType = Schemas["V1ImportsInvoiceUploadRequest"]["media_type"];

/** What core reads (contracts InvoiceMediaType), and its size limit, checked before the file is encoded and sent. */
export const INVOICE_TYPES: readonly InvoiceType[] = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const MAX_INVOICE_BYTES = 5 * 1024 * 1024;
export const isInvoiceType = (t: string): t is InvoiceType => (INVOICE_TYPES as readonly string[]).includes(t);

/** Why a chosen file is not sent, or null when it may be. */
export function fileProblem(f: { type: string; size: number }): string | null {
  if (!isInvoiceType(f.type)) return "Choose a photo (PNG, JPEG or WebP) or a PDF of the invoice.";
  if (f.size === 0) return "That file is empty.";
  if (f.size > MAX_INVOICE_BYTES) return "That file is larger than five megabytes. Take a smaller photo of the invoice.";
  return null;
}

/** A file's bytes as the upload body's base64 (no data: prefix), built in slices so a large photo does not overflow the stack. */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const WORDS: Record<Schemas["V1ImportsInvoiceUploadResponse"]["status"] & string, string> = {
  drafted: "Read. A draft of this invoice is waiting below: check each figure against the photo, type it, then approve.",
  abstained: "Munim couldn't draft this invoice: a figure wasn't on the page, or its supplier or a line isn't one it knows. Record it by hand.",
  draft_refused: "Munim read the invoice, but its draft didn't pass the checks, so nothing was drafted. Record it by hand.",
  model_blocked: "AI is switched off or this month's AI budget is spent, so the invoice wasn't read. Record it by hand.",
};

export interface InvoiceOutcome {
  text: string;
  /** The draft that cites this invoice, when there is one. */
  draftId: string | null;
}

/** What came of an upload, from core's answer. A replay of the same file that a draft already cites reads nothing. */
export function invoiceOutcome(r: Pick<Schemas["V1ImportsInvoiceUploadResponse"], "duplicate" | "status" | "draft_id">): InvoiceOutcome {
  if (r.status === null) {
    return { text: r.draft_id ? "This invoice was uploaded before. Its draft is below." : "This invoice was uploaded before.", draftId: r.draft_id };
  }
  return { text: WORDS[r.status], draftId: r.status === "drafted" ? r.draft_id : null };
}

/** An upload that failed. A lost answer may have reached core: uploading the same file again is safe (a draft that already
 *  cites it comes back; nothing is read twice). 503: the file is stored, the reading failed. */
export function invoiceErrorText(e: MunimError): string {
  if (e.kind === "network" || e.status === 504) {
    return "The connection dropped while the invoice was being read. Look below for its draft before uploading again; uploading the same file again is safe.";
  }
  if (e.status === 503) return "The invoice couldn't be read just now. It is stored: upload the same file again in a moment.";
  if (e.status === 422) return "Only a photo (PNG, JPEG or WebP) or a PDF up to five megabytes can be read.";
  return staffErrorText(e, "suppliers");
}

const SPAN = /^⟨cite:doc:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})·(0|[1-9][0-9]*)-(0|[1-9][0-9]*)⟩$/u;

/** The text a page span points to, as Munim read the page: the one chunk of `documentId` that holds the whole span, sliced by
 *  character (Unicode code points, as core counts them). null when the ref is not a span of that document or no chunk holds
 *  it — shown as "Cannot verify", never guessed. */
export function spanText(ref: unknown, documentId: string, chunks: readonly DocumentChunk[]): string | null {
  const m = typeof ref === "string" ? SPAN.exec(ref) : null;
  if (!m || m[1] !== documentId) return null;
  const [s, e] = [Number(m[2]), Number(m[3])];
  for (const c of chunks) {
    const chars = Array.from(c.text);
    if (e > s && c.char_start <= s && e <= c.char_start + chars.length) return chars.slice(s - c.char_start, e - c.char_start).join("");
  }
  return null;
}

/** The document an invoice draft was read from (its `doc:<id>` evidence). */
export const invoiceDocument = (d: Draft): string | null =>
  d.evidence.map((e) => /^doc:([0-9a-f-]{36})$/.exec(e)?.[1]).find((x): x is string => x !== undefined) ?? null;

/** The figures of one invoice line a person types, in payload order, with what each is called. */
export const INVOICE_FIGURES = [
  { column: "qty_milli", label: (unit: string) => `Quantity (${unit})` },
  { column: "unit_price_minor", label: (unit: string) => `Price per ${unit}` },
  { column: "tax_minor", label: () => "Tax" },
] as const;
