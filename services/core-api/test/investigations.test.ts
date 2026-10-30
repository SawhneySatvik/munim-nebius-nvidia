// T-083 core gates — investigations in Step mode (R45 F1, F10; ADR-014 §7.2–§7.5), through the real app on embedded
// Postgres (m-1's canonical world). intel is mocked at its boundary only (the NarratePort): the "up" fake stores its
// answer through the REAL internal API with the run token core minted, so core's validator runs.
//   (a) verdict rules (core-domain) against the RG-MF1 answer key's bridge rows, typed by hand in the key: supported
//       = supplier_price, waste, deals (the key: "H1, H2, H3 supported"), both before and after the held import;
//       the 1,000 bp bar at 999 / 1,000 on both signs; volume/mix nets two rows; close_status needs every month
//   (b) item → specialist = the hand list below (BOARD gate 8; derivation in core-domain/investigations/playbooks.ts)
//   (c) every template sentence passes core's number grammar (digit-free) for every verdict
//   (5) a member scoped to outlet 1 opening an all-outlet investigation → 404 (GET, :continue, create), paired accepts
//   (i) idempotency replay on create and :continue; another body under the same id → 409
//   (k) :continue twice concurrently → exactly 1 step (gapless; the second replays)
//   (7) intel down → the template narration, digit-free, every ref resolving, signed item by item; status computed
//   (l) intel up → its stored answer is linked to the step, untainted
// The restaurant_group gates (bridge Σ = key, supported = key, waiting → supported, the planted flip, real narration)
// run end to end in services/intel/tests/investigate/. Expected values are hand-written or read from the hand-kept
// answer key, never from the code under test. Synthetic data only.
import { readFileSync } from "node:fs";
import { createLogger } from "@munim/config";
import { REPLAYED_HEADER, snapRef } from "@munim/contracts";
import { InvestigationView, NarrateRequest, ROUTES } from "@munim/contracts/investigations";
import { checkGrammar } from "@munim/core-domain/envelope";
import { judge, MARGIN_FALL, nextStatus, type Snap, templateSentence } from "@munim/core-domain/investigations";
import { type TestDb, uuidv7 } from "@munim/db";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { createApp, TENANT_HEADER, type Deps } from "../src/app.ts";
import { verifyAuditChain } from "../src/commit/index.ts";
import { svcTx, testKeys } from "../src/commit/testkit.ts";
import { configureInternal } from "../src/internal/index.ts";
import { configureInvestigations } from "../src/modules/investigations/index.ts";
import { openDb } from "./db.ts";
import { buildTenant, type Tenant } from "./world.ts";

const idp = createLocalIdp();
const keys = testKeys();
const SECRET = "t083-test-service-secret-not-real-0123456789abcdef";
let db: TestDb;
let pools: { core: pg.Pool; svc: pg.Pool };
let deps: Deps;
let app: Awaited<ReturnType<typeof createApp>>;
let A: Tenant;

type Res = Omit<Response, "json"> & { json(): Promise<any> };
const count = async (sql: string, params: unknown[] = []) => Number((await db.admin<{ n: string }>(sql, params)).rows[0]!.n);
const call = async (sub: string, path: string, body?: unknown): Promise<Res> =>
  (await app.request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${idp.sign({ sub })}`, [TENANT_HEADER]: A.tenant, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })) as Res;
const internal = async (token: string, path: string, body: unknown): Promise<Res> =>
  (await app.request(`/internal/intel/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-munim-service-secret": SECRET, "content-type": "application/json" },
    body: JSON.stringify(body),
  })) as Res;

const PARAMS = { period_month: "2026-09-01", compare_month: "2026-08-01" };
const create = (sub: string, id = uuidv7(), extra: Record<string, unknown> = {}) =>
  call(sub, "/v1/investigations", { investigation_id: id, playbook_id: "margin_fall", params: PARAMS, ...extra });
