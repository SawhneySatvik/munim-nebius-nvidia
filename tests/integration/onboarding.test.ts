// Flow 5 — a person with a verified sign-in and no tenant: /v1/onboarding → their first item and price → the first
// counter sale on the onboarded POS (gapless invoice series POS1) → paid → completed through the POS status routes
// (orders.order.accept.v1 / .advance.v1) → the receipt the pack prints. Once for an IN restaurant, once for an AU
// shop. The clause-1 scan covers the whole new tenant (it did not exist before the flow).
// Accounts: the pack chart (IN 22, AU 23 — W2 fix cycle 1 added 6500 "Loyalty points redeemed" to both, R2-S1-4).
// R1-m6: the tenant id is minted by core (the payload's tenant_id is ignored), so onboarding cannot tell anyone that
// a tenant id exists: a second person sending the first business's id gets their own new tenant, the same 201 shape.
// Hand, IN (restaurant_5 = 5% on top, CGST 2.5% + SGST 2.5%): Filter coffee 4,000 → tax 100 + 100 = 200, total 4,200.
//   Cash 5,000 (₹1 step; 4,200 is whole rupees) → amount 4,200, change 800. Receipt "Tax Invoice" POS1-1, GSTIN + FSSAI.
//   post_tender Dr 1000 cash 4,200 · Cr 1110 4,200; post_order Dr 1110 4,200 · Cr 4000 4,000 · Cr 2100 200.
// Hand, AU (gst_10 = 10% included): Coffee beans 250 g at A$40.00 → tax 4,000 / 11 = 363.6 → 364, net 3,636.
//   Card 4,000. Receipt "Tax invoice" POS1-1 with the ABN, GST 1,000 bp 364. The SKU draws 1 pc of its stock record.
//   post_tender Dr 1010 bank 4,000 · Cr 1110 4,000; post_order Dr 1110 4,000 · Cr 4000 3,636 · Cr 2100 364.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, postingsOf, startEnv, uuidv7 } from "./harness.ts";

let env: Env;
beforeAll(async () => {
  env = await startEnv();
});
afterAll(async () => env?.stop());

const CASES = [
  {
    country: "IN", kind: "restaurant", currency: "INR", taxIds: { GSTIN: "29ABCDE1234F1Z5", FSSAI: "12345678901234" }, taxClass: "restaurant_5", sku: false,
    tender: { method: "cash", tendered_minor: 5000, amount_minor: null, ref: null }, paid: { amount: 4200, change: 800 },
    order: { sub: 4000, tax: 200, total: 4200 },
    receipt: { kind: "tax_invoice", title: "Tax Invoice", number: "POS1-1", net_minor: 4000, tax_minor: 200, total_minor: 4200 },
    taxIdCodes: ["GSTIN", "FSSAI"], components: [{ code: "CGST", rate_bp: 250, amount_minor: 100 }, { code: "SGST", rate_bp: 250, amount_minor: 100 }],
    tenderPost: { 1000: 4200, 1110: -4200 }, orderPost: { 1110: 4200, 2100: -200, 4000: -4000 },
    inserted: { tenant: 1, member: 1, membership: 1, business_policy: 1, outlet: 1, outlet_calendar: 7, brand: 1, channel: 6, account: 22,
      item: 1, price: 1, order: 1, order_line: 1, order_event: 5, tender: 1, journal_entry: 2, posting: 5 },
  },
  {
    country: "AU", kind: "shop", currency: "AUD", taxIds: { ABN: "51824753556" }, taxClass: "gst_10", sku: true,
    tender: { method: "card", tendered_minor: null, amount_minor: 4000, ref: "CARD-SYN-1" }, paid: { amount: 4000, change: null },
    order: { sub: 3636, tax: 364, total: 4000 },
    receipt: { kind: "tax_invoice", title: "Tax invoice", number: "POS1-1", net_minor: 3636, tax_minor: 364, total_minor: 4000 },
    taxIdCodes: ["ABN"], components: [{ code: "GST", rate_bp: 1000, amount_minor: 364 }],
    tenderPost: { 1010: 4000, 1110: -4000 }, orderPost: { 1110: 4000, 2100: -364, 4000: -3636 },
    inserted: { tenant: 1, member: 1, membership: 1, business_policy: 1, outlet: 1, outlet_calendar: 7, brand: 1, channel: 3, account: 23,
      ingredient: 1, item: 1, price: 1, stock_movement: 2, order: 1, order_line: 1, order_event: 5, tender: 1, journal_entry: 2, posting: 5 },
  },
] as const;

