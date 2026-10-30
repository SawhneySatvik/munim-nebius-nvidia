// Gates (T-080, BOARD W3.0 b-80) over packages/contracts/generated/ontology.json. Every expected value comes from a
// source the generator never reads: MANIFEST.d `proposal.*` lines, db/tests/manifest.ts (hand-kept tables and
// templates, review minor 8), the pack md §6 tables (new-entity ids, hand list below) and the specialist registry.
// Each refusal is paired with an accept; test/ontology-redproof.sh proves each gate exits non-zero when planted.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_TABLES, BOOK_TABLES, EXPECTED_COUNTS, TEMPLATES, TENANT_TABLES } from "../../../db/tests/manifest.ts";
import { mc1aTemplates } from "../../../db/tests/template-spec.ts";
import { SPECIALIST_REGISTRY } from "../src/intel/specialists.ts";
import { lintToolSchema } from "../src/ontology/lint.ts";
import { bodyDigest, inputsDigest, ONTOLOGY_FILE } from "../src/ontology/stamp.ts";
import type { Json } from "../src/ontology/transform.ts";
import { manifestNames } from "./helpers.ts";

type Action = { command_type: string; tool: string | null; agent_exposed: boolean; stages: string[]; auto_apply: boolean; model_schema: Json | null };
type Fn = { id: string; version: number; tool: string | null; agent_exposed: boolean; model_schema: Json | null };
type Ontology = {
  objects: Array<{ name: string; tenant: boolean; tag: string | null }>;
  links: { foreign_keys: unknown[]; projection_edges: string[] };
  functions: Fn[];
  actions: Action[];
  specialists: Array<{ id: string; templates: string[]; draftables: string[] }>;
  stamp: { inputs: { sha256: string; files: Record<string, string> }; body_sha256: string };
};
const raw = JSON.parse(readFileSync(ONTOLOGY_FILE, "utf8")) as Ontology & Record<string, unknown>;
const ont = raw as Ontology;

// ADR-014 §5.1, by hand: the import workflows alone produce these drafts.
// purchasing.invoice.record.v1 is a workflow draftable (ADR-014 §5.1 hand list in src/ontology/actions.ts), not agent-exposed.
// R-B S1-B / S1-D (orchestrator ruling, 11 Oct): coupon.set and campaign.create have no model path yet.
// ADR-015: cares.listing.publish.v1 is a workflow draftable (the expiry_risk Cares mapping).
const NOT_EXPOSED = ["imports.format.approve.v1", "imports.run.commit.v1", "purchasing.invoice.record.v1", "catalogue.coupon.set.v1", "customers.campaign.create.v1", "cares.listing.publish.v1"];
// 0012 CHECK on intel.edge.kind as ADR-014 §2.1 lists it, by hand.
const EDGE_KINDS = ["about", "contradicts", "mentions", "proposes", "quoted", "sold", "supplies", "supported_by", "uses", "wasted", "works_at"];
// New-entity ids, read off each pack md §6 row (a row the command creates), keyed by command + JSON pointer.
const NEW_ENTITY_IDS: Array<[string, string]> = [
  ["catalogue.price.set.v1", "price_id"],
  ["catalogue.recipe.version.create.v1", "recipe_version_id"],
  ["compliance.maintenance.schedule.v1", "maintenance_id"],
  ["customers.campaign.create.v1", "campaign_id"],
  ["finance.dispute.draft.v1", "dispute_id"],
  ["finance.journal.adjust.v1", "journal_entry_id"],
  ["finance.period.close.v1", "period_close_id"],
  ["goals.goal.create.v1", "goal_id"],
  ["goals.task.create.v1", "task_id"],
  ["inventory.transfer.create.v1", "transfer_id"],
  ["kitchen.prep_list.create.v1", "prep_list_id"],
  ["people.payroll_draft.create.v1", "payroll_draft_id"],
  ["people.roster.create.v1", "roster_id"],
  ["people.roster.create.v1", "shifts.*.roster_shift_id"],
  ["purchasing.invoice.dispute.v1", "dispute_id"],
  ["purchasing.po.create.v1", "po_id"],
  ["purchasing.supplier_return.create.v1", "supplier_return_id"],
];
const FORBIDDEN = /tenant|^run_id$|actor/; // = the generator's FORBIDDEN_PARAM; `negotiation_run_id` is an ordinary id param

