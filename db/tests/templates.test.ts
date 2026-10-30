// M-C1a gates on the canonical world + the 0019 fixture (BOARD W3.0 m-1). The expected template ids, columns and
// bridge components come from tests/template-spec.ts, which parses the pack docs and ADR-014 — never the migration.
//   (1) template ids = the 14 parsed from catalogue/finance §3 + ADR-014 §7.3;
//   (2) each template returns exactly its spec columns (here on the fixture; the restaurant_group and store worlds are
//       tests/templates-worlds.ts);
//   (4) manager scope: an outlet-A manager sees what the owner sees for outlet A, and for outlet B exactly what an
//       outlet with no data shows (0 rows of B); red when the outlet policies are widened (gotcha 22: widened, not
//       dropped);
//   (5) margin_bridge: Σ component deltas = margin_delta_minor = an independent recomputation from postings, owner and
//       manager; a planted mis-sum → red;
//   (6) advisor rung at the SQL level: min_role CHECK, the finance templates at 'advisor', an advisor mints finance.pnl;
//   plus the snapshot_template CHECKs (numeric_source shape, no trailing ';') and: every template reads core.posting
//   (tenant-visible, 0019 header) only joined to its journal entry. Gate (3) is books.test.ts.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AppContext, TestDb } from "../src/harness.ts";
import { openDb, pgError } from "./db.ts";
import { addOutletData, type McFixture } from "./mc1a-fixture.ts";
import { bridgeSpec, mc1aTemplates, specVersion } from "./template-spec.ts";
import { buildWorld, type World } from "./world.ts";

let db: TestDb;
let w: World;
let fx: McFixture;
const SPEC = mc1aTemplates();
const NO_OUTLET = randomUUID(); // an outlet id that is no outlet: the "outlet with no data" reference

beforeAll(async () => {
  db = await openDb();
  w = await buildWorld(db);
  fx = await addOutletData(db, w);
});
afterAll(async () => db?.stop());

/** Named params (`:name`) → `$n`, outside string literals, quoted identifiers, dollar quotes and comments; `::` is a cast.
 *  The same rules as core-api's bindNamedParams (the db package does not import core-api). */
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
/** Runs a stored template as core-api does (`SELECT … FROM (<sql>) t LIMIT 500`), cells as text — the version its pack
 *  §3 row describes (template-spec SPEC_VERSION: the 0023 finance versions; version 1 otherwise). */
