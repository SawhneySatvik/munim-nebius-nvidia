// A Cobnut-shaped projection, typed by hand from tools/worldgen/src/worlds/cobnut.ts (its DISHES, RECIPES, suppliers, price lists
// and paused items: two outlets, nine ingredients, fourteen items, five simulated suppliers, one shop SKU), in the shape
// projection.sql hands the projector. Plus what the seed itself does not make but the reads must handle: one simulated quote,
// an open finding per outlet and a pending draft. `tag` makes a second tenant hostile: the same ids, other names.
// Expectations in the tests are counted from the tables below, never from a query's output.
import type { GraphDoc } from "../src/cypher.ts";

const u = (n: number) => `01930000-0000-7000-8000-${String(n).padStart(12, "0")}`;
export const ID = {
  hzg: u(1), gmt: u(2),
  dairy: u(10), nuts: u(11), steady: u(12), discounter: u(13), premium: u(14),
  butter: u(20), hazelnuts: u(21), flour: u(22), cream: u(23), chocolate: u(24), milk: u(25), tin: u(26), sourdough: u(27), rolls: u(28),
  wasteFinding: u(80), poDraft: u(81), expiryFinding: u(82), snap: u(90),
} as const;
type Ing = "butter" | "hazelnuts" | "flour" | "cream" | "chocolate" | "milk";

/** cobnut.ts DISHES (key, name, kind, category) with RECIPES' ingredients; the SKU has no recipe (it is stocked as the tin). */
const ITEMS: Array<[string, string, "dish" | "sku" | "combo", string, Ing[] | null]> = [
  ["hazelnut_croissant", "Hazelnut Croissant", "dish", "pastries", ["butter", "flour", "hazelnuts"]],
  ["pain_au_chocolat", "Pain au Chocolat", "dish", "pastries", ["butter", "flour", "chocolate"]],
  ["cardamom_knot", "Cardamom Knot", "dish", "pastries", ["butter", "flour"]],
  ["pistachio_danish", "Pistachio Danish", "dish", "pastries", ["butter", "flour"]],
  ["praline_celebration_cake", "Hazelnut Praline Cake", "dish", "cakes", ["butter", "flour", "hazelnuts", "cream", "chocolate"]],
  ["gianduja_mousse", "Gianduja Mousse Cup", "dish", "cakes", ["cream", "chocolate", "hazelnuts"]],
  ["rose_tres_leches", "Rose Pistachio Tres Leches", "dish", "cakes", ["milk", "cream", "flour"]],
  ["brown_butter_cookie", "Brown Butter Hazelnut Cookie", "dish", "cookies", ["butter", "flour", "hazelnuts"]],
  ["eggless_choc_chip", "Eggless Choc-Chip Cookie", "dish", "cookies", ["butter", "flour", "chocolate"]],
  ["oat_jaggery_cookie", "Oat & Jaggery Cookie", "dish", "cookies", ["flour"]],
  ["build_a_box", "Build-a-Box", "combo", "gift_boxes", ["chocolate", "hazelnuts", "cream"]],
  ["truffle_tin", "Truffle Tin", "sku", "gift_boxes", null],
  ["hazelnut_hot_chocolate", "Hazelnut Hot Chocolate", "dish", "drinks", ["milk", "chocolate", "hazelnuts"]],
  ["cold_coffee", "Cold Coffee", "dish", "drinks", ["milk"]],
];
/** The dishes whose recipe uses butter, and those using hazelnuts (counted from RECIPES above). */
export const BUTTER_DISHES = ["hazelnut_croissant", "pain_au_chocolat", "cardamom_knot", "pistachio_danish", "praline_celebration_cake", "brown_butter_cookie", "eggless_choc_chip"];
export const HAZELNUT_DISHES = ["hazelnut_croissant", "praline_celebration_cake", "gianduja_mousse", "brown_butter_cookie", "build_a_box", "hazelnut_hot_chocolate"];

