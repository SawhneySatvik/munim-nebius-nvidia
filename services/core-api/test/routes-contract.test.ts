// R43 (SDK coverage) gate: every route core-api mounts under /v1, /platform/v1 and /internal/intel/v1 has an OpenAPI operation in its
// module's contracts ROUTES — with a response schema, and for POST a command or request schema. The mounted
// side is read from the real Hono app; the documented side from the contracts registry (what `gen` turns into
// the OpenAPI document). Templates compare with every path parameter as `{}`, so `{outlet_id}` = `:id{uuid}`.
// No database: createApp only needs a config for route registration.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { draftableTypes } from "@munim/contracts";
import { assertUniqueRoutes, loadRegistry } from "@munim/contracts/registry";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { draftHandler } from "../src/modules/approvals/handlers.ts";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Hono path → template: `:id{<uuid>}` / `:id` → `{}`; `:action{<uuid>:cancel}` → `{}:cancel`; `:seg{account:link}` → `account:link`. */
export function honoTemplate(path: string): string {
  let out = "";
  for (let i = 0; i < path.length; ) {
    if (path[i] === ":" && path[i - 1] === "/") {
      const m = /^:[A-Za-z_]+/.exec(path.slice(i))!;
      i += m[0].length;
      if (path[i] !== "{") {
        out += "{}";
        continue;
      }
      let depth = 0;
      let j = i;
      do {
        if (path[j] === "{") depth++;
        else if (path[j] === "}") depth--;
        j++;
      } while (depth > 0);
      const re = path.slice(i + 1, j - 1);
      i = j;
      out += re.startsWith(UUID_RE) ? `{}${re.slice(UUID_RE.length)}` : /^[a-z0-9:_-]+$/.test(re) ? re : "{}";
    } else out += path[i++];
  }
  return out;
}
const contractTemplate = (path: string) => path.replace(/\{[^}]+\}/g, "{}");

/** Documented in contracts, not mounted in core-api yet. Empty since T-095a/b mounted Munim Cares; a later ticket that
 *  declares before it mounts names its paths here. */
const NOT_MOUNTED_YET: RegExp[] = [];
/** Mounted but not an OpenAPI operation. Empty since T-099 (G-07) documented GET /v1/stream (text/event-stream; the SDK
 *  keeps its hand-written fetch-based reader, ADR-005). */
const NOT_OPERATIONS = new Set<string>([]);

/** POSTs that carry no body (the id in the path is the whole request). */
const NO_BODY = new Set(["POST /v1/storefront-keys/{}:revoke"]);

const reg = await loadRegistry();
const app = await createApp({ config: { nodeEnv: "production", redact: (s: string) => s }, log: () => {} } as never);

const documented = new Map(reg.routes.map((r) => [`${r.method.toUpperCase()} ${contractTemplate(r.path)}`, r]));
const MOUNTED_SURFACES = /^\/((platform\/)?v1|internal\/intel\/v1)\//;
const mounted = [...new Set(app.routes.filter((r) => r.method !== "ALL" && MOUNTED_SURFACES.test(r.path)).map((r) => `${r.method} ${honoTemplate(r.path)}`))].sort();

