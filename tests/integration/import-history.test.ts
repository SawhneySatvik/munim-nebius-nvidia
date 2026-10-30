// Flow (h-1, R44b) — dated synthetic history: a POS bills file (pos_bills_v2) and a waste log (waste_log_v1) uploaded
// over HTTP → the core-worker parse job → previews → staff cannot approve → the owner approves each → orders, lines,
// tenders, refunds, voids and waste under the decision; postings and stock movements derived by their rules, dated on
// the bills' own days. Nothing reaches the books before the approval (R28). Clause 1 over every row, audit chain verified.
// The files (services/core-worker/test/fixtures/imports/history/), hand-valued in paise (IN, 5% GST exclusive):
//   SYN-H-0003 (Outlet 3, 2 Oct 09:15, counter, card 651.00): 320.00 − 20.00 discount + 15.00 GST = 315.00, and
//     320.00 + 16.00 = 336.00 (voided: remake) → total 65,100, tax 3,100; refund 315.00 by card.
//   post_order: Dr 1110 65,100 · Cr 4000 62,000 · Cr 2100 3,100. post_tender (card): Dr 1010 65,100 · Cr 1110 65,100.
//   post_refund: Dr 4000 30,000 · Dr 2100 1,500 (31,500 × 3,100 ÷ 65,100) · Cr 1010 31,500.
//   Waste: 250 g (Outlet 1, 1 Oct 22:10), 1.5 g (Outlet 3, 2 Oct), 100 g (Outlet 2, 3 Oct 23:59) of Paneer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePendingImports } from "../../services/core-worker/src/imports/index.ts";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, postingsOf, startEnv, uuidv7, type World, world } from "./harness.ts";

const DIR = join(import.meta.dirname, "../../services/core-worker/test/fixtures/imports/history");

let env: Env;
let w: World;
let owner: Caller;
let staff: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const runs: Record<"bills" | "waste", { import_run_id: string; draft_id: string }> = {} as never;

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner, staff } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
});
afterAll(async () => env?.stop());

const bookRows = async () => Number((await env.one<{ n: string }>(
  `SELECT (SELECT count(*) FROM core."order" WHERE tenant_id = $1 AND pricing_snapshot ->> 'source' = 'pos_bills_v2')
        + (SELECT count(*) FROM core.waste_log WHERE tenant_id = $1 AND origin ->> 'kind' = 'decision') AS n`, [w.tenant])).n);

