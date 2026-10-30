// file: mock-server/graph.ts
// The supply graph's three read routes on the mock (contracts graph/index.ts; R68), over the bakery's synthetic books. Core
// serves them only with a graph backend, so the mock does only when told to, by MUNIM_MOCK_GRAPH on the server:
//   unset or "off"  every /v1/graph/* path is 404 before any sign-in, as core answers with its default Postgres backend;
//   "on"            the routes answer (owner, manager, judge; outlets from the membership, as core scopes them);
//   "down"          they answer 503 graph_unavailable, as core does while the graph database is not answering.
// Any other value is refused (500), never read as one of these. A dev switch, X-Mock-Force-Graph (mock-controls.ts), turns
// a served graph "down" or "empty" (no supplier on record) per request. No number is in any answer: the graph holds ids,
// names, codes, booleans and snapshot-cell refs only. Which dish uses which stock item is Cobnut's recipe table
// (tools/worldgen/src/worlds/cobnut.ts RECIPES) for the four menu ingredients the mock knows.
import type { Schemas } from "@/lib/munim/types";
import { ITEMS, OUTLETS, TAX_CLASS, id7, itemId } from "./data";
import { GOMTI_NAGAR, HAZRATGANJ, ING, INGREDIENTS, SUPPLIER, seedSuppliers, snap, type Draft, type Finding } from "./staff-data";

type S = Schemas;
type Me = S["V1Me"];
export type GraphMode = "off" | "on" | "down";

/** MUNIM_MOCK_GRAPH, strictly: null for a value that is none of the three (the routes then answer 500). */
export function graphMode(raw: string | undefined = process.env.MUNIM_MOCK_GRAPH): GraphMode | null {
  if (raw === undefined || raw === "") return "off";
  return raw === "off" || raw === "on" || raw === "down" ? raw : null;
}

/** Ingredient slug -> the dishes it goes into (Cobnut's recipes). */
export const USES: Record<string, readonly string[]> = {
  butter: ["hazelnut_croissant", "pain_au_chocolat", "cardamom_knot", "pistachio_danish", "praline_celebration_cake", "brown_butter_cookie", "eggless_choc_chip"],
  hazelnuts: ["hazelnut_croissant", "praline_celebration_cake", "gianduja_mousse", "brown_butter_cookie", "build_a_box", "hazelnut_hot_chocolate"],
  flour: ["hazelnut_croissant", "pain_au_chocolat", "cardamom_knot", "pistachio_danish", "praline_celebration_cake", "rose_tres_leches", "brown_butter_cookie", "eggless_choc_chip", "oat_jaggery_cookie"],
  cream: ["praline_celebration_cake", "gianduja_mousse", "rose_tres_leches", "build_a_box"],
};
/** Who supplies what (a price list or a purchase order), and who only quoted (the hazelnut negotiation's dairy quote). */
const SUPPLIES: Record<string, readonly string[]> = { butter: [SUPPLIER.dairy], hazelnuts: [SUPPLIER.nuts] };
const QUOTED: Record<string, readonly string[]> = { hazelnuts: [SUPPLIER.dairy] };
/** A dish's current base recipe version (the id a catalogue.dish_margin row carries as recipe_version_id). */
export const recipeId = (dish: string) => id7(`recipe:${dish}`);
/** What each seeded finding is about, and its outlets (core reads both from the finding's impact row). */
const FINDING_ABOUT: Record<string, { about: string[]; outlets: string[] }> = {
  [id7("finding:butter")]: { about: [ING("butter")], outlets: [HAZRATGANJ] },
  [id7("finding:cake")]: { about: [itemId("praline_celebration_cake")], outlets: [HAZRATGANJ] },
  [id7("finding:expiry")]: { about: [ING("sourdough")], outlets: [HAZRATGANJ] },
};
const IMPACT: Record<string, string> = { [id7("finding:butter")]: snap("waste", 0, "excess_minor"), [id7("finding:cake")]: snap("times", 0, "late_tickets") };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Munim-Mock": "true" } });
const fail = (status: number, code: S["Error"]["error"]["code"]) => json(status, { error: { code, message: "This request was refused.", reason_code: null } });

interface Ctx { scope: readonly string[] | null; now: Date; empty: boolean }
const outletsIn = (c: Ctx) => OUTLETS.filter((o) => c.scope === null || c.scope.includes(o.outlet_id));
const overlaps = (c: Ctx, ids: readonly string[]) => c.scope === null || ids.some((o) => c.scope!.includes(o));

