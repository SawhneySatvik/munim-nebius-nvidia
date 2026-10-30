// Flow 2 — storefront checkout over a storefront key (IN, outlet 3: no calendar rows → no hours limit):
//   G1 guest checkout → kitchen → completed (a guest earns nothing: no account);
//   S1 first sign-in checkout (profile created) with coupon ONCE10 (cap 1) → kitchen → completed → loyalty earn;
//   S2 the same coupon again → refused coupon_cap_reached; S2 without it, redeeming 30 points → the customer cancels →
//      the consumed stock and the redeemed points come back (W2-R6 inventory.reverse_order_consumption,
//      customers.loyalty_reverse);
//   S3 coupon SOLO20 (cap 1) → cancelled → its use no longer counts, so S4 with SOLO20 is accepted (coupon reversal).
// Hand (Paneer roll 20,000 on pickup, restaurant_5 = 5% exclusive; recipe 100 g paneer per roll):
//   G1 1 roll: 20,000 + 1,000 = 21,000.        S1 2 rolls, 10% off: 40,000 − 4,000 = 36,000 + 1,800 = 37,800; earn ⌊36,000 / 1,000⌋ = 36.
//   S2 1 roll: 21,000, 30 points redeemed (worth 300 at the policy's 10 per point).   S3 / S4 1 roll, 20% off: 16,000 + 800 = 16,800.
//   Stock: +2,000,000 − 100,000 − 200,000 − 100,000 + 100,000 − 100,000 + 100,000 − 100,000 = 1,600,000 milli-g.
//   Points: +36 − 30 + 30 = 36.   post_order (completed only): G1 Dr 1110 21,000 · Cr 4000 20,000 · Cr 2100 1,000;
//   S1 Dr 1110 37,800 · Cr 4000 36,000 · Cr 2100 1,800.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, postingsOf, type Res, startEnv, storefrontKey, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let shop: Caller;
let guest: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { paneer: uuidv7(), roll: uuidv7(), pickup: uuidv7() };
const SUB = `shopper-${uuidv7()}`;

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
  // Setup over HTTP (inside the watermark, so the scan covers it): a pickup channel, the dish, its price and stock.
  const ok = async (p: Promise<Res>) => expect((await p).status).toBe(200);
  await ok(env.cmd(owner, "/v1/channels", "tenancy.channel.create.v1", { channel_id: ids.pickup, name: "Synthetic pickup", kind: "pickup" }));
  await ok(env.cmd(owner, "/v1/inventory/ingredients", "inventory.ingredient.upsert.v1",
    { ingredient_id: ids.paneer, name: "Paneer (synthetic)", base_unit: "g", shelf_life_days: null, tracked_by_batch: false }));
  await ok(env.cmd(owner, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
    item_id: ids.roll, kind: "dish", name_key: "menu.int_paneer_roll", category: "rolls", brand_id: null, barcode: null, mrp_minor: null, currency: null,
    active: true, variants: [], option_groups: [], stock_ingredient_id: null }));
  await ok(env.cmd(owner, "/v1/catalogue/recipes", "catalogue.recipe.version.create.v1", {
    recipe_version_id: uuidv7(), item_id: ids.roll, variant_id: null, version: 1, valid_from: "2026-10-01", valid_to: null, yield_qty_milli: 1000,
    lines: [{ ingredient_id: ids.paneer, qty_milli: 100000, unit: "g", waste_pct_bp: 0 }] }));
  await ok(env.cmd(owner, "/v1/catalogue/prices", "catalogue.price.set.v1", {
    price_id: uuidv7(), item_id: ids.roll, variant_id: null, outlet_id: w.outlets[2], channel_kind: "pickup", amount_minor: 20000, currency: "INR",
    tax_class: "restaurant_5", valid_from: "2026-10-01", valid_to: null }));
  for (const [code, bp] of [["ONCE10", 1000], ["SOLO20", 2000]] as const) {
    await ok(env.cmd(owner, "/v1/catalogue/coupons", "catalogue.coupon.set.v1", {
      coupon_id: uuidv7(), code, kind: "percent", value_bp: bp, value_minor: null, currency: "INR", min_spend_minor: 0, global_cap: 1, per_customer_cap: null,
      requires_customer: false, outlet_ids: [], valid_from: "2026-10-01T00:00:00Z", valid_to: null, active: true }));
  }
  await ok(env.cmd(owner, "/v1/inventory/stock:receive", "inventory.stock.receive.v1", {
    outlet_id: w.outlets[2], source: "opening", at: new Date().toISOString(),
    lines: [{ movement_id: uuidv7(), ingredient_id: ids.paneer, batch_id: null, batch: null, qty_milli: 2000000, unit: "g", unit_cost: { amount_minor: 1, currency: "INR" } }] }));
  const key = await storefrontKey(env, w, ids.pickup);
  guest = { key };
  shop = { key, sub: SUB, email: "shopper.int@example.test" };
});
afterAll(async () => env?.stop());

