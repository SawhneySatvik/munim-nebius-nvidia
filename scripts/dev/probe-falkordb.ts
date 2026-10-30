// `node scripts/dev/probe-falkordb.ts`: checks that a FalkorDB server (the founder's FalkorDB Cloud instance) allows what the graph
// rebuild depends on (adapters/falkordb/src/swap.ts): RENAME over a key, SCAN with MATCH, GRAPH.RO_QUERY refusing a write, GRAPH.LIST,
// GRAPH.DELETE, and how many graphs it already holds. Read-only apart from one scratch graph (`munim:probe:<uuid>`, built under a
// staging-shaped key and renamed, exactly as a rebuild swaps) that it deletes before it exits, also on failure.
// The URL comes from MUNIM_FALKORDB_URL through packages/config (the env file or the process environment); it is never printed, and
// every error line passes through config's redaction. Exit 0: every check passed. Exit 1: a check failed, named in the output; a
// refused RENAME or SCAN means swap.ts needs its pointer-key variant (one file).
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createLogger, loadRepoConfig } from "../../packages/config/src/index.ts";
import { falkorUrl } from "../../adapters/falkordb/env.ts";

const root = resolve(import.meta.dirname, "../..");
const config = loadRepoConfig(root);
const log = createLogger(config, (l) => console.log(l));
// The client is the adapter's own dependency (adapters/falkordb/package.json).
const { FalkorDB } = createRequire(new URL("../../adapters/falkordb/package.json", import.meta.url))("falkordb") as typeof import("falkordb");

let url: string;
try {
  url = falkorUrl(config); // MUNIM_FALKORDB_URL, or FalkorDB Cloud's FALKOR_DB_* parts
} catch (e) {
  console.error(`probe-falkordb: FAIL — ${config.redact((e as Error).message)} (see .env.example)`);
  process.exit(1);
}
/** A server's error reply is shown (it names the refused command); any other error by class and code only, since a socket error
 *  quotes the host and port. */
const describe = (e: unknown): string => {
  for (let p = e ? Object.getPrototypeOf(e) : null; p; p = Object.getPrototypeOf(p)) if (p.constructor?.name === "ErrorReply") return `server: ${(e as Error).message}`;
  const code = (e as { code?: unknown } | null)?.code;
  return `${(e as Error | null)?.constructor?.name ?? "Error"}${typeof code === "string" ? ` ${code}` : ""}`;
};
const failed: string[] = [];
const check = async (name: string, fn: () => Promise<string>) => {
  try {
    log(`ok    ${name}: ${await fn()}`);
  } catch (e) {
    failed.push(name);
    log(`FAIL  ${name}: ${describe(e)}`);
  }
};

const db = await FalkorDB.connect({ url, socket: { connectTimeout: 5_000, reconnectStrategy: false }, disableOfflineQueue: true } as never).catch((e: unknown) => {
  log(`FAIL  connect: ${describe(e)}`);
  process.exit(1);
});
db.on("error", (e: unknown) => log(`connection error: ${(e as Error).constructor?.name ?? "Error"}`));
const raw = await db.connection;
const id = randomUUID();
const staging = `munim:probe:next:${Date.now()}:${id}`;
const live = `munim:probe:${id}`;

try {
  await check("server", async () => {
    const info = String(await raw.sendCommand(["INFO", "server"]));
    const modules = JSON.stringify(await raw.sendCommand(["MODULE", "LIST"]).catch(() => "MODULE LIST refused"));
    // Cluster mode would make RENAME across two keys a CROSSSLOT error and SCAN cover one node: swap.ts would need hash-tagged keys.
    return `redis ${/redis_version:(\S+)/.exec(info)?.[1] ?? "?"}, mode ${/redis_mode:(\S+)/.exec(info)?.[1] ?? "?"}; modules ${modules.slice(0, 200)}`;
  });
  await check("GRAPH.LIST (graphs already held)", async () => `${(await db.list()).length} graph(s)`);
  await check("memory", async () => {
    const info = String(await raw.sendCommand(["INFO", "memory"]));
    return ["used_memory_human", "maxmemory_human"].map((k) => `${k}=${new RegExp(`${k}:(\\S+)`).exec(info)?.[1] ?? "?"}`).join(" ");
  });
  await check("GRAPH.QUERY (a scratch live graph, and a scratch staging graph)", async () => {
    await db.selectGraph(live).query("CREATE (:old {id: $id})", { params: { id } });
    const r = await db.selectGraph(staging).query("CREATE (:probe {id: $id})", { params: { id } });
    return (r.metadata ?? []).filter((m) => /created/.test(m)).join(", ");
  });
  await check("RENAME over the live graph (the swap)", async () => {
    await raw.sendCommand(["RENAME", staging, live]);
    const g = db.selectGraph(live);
    const fresh = (await g.roQuery<{ c: number }>("MATCH (p:probe) RETURN count(p) AS c")).data?.[0]?.c;
    const old = (await g.roQuery<{ c: number }>("MATCH (p:old) RETURN count(p) AS c")).data?.[0]?.c;
    if (fresh !== 1 || old !== 0) throw new Error(`after the rename the live key holds ${fresh} staging node(s) and ${old} old one(s), not 1 and 0`);
    if (Number(await raw.sendCommand(["EXISTS", staging])) !== 0) throw new Error("the staging key is still there");
    return "the staging graph replaced the live one in one step";
  });
  await check("SCAN MATCH (the clean-up)", async () => {
    const seen: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = (await raw.sendCommand(["SCAN", cursor, "MATCH", "munim:probe:*", "COUNT", "200"])) as [string, string[]];
      cursor = String(next);
      seen.push(...keys);
    } while (cursor !== "0");
    if (!seen.includes(live)) throw new Error("SCAN did not return the scratch key");
    return `found the scratch key among ${seen.length} munim:probe:* key(s)`;
  });
  await check("GRAPH.RO_QUERY refuses a write", async () => {
    const refused = await db.selectGraph(live).roQuery("CREATE (:probe {id: 'x'})").then(() => false, () => true);
    if (!refused) throw new Error("a write ran through GRAPH.RO_QUERY");
    return "refused";
  });
} finally {
  await check("GRAPH.DELETE (the scratch graph)", async () => {
    for (const k of [staging, live]) await raw.sendCommand(["GRAPH.DELETE", k]).catch(() => {});
    const left = Number(await raw.sendCommand(["EXISTS", staging, live]));
    if (left !== 0) throw new Error(`${left} scratch key(s) left`);
    return "nothing left";
  });
  await db.close().catch(() => {});
}
if (failed.length) {
  console.error(`probe-falkordb: FAIL — ${failed.join("; ")}`);
  process.exit(1);
}
console.log("probe-falkordb: ok — RENAME, SCAN, RO_QUERY and GRAPH.DELETE all work here");
