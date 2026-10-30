// [unit] NB-6: the supplier-invoice upload's words for every status core answers, the file checks made before sending, the
// page-span text a figure's chip shows (read from the chunk that holds it whole, by character), and the PO proposal's cited
// saving (the quote comparison's cells, never the negotiation's anchor). Expected words and values are the contract's
// statuses and hand-written chunks, not the code's.
import { describe, expect, it } from "vitest";
import type { MunimError } from "@/lib/munim/client";
import { fileProblem, invoiceErrorText, invoiceOutcome, isInvoiceDraft, isInvoiceType, MAX_INVOICE_BYTES, spanText, toBase64 } from "@/lib/munim/invoice-flow";
import { DEMO_PEOPLE, DEMO_TENANT_ID } from "@/lib/munim/session";
import { createStaffClient } from "@/lib/munim/staff";
import { handle } from "@/mock-server/handler";
import { poSaving } from "@/lib/munim/supply-flow";
import type { Schemas } from "@/lib/munim/types";

const STATUSES = ["drafted", "abstained", "draft_refused", "model_blocked"] as const;
const DOC = "01a17d96-9a03-7c51-aa2a-53a9f579498f";
const err = (e: Partial<MunimError>): MunimError => ({ kind: "server", status: 500, code: null, reasonCode: null, params: {}, retryAfterMs: null, ...e });

describe("what came of an invoice upload, in words", () => {
  it("each status core answers has its own words, with no number in them; only a drafted read names its draft", () => {
    const out = STATUSES.map((status) => invoiceOutcome({ duplicate: false, status, draft_id: "d-1" }));
    expect(new Set(out.map((o) => o.text)).size).toBe(STATUSES.length);
    for (const o of out) expect(o.text).not.toMatch(/\d/);
    expect(out.map((o) => o.draftId)).toEqual(["d-1", null, null, null]);
    // AI off is not an error (rule 11): the person records the invoice by hand.
    expect(out[3]!.text).toMatch(/Record it by hand\.$/);
  });
  it("the same file again, already drafted, reads nothing and points at its draft", () => {
    expect(invoiceOutcome({ duplicate: true, status: null, draft_id: "d-2" })).toEqual({ text: "This invoice was uploaded before. Its draft is below.", draftId: "d-2" });
  });
  it("a lost answer says look before uploading again; 503 says the file is stored; 422 names what can be read", () => {
    expect(invoiceErrorText(err({ kind: "network", status: 0 }))).toMatch(/Look below for its draft/);
    expect(invoiceErrorText(err({ status: 504 }))).toMatch(/Look below for its draft/);
    expect(invoiceErrorText(err({ status: 503, code: "unavailable" }))).toMatch(/It is stored/);
    expect(invoiceErrorText(err({ status: 422, code: "invalid_payload" }))).toMatch(/photo .* or a PDF/);
  });
});

describe("the file, checked before it is sent", () => {
  it("photos and PDFs up to the limit only", () => {
    expect(["image/png", "image/jpeg", "image/webp", "application/pdf"].every(isInvoiceType)).toBe(true);
    expect(fileProblem({ type: "image/png", size: 161_990 })).toBeNull();
    expect(fileProblem({ type: "text/csv", size: 10 })).toMatch(/Choose a photo/);
    expect(fileProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(fileProblem({ type: "image/jpeg", size: MAX_INVOICE_BYTES + 1 })).toMatch(/larger than five megabytes/);
  });
  it("base64 as core checks it (round trip, large input in slices)", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(Buffer.from(toBase64(bytes), "base64").equals(Buffer.from(bytes))).toBe(true);
  });
});

describe("a figure's page span, as Munim read the page", () => {
  // Hand-written chunks: a gap between them (whitespace is not stored), and a non-BMP character before the figures.
  const chunks = [{ char_start: 0, text: "Roasted hazelnuts (synthetic)" }, { char_start: 31, text: "🌰 2 kg 1560.00 156.00" }];
  it("slices the chunk that holds the span, by character", () => {
    expect(spanText(`⟨cite:doc:${DOC}·33-34⟩`, DOC, chunks)).toBe("2");
    expect(spanText(`⟨cite:doc:${DOC}·38-45⟩`, DOC, chunks)).toBe("1560.00");
    expect(spanText(`⟨cite:doc:${DOC}·46-52⟩`, DOC, chunks)).toBe("156.00");
  });
  it("cannot verify a span of another document, one across a gap or past the text, an empty one, or a non-span", () => {
    expect(spanText(`⟨cite:doc:01a17d96-9a03-7c51-aa2a-53a9f5794990·33-34⟩`, DOC, chunks)).toBeNull();
    expect(spanText(`⟨cite:doc:${DOC}·27-33⟩`, DOC, chunks)).toBeNull();
    expect(spanText(`⟨cite:doc:${DOC}·50-60⟩`, DOC, chunks)).toBeNull();
    expect(spanText(`⟨cite:doc:${DOC}·33-33⟩`, DOC, chunks)).toBeNull();
    expect(spanText({ value: 2000, typed_by: "m" }, DOC, chunks)).toBeNull();
  });
});

describe("the PO proposal's cited saving", () => {
  const Q = "01a17d99-3a46-7933-8b74-fabe2e013386";
  const P = "01a17d97-f814-747d-af48-2bb2aec203a3";
  const draft = (cells: Array<[string, string, number]>) => ({
    based_on: cells.map(([snap, col, v]) => ({ ref: `⟨snap:${snap}·5·${col}⟩`, template_id: snap === Q ? "purchasing.quote_compare" : "purchasing.price_creep", params: {}, expected: v })),
  }) as unknown as Schemas["V1Draft"];
  it("reads the quote comparison's saving and reference cells, as core read them", () => {
    const s = poSaving(draft([[P, "latest_minor", 148_000], [Q, "unit_price_minor", 146_520], [Q, "reference_unit_price_minor", 148_000], [Q, "saving_minor", 1_588]]));
    expect(s).toEqual({ saving: { ref: `⟨snap:${Q}·5·saving_minor⟩`, value: 1_588 }, reference: { ref: `⟨snap:${Q}·5·reference_unit_price_minor⟩`, value: 148_000 } });
  });
  it("cites no saving when the proposal cites none, and never takes the anchor's price for the reference", () => {
    expect(poSaving(draft([[P, "latest_minor", 148_000], [Q, "unit_price_minor", 146_520]]))).toBeNull();
    expect(poSaving(draft([[P, "latest_minor", 148_000], [Q, "saving_minor", 1_588]]))?.reference).toBeNull();
  });
});

describe("mock mode", () => {
  it("the mock answers the section's load call (proposed drafts, no outlet), and holds no invoice draft", async () => {
    const token = DEMO_PEOPLE.find((p) => p.key === "owner")!.token;
    const client = createStaffClient({
      baseUrl: "http://mock.test/mock", token: () => token, tenantId: DEMO_TENANT_ID,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init);
        return handle(req, new URL(req.url).pathname.replace(/^\/mock\/v1\//, "").split("/"));
      },
    });
    const r = await client.listDrafts({ status: "proposed" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.items.length).toBeGreaterThan(0);
    expect(r.ok && r.data.items.filter((i) => isInvoiceDraft(i.draft))).toEqual([]);
  });
});