function names(c: Ctx, supplierIds: readonly string[]): S["V1GraphSoleSources"]["ingredients"][number]["sources"] {
  const all = seedSuppliers(c.now);
  return supplierIds.flatMap((id) => {
    const s = all.find((x) => x.supplier_id === id);
    return s ? [{ supplier_id: s.supplier_id, name: s.name, simulated: s.kind === "simulated" }] : [];
  });
}
const suppliersOf = (c: Ctx, slug: string) => (c.empty ? [] : (SUPPLIES[slug] ?? []));

function dishesOf(c: Ctx, slug: string) {
  return (USES[slug] ?? []).map((dish) => {
    const item = ITEMS.find((i) => i.slug === dish)!;
    return {
      item_id: itemId(dish), name: item.name, recipe_id: recipeId(dish),
      outlets: outletsIn(c).map((o) => ({ outlet_id: o.outlet_id, name: o.name, available: !(item.soldOut || o.soldOut.includes(dish)) })),
    };
  });
}
const distinctOutlets = (dishes: { outlets: { outlet_id: string; name: string }[] }[]) =>
  [...new Map(dishes.flatMap((d) => d.outlets.map((o) => [o.outlet_id, { outlet_id: o.outlet_id, name: o.name }] as const))).values()];

/** Open findings and pending drafts about any of `nodes`, in the caller's outlets (an empty outlet list overlaps nothing). */
function onNodes(c: Ctx, nodes: Set<string>, findings: Finding[], drafts: Draft[]) {
  const f = findings.filter((x) => x.status === "open" && FINDING_ABOUT[x.finding_id] && overlaps(c, FINDING_ABOUT[x.finding_id]!.outlets)).flatMap((x) => {
    const about = FINDING_ABOUT[x.finding_id]!.about.filter((n) => nodes.has(n));
    return about.length ? [{ finding_id: x.finding_id, type: x.type, severity: x.severity, impact_ref: IMPACT[x.finding_id] ?? null, about_ids: about }] : [];
  });
  const d = drafts.filter((x) => x.status === "proposed" && overlaps(c, x.outlet_ids)).flatMap((x) => {
    const targets = new Set<string>(keyed(x.payload));
    if (x.finding_id) for (const n of FINDING_ABOUT[x.finding_id]?.about ?? []) targets.add(n);
    const about = [...targets].filter((n) => nodes.has(n));
    return about.length ? [{ draft_id: x.draft_id, command_type: x.command_type, about_ids: about }] : [];
  });
  return { findings: f, drafts: d };
}
/** Every item_id, ingredient_id, supplier_id, outlet_id and outlet_ids[] value anywhere in a draft's payload (core's `targets`). */
function keyed(x: unknown): string[] {
  if (Array.isArray(x)) return x.flatMap(keyed);
  if (typeof x !== "object" || x === null) return [];
  return Object.entries(x).flatMap(([k, v]) =>
    ["item_id", "ingredient_id", "supplier_id", "outlet_id"].includes(k) && typeof v === "string" ? [v]
    : k === "outlet_ids" && Array.isArray(v) ? v.filter((o): o is string => typeof o === "string")
    : keyed(v));
}

