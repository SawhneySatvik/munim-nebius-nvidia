// NB-7 gate — market_signal_v2: an `ingredient_price` signal through the approved-import path (0037, R28). Through the real app
// (member auth → RLS → book guard) and the core-worker parse job. Expected values are hand-written below, never read back
// from the code under test:
//   1. the v1 layout (no ingredient columns) still previews as before, and its ingredient_price row is quarantined;
//   2. v2 quarantines each bad row with its reason (every one paired with the accepted row);
//   3. approving the draft writes exactly the one good row, with its ingredient, price, currency and source token;
//   4. before approval, nothing is in core.market_signal (the importer is a draft, R16).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@munim/config";
import { ImportRunRowsResponse, ImportRunView, ImportsUploadResponse } from "@munim/contracts/imports";
import { buildWorld, type TestDb, uuidv7, type World } from "@munim/db";
import type { Hono } from "hono";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { parsePendingImports } from "../../core-worker/src/imports/index.ts";
import { type AppEnv, createApp, TENANT_HEADER } from "../src/app.ts";
import { localBlobStore } from "../src/modules/imports/index.ts";
import { openDb } from "./db.ts";

const idp = createLocalIdp();
let db: TestDb;
let pools: { core: pg.Pool; svc: pg.Pool };
let app: Hono<AppEnv>;
let blobDir: string;
let w: World;
const subs = { owner: `owner-${uuidv7()}` };
const ctx = (command_type?: string) => ({ tenant_id: w.tenant, outlet_ids: "*" as const, role: "owner" as const, member_id: w.owner, ...(command_type ? { command_type } : {}) });

type Res = Omit<Response, "json"> & { json(): Promise<any> };
const call = async (method: string, path: string, body?: unknown): Promise<Res> =>
  (await app.request(path, {
    method,
    headers: { Authorization: `Bearer ${idp.sign({ sub: subs.owner })}`, [TENANT_HEADER]: w.tenant, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })) as Res;
const count = async (sql: string, params: unknown[] = []) => Number(((await db.admin(sql, params)).rows[0] as { n: string }).n);
const signals = () => count(`SELECT count(*) AS n FROM core.market_signal WHERE tenant_id = $1`, [w.tenant]);

async function preview(file: string, csv: string, parser: string) {
  const up = await call("POST", "/v1/imports/documents", { kind: "market_signal", filename: file, media_type: "text/csv", content_base64: Buffer.from(csv).toString("base64") });
  expect(up.status).toBe(200);
  const u = ImportsUploadResponse.parse(await up.json());
  expect(u).toMatchObject({ duplicate: false, header: null, run: { status: "parsing", parser } });
  expect(await parsePendingImports({ pool: pools.svc, blobs: localBlobStore(blobDir), log: () => {} }, [w.tenant])).toEqual({ previewed: 1, failed: 0, skipped: 0, errors: 0 });
  const run = ImportRunView.parse(await (await call("GET", `/v1/imports/runs/${u.run!.import_run_id}`)).json());
  const r = ImportRunRowsResponse.parse(await (await call("GET", `/v1/imports/runs/${run.import_run_id}/rows`)).json());
  return { run, staged: r.staged, quarantined: Object.fromEntries(r.quarantined.map((q) => [String(q.row_no), q.reason_code])) };
}

const V1 = "on_date,kind,label,outlet_ref,value,unit,source\n2026-10-26,weather,rain.heavy,,,,imd.synthetic\n2026-10-26,ingredient_price,price.flour,,1,kg,tavily-recorded:market-sim.example\n";
const H2 = "on_date,kind,label,outlet_ref,ingredient,price,value,unit,source\n";
const V2 = H2
  + "2026-10-26,ingredient_price,price.flour,,Flour,142.50,1,kg,tavily-recorded:market-sim.example\n" // 2: ok
  + "2026-10-26,ingredient_price,price.saffron,,Saffron,142.50,1,kg,tavily-recorded:market-sim.example\n" // 3: no such ingredient
  + "2026-10-26,ingredient_price,price.flour,,Flour,0,1,kg,tavily-recorded:market-sim.example\n" // 4: zero price
  + "2026-10-26,ingredient_price,price.flour,,Flour,142.50,,,tavily-recorded:market-sim.example\n" // 5: no quantity (value and unit both empty)
  + "2026-10-26,ingredient_price,price.flour,,Flour,142.50,1,kg,Tavily says so\n" // 6: prose source
  + "2026-10-26,weather,rain.heavy,,Flour,,,,imd.synthetic\n" // 7: ingredient on a non-price kind
  + "2026-10-26,weather,rain.heavy,,,,,,imd.synthetic\n"; // 8: ok

beforeAll(async () => {
  db = await openDb();
  w = await buildWorld(db, { country: "IN" });
  await db.withContext("munim_core", ctx("tenancy.member.invite.v1"), async (c) => {
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [w.owner, subs.owner]);
  });
  await db.withContext("munim_core", ctx("inventory.ingredient.upsert.v1"), async (c) => {
    await c.query(`INSERT INTO core.ingredient (tenant_id, id, name, base_unit, tracked_by_batch) VALUES ($1, $2, 'Flour', 'g', false), ($1, $3, 'Hazelnut', 'g', false)`, [w.tenant, uuidv7(), uuidv7()]);
  });
  pools = { core: db.pool("munim_core", 8), svc: db.pool("munim_svc", 2) };
  blobDir = await mkdtemp(join(tmpdir(), "munim-nb7-"));
  const config = { nodeEnv: "test", redact: (s: string) => s };
  app = await createApp({ pools, idp, storefronts: async () => null, blobs: localBlobStore(blobDir), config, log: createLogger(config, () => {}) });
});

