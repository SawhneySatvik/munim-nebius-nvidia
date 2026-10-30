// Flow 3 — purchasing on the real seams (IN, outlet 3): PO → GRN (receipt movement + finance.post_grn) → invoice
// recorded → approved (payable + finance.post_supplier_invoice) → disputed (0015 A8: the invoice moves to disputed and
// its entry is reversed under finance.reverse_supplier_invoice) → approved again (no second payable; finance re-posts
// as the reversal of the reversal). The supplier is simulated (CLAUDE.md rule 5).
// Hand: 10 kg tomatoes at 4,000 per kg = 40,000.
//   GRN:      +10,000 milli-kg receipt; Dr 5000 COGS 40,000 · Cr 2050 GRNI 40,000 (purchases method).
//   Invoice:  subtotal 40,000 + tax 2,000 = 42,000. The IN chart has no input-tax account, so the tax is cost:
//             Dr 2050 40,000 · Dr 5000 2,000 · Cr 2000 payables 42,000. Payable 42,000 due 2026-10-05 + 15 days = 2026-10-20.
//   Dispute:  the reversal Dr 2000 42,000 · Cr 2050 40,000 · Cr 5000 2,000, dated today (business date).
//   Re-approve: the re-post repeats the original lines; the chain is original ← reversal ← re-post.
import { businessDate } from "../../packages/core-domain/tz/index.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, postingsOf, type Res, startEnv, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { supplier: uuidv7(), tomato: uuidv7(), po: uuidv7(), grn: uuidv7(), invoice: uuidv7(), invLine: uuidv7(), dispute: uuidv7() };

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
});
afterAll(async () => env?.stop());

const status = async () => (await env.one<{ status: string }>(`SELECT status FROM core.supplier_invoice WHERE id = $1`, [ids.invoice])).status;
const chainOf = () => env.rows<{ rule: string; reverses: string | null; date: string }>(
  `SELECT j.posting_rule AS rule, (SELECT x.posting_rule FROM core.journal_entry x WHERE x.tenant_id = j.tenant_id AND x.id = j.reverses_id) AS reverses, j.entry_date::text AS date
     FROM core.journal_entry j WHERE j.source_id = $1 ORDER BY j.id`, [ids.invoice]);

