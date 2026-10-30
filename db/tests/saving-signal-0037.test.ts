// 0037 gates (NB-4: the cited saving and the ingredient-price signal). The oracle is typed by hand here from the rows this file
// plants — the receipts, runs and quotes below, and the rule the ticket states — never read from the migration under test. Money
// is checked with BigInt (round half away from zero, once).
//   S1  purchasing.quote_compare v2: per quote, the last price paid (the latest costed receipt of the ingredient at the run's
//       outlets, at or before the run was issued, in the quote's unit) and saving = (reference − quoted price) × qty, against
//       hand values: a fractional quantity, a negative saving, a .5 at both signs, a reference that rounds, a unit that does
//       not convert, no prior price (NULL), a later receipt and another outlet's receipt ignored; v2's first seven columns =
//       v1's rows in v1's order; the owner and an outlet-A manager read the same cells
//   M1  core.market_signal: an ingredient_price row is accepted inside an approved import (and read back); without its
//       ingredient, price or quantity, with prose as its source, with an ingredient on another kind, or with an unknown
//       ingredient → 23514 / 23503; outside an approved import → MB006; munim_svc cannot insert and intel cannot read
//   M2  market.upcoming v4 and market.signal_uplift v3: = the previous version on the world before any price signal; after
//       ingredient_price signals (ahead, and on every past trading day at outlet A) they read exactly what they read before,
//       while the previous versions show the price as an upcoming event and lose their normal-day baseline (RED evidence)
//   M3  market.ingredient_price v1: one ingredient's signals in the window, at the outlet or tenant-wide, in the minter's
//       scope, with unit_price_minor = value_minor × 1000 ÷ value_milli
//   READ every latest template that reads core.market_signal names the kinds it reads (RED-PROOF: a planted reader)
// Red-proofs judged by exit code: db/tests/redproof-0037.sh.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AppContext, TestDb } from "../src/harness.ts";
import { openDb } from "./db.ts";
import { attempt } from "./gates.ts";
import { addOutletData, type McFixture } from "./mc1a-fixture.ts";
import { addMc1bcData, type McbcFixture } from "./mc1bc-fixture.ts";
import { approveDraft, buildWorld, ownerCtx, uuidv7 as u, type World } from "./world.ts";

let db: TestDb;
let w: World;
let fx: McFixture;
let fy: McbcFixture;

type Row = Record<string, string | null>;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const owner = (): AppContext => ({ tenant_id: w.tenant, outlet_ids: "*", role: "owner", member_id: w.owner });
const managerA = (): AppContext => ({ tenant_id: w.tenant, outlet_ids: [fx.A], role: "manager", member_id: fx.managerA });

/** Named params → $n, as core-api's bindNamedParams (copied from tests/forecast-outlet-0033.test.ts). */
function bind(sql: string): { sql: string; names: string[] } {
  const names: string[] = [];
  let out = "";
  let i = 0;
  const to = (end: string, from: number) => {
    const j = sql.indexOf(end, from);
    return j < 0 ? sql.length : j + end.length;
  };
  while (i < sql.length) {
    const ch = sql[i]!;
    let next = i + 1;
    if (ch === "'") next = to("'", i + 1);
    else if (ch === '"') next = to('"', i + 1);
    else if (ch === "-" && sql[i + 1] === "-") next = to("\n", i + 2);
    else if (ch === "$" && /^\$[A-Za-z_]*\$/.test(sql.slice(i))) next = to(/^\$[A-Za-z_]*\$/.exec(sql.slice(i))![0], i + 2);
    else if (ch === ":" && sql[i + 1] === ":") next = i + 2;
    else if (ch === ":") {
      const m = /^:([a-z_][a-z0-9_]*)/.exec(sql.slice(i));
      if (m) {
        if (!names.includes(m[1]!)) names.push(m[1]!);
        out += `$${names.indexOf(m[1]!) + 1}`;
        i += m[0].length;
        continue;
      }
    }
    out += sql.slice(i, next);
    i = next;
  }
  return { sql: out, names };
}