export function world(tag = ""): GraphDoc & { itemId: Record<string, string> } {
  const n = (s: string) => `${s}${tag}`;
  const items = ITEMS.map(([key, name, kind, category], i) => ({ key, id: u(100 + i), name: n(name), kind, category }));
  const itemId = Object.fromEntries(items.map((x) => [x.key, x.id]));
  const recipes = ITEMS.filter((x) => x[4]).map(([key, name], i) => ({ id: u(200 + i), name: n(`${name} recipe`), item_id: itemId[key]!, variant_id: null, key }));
  let line = 300;
  const used_in = ITEMS.filter((x) => x[4]).flatMap(([key, , , , lines]) => {
    const r = recipes.find((x) => x.key === key)!;
    return lines!.map((ing) => ({ src: ID[ing], dst: r.id, ref: `core.recipe_line:${u(line++)}` }));
  });
  const outlets = [{ id: ID.hzg, name: n("Cobnut Hazratganj"), kind: "restaurant" }, { id: ID.gmt, name: n("Cobnut Gomti Nagar"), kind: "restaurant" }];
  let price = 500;
  // cobnut.ts: the Pistachio Danish is paused at both outlets, the Tres Leches at Gomti Nagar.
  const sold_at = items.flatMap((it) => outlets.map((o) => ({
    src: it.id, dst: o.id, ref: `core.price:${u(price++)}`,
    available: !(it.key === "pistachio_danish" || (it.key === "rose_tres_leches" && o.id === ID.gmt)),
  })));
  return {
    as_of: "2026-10-16",
    outlet: outlets,
    supplier: ([["dairy", "Riverbank Dairy (simulated)"], ["nuts", "Lalbagh Nut & Spice (simulated)"], ["steady", "Steady Wholesale (simulated)"],
      ["discounter", "Bargain Bulk Traders (simulated)"], ["premium", "Premium Provisions (simulated)"]] as const)
      .map(([k, name]) => ({ id: ID[k], name: n(name), simulated: true })),
    ingredient: ([["butter", "Butter (synthetic)", "kg"], ["hazelnuts", "Roasted hazelnuts (synthetic)", "kg"], ["flour", "Bread flour (synthetic)", "kg"],
      ["cream", "Fresh cream (synthetic)", "l"], ["chocolate", "Dark chocolate (synthetic)", "kg"], ["milk", "Milk (synthetic)", "l"],
      ["tin", "Truffle Tin (boxed, synthetic)", "pc"], ["sourdough", "Sliced sourdough loaf (synthetic)", "pc"], ["rolls", "Day-old bread rolls (synthetic)", "pc"]] as const)
      .map(([k, name, unit]) => ({ id: ID[k], name: n(name), unit })),
    recipe: recipes.map(({ key: _k, ...r }) => r),
    item: items.map(({ key: _k, ...r }) => r),
    finding: [
      { id: ID.wasteFinding, type: "inventory.waste_spike", severity: "medium", outlet_ids: [ID.hzg], impact_snapshot_id: ID.snap, impact_row: 0, impact_column: "excess_minor" },
      { id: ID.expiryFinding, type: "inventory.expiry_risk", severity: "low", outlet_ids: [ID.gmt], impact_snapshot_id: ID.snap, impact_row: 1, impact_column: "at_risk_minor" },
    ],
    draft: [{ id: ID.poDraft, command_type: "purchasing.po.create.v1", outlet_ids: [ID.hzg] }],
    // cobnut.ts: Riverbank's price list has butter, Lalbagh's hazelnuts; the other three have no price list.
    supplies: [
      { src: ID.dairy, dst: ID.butter, ref: `core.supplier_price:${u(700)}` },
      { src: ID.nuts, dst: ID.hazelnuts, ref: `core.supplier_price:${u(701)}` },
    ],
    // One simulated quote for butter (a negotiation round), so the quoted-by lists have something to show.
    quoted: [{ src: ID.steady, dst: ID.butter, ref: `intel.supplier_quote:${u(750)}` }],
    used_in,
    makes: recipes.map((r) => ({ src: r.id, dst: r.item_id, ref: `core.recipe_version:${r.id}` })),
    stocked_as: [{ src: ID.tin, dst: itemId.truffle_tin!, ref: `core.item:${itemId.truffle_tin}` }],
    sold_at,
    about: [
      { src: ID.wasteFinding, dst: ID.butter, ref: `evidence.snapshot:${ID.snap}` },
      { src: ID.expiryFinding, dst: ID.sourdough, ref: `evidence.snapshot:${ID.snap}` },
    ],
    answers: [{ src: ID.poDraft, dst: ID.wasteFinding, ref: `core.draft:${ID.poDraft}` }],
    targets: [{ src: ID.poDraft, dst: ID.dairy, ref: `core.draft:${ID.poDraft}` }, { src: ID.poDraft, dst: ID.butter, ref: `core.draft:${ID.poDraft}` }],
    itemId,
  };
}
