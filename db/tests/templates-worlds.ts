// M-C1a gates (2) and (5) and M-C1bc gate (2) on two worldgen worlds (BOARD W3 m-1): restaurant_group and store are seeded
// into an embedded Postgres through the real core-api over HTTP (tools/worldgen, gate profile: as of 2026-10-10, 100 days),
//   (2) every M-C1a and M-C1bc template returns exactly its spec columns (tests/template-spec.ts parses them from the
//       docs), run through core-api's own runTemplate and checked against the SQL's own output fields;
//   (5) finance.margin_bridge (September vs August): Σ component rows = margin_delta_minor = the margin delta recomputed
//       from raw postings, for the owner on both worlds and for an outlet-1 manager on restaurant_group;
//   and, against the hand-kept answer keys (tools/worldgen/answer-key): RG-F1 + RG-F2 = Σ unapproved_minor (October),
//   RG-F3 = Σ short_minor (3–8 Oct payouts), RG-F4 + RG-F7 = the missing-payouts Σ order total, ST-C4 = Σ above_mrp_minor.
//   and M-C1bc (0021): the T-086 / W-1 plants each pack's templates surface, hand list KEY_CHECKS below (each against its
//   answer-key impact or metric, the template column named beside it). Three are time-bound (RG-M1, RG-M1b, ST-I4: their
//   pack templates have no date param and read today). Since 0022 (M-C1d) they run version 2 pinned to as_of = AS_OF, so
//   they hold whatever day the gate runs (until 0022 they ran only while the real date lay inside the plant's window), and
//   (A1) a copy of each version 2 whose wall clock is moved 400 days ahead still returns the key at as_of = AS_OF, while the
//   same move on version 1 loses the plant (so the move is one the plant would notice).
// Exit 0 only when every check holds (gotcha 33: judged by exit code). Red-proof: db/tests/redproof-0019.sh runs
//   node db/tests/templates-worlds.ts --plant=mis-sum   (the bridge's unexplained row off by one → (5) red)
//   node db/tests/templates-worlds.ts --plant=column    (one dish_margin column renamed → (2) red)
// and db/tests/redproof-0021.sh runs
//   node db/tests/templates-worlds.ts --plant=mc1bc-column  (one waste_week column renamed → (2) red)
//   node db/tests/templates-worlds.ts --plant=key           (waste valued 1% high → the waste plants' key checks red)
// and db/tests/redproof-0022.sh runs
//   node db/tests/templates-worlds.ts --plant=asof          (version 2 ignores as_of → the moved-clock checks red)
// M-C1e (0023): cloud_kitchen and au_outlet are seeded too (the checks above stay on restaurant_group and store). On all
// four, the 0023 version 2s against the answer keys (mc1eChecks: RG-F3 / CK-F3 / AU-F3 Σ row of the planted settlement,
// RG-F4 + F7 Σ row of the channel, RG-F5 the three weeks' Σ rows, RG-P1 / AU-P1 the cook's Σ row, RG-A5 / ST-A5 / AU-A5 the
// licence in force with its outlet's manager), and the finance spec columns run the version finance.md §3 describes (2).
// db/tests/redproof-0023.sh runs
//   node db/tests/templates-worlds.ts --plant=mc1e          (each 0023 Σ / status cell off by one → every mc1e check red)
// 0024 (R-A F5): settlement_vs_orders v3 (the version core-api mints) agrees with core's short_payout breaks on every
// settlement of all four worlds, and the planted F3 statement (RG-F3 / CK-F3 / AU-F3) has every order line matched, with
// core's breaks = v3's Σ = the key (m0024Checks); db/tests/redproof-0024.sh runs
//   node db/tests/templates-worlds.ts --plant=m0024         (v3's Σ short_minor off by one → six m0024 checks red: both per world with a settlement)
// 0026 (R47 D6, D3): people.labour_vs_demand v2 on restaurant_group's RG-P2 (the helpers' slots, priced at the helpers' own
// rate) and purchasing.deal_inputs v3 on the store (shop SKU margins from the shelf price; packaging skips the rule), hand
// values typed below from the answer keys and the world's shelf prices (m0026Checks); db/tests/redproof-0026.sh runs
//   node db/tests/templates-worlds.ts --plant=m0026         (v2 fills the excess most expensive first, v3 drops the SKU path → every m0026 check red)
// Synthetic data only; no .env, no network beyond 127.0.0.1.
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, loadConfig } from "../../packages/config/src/index.ts";
import { createLocalIdp } from "../../services/core-api/src/auth/local-idp.ts";
import { createPool } from "../../services/core-api/src/lib/db.ts";
import { bindNamedParams, runTemplate } from "../../services/core-api/src/modules/approvals/snapshots.ts";
import { localBlobStore } from "../../services/core-api/src/modules/imports/index.ts";
import { composeCoreApi, serveApi } from "../../services/core-api/src/server.ts";
import { parsePendingImports } from "../../services/core-worker/src/imports/index.ts";
import { startIntelStub } from "../../scripts/dev/intel-stub.ts";
import { personaIdentity } from "../../tools/worldgen/src/api.ts";
import { runWorld } from "../../tools/worldgen/src/run.ts";
import { AS_OF, DAYS } from "../../tools/worldgen/test/profile.ts";
import { startTestDb, type AppContext, type TestDb } from "../src/harness.ts";
import { idOf } from "../../tools/worldgen/src/ids.ts";
import { bridgeSpec, MC1BC_NOT_NEW, mc1aTemplates, mc1bcTemplates, specVersion } from "./template-spec.ts";

const PLANTS = ["mis-sum", "column", "mc1bc-column", "key", "asof", "mc1e", "m0024", "m0026"] as const;
function parsePlant(argv: string[]): (typeof PLANTS)[number] | null {
  let plant: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const m = /^--plant(?:=(.*))?$/.exec(argv[i]!);
    if (!m) throw new Error(`unknown argument ${argv[i]}`);
    plant = m[1] ?? argv[++i] ?? "";
  }
  if (plant !== null && !(PLANTS as readonly string[]).includes(plant)) throw new Error(`--plant must be one of ${PLANTS.join(", ")}`);
  return plant as (typeof PLANTS)[number] | null;
}

const ROOT = join(import.meta.dirname, "..", "..");
const SPEC = [...mc1aTemplates(), ...mc1bcTemplates().filter((t) => !MC1BC_NOT_NEW.includes(t.id))];
/** --plant=mc1e: one cell of each 0023 version 2 the answer-key checks read, off by one (or a status renamed). */
const MC1E_PLANT: Array<[string, string, string]> = [
  ["finance.settlement_vs_orders", "coalesce(sum(q.short) FILTER (WHERE q.counts), 0)::bigint AS short_minor", "(1 + coalesce(sum(q.short) FILTER (WHERE q.counts), 0))::bigint AS short_minor"],
  ["finance.missing_payouts", "sum(m.total_minor)::bigint AS order_total_minor", "(1 + sum(m.total_minor))::bigint AS order_total_minor"],
  ["finance.tender_vs_bank", "sum(gd.gap_minor)::bigint AS gap_minor", "(1 + sum(gd.gap_minor))::bigint AS gap_minor"],
  ["people.overtime_drift", "sum(w.extra_cost_minor)::bigint AS extra_cost_minor", "(1 + sum(w.extra_cost_minor))::bigint AS extra_cost_minor"],
  ["compliance.licence_calendar", "THEN 'in_force'", "THEN 'held'"],
];

