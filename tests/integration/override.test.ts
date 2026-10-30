// Flow 9 — an expired-sale override used at the counter (R40 C7; R1-M2 / R1-M4). The IN pack ships with
// `expired_sale_override: false` (food safety); this clone's IN pack row is flipped to true as fixture plumbing
// (platform.country_pack is not a book) after the flag-off refusal is shown.
// Hand: "Synthetic biscuits" (sku, batch-tracked pc) at outlet 3, 5,000 + 125 + 125 = 5,250 (restaurant_5). Opening
// stock 10 pc in batch SYN-EXP-1, expired YESTERDAY (Asia/Kolkata).
//   flag off → creating an override is refused 422 out_of_pack_scope;
//   flag on, no override → the sale is refused 409 expired_batch, nothing written;
//   the owner overrides 1 pc for cart line L → the sale with line L is placed (5,250): the override is used once
//   (used_at, order_line_id = L — audited), and 1 pc (−1,000 milli) is drawn from SYN-EXP-1 under inventory.consume_sku;
//   a second sale of 1 pc with a fresh line → 409 expired_batch again (the override was single use).
import { businessDate } from "../../packages/core-domain/tz/index.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, type Res, startEnv, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { stock: uuidv7(), sku: uuidv7(), batch: uuidv7(), override: uuidv7(), line: uuidv7(), order: uuidv7() };
/** The day before the outlet's BUSINESS date: between 00:00 and the cutoff (04:00) the business date is still the previous calendar day, so a
 *  calendar-based "yesterday" is the current business date and the batch would not be expired. */
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
export const yesterdayAt = (now: Date, tz: string, cutoff: string) => dayBefore(businessDate(now, tz, cutoff));
let yesterday = "";

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
  const outlet = await env.one<{ tz: string; cutoff: string }>(`SELECT tz, to_char(business_day_cutoff, 'HH24:MI') AS cutoff FROM core.outlet WHERE id = $1`, [w.outlets[2]]);
  yesterday = yesterdayAt(new Date(), outlet.tz, outlet.cutoff);
  const ok = async (p: Promise<Res>) => expect((await p).status).toBe(200);
  await ok(env.cmd(owner, "/v1/inventory/ingredients", "inventory.ingredient.upsert.v1",
    { ingredient_id: ids.stock, name: "Biscuits pack (synthetic)", base_unit: "pc", shelf_life_days: null, tracked_by_batch: true }));
  await ok(env.cmd(owner, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
    item_id: ids.sku, kind: "sku", name_key: "shop.int_biscuits", category: "snacks", brand_id: null, barcode: null, mrp_minor: null, currency: null,
    active: true, variants: [], option_groups: [], stock_ingredient_id: ids.stock }));
  await ok(env.cmd(owner, "/v1/catalogue/prices", "catalogue.price.set.v1", {
    price_id: uuidv7(), item_id: ids.sku, variant_id: null, outlet_id: w.outlets[2], channel_kind: "counter", amount_minor: 5000, currency: "INR",
    tax_class: "restaurant_5", valid_from: "2026-10-01", valid_to: null }));
  await ok(env.cmd(owner, "/v1/inventory/stock:receive", "inventory.stock.receive.v1", { outlet_id: w.outlets[2], source: "opening", at: new Date().toISOString(),
    lines: [{ movement_id: uuidv7(), ingredient_id: ids.stock, batch_id: ids.batch, batch: { batch_code: "SYN-EXP-1", expires_on: yesterday, mrp_minor: null },
      qty_milli: 10000, unit: "pc", unit_cost: { amount_minor: 2000, currency: "INR" } }] }));
});
afterAll(async () => env?.stop());

const sale = (line_id: string, order_id = uuidv7()) => env.cmd(owner, "/v1/orders", "orders.place.v1", {
  order_id, outlet_id: w.outlets[2], channel_id: w.channel, brand_id: null, device_id: null, kind: "takeaway", table_ref: null, pickup_window_id: null,
  promised_at: null, external_ref: null, coupon_codes: [], loyalty_redeem_points: 0, preview_total_minor: null, client_totals: null,
  lines: [{ line_id, item_id: ids.sku, variant_id: null, option_ids: [], qty_milli: 1000, barcode: null, note: null }] });
