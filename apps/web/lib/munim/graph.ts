// file: lib/munim/graph.ts
// The supplier map's data (R68, the supply graph): the three /v1/graph/* reads, the screen's words
// by key, and the few choices the screen makes from the answers. The graph holds no number: a count on screen is the
// length of a list in the same answer, and every figure is a cell of a snapshot the screen mints (catalogue.dish_margin,
// purchasing.price_creep), shown with its source chip or as "Cannot verify". Plain TypeScript, no React.
import { createMunimClient as createSdkClient } from "@munim/sdk";
import { settle, type MunimError } from "./client";
import { API_BASE, IS_MOCK } from "./index";
import { mockHeaders } from "./mock-controls";
import type { Snapshot } from "./refs";
import type { Session } from "./session";
import type { Schemas } from "./types";

export type IngredientReach = Schemas["V1GraphIngredient"];
export type SupplierReach = Schemas["V1GraphSupplier"];
export type SoleSources = Schemas["V1GraphSoleSources"];
export type GraphName = { supplier_id: string; name: string; simulated: boolean };

/** The graph reads for a signed-in person (owner, manager, judge; core scopes outlets from the membership). Each answers 404
 *  where core runs without a graph backend, and 503 graph_unavailable while the graph database is not answering. */
export function graphFor(s: Pick<Session, "token" | "tenantId">) {
  const sdk = createSdkClient({ baseUrl: API_BASE, token: () => s.token, tenantId: s.tenantId });
  const init = () => ({ cache: "no-store" as const, signal: AbortSignal.timeout(15_000), headers: IS_MOCK ? mockHeaders() : {} });
  return {
    listSoleSources: () => settle(() => sdk.GET("/v1/graph/sole-sources", init())),
    getSupplierReach: (supplierId: string) => settle(() => sdk.GET("/v1/graph/suppliers/{id}", { params: { path: { id: supplierId } }, ...init() })),
    getIngredientReach: (ingredientId: string) => settle(() => sdk.GET("/v1/graph/ingredients/{id}", { params: { path: { id: ingredientId } }, ...init() })),
  };
}
export type GraphClient = ReturnType<typeof graphFor>;

/** The graph database is not answering (503 graph_unavailable): its own state ("your books are fine"), never the generic
 *  error, and never answered from anywhere else (no fallback, design D6). */
export const graphDown = (e: MunimError): boolean => e.code === "graph_unavailable";

/** Every word the supplier map shows, by key. */
export const MAP_WORDS = {
  "map.link": "Supplier map",
  "map.link.supplier": "What depends on this supplier",
  "map.title": "Supplier map",
  "map.badge": "Simulated suppliers",
  "map.lede": "Who your menu depends on, and what a price change reaches. Read from the graph, rebuilt from your books.",
  "map.sole.title": "Only one source",
  "map.sole.none": "Every ingredient on the menu has more than one supplier on record.",
  "map.sole.from": "— only from",
  "map.sole.nobody": "— no supplier on record",
  "map.cards.title": "What depends on each supplier",
  "map.only": "Only source",
  "map.also": "Also from",
  "map.quoted": "Quoted by",
  "map.price": "Latest price",
  "map.price.none": "No recent price",
  "map.open": "What a price change touches",
  "map.empty": "No supplier is on record yet. Add one on Suppliers.",
  "map.empty.link": "Go to Suppliers",
  "map.down": "The supplier map needs the graph database, which isn't answering right now. Your books are fine; try again in a minute.",
  "map.retry": "Try again",
  "map.offline": "You're offline. Showing the last update.",
  "map.stamp": "Graph rebuilt from your books",
  "drawer.title": "What a price change touches",
  "drawer.close": "Close",
  "drawer.sources": "Supplied by",
  "drawer.sources.none": "No supplier on record",
  "drawer.dishes": "Dishes",
  "drawer.dishes.none": "No dish on the menu uses it.",
  "drawer.margin": "Margin here",
  "drawer.no_sales": "No sales here in the last four weeks",
  "drawer.findings": "Open findings",
  "drawer.findings.none": "No open finding on these.",
  "drawer.impact": "Impact",
  "drawer.drafts": "Pending drafts",
  "drawer.drafts.none": "No draft waiting on these.",
  "drawer.draft.open": "Open the draft",
  "drawer.rfq": "Ask other simulated suppliers to quote",
  "drawer.rfq.busy": "Asking…",
  "drawer.rfq.wait": "The simulated suppliers are quoting. This can take a minute.",
  "drawer.rfq.note": "Simulated supplier: nothing is sent to a real business.",
  "drawer.rfq.sent": "Asked the simulated suppliers. Any purchase order comes back to your inbox as a draft to approve.",
  "drawer.rfq.draft": "Open the purchase order draft",
  "drawer.rfq.inbox": "Open the inbox",
  "drawer.ask": "Ask Munim what this touches",
  "severity.low": "Low",
  "severity.medium": "Medium",
  "severity.high": "High",
  "severity.critical": "Critical",
} as const;
export type MapKey = keyof typeof MAP_WORDS;
export const t = (k: MapKey): string => MAP_WORDS[k];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Reaches 7 dishes at 2 outlets": both counts are lengths of lists in the same answer (R40 C3). */
export function reachWords(dishes: readonly unknown[], outlets: readonly unknown[]): string {
  if (dishes.length === 0) return "Not in any dish on the menu";
  return outlets.length === 0 ? `Reaches ${plural(dishes.length, "dish", "dishes")}, sold at none of your outlets` : `Reaches ${plural(dishes.length, "dish", "dishes")} at ${plural(outlets.length, "outlet", "outlets")}`;
}

