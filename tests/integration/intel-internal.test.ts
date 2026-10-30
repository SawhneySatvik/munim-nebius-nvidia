// T-040 flow — intel's whole write path over real HTTP into the real composition root, then a person decides.
// A run token for outlet 1 (scope from the token only) claims an event, mints the below-reorder snapshot, writes a
// finding, a reorder-level draft whose numbers are refs, an answer and a trace batch through /internal/intel/v1.
// Clause 1 over that window: intel wrote NO book row (munim_svc has no book grant; drafts wait for a person). Then the
// owner approves the draft over /v1: the one book change is the reorder level, under the decision; the chain verifies.
// Hand: buildWorld puts each outlet's reorder level for its one ingredient at 9 000 000 with 5 000 000 on hand, so
// below_reorder for outlet 1 is exactly 1 row; the proposal re-states that row's min and par (an upsert → 1 update).
import { snapRef } from "../../packages/contracts/src/index.ts";
import { configureInternal } from "../../services/core-api/src/internal/index.ts";
import { mintRunToken } from "../../services/core-api/src/runtoken/index.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, type Res, startEnv, uuidv7, type World, world } from "./harness.ts";

const SECRET = "s".repeat(64);
let env: Env;
let w: World;
let owner: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
let token = "";
const ids = { draft: uuidv7(), finding: uuidv7(), answer: uuidv7(), snapshot: "" };

const intel = async (path: string, body: unknown): Promise<Res> => {
  const r = await fetch(`${env.base}/internal/intel/v1/${path}`, {
    method: "POST", body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "x-munim-service-secret": SECRET, "content-type": "application/json" },
  });
  return { status: r.status, body: await r.json(), headers: r.headers };
};

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  configureInternal(env.api.deps, { serviceSecret: SECRET, keys: env.api.keys });
  mark = await watermark(env, w.tenant);
  ({ token } = await mintRunToken({ ...env.api.keys, svc: env.api.svc },
    { tenantId: w.tenant, outletScope: [w.outlets[0]], trigger: "event", actor: "watcher:inventory_purchasing" }));
});
afterAll(async () => env?.stop());

describe("intel writes through /internal/intel/v1, then a person approves", () => {
  it("claim, snapshot, finding, draft, answer, traces → 200/201 each; scope is outlet 1", async () => {
    expect((await intel("events:claim", { event_id: uuidv7() })).status).toBe(200);
    const snap = await intel("snapshots", { template_id: "inventory.below_reorder", params: {} });
    expect([snap.status, snap.body.row_count, snap.body.rows[0].outlet_id]).toEqual([201, 1, w.outlets[0]]);
    ids.snapshot = snap.body.snapshot_id;
    const S = ids.snapshot;
    const f = await intel("findings", {
      pack: "inventory_purchasing", type: "inventory.below_reorder", severity: "high", confidence_bp: 9000, dedupe_key: `int:${S}`,
      envelope: { finding_id: ids.finding, impact_ref: snapRef(S, 0, "on_hand_milli"), abstained: false,
        segments: [{ text: `Stock of ⟨snap:${S}·0·ingredient_name⟩ is under its reorder level ⟨snap:${S}·0·min_qty_milli⟩.`, refs: [`snap:${S}`] }] },
    });
    expect([f.status, f.body.outcome]).toEqual([201, "stored"]);
    const d = await intel("drafts", {
      draft_id: ids.draft, pack: "inventory_purchasing", command_type: "inventory.reorder_level.set.v1", outlet_ids: [w.outlets[0]], finding_id: ids.finding,
      payload: { outlet_id: w.outlets[0], ingredient_id: w.ingredient, min_qty_milli: snapRef(S, 0, "min_qty_milli"), par_qty_milli: snapRef(S, 0, "par_qty_milli") },
      evidence: [`snap:${S}`], based_on: [snapRef(S, 0, "on_hand_milli")],
    });
    expect([d.status, d.body]).toEqual([201, { draft_id: ids.draft, status: "proposed", reason_code: null }]);
    const a = await intel("answers", { question: "Why is stock short?", envelope: { answer_id: ids.answer, abstained: false,
      segments: [{ text: `⟨snap:${S}·0·ingredient_name⟩ is under its reorder level.`, refs: [`snap:${S}`] }] } });
    expect([a.status, a.body.abstained]).toEqual([201, false]);
    const t = await intel("traces:batch", { events: [1, 2, 3].map((seq) => ({ id: uuidv7(), seq, parent_id: null, actor: "watcher:inventory_purchasing",
      at: new Date().toISOString(), kind: "tool_call", payload: { tool: "read_below_reorder" } })) });
    expect([t.status, t.body]).toEqual([201, { inserted: 3, last_seq: 3 }]);
  });

  it("One Guarantee clause 1 over intel's writes: 0 book rows inserted or updated, nothing bad", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    expect([scan.inserted, scan.updated]).toEqual([{}, {}]);
  });

  it("the owner approves over /v1 → the reorder level changes under the decision; clause 1 clean; the chain verifies", async () => {
    const r = await env.http("POST", `/v1/drafts/${ids.draft}:approve`, owner, {
      command_id: uuidv7(), idempotency_key: `int-${ids.draft}`, type: "drafts.approve.v1",
      payload: { draft_id: ids.draft, command_type: "inventory.reorder_level.set.v1", edited_payload: null, reason: null } });
    expect(r.status).toBe(200);
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    expect([scan.inserted, scan.updated]).toEqual([{}, { reorder_level: 1 }]);
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
