// T-089a gate (2) on the margin_fall gate world (DECISIONS 11 Oct, W3.3 investigation rulings): restaurant_group with the
// T-086 plants (100 days, as of the gate profile's day), seeded by worldgen through the real core-api over HTTP on embedded
// Postgres, plus one closed shift per trading outlet-day of August and September imported and approved by the owner
// (T-093's shift_log_v1; it posts nothing, so the bridge stays the key's). Narration is unconfigured: core stores its own
// template per step (rule 11), so no intel runs here; intel's narration gates are services/intel/tests/investigate/.
//   (2a) the missing-settlement world (ZM-C-H1 held, RG-F7) → the approved plan stops after 1 step at `waiting`
//   (2b) the complete world (the held import approved) → a fresh plan runs to `done` in 1 step (hand count below)
//   (2c) the complete world with a planted flip of a frozen item → the plan runs steps 2 and 3 to `done`, 0 member calls
//   (6)  the waiting plan of (2a): after the import, a member's :continue resumes at steps_done + 1 → `done`
//   (2d) R-D item 3: a GATE flip at the final re-mint → `waiting` (never `open`): K steps on the waiting world (supplier_price
//        frozen), then on the complete world with (2c)'s plant (data_complete frozen supported, supplier_price flips →
//        open), then one September shift is planted out of the month (a trading day without a closed shift) → step 3's
//        final re-mint flips data_complete → `waiting`
// Hand counts (ADR-014 §7.4, never the code under test): with H0 supported in a step, its gated item (channel fees) is
// judged in that same step, so every item is decided in step 1; nothing was frozen before, so no re-mint can flip, and
// the key's "after" bridge has supported drivers (H1–H3) and a residual inside the bar → done in exactly 1 step. In (2c)
// supplier_price was frozen at the member's step 1; the planted August receipt flips it at the final re-mint of step 2
// (reopened → open, review m11), and step 3 judges it unfrozen → done: 2 plan steps. Supported items and the open
// counts come from the hand-kept answer key (RG-MF1, RG-F7). Synthetic data only.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, loadConfig } from "@munim/config";
import { REPLAYED_HEADER } from "@munim/contracts";
import { InvestigationView } from "@munim/contracts/investigations";
import { type TestDb, uuidv7 } from "@munim/db";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { startIntelStub } from "../../../scripts/dev/intel-stub.ts";
import { parsePendingImports } from "../../core-worker/src/imports/index.ts";
import { personaIdentity } from "../../../tools/worldgen/src/api.ts";
import { runWorld } from "../../../tools/worldgen/src/run.ts";
import { TENANT_HEADER } from "../src/app.ts";
import { configureInternal } from "../src/internal/index.ts";
import { createPool } from "../src/lib/db.ts";
import { localBlobStore } from "../src/modules/imports/index.ts";
import { configureInvestigations } from "../src/modules/investigations/index.ts";
import { composeCoreApi, serveApi } from "../src/server.ts";
import { openDb } from "./db.ts";

const WORLD = "restaurant_group";
/** The worldgen gate profile's fixed outlet-local "today" (tools/worldgen/test/profile.ts). */
const AS_OF = "2026-10-10";
const SECRET = "t089a-world-service-secret-not-real-0123456789";
const PARAMS = { period_month: "2026-09-01", compare_month: "2026-08-01" };
const MONTH = `${new Date().toISOString().slice(0, 7)}-01`;
const SUPPORTED = ["data_complete", "deals", "supplier_price", "waste"]; // RG-MF1: H0 + H1, H2, H3 once H0 is

let db: TestDb;
let api: Awaited<ReturnType<typeof composeCoreApi>>;
let served: Awaited<ReturnType<typeof serveApi>>;
let stub: Awaited<ReturnType<typeof startIntelStub>>;
let blobDir: string;
let svcPool: ReturnType<typeof createPool>;
let timer: ReturnType<typeof setInterval>;
let tenant: string;
let wg: Awaited<ReturnType<typeof runWorld>>["api"];
const idp = createLocalIdp();

