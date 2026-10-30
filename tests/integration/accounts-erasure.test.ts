// Flow 11 — R41 over HTTP: a guest checkout, the same person's verified sign-in merging that guest profile, their own
// order, a reservation and a bulk order taken by staff, then erasure (R1-M1, R1-M4).
// Every free-text field the flow writes carries a sentinel ("zyxq…", the phone +919800012345, the sign-in subject).
// The gate is not a hand list of columns: it searches EVERY row of EVERY tenant table (core, evidence, intel,
// platform — from the catalog) for each sentinel, before and after the erasure.
// Hand: "Synthetic roll" 20,000 on pickup at outlet 3 (restaurant_5): 20,000 + 500 + 500 = 21,000; the guest's order
//   uses coupon GUEST10 (10%): 20,000 − 2,000 = 18,000 + 450 + 450 = 18,900, and the merge moves its coupon use (0016).
//   Before erasure the sentinels sit in exactly: core.customer 2 (the guest, the shopper), core.order_line 2 (one note
//   per order), core.reservation 1, core.bulk_order 1. After: nowhere. Kept: the shopper's 2 orders (21,000 each)
//   (18,900 and 21,000) and their 2 lines, the reservation and the bulk order (rows, amounts, times; names → "[erased]", phones/notes → null).
//   Merge (0015 A10): the guest's 1 order moves to the shopper; the guest profile is merged_into the shopper.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, type Res, startEnv, storefrontKey, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let guest: Caller;
let shop: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { pickup: uuidv7(), roll: uuidv7(), reservation: uuidv7(), bulk: uuidv7() };
const SUB = `zyxq-sub-${uuidv7()}`;
const EMAIL = "zyxq.erasable@example.test";
const PHONE = "+919800012345";
const SENTINELS = ["zyxq", "9800012345", SUB];

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
  const ok = async (p: Promise<Res>) => expect((await p).status).toBe(200);
  await ok(env.cmd(owner, "/v1/channels", "tenancy.channel.create.v1", { channel_id: ids.pickup, name: "Synthetic pickup", kind: "pickup" }));
  await ok(env.cmd(owner, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
    item_id: ids.roll, kind: "dish", name_key: "menu.int_roll_er", category: "rolls", brand_id: null, barcode: null, mrp_minor: null, currency: null,
    active: true, variants: [], option_groups: [], stock_ingredient_id: null }));
  await ok(env.cmd(owner, "/v1/catalogue/prices", "catalogue.price.set.v1", {
    price_id: uuidv7(), item_id: ids.roll, variant_id: null, outlet_id: w.outlets[2], channel_kind: "pickup", amount_minor: 20000, currency: "INR",
    tax_class: "restaurant_5", valid_from: "2026-10-01", valid_to: null }));
  await ok(env.cmd(owner, "/v1/catalogue/coupons", "catalogue.coupon.set.v1", {
    coupon_id: uuidv7(), code: "GUEST10", kind: "percent", value_bp: 1000, value_minor: null, currency: "INR", min_spend_minor: 0, global_cap: null, per_customer_cap: null,
    requires_customer: false, outlet_ids: [], valid_from: "2026-10-01T00:00:00Z", valid_to: null, active: true }));
  const key = await storefrontKey(env, w, ids.pickup);
  guest = { key };
  shop = { key, sub: SUB, email: EMAIL };
});
afterAll(async () => env?.stop());

const envelope = (type: string, payload: unknown) => ({ command_id: uuidv7(), idempotency_key: `er-${uuidv7()}`, type, payload });
const order = (note: string, coupon_codes: string[] = []) => envelope("orders.place.v1", {
  order_id: uuidv7(), outlet_id: w.outlets[2], channel_id: ids.pickup, brand_id: null, device_id: null, kind: "pickup", table_ref: null, pickup_window_id: null,
  promised_at: null, external_ref: null, coupon_codes, loyalty_redeem_points: 0, preview_total_minor: null, client_totals: null,
  lines: [{ line_id: uuidv7(), item_id: ids.roll, variant_id: null, option_ids: [], qty_milli: 1000, barcode: null, note }] });