const override = () => env.cmd(owner, "/v1/inventory/expired-sale-overrides", "inventory.expired_sale.override.v1", {
  override_id: ids.override, outlet_id: w.outlets[2], cart_line_id: ids.line, batch_id: ids.batch, qty_milli: 1000, reason_code: "owner_checked", note: "Sealed pack, checked by the owner" });
const batchOnHand = async () => Number((await env.one<{ n: string }>(`SELECT sum(qty_milli)::text AS n FROM core.stock_movement WHERE batch_id = $1`, [ids.batch])).n);

describe("the fixture's clock", () => {
  it("'yesterday' follows the business date: at 01:30 IST on 12 Oct it is 10 Oct, not the calendar's 11 Oct", () => {
    const night = new Date("2026-10-11T20:00:00Z"); // 01:30 IST on 2026-10-12, before the 04:00 cutoff
    expect(yesterdayAt(night, "Asia/Kolkata", "04:00")).toBe("2026-10-10");
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(night.getTime() - 86_400_000))).toBe("2026-10-11"); // the old formula
    expect(yesterdayAt(new Date("2026-10-11T23:30:00Z"), "Asia/Kolkata", "04:00")).toBe("2026-10-11"); // 05:00 IST on the 12th: after the cutoff
  });
});

describe("expired-sale override: pack flag, single use, audited, stock drawn from the expired batch", () => {
  it("flag off → 422; flag on without an override → 409 expired_batch; with one → placed 5,250, used once, 1 pc drawn", async () => {
    const off = await override();
    expect([off.status, off.body.error?.code]).toEqual([422, "out_of_pack_scope"]);
    await env.db.admin(`UPDATE platform.country_pack SET doc = jsonb_set(doc, '{expired_sale_override}', 'true') WHERE code = 'IN'`);

    const refused = await sale(uuidv7());
    expect([refused.status, refused.body.error?.reason_code]).toEqual([409, "expired_batch"]);
    expect(await batchOnHand()).toBe(10000);

    expect((await override()).status).toBe(200);
    const placed = await sale(ids.line, ids.order);
    expect(placed.status).toBe(201);
    expect(await env.one(`SELECT total_minor::int AS total FROM core."order" WHERE id = $1`, [ids.order])).toEqual({ total: 5250 });
    expect(await env.one(`SELECT used_at IS NOT NULL AS used, order_line_id::text AS line FROM core.expired_sale_override WHERE id = $1`, [ids.override]))
      .toEqual({ used: true, line: ids.line });
    expect(await env.rows(`SELECT qty_milli::int AS qty, batch_id::text AS batch, origin ->> 'rule_id' AS rule FROM core.stock_movement WHERE ref_id = $1`, [ids.order]))
      .toEqual([{ qty: -1000, batch: ids.batch, rule: "inventory.consume_sku" }]);
    expect(await batchOnHand()).toBe(9000);
    // The use is audited by the placement that used it (R1-M2).
    expect(Number((await env.one<{ n: string }>(`SELECT count(*) AS n FROM core.audit_log WHERE entity = 'core.expired_sale_override' AND entity_id = $1 AND before IS NOT NULL`,
      [ids.override])).n)).toBe(1);

    const again = await sale(uuidv7());
    expect([again.status, again.body.error?.reason_code]).toEqual([409, "expired_batch"]);
    expect(await batchOnHand()).toBe(9000);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: ingredient, item, price, batch, the receipt + the sale's draw, the override, one order + line + placed event.
    expect(scan.inserted).toEqual({ ingredient: 1, item: 1, price: 1, batch: 1, stock_movement: 2, expired_sale_override: 1, order: 1, order_line: 1, order_event: 1 });
    // Hand: the override marked used once.
    expect(scan.updated).toEqual({ expired_sale_override: 1 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
