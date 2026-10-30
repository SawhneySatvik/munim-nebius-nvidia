// R68 gates for the graph port in core-api, with no graph database: the in-tree Postgres backend, and a backend written here that
// serves fixed rows through the port (the real adapter's own gates start a real server, in its own package).
//   (1) mounted only with a graph backend: with the Postgres backend every /v1/graph/* path is 404 not_found, with or without a token
//   (2) with a backend that has route reads: owner, manager and judge only (staff 403); the tenant and outlet scope handed to the
//       backend are the membership's, whatever the request says; an unknown ingredient or supplier is 404
//   (3) the rows are folded into the contract (no field of a row that the contract does not name leaves core: a planted count is dropped)
//   (4) a backend that cannot answer → 503 graph_unavailable with the fixed message; the log holds the label only
//   (5) graph:query on such a backend: GraphUnavailable → 503; a template it does not serve → 422; a `tenant_id` argument never reaches it
// Expected rows are typed by hand below. Red-proof (the graph adapter's red-proof script): the 404 guard removed → (1) goes red.
import { createLogger } from "@munim/config";
import { IngredientReachResponse, SoleSourcesResponse, SupplierReachResponse } from "@munim/contracts/graph";
import { type TestDb, uuidv7 } from "@munim/db";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type Deps, TENANT_HEADER } from "../src/app.ts";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { svcTx, testKeys } from "../src/commit/testkit.ts";
import { type GraphBackend, type GraphCaller, GraphUnavailable } from "../src/internal/graph/index.ts";
import { configureInternal } from "../src/internal/index.ts";
import { mintRunToken } from "../src/runtoken/index.ts";
import { openDb } from "./db.ts";
import { buildTenant, type Tenant } from "./world.ts";

