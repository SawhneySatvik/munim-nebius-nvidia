// [unit] NB-6b: on the inbox draft page an invoice figure that is a page span shows "Read on the page" with the page text;
// a span that does not resolve (other document, no chunk holds it) still reads "Cannot verify". Chunks are hand-written.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftField } from "@/components/staff/draft-field";
import { spanText } from "@/lib/munim/invoice-flow";

const DOC = "01a17d96-9a03-7c51-aa2a-53a9f579498f";
const chunks = [{ text: "Qty 2 kg at 1560.00", char_start: 0 }] as Parameters<typeof spanText>[2];
const fmt = { locale: "en-IN", currency: "INR", outletNames: {} };
const html = (ref: string) => {
  const read = spanText(ref, DOC, chunks);
  return renderToStaticMarkup(createElement(DraftField, {
    label: "Price", value: { kind: "unverified", ref }, edit: null, editorName: "Asha", fmt, column: "unit_price_minor", onOpen: () => {}, read,
  } as Parameters<typeof DraftField>[0]));
};

describe("an invoice span on the inbox draft page", () => {
  it("a resolvable span shows the page text marked Read on the page, not Cannot verify", () => {
    const out = html(`⟨cite:doc:${DOC}·12-19⟩`);
    expect(out).toContain("1560.00");
    expect(out).toContain("Read on the page");
    expect(out).not.toContain("Cannot verify");
  });
  it("an unresolvable span (another document, or past the text) is still Cannot verify", () => {
    expect(html(`⟨cite:doc:01a17d96-9a03-7c51-aa2a-53a9f5794990·12-19⟩`)).toContain("Cannot verify");
    expect(html(`⟨cite:doc:${DOC}·12-99⟩`)).toContain("Cannot verify");
  });
});