type KeyEntry = { id: string; impact_minor: number | null; metric?: { value: number }; where: Record<string, unknown> };
/** M-C1e (0023) answer-key checks of one world: [what, the key's value, the version-2 cell]. Values come from
 *  tools/worldgen/answer-key/<world>.json (and, for RG-F5's weeks, its `what` text, copied by hand below). */
async function mc1eChecks(db: TestDb, world: string, tenant: string, v2: (id: string, p: Record<string, unknown>) => Promise<Row[]>,
  kid: (k: string) => string): Promise<Array<[string, unknown, unknown]>> {
  const key = JSON.parse(readFileSync(join(ROOT, "tools", "worldgen", "answer-key", `${world}.json`), "utf8")) as { problems: KeyEntry[] };
  const entry = (pid: string): KeyEntry => {
    const e = key.problems.find((p) => p.id === pid);
    if (!e) throw new Error(`answer key ${world} has no ${pid}`);
    return e;
  };
  const want = (pid: string) => entry(pid).impact_minor ?? entry(pid).metric!.value;
  const addDays = (n: number) => new Date(Date.parse(`${AS_OF}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const out: Array<[string, unknown, unknown]> = [];
  // F3: the planted statement's own Σ row (every line of it counts under the pack's line rule).
  const short = async (pid: string) => {
    const ref = (entry(pid).where.payout_refs as string[])[0]!;
    const s = (await db.admin<{ id: string }>(`SELECT id FROM core.settlement WHERE tenant_id = $1 AND external_ref = $2`, [tenant, ref])).rows[0]?.id;
    const rows = await v2("finance.settlement_vs_orders", { channel_id: null, from: addDays(-30), to: AS_OF, outlet_id: null });
    out.push([`${pid} settlement_vs_orders v2 Σ row short_minor (${ref})`, want(pid), Number(rows.find((r) => r.settlement_line_id === null && r.settlement_id === s)?.short_minor ?? NaN)]);
  };
  // P1: the staff member's Σ row over the key's window at the key's outlet.
  const overtime = async (pid: string) => {
    const w = entry(pid).where as { outlet: string; staff: string; from_offset: number; to_offset: number };
    const rows = await v2("people.overtime_drift", { outlet_id: kid(w.outlet), from: addDays(w.from_offset), to: addDays(w.to_offset) });
    out.push([`${pid} overtime_drift v2 Σ row extra_cost_minor (${w.staff})`, want(pid), Number(rows.find((r) => r.iso_week === null && r.staff_id === kid(w.staff))?.extra_cost_minor ?? NaN)]);
  };
  // A5: the licence in force, its days left, and its outlet's manager (worldgen: every outlet has its own manager; `manager` is its member key).
  const licence = async (pid: string, kinds: string[], manager: string) => {
    const w = entry(pid).where as { outlet: string; licence: string };
    const rows = await v2("compliance.licence_calendar", { as_of: AS_OF, required_kinds: kinds });
    const r = rows.find((x) => x.licence_id === kid(w.licence));
    out.push([`${pid} licence_calendar v2 [days_left, status, manager_member_id] (${w.licence})`, [want(pid), "in_force", kid(manager)],
      [Number(r?.days_left ?? NaN), r?.status ?? null, r ? r.manager_member_id : "absent"]]);
    if (world === "restaurant_group") {
      const south = rows.filter((x) => x.outlet_id === kid("outlet:3"));
      out.push(["RG manager rule: South's licence rows name South's manager, and North's and Central's rows each name one", [kinds.length, kid("member:manager"), 2 * kinds.length],
        [south.length, [...new Set(south.map((x) => x.manager_member_id))].join(","), rows.filter((x) => x.outlet_id !== kid("outlet:3") && x.manager_member_id !== null).length]]);
    }
  };
  const IN_KINDS = ["fssai", "gst", "trade_licence", "fire_noc", "shops_establishment"];
  if (world === "restaurant_group") {
    await short("RG-F3");
    // F4 + F7: every unsettled order is Zomato's (Central): its channel's Σ row is both keys' order values; the oldest is
    // past the pack's 10-day trigger.
    const zm = (await db.admin<{ id: string }>(`SELECT id FROM core.channel WHERE tenant_id = $1 AND kind = 'aggregator:zomato'`, [tenant])).rows[0]!.id;
    const mp = (await v2("finance.missing_payouts", { channel_id: null, as_of: AS_OF, outlet_id: null })).filter((r) => r.order_id === null);
    out.push(["RG-F4 + RG-F7 missing_payouts v2 Σ rows [channel, order_total_minor, oldest > 10 days]", [[zm, want("RG-F4") + want("RG-F7"), true]],
      mp.map((r) => [r.channel_id, Number(r.order_total_minor), Number(r.days_unsettled) > 10])]);
    // F5: South, UPI, September — the key's three ISO weeks (its `what`: 7/9/11 Sep 246,000; 14/16/18 Sep 419,400;
    // 21/23/25 Sep 273,600), three gap days each, no shift data (no member); their Σ = the key's impact.
    const tv = (await v2("finance.tender_vs_bank", { outlet_id: kid("outlet:3"), method: "upi", from: "2026-08-01", to: "2026-09-30" })).filter((r) => r.business_on === null);
    out.push(["RG-F5 tender_vs_bank v2 week Σ rows [week_start, gap_minor, gap_days, shift_member_id]",
      [["2026-09-07", 246000, 3, null], ["2026-09-14", 419400, 3, null], ["2026-09-21", 273600, 3, null]],
      tv.map((r) => [r.week_start, Number(r.gap_minor), Number(r.gap_days), r.shift_member_id])]);
    out.push(["RG-F5 Σ of the week rows' gap_minor", want("RG-F5"), tv.reduce((a, r) => a + Number(r.gap_minor), 0)]);
    await overtime("RG-P1");
    await licence("RG-A5", IN_KINDS, "member:manager_central");
  } else if (world === "store") {
    await licence("ST-A5", IN_KINDS, "member:manager");
  } else if (world === "cloud_kitchen") {
    await short("CK-F3");
  } else {
    await short("AU-F3");
    await overtime("AU-P1");
    await licence("AU-A5", ["food_business_registration"], "member:manager");
  }
  return out;
}
/** 0024 (R-A F5) on one world. The check: per settlement, v3's Σ row short_minor (the version core-api mints) = the Σ of
 *  core's own short_payout breaks on that settlement's lines (reconcileSettlement — the rule v3 follows; an independent
 *  source, written when the statement was imported), for every settlement of the world. And the planted F3 statement
 *  (RG-F3 / CK-F3 / AU-F3): it has order lines, every one matched to an order, the key is positive, and core's breaks on
 *  it = v3's Σ row = the key's impact (worldgen plants the short on real aggregator bills; the key is typed by hand). */
async function m0024Checks(db: TestDb, world: string, tenant: string, v3: (id: string, p: Record<string, unknown>) => Promise<Row[]>):
  Promise<{ checks: Array<[string, unknown[], unknown[]]>; info: string[] }> {
  const rows = (await v3("finance.settlement_vs_orders", { channel_id: null, from: "2000-01-01", to: AS_OF, outlet_id: null })).filter((r) => r.settlement_line_id === null);
  const breaks = new Map((await db.admin<{ s: string; n: string }>(`
    SELECT sl.settlement_id s, sum(b.amount_minor)::text n FROM core.reconciliation_break b
      JOIN core.settlement_line sl ON sl.tenant_id = b.tenant_id AND sl.id = b.settlement_line_id
     WHERE b.tenant_id = $1 AND b.kind = 'short_payout' GROUP BY 1`, [tenant])).rows.map((r) => [r.s, Number(r.n)]));
  const settlements = (await db.admin<{ id: string }>(`SELECT st.id FROM core.settlement st WHERE st.tenant_id = $1 AND EXISTS
    (SELECT 1 FROM core.settlement_line sl WHERE sl.tenant_id = st.tenant_id AND sl.settlement_id = st.id AND sl.line_kind = 'order') ORDER BY st.id`, [tenant])).rows.map((r) => r.id);
  const v3By = new Map(rows.map((r) => [r.settlement_id!, Number(r.short_minor)]));
  // A world without a payout statement (store) has nothing to compare: no check, an INFO line.
  const checks: Array<[string, unknown[], unknown[]]> = settlements.length === 0 ? [] : [
    [`settlement_vs_orders v3 Σ short_minor = core's short_payout breaks, per settlement (${settlements.length} settlements, Σ breaks ${[...breaks.values()].reduce((a, n) => a + n, 0)})`,
      settlements.map((id) => breaks.get(id) ?? 0), settlements.map((id) => v3By.get(id) ?? NaN)],
  ];
  const info: string[] = settlements.length === 0 ? ["no settlement with an order line: nothing to compare"] : [];
  const pid = ({ restaurant_group: "RG-F3", cloud_kitchen: "CK-F3", au_outlet: "AU-F3" } as Record<string, string>)[world];
  if (pid) {
    const key = JSON.parse(readFileSync(join(ROOT, "tools", "worldgen", "answer-key", `${world}.json`), "utf8")) as { problems: KeyEntry[] };
    const e = key.problems.find((p) => p.id === pid);
    if (!e) throw new Error(`answer key ${world} has no ${pid}`);
    const ref = (e.where.payout_refs as string[])[0]!;
    const st = (await db.admin<{ id: string; matched: string; lines: string }>(`SELECT st.id, count(sl.matched_order_id)::text matched, count(sl.id)::text lines
      FROM core.settlement st JOIN core.settlement_line sl ON sl.tenant_id = st.tenant_id AND sl.settlement_id = st.id AND sl.line_kind = 'order'
     WHERE st.tenant_id = $1 AND st.external_ref = $2 GROUP BY st.id`, [tenant, ref])).rows[0];
    const [n, matched, want] = [Number(st?.lines ?? 0), Number(st?.matched ?? 0), Number(e.impact_minor)];
    checks.push([`${pid} (${ref}, ${matched}/${n} order lines matched) [lines > 0, all matched, key > 0, core breaks Σ, v3 Σ short_minor] = [true, true, true, key, key]`,
      [true, true, true, want, want], [n > 0, matched === n, want > 0, st ? breaks.get(st.id) ?? 0 : null, st ? v3By.get(st.id) ?? null : null]]);
  }
  return { checks, info };
}
/** 0026 (R47 D6, D3) on restaurant_group and store; [what, hand value, template cell]. Hand values:
 *  RG-P2 (answer key `what`): two helpers at 8,000 paise an hour work North's Tue/Wed 15:00, 16:00 and 17:00 slots on the ten days
 *  8 Sep - 7 Oct (30 slot-days), beside North's own crew all day (Ravi the cook 12,000/h, Sunita a helper 8,000/h), one planted bill
 *  per slot; the crew's own norm is 2 x 60 = 120 minutes per bill, and each slot-day attends 4 x 60 = 240.
 *  Two things the key's 3,600 minutes do not count, both read from the world below:
 *   - three slot-days also carry one baseline history bill (counted from core.order directly: 8 Sep 16:00, 30 Sep 15:00, 7 Oct
 *     17:00 have 2 bills): 2 x 120 = 240 needed, excess 0; and such a day enters later norms at 240 / 2 = 120;
 *   - the norm is the median over the 8 weeks before the day (same weekday and slot). On 6/7 Oct four of those 8 days are helper
 *     days (240) and four are not (120) → median 180 → excess 60 — except where one of the four is a two-bill day (6 Oct 16:00 after
 *     8 Sep 16:00, 7 Oct 15:00 after 30 Sep 15:00: five at 120 → 120), and 7 Oct 17:00 is itself a two-bill day (0).
 *  Per Σ row (minutes): Tue 15:00 4 x 120 + 60 = 540 · Tue 16:00 0 + 3 x 120 + 120 = 480 · Tue 17:00 540 · Wed 15:00 3 x 120 + 0 + 120
 *  = 480 · Wed 16:00 540 · Wed 17:00 4 x 120 + 0 = 480; Σ 3,060 = 3,600 − 3 x 120 − 3 x 60. The excess is filled cheapest first:
 *  three people at 8,000/h (Sunita and the two helpers) always cover the at most 120 surplus minutes, never Ravi, so every minute
 *  is priced at the helpers' 8,000/h (the key's 480,000 x 60 / 3,600): 540 → 72,000, 480 → 64,000, Σ 408,000.
 *  Store (store.ts, IN prices tax-exclusive): atta shelf 26,000 (counter and own_site), quoted 23,100 per pc → (26,000 - 23,100) x
 *  10,000 / 26,000 = 1,115.38 → 1,115; sugar 4,800 quoted 4,100 → 1,458.33 → 1,458; a carry bag (packaging: an ingredient no item
 *  sells) → NULL, margin_rule_applies false. */
