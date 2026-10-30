// The supply-graph read routes (R68 G-2; contracts graph/index.ts). Mounted by modules/index.ts:
//   GET /v1/graph/ingredients/{id}   what a price change of one ingredient touches
//   GET /v1/graph/suppliers/{id}     what depends on one supplier
//   GET /v1/graph/sole-sources       menu ingredients with one supplier on record, or none
// Served only with a graph backend that has route reads (`deps.graph.read`, MUNIM_GRAPH naming an adapter): with the Postgres backend
// every path here is 404 before anything else is checked, exactly as if it were not mounted. Owner, manager and judge (the web's
// CAN.suppliers); outlet scope from the membership, never from the request. Every read first brings the graph up to date with the
// books (`fresh`), then folds the backend's rows into the contract shape and parses it: an answer can carry no field, least of all a
// number, that the contract does not name. Counting is left to the client (list lengths). A backend that cannot answer is 503
// graph_unavailable; nothing falls back to another store (D6).
import { snapRef } from "@munim/contracts";
import { IngredientReachResponse, SoleSourcesResponse, SupplierReachResponse } from "@munim/contracts/graph";
import { type Context, Hono } from "hono";
import { requireMember } from "../../auth/resolve.ts";
import { type GraphBackend, type GraphCaller, type GraphReadName, type GraphRow, graphCall, graphCaller } from "../../internal/graph/index.ts";
import { ApiError } from "../../lib/errors.ts";
import type { AppEnv } from "../../lib/types.ts";

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROLES = new Set(["owner", "manager", "judge"]);

type Reader = { read(name: GraphReadName, params: Record<string, unknown>): Promise<GraphRow[]>; projected_at: string };

/** The caller's reader, after the graph was brought up to date with the books. */
async function reader(c: Context<AppEnv>): Promise<Reader> {
  const p = c.var.principal;
  if (p.kind !== "member" || !ROLES.has(p.role)) throw new ApiError("forbidden");
  const deps = c.var.deps;
  const backend = deps.graph as Required<Pick<GraphBackend, "read" | "fresh">>;
  const caller: GraphCaller = graphCaller(deps.pools.svc, p.tenant_id, p.outlet_ids === "*" ? ["*"] : p.outlet_ids);
  const { projected_at } = await graphCall(deps, "fresh", () => backend.fresh(caller));
  return { projected_at, read: (name, params) => graphCall(deps, name, () => backend.read(name, params, caller)) };
}

const str = (v: unknown) => String(v);
const supplierOf = (x: { id?: unknown; name?: unknown; simulated?: unknown }) => ({ supplier_id: str(x.id), name: str(x.name), simulated: x.simulated === true });
const list = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);

/** Rows with item and outlet columns → dishes (first-seen order), each with the outlets it is priced at, and the distinct outlets. */
function dishesOf(rows: GraphRow[], withRecipe: boolean) {
  const dishes = new Map<string, { item_id: string; name: string; recipe_id?: string | null; outlets: Array<{ outlet_id: string; name: string; available: boolean }> }>();
  const outlets = new Map<string, { outlet_id: string; name: string }>();
  for (const r of rows) {
    if (r.item_id == null) continue;
    const id = str(r.item_id);
    let d = dishes.get(id);
    if (!d) {
      d = { item_id: id, name: str(r.item_name), ...(withRecipe ? { recipe_id: r.recipe_id == null ? null : str(r.recipe_id) } : {}), outlets: [] };
      dishes.set(id, d);
    }
    if (withRecipe && d.recipe_id === null && r.recipe_id != null) d.recipe_id = str(r.recipe_id);
    if (r.outlet_id == null) continue;
    const o = str(r.outlet_id);
    if (!d.outlets.some((x) => x.outlet_id === o)) d.outlets.push({ outlet_id: o, name: str(r.outlet_name), available: r.available !== false });
    if (!outlets.has(o)) outlets.set(o, { outlet_id: o, name: str(r.outlet_name) });
  }
  return { dishes: [...dishes.values()], outlets: [...outlets.values()] };
}

