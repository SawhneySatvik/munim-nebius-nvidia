// W1 integration smoke (T-009), on embedded Postgres 18 — no `.env`, no network beyond 127.0.0.1. Boots the
// REAL composition roots in-process (core-api's composeCoreApi, core-worker's composeWorker) against a local
// intel stub, then:
//   S1 /health 200 with the expected migration version (highest file whose `-- requires:` extensions this server
//      has — computed here from the files and pg_available_extensions, independently of the runner)
//   S2 one command through executeCommand on a smoke-only route (no real command route exists yet), with the
//      SDK's fetch-based SSE reader open on kds:<outlet> → intel stub receives exactly 1 CloudEvent (typed
//      schema, service secret, verifiable event run token); the outbox row is published; SSE delivers it
//   S3 publisher URL pointed at a dead port → the command still succeeds, the row stays unpublished, and the
//      worker's sweeper later delivers it (delta exactly 1) with an outlet-scoped run (ruling 10 Oct)
//   S4 the worker's fan-out calls /watch:sweep with a run token that is ended once intel returns (ruling 10 Oct)
// Run: node --test tests/smoke/   (exit code is the gate; red-proven by planted defects in a copy)
// Synthetic data only.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { readMigrations } from "../../db/migrate.ts";
import { startTestDb, type TestDb } from "../../db/src/harness.ts";
import { OrderPlacedV1 } from "../../packages/contracts/src/events/index.ts";
import { createLogger, loadConfig } from "../../packages/config/src/index.ts";
import { openStream, type StreamEvent, type StreamHandle } from "../../packages/sdk/src/stream.ts";
import { contextOf, requireMember, TENANT_HEADER, withContext } from "../../services/core-api/src/app.ts";
import { executeCommand, uuidv7, type CommandHandler } from "../../services/core-api/src/commit/index.ts";
import { createLocalIdp } from "../../services/core-api/src/auth/local-idp.ts";
import { verifyRunToken } from "../../services/core-api/src/runtoken/index.ts";
import { composeCoreApi, serveApi, type CoreApi } from "../../services/core-api/src/server.ts";
import { composeWorker } from "../../services/core-worker/src/main.ts";
import type { Clock } from "../../services/core-worker/src/ports.ts";
import type { Worker } from "../../services/core-worker/src/worker.ts";
import { startIntelStub, type IntelStub } from "../../scripts/dev/intel-stub.ts";

const SECRET = "smoke-service-secret-not-a-real-one";

/** Cron time moves only when the test says so; the database's now() is real time. */
class ManualClock implements Clock {
  #t: number;
  #seq = 0;
  #timers = new Map<number, { at: number; fn: () => void }>();
  constructor(start: string) {
    this.#t = Date.parse(start);
  }
  now() {
    return new Date(this.#t);
  }
  setTimeout(fn: () => void, ms: number) {
    this.#timers.set(++this.#seq, { at: this.#t + Math.max(0, ms), fn });
    return this.#seq;
  }
  clearTimeout(h: unknown) {
    this.#timers.delete(h as number);
  }
  /** Fires every timer due up to `iso`, in time order. Jobs then run on real I/O; callers poll for effects. */
  advanceTo(iso: string) {
    const end = Date.parse(iso);
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const e of this.#timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.#timers.delete(next[0]);
      this.#t = next[1].at;
      next[1].fn();
    }
    this.#t = end;
  }
}