describe("every mounted /v1 route has a contracts operation (R43)", () => {
  it("the gate sees the mounted app (a positive count, not an empty list)", () => {
    expect(mounted.length).toBeGreaterThan(100);
    expect(mounted).toContain("POST /v1/orders/{}:push-back");
    expect(mounted).toContain("POST /v1/account:link");
    // T-040: the seven reads that were declared but unserved, and the internal API (colon routes included).
    for (const r of ["GET /v1/findings", "GET /v1/inbox", "GET /v1/snapshots/{}", "POST /v1/snapshots", "GET /v1/runs", "GET /v1/runs/{}", "GET /v1/traces/{}",
      "POST /internal/intel/v1/events:claim", "POST /internal/intel/v1/watch:claim", "POST /internal/intel/v1/snapshots", "POST /internal/intel/v1/findings",
      "POST /internal/intel/v1/drafts", "POST /internal/intel/v1/answers", "POST /internal/intel/v1/traces:batch", "GET /internal/intel/v1/model-roles",
      // T-040b: the batch writes and the run-frame (ADR-014 §14 C1, C2).
      "POST /internal/intel/v1/entities:batch", "POST /internal/intel/v1/aliases:batch", "POST /internal/intel/v1/chunks:batch",
      "POST /internal/intel/v1/claims:batch", "POST /internal/intel/v1/edges:batch", "POST /internal/intel/v1/embeddings:batch",
      "POST /internal/intel/v1/wiki:batch", "POST /internal/intel/v1/forecasts:batch", "POST /internal/intel/v1/quotes:batch",
      "POST /internal/intel/v1/spend", "GET /internal/intel/v1/run-frame"]) {
      expect(mounted).toContain(r);
    }
  });

  it("mounted ⊆ documented", () => {
    const missing = mounted.filter((m) => !documented.has(m) && !NOT_OPERATIONS.has(m));
    expect(missing).toEqual([]);
  });

  it("documented ⊆ mounted, except the named not-yet-mounted modules (a typo in a contracts path fails here)", () => {
    const set = new Set(mounted);
    const orphan = [...documented.entries()].filter(([k, r]) => !set.has(k) && !NOT_MOUNTED_YET.some((re) => re.test(r.path))).map(([k]) => k);
    expect(orphan).toEqual([]);
  });

  it("each documented mounted route carries a response schema, and a POST a command or request schema", () => {
    const bad: string[] = [];
    for (const m of mounted) {
      const r = documented.get(m);
      if (!r) continue;
      if (!r.response) bad.push(`${m}: no response`);
      if (r.method === "post" && !r.command && !r.request && !NO_BODY.has(m)) bad.push(`${m}: no request`);
    }
    expect(bad).toEqual([]);
  });

  // The generated OpenAPI document is what the SDK is built from: it must hold the same operations
  // (contracts' stale.test fails when it is older than its sources, so a green stale.test + this = SDK coverage).
  it("every mounted route is an operation in generated/openapi/public.json or internal.json", () => {
    const ops = new Set(["public", "internal"].flatMap((s) => {
      const doc = JSON.parse(readFileSync(new URL(`../../../packages/contracts/generated/openapi/${s}.json`, import.meta.url), "utf8")) as { paths: Record<string, Record<string, unknown>> };
      return Object.entries(doc.paths).flatMap(([path, item]) => Object.keys(item).map((m) => `${m.toUpperCase()} ${contractTemplate(path)}`));
    }));
    expect(mounted.filter((m) => !ops.has(m) && !NOT_OPERATIONS.has(m))).toEqual([]);
  });
});

// Gotcha 28: a draftable's handler registers when its module is imported; this file loads modules only through createApp
// (loadRouters), so a module missing from modules/index.ts leaves its type unhandled here. No embedded Postgres in this
// file, so a failure is a non-zero exit (gotcha 33).
describe("boot registers a draft handler for every contracts draftable type (gotcha 28)", () => {
  it("cares.listing.publish.v1 is draftable and handled; no draftable type lacks a handler", () => {
    expect(draftableTypes()).toContain("cares.listing.publish.v1");
    expect(draftHandler("cares.listing.publish.v1")?.type).toBe("cares.listing.publish.v1");
    expect(draftableTypes().filter((t) => !draftHandler(t))).toEqual([]);
  });
});

describe("route uniqueness (R3-m1)", () => {
  it("no two contracts routes share METHOD + path or an operationId", () => {
    expect(() => assertUniqueRoutes(reg.routes)).not.toThrow();
  });
  it("RED-PROOF: the documented map has one entry per route (a duplicate would have been overwritten silently)", () => {
    expect(documented.size).toBe(reg.routes.length);
  });
  it("RED-PROOF: a planted twin of a real route is caught", () => {
    expect(() => assertUniqueRoutes([...reg.routes, { ...reg.routes[0]!, operationId: "plantedTwin" }])).toThrow(/declared by both/);
  });
});

// ---- R3-M5: every response schema is parsed against a real response in at least one test -----------------------
// Static detection (vitest workers share no state): a test file parses a response when it calls
// `<Export>.parse(` / `.safeParse(` on the contract's exported schema object, or `SCHEMAS["<name>"].parse(`.
// RESPONSE_PARSE_PENDING is the shrinking allow-list: schema name -> the lane that owns the module and its test.
// An entry that IS now parsed fails the gate (delete it); a new response schema without a parse fails too.
export const RESPONSE_PARSE_PENDING: Record<string, string> = {};

