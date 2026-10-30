// Every Cypher read the product depends on (design §4.2–4.7), on a real FalkorDB test server, against the hand-typed Cobnut-shaped
// world in world.ts. Expected rows are counted from world.ts's tables (cobnut.ts DISHES and RECIPES), never from a query's output.
// Two tenants share every id (tenant B's names end in " (B)"); each is its own graph, written through the projector's own writer.
// Red-proof (test/redproof-graph.sh): strip `$outlets IS NULL OR` from the read texts → every scoped check goes red; drop the
// `quoted` match from supplier_reach → the quoted-by check goes red.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type GraphConn, graphClient, type Row } from "../src/client.ts";
import { READ } from "../src/cypher.ts";
import { writeGraph } from "../src/project.ts";
import { stagingKey, swapIn } from "../src/swap.ts";
import { startTestFalkor, type TestFalkor } from "./harness.ts";
import { BUTTER_DISHES, HAZELNUT_DISHES, ID, world } from "./world.ts";

const A = randomUUID();
const B = randomUUID();
const W = world();
const it_ = W.itemId;
let server: TestFalkor;
let client: ReturnType<typeof graphClient>;

async function load(c: GraphConn, tenant: string, doc: ReturnType<typeof world>) {
  const key = stagingKey(tenant);
  await writeGraph(c, key, doc, { source_sha256: "test", projected_at: "2026-10-16T04:30:00.000Z" });
  await swapIn(c, tenant, key);
}
const q = (name: string, params: Record<string, unknown>, tenant = A): Promise<Row[]> => client.use((c) => c.ro(`munim:${tenant}`, READ[name]!, params));

beforeAll(async () => {
  server = await startTestFalkor();
  client = graphClient(server.url);
  await client.use(async (c) => {
    await load(c, A, W);
    await load(c, B, world(" (B)"));
  });
});
afterAll(async () => {
  await client?.close();
  await server?.stop();
});

describe("§4.2 ingredient_reach", () => {
  it("butter reaches its seven dishes at both outlets; the paused Pistachio Danish is available=false at both", async () => {
    const rows = await q("ingredient_reach", { ingredient_id: ID.butter, outlets: null });
    expect(rows.length).toBe(BUTTER_DISHES.length * 2);
    expect(new Set(rows.map((r) => r.item_id))).toEqual(new Set(BUTTER_DISHES.map((k) => it_[k])));
    expect(rows.filter((r) => r.item_id === it_.pistachio_danish).map((r) => r.available)).toEqual([false, false]);
    expect(rows.every((r) => typeof r.recipe_id === "string")).toBe(true);
  });
  it("scoped to Gomti Nagar: the seven dishes there only", async () => {
    const rows = await q("ingredient_reach", { ingredient_id: ID.butter, outlets: [ID.gmt] });
    expect([rows.length, rows.every((r) => r.outlet_id === ID.gmt)]).toEqual([BUTTER_DISHES.length, true]);
  });
  it("the truffle tin reaches the SKU through stocked_as, with no recipe", async () => {
    const rows = await q("ingredient_reach", { ingredient_id: ID.tin, outlets: null });
    expect(rows.map((r) => [r.item_id, r.recipe_id])).toEqual([[it_.truffle_tin, null], [it_.truffle_tin, null]]);
  });
});

describe("§4.3 ingredient_sources", () => {
  it("butter: Riverbank Dairy supplies it, Steady Wholesale quoted (both simulated)", async () => {
    const rows = await q("ingredient_sources", { ingredient_id: ID.butter });
    expect(rows.map((r) => [r.supplier_id, r.relation, r.simulated])).toEqual([[ID.dairy, "supplies", true], [ID.steady, "quoted", true]]);
  });
});

describe("§4.4 supplier_reach", () => {
  it("Riverbank Dairy → butter only, no other source, quoted by Steady Wholesale, 14 dish-outlet rows", async () => {
    const rows = await q("supplier_reach", { supplier_id: ID.dairy, outlets: null });
    expect(rows.length).toBe(BUTTER_DISHES.length * 2);
    expect(rows.every((r) => r.ingredient_id === ID.butter && (r.other_sources as unknown[]).length === 0)).toBe(true);
    expect(rows[0]!.quoted_by).toEqual([{ id: ID.steady, name: "Steady Wholesale (simulated)", simulated: true }]);
  });
  it("Lalbagh at Hazratganj → hazelnuts, its six dishes, that outlet only", async () => {
    const rows = await q("supplier_reach", { supplier_id: ID.nuts, outlets: [ID.hzg] });
    expect(rows.length).toBe(HAZELNUT_DISHES.length);
    expect(rows.every((r) => r.ingredient_id === ID.hazelnuts && r.outlet_id === ID.hzg)).toBe(true);
  });
});

describe("§4.5 sole_sources", () => {
  // Menu ingredients (used by a priced dish): butter, hazelnuts, flour, cream, chocolate, milk, the tin; sourdough and rolls are not.
  it("the seven menu ingredients, each with at most one supplier; flour has none on record", async () => {
    const rows = await q("sole_sources", { outlets: null });
    expect(rows.length).toBe(7);
    expect(rows.find((r) => r.ingredient_id === ID.butter)?.sources).toEqual([{ id: ID.dairy, name: "Riverbank Dairy (simulated)", simulated: true }]);
    expect(rows.find((r) => r.ingredient_id === ID.flour)?.sources).toEqual([]);
    expect(rows.some((r) => r.ingredient_id === ID.sourdough)).toBe(false);
  });
  it("a second butter supplier takes butter off the list (a quote does not count)", async () => {
    const other = randomUUID();
    await client.use((c) => load(c, other, { ...W, supplies: [...W.supplies, { src: ID.premium, dst: ID.butter, ref: "core.supplier_price:x" }] }));
    const rows = await q("sole_sources", { outlets: null }, other);
    expect([rows.length, rows.some((r) => r.ingredient_id === ID.butter)]).toEqual([6, false]);
  });
});