/** Every property name declared anywhere in a schema. */
function propertyNames(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => propertyNames(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "properties" && v && typeof v === "object") out.push(...Object.keys(v));
      propertyNames(v, out);
    }
  }
  return out;
}
/** A dotted path (`a.*.b`) inside a schema, or undefined. */
function at(schema: Json, dotted: string): Json | undefined {
  let n: Json | undefined = schema;
  for (const seg of dotted.split(".")) {
    if (!n) return undefined;
    n = seg === "*" ? (n.items as Json | undefined) : ((n.properties as Json | undefined)?.[seg] as Json | undefined);
  }
  return n;
}
const tools = (o: Ontology) => [...o.functions, ...o.actions].filter((t) => t.tool !== null && t.model_schema !== null) as Array<{ tool: string; model_schema: Json }>;
const exposed = (o: Ontology) => o.actions.filter((a) => a.agent_exposed);
const contract = (type: string) => JSON.parse(readFileSync(new URL(`../generated/json-schema/proposal.${type}.schema.json`, import.meta.url), "utf8")) as Json;
function forbiddenParams(o: Ontology): string[] {
  return tools(o).flatMap((t) => propertyNames(t.model_schema).filter((n) => FORBIDDEN.test(n)).map((n) => `${t.tool}.${n}`));
}
function lintFailures(o: Ontology): string[] {
  return tools(o).flatMap((t) => lintToolSchema(t.model_schema).map((v) => `${t.tool} ${v}`));
}

