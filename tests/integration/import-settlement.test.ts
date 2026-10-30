// Flow 4 — an aggregator payout statement (Swiggy-shaped, synthetic): upload → the core-worker parse job (the same
// blob store the API was composed with) → preview → the owner approves the import draft → settlement + lines under
// the decision → finance.post_settlement → finance.reconcile_settlement breaks. Nothing is written to the books
// before the approval (R28). Terms on file: commission 22%, ads NOT opted in.
// The file (services/core-worker/test/fixtures/imports/synthetic_swiggy_1.csv), in paise:
//   SYN-SWG-1001 order  gross 50,000   commission 11,000                    net 39,000
//   SYN-SWG-1002 order  gross 120,050  commission 26,411                    net 93,639
//   —            ads                                    ad fee 15,000      net −15,000
//   SYN-SWG-1003 order  gross 30,000   commission 6,600  promo share 3,000 net 20,400      Σ net 138,039 (= its TOTAL row)
// Hand: post_settlement (operator collects GST, Sec 9(5)): Dr 1010 bank 138,039 · Dr 6000 commission 44,011 ·
//       Dr 6010 promotions 18,000 (15,000 ads + 3,000 promo share) · Cr 1100 aggregator receivable 200,050.
//   Breaks: the ad fee with no ads consent → unapproved_deduction 15,000. Our order SYN-SWG-1003 (Veg biryani 28,000
//   + 5% = 29,400). The operator collects and remits that order's GST (Sec 9(5)), so it should have paid 29,400 − the
//   order's own tax 1,400 (R2-S2-9: not the file's) − 22% × 30,000 (6,600) = 21,400; it paid 20,400 → short_payout
//   1,000 (≥ the IN pack's line threshold max(100, ⌈21,400 × 0.5%⌉ = 107)). Orders 1001/1002 are not ours: no match.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePendingImports } from "../../services/core-worker/src/imports/index.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, postingsOf, startEnv, uuidv7, type World, world } from "./harness.ts";

const FILE = join(import.meta.dirname, "../../services/core-worker/test/fixtures/imports/synthetic_swiggy_1.csv");

let env: Env;
let w: World;
let owner: Caller;
let staff: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { swiggy: uuidv7(), biryani: uuidv7(), order: uuidv7() };
let run: { import_run_id: string; draft_id: string };

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner, staff } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
});
afterAll(async () => env?.stop());

const bookRows = async () => Number((await env.one<{ n: string }>(
  `SELECT (SELECT count(*) FROM core.settlement s WHERE s.import_run_id = $1) + (SELECT count(*) FROM core.reconciliation_break b WHERE b.import_run_id = $1) AS n`,
  [run.import_run_id])).n);