const step = (sub: string, id: string, step_no: number) => call(sub, `/v1/investigations/${id}:continue`, { step_no });
const steps = (id: string) => count(`SELECT count(*) n FROM core.investigation_step WHERE investigation_id = $1`, [id]);

// ---- the RG-MF1 key, read from the hand-kept file (never from the code under test) -------------------------------------
const KEY = (JSON.parse(readFileSync(new URL("../../../tools/worldgen/answer-key/restaurant_group.json", import.meta.url), "utf8")) as {
  problems: Array<{ id: string; bridge?: Record<"before" | "after", Record<string, [number, number, number]>> }>;
}).problems.find((p) => p.id === "RG-MF1")!;
const bridgeSnap = (state: "before" | "after"): Snap => ({
  snapshot_id: uuidv7(),
  rows: Object.entries(KEY.bridge![state]).map(([component, [prior, current, share]]) => ({
    component, prior_minor: prior, current_minor: current, delta_minor: current - prior, share_bp: share,
  })),
});
const closeSnap = (open: Record<string, number>): Snap => ({
  snapshot_id: uuidv7(),
  rows: ["pos_days_closed", "settlements_imported", "bank_imported"].map((item_code) => ({ item_code, done: (open[item_code] ?? 0) === 0, open_count: open[item_code] ?? 0 })),
});
const item = (id: string) => MARGIN_FALL.items.find((i) => i.item_id === id)!;

beforeAll(async () => {
  db = await openDb();
  A = await buildTenant(db, "a");
  pools = { core: db.pool("munim_core", 8), svc: db.pool("munim_svc", 6) };
  const config = { nodeEnv: "test", redact: (s: string) => s };
  deps = { pools, idp, storefronts: async () => null, config, log: createLogger(config, () => {}) };
  app = await createApp(deps);
  configureInternal(deps, { serviceSecret: SECRET, keys, watchWindowMs: 0 });
});

afterAll(async () => {
  await pools?.core.end();
  await pools?.svc.end();
  await db?.stop();
});

