// Gates b, c and e on the real app (embedded Postgres 18, no .env, no network beyond 127.0.0.1): each world is
// seeded through the SDK over HTTP in its 100-day gate profile (long enough for every long-window plant), then
//   b  the planted count equals the answer-key length, with the same ids, and every key entry resolves to real rows;
//   c  an independent script recomputes each entry's impact from the read routes and it equals the key;
//   e  every supplier of every world is "Simulated supplier" (kind simulated, label from the API).
// WORLDGEN_LOG_DIR (set by determinism.test.ts) also writes each world's request log for the byte comparison.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { EVAL_WORLDS as WORLDS, runWorld } from "../src/run.ts";
import { verifyWorld } from "../verify/recompute.ts";
import { loadKey } from "../verify/run.ts";
import { AS_OF, DAYS } from "./profile.ts";
import { startStack, type Stack } from "./stack.ts";

// T-086: the plants this ticket adds, hand-typed per world (the board row's list as built; the ones it names that history cannot carry are in
// answer-key/detector-map.json under pack_cases with the reason). Each must be planted, in the key, and recompute to it.
const T086: Record<string, string[]> = {
  restaurant_group: ["RG-C1", "RG-C1b", "RG-C2", "RG-C3", "RG-C5", "RG-C6", "RG-F5", "RG-F7", "RG-F8", "RG-G1", "RG-G5", "RG-M1", "RG-M1b", "RG-MF1", "RG-P2"],
  cloud_kitchen: ["CK-FC2"],
  store: [],
  au_outlet: ["AU-FC2b"],
};

let stack: Stack;
before(async () => {
  stack = await startStack();
});
after(async () => {
  await stack?.stop();
});