async function m0026Checks(db: TestDb, world: string, tenant: string, owner: AppContext, kid: (k: string) => string,
  mint: (id: string, p: Record<string, unknown>, v: number) => Promise<Row[]>): Promise<Array<[string, unknown, unknown]>> {
  const out: Array<[string, unknown, unknown]> = [];
  if (world === "restaurant_group") {
    const north = kid("outlet:1");
    const rows = await mint("people.labour_vs_demand", { outlet_id: north, from: "2026-09-08", to: "2026-10-07", slot_minutes: 60 }, 2);
    const p2 = (r: Row) => (r.weekday === "tue" || r.weekday === "wed") && ["15:00", "16:00", "17:00"].includes(r.slot_start ?? "");
    const sigma = rows.filter((r) => r.business_on === null && p2(r));
    const days = rows.filter((r) => r.business_on !== null && p2(r));
    // Independent of the template: the completed bills in the 30 planted slot-days, straight from core.order.
    const bills = (await db.admin<{ d: string; h: string; n: string }>(`
      SELECT o.business_date::text d, to_char(o.created_at AT TIME ZONE ou.tz, 'HH24') || ':00' h, count(*)::text n
        FROM core."order" o JOIN core.outlet ou ON ou.tenant_id = o.tenant_id AND ou.id = o.outlet_id
       WHERE o.tenant_id = $1 AND o.outlet_id = $2 AND o.status = 'completed' AND o.business_date BETWEEN '2026-09-08' AND '2026-10-07'
         AND extract(isodow FROM o.business_date) IN (2, 3) AND extract(hour FROM o.created_at AT TIME ZONE ou.tz) BETWEEN 15 AND 17
       GROUP BY 1, 2 ORDER BY 1, 2`, [tenant, north])).rows;
    out.push(["RG-P2 bills in the 30 planted slot-days (core.order) [slot-days, those with 2 bills]",
      [30, ["2026-09-08 16:00", "2026-09-30 15:00", "2026-10-07 17:00"]], [bills.length, bills.filter((b) => b.n === "2").map((b) => `${b.d} ${b.h}`)]]);
    const cells = (r: Row) => [r.weekday, r.slot_start, Number(r.excess_min), Number(r.excess_cost_minor)];
    out.push(["RG-P2 labour_vs_demand v2 Σ rows [weekday, slot, excess_min, excess_cost_minor]",
      [["tue", "15:00", 540, 72000], ["tue", "16:00", 480, 64000], ["tue", "17:00", 540, 72000],
       ["wed", "15:00", 480, 64000], ["wed", "16:00", 540, 72000], ["wed", "17:00", 480, 64000]], sigma.map(cells)]);
    const sum = (k: string) => sigma.reduce((a, r) => a + Number(r[k]), 0);
    out.push(["RG-P2 Σ of the six Σ rows [excess_min, excess_cost_minor] (key 3,600 / 480,000 less 3 x 120 two-bill and 3 x 60 norm-180 minutes)",
      [3060, 408000], [sum("excess_min"), sum("excess_cost_minor")]]);
    const key = (JSON.parse(readFileSync(join(ROOT, "tools", "worldgen", "answer-key", "restaurant_group.json"), "utf8")) as { problems: KeyEntry[] })
      .problems.find((e) => e.id === "RG-P2")!;
    out.push(["RG-P2 every planted day row priced at the helpers' rate: excess_cost_minor x 60 = excess_min x (key 480,000 x 60 / 3,600) [rows, at that rate]",
      [30, 30], [days.length, days.filter((r) => Number(r.excess_cost_minor) * 60 === Number(r.excess_min) * (key.impact_minor! * 60 / 3600)).length]]);
  } else if (world === "store") {
    const bag = idOf("m0026", world, "ing:carry_bag");
    await db.withContext("munim_core", { ...owner, command_type: "inventory.ingredient.upsert.v1" }, (c) =>
      c.query(`INSERT INTO core.ingredient (tenant_id, id, name, base_unit) VALUES ($1, $2, 'Carry bag (synthetic)', 'pc')`, [tenant, bag]));
    const run = idOf("m0026", world, "run");
    const quotes: Array<[string, string, number]> = [["atta", kid("ing:atta_5kg"), 23100], ["sugar", kid("ing:sugar_1kg"), 4100], ["bag", bag, 50]];
    await db.withContext("munim_svc", { tenant_id: tenant, outlet_ids: "*" }, async (c) => {
      await c.query(`INSERT INTO intel.run (tenant_id, id, trigger, actor, outlet_scope, expires_at) VALUES ($1, $2, 'watch_sweep', 'watcher:inventory', $3, now() + interval '2 hours')`,
        [tenant, run, [kid("outlet:1")]]);
      for (const [k, ing, price] of quotes) {
        await c.query(`INSERT INTO intel.supplier_quote (tenant_id, id, run_id, supplier_id, ingredient_id, round, qty_milli, unit, unit_price_minor, currency, payment_days)
                       VALUES ($1, $2, $3, $4, $5, 1, 10000, 'pc', $6, 'INR', 15)`, [tenant, idOf("m0026", world, `quote:${k}`), run, kid("supplier:mart"), ing, price]);
      }
    });
    const got = [];
    for (const [k] of quotes) {
      const r = (await mint("purchasing.deal_inputs", { quote_id: idOf("m0026", world, `quote:${k}`), as_of: AS_OF }, 3))[0];
      got.push([k, r?.margin_at_quote_bp ?? null, r?.margin_rule_applies ?? null]);
    }
    out.push(["ST deal_inputs v3 [quote, margin_at_quote_bp, margin_rule_applies]", [["atta", "1115", "true"], ["sugar", "1458", "true"], ["bag", null, "false"]], got]);
  }
  return out;
}
const BRIDGE = bridgeSpec();
type Row = Record<string, string | null>;

