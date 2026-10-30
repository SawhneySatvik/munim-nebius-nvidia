// [unit] P3: which model ran an item, in words. Expected names are the lane brief's (docs/plan/lanes/B.md: "Nemotron 3 Super",
// "Nemotron 3.5 Lightning", "Nemotron 3.5 Super VL", nvidia → "NVIDIA", nebius → "Token Factory", gemini → "Google"), typed by
// hand; ids are EVENTS-STATUS.md's for both endpoints. A model is named only from a route event that carries provider and
// model_id labels and a live or recorded-fallback path, and only from a call made for the item on screen: a finding's own
// narration (labelled with its id), a draft's specialist (`specialist:<pack>`), any call of an answer's run. intel's rules
// behind the expected values: only a high or critical finding newly stored is narrated (watch/pipeline.py NARRATE_AT), a
// sweep's drafts come from code, and the negotiation that writes a purchase order traces as specialist:inventory_purchasing.
import { describe, expect, it } from "vitest";
import { modelName, modelsOf, modelTags, providerName, type CallsFor, type TraceEvent } from "@/lib/munim/models";
import { createStaffClient } from "@/lib/munim/staff";
import { DEMO_PEOPLE, DEMO_TENANT_ID } from "@/lib/munim/session";
import { handleStaff, resetStaffBooks } from "@/mock-server/staff";

const RUN = "019f0000-0000-7000-8000-0000000000b1";
let seq = 0;
const ev = (kind: string, actor: string, payload: Record<string, string>): TraceEvent =>
  ({ run_id: RUN, id: `019f0000-0000-7000-8000-${String(++seq).padStart(12, "0")}`, seq, parent_id: null, actor, at: "2026-10-24T01:00:00.000Z", kind, payload }) as TraceEvent;
const call = (actor: string, path: string, provider?: string, modelId?: string, labels: Record<string, string> = {}) =>
  ev("route", actor, { model_path: path, ...(provider ? { provider } : {}), ...(modelId ? { model_id: modelId } : {}), ...labels });
const tags = (events: TraceEvent[], of: CallsFor) => modelTags(modelsOf(events, of));
const LIGHTNING = "nvidia/nemotron-3.5-lightning-30b-a3b", SUPER = "nvidia/nemotron-3-super-120b-a12b", VL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

describe("model and provider names", () => {
  it("Nemotron on NVIDIA's endpoint and on Token Factory read the same", () => {
    expect([
      modelName("nvidia/nemotron-3-super-120b-a12b"),
      modelName("nvidia/nemotron-3.5-lightning-30b-a3b"),
      modelName("nvidia/Nemotron-3_5-Lightning"),
      modelName("nvidia/nemotron-3.5-super-vl-120b-a12b"),
      modelName("nvidia/Nemotron-3.5-Super-VL"),
      modelName("nvidia/Nemotron-3-Ultra-550b-a55b"),
      modelName("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"),
    ]).toEqual(["Nemotron 3 Super", "Nemotron 3.5 Lightning", "Nemotron 3.5 Lightning", "Nemotron 3.5 Super VL", "Nemotron 3.5 Super VL", "Nemotron 3 Ultra", "Nemotron 3 Nano"]);
  });
  it("Gemini ids name themselves; an unknown id is shown as it is", () => {
    expect([modelName("gemini-3.5-flash-lite"), modelName("gemini-3.8-flash"), modelName("gemini-2.5-pro"), modelName("meta/llama-3.3-70b-instruct")])
      .toEqual(["Gemini 3.5 Flash-Lite", "Gemini 3.8 Flash", "Gemini 2.5 Pro", "meta/llama-3.3-70b-instruct"]);
  });
  it("providers", () => {
    expect([providerName("nvidia"), providerName("nebius"), providerName("gemini"), providerName("someone")]).toEqual(["NVIDIA", "Token Factory", "Google", "someone"]);
  });
});

