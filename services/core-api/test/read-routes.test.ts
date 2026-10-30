// T-092a/b gates — the W4 read routes, through the real app (member auth -> withContext -> RLS), embedded Postgres, synthetic data.
//   (1) every listed route returns the fixture row count and 0 rows of another outlet. Expected counts are HAND VALUES
//       read off db/src/world.ts (one order, shift, count, waste row, calendar row and pickup window in each of outlets 1 and 2;
//       two transfers 1->2 and 2->3; one settlement / line / bank line / dispute / period close; …) plus the rows planted below.
//   (2) route-table diff vs docs/plan/W4-READ-ROUTES.md (parsed from the committed table, "(+ …)" sub-routes expanded) = 0 missing
//   (3) every new route has an OpenAPI operation and a real response parses against its contract (SCHEMAS["…"].parse)
//   (4) a write verb on any new path -> 405
//   (5) a staff member's roster read returns only their own shifts: 1 of 5
// Plus: cursor pagination, malformed filters -> 400, finance routes are tenant-wide roles only, wage routes refuse staff,
// untrusted text comes back as plain strings, operator-only spend, and the outlet-local day maths on both DST transitions
// (Australia/Melbourne: 4 Oct 2026 forward, 4 Apr 2027 back).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { createLogger } from "@munim/config";
import { loadRegistry } from "@munim/contracts/registry";
import { buildWorld, type TestDb, uuidv7, type World } from "@munim/db";
import type { Hono } from "hono";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { type AppEnv, createApp, storefrontResolver, TENANT_HEADER } from "../src/app.ts";
import { openDb } from "./db.ts";

const idp = createLocalIdp();
const reg = await loadRegistry();
const SCHEMAS: any = Object.fromEntries(reg.schemas.map(([n, s]) => [n, s]));

let db: TestDb;
let pools: { core: pg.Pool; svc: pg.Pool; platform: pg.Pool };
let app: Hono<AppEnv>;
let w: World;
const subs = { owner: `owner-${uuidv7()}`, staff: `staff-${uuidv7()}`, mgr1: `mgr1-${uuidv7()}`, mgr2: `mgr2-${uuidv7()}`, advisor: `advisor-${uuidv7()}`, op: `op-${uuidv7()}` };
type Who = keyof typeof subs;
const ids = { mgr1: uuidv7(), mgr2: uuidv7(), advisor: uuidv7(), opId: uuidv7() };
const planted = {
  z9o0: [uuidv7(), uuidv7(), uuidv7()], z9o1: [uuidv7(), uuidv7()], roster: uuidv7(), staffA: uuidv7(), staffB: uuidv7(),
  melbourne: uuidv7(), conv: uuidv7(), shiftTender: uuidv7(), world: { shift0: "", shift1: "" },
};

type Res = { status: number; headers: Headers; body: any; text: string };
async function call(method: string, path: string, who: Who | null, tenant = w.tenant): Promise<Res> {
  const r = await app.request(path, {
    method,
    headers: { ...(who ? { Authorization: `Bearer ${idp.sign({ sub: subs[who] })}` } : {}), ...(who !== "op" ? { [TENANT_HEADER]: tenant } : {}) },
  });
  const text = await r.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: r.status, headers: r.headers, body, text };
}
const get = (path: string, who: Who) => call("GET", path, who);
const ctx = (command_type: string) => ({ tenant_id: w.tenant, outlet_ids: "*" as const, role: "owner" as const, member_id: w.owner, command_type });
const plant = (command_type: string, fn: (q: (sql: string, p?: unknown[]) => Promise<pg.QueryResult>) => Promise<void>) =>
  db.withContext("munim_core", ctx(command_type), async (c) => fn((sql, p) => c.query(sql, p)));
const o = (i: 0 | 1 | 2) => w.outlets[i];

