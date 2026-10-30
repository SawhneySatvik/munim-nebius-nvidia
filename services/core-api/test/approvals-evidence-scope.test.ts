// NB-3 gates — approval re-judges a draft's based_on cells under the outlet scope their evidence was gathered with
// (evidence.snapshot.outlet_scope, which mintSnapshot sets from the run token or the member), not under the approver's
// wider scope, and refuses an approver whose scope does not cover it. Through the real app, on intel's own path: run token →
// POST /internal/intel/v1/snapshots and /drafts → POST /v1/drafts/{id}:approve. The shortfall is the migration's
// inventory.shortfall (latest version, fixed as_of) over this file's own ingredients, recipes, stock and forecast, so
// every expected value is computed by hand:
//   each scenario ingredient: 100 g a portion; 10 portions a day forecast at o1 and at o2 (1,000 g a day each, days
//   as_of + 1 … + 6); on hand 2,000 g at o1 and 20,000 g at o2; lead 6 days.
//   under [o1]: need 6,000 g, on hand 2,000 g → shortfall 4,000 g; left 1,000 / 0 / −1,000 g → stockout_on as_of + 3.
//   under '*' : need 12,000 g, on hand 22,000 g → shortfall 0, never below 0 → stockout_on null. The row key
//               (ingredient_id, stockout_on) differs, so a re-run under the owner's '*' finds the row "gone" (A.report P2).
//   (1) a single-outlet RFQ PO draft (an `ask` run scoped [o1], started by the owner) approved by the owner executes —
//       409 stale_draft before NB-3; stock moving at o2 (outside the evidence's scope) does not make it stale; the PO is
//       written under the owner's decision; a same-key replay returns the same bytes and executes nothing more.
//   (2) o1's manager approving an o1 draft whose based_on cites a '*' snapshot → 403 authority_denied, nothing executes;
//       the owner, who covers it, executes it.
//   (3) stock moving at o1 after the draft → 409 stale_draft with o1's own new values, cited by a snapshot minted for the
//       owner at scope [o1]; 0 executions.
//   (4) a pooled [o1,o2] PO whose evidence is o1's: o1's manager → 403 (narrower than the draft); the owner → executes, so
//       the approver's own scope is back before the book guard judges the PO (left at [o1], the guard refuses the o2 half).
//   (5) every PO row here traces to a decision by the approving owner; the audit chain verifies.
// Synthetic data only; the supplier is buildWorld's simulated one.
import { createLogger } from "@munim/config";
import { REPLAYED_HEADER, snapRef } from "@munim/contracts";
import { DraftsResponse } from "@munim/contracts/internal";
import { buildWorld, type TestDb } from "@munim/db";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { createApp, type Deps, TENANT_HEADER } from "../src/app.ts";
import { uuidv7, verifyAuditChain } from "../src/commit/index.ts";
import { svcTx, testKeys } from "../src/commit/testkit.ts";
import { configureInternal } from "../src/internal/index.ts";
import { mintRunToken, type OutletScope } from "../src/runtoken/index.ts";
import { openDb } from "./db.ts";

const idp = createLocalIdp();
const keys = testKeys();
const SECRET = "nb3-evidence-scope-test-secret-not-real-0123456789";
const AS_OF = "2026-11-02";
const STOCKOUT_O1 = "2026-11-05"; // as_of + 3 (hand-computed above)
const PRICE = 40; // minor units per g, the test template's constant
let db: TestDb;
let pools: { core: pg.Pool; svc: pg.Pool };
let app: Awaited<ReturnType<typeof createApp>>;

const T = {
  tenant: "", owner: "", supplier: "", run: "", snapshot: "", outlets: ["", "", ""] as [string, string, string], mgr1: uuidv7(),
  // One ingredient per scenario, so no scenario's PO or stock moves another's shortfall row (or merges its draft).
  ing: { one: uuidv7(), wide: uuidv7(), changed: uuidv7(), pooled: uuidv7() },
  subs: { owner: `owner-${uuidv7()}`, mgr1: `mgr1-${uuidv7()}` },
};
type Who = keyof typeof T.subs;
type Ing = keyof typeof T.ing;