/** Rows per table (schema.table) of this tenant whose JSON text contains any sentinel — every tenant table, from the catalog. */
async function sentinelHits(sentinels: string[] = SENTINELS): Promise<Record<string, number>> {
  const tables = await env.rows<{ t: string }>(
    `SELECT s.nspname || '.' || quote_ident(c.relname) AS t FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname IN ('core', 'evidence', 'intel', 'platform') AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) ORDER BY 1`);
  expect(tables.length).toBeGreaterThan(100);
  const out: Record<string, number> = {};
  const patterns = sentinels.map((x) => `%${x}%`);
  for (const { t } of tables) {
    const n = Number((await env.one<{ n: string }>(`SELECT count(*) AS n FROM ${t} x WHERE x.tenant_id = $1 AND to_jsonb(x)::text ILIKE ANY ($2::text[])`, [w.tenant, patterns])).n);
    if (n) out[t.replace(/"/g, "")] = n;
  }
  return out;
}

describe("guest → verified sign-in merge → own order, reservation, bulk order → erasure leaves no personal value", () => {
  let shopper = "";
  const orders: string[] = [];

  it("the guest checks out; the same person's verified sign-in merges the guest profile and its order", async () => {
    const g = order("zyxq guest line: no onions", ["GUEST10"]);
    const r = await env.http("POST", "/v1/storefront/orders", guest, {
      order: g, guest: envelope("storefront.guest.create.v1", { name: "Zyxq Guestname", phone: PHONE, email: EMAIL, consent: { marketing: false, at: new Date().toISOString() } }),
      contact: null });
    expect([r.status, r.body.total_minor]).toEqual([201, 18900]);
    orders.push(r.body.order_id);
    const guestId = (await env.one<{ c: string }>(`SELECT customer_id::text AS c FROM core."order" WHERE id = $1`, [orders[0]])).c;

    const link = await env.http("POST", "/v1/account:link", shop, envelope("customers.account.link.v1", { name: "Zyxq Shopper", phone: PHONE }));
    expect(link.status).toBe(200);
    shopper = link.body.entity_id;
    expect(await env.one(`SELECT customer_id::text AS c FROM core."order" WHERE id = $1`, [orders[0]])).toEqual({ c: shopper });
    expect(await env.one(`SELECT merged_into::text AS m FROM core.customer WHERE id = $1`, [guestId])).toEqual({ m: shopper });
    expect(await env.rows(`SELECT customer_id::text AS c, discount_minor::int AS d FROM core.coupon_use WHERE order_id = $1`, [orders[0]])).toEqual([{ c: shopper, d: 2000 }]);
    // Each moved row audited by the link: the order, its coupon use, the guest profile.
    expect((await env.rows<{ e: string }>(`SELECT entity AS e FROM core.audit_log WHERE tenant_id = $1 AND action = 'customers.account.link.v1' AND before IS NOT NULL ORDER BY entity`, [w.tenant]))
      .map((a) => a.e)).toEqual(["core.coupon_use", "core.customer", "core.order"]);
  });

  it("the shopper orders with a note; staff take a reservation and a bulk order for them; the sentinels are where the flow put them", async () => {
    const r = await env.http("POST", "/v1/storefront/orders", shop, { order: order("zyxq shopper line: extra chutney"), guest: null, contact: null });
    expect([r.status, r.body.total_minor]).toEqual([201, 21000]);
    orders.push(r.body.order_id);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect((await env.cmd(owner, "/v1/reservations:upsert", "customers.reservation.upsert.v1", {
      reservation_id: ids.reservation, outlet_id: w.outlets[2], customer_id: shopper, name: "Zyxq Table", phone: PHONE, party_size: 2, starts_at: tomorrow,
      duration_min: 90, table_ref: null, status: "booked", note: "zyxq reservation: window seat" })).status).toBe(200);
    expect((await env.cmd(owner, "/v1/bulk-orders:upsert", "customers.bulk_order.upsert.v1", {
      bulk_order_id: ids.bulk, outlet_id: w.outlets[2], customer_id: shopper, contact_name: "Zyxq Caterer", contact_phone: PHONE,
      deliver_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), headcount: 20, status: "enquiry", quote_minor: null, advance_minor: null, currency: null,
      order_id: null, note: "zyxq bulk: office lunch" })).status).toBe(200);
    // A positive, hand-counted baseline: the search can see every sentinel the flow wrote.
    expect(await sentinelHits()).toEqual({ "core.customer": 2, "core.order_line": 2, "core.reservation": 1, "core.bulk_order": 1 });
  });

  it("erasure: no sentinel left in any tenant table; orders, lines, reservation and bulk order rows kept with their amounts", async () => {
    const r = await env.http("POST", "/v1/account:erase", shop, envelope("customers.erasure.request.v1", { confirm: true }));
    expect(r.status).toBe(200);
    expect(await sentinelHits()).toEqual({});
    expect(await env.rows(`SELECT total_minor::int AS total FROM core."order" WHERE customer_id = $1 ORDER BY id`, [shopper])).toEqual([{ total: 18900 }, { total: 21000 }]);
    expect(await env.rows(`SELECT l.unit_price_minor::int AS unit, l.note FROM core.order_line l WHERE l.order_id = ANY ($1::uuid[]) ORDER BY l.order_id`, [orders]))
      .toEqual([{ unit: 20000, note: null }, { unit: 20000, note: null }]);
    expect(await env.one(`SELECT name, phone, note, party_size, customer_id::text AS c FROM core.reservation WHERE id = $1`, [ids.reservation]))
      .toEqual({ name: "[erased]", phone: null, note: null, party_size: 2, c: shopper });
    expect(await env.one(`SELECT contact_name AS name, contact_phone AS phone, note, headcount, customer_id::text AS c FROM core.bulk_order WHERE id = $1`, [ids.bulk]))
      .toEqual({ name: "[erased]", phone: null, note: null, headcount: 20, c: shopper });
    // Both profiles closed: the shopper's and the guest profile merged into it.
    expect(await env.rows(`SELECT (id = $1) AS me, erased_at IS NOT NULL AS erased, name, phone, email, idp_sub FROM core.customer WHERE id = $1 OR merged_into = $1 ORDER BY 1`, [shopper]))
      .toEqual([{ me: false, erased: true, name: null, phone: null, email: null, idp_sub: null }, { me: true, erased: true, name: null, phone: null, email: null, idp_sub: null }]);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: setup channel, item, price, GUEST10; the guest + the shopper profiles; 2 orders, 2 lines, 2 placed events,
    // the guest's coupon use; the reservation and the bulk order.
    expect(scan.inserted).toEqual({ channel: 1, item: 1, price: 1, coupon: 1, customer: 2, order: 2, order_line: 2, order_event: 2, coupon_use: 1, reservation: 1, bulk_order: 1 });
    // Hand: the merge moves 1 order and its coupon use and marks the guest merged (1); the erasure blanks 2 line notes,
    // the reservation, the bulk order, and closes the guest and the shopper (2) → customer 3.
    expect(scan.updated).toEqual({ order: 1, coupon_use: 1, customer: 3, order_line: 2, reservation: 1, bulk_order: 1 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});

// R41 gap closed by 0017 C1: the guest-TOKEN claim (no verified email, so the verified-email merge never runs) merges the
// emptied guest profile too, so erasing the claimer erases the guest's name, phone and email. Run after the flow above,
// with its own sentinels ("qvwk", PHONE2) and its own watermark.
describe("guest-token claim → erasure reaches the guest profile (R41, 0017 C1)", () => {
  const SUB2 = `qvwk-sub-${uuidv7()}`;
  const SUB3 = `live-sub3-${uuidv7()}`;
  const PHONE2 = "+919811100022";
  const S2 = ["qvwk", "9811100022", SUB2];
  let token = "";
  let guestOrder = "";
  let guestId = "";
  let claimer = "";
  let liveOrder = "";
  let liveToken = "";
  let mark2: Awaited<ReturnType<typeof watermark>>;
  const claimer_ = (guestTok: string): Caller => ({ key: guest.key!, sub: SUB2, guest: guestTok });
  const linkEnv = () => envelope("customers.account.link.v1", { name: "Qvwk Claimer", phone: PHONE2 });
  const counts = async () => ({
    log: Number((await env.one<{ n: string }>(`SELECT count(*) AS n FROM core.command_log WHERE tenant_id = $1`, [w.tenant])).n),
    audit: Number((await env.one<{ n: string }>(`SELECT count(*) AS n FROM core.audit_log WHERE tenant_id = $1`, [w.tenant])).n),
  });

  it("setup: a guest checkout with a coupon (token in hand); a live signed-in customer's order that carries a token", async () => {
    // The live customer's order, given a tracker token as the leaked-link case (superuser plant, before the watermark).
    const live: Caller = { key: guest.key!, sub: SUB3 };
    expect((await env.http("POST", "/v1/account:link", live, envelope("customers.account.link.v1", { name: "Live Customer", phone: null }))).status).toBe(200);
    const lo = await env.http("POST", "/v1/storefront/orders", live, { order: order("live line"), guest: null, contact: null });
    expect([lo.status, lo.body.total_minor, lo.body.guest_access_token]).toEqual([201, 21000, null]);
    liveOrder = lo.body.order_id;
    liveToken = `live-token-${uuidv7()}`;
    const c = await env.db.connect("admin");
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role = replica");
      await c.query(`UPDATE core."order" SET guest_access_hash = sha256($2::bytea) WHERE tenant_id = $1 AND id = $3`, [w.tenant, Buffer.from(liveToken), liveOrder]);
      await c.query("COMMIT");
    } finally { await c.end?.(); }

    mark2 = await watermark(env, w.tenant);
    const r = await env.http("POST", "/v1/storefront/orders", guest, {
      order: order("qvwk guest line: no garlic", ["GUEST10"]),
      guest: envelope("storefront.guest.create.v1", { name: "Qvwk Guestname", phone: PHONE2, email: "qvwk.guest@example.test", consent: { marketing: false, at: new Date().toISOString() } }),
      contact: null });
    expect([r.status, r.body.total_minor, typeof r.body.guest_access_token]).toEqual([201, 18900, "string"]);
    guestOrder = r.body.order_id;
    token = r.body.guest_access_token;
    guestId = (await env.one<{ c: string }>(`SELECT customer_id::text AS c FROM core."order" WHERE id = $1`, [guestOrder])).c;
    expect(await sentinelHits(S2)).toEqual({ "core.customer": 1, "core.order_line": 1 });
  });

  it("a wrong token → 404 and nothing is written; a token on a live signed-in customer's order → 404 and the order stays", async () => {
    const before = await counts();
    expect((await env.http("POST", "/v1/account:link", claimer_(`wrong-token-${uuidv7()}`), linkEnv())).status).toBe(404);
    expect(await counts()).toEqual(before);
    expect((await env.http("POST", "/v1/account:link", claimer_(liveToken), linkEnv())).status).toBe(404);
    expect(await counts()).toEqual(before);
    expect(await env.one(`SELECT (customer_id <> $2) AS moved FROM core."order" WHERE id = $1`, [liveOrder, guestId])).toEqual({ moved: true });
    expect(await env.one(`SELECT count(*)::int AS n FROM core.customer WHERE idp_sub = $1`, [SUB2])).toEqual({ n: 0 });
  });

  it("the right token claims the order, moves its coupon use and merges the guest profile; each moved row is audited", async () => {
    const r = await env.http("POST", "/v1/account:link", claimer_(token), linkEnv());
    expect(r.status).toBe(200);
    claimer = r.body.entity_id;
    expect(await env.one(`SELECT customer_id::text AS c, guest_access_hash IS NULL AS cleared FROM core."order" WHERE id = $1`, [guestOrder])).toEqual({ c: claimer, cleared: true });
    expect(await env.rows(`SELECT customer_id::text AS c, discount_minor::int AS d FROM core.coupon_use WHERE order_id = $1`, [guestOrder])).toEqual([{ c: claimer, d: 2000 }]);
    expect(await env.one(`SELECT merged_into::text AS m FROM core.customer WHERE id = $1`, [guestId])).toEqual({ m: claimer });
    expect((await env.rows<{ e: string }>(
      `SELECT entity AS e FROM core.audit_log WHERE tenant_id = $1 AND action = 'customers.account.link.v1' AND before IS NOT NULL AND entity_id = ANY ($2::text[]) ORDER BY entity`,
      [w.tenant, [guestOrder, guestId, ...(await env.rows<{ id: string }>(`SELECT id::text FROM core.coupon_use WHERE order_id = $1`, [guestOrder])).map((x) => x.id)]]))
      .map((a) => a.e)).toEqual(["core.coupon_use", "core.customer", "core.order"]);
    expect((await env.http("POST", "/v1/account:link", claimer_(token), linkEnv())).status).toBe(404); // the token is spent
  });

  it("erasing the claimer blanks the claimer and the guest profile: name, phone, email, idp_sub null, erased; no sentinel left", async () => {
    const r = await env.http("POST", "/v1/account:erase", { key: guest.key!, sub: SUB2 }, envelope("customers.erasure.request.v1", { confirm: true }));
    expect(r.status).toBe(200);
    expect(await env.rows(`SELECT (id = $1) AS me, erased_at IS NOT NULL AS erased, name, phone, email, idp_sub FROM core.customer WHERE id = $1 OR id = $2 ORDER BY 1`, [claimer, guestId]))
      .toEqual([{ me: false, erased: true, name: null, phone: null, email: null, idp_sub: null }, { me: true, erased: true, name: null, phone: null, email: null, idp_sub: null }]);
    expect(await sentinelHits(S2)).toEqual({});
    expect(await env.one(`SELECT total_minor::int AS total FROM core."order" WHERE id = $1`, [guestOrder])).toEqual({ total: 18900 });
  });

  it("clause 1 over the leg (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark2);
    expect(scan.bad).toEqual([]);
    // Hand: the guest profile and the claimer's profile (2), the guest's order with its line, placed event and coupon use.
    expect(scan.inserted).toEqual({ customer: 2, order: 1, order_line: 1, order_event: 1, coupon_use: 1 });
    // Hand: the claim moves the order and its coupon use and merges the guest (customer 1); the erasure blanks the line
    // note and closes the claimer and the guest (customer 2 more → 3).
    expect(scan.updated).toEqual({ order: 1, coupon_use: 1, customer: 3, order_line: 1 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