beforeAll(async () => {
  db = await openDb();
  w = await buildWorld(db);
  // Members: the world's owner and staff (outlet 1 only), a manager per outlet, an advisor (tenant-wide), and an operator.
  await plant("tenancy.member.invite.v1", async (q) => {
    await q(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [w.owner, subs.owner]);
    await q(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [w.staff, subs.staff]);
    for (const [who, id, outlet] of [["mgr1", ids.mgr1, o(0)], ["mgr2", ids.mgr2, o(1)]] as const) {
      await q(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, $4, $5)`, [w.tenant, id, subs[who], `Synthetic ${who}`, `${who}@example.test`]);
      await q(`INSERT INTO core.membership (tenant_id, member_id, role, outlet_ids) VALUES ($1, $2, 'manager', $3)`, [w.tenant, id, [outlet]]);
    }
    await q(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, 'Synthetic advisor', 'advisor@example.test')`, [w.tenant, ids.advisor, subs.advisor]);
    await q(`INSERT INTO core.membership (tenant_id, member_id, role) VALUES ($1, $2, 'advisor')`, [w.tenant, ids.advisor]);
  });
  await db.admin(`INSERT INTO platform.operator (id, idp_sub, email) VALUES ($1, $2, 'op@example.test')`, [ids.opId, subs.op]);

  // Orders: 3 at outlet 1 and 2 at outlet 2 carrying the marker table Z9; one card tender on the first, taken in outlet 1's world shift.
  const shiftRows = (await db.admin(`SELECT id, outlet_id FROM core.shift WHERE tenant_id = $1`, [w.tenant])).rows;
  expect(shiftRows).toHaveLength(2); // world.ts: one open shift in each of outlets 1 and 2
  planted.world.shift0 = shiftRows.find((r) => r.outlet_id === o(0))!.id;
  planted.world.shift1 = shiftRows.find((r) => r.outlet_id === o(1))!.id;
  await plant("orders.place.v1", async (q) => {
    for (const [outlet, list] of [[o(0), planted.z9o0], [o(1), planted.z9o1]] as const)
      for (const id of list)
        await q(`INSERT INTO core."order" (tenant_id, id, outlet_id, channel_id, kind, table_ref, status, subtotal_minor, tax_minor, total_minor, currency, pricing_snapshot)
                 VALUES ($1, $2, $3, $4, 'dine_in', 'Z9', 'placed', 32000, 1600, 33600, $5, '{}')`, [w.tenant, id, outlet, w.channel, w.currency]);
  });
  await plant("orders.tender.record.v1", async (q) => {
    await q(`INSERT INTO core.tender (tenant_id, id, outlet_id, order_id, shift_id, method, amount_minor, currency, recorded_by)
             VALUES ($1, $2, $3, $4, $5, 'card', 33600, $6, $7)`, [w.tenant, planted.shiftTender, o(0), planted.z9o0[0], planted.world.shift0, w.currency, w.owner]);
  });

  // People: a roster at outlet 1 (week of 2 Nov 2026) with 5 shifts, 1 of them the world's staff member's (staff row `w.person`).
  await plant("people.staff.upsert.v1", async (q) => {
    for (const [id, name] of [[planted.staffA, "Cook A"], [planted.staffB, "Cook B"]] as const)
      await q(`INSERT INTO core.staff (tenant_id, id, outlet_id, name, role_key, pay_basis, wage_rate_minor, ot_multiplier_bp, currency, joined_on)
               VALUES ($1, $2, $3, $4, 'cook', 'hourly', 15000, 15000, $5, '2026-01-01')`, [w.tenant, id, o(0), name, w.currency]);
  });
  await plant("people.roster.create.v1", async (q) => {
    await q(`INSERT INTO core.roster (tenant_id, id, outlet_id, week_start) VALUES ($1, $2, $3, '2026-11-02')`, [w.tenant, planted.roster, o(0)]);
    for (const [staff, start] of [[w.person, "2026-11-02T09:00:00Z"], [planted.staffA, "2026-11-02T09:00:00Z"], [planted.staffA, "2026-11-03T09:00:00Z"],
      [planted.staffB, "2026-11-02T09:00:00Z"], [planted.staffB, "2026-11-03T09:00:00Z"]] as const)
      await q(`INSERT INTO core.roster_shift (tenant_id, id, roster_id, outlet_id, staff_id, starts_at, ends_at, role_key)
               VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz + interval '8 hours', 'cook')`, [w.tenant, uuidv7(), planted.roster, o(0), staff, start]);
  });

  // A conversation at outlet 2 whose text is hostile markup (it must come back as the same plain string).
  await db.withContext("munim_core", ctx("imports.run.commit.v1"), async (c) => {
    await c.query(`INSERT INTO core.conversation (tenant_id, id, outlet_id, kind, title) VALUES ($1, $2, $3, 'other', $4)`, [w.tenant, planted.conv, o(1), HOSTILE_TITLE]);
    await c.query(`INSERT INTO core.message (tenant_id, id, conversation_id, author_label, body, sent_at) VALUES ($1, $2, $3, $4, $5, '2026-10-09T10:00:00Z'), ($6, $7, $3, 'Chef', 'second', '2026-10-09T10:01:00Z')`,
      [w.tenant, uuidv7(), planted.conv, "<b>chef</b>", HOSTILE_BODY, w.tenant, uuidv7()]);
  });

  // A Melbourne outlet with pickup windows around both DST transitions (hand values in the DST test).
  await plant("tenancy.outlet.create.v1", async (q) => {
    await q(`INSERT INTO core.outlet (tenant_id, id, name, kind, tz, address) VALUES ($1, $2, 'Melbourne (synthetic)', 'restaurant', 'Australia/Melbourne', 'Synthetic street')`, [w.tenant, planted.melbourne]);
    for (const at of ["2026-10-06T15:30:00Z", "2026-10-06T17:00:00Z", "2026-10-03T13:59:00Z", "2026-10-03T14:00:00Z", "2026-10-04T12:59:00Z", "2026-10-04T13:00:00Z",
      "2027-04-03T12:59:00Z", "2027-04-03T13:00:00Z", "2027-04-04T13:59:00Z", "2027-04-04T14:00:00Z"])
      await q(`INSERT INTO core.pickup_window (tenant_id, id, outlet_id, starts_at, ends_at, capacity_orders) VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '15 minutes', 5)`,
        [w.tenant, uuidv7(), planted.melbourne, at]);
  });

  // Business-day rows at the Melbourne outlet (cutoff 04:00, the column default) around both transitions: the instants below are chosen
  // so the plain local date and the business date (local - cutoff) DISAGREE; hand-derived dates are in the DST test.
  const instants = [...FORWARD, ...BACK].map(([at]) => at);
  await plant("inventory.waste.record.v1", async (q) => {
    for (const at of instants)
      await q(`INSERT INTO core.waste_log (tenant_id, id, outlet_id, ingredient_id, qty_milli, unit, reason, recorded_by, at)
               VALUES ($1, $2, $3, $4, 1000, 'g', 'overprep', $5, $6::timestamptz)`, [w.tenant, uuidv7(), planted.melbourne, w.ingredient, w.owner, at]);
  });
  await plant("orders.shift.open.v1", async (q) => {
    for (const at of instants)
      await q(`INSERT INTO core.shift (tenant_id, id, outlet_id, opened_by, opened_at, float_minor, currency) VALUES ($1, $2, $3, $4, $5::timestamptz, 1000, $6)`,
        [w.tenant, uuidv7(), planted.melbourne, w.owner, at, w.currency]);
  });
  await plant("people.attendance.record.v1", async (q) => {
    for (const at of instants)
      await q(`INSERT INTO core.attendance (tenant_id, id, outlet_id, staff_id, clock_in_at, clock_out_at, source, recorded_by)
               VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz + interval '10 minutes', 'manual', $6)`, [w.tenant, uuidv7(), planted.melbourne, planted.staffA, at, w.owner]);
  });

  pools = { core: db.pool("munim_core", 6), svc: db.pool("munim_svc", 2), platform: db.pool("munim_platform", 2) };
  const config = { nodeEnv: "test", redact: (s: string) => s };
  app = await createApp({ pools, idp, storefronts: storefrontResolver(pools.core), config, log: createLogger(config, () => {}) } as never);
});
afterAll(async () => {
  await Promise.all([pools?.core.end(), pools?.svc.end(), pools?.platform.end()]);
});

// [instant, hand-derived business date at Australia/Melbourne with the 04:00 cutoff]. Forward transition 2026-10-04 02:00 AEST -> 03:00 AEDT
// (16:00Z on the 3rd); back transition 2027-04-04 03:00 AEDT -> 02:00 AEST (16:00Z on the 3rd). Local time less 4h, then the date:
const FORWARD: Array<[string, string]> = [
  ["2026-10-03T15:30:00Z", "2026-10-03"], // 01:30 AEST on the 4th -> 21:30 on the 3rd
  ["2026-10-03T16:30:00Z", "2026-10-03"], // 03:30 AEDT on the 4th -> 23:30 on the 3rd (the plain local date says the 4th)
  ["2026-10-03T17:30:00Z", "2026-10-04"], // 04:30 AEDT -> 00:30 on the 4th
  ["2026-10-04T16:30:00Z", "2026-10-04"], // 03:30 AEDT on the 5th -> 23:30 on the 4th
];
const BACK: Array<[string, string]> = [
  ["2027-04-03T15:30:00Z", "2027-04-03"], // 02:30 AEDT (first pass) on the 4th -> 22:30 on the 3rd
  ["2027-04-03T16:30:00Z", "2027-04-03"], // 02:30 AEST (second pass) -> 22:30 on the 3rd
  ["2027-04-03T17:30:00Z", "2027-04-03"], // 03:30 AEST -> 23:30 on the 3rd
  ["2027-04-03T18:30:00Z", "2027-04-04"], // 04:30 AEST -> 00:30 on the 4th
  ["2027-04-04T17:30:00Z", "2027-04-04"], // 03:30 AEST on the 5th -> 23:30 on the 4th
];
const HOSTILE_TITLE = "<img src=x onerror=alert(1)> handover";
const HOSTILE_BODY = "Fridge warm <script>alert('x')</script> & call \"them\"";

