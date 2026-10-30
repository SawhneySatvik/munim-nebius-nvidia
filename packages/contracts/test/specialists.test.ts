// Gate (T-087a): the specialist registry against sources it does not derive from — the ledger R45 F8 hand
// list, the pack md files (parsed here, not via the registry), and MANIFEST.d `proposal.*` lines.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPECIALIST_REGISTRY, SpecialistRegistry } from "../src/intel/specialists.ts";
import { DraftsRequest } from "../src/internal/index.ts";
import { loadRegistry } from "../src/registry.ts";
import { citeRef, snapRef } from "../src/shared/refs.ts";
import { PKG, loadSamples, manifestNames } from "./helpers.ts";

type Registry = typeof SPECIALIST_REGISTRY;
const PACKS_DIR = join(PKG, "..", "..", "docs", "plan", "packs");

// Ledger R45 F8, by hand: Menu & Pricing (catalogue), Kitchen, Inventory & Purchasing, Finance, People,
// Customers & Growth, Compliance & Assets, Market & Strategy. Ids are the BOARD/ADR pack ids; three differ from their pack file names (see FILE).
const F8_SPECIALISTS = ["catalogue", "kitchen", "inventory_purchasing", "finance", "people", "customers", "compliance", "market"];
// ADR-014 §5.1: `imports.*` drafts come only from the import workflows, so no specialist proposes them.
// purchasing.invoice.record.v1 is a workflow draftable (ADR-014 §5.1 hand list, src/ontology/actions.ts NOT_AGENT_EXPOSED).
// R-B S1-B / S1-D (orchestrator ruling, 11 Oct): coupon.set and campaign.create have no model path yet.
// ADR-015: cares.listing.publish.v1 is a workflow draftable (the expiry_risk Cares mapping), never a model tool.
const NOT_AGENT_EXPOSED = ["imports.format.approve.v1", "imports.run.commit.v1", "purchasing.invoice.record.v1", "catalogue.coupon.set.v1", "customers.campaign.create.v1", "cares.listing.publish.v1"];
// ADR-014 §5.1: input-only (forecast sales_history, slot_profile) and review-only (deal_inputs, invoice_duplicates).
// ADR-015: the Cares follow-ups (pickup_crew, people §3; recipient_match, no §3 row) are mapping inputs, not tools. Same list as scripts/ontology.ts.
const NOT_AGENT_EXPOSED_TEMPLATES = ["forecast.sales_history", "forecast.slot_profile", "purchasing.deal_inputs", "purchasing.invoice_duplicates", "cares.pickup_crew", "cares.recipient_match"];
// Hand count of detector rows over the nine pack md §4 tables (6+4+8+5+4+5+6+3 specialist rows, +3 forecast).
const DETECTOR_ROWS = 44;