/** Version `v` of `id` as core-api runs it, as munim_core under `ctx`: its output fields in order and its rows (cells as text). */
async function run(x: TestDb, id: string, v: number, p: Record<string, unknown>, ctx: AppContext = owner()): Promise<{ fields: string[]; rows: Row[] }> {
  const t = (await x.admin<{ sql: string }>("SELECT sql FROM evidence.snapshot_template WHERE id = $1 AND version = $2", [id, v])).rows[0];
  if (!t) throw new Error(`no ${id} v${v}`);
  const { sql, names } = bind(t.sql);
  for (const n of names) if (!(n in p)) throw new Error(`${id} v${v}: param ${n} not supplied`);
  return x.withContext("munim_core", ctx, async (c: pg.Client) => {
    // Every cell as Postgres's own text (no Date or number parsing).
    const r = await c.query({ text: `SELECT * FROM (${sql}) t`, values: names.map((n) => p[n]), rowMode: "array", types: { getTypeParser: () => (v: string) => v } });
    const fields = r.fields.map((f) => f.name);
    return { fields, rows: (r.rows as (string | null)[][]).map((row) => Object.fromEntries(fields.map((f, k) => [f, row[k] ?? null]))) };
  });
}

/** n ÷ d rounded half away from zero (d > 0), in BigInt. */
function roundDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  return 2n * (r < 0n ? -r : r) >= d ? q + (n < 0n ? -1n : 1n) : q;
}

// ---- S1 world: one ingredient (base unit g), four receipts, four runs, their quotes ---------------------------------------
const N = u(); // the quoted ingredient
const M = u(); // an ingredient never received
interface Quote { id: string; round: number; unit: string; qty: bigint; price: bigint; ref: bigint | null }
/** Per run: its scope, when it was issued, and its quotes with the reference typed by hand from the receipts below. */
const RUNS: Record<string, { id: string; scope: () => string[]; issued: string; ing: string; quotes: Quote[] }> = {
  // Outlet A, issued 10 Oct: the last costed receipt at A before it is r1 (1 Oct, 148,000 per 1,000 g = per kg). r0 is older,
  // rL is later (20 Oct, at the PO's own price), rB is at outlet B.
  RA: { id: u(), scope: () => [fx.A], issued: "2026-10-10T00:00:00Z", ing: N, quotes: [
    { id: u(), round: 1, unit: "kg", qty: 1324n, price: 146520n, ref: 148000n },  // 1480 × 1.324 = 1959.52 → 1960
    { id: u(), round: 2, unit: "kg", qty: 1324n, price: 150960n, ref: 148000n },  // −2960 × 1.324 = −3919.04 → −3919
    { id: u(), round: 3, unit: "g", qty: 2500n, price: 147n, ref: 148n },         // per g: 148000 ÷ 1000; 1 × 2.5 = 2.5 → 3
  ] },
  // Every outlet, issued 10 Oct: the last costed receipt anywhere before it is rB (5 Oct at B, 200,000 per kg).
  RS: { id: u(), scope: () => ["*"], issued: "2026-10-10T00:00:00Z", ing: N, quotes: [
    { id: u(), round: 1, unit: "kg", qty: 1000n, price: 199000n, ref: 200000n },  // 1000 × 1 = 1000
    { id: u(), round: 2, unit: "l", qty: 1000n, price: 100n, ref: null },         // l does not convert from g: no reference
  ] },
  // Outlet A, issued 15 Sep: only r0 (1 Sep, 150,500 per kg = 150.5 per g → 151) precedes it.
  RE: { id: u(), scope: () => [fx.A], issued: "2026-09-15T00:00:00Z", ing: N, quotes: [
    { id: u(), round: 1, unit: "g", qty: 1250n, price: 153n, ref: 151n },         // −2 × 1.25 = −2.5 → −3
    { id: u(), round: 2, unit: "kg", qty: 1000n, price: 150000n, ref: 150500n },  // 500 × 1 = 500
  ] },
  // Outlet A, an ingredient with no receipt at all: no reference, no saving.
  RN: { id: u(), scope: () => [fx.A], issued: "2026-10-10T00:00:00Z", ing: M, quotes: [
    { id: u(), round: 1, unit: "kg", qty: 1000n, price: 100000n, ref: null },
  ] },
};
const expectedRows = (k: string) => RUNS[k]!.quotes.map((q) => ({
  quote_id: q.id,
  reference_unit_price_minor: q.ref === null ? null : String(q.ref),
  saving_minor: q.ref === null ? null : String(roundDiv((q.ref - q.price) * q.qty, 1000n)),
}));
const V1_FIELDS = ["quote_id", "supplier_id", "round", "unit_price_minor", "qty_milli", "min_order_qty_milli", "payment_days"];
const quoteCompare = (x: TestDb, k: string, v: number, ctx?: AppContext) => run(x, "purchasing.quote_compare", v, { negotiation_run_id: RUNS[k]!.id }, ctx);

