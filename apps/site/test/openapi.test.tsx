import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Operation } from "../components/Operation.tsx";
import { loadSpec, operations, publicDocument, schemaNames, searchIndex, sections } from "../lib/openapi.ts";
import { repoRoot } from "../lib/repo.ts";

// The expected count comes straight from the file, not from lib/openapi.ts.
const raw = JSON.parse(readFileSync(join(repoRoot(), "packages/contracts/generated/openapi/public.json"), "utf8")) as {
  paths: Record<string, Record<string, { operationId: string }>>;
};
const expected = Object.entries(raw.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([m]) => ["get", "post", "put", "patch", "delete"].includes(m))
    .map(([method, op]) => ({ path, method, id: op.operationId })),
);

describe("API reference covers every operation in public.json", () => {
  test("the file has operations at all", () => {
    expect(expected.length).toBeGreaterThan(200);
  });

  test("every operation is placed in exactly one section, storefront first, none left in 'other'", () => {
    const secs = sections();
    const placed = secs.flatMap((s) => s.ops.map((o) => o.operationId));
    expect(placed.length).toBe(expected.length);
    expect(new Set(placed)).toEqual(new Set(expected.map((e) => e.id)));
    expect(secs[0]!.slug).toBe("storefront");
    expect(secs.find((s) => s.slug === "other")).toBeUndefined();
  });

  test("the search index lists every operation", () => {
    expect(searchIndex().map((e) => e.id).sort()).toEqual(expected.map((e) => e.id).sort());
  });

  test("every operation renders with its method, path, auth and responses", () => {
    const spec = loadSpec();
    const ops = operations(spec);
    expect(ops.length).toBe(expected.length);
    let rendered = 0;
    for (const op of ops) {
      const html = renderToStaticMarkup(<Operation op={op} schemas={spec.components.schemas} />);
      expect(html).toContain(`id="${op.operationId}"`);
      expect(html).toContain(op.path.replace(/&/g, "&amp;"));
      expect(html).toContain(`data-method="${op.method}"`);
      expect(html).toMatch(/Storefront key|Member token|Operator token|No credential \(public\)/);
      for (const r of op.responses) expect(html).toContain(r.status);
      rendered++;
    }
    expect(rendered).toBe(expected.length);
  });

  test("a public route says it needs no credential; a storefront route names the storefront key", () => {
    const ops = operations();
    const pub = ops.filter((o) => o.auth.length === 0);
    expect(pub.length).toBeGreaterThan(0);
    for (const o of pub) expect(o.path.startsWith("/v1/cares-network/")).toBe(true);
    const place = ops.find((o) => o.operationId === "storefrontPlaceOrder")!;
    expect(place.auth.flat().map((c) => c.label)).toContain("Storefront key");
  });

  test("every schema a public operation references gets a page, and every link target is one of them", () => {
    const names = new Set(schemaNames());
    expect(names.size).toBeGreaterThan(0);
    const refs = JSON.stringify(raw.paths).match(/#\/components\/schemas\/[A-Za-z0-9_]+/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(names.has(r.split("/").pop()!)).toBe(true);
  });

  test("the published document is public.json as generated (no re-prune) and has no internal-only schema or credential", () => {
    const doc = publicDocument();
    expect(doc).toEqual(JSON.parse(readFileSync(join(repoRoot(), "packages/contracts/generated/openapi/public.json"), "utf8")));
    const text = JSON.stringify(doc);
    for (const r of new Set(text.match(/#\/components\/schemas\/[A-Za-z0-9_]+/g) ?? [])) expect(doc.components.schemas[r.split("/").pop()!]).toBeDefined();
    expect(Object.keys(doc.components.schemas).filter((k) => k.startsWith("Internal"))).toEqual([]);
    expect(Object.keys(doc.components.securitySchemes)).not.toContain("serviceCredential");
    expect(Object.keys(doc.components.securitySchemes)).not.toContain("runToken");
  });

  test("every component an operation names in its text (not only by $ref) is in the served document and has a page", () => {
    // Names come from internal.json (a different file), matched as whole words in the text fields of public operations.
    const all = Object.keys(
      (JSON.parse(readFileSync(join(repoRoot(), "packages/contracts/generated/openapi/internal.json"), "utf8")) as { components: { schemas: Record<string, unknown> } }).components.schemas,
    );
    const texts: string[] = [];
    const walk = (n: unknown, key = ""): void => {
      if (typeof n === "string") { if (key === "description" || key === "summary") texts.push(n); }
      else if (Array.isArray(n)) n.forEach((x) => walk(x, key));
      else if (n && typeof n === "object") for (const [k, v] of Object.entries(n)) walk(v, k);
    };
    walk(raw.paths);
    const named = all.filter((name) => texts.some((t) => new RegExp(`\\b${name}\\b`).test(t)));
    expect(named).toContain("StreamEvent");
    const served = publicDocument().components.schemas;
    const pages = new Set(schemaNames());
    for (const name of named) {
      expect(served[name], name).toBeDefined();
      expect(pages.has(name), name).toBe(true);
    }
  });

  test("the stream operation shows its event-stream body and links the StreamEvent page, not 'No body.'", () => {
    const spec = loadSpec();
    const op = operations(spec).find((o) => o.operationId === "streamEvents")!;
    const html = renderToStaticMarkup(<Operation op={op} schemas={spec.components.schemas} />);
    expect(html).toContain("Server-sent events");
    expect(html).toContain('href="/developers/schemas/StreamEvent"');
    expect(html).not.toContain("No body.");
  });
});
