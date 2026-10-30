// The FalkorDB mapping (R68, D9): packages/config loads every `adapters/<name>/env.ts` that exports `graphEnv`, by a computed path
// as it loads the dev mapping, so core-api and config name no graph database and a build without this folder has none.
//   MUNIM_GRAPH=falkordb    this backend (src/index.ts)
//   MUNIM_FALKORDB_URL      redis:// or rediss:// (a secret: it may carry a password; config redacts it from every log line)
//   or, as FalkorDB Cloud's connection panel gives them: FALKOR_DB_HOST, FALKOR_DB_PORT, FALKOR_DB_NAME (the user name) and
//   FALKOR_DB_PASSWORD; FALKOR_DB_TLS=1 for a TLS instance. The URL wins when both are set.
// Imports nothing at load: config awaits this module while it loads (so no value import from it), and a process that never selects
// this backend never loads the client. The backend itself is imported on its first call.
import type { Config, GraphEnv } from "../../packages/config/src/index.ts";
import type { GraphBackend } from "../../services/core-api/src/internal/graph/port.ts";

export const graphEnv: GraphEnv = {
  mode: "falkordb",
  names: ["MUNIM_FALKORDB_URL", "FALKOR_DB_HOST", "FALKOR_DB_PORT", "FALKOR_DB_NAME", "FALKOR_DB_PASSWORD", "FALKOR_DB_TLS"],
  secretNames: ["MUNIM_FALKORDB_URL", "FALKOR_DB_PASSWORD"],
  backend(cfg: Config, log: (line: string) => void): GraphBackend {
    const url = falkorUrl(cfg);
    if (!/^rediss?:\/\/[^/\s]+/.test(url)) throw new Error("MUNIM_FALKORDB_URL must be a redis:// or rediss:// URL");
    let real: Promise<GraphBackend> | undefined;
    const get = () => (real ??= import("./src/index.ts").then((m) => m.falkorGraph({ url, log })));
    return {
      mode: "falkordb",
      template: async (name, args, caller) => (await get()).template(name, args, caller),
      fresh: async (caller) => (await get()).fresh!(caller),
      read: async (name, params, caller) => (await get()).read!(name, params, caller),
      cleanup: async (now) => (await get()).cleanup!(now),
      close: async () => {
        if (real) await (await real).close?.();
      },
    };
  },
};

/** MUNIM_FALKORDB_URL, else the URL built from FalkorDB Cloud's parts. Never logged (the password is a registered secret). */
export function falkorUrl(cfg: Pick<Config, "get" | "require">): string {
  const url = cfg.get("MUNIM_FALKORDB_URL");
  if (url) return url;
  const host = cfg.get("FALKOR_DB_HOST");
  if (!host) return cfg.require("MUNIM_FALKORDB_URL"); // names the missing setting
  const port = cfg.get("FALKOR_DB_PORT") || "6379";
  if (!/^\d{1,5}$/.test(port)) throw new Error("FALKOR_DB_PORT must be a port number");
  const user = cfg.get("FALKOR_DB_NAME") ?? "";
  const pass = cfg.get("FALKOR_DB_PASSWORD") ?? "";
  const auth = user || pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : "";
  const scheme = cfg.get("FALKOR_DB_TLS") === "1" ? "rediss" : "redis";
  return `${scheme}://${auth}${host}:${port}`;
}
