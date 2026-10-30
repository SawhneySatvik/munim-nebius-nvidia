// Kosambari Kitchens, the Bengaluru cloud kitchen (blr_kitchen), on the real app (embedded Postgres 18, the intel stub, no .env): seeded once
// through the SDK with its key's seed at the gate's fixed as-of. Expected values are typed here from the world's brief (three kitchens, four
// demo people, its published storefront page) and from the hand-kept key answer-key/demo/blr_kitchen.json, never from the seed's output.
//   planted == key, and every entry recomputes from the read routes (verify/recompute.ts); a key one paisa off fails (red-proof);
//   the storefront wears the page the seed published; every supplier is simulated; the seed never writes a model role's price;
//   the plan-mode request log is identical in four time zones.
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
// apps/web's built-in page for this business (what its shop shows before the published page answers), loaded by path as cobnut.test.ts
// loads the mock: the published page must be that very document, so the shop never changes look when it answers.
const WEB = join(import.meta.dirname, "../../../apps/web/lib/businesses/blr_kitchen/profile.ts");
const { BLR_KITCHEN } = (await import(WEB)) as { BLR_KITCHEN: { page: unknown } };
const KEY = loadKey("blr_kitchen", DAYS, AS_OF);
let stack: Stack;
let seeded: Awaited<ReturnType<typeof runWorld>>;

before(async () => {
  stack = await startStack();
  seeded = await runWorld({ world: "blr_kitchen", seed: KEY.seed, asOf: AS_OF, days: DAYS, baseUrl: stack.baseUrl, token: stack.token("blr_kitchen"), operator: true });
});
after(async () => {
  await stack?.stop();
});

const q = async (sql: string) => (await stack.admin(sql.replaceAll("$T", `'${seeded.api.tenantId}'`))).rows;