const packFiles = readdirSync(PACKS_DIR).filter((f) => f.endsWith(".md")).sort();
const packText = (file: string) => readFileSync(join(PACKS_DIR, file), "utf8");
/** First-cell backticked ids of the table rows under `## <n> ·` in a pack file. */
function tableIds(file: string, section: number): string[] {
  const m = packText(file).match(new RegExp(`^## ${section} · [\\s\\S]*?(?=^## ${section + 1} · )`, "m"));
  if (!m) throw new Error(`${file}: no section ${section}`);
  return [...m[0].matchAll(/^\| `([a-z_]+\.[a-z_]+)`/gm)].map((r) => r[1]!);
}
const commandsOf = (file: string) => [...packText(file).match(/^## 6 · [\s\S]*?(?=^## 7 · )/m)![0].matchAll(/^\| `([a-z_.]+\.v1)`/gm)].map((r) => r[1]!);
const FILE: Record<string, string> = { customers: "customers-growth.md", compliance: "compliance-assets.md", market: "market-strategy.md" };
const fileOf = (id: string) => FILE[id] ?? `${id.replaceAll("_", "-")}.md`;

/** id → owner ids, for every id in `expected`; returns the ids owned by 0 or by ≥ 2 entries. */
function ownership(reg: Registry, expected: string[], field: "detectors" | "templates") {
  const unowned: string[] = [];
  const multiple: string[] = [];
  for (const id of expected) {
    const owners = reg.specialists.filter((s) => s[field].includes(id)).length;
    if (owners === 0) unowned.push(id);
    if (owners > 1) multiple.push(id);
  }
  return { unowned, multiple };
}
const clashes = (reg: Registry) => {
  const all = reg.specialists.flatMap((s) => s.aliases);
  return [...new Set(all.filter((a, i) => all.indexOf(a) !== i))];
};
const plant = (mut: (r: Registry) => void): Registry => {
  const c = structuredClone(SPECIALIST_REGISTRY);
  mut(c);
  return c;
};
const by = (id: string) => SPECIALIST_REGISTRY.specialists.find((s) => s.id === id)!;

describe("specialist registry", () => {
  it("(1) 8 specialists = the F8 hand list; exactly 1 manager and 1 forecast service", () => {
    expect(SpecialistRegistry.safeParse(SPECIALIST_REGISTRY).success).toBe(true);
    const team = SPECIALIST_REGISTRY.specialists.filter((s) => s.kind === "specialist").map((s) => s.id);
    expect(F8_SPECIALISTS).toHaveLength(8);
    expect(team.sort()).toEqual([...F8_SPECIALISTS].sort());
    expect(SPECIALIST_REGISTRY.specialists.filter((s) => s.kind === "manager").map((s) => s.id)).toEqual(["manager"]);
    expect(SPECIALIST_REGISTRY.specialists.filter((s) => s.kind === "service").map((s) => s.id)).toEqual(["forecast"]);
    expect(new Set(SPECIALIST_REGISTRY.specialists.map((s) => s.id)).size).toBe(10);
    // every team member has its own desk and name key; desks are distinct
    const desks = SPECIALIST_REGISTRY.specialists.map((s) => s.desk_key).filter((d) => d !== null);
    expect(new Set(desks).size).toBe(desks.length);
    expect(by("forecast").desk_key).toBeNull();
  });

  it("(2) each pack file except forecast.md maps to exactly 1 specialist", () => {
    const files = packFiles.filter((f) => f !== "forecast.md");
    expect(files).toHaveLength(8);
    for (const f of files) {
      expect(SPECIALIST_REGISTRY.specialists.filter((s) => s.kind === "specialist" && fileOf(s.id) === f).map((s) => s.id), f).toHaveLength(1);
    }
    expect(packFiles).toContain("forecast.md");
    // the planted rename (id with no pack file) is caught by the same lookup
    const planted = plant((r) => void (r.specialists.find((s) => s.id === "kitchen")!.id = "kitchens"));
    expect(planted.specialists.filter((s) => s.kind === "specialist" && fileOf(s.id) === "kitchen.md")).toHaveLength(0);
  });

  it("(3) every detector id in the pack md tables is owned by exactly 1 entry", () => {
    const ids = packFiles.flatMap((f) => tableIds(f, 4));
    expect(ids).toHaveLength(DETECTOR_ROWS);
    expect(new Set(ids).size).toBe(DETECTOR_ROWS);
    expect(ownership(SPECIALIST_REGISTRY, ids, "detectors")).toEqual({ unowned: [], multiple: [] });
    // nothing owned that the packs do not define
    expect(SPECIALIST_REGISTRY.specialists.flatMap((s) => s.detectors).sort()).toEqual([...ids].sort());
    // a detector lists each pack's rows under its own pack
    for (const s of SPECIALIST_REGISTRY.specialists.filter((x) => x.kind !== "manager")) expect(s.detectors.slice().sort(), s.id).toEqual(tableIds(fileOf(s.id), 4).sort());
  });

  it("(3 red) a planted duplicate and a planted drop are both reported", () => {
    const ids = packFiles.flatMap((f) => tableIds(f, 4));
    const dup = plant((r) => void by_(r, "kitchen").detectors.push("finance.tender_gap"));
    expect(ownership(dup, ids, "detectors").multiple).toEqual(["finance.tender_gap"]);
    const drop = plant((r) => void by_(r, "people").detectors.pop());
    expect(ownership(drop, ids, "detectors").unowned).toEqual(["people.advance_unrecovered"]);
  });

  it("agent-exposed templates: owned once, within the pack's §3 table; the unexposed remainder is the hand list", () => {
    // ADR-014 §7.3 adds one template outside the pack tables: finance.margin_bridge (finance specialist, 0019).
    const ADR_TEMPLATES = ["finance.margin_bridge"];
    // Registry-only ids: 0022, assigned by orchestrator 11 Oct. The pack md §3 tables lag them.
    const REGISTRY_ONLY_0022 = ["purchasing.invoices", "inventory.counts", "inventory.count_variance", "finance.gst_summary", "market.goals"];
    const all = [...packFiles.flatMap((f) => tableIds(f, 3)), ...ADR_TEMPLATES, ...REGISTRY_ONLY_0022];
    const exposed = all.filter((t) => !NOT_AGENT_EXPOSED_TEMPLATES.includes(t));
    expect(ownership(SPECIALIST_REGISTRY, exposed, "templates")).toEqual({ unowned: [], multiple: [] });
    expect(SPECIALIST_REGISTRY.specialists.flatMap((s) => s.templates).sort()).toEqual([...exposed].sort());
    // ADR-014 §5.1 per-skill read-tool counts (before shared tools): catalogue 6, kitchen 5, inventory 9, finance 7, people 6, customers 7, compliance 5, market 6
    // plus margin_bridge (finance +1) and the 0022 ids (inventory +3, finance +1, market +1).
    const reads = F8_SPECIALISTS.map((id) => by(id).templates.length);
    // ADR-015: market +2 (cares.listings, cares.impact) → 9.
    expect(reads).toEqual([6, 5, 12, 9, 6, 7, 5, 10]);
    // F3: reads + proposes stay <= 20 per specialist (inventory_purchasing: 12 + 5 = 17). Workflow draftables bind no tool,
    // so they are not counted; graph tools are bound by the skill and gated in intel (tests/packs/test_skills.py).
    const tools = F8_SPECIALISTS.map((id, i) => reads[i]! + by(id).draftables.length);
    expect(tools[F8_SPECIALISTS.indexOf("inventory_purchasing")]).toBe(17);
    for (const n of tools) expect(n).toBeLessThanOrEqual(20);
  });

  it("(4) each agent-exposed draftable (18 of the 24 `proposal.*` lines) is proposable by >= 1 specialist", () => {
    const all = manifestNames().filter((n) => n.startsWith("proposal.")).map((n) => n.slice("proposal.".length));
    expect(all).toHaveLength(24); // 22 + purchasing.invoice.record (0022) + cares.listing.publish (ADR-015)
    const exposed = all.filter((t) => !NOT_AGENT_EXPOSED.includes(t));
    expect(exposed).toHaveLength(18);
    const proposed = SPECIALIST_REGISTRY.specialists.flatMap((s) => s.draftables);
    for (const t of exposed) expect(proposed.filter((p) => p === t).length, t).toBeGreaterThanOrEqual(1);
    for (const t of NOT_AGENT_EXPOSED) expect(proposed, t).not.toContain(t);
    // Workflow draftables (DECISIONS 11 Oct, W3.2; ADR-015 §4), by hand: ingestion's invoice and the Cares donation listing
    // under inventory_purchasing, the Cares pack-and-hand-over task under people. A workflow draftable is never one of its
    // own specialist's propose draftables, and is a model tool for no one unless another specialist proposes it (goals.task).
    const workflow = SPECIALIST_REGISTRY.specialists.flatMap((s) => s.workflow_draftables.map((w) => `${s.id}:${w}`));
    // R67 (T-128): the customers win-back campaign, drafted by the regulars_lapsing mapping on demo businesses only.
    expect(workflow).toEqual(["inventory_purchasing:purchasing.invoice.record.v1", "inventory_purchasing:cares.listing.publish.v1", "people:goals.task.create.v1",
      "customers:customers.campaign.create.v1"]);
    for (const sp of SPECIALIST_REGISTRY.specialists) {
      for (const w of sp.workflow_draftables) {
        expect(all, w).toContain(w);
        expect(sp.draftables, `${sp.id} ${w}`).not.toContain(w);
        // each Cares one is in its specialist's own pack §6 table (a missing row fails here). The ingestion invoice has no §6 row
        // (ADR-014 §5.1 hand list); that gap predates ADR-015 and is not this gate's.
        if (w !== "purchasing.invoice.record.v1") expect(commandsOf(fileOf(sp.id)), `${fileOf(sp.id)} §6 row for ${w}`).toContain(w);
        if (!proposed.includes(w)) expect(NOT_AGENT_EXPOSED, w).toContain(w);
      }
    }
    expect(by("inventory_purchasing").draftables).toContain("purchasing.po.create.v1");
    expect(new Set(proposed).size).toBe(18); // nothing outside the 18
    // the only shared one is goals.task.create (compliance + market)
    expect(SPECIALIST_REGISTRY.specialists.filter((s) => s.draftables.includes("goals.task.create.v1")).map((s) => s.id).sort()).toEqual(["compliance", "market"]);
    // each specialist proposes only commands its own pack §6 lists
    for (const id of F8_SPECIALISTS) expect(commandsOf(fileOf(id)), id).toEqual(expect.arrayContaining(by(id).draftables));
    // red: a planted unproposed draftable would fail the >= 1 rule
    const dropped = plant((r) => void (by_(r, "finance").draftables = by_(r, "finance").draftables.filter((d) => d !== "finance.period.close.v1")));
    expect(dropped.specialists.flatMap((s) => s.draftables)).not.toContain("finance.period.close.v1");
  });

  it("(5) mention aliases are unique across entries; a planted clash is reported", () => {
    const all = SPECIALIST_REGISTRY.specialists.flatMap((s) => s.aliases);
    expect(all.length).toBeGreaterThan(20);
    expect(clashes(SPECIALIST_REGISTRY)).toEqual([]);
    for (const id of F8_SPECIALISTS) expect(by(id).aliases.length, id).toBeGreaterThanOrEqual(2);
    expect(by("finance").aliases).toEqual(expect.arrayContaining(["finance", "accounts"]));
    expect(clashes(plant((r) => void by_(r, "people").aliases.push("accounts")))).toEqual(["accounts"]);
  });
});

const by_ = (r: Registry, id: string) => r.specialists.find((s) => s.id === id)!;

describe("workflow draft: based_on may be empty only when every numeric leaf is a document or quote ref (DECISIONS 11 Oct, W3.2)", async () => {
  await loadRegistry();
  const SAMPLES = await loadSamples();
  const invoice = SAMPLES["proposal.purchasing.invoice.record.v1"] as { lines: Array<Record<string, unknown>> };
  const base = SAMPLES["internal.drafts.request"] as Record<string, unknown>;
  const doc = "01920000-0000-7000-8000-000000000087";
  const workflowDraft = { ...base, command_type: "purchasing.invoice.record.v1", payload: invoice, outlet_ids: [], finding_id: null, evidence: [`doc:${doc}`], based_on: [] };
  const issues = (x: unknown) => { const r = DraftsRequest.safeParse(x); return r.success ? [] : r.error.issues.map((i) => i.path.join("/")); };

  it("accept: the ingestion invoice of inventory_purchasing, every number a doc span, based_on []", () => {
    expect(issues(workflowDraft)).toEqual([]);
  });

  it("accept: the same workflow draft whose numbers are a simulated supplier's quote rows (intel.supplier_quote, 0012)", () => {
    const quote = (n: number) => citeRef("row", `intel.supplier_quote:01920000-0000-7000-8000-00000000007${n}`);
    const lines = invoice.lines.map((l) => ({ ...l, qty_milli: quote(1), unit_price_minor: quote(2), tax_minor: quote(3) }));
    expect(issues({ ...workflowDraft, payload: { ...invoice, lines } })).toEqual([]);
    // …and a row of any other table is not a quote: refused with based_on []
    const other = invoice.lines.map((l) => ({ ...l, tax_minor: citeRef("row", "core.stock_movement:01920000-0000-7000-8000-000000000095") }));
    expect(issues({ ...workflowDraft, payload: { ...invoice, lines: other } })).toEqual(["based_on"]);
  });

  it("refuse: a normal (propose) draft with based_on [] — even with document refs only", () => {
    expect(issues({ ...base, based_on: [] })).toEqual(["based_on"]);
    const ret = SAMPLES["proposal.purchasing.supplier_return.create.v1"] as { lines: Array<Record<string, unknown>> };
    const docOnly = { ...ret, lines: ret.lines.map((l) => ({ ...l, qty_milli: citeRef("doc", doc, [1, 3]) })) };
    expect(issues({ ...base, command_type: "purchasing.supplier_return.create.v1", payload: docOnly, based_on: [] })).toEqual(["based_on"]);
  });

  it("refuse (ADR-015 §4): a people task draft with based_on [] — its match and crew cells must be cited so it can go stale", () => {
    const task = SAMPLES["proposal.goals.task.create.v1"] as Record<string, unknown>;
    const peopleTask = { ...base, pack: "people", command_type: "goals.task.create.v1", payload: { ...task, cares_listing_id: doc }, outlet_ids: [], finding_id: null, evidence: [`doc:${doc}`] };
    expect(issues({ ...peopleTask, based_on: [] })).toEqual(["based_on"]);
    expect(issues({ ...peopleTask, based_on: [snapRef("01920000-0000-7000-8000-000000000001", 0, "member_id")] })).toEqual([]);
  });

  it("refuse: the workflow type from another pack, or with a snapshot cell among its numbers, when based_on is []", () => {
    expect(issues({ ...workflowDraft, pack: "finance" })).toEqual(["based_on"]);
    const snapLine = { ...invoice.lines[0], tax_minor: snapRef("01920000-0000-7000-8000-000000000001", 0, "tax_minor") };
    expect(issues({ ...workflowDraft, payload: { ...invoice, lines: [snapLine] } })).toEqual(["based_on"]);
    // …and the same draft citing that cell in based_on is accepted (the snapshot rule, unchanged)
    expect(issues({ ...workflowDraft, payload: { ...invoice, lines: [snapLine] }, based_on: [snapLine.tax_minor] })).toEqual([]);
  });
});
