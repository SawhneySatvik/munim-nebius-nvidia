// The projector (design §3, §10 row 5) on embedded Postgres and a FalkorDB test server, against two Cobnut tenants seeded through the
// public API (core commands; two seeds, so every id differs). Expected values: the hand counts of tools/worldgen/src/worlds/cobnut.ts
// (2 outlets, 5 simulated suppliers, 9 stock records, 14 menu items of which 13 have a recipe and one is a shop SKU stocked as the
// tin, a price for every item at both outlets, price lists for butter and hazelnuts plus last week's butter PO), and counts taken
// straight from the books in SQL here. One open finding and one pending draft are added as fixture rows (the intel stub writes none),
// so the finding and draft legs are exercised too.
// Red-proof (test/redproof-graph.sh): a clock in the checksum → "re-run writes nothing" goes red; no created-count check → "a short
// write keeps the old graph" goes red; every `tenant_id = :tenant_id` stripped → the predicate-only test (superuser, no RLS) goes red
// while the RLS-only test (munim_svc, predicates stripped by the test itself) stays green.
import { randomUUID } from "node:crypto";
import type { TestDb } from "@munim/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { graphCaller } from "../../../services/core-api/src/internal/graph/index.ts";
import { type GraphCaller, GraphUnavailable } from "../../../services/core-api/src/internal/graph/port.ts";
import { graphClient, type GraphConn } from "../src/client.ts";
import { EDGE_TYPES, type GraphDoc, NODE_LABELS, READ } from "../src/cypher.ts";
import { bindProjection, ensureFresh, PROJECTION_SQL, projectionState, readBooks, writeGraph } from "../src/project.ts";
import { cleanupStale, currentGraph, STALE_MS } from "../src/swap.ts";
import { openDb } from "./db.ts";
import { startTestFalkor, type TestFalkor } from "./harness.ts";
import { seedCobnut, type Stack, startStack } from "./stack.ts";
import { world } from "./world.ts";

let db: TestDb;
let stack: Stack;
let server: TestFalkor;
let client: ReturnType<typeof graphClient>;
let svc: ReturnType<TestDb["pool"]>;
let A: Awaited<ReturnType<typeof seedCobnut>>;
let B: Awaited<ReturnType<typeof seedCobnut>>;
const idOf = async (tenant: string, table: string, name: string) =>
  (await db.admin(`SELECT id FROM ${table} WHERE tenant_id = $1 AND name = $2`, [tenant, name])).rows[0]!.id as string;
const use = <T>(fn: (c: GraphConn) => Promise<T>) => client.use(fn);
/** The books, then the graph (as the backend's `fresh` does). */
const freshen = async (caller: GraphCaller) => {
  const books = await readBooks(caller);
  return use((c) => ensureFresh(c, caller, books));
};
const counts = (tenant: string) => use(async (c) => {
  const key = (await currentGraph(c, tenant))!;
  const out: Record<string, number> = {};
  for (const l of NODE_LABELS) out[l] = (await c.ro(key, `MATCH (n:${l}) RETURN count(n) AS c`))[0]!.c as number;
  for (const t of EDGE_TYPES) out[t] = (await c.ro(key, `MATCH ()-[r:${t}]->() RETURN count(r) AS c`))[0]!.c as number;
  return out;
});
const fixture = { finding: randomUUID(), draft: randomUUID(), run: randomUUID(), snap: randomUUID() };

