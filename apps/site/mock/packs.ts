// Tax rules copied from packages/contracts/packs/{IN,AU}.json (version 4) — only the classes the two mock
// businesses use. The standalone site cannot import packages/**; __tests__/packs.test.ts fails if this drifts.
export type TaxClass = { rate_bp: number; components: ReadonlyArray<{ code: string; rate_bp: number }> };
export type Pack = {
  code: "IN" | "AU"; version: number; currency: string; price_display: "inclusive" | "exclusive"; classes: Record<string, TaxClass>;
  pay_at_counter_methods: Array<"cash" | "card" | "upi">;
};

export const PACKS: Record<"IN" | "AU", Pack> = {
  IN: {
    code: "IN", version: 4, currency: "INR", price_display: "exclusive", pay_at_counter_methods: ["cash", "card", "upi"],
    classes: { restaurant_5: { rate_bp: 500, components: [{ code: "CGST", rate_bp: 250 }, { code: "SGST", rate_bp: 250 }] } },
  },
  AU: {
    code: "AU", version: 4, currency: "AUD", price_display: "inclusive", pay_at_counter_methods: ["cash", "card"],
    classes: { gst_10: { rate_bp: 1000, components: [{ code: "GST", rate_bp: 1000 }] }, gst_free: { rate_bp: 0, components: [] } },
  },
};
