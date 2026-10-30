// Where a tenant's graph lives and how a rebuilt one replaces it (design §3.2 steps 2 and 4), plus the clean-up of rebuilds that
// died half-way. Everything about key layout is in this one file on purpose: RENAME and SCAN are UNVERIFIED on FalkorDB Cloud
// (scripts/dev/probe-falkordb.ts checks them), and a server without them needs only this file changed, e.g. a pointer key
// `munim:<tenant>:live` naming the current graph (currentGraph reads it, swapIn sets it and deletes the graph it named).
// One graph per tenant (D2): the key is built from the tenant id core verified, never from a body, a parameter or a model.
import { randomUUID } from "node:crypto";
import { GraphUnavailable } from "../../../services/core-api/src/internal/graph/port.ts";
import type { GraphConn } from "./client.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const liveKey = (tenantId: string) => {
  // A key that is not exactly one uuid could reach another tenant's graph or a staging key.
  if (!UUID.test(tenantId)) throw new GraphUnavailable("error");
  return `munim:${tenantId}`;
};
/** Staging keys older than this are left by a rebuild that died before its swap. */
export const STALE_MS = 60 * 60 * 1000;

/** The key a read of this tenant's graph goes to, or null when the tenant has no graph yet. */
export async function currentGraph(c: GraphConn, tenantId: string): Promise<string | null> {
  const key = liveKey(tenantId);
  return Number(await c.send(["EXISTS", key])) === 1 ? key : null;
}

/** A fresh key per rebuild, so two concurrent builders never share one: `munim:<tenant>:next:<epoch ms>:<uuid>`. */
export function stagingKey(tenantId: string, now = Date.now()): string {
  return `${liveKey(tenantId)}:next:${now}:${randomUUID()}`;
}

/** Replaces the tenant's live graph with a fully built staging graph in one step (RENAME frees the old graph). */
export async function swapIn(c: GraphConn, tenantId: string, staging: string): Promise<void> {
  await c.send(["RENAME", staging, liveKey(tenantId)]);
}

/** Deletes a staging graph that failed its checks. */
export async function discard(c: GraphConn, staging: string): Promise<void> {
  await c.send(["GRAPH.DELETE", staging]).catch(() => {});
}

/** Deletes every staging key older than STALE_MS (any tenant's); returns how many were deleted. */
export async function cleanupStale(c: GraphConn, now: Date): Promise<number> {
  let cursor = "0";
  let deleted = 0;
  do {
    const [next, keys] = (await c.send(["SCAN", cursor, "MATCH", "munim:*:next:*", "COUNT", "200"])) as [string, string[]];
    cursor = String(next);
    for (const key of keys) {
      const ms = Number(key.split(":")[3]);
      if (Number.isFinite(ms) && now.getTime() - ms > STALE_MS) {
        await c.send(["GRAPH.DELETE", key]);
        deleted++;
      }
    }
  } while (cursor !== "0");
  return deleted;
}