const envelope = (type: string, payload: unknown) => ({ command_id: uuidv7(), idempotency_key: `sf-${uuidv7()}`, type, payload });
function order(rolls: number, o: { coupons?: string[]; points?: number } = {}) {
  return envelope("orders.place.v1", {
    order_id: uuidv7(), outlet_id: w.outlets[2], channel_id: ids.pickup, brand_id: null, device_id: null, kind: "pickup", table_ref: null,
    pickup_window_id: null, promised_at: null, external_ref: null, coupon_codes: o.coupons ?? [], loyalty_redeem_points: o.points ?? 0,
    preview_total_minor: null, client_totals: null,
    lines: [{ line_id: uuidv7(), item_id: ids.roll, variant_id: null, option_ids: [], qty_milli: rolls * 1000, barcode: null, note: null }],
  });
}
const status = async (id: string) => (await env.one<{ status: string }>(`SELECT status FROM core."order" WHERE id = $1`, [id])).status;
async function cook(orderId: string) {
  const t = (await env.rows<{ id: string }>(`SELECT id FROM core.kitchen_ticket WHERE order_id = $1`, [orderId]));
  expect(t).toHaveLength(1);
  for (const [from, to] of [["queued", "preparing"], ["preparing", "ready"], ["ready", "done"]]) {
    expect((await env.cmd(owner, `/v1/kitchen/tickets/${t[0]!.id}:advance`, "kitchen.ticket.advance.v1", { ticket_id: t[0]!.id, from_status: from, to_status: to })).status).toBe(200);
  }
  expect(await status(orderId)).toBe("completed");
}
const totalOf = async (id: string) => Number((await env.one<{ t: string }>(`SELECT total_minor::text AS t FROM core."order" WHERE id = $1`, [id])).t);
const onHand = async () => Number((await env.one<{ n: string }>(`SELECT sum(qty_milli)::text AS n FROM core.stock_movement WHERE ingredient_id = $1`, [ids.paneer])).n);
const points = (customer: string) => env.rows<{ kind: string; points: number; rule: string | null }>(
  `SELECT kind, points::int AS points, origin ->> 'rule_id' AS rule FROM core.loyalty_entry WHERE customer_id = $1 ORDER BY seq`, [customer]);

