// [unit] T-131 / R68: the supplier map. The mock's three /v1/graph/* routes in its
// three modes, the deployment's flag (MUNIM_GRAPH: does core serve the graph?), the screen's choices (a dish's margin, a supplier's price,
// counts as list lengths) and every state of the screen rendered from its view pieces. Expected values are typed here from
// Cobnut's recipe table (tools/worldgen/src/worlds/cobnut.ts RECIPES), the mock's seeded suppliers, findings and drafts, and
// the design's copy — never read from the code under test.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IngredientDetail, MapView, type DetailProps, type MapData, type MapViewProps } from "@/components/staff/pages/supplier-map";
import type { MunimError } from "@/lib/munim/client";
import { MAP_WORDS, askAbout, daysBefore, marginCell, priceRow, reachWords, suppliersAsked, type IngredientReach, type SoleSources, type SupplierReach } from "@/lib/munim/graph";
import type { Snapshot } from "@/lib/munim/refs";
import { DEMO_PEOPLE, DEMO_TENANT_ID, can, type Session } from "@/lib/munim/session";
import { graphServed } from "@/lib/server/graph-flag";
import { id7, itemId } from "@/mock-server/data";
import { recipeId } from "@/mock-server/graph";
import { handle } from "@/mock-server/handler";
import { resetStaffBooks } from "@/mock-server/staff";
import { GOMTI_NAGAR, HAZRATGANJ, ING, SUPPLIER } from "@/mock-server/staff-data";