beforeAll(async () => {
  db = await openDb();
  stack = await startStack(db);
  A = await seedCobnut(stack, "graph-projection-a");
  B = await seedCobnut(stack, "graph-projection-b");
  server = await startTestFalkor();
  client = graphClient(server.url);
  svc = db.pool("munim_svc", 4);
  // Fixture rows (the superuser, triggers off, as core-api's own graph gate plants them): one open waste finding at Hazratganj whose
  // impact row names butter and the outlet and whose envelope cites Riverbank Dairy, and a pending PO draft answering it.
  const [butter, dairy, hzg] = [await idOf(A.tenantId, "core.ingredient", "Butter (synthetic)"), await idOf(A.tenantId, "core.supplier", "Riverbank Dairy (simulated)"),
    await idOf(A.tenantId, "core.outlet", "Cobnut Hazratganj")];
  const tpl = (await db.admin(`SELECT id, version FROM evidence.snapshot_template ORDER BY id, version LIMIT 1`)).rows[0]!;
  const rows = JSON.stringify([{ ingredient_id: butter, outlet_id: hzg, excess_minor: 336000 }]);
  await db.admin(`SET session_replication_role = replica;
    INSERT INTO intel.run (tenant_id, id, trigger, actor, outlet_scope, expires_at) VALUES ('${A.tenantId}', '${fixture.run}', 'watch_sweep', 'watcher:inventory', '{*}', now() + interval '1 hour');
    INSERT INTO evidence.snapshot (tenant_id, id, template_id, template_version, run_id, outlet_scope, rows, row_count, sha256)
      VALUES ('${A.tenantId}', '${fixture.snap}', '${tpl.id}', ${tpl.version}, '${fixture.run}', '{*}', '${rows}', 1, '${"0".repeat(64)}');
    INSERT INTO intel.finding (tenant_id, id, run_id, outlet_ids, pack, type, severity, impact_snapshot_id, impact_row, impact_column, confidence_bp, envelope, dedupe_key)
      VALUES ('${A.tenantId}', '${fixture.finding}', '${fixture.run}', '{${hzg}}', 'inventory_purchasing', 'inventory.waste_spike', 'medium', '${fixture.snap}', 0, 'excess_minor', 8000,
              '{"segments": [{"text": "x", "refs": ["row:core.supplier:${dairy}", "snap:${fixture.snap}"]}], "abstained": false}', 'graph-projection-test');
    INSERT INTO core.draft (tenant_id, id, outlet_ids, source, finding_id, run_id, command_type, command_payload)
      VALUES ('${A.tenantId}', '${fixture.draft}', '{${hzg}}', 'intel:inventory_purchasing', '${fixture.finding}', '${fixture.run}', 'purchasing.po.create.v1',
              '{"supplier_id": "${dairy}", "outlet_ids": ["${hzg}"], "lines": [{"ingredient_id": "${butter}"}]}');
    SET session_replication_role = origin`);
}, 600_000);

afterAll(async () => {
  await client?.close();
  await server?.stop();
  await svc?.end();
  await stack?.stop();
  await db?.stop();
});

