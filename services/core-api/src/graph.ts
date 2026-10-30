// The graph backend every composition root takes (R68): one choice, by MUNIM_GRAPH (packages/config), so core-api's routes, the tick
// and core-worker's graph job read the same graph. "postgres" is the in-tree templates (internal/graph/postgres); any other accepted
// value is a graph adapter's mode, built by its mapping. Unset: this build's own backend, Postgres where it has both. A mode this
// build lacks refuses by name before anything starts.
import { type Config, ConfigError, type Logger } from "@munim/config";
import { postgresGraph } from "./internal/graph/index.ts";
import type { GraphBackend } from "./internal/graph/port.ts";

export async function graphFromConfig(config: Pick<Config, "graph" | "graphModes" | "graphAdapter">, log: Logger): Promise<GraphBackend> {
  const pg = await postgresGraph();
  const mode = config.graph ?? (pg ? "postgres" : config.graphModes[0]);
  if (mode === undefined) throw new ConfigError("no graph backend in this build");
  if (mode === "postgres") {
    if (!pg) throw new ConfigError("no graph backend postgres in this build");
    return pg;
  }
  return config.graphAdapter(mode, (line) => log(line)) as GraphBackend;
}