async function addQuoteWorld(): Promise<void> {
  const T = w.tenant;
  const cur = w.currency;
  await db.withContext("munim_core", ownerCtx(w), async (c) => {
    await c.query("SELECT set_config('app.command_type', 'inventory.ingredient.upsert.v1', true)");
    await c.query(`INSERT INTO core.ingredient (tenant_id, id, name, base_unit, tracked_by_batch) VALUES ($1, $2, 'Roasted hazelnuts (test)', 'g', false),
                     ($1, $3, 'Never received (test)', 'g', false)`, [T, N, M]);
    await c.query("SELECT set_config('app.command_type', 'inventory.stock.receive.v1', true)");
    for (const [o, at, per1000] of [[fx.A, "2026-09-01T05:00:00Z", 150500], [fx.A, "2026-10-01T05:00:00Z", 148000],
      [fx.B, "2026-10-05T05:00:00Z", 200000], [fx.A, "2026-10-20T05:00:00Z", 146520]] as const) {
      await c.query(`INSERT INTO core.stock_movement (tenant_id, id, outlet_id, ingredient_id, qty_milli, unit, kind, unit_cost_per_1000_minor, currency, at)
                     VALUES ($1, $2, $3, $4, 5000000, 'g', 'receipt', $5, $6, $7)`, [T, u(), o, N, per1000, cur, at]);
    }
    // A receipt with no cost (a goods receipt before its invoice) is not a price paid; it is the newest at A before RA.
    await c.query(`INSERT INTO core.stock_movement (tenant_id, id, outlet_id, ingredient_id, qty_milli, unit, kind, at)
                   VALUES ($1, $2, $3, $4, 1000000, 'g', 'receipt', '2026-10-08T05:00:00Z')`, [T, u(), fx.A, N]);
  });
  await db.withContext("munim_svc", { tenant_id: T, outlet_ids: "*" }, async (c) => {
    for (const r of Object.values(RUNS)) {
      await c.query(`INSERT INTO intel.run (tenant_id, id, trigger, actor, outlet_scope, issued_at, expires_at)
                     VALUES ($1, $2, 'watch_sweep', 'watcher:inventory', $3, $4, $4::timestamptz + interval '2 hours')`, [T, r.id, r.scope(), r.issued]);
      for (const q of r.quotes) {
        await c.query(`INSERT INTO intel.supplier_quote (tenant_id, id, run_id, supplier_id, ingredient_id, round, qty_milli, unit, unit_price_minor, currency, payment_days)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 15)`, [T, q.id, r.id, w.supplier, r.ing, q.round, String(q.qty), q.unit, String(q.price), cur]);
      }
    }
  });
}