const TEST_DIR = new URL(".", import.meta.url).pathname;
// This file is excluded: it quotes every name (the allow-list) and plants parse calls, so it would satisfy itself.
const testSources = (): string[] => readdirSync(TEST_DIR, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && f !== "routes-contract.test.ts").map((f) => readFileSync(join(TEST_DIR, f), "utf8"));

/** Response schema names (of mounted public routes) that no source parses. `identOf` maps a registry name to the
 *  identifiers the contracts modules export that schema object under. A file that parses through a variable key
 *  (`SCHEMAS[schema].parse(` in an `it.each` table) counts every name it quotes. */
export function unparsedResponses(responseNames: string[], sources: string[], identOf: Map<string, string[]>): string[] {
  const text = sources.join("\n");
  const tables = sources.filter((src) => /\bSCHEMAS\[\s*[A-Za-z_]\w*\s*\]\s*\.(?:parse|safeParse)\(/.test(src));
  return responseNames.filter((name) => {
    const byName = new RegExp(`SCHEMAS\\[\\s*["']${name.replaceAll(".", "\\.")}["']\\s*\\]\\s*\\.(?:parse|safeParse)\\(`).test(text);
    const byIdent = (identOf.get(name) ?? []).some((id) => new RegExp(`\\b${id}\\.(?:parse|safeParse)\\(`).test(text));
    const byTable = tables.some((src) => src.includes(`"${name}"`));
    return !byName && !byIdent && !byTable;
  });
}

async function identMap(): Promise<Map<string, string[]>> {
  const byObject = new Map<unknown, string>(reg.schemas.map(([n, s]) => [s, n]));
  const out = new Map<string, string[]>();
  for (const m of reg.modules) {
    const exp = (await import(`@munim/contracts/${m}`)) as Record<string, unknown>;
    for (const [id, v] of Object.entries(exp)) {
      const name = byObject.get(v);
      if (name) out.set(name, [...(out.get(name) ?? []), id]);
    }
  }
  return out;
}

describe("every response schema is parsed against a real response (R3-M5)", () => {
  const responses = [...new Set(mounted.map((m) => documented.get(m)?.response).filter((x): x is string => x !== undefined))].sort();

  it("the gate sees a positive number of response schemas and test sources", () => {
    expect(responses.length).toBeGreaterThan(60);
    expect(testSources().length).toBeGreaterThan(20);
  });

  it("unparsed = pending allow-list exactly (new gaps fail; parsed entries must be deleted from the list)", async () => {
    const unparsed = unparsedResponses(responses, testSources(), await identMap());
    expect(unparsed).toEqual(Object.keys(RESPONSE_PARSE_PENDING).sort());
  });

  it("every pending entry names a real response schema and an owner lane", () => {
    for (const [name, owner] of Object.entries(RESPONSE_PARSE_PENDING)) {
      expect(responses, name).toContain(name);
      expect(owner, name).toMatch(/^(f-1|f-2|f-3|f-4|unowned)\b/);
    }
  });

  it("RED-PROOF: with no sources every response is unparsed; a planted parse removes exactly that one", async () => {
    const ids = await identMap();
    expect(unparsedResponses(responses, [], ids)).toEqual(responses);
    const planted = unparsedResponses(responses, [`const x = SCHEMAS["${responses[0]}"].parse(body);`], ids);
    expect(planted).toEqual(responses.slice(1));
    const viaIdent = ids.get(responses[1]!)![0]!;
    expect(unparsedResponses(responses, [`${viaIdent}.safeParse(await r.json())`], ids)).not.toContain(responses[1]);
    expect(unparsedResponses(responses, [`// ${viaIdent} is described here`], ids)).toContain(responses[1]);
    const table = `it.each([["/x", "${responses[2]}"]])("%s", (p, schema) => SCHEMAS[schema].parse(body));`;
    expect(unparsedResponses(responses, [table], ids)).not.toContain(responses[2]);
    expect(unparsedResponses(responses, [`["/x", "${responses[2]}"]`], ids)).toContain(responses[2]);
  });
});
