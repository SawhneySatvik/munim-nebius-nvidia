// The supply graph's read routes (R68 G-2): what a price change of one ingredient reaches, what depends on one supplier,
// and the menu's ingredients with one supplier or none. Read-only. Served only when core-api runs with a graph backend
// (`MUNIM_GRAPH`); with the default Postgres backend every route here is 404, as if it did not exist.
// Every leaf is an id, a name a member entered, a code, a boolean, a list or a snapshot cell's ref: no number field at all
// (test/graph.test.ts walks these schemas). Counts on screen are lengths of these lists; figures (margins, prices) come
// from snapshots the member mints, and a finding's impact is its `impact_ref` cell (R25, R40 C3).
import { z } from "zod";
import { Severity } from "../internal/index.ts";
import { CommandType, IsoDateTime, Uuid7 } from "../shared/primitives.ts";
import { SnapCellRef } from "../shared/refs.ts";
import type { Route } from "../shared/routes.ts";

const Name = z.string().min(1).max(300);

/** Every supplier in the demo is simulated; the flag is shown beside every supplier name (CLAUDE.md rule 12). */
export const GraphSupplier = z.strictObject({ supplier_id: Uuid7, name: Name, simulated: z.boolean() }).meta({ title: "GraphSupplier" });
/** `supplies`: a price list or a purchase order names this supplier for the ingredient. `quoted`: a simulated supplier quoted
 *  for it in the last 90 days (non-binding; not a source of supply). */
export const GraphSource = GraphSupplier.extend({ relation: z.enum(["supplies", "quoted"]) }).meta({ title: "GraphSource" });
/** One outlet a dish is priced at; `available` false = paused there. */
export const GraphDishOutlet = z.strictObject({ outlet_id: Uuid7, name: Name, available: z.boolean() }).meta({ title: "GraphDishOutlet" });
export const GraphOutlet = z.strictObject({ outlet_id: Uuid7, name: Name }).meta({ title: "GraphOutlet" });
export const GraphFinding = z.strictObject({
  finding_id: Uuid7,
  type: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
  severity: Severity,
  /** The finding's impact cell (open it for the figure); null when the finding has none. */
  impact_ref: SnapCellRef.nullable(),
  /** The nodes of this answer the finding is about. */
  about_ids: z.array(Uuid7),
}).meta({ title: "GraphFinding" });
export const GraphDraft = z.strictObject({ draft_id: Uuid7, command_type: CommandType, about_ids: z.array(Uuid7) }).meta({ title: "GraphDraft" });
/** When core last rebuilt the graph from the books (it is checked against the books before every read). */
export const GraphStamp = z.strictObject({ projected_at: IsoDateTime }).meta({ title: "GraphStamp" });

export const IngredientReachResponse = z.strictObject({
  ingredient: z.strictObject({ id: Uuid7, name: Name, unit: z.string().min(1).max(20) }),
  sources: z.array(GraphSource),
  /** Every dish the ingredient reaches (through a recipe, or a shop item stocked as it), with the outlets it is priced at in
   *  the caller's scope. `recipe_id` is the dish's current recipe version (null for a shop item): the `recipe_version_id`
   *  of its row in `catalogue.dish_margin`. */
  dishes: z.array(z.strictObject({ item_id: Uuid7, name: Name, recipe_id: Uuid7.nullable(), outlets: z.array(GraphDishOutlet) })),
  /** The distinct outlets those dishes reach. */
  outlets: z.array(GraphOutlet),
  findings: z.array(GraphFinding),
  drafts: z.array(GraphDraft),
  graph: GraphStamp,
});

export const SupplierReachResponse = z.strictObject({
  supplier: GraphSupplier,
  ingredients: z.array(z.strictObject({
    ingredient_id: Uuid7,
    name: Name,
    /** True when no other supplier supplies it (`other_sources` is empty). */
    only_source: z.boolean(),
    other_sources: z.array(GraphSupplier),
    /** Simulated suppliers that quoted for it but do not supply it yet. */
    quoted_by: z.array(GraphSupplier),
    dishes: z.array(z.strictObject({ item_id: Uuid7, name: Name, outlets: z.array(GraphDishOutlet) })),
    outlets: z.array(GraphOutlet),
  })),
  findings: z.array(GraphFinding),
  drafts: z.array(GraphDraft),
  graph: GraphStamp,
});

export const SoleSourcesResponse = z.strictObject({
  /** Ingredients of dishes on the menu (in the caller's scope) with one supplier on record (`sources` has one entry) or
   *  none (empty). */
  ingredients: z.array(z.strictObject({ ingredient_id: Uuid7, name: Name, sources: z.array(GraphSupplier) })),
  graph: GraphStamp,
});

export const SCHEMAS = {
  "v1.graph.ingredient": IngredientReachResponse,
  "v1.graph.supplier": SupplierReachResponse,
  "v1.graph.sole-sources": SoleSourcesResponse,
};

const NEEDS = "Needs a graph backend: 404 where core-api runs without one, 503 graph_unavailable while the graph database is not answering.";
export const ROUTES: readonly Route[] = [
  { surface: "public", method: "get", path: "/v1/graph/ingredients/{id}", operationId: "getIngredientReach",
    summary: `What a price change of one ingredient touches: its suppliers, the dishes and outlets it reaches, and the open findings and pending drafts on them (owner, manager, judge; outlet scope from the membership). ${NEEDS}`,
    auth: "member", response: "v1.graph.ingredient", status: 200, pathParams: [{ name: "id", uuid: true }] },
  { surface: "public", method: "get", path: "/v1/graph/suppliers/{id}", operationId: "getSupplierReach",
    summary: `What depends on one supplier: each ingredient it supplies, whether it is the only source, who else supplies or quoted, and the dishes and outlets it reaches. ${NEEDS}`,
    auth: "member", response: "v1.graph.supplier", status: 200, pathParams: [{ name: "id", uuid: true }] },
  { surface: "public", method: "get", path: "/v1/graph/sole-sources", operationId: "listSoleSources",
    summary: `Ingredients of dishes on the menu with one supplier on record or none. ${NEEDS}`,
    auth: "member", response: "v1.graph.sole-sources", status: 200 },
];
