// The Postgres graph backend (T-058 wiring; ADR-014 "Graph port"), this build's default. The five agent templates are core-owned SQL
// in this directory over intel.entity / intel.edge; intel names a template and passes only its arguments, which core checked
// (../index.ts checkArgs). `:tenant_id` and `:outlet_ids` are bound from the caller core verified, never from the body
// (bindNamedParams skips comments, so a `:name` in one is not a parameter). The statement runs on the caller's munim_svc
// transaction under its tenant and outlet scope. The graph tables are tenant-only under RLS, so every template reads the graph only
// through visible.sql's `vnode` / `vedge` (R-A 1: an outlet-scoped run sees no other outlet's nodes, edges, staff, customers,
// findings or claims, and walks through none). Rows: ids, kinds, names, hop counts, never a number to display. It serves no
// /v1/graph route (no `read`), so those routes are 404 with this backend.
import { readFileSync } from "node:fs";
import { bindNamedParams } from "../../../modules/approvals/snapshots.ts";
import { checkArgs } from "../index.ts";
import type { GraphBackend, GraphTemplate } from "../port.ts";

const read = (name: string) => readFileSync(new URL(`./${name}.sql`, import.meta.url), "utf8").trim();
const VISIBLE = read("visible");
const TEMPLATES: readonly GraphTemplate[] = ["price_shock_path", "dish_margin_drivers", "supplier_dependency", "claim_support", "neighbourhood"];
// A replacer function: as a string, the fragment's `$'` (the uuid regex) would be read as a replacement pattern.
const SQL = Object.fromEntries(TEMPLATES.map((t) => [t, read(t).replace("{{visible}}", () => VISIBLE)])) as Record<GraphTemplate, string>;

/** The statement for a template with its arguments checked (checkArgs) and the caller's tenant and outlet scope bound: `$n`
 *  text and values. */
export function graphStatement(template: string, args: Readonly<Record<string, unknown>>, tenantId: string, scope: readonly string[]): { text: string; values: unknown[] } {
  const params: Record<string, unknown> = { ...checkArgs(template, args), tenant_id: tenantId, outlet_ids: scope[0] === "*" ? null : scope };
  const { sql, names } = bindNamedParams(SQL[template as GraphTemplate]);
  return { text: sql, values: names.map((n) => params[n]) };
}

export const postgresGraph: GraphBackend = {
  mode: "postgres",
  async template(name, args, caller) {
    const { text, values } = graphStatement(name, args, caller.tenantId, caller.scope);
    return caller.tx(async (q) => (await q.query(text, values)).rows);
  },
};