describe("(a) verdicts are code, read from the snapshot (core-domain)", () => {
  // The key: "H1 supplier price (-3,698 bp), H2 waste (-2,040 bp) and H3 deals (-3,820 bp) supported …; H4 channel fees
  // (+752 bp, favourable) and H5 labour (0) refuted; H6 volume/mix nets -2,080 + 2,040 = -40 bp (refuted)".
  const SUPPORTED = ["deals", "supplier_price", "waste"];
  it.each(["before", "after"] as const)("on the key's %s bridge: supported = supplier_price, waste, deals; the rest refuted", (state) => {
    const snap = bridgeSnap(state);
    const out = Object.fromEntries(MARGIN_FALL.items.filter((i) => i.item_id !== "data_complete").map((i) => [i.item_id, judge(i.verdict, [snap]).status]));
    expect(Object.keys(out).filter((k) => out[k] === "supported").sort()).toEqual(SUPPORTED);
    expect(Object.keys(out).filter((k) => out[k] === "refuted").sort()).toEqual(["channel_fees", "labour", "volume_mix"]);
  });
  it("the 1,000 bp bar, in the direction of the total: 1,000 supported, 999 refuted; a same-size move against it refuted", () => {
    const rows = (share: number, total: number) => ({ snapshot_id: uuidv7(), rows: [
      { component: "labour", delta_minor: share, share_bp: share }, { component: "margin_delta_minor", delta_minor: total, share_bp: Math.sign(total) * 10000 }] });
    const rule = item("labour").verdict;
    expect([judge(rule, [rows(-1000, -5)]).status, judge(rule, [rows(-999, -5)]).status, judge(rule, [rows(1000, -5)]).status]).toEqual(["supported", "refuted", "refuted"]);
    expect([judge(rule, [rows(1000, 5)]).status, judge(rule, [rows(999, 5)]).status]).toEqual(["supported", "refuted"]);
    expect(judge(rule, [rows(-1000, 0)]).status).toBe("cannot_verify");
    expect(judge(rule, [null]).status).toBe("cannot_verify");
  });
  it("volume/mix is judged on revenue_volume + cogs_volume_mix together (-2,080 + 2,040 → refuted), cites both rows", () => {
    const j = judge(item("volume_mix").verdict, [bridgeSnap("after")]);
    expect(j.status).toBe("refuted");
    expect(j.cells.map((c) => `${c.row}.${c.column}`)).toEqual(["0.delta_minor", "0.share_bp", "4.delta_minor", "4.share_bp"]);
  });
  it("data complete needs all three items done in every month minted; a missing month is cannot_verify", () => {
    const rule = item("data_complete").verdict;
    expect(judge(rule, [closeSnap({}), closeSnap({})]).status).toBe("supported");
    expect(judge(rule, [closeSnap({ settlements_imported: 11 }), closeSnap({})]).status).toBe("cannot_verify");
    expect(judge(rule, [closeSnap({}), null]).status).toBe("cannot_verify");
    expect(judge(rule, [closeSnap({}), closeSnap({})]).cells).toHaveLength(6);
  });
  it("status (§7.4): gate not supported → waiting (cannot_verify at max); a driver + residual → done; none → no_driver_found", () => {
    const all = (s: Record<string, string>) => Object.fromEntries(MARGIN_FALL.items.map((i) => [i.item_id, s[i.item_id] ?? "refuted"])) as never;
    expect(nextStatus(MARGIN_FALL, all({ data_complete: "cannot_verify", deals: "supported" }), true, 1)).toBe("waiting");
    expect(nextStatus(MARGIN_FALL, all({ data_complete: "cannot_verify" }), true, 10)).toBe("cannot_verify");
    expect(nextStatus(MARGIN_FALL, all({ data_complete: "supported", deals: "supported" }), true, 2)).toBe("done");
    expect(nextStatus(MARGIN_FALL, all({ data_complete: "supported", deals: "supported" }), false, 2)).toBe("no_driver_found");
    expect(nextStatus(MARGIN_FALL, all({ data_complete: "supported" }), true, 2)).toBe("no_driver_found");
  });
});

describe("(b) each item names its owning specialist (BOARD gate 8: 7 items, hand list)", () => {
  const HAND: Record<string, string> = {
    data_complete: "finance", supplier_price: "inventory_purchasing", waste: "inventory_purchasing", deals: "catalogue",
    channel_fees: "finance", labour: "people", volume_mix: "catalogue",
  };
  it("7 items, each with the hand-listed specialist", () => {
    expect(Object.keys(HAND)).toHaveLength(7);
    expect(Object.fromEntries(MARGIN_FALL.items.map((i) => [i.item_id, i.specialist]))).toEqual(HAND);
  });
});

describe("(c) template narration is digit-free and cites", () => {
  const cells = [{ snapshot_id: uuidv7(), row: 3, column: "share_bp" }];
  it.each(MARGIN_FALL.items.flatMap((i) => (["supported", "refuted", "cannot_verify"] as const).map((v) => [i.item_id, v] as const)))("%s %s", (id, v) => {
    const text = templateSentence(item(id), v, cells);
    expect(checkGrammar(text)).toEqual({ ok: true });
    expect(text).toContain(snapRef(cells[0]!.snapshot_id, 3, "share_bp"));
  });
  it("RED-PROOF: a planted digit in a template fails the grammar", () => {
    expect(checkGrammar(`${templateSentence(item("labour"), "refuted", cells)} 2`).ok).toBe(false);
  });
});

