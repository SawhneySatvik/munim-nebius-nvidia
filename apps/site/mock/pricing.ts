// Server-side pricing, mirroring services/core-api/src/modules/catalogue/pricing.ts + packages/core-domain/packs:
// a deal per line (judged at the promised time in the outlet's zone), coupons as percent per line on what is left
// (half-up), then pack tax per component, half-up per line. Client-sent totals never reach this code.
import { PACKS } from "./packs";
import type { Business, Coupon, Item, Outlet } from "./catalogue";
import { MockError } from "./errors";
import { localParts, mulDiv, stableId } from "./util";

export type CartLine = { item_id: string; variant_id: string | null; option_ids: string[]; qty_milli: number };
/** The contract's RefusalParams: ids and core-computed amounts only, each present only when the refusal has it. */
export type RefusalParams = {
  line_no?: number; item_id?: string; variant_id?: string | null; code?: string;
  min_spend_minor?: number; shortfall_minor?: number; old_total_minor?: number; new_total_minor?: number; currency?: string;
};
export type Refusal = { line_no: number | null; reason_code: string; params?: RefusalParams };
export type TaxAmount = { code: string; rate_bp: number; amount_minor: number };
export type Priced = {
  currency: string; pack_code: "IN" | "AU"; pack_version: number; prices_include_tax: boolean;
  lines: Array<{
    line_no: number; item_id: string; variant_id: string | null; qty_milli: number; unit_price_minor: number; options_minor: number;
    line_discount_minor: number; tax_class: string; tax_minor: number; line_total_minor: number;
    price_ref: string; option_refs: string[]; deal_refs: string[]; coupon_refs: string[];
    /** The class rate and each pack component's amount on this line (IN: CGST + SGST halves; AU: GST; GST-free: []). */
    tax_rate_bp: number; tax_components: TaxAmount[];
  }>;
  /** Σ per component over the lines. */
  tax_components: TaxAmount[];
  subtotal_minor: number; discount_minor: number; tax_minor: number; total_minor: number; refusals: Refusal[];
};

const cite = (table: string, id: string) => `⟨cite:row:core.${table}:${id}⟩`;
const ISO_DATE = (d: Date) => d.toISOString().slice(0, 10);

function dealOpen(biz: Business, d: Business["deals"][number], at: Date): boolean {
  const l = localParts(at, biz.tz);
  return d.days.includes(l.dow) && l.hhmm >= d.from && l.hhmm < d.to;
}

function judgeCoupon(c: Coupon | undefined, outletIdx: number, afterDeals: number, at: Date): string | null {
  if (!c) return "coupon_invalid";
  const day = ISO_DATE(at);
  if (day < c.validFrom || (c.validTo !== null && day >= c.validTo)) return "coupon_expired";
  if (c.outletIdx.length > 0 && !c.outletIdx.includes(outletIdx)) return "coupon_out_of_scope";
  if (c.capReached) return "coupon_cap_reached";
  if (afterDeals < c.minSpend) return "coupon_min_spend";
  return null;
}

export function findItem(biz: Business, id: string): Item {
  const it = biz.items.find((i) => i.id === id);
  if (!it) throw new MockError("not_found");
  return it;
}

