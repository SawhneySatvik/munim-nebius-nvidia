// NB-7b gates — POST /v1/imports/market-price through the real app: "check the market price" of an ingredient. intel is a fake at
// the service boundary (the port); the run token is checked with core's own verifier. Expected values are hand-written.
//   (1) staff and a single-outlet manager are refused (403 authority_denied) before anything is read, stored or called;
//   (2) another tenant's ingredient id is 404 for the owner, and intel is not called;
//   (3) the owner: an `ingest` run of hers over every outlet, intel handed core's own name and currency and the outlets' business
//       date; the CSV it returns is stored as a market_signal upload and previewed to ONE draft; NOTHING is in core.market_signal
//       until she approves the draft; then exactly one ingredient_price row, and the market.ingredient_price cell reads it;
//   (4) the same file again today → the same run and draft, no second document or run;
//   (5) intel finding no price or failing: nothing is stored (503 for a failure, the run ended);
//   (6) a file that prices a DIFFERENT ingredient than the one asked is previewed but not offered (status unavailable, no draft).
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@munim/config";
import { MarketPriceCheckResponse } from "@munim/contracts/imports";
import { buildWorld, type TestDb } from "@munim/db";
import type { Hono } from "hono";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { type AppEnv, createApp, TENANT_HEADER } from "../src/app.ts";
import { uuidv7 } from "../src/commit/index.ts";
import { svcTx, testKeys } from "../src/commit/testkit.ts";
import type { Deps } from "../src/lib/types.ts";
import { configureMarketPrice, localBlobStore, type MarketPriceBody } from "../src/modules/imports/index.ts";
import { verifyRunToken } from "../src/runtoken/index.ts";
import { openDb } from "./db.ts";

const idp = createLocalIdp();
const keys = testKeys();
let db: TestDb;
let pools: { core: pg.Pool; svc: pg.Pool };
let app: Hono<AppEnv>;
let deps: Deps;
const T = { tenant: "", other: "", owner: "", ingredient: "", otherIngredient: "", flour: "", outlets: [] as string[], manager: uuidv7(),
  subs: { owner: `owner-${uuidv7()}`, staff: `staff-${uuidv7()}`, manager: `manager-${uuidv7()}` } };
type Who = keyof typeof T.subs;

const H2 = "on_date,kind,label,outlet_ref,ingredient,price,value,unit,source\n";
const SOURCE = "tavily-recorded:market-sim.example";
interface Call { token: string; body: MarketPriceBody }
const calls: Call[] = [];
let reply: (runId: string, body: MarketPriceBody) => unknown = (run_id, b) => ({ run_id, status: "proposed", origin: SOURCE,
  csv: `${H2}${b.on_date},ingredient_price,price.paneer,,${b.ingredient},142.50,1,kg,${SOURCE}\n` });
let failIntel = false;
async function fakeIntel(token: string, body: MarketPriceBody): Promise<unknown> {
  calls.push({ token, body });
  if (failIntel) throw new Error("intel /market-price: HTTP 502");
  const v = await verifyRunToken({ ...keys, svc: svcTx(db) }, token);
  if (!v.ok) throw new Error(`fake intel: token refused ${v.reason}`);
  return reply(v.claims.run_id, body);
}

type Res = Omit<Response, "json"> & { json(): Promise<any> };
const send = async (who: Who, path: string, body: unknown, tenant = T.tenant): Promise<Res> =>
  (await app.request(path, { method: "POST", headers: { Authorization: `Bearer ${idp.sign({ sub: T.subs[who] })}`, [TENANT_HEADER]: tenant, "Content-Type": "application/json" },
    body: JSON.stringify(body) })) as Res;
const check = (who: Who, ingredient_id: string) => send(who, "/v1/imports/market-price", { ingredient_id });
const count = async (sql: string, params: unknown[] = []) => Number((await db.admin(sql, params)).rows[0]!.n);
const signals = () => count(`SELECT count(*) n FROM core.market_signal WHERE tenant_id = $1 AND kind = 'ingredient_price'`, [T.tenant]);
const docs = () => count(`SELECT count(*) n FROM core.document WHERE tenant_id = $1 AND kind = 'market_signal'`, [T.tenant]);
const runs = () => count(`SELECT count(*) n FROM core.import_run WHERE tenant_id = $1 AND kind = 'market_signal'`, [T.tenant]);
const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as { run_id: string };