describe("PO → GRN → invoice → approve → payable → postings; dispute → reversal; re-approve → re-post", () => {
  it("receives and invoices 10 kg; approval raises the payable and the entry", async () => {
    const created = (r: Res) => expect([r.status, r.body?.error ?? null]).toEqual([201, null]);
    created(await env.cmd(owner, "/v1/suppliers", "purchasing.supplier.upsert.v1",
      { supplier_id: ids.supplier, name: "Simulated Veg Co", kind: "simulated", a2a_card_url: null, terms: { payment_days: 15, notes: null }, prices: [] }));
    expect((await env.cmd(owner, "/v1/inventory/ingredients", "inventory.ingredient.upsert.v1",
      { ingredient_id: ids.tomato, name: "Tomato (synthetic)", base_unit: "kg", shelf_life_days: null, tracked_by_batch: false })).status).toBe(200);
    created(await env.cmd(owner, "/v1/purchase-orders", "purchasing.po.create.v1", {
      po_id: ids.po, supplier_id: ids.supplier, outlet_ids: [w.outlets[2]], currency: "INR", expected_on: "2026-10-12", negotiation_run_id: null,
      lines: [{ ingredient_id: ids.tomato, qty_milli: 10000, unit: "kg", unit_price_minor: 4000 }] }));
    const poLine = (await env.one<{ id: string }>(`SELECT id FROM core.po_line WHERE po_id = $1`, [ids.po])).id;
    created(await env.cmd(owner, "/v1/goods-received", "purchasing.grn.receive.v1", {
      grn_id: ids.grn, outlet_id: w.outlets[2], supplier_id: ids.supplier, po_id: ids.po, received_at: null, note: null,
      lines: [{ grn_line_id: uuidv7(), po_line_id: poLine, ingredient_id: ids.tomato, qty_milli: 10000, unit: "kg", unit_cost_minor: 4000, currency: "INR", batch: null }] }));
    expect(await env.rows(`SELECT qty_milli::int AS qty, unit, origin ->> 'rule_id' AS rule FROM core.stock_movement WHERE ref_id = $1`, [ids.grn]))
      .toEqual([{ qty: 10000, unit: "kg", rule: "inventory.receive_grn" }]);
    expect(await postingsOf(env, ids.grn)).toEqual({ "finance.post_grn": { 2050: -40000, 5000: 40000 } });

    created(await env.cmd(owner, "/v1/supplier-invoices", "purchasing.invoice.record.v1", {
      supplier_invoice_id: ids.invoice, supplier_id: ids.supplier, invoice_no: "SIM-INV-1", invoice_date: "2026-10-05", po_id: ids.po, currency: "INR",
      lines: [{ line_id: ids.invLine, po_line_id: poLine, ingredient_id: ids.tomato, description: null, qty_milli: 10000, unit: "kg", unit_price_minor: 4000, tax_minor: 2000 }] }));
    expect([await status(), await postingsOf(env, ids.invoice)]).toEqual(["recorded", {}]);
    const approve = () => env.cmd(owner, `/v1/supplier-invoices/${ids.invoice}:approve`, "purchasing.invoice.approve.v1", { supplier_invoice_id: ids.invoice });
    expect((await approve()).status).toBe(200);
    expect(await env.rows(`SELECT amount_minor::int AS amount, due_on::text AS due, status, origin ->> 'rule_id' AS rule FROM core.payable WHERE source_id = $1`, [ids.invoice]))
      .toEqual([{ amount: 42000, due: "2026-10-20", status: "open", rule: "purchasing.payable_from_invoice" }]);
    expect(await postingsOf(env, ids.invoice)).toEqual({ "finance.post_supplier_invoice": { 2000: -42000, 2050: 40000, 5000: 2000 } });
    // A second approval of an approved invoice is refused and changes nothing.
    expect((await approve()).status).toBe(409);
  });

  it("dispute → disputed, the entry reversed today; re-approve → approved, the same payable, the entry re-posted", async () => {
    const today = businessDate(new Date(), "Asia/Kolkata", "04:00");
    const dispute = await env.cmd(owner, `/v1/supplier-invoices/${ids.invoice}:dispute`, "purchasing.invoice.dispute.v1",
      { dispute_id: ids.dispute, supplier_invoice_id: ids.invoice, basis: "overbilled", lines: [{ invoice_line_id: ids.invLine, claimed_minor: 2000 }] });
    expect(dispute.status).toBe(201);
    expect(await status()).toBe("disputed");
    // D2: the payable follows the invoice into the dispute, and back to open when it is approved again.
    const payable = async () => (await env.one<{ s: string }>(`SELECT status AS s FROM core.payable WHERE source_id = $1`, [ids.invoice])).s;
    expect(await payable()).toBe("disputed");
    expect(await postingsOf(env, ids.invoice)).toEqual({
      "finance.post_supplier_invoice": { 2000: -42000, 2050: 40000, 5000: 2000 },
      "finance.reverse_supplier_invoice": { 2000: 42000, 2050: -40000, 5000: -2000 },
    });
    expect(await chainOf()).toEqual([
      { rule: "finance.post_supplier_invoice", reverses: null, date: "2026-10-05" },
      { rule: "finance.reverse_supplier_invoice", reverses: "finance.post_supplier_invoice", date: today },
    ]);
    expect((await env.cmd(owner, `/v1/supplier-invoices/${ids.invoice}:approve`, "purchasing.invoice.approve.v1", { supplier_invoice_id: ids.invoice })).status).toBe(200);
    expect(await status()).toBe("approved");
    expect(Number((await env.one<{ n: string }>(`SELECT count(*) AS n FROM core.payable WHERE source_id = $1`, [ids.invoice])).n)).toBe(1);
    expect(await payable()).toBe("open");
    expect(await chainOf()).toEqual([
      { rule: "finance.post_supplier_invoice", reverses: null, date: "2026-10-05" },
      { rule: "finance.reverse_supplier_invoice", reverses: "finance.post_supplier_invoice", date: today },
      { rule: "finance.post_supplier_invoice", reverses: "finance.reverse_supplier_invoice", date: today },
    ]);
    expect(await postingsOf(env, ids.invoice)).toEqual({
      "finance.post_supplier_invoice": { 2000: -84000, 2050: 80000, 5000: 4000 },
      "finance.reverse_supplier_invoice": { 2000: 42000, 2050: -40000, 5000: -2000 },
    });
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: supplier, ingredient, PO + line, GRN + line + its movement, invoice + line, payable, dispute + line;
    // entries: GRN 1 + invoice 3 (post, reversal, re-post) = 4; postings 2 + 3 × 3 = 11.
    expect(scan.inserted).toEqual({
      supplier: 1, ingredient: 1, purchase_order: 1, po_line: 1, goods_received: 1, grn_line: 1, stock_movement: 1,
      supplier_invoice: 1, supplier_invoice_line: 1, payable: 1, dispute: 1, dispute_line: 1, journal_entry: 4, posting: 11,
    });
    // Hand: the PO received; the invoice approved → disputed → approved; its payable disputed → open (D2).
    expect(scan.updated).toEqual({ purchase_order: 1, supplier_invoice: 3, payable: 2 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
