// Flow 1 — a walk-in counter sale (IN): catalogue + opening stock → POS order → kitchen ticket to done → order
// completed → cash tender. Derivations asserted with hand-computed values: recipe consumption at placement
// (inventory.consume_order), the sale's entry on completion (finance.post_order), the tender's entry
// (finance.post_tender). Loyalty: a walk-in counter order has no customer (orders.place.v1 never takes one from a
// payload), so it earns nothing — the earn is gated in the storefront flow. Outlet 3 of the world (no prior sales or
// stock) keeps the numbers clean.
//   Hand: Masala dosa 12,000 (restaurant_5 = 5% GST, exclusive) × 2 = 24,000; tax 2 × 600 = 1,200; total 25,200.
//         Recipe 200 g batter per dosa → −400,000 milli-g; opening stock +5,000,000 → on hand 4,600,000.
//         post_order: Dr 1110 counter clearing 25,200 · Cr 4000 sales 24,000 · Cr 2100 output GST 1,200.
//         Cash 30,000 handed over (₹1 rounding step; 25,200 is whole rupees): amount 25,200, change 4,800, rounding 0.
//         post_tender: Dr 1000 cash 25,200 · Cr 1110 25,200.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, postingsOf, startEnv, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { batter: uuidv7(), dosa: uuidv7(), order: uuidv7(), tender: uuidv7() };

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
});
afterAll(async () => env?.stop());