describe("ontology.json", () => {
  it("(1) actions = MANIFEST.d proposal.* lines (24); agent-exposed = 24 − 6 not-exposed = 18, each preview → approve → commit, never auto-apply", () => {
    const proposals = manifestNames().filter((n) => n.startsWith("proposal.")).map((n) => n.slice("proposal.".length)).sort();
    console.log(`actions: ${ont.actions.length} in ontology; MANIFEST.d proposal lines: ${proposals.length}; agent-exposed: ${exposed(ont).length}`);
    expect(proposals.length).toBe(24); // 22 + purchasing.invoice.record (0022) + cares.listing.publish (ADR-015)
    expect(ont.actions.map((a) => a.command_type).sort()).toEqual(proposals);
    const want = proposals.filter((p) => !NOT_EXPOSED.includes(p));
    expect(want.length).toBe(18);
    expect(exposed(ont).map((a) => a.command_type).sort()).toEqual(want);
    for (const a of ont.actions) expect([a.command_type, a.stages, a.auto_apply]).toEqual([a.command_type, ["preview", "approve", "commit"], false]);
    for (const a of ont.actions.filter((x) => !x.agent_exposed)) expect([a.tool, a.model_schema]).toEqual([null, null]);
  });

  it("(2) 18/18 agent-exposed propose schemas and every read schema pass the provider lint; a planted oneOf is caught", () => {
    const failures = lintFailures(ont);
    console.log(`provider lint: ${exposed(ont).length} propose + ${ont.functions.filter((f) => f.agent_exposed).length} read schemas, ${failures.length} violation(s)`);
    expect(exposed(ont).filter((a) => a.model_schema !== null).length).toBe(18);
    expect(failures).toEqual([]);
    const planted = structuredClone(ont);
    const po = planted.actions.find((a) => a.command_type === "purchasing.po.create.v1")!.model_schema!;
    (po.properties as Json).currency = { oneOf: [{ type: "string" }, { type: "null" }] };
    expect(lintFailures(planted)).toEqual(["propose_purchasing_po_create /currency: keyword oneOf", "propose_purchasing_po_create /currency: type undefined"]);
  });

  it("(3) fresh: the recorded input sha256s equal the files now, and the body is unedited", () => {
    const now = inputsDigest();
    const drift = [...new Set([...Object.keys(now.files), ...Object.keys(ont.stamp.inputs.files)])].sort().filter((f) => now.files[f] !== ont.stamp.inputs.files[f]);
    console.log(`freshness: ${Object.keys(now.files).length} input files, ${drift.length} drifted ${JSON.stringify(drift)}`);
    expect(Object.keys(now.files).filter((f) => f.startsWith("db/migrations/")).length).toBeGreaterThanOrEqual(19);
    expect({ drift, sha256: now.sha256 }, "an input changed — run `make ontology` (after `make contracts`)").toEqual({ drift: [], sha256: ont.stamp.inputs.sha256 });
    expect(bodyDigest(raw), "ontology.json was edited by hand — run `make ontology`").toBe(ont.stamp.body_sha256);
  });

  it("(4a) object types = db/tests/manifest.ts tables (147 / 133 tenant / 92 book)", () => {
    const names = ont.objects.map((o) => o.name).sort();
    console.log(`objects: ${names.length} (manifest ${EXPECTED_COUNTS.all}); tenant ${ont.objects.filter((o) => o.tenant).length} (${EXPECTED_COUNTS.tenant}); book ${ont.objects.filter((o) => o.tag === "book").length} (${EXPECTED_COUNTS.book})`);
    expect(names).toEqual([...ALL_TABLES].sort());
    expect(names.length).toBe(EXPECTED_COUNTS.all);
    expect(ont.objects.filter((o) => o.tenant).map((o) => o.name).sort()).toEqual([...TENANT_TABLES].sort());
    expect(ont.objects.filter((o) => o.tag === "book").map((o) => o.name).sort()).toEqual([...BOOK_TABLES].sort());
    expect(ont.links.projection_edges).toEqual(EDGE_KINDS);
  });

  // Blocked: db/tests/manifest.ts carries no hand FK count (requested from the migrator). Counting FKs from the catalog
  // the generator reads would be self-referential (review minor 8), so this stays skipped until `fk` lands there.
  const fk = (EXPECTED_COUNTS as Record<string, number>).fk;
  it.skipIf(fk === undefined)("(4b) foreign keys = db/tests/manifest.ts EXPECTED_COUNTS.fk", () => {
    expect(ont.links.foreign_keys.length).toBe(fk);
  });

  it("(4c) functions = db/tests/manifest.ts TEMPLATES ⊇ the M-C1 ids parsed from the pack docs; operator templates are not agent-exposed", () => {
    const parsed = mc1aTemplates().map((t) => t.id);
    console.log(`functions: ${ont.functions.length} (manifest ${TEMPLATES.length}; M-C1a ids parsed from the docs ${parsed.length}); read tools ${ont.functions.filter((f) => f.agent_exposed).length}`);
    // TEMPLATES lists every version: "x" is v1, "x@2" is v2. The ontology keeps the latest version of each id.
    const latest = new Map<string, number>();
    for (const t of TEMPLATES) {
      const [id, v] = t.split("@") as [string, string | undefined];
      latest.set(id, Math.max(latest.get(id) ?? 0, v ? Number(v) : 1));
    }
    const v2 = TEMPLATES.filter((t) => t.endsWith("@2")).length;
    // 68 ids = 96 manifest entries − 26 "@2" rows (each @2 shadows its v1; 0022 brought 15, 0023 nine more, 0025 one:
    // investigation_cost_estimate v2, 0026 one: labour_vs_demand v2) − 2 "@3" rows (0024: settlement_vs_orders v3, 0026:
    // deal_inputs v3, each shadowing its v2). 0028 (ADR-015 §1.6, §2.3) adds five v1 ids: cares.recipient_match, cares.pickup_crew,
    // cares.listings, cares.impact, platform.cares_network_impact → 101 entries, 73 ids. 0033 (T-127: the latest forecast run per
    // outlet) adds six later versions of existing ids — kitchen.prep_need@2, forecast.points@2, inventory.shortfall@3,
    // inventory.expiry_risk@3, market.upcoming@3, purchasing.deal_inputs@4 → 107 entries, 28 "@2" rows, ids unchanged. 0035 (R71:
    // "Send me offers" is email consent only) adds customers.consented_audience@2 → 108 entries, 29 "@2" rows, ids unchanged.
    expect([TEMPLATES.length, v2, latest.size]).toEqual([112, 30, 74]);
    expect(ont.functions.map((f) => [f.id, f.version]).sort()).toEqual([...latest].sort());
    expect(parsed.length).toBe(14);
    expect(parsed.filter((id) => !ont.functions.some((f) => f.id === id))).toEqual([]);
    // Not agent-exposed, by hand: 3 intel.* (0020) + 1 platform operator template + the 4 ADR-014 §5.1 input-only/review-only
    // templates (forecast.sales_history, forecast.slot_profile per forecast.md §3; purchasing.deal_inputs, purchasing.invoice_duplicates per
    // inventory-purchasing.md §3) + 0028's 3 (ADR-015: cares.recipient_match and cares.pickup_crew are read by mapping code only;
    // platform.cares_network_impact is the operator's). 73 distinct ids − 11 = 62 exposed.
    expect(ont.functions.filter((f) => !f.agent_exposed).map((f) => f.id).sort()).toEqual([
      "cares.pickup_crew", "cares.recipient_match", "forecast.sales_history", "forecast.slot_profile", "intel.agent_track_record",
      "intel.ai_budget_left", "intel.investigation_cost_estimate", "platform.cares_network_impact", "platform.spend_by_tenant",
      "purchasing.deal_inputs", "purchasing.invoice_duplicates",
    ]);
    expect(latest.size - 11).toBe(63);
    expect(ont.functions.filter((f) => f.agent_exposed).length).toBe(63);
  });

  it("(5) 0 tenant / run / actor parameters in every generated tool schema; a planted one is caught", () => {
    const hits = forbiddenParams(ont);
    console.log(`parameter scan: ${tools(ont).length} tool schemas, ${hits.length} forbidden ${JSON.stringify(hits)}`);
    expect(tools(ont).length).toBe(18 + 63); // 18 agent-exposed proposals (24 − 6) + 62 agent-exposed templates (see 4c; 0028 exposes cares.listings and cares.impact to market — recipient_match and pickup_crew are not agent-exposed, network_impact is operator)
    expect(hits).toEqual([]);
    const planted = structuredClone(ont);
    const pnl = planted.functions.find((f) => f.id === "finance.pnl")!.model_schema!;
    (pnl.properties as Json).tenant_id = { type: "string" };
    (pnl.properties as Json).actor_id = { type: "string" };
    const first = exposed(planted)[0]!;
    (first.model_schema!.properties as Json).run_id = { type: "string" };
    expect(forbiddenParams(planted).sort()).toEqual([`${first.tool}.run_id`, "read_finance_pnl.actor_id", "read_finance_pnl.tenant_id"]);
  });

  it("(6) new-entity ids (pack §6 hand list) are in the contract and absent from the model schema", () => {
    expect(NEW_ENTITY_IDS.length).toBe(17);
    for (const [type, field] of NEW_ENTITY_IDS) {
      expect(at(contract(type), field), `${type} contract has ${field}`).toBeDefined();
      const model = ont.actions.find((a) => a.command_type === type)!.model_schema!;
      expect(at(model, field), `${type} model schema must not carry ${field}`).toBeUndefined();
    }
    // the accept side: an existing-entity id stays, as a handle
    expect(at(ont.actions.find((a) => a.command_type === "catalogue.deal.end.v1")!.model_schema!, "deal_id")).toBeDefined();
  });

  it("(7) each specialist binds only its registry templates and draftables", () => {
    for (const s of ont.specialists) {
      const reg = SPECIALIST_REGISTRY.specialists.find((r) => r.id === s.id)!;
      expect(s.templates.filter((t) => !reg.templates.includes(t)), s.id).toEqual([]);
      expect(s.draftables.filter((d) => !reg.draftables.includes(d)), s.id).toEqual([]);
    }
    expect(ont.specialists.find((s) => s.id === "catalogue")!.templates.length).toBe(6);
  });
});