// ---- market signals ----------------------------------------------------------------------------------------------------
let importRun: string;
type Signal = { outlet: string | null; on: string; kind?: string; ing?: string | null; minor?: number | null; milli?: number | null; unit?: string | null; source?: string; label?: string };
async function insertSignals(x: TestDb, rows: Signal[]): Promise<string[]> {
  const ids = rows.map(() => u());
  await approveDraft(x, w, "imports.run.commit.v1", async (q) => {
    for (const [i, s] of rows.entries()) {
      const kind = s.kind ?? "ingredient_price";
      const minor = s.minor === undefined ? 145000 : s.minor;
      await q(`INSERT INTO core.market_signal (tenant_id, id, outlet_id, on_date, kind, label, ingredient_id, value_minor, currency, value_milli, unit, source, import_run_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [w.tenant, ids[i], s.outlet, s.on, kind, s.label ?? "web_price.hazelnuts", s.ing === undefined ? N : s.ing, minor, minor === null ? null : w.currency,
          s.milli === undefined ? 1000 : s.milli, s.unit === undefined ? "kg" : s.unit, s.source ?? "tavily.recorded", importRun]);
    }
  });
  return ids;
}
const signalError = async (s: Signal) => {
  try {
    await insertSignals(db, [s]);
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? "?";
  }
};

beforeAll(async () => {
  db = await openDb();
  w = await buildWorld(db);
  fx = await addOutletData(db, w);
  fy = await addMc1bcData(db, w, fx);
  importRun = (await db.admin<{ id: string }>(`SELECT id FROM core.import_run WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, [w.tenant])).rows[0]!.id;
  await addQuoteWorld();
}, 300_000);
afterAll(async () => db?.stop());

describe("S1 purchasing.quote_compare v2 (the last price paid and the saving)", () => {
  test("every quote's reference and saving = the hand values (BigInt, rounded once, half away from zero)", async () => {
    const bad: string[] = [];
    for (const k of Object.keys(RUNS)) {
      const got = (await quoteCompare(db, k, 2)).rows.map((r) => ({ quote_id: r.quote_id, reference_unit_price_minor: r.reference_unit_price_minor, saving_minor: r.saving_minor }));
      console.log(`S1 ${k}: ${JSON.stringify(got.map((g) => [g.reference_unit_price_minor, g.saving_minor]))}`);
      if (JSON.stringify(got) !== JSON.stringify(expectedRows(k))) bad.push(`${k}: ${JSON.stringify(got)} ≠ ${JSON.stringify(expectedRows(k))}`);
    }
    expect(bad).toEqual([]);
    // Not vacuous: positive, negative, both .5 cases and NULL are all among the expected cells.
    const savings = Object.keys(RUNS).flatMap((k) => expectedRows(k).map((r) => r.saving_minor));
    expect(savings).toEqual(["1960", "-3919", "3", "1000", null, "-3", "500", null]);
  });

  test("v2 = v1's columns in v1's order plus the two, and v1's rows in v1's order", async () => {
    const bad: string[] = [];
    for (const k of Object.keys(RUNS)) {
      const [v1, v2] = [await quoteCompare(db, k, 1), await quoteCompare(db, k, 2)];
      if (JSON.stringify(v1.fields) !== JSON.stringify(V1_FIELDS)) bad.push(`${k}: v1 fields ${v1.fields}`);
      if (JSON.stringify(v2.fields) !== JSON.stringify([...V1_FIELDS, "reference_unit_price_minor", "saving_minor"])) bad.push(`${k}: v2 fields ${v2.fields}`);
      const head = v2.rows.map((r) => Object.fromEntries(V1_FIELDS.map((f) => [f, r[f]])));
      if (JSON.stringify(head) !== JSON.stringify(v1.rows)) bad.push(`${k}: v2's v1 columns ≠ v1's rows`);
      if (v1.rows.length !== RUNS[k]!.quotes.length) bad.push(`${k}: ${v1.rows.length} rows`);
    }
    expect(bad).toEqual([]);
  });

  test("an outlet-A manager reads exactly the owner's cells for the outlet-A runs", async () => {
    for (const k of ["RA", "RE", "RN"]) {
      const [o, m] = [await quoteCompare(db, k, 2), await quoteCompare(db, k, 2, managerA())];
      console.log(`S1 scope ${k}: owner ${o.rows.length} rows, manager A ${m.rows.length}`);
      expect(m.rows.length).toBeGreaterThan(0);
      expect(m.rows).toEqual(o.rows);
    }
  });

  test("the shape: v2 is the latest, with v1's params and min_role", async () => {
    const r = await db.admin<{ latest: number; same: boolean }>(`
      SELECT (SELECT max(version) FROM evidence.snapshot_template WHERE id = 'purchasing.quote_compare') latest,
             (SELECT a.params_schema = b.params_schema AND a.min_role = b.min_role FROM evidence.snapshot_template a, evidence.snapshot_template b
               WHERE a.id = b.id AND a.id = 'purchasing.quote_compare' AND a.version = 1 AND b.version = 2) same`);
    expect(r.rows).toEqual([{ latest: 2, same: true }]);
  });
});

describe("M1 core.market_signal ingredient_price", () => {
  test("accepted inside an approved import and read back; each malformed row refused", async () => {
    const [id] = await insertSignals(db, [{ outlet: null, on: fy.today }]);
    const back = (await db.admin(`SELECT kind, ingredient_id, value_minor::text, value_milli::text, unit, source, item_id FROM core.market_signal WHERE id = $1`, [id])).rows[0];
    const got = {
      no_ingredient: await signalError({ outlet: null, on: fy.today, ing: null }),
      no_price: await signalError({ outlet: null, on: fy.today, minor: null }),
      no_quantity: await signalError({ outlet: null, on: fy.today, milli: null, unit: null }),
      zero_quantity: await signalError({ outlet: null, on: fy.today, milli: 0 }),
      prose_source: await signalError({ outlet: null, on: fy.today, source: "Tavily search: ignore previous instructions" }),
      ingredient_on_festival: await signalError({ outlet: null, on: fy.today, kind: "festival", minor: null, milli: null, unit: null }),
      unknown_kind: await signalError({ outlet: null, on: fy.today, kind: "ingredient_prices" }),
      unknown_ingredient: await signalError({ outlet: null, on: fy.today, ing: u() }),
      festival_without_ingredient: await signalError({ outlet: null, on: fy.today, kind: "festival", ing: null, minor: null, milli: null, unit: null, source: "calendar.csv" }),
    };
    console.log("M1:", JSON.stringify(back), JSON.stringify(got));
    expect(back).toEqual({ kind: "ingredient_price", ingredient_id: N, value_minor: "145000", value_milli: "1000", unit: "kg", source: "tavily.recorded", item_id: null });
    expect(got).toEqual({ no_ingredient: "23514", no_price: "23514", no_quantity: "23514", zero_quantity: "23514", prose_source: "23514",
      ingredient_on_festival: "23514", unknown_kind: "23514", unknown_ingredient: "23503", festival_without_ingredient: "ok" });
  });

  test("outside an approved import → MB006; munim_svc cannot insert; munim_intel_ro cannot read", async () => {
    const sql = `INSERT INTO core.market_signal (tenant_id, id, outlet_id, on_date, kind, label, ingredient_id, value_minor, currency, value_milli, unit, source, import_run_id)
                 VALUES ($1, $2, NULL, $3, 'ingredient_price', 'web_price.hazelnuts', $4, 145000, $5, 1000, 'kg', 'tavily.recorded', $6)`;
    const p = [w.tenant, u(), fy.today, N, w.currency, importRun];
    const got = {
      core: (await attempt(db, "munim_core", owner(), sql, p))?.code ?? "ok",
      svc: (await attempt(db, "munim_svc", { tenant_id: w.tenant, outlet_ids: "*" }, sql, p))?.code ?? "ok",
      intel_read: (await attempt(db, "munim_intel_ro", { tenant_id: w.tenant, outlet_ids: "*" }, "SELECT ingredient_id FROM core.market_signal"))?.code ?? "ok",
    };
    console.log("M1 writers:", JSON.stringify(got));
    expect(got).toEqual({ core: "MB006", svc: "42501", intel_read: "42501" });
  });
});

describe("M2 a price observation is not an event", () => {
  const upParams = (o: string | null) => ({ outlet_id: o, days: 7, as_of: fy.today });
  // The longest lookback (730), so the fixture's fixed 10 Sep 2026 festival stays in it for two years.
  const upliftParams = (o: string | null) => ({ outlet_id: o, kind: "festival", label: null, lookback_days: 730, as_of: fy.today });
  const reads = async (x: TestDb) => {
    const out: Record<string, string> = {};
    for (const [name, o] of [["all", null], ["A", fx.A], ["B", fx.B]] as const) {
      for (const v of [3, 4]) out[`upcoming v${v} ${name}`] = JSON.stringify((await run(x, "market.upcoming", v, upParams(o))).rows);
      for (const v of [2, 3]) out[`signal_uplift v${v} ${name}`] = JSON.stringify((await run(x, "market.signal_uplift", v, upliftParams(o))).rows);
    }
    return out;
  };

  test("unchanged by ingredient_price signals, which the previous versions misread (RED evidence on the same world)", async () => {
    const x = await db.clone();
    try {
      await x.admin(`DELETE FROM core.market_signal WHERE kind = 'ingredient_price'`);
      // Two normal Thursdays with orders at A, so the festival's baseline (the fixture's 10 Sep, a Thursday) is measured.
      await approveDraft(x, w, "imports.run.commit.v1", async (q) => {
        for (const d of ["2026-09-03", "2026-09-17"]) {
          await q(`INSERT INTO core."order" (tenant_id, id, outlet_id, channel_id, kind, status, business_date, subtotal_minor, tax_minor, total_minor, currency,
                                              pricing_snapshot, customer_id, created_at)
                   VALUES ($1, $2, $3, $4, 'takeaway', 'completed', $5, 20000, 0, 20000, $6, '{"synthetic": true}', $7, $8)`,
            [w.tenant, u(), fx.A, w.channel, d, w.currency, w.customer, `${d}T08:00:00Z`]);
        }
      });
      const before = await reads(x);
      // Not vacuous: the previous version measures a festival baseline at A before any price signal.
      expect(JSON.parse(before["signal_uplift v2 A"]!).map((r: Row) => r.baseline_orders)).toEqual(["1"]);
      // Without any price signal the new versions read exactly what the previous ones read.
      const differ = ["all", "A", "B"].flatMap((o) => [
        ...(before[`upcoming v3 ${o}`] === before[`upcoming v4 ${o}`] ? [] : [`upcoming ${o}`]),
        ...(before[`signal_uplift v2 ${o}`] === before[`signal_uplift v3 ${o}`] ? [] : [`signal_uplift ${o}`])]);
      expect(differ).toEqual([]);
      // Price signals: ahead (tenant-wide today, at A tomorrow) and on every past trading day at A.
      const days = (await x.admin<{ d: string }>(`SELECT DISTINCT to_char(business_date, 'YYYY-MM-DD') d FROM core."order"
        WHERE tenant_id = $1 AND outlet_id = $2 AND status = 'completed' AND business_date < $3::date ORDER BY 1`, [w.tenant, fx.A, fy.today])).rows.map((r) => r.d);
      await insertSignals(x, [{ outlet: null, on: fy.today }, { outlet: fx.A, on: addDays(fy.today, 1) }, ...days.map((d) => ({ outlet: fx.A, on: d }))]);
      const after = await reads(x);
      const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
      console.log(`M2: ${days.length} past trading days at A planted; changed: [${moved.join("; ")}]`);
      // The new versions read exactly what they read before; the previous ones show the price as an upcoming event at every
      // outlet and lose outlet A's normal days (the festival baseline).
      expect(moved.filter((k) => k.startsWith("upcoming v4") || k.startsWith("signal_uplift v3"))).toEqual([]);
      expect(moved.sort()).toEqual(["signal_uplift v2 A", "signal_uplift v2 all", "upcoming v3 A", "upcoming v3 B", "upcoming v3 all"].sort());
      expect(JSON.parse(after["upcoming v3 all"]!).some((r: Row) => r.kind === "ingredient_price")).toBe(true);
      expect(JSON.parse(after["upcoming v4 all"]!).some((r: Row) => r.kind === "ingredient_price")).toBe(false);
      // Not vacuous: the new versions have rows (the fixture's festival ahead, and its past effect).
      expect(JSON.parse(after["upcoming v4 A"]!).length).toBeGreaterThan(0);
      expect(JSON.parse(after["signal_uplift v3 A"]!).length).toBeGreaterThan(0);
    } finally {
      await x.stop();
    }
  });
});

describe("M3 market.ingredient_price v1", () => {
  test("the ingredient's signals in the window, at the outlet or tenant-wide, in the minter's scope", async () => {
    const x = await db.clone();
    try {
      await x.admin(`DELETE FROM core.market_signal WHERE kind = 'ingredient_price'`);
      const t = fy.today;
      const ids = await insertSignals(x, [
        { outlet: fx.A, on: addDays(t, -45) },                                        // outside every window below
        { outlet: fx.A, on: addDays(t, -20), minor: 150000 },
        { outlet: fx.A, on: addDays(t, -2), minor: 74000, milli: 500000, unit: "g" },  // 74,000 for 500 g → 148 a g
        { outlet: fx.B, on: addDays(t, -1), minor: 152000 },
        { outlet: null, on: t, minor: 145000, source: "tavily:example.com" },
        { outlet: fx.A, on: t, ing: M },                                               // another ingredient
      ]);
      const [a20, a2, b1, all0] = [ids[1], ids[2], ids[3], ids[4]];
      const read = async (o: string | null, asOf: string | null, ctx?: AppContext) =>
        (await run(x, "market.ingredient_price", 1, { outlet_id: o, ingredient_id: N, days: 30, as_of: asOf }, ctx)).rows;
      const all = await read(null, null);
      console.log(`M3: ${JSON.stringify(all.map((r) => [r.on_date, r.outlet_id === fx.A ? "A" : r.outlet_id === fx.B ? "B" : r.outlet_id, r.unit_price_minor]))}`);
      expect(all.map((r) => r.signal_id)).toEqual([a20, a2, b1, all0]);
      expect(all.map((r) => [r.value_minor, r.currency, r.value_milli, r.unit, r.unit_price_minor, r.source])).toEqual([
        ["150000", w.currency, "1000", "kg", "150000", "tavily.recorded"], ["74000", w.currency, "500000", "g", "148", "tavily.recorded"],
        ["152000", w.currency, "1000", "kg", "152000", "tavily.recorded"], ["145000", w.currency, "1000", "kg", "145000", "tavily:example.com"]]);
      expect((await read(fx.A, t)).map((r) => r.signal_id)).toEqual([a20, a2, all0]);
      expect((await read(null, null, managerA())).map((r) => r.signal_id)).toEqual([a20, a2, all0]);
      expect((await read(null, addDays(t, -5))).map((r) => r.signal_id)).toEqual([a20]);
      const f = (await run(x, "market.ingredient_price", 1, { outlet_id: null, ingredient_id: N, days: 30, as_of: null })).fields;
      expect(f).toEqual(["signal_id", "on_date", "outlet_id", "label", "source", "value_minor", "currency", "value_milli", "unit", "unit_price_minor"]);
    } finally {
      await x.stop();
    }
  });
});

/** Latest templates reading core.market_signal that name neither the new kind nor competitor_price alone. */
async function blindReaders(x: TestDb): Promise<{ readers: string[]; blind: string[] }> {
  const t = (await x.admin<{ id: string; sql: string }>(`SELECT id, sql FROM evidence.snapshot_template t
    WHERE version = (SELECT max(version) FROM evidence.snapshot_template v WHERE v.id = t.id) ORDER BY id`)).rows;
  const readers = t.filter((r) => /core\.market_signal\b/.test(r.sql));
  return { readers: readers.map((r) => r.id), blind: readers.filter((r) => !r.sql.includes("'ingredient_price'") && !r.sql.includes("s.kind = 'competitor_price'")).map((r) => r.id) };
}

describe("READ every reader of core.market_signal names its kinds", () => {
  test("the four latest readers, none blind", async () => {
    const r = await blindReaders(db);
    console.log(`READ: readers ${r.readers.join(", ")}; blind ${r.blind.length}`);
    expect(r.readers).toEqual(["market.competitor_gap", "market.ingredient_price", "market.signal_uplift", "market.upcoming"]);
    expect(r.blind).toEqual([]);
  });

  test("RED-PROOF: a planted version reading every signal kind → named", async () => {
    const x = await db.clone();
    try {
      await x.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role)
        SELECT id, 99, 'SELECT s.on_date, s.kind FROM core.market_signal s', '{}', '[{"name": "on_date", "type": "date"}, {"name": "kind", "type": "text"}]', min_role
          FROM evidence.snapshot_template WHERE id = 'market.upcoming' AND version = 4`);
      const r = await blindReaders(x);
      console.log("RED-PROOF READ:", r.blind);
      expect(r.blind).toEqual(["market.upcoming"]);
    } finally {
      await x.stop();
    }
  });
});