const own = (command_type: string) => ({ tenant_id: T.tenant, outlet_ids: "*" as const, role: "owner" as const, member_id: T.owner, command_type });
const receive = (outlet: string, ingredient: string, qtyMilli: number) =>
  db.withContext("munim_core", own("inventory.stock.receive.v1"), (c) =>
    c.query(`INSERT INTO core.stock_movement (tenant_id, id, outlet_id, ingredient_id, qty_milli, unit, kind) VALUES ($1, $2, $3, $4, $5, 'g', 'receipt')`,
      [T.tenant, uuidv7(), outlet, ingredient, qtyMilli]));

async function setup() {
  const w = await buildWorld(db);
  Object.assign(T, { tenant: w.tenant, owner: w.owner, supplier: w.supplier, run: w.run, snapshot: w.snapshot, outlets: [...w.outlets] });
  const [o1, o2] = T.outlets;
  await db.withContext("munim_core", own("tenancy.member.invite.v1"), async (c) => {
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [T.owner, T.subs.owner]);
    await c.query(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, 'Synthetic manager', 'mgr1@example.test')`, [T.tenant, T.mgr1, T.subs.mgr1]);
    await c.query(`INSERT INTO core.membership (tenant_id, member_id, role, outlet_ids) VALUES ($1, $2, 'manager', $3)`, [T.tenant, T.mgr1, [o1]]);
  });
  const items = Object.fromEntries(Object.keys(T.ing).map((k) => [k, uuidv7()])) as Record<Ing, string>;
  await db.withContext("munim_core", own("inventory.ingredient.upsert.v1"), async (c) => {
    for (const [k, id] of Object.entries(T.ing)) await c.query(`INSERT INTO core.ingredient (tenant_id, id, name, base_unit) VALUES ($1, $2, $3, 'g')`, [T.tenant, id, `Synthetic flour ${k}`]);
  });
  await db.withContext("munim_core", own("catalogue.item.upsert.v1"), async (c) => {
    for (const [k, id] of Object.entries(items)) await c.query(`INSERT INTO core.item (tenant_id, id, kind, name_key, category) VALUES ($1, $2, 'dish', $3, 'mains')`, [T.tenant, id, `nb3_dish_${k}`]);
  });
  await db.withContext("munim_core", own("catalogue.recipe.version.create.v1"), async (c) => {
    for (const k of Object.keys(T.ing) as Ing[]) {
      const rv = uuidv7();
      await c.query(`INSERT INTO core.recipe_version (tenant_id, id, item_id, version, valid_from, yield_qty_milli) VALUES ($1, $2, $3, 1, '2026-10-01', 1000)`, [T.tenant, rv, items[k]]);
      await c.query(`INSERT INTO core.recipe_line (tenant_id, id, recipe_version_id, ingredient_id, qty_milli, unit) VALUES ($1, $2, $3, $4, 100000, 'g')`, [T.tenant, uuidv7(), rv, T.ing[k]]);
    }
  });
  for (const id of Object.values(T.ing)) {
    await receive(o1, id, 2_000_000);
    await receive(o2, id, 20_000_000);
  }
  // The newest forecast run (so the template's per-outlet pick reads it at o1 and o2): 10 portions a day per dish.
  const fr = uuidv7();
  await db.admin(`INSERT INTO intel.forecast_run (tenant_id, id, run_id, method, trained_through, horizon_days, holdout_days) VALUES ($1, $2, $3, 'seasonal_naive', '2026-11-01', 7, 28)`,
    [T.tenant, fr, T.run]);
  for (const item of Object.values(items)) for (const o of [o1, o2]) for (let k = 1; k <= 6; k++) {
    await db.admin(`INSERT INTO intel.forecast_point (tenant_id, id, forecast_run_id, outlet_id, item_id, business_on, method, qty_milli, lo_qty_milli, hi_qty_milli, inputs_snapshot_id)
                    VALUES ($1, $2, $3, $4, $5, $6::date + $7::int, 'seasonal_naive', 10000, 9000, 11000, $8)`, [T.tenant, uuidv7(), fr, o, item, AS_OF, k, T.snapshot]);
  }
  // Test-only template (fixture DB clone): a constant unit price per ingredient, for the PO line's price cell. `outlet_id`
  // lets a tenant-wide run mint it for one outlet (the internal route then narrows the stored scope, T-043).
  await db.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) VALUES ('test.nb3_unit_price', 1, $1, $2, $3, 'manager')`, [
    `SELECT g.id AS ingredient_id, ${PRICE}::bigint AS unit_price_minor FROM core.ingredient g
      WHERE g.id = :ingredient_id::uuid AND EXISTS (SELECT 1 FROM core.outlet o WHERE :outlet_id::uuid IS NULL OR o.id = :outlet_id::uuid)`,
    JSON.stringify({ type: "object", required: ["ingredient_id", "outlet_id"], additionalProperties: false,
      properties: { ingredient_id: { type: "string" }, outlet_id: { type: ["string", "null"] } } }),
    JSON.stringify([{ name: "ingredient_id", type: "uuid" }, { name: "unit_price_minor", type: "integer", numeric_source: "core.supplier_price.unit_price_minor" }]),
  ]);
}