describe("routes", () => {
  it("ROUTES documents the six routes this module mounts (T-083, T-084b, T-089a)", () => {
    expect(ROUTES.map((r) => `${r.method} ${r.path}`)).toEqual(["post /v1/investigations", "get /v1/investigations", "get /v1/investigations/{id}",
      "post /v1/investigations/{id}:continue", "post /v1/investigations/{id}:cancel", "post /v1/investigations/{id}:approve-plan"]);
  });

  it("unconfigured narration: the step is decided and stored, with no narration", async () => {
    const id = uuidv7();
    expect((await create(A.ownerSub, id)).status).toBe(201);
    const r = await step(A.ownerSub, id, 1);
    expect(r.status).toBe(200);
    const v = InvestigationView.parse(await r.json());
    expect([v.steps_done, v.steps.length, v.steps[0]!.narration]).toEqual([1, 1, null]);
  });
});

describe("(5) outlet scope: a member scoped to outlet 1 opening an all-outlet investigation → 404", () => {
  let all: string;
  beforeAll(async () => {
    all = uuidv7();
    expect((await create(A.ownerSub, all)).status).toBe(201);
  });
  it("the owner's investigation is all-outlet ['*'] and the owner opens it (200)", async () => {
    const r = await call(A.ownerSub, `/v1/investigations/${all}`);
    expect(r.status).toBe(200);
    expect(InvestigationView.parse(await r.json()).outlet_scope).toEqual(["*"]);
  });
  it("the outlet-1 manager: GET → 404, :continue → 404, and nothing is written", async () => {
    expect((await call(A.managerSub, `/v1/investigations/${all}`)).status).toBe(404);
    expect((await step(A.managerSub, all, 1)).status).toBe(404);
    expect(await steps(all)).toBe(0);
  });
  it("the outlet-1 manager creating an all-outlet investigation → 404; their own outlet-1 one → 201 and readable", async () => {
    expect((await create(A.managerSub, uuidv7(), { outlet_scope: ["*"] })).status).toBe(404);
    expect((await create(A.managerSub, uuidv7(), { outlet_scope: [A.outlets[1]] })).status).toBe(404);
    const own = uuidv7();
    const r = await create(A.managerSub, own);
    expect(r.status).toBe(201);
    expect(InvestigationView.parse(await r.json()).outlet_scope).toEqual([A.outlets[0]]);
    expect((await call(A.managerSub, `/v1/investigations/${own}`)).status).toBe(200);
  });
  it("a manager's step: every finance template is above a manager's role → items cannot_verify, status waiting (stored); the manager's view reads restricted (R-D)", async () => {
    const own = uuidv7();
    await create(A.managerSub, own);
    const v = InvestigationView.parse(await (await step(A.managerSub, own, 1)).json());
    const stored = (await db.admin<{ status: string; checklist: Array<{ status: string }> }>(`SELECT status, checklist FROM core.investigation WHERE id = $1`, [own])).rows[0]!;
    expect(stored.status).toBe("waiting");
    expect(new Set(stored.checklist.filter((c) => c.status !== "pending").map((c) => c.status))).toEqual(new Set(["cannot_verify"]));
    expect([v.status, new Set(v.checklist.map((c) => c.status))]).toEqual(["restricted", new Set(["restricted"])]);
  });
});

describe("(i) idempotency: the client's investigation id and step number", () => {
  it("create twice with one id → the same investigation, the second a replay; another body under it → 409", async () => {
    const id = uuidv7();
    const a = await create(A.ownerSub, id);
    const b = await create(A.ownerSub, id);
    expect([a.status, a.headers.get(REPLAYED_HEADER), b.status, b.headers.get(REPLAYED_HEADER)]).toEqual([201, null, 201, "true"]);
    expect(InvestigationView.parse(await b.json()).investigation_id).toBe(id);
    expect(await count(`SELECT count(*) n FROM core.investigation WHERE id = $1`, [id])).toBe(1);
    const c = await call(A.ownerSub, "/v1/investigations", { investigation_id: id, playbook_id: "margin_fall", params: { period_month: "2026-08-01", compare_month: "2026-07-01" } });
    expect([c.status, (await c.json()).error.code]).toEqual([409, "idempotency_conflict"]);
  });
  it(":continue {step_no: 1} twice → one step, the second a replay; a skipped number → 409 sequence_gap", async () => {
    const id = uuidv7();
    await create(A.ownerSub, id);
    const a = await step(A.ownerSub, id, 1);
    const b = await step(A.ownerSub, id, 1);
    expect([a.status, a.headers.get(REPLAYED_HEADER), b.status, b.headers.get(REPLAYED_HEADER)]).toEqual([200, null, 200, "true"]);
    expect(await steps(id)).toBe(1);
    const c = await step(A.ownerSub, id, 3);
    expect([c.status, (await c.json()).error.code]).toEqual([409, "sequence_gap"]);
    expect(await steps(id)).toBe(1);
    expect((await step(A.ownerSub, id, 2)).status).toBe(200);
    expect(await steps(id)).toBe(2);
  });
});