/** The open findings and pending drafts on these nodes (in the caller's outlet scope); a finding's impact as its cell's ref. */
async function onNodes(r: Reader, nodeIds: string[]) {
  const node_ids = [...new Set(nodeIds)];
  const findings = (await r.read("findings_about", { node_ids })).map((f) => ({
    finding_id: str(f.finding_id), type: str(f.type), severity: str(f.severity),
    impact_ref: f.impact_snapshot_id == null || f.impact_row == null || f.impact_column == null ? null : snapRef(str(f.impact_snapshot_id), Number(f.impact_row), str(f.impact_column)),
    about_ids: list(f.about_ids).map(str),
  }));
  const drafts = (await r.read("drafts_about", { node_ids })).map((d) => ({ draft_id: str(d.draft_id), command_type: str(d.command_type), about_ids: list(d.about_ids).map(str) }));
  return { findings, drafts };
}

export const router = new Hono<AppEnv>()
  // Not served without a graph backend: 404 before authentication, as an unmounted path answers.
  .use("/v1/graph/*", async (c, next) => {
    if (!c.var.deps.graph?.read || !c.var.deps.graph.fresh) throw new ApiError("not_found");
    await next();
  })
  .get(`/v1/graph/ingredients/:id{${ID}}`, requireMember, async (c) => {
    const id = c.req.param("id");
    const r = await reader(c);
    const [node] = await r.read("ingredient", { ingredient_id: id });
    if (!node) throw new ApiError("not_found");
    const sources = (await r.read("ingredient_sources", { ingredient_id: id })).map((s) => ({
      supplier_id: str(s.supplier_id), name: str(s.supplier_name), simulated: s.simulated === true, relation: str(s.relation),
    }));
    const { dishes, outlets } = dishesOf(await r.read("ingredient_reach", { ingredient_id: id }), true);
    const on = await onNodes(r, [id, ...dishes.map((d) => d.item_id), ...sources.map((s) => s.supplier_id)]);
    return c.json(IngredientReachResponse.parse({
      ingredient: { id: str(node.id), name: str(node.name), unit: str(node.unit) }, sources, dishes, outlets, ...on, graph: { projected_at: r.projected_at },
    }), 200);
  })
  .get(`/v1/graph/suppliers/:id{${ID}}`, requireMember, async (c) => {
    const id = c.req.param("id");
    const r = await reader(c);
    const [node] = await r.read("supplier", { supplier_id: id });
    if (!node) throw new ApiError("not_found");
    const rows = await r.read("supplier_reach", { supplier_id: id });
    const byIngredient = new Map<string, GraphRow[]>();
    for (const row of rows) byIngredient.set(str(row.ingredient_id), [...(byIngredient.get(str(row.ingredient_id)) ?? []), row]);
    const ingredients = [...byIngredient.entries()].map(([ingredient_id, rs]) => {
      const other_sources = list(rs[0]!.other_sources).map(supplierOf);
      return {
        ingredient_id, name: str(rs[0]!.ingredient_name), only_source: other_sources.length === 0, other_sources,
        quoted_by: list(rs[0]!.quoted_by).map(supplierOf), ...dishesOf(rs, false),
      };
    });
    const on = await onNodes(r, [id, ...ingredients.map((i) => i.ingredient_id)]);
    return c.json(SupplierReachResponse.parse({ supplier: supplierOf({ id: node.supplier_id, name: node.name, simulated: node.simulated }), ingredients, ...on, graph: { projected_at: r.projected_at } }), 200);
  })
  .get("/v1/graph/sole-sources", requireMember, async (c) => {
    const r = await reader(c);
    const ingredients = (await r.read("sole_sources", {})).map((i) => ({ ingredient_id: str(i.ingredient_id), name: str(i.ingredient_name), sources: list(i.sources).map(supplierOf) }));
    return c.json(SoleSourcesResponse.parse({ ingredients, graph: { projected_at: r.projected_at } }), 200);
  });
