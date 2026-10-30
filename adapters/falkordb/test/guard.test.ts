// The adapter's guards (design §10 row 6), on a real FalkorDB test server, through the backend core-api is handed:
//   - reads are GRAPH.RO_QUERY: a write planted in a read text is refused by the engine and the graph is unchanged (D5);
//   - the graph key is the caller's verified tenant: two tenants with the same ids never see each other's graph (D2);
//   - a failure is GraphUnavailable with a fixed label: no server text, no parameter value and no URL in the error or the log;
//   - a stopped server answers at once (no queueing, no reconnect loop), and the next call after a restart connects again.
// Red-proof (test/redproof-graph.sh): reads through GRAPH.QUERY → the RO check goes red; a constant graph key → isolation goes red.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type GraphCaller, GraphUnavailable } from "../../../services/core-api/src/internal/graph/port.ts";
import { graphClient } from "../src/client.ts";
import { READ } from "../src/cypher.ts";
import { falkorGraph } from "../src/index.ts";
import { writeGraph } from "../src/project.ts";
import { currentGraph, stagingKey, swapIn } from "../src/swap.ts";
import { startTestFalkor, type TestFalkor } from "./harness.ts";
import { ID, world } from "./world.ts";

const A = randomUUID();
const B = randomUUID();
const SECRET_PARAM = "pl4nted-param-SENSITIVE-7f3e";
let server: TestFalkor;
const logs: string[] = [];
let backend: ReturnType<typeof falkorGraph>;

/** A caller whose books are never read here (no rebuild: the graphs are written directly). */
const caller = (tenantId: string, scope: readonly string[] = ["*"]): GraphCaller => ({
  tenantId, scope,
  tx: () => Promise.reject(new Error("no books in this test")),
  books: () => Promise.reject(new Error("no books in this test")),
});
const nodeCount = (tenantId: string) =>
  graphClient(server.url).use(async (c) => (await c.ro((await currentGraph(c, tenantId))!, "MATCH (n) RETURN count(n) AS c"))[0]!.c as number);

beforeAll(async () => {
  server = await startTestFalkor();
  backend = falkorGraph({ url: server.url, log: (l) => logs.push(l) });
  const writer = graphClient(server.url);
  await writer.use(async (c) => {
    for (const [t, doc] of [[A, world()], [B, world(" (B)")]] as const) {
      const key = stagingKey(t);
      await writeGraph(c, key, doc, { source_sha256: "test", projected_at: "2026-10-16T04:30:00.000Z" });
      await swapIn(c, t, key);
    }
  });
  await writer.close();
});
afterAll(async () => {
  await backend?.close?.();
  await server?.stop();
});

describe("reads are read-only (D5)", () => {
  it("a CREATE planted in a read text is refused by the engine, and the graph keeps its nodes", async () => {
    const before = await nodeCount(A);
    expect(before).toBeGreaterThan(40);
    const planted = READ.ingredient!.replace(/RETURN .*/, "CREATE (:item {id: 'planted'})");
    expect(planted).toMatch(/^MATCH .* CREATE /);
    const client = graphClient(server.url);
    await expect(client.use(async (c) => c.ro((await currentGraph(c, A))!, planted, { ingredient_id: ID.butter }))).rejects.toThrow(GraphUnavailable);
    await client.close();
    expect(await nodeCount(A)).toBe(before);
  });
});