/** Counts straight from the books (as the superuser, one tenant), written apart from projection.sql. */
async function bookCounts(tenant: string, asOf: string): Promise<Record<string, number>> {
  const n = async (sql: string) => Number((await db.admin(`SELECT count(*) AS c FROM (${sql}) x`, [tenant, asOf])).rows[0]!.c);
  const cur = `r.tenant_id = $1 AND r.valid_from <= $2::date AND (r.valid_to IS NULL OR r.valid_to > $2::date)`;
  return {
    outlet: await n(`SELECT 1 FROM core.outlet WHERE tenant_id = $1 AND $2::date IS NOT NULL`),
    supplier: await n(`SELECT 1 FROM core.supplier WHERE tenant_id = $1 AND active AND $2::date IS NOT NULL`),
    ingredient: await n(`SELECT 1 FROM core.ingredient WHERE tenant_id = $1 AND active AND $2::date IS NOT NULL`),
    item: await n(`SELECT 1 FROM core.item WHERE tenant_id = $1 AND active AND $2::date IS NOT NULL`),
    recipe: await n(`SELECT 1 FROM core.recipe_version r JOIN core.item i ON i.tenant_id = r.tenant_id AND i.id = r.item_id AND i.active WHERE ${cur}`),
    used_in: await n(`SELECT 1 FROM core.recipe_line l JOIN core.recipe_version r ON r.tenant_id = l.tenant_id AND r.id = l.recipe_version_id
                       JOIN core.item i ON i.tenant_id = r.tenant_id AND i.id = r.item_id AND i.active WHERE ${cur}`),
    makes: await n(`SELECT 1 FROM core.recipe_version r JOIN core.item i ON i.tenant_id = r.tenant_id AND i.id = r.item_id AND i.active WHERE ${cur}`),
    stocked_as: await n(`SELECT 1 FROM core.item WHERE tenant_id = $1 AND active AND kind = 'sku' AND stock_ingredient_id IS NOT NULL AND $2::date IS NOT NULL`),
    sold_at: await n(`SELECT DISTINCT p.item_id, p.outlet_id FROM core.price p JOIN core.item i ON i.tenant_id = p.tenant_id AND i.id = p.item_id AND i.active
                       WHERE p.tenant_id = $1 AND p.valid_from <= $2::date AND (p.valid_to IS NULL OR p.valid_to > $2::date)`),
    supplies: await n(`SELECT supplier_id, ingredient_id FROM core.supplier_price WHERE tenant_id = $1 AND $2::date IS NOT NULL
                       UNION SELECT po.supplier_id, l.ingredient_id FROM core.purchase_order po JOIN core.po_line l ON l.tenant_id = po.tenant_id AND l.po_id = po.id
                       WHERE po.tenant_id = $1 AND po.status <> 'cancelled'`),
    quoted: await n(`SELECT DISTINCT supplier_id, ingredient_id FROM intel.supplier_quote WHERE tenant_id = $1 AND created_at::date > $2::date - 90`),
    finding: await n(`SELECT 1 FROM intel.finding WHERE tenant_id = $1 AND status = 'open' AND $2::date IS NOT NULL`),
    draft: await n(`SELECT 1 FROM core.draft WHERE tenant_id = $1 AND status = 'proposed' AND $2::date IS NOT NULL`),
  };
}