/** GET /v1/graph/*, after the member is known. */
export function graphRoute(req: Request, path: string, m: Me, books: { findings: Finding[]; drafts: Draft[] }, now: Date): Response {
  const mode = graphMode();
  if (mode === null) return fail(500, "internal");
  if (!["owner", "manager", "judge"].includes(m.role)) return fail(403, "forbidden");
  const forced = req.headers.get("X-Mock-Force-Graph");
  if (mode === "down" || forced === "down") return fail(503, "graph_unavailable");
  const c: Ctx = { scope: m.outlet_ids === "*" ? null : m.outlet_ids, now, empty: forced === "empty" };
  const graph = { projected_at: new Date(now.getTime() - 4 * 60_000).toISOString() };

  if (path === "/v1/graph/sole-sources") {
    const shown = new Set(outletsIn(c).map((o) => o.outlet_id));
    const ingredients = Object.keys(USES)
      .filter((slug) => dishesOf(c, slug).some((d) => d.outlets.some((o) => shown.has(o.outlet_id))) && suppliersOf(c, slug).length <= 1)
      .map((slug) => ({ ingredient_id: ING(slug), name: INGREDIENTS.items.find((i) => i.ingredient_id === ING(slug))!.name, sources: names(c, suppliersOf(c, slug)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json(200, { ingredients, graph } satisfies S["V1GraphSoleSources"]);
  }

  let r = /^\/v1\/graph\/ingredients\/([^/]+)$/.exec(path);
  if (r) {
    const ing = INGREDIENTS.items.find((i) => i.ingredient_id === r![1] && i.active);
    if (!ing) return fail(404, "not_found");
    // A stock item in no dish (the sourdough loaf) is still a node: no dishes, no supplier.
    const slug = Object.keys(USES).find((k) => ING(k) === ing.ingredient_id) ?? "";
    const dishes = dishesOf(c, slug);
    const sources = [
      ...names(c, suppliersOf(c, slug)).map((s) => ({ ...s, relation: "supplies" as const })),
      ...(c.empty ? [] : names(c, QUOTED[slug] ?? [])).map((s) => ({ ...s, relation: "quoted" as const })),
    ];
    const nodes = new Set([ing.ingredient_id, ...dishes.map((d) => d.item_id), ...sources.map((s) => s.supplier_id)]);
    return json(200, {
      ingredient: { id: ing.ingredient_id, name: ing.name, unit: ing.base_unit }, sources, dishes, outlets: distinctOutlets(dishes),
      ...onNodes(c, nodes, books.findings, books.drafts), graph,
    } satisfies S["V1GraphIngredient"]);
  }

  r = /^\/v1\/graph\/suppliers\/([^/]+)$/.exec(path);
  if (r) {
    const s = c.empty ? undefined : seedSuppliers(now).find((x) => x.supplier_id === r![1]);
    if (!s) return fail(404, "not_found");
    const slugs = Object.keys(SUPPLIES).filter((slug) => SUPPLIES[slug]!.includes(s.supplier_id)).sort();
    const ingredients = slugs.map((slug) => {
      const dishes = dishesOf(c, slug).map((d) => ({ item_id: d.item_id, name: d.name, outlets: d.outlets }));
      const others = names(c, SUPPLIES[slug]!.filter((id) => id !== s.supplier_id));
      return {
        ingredient_id: ING(slug), name: INGREDIENTS.items.find((i) => i.ingredient_id === ING(slug))!.name, only_source: others.length === 0, other_sources: others,
        quoted_by: names(c, (QUOTED[slug] ?? []).filter((id) => id !== s.supplier_id && !SUPPLIES[slug]!.includes(id))), dishes, outlets: distinctOutlets(dishes),
      };
    });
    const nodes = new Set([s.supplier_id, ...slugs.map((slug) => ING(slug))]);
    return json(200, {
      supplier: { supplier_id: s.supplier_id, name: s.name, simulated: s.kind === "simulated" }, ingredients,
      ...onNodes(c, nodes, books.findings, books.drafts), graph,
    } satisfies S["V1GraphSupplier"]);
  }
  return fail(404, "not_found");
}

/** catalogue.dish_margin (v2 columns, core's order) for one outlet over the last four weeks, from the mock's synthetic sales.
 *  Only dishes with no variants sold, as in Cobnut's history, so the praline cake has no row; the pain au chocolat row costs
 *  its earlier recipe version, so the map shows "Cannot verify" for it rather than a margin about another recipe. */
export function dishMarginRows(outletId: string | null): Record<string, string | number | boolean | null>[] {
  const SOLD: Record<string, { units: number; cost: number }> = {
    hazelnut_croissant: { units: 412, cost: 6_150 }, pain_au_chocolat: { units: 305, cost: 5_420 }, cardamom_knot: { units: 268, cost: 3_310 },
    pistachio_danish: { units: 121, cost: 7_480 }, gianduja_mousse: { units: 96, cost: 11_200 }, rose_tres_leches: { units: 88, cost: 9_350 },
    brown_butter_cookie: { units: 520, cost: 2_960 }, eggless_choc_chip: { units: 455, cost: 2_410 }, oat_jaggery_cookie: { units: 233, cost: 2_050 },
  };
  const share = outletId === GOMTI_NAGAR ? 6 : outletId === HAZRATGANJ ? 10 : 16;
  const rows = Object.entries(SOLD).map(([dish, s]) => {
    const item = ITEMS.find((i) => i.slug === dish)!;
    const units = Math.round((s.units * share) / 16);
    const net = units * item.price!;
    const margin = net - units * s.cost;
    return {
      item_id: itemId(dish), recipe_version_id: dish === "pain_au_chocolat" ? id7(`recipe:${dish}:earlier`) : recipeId(dish), units_sold: units, units_rank: 0,
      net_sales_minor: net, unit_cost_minor: s.cost, observed_waste_bp: 0, recipe_waste_bp: 0, margin_minor: margin, loss_minor: 0,
      margin_bp: Math.round((margin * 10_000) / net), excess_waste_minor: 0, suggested_price_minor: null, lines_unpriced: 0,
      price_id: id7(`price:${dish}:-:${outletId ?? HAZRATGANJ}:counter`), channel_kind: "counter", tax_class: TAX_CLASS,
    };
  });
  rows.sort((a, b) => b.units_sold - a.units_sold);
  return rows.map((r, i) => ({ ...r, units_rank: i + 1 }));
}