const idp = createLocalIdp();
const keys = testKeys();
const SECRET = "graph-routes-test-service-secret-0123456789";
let db: TestDb;
let pools: { core: pg.Pool; svc: pg.Pool };
let A: Tenant;
const staffSub = `staff-${uuidv7()}`;
const judgeSub = `judge-${uuidv7()}`;
const logs: string[] = [];
const u = (n: number) => `0199e0a0-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const BUTTER = u(20), DAIRY = u(10), STEADY = u(12), CROISSANT = u(100), RECIPE = u(200), O1 = u(1), O2 = u(2), FINDING = u(80), SNAP = u(90), DRAFT = u(81);

/** Fixed rows per read, in the columns the design's queries return (§4); every call is recorded. */
const calls: Array<{ what: string; params: unknown; caller: GraphCaller }> = [];
let failWith: GraphUnavailable | null = null;
const ROWS: Record<string, Array<Record<string, unknown>>> = {
  ingredient: [{ id: BUTTER, name: "Butter (synthetic)", unit: "kg" }],
  supplier: [{ supplier_id: DAIRY, name: "Riverbank Dairy (simulated)", simulated: true }],
  ingredient_sources: [{ supplier_id: DAIRY, supplier_name: "Riverbank Dairy (simulated)", simulated: true, relation: "supplies", ref: "core.supplier_price:x" },
    { supplier_id: STEADY, supplier_name: "Steady Wholesale (simulated)", simulated: true, relation: "quoted", ref: "intel.supplier_quote:x" }],
  ingredient_reach: [
    { item_id: CROISSANT, item_name: "Hazelnut Croissant", recipe_id: RECIPE, outlet_id: O1, outlet_name: "Outlet One", available: true, planted_count: 7 },
    { item_id: CROISSANT, item_name: "Hazelnut Croissant", recipe_id: RECIPE, outlet_id: O2, outlet_name: "Outlet Two", available: false },
  ],
  supplier_reach: [
    { ingredient_id: BUTTER, ingredient_name: "Butter (synthetic)", other_sources: [], quoted_by: [{ id: STEADY, name: "Steady Wholesale (simulated)", simulated: true }],
      item_id: CROISSANT, item_name: "Hazelnut Croissant", outlet_id: O1, outlet_name: "Outlet One", available: true },
  ],
  sole_sources: [{ ingredient_id: BUTTER, ingredient_name: "Butter (synthetic)", sources: [{ id: DAIRY, name: "Riverbank Dairy (simulated)", simulated: true }] }],
  findings_about: [{ finding_id: FINDING, type: "inventory.waste_spike", severity: "medium", impact_snapshot_id: SNAP, impact_row: 0, impact_column: "excess_minor", about_ids: [BUTTER] }],
  drafts_about: [{ draft_id: DRAFT, command_type: "purchasing.po.create.v1", about_ids: [BUTTER, DAIRY] }],
};
const fake: GraphBackend = {
  mode: "fake",
  async template(name, args, caller) {
    calls.push({ what: `template:${name}`, params: args, caller });
    if (failWith) throw failWith;
    return name === "claim_support" ? null : [{ node_id: CROISSANT, kind: "item", name: "Hazelnut Croissant", depth: 1 }];
  },
  async fresh(caller) {
    calls.push({ what: "fresh", params: null, caller });
    if (failWith) throw failWith;
    return { projected_at: "2026-10-16T04:30:00.000Z", wrote: false };
  },
  async read(name, params, caller) {
    calls.push({ what: name, params, caller });
    if ((name === "ingredient" && params.ingredient_id !== BUTTER) || (name === "supplier" && params.supplier_id !== DAIRY)) return [];
    return ROWS[name] ?? [];
  },
};

type Res = Omit<Response, "json"> & { json(): Promise<any> };
let pgApp: Awaited<ReturnType<typeof createApp>>;
let fakeApp: Awaited<ReturnType<typeof createApp>>;
const get = async (app: typeof pgApp, path: string, sub: string | null): Promise<Res> =>
  (await app.request(path, { headers: sub ? { Authorization: `Bearer ${idp.sign({ sub })}`, [TENANT_HEADER]: A.tenant } : {} })) as Res;

beforeAll(async () => {
  db = await openDb();
  A = await buildTenant(db, "graph");
  await db.withContext("munim_core", { tenant_id: A.tenant, outlet_ids: "*", role: "owner", member_id: A.owner, command_type: "tenancy.member.invite.v1" }, async (c) => {
    for (const [sub, role] of [[staffSub, "staff"], [judgeSub, "judge"]] as const) {
      const id = uuidv7();
      await c.query(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, $4, $5)`, [A.tenant, id, sub, role, `${role}@example.test`]);
      await c.query(`INSERT INTO core.membership (tenant_id, member_id, role, outlet_ids) VALUES ($1, $2, $3, $4)`, [A.tenant, id, role, role === "judge" ? [] : [A.outlets[0]]]);
    }
  });
  pools = { core: db.pool("munim_core", 4), svc: db.pool("munim_svc", 4) };
  const config = { nodeEnv: "test", redact: (s: string) => s };
  const base = { pools, idp, storefronts: async () => null, config, log: createLogger(config, (l) => logs.push(l)) };
  pgApp = await createApp(base as Deps);
  const fakeDeps: Deps = { ...base, graph: fake };
  fakeApp = await createApp(fakeDeps);
  configureInternal(fakeDeps, { serviceSecret: SECRET, keys, watchWindowMs: 0 });
});
afterAll(async () => {
  await pools?.core.end();
  await pools?.svc.end();
  await db?.stop();
});

const PATHS = [`/v1/graph/ingredients/${BUTTER}`, `/v1/graph/suppliers/${DAIRY}`, "/v1/graph/sole-sources"];

describe("(1) the Postgres backend serves no graph route", () => {
  it.each(PATHS)("%s → 404 not_found, with the owner's token and with none", async (path) => {
    for (const sub of [A.ownerSub, null]) {
      const r = await get(pgApp, path, sub);
      expect([r.status, (await r.json()).error.code]).toEqual([404, "not_found"]);
    }
  });
});

describe("(2) with a graph backend: who may read, and in which scope", () => {
  it("owner, manager and judge read; staff is refused (403); no token is 401", async () => {
    for (const sub of [A.ownerSub, A.managerSub, judgeSub]) expect((await get(fakeApp, "/v1/graph/sole-sources", sub)).status).toBe(200);
    expect((await get(fakeApp, "/v1/graph/sole-sources", staffSub)).status).toBe(403);
    expect((await get(fakeApp, "/v1/graph/sole-sources", null)).status).toBe(401);
  });

  it("the backend gets the membership's tenant and outlet scope, never the request's", async () => {
    calls.length = 0;
    expect((await get(fakeApp, `/v1/graph/ingredients/${BUTTER}?outlets=${A.outlets[1]}&tenant_id=${u(999)}`, A.managerSub)).status).toBe(200);
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.every((c) => c.caller.tenantId === A.tenant && JSON.stringify(c.caller.scope) === JSON.stringify([A.outlets[0]]))).toBe(true);
    expect(calls.some((c) => JSON.stringify(c.params).includes(u(999)) || JSON.stringify(c.params).includes(A.outlets[1]!))).toBe(false);
    calls.length = 0;
    await get(fakeApp, "/v1/graph/sole-sources", A.ownerSub);
    expect(calls.map((c) => [c.what, c.caller.scope])).toEqual([["fresh", ["*"]], ["sole_sources", ["*"]]]);
  });

  it("an id the graph does not hold is 404", async () => {
    expect((await get(fakeApp, `/v1/graph/ingredients/${u(555)}`, A.ownerSub)).status).toBe(404);
    expect((await get(fakeApp, `/v1/graph/suppliers/${u(555)}`, A.ownerSub)).status).toBe(404);
  });
});