describe.each(CASES)("/v1/onboarding → item + price → first counter sale → receipt ($country $kind)", (x) => {
  const ids = { tenant: uuidv7(), owner: uuidv7(), outlet: uuidv7(), item: uuidv7(), stock: uuidv7(), order: uuidv7(), tender: uuidv7() };
  const sub = `founder-${x.country}-${uuidv7()}`;
  const email = `${sub}@example.test`;
  const me: Caller = { sub, email };

  it("an unverified email is refused (422, no tenant); the verified one onboards; the owner sells, takes payment, completes and prints", async () => {
    // The tenant does not exist yet (its id is core's): the mark is empty and takes the minted id below.
    const mark = await watermark(env, ids.tenant);
    const envelope = { command_id: uuidv7(), idempotency_key: `onb-${ids.tenant}`, type: "tenancy.onboard.v1", payload: {
      tenant_id: ids.tenant, owner_member_id: ids.owner, outlet_id: ids.outlet, owner_name: "Synthetic Founder", business_name: `Synthetic ${x.kind}`,
      kind: x.kind, country_code: x.country, outlet: { name: "Main outlet", address: "1 Synthetic Street", tax_ids: x.taxIds } } };
    const onboard = (verified: boolean) => env.http("POST", "/v1/onboarding", { sub, email, verified }, envelope);
    expect((await onboard(false)).status).toBe(422);
    expect(await env.rows(`SELECT 1 FROM core.tenant t JOIN core.member m ON m.tenant_id = t.tenant_id WHERE m.idp_sub = $1`, [sub])).toEqual([]);
    const done = await onboard(true);
    expect(done.status).toBe(201);
    const tenant = done.body.entity_id as string;
    // Core's id, not the payload's; the payload's id names no tenant.
    expect(tenant).not.toBe(ids.tenant);
    expect(await env.rows(`SELECT 1 FROM core.tenant WHERE tenant_id = $1`, [ids.tenant])).toEqual([]);
    expect(await env.rows(`SELECT m.id::text AS owner FROM core.member m WHERE m.tenant_id = $1 AND m.idp_sub = $2`, [tenant, sub])).toEqual([{ owner: ids.owner }]);
    // The same envelope again replays onto the same tenant (idempotency by envelope, X-Munim-Replayed).
    const again = await onboard(true);
    expect([again.status, again.body.entity_id, again.headers.get("X-Munim-Replayed")]).toEqual([201, tenant, "true"]);
    mark.tenant = tenant;
    me.tenant = tenant;

    const counter = (await env.http("GET", "/v1/channels", me)).body.channels.find((c: { kind: string }) => c.kind === "counter").id;
    const pos = (await env.http("GET", "/v1/devices", me)).body.devices.find((d: { kind: string }) => d.kind === "pos") as { id: string; invoice_series: string };
    expect(pos.invoice_series).toBe("POS1");
    if (x.sku) {
      expect((await env.cmd(me, "/v1/inventory/ingredients", "inventory.ingredient.upsert.v1",
        { ingredient_id: ids.stock, name: "Coffee beans 250 g (synthetic)", base_unit: "pc", shelf_life_days: null, tracked_by_batch: false })).status).toBe(200);
      expect((await env.cmd(me, "/v1/inventory/stock:receive", "inventory.stock.receive.v1", { outlet_id: ids.outlet, source: "opening", at: new Date().toISOString(),
        lines: [{ movement_id: uuidv7(), ingredient_id: ids.stock, batch_id: null, batch: null, qty_milli: 10000, unit: "pc", unit_cost: { amount_minor: 2000, currency: x.currency } }] })).status).toBe(200);
    }
    expect((await env.cmd(me, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
      item_id: ids.item, kind: x.sku ? "sku" : "dish", name_key: x.sku ? "shop.int_beans_250g" : "menu.int_filter_coffee", category: "drinks", brand_id: null,
      barcode: null, mrp_minor: null, currency: null, active: true, variants: [], option_groups: [], stock_ingredient_id: x.sku ? ids.stock : null })).status).toBe(200);
    expect((await env.cmd(me, "/v1/catalogue/prices", "catalogue.price.set.v1", {
      price_id: uuidv7(), item_id: ids.item, variant_id: null, outlet_id: ids.outlet, channel_kind: "counter", amount_minor: 4000, currency: x.currency,
      tax_class: x.taxClass, valid_from: "2026-10-01", valid_to: null })).status).toBe(200);

    expect((await env.cmd(me, "/v1/orders", "orders.place.v1", {
      order_id: ids.order, outlet_id: ids.outlet, channel_id: counter, brand_id: null, device_id: pos.id, kind: "takeaway", table_ref: null, pickup_window_id: null,
      promised_at: null, external_ref: null, coupon_codes: [], loyalty_redeem_points: 0, preview_total_minor: null, client_totals: null,
      lines: [{ line_id: uuidv7(), item_id: ids.item, variant_id: null, option_ids: [], qty_milli: 1000, barcode: null, note: null }] })).status).toBe(201);
    expect(await env.one(`SELECT subtotal_minor::int AS sub, tax_minor::int AS tax, total_minor::int AS total, invoice_no::int AS no FROM core."order" WHERE id = $1`, [ids.order]))
      .toEqual({ ...x.order, no: 1 });
    expect((await env.cmd(me, `/v1/orders/${ids.order}/tenders`, "orders.tender.record.v1", { tender_id: ids.tender, order_id: ids.order, currency: x.currency, ...x.tender })).status).toBe(200);
    expect(await env.one(`SELECT amount_minor::int AS amount, change_minor::int AS change FROM core.tender WHERE id = $1`, [ids.tender])).toEqual(x.paid);
    expect((await env.cmd(me, `/v1/orders/${ids.order}:accept`, "orders.order.accept.v1", { order_id: ids.order })).status).toBe(200);
    for (const [from_status, to_status] of [["accepted", "preparing"], ["preparing", "ready"], ["ready", "completed"]]) {
      expect((await env.cmd(me, `/v1/orders/${ids.order}:advance`, "orders.order.advance.v1", { order_id: ids.order, from_status, to_status, reason_code: null })).status).toBe(200);
    }

    const r = await env.http("GET", `/v1/orders/${ids.order}/receipt`, me);
    expect(r.status).toBe(200);
    expect({ kind: r.body.kind, title: r.body.title, number: r.body.number, net_minor: r.body.net_minor, tax_minor: r.body.tax_minor, total_minor: r.body.total_minor })
      .toEqual(x.receipt);
    expect(r.body.tax_ids.map((t: { code: string }) => t.code)).toEqual(x.taxIdCodes);
    expect(r.body.components).toEqual(x.components);
    expect(await postingsOf(env, ids.tender)).toEqual({ "finance.post_tender": x.tenderPost });
    expect(await postingsOf(env, ids.order)).toEqual({ "finance.post_order": x.orderPost });
    if (x.sku) {
      expect(await env.rows(`SELECT qty_milli::int AS qty, origin ->> 'rule_id' AS rule FROM core.stock_movement WHERE ref_id = $1`, [ids.order]))
        .toEqual([{ qty: -1000, rule: "inventory.consume_sku" }]);
    }

    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    expect(scan.inserted).toEqual(x.inserted);
    // Hand: one status update per POS command (accept, preparing, ready, completed).
    expect(scan.updated).toEqual({ order: 4 });
    const v = await chain(env, tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});

describe("R1-m6: onboarding is not a tenant-existence oracle", () => {
  it("a second person sending an existing tenant's id gets 201 and a tenant of their own; the existing tenant is untouched", async () => {
    const first = { sub: `oracle-a-${uuidv7()}`, email: "oracle.a@example.test" };
    const body = (tenant_id: string) => ({ tenant_id, owner_member_id: uuidv7(), outlet_id: uuidv7(), owner_name: "Synthetic Founder", business_name: "Synthetic oracle",
      kind: "restaurant", country_code: "IN", outlet: { name: "Main outlet", address: "1 Synthetic Street", tax_ids: {} } });
    const a = await env.cmd(first, "/v1/onboarding", "tenancy.onboard.v1", body(uuidv7()));
    expect(a.status).toBe(201);
    const existing = a.body.entity_id as string;
    const members = async (t: string) => (await env.rows<{ sub: string }>(`SELECT idp_sub AS sub FROM core.member WHERE tenant_id = $1 ORDER BY created_at`, [t])).map((r) => r.sub);
    expect(await members(existing)).toEqual([first.sub]);
    const second = { sub: `oracle-b-${uuidv7()}`, email: "oracle.b@example.test" };
    const fresh = uuidv7();
    const [b, c] = [await env.cmd(second, "/v1/onboarding", "tenancy.onboard.v1", body(existing)), await env.cmd(second, "/v1/onboarding", "tenancy.onboard.v1", body(fresh))];
    // Same status and the same body shape whether the sent id exists or not; neither lands on the sent id.
    expect([b.status, c.status]).toEqual([201, 201]);
    expect([Object.keys(b.body).sort(), Object.keys(c.body).sort()]).toEqual([Object.keys(a.body).sort(), Object.keys(a.body).sort()]);
    expect([b.body.entity_id === existing, c.body.entity_id === fresh, b.body.entity_id === c.body.entity_id]).toEqual([false, false, false]);
    expect(await members(existing)).toEqual([first.sub]);
    expect(await members(b.body.entity_id)).toEqual([second.sub]);
  });
});