describe("§4.6 findings_about, drafts_about", () => {
  it("butter → the waste finding with its impact cell's parts; scoped to Gomti Nagar → none (it is Hazratganj's)", async () => {
    const rows = await q("findings_about", { node_ids: [ID.butter], outlets: null });
    expect(rows.map((r) => [r.finding_id, r.impact_snapshot_id, r.impact_row, r.impact_column])).toEqual([[ID.wasteFinding, ID.snap, 0, "excess_minor"]]);
    expect(await q("findings_about", { node_ids: [ID.butter], outlets: [ID.gmt] })).toEqual([]);
    expect((await q("findings_about", { node_ids: [ID.butter], outlets: [ID.hzg] })).length).toBe(1);
  });
  it("Riverbank + butter → the PO draft, about both; scoped to Gomti Nagar → none", async () => {
    const rows = await q("drafts_about", { node_ids: [ID.dairy, ID.butter], outlets: null });
    expect(rows.map((r) => [r.draft_id, (r.about_ids as string[]).sort()])).toEqual([[ID.poDraft, [ID.dairy, ID.butter].sort()]]);
    expect(await q("drafts_about", { node_ids: [ID.butter], outlets: [ID.gmt] })).toEqual([]);
  });
});

describe("§4.7 the agent's templates", () => {
  it("price_shock_path(butter): 7 dishes at depth 1 and 2 outlets at depth 2; depth 1 → dishes only; scoped → Gomti Nagar only", async () => {
    const two = await q("price_shock_path", { ingredient_id: ID.butter, depth: 2, outlets: null });
    expect([two.filter((r) => r.kind === "item" && r.depth === 1).length, two.filter((r) => r.kind === "outlet" && r.depth === 2).length, two.length]).toEqual([7, 2, 9]);
    expect((await q("price_shock_path", { ingredient_id: ID.butter, depth: 1, outlets: null })).every((r) => r.kind === "item")).toBe(true);
    const scoped = await q("price_shock_path", { ingredient_id: ID.butter, depth: 3, outlets: [ID.gmt] });
    expect(scoped.filter((r) => r.kind === "outlet").map((r) => r.node_id)).toEqual([ID.gmt]);
    expect(scoped.length).toBe(8);
  });
  it("dish_margin_drivers(croissant): butter (Riverbank), flour (none), hazelnuts (Lalbagh)", async () => {
    const rows = await q("dish_margin_drivers", { item_id: it_.hazelnut_croissant, depth: 3, outlets: null });
    expect(rows.map((r) => [r.ingredient_id, r.supplier_id]).sort()).toEqual([[ID.butter, ID.dairy], [ID.flour, null], [ID.hazelnuts, ID.nuts]].sort());
  });
  it("supplier_dependency(Riverbank): butter, no other supplier", async () => {
    expect((await q("supplier_dependency", { supplier_id: ID.dairy })).map((r) => [r.ingredient_id, r.other_supplier_id])).toEqual([[ID.butter, null]]);
  });
  it("neighbourhood(butter, 1): 7 recipes + Riverbank + Steady (quoted) + the finding + the draft; Gomti Nagar hides Hazratganj's finding and draft", async () => {
    const all = await q("neighbourhood", { entity_id: ID.butter, depth: 1, outlets: null });
    expect([all.length, all.filter((r) => r.kind === "recipe").length, all.filter((r) => r.kind === "finding" || r.kind === "draft").length]).toEqual([11, 7, 2]);
    const gmt = await q("neighbourhood", { entity_id: ID.butter, depth: 1, outlets: [ID.gmt] });
    expect([gmt.length, gmt.some((r) => r.kind === "finding" || r.kind === "draft")]).toEqual([9, false]);
    const deep = await q("neighbourhood", { entity_id: ID.butter, depth: 3, outlets: [ID.gmt] });
    expect([deep.length > 0, deep.some((r) => r.node_id === ID.hzg)]).toEqual([true, false]);
  });
});

describe("two tenants, the same ids, never mixed (D2)", () => {
  it("no tenant-B name in any tenant-A answer, and B answers with B's names", async () => {
    const params = { ingredient_id: ID.butter, supplier_id: ID.dairy, item_id: it_.hazelnut_croissant, entity_id: ID.butter, depth: 3, outlets: null, node_ids: [ID.butter, ID.dairy] };
    const names = Object.keys(READ).filter((k) => k !== "projection_state");
    expect(names.length).toBe(12);
    const textA = JSON.stringify(await Promise.all(names.map((k) => q(k, params))));
    expect([textA.includes("(B)"), textA.includes("Hazelnut Croissant")]).toEqual([false, true]);
    const b = await q("ingredient_reach", { ingredient_id: ID.butter, outlets: null }, B);
    expect([b.length, b.every((r) => String(r.item_name).endsWith("(B)"))]).toEqual([14, true]);
  });
});