/** Throws for malformed carts exactly where core does (unknown item 404, off-sale 409 item_unavailable, bad options 422). */
export function priceCart(biz: Business, outlet: Outlet, lines: CartLine[], couponCodes: string[], at: Date): Priced {
  const pack = PACKS[biz.country];
  const outletIdx = biz.outlets.indexOf(outlet);
  const refusals: Refusal[] = [];
  const work = lines.map((l, i) => {
    const it = findItem(biz, l.item_id);
    const v = l.variant_id === null ? null : it.variants.find((x) => x.id === l.variant_id);
    if (l.variant_id !== null && !v) throw new MockError("not_found");
    if (!it.active) throw new MockError("conflict", "item_unavailable");
    if (it.variants.length > 0 && v === null) throw new MockError("conflict", "item_unavailable");
    const chosen = l.option_ids.map((oid) => {
      for (const g of it.groups) { const o = g.options.find((x) => x.id === oid); if (o) return { g, o }; }
      throw new MockError("invalid_payload");
    });
    if (new Set(l.option_ids).size !== l.option_ids.length) throw new MockError("invalid_payload");
    for (const g of it.groups) {
      const n = chosen.filter((c) => c.g === g).length;
      if (n < g.min || n > g.max) throw new MockError("invalid_payload");
    }
    if (it.soldOutAt.includes(outletIdx)) refusals.push({ line_no: i + 1, reason_code: "item_sold_out", params: { line_no: i + 1, item_id: l.item_id, variant_id: l.variant_id } });
    const price = v ? v.price : it.price!;
    const optionsMinor = chosen.reduce((a, c) => a + c.o.delta, 0);
    const unit = price + optionsMinor;
    const amount = mulDiv(l.qty_milli, unit, 1000);
    const deal = biz.deals.find((d) => d.itemSlug === it.slug && dealOpen(biz, d, at));
    const dealDisc = deal ? mulDiv(amount, deal.bp, 10000) : 0;
    return { l, it, v, price, optionsMinor, amount, deal, dealDisc, coupon: 0, couponIds: [] as string[], chosen, line_no: i + 1 };
  });

  const afterDeals = work.reduce((a, w) => a + w.amount - w.dealDisc, 0);
  const seen = new Set<string>();
  for (const code of couponCodes) {
    const c = biz.coupons.find((x) => x.code === code);
    const reason = seen.has(code) ? "coupon_invalid" : judgeCoupon(c, outletIdx, afterDeals, at);
    if (reason) {
      const minSpend = reason === "coupon_min_spend" ? { min_spend_minor: c!.minSpend, shortfall_minor: c!.minSpend - afterDeals, currency: pack.currency } : {};
      refusals.push({ line_no: null, reason_code: reason, params: { code, ...minSpend } });
      continue;
    }
    seen.add(code);
    work.forEach((w) => {
      const p = mulDiv(w.amount - w.dealDisc - w.coupon, c!.bp, 10000);
      w.coupon += p;
      if (p > 0) w.couponIds.push(`${biz.slug}:coupon:${c!.code}`);
    });
  }

  const inclusive = pack.price_display === "inclusive";
  const out: Priced["lines"] = work.map((w) => {
    const cls = pack.classes[w.it.taxClass]!;
    const discount = w.dealDisc + w.coupon;
    const after = w.amount - discount;
    const comps = cls.components.map((c) => ({ code: c.code, rate_bp: c.rate_bp, amount_minor: mulDiv(after, c.rate_bp, inclusive ? 10000 + cls.rate_bp : 10000) }));
    const tax = comps.reduce((a, c) => a + c.amount_minor, 0);
    return {
      line_no: w.line_no, item_id: w.it.id, variant_id: w.v?.id ?? null, qty_milli: w.l.qty_milli, unit_price_minor: w.price, options_minor: w.optionsMinor,
      line_discount_minor: discount, tax_class: w.it.taxClass, tax_minor: tax, line_total_minor: inclusive ? after : after + tax,
      price_ref: cite("price", w.v?.id ?? w.it.id), option_refs: w.chosen.map((c) => cite("option", c.o.id)),
      deal_refs: w.deal && w.dealDisc > 0 ? [cite("deal", w.deal.id)] : [],
      coupon_refs: w.couponIds.map((id) => cite("coupon", stableId(id))),
      tax_rate_bp: cls.rate_bp, tax_components: comps,
    };
  });
  const components: TaxAmount[] = [];
  for (const c of out.flatMap((l) => l.tax_components)) {
    const hit = components.find((x) => x.code === c.code && x.rate_bp === c.rate_bp);
    if (hit) hit.amount_minor += c.amount_minor;
    else components.push({ ...c });
  }
  const discount = out.reduce((a, l) => a + l.line_discount_minor, 0);
  const tax = out.reduce((a, l) => a + l.tax_minor, 0);
  const total = out.reduce((a, l) => a + l.line_total_minor, 0);
  return {
    currency: pack.currency, pack_code: pack.code, pack_version: pack.version, prices_include_tax: inclusive, lines: out, tax_components: components,
    subtotal_minor: total - tax + discount, discount_minor: discount, tax_minor: tax, total_minor: total, refusals,
  };
}
