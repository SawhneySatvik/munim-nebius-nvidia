// Reads packages/contracts/generated/openapi/public.json (generated from the zod contracts — the runtime contract) and
// shapes it for the API reference. Server-only: pages read it while prerendering; only `searchIndex` reaches the browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_OPENAPI, repoRoot } from "./repo.ts";

// JSON Schema 2020-12 as emitted by the generator; kept loose on purpose (the renderer handles what it meets).
export type Schema = { [k: string]: unknown };
type Param = { name: string; in: string; required?: boolean; schema?: Schema; description?: string };
type Operation = {
  operationId: string;
  summary?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Param[];
  requestBody?: { required?: boolean; content?: Record<string, { schema?: Schema }> };
  responses: Record<string, { description?: string; content?: Record<string, { schema?: Schema }> }>;
};
type SecurityScheme = { type: string; scheme?: string; in?: string; name?: string; bearerFormat?: string; description?: string };
export type Spec = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema>; securitySchemes: Record<string, SecurityScheme> };
};

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export type Credential = { scheme: string; label: string; header: string };
export type OpView = {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  section: string;
  /** Each entry is one accepted credential set; an empty list means no credential at all. */
  auth: Credential[][];
  params: Array<{ name: string; in: string; required: boolean; schema: Schema; description: string | null }>;
  request: { required: boolean; schema: Schema } | null;
  responses: Array<{ status: string; description: string; schema: Schema | null; media: string | null }>;
};
export type Section = { slug: string; title: string; blurb: string; ops: OpView[] };

// Order is the reading order of the reference: what a storefront developer needs first, operator routes last.
const SECTIONS: Array<{ slug: string; title: string; blurb: string; keys: string[] }> = [
  { slug: "storefront", title: "Storefront", blurb: "What a customer-facing website calls with a storefront key: outlets, menus, pickup windows, checkout, order status and the live order tracker (GET /v1/stream). Payment is at the counter; nothing is charged online.", keys: ["storefront", "stream"] },
  { slug: "customer-account", title: "Customer account", blurb: "A signed-in customer's profile, consent, orders, loyalty, export and erasure at one business.", keys: ["account"] },
  { slug: "cares-network", title: "Munim Cares network", blurb: "Credential-free reads of opted-in businesses' surplus listings and the published network impact. Recipients are simulated.", keys: ["cares-network"] },
  { slug: "orders", title: "Orders, shifts and pickup", blurb: "Staff-side orders with server-side pricing, the allowed-transition table, cash shifts and pickup windows.", keys: ["orders", "pickup-windows", "shifts"] },
  { slug: "kitchen", title: "Kitchen", blurb: "The kitchen board, tickets, prep times and prep lists.", keys: ["kitchen"] },
  { slug: "catalogue", title: "Catalogue and menu", blurb: "Items, recipes, prices per outlet and channel, deals, coupons, availability and barcodes.", keys: ["catalogue"] },
  { slug: "inventory", title: "Inventory", blurb: "The append-only stock ledger: ingredients, waste, counts, transfers, receipts, batches and reorder levels.", keys: ["inventory"] },
  { slug: "purchasing", title: "Purchasing", blurb: "Suppliers, requests for quotes, purchase orders, goods received, supplier invoices and returns, and the supply graph (needs a graph backend). Suppliers in the demo are simulated.", keys: ["suppliers", "rfq-requests", "purchase-orders", "goods-received", "supplier-invoices", "supplier-returns", "graph"] },
  { slug: "finance", title: "Finance", blurb: "Settlements, bank lines, disputes, period close, channel terms, expenses and exports. Payments are recorded, never processed.", keys: ["finance"] },
  { slug: "people", title: "People", blurb: "Staff, rosters, attendance, advances, payroll drafts, tips and training.", keys: ["people"] },
  { slug: "customers", title: "Customers and growth", blurb: "Customer records, loyalty, campaigns, reservations, reviews and bulk orders.", keys: ["customers", "loyalty", "campaigns", "reservations", "reviews", "bulk-orders"] },
  { slug: "compliance", title: "Compliance and assets", blurb: "Licences, assets, checklists, temperature logs, maintenance contracts and jobs.", keys: ["compliance"] },
  { slug: "cares", title: "Munim Cares (business)", blurb: "A business's own surplus listings, simulated recipients, hand-overs and shared surplus offers. Offer money is recorded, never processed.", keys: ["cares"] },
  { slug: "intelligence", title: "Ask, threads and evidence", blurb: "Ask the Manager or a specialist, read findings and the inbox, and open the snapshot rows behind every number.", keys: ["ask", "threads", "conversations", "findings", "inbox", "snapshots", "runs", "traces", "lineage", "specialists", "wiki"] },
  { slug: "investigations", title: "Investigations", blurb: "Multi-step investigations in Step, Plan or Auto mode; every plan and result waits for a person.", keys: ["investigations"] },
  { slug: "approvals", title: "Drafts and approvals", blurb: "Every change the AI proposes is a draft. A named person approves or rejects it.", keys: ["drafts", "draftables"] },
  { slug: "goals", title: "Goals and tasks", blurb: "Business goals and the tasks that serve them.", keys: ["goals", "tasks"] },
  { slug: "imports", title: "Imports", blurb: "Documents and files in, as drafts: preview, approval, then commit under the approver.", keys: ["imports"] },
  { slug: "business", title: "Business setup and members", blurb: "The business, outlets, brands, channels, devices, members, storefront keys, the storefront page, targets and AI policy.", keys: ["tenant", "outlets", "brands", "channels", "devices", "members", "storefront-keys", "storefront-pages", "onboarding", "me", "policy", "ai"] },
  { slug: "platform", title: "Platform operator", blurb: "Munim operator routes: tenants, country packs, plans, flags, budgets and model roles, changed through approved config drafts.", keys: [] },
];
const OTHER = { slug: "other", title: "Other", blurb: "Operations not yet placed in a section.", keys: [] as string[] };