async function main(): Promise<number> {
  const plant = parsePlant(process.argv.slice(2));
  const t0 = Date.now();
  const db = await startTestDb();
  const stub = await startIntelStub();
  const blobDir = await mkdtemp(join(tmpdir(), "mc1a-worlds-"));
  const idp = createLocalIdp();
  const url = (role: string) => `postgresql://${role}:${db.password}@127.0.0.1:${db.port}/${db.database}`;
  const config = loadConfig({ env: {} });
  const keys = generateKeyPairSync("ed25519");
  const blobs = localBlobStore(blobDir);
  const api = await composeCoreApi({
    coreUrl: url("munim_core"), svcUrl: url("munim_svc"), listenUrl: url("munim_core"), idp, config, log: createLogger(config, () => {}), blobs,
    keys: { privateKeyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString() },
    intelUrl: stub.url, serviceSecret: "mc1a-worlds-test-secret-not-real",
  });
  const served = await serveApi(api.app, 0);
  const svcPool = createPool(url("munim_svc"), 2);
  const timer = setInterval(() => void parsePendingImports({ pool: svcPool, blobs, log: () => {} }).catch(() => {}), 150);
  const failures: string[] = [];
  try {
    const tenants: Record<string, string> = {};
    for (const world of ["restaurant_group", "store", "cloud_kitchen", "au_outlet"] as const) {
      const r = await runWorld({ world, asOf: AS_OF, days: DAYS, baseUrl: `http://127.0.0.1:${served.port}`, token: (p) => idp.sign(personaIdentity(world, p)) });
      tenants[world] = r.api.tenantId!;
      console.log(`seeded ${world}: ${r.planted.length} plants, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    clearInterval(timer);
    if (plant === "mis-sum") {
      await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, 'SELECT 10, ''unexplained'', v.mp', 'SELECT 10, ''unexplained'', 1 + v.mp') WHERE id = 'finance.margin_bridge'`);
    } else if (plant === "column") {
      await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, 'm.lines_unpriced::bigint AS lines_unpriced', 'm.lines_unpriced::bigint AS unpriced') WHERE id = 'catalogue.dish_margin'`);
    } else if (plant === "mc1bc-column") {
      await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, 'AS excess_minor', 'AS excess') WHERE id = 'inventory.waste_week'`);
    } else if (plant === "asof") {
      await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, 'coalesce(:as_of::date, ', 'coalesce(NULL::date, ') WHERE version = 2`);
    } else if (plant === "mc1e") {
      for (const [id, a, b] of MC1E_PLANT) {
        const n = await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, $2, $3) WHERE id = $1 AND version = 2 AND strpos(sql, $2) > 0`, [id, a, b]);
        if (n.rowCount !== 1) throw new Error(`plant mc1e: ${id} anchor not found`);
      }
    } else if (plant === "m0024") {
      const n = await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, $2, $3) WHERE id = $1 AND version = 3 AND strpos(sql, $2) > 0`,
        ["finance.settlement_vs_orders", "coalesce(sum(q.short) FILTER (WHERE q.counts), 0)::bigint AS short_minor",
         "(1 + coalesce(sum(q.short) FILTER (WHERE q.counts), 0))::bigint AS short_minor"]);
      if (n.rowCount !== 1) throw new Error("plant m0024: anchor not found");
    } else if (plant === "m0026") {
      for (const [id, v, a, b] of [["people.labour_vs_demand", 2, "ORDER BY a.rate, a.staff_id", "ORDER BY a.rate DESC, a.staff_id"],
        ["purchasing.deal_inputs", 3, "UNION ALL SELECT sku.bp FROM sku", "UNION ALL SELECT sku.bp FROM sku WHERE false"]] as const) {
        const n = await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, $3, $4) WHERE id = $1 AND version = $2 AND strpos(sql, $3) > 0`, [id, v, a, b]);
        if (n.rowCount !== 1) throw new Error(`plant m0026: ${id} anchor not found`);
      }
    } else if (plant === "key") {
      await db.admin(`UPDATE evidence.snapshot_template SET sql = replace(sql, '/ 1000000.0 AS value', '/ 990000.0 AS value') WHERE id IN ('inventory.waste_week', 'kitchen.remakes_overprep')`);
    }
    if (plant) console.log(`PLANT ${plant} applied`);

    for (const [world, tenant] of Object.entries(tenants)) {
      const ownerId = (await db.admin<{ m: string }>(`SELECT member_id m FROM core.membership WHERE tenant_id = $1 AND role = 'owner' ORDER BY created_at LIMIT 1`, [tenant])).rows[0]!.m;
      const outlets = (await db.admin<{ id: string }>(`SELECT id FROM core.outlet WHERE tenant_id = $1 ORDER BY created_at, id`, [tenant])).rows.map((r) => r.id);
      const item = (await db.admin<{ id: string }>(`SELECT i.id FROM core.item i WHERE i.tenant_id = $1
        ORDER BY EXISTS (SELECT 1 FROM core.recipe_version r WHERE r.item_id = i.id) DESC, i.id LIMIT 1`, [tenant])).rows[0]!.id;
      const owner: AppContext = { tenant_id: tenant, outlet_ids: "*", role: "owner", member_id: ownerId };
      const seed = (JSON.parse(readFileSync(join(ROOT, "tools", "worldgen", "answer-key", `${world}.json`), "utf8")) as { seed: string }).seed;
      const kid = (k: string) => idOf(seed, world, k);
      const any = "00000000-0000-7000-8000-000000000000";
      const count = (await db.admin<{ id: string }>(`SELECT id FROM core.stock_count WHERE tenant_id = $1 ORDER BY counted_at LIMIT 1`, [tenant])).rows[0]?.id ?? any;
      const coupon = (await db.admin<{ id: string }>(`SELECT id FROM core.coupon WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, [tenant])).rows[0]?.id ?? any;
      const params = (id: string): Record<string, unknown> => {
        const sep = { from: "2026-09-01", to: "2026-09-30" };
        const win = { outlet_id: null, from: "2026-07-01", to: AS_OF };
        switch (id) {
          case "catalogue.dish_margin": return { outlet_id: null, channel_kind: null, ...sep };
          case "catalogue.menu_matrix": case "catalogue.deal_cost": return { outlet_id: null, ...sep };
          case "catalogue.sku_price_check": return { outlet_id: null, from: "2026-09-11", to: "2026-10-10" };
          case "catalogue.cost_drift": return { outlet_id: null, since: "2026-08-01" };
          case "catalogue.recipe_current": return { item_id: item, outlet_id: null };
          case "finance.unapproved_deductions": return { channel_id: null, month: "2026-10-01", outlet_id: null };
          case "finance.settlement_vs_orders": return { channel_id: null, from: "2026-10-03", to: "2026-10-08", outlet_id: null };
          case "finance.missing_payouts": return { channel_id: null, as_of: AS_OF, outlet_id: null };
          case "finance.tender_vs_bank": return { outlet_id: null, method: world === "store" ? "cash" : "upi", from: "2026-08-01", to: "2026-09-30" };
          case "finance.close_status": return { period_month: "2026-09-01", outlet_id: null };
          case "finance.pnl": return { period_month: "2026-09-01", group_by: "outlet" };
          case "finance.gst_check": return { period_month: "2026-09-01", outlet_id: null };
          case "finance.margin_bridge": return { period_month: "2026-09-01", compare_month: "2026-08-01" };
          // M-C1bc (0021): whole-tenant windows to the gate profile's as-of; row-scoped ids from the world (or none).
          case "kitchen.ticket_times": case "kitchen.ticket_coverage": case "people.overtime_drift": case "people.labour_pct":
          case "people.attendance_coverage": case "customers.review_trend": case "compliance.log_coverage": case "compliance.temp_excursions":
          case "compliance.asset_costs": case "forecast.accuracy": return win;
          case "kitchen.ticket_drift": case "kitchen.remakes_overprep": case "inventory.waste_week": case "customers.staff_coupon_use":
            return { outlet_id: null, week_start: "2026-10-05" };
          case "kitchen.prep_need": return { outlet_id: null, business_date: "2026-10-11" };
          case "inventory.shortfall": return { outlet_id: null, lead_days: 2 };
          case "inventory.expiry_risk": return { outlet_id: null, days: 7 };
          case "inventory.dead_stock": return { outlet_id: null, days: 60 };
          case "inventory.shrinkage": return { count_id: count };
          case "purchasing.price_creep": return { as_of: AS_OF };
          case "purchasing.invoice_vs_po": return { supplier_invoice_id: kid(world === "store" ? "inv:sugar-over" : "inv:paneer-over") };
          case "purchasing.invoice_duplicates": return { supplier_invoice_id: kid(world === "store" ? "inv:sugar-7781" : "inv:oil-1042") };
          case "purchasing.quote_compare": return { negotiation_run_id: any };
          case "purchasing.deal_inputs": return { quote_id: any };
          case "forecast.sales_history": return { outlet_id: null, item_id: item, from: "2026-09-01", to: AS_OF };
          case "forecast.slot_profile": return { outlet_id: null, weeks: 4, slot_minutes: 60 };
          case "forecast.points": return { outlet_id: null, from: AS_OF, to: "2026-10-17", item_id: null };
          case "forecast.freshness": return {};
          case "people.labour_vs_demand": return { outlet_id: null, from: "2026-10-05", to: "2026-10-07", slot_minutes: 60 };
          case "people.advances_open": return { outlet_id: null };
          case "people.payroll_lines": return { outlet_id: null, period_month: "2026-09-01" };
          case "customers.coupon_leakage": return { from: "2026-07-01", to: "2026-12-31" };
          case "customers.coupon_daily": return { coupon_id: coupon, to: "2026-12-31" };
          case "customers.churn_segments": return { outlet_id: null, as_of: AS_OF };
          case "customers.consented_audience": return { segment_snapshot_id: any };
          case "customers.coupon_current": return { coupon_id: coupon };
          case "compliance.licence_calendar": return { as_of: AS_OF, required_kinds: ["fssai", "gst", "trade_licence", "fire_noc", "shops_establishment"] };
          case "compliance.energy_per_order": return { outlet_id: null, months: 4 };
          case "market.signal_uplift": return { outlet_id: null, kind: "festival", label: null, lookback_days: 365 };
          case "market.upcoming": return { outlet_id: null, days: 7 };
          case "market.competitor_gap": return { outlet_id: null, days: 30 };
          case "market.viability": return { viability_case_id: any };
          case "market.goal_progress": return { goal_id: any };
          case "market.goal_baseline": return { outlet_id: null, metric: "net_sales", months: 3 };
          // 0028 (ADR-015 §1.6; T-095c's pack rows): the worldgen worlds hold no Cares rows yet (T-095e) — columns only.
          case "cares.listings": return { outlet_id: null, status: null };
          case "cares.impact": return { outlet_id: null, from: "2026-10-01", to: AS_OF };
          case "cares.pickup_crew": return { outlet_id: outlets[0], listing_id: any };
          default: throw new Error(`no params for ${id}`);
        }
      };
      /** core-api's own path (runTemplate) for the cells; the SQL's own output fields for the column check. */
      const mint = (ctx: AppContext, id: string, p: Record<string, unknown>, version = 1) => db.withContext("munim_core", ctx, async (c) => {
        const tpl = (await c.query<{ sql: string }>("SELECT sql FROM evidence.snapshot_template WHERE id = $1 AND version = $2", [id, version])).rows[0]!;
        const { sql, names } = bindNamedParams(tpl.sql);
        const fields = (await c.query({ text: `SELECT * FROM (${sql}) t LIMIT 0`, values: names.map((n) => p[n]) })).fields.map((f) => f.name);
        const { rows } = await runTemplate(c, id, version, p);
        return { fields, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? null : String(v)]))) as Row[] };
      });

      // M-C1e (0023): the version-2 answer-key checks, on every world; the checks below run on restaurant_group and store.
      for (const [what, want, got] of await mc1eChecks(db, world, tenant, async (id, p) => (await mint(owner, id, p, 2)).rows, kid)) {
        const ok = JSON.stringify(want) === JSON.stringify(got);
        console.log(`${world} mc1e ${what} = ${JSON.stringify(got)} (key ${JSON.stringify(want)}) → ${ok ? "ok" : "FAIL"}`);
        if (!ok) failures.push(`${world} mc1e ${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      }
      // 0024: settlement_vs_orders v3 agrees with core's short_payout breaks on every settlement (all four worlds).
      const m24 = await m0024Checks(db, world, tenant, async (id, p) => (await mint(owner, id, p, 3)).rows);
      for (const [what, want, got] of m24.checks) {
        const ok = JSON.stringify(want) === JSON.stringify(got) && want.length > 0;
        console.log(`${world} m0024 ${what} → ${ok ? "ok" : `FAIL (core ${JSON.stringify(want)}, v3 ${JSON.stringify(got)})`}`);
        if (!ok) failures.push(`${world} m0024 ${what}: v3 ${JSON.stringify(got)} ≠ core ${JSON.stringify(want)}`);
      }
      for (const line of m24.info) console.log(`${world} m0024 INFO ${line}`);
      // 0026: RG-P2 at the helpers' rate (labour_vs_demand v2), store SKU margins (deal_inputs v3).
      for (const [what, want, got] of await m0026Checks(db, world, tenant, owner, kid, async (id, p, v) => (await mint(owner, id, p, v)).rows)) {
        const ok = JSON.stringify(want) === JSON.stringify(got);
        console.log(`${world} m0026 ${what} = ${JSON.stringify(got)} (hand ${JSON.stringify(want)}) → ${ok ? "ok" : "FAIL"}`);
        if (!ok) failures.push(`${world} m0026 ${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      }
      if (world === "cloud_kitchen" || world === "au_outlet") continue;

      // (2) spec columns (the version the pack row describes: template-spec SPEC_VERSION).
      let exact = 0;
      const results = new Map<string, Row[]>();
      for (const t of SPEC) {
        const r = await mint(owner, t.id, params(t.id), specVersion(t.id));
        results.set(t.id, r.rows);
        if (JSON.stringify(r.fields) === JSON.stringify(t.columns)) exact++;
        else failures.push(`${world} (2) ${t.id}: columns ${r.fields.join(",")} ≠ spec ${t.columns.join(",")}`);
      }
      console.log(`${world} (2): ${exact}/${SPEC.length} templates return exactly their spec columns; rows: ${SPEC.map((t) => `${t.id.split(".")[1]} ${results.get(t.id)!.length}`).join(", ")}`);

      // (5) the bridge, owner (and an outlet-1 manager where there are several outlets).
      const scopes: Array<[string, AppContext, string[] | null]> = [["owner", owner, null]];
      if (outlets.length > 1) {
        const mgr = (await db.admin<{ m: string }>(`SELECT member_id m FROM core.membership WHERE tenant_id = $1 AND role = 'manager' LIMIT 1`, [tenant])).rows[0]?.m ?? ownerId;
        scopes.push(["outlet-1 manager", { tenant_id: tenant, outlet_ids: [outlets[0]!], role: "manager", member_id: mgr }, [outlets[0]!]]);
      }
      for (const [who, ctx, scope] of scopes) {
        const rows = (await mint(ctx, BRIDGE.id, params(BRIDGE.id))).rows;
        const margin = async (month: string) => Number((await db.admin<{ m: string }>(`
          SELECT coalesce(-sum(p.amount_minor), 0)::text m FROM core.posting p
            JOIN core.journal_entry je ON je.tenant_id = p.tenant_id AND je.id = p.journal_entry_id
            JOIN core.account a ON a.tenant_id = p.tenant_id AND a.id = p.account_id
           WHERE p.tenant_id = $1 AND a.type IN ('income', 'expense') AND date_trunc('month', je.entry_date) = $2::date
             AND ($3::uuid[] IS NULL OR je.outlet_id IS NULL OR je.outlet_id = ANY ($3::uuid[]))`, [tenant, month, scope])).rows[0]!.m);
        const delta = (await margin("2026-09-01")) - (await margin("2026-08-01"));
        const comps = rows.filter((r) => r.component !== BRIDGE.sumRow);
        const sum = (k: string) => comps.reduce((a, r) => a + BigInt(r[k]!), 0n);
        const total = rows.find((r) => r.component === BRIDGE.sumRow);
        const labels = JSON.stringify(rows.map((r) => r.component)) === JSON.stringify([...BRIDGE.components, BRIDGE.sumRow]);
        const ok = labels && total?.delta_minor === String(delta) && sum("delta_minor") === BigInt(delta)
          && sum("current_minor") - sum("prior_minor") === BigInt(delta) && delta !== 0;
        console.log(`${world} (5) ${who}: Σ component deltas ${sum("delta_minor")}, Σ row ${total?.delta_minor}, recomputed ${delta}, unexplained ${comps.find((r) => r.component === "unexplained")?.delta_minor} → ${ok ? "ok" : "FAIL"}`);
        if (!ok) failures.push(`${world} (5) ${who}: bridge does not balance to the recomputed margin delta ${delta}`);
      }

      // Answer keys (hand-kept, tools/worldgen/answer-key/<world>.json): the planted problems these templates measure.
      const key = JSON.parse(readFileSync(join(ROOT, "tools", "worldgen", "answer-key", `${world}.json`), "utf8")) as { problems: Array<{ kind: string; impact_minor: number | null }> };
      const impact = (...kinds: string[]) => key.problems.filter((p) => kinds.includes(p.kind)).reduce((a, p) => a + (p.impact_minor ?? 0), 0);
      const sumOf = (id: string, col: string, pick: (r: Row) => boolean = () => true) => results.get(id)!.filter(pick).reduce((a, r) => a + Number(r[col] ?? 0), 0);
      // A Σ row: its row-id column is NULL (0023 version 2: settlement_vs_orders has a Σ row per settlement, missing_payouts per channel).
      const sigma = (col: string) => (r: Row) => r[col] === null;
      const checks: Array<[string, number, number]> = world === "restaurant_group"
        ? [["RG-F1 + RG-F2 Σ unapproved_minor", impact("unapproved_ad_fee", "ad_cap_excess"), sumOf("finance.unapproved_deductions", "unapproved_minor")],
           ["RG-F3 Σ short_minor (Σ row)", impact("short_commission"), sumOf("finance.settlement_vs_orders", "short_minor", sigma("settlement_line_id"))],
           // T-086's RG-F7 (a whole Zomato cycle held unapproved) is a missing payout too: the template's Σ row covers both.
           ["RG-F4 + RG-F7 Σ order_total_minor (Σ row)", impact("missing_payout", "missing_cycle"), sumOf("finance.missing_payouts", "order_total_minor", sigma("order_id"))]]
        : [["ST-C4 Σ above_mrp_minor", impact("above_mrp"), sumOf("catalogue.sku_price_check", "above_mrp_minor")]];
      for (const [what, want, got] of checks) {
        console.log(`${world} key: ${what} = ${got} (key ${want}) → ${want === got && want > 0 ? "ok" : "FAIL"}`);
        if (want !== got || want <= 0) failures.push(`${world} key ${what}: ${got} ≠ ${want}`);
      }

      // M-C1bc (0021): the plants each pack's templates surface (hand list), each against its key entry by id.
      const entry = (pid: string) => {
        const e = (key.problems as unknown as Array<{ id: string; impact_minor: number | null; metric?: { value: number }; where: Record<string, unknown> }>).find((p) => p.id === pid);
        if (!e) throw new Error(`answer key ${world} has no ${pid}`);
        return e;
      };
      const want = (pid: string) => entry(pid).impact_minor ?? entry(pid).metric!.value;
      const run1 = async (id: string, p: Record<string, unknown>) => (await mint(owner, id, p)).rows;
      // 0022: version 2 (as_of) — and the moved-clock copies below, installed as versions 97 (from v1) and 98 (from v2).
      const runV = async (id: string, version: number, p: Record<string, unknown>) => (await mint(owner, id, p, version)).rows;
      const outletOf = (k: string) => kid(k);
      const monday = (offset: number) => {
        const d = new Date(Date.parse(`${AS_OF}T00:00:00Z`) + offset * 86_400_000);
        return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
      };
      const addDays = (n: number) => new Date(Date.parse(`${AS_OF}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const wasteOf = async (pid: string, offset: number) => {
        const e = entry(pid).where as { outlet: string; ingredient: string };
        const rows = await run1("inventory.waste_week", { outlet_id: outletOf(e.outlet), week_start: monday(offset) });
        return Number(rows.find((r) => r.ingredient_id === kid(e.ingredient))?.excess_minor ?? 0);
      };
      const n = (v: string | null | undefined) => Number(v ?? 0);
      // The time-bound plants (market.upcoming, inventory.expiry_risk read "today"; the plants sit at fixed dates from AS_OF) at version v, pinned to as_of = AS_OF where the version takes it (2, 98).
      const pinned = (v: number) => (v === 1 || v === 97 ? {} : { as_of: AS_OF });
      const upcoming = async (v: number, label: string) =>
        n((await runV("market.upcoming", v, { outlet_id: outletOf("outlet:2"), days: 7, ...pinned(v) })).find((r) => r.label === label)?.expected_extra_sales_minor);
      const expiry = async (v: number) => {
        const b = (await db.admin<{ id: string }>(`SELECT id FROM core.batch WHERE tenant_id = $1 AND batch_code = 'YOG-B7'`, [tenant])).rows[0]?.id;
        return n((await runV("inventory.expiry_risk", v, { outlet_id: outletOf("outlet:1"), days: 7, ...pinned(v) })).find((r) => r.batch_id === b)?.at_risk_minor);
      };
      const KEY_CHECKS: Array<[string, string, () => Promise<number>]> = world === "restaurant_group" ? [
        ["RG-I1", "purchasing.price_creep creep_impact_minor (tomato)", async () =>
          n((await run1("purchasing.price_creep", { as_of: AS_OF })).find((r) => r.ingredient_id === kid("ing:tomato"))?.creep_impact_minor)],
        ["RG-I2", "purchasing.invoice_vs_po Σ overbilled_minor", async () =>
          n((await run1("purchasing.invoice_vs_po", { supplier_invoice_id: kid("inv:paneer-over") })).at(-1)?.overbilled_minor)],
        ["RG-I3", "purchasing.invoice_duplicates twin total_minor", async () =>
          n((await run1("purchasing.invoice_duplicates", { supplier_invoice_id: kid("inv:oil-1042") })).find((r) => r.twin_invoice_id === kid("inv:oil-1042b"))?.total_minor)],
        ["RG-K3", "inventory.waste_week excess_minor (chicken, Central)", () => wasteOf("RG-K3", -5)],
        ["RG-K3", "kitchen.remakes_overprep Σ overprep_minor (Central)", async () =>
          n((await run1("kitchen.remakes_overprep", { outlet_id: outletOf("outlet:2"), week_start: monday(-5) })).at(-1)?.overprep_minor)],
        ["RG-K7", "inventory.waste_week excess_minor (rice, South)", () => wasteOf("RG-K7", -30)],
        ["RG-K2", "kitchen.remakes_overprep Σ remake_minor, North, the weeks from 49 days back", async () => {
          let t = 0;
          for (let o = -49; o <= 0; o += 7) t += n((await run1("kitchen.remakes_overprep", { outlet_id: outletOf("outlet:1"), week_start: monday(o) })).at(-1)?.remake_minor);
          return t;
        }],
        ["RG-A1", "compliance.temp_excursions Σ temp_waste_minor (chiller1, 6 out of range)", async () => {
          const rows = (await run1("compliance.temp_excursions", { outlet_id: outletOf("outlet:1"), from: addDays(-3), to: AS_OF })).filter((r) => r.asset_id === kid("asset:chiller1"));
          return rows.reduce((a, r) => a + n(r.out_of_range), 0) === (entry("RG-A1").where as { out_of_range: number }).out_of_range ? rows.reduce((a, r) => a + n(r.temp_waste_minor), 0) : -1;
        }],
        ["RG-A1", "inventory.waste_week excess_minor (paneer, North)", () => wasteOf("RG-A1", -1)],
        ["RG-A5", "compliance.licence_calendar days_left (FSSAI, Central)", async () =>
          n((await run1("compliance.licence_calendar", { as_of: AS_OF, required_kinds: ["fssai"] })).find((r) => r.licence_id === kid("licence:fssai:2"))?.days_left)],
        ["RG-P1", "people.overtime_drift Σ extra_cost_minor (the cook)", async () =>
          (await run1("people.overtime_drift", { outlet_id: outletOf("outlet:1"), from: addDays(-26), to: addDays(-1) }))
            .filter((r) => r.staff_id === kid("staff:ravi")).reduce((a, r) => a + n(r.extra_cost_minor), 0)],
        ["RG-P3", "people.advances_open outstanding_minor (the cook)", async () =>
          n((await run1("people.advances_open", { outlet_id: outletOf("outlet:1") })).find((r) => r.staff_id === kid("staff:ravi"))?.outstanding_minor)],
        ["RG-G1", "customers.coupon_leakage cap_evasion_minor (WELCOME20)", async () =>
          n((await run1("customers.coupon_leakage", { from: "2026-07-01", to: "2100-01-01" })).find((r) => r.coupon_id === kid("coupon:welcome"))?.cap_evasion_minor)],
        ["RG-M1", "market.upcoming v2 as_of AS_OF expected_extra_sales_minor (harvest festival, Central)", () => upcoming(2, "harvest_festival")],
        ["RG-M1b", "market.upcoming v2 as_of AS_OF |expected_extra_sales_minor| (rain, Central)", async () => Math.abs(await upcoming(2, "rain"))],
      ] : [
        ["ST-I1", "purchasing.price_creep creep_impact_minor (atta)", async () =>
          n((await run1("purchasing.price_creep", { as_of: AS_OF })).find((r) => r.ingredient_id === kid("ing:atta_5kg"))?.creep_impact_minor)],
        ["ST-I2", "purchasing.invoice_vs_po Σ overbilled_minor", async () =>
          n((await run1("purchasing.invoice_vs_po", { supplier_invoice_id: kid("inv:sugar-over") })).at(-1)?.overbilled_minor)],
        ["ST-I3", "purchasing.invoice_duplicates twin total_minor", async () =>
          n((await run1("purchasing.invoice_duplicates", { supplier_invoice_id: kid("inv:sugar-7781") })).find((r) => r.twin_invoice_id === kid("inv:sugar-7781b"))?.total_minor)],
        ["ST-I4", "inventory.expiry_risk v2 as_of AS_OF at_risk_minor (yoghurt batch YOG-B7)", () => expiry(2)],
        ["ST-I5", "inventory.shrinkage Σ loss_minor (the rice count)", async () => n((await run1("inventory.shrinkage", { count_id: count })).at(-1)?.loss_minor)],
        ["ST-K7", "inventory.waste_week excess_minor (tea)", () => wasteOf("ST-K7", -40)],
        ["ST-A5", "compliance.licence_calendar days_left (Shops & Establishment)", async () =>
          n((await run1("compliance.licence_calendar", { as_of: AS_OF, required_kinds: ["shops_establishment"] })).find((r) => r.licence_id === kid("licence:shops"))?.days_left)],
      ];
      for (const [pid, what, got] of KEY_CHECKS) {
        const [w0, g0] = [want(pid), await got()];
        console.log(`${world} key ${pid}: ${what} = ${g0} (key ${w0}) → ${w0 === g0 && w0 > 0 ? "ok" : "FAIL"}`);
        if (w0 !== g0 || w0 <= 0) failures.push(`${world} key ${pid} ${what}: ${g0} ≠ ${w0}`);
      }
      console.log(`${world} key checks: ${KEY_CHECKS.length} run, none skipped (the time-bound ones pinned to as_of ${AS_OF})`);
      // (A1) The wall clock moved 400 days ahead: each time-bound template's v2 (as v98) still returns the key at as_of =
      // AS_OF; its v1 (as v97) no longer does — the move is one the plant notices, so v2's answer comes from as_of alone.
      const moved: Array<[string, string, (v: number) => Promise<number>]> = world === "restaurant_group"
        ? [["RG-M1", "market.upcoming", (v) => upcoming(v, "harvest_festival")], ["RG-M1b", "market.upcoming", async (v) => Math.abs(await upcoming(v, "rain"))]]
        : [["ST-I4", "inventory.expiry_risk", expiry]];
      for (const id of new Set(moved.map((m) => m[1]))) {
        await db.admin(`INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role)
          SELECT id, CASE version WHEN 1 THEN 97 ELSE 98 END, replace(replace(sql, 'now()', '(now() + interval ''400 days'')'), 'current_date', '(current_date + 400)'),
                 params_schema, columns, min_role FROM evidence.snapshot_template WHERE id = $1 AND version IN (1, 2)`, [id]);
      }
      for (const [pid, id, at] of moved) {
        const [w0, v2Moved, v1Moved] = [want(pid), await at(98), await at(97)];
        const ok = v2Moved === w0 && w0 > 0 && v1Moved !== w0;
        console.log(`${world} clock+400d ${pid} (${id}): v2 at as_of ${AS_OF} = ${v2Moved} (key ${w0}), v1 = ${v1Moved} → ${ok ? "ok" : "FAIL"}`);
        if (!ok) failures.push(`${world} clock+400d ${pid}: v2 ${v2Moved}, v1 ${v1Moved}, key ${w0}`);
      }
      await db.admin(`DELETE FROM evidence.snapshot_template WHERE version IN (97, 98)`);
      // Lapsed regulars (G4): the key's phones are exactly the customers churn_segments marks at risk among them (the key's
      // ₹ is the window spend, not the template's monthly spend, so the set is checked, not a sum).
      const g4 = world === "restaurant_group" ? "RG-G4" : "ST-G4";
      const phones = (entry(g4).where as { phones: string[] }).phones;
      const ids = (await db.admin<{ id: string }>(`SELECT id FROM core.customer WHERE tenant_id = $1 AND phone = ANY ($2)`, [tenant, phones])).rows.map((r) => r.id);
      const churn = await run1("customers.churn_segments", { outlet_id: outletOf("outlet:1"), as_of: AS_OF });
      const atRisk = ids.filter((c) => churn.some((r) => r.customer_id === c && r.segment === "at_risk")).length;
      console.log(`${world} key ${g4}: customers.churn_segments at_risk among the key's ${phones.length} phones = ${atRisk} → ${atRisk === phones.length && ids.length === phones.length ? "ok" : "FAIL"}`);
      if (atRisk !== phones.length || ids.length !== phones.length) failures.push(`${world} key ${g4}: ${atRisk} of ${phones.length} at risk`);
    }
  } finally {
    clearInterval(timer);
    await new Promise((ok) => served.server.close(() => ok(undefined)));
    await api.close();
    await svcPool.end();
    await stub.close();
    await (db as TestDb).stop();
    await rm(blobDir, { recursive: true, force: true });
  }
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(`templates-worlds: ${failures.length === 0 ? "PASS" : `FAIL (${failures.length})`} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = await main().catch((e) => {
  console.error(e);
  return 1;
});