/** "4 ingredients": the length of the "Only one source" list. */
export const ingredientsWords = (list: readonly unknown[]): string => plural(list.length, "ingredient", "ingredients");

/** A dish paused (not available) at one of the outlets it is priced at. */
export const pausedAt = (outletName: string): string => `Paused at ${outletName}`;

/** The question Ask Munim is opened with for one ingredient. The recorded Ask fixture for butter is keyed on this exact text
 *  (services/intel/tests/graph/test_butter_question.py types it again by hand). */
export const askAbout = (ingredientName: string): string => `What does a price rise of ${ingredientName} touch?`;

/** A dish's margin at this outlet (design §5.3), from a catalogue.dish_margin snapshot the screen minted: its row when the row
 *  costs the same recipe version the graph reached (so the figure is about this dish as it is made now), "cannot verify"
 *  when the row costs another version or has no margin, "no sales" when the dish has no row (it sold nothing here). */
export type MarginCell = { kind: "cell"; row: number } | { kind: "cannot_verify" } | { kind: "no_sales" };
export function marginCell(snap: Snapshot, itemId: string, recipeId: string | null): MarginCell {
  const row = snap.rows.findIndex((r) => r.item_id === itemId);
  if (row < 0) return { kind: "no_sales" };
  const r = snap.rows[row]!;
  return (r.recipe_version_id ?? null) === recipeId && typeof r.margin_bp === "number" ? { kind: "cell", row } : { kind: "cannot_verify" };
}

/** The row of a purchasing.price_creep snapshot holding one supplier's latest price for one ingredient; -1 = no recent price. */
export const priceRow = (snap: Snapshot, supplierId: string, ingredientId: string): number =>
  snap.rows.findIndex((r) => r.supplier_id === supplierId && r.ingredient_id === ingredientId && typeof r.latest_minor === "number");

/** A calendar date `days` before an ISO date ("2026-10-16", 27 -> "2026-09-19"): whole days, no time zone involved. */
export function daysBefore(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - days)).toISOString().slice(0, 10);
}

/** The RFQ statuses where no simulated supplier was asked (core's X-Munim-Negotiation): the "Asked the simulated suppliers"
 *  toast would not be true for these, so only the outcome's own words are shown. */
const NOT_ASKED = new Set(["no_shortfall", "no_suppliers", "no_reference_price", "model_blocked", "not_simulated"]);
export const suppliersAsked = (negotiation: string | null): boolean => negotiation === null || !NOT_ASKED.has(negotiation);