describe("(k) concurrency", () => {
  it(":continue {step_no: 1} twice at once → exactly 1 step row; one response is the replay", async () => {
    const id = uuidv7();
    await create(A.ownerSub, id);
    // Force the overlap: a superuser holds the step table, so both requests are inside their step transaction (one at
    // its step insert, the other at the investigation row lock — or both at the insert, without that lock) before
    // either can commit. Released once two backends wait on a lock.
    const blocker = await db.connect("admin");
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE core.investigation_step IN EXCLUSIVE MODE");
    const both = Promise.all([step(A.ownerSub, id, 1), step(A.ownerSub, id, 1)]);
    const waiting = () => count(`SELECT count(*) n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`);
    for (let i = 0; i < 200 && (await waiting()) < 2; i++) await new Promise((ok) => setTimeout(ok, 25));
    expect(await waiting()).toBe(2);
    await blocker.query("COMMIT");
    await blocker.end();
    const [a, b] = await both;
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.headers.get(REPLAYED_HEADER), b.headers.get(REPLAYED_HEADER)].sort()).toEqual(["true", null].sort());
    expect(await steps(id)).toBe(1);
    expect(await count(`SELECT steps_done n FROM core.investigation WHERE id = $1`, [id])).toBe(1);
  });
});

describe("narration", () => {
  let received: Array<{ token: string; body: unknown }> = [];
  it("(7) intel down → core's template, digit-free, every ref resolving, signed item by item; the status is computed", async () => {
    received = [];
    configureInvestigations(deps, { keys, narrate: async (token, body) => { received.push({ token, body }); throw new Error("down"); } });
    const id = uuidv7();
    await create(A.ownerSub, id);
    const v = InvestigationView.parse(await (await step(A.ownerSub, id, 1)).json());
    expect(received).toHaveLength(1);
    const req = NarrateRequest.parse(received[0]!.body);
    expect(req.owner).toBe("finance");
    const s = v.steps[0]!;
    expect(s.narration).not.toBeNull();
    const n = s.narration!;
    expect(n.envelope.abstained).toBe(false);
    expect(n.envelope.segments.map((x) => x.text)).toEqual(req.items.map((i) => i.template));
    for (const seg of n.envelope.segments) expect(checkGrammar(seg.text)).toEqual({ ok: true });
    const resolved = new Set(v.resolved_refs.map((r) => r.ref));
    const cited = n.envelope.segments.flatMap((x) => [...x.text.matchAll(/⟨[^⟩]*⟩/g)].map((m) => m[0]));
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((c) => !resolved.has(c))).toEqual([]);
    expect(n.signatures.map((x) => x.specialist)).toEqual(req.items.map((i) => i.specialist));
    expect(s.tainted).toBe(false);
    expect(v.status).toBe("waiting");
  });
  it("(l) intel up → the answer it stored under core's id is the step's narration, untainted", async () => {
    configureInvestigations(deps, {
      keys,
      narrate: async (token, raw) => {
        const req = NarrateRequest.parse(raw);
        const segments = req.items.map((i) => ({ text: `Narrated: ${i.cells[0]!.ref}.`, refs: [`snap:${/snap:([^·]+)/.exec(i.cells[0]!.ref)![1]}`] }));
        const a = await internal(token, "answers", { question: req.question, envelope: { answer_id: req.answer_id, segments, abstained: false, reason_code: null } });
        if (a.status !== 201) throw new Error(`fake intel: answers ${a.status}`);
        return { answer_id: req.answer_id, tainted: false, source: "model" };
      },
    });
    const id = uuidv7();
    await create(A.ownerSub, id);
    const v = InvestigationView.parse(await (await step(A.ownerSub, id, 1)).json());
    const n = v.steps[0]!.narration!;
    expect(n.envelope.segments.every((x) => x.text.startsWith("Narrated: "))).toBe(true);
    expect(await count(`SELECT count(*) n FROM core.investigation_step WHERE investigation_id = $1 AND run_id IS NOT NULL AND summary_answer_id = $2 AND NOT tainted`,
      [id, n.answer_id])).toBe(1);
    configureInvestigations(deps, { keys, narrate: null });
  });
  it("(m) intel stores a segment more than it was given items → not linked (signatures go by position)", async () => {
    configureInvestigations(deps, {
      keys,
      narrate: async (token, raw) => {
        const req = NarrateRequest.parse(raw);
        const segments = [...req.items, req.items[0]!].map((i) => ({ text: `Narrated: ${i.cells[0]!.ref}.`, refs: [`snap:${/snap:([^·]+)/.exec(i.cells[0]!.ref)![1]}`] }));
        const a = await internal(token, "answers", { question: req.question, envelope: { answer_id: req.answer_id, segments, abstained: false, reason_code: null } });
        if (a.status !== 201) throw new Error(`fake intel: answers ${a.status}`);
        return { answer_id: req.answer_id, tainted: false, source: "model" };
      },
    });
    const id = uuidv7();
    await create(A.ownerSub, id);
    const v = InvestigationView.parse(await (await step(A.ownerSub, id, 1)).json());
    expect([v.steps_done, v.steps[0]!.narration]).toEqual([1, null]);
    configureInvestigations(deps, { keys, narrate: null });
  });
});