describe("history import (pos_bills_v2 + waste_log_v1) → preview → approve → books under the decision", () => {
  it("creates the aggregator channel; uploads both files; the parse job previews them; nothing is on the books yet", async () => {
    expect((await env.cmd(owner, "/v1/channels", "tenancy.channel.create.v1", { channel_id: uuidv7(), name: "Swiggy (synthetic)", kind: "aggregator:swiggy" })).status).toBe(200);
    for (const [k, kind, file] of [["bills", "pos_bills", "synthetic_bills_1.csv"], ["waste", "waste_log", "synthetic_waste_1.csv"]] as const) {
      const body = { kind, filename: file, media_type: "text/csv", content_base64: readFileSync(join(DIR, file)).toString("base64") };
      expect((await env.http("POST", "/v1/imports/documents", staff, body)).status).toBe(403);
      const up = await env.http("POST", "/v1/imports/documents", owner, body);
      expect([up.status, up.body.run?.status]).toEqual([200, "parsing"]);
      expect(await parsePendingImports({ pool: env.api.deps.pools.svc, blobs: env.blobs, log: () => {} }, [w.tenant])).toMatchObject({ previewed: 1, failed: 0 });
      const p = await env.http("GET", `/v1/imports/runs/${up.body.run.import_run_id}`, owner);
      runs[k] = { import_run_id: p.body.import_run_id, draft_id: p.body.draft_id };
      expect([p.body.status, p.body.rows_ok, p.body.rows_quarantined]).toEqual(k === "bills" ? ["previewed", 7, 0] : ["previewed", 3, 6]);
    }
    expect(await bookRows()).toBe(0);
  });

  it("staff cannot approve (404); the owner approves both → bills and waste by hand", async () => {
    const approve = (who: Caller, draft: string) => env.http("POST", `/v1/drafts/${draft}:approve`, who, {
      command_id: uuidv7(), idempotency_key: `h1-${uuidv7()}`, type: "drafts.approve.v1",
      payload: { draft_id: draft, command_type: "imports.run.commit.v1", edited_payload: null, reason: null } });
    expect((await approve(staff, runs.bills.draft_id)).status).toBe(404);
    expect(await bookRows()).toBe(0);
    expect((await approve(owner, runs.bills.draft_id)).status).toBe(200);
    expect((await approve(owner, runs.waste.draft_id)).status).toBe(200);

    const o = await env.one<{ id: string; total: number; tax: number; bd: string; invoice_no: string | null }>(
      `SELECT id, total_minor::int AS total, tax_minor::int AS tax, business_date::text AS bd, invoice_no FROM core."order" WHERE tenant_id = $1 AND external_ref = 'SYN-H-0003'`, [w.tenant]);
    expect([o.total, o.tax, o.bd, o.invoice_no]).toEqual([65100, 3100, "2026-10-02", null]);
    expect(await postingsOf(env, o.id)).toEqual({ "finance.post_order": { 1110: 65100, 2100: -3100, 4000: -62000 } });
    const tender = await env.one<{ id: string }>(`SELECT id FROM core.tender WHERE order_id = $1`, [o.id]);
    expect(await postingsOf(env, tender.id)).toEqual({ "finance.post_tender": { 1010: 65100, 1110: -65100 } });
    const refund = await env.one<{ id: string }>(`SELECT id FROM core.refund WHERE order_id = $1`, [o.id]);
    expect(await postingsOf(env, refund.id)).toEqual({ "finance.post_refund": { 1010: -31500, 2100: 1500, 4000: 30000 } });
    expect(await env.rows(`SELECT m.qty_milli::int AS qty, m.batch_id, m.origin ->> 'rule_id' AS rule FROM core.stock_movement m WHERE m.ref_id = $1`, [o.id]))
      .toEqual([{ qty: -300000, batch_id: null, rule: "inventory.consume_order" }]);
    expect(await env.rows(`SELECT w.qty_milli::int AS qty, m.qty_milli::int AS moved, m.origin ->> 'rule_id' AS rule FROM core.waste_log w
                             JOIN core.stock_movement m ON m.tenant_id = w.tenant_id AND m.ref_id = w.id WHERE w.tenant_id = $1 ORDER BY w.at`, [w.tenant])).toEqual([
      { qty: 250000, moved: -250000, rule: "inventory.record_waste" },
      { qty: 1500, moved: -1500, rule: "inventory.record_waste" },
      { qty: 100000, moved: -100000, rule: "inventory.record_waste" },
    ]);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: the channel; 5 bills → 5 orders, 7 lines, 4 tenders (SYN-H-0001 cash + UPI, 0003 card, 0005 cash), 2 refunds, 2 voids
    // (0003's remake line, 0004 the whole bill); entries: 4 post_order (0004 cancelled: none), 4 post_tender, 2 post_refund = 10, with
    // 7 + 4 + 8 + 5 = 24 postings (0001: 3 + 2 + 2; 0002: 2 + 2; 0003: 3 + 2 + 3; 0005: 3 + 2); 5 consumption movements (0001 dish + SKU from
    // batch B-1, 0002, 0003, 0005 SKU from B-2) + 3 waste movements; 3 waste entries. Documents, runs, staging and drafts are operational.
    expect(scan.inserted).toEqual({
      channel: 1, order: 5, order_line: 7, tender: 4, refund: 2, void: 2, journal_entry: 10, posting: 24, stock_movement: 8, waste_log: 3,
    });
    expect(scan.updated).toEqual({});
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