type Res = Omit<Response, "json"> & { json(): Promise<any> };
const owner = async (path: string, body?: unknown): Promise<Res> =>
  (await api.app.request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${idp.sign(personaIdentity(WORLD, "owner"))}`, [TENANT_HEADER]: tenant, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })) as Res;
const view = async (r: Res) => {
  expect(r.status).toBeLessThan(300);
  return InvestigationView.parse(await r.json());
};
const openPlan = async () => {
  const id = uuidv7();
  const v = await view(await owner("/v1/investigations", { investigation_id: id, playbook_id: "margin_fall", params: PARAMS, mode: "plan" }));
  expect([v.mode, v.status, v.steps_done]).toEqual(["plan", "open", 0]);
  return id;
};
const statusOf = (v: ReturnType<typeof InvestigationView.parse>) => Object.fromEntries(v.checklist.map((c) => [c.item_id, c.status]));
const supported = (v: ReturnType<typeof InvestigationView.parse>) => v.checklist.filter((c) => c.status === "supported").map((c) => c.item_id).sort();
const steps = async (id: string) =>
  (await db.admin<{ step_no: number; triggered_by: string }>(`SELECT step_no, triggered_by FROM core.investigation_step WHERE investigation_id = $1 ORDER BY step_no`, [id])).rows;
const money = (minor: number) => `${minor < 0 ? "-" : ""}${Math.trunc(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, "0")}`;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const approveDraft = async (draft: string, key: string) => (await wg.cmd("owner", "/v1/drafts/{id}:approve", "drafts.approve.v1", key, {
  draft_id: draft, command_type: "imports.run.commit.v1", edited_payload: null, reason: null,
}, { params: { id: draft } })).status;

/** One closed drawer session per trading outlet-day of `months`, 04:00 → 03:59 local, imported as shift_log_v1 and approved
 *  by the owner. The cash column is a control total core checks against its own figure, so it is read with core's
 *  predicate (imports/shifts.ts: history-imported, device-less orders' cash tenders − cash refunds in the window). As the
 *  T-083 stack's `import_shifts` (services/intel/tests/investigate/investigate_stack.mts). */
async function importShifts(months: string[]): Promise<number> {
  const name = (await db.admin<{ name: string }>(
    `SELECT m.name FROM core.member m JOIN core.membership ms ON ms.tenant_id = m.tenant_id AND ms.member_id = m.id WHERE m.tenant_id = $1 AND ms.role = 'owner'`, [tenant])).rows[0]!.name;
  const days = await db.admin<{ outlet: string; d: string; cash: string }>(
    `WITH d AS (
       SELECT DISTINCT o.outlet_id, ou.name, ou.tz, o.business_date FROM core."order" o JOIN core.outlet ou ON ou.tenant_id = o.tenant_id AND ou.id = o.outlet_id
        WHERE o.tenant_id = $1 AND o.status = 'completed' AND to_char(o.business_date, 'YYYY-MM') = ANY ($2::text[])),
     w AS (SELECT d.*, (d.business_date + time '04:00') AT TIME ZONE d.tz AS opened_at, (d.business_date + 1 + time '03:59') AT TIME ZONE d.tz AS closed_at FROM d)
     SELECT w.name AS outlet, w.business_date::text AS d,
            ((SELECT coalesce(sum(t.amount_minor), 0) FROM core.tender t JOIN core."order" o ON o.tenant_id = t.tenant_id AND o.id = t.order_id
               WHERE t.tenant_id = $1 AND t.method = 'cash' AND o.outlet_id = w.outlet_id AND o.device_id IS NULL AND o.pricing_snapshot ? 'import_run_id'
                 AND t.at >= w.opened_at AND t.at <= w.closed_at)
           - (SELECT coalesce(sum(f.amount_minor), 0) FROM core.refund f JOIN core."order" o ON o.tenant_id = f.tenant_id AND o.id = f.order_id
               WHERE f.tenant_id = $1 AND f.method = 'cash' AND o.outlet_id = w.outlet_id AND o.device_id IS NULL AND o.pricing_snapshot ? 'import_run_id'
                 AND f.at >= w.opened_at AND f.at <= w.closed_at))::text AS cash
       FROM w ORDER BY w.name, w.business_date`, [tenant, months]);
  const FLOAT = 100_000;
  const csv = ["Shift No,Date,Outlet,Opened At,Closed At,Opened By,Closed By,Float,Counted Cash,Cash Tenders",
    ...days.rows.map((x, i) => `T089A-${i + 1},${x.d},${x.outlet},04:00,03:59,${name},${name},${money(FLOAT)},${money(FLOAT + Number(x.cash))},${money(Number(x.cash))}`)].join("\n");
  const up = await wg.post("owner", "/v1/imports/documents", {
    kind: "shift_log", filename: `t089a-shifts-${months.join("_")}.csv`, media_type: "text/csv", content_base64: Buffer.from(csv, "utf8").toString("base64"),
  });
  const runId = (up.run as { import_run_id: string }).import_run_id;
  let run = up.run as Record<string, unknown>;
  for (let i = 0; i < 600 && run.status === "parsing"; i++) {
    await sleep(100);
    run = await wg.get("owner", "/v1/imports/runs/{id}", { params: { id: runId } });
  }
  expect([run.status, run.rows_quarantined]).toEqual(["previewed", 0]);
  expect([200, 201]).toContain(await approveDraft(run.draft_id as string, `t089a:shifts:${months.join("_")}`));
  return days.rows.length;
}

beforeAll(async () => {
  db = await openDb();
  stub = await startIntelStub();
  blobDir = await mkdtemp(join(tmpdir(), "t089a-blobs-"));
  const url = (role: string) => `postgresql://${role}:${db.password}@127.0.0.1:${db.port}/${db.database}`;
  const config = loadConfig({ env: {} });
  const k = generateKeyPairSync("ed25519");
  const blobs = localBlobStore(blobDir);
  api = await composeCoreApi({
    coreUrl: url("munim_core"), svcUrl: url("munim_svc"), listenUrl: url("munim_core"), idp, config, log: createLogger(config, () => {}), blobs,
    keys: { privateKeyPem: k.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }).toString() },
    intelUrl: stub.url, serviceSecret: SECRET,
  });
  configureInternal(api.deps, { serviceSecret: SECRET, keys: api.keys, watchWindowMs: 0, clock: () => new Date(`${AS_OF}T06:30:00Z`) });
  // No intel narration: core stores its template for every step (rule 11). The narration gates are intel's.
  configureInvestigations(api.deps, { keys: api.keys, narrate: null });
  served = await serveApi(api.app, 0);
  svcPool = createPool(url("munim_svc"), 2);
  timer = setInterval(() => void parsePendingImports({ pool: svcPool, blobs, log: () => {} }).catch(() => {}), 150);
  const r = await runWorld({ world: WORLD, asOf: AS_OF, days: 100, baseUrl: `http://127.0.0.1:${served.port}`, token: (p) => idp.sign(personaIdentity(WORLD, p)) });
  wg = r.api;
  tenant = wg.tenantId!;
  const currency = (await db.admin<{ c: string }>(`SELECT base_currency AS c FROM core.tenant WHERE tenant_id = $1`, [tenant])).rows[0]!.c;
  // The plan runs only within the month's AI budget (T-090 effectiveCap, the current UTC month).
  await db.admin(`INSERT INTO platform.llm_budget (tenant_id, month, limit_minor, currency) VALUES ($1, $2, 100000000, $3) ON CONFLICT DO NOTHING`, [tenant, MONTH, currency]);
  // 3 outlets × (31 + 30) trading days: worldgen's 100-day history trades every day of both months.
  expect(await importShifts(["2026-08", "2026-09"])).toBe(3 * (31 + 30));
}, 900_000);