describe("projecting a Cobnut tenant (§3.1, §3.2)", () => {
  it("node and edge counts equal the hand counts from cobnut.ts and the counts taken from the books", async () => {
    const caller = graphCaller(svc, A.tenantId, ["*"]);
    const first = await freshen(caller);
    expect(first.wrote).toBe(true);
    const got = await counts(A.tenantId);
    const asOf = await caller.books(async (_q, d) => d);
    const books = await bookCounts(A.tenantId, asOf);
    // cobnut.ts, by hand (+ this file's one finding, one draft and their edges).
    expect(got).toMatchObject({ outlet: 2, supplier: 5, ingredient: 9, item: 14, recipe: 13, makes: 13, stocked_as: 1, sold_at: 28, supplies: 2, finding: 1, draft: 1,
      about: 3, answers: 1, targets: 3 });
    for (const [k, v] of Object.entries(books)) expect([k, got[k]]).toEqual([k, v]);
    expect(books.used_in).toBeGreaterThan(30);
    // The paused dishes (cobnut.ts availability): the Pistachio Danish at both outlets, the Tres Leches at Gomti Nagar.
    const paused = await use(async (c) => c.ro(`munim:${A.tenantId}`, "MATCH (m:item)-[s:sold_at]->(o:outlet) WHERE s.available = false RETURN m.name AS m, o.name AS o ORDER BY m, o"));
    expect(paused).toEqual([{ m: "Pistachio Danish", o: "Cobnut Gomti Nagar" }, { m: "Pistachio Danish", o: "Cobnut Hazratganj" }, { m: "Rose Pistachio Tres Leches", o: "Cobnut Gomti Nagar" }]);
  });

  it("re-run with unchanged books writes nothing (same checksum, same projected_at)", async () => {
    const caller = graphCaller(svc, A.tenantId, ["*"]);
    const before = await use((c) => projectionState(c, A.tenantId));
    const again = await freshen(caller);
    expect([again.wrote, again.projected_at]).toEqual([false, before!.projected_at]);
  });

  it("a recipe change (a new croissant recipe version with milk, through the API) rebuilds: milk now reaches the croissant", async () => {
    const caller = graphCaller(svc, A.tenantId, ["*"]);
    const asOf = await caller.books(async (_q, d) => d);
    const milk = await idOf(A.tenantId, "core.ingredient", "Milk (synthetic)");
    const item = (await db.admin(`SELECT id FROM core.item WHERE tenant_id = $1 AND display_name = 'Hazelnut Croissant'`, [A.tenantId])).rows[0]!.id as string;
    const lines = (await db.admin(`SELECT l.ingredient_id, l.qty_milli, l.unit FROM core.recipe_line l JOIN core.recipe_version r ON r.tenant_id = l.tenant_id AND r.id = l.recipe_version_id
                                   WHERE r.tenant_id = $1 AND r.item_id = $2 AND r.valid_to IS NULL`, [A.tenantId, item])).rows;
    expect(lines.length).toBe(3);
    const reached = async () => (await use(async (c) => c.ro(`munim:${A.tenantId}`, READ.ingredient_reach!, { ingredient_id: milk, outlets: null }))).some((r) => r.item_id === item);
    expect(await reached()).toBe(false);
    const id = randomUUID().replace(/^(.{14})./, "$17");
    await A.api.cmd("owner", "/v1/catalogue/recipes", "catalogue.recipe.version.create.v1", `graph-test:recipe:${id}`, {
      recipe_version_id: id, item_id: item, variant_id: null, version: 2, valid_from: asOf, valid_to: null, yield_qty_milli: 1000,
      lines: [...lines.map((l) => ({ ingredient_id: l.ingredient_id, qty_milli: Number(l.qty_milli), unit: l.unit, waste_pct_bp: 200 })), { ingredient_id: milk, qty_milli: 30, unit: "l", waste_pct_bp: 200 }],
    });
    const rebuilt = await freshen(caller);
    expect(rebuilt.wrote).toBe(true);
    expect(await reached()).toBe(true);
    const recipe = await use(async (c) => c.ro(`munim:${A.tenantId}`, "MATCH (r:recipe)-[:makes]->(:item {id: $item}) RETURN r.id AS id", { item }));
    expect(recipe).toEqual([{ id }]);
  });
});

describe("a write that falls short keeps the old graph (§3.2 step 3, §3.3)", () => {
  /** A caller whose books are a given document (the projector's own checks under test, not the SQL). */
  const fakeBooks = (tenantId: string, doc: GraphDoc, sha256: string): GraphCaller => ({
    tenantId, scope: ["*"], tx: () => Promise.reject(new Error("unused")),
    books: (fn) => fn({ query: async () => ({ rows: [{ doc, sha256 }] }) }, doc.as_of),
  });

  it("an edge whose endpoint is missing: GraphUnavailable('short_write'), the live graph unchanged, no staging key left", async () => {
    const t = randomUUID();
    const good = world();
    await freshen(fakeBooks(t, good, "a".repeat(64)));
    const before = await use((c) => projectionState(c, t));
    const bad = { ...good, supplies: [...good.supplies, { src: good.supplier[0]!.id, dst: randomUUID(), ref: "core.supplier_price:x" }] };
    const err = await freshen(fakeBooks(t, bad, "b".repeat(64))).catch((e: unknown) => e);
    expect([err instanceof GraphUnavailable, (err as GraphUnavailable).label]).toEqual([true, "short_write"]);
    expect(await use((c) => projectionState(c, t))).toEqual(before);
    expect(await use((c) => c.send(["KEYS", `munim:${t}:next:*`]))).toEqual([]);
  });

  it("names with quotes, backslashes, braces, a newline and Cypher-looking text come back byte for byte", async () => {
    const t = randomUUID();
    const odd = ["it's", 'say "hi"', "back\\slash", "brace } {", "line\nbreak", "x'}) MATCH (n) DETACH DELETE n //", "₹ ⟨snap⟩ é"];
    const doc = world();
    doc.ingredient = doc.ingredient.map((g, i) => (i < odd.length ? { ...g, name: odd[i] } : g));
    await freshen(fakeBooks(t, doc, "c".repeat(64)));
    const back = await use(async (c) => c.ro(`munim:${t}`, "MATCH (i:ingredient) RETURN i.id AS id, i.name AS name ORDER BY i.id"));
    expect(back.map((r) => r.name).slice(0, odd.length)).toEqual(odd);
    expect((await counts(t)).ingredient).toBe(doc.ingredient.length);
  });
});