const CREDENTIALS: Record<string, string> = {
  storefrontKey: "Storefront key",
  customerToken: "Customer token",
  guestToken: "Guest token",
  memberToken: "Member token",
  tenantHeader: "Tenant header",
  operatorToken: "Operator token",
  runToken: "Run token",
  serviceCredential: "Service credential",
};

let cached: Spec | null = null;
export function loadSpec(): Spec {
  cached ??= JSON.parse(readFileSync(join(repoRoot(), ...PUBLIC_OPENAPI), "utf8")) as Spec;
  return cached;
}

/** `/v1/storefront/orders/{id}` → "storefront"; `/v1/customers:upsert` → "customers"; `/platform/v1/...` → "platform". */
export function pathKey(path: string): string {
  const m = /^\/(platform\/)?v1\/([^/:{]+)/.exec(path);
  if (!m) return "";
  return m[1] ? "platform" : m[2]!;
}

function sectionOf(path: string): string {
  const key = pathKey(path);
  if (key === "platform") return "platform";
  return SECTIONS.find((s) => s.keys.includes(key))?.slug ?? OTHER.slug;
}

function credential(spec: Spec, scheme: string): Credential {
  const s = spec.components.securitySchemes[scheme];
  const header = s?.type === "http" ? "Authorization: Bearer …" : s?.name ?? scheme;
  return { scheme, label: CREDENTIALS[scheme] ?? scheme, header };
}

export function refName(ref: string): string {
  return ref.replace(/^#\/components\/schemas\//, "");
}

function jsonSchema(content: Record<string, { schema?: Schema }> | undefined): Schema | null {
  return content?.["application/json"]?.schema ?? null;
}

/** A success body that is not JSON: today only GET /v1/stream (text/event-stream). */
function otherMedia(content: Record<string, { schema?: Schema }> | undefined): string | null {
  if (!content || jsonSchema(content)) return null;
  return Object.keys(content)[0] ?? null;
}

export function operations(spec: Spec = loadSpec()): OpView[] {
  const order = [...SECTIONS.map((s) => s.slug), OTHER.slug];
  const ops: OpView[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      ops.push({
        operationId: op.operationId,
        method,
        path,
        summary: op.summary ?? "",
        section: sectionOf(path),
        auth: (op.security ?? []).map((set) => Object.keys(set).map((k) => credential(spec, k))),
        params: (op.parameters ?? []).map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required ?? false,
          schema: p.schema ?? {},
          description: p.description ?? null,
        })),
        request: op.requestBody ? { required: op.requestBody.required ?? false, schema: jsonSchema(op.requestBody.content) ?? {} } : null,
        responses: Object.entries(op.responses)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([status, r]) => ({ status, description: r.description ?? "", schema: jsonSchema(r.content), media: otherMedia(r.content) })),
      });
    }
  }
  // Stable: section order first, then the generator's own path order within a section.
  return ops
    .map((op, i) => ({ op, i }))
    .sort((a, b) => order.indexOf(a.op.section) - order.indexOf(b.op.section) || a.i - b.i)
    .map(({ op }) => op);
}

export function sections(spec: Spec = loadSpec()): Section[] {
  const ops = operations(spec);
  return [...SECTIONS, OTHER]
    .map((s) => ({ slug: s.slug, title: s.title, blurb: s.blurb, ops: ops.filter((o) => o.section === s.slug) }))
    .filter((s) => s.ops.length > 0);
}

export type SearchEntry = { id: string; method: string; path: string; summary: string; section: string; sectionTitle: string };
export function searchIndex(spec: Spec = loadSpec()): SearchEntry[] {
  return sections(spec).flatMap((s) =>
    s.ops.map((o) => ({ id: o.operationId, method: o.method, path: o.path, summary: o.summary, section: s.slug, sectionTitle: s.title })),
  );
}

/** Operations whose request or success response names this schema at the top level. */
export function usedBy(name: string, spec: Spec = loadSpec()): OpView[] {
  const ref = `#/components/schemas/${name}`;
  return operations(spec).filter(
    (o) => o.request?.schema["$ref"] === ref || o.responses.some((r) => r.status.startsWith("2") && r.schema?.["$ref"] === ref),
  );
}

/** Every named schema in the published document gets a page. The generator prunes public.json itself (it keeps schemas
 *  that operations name only in their descriptions, e.g. StreamEvent), so this does not re-prune by $ref. */
export function schemaNames(spec: Spec = loadSpec()): string[] {
  return Object.keys(spec.components.schemas);
}

/** The document as published on the site: public.json as generated. */
export function publicDocument(spec: Spec = loadSpec()): Spec {
  return spec;
}

/** The shared error body's codes and the reason codes, straight from the spec. */
export function errorCodes(spec: Spec = loadSpec()): { codes: string[]; reasons: string[] } {
  const body = spec.components.schemas["Error"]?.["properties"] as Record<string, Schema> | undefined;
  const inner = body?.["error"]?.["properties"] as Record<string, Schema> | undefined;
  const codes = (inner?.["code"]?.["enum"] as string[] | undefined) ?? [];
  const reasons = (spec.components.schemas["ReasonCode"]?.["enum"] as string[] | undefined) ?? [];
  return { codes, reasons };
}