type Res = Omit<Response, "json"> & { json(): Promise<any> };
const intel = async (token: string, path: string, body: unknown): Promise<Res> =>
  (await app.request(`/internal/intel/v1/${path}`, {
    method: "POST", body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "x-munim-service-secret": SECRET, "content-type": "application/json" },
  })) as Res;
const call = async (method: string, path: string, who: Who, body?: unknown): Promise<Res> =>
  (await app.request(path, {
    method,
    headers: { Authorization: `Bearer ${idp.sign({ sub: T.subs[who] })}`, [TENANT_HEADER]: T.tenant, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })) as Res;
const one = async <R extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.admin(sql, params)).rows[0] as R;
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: string }>(sql, params)).n);
const statusOf = async (id: string) => (await one<{ status: string }>(`SELECT status FROM core.draft WHERE id = $1`, [id])).status;
const decisions = (draft: string) => count(`SELECT count(*) n FROM core.decision WHERE draft_id = $1`, [draft]);
const poLines = (ing: Ing) => count(`SELECT count(*) n FROM core.po_line WHERE tenant_id = $1 AND ingredient_id = $2`, [T.tenant, T.ing[ing]]);
const executions = () => count(
  `SELECT count(*) n FROM core.audit_log WHERE tenant_id = $1 AND entity = 'core.draft' AND after->>'status' = 'executed'`, [T.tenant]);

/** An intel run as core mints one: `ask` (actor = the owner, as POST /v1/rfq-requests) for an outlet list, or a sweep for '*'. */
const runToken = async (scope: OutletScope) => (await mintRunToken({ ...keys, svc: svcTx(db) },
  scope[0] === "*" ? { tenantId: T.tenant, outletScope: scope, trigger: "watch_sweep", actor: "watcher:inventory_purchasing" }
    : { tenantId: T.tenant, outletScope: scope, trigger: "ask", actor: T.owner }));

type Snap = { snapshot_id: string; outlet_scope: string[]; rows: Array<Record<string, unknown>> };
async function mint(token: string, template_id: string, params: Record<string, unknown>): Promise<Snap> {
  const r = await intel(token, "snapshots", { template_id, params });
  expect(r.status).toBe(201);
  return r.json();
}
const shortfall = (token: string, outlet_id: string | null) => mint(token, "inventory.shortfall", { outlet_id, lead_days: 6, as_of: AS_OF });
const rowOf = (s: Snap, ing: Ing) => {
  const at = s.rows.findIndex((r) => r.ingredient_id === T.ing[ing]);
  expect(at).toBeGreaterThanOrEqual(0);
  return at;
};

