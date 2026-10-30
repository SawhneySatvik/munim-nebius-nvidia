// core-api on the FalkorDB backend (design §10 rows 8 and 10), end to end: two Cobnut tenants seeded through the public API, the real
// app and worker with the backend MUNIM_GRAPH=falkordb builds (graphFromConfig → the adapter's env.ts), a FalkorDB test server. Expected values are hand counts from tools/worldgen/src/worlds/cobnut.ts
// (seven butter dishes, two outlets, Riverbank Dairy the only butter supplier, seven menu ingredients with at most one supplier; the
// manager is scoped to Gomti Nagar) and the Postgres templates' own column lists (services/core-api/src/internal/graph/postgres/*.sql).
//   graph:query  the tenant comes from the run token; a `tenant_id` argument refuses; the same columns as the SQL templates; an
//                outlet-scoped run sees no other outlet; claim_support is not served (422)
//   /v1/graph/*  served, with the member's scope; 404 for an id the graph does not hold
//   rule 3       FalkorDB stopped → 503 graph_unavailable on every route and on graph:query, and nothing reads intel.edge instead (the
//                test takes munim_svc's SELECT on it away; the Postgres backend then fails, which shows the detector works)
// Red-proof (test/redproof-graph.sh): a fallback to the Postgres templates on GraphUnavailable → rule 3 goes red.
import type { TestDb } from "@munim/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IngredientReachResponse, SoleSourcesResponse, SupplierReachResponse } from "../../../packages/contracts/src/graph/index.ts";
import { TENANT_HEADER } from "../../../services/core-api/src/app.ts";
import { graphCaller, postgresGraph } from "../../../services/core-api/src/internal/graph/index.ts";
import { configureInternal } from "../../../services/core-api/src/internal/index.ts";
import { mintRunToken } from "../../../services/core-api/src/runtoken/index.ts";
import { composeWorker } from "../../../services/core-worker/src/main.ts";
import { createLogger, loadConfig } from "../../../packages/config/src/index.ts";
import { graphFromConfig } from "../../../services/core-api/src/graph.ts";
import { openDb } from "./db.ts";
import { startTestFalkor, type TestFalkor } from "./harness.ts";
import { seedCobnut, type Stack, startStack } from "./stack.ts";

const SECRET = "graph-core-api-test-secret-0123456789abcdef";
let db: TestDb;
let server: TestFalkor;
let stack: Stack;
let A: Awaited<ReturnType<typeof seedCobnut>>;
let B: Awaited<ReturnType<typeof seedCobnut>>;
const logs: string[] = [];
const id = async (tenant: string, table: string, name: string) =>
  (await db.admin(`SELECT id FROM ${table} WHERE tenant_id = $1 AND name = $2`, [tenant, name])).rows[0]!.id as string;
const ids: Record<string, string> = {};
/** The backend exactly as the entries build it: config → the adapter's mapping (env.ts) → its lazily loaded client. */
const booted = async () => {
  const config = loadConfig({ env: { MUNIM_GRAPH: "falkordb", MUNIM_FALKORDB_URL: server.url } });
  return graphFromConfig(config, createLogger(config, (l) => logs.push(l)));
};

type Res = Omit<Response, "json"> & { json(): Promise<any> };
const member = async (persona: string, path: string, tenant = A.tenantId): Promise<Res> =>
  (await fetch(`${stack.baseUrl}${path}`, { headers: { Authorization: `Bearer ${stack.token(persona)}`, [TENANT_HEADER]: tenant } })) as Res;
const runToken = async (tenant: string, outletScope: ["*"] | string[] = ["*"]) =>
  (await mintRunToken({ ...stack.api.keys, svc: stack.api.svc }, { tenantId: tenant, outletScope, trigger: "watch_sweep", actor: "watcher:graph" })).token;
const graphQuery = async (token: string, template: string, args: Record<string, unknown>): Promise<Res> =>
  (await fetch(`${stack.baseUrl}/internal/intel/v1/graph:query`, {
    method: "POST", body: JSON.stringify({ template, args }),
    headers: { authorization: `Bearer ${token}`, "x-munim-service-secret": SECRET, "content-type": "application/json" },
  })) as Res;

