// The graph-backend port (ADR-014 "Graph port", R68). One backend answers the graph reads for this process: the in-tree Postgres
// templates (postgres/, the default), or a graph adapter that config loads by mode (MUNIM_GRAPH). core-api names no adapter: it
// holds only this port. Every call carries the caller core verified (tenant and outlet scope from a run or member token, never
// from a body or a model). Rows are ids, kinds, names, codes, booleans, hop counts and cell addresses: never a number to show.
// Error channel: a backend that cannot answer throws GraphUnavailable with a fixed label; core turns it into
// `graph_unavailable` (503) and logs the label only (no driver or server text, no parameter value).

/** What a backend runs a read on: the `pg` subset core's transactions hand out. */
export interface GraphQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}
export type GraphRow = Record<string, unknown>;

/** Who is reading, as core verified it. */
export interface GraphCaller {
  tenantId: string;
  /** ["*"] for the whole tenant, else the outlet ids in scope. */
  scope: readonly string[];
  /** The caller's own munim_svc transaction under its tenant and outlet scope (the Postgres templates read here). */
  tx<T>(fn: (q: GraphQueryable) => Promise<T>): Promise<T>;
  /** A munim_svc transaction over the whole tenant (outlet scope '*'), with today's date in the tenant's home zone (core's tz
   *  module): what a backend that rebuilds from the books reads them with. The scope of the answer still comes from `scope`. */
  books<T>(fn: (q: GraphQueryable, asOf: string) => Promise<T>): Promise<T>;
}

/** The agent's graph tools (intel's port.TEMPLATES); arguments are checked by core before a backend sees them. */
export const GRAPH_TEMPLATE_NAMES = ["price_shock_path", "dish_margin_drivers", "supplier_dependency", "claim_support", "neighbourhood"] as const;
export type GraphTemplate = (typeof GRAPH_TEMPLATE_NAMES)[number];
/** The reads behind /v1/graph/* (design §4.2–4.6, plus the two node lookups). */
export type GraphReadName =
  | "ingredient" | "supplier" | "ingredient_reach" | "ingredient_sources" | "supplier_reach" | "sole_sources" | "findings_about" | "drafts_about";

export interface GraphBackend {
  /** "postgres", or the MUNIM_GRAPH mode of the adapter. */
  readonly mode: string;
  /** One agent template with checked arguments, in the caller's tenant and scope; null = this backend does not serve it. */
  template(name: GraphTemplate, args: Readonly<Record<string, string | number>>, caller: GraphCaller): Promise<GraphRow[] | null>;
  /** A rebuild-from-books backend: brings the caller's tenant graph up to date with the books (a no-op when they have not
   *  changed) and says when it was built. Called before every read of the routes and by the worker's tick. */
  fresh?(caller: GraphCaller): Promise<{ projected_at: string; wrote: boolean }>;
  /** One of the route reads, after `fresh`; the outlet scope is the caller's. Present only on a backend that serves
   *  /v1/graph/*: without it those routes are 404, as if they did not exist. */
  read?(name: GraphReadName, params: Readonly<Record<string, unknown>>, caller: GraphCaller): Promise<GraphRow[]>;
  /** Deletes what interrupted rebuilds left behind (older than an hour); returns how many. */
  cleanup?(now: Date): Promise<number>;
  close?(): Promise<void>;
}

/** The backend cannot answer. `label` is fixed text for the log; nothing else rides on it. */
export class GraphUnavailable extends Error {
  override name = "GraphUnavailable";
  readonly label: "unreachable" | "timeout" | "error" | "short_write";
  constructor(label: GraphUnavailable["label"]) {
    super(`graph ${label}`);
    this.label = label;
  }
}
export const isGraphUnavailable = (e: unknown): e is GraphUnavailable => (e as { name?: unknown } | null)?.name === "GraphUnavailable";