describe("one graph per tenant (D2)", () => {
  it("tenant A's reads never carry tenant B's names, though every id is the same; B's carry B's", async () => {
    const a = await backend.read!("ingredient_reach", { ingredient_id: ID.butter }, caller(A));
    const b = await backend.read!("ingredient_reach", { ingredient_id: ID.butter }, caller(B));
    expect([a.length, b.length]).toEqual([14, 14]);
    expect(a.some((r) => String(r.item_name).endsWith("(B)"))).toBe(false);
    expect(b.every((r) => String(r.item_name).endsWith("(B)"))).toBe(true);
  });
  it("a tenant with no graph reads nothing; a tenant id that is not a uuid never reaches a key", async () => {
    expect(await backend.read!("ingredient_reach", { ingredient_id: ID.butter }, caller(randomUUID()))).toEqual([]);
    await expect(backend.read!("ingredient_reach", { ingredient_id: ID.butter }, caller("*"))).rejects.toThrow(GraphUnavailable);
  });
  it("the caller's outlet scope wins over an `outlets` parameter", async () => {
    const rows = await backend.read!("ingredient_reach", { ingredient_id: ID.butter, outlets: null }, caller(A, [ID.gmt]));
    expect([rows.length, rows.every((r) => r.outlet_id === ID.gmt)]).toEqual([7, true]);
  });
});

describe("errors carry a label only", () => {
  it("a server error quoting a parameter becomes GraphUnavailable('error'); neither it nor the log holds the value or the URL", async () => {
    const client = graphClient(server.url, (l) => logs.push(l));
    const err = await client.use(async (c) => c.ro(`munim:${A}`, "MATCH (n:item {id: $id}) RETURN n.name, $id +", { id: SECRET_PARAM })).catch((e: unknown) => e);
    await client.close();
    expect(err).toBeInstanceOf(GraphUnavailable);
    expect([(err as GraphUnavailable).label, (err as Error).message]).toEqual(["error", "graph error"]);
    const text = `${(err as Error).message} ${(err as Error).stack ?? ""} ${logs.join("\n")}`;
    expect(text).not.toContain(SECRET_PARAM);
    expect(text).not.toContain(String(server.port));
    expect(logs.some((l) => /^graph: error /.test(l))).toBe(true);
  });

  it("a stopped server answers 'unreachable' at once; after a restart on the same port the next call connects again", async () => {
    const own = await startTestFalkor();
    const b = falkorGraph({ url: own.url, log: (l) => logs.push(l) });
    expect(await b.read!("ingredient_reach", { ingredient_id: ID.butter }, caller(A))).toEqual([]);
    await own.stop();
    const t0 = performance.now();
    const err = await b.read!("ingredient_reach", { ingredient_id: ID.butter }, caller(A)).catch((e: unknown) => e);
    const ms = performance.now() - t0;
    expect([err instanceof GraphUnavailable, (err as GraphUnavailable).label]).toEqual([true, "unreachable"]);
    expect(ms).toBeLessThan(2_500);
    const again = await startTestFalkor({ port: own.port });
    expect(await b.read!("ingredient_reach", { ingredient_id: ID.butter }, caller(A))).toEqual([]);
    await b.close?.();
    await again.stop();
  });

  it("a books error is reported as itself, not as the graph being down; so is a bug inside a graph call", async () => {
    const booksFail: GraphCaller = { ...caller(A), books: () => Promise.reject(Object.assign(new Error("permission denied for table x"), { code: "42501" })) };
    const err = await backend.fresh!(booksFail).catch((e: unknown) => e);
    expect([err instanceof GraphUnavailable, (err as { code?: string }).code]).toEqual([false, "42501"]);
    const bug = await graphClient(server.url).use(async () => {
      throw new TypeError("a bug");
    }).catch((e: unknown) => e);
    expect([bug instanceof TypeError, bug instanceof GraphUnavailable]).toEqual([true, false]);
  });

  it("a server that was never up: unreachable within the 2 s connect timeout", async () => {
    // Port 1: nothing listens there (a port in the test range could be another file's server).
    const b = falkorGraph({ url: "redis://127.0.0.1:1", log: () => {} });
    const t0 = performance.now();
    await expect(b.read!("sole_sources", {}, caller(A))).rejects.toThrow(GraphUnavailable);
    expect(performance.now() - t0).toBeLessThan(2_500);
    await b.close?.();
  });
});