beforeAll(async () => {
  db = await openDb();
  server = await startTestFalkor();
  stack = await startStack(db, { graph: await booted(), log: (l) => logs.push(l) });
  configureInternal(stack.api.deps, { serviceSecret: SECRET, keys: stack.api.keys, watchWindowMs: 0 });
  A = await seedCobnut(stack, "graph-core-api-a");
  B = await seedCobnut(stack, "graph-core-api-b");
  ids.butter = await id(A.tenantId, "core.ingredient", "Butter (synthetic)");
  ids.dairy = await id(A.tenantId, "core.supplier", "Riverbank Dairy (simulated)");
  ids.hzg = await id(A.tenantId, "core.outlet", "Cobnut Hazratganj");
  ids.gmt = await id(A.tenantId, "core.outlet", "Cobnut Gomti Nagar");
  ids.croissant = (await db.admin(`SELECT id FROM core.item WHERE tenant_id = $1 AND display_name = 'Hazelnut Croissant'`, [A.tenantId])).rows[0]!.id as string;
}, 600_000);

afterAll(async () => {
  await stack?.stop();
  await server?.stop();
  await db?.stop();
});

describe("the worker's graph-project job (§10 row 11)", () => {
  it("not registered with the Postgres backend; with FalkorDB the tick builds every active tenant's graph, and a later tick writes nothing", async () => {
    expect(composeWorker(stack.worker).worker.cron.jobNames).not.toContain("graph-project");
    const events: Array<[string, Record<string, unknown>]> = [];
    const w = composeWorker({ ...stack.worker, graph: await booted(), log: (e, f = {}) => events.push([e, f]) });
    expect(w.worker.cron.jobNames).toContain("graph-project");
    const active = Number((await db.admin(`SELECT count(*) AS n FROM core.active_tenants()`)).rows[0]!.n);
    expect(active).toBeGreaterThanOrEqual(2);
    const tally = () => events.filter(([e]) => e === "graph.project").map(([, f]) => f);
    const t0 = new Date();
    const first = await w.worker.tick(t0, { periodMinutes: 15, budgetMs: 120_000 });
    expect(tally(), JSON.stringify({ first, events })).toEqual([{ rebuilt: active, unchanged: 0, failed: 0, stale_removed: 0 }]);
    await w.worker.tick(new Date(t0.getTime() + 15 * 60_000), { periodMinutes: 15, budgetMs: 120_000 });
    expect(tally()[1]).toEqual({ rebuilt: 0, unchanged: active, failed: 0, stale_removed: 0 });
    await w.worker.stop(5_000);
    await w.close();
  });
});

const BUTTER_DISHES = ["Brown Butter Hazelnut Cookie", "Cardamom Knot", "Eggless Choc-Chip Cookie", "Hazelnut Croissant", "Hazelnut Praline Cake", "Pain au Chocolat", "Pistachio Danish"];

describe("graph:query on the FalkorDB backend (§10 row 8)", () => {
  it("the same columns as the SQL templates, for each template the agent binds", async () => {
    const t = await runToken(A.tenantId);
    const cols = async (template: string, args: Record<string, unknown>) => {
      const r = await graphQuery(t, template, args);
      expect([template, r.status]).toEqual([template, 200]);
      const rows = (await r.json()).rows as Array<Record<string, unknown>>;
      expect([template, rows.length > 0]).toEqual([template, true]);
      return Object.keys(rows[0]!).sort();
    };
    expect(await cols("price_shock_path", { ingredient_id: ids.butter, depth: 2 })).toEqual(["depth", "kind", "name", "node_id"]);
    expect(await cols("neighbourhood", { entity_id: ids.butter, depth: 1 })).toEqual(["depth", "kind", "name", "node_id"]);
    expect(await cols("dish_margin_drivers", { item_id: ids.croissant })).toEqual(["depth", "ingredient_id", "ingredient_name", "supplier_id", "supplier_name"]);
    expect(await cols("supplier_dependency", { supplier_id: ids.dairy })).toEqual(["ingredient_id", "ingredient_name", "other_supplier_id", "other_supplier_name"]);
    expect((await graphQuery(t, "claim_support", { finding_id: ids.butter })).status).toBe(422);
  });

  it("butter's price reaches the seven butter dishes and both outlets; tenant B's token with A's ids → no rows", async () => {
    const rows = (await (await graphQuery(await runToken(A.tenantId), "price_shock_path", { ingredient_id: ids.butter, depth: 2 })).json()).rows as Array<Record<string, unknown>>;
    expect(rows.filter((r) => r.kind === "item").map((r) => r.name).sort()).toEqual(BUTTER_DISHES);
    expect(rows.filter((r) => r.kind === "outlet").map((r) => r.node_id).sort()).toEqual([ids.hzg, ids.gmt].sort());
    const other = await graphQuery(await runToken(B.tenantId), "price_shock_path", { ingredient_id: ids.butter, depth: 2 });
    expect([other.status, (await other.json()).rows]).toEqual([200, []]);
  });

  it("an outlet-scoped run sees no other outlet; a tenant_id argument is refused", async () => {
    const t = await runToken(A.tenantId, [ids.gmt!]);
    const rows = (await (await graphQuery(t, "price_shock_path", { ingredient_id: ids.butter, depth: 3 })).json()).rows as Array<Record<string, unknown>>;
    expect(rows.filter((r) => r.kind === "outlet").map((r) => r.node_id)).toEqual([ids.gmt]);
    expect((await graphQuery(t, "price_shock_path", { ingredient_id: ids.butter, tenant_id: B.tenantId })).status).toBe(422);
  });
});