async function until<T>(what: string, fn: () => Promise<T | undefined> | T | undefined, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined && v !== false) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function deadPort(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

// Smoke-only command route: the real orders.place.v1 route lands with its module (W2). Same path a module
// route takes: verified member → their SET LOCAL context → executeCommand with the composed publish deps.
const placeOrder: CommandHandler = {
  type: "orders.place.v1",
  async run(c, cmd) {
    const p = cmd.payload as { order_id: string; outlet_id: string; channel_id: string };
    const r = await c.query<{ at: Date }>(
      `INSERT INTO core."order" (tenant_id, id, outlet_id, channel_id, kind, subtotal_minor, total_minor, currency, pricing_snapshot,
                                 business_date, ticket_no)
       VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, 'takeaway', 0, 0, 'INR', '{}', current_date, 0) RETURNING created_at AS at`,
      [p.order_id, p.outlet_id, p.channel_id]);
    return {
      entityId: p.order_id,
      audit: [{ entity: "core.order", entityId: p.order_id, after: { status: "placed" } }],
      events: [{
        type: "munim.orders.order.placed.v1", subject: p.order_id, aggregateType: "order",
        data: { order_id: p.order_id, outlet_id: p.outlet_id, channel_id: p.channel_id, status: "placed", placed_at: r.rows[0]!.at.toISOString() },
      }],
    };
  },
};

function mountSmokeRoute(api: CoreApi) {
  api.app.post("/smoke/v1/orders", requireMember, async (c) => {
    const p = c.var.principal;
    if (p.kind !== "member") return c.json({}, 404);
    const deferred: string[] = [];
    const out = await executeCommand({
      tx: (fn) => withContext(api.deps.pools.core, contextOf(p), fn),
      tenantId: p.tenant_id,
      actor: { kind: "member", id: p.member_id, role: p.role },
      publish: api.deps.publish,
      onPublishDeferred: (ids) => deferred.push(...ids),
    }, (await c.req.json()) as never, placeOrder);
    return c.body(out.body, 200, { "Content-Type": "application/json", "X-Smoke-Deferred": String(deferred.length) });
  });
}

let db: TestDb;
let stub: IntelStub;
let apiLive: CoreApi;
let apiDead: CoreApi;
let worker: Worker;
let closeWorkerPool: () => Promise<void>;
const servers: Array<{ close(cb?: () => void): unknown }> = [];
let baseLive = "";
let baseDead = "";
const clock = new ManualClock("2026-10-10T00:00:30Z");
const idp = createLocalIdp();
const pem = (() => {
  const k = generateKeyPairSync("ed25519");
  return { privateKeyPem: k.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }).toString() };
})();
const logLines: string[] = [];
const T = { tenant: uuidv7(), owner: uuidv7(), outlet: uuidv7(), channel: uuidv7(), ownerSub: `smoke-owner-${uuidv7()}` };