const token = (key: string) => DEMO_PEOPLE.find((p) => p.key === key)!.token;
async function call(method: "GET" | "POST", path: string, who: string | null, opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  const req = new Request(`http://mock.test/mock${path}`, {
    method,
    headers: { ...(who ? { Authorization: `Bearer ${token(who)}`, "X-Munim-Tenant": DEMO_TENANT_ID } : {}), "Content-Type": "application/json", ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handle(req, path.slice("/v1/".length).split("/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}
const get = (path: string, who: string | null, headers?: Record<string, string>) => call("GET", path, who, { headers });
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (html: string, needle: string | RegExp) => (typeof needle === "string" ? html.split(needle).length - 1 : (html.match(new RegExp(needle, "g")) ?? []).length);
const err = (e: Partial<MunimError>): MunimError => ({ kind: "server", status: 500, code: null, reasonCode: null, params: {}, retryAfterMs: null, ...e });
/** Every leaf of a JSON value with its path. */
const leaves = (x: unknown, path = ""): [string, unknown][] =>
  Array.isArray(x) ? x.flatMap((v, i) => leaves(v, `${path}/${i}`))
  : typeof x === "object" && x !== null ? Object.entries(x).flatMap(([k, v]) => leaves(v, `${path}/${k}`)) : [[path, x]];

// By hand, from cobnut.ts RECIPES: the seven dishes with butter in them.
const BUTTER_DISHES = ["Brown Butter Hazelnut Cookie", "Cardamom Knot", "Eggless Choc-Chip Cookie", "Hazelnut Croissant", "Hazelnut Praline Cake", "Pain au Chocolat", "Pistachio Danish"];
const DOWN = "The supplier map needs the graph database, which isn't answering right now. Your books are fine; try again in a minute.";
const EMPTY = "No supplier is on record yet. Add one on Suppliers.";
const SIM = ">Simulated supplier<";

let saved: string | undefined;
beforeEach(() => {
  resetStaffBooks();
  saved = process.env.MUNIM_MOCK_GRAPH;
});
afterEach(() => {
  if (saved === undefined) delete process.env.MUNIM_MOCK_GRAPH;
  else process.env.MUNIM_MOCK_GRAPH = saved;
});
const mode = (m: string | undefined) => {
  if (m === undefined) delete process.env.MUNIM_MOCK_GRAPH;
  else process.env.MUNIM_MOCK_GRAPH = m;
};
const PATHS = ["/v1/graph/sole-sources", `/v1/graph/ingredients/${ING("butter")}`, `/v1/graph/suppliers/${SUPPLIER.dairy}`];

describe("mock: /v1/graph/* only with a graph backend", () => {
  it("without one (unset or off) every route is 404, before any sign-in", async () => {
    for (const m of [undefined, "off"]) {
      mode(m);
      for (const p of PATHS) {
        expect((await get(p, null)).status, `${m} ${p} no token`).toBe(404);
        expect((await get(p, "owner")).status, `${m} ${p} owner`).toBe(404);
      }
    }
  });
  it("with one: 401 without a token, 403 for counter staff, 200 for the owner; down is 503 graph_unavailable; an unknown mode is refused", async () => {
    mode("on");
    for (const p of PATHS) {
      expect((await get(p, null)).status, p).toBe(401);
      expect((await get(p, "counter")).status, p).toBe(403);
      expect((await get(p, "owner")).status, p).toBe(200);
    }
    mode("down");
    for (const p of PATHS) {
      const r = await get(p, "owner");
      expect([r.status, r.body.error?.code], p).toEqual([503, "graph_unavailable"]);
    }
    mode("on");
    expect((await get(PATHS[0]!, "owner", { "X-Mock-Force-Graph": "down" })).status).toBe(503);
    mode("yes");
    expect((await get(PATHS[0]!, "owner")).status).toBe(500);
  });
  it("no answer carries a number (the graph holds none)", async () => {
    mode("on");
    let n = 0;
    for (const p of [...PATHS, `/v1/graph/ingredients/${ING("hazelnuts")}`, `/v1/graph/suppliers/${SUPPLIER.nuts}`]) {
      const all = leaves((await get(p, "owner")).body);
      n += all.length;
      expect(all.filter(([, v]) => typeof v === "number"), p).toEqual([]);
    }
    expect(n).toBeGreaterThan(50);
  });
});

describe("mock: what the graph answers", () => {
  beforeEach(() => mode("on"));
  it("sole sources: the four menu ingredients with one supplier or none, by name", async () => {
    const r = (await get("/v1/graph/sole-sources", "owner")).body as unknown as SoleSources;
    expect(r.ingredients.map((i) => [i.name, i.sources.map((s) => [s.name, s.simulated])])).toEqual([
      ["Bread flour (synthetic)", []],
      ["Butter (synthetic)", [["Riverbank Dairy (simulated)", true]]],
      ["Fresh cream (synthetic)", []],
      ["Roasted hazelnuts (synthetic)", [["Lalbagh Nut & Spice (simulated)", true]]],
    ]);
  });
  it("butter, for the owner: seven dishes at both outlets, the paused danish, its supplier, the waste finding and three drafts", async () => {
    const r = (await get(`/v1/graph/ingredients/${ING("butter")}`, "owner")).body as unknown as IngredientReach;
    expect(r.dishes.map((d) => d.name).sort()).toEqual(BUTTER_DISHES);
    expect(r.outlets.map((o) => o.outlet_id).sort()).toEqual([HAZRATGANJ, GOMTI_NAGAR].sort());
    expect(r.dishes.find((d) => d.name === "Pistachio Danish")!.outlets.every((o) => !o.available)).toBe(true);
    expect(r.sources).toEqual([{ supplier_id: SUPPLIER.dairy, name: "Riverbank Dairy (simulated)", simulated: true, relation: "supplies" }]);
    expect(r.findings.map((f) => [f.finding_id, f.about_ids])).toEqual([
      [id7("finding:butter"), [ING("butter")]], [id7("finding:cake"), [itemId("praline_celebration_cake")]],
    ]);
    expect(r.drafts.map((d) => d.draft_id).sort()).toEqual([id7("draft:prep_time"), id7("draft:prep_list"), id7("draft:po_butter_pooled")].sort());
  });
  it("butter, for the Gomti Nagar manager: only that outlet; the Hazratganj finding and drafts are hidden, the two-outlet draft is not", async () => {
    const r = (await get(`/v1/graph/ingredients/${ING("butter")}`, "manager")).body as unknown as IngredientReach;
    expect(r.dishes).toHaveLength(7);
    expect([...new Set(r.dishes.flatMap((d) => d.outlets.map((o) => o.outlet_id)))]).toEqual([GOMTI_NAGAR]);
    expect(r.findings).toEqual([]);
    expect(r.drafts.map((d) => d.draft_id)).toEqual([id7("draft:po_butter_pooled")]);
  });
  it("a supplier: what depends on it; the nut supplier's hazelnuts were also quoted by the dairy (simulated)", async () => {
    const dairy = (await get(`/v1/graph/suppliers/${SUPPLIER.dairy}`, "owner")).body as unknown as SupplierReach;
    expect(dairy.ingredients.map((i) => [i.name, i.only_source, i.dishes.length, i.outlets.length])).toEqual([["Butter (synthetic)", true, 7, 2]]);
    const nuts = (await get(`/v1/graph/suppliers/${SUPPLIER.nuts}`, "owner")).body as unknown as SupplierReach;
    expect(nuts.ingredients[0]!.quoted_by).toEqual([{ supplier_id: SUPPLIER.dairy, name: "Riverbank Dairy (simulated)", simulated: true }]);
    expect(nuts.ingredients[0]!.dishes).toHaveLength(6);
  });
  it("no supplier on record (the dev switch): every menu ingredient without a source, and no supplier is a node", async () => {
    const h = { "X-Mock-Force-Graph": "empty" };
    const r = (await get("/v1/graph/sole-sources", "owner", h)).body as unknown as SoleSources;
    expect(r.ingredients.map((i) => i.sources.length)).toEqual([0, 0, 0, 0]);
    expect((await get(`/v1/graph/suppliers/${SUPPLIER.dairy}`, "owner", h)).status).toBe(404);
  });
});

describe("the deployment's flag: does core serve the graph? (MUNIM_GRAPH, the setting core-api reads)", () => {
  it("unset, empty or postgres (core's default backend, no /v1/graph/* route): not served, so no link and no map", () => {
    expect([graphServed({}), graphServed({ MUNIM_GRAPH: "" }), graphServed({ MUNIM_GRAPH: " " }), graphServed({ MUNIM_GRAPH: "postgres" })]).toEqual([false, false, false, false]);
  });
  it("a graph adapter's mode (core's mode syntax): served", () => {
    expect([graphServed({ MUNIM_GRAPH: "graphdb" }), graphServed({ MUNIM_GRAPH: "graph_2" }), graphServed({ MUNIM_GRAPH: " graph-db " })]).toEqual([true, true, true]);
  });
  it("anything else refuses loudly, on/off words included (gotcha 17: never read as a default)", () => {
    for (const v of ["on", "off", "true", "yes", "1", "Graph", "two words", "--graph=on", "x".repeat(40)]) {
      expect(() => graphServed({ MUNIM_GRAPH: v }), v).toThrow(/MUNIM_GRAPH must be/);
    }
  });
});

describe("the screen's choices", () => {
  const snap = (rows: Snapshot["rows"]): Snapshot => ({
    snapshot_id: id7("snap:test"), template_id: "catalogue.dish_margin", params: {}, run_id: null, minted_by_member_id: null, minted_by_operator_id: null,
    outlet_scope: ["*"], columns: [], rows, row_count: rows.length, sha256: "", created_at: "2026-10-16T00:00:00Z",
  } as Snapshot);
  it("a margin: its row only when it costs the recipe the graph reached; another version or no margin is Cannot verify; no row is no sales", () => {
    const s = snap([{ item_id: "a", recipe_version_id: "r1", margin_bp: 6500 }, { item_id: "b", recipe_version_id: "old", margin_bp: 6000 }, { item_id: "c", recipe_version_id: "r3", margin_bp: null }]);
    expect(marginCell(s, "a", "r1")).toEqual({ kind: "cell", row: 0 });
    expect(marginCell(s, "b", "r2")).toEqual({ kind: "cannot_verify" });
    expect(marginCell(s, "c", "r3")).toEqual({ kind: "cannot_verify" });
    expect(marginCell(s, "d", "r4")).toEqual({ kind: "no_sales" });
  });
  it("a supplier's latest price row, or none", () => {
    const s = snap([{ supplier_id: "s1", ingredient_id: "i1", latest_minor: 56000 }]);
    expect([priceRow(s, "s1", "i1"), priceRow(s, "s1", "i2"), priceRow(s, "s2", "i1")]).toEqual([0, -1, -1]);
  });
  it("counts are list lengths; dates move by whole days; the Ask question is fixed text", () => {
    expect(reachWords([1, 2, 3, 4, 5, 6, 7], [1, 2])).toBe("Reaches 7 dishes at 2 outlets");
    expect(reachWords([1], [1])).toBe("Reaches 1 dish at 1 outlet");
    expect(reachWords([], [])).toBe("Not in any dish on the menu");
    expect([daysBefore("2026-10-16", 27), daysBefore("2026-03-01", 1), daysBefore("2026-01-01", 1)]).toEqual(["2026-09-19", "2026-02-28", "2025-12-31"]);
    expect(askAbout("Butter (synthetic)")).toBe("What does a price rise of Butter (synthetic) touch?");
  });
  it("the toast says suppliers were asked only when they were", () => {
    expect(["drafted", "no_quote", "no_passing_quote", "draft_refused"].map(suppliersAsked)).toEqual([true, true, true, true]);
    expect(["no_shortfall", "no_suppliers", "no_reference_price", "model_blocked", "not_simulated"].map(suppliersAsked)).toEqual([false, false, false, false, false]);
  });
  it("no word the screen shows carries a digit", () => {
    const words = Object.values(MAP_WORDS);
    expect(words.length).toBeGreaterThan(30);
    expect(words.filter((w) => /\p{Nd}/u.test(w))).toEqual([]);
  });
});

describe("every state of the screen", () => {
  let data: MapData;
  let butter: IngredientReach;
  let flour: IngredientReach;
  let prices: Snapshot;
  let margins: Snapshot;
  const noop = () => undefined;
  const view = (p: Partial<MapViewProps>) => render(createElement(MapView, { data, prices, fmt: { locale: "en-IN", currency: "INR" }, focus: null, onRetry: noop, onIngredient: noop, onOpen: noop, ...p }));
  const detail = (p: Partial<DetailProps>) =>
    render(createElement(IngredientDetail, {
      detail: butter, margins, impacts: {}, fmt: { locale: "en-IN", currency: "INR" }, outlet: { id: HAZRATGANJ, name: "Cobnut Hazratganj", tz: "Asia/Kolkata" },
      rfq: { busy: false, outcome: null, error: null }, onRfq: noop, onRetry: noop, onOpen: noop, ...p,
    }));

  beforeEach(async () => {
    mode("on");
    const sole = (await get("/v1/graph/sole-sources", "owner")).body as unknown as SoleSources;
    const cards = await Promise.all([SUPPLIER.dairy, SUPPLIER.nuts].map(async (id) => (await get(`/v1/graph/suppliers/${id}`, "owner")).body as unknown as SupplierReach));
    data = { sole, cards };
    butter = (await get(`/v1/graph/ingredients/${ING("butter")}`, "owner")).body as unknown as IngredientReach;
    flour = (await get(`/v1/graph/ingredients/${ING("flour")}`, "owner")).body as unknown as IngredientReach;
    prices = (await call("POST", "/v1/snapshots", "owner", { body: { template_id: "purchasing.price_creep", params: { as_of: "2026-10-16" } } })).body as unknown as Snapshot;
    margins = (await call("POST", "/v1/snapshots", "owner", { body: { template_id: "catalogue.dish_margin", params: { outlet_id: HAZRATGANJ, channel_kind: null, from: "2026-09-19", to: "2026-10-16" } } })).body as unknown as Snapshot;
  });

  it("loading: skeletons, nothing else", () => {
    const html = view({ data: null });
    expect(html).toContain('aria-label="Loading"');
    expect(html).not.toContain("Only one source");
  });
  it("ready: the strip, a card per supplier, counts from list lengths, a price cell with its chip", () => {
    const html = view({});
    expect(html).toContain("Only one source");
    expect(count(html, "— no supplier on record")).toBe(2);
    expect(count(html, "<article")).toBe(2);
    expect(html).toContain("Reaches 7 dishes at 2 outlets");
    expect(html).toContain("Reaches 6 dishes at 2 outlets");
    expect(count(html, "Source of ₹")).toBe(2);
  });
  it("every supplier name wears its badge (by hand: two in the strip, two card titles, one quoted-by)", () => {
    const html = view({});
    const names = count(html, /\(simulated\)/);
    expect(names).toBe(5);
    expect(count(html, SIM)).toBe(names);
    const drawer = detail({});
    expect(count(drawer, /\(simulated\)/)).toBe(1);
    // Supplied by, plus the note beside the request for quotes.
    expect(count(drawer, SIM)).toBe(2);
  });
  it("empty: no supplier on record", () => {
    const html = view({ data: { sole: data.sole, cards: [] } });
    expect(html).toContain(EMPTY);
    expect(html).not.toContain("<article");
  });
  it("graph offline (503 graph_unavailable): its own words, never the generic error", () => {
    const html = view({ data: err({ status: 503, code: "graph_unavailable" }) });
    expect(html).toContain(DOWN.replace("isn't", "isn&#x27;t"));
    expect(html).not.toContain("Something went wrong");
    expect(html).toContain("Try again");
  });
  it("error: the staff words and Try again", () => {
    const html = view({ data: err({ code: "internal" }) });
    expect(html).toContain("Something went wrong on our side. Try again.");
    expect(html).toContain(">Try again<");
    expect(html).not.toContain("graph database");
  });
  it("numbers loading: cell skeletons, no chip yet", () => {
    const html = view({ prices: null });
    expect(count(html, 'aria-label="Loading"')).toBe(2);
    expect(html).not.toContain("Source of");
  });
  it("cannot verify: a price that could not be minted; a margin about another recipe version; no sales is said in words", () => {
    expect(count(view({ prices: "failed" }), "Cannot verify")).toBe(2);
    const html = detail({});
    expect(count(html, "Cannot verify")).toBe(1); // Pain au Chocolat's row costs an earlier recipe version
    expect(html).toContain("No sales here in the last four weeks"); // the praline cake sold no plain portion
    expect(count(html, "Source of ")).toBe(BUTTER_DISHES.length - 2);
    expect(html).toContain("Paused at Cobnut Hazratganj");
  });
  it("the request for quotes: only for an ingredient with one supplier, beside its simulated note", () => {
    expect(detail({})).toContain("Ask other simulated suppliers to quote");
    expect(detail({ detail: flour })).not.toContain("Ask other simulated suppliers to quote");
    expect(detail({ detail: flour })).toContain("No supplier on record");
  });
  it("RFQ sent: the outcome in words with its draft; RFQ refused: the error note", () => {
    const sent = detail({ rfq: { busy: false, outcome: { text: "Quotes requested — a purchase order is waiting for approval.", draftId: id7("draft:po_nuts"), inbox: true }, error: null } });
    expect(sent).toContain(`href="/staff/inbox/${id7("draft:po_nuts")}"`);
    const refused = detail({ rfq: { busy: false, outcome: null, error: "Your role can't do this. Ask the owner." } });
    expect(refused).toContain('role="alert"');
    expect(refused).toContain("Your role can&#x27;t do this. Ask the owner.");
  });
  it("the Ask link carries the fixed question", () => {
    expect(detail({})).toContain(`href="/staff/ask?q=${encodeURIComponent("What does a price rise of Butter (synthetic) touch?").replaceAll("&", "&amp;")}"`);
  });
  it("role not allowed: the screen is for owners, managers and judges", () => {
    const as = (role: Session["me"]["role"]) => ({ token: "t", tenantId: DEMO_TENANT_ID, demo: true, me: { member_id: "m", tenant_id: DEMO_TENANT_ID, name: "Test", role, outlet_ids: "*" } }) as Session;
    expect(["owner", "manager", "judge", "staff", "advisor"].map((r) => can(as(r as Session["me"]["role"]), "suppliers"))).toEqual([true, true, true, false, false]);
  });
  it("the margin snapshot holds the recipe ids the graph reached (the mock's own books agree)", () => {
    expect(margins.rows.find((r) => r.item_id === itemId("hazelnut_croissant"))!.recipe_version_id).toBe(recipeId("hazelnut_croissant"));
    expect(butter.dishes.find((d) => d.item_id === itemId("hazelnut_croissant"))!.recipe_id).toBe(recipeId("hazelnut_croissant"));
  });
});