describe("worlds", () => {
  let total = 0;
  for (const world of WORLDS) {
    test(`${world}: planted == key (b), recomputed == key (c), suppliers simulated (e)`, async () => {
      const r = await runWorld({ world, asOf: AS_OF, days: DAYS, baseUrl: stack.baseUrl, token: stack.token(world), operator: true });
      const dir = process.env.WORLDGEN_LOG_DIR;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${world}.log`), r.log);
      }
      const key = loadKey(world, DAYS, AS_OF);
      // b: the generator's planted ledger and the hand-kept key name the same problems.
      assert.deepEqual(r.planted, key.problems.map((p) => p.id).sort(), "planted ids differ from the answer key");
      assert.equal(r.planted.length, key.problems.length);
      assert.ok(key.problems.length >= 9, `${world} plants only ${key.problems.length}`);
      for (const id of T086[world]!) assert.ok(key.problems.some((p) => p.id === id) && r.planted.includes(id), `${id} is not planted and in the key`);
      total += key.problems.length;
      // c (and the second half of b): every entry resolves and recomputes to the key.
      const owner = stack.token(world)("owner");
      const results = await verifyWorld({ baseUrl: stack.baseUrl, token: () => owner, asOf: AS_OF }, key);
      for (const x of results) assert.ok(x.ok, `${x.id}: key ${String(x.expected)} but recomputed ${String(x.got)} (${x.detail})`);
      assert.equal(results.length, key.problems.length);
      // R47 D9 + D2: the owner's own policy command set labour 30% / margin 65% (a new version over the empty default, applied to the history's
      // first day), and an operator-approved monthly budget row exists for the as-of month in the business's currency.
      const tenantId = r.api.tenantId!;
      // Hard rule 5: a world is a demo tenant (drives the "Sample data" badge), provisioned by the operator with the owner bound to the persona's identity.
      assert.deepEqual((await stack.admin(`SELECT t.is_demo, t.onboarded_at IS NOT NULL AS onboarded, m.idp_sub FROM core.tenant t JOIN core.member m ON m.tenant_id = t.tenant_id AND m.id = $2 WHERE t.tenant_id = $1`, [tenantId, r.api.id("member:owner")])).rows,
        [{ is_demo: true, onboarded: true, idp_sub: `worldgen-${world}-owner` }]);
      // R47 D3: and the demo deal-review floor 15% / minimum payment term 7 days (orchestrator demo values, kit.ts).
      const pol = (await stack.admin(`SELECT labour_target_bp l, target_margin_bp m, margin_floor_bp f, min_payment_days d, created_by = $2 AS by_owner
        FROM core.business_policy WHERE tenant_id = $1 AND outlet_id IS NULL AND valid_to IS NULL`, [tenantId, r.api.id("member:owner")])).rows;
      assert.deepEqual(pol, [{ l: 3000, m: 6500, f: 1500, d: 7, by_owner: true }]);
      const bud = (await stack.admin(`SELECT b.month::text AS month, b.limit_minor::int AS lim, b.currency, d.status, o.idp_sub FROM platform.llm_budget b
        JOIN platform.config_draft d ON d.target = 'llm_budget:' || b.tenant_id JOIN platform.operator o ON o.id = d.decided_by WHERE b.tenant_id = $1`, [tenantId])).rows;
      assert.deepEqual(bud, [{ month: `${AS_OF.slice(0, 7)}-01`, lim: 500000, currency: world === "au_outlet" ? "AUD" : "INR", status: "applied", idp_sub: `worldgen-${world}-operator` }]);
      // History landed through the approved import path: committed pos_bills runs hold the timeline's bill lines (a floor
      // from the configured per-day minimum, not from the generator's output).
      const runs = ((await (await fetch(`${stack.baseUrl}/v1/imports/runs`, { headers: { Authorization: `Bearer ${owner}`, "X-Munim-Tenant": r.api.tenantId! } })).json()) as { runs: Array<{ kind: string; status: string; rows_ok: number }> }).runs;
      const bills = runs.filter((x) => x.kind === "pos_bills" && x.status === "committed").reduce((n, x) => n + x.rows_ok, 0);
      assert.ok(bills >= DAYS * 14, `only ${bills} history bill lines committed`);
      assert.ok(runs.some((x) => x.kind === "waste_log" && x.status === "committed"), "no waste history committed");
      // e: every supplier is simulated and says so; there is at least one, and as many as the world created.
      const created = r.log.split("\n").filter((l) => l.startsWith("POST /v1/suppliers ")).length;
      assert.ok(created >= 1, "world creates no supplier");
      assert.ok(!r.log.includes('"kind":"real"'), "a real supplier was created");
      const tenant = r.api.tenantId!;
      const res = await fetch(`${stack.baseUrl}/v1/suppliers`, { headers: { Authorization: `Bearer ${owner}`, "X-Munim-Tenant": tenant } });
      const { items } = (await res.json()) as { items: Array<{ kind: string; label: string | null; name: string }> };
      assert.equal(items.length, created);
      for (const s of items) {
        assert.equal(s.kind, "simulated", `${s.name} is not simulated`);
        assert.equal(s.label, "Simulated supplier", `${s.name} is not labelled`);
      }
      // Munim Cares (T-100a): hand-typed from the world's literals (3 recipients, 2 enrolled outlets, 3 listings, one 6 kg hand-over of 12 kg carrots
      // on hand, curd 20 kg expiring as-of + 2), never from the output.
      if (world === "restaurant_group") {
        const q = async (sql: string) => (await stack.admin(sql.replaceAll("$T", `'${tenantId}'`))).rows;
        assert.deepEqual(await q(`SELECT count(*)::int n, bool_and(simulated) sim, bool_and(name LIKE '%(simulated)') named FROM platform.cares_recipient WHERE status = 'active'`), [{ n: 3, sim: true, named: true }]);
        assert.deepEqual(await q(`SELECT e.enabled, d.status, o.idp_sub FROM platform.cares_enablement e JOIN platform.config_draft d ON d.id = e.config_draft_id
          JOIN platform.operator o ON o.id = d.decided_by WHERE e.tenant_id = $T`), [{ enabled: true, status: "applied", idp_sub: `worldgen-${world}-operator` }]);
        assert.deepEqual(await q(`SELECT (SELECT count(*)::int FROM core.cares_profile WHERE tenant_id = $T AND status = 'active' AND b2b_enabled) p,
          (SELECT count(*)::int FROM core.cares_outlet WHERE tenant_id = $T AND active) o`), [{ p: 1, o: 2 }]);
        assert.deepEqual(await q(`SELECT kind, status, count(*)::int n FROM core.cares_listing WHERE tenant_id = $T GROUP BY 1, 2 ORDER BY 1, 2`),
          [{ kind: "donation", status: "closed", n: 1 }, { kind: "donation", status: "published", n: 1 }, { kind: "offer", status: "published", n: 1 }]);
        assert.deepEqual(await q(`SELECT h.status, count(*)::int n, sum(l.qty_milli)::int qty FROM core.cares_handover h JOIN core.cares_handover_line l ON l.tenant_id = h.tenant_id AND l.handover_id = h.id
          WHERE h.tenant_id = $T GROUP BY 1`), [{ status: "recorded", n: 1, qty: 6000 }]);
        // 12 kg of carrots in, 6 kg out; the near-expiry curd is whole and falls due two days after as-of (the expiry_risk input; not a planted problem).
        assert.deepEqual(await q(`SELECT i.name, sum(m.qty_milli)::int q FROM core.stock_movement m JOIN core.ingredient i ON i.tenant_id = m.tenant_id AND i.id = m.ingredient_id
          WHERE m.tenant_id = $T AND m.batch_id IS NOT NULL AND m.outlet_id = (SELECT id FROM core.outlet WHERE tenant_id = $T AND name = 'Spice Route North') GROUP BY 1 ORDER BY 1`),
          [{ name: "Carrots", q: 6000 }, { name: "Fresh curd", q: 20000 }, { name: "Onions", q: 20000 }]);
        assert.deepEqual(await q(`SELECT (b.expires_on - '${AS_OF}'::date)::int d FROM core.batch b JOIN core.ingredient i ON i.tenant_id = b.tenant_id AND i.id = b.ingredient_id
          WHERE b.tenant_id = $T AND i.name = 'Fresh curd'`), [{ d: 2 }]);
        // The network total is minted by the operator and public only through its approved publish draft.
        assert.deepEqual(await q(`SELECT s.template_id, s.published_at IS NOT NULL pub, d.status, o.idp_sub FROM platform.network_snapshot s JOIN platform.config_draft d ON d.id = s.publish_draft_id
          JOIN platform.operator o ON o.id = d.decided_by`), [{ template_id: "platform.cares_network_impact", pub: true, status: "applied", idp_sub: `worldgen-${world}-operator` }]);
        // The total counts the one recorded hand-over: 6 kg of carrots = 6,000 g, one donation, one business (Σ row first).
        assert.deepEqual(await q(`SELECT (rows->0->>'businesses')::int b, (rows->0->>'donations')::int d, (rows->0->>'weight_g')::int g FROM platform.network_snapshot`), [{ b: 1, d: 1, g: 6000 }]);
        const pub = async (path: string) => (await (await fetch(`${stack.baseUrl}${path}`)).json()) as { items?: Array<{ business_name?: string; recipient_simulated?: boolean }>; rows?: unknown };
        const net = await pub("/v1/cares-network/listings?city=bengaluru");
        assert.equal(net.items?.length, 1, "the network page shows the one published donation");
        assert.equal(net.items![0]!.recipient_simulated, true);
        const imp = (await (await fetch(`${stack.baseUrl}/v1/cares-network/impact?city=bengaluru`)).json()) as Record<string, unknown>;
        assert.ok(JSON.stringify(imp).includes("Measured on synthetic data"), "the impact total carries the synthetic label");
      }
    });
  }
  test("the four worlds plant at least 60 problems between them", () => {
    assert.ok(total >= 76, `only ${total} planted`);
    assert.equal(WORLDS.reduce((n, w) => n + loadKey(w, DAYS, AS_OF).problems.length, 0), total);
  });
});
