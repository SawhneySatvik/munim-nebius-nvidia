// Flow 6 — an approved price draft takes over the open price (W2-R1) and the next order for that day uses it.
// Intel's path is played by fixture plumbing (no intel route is mounted in W2): a test-only snapshot template in this
// clone, a snapshot minted as munim_svc under an intel run, and a draft whose amount is a Ref to that snapshot's cell
// (rule 19) — then a person decides over HTTP. Staff cannot approve a price (403); the owner can.
// Hand: Masala chai, counter, outlet 3, restaurant_5. Open row 3,000 from 2026-10-01. The draft: 3,500 (the snapshot
// cell) from TOMORROW (a drafted price starts after today). Approval closes the open row at tomorrow (valid_to =
// tomorrow, audited before/after) and writes the new row under the decision.
//   GST is two components, each rounded half-up: an order now 3,000 + 75 + 75 = 3,150; an order promised tomorrow 13:00
//   (priced at its promised time) 3,500 + 87.5 → 88 + 88 = 3,676.
import { snapRef } from "../../packages/contracts/src/index.ts";
import { businessDate } from "../../packages/core-domain/tz/index.ts";
import { runTemplate } from "../../services/core-api/src/modules/approvals/snapshots.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, startEnv, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let staff: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { chai: uuidv7(), price: uuidv7(), newPrice: uuidv7(), draft: uuidv7(), now: uuidv7(), tomorrow: uuidv7() };
const TOMORROW = (() => {
  const d = new Date(`${businessDate(new Date(), "Asia/Kolkata", "04:00")}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner, staff } = await world(env, "IN"));
  // Staff of outlet 1 only: give them outlet 3 too, so the refusal below is about the role, not the outlet.
  await env.db.withContext("munim_core", { tenant_id: w.tenant, outlet_ids: "*", role: "owner", member_id: w.owner, command_type: "tenancy.member.invite.v1" }, (c) =>
    c.query(`UPDATE core.membership SET outlet_ids = $2 WHERE member_id = $1`, [w.staff, [w.outlets[0], w.outlets[2]]]));
  await env.db.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) VALUES ('test.int_price', 1, $1, '{"type":"object"}', $2, 'manager')`, [
    `SELECT i.id AS item_id, 3500::bigint AS suggested_minor FROM core.item i WHERE i.id = :item_id::uuid`,
    JSON.stringify([{ name: "item_id", type: "uuid" }, { name: "suggested_minor", type: "integer", numeric_source: "core.price.amount_minor" }]),
  ]);
  mark = await watermark(env, w.tenant);
});
afterAll(async () => env?.stop());

const place = (id: string, promised_at: string | null) => env.cmd(owner, "/v1/orders", "orders.place.v1", {
  order_id: id, outlet_id: w.outlets[2], channel_id: w.channel, brand_id: null, device_id: null, kind: "takeaway", table_ref: null, pickup_window_id: null,
  promised_at, external_ref: null, coupon_codes: [], loyalty_redeem_points: 0, preview_total_minor: null, client_totals: null,
  lines: [{ line_id: uuidv7(), item_id: ids.chai, variant_id: null, option_ids: [], qty_milli: 1000, barcode: null, note: null }] });
const totalOf = async (id: string) => Number((await env.one<{ t: string }>(`SELECT total_minor::text AS t FROM core."order" WHERE id = $1`, [id])).t);