async function mint(x: TestDb, ctx: AppContext, id: string, params: Record<string, unknown>): Promise<{ fields: string[]; rows: Row[] }> {
  const t = (await x.admin<{ sql: string }>("SELECT sql FROM evidence.snapshot_template WHERE id = $1 AND version = $2", [id, specVersion(id)])).rows[0];
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
const advisor = (): AppContext => ({ tenant_id: w.tenant, outlet_ids: "*", role: "advisor", member_id: fx.advisor });

/** Params per template on the fixture (September, compared with August). `outlet` fills `outlet_id` where the template has it. */
function params(id: string, outlet: string | null): Record<string, unknown> {
  const sep = { from: "2026-09-01", to: "2026-09-30" };
  switch (id) {
    case "catalogue.dish_margin": return { outlet_id: outlet, channel_kind: null, ...sep };
    case "catalogue.menu_matrix":
    case "catalogue.deal_cost":
    case "catalogue.sku_price_check": return { outlet_id: outlet, ...sep };
    case "catalogue.cost_drift": return { outlet_id: outlet, since: "2026-08-01" };
    case "catalogue.recipe_current": return { item_id: fx.dish, outlet_id: outlet };
    case "finance.unapproved_deductions": return { channel_id: null, month: "2026-09-01", outlet_id: outlet };
    case "finance.settlement_vs_orders": return { channel_id: null, outlet_id: outlet, ...sep };
    case "finance.missing_payouts": return { channel_id: null, as_of: "2026-09-30", outlet_id: outlet };
    case "finance.tender_vs_bank": return { outlet_id: outlet, method: "upi", from: "2026-08-01", to: "2026-09-30" };
    case "finance.close_status": return { period_month: "2026-09-01", outlet_id: outlet };
    case "finance.pnl": return { period_month: "2026-09-01", group_by: "outlet" };
    case "finance.gst_check": return { period_month: "2026-09-01", outlet_id: outlet };
    case "finance.margin_bridge": return { period_month: "2026-09-01", compare_month: "2026-08-01" };
    default: throw new Error(`no params for ${id}`);
  }
}
/** finance templates whose pack params carry no outlet_id but 0019 adds an optional one (R40 C4: params only narrow). */
const ADDED_OUTLET_PARAM = ["finance.missing_payouts", "finance.settlement_vs_orders", "finance.unapproved_deductions"];
const OUTLET_PARAM = [...SPEC.filter((t) => t.params.includes("outlet_id")).map((t) => t.id), ...ADDED_OUTLET_PARAM];
/** The clause finance.tender_vs_bank / close_status use to narrow core.outlet to the minter's outlets. */
const SCOPE_CLAUSE = `((SELECT current_setting('app.outlet_ids', true)) = '{*}'
          OR o.id = ANY ((SELECT nullif(nullif(current_setting('app.outlet_ids', true), ''), '{*}'))::uuid[]))`;

describe("gate 1 — template ids", () => {
  test("14 ids parsed from the docs; the database holds exactly those under catalogue./finance.", async () => {
    const parsed = SPEC.map((t) => t.id).sort();
    // 0022: catalogue.cost_drift / recipe_current gain an as_of version 2 (counted once here) and finance.gst_summary is a
    // non-pack template (hand-listed), so neither changes the pack id set.
    const live = (await db.admin<{ id: string }>(`SELECT DISTINCT id FROM evidence.snapshot_template WHERE id ~ '^(catalogue|finance)\\.' AND id <> 'finance.gst_summary' ORDER BY id`)).rows.map((r) => r.id);
    console.log(`template ids: parsed ${parsed.length} (${SPEC.map((t) => t.source).filter((s, i, a) => a.indexOf(s) === i).join(" + ")}), live ${live.length}`);
    expect(parsed.length).toBe(14);
    expect(live).toEqual(parsed);
  });

  test("RED-PROOF: a missing and an extra template → the id comparison fails", async () => {
    const x = await db.clone();
    try {
      await x.admin(`UPDATE evidence.snapshot_template SET id = 'finance.close_status_old' WHERE id = 'finance.close_status'`);
      const live = (await x.admin<{ id: string }>(`SELECT id FROM evidence.snapshot_template WHERE id ~ '^(catalogue|finance)\\.' ORDER BY id`)).rows.map((r) => r.id);
      const parsed = SPEC.map((t) => t.id).sort();
      console.log("RED-PROOF ids:", live.filter((i) => !parsed.includes(i)), parsed.filter((i) => !live.includes(i)));
      expect(live).not.toEqual(parsed);
    } finally {
      await x.stop();
    }
  });
});

describe("gate 2 — spec columns (fixture world)", () => {
  test("every template returns exactly its spec columns, in order, and its params are the spec's", async () => {
    const bad: string[] = [];
    for (const t of SPEC) {
      const r = await mint(db, owner(), t.id, params(t.id, fx.A));
      if (JSON.stringify(r.fields) !== JSON.stringify(t.columns)) bad.push(`${t.id}: ${r.fields.join(",")} ≠ ${t.columns.join(",")}`);
      const p = (await db.admin<{ p: string[] }>(`SELECT ARRAY(SELECT jsonb_object_keys(params_schema -> 'properties')) p FROM evidence.snapshot_template WHERE id = $1 AND version = $2`, [t.id, specVersion(t.id)])).rows[0]!.p;
      const extra = p.filter((k) => !t.params.includes(k));
      if (!t.params.every((k) => p.includes(k)) || extra.some((k) => k !== "outlet_id" || !ADDED_OUTLET_PARAM.includes(t.id))) bad.push(`${t.id}: params ${p.join(",")}`);
      // The declared columns (what core-api types cells by) are the spec's too.
      const decl = (await db.admin<{ n: string[] }>(`SELECT ARRAY(SELECT c ->> 'name' FROM jsonb_array_elements(columns) c) n FROM evidence.snapshot_template WHERE id = $1 AND version = $2`, [t.id, specVersion(t.id)])).rows[0]!.n;
      if (JSON.stringify(decl) !== JSON.stringify(t.columns)) bad.push(`${t.id}: declared ${decl.join(",")}`);
    }
    console.log(`spec columns: ${SPEC.length - bad.length}/${SPEC.length} templates exact`);
    expect(bad).toEqual([]);
  });

  test("RED-PROOF: a renamed output column → red", async () => {
    const x = await db.clone();
    try {
      await x.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, 'm.lines_unpriced::bigint AS lines_unpriced', 'm.lines_unpriced::bigint AS unpriced')
                      WHERE id = 'catalogue.dish_margin'`);
      const r = await mint(x, owner(), "catalogue.dish_margin", params("catalogue.dish_margin", fx.A));
      console.log("RED-PROOF columns:", r.fields.join(","));
      expect(r.fields).not.toEqual(SPEC.find((t) => t.id === "catalogue.dish_margin")!.columns);
    } finally {
      await x.stop();
    }
  });
});

/** Gate 4 over one database: per template, what failed. */
async function managerScopeFailures(x: TestDb): Promise<{ checked: string[]; failures: string[] }> {
  const failures: string[] = [];
  const checked: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const id of OUTLET_PARAM) {
    checked.push(id);
    const [ra, rb, rn] = [await mint(x, owner(), id, params(id, fx.A)), await mint(x, owner(), id, params(id, fx.B)), await mint(x, owner(), id, params(id, NO_OUTLET))];
    // Discriminating fixture: A's and B's results each differ from an outlet with no data, and A's has rows.
    if (ra.rows.length < 1 || same(ra.rows, rn.rows) || same(rb.rows, rn.rows)) {
      failures.push(`${id}: fixture not discriminating (A ${ra.rows.length} rows, B ${rb.rows.length})`);
      continue;
    }
    const ma = await mint(x, managerA(), id, params(id, fx.A));
    const mb = await mint(x, managerA(), id, params(id, fx.B));
    if (!same(ma.rows, ra.rows)) failures.push(`${id}: manager's own outlet ≠ owner's view of it`);
    if (!same(mb.rows, rn.rows)) failures.push(`${id}: manager sees outlet B data`);
  }
  // Keyed by outlet: P&L by outlet (finance.gst_check takes an outlet_id since 0023 and is checked by it above).
  for (const [id, key] of [["finance.pnl", "key"]] as const) {
    checked.push(id);
    const ro = await mint(x, owner(), id, params(id, null));
    const rm = await mint(x, managerA(), id, params(id, null));
    const ownA = ro.rows.find((r) => r[key] === fx.A);
    if (!ownA || !ro.rows.some((r) => r[key] === fx.B)) {
      failures.push(`${id}: fixture not discriminating`);
      continue;
    }
    if (!same(rm.rows.find((r) => r[key] === fx.A), ownA)) failures.push(`${id}: manager's outlet-A row ≠ owner's`);
    const leaked = rm.rows.filter((r) => r[key] !== fx.A && r[key] !== "unassigned" && r[key] !== null).length;
    if (leaked) failures.push(`${id}: manager sees ${leaked} rows of other outlets`);
  }
  // The bridge has no outlet param (ADR-014 §7.3: scope from the minter): the manager's margin is outlet A's (and the
  // tenant-wide entries'), recomputed here from raw postings, and differs from the whole tenant's.
  checked.push("finance.margin_bridge");
  const mbr = await mint(x, managerA(), "finance.margin_bridge", params("finance.margin_bridge", null));
  const obr = await mint(x, owner(), "finance.margin_bridge", params("finance.margin_bridge", null));
  const sumRow = (r: { rows: Row[] }) => r.rows.find((y) => y.component === "margin_delta_minor");
  const [mPrior, mCur] = [await marginOf(x, "2026-08-01", [fx.A]), await marginOf(x, "2026-09-01", [fx.A])];
  const [oPrior, oCur] = [await marginOf(x, "2026-08-01", null), await marginOf(x, "2026-09-01", null)];
  if (oCur === mCur && oPrior === mPrior) failures.push("finance.margin_bridge: fixture not discriminating");
  else if (sumRow(mbr)?.prior_minor !== String(mPrior) || sumRow(mbr)?.current_minor !== String(mCur)) {
    failures.push(`finance.margin_bridge: manager's margin ${sumRow(mbr)?.prior_minor}→${sumRow(mbr)?.current_minor}, outlet A's ${mPrior}→${mCur}`);
  } else if (sumRow(obr)?.current_minor !== String(oCur)) failures.push("finance.margin_bridge: owner's margin is not the tenant's");
  return { checked, failures };
}

/** Margin of a month from raw postings, as the admin (no RLS): −Σ income and expense postings, entries of `outlets`
 *  plus tenant-wide ones (null = every outlet). Independent of the template's SQL. */
async function marginOf(x: TestDb, month: string, outlets: string[] | null): Promise<number> {
  const r = await x.admin<{ m: string }>(`
    SELECT coalesce(-sum(p.amount_minor), 0)::text AS m
      FROM core.posting p JOIN core.journal_entry je ON je.tenant_id = p.tenant_id AND je.id = p.journal_entry_id
      JOIN core.account a ON a.tenant_id = p.tenant_id AND a.id = p.account_id
     WHERE p.tenant_id = $1 AND a.type IN ('income', 'expense') AND date_trunc('month', je.entry_date) = $2::date
       AND ($3::uuid[] IS NULL OR je.outlet_id IS NULL OR je.outlet_id = ANY ($3::uuid[]))`, [w.tenant, month, outlets]);
  return Number(r.rows[0]!.m);
}

describe("gate 4 — manager scope", () => {
  test("an outlet-A manager minting each outlet-scoped template sees ≥ 1 own row and 0 outlet-B rows", async () => {
    const r = await managerScopeFailures(db);
    console.log(`manager scope: ${r.checked.length - r.failures.length}/${r.checked.length} templates ok (${r.checked.length} checked)`);
    expect(r.checked.length).toBe(14);
    expect(r.failures).toEqual([]);
  });

  test("RED-PROOF: every outlet policy widened to tenant-only (a permissive tenant policy beside it) → 13 red; tender_vs_bank needs its own scope clause gone too", async () => {
    const x = await db.clone();
    try {
      const t = (await x.admin<{ t: string }>(`SELECT DISTINCT polrelid::regclass::text t FROM pg_policy
        WHERE polname IN ('tenant_outlet_isolation', 'tenant_via_parent', 'tenant_outlet_either_end') ORDER BY 1`)).rows.map((y) => y.t);
      for (const tbl of t) await x.admin(`CREATE POLICY wide ON ${tbl} USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid))`);
      const r = await managerScopeFailures(x);
      const red = [...new Set(r.failures.map((f) => f.split(":")[0]))].sort();
      console.log(`RED-PROOF manager scope (${t.length} policies widened): ${red.length} red —`, r.failures);
      // finance.tender_vs_bank (and close_status) also narrow core.outlet — tenant-visible — to the minter's outlets
      // themselves: a tenant-wide bank line paid to another outlet's VPA would otherwise be credited to it. With the
      // policies widened that clause still holds it; removing the clause as well turns it red.
      expect(red).toEqual(r.checked.filter((id) => id !== "finance.tender_vs_bank").sort());
      await x.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, $1, 'true') WHERE id IN ('finance.tender_vs_bank', 'finance.close_status')`,
        [SCOPE_CLAUSE]);
      const r2 = await managerScopeFailures(x);
      console.log("RED-PROOF manager scope, scope clause removed too:", r2.failures);
      expect([...new Set(r2.failures.map((f) => f.split(":")[0]))].sort()).toEqual([...r2.checked].sort());
    } finally {
      await x.stop();
    }
  });

  test("RED-PROOF: only 0019's tables widened → the templates that read them turn red", async () => {
    const x = await db.clone();
    try {
      for (const tbl of ["bank_line", "budget", "bulk_order", "business_policy", "conversation", "expense", "hiring_candidate", "journal_entry",
        "market_signal", "payroll_draft", "period_close", "price", "reconciliation_break", "reservation", "review", "roster", "settlement", "staff",
        "tax_return_draft", "ticket_counter", "tip_pool", "settlement_line", "payroll_draft_line", "tip_pool_share", "message"]) {
        await x.admin(`CREATE POLICY wide ON core.${tbl} USING (tenant_id = (SELECT nullif(current_setting('app.tenant_id', true), '')::uuid))`);
      }
      const r = await managerScopeFailures(x);
      const red = [...new Set(r.failures.map((f) => f.split(":")[0]))].sort();
      console.log("RED-PROOF manager scope, 0019 tables only:", r.failures);
      // Hand list: the templates whose outlet-B data reaches the result only through a 0019 table.
      expect(red).toEqual(["catalogue.cost_drift", "catalogue.sku_price_check", "finance.close_status", "finance.gst_check",
        "finance.margin_bridge", "finance.pnl", "finance.settlement_vs_orders", "finance.unapproved_deductions"]);
    } finally {
      await x.stop();
    }
  });
});