describe("the models a run used", () => {
  it("today's live trace (a served path, no provider or model labels) names no model: the agent shows alone", () => {
    const events = [ev("route", "watcher:people", { agent: "narrate" }), ev("subagent_start", "watcher:people", { agent: "narrate" }), call("watcher:people", "live")];
    expect(modelsOf(events, "answer")).toEqual([]);
    expect(tags(events, "answer")).toEqual([]);
  });
  it("a live call with both labels names its model and provider", () => {
    expect(tags([call("manager", "live", "nvidia", SUPER)], "answer")).toEqual(["Nemotron 3 Super · NVIDIA"]);
    expect(tags([call("manager", "live", "nebius", SUPER)], "answer")).toEqual(["Nemotron 3 Super · Token Factory"]);
  });
  it("a recorded fallback says so; an abstained call names nothing; a label on another kind of event is not a call", () => {
    expect(tags([call("manager", "recorded-fallback", "nvidia", SUPER)], "answer")).toEqual(["Nemotron 3 Super (recorded) · NVIDIA"]);
    expect(modelsOf([call("manager", "abstained", "nvidia", SUPER)], "answer")).toEqual([]);
    expect(modelsOf([ev("subagent_start", "manager", { model_path: "live", provider: "nvidia", model_id: SUPER })], "answer")).toEqual([]);
  });
  it("an answer: every model of its run, one tag each, in the order first used", () => {
    const events = [call("manager", "live", "nvidia", LIGHTNING), call("branch:finance", "live", "nvidia", SUPER), call("manager", "live", "nvidia", LIGHTNING), call("manager", "live", "gemini", "gemini-3.5-flash-lite")];
    expect(tags(events, "answer")).toEqual(["Nemotron 3.5 Lightning · NVIDIA", "Nemotron 3 Super · NVIDIA", "Gemini 3.5 Flash-Lite · Google"]);
    expect(tags([call("manager", "live", "nvidia", VL), call("manager", "live", "nvidia", "nvidia/Nemotron-3.5-Super-VL")], "answer")).toEqual(["Nemotron 3.5 Super VL · NVIDIA"]);
  });
});

describe("one sweep, one watcher: a model only on the finding it narrated, never on a sibling or the sweep's draft", () => {
  const F1 = "019f0000-0000-7000-8000-00000000f001", F2 = "019f0000-0000-7000-8000-00000000f002", F3 = "019f0000-0000-7000-8000-00000000f003";
  // One watch sweep as intel traces it: the stock watcher stores F1 (high: narrated) and F2 (medium: template only, no
  // call), drafts from F2 by code; the people watcher narrates F3 with another model; one more stock call names no finding.
  const sweep = [
    ev("finding", "watcher:inventory_purchasing", { detector: "inventory.waste_spike", finding_id: F1, outcome: "stored" }),
    call("watcher:inventory_purchasing", "live", "nvidia", LIGHTNING, { finding_id: F1 }),
    ev("finding", "watcher:inventory_purchasing", { detector: "inventory.below_reorder", finding_id: F2, outcome: "stored" }),
    ev("draft", "watcher:inventory_purchasing", { command_type: "purchasing.po.create.v1", draft_id: "019f0000-0000-7000-8000-00000000d001", status: "proposed" }),
    ev("finding", "watcher:people", { detector: "people.labour_pct_high", finding_id: F3, outcome: "stored" }),
    call("watcher:people", "live", "gemini", "gemini-3.8-flash", { finding_id: F3 }),
    call("watcher:inventory_purchasing", "live", "nvidia", SUPER),
  ];
  it("the narrated finding names its narration's model; its sibling of the same watcher and run names none", () => {
    expect(tags(sweep, { finding: F1 })).toEqual(["Nemotron 3.5 Lightning · NVIDIA"]);
    expect(tags(sweep, { finding: F2 })).toEqual([]);
    expect(tags(sweep, { finding: F3 })).toEqual(["Gemini 3.8 Flash · Google"]);
  });
  it("a call that names no finding lights none (until intel labels its narrations, no finding shows a model)", () => {
    expect(tags([call("watcher:inventory_purchasing", "live", "nvidia", LIGHTNING)], { finding: F1 })).toEqual([]);
  });
  it("the sweep's draft shows its agent only", () => {
    expect(tags(sweep, { draft: "inventory_purchasing" })).toEqual([]);
    expect(tags(sweep, { draft: "people" })).toEqual([]);
  });
});