describe("blr_kitchen", () => {
  test("three kitchens, four demo people, a demo business, simulated suppliers, the AI budget for three months", async () => {
    assert.deepEqual(await q(`SELECT name, is_demo, onboarded_at IS NOT NULL onboarded, base_currency FROM core.tenant WHERE tenant_id = $T`),
      [{ name: "Kosambari Kitchens (synthetic)", is_demo: true, onboarded: true, base_currency: "INR" }]);
    assert.deepEqual(await q(`SELECT name, kind, tz FROM core.outlet WHERE tenant_id = $T ORDER BY name`), [
      { name: "Kosambari HSR Layout", kind: "cloud_kitchen", tz: "Asia/Kolkata" },
      { name: "Kosambari Indiranagar", kind: "cloud_kitchen", tz: "Asia/Kolkata" },
      { name: "Kosambari Whitefield", kind: "cloud_kitchen", tz: "Asia/Kolkata" },
    ]);
    // The demo sign-in picker's keys (apps/web DEMO_KEYS), each bound to its persona's synthetic address.
    assert.deepEqual(await q(`SELECT m.name, m.email, ms.role, CASE WHEN ms.outlet_ids = '{}' THEN '*' ELSE (SELECT string_agg(o.name, ',' ORDER BY o.name) FROM core.outlet o
        WHERE o.tenant_id = m.tenant_id AND o.id = ANY (ms.outlet_ids)) END outlets, m.idp_sub IS NOT NULL bound
        FROM core.member m JOIN core.membership ms ON ms.tenant_id = m.tenant_id AND ms.member_id = m.id WHERE m.tenant_id = $T ORDER BY m.email`), [
      { name: "Divya Shetty", email: "counter@blr-kitchen.synthetic.test", role: "staff", outlets: "Kosambari Indiranagar", bound: true },
      { name: "Prakash Nayak", email: "kitchen@blr-kitchen.synthetic.test", role: "staff", outlets: "Kosambari Indiranagar", bound: true },
      { name: "Manjunath Hegde", email: "manager@blr-kitchen.synthetic.test", role: "manager", outlets: "Kosambari HSR Layout,Kosambari Whitefield", bound: true },
      { name: "Shalini Rao", email: "owner@blr-kitchen.synthetic.test", role: "owner", outlets: "*", bound: true },
    ]);
    assert.deepEqual(await q(`SELECT name, kind FROM core.supplier WHERE tenant_id = $T ORDER BY name`), [
      { name: "Chickpet Pulses & Grains (simulated)", kind: "simulated" },
      { name: "Nandi Hills Dairy (simulated)", kind: "simulated" },
      { name: "Tiptur Coconut Traders (simulated)", kind: "simulated" },
    ]);
    // ₹100 a month for October and the next two (the as-of month on), each approved by the operator.
    assert.deepEqual(await q(`SELECT month::text AS month, limit_minor::int AS lim, currency FROM platform.llm_budget WHERE tenant_id = $T ORDER BY month`),
      ["2026-10-01", "2026-11-01", "2026-12-01"].map((month) => ({ month, lim: 10_000, currency: "INR" })));
    // History came in through the approved import path: three kitchens, at least 14 + 18 + 22 = 54 bills a day at the floor of each range.
    const lines = await q(`SELECT coalesce(sum(rows_ok), 0)::int n FROM core.import_run WHERE tenant_id = $T AND kind = 'pos_bills' AND status = 'committed'`);
    assert.ok((lines[0]!.n as number) >= DAYS * 54, `only ${String(lines[0]!.n)} history bill lines committed`);
  });

  test("planted == the key, and every entry recomputes to it from the read routes", async () => {
    assert.deepEqual(KEY.problems.map((p) => p.id).sort(), ["BK-F1", "BK-F3", "BK-I1", "BK-P1"]);
    assert.deepEqual(seeded.planted, KEY.problems.map((p) => p.id).sort());
    const owner = stack.token("blr_kitchen")("owner");
    const results = await verifyWorld({ baseUrl: stack.baseUrl, token: () => owner, asOf: AS_OF }, KEY);
    for (const x of results) assert.ok(x.ok, `${x.id}: key ${String(x.expected)} but recomputed ${String(x.got)} (${x.detail})`);
    assert.equal(results.length, 4);
  });

  test("RED-PROOF: a key one paisa off fails that entry, and only that one", async () => {
    const owner = stack.token("blr_kitchen")("owner");
    const bad = { ...KEY, problems: KEY.problems.map((p) => (p.id === "BK-F3" ? { ...p, impact_minor: p.impact_minor! + 1 } : p)) };
    const results = await verifyWorld({ baseUrl: stack.baseUrl, token: () => owner, asOf: AS_OF }, bad);
    assert.deepEqual(results.filter((x) => !x.ok).map((x) => [x.id, x.expected, x.got]), [["BK-F3", 48385, 48384]]);
  });

  test("the storefront wears the page the seed published, and lists the three kitchens and the menu", async () => {
    const sf = createMunimClient({ baseUrl: stack.baseUrl, storefrontKey: String(seeded.state.storefrontKey) }) as unknown as { GET(p: string, i?: unknown): Promise<{ data?: Record<string, unknown> }> };
    const page = (await sf.GET("/v1/storefront/page")).data!.page as { version: number; doc: { theme: Record<string, string>; sections: Array<Record<string, unknown>> } };
    assert.equal(page.version, 1);
    assert.deepEqual(page.doc.theme, { primary: "#2d6a2e", secondary: "#8f5b00", accent: "#f7dc8f", radius: "round", layout: "hero-banner" });
    assert.deepEqual(page.doc.sections.map((s) => s.kind), ["hero", "outlets", "ribbon", "cards"]);
    assert.equal(page.doc.sections[1]!.title, "Pick your kitchen");
    assert.deepEqual(page.doc, BLR_KITCHEN.page, "the published page differs from apps/web's built-in page for this business");
    // Published by the owner's own command.
    assert.deepEqual(await q(`SELECT m.name FROM core.storefront_page_publish p JOIN core.member m ON m.tenant_id = p.tenant_id AND m.id = p.published_by WHERE p.tenant_id = $T`), [{ name: "Shalini Rao" }]);
    const outlets = (await sf.GET("/v1/storefront/outlets")).data!.outlets as Array<{ outlet_id: string; name: string }>;
    assert.deepEqual(outlets.map((o) => o.name), ["Kosambari Indiranagar", "Kosambari HSR Layout", "Kosambari Whitefield"]);
    const menu = async (name: string) => (await sf.GET("/v1/storefront/outlets/{outlet_id}/menu", { params: { path: { outlet_id: outlets.find((o) => o.name === name)!.outlet_id } } })).data!.items as
      Array<{ display_name: string; category: string; available: boolean; price_minor: number | null; variants: Array<{ display_name: string; price_minor: number }> }>;
    const ind = await menu("Kosambari Indiranagar");
    assert.equal(ind.length, 15);
    assert.deepEqual([...new Set(ind.map((i) => i.category))].sort(), ["combos", "dosa", "drinks", "idli_vada", "rice_bath", "sweets"]);
    assert.equal(ind.find((i) => i.display_name === "Masala Dosa")!.price_minor, 14000);
    assert.deepEqual(ind.find((i) => i.display_name === "Mysore Pak")!.variants.map((v) => [v.display_name, v.price_minor]), [["Box of 4", 12000], ["Box of 8", 22000]]);
    assert.equal((await menu("Kosambari Whitefield")).find((i) => i.display_name === "Onion Rava Dosa")!.available, false);
  });

  test("the seed never prices or repoints a model role: it only reports what a live AI run still lacks", async () => {
    assert.deepEqual(await q(`SELECT count(*)::int n FROM platform.config_draft WHERE target LIKE 'model_role:%'`), [{ n: 0 }]);
    // On this fresh database no role carries a price: the seed says so, role by role, and finds every AI budget month in place.
    assert.deepEqual(seeded.state.aiMissing, ["router", "reason", "narrate", "extract"].map((r) => `model_role ${r} has no INR price`));
  });

  test("the plan-mode request log is identical in four time zones", () => {
    const logs = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Australia/Melbourne"].map((tz) => {
      const env = { ...process.env, TZ: tz } as Record<string, string | undefined>;
      delete env.NODE_TEST_CONTEXT;
      const r = spawnSync(process.execPath, ["src/cli.ts", "--world=blr_kitchen", `--as-of=${AS_OF}`, `--days=${DAYS}`, `--seed=${KEY.seed}`, "--plan"],
        { cwd: join(import.meta.dirname, ".."), env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    });
    assert.ok(logs[0]!.split("\n").length > 500, "the log is suspiciously short");
    for (const l of logs) assert.equal(l, logs[0]);
  });
});
