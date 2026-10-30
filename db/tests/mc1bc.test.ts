// M-C1bc gates (0021) on the canonical world + the M-C1a and M-C1bc fixtures (BOARD W3 M-C1b + M-C1c, merged lane m-1).
// Expected ids, params and columns come from tests/template-spec.ts (the pack docs' §3 tables), never from the migration.
//   (1) template ids = the ids parsed from the seven packs' §3 tables, less the hand-listed 0005 template; per-pack counts =
//       the BOARD's hand numbers (kitchen 5, inventory_purchasing 10 new + below_reorder, forecast 5, people 6,
//       customers 7, compliance 5, market 6);
//   (2) each template returns exactly its spec columns and takes exactly its spec params (the worlds: templates-worlds.ts);
//   (3) numeric sources: books.test.ts (every template, list elements included);
//   (4) manager scope: an outlet-A manager sees what the owner sees of outlet A and nothing of outlet B, per template
//       (hand-listed: how each template is scoped, and the tenant-level ones with their reason);
//   T-093: the shift_log / stock_count kinds; a stock count under an own command → MB001 and under an approved import →
//   accepted; inventory.count_adjust admits a movement only from a submitted count.
// Red-proofs: db/tests/redproof-0021.sh (each gate red with a non-zero exit), plus the in-file RED-PROOF tests.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AppContext, TestDb } from "../src/harness.ts";
import { openDb } from "./db.ts";
import { attempt } from "./gates.ts";
import { addOutletData, type McFixture } from "./mc1a-fixture.ts";
import { addCrewListings } from "./cares-fixture.ts";
import { addMc1bcData, type McbcFixture } from "./mc1bc-fixture.ts";
import { MC1BC_NOT_NEW, MC1BC_PACKS, mc1bcTemplates, packTemplates } from "./template-spec.ts";
import { approveDraft, buildWorld, ownerCtx, uuidv7, type World } from "./world.ts";

let db: TestDb;
let w: World;
let fx: McFixture;
let fy: McbcFixture;
/** 0028: a crew-covered listing at outlets A and B (tests/cares-fixture.ts). */
let crew: [string, string];
const PARSED = mc1bcTemplates();
const SPEC = PARSED.filter((t) => !MC1BC_NOT_NEW.includes(t.id));
const NO_OUTLET = randomUUID();
const NO_ROW = randomUUID();

beforeAll(async () => {
  db = await openDb();
  w = await buildWorld(db);
  fx = await addOutletData(db, w);
  fy = await addMc1bcData(db, w, fx);
  crew = await addCrewListings(db, w);
});
afterAll(async () => db?.stop());

/** Named params → $n, as core-api's bindNamedParams (and templates.test.ts's copy): literals, quoted identifiers, dollar
 *  quotes and comments are skipped; `::` is a cast. */
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

type Row = Record<string, string | null>;
async function mint(x: TestDb, ctx: AppContext, id: string, params: Record<string, unknown>): Promise<{ fields: string[]; rows: Row[] }> {
  const t = (await x.admin<{ sql: string }>("SELECT sql FROM evidence.snapshot_template WHERE id = $1 AND version = 1", [id])).rows[0];
  if (!t) throw new Error(`no template ${id}`);
  const { sql, names } = bind(t.sql);
  for (const n of names) if (!(n in params)) throw new Error(`${id}: param ${n} not supplied`);
  return x.withContext("munim_core", ctx, async (c: pg.Client) => {
    const r = await c.query({ text: `SELECT * FROM (${sql}) t LIMIT 500`, values: names.map((n) => params[n]), rowMode: "array" });
    const fields = r.fields.map((f) => f.name);
    return { fields, rows: (r.rows as unknown[][]).map((v) => Object.fromEntries(fields.map((f, k) => [f, v[k] === null ? null : String(v[k])]))) };
  });
}

const owner = (): AppContext => ({ tenant_id: w.tenant, outlet_ids: "*", role: "owner", member_id: w.owner });
const managerA = (): AppContext => ({ tenant_id: w.tenant, outlet_ids: [fx.A], role: "manager", member_id: fx.managerA });

