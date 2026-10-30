// Gate (One Guarantee clause 2, R68 G-2): no `/v1/graph/*` response can carry a number. Every number a person sees comes from
// a snapshot cell; the graph routes return ids, names, codes, booleans, lists and cell refs only. Walks the JSON Schema of each
// graph route's response (zod's output form, what core-api serialises) and the generated file the SDK and Pydantic read.
// Independent expectations: the three routes and the boolean leaves of each response, counted by hand from the graph design
// (§5.2, §6.1), never from the schemas under test.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadRegistry } from "../src/registry.ts";
import { PKG } from "./helpers.ts";

type Node = Record<string, unknown>;
const reg = await loadRegistry();
const graphRoutes = reg.routes.filter((r) => r.path.startsWith("/v1/graph/"));

/** Every leaf type a schema position can take, as `<path> <type>`; a position with no type (accepts anything) is "any". */
function leaves(node: unknown, path = "$"): string[] {
  if (node === true) return [`${path} any`];
  if (node === false || node === null || typeof node !== "object") return [];
  const o = node as Node;
  const out: string[] = [];
  const types = (Array.isArray(o.type) ? o.type : o.type === undefined ? [] : [o.type]) as string[];
  for (const t of types) if (t !== "object" && t !== "array") out.push(`${path} ${t}`);
  if (typeof o.const === "number" || (Array.isArray(o.enum) && o.enum.some((v) => typeof v === "number"))) out.push(`${path} number-const`);
  if (types.length === 0 && !["$ref", "anyOf", "oneOf", "allOf", "const", "enum"].some((k) => k in o)) out.push(`${path} any`);
  if (o.properties) for (const [k, v] of Object.entries(o.properties as Node)) out.push(...leaves(v, `${path}.${k}`));
  for (const k of ["items", "additionalProperties", "patternProperties"]) if (o[k] && typeof o[k] === "object") out.push(...leaves(o[k], `${path}.${k}`));
  for (const k of ["anyOf", "oneOf", "allOf", "prefixItems"]) if (Array.isArray(o[k])) (o[k] as unknown[]).forEach((s, i) => out.push(...leaves(s, `${path}.${k}[${i}]`)));
  if (o.$defs) for (const [k, v] of Object.entries(o.$defs as Node)) out.push(...leaves(v, `$defs.${k}`));
  return out;
}
const numeric = (ls: string[]) => ls.filter((l) => / (number|integer|number-const|any)$/.test(l));

describe("/v1/graph/* responses carry no number (R68, One Guarantee clause 2)", () => {
  it("the three graph routes are registered, each with a response schema", () => {
    expect(graphRoutes.map((r) => `${r.method.toUpperCase()} ${r.path}`).sort()).toEqual([
      "GET /v1/graph/ingredients/{id}", "GET /v1/graph/sole-sources", "GET /v1/graph/suppliers/{id}",
    ]);
  });

  // Hand count of boolean leaves: ingredient = sources[].simulated + dishes[].outlets[].available; supplier = supplier.simulated
  // + only_source + other_sources[].simulated + quoted_by[].simulated + dishes[].outlets[].available; sole-sources = sources[].simulated.
  const BOOLEANS: Record<string, number> = { "v1.graph.ingredient": 2, "v1.graph.supplier": 5, "v1.graph.sole-sources": 1 };

  it.each(Object.keys(BOOLEANS))("%s: no number, integer or untyped leaf (zod output and the generated file)", (name) => {
    expect(graphRoutes.some((r) => r.response === name)).toBe(true);
    const schema = reg.schemas.find(([n]) => n === name)![1];
    const fromZod = leaves(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }));
    const generated = leaves(JSON.parse(readFileSync(join(PKG, "generated", "json-schema", `${name}.schema.json`), "utf8")));
    for (const ls of [fromZod, generated]) {
      expect(ls.filter((l) => l.endsWith(" boolean")).length, `${name}: boolean leaves`).toBe(BOOLEANS[name]);
      expect(ls.filter((l) => l.endsWith(" string")).length, `${name}: string leaves`).toBeGreaterThan(3);
      expect(numeric(ls)).toEqual([]);
    }
  });
});
