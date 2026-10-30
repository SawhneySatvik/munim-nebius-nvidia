// Flow 8 — orders that change after placement (R1-M4 new flows; IN, restaurant_5 = CGST 2.5% + SGST 2.5% on top,
// each half-up). Prices for "Synthetic thali" at outlet 3: 10,000 open from 2026-10-01; 12,000 from TOMORROW (Asia/
// Kolkata) — W2-R1 closes the open row at tomorrow. A promise moved to tomorrow re-prices the order (rule 9).
//   P1 push-back (POS, counter): placed now 10,000 + 250 + 250 = 10,500 → pushed to tomorrow 13:00 → 12,000 + 300 +
//      300 = 12,600; the line follows the header (unit 12,000, tax 600). Each re-priced row is audited (R1-M2).
//   P2 push-back of a PAID order (cash 10,500) to tomorrow → refused 409 (R2-S2-6: re-price is refused once
//      tendered); the order stays 10,500 and writes nothing.
//   R1 reschedule (storefront, signed in, coupon TEN10 = 10%): placed now 10,000 − 1,000 = 9,000 + 225 + 225 = 9,450;
//      reschedule-preview at tomorrow 13:00 → 12,000 − 1,200 = 10,800 + 270 + 270 = 11,340; confirmed → the order and
//      its line re-priced, the pricing snapshot MERGED (coupons, loyalty, picks, pack kept; judged_at moved — R2-S1-1).
//   F1 refunds against the per-role cap (W2-R3; staff 50,000 cumulative per order — R1-M3/R2-S3-6): "Synthetic platter"
//      100,000 + 2,500 + 2,500 = 105,000 at outlet 1, cash 105,000, completed. Staff refunds 21,000 → 21,000 (42,000)
//      → a third 21,000 (63,000 > 50,000) refused 403 authority_denied; the owner (uncapped) refunds 21,000.
//      Each refund posts (cumulative pro-rata tax, R2-S3-2): tax share of 21,000 = 21,000 × 5,000 / 105,000 = 1,000 →
//      Dr 4000 20,000 · Dr 2100 1,000 · Cr 1000 cash 21,000. Refunded in all 63,000.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, postingsOf, type Res, startEnv, storefrontKey, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let staff: Caller;
let shop: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { pickup: uuidv7(), thali: uuidv7(), platter: uuidv7() };
const day = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offsetDays * 86_400_000));
const TOMORROW_1PM = () => new Date(`${day(1)}T13:00:00+05:30`).toISOString();

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner, staff } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
  const ok = async (p: Promise<Res>) => expect((await p).status).toBe(200);
  await ok(env.cmd(owner, "/v1/channels", "tenancy.channel.create.v1", { channel_id: ids.pickup, name: "Synthetic pickup", kind: "pickup" }));
  for (const [item, key] of [[ids.thali, "menu.int_thali"], [ids.platter, "menu.int_platter"]] as const) {
    await ok(env.cmd(owner, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
      item_id: item, kind: "dish", name_key: key, category: "mains", brand_id: null, barcode: null, mrp_minor: null, currency: null,
      active: true, variants: [], option_groups: [], stock_ingredient_id: null }));
  }
  const price = (item: string, outlet: string, channel_kind: string, amount_minor: number, valid_from: string) => ok(env.cmd(owner, "/v1/catalogue/prices", "catalogue.price.set.v1", {
    price_id: uuidv7(), item_id: item, variant_id: null, outlet_id: outlet, channel_kind, amount_minor, currency: "INR", tax_class: "restaurant_5", valid_from, valid_to: null }));
  for (const kind of ["counter", "pickup"]) {
    await price(ids.thali, w.outlets[2], kind, 10000, "2026-10-01");
    await price(ids.thali, w.outlets[2], kind, 12000, day(1));
  }
  await price(ids.platter, w.outlets[0], "counter", 100000, "2026-10-01");
  await ok(env.cmd(owner, "/v1/catalogue/coupons", "catalogue.coupon.set.v1", {
    coupon_id: uuidv7(), code: "TEN10", kind: "percent", value_bp: 1000, value_minor: null, currency: "INR", min_spend_minor: 0, global_cap: null, per_customer_cap: null,
    requires_customer: false, outlet_ids: [], valid_from: "2026-10-01T00:00:00Z", valid_to: null, active: true }));
  shop = { key: await storefrontKey(env, w, ids.pickup), sub: `oc-shopper-${uuidv7()}`, email: "oc.shopper@example.test" };
});
afterAll(async () => env?.stop());

const posOrder = (item: string, outlet: string) => ({
  order_id: uuidv7(), outlet_id: outlet, channel_id: w.channel, brand_id: null, device_id: null, kind: "takeaway", table_ref: null, pickup_window_id: null,
  promised_at: null, external_ref: null, coupon_codes: [], loyalty_redeem_points: 0, preview_total_minor: null, client_totals: null,
  lines: [{ line_id: uuidv7(), item_id: item, variant_id: null, option_ids: [], qty_milli: 1000, barcode: null, note: null }],
});
const money = (id: string) => env.one(`SELECT subtotal_minor::int AS sub, discount_minor::int AS disc, tax_minor::int AS tax, total_minor::int AS total FROM core."order" WHERE id = $1`, [id]);
const lineMoney = (id: string) => env.rows(`SELECT unit_price_minor::int AS unit, line_discount_minor::int AS disc, tax_minor::int AS tax FROM core.order_line WHERE order_id = $1 ORDER BY line_no`, [id]);
const envelope = (type: string, payload: unknown) => ({ command_id: uuidv7(), idempotency_key: `oc-${uuidv7()}`, type, payload });

