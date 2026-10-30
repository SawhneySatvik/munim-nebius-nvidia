// The Snacky Shack (snacky_shack: real menu, synthetic history) on the real app (embedded Postgres 18, the intel stub, no .env): seeded once
// through the SDK with its key's seed at the gate's fixed as-of, 60 days back, so the history spans Melbourne's change to daylight time
// (Sun 4 Oct 2026, 02:00 AEST → 03:00 AEDT). Expected values are typed here (counts and prices read off the menu by hand, the UTC offsets
// of the two zones, GST as one eleventh of an inclusive price), never from the seed's output.
//   planted == key, every entry recomputes (verify/recompute.ts), and a key one cent off fails (red-proof);
//   the AU pack: AUD, Australia/Melbourne, GST inside the price (5,000 → 455 tax), bills on both sides of the DST change at the right
//   instant; every person, address, phone and email in the tenant is synthetic (PII scan, its predicate red-proven on known values);
//   the storefront wears the page the seed published (= apps/web's built-in page for this business); the seed never prices a model role
//   and reports that live AI lacks AUD prices; the plan-mode request log is identical in four time zones.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createMunimClient } from "../../../packages/sdk/src/index.ts";
import { runWorld } from "../src/run.ts";
import { verifyWorld } from "../verify/recompute.ts";
import { loadKey } from "../verify/run.ts";
import { AS_OF } from "./profile.ts";
import { startStack, type Stack } from "./stack.ts";

const DAYS = 60;
const KEY = loadKey("snacky_shack", DAYS, AS_OF);
const WEB = join(import.meta.dirname, "../../../apps/web/lib/businesses/snacky_shack/profile.ts");
const { SNACKY_SHACK } = (await import(WEB)) as { SNACKY_SHACK: { page: unknown } };
let stack: Stack;
let seeded: Awaited<ReturnType<typeof runWorld>>;

before(async () => {
  stack = await startStack();
  seeded = await runWorld({ world: "snacky_shack", seed: KEY.seed, asOf: AS_OF, days: DAYS, baseUrl: stack.baseUrl, token: stack.token("snacky_shack"), operator: true });
});
after(async () => {
  await stack?.stop();
});

const q = async (sql: string) => (await stack.admin(sql.replaceAll("$T", `'${seeded.api.tenantId}'`))).rows;