describe("a draft: only its specialist's own calls", () => {
  it("the negotiation that wrote a purchase order names each model it used (reading the replies, choosing)", () => {
    const negotiation = [call("specialist:inventory_purchasing", "live", "nvidia", VL), call("specialist:inventory_purchasing", "live", "nvidia", SUPER)];
    expect(tags(negotiation, { draft: "inventory_purchasing" })).toEqual(["Nemotron 3.5 Super VL · NVIDIA", "Nemotron 3 Super · NVIDIA"]);
    expect(tags(negotiation, { draft: "finance" })).toEqual([]);
    expect(tags(negotiation, { draft: null })).toEqual([]);
  });
  it("an investigation branch or the Manager answering does not lend its model to a draft", () => {
    expect(tags([call("branch:finance", "live", "nvidia", SUPER), call("manager", "live", "nvidia", LIGHTNING)], { draft: "finance" })).toEqual([]);
  });
});

describe("through the staff client, against a stubbed core trace response", () => {
  const stub = (events: TraceEvent[], status = 200) => async () =>
    new Response(status === 200 ? JSON.stringify({ run_id: RUN, events, next_after_seq: null }) : JSON.stringify({ error: { code: "not_found", message: "x" } }), { status, headers: { "content-type": "application/json" } });
  const client = (fetch: typeof globalThis.fetch) => createStaffClient({ baseUrl: "http://core.test", token: () => "t", tenantId: "019f0000-0000-7000-8000-000000000001", fetch });

  it("a labelled trace reads as the model; a trace this person can't open (404) reads as none", async () => {
    const ok = await client(stub([call("specialist:inventory_purchasing", "live", "nebius", "nvidia/Nemotron-3.5-Super-VL")])).getTraces(RUN);
    expect(ok.ok && tags(ok.data.events, { draft: "inventory_purchasing" })).toEqual(["Nemotron 3.5 Super VL · Token Factory"]);
    const gone = await client(stub([], 404)).getTraces(RUN);
    expect(gone.ok).toBe(false);
  });
});

describe("mock: every run an inbox item names has a trace the owner can read", () => {
  it("each finding's and draft's run answers 200 (a missing one is a 404 in the browser console)", async () => {
    resetStaffBooks();
    const get = async (path: string) => {
      const url = new URL(`http://mock.test/mock${path}`);
      const owner = DEMO_PEOPLE.find((p) => p.key === "owner")!.token;
      return handleStaff(new Request(url, { headers: { Authorization: `Bearer ${owner}`, "X-Munim-Tenant": DEMO_TENANT_ID } }), path, url, new Date());
    };
    const inbox = (await (await get("/v1/inbox")).json()) as { items: ({ kind: "finding"; finding: { run_id: string } } | { kind: "draft"; draft: { run_id: string | null } })[] };
    const runs = [...new Set(inbox.items.flatMap((i) => { const r = i.kind === "finding" ? i.finding.run_id : i.draft.run_id; return r ? [r] : []; }))];
    // The seeded sweeps (waste, kitchen, food at risk) and the two purchase-order negotiations (nuts, pooled butter).
    expect(runs.length).toBe(5);
    const missing = [];
    for (const r of runs) if ((await get(`/v1/traces/${r}`)).status !== 200) missing.push(r);
    expect(missing).toEqual([]);
  });
});