describe("isolation of the projection statement (two independent layers)", () => {
  const strip = (sql: string) => sql.replace(/\b(?:[a-z]+\.)?tenant_id = :tenant_id\b/g, "true");
  const otherIds = async (tenant: string) => (await db.admin(
    `SELECT id::text FROM core.outlet WHERE tenant_id = $1 UNION ALL SELECT id::text FROM core.item WHERE tenant_id = $1
     UNION ALL SELECT id::text FROM core.ingredient WHERE tenant_id = $1 UNION ALL SELECT id::text FROM core.supplier WHERE tenant_id = $1`, [tenant])).rows.map((r) => r.id as string);
  const run = async (c: { query: (t: string, v: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, sql: string, tenant: string, asOf: string) => {
    const b = bindProjection(sql);
    const values = { tenant_id: tenant, as_of: asOf };
    return JSON.stringify((await c.query(b.text, b.names.map((n) => values[n]))).rows[0]!.doc);
  };

  it("the predicate alone (the superuser, which RLS does not bind): tenant A's document holds none of tenant B's ids", async () => {
    const asOf = await graphCaller(svc, A.tenantId, ["*"]).books(async (_q, d) => d);
    const doc = await run({ query: (t, v) => db.admin(t, v) }, PROJECTION_SQL, A.tenantId, asOf);
    const theirs = await otherIds(B.tenantId);
    expect(theirs.length).toBeGreaterThan(25);
    expect(theirs.filter((id) => doc.includes(id))).toEqual([]);
    expect((await otherIds(A.tenantId)).every((id) => doc.includes(id))).toBe(true);
  });

  it("RLS alone (munim_svc under tenant A's SET LOCAL, every tenant predicate stripped): still none of tenant B's ids", async () => {
    const stripped = strip(PROJECTION_SQL);
    expect(stripped).not.toMatch(/tenant_id = :tenant_id/);
    const doc = await graphCaller(svc, A.tenantId, ["*"]).books((q, asOf) => run(q, stripped, A.tenantId, asOf));
    const theirs = await otherIds(B.tenantId);
    expect(theirs.filter((id) => doc.includes(id))).toEqual([]);
    expect((await otherIds(A.tenantId)).every((id) => doc.includes(id))).toBe(true);
  });
});

describe("stale staging keys (§3.2 step 4)", () => {
  it("a staging key older than an hour is deleted, a fresh one is kept", async () => {
    const t = randomUUID();
    const old = `munim:${t}:next:${Date.now() - STALE_MS - 60_000}:${randomUUID()}`;
    const recent = `munim:${t}:next:${Date.now()}:${randomUUID()}`;
    await use(async (c) => {
      for (const k of [old, recent]) await writeGraph(c, k, world(), { source_sha256: "s", projected_at: "2026-10-16T00:00:00.000Z" });
    });
    expect(await use((c) => cleanupStale(c, new Date()))).toBeGreaterThanOrEqual(1);
    expect(await use((c) => c.send(["KEYS", `munim:${t}:next:*`]))).toEqual([recent]);
  });
});
