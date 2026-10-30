// Preview totals for 3 hand-computed carts per business. Expected numbers are written out by hand (see the arithmetic
// in each comment); they are NOT produced by the code under test.
import { beforeEach, describe, expect, it } from "vitest";
import { StorefrontPreviewResponse } from "../../../../packages/contracts/src/storefront/index.ts";
import { LANEWAY, SPICE, call, item, previewReq, reset, type L } from "./helpers";

beforeEach(() => reset());
const prev = async (b: typeof SPICE, ls: L[], o: Parameters<typeof previewReq>[2] = {}) => {
  const r = await call(b, "POST", "/v1/storefront/orders:preview", { body: previewReq(b, ls, o) });
  expect(r.status).toBe(200);
  StorefrontPreviewResponse.parse(r.body);
  return r.body;
};
const per = (b: any) => b.lines.map((l: any) => [l.line_total_minor, l.tax_minor, l.line_discount_minor]);

describe("Spice Route (IN, GST 5% exclusive = CGST 2.5% + SGST 2.5%, half-up per component)", () => {
  const SAT = "2026-10-17T19:00:00+05:30"; // Saturday: weekday-lunch deal closed
  it("cart A: paneer tikka + 2 naan", async () => {
    // 28000 -> 700+700=1400 tax -> 29400 ; naan 2x6000=12000 -> 300+300=600 -> 12600 ; tax 2000, total 42000, subtotal 40000
    const b = await prev(SPICE, [{ slug: "paneer_tikka" }, { slug: "garlic_naan", qty: 2000 }], { promised: SAT });
    expect(per(b)).toEqual([[29400, 1400, 0], [12600, 600, 0]]);
    expect([b.subtotal_minor, b.discount_minor, b.tax_minor, b.total_minor, b.currency]).toEqual([40000, 0, 2000, 42000, "INR"]);
    expect(b.tax_rule).toEqual({ pack_code: "IN", pack_version: 4 });
    // CGST / SGST halves per line, half-up each: 700 + 700 and 300 + 300; the order's components sum them.
    expect(b.lines.map((l: any) => [l.tax_rate_bp, l.tax_components])).toEqual([
      [500, [{ code: "CGST", rate_bp: 250, amount_minor: 700 }, { code: "SGST", rate_bp: 250, amount_minor: 700 }]],
      [500, [{ code: "CGST", rate_bp: 250, amount_minor: 300 }, { code: "SGST", rate_bp: 250, amount_minor: 300 }]],
    ]);
    expect([b.tax_components, b.prices_include_tax]).toEqual([[{ code: "CGST", rate_bp: 250, amount_minor: 1000 }, { code: "SGST", rate_bp: 250, amount_minor: 1000 }], false]);
  });
  it("cart B: options and a half-up case", async () => {
    // butter chicken 36000 + extra naan 6000 + raita 4000 = 46000 -> 1150+1150=2300 -> 48300
    // lassi regular 9000 x 1.5 = 13500 -> 13500*250/10000 = 337.5 -> 338 each = 676 -> 14176 ; tax 2976, total 62476, subtotal 59500
    const b = await prev(SPICE, [{ slug: "butter_chicken", opts: ["medium", "extra_naan", "raita"] }, { slug: "mango_lassi", variant: "regular", qty: 1500 }], { promised: SAT });
    expect(per(b)).toEqual([[48300, 2300, 0], [14176, 676, 0]]);
    expect([b.subtotal_minor, b.discount_minor, b.tax_minor, b.total_minor]).toEqual([59500, 0, 2976, 62476]);
    expect(b.lines[0].options_minor).toBe(10000);
  });
  it("cart C: lunch deal then coupon, then tax", async () => {
    // Wed 12:30 IST: biryani 2x24000=48000, deal 10% = 4800 ; paneer 28000. After deals 71200 >= SPICE10 min 30000.
    // coupon 10% of what is left: biryani 43200 -> 4320 ; paneer 28000 -> 2800. Discounts 9120 and 2800.
    // after: 38880 -> 972+972=1944 -> 40824 ; 25200 -> 630+630=1260 -> 26460. tax 3204, total 67284, discount 11920, subtotal 76000
    const b = await prev(SPICE, [{ slug: "veg_biryani", qty: 2000 }, { slug: "paneer_tikka" }], { promised: "2026-10-14T12:30:00+05:30", coupons: ["SPICE10"] });
    expect(per(b)).toEqual([[40824, 1944, 9120], [26460, 1260, 2800]]);
    expect([b.subtotal_minor, b.discount_minor, b.tax_minor, b.total_minor]).toEqual([76000, 11920, 3204, 67284]);
    expect(b.lines[0].deal_refs).toHaveLength(1);
    expect(b.lines[0].coupon_refs).toHaveLength(1);
    expect(b.refusals).toEqual([]);
  });
});

