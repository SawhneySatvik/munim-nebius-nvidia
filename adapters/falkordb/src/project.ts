// The projector (design §3.2, D4): the graph is rebuilt from the books, never patched. ensureFresh reads the whole tenant in one
// statement with its sha256; when the sha equals the live graph's `projection` record nothing is written (an unchanged re-run is a
// no-op); otherwise a fresh staging graph is built, every write's created count is checked against the rows sent (a shortfall
// means an edge lost an endpoint: the staging graph is discarded and the live one stays), and the staging graph is swapped in.
// Core is the only writer (D1): the books are read through the caller's munim_svc transaction, and only the graph is written.
import { readFileSync } from "node:fs";
import { type GraphCaller, GraphUnavailable } from "../../../services/core-api/src/internal/graph/port.ts";
import type { GraphConn } from "./client.ts";
import { type GraphDoc, INDEXES, PROJECTION_NODE, READ, WRITES } from "./cypher.ts";
import { currentGraph, discard, stagingKey, swapIn } from "./swap.ts";

/** The projection model version, stored on the graph's `projection` node. */
export const MODEL = 1;

/** projection.sql with its two named parameters bound by position (comments dropped first, so only live text binds). */
export function bindProjection(sql: string): { text: string; names: Array<"tenant_id" | "as_of"> } {
  const names: Array<"tenant_id" | "as_of"> = [];
  const text = sql.replace(/--[^\n]*/g, "").replace(/(?<!:):(tenant_id|as_of)\b/g, (_m, n: "tenant_id" | "as_of") => {
    if (!names.includes(n)) names.push(n);
    return `$${names.indexOf(n) + 1}`;
  });
  return { text, names };
}
export const PROJECTION_SQL = readFileSync(new URL("../projection.sql", import.meta.url), "utf8");
const BOUND = bindProjection(PROJECTION_SQL);

/** Reads the tenant's whole projection from the books: the document and its sha256 (computed in SQL over the same bytes). */
export async function readBooks(caller: GraphCaller, bound = BOUND): Promise<{ doc: GraphDoc; sha256: string }> {
  return caller.books(async (q, asOf) => {
    const values = { tenant_id: caller.tenantId, as_of: asOf };
    const row = (await q.query(bound.text, bound.names.map((n) => values[n]))).rows[0] as { doc: GraphDoc; sha256: string };
    return row;
  });
}

const created = (stats: string[], kind: "node" | "edge") => {
  const line = stats.find((s) => s.startsWith(kind === "node" ? "Nodes created" : "Relationships created"));
  return line ? Number(/:\s*(\d+)/.exec(line)?.[1] ?? NaN) : 0;
};

/** Writes `doc` into the empty graph `key`, then its projection record. A short write throws GraphUnavailable("short_write"). */
export async function writeGraph(c: GraphConn, key: string, doc: GraphDoc, record: { source_sha256: string; projected_at: string }): Promise<void> {
  for (const stmt of INDEXES) await c.write(key, stmt);
  for (const w of WRITES) {
    const rows = doc[w.name] ?? [];
    if (rows.length === 0) continue;
    if (created(await c.write(key, w.text, { rows }), w.kind) !== rows.length) throw new GraphUnavailable("short_write");
  }
  await c.write(key, PROJECTION_NODE, { source_sha256: record.source_sha256, as_of: doc.as_of, projected_at: record.projected_at, model: MODEL });
}

/** The live graph's projection record, or null when the tenant has none. */
export async function projectionState(c: GraphConn, tenantId: string): Promise<{ source_sha256: string; projected_at: string } | null> {
  const key = await currentGraph(c, tenantId);
  if (!key) return null;
  const row = (await c.ro(key, READ.projection_state!))[0];
  return row ? { source_sha256: String(row.source_sha256), projected_at: String(row.projected_at) } : null;
}

/** Brings the tenant's graph up to date with books already read (readBooks: read them before taking the graph connection, so a
 *  Postgres failure is reported as itself, never as the graph being down). */
export async function ensureFresh(c: GraphConn, caller: Pick<GraphCaller, "tenantId">, books: { doc: GraphDoc; sha256: string },
  now: () => Date = () => new Date()): Promise<{ projected_at: string; wrote: boolean }> {
  const { doc, sha256 } = books;
  const state = await projectionState(c, caller.tenantId);
  if (state?.source_sha256 === sha256) return { projected_at: state.projected_at, wrote: false };
  const at = now();
  const staging = stagingKey(caller.tenantId, at.getTime());
  const projected_at = at.toISOString();
  try {
    await writeGraph(c, staging, doc, { source_sha256: sha256, projected_at });
  } catch (e) {
    await discard(c, staging);
    throw e;
  }
  await swapIn(c, caller.tenantId, staging);
  return { projected_at, wrote: true };
}