/** Params per template on the fixtures. `outlet` fills outlet_id; `row` the id param of a row-scoped template. */
function params(id: string, outlet: string | null, row?: string): Record<string, unknown> {
  const win = { from: "2026-07-01", to: fy.today };
  switch (id) {
    case "kitchen.ticket_times": case "kitchen.ticket_coverage": case "people.labour_pct": case "people.attendance_coverage":
    case "people.overtime_drift": case "customers.review_trend": case "compliance.log_coverage": case "compliance.temp_excursions":
    case "compliance.asset_costs": case "forecast.accuracy":
      return { outlet_id: outlet, ...win };
    case "kitchen.ticket_drift": case "kitchen.remakes_overprep": case "inventory.waste_week": return { outlet_id: outlet, week_start: fy.recentWeek };
    case "kitchen.prep_need": return { outlet_id: outlet, business_date: addDays(fy.today, 1) };
    case "inventory.shortfall": return { outlet_id: outlet, lead_days: 7 };
    case "inventory.expiry_risk": return { outlet_id: outlet, days: 7 };
    case "inventory.dead_stock": return { outlet_id: outlet, days: 30 };
    case "inventory.shrinkage": return { count_id: row ?? NO_ROW };
    case "purchasing.price_creep": return { as_of: fy.today };
    case "purchasing.invoice_vs_po": case "purchasing.invoice_duplicates": return { supplier_invoice_id: row ?? NO_ROW };
    case "purchasing.quote_compare": return { negotiation_run_id: row ?? NO_ROW };
    case "purchasing.deal_inputs": return { quote_id: row ?? NO_ROW };
    case "forecast.sales_history": return { outlet_id: outlet, item_id: fx.dish, from: "2026-08-01", to: fy.today };
    case "forecast.slot_profile": return { outlet_id: outlet, weeks: 12, slot_minutes: 60 };
    case "forecast.points": return { outlet_id: outlet, from: fy.today, to: addDays(fy.today, 7), item_id: null };
    case "forecast.freshness": return {};
    case "people.labour_vs_demand": return { outlet_id: outlet, from: "2026-10-01", to: "2026-10-14", slot_minutes: 60 };
    case "people.advances_open": return { outlet_id: outlet };
    case "people.payroll_lines": return { outlet_id: outlet, period_month: "2026-10-01" };
    case "customers.coupon_leakage": return { from: "2026-07-01", to: addDays(fy.today, 1) };
    case "customers.staff_coupon_use": return { outlet_id: outlet, week_start: fy.couponWeek };
    case "customers.coupon_daily": return { coupon_id: fy.coupon, to: "2026-09-30" };
    case "customers.churn_segments": return { outlet_id: outlet, as_of: "2026-09-30" };
    case "customers.consented_audience": return { segment_snapshot_id: row ?? NO_ROW };
    case "customers.coupon_current": return { coupon_id: fy.coupon };
    case "compliance.licence_calendar": return { as_of: fy.today, required_kinds: w.country === "IN" ? ["fssai", "gst"] : ["food_business_registration", "abn"] };
    case "compliance.energy_per_order": return { outlet_id: outlet, months: 4 };
    case "market.signal_uplift": return { outlet_id: outlet, kind: "festival", label: null, lookback_days: 365 };
    case "market.upcoming": return { outlet_id: outlet, days: 7 };
    case "market.ingredient_price": return { outlet_id: outlet, ingredient_id: fx.flour, days: 30, as_of: fy.today };
    case "market.competitor_gap": return { outlet_id: outlet, days: 30 };
    case "market.viability": return { viability_case_id: row ?? NO_ROW };
    case "market.goal_progress": return { goal_id: row ?? NO_ROW };
    case "market.goal_baseline": return { outlet_id: outlet, metric: "orders", months: 6 };
    // 0028: the world's Cares rows are dated 6–10 Oct 2026 (src/world.ts, tests/cares-fixture.ts).
    case "cares.listings": return { outlet_id: outlet, status: null };
    case "cares.impact": return { outlet_id: outlet, from: "2026-10-01", to: "2026-10-31" };
    case "cares.pickup_crew": return { outlet_id: outlet, listing_id: outlet === fx.A ? crew[0] : outlet === fx.B ? crew[1] : NO_ROW };
    default: throw new Error(`no params for ${id}`);
  }
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** BOARD W3 (rows M-C1b, M-C1c, and the merged lane's "remaining packs"): hand counts per pack §3 table. */
const BOARD_COUNTS: Record<string, number> = {
  // 0028 (ADR-015 §1.6, T-095c pack rows): people + cares.pickup_crew, market-strategy + cares.listings and cares.impact.
  kitchen: 5, "inventory-purchasing": 11, forecast: 5, people: 7, "customers-growth": 7, "compliance-assets": 5, "market-strategy": 9,
};
// 0022: inventory.count_variance, inventory.counts, purchasing.invoices and market.goals are non-pack templates
// (hand-excluded, as below_reorder).
// 0028: the Cares member templates live in the people and market-strategy §3 tables (cares.recipient_match is in none).
// 0037: market.ingredient_price is a pack template (market-strategy.md §3, NB-4i).
const PREFIXES = `^(kitchen|purchasing|forecast|people|customers|compliance|market)\\.|^inventory\\.(?!below_reorder$|count_variance$|counts$)|^cares\\.(?!recipient_match$)`;

describe(() => {
  test("48 new ids parsed from the seven packs' §3 tables (per-pack counts = the BOARD's) = the ids in the database", async () => {
    const perPack = Object.fromEntries(MC1BC_PACKS.map((p) => [p, packTemplates(p).length]));
    const parsed = SPEC.map((t) => t.id).sort();
    // 0022 adds as_of versions (counted once: ids, not versions).
    const live = (await db.admin<{ id: string }>(`SELECT DISTINCT id FROM evidence.snapshot_template WHERE id ~ $1
      AND id NOT IN ('purchasing.invoices', 'market.goals') ORDER BY id`, [PREFIXES])).rows.map((r) => r.id);
    console.log(`template ids: parsed ${PARSED.length} (${JSON.stringify(perPack)}), new ${parsed.length}, live ${live.length}`);
    expect(perPack).toEqual(BOARD_COUNTS);
    expect(parsed.length).toBe(48); // 44 (0021) + the three Cares templates of 0028 + market.ingredient_price (0037)
    expect(live).toEqual(parsed);
  });

  test("RED-PROOF: the 0019 id-cell rule (no remark after the id) parses people.md as 6, not the BOARD's 7", () => {
    const strict = packTemplates("people").filter((t) => !/\(/.test(t.id));
    const text = PARSED.filter((t) => t.source === "people.md §3").map((t) => t.id);
    // people.payroll_lines is the one row whose id cell is "`people.payroll_lines` (IN)": the old rule skipped it.
    const old = text.filter((id) => id !== "people.payroll_lines");
    console.log(`RED-PROOF people ids: with the remark rule ${text.length}, without ${old.length}`);
    expect(strict.length).toBe(7);
    expect(old.length).not.toBe(BOARD_COUNTS.people);
  });
});

describe("gate 2 — spec columns and params (fixture world)", () => {
  test("every template returns exactly its spec columns, in order, declares them, and takes exactly its spec params", async () => {
    const bad: string[] = [];
    for (const t of SPEC) {
      const r = await mint(db, owner(), t.id, params(t.id, fx.A, NO_ROW));
      if (JSON.stringify(r.fields) !== JSON.stringify(t.columns)) bad.push(`${t.id}: ${r.fields.join(",")} ≠ ${t.columns.join(",")}`);
      // The pack spec is version 1; 0022's as_of versions are gated in tests/mc1d.test.ts.
      const p = (await db.admin<{ p: string[] }>(`SELECT ARRAY(SELECT jsonb_object_keys(params_schema -> 'properties') ORDER BY 1) p FROM evidence.snapshot_template WHERE id = $1 AND version = 1`, [t.id])).rows[0]!.p;
      if (JSON.stringify(p) !== JSON.stringify([...t.params].sort())) bad.push(`${t.id}: params ${p.join(",")} ≠ ${t.params.join(",")}`);
      const sqlNames = bind((await db.admin<{ sql: string }>("SELECT sql FROM evidence.snapshot_template WHERE id = $1 AND version = 1", [t.id])).rows[0]!.sql).names.sort();
      if (JSON.stringify(sqlNames) !== JSON.stringify([...t.params].sort())) bad.push(`${t.id}: SQL params ${sqlNames.join(",")}`);
      const decl = (await db.admin<{ n: string[] }>(`SELECT ARRAY(SELECT c ->> 'name' FROM jsonb_array_elements(columns) c) n FROM evidence.snapshot_template WHERE id = $1 AND version = 1`, [t.id])).rows[0]!.n;
      if (JSON.stringify(decl) !== JSON.stringify(t.columns)) bad.push(`${t.id}: declared ${decl.join(",")}`);
    }
    console.log(`spec columns: ${SPEC.length - new Set(bad.map((b) => b.split(":")[0])).size}/${SPEC.length} templates exact`);
    expect(bad).toEqual([]);
  });

  test("the hand-listed exception: inventory.below_reorder is still exactly the 0005 v1 (not the pack's columns)", async () => {
    const live = (await db.admin<{ v: number; c: string[]; p: string[] }>(`SELECT version v, ARRAY(SELECT c ->> 'name' FROM jsonb_array_elements(columns) c) c,
      ARRAY(SELECT jsonb_object_keys(params_schema -> 'properties')) p FROM evidence.snapshot_template WHERE id = 'inventory.below_reorder'`)).rows;
    const spec = PARSED.find((t) => t.id === "inventory.below_reorder")!;
    console.log(`below_reorder: versions ${live.map((r) => r.v)}, columns ${live[0]!.c.join(",")} vs pack ${spec.columns.join(",")}`);
    expect(MC1BC_NOT_NEW).toEqual(["inventory.below_reorder"]);
    expect(live).toEqual([{ v: 1, c: ["outlet_id", "ingredient_id", "ingredient_name", "on_hand_milli", "min_qty_milli", "par_qty_milli"], p: [] }]);
  });

  test("RED-PROOF: a renamed output column → red", async () => {
    const x = await db.clone();
    try {
      await x.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, 'AS excess_minor', 'AS excess') WHERE id = 'inventory.waste_week'`);
      const r = await mint(x, owner(), "inventory.waste_week", params("inventory.waste_week", fx.A));
      console.log("RED-PROOF columns:", r.fields.join(","));
      expect(r.fields).not.toEqual(SPEC.find((t) => t.id === "inventory.waste_week")!.columns);
    } finally {
      await x.stop();
    }
  });
});

/** How each template is scoped (hand list). `outlet`: an outlet_id param; `row`: one row id whose outlet scopes it (the
 *  row at A, the row at B); `listed`: rows carry outlet_id; `uses`: coupon uses counted through their orders. */
const ROW_SCOPED: Record<string, () => [string, string]> = {
  "inventory.shrinkage": () => fy.counts,
  "purchasing.quote_compare": () => fy.runs,
  "purchasing.deal_inputs": () => fy.quotes,
  "customers.consented_audience": () => fy.snapshots,
  "market.goal_progress": () => fy.goals,
};
const LISTED = ["compliance.licence_calendar", "forecast.freshness"];
const USES = ["customers.coupon_leakage", "customers.coupon_daily"];
/** Tenant-level by nature (no outlet anywhere in the data they read) — not checked for outlet scope. */
const TENANT_LEVEL: Record<string, string> = {
  "purchasing.price_creep": "supplier prices and invoices are tenant-level (purchasing commands have tenant scope)",
  "purchasing.invoice_vs_po": "one tenant-level invoice; its GRN quantities are read through goods_received (scoped)",
  "purchasing.invoice_duplicates": "supplier invoices are tenant-level",
  "customers.coupon_current": "coupons are tenant-level (catalogue.coupon.set.v1 has tenant scope)",
  "market.viability": "viability cases are tenant-level (market.viability_case.upsert.v1 has tenant scope); min_role advisor",
};

async function managerScopeFailures(x: TestDb): Promise<{ checked: string[]; failures: string[] }> {
  const failures: string[] = [];
  const checked: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const t of SPEC) {
    if (t.id in TENANT_LEVEL) continue;
    checked.push(t.id);
    if (t.params.includes("outlet_id")) {
      const [ra, rb, rn] = [await mint(x, owner(), t.id, params(t.id, fx.A)), await mint(x, owner(), t.id, params(t.id, fx.B)),
        await mint(x, owner(), t.id, params(t.id, NO_OUTLET))];
      if (ra.rows.length < 1 || same(ra.rows, rn.rows) || same(rb.rows, rn.rows)) {
        failures.push(`${t.id}: fixture not discriminating (A ${ra.rows.length} rows, B ${rb.rows.length})`);
        continue;
      }
      const ma = await mint(x, managerA(), t.id, params(t.id, fx.A));
      const mb = await mint(x, managerA(), t.id, params(t.id, fx.B));
      if (!same(ma.rows, ra.rows)) failures.push(`${t.id}: manager's own outlet ≠ owner's view of it`);
      if (!same(mb.rows, rn.rows)) failures.push(`${t.id}: manager sees outlet B data`);
    } else if (t.id in ROW_SCOPED) {
      const [a, b] = ROW_SCOPED[t.id]!();
      const [ra, rb, rn] = [await mint(x, owner(), t.id, params(t.id, null, a)), await mint(x, owner(), t.id, params(t.id, null, b)),
        await mint(x, owner(), t.id, params(t.id, null, NO_ROW))];
      if (ra.rows.length < 1 || same(ra.rows, rn.rows) || same(rb.rows, rn.rows)) {
        failures.push(`${t.id}: fixture not discriminating (A ${ra.rows.length} rows, B ${rb.rows.length})`);
        continue;
      }
      if (!same((await mint(x, managerA(), t.id, params(t.id, null, a))).rows, ra.rows)) failures.push(`${t.id}: manager's own row ≠ owner's view of it`);
      if (!same((await mint(x, managerA(), t.id, params(t.id, null, b))).rows, rn.rows)) failures.push(`${t.id}: manager sees outlet B's row`);
    } else if (LISTED.includes(t.id)) {
      const ro = await mint(x, owner(), t.id, params(t.id, null));
      const rm = await mint(x, managerA(), t.id, params(t.id, null));
      const ownA = ro.rows.filter((r) => r.outlet_id === fx.A);
      if (ownA.length < 1 || !ro.rows.some((r) => r.outlet_id === fx.B)) {
        failures.push(`${t.id}: fixture not discriminating`);
        continue;
      }
      if (!same(rm.rows, ownA)) failures.push(`${t.id}: manager rows ≠ the owner's outlet-A rows (${rm.rows.length} vs ${ownA.length})`);
    } else if (USES.includes(t.id)) {
      // Independent counts (admin, no RLS) of the coupon uses in the template's window, through each use's order.
      const p = params(t.id, null);
      const [from, to] = t.id === "customers.coupon_daily" ? [addDays(p.to as string, -27), p.to] : [p.from, p.to];
      const n = async (outlets: string[]) => Number((await x.admin<{ n: string }>(`SELECT count(*) n FROM core.coupon_use cu JOIN core."order" o ON o.id = cu.order_id
        WHERE cu.tenant_id = $1 AND o.outlet_id = ANY ($2) AND o.business_date BETWEEN $3 AND $4 AND ($5::uuid IS NULL OR cu.coupon_id = $5)`,
        [w.tenant, outlets, from, to, t.id === "customers.coupon_daily" ? fy.coupon : null])).rows[0]!.n);
      const sum = (r: { rows: Row[] }) => r.rows.reduce((s, y) => s + Number(y.uses ?? 0), 0);
      const [nA, nB] = [await n([fx.A]), await n([fx.B])];
      const [so, sm] = [sum(await mint(x, owner(), t.id, p)), sum(await mint(x, managerA(), t.id, p))];
      if (nA < 1 || nB < 1) failures.push(`${t.id}: fixture not discriminating (A ${nA}, B ${nB})`);
      else if (so !== nA + nB || sm !== nA) failures.push(`${t.id}: owner ${so} uses (A+B ${nA + nB}), manager ${sm} (A ${nA})`);
    } else failures.push(`${t.id}: no scope rule in the hand list`);
  }
  return { checked, failures };
}

describe("gate 4 — manager scope", () => {
  test("an outlet-A manager sees ≥ 1 own row (= the owner's) and 0 rows of outlet B, for every template not tenant-level", async () => {
    const r = await managerScopeFailures(db);
    console.log(`manager scope: ${r.checked.length - new Set(r.failures.map((f) => f.split(":")[0])).size}/${r.checked.length} templates ok; tenant-level ${Object.keys(TENANT_LEVEL).length}`);
    for (const f of r.failures) console.log(`  ${f}`);
    expect(r.checked.length).toBe(43); // 39 + the three Cares templates (0028) + market.ingredient_price (0037)
    expect(r.failures).toEqual([]);
  });

  test("RED-PROOF: every outlet policy widened to tenant-only → every checked template turns red", async () => {
    const x = await db.clone();
    try {
      const t = (await x.admin<{ t: string }>(`SELECT DISTINCT polrelid::regclass::text t FROM pg_policy
        WHERE polname IN ('tenant_outlet_isolation', 'tenant_via_parent', 'tenant_via_asset', 'tenant_run_scope', 'tenant_outlet_either_end') ORDER BY 1`)).rows.map((y) => y.t);
      for (const tbl of t) await x.admin(`CREATE POLICY wide ON ${tbl} USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid))`);
      const r = await managerScopeFailures(x);
      const red = [...new Set(r.failures.map((f) => f.split(":")[0]))].sort();
      console.log(`RED-PROOF manager scope (${t.length} policies widened): ${red.length}/${r.checked.length} red; green: ${r.checked.filter((c) => !red.includes(c)).join(", ")}`);
      // Templates that also narrow core.outlet (tenant-visible) or a snapshot's scope to the minter's outlets themselves
      // stay green until that clause is removed too: hand list. With the clause made always-true, every one is red.
      expect(r.checked.filter((c) => !red.includes(c)).sort()).toEqual([...SELF_NARROWED].sort());
      const n = await x.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, $1, 'true') WHERE strpos(sql, $1) > 0`, [SCOPE_TEST]);
      const r2 = await managerScopeFailures(x);
      const red2 = [...new Set(r2.failures.map((f) => f.split(":")[0]))];
      console.log(`RED-PROOF manager scope, the minter-scope clause removed from ${n.rowCount} templates: ${red2.length}/${r2.checked.length} red`);
      expect(red2.sort()).toEqual([...r2.checked].sort());
    } finally {
      await x.stop();
    }
  });
});
/** Tenant-visible children (no outlet column, tenant-only policy) and the outlet-bearing parent a template must read them
 *  through (hand list, from the catalog's policies; core.posting → core.journal_entry is templates.test.ts's gate). */
const CHILD_VIA: Record<string, string> = {
  "core.coupon_use": `core."order"`, "core.advance": "core.staff", "core.stock_count_line": "core.stock_count",
  "core.grn_line": "core.goods_received", "intel.supplier_quote": "intel.run",
};
async function childReadFailures(x: TestDb): Promise<{ readers: string[]; failures: string[] }> {
  const t = (await x.admin<{ id: string; sql: string }>("SELECT id, sql FROM evidence.snapshot_template ORDER BY id")).rows;
  const readers: string[] = [];
  const failures: string[] = [];
  for (const { id, sql } of t) {
    for (const [child, parent] of Object.entries(CHILD_VIA)) {
      if (!new RegExp(`${child.replace(".", "\\.")}\\b`).test(sql)) continue;
      readers.push(`${id}:${child}`);
      if (!sql.includes(`JOIN ${parent} `) && !sql.includes(`FROM ${parent} `)) failures.push(`${id}: reads ${child} without ${parent}`);
    }
  }
  return { readers, failures };
}

describe("tenant-visible children are read through their parent (0021)", () => {
  test("every template reading coupon_use, advance, stock_count_line, grn_line or supplier_quote also reads its outlet-bearing parent", async () => {
    const r = await childReadFailures(db);
    console.log(`child readers: ${r.readers.length} (${r.readers.join(", ")}); ${r.failures.length} bad`);
    expect(r.readers.length).toBeGreaterThanOrEqual(10);
    expect(r.failures).toEqual([]);
  });

  test("RED-PROOF: a template counting coupon uses on their own → red", async () => {
    const x = await db.clone();
    try {
      await x.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) VALUES ('test.uses_alone', 1,
        'SELECT count(*) AS n FROM core.coupon_use cu', '{}', '[{"name": "n", "type": "integer", "numeric_source": "count:core.coupon_use"}]', 'manager')`);
      const r = await childReadFailures(x);
      console.log("RED-PROOF child reads:", r.failures);
      expect(r.failures).toEqual(["test.uses_alone: reads core.coupon_use without core.\"order\""]);
    } finally {
      await x.stop();
    }
  });
});

/** Templates that narrow core.outlet to the minter's outlets in their own SQL (core.outlet is tenant-visible), so a widened
 *  policy alone does not leak through them (hand list, from 0021's SQL). */
const SELF_NARROWED = ["compliance.licence_calendar", "compliance.log_coverage", "customers.consented_audience", "market.competitor_gap",
  "market.ingredient_price", "market.signal_uplift", "market.upcoming"];
/** The test every self-narrowing clause starts with (0021 SQL): "the minter holds every outlet". */
const SCOPE_TEST = `(SELECT current_setting('app.outlet_ids', true)) = '{*}'`;

describe("T-093 — history kinds shift_log and stock_count", () => {
  const svc = (): AppContext => ({ tenant_id: w.tenant, outlet_ids: "*" });
  test("accepted: a shift_log and a stock_count document and run (parsers shift_log_v1 / stock_count_v1); refused: any other kind (23514)", async () => {
    const made: string[] = [];
    for (const [kind, parser] of [["shift_log", "shift_log_v1"], ["stock_count", "stock_count_v1"]] as const) {
      const doc = uuidv7();
      const run = uuidv7();
      await db.withContext("munim_core", ownerCtx(w), (c) =>
        c.query(`INSERT INTO core.document (tenant_id, id, kind, media_type, byte_size, sha256, storage_ref) VALUES ($1, $2, $3, 'text/csv', 10, $4, 'k')`,
          [w.tenant, doc, kind, doc.replaceAll("-", "").padEnd(64, "0")]));
      await db.withContext("munim_svc", svc(), (c) =>
        c.query(`INSERT INTO core.import_run (tenant_id, id, document_id, kind, parser) VALUES ($1, $2, $3, $4, $5)`, [w.tenant, run, doc, kind, parser]));
      made.push((await db.admin<{ k: string }>(`SELECT kind || '/' || parser AS k FROM core.import_run WHERE id = $1`, [run])).rows[0]!.k);
    }
    const bad = await attempt(db, "munim_core", ownerCtx(w), `INSERT INTO core.document (tenant_id, id, kind, media_type, byte_size, sha256, storage_ref)
      VALUES ($1, $2, 'shift_logs', 'text/csv', 10, repeat('a', 64), 'k')`, [w.tenant, uuidv7()]);
    console.log(`T-093 kinds: ${made.join(", ")}; 'shift_logs' → ${bad?.code}`);
    expect(made).toEqual(["shift_log/shift_log_v1", "stock_count/stock_count_v1"]);
    expect(bad?.code).toBe("23514");
  });

  /** A submitted history count at outlet A, its line, and its adjustment as the count_adjust derivation (write_derived). */
  // Each call its own second after 20:00Z (0024: one count per outlet per instant).
  let countSeq = 0;
  const countSql = async (q: (sql: string, params?: unknown[]) => Promise<unknown>, count: string, status = "submitted") => {
    await q(`INSERT INTO core.stock_count (tenant_id, id, outlet_id, counted_by, counted_at, status)
             VALUES ($1, $2, $3, $4, '2026-09-30T20:00:00Z'::timestamptz + make_interval(secs => $6), $5)`,
      [w.tenant, count, fx.A, w.owner, status, countSeq++]);
    await q(`INSERT INTO core.stock_count_line (tenant_id, id, stock_count_id, ingredient_id, expected_qty_milli, counted_qty_milli, unit) VALUES ($1, $2, $3, $4, 3000, 2500, 'kg')`,
      [w.tenant, uuidv7(), count, fx.flour]);
  };
  const adjust = (count: string, mv: string) => JSON.stringify([{ rule: "inventory.count_adjust", source_ref: `core.stock_count:${count}`, stock_movement: [{
    id: mv, outlet_id: fx.A, ingredient_id: fx.flour, batch_id: null, qty_milli: -500, unit: "kg", kind: "count_adjust",
    unit_cost_per_1000_minor: null, currency: null, expired_sale_override_id: null, at: "2026-09-30T20:00:00Z" }] }]);
  const inImport = (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<void>) =>
    approveDraft(db, w, "imports.run.commit.v1", async (q) => fn(q)).then(() => null, (e: { code?: string; message: string }) => ({ code: e.code, message: e.message }));

  test("refused: a stock count under the owner's own imports.run.commit.v1 command → MB001 (draft-only); accepted: the same rows in its approved draft, origin = the decision", async () => {
    const own = await attempt(db, "munim_core", ownerCtx(w, { command_type: "imports.run.commit.v1" }),
      `INSERT INTO core.stock_count (tenant_id, id, outlet_id, counted_by, status) VALUES ($1, $2, $3, $4, 'submitted')`, [w.tenant, uuidv7(), fx.A, w.owner]);
    const count = uuidv7();
    const mv = uuidv7();
    let decision = "";
    const ok = await approveDraft(db, w, "imports.run.commit.v1", async (q, d) => {
      decision = d;
      await countSql(q, count);
      await q(`SELECT core.write_derived($1::jsonb)`, [adjust(count, mv)]);
    }).then(() => null, (e: { code?: string; message: string }) => e);
    const origins = (await db.admin<{ t: string; o: Record<string, string> }>(
      `SELECT 'count' t, origin o FROM core.stock_count WHERE id = $1 UNION ALL SELECT 'line', origin FROM core.stock_count_line WHERE stock_count_id = $1
       UNION ALL SELECT 'movement', origin FROM core.stock_movement WHERE id = $2 ORDER BY 1`, [count, mv])).rows;
    console.log(`T-093 count: own command → ${own?.code}; approved → ${ok ? ok.code : "accepted"} (${origins.map((r) => `${r.t}:${r.o.kind}`).join(", ")})`);
    expect(own?.code).toBe("MB001");
    expect(ok).toBeNull();
    expect(origins).toEqual([
      { t: "count", o: { kind: "decision", decision_id: decision } },
      { t: "line", o: { kind: "decision", decision_id: decision } },
      { t: "movement", o: { kind: "derivation", rule_id: "inventory.count_adjust", source_ref: `core.stock_count:${count}` } },
    ]);
  });

  test("refused: a shift under the own import command → MB001; accepted: a closed history shift in the approved draft", async () => {
    const own = await attempt(db, "munim_core", ownerCtx(w, { command_type: "imports.run.commit.v1" }),
      `INSERT INTO core.shift (tenant_id, id, outlet_id, opened_by, float_minor, currency) VALUES ($1, $2, $3, $4, 500000, $5)`, [w.tenant, uuidv7(), fx.A, w.owner, w.currency]);
    const shift = uuidv7();
    const ok = await inImport((q) => q(`INSERT INTO core.shift (tenant_id, id, outlet_id, status, opened_by, opened_at, float_minor, currency, closed_by, closed_at,
                                                               counted_cash_minor, expected_cash_minor, variance_minor)
      VALUES ($1, $2, $3, 'closed', $4, '2026-09-30T03:30:00Z', 500000, $5, $4, '2026-09-30T16:30:00Z', 588400, 613400, -25000)`,
      [w.tenant, shift, fx.A, w.owner, w.currency]).then(() => undefined));
    console.log(`T-093 shift: own command → ${own?.code}; approved → ${ok ? ok.code : "accepted"}`);
    expect(own?.code).toBe("MB001");
    expect(ok).toBeNull();
    expect((await db.admin(`SELECT status, variance_minor::int v, origin->>'kind' k FROM core.shift WHERE id = $1`, [shift])).rows).toEqual([{ status: "closed", v: -25000, k: "decision" }]);
  });

  test("count_adjust admits a movement only from a submitted count: as a derivation alone, open → MB001, cancelled → MB001, submitted → accepted; under the import decision, open → refused (MB008: the decision does not bind movements)", async () => {
    const results: Record<string, string> = {};
    for (const status of ["open", "cancelled", "submitted"]) {
      const count = uuidv7();
      await db.withContext("munim_core", ownerCtx(w, { command_type: "inventory.count.submit.v1" }), (c) => countSql((s, p) => c.query(s, p), count, status));
      // No command and no decision: only the derivation branch can admit the movement.
      const e = await attempt(db, "munim_core", { tenant_id: w.tenant, outlet_ids: "*", role: "owner", member_id: w.owner },
        `SELECT core.write_derived($1::jsonb)`, [adjust(count, uuidv7())]);
      results[status] = e ? e.code : "accepted";
    }
    const openCount = uuidv7();
    const inDecision = await inImport(async (q) => {
      await countSql(q, openCount, "open");
      await q(`SELECT core.write_derived($1::jsonb)`, [adjust(openCount, uuidv7())]);
    });
    console.log(`T-093 count_adjust by source state: ${JSON.stringify(results)}; open count inside the import decision → ${inDecision?.code}`);
    expect(results).toEqual({ open: "MB001", cancelled: "MB001", submitted: "accepted" });
    expect(inDecision?.code).toBe("MB008");
  });
});