describe("(1) fixture row counts and outlet isolation", () => {
  it("orders: hand counts 7 / 4 / 3 (2 world + 5 planted); Z9 marker 5 / 3 / 2; never another outlet's row", async () => {
    const all = await get("/v1/orders?limit=200", "owner");
    expect(all.status).toBe(200);
    SCHEMAS["v1.orders.list"].parse(all.body);
    expect(all.body.items).toHaveLength(7);
    const m1 = await get("/v1/orders?limit=200", "mgr1");
    const m2 = await get("/v1/orders?limit=200", "mgr2");
    expect(m1.body.items).toHaveLength(4);
    expect(m2.body.items).toHaveLength(3);
    expect(m1.body.items.filter((x: any) => x.outlet_id !== o(0))).toHaveLength(0);
    expect(m2.body.items.filter((x: any) => x.outlet_id !== o(1))).toHaveLength(0);
    expect((await get("/v1/orders?table_ref=Z9", "owner")).body.items).toHaveLength(5);
    expect((await get("/v1/orders?table_ref=Z9", "mgr1")).body.items).toHaveLength(3);
    expect((await get("/v1/orders?table_ref=Z9", "mgr2")).body.items).toHaveLength(2);
    expect((await get("/v1/orders?table_ref=Z9&status=placed", "owner")).body.items).toHaveLength(5);
    expect((await get("/v1/orders?table_ref=Z9&status=completed", "owner")).body.items).toHaveLength(0);
    expect((await get(`/v1/orders?outlet=${o(1)}`, "owner")).body.items.every((x: any) => x.outlet_id === o(1))).toBe(true);
    // An outlet outside the manager's scope is not found, never an empty page that confirms it exists.
    expect((await get(`/v1/orders?outlet=${o(1)}`, "mgr1")).status).toBe(404);
  });

  it("orders?shift= : the one order the shift took a tender for; business_date filters", async () => {
    const r = await get(`/v1/orders?shift=${planted.world.shift0}`, "owner");
    expect(r.body.items.map((x: any) => x.order_id)).toEqual([planted.z9o0[0]]);
    expect((await get(`/v1/orders?shift=${planted.world.shift0}`, "mgr2")).body.items).toHaveLength(0);
    const day = (await get("/v1/orders?table_ref=Z9", "owner")).body.items[0].business_date as string;
    expect((await get(`/v1/orders?table_ref=Z9&business_date=${day}`, "owner")).body.items).toHaveLength(5);
    expect((await get("/v1/orders?table_ref=Z9&business_date=1999-01-01", "owner")).body.items).toHaveLength(0);
  });

  it("shifts: 2 world shifts (+ 9 planted at Melbourne for the owner) / 1 / 1, filters by status and device, from/to by the business day", async () => {
    const all = await get("/v1/shifts", "owner");
    SCHEMAS["v1.shifts.list"].parse(all.body);
    expect(all.body.items).toHaveLength(11); // world.ts: one open shift in each of outlets 1 and 2, + 9 planted at the Melbourne outlet
    expect((await get("/v1/shifts", "mgr1")).body.items.map((x: any) => x.shift_id)).toEqual([planted.world.shift0]);
    expect((await get("/v1/shifts", "mgr2")).body.items.map((x: any) => x.shift_id)).toEqual([planted.world.shift1]);
    expect((await get("/v1/shifts?status=open", "owner")).body.items).toHaveLength(11);
    expect((await get("/v1/shifts?status=closed", "owner")).body.items).toHaveLength(0);
    expect((await get(`/v1/shifts?device=${w.devices[0]}`, "owner")).body.items.map((x: any) => x.shift_id)).toEqual([planted.world.shift0]);
    expect((await get("/v1/shifts?from=2999-01-01", "owner")).body.items).toHaveLength(0);
    expect((await get("/v1/shifts?from=2020-01-01&to=2999-01-01", "owner")).body.items).toHaveLength(11);
    expect((await get(`/v1/shifts?outlet=${o(1)}`, "mgr1")).status).toBe(404);
  });

  it("finance: 1 settlement, 1 line, 1 bank line, 1 dispute (1 line), 1 period close for owner and advisor; a manager gets 403", async () => {
    for (const who of ["owner", "advisor"] as const) {
      const s = await get("/v1/finance/settlements", who);
      SCHEMAS["v1.finance.settlements"].parse(s.body);
      expect(s.body.items).toHaveLength(1);
      expect(s.body.items[0]).toMatchObject({ external_ref: "PAYOUT-1", net_minor: 26208, currency: "INR" });
      const l = await get("/v1/finance/settlement-lines", who);
      SCHEMAS["v1.finance.settlement-lines"].parse(l.body);
      expect(l.body.items).toHaveLength(1);
      expect(l.body.items[0]).toMatchObject({ gross_minor: 33600, commission_minor: 7392, net_minor: 26208, line_kind: "order" });
      const b = await get("/v1/finance/bank-lines", who);
      SCHEMAS["v1.finance.bank-lines"].parse(b.body);
      expect(b.body.items).toHaveLength(1);
      expect(b.body.items[0]).toMatchObject({ external_ref: "UTR-1", amount_minor: 26208, method: "upi", value_date: "2026-10-08" });
      const d = await get("/v1/finance/disputes", who);
      SCHEMAS["v1.finance.disputes"].parse(d.body);
      expect(d.body.items).toHaveLength(1);
      const one = await get(`/v1/finance/disputes/${d.body.items[0].dispute_id}`, who);
      SCHEMAS["v1.finance.dispute"].parse(one.body);
      expect(one.body.lines).toHaveLength(1);
      expect(one.body).toMatchObject({ total_claimed_minor: 500, basis: "short_payout" });
      const p = await get("/v1/finance/period-closes", who);
      SCHEMAS["v1.finance.period-closes"].parse(p.body);
      expect(p.body.items).toHaveLength(1);
      expect(p.body.items[0].period_month).toBe("2025-03-01");
    }
    // filters: the channel, the period, the value date, the dispute status
    expect((await get(`/v1/finance/settlements?channel=${w.channel}`, "owner")).body.items).toHaveLength(1);
    expect((await get(`/v1/finance/settlements?channel=${uuidv7()}`, "owner")).body.items).toHaveLength(0);
    expect((await get("/v1/finance/settlements?from=2026-10-08", "owner")).body.items).toHaveLength(0);
    expect((await get("/v1/finance/settlement-lines?from=2026-10-07&to=2026-10-31", "owner")).body.items).toHaveLength(1);
    expect((await get("/v1/finance/bank-lines?from=2026-10-09", "owner")).body.items).toHaveLength(0);
    expect((await get("/v1/finance/disputes?status=recorded", "owner")).body.items).toHaveLength(1);
    expect((await get("/v1/finance/disputes?status=resolved", "owner")).body.items).toHaveLength(0);
    expect((await get(`/v1/finance/disputes/${uuidv7()}`, "owner")).status).toBe(404);
    for (const path of ["settlements", "settlement-lines", "bank-lines", "disputes", "period-closes"]) {
      expect((await get(`/v1/finance/${path}`, "mgr1")).status).toBe(403);
      expect((await get(`/v1/finance/${path}`, "staff")).status).toBe(403);
    }
  });

  it("inventory: ingredients, waste, counts, transfers (hand counts from the world)", async () => {
    const ing = await get("/v1/inventory/ingredients", "owner");
    SCHEMAS["v1.inventory.ingredients"].parse(ing.body);
    expect(ing.body.items).toHaveLength(1);
    expect((await get("/v1/inventory/ingredients?q=zzzz-no-such", "owner")).body.items).toHaveLength(0);
    expect((await get(`/v1/inventory/ingredients?q=${encodeURIComponent(ing.body.items[0].name.slice(0, 3).toUpperCase())}`, "owner")).body.items).toHaveLength(1);
    expect((await get("/v1/inventory/ingredients?q=%25", "owner")).body.items).toHaveLength(0); // LIKE wildcards are literal

    for (const [outlet, who, other] of [[o(0), "mgr1", o(1)], [o(1), "mgr2", o(0)]] as const) {
      const waste = await get(`/v1/inventory/waste?outlet=${outlet}`, who);
      SCHEMAS["v1.inventory.waste"].parse(waste.body);
      expect(waste.body.items).toHaveLength(1);
      expect(waste.body.items[0]).toMatchObject({ outlet_id: outlet, qty_milli: 100000, unit: "g", reason: "overprep" });
      expect((await get(`/v1/inventory/waste?outlet=${other}`, who)).status).toBe(404);
      const counts = await get(`/v1/inventory/counts?outlet=${outlet}`, who);
      SCHEMAS["v1.inventory.counts"].parse(counts.body);
      expect(counts.body.items).toHaveLength(1);
      expect(counts.body.items[0].lines).toHaveLength(1);
      expect(counts.body.items[0].lines[0]).toMatchObject({ expected_qty_milli: 5000000, counted_qty_milli: 4900000, unit: "g" });
      expect((await get(`/v1/inventory/counts?outlet=${other}`, who)).status).toBe(404);
    }
    const today = (await get(`/v1/inventory/waste?outlet=${o(0)}`, "owner")).body.items[0].business_date as string;
    expect((await get(`/v1/inventory/waste?outlet=${o(0)}&business_date=${today}`, "owner")).body.items).toHaveLength(1);
    expect((await get(`/v1/inventory/waste?outlet=${o(0)}&business_date=2000-01-01`, "owner")).body.items).toHaveLength(0);
    expect((await get("/v1/inventory/counts", "owner")).body.items).toHaveLength(2);
    expect((await get("/v1/inventory/counts", "mgr1")).body.items).toHaveLength(1);
    expect((await get("/v1/inventory/counts?status=open", "owner")).body.items).toHaveLength(2); // core.stock_count defaults to 'open'
    expect((await get("/v1/inventory/counts?status=submitted", "owner")).body.items).toHaveLength(0);
    const cid = (await get(`/v1/inventory/counts?outlet=${o(0)}`, "owner")).body.items[0].stock_count_id;
    const one = await get(`/v1/inventory/counts/${cid}`, "mgr1");
    SCHEMAS["v1.inventory.count"].parse(one.body);
    expect(one.body.lines).toHaveLength(1);
    expect((await get(`/v1/inventory/counts/${cid}`, "mgr2")).status).toBe(404);

    // transfers: outlet1->2 and outlet2->3; visible from either end
    const t = await get("/v1/inventory/transfers", "owner");
    SCHEMAS["v1.inventory.transfers"].parse(t.body);
    expect(t.body.items).toHaveLength(2);
    expect((await get("/v1/inventory/transfers", "mgr1")).body.items).toHaveLength(1);
    expect((await get("/v1/inventory/transfers", "mgr2")).body.items).toHaveLength(2);
    expect((await get(`/v1/inventory/transfers?outlet=${o(2)}`, "owner")).body.items).toHaveLength(1);
    expect((await get("/v1/inventory/transfers?status=sent", "owner")).body.items).toHaveLength(2);
    expect((await get("/v1/inventory/transfers?status=received", "owner")).body.items).toHaveLength(0);
    expect(t.body.items.flatMap((x: any) => x.lines)).toHaveLength(1);
  });

  it("movements: the new kind and ref filters (the world's receipt per outlet)", async () => {
    const all = await get(`/v1/inventory/movements?outlet=${o(0)}`, "owner");
    expect(all.body.movements.length).toBeGreaterThanOrEqual(1);
    const receipt = await get(`/v1/inventory/movements?outlet=${o(0)}&kind=receipt`, "owner");
    expect(receipt.body.movements).toHaveLength(1);
    const ref = receipt.body.movements[0].ref_id as string;
    expect((await get(`/v1/inventory/movements?outlet=${o(0)}&ref=${ref}`, "owner")).body.movements).toHaveLength(1);
    expect((await get(`/v1/inventory/movements?outlet=${o(0)}&ref=${uuidv7()}`, "owner")).body.movements).toHaveLength(0);
    expect((await get(`/v1/inventory/movements?outlet=${o(0)}&kind=waste`, "owner")).body.movements.every((m: any) => m.kind === "waste")).toBe(true);
    expect((await get(`/v1/inventory/movements?outlet=${o(0)}&kind=nope`, "owner")).status).toBe(400);
  });

  it("people: rosters, attendance, advances, payroll drafts (hand counts) with outlet isolation", async () => {
    const r = await get("/v1/people/rosters?limit=100", "owner");
    SCHEMAS["v1.people.rosters"].parse(r.body);
    expect(r.body.items).toHaveLength(3); // 2 world rosters (week 5 Oct) + the planted one
    expect(r.body.items.flatMap((x: any) => x.shifts)).toHaveLength(7);
    expect((await get("/v1/people/rosters?week=2026-11-02", "owner")).body.items).toHaveLength(1);
    expect((await get("/v1/people/rosters?week=2026-10-05", "mgr2")).body.items.map((x: any) => x.outlet_id)).toEqual([o(1)]);
    expect((await get(`/v1/people/rosters?outlet=${o(1)}`, "mgr1")).status).toBe(404);
    const a = await get("/v1/people/attendance", "owner");
    SCHEMAS["v1.people.attendance"].parse(a.body);
    expect(a.body.items).toHaveLength(11); // 2 world + 9 planted at the Melbourne outlet
    expect((await get("/v1/people/attendance", "mgr1")).body.items).toHaveLength(1);
    expect((await get("/v1/people/attendance", "mgr2")).body.items).toHaveLength(1);
    expect((await get("/v1/people/attendance?from=2026-10-07&to=2026-10-07", "owner")).body.items.map((x: any) => x.outlet_id)).toEqual([o(1)]);
    const adv = await get("/v1/people/advances", "owner");
    SCHEMAS["v1.people.advances"].parse(adv.body);
    expect(adv.body.items).toHaveLength(1);
    expect(adv.body.items[0]).toMatchObject({ amount_minor: 1500000, kind: "given", staff_id: w.person });
    expect((await get("/v1/people/advances", "mgr1")).body.items).toHaveLength(1);
    expect((await get("/v1/people/advances", "mgr2")).body.items).toHaveLength(0);
    expect((await get("/v1/people/advances?status=recovered", "owner")).body.items).toHaveLength(0);
    expect((await get(`/v1/people/advances?staff=${w.person}`, "owner")).body.items).toHaveLength(1);
    const pd = await get("/v1/people/payroll-drafts", "owner");
    SCHEMAS["v1.people.payroll-drafts"].parse(pd.body);
    expect(pd.body.items).toHaveLength(1);
    expect(pd.body.items[0].lines).toHaveLength(1);
    expect(pd.body.items[0].lines[0]).toMatchObject({ base_minor: 2400000, overtime_minor: 112500, net_minor: 2512500 });
    expect((await get("/v1/people/payroll-drafts?month=2026-09-01", "mgr1")).body.items).toHaveLength(1);
    expect((await get("/v1/people/payroll-drafts", "mgr2")).body.items).toHaveLength(0);
    expect((await get("/v1/people/payroll-drafts?month=2026-09-15", "owner")).status).toBe(400);
    // wages are not for staff-role members
    expect((await get("/v1/people/advances", "staff")).status).toBe(403);
    expect((await get("/v1/people/payroll-drafts", "staff")).status).toBe(403);
  });

  it("catalogue: items, recipes, prices (future-dated included), deals, coupons", async () => {
    const items = await get("/v1/catalogue/items", "owner");
    SCHEMAS["v1.catalogue.items"].parse(items.body);
    expect(items.body.items.length).toBeGreaterThanOrEqual(1);
    expect(items.body.items.some((i: any) => i.item_id === w.item)).toBe(true);
    const rec = await get(`/v1/catalogue/recipes?item=${w.item}`, "mgr1");
    SCHEMAS["v1.catalogue.recipes"].parse(rec.body);
    expect(rec.body.items).toHaveLength(1);
    expect(rec.body.items[0].lines).toHaveLength(1);
    expect(rec.body.items[0].lines[0]).toMatchObject({ qty_milli: 150000, unit: "g" });
    expect((await get(`/v1/catalogue/recipes?item=${uuidv7()}`, "owner")).body.items).toHaveLength(0);
    // prices: the world's current window at outlet 1 plus a planted future-dated one
    await plant("catalogue.price.set.v1", async (q) => {
      await q(`INSERT INTO core.price (tenant_id, id, item_id, outlet_id, channel_kind, amount_minor, currency, tax_class, valid_from)
               VALUES ($1, $2, $3, $4, 'table_qr', 35000, $5, 'restaurant_5', '2999-01-01')`, [w.tenant, uuidv7(), w.item, o(0), w.currency]);
    });
    const pr = await get(`/v1/catalogue/prices?item=${w.item}`, "owner");
    SCHEMAS["v1.catalogue.prices"].parse(pr.body);
    expect(pr.body.items).toHaveLength(2);
    expect(pr.body.items.map((p: any) => p.valid_from).sort()).toEqual(["2026-10-01", "2999-01-01"]);
    expect((await get(`/v1/catalogue/prices?outlet=${o(0)}&channel_kind=counter`, "mgr1")).body.items).toHaveLength(1);
    expect((await get(`/v1/catalogue/prices?outlet=${o(0)}&channel_kind=table_qr`, "mgr1")).body.items.map((p: any) => p.valid_from)).toEqual(["2999-01-01"]);
    expect((await get(`/v1/catalogue/prices?outlet=${o(1)}`, "owner")).body.items).toHaveLength(0);
    expect((await get(`/v1/catalogue/prices`, "mgr2")).body.items).toHaveLength(0);
    expect((await get(`/v1/catalogue/prices?channel_kind=bogus`, "owner")).status).toBe(400);
    const deals = await get("/v1/catalogue/deals", "mgr1");
    SCHEMAS["v1.catalogue.deals"].parse(deals.body);
    expect(deals.body.items).toHaveLength(1);
    // a deal pinned to outlet 2 is invisible to the outlet-1 manager and visible to the outlet-2 manager
    const pinned = uuidv7();
    await plant("catalogue.deal.upsert.v1", async (q) => {
      await q(`INSERT INTO core.deal (tenant_id, id, kind, name_key, rule, outlet_ids, valid_from) VALUES ($1, $2, 'percent_off', 'deal.pinned', $3, $4, '2026-10-01')`,
        [w.tenant, pinned, { kind: "percent_off", bp: 500, item_ids: [w.item] }, [o(1)]]);
    });
    expect((await get("/v1/catalogue/deals", "mgr1")).body.items).toHaveLength(1);
    expect((await get("/v1/catalogue/deals", "mgr2")).body.items).toHaveLength(2);
    expect((await get("/v1/catalogue/deals", "owner")).body.items).toHaveLength(2);
    const coupons = await get("/v1/catalogue/coupons", "staff");
    SCHEMAS["v1.catalogue.coupons"].parse(coupons.body);
    expect(coupons.body.items).toHaveLength(1);
    expect(coupons.body.items[0]).toMatchObject({ code: "WELCOME10", value_bp: 1000, kind: "percent" });
  });

  it("outlet calendar and pickup windows (member); an outlet outside the scope is 404", async () => {
    const cal = await get(`/v1/outlets/${o(0)}/calendar`, "mgr1");
    expect(cal.status).toBe(200);
    SCHEMAS["v1.outlet.calendar"].parse(cal.body);
    expect(cal.body.rows).toHaveLength(1);
    expect(cal.body.rows[0]).toMatchObject({ kind: "weekly", weekday: 1, opens_at: "09:00", closes_at: "22:00", closed: false });
    expect(cal.body.tz).toBe("Asia/Kolkata");
    expect((await get(`/v1/outlets/${o(1)}/calendar`, "mgr1")).status).toBe(404);
    expect((await get(`/v1/outlets/${uuidv7()}/calendar`, "owner")).status).toBe(404);
    // the world's window starts one hour after the build: its Asia/Kolkata calendar day is computed here independently (Intl)
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
    // pickup-window dates are BUSINESS dates (local less the 04:00 cutoff), so the candidates are the cutoff-shifted instants
    const cands = [3_300_000, 3_900_000].map((ms) => local.format(new Date(Date.now() + ms - 4 * 3_600_000)));
    const hits = await Promise.all([...new Set(cands)].map((d) => get(`/v1/pickup-windows?outlet=${o(0)}&date=${d}`, "mgr1")));
    const win = hits.find((h) => h.body.items.length === 1)!;
    expect(win).toBeDefined();
    SCHEMAS["v1.pickup-windows.list"].parse(win.body);
    expect(win.body.items[0]).toMatchObject({ outlet_id: o(0), capacity_orders: 10, booked: 0 });
    expect((await get(`/v1/pickup-windows?outlet=${o(1)}&date=${cands[0]}`, "mgr1")).status).toBe(404);
    expect((await get(`/v1/pickup-windows?outlet=${o(0)}`, "mgr1")).status).toBe(400);
  });

  it("DST: pickup-window dates are BUSINESS dates (local less the 04:00 cutoff) across both Melbourne transitions (hand counts)", async () => {
    const day = async (d: string) => (await get(`/v1/pickup-windows?outlet=${planted.melbourne}&date=${d}`, "owner")).body.items.map((x: any) => x.starts_at);
    // forward 4 Oct 2026 (a 23-hour day): 00:00 AEST on the 4th (14:00Z) is still business day 3 Oct; 00:00 AEDT on the 5th (13:00Z) is still the 4th
    expect(await day("2026-10-03")).toEqual(["2026-10-03T13:59:00.000Z", "2026-10-03T14:00:00.000Z"]);
    expect(await day("2026-10-04")).toEqual(["2026-10-04T12:59:00.000Z", "2026-10-04T13:00:00.000Z"]);
    expect(await day("2026-10-05")).toEqual([]);
    // back 4 Apr 2027 (a 25-hour day)
    expect(await day("2027-04-03")).toEqual(["2027-04-03T12:59:00.000Z", "2027-04-03T13:00:00.000Z"]);
    expect(await day("2027-04-04")).toEqual(["2027-04-04T13:59:00.000Z", "2027-04-04T14:00:00.000Z"]);
    expect(await day("2027-04-05")).toEqual([]);
  });

  it("pickup windows: a late-night slot before the cutoff belongs to the previous business date; the cutoff instant starts the next", async () => {
    const day = async (d: string) => (await get(`/v1/pickup-windows?outlet=${planted.melbourne}&date=${d}`, "owner")).body.items.map((x: any) => x.starts_at);
    // 02:30 AEDT on 7 Oct (15:30Z on the 6th) is before the 04:00 cutoff: business date 6 Oct. 04:00 AEDT (17:00Z) is business date 7 Oct.
    expect(await day("2026-10-06")).toEqual(["2026-10-06T15:30:00.000Z"]);
    expect(await day("2026-10-07")).toEqual(["2026-10-06T17:00:00.000Z"]);
  });

  it("DST: waste, shift and attendance days are BUSINESS days (local less the cutoff) across both transitions (hand counts)", async () => {
    const want = new Map<string, number>();
    for (const [, d] of [...FORWARD, ...BACK]) want.set(d, (want.get(d) ?? 0) + 1);
    expect([...want.entries()]).toEqual([["2026-10-03", 2], ["2026-10-04", 2], ["2027-04-03", 3], ["2027-04-04", 2]]);
    const M = planted.melbourne;
    for (const [d, n] of want) {
      const waste = await get(`/v1/inventory/waste?outlet=${M}&business_date=${d}`, "owner");
      expect(waste.body.items, `waste ${d}`).toHaveLength(n);
      expect(waste.body.items.every((x: any) => x.business_date === d)).toBe(true);
      expect((await get(`/v1/shifts?outlet=${M}&from=${d}&to=${d}`, "owner")).body.items, `shifts ${d}`).toHaveLength(n);
      expect((await get(`/v1/people/attendance?outlet=${M}&from=${d}&to=${d}`, "owner")).body.items, `attendance ${d}`).toHaveLength(n);
    }
    expect((await get(`/v1/inventory/waste?outlet=${M}`, "owner")).body.items).toHaveLength(9);
  });

  it("customer record: full for owner, masked for staff, 404 for an unknown id", async () => {
    const owner = await get(`/v1/customers/${w.customer}`, "owner");
    expect(owner.status).toBe(200);
    SCHEMAS["v1.customer"].parse(owner.body);
    expect(owner.body.phone).toBe("+919800000000");
    const staff = await get(`/v1/customers/${w.customer}`, "staff");
    expect(staff.body.phone).toBe("+91••••••0000");
    expect(staff.body.email).toBeNull();
    expect((await get(`/v1/customers/${uuidv7()}`, "owner")).status).toBe(404);
  });

  it("wiki: 1 page, its current body, 1 version", async () => {
    const pages = await get("/v1/wiki/pages", "mgr1");
    SCHEMAS["v1.wiki.pages"].parse(pages.body);
    expect(pages.body.items).toHaveLength(1);
    expect(pages.body.items[0]).toMatchObject({ kind: "supplier", slug: "simulated-dairy", title: "Simulated Dairy", current_version: 1 });
    expect((await get("/v1/wiki/pages?kind=supplier", "owner")).body.items).toHaveLength(1);
    expect((await get("/v1/wiki/pages?kind=person", "owner")).body.items).toHaveLength(0);
    const id = pages.body.items[0].page_id;
    const page = await get(`/v1/wiki/pages/${id}`, "mgr1");
    SCHEMAS["v1.wiki.page"].parse(page.body);
    expect(page.body.body).toEqual([]);
    const v = await get(`/v1/wiki/pages/${id}/versions`, "mgr1");
    SCHEMAS["v1.wiki.versions"].parse(v.body);
    expect(v.body.items).toHaveLength(1);
    expect((await get(`/v1/wiki/pages/${uuidv7()}`, "owner")).status).toBe(404);
    expect((await get(`/v1/wiki/pages/${uuidv7()}/versions`, "owner")).status).toBe(404);
  });

  it("conversations: outlet scope, plain-text bodies, oldest first", async () => {
    const own = await get("/v1/conversations", "owner");
    SCHEMAS["v1.conversations"].parse(own.body);
    expect(own.body.items).toHaveLength(2);
    expect((await get("/v1/conversations", "mgr1")).body.items.map((x: any) => x.title)).toEqual(["Morning handover"]);
    const m2 = await get("/v1/conversations", "mgr2");
    expect(m2.body.items.map((x: any) => x.conversation_id)).toEqual([planted.conv]);
    expect(m2.body.items[0].title).toBe(HOSTILE_TITLE);
    expect((await get(`/v1/conversations?outlet=${o(1)}`, "mgr1")).status).toBe(404);
    expect((await get("/v1/conversations?kind=handover", "owner")).body.items).toHaveLength(1);
    const msgs = await get(`/v1/conversations/${planted.conv}/messages`, "mgr2");
    SCHEMAS["v1.conversation.messages"].parse(msgs.body);
    expect(msgs.headers.get("content-type")).toMatch(/^application\/json/);
    expect(msgs.body.items.map((x: any) => x.body)).toEqual([HOSTILE_BODY, "second"]);
    expect(msgs.body.items[0].author_label).toBe("<b>chef</b>");
    // outlet-1 manager cannot open outlet-2's conversation or its messages
    expect((await get(`/v1/conversations/${planted.conv}/messages`, "mgr1")).status).toBe(404);
    // cursor: after the first message only the second remains
    const after = await get(`/v1/conversations/${planted.conv}/messages?limit=1`, "mgr2");
    expect(after.body.items).toHaveLength(1);
    expect(after.body.next_cursor).toBe(after.body.items[0].message_id);
    expect((await get(`/v1/conversations/${planted.conv}/messages?cursor=${after.body.next_cursor}`, "mgr2")).body.items.map((x: any) => x.body)).toEqual(["second"]);
  });

  it("wiki and conversations are not for staff (403); managers and above read them (the accepts are the tests above)", async () => {
    const pageId = (await get("/v1/wiki/pages", "mgr1")).body.items[0].page_id;
    const conv = (await get("/v1/conversations", "mgr1")).body.items[0].conversation_id;
    const paths = ["/v1/wiki/pages", `/v1/wiki/pages/${pageId}`, `/v1/wiki/pages/${pageId}/versions`, "/v1/conversations", `/v1/conversations/${conv}/messages`];
    for (const p of paths) {
      expect((await get(p, "staff")).status, `staff ${p}`).toBe(403);
      expect((await get(p, "mgr1")).status, `mgr1 ${p}`).toBe(200);
      expect((await get(p, "advisor")).status, `advisor ${p}`).toBe(200);
    }
  });

  it("platform spend: operator only; the world's month limit 500000 and its one spend row of 15", async () => {
    const r = await call("GET", `/platform/v1/budgets/${w.tenant}/spend?month=2026-10-01`, "op");
    expect(r.status).toBe(200);
    SCHEMAS["platform.tenant-spend"].parse(r.body);
    expect(r.body.months).toEqual([{ month: "2026-10-01", limit_minor: 500000, spent_minor: 15, currency: "INR" }]);
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.rows[0]).toMatchObject({ amount_minor: 15, currency: "INR" });
    expect((await call("GET", `/platform/v1/budgets/${w.tenant}/spend?month=2026-09-01`, "op")).body.rows).toHaveLength(0);
    expect((await call("GET", `/platform/v1/budgets/${w.tenant}/spend?month=2026-10-02`, "op")).status).toBe(400);
    expect((await call("GET", `/platform/v1/budgets/${uuidv7()}/spend`, "op")).status).toBe(404);
    // not an operator: a member (even the owner) and an anonymous caller are refused as the whole surface is
    expect((await call("GET", `/platform/v1/budgets/${w.tenant}/spend`, "owner")).status).toBe(404);
    expect((await call("GET", `/platform/v1/budgets/${w.tenant}/spend`, null)).status).toBe(401);
  });

  it("findings?pack= and drafts?source= filter (planted draft and finding of the world)", async () => {
    const all = await get("/v1/findings", "owner");
    expect(all.status).toBe(200);
    const packs = new Set<string>(all.body.items.map((f: any) => f.pack));
    expect(packs.size).toBeGreaterThanOrEqual(1);
    const pack = [...packs][0]!;
    const some = await get(`/v1/findings?pack=${pack}`, "owner");
    expect(some.body.items.length).toBeGreaterThanOrEqual(1);
    expect(some.body.items.every((f: any) => f.pack === pack)).toBe(true);
    expect((await get("/v1/findings?pack=no_such_pack", "owner")).body.items).toHaveLength(0);
    expect((await get("/v1/findings?pack=Bad-Pack", "owner")).status).toBe(400);
    const drafts = await get("/v1/drafts?status=proposed", "owner");
    const source = drafts.body.items[0]?.draft.source as string;
    expect(source).toBeDefined();
    const only = await get(`/v1/drafts?status=proposed&source=${encodeURIComponent(source)}`, "owner");
    expect(only.body.items.length).toBeGreaterThanOrEqual(1);
    expect(only.body.items.every((d: any) => d.draft.source === source)).toBe(true);
    expect((await get("/v1/drafts?status=proposed&source=intel:no_such_pack", "owner")).body.items).toHaveLength(0);
    expect((await get("/v1/drafts?source=bad%20source", "owner")).status).toBe(400);
  });

  it("imports runs: kind and status filters, limit, cursor", async () => {
    const all = await get("/v1/imports/runs", "owner");
    expect(all.status).toBe(200);
    expect(all.body.runs.length).toBeGreaterThanOrEqual(1);
    expect(all.body.next_cursor).toBeNull();
    const kind = all.body.runs[0].kind as string;
    const status = all.body.runs[0].status as string;
    expect((await get(`/v1/imports/runs?kind=${kind}`, "owner")).body.runs.every((r: any) => r.kind === kind)).toBe(true);
    expect((await get(`/v1/imports/runs?status=${status}`, "owner")).body.runs.every((r: any) => r.status === status)).toBe(true);
    expect((await get("/v1/imports/runs?kind=tally_export&status=failed", "owner")).body.runs).toHaveLength(0);
    expect((await get("/v1/imports/runs?kind=nope", "owner")).status).toBe(400);
    expect((await get("/v1/imports/runs?limit=0", "owner")).status).toBe(400);
    expect((await get("/v1/imports/runs?cursor=zzz", "owner")).status).toBe(400);
    const one = await get("/v1/imports/runs?limit=1", "owner");
    expect(one.body.runs).toHaveLength(1);
    if (all.body.runs.length > 1) expect(one.body.next_cursor).toBe(one.body.runs[0].import_run_id);
  });
});