/** The negotiation's PO draft shape (intel negotiate/review.py): qty and price are cells, based_on the shortfall's cells and
 *  the price; `extra` cites more based_on cells. Posted through the internal route, which stores it `proposed`. */
async function poDraft(token: string, ing: Ing, outlets: string[], short: Snap, price: Snap, extra: string[] = []) {
  const at = rowOf(short, ing);
  const qty = snapRef(short.snapshot_id, at, "shortfall_qty_milli");
  const onHand = snapRef(short.snapshot_id, at, "on_hand_qty_milli");
  const unitPrice = snapRef(price.snapshot_id, 0, "unit_price_minor");
  const po = uuidv7();
  const r = await intel(token, "drafts", {
    draft_id: uuidv7(), pack: "inventory_purchasing", command_type: "purchasing.po.create.v1",
    payload: { po_id: po, supplier_id: T.supplier, outlet_ids: outlets, currency: "INR", expected_on: null, negotiation_run_id: null,
      lines: [{ ingredient_id: T.ing[ing], qty_milli: qty, unit: "g", unit_price_minor: unitPrice }] },
    outlet_ids: outlets, finding_id: null, evidence: [`snap:${short.snapshot_id}`, `snap:${price.snapshot_id}`],
    based_on: [qty, onHand, unitPrice, ...extra],
  });
  expect(r.status).toBe(201);
  const body = DraftsResponse.parse(await r.json());
  expect(body.status).toBe("proposed");
  return { id: body.draft_id, po, qty, onHand };
}

const approveBody = (draftId: string, key = `approve-${uuidv7()}`) => ({
  command_id: uuidv7(), idempotency_key: key, type: "drafts.approve.v1",
  payload: { draft_id: draftId, command_type: "purchasing.po.create.v1", edited_payload: null, reason: null },
});
const approve = (who: Who, draftId: string, body = approveBody(draftId)) => call("POST", `/v1/drafts/${draftId}:approve`, who, body);

beforeAll(async () => {
  db = await openDb();
  await setup();
  pools = { core: db.pool("munim_core", 4), svc: db.pool("munim_svc", 4) };
  const config = { nodeEnv: "test", redact: (s: string) => s };
  const deps: Deps = { pools, idp, storefronts: async () => null, config, log: createLogger(config, () => {}) };
  app = await createApp(deps);
  configureInternal(deps, { serviceSecret: SECRET, keys, watchWindowMs: 0 });
});

afterAll(async () => {
  await pools?.core.end();
  await pools?.svc.end();
  await db?.stop();
});