/** The PII scan's predicate: a value is acceptable when it is plainly synthetic. Emails: the reserved test/invalid domains worldgen uses.
 *  Phones: the synthetic series worldgen mints for this world (+614001… customers, +614002… guests). Names of people: marked
 *  "(synthetic)". Anything else is a finding. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A phone is an international number ("+61 412 345 678") or an Australian mobile written nationally ("0412 345 678"); dates, ids and
// tax numbers in the same columns are not (no leading "+", or not 04 followed by eight digits).
const PHONE = /\+\d[\d ]{7,16}\d|\b04\d{2}[ -]?\d{3}[ -]?\d{3}\b/g;
function piiFindings(rows: Array<{ where: string; value: string; person: boolean }>): string[] {
  const out: string[] = [];
  for (const r of rows) {
    for (const e of r.value.match(EMAIL) ?? []) if (!/@[a-z0-9-]+\.synthetic\.test$|\.invalid$/.test(e)) out.push(`${r.where}: email ${e}`);
    for (const p of r.value.match(PHONE) ?? []) {
      const d = p.replace(/[\s()-]/g, "");
      if (!/^\+61400[12]\d{5}$/.test(d)) out.push(`${r.where}: phone ${p}`);
    }
    if (r.person && !/\(synthetic\)$/.test(r.value)) out.push(`${r.where}: name ${r.value}`);
  }
  return out;
}

describe("snacky_shack", () => {
  test("the AU business: one Geelong shop, AUD, Melbourne time, a demo tenant, four synthetic people, simulated suppliers", async () => {
    assert.deepEqual(await q(`SELECT name, is_demo, onboarded_at IS NOT NULL onboarded, base_currency, country_code FROM core.tenant WHERE tenant_id = $T`),
      [{ name: "The Snacky Shack (real menu, synthetic history)", is_demo: true, onboarded: true, base_currency: "AUD", country_code: "AU" }]);
    assert.deepEqual(await q(`SELECT name, kind, tz, address FROM core.outlet WHERE tenant_id = $T`),
      [{ name: "The Snacky Shack Geelong", kind: "restaurant", tz: "Australia/Melbourne", address: "1 Synthetic Lane, Geelong VIC (synthetic)" }]);
    assert.deepEqual(await q(`SELECT m.name, m.email, ms.role FROM core.member m JOIN core.membership ms ON ms.tenant_id = m.tenant_id AND ms.member_id = m.id
        WHERE m.tenant_id = $T ORDER BY m.email`), [
      { name: "Jack Wilson (synthetic)", email: "counter@snacky-shack.synthetic.test", role: "staff" },
      { name: "Mei Chen (synthetic)", email: "kitchen@snacky-shack.synthetic.test", role: "staff" },
      { name: "Priya Nair (synthetic)", email: "manager@snacky-shack.synthetic.test", role: "manager" },
      { name: "Sam Carter (synthetic)", email: "owner@snacky-shack.synthetic.test", role: "owner" },
    ]);
    assert.deepEqual(await q(`SELECT name, kind FROM core.supplier WHERE tenant_id = $T ORDER BY name`),
      [{ name: "Bellarine Meat Co (simulated)", kind: "simulated" }, { name: "Corio Bay Foodservice (simulated)", kind: "simulated" }]);
    assert.deepEqual(await q(`SELECT month::text AS month, currency FROM platform.llm_budget WHERE tenant_id = $T ORDER BY month`),
      ["2026-10-01", "2026-11-01", "2026-12-01"].map((month) => ({ month, currency: "AUD" })));
  });

  test("planted == the key, and every entry recomputes to it; a key one cent off fails that entry only (red-proof)", async () => {
    assert.deepEqual(seeded.planted, ["SS-F3", "SS-I1"]);
    assert.deepEqual(KEY.problems.map((p) => p.id).sort(), seeded.planted);
    const owner = stack.token("snacky_shack")("owner");
    const results = await verifyWorld({ baseUrl: stack.baseUrl, token: () => owner, asOf: AS_OF }, KEY);
    for (const x of results) assert.ok(x.ok, `${x.id}: key ${String(x.expected)} but recomputed ${String(x.got)} (${x.detail})`);
    assert.equal(results.length, 2);
    const bad = { ...KEY, problems: KEY.problems.map((p) => (p.id === "SS-I1" ? { ...p, impact_minor: p.impact_minor! + 1 } : p)) };
    assert.deepEqual((await verifyWorld({ baseUrl: stack.baseUrl, token: () => owner, asOf: AS_OF }, bad)).filter((x) => !x.ok).map((x) => [x.id, x.expected, x.got]),
      [["SS-I1", 30001, 30000]]);
  });

  test("AU golden: GST is one eleventh inside the price, and bills either side of the October daylight-saving change land at the right instant", async () => {
    // DD-SS-SH-1..15: two Special Snacky Boxes for 2 at A$25 = 5,000 cents, GST inside: 5,000 x 10 / 110 = 454.5 → 455 (half up, per line).
    // Rung up at 18:40 Melbourne time: on Sat 3 Oct that is AEST (+10) = 08:40 UTC; from Sun 4 Oct (the change at 02:00) AEDT (+11) = 07:40 UTC.
    const rows = await q(`SELECT business_date::text AS d, to_char(created_at AT TIME ZONE 'UTC', 'HH24:MI') AS utc, total_minor::int AS total, tax_minor::int AS tax, count(*)::int AS n
        FROM core."order" WHERE tenant_id = $T AND external_ref LIKE 'DD-SS-SH-%' GROUP BY 1, 2, 3, 4 ORDER BY 1`);
    assert.deepEqual(rows, [
      { d: "2026-10-03", utc: "08:40", total: 5000, tax: 455, n: 3 },
      { d: "2026-10-04", utc: "07:40", total: 5000, tax: 455, n: 3 },
      { d: "2026-10-05", utc: "07:40", total: 5000, tax: 455, n: 3 },
      { d: "2026-10-06", utc: "07:40", total: 5000, tax: 455, n: 2 },
      { d: "2026-10-07", utc: "07:40", total: 5000, tax: 455, n: 2 },
      { d: "2026-10-08", utc: "07:40", total: 5000, tax: 455, n: 2 },
    ]);
    // Every history bill's business date is its Melbourne date (none slips a day across the change).
    // The SS-LIVE-* bills are rung up at the wall clock, so between midnight and the 04:00 business-day cutoff in Melbourne their
    // business date is still the day before: by design, and the reason they are not history.
    assert.deepEqual(await q(`SELECT count(*)::int AS n FROM core."order" WHERE tenant_id = $T AND external_ref IS NOT NULL
        AND external_ref NOT LIKE 'SS-LIVE-%' AND business_date <> (created_at AT TIME ZONE 'Australia/Melbourne')::date`), [{ n: 0 }]);
  });

  test("PII scan: every person, phone and email in the tenant is synthetic (the predicate red-proven on known values first)", async () => {
    // Red-proof: the predicate flags a real-looking email, phone and unmarked name, and passes the synthetic ones.
    assert.deepEqual(piiFindings([
      { where: "t", value: "someone@gmail.com", person: false }, { where: "t", value: "call 0412 345 678", person: false },
      { where: "t", value: "Jane Citizen", person: true }, { where: "t", value: "owner@snacky-shack.synthetic.test", person: false },
      { where: "t", value: "+61400100001", person: false }, { where: "t", value: "Mei Chen (synthetic)", person: true },
      { where: "t", value: "{\"at\":\"2026-10-03T18:40:00+10:00\",\"abn\":\"98765432109\"}", person: false }, { where: "t", value: "ring +61 3 5222 0000", person: false },
    ]), ["t: email someone@gmail.com", "t: phone 0412 345 678", "t: name Jane Citizen", "t: phone +61 3 5222 0000"]);
    // Every text and json column of every core table that holds this tenant's rows, scanned as text; people's names checked for the mark.
    const cols = (await stack.admin(`SELECT c.table_name AS t, c.column_name AS col FROM information_schema.columns c
        WHERE c.table_schema = 'core' AND c.data_type IN ('text', 'character varying', 'jsonb', 'json')
          AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'core' AND k.table_name = c.table_name AND k.column_name = 'tenant_id')
        ORDER BY 1, 2`)).rows as Array<{ t: string; col: string }>;
    assert.ok(cols.length >= 100, `only ${cols.length} columns scanned`);
    const people = new Set(["member.name", "staff.name", "customer.name"]);
    const rows: Array<{ where: string; value: string; person: boolean }> = [];
    for (const { t, col } of cols) {
      const r = (await stack.admin(`SELECT DISTINCT "${col}"::text AS v FROM core."${t}" WHERE tenant_id = $1 AND "${col}" IS NOT NULL`, [seeded.api.tenantId])).rows as Array<{ v: string }>;
      for (const { v } of r) rows.push({ where: `core.${t}.${col}`, value: v, person: people.has(`${t}.${col}`) });
    }
    assert.ok(rows.some((r) => r.person), "the scan saw no person's name");
    assert.ok(rows.some((r) => /@snacky-shack\.synthetic\.test/.test(r.value)), "the scan saw no email");
    assert.deepEqual(piiFindings(rows), []);
  });

  test("the storefront wears the page the seed published, with the real menu: 53 items in 11 categories", async () => {
    const sf = createMunimClient({ baseUrl: stack.baseUrl, storefrontKey: String(seeded.state.storefrontKey) }) as unknown as { GET(p: string, i?: unknown): Promise<{ data?: Record<string, unknown> }> };
    const page = (await sf.GET("/v1/storefront/page")).data!.page as { doc: { theme: Record<string, string> } };
    assert.deepEqual(page.doc.theme, { primary: "#c62f12", secondary: "#8a3a00", accent: "#ffcf3f", radius: "soft", layout: "hero-banner" });
    assert.deepEqual(page.doc, SNACKY_SHACK.page, "the published page differs from apps/web's built-in page for this business");
    const outlets = (await sf.GET("/v1/storefront/outlets")).data!.outlets as Array<{ outlet_id: string; name: string }>;
    assert.deepEqual(outlets.map((o) => o.name), ["The Snacky Shack Geelong"]);
    const items = (await sf.GET("/v1/storefront/outlets/{outlet_id}/menu", { params: { path: { outlet_id: outlets[0]!.outlet_id } } })).data!.items as
      Array<{ display_name: string; category: string; price_minor: number | null; diet: string | null; option_groups: Array<{ display_name: string; min_select: number; max_select: number; options: Array<{ display_name: string; price_delta_minor: number }> }> }>;
    assert.equal(items.length, 53);
    assert.equal(new Set(items.map((i) => i.category)).size, 11);
    const by = (n: string) => items.find((i) => i.display_name === n)!;
    assert.equal(by("Beef Smash Mate").price_minor, 1399);
    assert.equal(by("Mini Dim Sim").price_minor, 100);
    assert.equal(by("Korma Chicken/Beef Burger").price_minor, 1999);
    assert.deepEqual(by("Fries").option_groups.map((g) => [g.display_name, g.min_select, g.max_select, g.options.map((o) => [o.display_name, o.price_delta_minor])]),
      [["Size", 1, 1, [["Small", 0], ["Medium", 200], ["Large", 400]]]]);
    // Nothing is claimed about a real shop's food: no diet on any item.
    assert.deepEqual(items.filter((i) => i.diet !== null).map((i) => i.display_name), []);
  });

  test("the seed never prices or repoints a model role, and reports that live AI lacks AUD prices", async () => {
    assert.deepEqual(await q(`SELECT count(*)::int n FROM platform.config_draft WHERE target LIKE 'model_role:%'`), [{ n: 0 }]);
    assert.deepEqual(seeded.state.aiMissing, ["router", "reason", "narrate", "extract"].map((r) => `model_role ${r} has no AUD price`));
  });

  test("the plan-mode request log is identical in four time zones", () => {
    const logs = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Australia/Melbourne"].map((tz) => {
      const env = { ...process.env, TZ: tz } as Record<string, string | undefined>;
      delete env.NODE_TEST_CONTEXT;
      const r = spawnSync(process.execPath, ["src/cli.ts", "--world=snacky_shack", `--as-of=${AS_OF}`, "--days=183", `--seed=${KEY.seed}`, "--plan"],
        { cwd: join(import.meta.dirname, ".."), env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    });
    assert.ok(logs[0]!.split("\n").length > 500, "the log is suspiciously short");
    for (const l of logs) assert.equal(l, logs[0]);
  });
});