describe("import (Swiggy-shaped) → preview → approve → settlement → postings → reconciliation breaks", () => {
  it("sets up the channel, its terms and our order SYN-SWG-1003; uploads and parses the file to a preview; nothing is on the books yet", async () => {
    expect((await env.cmd(owner, "/v1/channels", "tenancy.channel.create.v1", { channel_id: ids.swiggy, name: "Swiggy (synthetic)", kind: "aggregator:swiggy" })).status).toBe(200);
    expect((await env.cmd(owner, "/v1/finance/channel-terms", "finance.channel_terms.set.v1", {
      channel_terms_id: uuidv7(), channel_id: ids.swiggy, commission_bp: 2200, ads_opted_in: false, ad_spend_cap_minor: null, promo_share_bp: 0,
      payout_cycle_days: 7, currency: "INR", valid_from: "2026-10-01", valid_to: null })).status).toBe(201);
    expect((await env.cmd(owner, "/v1/catalogue/items", "catalogue.item.upsert.v1", {
      item_id: ids.biryani, kind: "dish", name_key: "menu.int_veg_biryani", category: "mains", brand_id: null, barcode: null, mrp_minor: null, currency: null,
      active: true, variants: [], option_groups: [], stock_ingredient_id: null })).status).toBe(200);
    expect((await env.cmd(owner, "/v1/catalogue/prices", "catalogue.price.set.v1", {
      price_id: uuidv7(), item_id: ids.biryani, variant_id: null, outlet_id: w.outlets[0], channel_kind: "aggregator:swiggy", amount_minor: 28000, currency: "INR",
      tax_class: "restaurant_5", valid_from: "2026-10-01", valid_to: null })).status).toBe(200);
    const placed = await env.cmd(owner, "/v1/orders", "orders.place.v1", {
      order_id: ids.order, outlet_id: w.outlets[0], channel_id: ids.swiggy, brand_id: null, device_id: null, kind: "delivery", table_ref: null, pickup_window_id: null,
      promised_at: null, external_ref: "SYN-SWG-1003", coupon_codes: [], loyalty_redeem_points: 0, preview_total_minor: null, client_totals: null,
      lines: [{ line_id: uuidv7(), item_id: ids.biryani, variant_id: null, option_ids: [], qty_milli: 1000, barcode: null, note: null }] });
    expect(placed.status).toBe(201);
    expect(Number((await env.one<{ t: string }>(`SELECT total_minor::text AS t FROM core."order" WHERE id = $1`, [ids.order])).t)).toBe(29400);

    // Staff cannot bring files in; the owner can.
    const body = { kind: "payout_statement", filename: "synthetic_swiggy_1.csv", media_type: "text/csv", content_base64: readFileSync(FILE).toString("base64") };
    expect((await env.http("POST", "/v1/imports/documents", staff, body)).status).toBe(403);
    const up = await env.http("POST", "/v1/imports/documents", owner, body);
    expect([up.status, up.body.duplicate, up.body.run?.status, up.body.run?.parser]).toEqual([200, false, "parsing", "swiggy_orders_v1"]);
    const tally = await parsePendingImports({ pool: env.api.deps.pools.svc, blobs: env.blobs, log: () => {} }, [w.tenant]);
    expect(tally).toMatchObject({ previewed: 1, failed: 0 });
    const preview = await env.http("GET", `/v1/imports/runs/${up.body.run.import_run_id}`, owner);
    expect([preview.status, preview.body.status, preview.body.rows_ok, preview.body.rows_quarantined, preview.body.control_total_minor, preview.body.total_matches])
      .toEqual([200, "previewed", 4, 0, 138039, true]);
    run = { import_run_id: preview.body.import_run_id, draft_id: preview.body.draft_id };
    expect(await bookRows()).toBe(0);
  });

  it("staff cannot approve (404: the tenant-wide draft is outside their outlets); the owner approves → settlement, entry and breaks by hand", async () => {
    const approve = (who: Caller) => env.http("POST", `/v1/drafts/${run.draft_id}:approve`, who, {
      command_id: uuidv7(), idempotency_key: `imp-${uuidv7()}`, type: "drafts.approve.v1",
      payload: { draft_id: run.draft_id, command_type: "imports.run.commit.v1", edited_payload: null, reason: null } });
    expect((await approve(staff)).status).toBe(404);
    expect(await bookRows()).toBe(0);
    expect((await approve(owner)).status).toBe(200);

    const s = await env.one<{ id: string; net: string; ref: string; outlet: string; origin: string }>(
      `SELECT id, net_minor::text AS net, external_ref AS ref, outlet_id::text AS outlet, origin ->> 'kind' AS origin FROM core.settlement WHERE import_run_id = $1`, [run.import_run_id]);
    expect([Number(s.net), s.ref, s.outlet, s.origin]).toEqual([138039, "SYN-SWG-P001", w.outlets[0], "decision"]);
    expect(await env.rows(`SELECT line_kind AS kind, external_order_ref AS ref, matched_order_id::text AS matched, net_minor::int AS net FROM core.settlement_line WHERE settlement_id = $1 ORDER BY line_no`, [s.id]))
      .toEqual([
        { kind: "order", ref: "SYN-SWG-1001", matched: null, net: 39000 },
        { kind: "order", ref: "SYN-SWG-1002", matched: null, net: 93639 },
        { kind: "ad_fee", ref: null, matched: null, net: -15000 },
        { kind: "order", ref: "SYN-SWG-1003", matched: ids.order, net: 20400 },
      ]);
    expect(await postingsOf(env, s.id)).toEqual({ "finance.post_settlement": { 1010: 138039, 1100: -200050, 6000: 44011, 6010: 18000 } });
    expect(await env.rows(`SELECT kind, amount_minor::int AS amount, order_id::text AS order_id, origin ->> 'rule_id' AS rule FROM core.reconciliation_break WHERE import_run_id = $1 ORDER BY kind`, [run.import_run_id]))
      .toEqual([
        { kind: "short_payout", amount: 1000, order_id: ids.order, rule: "finance.reconcile_settlement" },
        { kind: "unapproved_deduction", amount: 15000, order_id: null, rule: "finance.reconcile_settlement" },
      ]);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: channel, terms, item, price; our order + line + its placed event (no recipe: nothing consumed);
    // settlement + 4 lines, its entry with 4 postings, 2 breaks. Documents, runs, staging and drafts are operational.
    expect(scan.inserted).toEqual({
      channel: 1, channel_terms: 1, item: 1, price: 1, order: 1, order_line: 1, order_event: 1,
      settlement: 1, settlement_line: 4, journal_entry: 1, posting: 4, reconciliation_break: 2,
    });
    expect(scan.updated).toEqual({});
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