describe("/v1/graph/* on the FalkorDB backend (§10 row 10)", () => {
  it("ingredient: Riverbank supplies butter; seven dishes at two outlets (the owner); the manager sees Gomti Nagar only", async () => {
    const own = IngredientReachResponse.parse(await (await member("owner", `/v1/graph/ingredients/${ids.butter}`)).json());
    expect(own.sources.map((s) => [s.name, s.simulated, s.relation])).toEqual([["Riverbank Dairy (simulated)", true, "supplies"]]);
    expect(own.dishes.map((d) => d.name).sort()).toEqual(BUTTER_DISHES);
    expect(own.outlets.length).toBe(2);
    expect(own.dishes.find((d) => d.name === "Pistachio Danish")!.outlets.map((o) => o.available)).toEqual([false, false]);
    const mgr = IngredientReachResponse.parse(await (await member("manager", `/v1/graph/ingredients/${ids.butter}`)).json());
    expect(mgr.outlets.map((o) => o.outlet_id)).toEqual([ids.gmt]);
    expect(mgr.dishes.every((d) => d.outlets.every((o) => o.outlet_id === ids.gmt))).toBe(true);
  });

  it("supplier: Riverbank is butter's only source; sole sources: the seven menu ingredients; a stranger id is 404; staff is 403", async () => {
    const s = SupplierReachResponse.parse(await (await member("owner", `/v1/graph/suppliers/${ids.dairy}`)).json());
    expect(s.ingredients.map((i) => [i.name, i.only_source, i.dishes.length])).toEqual([["Butter (synthetic)", true, 7]]);
    const ss = SoleSourcesResponse.parse(await (await member("owner", "/v1/graph/sole-sources")).json());
    expect(ss.ingredients.length).toBe(7);
    expect(ss.ingredients.find((i) => i.name === "Bread flour (synthetic)")!.sources).toEqual([]);
    expect((await member("owner", `/v1/graph/ingredients/${ids.dairy}`)).status).toBe(404);
    expect((await member("counter", "/v1/graph/sole-sources")).status).toBe(403);
  });
});

describe("rule 3: without FalkorDB there is no graph, and nothing falls back", () => {
  it("FalkorDB stopped → 503 graph_unavailable everywhere; nothing read intel.edge (the detector catches the Postgres templates)", async () => {
    const t = await runToken(A.tenantId);
    await db.admin(`REVOKE SELECT ON intel.edge FROM munim_svc`);
    try {
      // The detector works: the Postgres templates read intel.edge, and now cannot.
      const pg = (await postgresGraph())!;
      await expect(pg.template("price_shock_path", { ingredient_id: ids.butter!, depth: 2 }, graphCaller(stack.api.deps.pools.svc, A.tenantId, ["*"]))).rejects.toThrow(/permission denied/);
      await server.stop();
      logs.length = 0;
      for (const path of [`/v1/graph/ingredients/${ids.butter}`, `/v1/graph/suppliers/${ids.dairy}`, "/v1/graph/sole-sources"]) {
        const r = await member("owner", path);
        expect([path, r.status, (await r.json()).error.code]).toEqual([path, 503, "graph_unavailable"]);
      }
      const q = await graphQuery(t, "price_shock_path", { ingredient_id: ids.butter, depth: 2 });
      expect([q.status, (await q.json()).error.code]).toEqual([503, "graph_unavailable"]);
      expect(logs.filter((l) => /graph .*: unreachable$/.test(l)).length).toBe(4);
      expect(logs.join("\n")).not.toContain(String(server.port));
    } finally {
      await db.admin(`GRANT SELECT ON intel.edge TO munim_svc`);
    }
  });
});