describe("orders changed after placement: push-back, reschedule, refunds against the cap", () => {
  it("P1 push-back to tomorrow re-prices 10,500 → 12,600, the line follows, the move is an order event", async () => {
    const o = posOrder(ids.thali, w.outlets[2]);
    expect((await env.cmd(owner, "/v1/orders", "orders.place.v1", o)).status).toBe(201);
    expect(await money(o.order_id)).toEqual({ sub: 10000, disc: 0, tax: 500, total: 10500 });
    const to = TOMORROW_1PM();
    const r = await env.cmd(owner, `/v1/orders/${o.order_id}:push-back`, "orders.promise.push_back.v1",
      { order_id: o.order_id, from_promised_at: null, to_promised_at: to, reason_code: "kitchen_busy" });
    expect(r.status).toBe(200);
    expect(await money(o.order_id)).toEqual({ sub: 12000, disc: 0, tax: 600, total: 12600 });
    expect(await lineMoney(o.order_id)).toEqual([{ unit: 12000, disc: 0, tax: 600 }]);
    expect(await env.rows(`SELECT kind, coalesce(to_promised_at = $2::timestamptz, false) AS moved FROM core.order_event WHERE order_id = $1 ORDER BY seq`, [o.order_id, to]))
      .toEqual([{ kind: "status", moved: false }, { kind: "promised_at", moved: true }]);
  });

  it("P2 a paid order is not re-priced by a push-back: 409, still 10,500, nothing written", async () => {
    const o = posOrder(ids.thali, w.outlets[2]);
    expect((await env.cmd(owner, "/v1/orders", "orders.place.v1", o)).status).toBe(201);
    expect((await env.cmd(owner, `/v1/orders/${o.order_id}/tenders`, "orders.tender.record.v1",
      { tender_id: uuidv7(), order_id: o.order_id, method: "cash", tendered_minor: 10500, amount_minor: null, currency: "INR", ref: null })).status).toBe(200);
    const r = await env.cmd(owner, `/v1/orders/${o.order_id}:push-back`, "orders.promise.push_back.v1",
      { order_id: o.order_id, from_promised_at: null, to_promised_at: TOMORROW_1PM(), reason_code: "kitchen_busy" });
    expect(r.status).toBe(409);
    expect(await money(o.order_id)).toEqual({ sub: 10000, disc: 0, tax: 500, total: 10500 });
    expect(await env.rows(`SELECT kind FROM core.order_event WHERE order_id = $1`, [o.order_id])).toEqual([{ kind: "status" }]);
  });

  it("R1 reschedule with TEN10: preview 11,340 (was 9,450); confirmed → re-priced, line follows, snapshot merged not replaced", async () => {
    const place = await env.http("POST", "/v1/storefront/orders", shop, {
      order: envelope("orders.place.v1", { ...posOrder(ids.thali, w.outlets[2]), channel_id: ids.pickup, kind: "pickup", coupon_codes: ["TEN10"] }),
      guest: null, contact: { name: "Synthetic Shopper", phone: null } });
    expect([place.status, place.body.total_minor]).toEqual([201, 9450]);
    const id = place.body.order_id as string;
    const before = (await env.one<{ s: Record<string, unknown> }>(`SELECT pricing_snapshot AS s FROM core."order" WHERE id = $1`, [id])).s;
    expect(await env.rows(`SELECT discount_minor::int AS d FROM core.coupon_use WHERE order_id = $1`, [id])).toEqual([{ d: 1000 }]);
    const to = TOMORROW_1PM();
    const preview = await env.http("POST", `/v1/storefront/orders/${id}:reschedule-preview`, shop, { pickup_window_id: null, promised_at: to });
    expect([preview.status, preview.body.current_total_minor, preview.body.preview.total_minor]).toEqual([200, 9450, 11340]);
    const r = await env.http("POST", `/v1/storefront/orders/${id}:reschedule`, shop,
      envelope("storefront.order.reschedule.v1", { order_id: id, pickup_window_id: null, promised_at: to, preview_total_minor: 11340 }));
    expect(r.status).toBe(200);
    expect(await money(id)).toEqual({ sub: 12000, disc: 1200, tax: 540, total: 11340 });
    expect(await lineMoney(id)).toEqual([{ unit: 12000, disc: 1200, tax: 540 }]);
    const after = (await env.one<{ s: Record<string, unknown> }>(`SELECT pricing_snapshot AS s FROM core."order" WHERE id = $1`, [id])).s;
    // R2-S1-1: what placement judged stays as it was (loyalty, picks, coupons, pack, judged_at); this judgement is
    // recorded beside it — the same coupon at its new share 1,200, judged at the new time.
    for (const k of Object.keys(before)) expect([k, after[k]]).toEqual([k, before[k]]);
    const repriced = after.repriced as { judged_at: string; coupons: Array<{ coupon_id: string; discount_minor: number }> };
    expect(repriced.coupons.map((k) => [k.coupon_id, k.discount_minor]))
      .toEqual((before.coupons as Array<{ coupon_id: string }>).map((k) => [k.coupon_id, 1200]));
    expect(new Date(repriced.judged_at).toISOString()).toBe(to);
    // R2-S3-7: the coupon use follows the re-price (hand: 10% of 12,000), audited with before / after.
    expect(await env.rows(`SELECT discount_minor::int AS d FROM core.coupon_use WHERE order_id = $1`, [id])).toEqual([{ d: 1200 }]);
    expect(await env.rows(
      `SELECT a.before, a.after FROM core.audit_log a JOIN core.coupon_use u ON u.tenant_id = a.tenant_id AND u.id::text = a.entity_id
        WHERE a.tenant_id = $1 AND a.entity = 'core.coupon_use' AND a.action = 'orders.reprice' AND u.order_id = $2`, [w.tenant, id]))
      .toEqual([{ before: { discount_minor: 1000 }, after: { discount_minor: 1200 } }]);
  });

  it("F1 staff refunds 21,000 twice (42,000 ≤ 50,000), a third is refused (63,000 > 50,000); the owner refunds; each posts by hand", async () => {
    const o = posOrder(ids.platter, w.outlets[0]);
    expect((await env.cmd(owner, "/v1/orders", "orders.place.v1", o)).status).toBe(201);
    expect(await money(o.order_id)).toEqual({ sub: 100000, disc: 0, tax: 5000, total: 105000 });
    const tender = uuidv7();
    expect((await env.cmd(owner, `/v1/orders/${o.order_id}/tenders`, "orders.tender.record.v1",
      { tender_id: tender, order_id: o.order_id, method: "cash", tendered_minor: 105000, amount_minor: null, currency: "INR", ref: null })).status).toBe(200);
    expect((await env.cmd(owner, `/v1/orders/${o.order_id}:accept`, "orders.order.accept.v1", { order_id: o.order_id })).status).toBe(200);
    for (const [from_status, to_status] of [["accepted", "preparing"], ["preparing", "ready"], ["ready", "completed"]]) {
      expect((await env.cmd(owner, `/v1/orders/${o.order_id}:advance`, "orders.order.advance.v1", { order_id: o.order_id, from_status, to_status, reason_code: null })).status).toBe(200);
    }
    const refund = (who: Caller) => {
      const refund_id = uuidv7();
      return env.cmd(who, `/v1/orders/${o.order_id}/refunds`, "orders.refund.record.v1", {
        refund_id, order_id: o.order_id, tender_id: tender, method: "cash", amount_minor: 21000, currency: "INR", reason_code: "cold_food", note: "Synthetic complaint" })
        .then((r) => ({ r, refund_id }));
    };
    const s1 = await refund(staff);
    const s2 = await refund(staff);
    const s3 = await refund(staff);
    expect([s1.r.status, s2.r.status, s3.r.status, s3.r.body.error?.reason_code]).toEqual([200, 200, 403, "authority_denied"]);
    const o1 = await refund(owner);
    expect(o1.r.status).toBe(200);
    expect(await env.rows(`SELECT amount_minor::int AS amount, origin ->> 'role' AS role FROM core.refund WHERE order_id = $1 ORDER BY id`, [o.order_id]))
      .toEqual([{ amount: 21000, role: "staff" }, { amount: 21000, role: "staff" }, { amount: 21000, role: "owner" }]);
    for (const x of [s1, s2, o1]) expect(await postingsOf(env, x.refund_id)).toEqual({ "finance.post_refund": { 1000: -21000, 2100: 1000, 4000: 20000 } });
    expect(await postingsOf(env, o.order_id)).toEqual({ "finance.post_order": { 1110: 105000, 2100: -5000, 4000: -100000 } });
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: setup — pickup channel, 2 items, 5 prices (thali counter + pickup × 2 versions, platter), TEN10. Orders P1, P2,
    // R1, F1 (1 line each); events: P1 placed + promised_at, P2 placed, R1 placed + promised_at, F1 placed + 4 status
    // = 10; the shopper's profile and TEN10's use; tenders P2 + F1; 3 refunds; entries: 2 post_tender (2 postings
    // each), F1 post_order (3), 3 post_refund (3 each) = 6 entries, 16 postings.
    expect(scan.inserted).toEqual({
      channel: 1, item: 2, price: 5, coupon: 1, order: 4, order_line: 4, order_event: 10, customer: 1, coupon_use: 1, tender: 2, refund: 3,
      journal_entry: 6, posting: 16,
    });
    // Hand: the 2 open thali rows closed at tomorrow (W2-R1); P1's and R1's one line re-priced once each.
    // R1's one coupon use followed its re-price (R2-S3-7).
    expect([scan.updated.price, scan.updated.order_line, scan.updated.coupon_use]).toEqual([2, 2, 1]);
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