describe("counter sale → kitchen → completion → stock, postings", () => {
  it("sets up the dish, sells two at the counter, cooks them, takes cash: every derived row as computed by hand", async () => {
    const o3 = w.outlets[2];
    const ok = (r: { status: number; body: unknown }) => expect([r.status, r.body]).toEqual([200, expect.objectContaining({ entity_id: expect.any(String) })]);
    ok(await env.cmd(owner, "/v1/inventory/ingredients", "inventory.ingredient.upsert.v1",
      { ingredient_id: ids.batter, name: "Dosa batter", base_unit: "g", shelf_life_days: null, tracked_by_batch: false }));
    ok(await env.cmd(owner, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
      item_id: ids.dosa, kind: "dish", name_key: "menu.int_masala_dosa", category: "mains", brand_id: null, barcode: null, mrp_minor: null, currency: null,
      active: true, variants: [], option_groups: [], stock_ingredient_id: null }));
    ok(await env.cmd(owner, "/v1/catalogue/recipes", "catalogue.recipe.version.create.v1", {
      recipe_version_id: uuidv7(), item_id: ids.dosa, variant_id: null, version: 1, valid_from: "2026-10-01", valid_to: null, yield_qty_milli: 1000,
      lines: [{ ingredient_id: ids.batter, qty_milli: 200000, unit: "g", waste_pct_bp: 0 }] }));
    ok(await env.cmd(owner, "/v1/catalogue/prices", "catalogue.price.set.v1", {
      price_id: uuidv7(), item_id: ids.dosa, variant_id: null, outlet_id: o3, channel_kind: "counter", amount_minor: 12000, currency: "INR",
      tax_class: "restaurant_5", valid_from: "2026-10-01", valid_to: null }));
    ok(await env.cmd(owner, "/v1/inventory/stock:receive", "inventory.stock.receive.v1", {
      outlet_id: o3, source: "opening", at: new Date().toISOString(),
      lines: [{ movement_id: uuidv7(), ingredient_id: ids.batter, batch_id: null, batch: null, qty_milli: 5000000, unit: "g", unit_cost: { amount_minor: 1, currency: "INR" } }] }));

    const placed = await env.cmd(owner, "/v1/orders", "orders.place.v1", {
      order_id: ids.order, outlet_id: o3, channel_id: w.channel, brand_id: null, device_id: null, kind: "takeaway", table_ref: null, pickup_window_id: null,
      promised_at: null, external_ref: null, coupon_codes: [], loyalty_redeem_points: 0, preview_total_minor: null, client_totals: null,
      lines: [{ line_id: uuidv7(), item_id: ids.dosa, variant_id: null, option_ids: [], qty_milli: 2000, barcode: null, note: null }] });
    expect(placed.status).toBe(201);
    expect(await env.one(`SELECT subtotal_minor::int AS sub, discount_minor::int AS disc, tax_minor::int AS tax, total_minor::int AS total, status FROM core."order" WHERE id = $1`, [ids.order]))
      .toEqual({ sub: 24000, disc: 0, tax: 1200, total: 25200, status: "placed" });
    // Consumption is derived at placement.
    expect(await env.rows(`SELECT kind, qty_milli::int AS qty, unit, origin ->> 'rule_id' AS rule FROM core.stock_movement WHERE ingredient_id = $1 ORDER BY qty_milli`, [ids.batter]))
      .toEqual([{ kind: "sale_consumption", qty: -400000, unit: "g", rule: "inventory.consume_order" }, { kind: "receipt", qty: 5000000, unit: "g", rule: null }]);

    // The kitchen: one ticket (no prep time configured → the default station), queued → preparing → ready → done.
    const tickets = await env.rows<{ id: string; status: string }>(`SELECT id, status FROM core.kitchen_ticket WHERE order_id = $1`, [ids.order]);
    expect(tickets.map((t) => t.status)).toEqual(["queued"]);
    for (const [from, to] of [["queued", "preparing"], ["preparing", "ready"], ["ready", "done"]]) {
      const r = await env.cmd(owner, `/v1/kitchen/tickets/${tickets[0]!.id}:advance`, "kitchen.ticket.advance.v1", { ticket_id: tickets[0]!.id, from_status: from, to_status: to });
      expect([from, r.status]).toEqual([from, 200]);
    }
    expect(await env.rows(`SELECT from_status, to_status FROM core.order_event WHERE order_id = $1 AND kind = 'status' ORDER BY seq`, [ids.order])).toEqual([
      { from_status: null, to_status: "placed" }, { from_status: "placed", to_status: "accepted" }, { from_status: "accepted", to_status: "preparing" },
      { from_status: "preparing", to_status: "ready" }, { from_status: "ready", to_status: "completed" },
    ]);

    const paid = await env.cmd(owner, `/v1/orders/${ids.order}/tenders`, "orders.tender.record.v1",
      { tender_id: ids.tender, order_id: ids.order, method: "cash", tendered_minor: 30000, amount_minor: null, currency: "INR", ref: null });
    expect(paid.status).toBe(200);
    expect(await env.one(`SELECT amount_minor::int AS amount, change_minor::int AS change, rounding_minor::int AS rounding FROM core.tender WHERE id = $1`, [ids.tender]))
      .toEqual({ amount: 25200, change: 4800, rounding: 0 });

    // Derived books, by hand.
    expect(await postingsOf(env, ids.order)).toEqual({ "finance.post_order": { 1110: 25200, 2100: -1200, 4000: -24000 } });
    expect(await postingsOf(env, ids.tender)).toEqual({ "finance.post_tender": { 1000: 25200, 1110: -25200 } });
    expect(await env.rows(`SELECT 1 FROM core.loyalty_entry WHERE order_id = $1`, [ids.order])).toEqual([]);
    expect(Number((await env.one<{ n: string }>(`SELECT sum(qty_milli)::text AS n FROM core.stock_movement WHERE ingredient_id = $1 AND outlet_id = $2`, [ids.batter, o3])).n)).toBe(4600000);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: ingredient, item, recipe version + line, price; receipt + consumption movements; order, line, 5 status
    // events, tender; 2 entries with 3 + 2 postings. Updated: the order's status 4 times — the first ticket move takes
    // it placed → accepted → preparing (2 updates, one transaction), then → ready, then → completed.
    expect(scan.inserted).toEqual({
      ingredient: 1, item: 1, recipe_version: 1, recipe_line: 1, price: 1, stock_movement: 2,
      order: 1, order_line: 1, order_event: 5, tender: 1, journal_entry: 2, posting: 5,
    });
    expect(scan.updated).toEqual({ order: 4 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