describe("Laneway Cafe Fitzroy (AU, GST 10% inclusive: tax = price*1000/11000, half-up per line)", () => {
  const SAT = "2026-10-17T10:00:00+11:00"; // Saturday 10:00 Melbourne (DST +11:00): early-bird closed
  it("cart A: flat white + oat, avocado toast + egg + feta", async () => {
    // 480+80=560 -> 560/11=50.91 -> 51 ; 1850+300+250=2400 -> 218.18 -> 218. total 2960, tax 269, subtotal 2691
    const b = await prev(LANEWAY, [{ slug: "flat_white", opts: ["oat"] }, { slug: "avocado_toast", opts: ["egg", "feta"] }], { promised: SAT });
    expect(per(b)).toEqual([[560, 51, 0], [2400, 218, 0]]);
    expect([b.subtotal_minor, b.discount_minor, b.tax_minor, b.total_minor, b.currency]).toEqual([2691, 0, 269, 2960, "AUD"]);
    expect(b.tax_rule).toEqual({ pack_code: "AU", pack_version: 4 });
  });
  it("cart B: early-bird deal and a GST-free line", async () => {
    // Mon 08:00: flat white 2x480=960, deal 10% = 96 -> 864 -> 864/11=78.55 -> 79 ; sourdough GST-free 900, tax 0.
    // total 864+900=1764, tax 79, discount 96, subtotal 1764-79+96 = 1781
    const b = await prev(LANEWAY, [{ slug: "flat_white", qty: 2000 }, { slug: "sourdough_loaf" }], { promised: "2026-10-19T08:00:00+11:00" });
    expect(per(b)).toEqual([[864, 79, 96], [900, 0, 0]]);
    expect([b.subtotal_minor, b.discount_minor, b.tax_minor, b.total_minor]).toEqual([1781, 96, 79, 1764]);
    // One GST component (included in the price); the GST-free line has a 0 rate and no components.
    expect(b.lines.map((l: any) => [l.tax_rate_bp, l.tax_components])).toEqual([[1000, [{ code: "GST", rate_bp: 1000, amount_minor: 79 }]], [0, []]]);
    expect([b.tax_components, b.prices_include_tax]).toEqual([[{ code: "GST", rate_bp: 1000, amount_minor: 79 }], true]);
  });
  it("cart C: coupon on variants", async () => {
    // latte 2x500=1000, iced latte large 700 ; LANE5 min 1000 ok (1700). 5% per line: 50 and 35 -> 950 and 665.
    // 950/11=86.36 -> 86 ; 665/11=60.45 -> 60. total 1615, tax 146, discount 85, subtotal 1615-146+85 = 1554
    const b = await prev(LANEWAY, [{ slug: "latte", qty: 2000 }, { slug: "iced_latte", variant: "large" }], { promised: SAT, coupons: ["LANE5"] });
    expect(per(b)).toEqual([[950, 86, 50], [665, 60, 35]]);
    expect([b.subtotal_minor, b.discount_minor, b.tax_minor, b.total_minor]).toEqual([1554, 85, 146, 1615]);
  });
});

describe("pricing refusals use the real reason codes", () => {
  const codes = async (b: typeof SPICE, coupons: string[], ls: L[] = [{ slug: "paneer_tikka" }], outlet = 0) =>
    (await prev(b, ls, { promised: "2026-10-17T19:00:00+05:30", coupons, outlet })).refusals.map((r: any) => r.reason_code);
  it("coupon outcomes", async () => {
    expect(await codes(SPICE, ["NOPE1"])).toEqual(["coupon_invalid"]);
    expect(await codes(SPICE, ["OLDDEAL20"])).toEqual(["coupon_expired"]);
    expect(await codes(SPICE, ["FIRST100"])).toEqual(["coupon_cap_reached"]);
    expect(await codes(SPICE, ["SPICE10"])).toEqual(["coupon_min_spend"]); // 28000 < 30000
    expect(await codes(SPICE, ["NORTH5"], undefined, 1)).toEqual(["coupon_out_of_scope"]);
    expect(await codes(SPICE, ["NORTH5"], undefined, 0)).toEqual([]);
  });
  it("refusal params (G-11): the coupon code, and the min-spend shortfall after deals", async () => {
    // paneer 28000 < SPICE10's 30000: short by 2000.
    const b = await prev(SPICE, [{ slug: "paneer_tikka" }], { promised: "2026-10-17T19:00:00+05:30", coupons: ["SPICE10", "NOPE1"] });
    expect(b.refusals).toEqual([
      { line_no: null, reason_code: "coupon_min_spend", params: { code: "SPICE10", min_spend_minor: 30000, shortfall_minor: 2000, currency: "INR" } },
      { line_no: null, reason_code: "coupon_invalid", params: { code: "NOPE1" } },
    ]);
  });
  it("sold-out item is priced and refused with its line number", async () => {
    const b = await prev(SPICE, [{ slug: "paneer_tikka" }, { slug: "prawn_masala" }]);
    expect(b.refusals).toEqual([{ line_no: 2, reason_code: "item_sold_out", params: { line_no: 2, item_id: item(SPICE, "prawn_masala").id, variant_id: null } }]);
    expect(b.lines).toHaveLength(2);
  });
});