describe("pagination and malformed input", () => {
  it("orders: limit=2 pages cover all 7 rows once; a malformed cursor, limit or filter is 400", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 6; i++) {
      const r: Res = await get(`/v1/orders?limit=2${cursor ? `&cursor=${cursor}` : ""}`, "owner");
      seen.push(...r.body.items.map((x: any) => x.order_id));
      cursor = r.body.next_cursor;
      if (cursor === null) break;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(cursor).toBeNull();
    for (const bad of ["cursor=nope", "limit=0", "limit=201", "limit=x", "status=nope", "business_date=2026-02-30", "shift=nope", "outlet=nope"])
      expect((await get(`/v1/orders?${bad}`, "owner")).status, bad).toBe(400);
  });
});

describe("(5) a staff member's roster read: only their own shifts", () => {
  it("owner sees 5 shifts in the outlet-1 roster of week 2 Nov; the staff member sees 1 of the 5, and no one else's", async () => {
    const path = `/v1/people/rosters?outlet=${o(0)}&week=2026-11-02`;
    const owner = await get(path, "owner");
    expect(owner.body.items.flatMap((r: any) => r.shifts)).toHaveLength(5);
    const staff = await get(path, "staff");
    expect(staff.status).toBe(200);
    SCHEMAS["v1.people.rosters"].parse(staff.body);
    const shifts = staff.body.items.flatMap((r: any) => r.shifts);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].staff_id).toBe(w.person);
    // the whole staff view: the world's own shift at outlet 1 plus the planted one; outlet 2's roster is invisible to them
    const every = await get("/v1/people/rosters?limit=100", "staff");
    expect(every.body.items.flatMap((r: any) => r.shifts).every((s: any) => s.staff_id === w.person)).toBe(true);
    expect(every.body.items.flatMap((r: any) => r.shifts)).toHaveLength(2);
    // the roster LIST is filtered too, not only the shifts inside it: the 2 rosters holding their shifts (hand: world week 5 Oct at outlet 1 + the
    // planted 2 Nov), never outlet 2's roster or a roster of other people's shifts as an empty shell
    expect(every.body.items).toHaveLength(2);
    expect(every.body.items.every((r: any) => r.shifts.length === 1)).toBe(true);
    expect((await get("/v1/people/rosters?week=2026-10-05", "staff")).body.items.map((r: any) => r.outlet_id)).toEqual([o(0)]);
    // attendance too: only their own clock-ins (hand: 1 of the 11 the owner sees); the date filters keep the own-only filter
    const att = await get("/v1/people/attendance", "staff");
    SCHEMAS["v1.people.attendance"].parse(att.body);
    expect(att.body.items).toHaveLength(1);
    expect(att.body.items[0].staff_id).toBe(w.person);
    expect((await get(`/v1/people/attendance?outlet=${o(0)}&from=2020-01-01`, "staff")).body.items).toHaveLength(1);
  });

  it("a staff-role member with no staff row sees nothing (the filter fails closed, not open)", async () => {
    const lone = uuidv7();
    const sub = `lone-${uuidv7()}`;
    await plant("tenancy.member.invite.v1", async (q) => {
      await q(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, 'No staff row', 'lone@example.test')`, [w.tenant, lone, sub]);
      await q(`INSERT INTO core.membership (tenant_id, member_id, role, outlet_ids) VALUES ($1, $2, 'staff', $3)`, [w.tenant, lone, [o(0)]]);
    });
    const r = await app.request(`/v1/people/rosters?outlet=${o(0)}&week=2026-11-02`, { headers: { Authorization: `Bearer ${idp.sign({ sub })}`, [TENANT_HEADER]: w.tenant } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).items).toHaveLength(0);
    const att = await app.request("/v1/people/attendance", { headers: { Authorization: `Bearer ${idp.sign({ sub })}`, [TENANT_HEADER]: w.tenant } });
    expect(((await att.json()) as any).items).toHaveLength(0);
  });
});

// ---- (2) route-table diff vs the committed hand list ------------------------------------------------------------------
const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Hono path -> template with every path parameter as `{}` (the same reading as routes-contract.test.ts honoTemplate); OpenAPI `{id}` -> `{}`. */
function template(path: string): string {
  if (!path.includes(":")) return path.replace(/\{[^}]+\}/g, "{}");
  let out = "";
  for (let i = 0; i < path.length; ) {
    if (path[i] === ":" && path[i - 1] === "/") {
      const m = /^:[A-Za-z_]+/.exec(path.slice(i))!;
      i += m[0].length;
      if (path[i] !== "{") {
        out += "{}";
        continue;
      }
      let depth = 0;
      let j = i;
      do {
        if (path[j] === "{") depth++;
        else if (path[j] === "}") depth--;
        j++;
      } while (depth > 0);
      const re = path.slice(i + 1, j - 1);
      i = j;
      out += re.startsWith(UUID_RE) ? `{}${re.slice(UUID_RE.length)}` : "{}";
    } else out += path[i++];
  }
  return out;
}

/** The hand list's table rows: the first backticked `GET /path` plus every further backticked token ("(+ `/{id}`)"): a token that starts with `/v1/` or
 *  `/platform/` is a path of its own, any other is a suffix of the first. Query strings are dropped. */
function handListRoutes(): string[] {
  const md = readFileSync(new URL("../../../docs/plan/W4-READ-ROUTES.md", import.meta.url), "utf8");
  const section = md.slice(md.indexOf("## Missing everywhere"), md.indexOf("## Filter gaps"));
  const out: string[] = [];
  for (const line of section.split("\n")) {
    const row = /^\|\s*(\d+)\s*\|([^|]+)\|/.exec(line);
    if (!row) continue;
    const tokens = [...row[2]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    const [first, ...rest] = tokens;
    const m = /^GET (\S+)$/.exec(first!);
    if (!m) throw new Error(`hand list row ${row[1]}: no GET route in ${first}`);
    const main = m[1]!.split("?")[0]!;
    out.push(main);
    for (const t of rest.filter((x) => x.startsWith("/"))) out.push(/^\/(v1|platform)\//.test(t) ? t.split("?")[0]! : main + t.split("?")[0]!);
  }
  return out.map(template);
}

describe("(2) route-table diff vs docs/plan/W4-READ-ROUTES.md", () => {
  it("every hand-listed GET (26 rows, 32 routes with their sub-routes) is mounted: 0 missing", async () => {
    const want = handListRoutes();
    expect(want).toHaveLength(32); // 26 rows + settlements + disputes/{id} + counts/{id} + wiki {id} and versions + conversation messages
    expect(new Set(want).size).toBe(32);
    const have = new Set(app.routes.filter((r) => r.method === "GET").map((r) => template(r.path)));
    expect(want.filter((p) => !have.has(p))).toEqual([]);
  });
});

// ---- (3) OpenAPI operations ---------------------------------------------------------------------------------------------
describe("(3) every new route is an OpenAPI operation", () => {
  it("the generated public.json carries each hand-listed GET and the 4 filter parameters", () => {
    const doc = JSON.parse(readFileSync(new URL("../../../packages/contracts/generated/openapi/public.json", import.meta.url), "utf8")) as { paths: Record<string, any> };
    const ops = new Set(Object.entries(doc.paths).flatMap(([p, item]) => Object.keys(item).map((m) => `${m.toUpperCase()} ${template(p)}`)));
    const want = handListRoutes();
    expect(want.filter((p) => !ops.has(`GET ${p}`))).toEqual([]);
    const params = (path: string) => (doc.paths[path]!.get.parameters as Array<{ name: string }>).map((x) => x.name);
    expect(params("/v1/findings")).toContain("pack");
    expect(params("/v1/drafts")).toContain("source");
    expect(params("/v1/inventory/movements")).toEqual(expect.arrayContaining(["kind", "ref"]));
    expect(params("/v1/imports/runs")).toEqual(expect.arrayContaining(["kind", "status", "limit", "cursor"]));
  });
});

// ---- (4) 405 on a write verb ---------------------------------------------------------------------------------------------
describe("(4) a write verb on any new path is 405", () => {
  const some = () => uuidv7();
  const paths = (): Array<{ path: string; verbs: string[]; who?: Who }> => {
    const id = some();
    const put3 = ["PUT", "PATCH", "DELETE"];
    return [
      { path: "/v1/orders", verbs: put3 }, { path: "/v1/shifts", verbs: put3 }, { path: "/v1/pickup-windows", verbs: put3 },
      { path: "/v1/finance/settlements", verbs: ["POST", ...put3] }, { path: "/v1/finance/settlement-lines", verbs: ["POST", ...put3] },
      { path: "/v1/finance/bank-lines", verbs: ["POST", ...put3] }, { path: "/v1/finance/disputes", verbs: put3 }, { path: `/v1/finance/disputes/${id}`, verbs: ["POST", ...put3] },
      { path: "/v1/finance/period-closes", verbs: put3 },
      { path: "/v1/inventory/ingredients", verbs: put3 }, { path: "/v1/inventory/waste", verbs: put3 }, { path: "/v1/inventory/counts", verbs: put3 },
      { path: `/v1/inventory/counts/${id}`, verbs: ["POST", ...put3] }, { path: "/v1/inventory/transfers", verbs: put3 },
      { path: "/v1/people/rosters", verbs: put3 }, { path: "/v1/people/attendance", verbs: put3 }, { path: "/v1/people/advances", verbs: put3 }, { path: "/v1/people/payroll-drafts", verbs: put3 },
      { path: "/v1/catalogue/items", verbs: put3 }, { path: "/v1/catalogue/recipes", verbs: put3 }, { path: "/v1/catalogue/prices", verbs: put3 },
      { path: "/v1/catalogue/deals", verbs: put3 }, { path: "/v1/catalogue/coupons", verbs: put3 },
      { path: `/v1/outlets/${id}/calendar`, verbs: ["POST", ...put3] },
      { path: `/v1/customers/${id}`, verbs: ["POST", ...put3] },
      { path: "/v1/wiki/pages", verbs: ["POST", ...put3] }, { path: `/v1/wiki/pages/${id}`, verbs: ["POST", ...put3] }, { path: `/v1/wiki/pages/${id}/versions`, verbs: ["POST", ...put3] },
      { path: "/v1/conversations", verbs: ["POST", ...put3] }, { path: `/v1/conversations/${id}/messages`, verbs: ["POST", ...put3] },
      { path: `/platform/v1/budgets/${id}/spend`, verbs: ["POST", ...put3], who: "op" },
    ];
  };
  it("covers every hand-listed path (a positive floor) and answers 405 with Allow, not 404", async () => {
    const list = paths();
    expect(list.length).toBeGreaterThanOrEqual(31);
    for (const { path, verbs, who } of list)
      for (const verb of verbs) {
        const r = await call(verb, path, who ?? "owner");
        expect(r.status, `${verb} ${path}`).toBe(405);
        expect(r.headers.get("allow"), `${verb} ${path}`).toMatch(/GET/);
      }
  });
  it("the pre-existing POST on a shared path still works (not swallowed by the guard): an unauthenticated POST reaches auth, not 405", async () => {
    for (const p of ["/v1/orders", "/v1/shifts", "/v1/pickup-windows", "/v1/finance/disputes", "/v1/inventory/counts", "/v1/people/rosters", "/v1/catalogue/items"])
      expect((await call("POST", p, null)).status, p).toBe(401);
  });
});

// A GET (and a refused write verb) did not write: the audit log and the book tables are unchanged by a sweep.
describe("reads write nothing", () => {
  it("audit_log and the command log are unchanged by a sweep of every read route and every refused verb", async () => {
    const count = async () => Number((await db.admin(`SELECT (SELECT count(*) FROM core.audit_log WHERE tenant_id = $1) + (SELECT count(*) FROM core.command_log WHERE tenant_id = $1) AS n`, [w.tenant])).rows[0]!.n);
    const before = await count();
    expect(before).toBeGreaterThan(0);
    for (const p of ["/v1/orders", "/v1/shifts", "/v1/finance/settlements", "/v1/finance/disputes", "/v1/inventory/counts", "/v1/inventory/transfers", "/v1/people/rosters", "/v1/catalogue/prices", "/v1/conversations", "/v1/wiki/pages"])
      expect((await get(p, "owner")).status).toBe(200);
    for (const p of ["/v1/orders", "/v1/finance/settlements", "/v1/conversations"]) expect((await call("DELETE", p, "owner")).status).toBe(405);
    expect(await count()).toBe(before);
  });
});