describe("(3) rows folded into the contract", () => {
  it("ingredient: sources, one dish with both outlets (paused at one), the distinct outlets, the finding's cell ref, the draft", async () => {
    const body = IngredientReachResponse.parse(await (await get(fakeApp, `/v1/graph/ingredients/${BUTTER}`, A.ownerSub)).json());
    expect(body.sources.map((s) => [s.supplier_id, s.relation, s.simulated])).toEqual([[DAIRY, "supplies", true], [STEADY, "quoted", true]]);
    expect(body.dishes).toEqual([{ item_id: CROISSANT, name: "Hazelnut Croissant", recipe_id: RECIPE,
      outlets: [{ outlet_id: O1, name: "Outlet One", available: true }, { outlet_id: O2, name: "Outlet Two", available: false }] }]);
    expect(body.outlets.map((o) => o.outlet_id)).toEqual([O1, O2]);
    expect(body.findings[0]!.impact_ref).toBe(`⟨snap:${SNAP}·0·excess_minor⟩`);
    expect(body.drafts[0]!.about_ids).toEqual([BUTTER, DAIRY]);
    expect(JSON.stringify(body)).not.toContain("planted_count");
  });

  it("supplier: only source, quoted by Steady; sole sources: butter from Riverbank", async () => {
    const s = SupplierReachResponse.parse(await (await get(fakeApp, `/v1/graph/suppliers/${DAIRY}`, A.ownerSub)).json());
    expect([s.supplier.simulated, s.ingredients[0]!.only_source, s.ingredients[0]!.quoted_by.map((q) => q.supplier_id)]).toEqual([true, true, [STEADY]]);
    const ss = SoleSourcesResponse.parse(await (await get(fakeApp, "/v1/graph/sole-sources", A.ownerSub)).json());
    expect(ss.ingredients).toEqual([{ ingredient_id: BUTTER, name: "Butter (synthetic)", sources: [{ supplier_id: DAIRY, name: "Riverbank Dairy (simulated)", simulated: true }] }]);
  });
});

describe("(4)–(5) a backend that cannot answer", () => {
  it("routes: 503 graph_unavailable with the fixed message; the log holds the label only", async () => {
    failWith = new GraphUnavailable("unreachable");
    logs.length = 0;
    try {
      const r = await get(fakeApp, "/v1/graph/sole-sources", A.ownerSub);
      expect([r.status, await r.json()]).toEqual([503, { error: { code: "graph_unavailable", message: "The graph isn't answering right now. Your books are fine; try again in a minute.", reason_code: null } }]);
      expect(logs).toEqual(["graph fresh: unreachable"]);
    } finally {
      failWith = null;
    }
  });

  it("graph:query: GraphUnavailable → 503; claim_support (not served) → 422; a tenant_id argument → 422 and the backend is never called", async () => {
    const token = (await mintRunToken({ ...keys, svc: svcTx(db) }, { tenantId: A.tenant, outletScope: ["*"], trigger: "ask", actor: A.owner })).token;
    const q = async (template: string, args: Record<string, unknown>) => (await fakeApp.request("/internal/intel/v1/graph:query", {
      method: "POST", body: JSON.stringify({ template, args }),
      headers: { authorization: `Bearer ${token}`, "x-munim-service-secret": SECRET, "content-type": "application/json" },
    })).status;
    expect(await q("price_shock_path", { ingredient_id: BUTTER })).toBe(200);
    expect(await q("claim_support", { finding_id: FINDING })).toBe(422);
    calls.length = 0;
    expect(await q("price_shock_path", { ingredient_id: BUTTER, tenant_id: u(999) })).toBe(422);
    expect(calls).toEqual([]);
    failWith = new GraphUnavailable("timeout");
    try {
      expect(await q("price_shock_path", { ingredient_id: BUTTER })).toBe(503);
    } finally {
      failWith = null;
    }
  });
});