beforeAll(async () => {
  db = await openDb();
  const w = await buildWorld(db);
  const o = await buildWorld(db);
  Object.assign(T, { tenant: w.tenant, other: o.tenant, owner: w.owner, outlets: [...w.outlets], ingredient: w.ingredient, otherIngredient: o.ingredient });
  await db.withContext("munim_core", { tenant_id: T.tenant, outlet_ids: "*", role: "owner", member_id: T.owner, command_type: "tenancy.member.invite.v1" }, async (c) => {
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [T.owner, T.subs.owner]);
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [w.staff, T.subs.staff]);
    await c.query(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, 'Synthetic manager', 'manager@example.test')`, [T.tenant, T.manager, T.subs.manager]);
    await c.query(`INSERT INTO core.membership (tenant_id, member_id, role, outlet_ids) VALUES ($1, $2, 'manager', $3)`, [T.tenant, T.manager, [T.outlets[0]]]);
  });
  T.flour = uuidv7();
  await db.withContext("munim_core", { tenant_id: T.tenant, outlet_ids: "*", role: "owner", member_id: T.owner, command_type: "inventory.ingredient.upsert.v1" }, async (c) => {
    await c.query(`INSERT INTO core.ingredient (tenant_id, id, name, base_unit, tracked_by_batch) VALUES ($1, $2, 'Flour', 'g', false)`, [T.tenant, T.flour]);
  });
  pools = { core: db.pool("munim_core", 8), svc: db.pool("munim_svc", 4) };
  const config = { nodeEnv: "test", redact: (s: string) => s };
  deps = { pools, idp, storefronts: async () => null, blobs: localBlobStore(await mkdtemp(join(tmpdir(), "nb7b-blobs-"))), config, log: createLogger(config, () => {}) };
  app = await createApp(deps);
});

afterAll(async () => {
  await pools?.core.end();
  await pools?.svc.end();
  await db?.stop();
});

describe("POST /v1/imports/market-price", () => {
  it("(0) no port wired → 503 and nothing stored", async () => {
    const d0 = await docs();
    expect((await check("owner", T.ingredient)).status).toBe(503);
    expect(await docs()).toBe(d0);
    configureMarketPrice(deps, { keys, intel: fakeIntel });
  });

  it("(1) staff and a single-outlet manager are refused before anything is stored or called", async () => {
    const before = [await docs(), await runs(), calls.length];
    for (const who of ["staff", "manager"] as const) {
      const r = await check(who, T.ingredient);
      expect(r.status).toBe(403);
      expect((await r.json()).error.reason_code).toBe("authority_denied");
    }
    expect([await docs(), await runs(), calls.length]).toEqual(before);
  });

  it("(2) another tenant's ingredient is 404 for the owner, and intel is not called", async () => {
    const n = calls.length;
    expect((await check("owner", T.otherIngredient)).status).toBe(404);
    expect((await check("owner", uuidv7())).status).toBe(404);
    expect(calls.length).toBe(n);
  });

  let draft = "";
  let runId = "";
  it("(3) the owner: previewed to one draft; nothing is in core.market_signal until she approves; then one row and its cell", async () => {
    const [s0, d0, r0, n0] = [await signals(), await docs(), await runs(), calls.length];
    const r = await check("owner", T.ingredient);
    expect(r.status).toBe(200);
    const out = MarketPriceCheckResponse.parse(await r.json());
    expect(out).toMatchObject({ status: "previewed", duplicate: false });
    draft = out.draft_id!;
    runId = out.import_run_id!;
    expect([await signals(), await docs(), await runs(), calls.length]).toEqual([s0, d0 + 1, r0 + 1, n0 + 1]);

    const call = calls.at(-1)!;
    const today = (await db.admin(`SELECT to_char(min(((now() AT TIME ZONE tz) - business_day_cutoff)::date), 'YYYY-MM-DD') AS d FROM core.outlet WHERE tenant_id = $1`, [T.tenant])).rows[0]!.d;
    expect(call.body).toEqual({ ingredient: "Paneer", currency: "INR", on_date: today });
    const run = (await db.admin(`SELECT trigger, actor, outlet_scope::text[] AS scope, ended_at IS NOT NULL AS ended FROM intel.run WHERE tenant_id = $1 AND id = $2`,
      [T.tenant, claimsOf(call.token).run_id])).rows[0];
    expect(run).toEqual({ trigger: "ingest", actor: T.owner, scope: ["*"], ended: true });
    const doc = (await db.admin(`SELECT kind, media_type, uploaded_by FROM core.document WHERE tenant_id = $1 AND id = (SELECT document_id FROM core.import_run WHERE id = $2)`, [T.tenant, runId])).rows[0];
    expect(doc).toEqual({ kind: "market_signal", media_type: "text/csv", uploaded_by: T.owner });
    expect((await db.admin(`SELECT command_type, status FROM core.draft WHERE tenant_id = $1 AND id = $2`, [T.tenant, draft])).rows[0]).toEqual({ command_type: "imports.run.commit.v1", status: "proposed" });

    const approve = await send("owner", `/v1/drafts/${draft}:approve`, {
      command_id: uuidv7(), idempotency_key: `nb7b-${uuidv7()}`, type: "drafts.approve.v1",
      payload: { draft_id: draft, command_type: "imports.run.commit.v1", edited_payload: null, reason: null },
    });
    expect(approve.status).toBe(200);
    expect(await signals()).toBe(s0 + 1);
    const row = (await db.admin(`SELECT ingredient_id, value_minor::int AS v, currency, value_milli::int AS q, unit, source, created_by FROM core.market_signal WHERE tenant_id = $1 AND import_run_id = $2`, [T.tenant, runId])).rows;
    expect(row).toEqual([{ ingredient_id: T.ingredient, v: 14250, currency: "INR", q: 1000, unit: "kg", source: SOURCE, created_by: T.owner }]);

    const snap = await (await send("owner", "/v1/snapshots", { template_id: "market.ingredient_price", params: { outlet_id: null, ingredient_id: T.ingredient, days: 30, as_of: null } })).json();
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0]).toMatchObject({ unit_price_minor: 14250, unit: "kg", source: SOURCE, currency: "INR" });
  });

  it("(4) the same file again today answers the same run and draft; no second document or run", async () => {
    const [d0, r0] = [await docs(), await runs()];
    const out = MarketPriceCheckResponse.parse(await (await check("owner", T.ingredient)).json());
    expect(out).toEqual({ status: "previewed", duplicate: true, import_run_id: runId, draft_id: draft });
    expect([await docs(), await runs()]).toEqual([d0, r0]);
  });

  it("(5) no price found stores nothing; intel failing is 503 and the run is ended", async () => {
    const prev = reply;
    reply = (run_id) => ({ run_id, status: "no_price", csv: null, origin: null });
    const [d0, r0] = [await docs(), await runs()];
    expect(await (await check("owner", T.ingredient)).json()).toEqual({ status: "no_price", duplicate: false, import_run_id: null, draft_id: null });
    expect([await docs(), await runs()]).toEqual([d0, r0]);
    reply = prev;
    failIntel = true;
    try {
      expect((await check("owner", T.ingredient)).status).toBe(503);
      expect(await count(`SELECT count(*) n FROM intel.run WHERE tenant_id = $1 AND trigger = 'ingest' AND ended_at IS NULL`, [T.tenant])).toBe(0);
    } finally {
      failIntel = false;
    }
  });

  it("(6) a file that prices another ingredient is not offered: unavailable, no draft", async () => {
    const prev = reply;
    reply = (run_id, b) => ({ run_id, status: "proposed", origin: SOURCE, csv: `${H2}${b.on_date},ingredient_price,price.flour,,Flour,9.00,1,kg,${SOURCE}\n` });
    try {
      const out = MarketPriceCheckResponse.parse(await (await check("owner", T.ingredient)).json());
      expect(out).toMatchObject({ status: "unavailable", draft_id: null });
    } finally {
      reply = prev;
    }
  });
});