describe("approved price draft (W2-R1 take-over) → the next order uses the new price", () => {
  it("the open price; a draft citing a snapshot cell; staff 403, owner 200; the open row closes at tomorrow; today 3,150, tomorrow 3,676", async () => {
    expect((await env.cmd(owner, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
      item_id: ids.chai, kind: "dish", name_key: "menu.int_masala_chai", category: "drinks", brand_id: null, barcode: null, mrp_minor: null, currency: null,
      active: true, variants: [], option_groups: [], stock_ingredient_id: null })).status).toBe(200);
    expect((await env.cmd(owner, "/v1/catalogue/prices", "catalogue.price.set.v1", {
      price_id: ids.price, item_id: ids.chai, variant_id: null, outlet_id: w.outlets[2], channel_kind: "counter", amount_minor: 3000, currency: "INR",
      tax_class: "restaurant_5", valid_from: "2026-10-01", valid_to: null })).status).toBe(200);

    // Intel's side (fixture): a run, the snapshot it mints, the draft citing the cell.
    const snapshot = uuidv7();
    await env.db.withContext("munim_svc", { tenant_id: w.tenant, outlet_ids: "*" }, async (c) => {
      const run = uuidv7();
      await c.query(`INSERT INTO intel.run (tenant_id, id, trigger, actor, outlet_scope, expires_at) VALUES ($1, $2, 'event', 'watcher:catalogue', '{*}', now() + interval '1 hour')`, [w.tenant, run]);
      const { rows } = await runTemplate(c, "test.int_price", 1, { item_id: ids.chai });
      await c.query(`INSERT INTO evidence.snapshot (tenant_id, id, template_id, template_version, params, run_id, outlet_scope, rows, row_count, sha256)
                     VALUES ($1, $2, 'test.int_price', 1, $3, $4, '{*}', $5, $6, repeat('0', 64))`, [w.tenant, snapshot, { item_id: ids.chai }, run, JSON.stringify(rows), rows.length]);
      const ref = snapRef(snapshot, 0, "suggested_minor");
      await c.query(`INSERT INTO core.draft (tenant_id, id, outlet_ids, source, command_type, command_payload, based_on) VALUES ($1, $2, $3, 'intel:catalogue', 'catalogue.price.set.v1', $4, $5)`,
        [w.tenant, ids.draft, [w.outlets[2]], { price_id: ids.newPrice, item_id: ids.chai, variant_id: null, outlet_id: w.outlets[2], channel_kind: "counter",
          amount_minor: ref, currency: "INR", tax_class: "restaurant_5", valid_from: TOMORROW, valid_to: null }, JSON.stringify([ref])]);
    });

    const approve = (who: Caller) => env.http("POST", `/v1/drafts/${ids.draft}:approve`, who, {
      command_id: uuidv7(), idempotency_key: `price-${uuidv7()}`, type: "drafts.approve.v1",
      payload: { draft_id: ids.draft, command_type: "catalogue.price.set.v1", edited_payload: null, reason: null } });
    const denied = await approve(staff);
    expect([denied.status, denied.body.error.reason_code]).toEqual([403, "authority_denied"]);
    expect(await env.rows(`SELECT 1 FROM core.price WHERE id = $1`, [ids.newPrice])).toEqual([]);
    expect((await approve(owner)).status).toBe(200);

    expect(await env.rows(`SELECT id::text, amount_minor::int AS amount, valid_from::text AS vf, valid_to::text AS vt, origin ->> 'kind' AS origin FROM core.price WHERE item_id = $1 ORDER BY valid_from`, [ids.chai]))
      .toEqual([
        { id: ids.price, amount: 3000, vf: "2026-10-01", vt: TOMORROW, origin: "command" },
        { id: ids.newPrice, amount: 3500, vf: TOMORROW, vt: null, origin: "decision" },
      ]);
    expect(await env.one(`SELECT before ->> 'valid_to' AS before, after ->> 'valid_to' AS after, decision_id IS NOT NULL AS decided FROM core.audit_log WHERE entity = 'core.price' AND entity_id = $1 AND before IS NOT NULL`, [ids.price]))
      .toEqual({ before: null, after: TOMORROW, decided: true });

    expect((await place(ids.now, null)).status).toBe(201);
    expect(await totalOf(ids.now)).toBe(3150);
    expect((await place(ids.tomorrow, `${TOMORROW}T13:00:00+05:30`)).status).toBe(201);
    expect(await totalOf(ids.tomorrow)).toBe(3676);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: item, the open price + the drafted one, two orders with a line and a placed event each.
    expect(scan.inserted).toEqual({ item: 1, price: 2, order: 2, order_line: 2, order_event: 2 });
    // Hand: the take-over closing the open price.
    expect(scan.updated).toEqual({ price: 1 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
