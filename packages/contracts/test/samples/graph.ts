import { S1, T_Z, snapRef, u } from "./_ids.ts";

const dairy = { supplier_id: u(10), name: "Riverbank Dairy (simulated)", simulated: true };
const nuts = { supplier_id: u(11), name: "Lalbagh Nut & Spice (simulated)", simulated: true };
const hzg = { outlet_id: u(1), name: "Cobnut Hazratganj" };
const gmt = { outlet_id: u(2), name: "Cobnut Gomti Nagar" };
const finding = { finding_id: u(80), type: "inventory.waste_spike", severity: "medium", impact_ref: snapRef(S1, 0, "excess_minor"), about_ids: [u(20)] };
const draft = { draft_id: u(81), command_type: "purchasing.po.create.v1", about_ids: [u(20), u(10)] };

export const SAMPLES: Record<string, unknown> = {
  "v1.graph.ingredient": {
    ingredient: { id: u(20), name: "Butter (synthetic)", unit: "kg" },
    sources: [{ ...dairy, relation: "supplies" }, { ...nuts, relation: "quoted" }],
    dishes: [
      { item_id: u(100), name: "Hazelnut Croissant", recipe_id: u(200), outlets: [{ ...hzg, available: true }, { ...gmt, available: true }] },
      { item_id: u(103), name: "Pistachio Danish", recipe_id: u(203), outlets: [{ ...hzg, available: false }] },
      { item_id: u(111), name: "Truffle Tin", recipe_id: null, outlets: [] },
    ],
    outlets: [hzg, gmt],
    findings: [finding, { ...finding, finding_id: u(82), severity: "low", impact_ref: null }],
    drafts: [draft],
    graph: { projected_at: T_Z },
  },
  "v1.graph.supplier": {
    supplier: dairy,
    ingredients: [{
      ingredient_id: u(20), name: "Butter (synthetic)", only_source: true, other_sources: [], quoted_by: [nuts],
      dishes: [{ item_id: u(100), name: "Hazelnut Croissant", outlets: [{ ...hzg, available: true }] }], outlets: [hzg],
    }],
    findings: [finding],
    drafts: [draft],
    graph: { projected_at: T_Z },
  },
  "v1.graph.sole-sources": {
    ingredients: [
      { ingredient_id: u(20), name: "Butter (synthetic)", sources: [dairy] },
      { ingredient_id: u(22), name: "Bread flour (synthetic)", sources: [] },
    ],
    graph: { projected_at: T_Z },
  },
};