describe("storefront guest + signed-in checkout → kitchen → completion; cancel → reversals", () => {
  let customer = "";
  const orders = { G1: "", S1: "", S2: "", S3: "", S4: "" };

  it("G1 guest checkout → kitchen → completed: 21,000, the sale posted, no points (a guest has no account)", async () => {
    const g = order(1);
    const r = await env.http("POST", "/v1/storefront/orders", guest, {
      order: g, guest: envelope("storefront.guest.create.v1", { name: "Synthetic Guest", phone: null, email: null, consent: { marketing: false, at: new Date().toISOString() } }), contact: null });
    expect([r.status, r.body.total_minor, typeof r.body.guest_access_token]).toEqual([201, 21000, "string"]);
    orders.G1 = r.body.order_id;
    await cook(orders.G1);
    expect(await postingsOf(env, orders.G1)).toEqual({ "finance.post_order": { 1110: 21000, 2100: -1000, 4000: -20000 } });
    expect(await env.rows(`SELECT 1 FROM core.loyalty_entry WHERE order_id = $1`, [orders.G1])).toEqual([]);
  });

  it("S1 first sign-in checkout with ONCE10 → 37,800 → kitchen → completed → earn 36 under customers.loyalty_earn", async () => {
    const r = await env.http("POST", "/v1/storefront/orders", shop, { order: order(2, { coupons: ["ONCE10"] }), guest: null, contact: { name: "Synthetic Shopper", phone: null } });
    expect([r.status, r.body.total_minor, r.body.guest_access_token]).toEqual([201, 37800, null]);
    orders.S1 = r.body.order_id;
    customer = (await env.one<{ c: string }>(`SELECT customer_id::text AS c FROM core."order" WHERE id = $1`, [orders.S1])).c;
    await cook(orders.S1);
    expect(await postingsOf(env, orders.S1)).toEqual({ "finance.post_order": { 1110: 37800, 2100: -1800, 4000: -36000 } });
    expect(await points(customer)).toEqual([{ kind: "earn", points: 36, rule: "customers.loyalty_earn" }]);
  });

  it("S2: ONCE10 again → 409 coupon_cap_reached (nothing written); without it, 30 points redeemed; the customer cancels → stock and points come back", async () => {
    const before = await onHand();
    const capped = await env.http("POST", "/v1/storefront/orders", shop, { order: order(1, { coupons: ["ONCE10"] }), guest: null, contact: null });
    expect([capped.status, capped.body.error?.reason_code]).toEqual([409, "coupon_cap_reached"]);
    expect(await onHand()).toBe(before);
    const r = await env.http("POST", "/v1/storefront/orders", shop, { order: order(1, { points: 30 }), guest: null, contact: null });
    expect([r.status, r.body.total_minor]).toEqual([201, 21000]);
    orders.S2 = r.body.order_id;
    expect(await env.one(`SELECT pricing_snapshot -> 'loyalty' ->> 'value_minor' AS v FROM core."order" WHERE id = $1`, [orders.S2])).toEqual({ v: "300" });
    expect(await onHand()).toBe(before - 100000);
    const cancel = await env.http("POST", `/v1/storefront/orders/${orders.S2}:cancel`, shop, envelope("storefront.order.cancel.v1", { order_id: orders.S2, reason: null }));
    expect(cancel.status).toBe(200);
    expect(await status(orders.S2)).toBe("cancelled");
    expect(await onHand()).toBe(before);
    expect(await env.rows(`SELECT kind, qty_milli::int AS qty, origin ->> 'rule_id' AS rule FROM core.stock_movement WHERE ref_id = $1 ORDER BY qty_milli`, [orders.S2]))
      .toEqual([{ kind: "sale_consumption", qty: -100000, rule: "inventory.consume_order" }, { kind: "sale_return", qty: 100000, rule: "inventory.reverse_order_consumption" }]);
    expect(await points(customer)).toEqual([
      { kind: "earn", points: 36, rule: "customers.loyalty_earn" }, { kind: "redeem", points: -30, rule: null }, { kind: "reverse", points: 30, rule: "customers.loyalty_reverse" },
    ]);
    expect(await postingsOf(env, orders.S2)).toEqual({});
  });

  it("S3 with SOLO20 (cap 1) → cancelled; its use stays recorded but no longer counts: S4 with SOLO20 is accepted at 16,800", async () => {
    const r3 = await env.http("POST", "/v1/storefront/orders", shop, { order: order(1, { coupons: ["SOLO20"] }), guest: null, contact: null });
    expect([r3.status, r3.body.total_minor]).toEqual([201, 16800]);
    orders.S3 = r3.body.order_id;
    // Refusal before the cancel: SOLO20's one use is taken.
    const blocked = await env.http("POST", "/v1/storefront/orders", shop, { order: order(1, { coupons: ["SOLO20"] }), guest: null, contact: null });
    expect([blocked.status, blocked.body.error?.reason_code]).toEqual([409, "coupon_cap_reached"]);
    expect((await env.http("POST", `/v1/storefront/orders/${orders.S3}:cancel`, shop, envelope("storefront.order.cancel.v1", { order_id: orders.S3, reason: null }))).status).toBe(200);
    const r4 = await env.http("POST", "/v1/storefront/orders", shop, { order: order(1, { coupons: ["SOLO20"] }), guest: null, contact: null });
    expect([r4.status, r4.body.total_minor]).toEqual([201, 16800]);
    orders.S4 = r4.body.order_id;
    expect(Number((await env.one<{ n: string }>(`SELECT count(*) AS n FROM core.coupon_use u JOIN core.coupon k ON k.tenant_id = u.tenant_id AND k.id = u.coupon_id WHERE k.code = 'SOLO20' AND u.tenant_id = $1`, [w.tenant])).n)).toBe(2);
    expect(await onHand()).toBe(1600000);
    expect([await totalOf(orders.S3), await status(orders.S3), await status(orders.S4)]).toEqual([16800, "cancelled", "placed"]);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: setup — channel, ingredient, item, recipe version + line, price, 2 coupons, the receipt movement.
    // Orders G1 S1 S2 S3 S4: 5 orders, 5 lines; status events: G1 + S1 5 each, S2 + S3 2 each (placed, cancelled),
    // S4 1 = 15; customers: the guest + the signed-in profile; coupon uses ONCE10 1 + SOLO20 2 = 3;
    // movements 1 + 5 consumptions + 2 returns = 8; loyalty: earn, redeem, reverse = 3; entries G1 + S1 = 2, postings 6.
    expect(scan.inserted).toEqual({
      channel: 1, ingredient: 1, item: 1, recipe_version: 1, recipe_line: 1, price: 1, coupon: 2,
      order: 5, order_line: 5, order_event: 15, customer: 2, coupon_use: 3, stock_movement: 8, loyalty_entry: 3, journal_entry: 2, posting: 6,
    });
    // Hand: G1 and S1 4 status updates each (see the counter flow), S2 and S3 one (cancelled) each, and S2's placement
    // writes the redemption into its own pricing snapshot once (orders place.ts redeem) — audited by the placement.
    expect(scan.updated).toEqual({ order: 11 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
