// The FalkorDB graph backend (R68, design §3–§4): core-api's GraphBackend port, served from one FalkorDB graph per tenant that core
// rebuilds from the books before every read. Reads are GRAPH.RO_QUERY with static text and parameters only (D5); the tenant is the
// one core verified (the graph key) and the outlet scope is the caller's (`$outlets`), never an argument. No Postgres fallback
// (D6): when FalkorDB does not answer, every call throws GraphUnavailable and core answers 503 graph_unavailable.
import type { GraphBackend, GraphCaller, GraphReadName, GraphRow } from "../../../services/core-api/src/internal/graph/port.ts";
import { graphClient } from "./client.ts";
import { READ } from "./cypher.ts";
import { ensureFresh, readBooks } from "./project.ts";
import { cleanupStale, currentGraph } from "./swap.ts";

export const MODE = "falkordb";
/** The agent templates this backend serves (claim_support is not: claims stay out of the graph, design §2.2). */
const TEMPLATES = new Set(["price_shock_path", "dish_margin_drivers", "supplier_dependency", "neighbourhood"]);
const READS: ReadonlySet<GraphReadName> = new Set(["ingredient", "supplier", "ingredient_reach", "ingredient_sources", "supplier_reach", "sole_sources", "findings_about", "drafts_about"]);

/** `$outlets`: null for a whole-tenant scope, else the scope's outlet ids. */
const outlets = (caller: GraphCaller) => (caller.scope[0] === "*" ? null : [...caller.scope]);

export function falkorGraph(o: { url: string; log?: (line: string) => void }): GraphBackend {
  const client = graphClient(o.url, o.log);
  const run = (name: string, params: Readonly<Record<string, unknown>>, caller: GraphCaller): Promise<GraphRow[]> =>
    client.use(async (c) => {
      const key = await currentGraph(c, caller.tenantId);
      return key ? c.ro(key, READ[name]!, { ...params, outlets: outlets(caller) }) : [];
    });
  // The books first, outside the graph connection: a Postgres error is not a graph outage.
  const fresh = async (caller: GraphCaller) => {
    const books = await readBooks(caller);
    return client.use((c) => ensureFresh(c, caller, books));
  };
  return {
    mode: MODE,
    async template(name, args, caller) {
      if (!TEMPLATES.has(name)) return null;
      await fresh(caller);
      return run(name, args, caller);
    },
    fresh,
    async read(name, params, caller) {
      if (!READS.has(name)) throw new Error(`graph: unknown read ${name}`);
      return run(name, params, caller);
    },
    cleanup: (now) => client.use((c) => cleanupStale(c, now)),
    close: () => client.close(),
  };
}