before(async () => {
  db = await startTestDb();
  stub = await startIntelStub();
  const url = (role: string) => `postgresql://${role}:${db.password}@127.0.0.1:${db.port}/${db.database}`;
  const config = loadConfig({ env: {} });
  const log = createLogger(config, (l) => logLines.push(l));
  const wiring = {
    coreUrl: url("munim_core"), svcUrl: url("munim_svc"), listenUrl: url("munim_core"),
    idp, config, log, keys: pem, serviceSecret: SECRET,
  };
  apiLive = await composeCoreApi({ ...wiring, intelUrl: stub.url });
  apiDead = await composeCoreApi({ ...wiring, intelUrl: `http://127.0.0.1:${await deadPort()}` });
  for (const api of [apiLive, apiDead]) mountSmokeRoute(api);
  const live = await serveApi(apiLive.app, 0);
  const dead = await serveApi(apiDead.app, 0);
  servers.push(live.server, dead.server);
  baseLive = `http://127.0.0.1:${live.port}`;
  baseDead = `http://127.0.0.1:${dead.port}`;

  const w = composeWorker({ svcUrl: url("munim_svc"), keys: pem, intelUrl: stub.url, serviceSecret: SECRET, clock, log: (event, fields) => logLines.push(JSON.stringify({ event, ...fields })) });
  worker = w.worker;
  closeWorkerPool = w.close;
  await worker.start();

  // Provisioning: /platform/v1/tenants:provision does not exist yet (tenancy module, later wave), so the
  // operator's own tenancy.provision.v1 command is written under the operator's context, as the route will.
  await db.withContext("munim_core", { tenant_id: T.tenant, outlet_ids: "*", role: "operator", operator_id: uuidv7(), command_type: "tenancy.provision.v1" }, async (c) => {
    await c.query(`INSERT INTO core.tenant (tenant_id, name, country_code, base_currency, fy_start_month) VALUES ($1, 'Smoke Tenant', 'IN', 'INR', 4)`, [T.tenant]);
    await c.query(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, 'Owner', 'owner@example.test')`, [T.tenant, T.owner, T.ownerSub]);
    await c.query(`INSERT INTO core.membership (tenant_id, member_id, role) VALUES ($1, $2, 'owner')`, [T.tenant, T.owner]);
  });
  await db.withContext("munim_core", { tenant_id: T.tenant, outlet_ids: "*", role: "owner", member_id: T.owner, command_type: "tenancy.outlet.create.v1" }, (c) =>
    c.query(`INSERT INTO core.outlet (tenant_id, id, name, kind, tz, address) VALUES ($1, $2, 'Smoke outlet', 'restaurant', 'Asia/Kolkata', 'Synthetic street')`, [T.tenant, T.outlet]));
  await db.withContext("munim_core", { tenant_id: T.tenant, outlet_ids: "*", role: "owner", member_id: T.owner, command_type: "tenancy.channel.create.v1" }, (c) =>
    c.query(`INSERT INTO core.channel (tenant_id, id, name, kind) VALUES ($1, $2, 'Counter', 'counter')`, [T.tenant, T.channel]));
});

after(async () => {
  await worker?.stop(10_000);
  await closeWorkerPool?.();
  for (const s of servers) await new Promise((ok) => s.close(() => ok(undefined)));
  await apiLive?.close();
  await apiDead?.close();
  await stub?.close();
  await db?.stop();
});

const auth = () => ({ Authorization: `Bearer ${idp.sign({ sub: T.ownerSub })}`, [TENANT_HEADER]: T.tenant });
const verifyDeps = () => ({ publicKey: apiLive.keys.publicKey, privateKey: apiLive.keys.privateKey, svc: apiLive.svc });
const events = () => stub.calls.filter((c) => c.path === "/events").flatMap((c) => c.events);

async function place(base: string) {
  const order = uuidv7();
  const res = await fetch(`${base}/smoke/v1/orders`, {
    method: "POST",
    headers: { ...auth(), "content-type": "application/json" },
    body: JSON.stringify({ command_id: uuidv7(), idempotency_key: `smoke-${uuidv7()}`, type: "orders.place.v1", payload: { order_id: order, outlet_id: T.outlet, channel_id: T.channel } }),
  });
  return { order, status: res.status, deferred: res.headers.get("X-Smoke-Deferred"), body: (await res.json()) as { entity_id?: string } };
}

async function outboxRow(order: string) {
  const r = await db.admin<{ id: string; published: boolean }>(
    `SELECT id::text, published_at IS NOT NULL AS published FROM core.outbox WHERE tenant_id = $1 AND aggregateid = $2`, [T.tenant, order]);
  assert.equal(r.rows.length, 1, `exactly one outbox row for order ${order}`);
  return r.rows[0]!;
}

test("S1 /health 200 with the expected migration version", async () => {
  const avail = new Set((await db.admin<{ name: string }>("SELECT name FROM pg_available_extensions")).rows.map((r) => r.name));
  const expected = Math.max(...readMigrations().filter((f) => f.requires.every((e) => avail.has(e))).map((f) => f.version));
  const res = await fetch(`${baseLive}/health`);
  const body = (await res.json()) as { status: string; migration_version: number };
  console.log(`S1 health: ${res.status} ${JSON.stringify(body)}; expected version ${expected} (files ${readMigrations().length}, vector available ${avail.has("vector")})`);
  assert.equal(res.status, 200);
  assert.equal(body.migration_version, expected);
});

test("S2 command → outbox → intel stub receives exactly 1 CloudEvent with a verifiable run token; SSE delivers it", async () => {
  const got: StreamEvent[] = [];
  let state = "";
  const stream: StreamHandle = openStream({
    baseUrl: baseLive, topics: [`kds:${T.outlet}`], token: () => idp.sign({ sub: T.ownerSub }), headers: () => ({ [TENANT_HEADER]: T.tenant }),
    onEvent: (e) => got.push(e), onState: (s) => { state = s; },
  });
  try {
    await until("SSE open", () => state === "open");
    const before = events().length;
    const r = await place(baseLive);
    assert.equal(r.status, 200);
    assert.equal(r.body.entity_id, r.order);
    const row = await outboxRow(r.order);
    assert.equal(row.published, true, "published in the request");
    const delivered = events().slice(before);
    assert.equal(delivered.length, 1, "exactly 1 CloudEvent at the stub");
    const ev = OrderPlacedV1.parse(delivered[0]);
    assert.equal(ev.id, row.id);
    assert.equal(stub.calls.find((c) => c.events.some((e) => e.id === ev.id))!.secret, SECRET);
    const v = await verifyRunToken(verifyDeps(), ev.munimrun);
    assert.ok(v.ok, `run token verifies (got ${v.ok ? "ok" : v.reason})`);
    assert.equal(v.claims.tenant_id, T.tenant);
    assert.equal(v.claims.trigger, "event");
    const sse = await until("SSE event", () => got.find((e) => e.type === "munim.orders.order.placed.v1"), 5_000);
    console.log(`S2: stub events +${delivered.length} (id ${ev.id}), token ok trigger=${v.claims.trigger} scope=${JSON.stringify(v.claims.outlet_scope)}; SSE got ${got.length} event(s), type ${sse.type}`);
  } finally {
    stream.close();
  }
});

test("S3 dead publisher port → command succeeds, row unpublished; the worker's sweeper delivers it (count 1)", async () => {
  const before = events().length;
  const r = await place(baseDead);
  assert.equal(r.status, 200, "the command does not fail when publishing does");
  assert.equal(r.deferred, "1", "one event left for the sweeper");
  const row = await outboxRow(r.order);
  assert.equal(row.published, false);
  assert.equal(events().length - before, 0, "nothing reached intel from the dead-port publisher");
  // core.outbox_claim leases rows older than 30 s by the database clock: wait it out, then tick the cron.
  await new Promise((ok) => setTimeout(ok, 31_000));
  clock.advanceTo("2026-10-10T00:01:00Z");
  await until("sweeper delivery", async () => (await outboxRow(r.order)).published || undefined, 15_000);
  const delivered = events().slice(before);
  assert.equal(delivered.length, 1, "the sweeper delivered exactly 1");
  assert.equal(delivered[0]!.id, row.id);
  const v = await verifyRunToken(verifyDeps(), String(delivered[0]!.munimrun));
  assert.ok(v.ok);
  assert.deepEqual(v.claims.outlet_scope, [T.outlet], "event run scoped to the event's outlet (worker path)");
  console.log(`S3: request deferred ${r.deferred}, stub +0 before the sweep, +${delivered.length} after; published=true; run scope ${JSON.stringify(v.claims.outlet_scope)}`);
});

test("S4 fan-out: /watch:sweep with a run token that is ended once intel returns", async () => {
  const before = stub.calls.length;
  clock.advanceTo("2026-10-10T00:15:00Z");
  const call = await until("watch:sweep call", () => stub.calls.slice(before).find((c) => c.path === "/watch:sweep"), 15_000);
  assert.equal(call.secret, SECRET);
  const ended = await until("run ended", async () => {
    const v = await verifyRunToken(verifyDeps(), call.runToken!);
    return !v.ok && v.reason === "ended" ? v.reason : undefined;
  }, 10_000);
  console.log(`S4: watch:sweep calls +${stub.calls.slice(before).filter((c) => c.path === "/watch:sweep").length}, token verdict after return: ${ended}`);
  assert.equal(ended, "ended");
  assert.equal(logLines.filter((l) => l.includes(SECRET)).length, 0, "no log line carries the service secret");
});