describe("re-judged under the evidence's own scope (NB-3)", () => {
  it("(1) a single-outlet RFQ PO draft approved by the owner executes; o2's stock is outside its evidence; replay = same bytes", async () => {
    const [o1, o2] = T.outlets;
    const { token } = await runToken([o1]);
    const short = await shortfall(token, null);
    const price = await mint(token, "test.nb3_unit_price", { ingredient_id: T.ing.one, outlet_id: null });
    expect([short.outlet_scope, price.outlet_scope]).toEqual([[o1], [o1]]);
    expect(short.rows[rowOf(short, "one")]).toMatchObject({ shortfall_qty_milli: 4_000_000, on_hand_qty_milli: 2_000_000, stockout_on: STOCKOUT_O1 });
    // The defect's precondition, measured: the same template over the owner's '*' gives another row key for this ingredient.
    const wide = await (await call("POST", "/v1/snapshots", "owner", { template_id: "inventory.shortfall", params: { outlet_id: null, lead_days: 6, as_of: AS_OF } })).json() as Snap;
    expect(wide.rows[rowOf(wide, "one")]).toMatchObject({ shortfall_qty_milli: 0, on_hand_qty_milli: 22_000_000, stockout_on: null });

    const d = await poDraft(token, "one", [o1], short, price);
    await receive(o2, T.ing.one, 5_000_000); // moves '*' but not [o1]
    const before = await executions();
    const body = approveBody(d.id, `approve-nb3-${uuidv7()}`);
    const r = await approve("owner", d.id, body);
    const text = await r.text();
    expect([r.status, r.status === 200 ? null : JSON.parse(text).error.code]).toEqual([200, null]);
    expect(await statusOf(d.id)).toBe("executed");
    expect(await executions()).toBe(before + 1);
    const po = await one<{ outlet_ids: string[]; total_minor: string; origin: { kind: string; decision_id: string } }>(
      `SELECT outlet_ids, total_minor, origin FROM core.purchase_order WHERE id = $1`, [d.po]);
    // The executed quantity is the [o1] cell (4,000 g × 40 per g = 160,000), read from the snapshot, not the payload text.
    expect([po.outlet_ids, po.total_minor, po.origin.kind]).toEqual([[o1], "160000", "decision"]);
    expect(await one(`SELECT qty_milli, unit_price_minor FROM core.po_line WHERE po_id = $1`, [d.po])).toEqual({ qty_milli: "4000000", unit_price_minor: "40" });
    expect(await one(`SELECT draft_id, decided_by, verdict FROM core.decision WHERE id = $1`, [po.origin.decision_id]))
      .toEqual({ draft_id: d.id, decided_by: T.owner, verdict: "approved" });

    const again = await approve("owner", d.id, body);
    expect([again.status, again.headers.get(REPLAYED_HEADER), await again.text()]).toEqual([200, "true", text]);
    expect([await executions(), await poLines("one"), await decisions(d.id)]).toEqual([before + 1, 1, 1]);
  });

  it("(2) o1's manager on an o1 draft whose based_on cites a '*' snapshot → 403 authority_denied, nothing executes; the owner executes it", async () => {
    const [o1] = T.outlets;
    const { token } = await runToken(["*"]);
    // A sweep minting for one outlet stores that outlet's scope (T-043), so the payload's cells open for o1's manager.
    const short = await shortfall(token, o1);
    const price = await mint(token, "test.nb3_unit_price", { ingredient_id: T.ing.wide, outlet_id: o1 });
    const all = await shortfall(token, null);
    expect([short.outlet_scope, price.outlet_scope, all.outlet_scope]).toEqual([[o1], [o1], ["*"]]);
    const d = await poDraft(token, "wide", [o1], short, price, [snapRef(all.snapshot_id, rowOf(all, "wide"), "on_hand_qty_milli")]);
    expect((await call("GET", `/v1/drafts/${d.id}`, "mgr1")).status).toBe(200);

    const before = await executions();
    const denied = await approve("mgr1", d.id);
    expect([denied.status, await denied.json()]).toEqual([403, { error: { code: "forbidden", message: expect.any(String), reason_code: "authority_denied" } }]);
    expect([await statusOf(d.id), await decisions(d.id), await poLines("wide"), await executions()]).toEqual(["proposed", 0, 0, before]);

    const ok = await approve("owner", d.id);
    expect(ok.status).toBe(200);
    expect([await statusOf(d.id), await poLines("wide"), await executions()]).toEqual(["executed", 1, before + 1]);
  });

  it("(3) evidence that really changed under its own scope → 409 stale_draft with o1's own values, cited for the owner at [o1]; 0 executions", async () => {
    const [o1] = T.outlets;
    const { token } = await runToken([o1]);
    const short = await shortfall(token, null);
    const price = await mint(token, "test.nb3_unit_price", { ingredient_id: T.ing.changed, outlet_id: null });
    const d = await poDraft(token, "changed", [o1], short, price);
    // +500 g at o1: on hand 2,500 g, shortfall 3,500 g; left 1,500 / 500 / −500 g → the same stockout day, so the row matches.
    await receive(o1, T.ing.changed, 500_000);
    const before = await executions();
    const r = await approve("owner", d.id);
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.error).toEqual({ code: "stale_draft", message: expect.any(String), reason_code: "stale_draft" });
    expect(body.changes).toEqual([
      { ref: d.qty, value: 4_000_000, now_ref: expect.stringMatching(/^⟨snap:/), now: 3_500_000 },
      { ref: d.onHand, value: 2_000_000, now_ref: expect.stringMatching(/^⟨snap:/), now: 2_500_000 },
    ]);
    const nowSnap = /^⟨snap:([0-9a-f-]{36})/.exec(body.changes[0].now_ref)![1];
    expect(await one(`SELECT outlet_scope, minted_by_member_id, run_id FROM evidence.snapshot WHERE id = $1`, [nowSnap]))
      .toEqual({ outlet_scope: [o1], minted_by_member_id: T.owner, run_id: null });
    expect([await statusOf(d.id), await decisions(d.id), await poLines("changed"), await executions()]).toEqual(["stale", 0, 0, before]);
  });

  it("(4) a pooled [o1,o2] PO on o1's evidence: o1's manager → 403; the owner → executed, under the owner's own scope again", async () => {
    const [o1, o2] = T.outlets;
    const { token } = await runToken(["*"]);
    const short = await shortfall(token, o1);
    const price = await mint(token, "test.nb3_unit_price", { ingredient_id: T.ing.pooled, outlet_id: o1 });
    expect([short.outlet_scope, price.outlet_scope]).toEqual([[o1], [o1]]);
    const d = await poDraft(token, "pooled", [o1, o2], short, price);
    const before = await executions();
    const narrow = await approve("mgr1", d.id);
    expect([narrow.status, (await narrow.json()).error.reason_code]).toEqual([403, "authority_denied"]);
    expect([await statusOf(d.id), await decisions(d.id), await poLines("pooled")]).toEqual(["proposed", 0, 0]);

    const r = await approve("owner", d.id);
    const text = await r.text();
    expect([r.status, r.status === 200 ? null : JSON.parse(text).error.code]).toEqual([200, null]);
    expect((await one<{ outlet_ids: string[] }>(`SELECT outlet_ids FROM core.purchase_order WHERE id = $1`, [d.po])).outlet_ids.sort()).toEqual([o1, o2].sort());
    expect([await statusOf(d.id), await poLines("pooled"), await executions()]).toEqual(["executed", 1, before + 1]);
  });

  it("(5) every PO row here traces to a decision by the owner on its own draft (and its audit entry carries it); the audit chain verifies", async () => {
    const ings = Object.values(T.ing);
    const pos = await count(`SELECT count(DISTINCT l.po_id) n FROM core.po_line l WHERE l.tenant_id = $1 AND l.ingredient_id = ANY ($2::uuid[])`, [T.tenant, ings]);
    expect(pos).toBe(3); // (1), (2), (4); (3) went stale
    const orphans = await count(
      `SELECT count(*) n FROM core.purchase_order p WHERE p.tenant_id = $1
          AND EXISTS (SELECT 1 FROM core.po_line l WHERE l.tenant_id = p.tenant_id AND l.po_id = p.id AND l.ingredient_id = ANY ($2::uuid[]))
          AND NOT EXISTS (SELECT 1 FROM core.decision d JOIN core.draft r ON r.tenant_id = d.tenant_id AND r.id = d.draft_id
                           JOIN core.audit_log a ON a.tenant_id = p.tenant_id AND a.entity = 'core.purchase_order' AND a.entity_id = p.id::text AND a.decision_id = d.id
                          WHERE d.tenant_id = p.tenant_id AND d.id = (p.origin->>'decision_id')::uuid AND d.decided_by = $3
                            AND r.command_payload->>'po_id' = p.id::text)`, [T.tenant, ings, T.owner]);
    expect(orphans).toBe(0);
    const v = await verifyAuditChain(svcTx(db), T.tenant);
    expect(v.ok).toBe(true);
    expect(v.rows).toBeGreaterThan(0);
  });
});