afterAll(async () => {
  await pools?.core.end();
  await pools?.svc.end();
  await db?.stop();
  if (blobDir) await rm(blobDir, { recursive: true, force: true });
});

describe("market_signal_v2: ingredient_price", () => {
  it("v1 (no ingredient columns) still previews; its ingredient_price row is quarantined, the weather row staged", async () => {
    const p = await preview("v1.csv", V1, "market_signal_v1");
    expect(p.run).toMatchObject({ rows_ok: 1, rows_quarantined: 1 });
    expect(p.quarantined).toEqual({ "3": "kind_unsupported" });
  });

  it("v2 quarantines each bad row with its reason; the two good rows are staged; nothing is in the books yet", async () => {
    const p = await preview("v2.csv", V2, "market_signal_v2");
    expect(p.run).toMatchObject({ status: "previewed", rows_ok: 2, rows_quarantined: 5 });
    expect(p.quarantined).toEqual({ "3": "ingredient_unknown", "4": "price_invalid", "5": "price_invalid", "6": "source_invalid", "7": "ingredient_fields_unexpected" });
    const before = await signals();
    expect(before).toBe(1); // the world's own seeded signal; the preview added none
    const approve = await call("POST", `/v1/drafts/${p.run.draft_id}:approve`, {
      command_id: uuidv7(), idempotency_key: `nb7-${uuidv7()}`, type: "drafts.approve.v1",
      payload: { draft_id: p.run.draft_id, command_type: "imports.run.commit.v1", edited_payload: null, reason: null },
    });
    expect(approve.status).toBe(200);
    const rows = (await db.admin(
      `SELECT s.kind, s.label, s.source, s.value_minor::int AS value_minor, s.currency, s.value_milli::int AS value_milli, s.unit, g.name AS ingredient
         FROM core.market_signal s LEFT JOIN core.ingredient g ON g.tenant_id = s.tenant_id AND g.id = s.ingredient_id
        WHERE s.tenant_id = $1 AND s.import_run_id = $2 ORDER BY s.kind DESC`, [w.tenant, p.run.import_run_id])).rows;
    expect(rows).toEqual([
      { kind: "weather", label: "rain.heavy", source: "imd.synthetic", value_minor: null, currency: null, value_milli: null, unit: null, ingredient: null },
      { kind: "ingredient_price", label: "price.flour", source: "tavily-recorded:market-sim.example", value_minor: 14250, currency: "INR", value_milli: 1000, unit: "kg", ingredient: "Flour" },
    ]);
  });

  // The exact file intel's market/web_price.py writes for the recorded fixture (services/intel/tests/market/test_web_price.py
  // asserts the same string): it previews as one staged row, the price in minor units.
  it("the file intel proposes from the recorded fixture previews as one staged ingredient_price row of 142500 paise for 1 kg", async () => {
    const file = H2 + "2026-10-26,ingredient_price,price.hazelnut,,Hazelnut,1425.00,1,kg,tavily-recorded:market-sim.example\n";
    const p = await preview("intel.csv", file, "market_signal_v2");
    expect(p.run).toMatchObject({ rows_ok: 1, rows_quarantined: 0 });
    expect(p.staged.map((r) => [r.data.kind, r.data.value_minor, r.data.value_milli, r.data.unit, r.data.currency, r.data.source])).toEqual([
      ["ingredient_price", 142500, 1000, "kg", "INR", "tavily-recorded:market-sim.example"],
    ]);
  });
});