describe("clause 1: investigating writes no book (operational rows only, ADR-014 §7.2: no drafts)", () => {
  /** Every core table tagged munim:book (R29) that carries a tenant_id: one md5 over its rows of this tenant. */
  async function books(): Promise<Record<string, string>> {
    const tables = (await db.admin<{ t: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND obj_description(c.oid, 'pg_class') = 'munim:book'
          AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
        ORDER BY 1`)).rows.map((r) => r.t);
    const out: Record<string, string> = {};
    for (const t of [...tables, "core.audit_log", "core.command_log", "core.draft", "core.decision"]) {
      out[t] = (await db.admin<{ h: string }>(`SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM ${t} x WHERE x.tenant_id = $1`,
        [A.tenant])).rows[0]!.h;
    }
    return out;
  }
  it("create + 3 steps with narration: 0 book, audit, command, draft or decision rows change; snapshots and answers do; the audit chain verifies", async () => {
    configureInvestigations(deps, { keys, narrate: async () => { throw new Error("down"); } });
    const before = await books();
    const evidence = () => count(`SELECT (SELECT count(*) FROM evidence.snapshot WHERE tenant_id = $1) + (SELECT count(*) FROM intel.answer WHERE tenant_id = $1) AS n`, [A.tenant]);
    const written = await evidence();
    const id = uuidv7();
    expect((await create(A.ownerSub, id)).status).toBe(201);
    for (const n of [1, 2, 3]) expect((await step(A.ownerSub, id, n)).status).toBe(200);
    expect(Object.keys(before).length).toBeGreaterThan(20);
    expect(await evidence()).toBeGreaterThan(written);
    expect(await books()).toEqual(before);
    const v = await verifyAuditChain(svcTx(db), A.tenant);
    expect([v.ok, v.rows > 0]).toEqual([true, true]);
    configureInvestigations(deps, { keys, narrate: null });
  });
});
