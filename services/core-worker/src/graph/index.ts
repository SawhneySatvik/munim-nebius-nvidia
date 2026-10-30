// The graph rebuild job (R68; design §3.2 "Triggers"). With a backend that rebuilds from the books (MUNIM_GRAPH names a graph
// adapter), each pass brings every active tenant's graph up to date (a no-op when its books have not changed) and deletes what
// rebuilds that died half-way left behind. It runs as munim_svc: it reads the books and writes only the graph, never a book. With the
// Postgres backend there is nothing to rebuild and the job is not registered. Logs ids, counts and labels only.
import type pg from "pg";
import { graphCaller } from "../../../core-api/src/internal/graph/index.ts";
import type { GraphBackend } from "../../../core-api/src/internal/graph/port.ts";
import type { Job } from "../cron.ts";
import { activeTenants } from "../fanout.ts";
import { errorLabel, type Log } from "../ports.ts";

/** core.tick_claim takes job names of [a-z0-9-] only (0031), so the design's `graph.project` is spelt with a hyphen. */
export const GRAPH_JOB = "graph-project";

/** The job, or null when the backend has nothing to rebuild. */
export function graphProjectJob(deps: { pool: pg.Pool; graph: GraphBackend; log: Log; everyMinutes?: number }): Job | null {
  const { graph } = deps;
  if (!graph.fresh || !graph.cleanup) return null;
  return {
    name: GRAPH_JOB,
    everyMinutes: deps.everyMinutes ?? 15,
    async run(slot, signal) {
      const tally = { rebuilt: 0, unchanged: 0, failed: 0, stale_removed: 0 };
      for (const tenant of await activeTenants(deps.pool)) {
        if (signal.aborted) break;
        try {
          tally[(await graph.fresh!(graphCaller(deps.pool, tenant, ["*"]))).wrote ? "rebuilt" : "unchanged"]++;
        } catch (e) {
          tally.failed++;
          deps.log("graph.project_failed", { tenant_id: tenant, error: errorLabel(e) });
        }
      }
      try {
        tally.stale_removed = await graph.cleanup!(slot.at);
      } catch (e) {
        deps.log("graph.cleanup_failed", { error: errorLabel(e) });
      }
      deps.log("graph.project", tally);
    },
  };
}