afterAll(async () => {
  clearInterval(timer);
  if (served) await new Promise((ok) => served.server.close(() => ok(undefined)));
  await api?.close();
  await svcPool?.end();
  await stub?.close();
  await db?.stop();
  if (blobDir) await rm(blobDir, { recursive: true, force: true });
});

describe("T-089a (2) on the margin_fall gate world", () => {
  const ids = {} as Record<"H" | "F" | "G" | "K", string>;

  it("(2a) missing settlement (ZM-C-H1 held): the approved plan stops after 1 step at waiting, H0 cannot_verify", async () => {
    // RG-F7 / RG-MF1: with shifts imported, September's only open close item is settlements_imported (11 held lines).
    ids.H = await openPlan();
    const v = await view(await owner(`/v1/investigations/${ids.H}:approve-plan`, {}));
    expect([v.status, v.stop_reason, v.steps_done, statusOf(v).data_complete]).toEqual(["waiting", "waiting", 1, "cannot_verify"]);
    expect(await steps(ids.H)).toEqual([{ step_no: 1, triggered_by: "plan" }]);
    // (2c)'s investigation: a member step on this world freezes supplier_price (the key's "before" bridge supports H1).
    ids.F = await openPlan();
    const f = await view(await owner(`/v1/investigations/${ids.F}:continue`, { step_no: 1 }));
    expect([f.status, statusOf(f).supplier_price, f.checklist.find((c) => c.item_id === "supplier_price")!.frozen]).toEqual(["waiting", "supported", true]);
    ids.K = await openPlan();
    expect((await view(await owner(`/v1/investigations/${ids.K}:continue`, { step_no: 1 }))).status).toBe("waiting");
  });

  it("(2b) the complete world: a fresh plan runs to done in exactly 1 step, supported = the key's list, stop_reason null", async () => {
    const held = await db.admin<{ draft_id: string }>(
      `SELECT d.id::text AS draft_id FROM core.import_run ir JOIN core.document doc ON doc.tenant_id = ir.tenant_id AND doc.id = ir.document_id
         JOIN core.draft d ON d.tenant_id = ir.tenant_id AND d.id = ir.draft_id
        WHERE ir.tenant_id = $1 AND doc.filename = 'ZM-C-held.csv' AND ir.status = 'previewed' AND d.status = 'proposed'`, [tenant]);
    expect(held.rows.length).toBe(1);
    expect([200, 201]).toContain(await approveDraft(held.rows[0]!.draft_id, "t089a:approve:ZM-C-held.csv"));
    ids.G = await openPlan();
    const v = await view(await owner(`/v1/investigations/${ids.G}:approve-plan`, {}));
    expect([v.status, v.stop_reason, v.steps_done]).toEqual(["done", null, 1]);
    expect(supported(v)).toEqual(SUPPORTED);
    expect(await steps(ids.G)).toEqual([{ step_no: 1, triggered_by: "plan" }]);
  });

  it("(6) the waiting plan of (2a) resumes by the member's :continue at steps_done + 1 → done", async () => {
    const v = await view(await owner(`/v1/investigations/${ids.H}:continue`, { step_no: 2 }));
    expect([v.status, v.stop_reason, v.steps_done]).toEqual(["done", null, 2]);
    expect(await steps(ids.H)).toEqual([{ step_no: 1, triggered_by: "plan" }, { step_no: 2, triggered_by: "member" }]);
  });

  it("(2c) a planted flip of the frozen item: one approval runs steps 2 (reopened → open) and 3 (done), 0 member calls", async () => {
    // The T-083 gate-4 plant: a large early-August paneer receipt at September's landed cost, so August's average cost
    // meets September's and the supplier-price effect all but vanishes. Data only (superuser, triggers off, as a plant).
    await db.admin(`BEGIN; SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE plant ON COMMIT DROP AS
  SELECT m.* FROM core.stock_movement m JOIN core.ingredient i ON i.tenant_id = m.tenant_id AND i.id = m.ingredient_id
   WHERE m.tenant_id = '${tenant}' AND lower(i.name) LIKE 'paneer%' AND m.kind = 'receipt'
     AND m.at >= '2026-09-01T00:00:00+05:30' AND m.at < '2026-10-01T00:00:00+05:30' ORDER BY m.at LIMIT 1;
UPDATE plant SET id = '${uuidv7()}', at = '2026-08-01T09:00:00+05:30', batch_id = NULL,
  qty_milli = 10 * (SELECT sum(m.qty_milli) FROM core.stock_movement m WHERE m.tenant_id = plant.tenant_id
                     AND m.ingredient_id = plant.ingredient_id AND m.kind = 'receipt'
                     AND m.at >= '2026-08-01T00:00:00+05:30' AND m.at < '2026-09-01T00:00:00+05:30');
INSERT INTO core.stock_movement SELECT * FROM plant;
COMMIT;`);
    const r = await owner(`/v1/investigations/${ids.F}:approve-plan`, {});
    expect(r.headers.get(REPLAYED_HEADER)).toBeNull();
    const v = await view(r);
    expect([v.status, v.stop_reason, v.steps_done, statusOf(v).supplier_price]).toEqual(["done", null, 3, "refuted"]);
    expect(await steps(ids.F)).toEqual([{ step_no: 1, triggered_by: "member" }, { step_no: 2, triggered_by: "plan" }, { step_no: 3, triggered_by: "plan" }]);
    const upd = v.steps[1]!.item_updates.find((u) => u.item_id === "supplier_price")!;
    expect([upd.reopened, upd.from, upd.to]).toEqual([true, "supported", "refuted"]);
  });

  it("(2d) R-D: a gate flip at the final re-mint gives waiting, not open", async () => {
    const two = await view(await owner(`/v1/investigations/${ids.K}:continue`, { step_no: 2 }));
    expect([two.status, statusOf(two).data_complete, two.checklist.find((c) => c.item_id === "data_complete")!.frozen]).toEqual(["open", "supported", true]);
    await db.admin(`BEGIN; SET LOCAL session_replication_role = replica;
UPDATE core.shift SET opened_at = opened_at - interval '62 days', closed_at = closed_at - interval '62 days'
 WHERE id = (SELECT id FROM core.shift WHERE tenant_id = '${tenant}' AND status = 'closed'
              AND opened_at >= '2026-09-10T00:00:00+05:30' AND opened_at < '2026-09-11T00:00:00+05:30' ORDER BY id LIMIT 1);
COMMIT;`);
    const three = await view(await owner(`/v1/investigations/${ids.K}:continue`, { step_no: 3 }));
    expect([three.status, statusOf(three).data_complete]).toEqual(["waiting", "cannot_verify"]);
    const upd = three.steps[2]!.item_updates.find((u) => u.item_id === "data_complete")!;
    expect([upd.reopened, upd.from, upd.to]).toEqual([true, "supported", "cannot_verify"]);
  });
});