/** core.posting is tenant-visible (0019 header): a template may read it only joined to its journal entry, whose policy
 *  carries the outlet scope. Returns the templates that read postings any other way. */
async function postingReadFailures(x: TestDb): Promise<{ readers: string[]; failures: string[] }> {
  const t = (await x.admin<{ id: string; sql: string }>("SELECT id, sql FROM evidence.snapshot_template ORDER BY id")).rows;
  const failures: string[] = [];
  const readers: string[] = [];
  for (const { id, sql } of t) {
    const uses = (sql.match(/core\.posting\b/g) ?? []).length;
    if (!uses) continue;
    if (!readers.includes(id)) readers.push(id); // every version is checked; a reader is listed once (0023: gst_check v2)
    const joined = [...sql.matchAll(/JOIN core\.posting (\w+) ON \1\.tenant_id = (\w+)\.tenant_id AND \1\.journal_entry_id = \2\.id/g)]
      .filter((m) => new RegExp(`core\\.journal_entry ${m[2]}\\b`).test(sql)).length;
    if (joined !== uses) failures.push(`${id}: ${uses - joined} of ${uses} reads of core.posting not joined to their journal entry`);
  }
  return { readers, failures };
}

describe("core.posting is read through its journal entry (0019)", () => {
  test("every template that reads core.posting joins it to core.journal_entry", async () => {
    const r = await postingReadFailures(db);
    console.log(`posting readers: ${r.readers.join(", ")}; ${r.failures.length} bad`);
    // 0021: market.viability reads the comparable outlet's postings (through their entries) as well.
    // 0022: finance.gst_summary reads postings through their entries too.
    expect(r.readers).toEqual(["finance.close_status", "finance.gst_check", "finance.gst_summary", "finance.margin_bridge", "finance.pnl", "market.viability"]);
    expect(r.failures).toEqual([]);
  });

  test("RED-PROOF: a template summing core.posting on its own → red", async () => {
    const x = await db.clone();
    try {
      await x.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) VALUES ('test.postings_alone', 1,
        'SELECT sum(p.amount_minor) AS n FROM core.posting p', '{}', '[{"name": "n", "type": "integer", "numeric_source": "core.posting.amount_minor"}]', 'manager')`);
      const r = await postingReadFailures(x);
      console.log("RED-PROOF posting reads:", r.failures);
      expect(r.failures).toEqual(["test.postings_alone: 1 of 1 reads of core.posting not joined to their journal entry"]);
    } finally {
      await x.stop();
    }
  });
});

/** Gate 5 over one context: the bridge's rows against the spec and against postings. */
async function bridgeFailures(x: TestDb, ctx: AppContext, outlets: string[] | null): Promise<{ delta: number; failures: string[] }> {
  const spec = bridgeSpec();
  const r = await mint(x, ctx, spec.id, params(spec.id, null));
  const failures: string[] = [];
  const labels = r.rows.map((y) => y.component);
  if (JSON.stringify(labels) !== JSON.stringify([...spec.components, spec.sumRow])) failures.push(`components ${labels.join(",")}`);
  const comps = r.rows.filter((y) => y.component !== spec.sumRow);
  const sum = (k: string) => comps.reduce((a, y) => a + BigInt(y[k] ?? "NaN"), 0n);
  const total = r.rows.find((y) => y.component === spec.sumRow)!;
  const [prior, cur] = [await marginOf(x, "2026-08-01", outlets), await marginOf(x, "2026-09-01", outlets)];
  const delta = cur - prior;
  if (total.delta_minor !== String(delta)) failures.push(`Σ row ${total.delta_minor} ≠ recomputed margin delta ${delta}`);
  if (sum("delta_minor") !== BigInt(delta)) failures.push(`Σ component deltas ${sum("delta_minor")} ≠ ${delta}`);
  if (sum("prior_minor") !== BigInt(prior) || sum("current_minor") !== BigInt(cur)) failures.push("Σ prior / current ≠ the months' margins");
  for (const y of r.rows) if (BigInt(y.current_minor!) - BigInt(y.prior_minor!) !== BigInt(y.delta_minor!)) failures.push(`${y.component}: delta ≠ current − prior`);
  return { delta, failures };
}

describe("gate 5 — margin_bridge balances exactly", () => {
  test("owner and outlet-A manager: Σ component rows = margin_delta_minor = the recomputation from postings", async () => {
    const o = await bridgeFailures(db, owner(), null);
    const m = await bridgeFailures(db, managerA(), [fx.A]);
    console.log(`bridge: owner Δ ${o.delta} (${o.failures.length} failures), manager A Δ ${m.delta} (${m.failures.length} failures)`);
    expect(o.delta).not.toBe(0);
    expect(o.failures).toEqual([]);
    expect(m.failures).toEqual([]);
  });

  test("RED-PROOF: a planted mis-sum (unexplained off by one) → red", async () => {
    const x = await db.clone();
    try {
      await x.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, 'SELECT 10, ''unexplained'', v.mp', 'SELECT 10, ''unexplained'', 1 + v.mp')
                      WHERE id = 'finance.margin_bridge'`);
      const o = await bridgeFailures(x, owner(), null);
      console.log("RED-PROOF bridge:", o.failures);
      expect(o.failures.some((f) => f.startsWith("Σ prior / current"))).toBe(true);
      expect(o.failures.some((f) => f.startsWith("unexplained: delta"))).toBe(false);
    } finally {
      await x.stop();
    }
  });
});

describe("gate 6 — the advisor rung (SQL level; the 201/403 pair is core-api's ladder)", () => {
  test("min_role admits 'advisor' and refuses an unknown rung; the eight finance templates are 'advisor', catalogue 'manager'", async () => {
    const roles = (await db.admin<{ id: string; min_role: string }>(`SELECT id, min_role FROM evidence.snapshot_template WHERE id ~ '^(catalogue|finance)\\.' ORDER BY id`)).rows;
    expect(roles.filter((r) => r.id.startsWith("finance.")).every((r) => r.min_role === "advisor")).toBe(true);
    expect(roles.filter((r) => r.id.startsWith("catalogue.")).every((r) => r.min_role === "manager")).toBe(true);
    const x = await db.clone();
    try {
      const ins = (role: string) => pgError(() => x.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role)
        VALUES ('test.rung', 1, 'SELECT 1 AS n', '{}', '[{"name": "n", "type": "integer", "numeric_source": "count:core.order"}]', $1)`, [role]));
      expect(await ins("auditor")).toMatchObject({ code: "23514" });
      expect(await ins("advisor")).toBeNull();
    } finally {
      await x.stop();
    }
  });

  test("an advisor mints finance.pnl (runs it and stores the snapshot as itself)", async () => {
    const r = await mint(db, advisor(), "finance.pnl", params("finance.pnl", null));
    expect(r.rows.length).toBeGreaterThan(0);
    const id = randomUUID();
    await db.withContext("munim_core", advisor(), (c) =>
      c.query(`INSERT INTO evidence.snapshot (tenant_id, id, template_id, template_version, params, minted_by_member_id, outlet_scope, rows, row_count, sha256)
               VALUES ($1, $2, 'finance.pnl', 1, $3, $4, '{*}', $5, $6, repeat('0', 64))`,
        [w.tenant, id, params("finance.pnl", null), fx.advisor, JSON.stringify(r.rows), r.rows.length]));
    const s = (await db.admin<{ m: string; role: string }>(`SELECT s.minted_by_member_id m, t.min_role role FROM evidence.snapshot s
      JOIN evidence.snapshot_template t ON t.id = s.template_id AND t.version = s.template_version WHERE s.id = $1`, [id])).rows[0]!;
    expect(s).toEqual({ m: fx.advisor, role: "advisor" });
  });
});

describe("snapshot_template CHECKs (0019 T2)", () => {
  test("numeric_source as a string or a non-empty list of strings; never missing, empty or mixed; no trailing ';'", async () => {
    const x = await db.clone();
    try {
      const ins = (cols: string, sql = "SELECT 1 AS n") => pgError(() => x.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role)
        VALUES ('test.c' || substr(md5(random()::text), 1, 8), 1, $1, '{}', $2, 'manager')`, [sql, cols]));
      expect(await ins('[{"name": "n", "type": "integer", "numeric_source": ["core.order.total_minor", "core.order.tax_minor"]}]')).toBeNull();
      expect(await ins('[{"name": "n", "type": "integer", "numeric_source": "core.order.total_minor"}]')).toBeNull();
      expect(await ins('[{"name": "n", "type": "text"}]')).toBeNull();
      for (const bad of ['[{"name": "n", "type": "integer"}]', '[{"name": "n", "type": "numeric", "numeric_source": []}]',
        '[{"name": "n", "type": "integer", "numeric_source": ["core.order.total_minor", 3]}]', '[{"name": "n", "type": "integer", "numeric_source": ""}]']) {
        expect(await ins(bad)).toMatchObject({ code: "23514" });
      }
      expect(await ins('[{"name": "n", "type": "text"}]', "SELECT 1 AS n;")).toMatchObject({ code: "23514" });
      expect(await ins('[{"name": "n", "type": "text"}]', "SELECT 1 AS n; \n")).toMatchObject({ code: "23514" });
    } finally {
      await x.stop();
    }
  });
});
