// POST /internal/intel/v1/graph:query (T-058 wiring; ADR-014 "Graph port", F7, R68), and the one place core picks the graph backend
// (port.ts). Intel names one of five templates and passes only its arguments; validation is intel's `check_args` exactly
// (munim_intel/graph/port.py): the template's one id argument (a uuid) and, for a walk, `depth` 1..3 (default 3); any other key — a
// `tenant_id` above all — refuses. Tenant and outlet scope come from the run token, never from the body. The backend is the one the
// composition root configured (`deps.graph`, from MUNIM_GRAPH); unset, the in-tree Postgres templates (postgres/), loaded by path so
// a build without them refuses by name. A backend that cannot answer is `graph_unavailable` (503); nothing falls back (D6).
import { existsSync } from "node:fs";
import { localDate } from "@munim/core-domain/tz";
import { GraphQueryRequest } from "@munim/contracts/internal";
import type pg from "pg";
import { withContext } from "../../lib/db.ts";
import { ApiError } from "../../lib/errors.ts";
import type { Deps } from "../../lib/types.ts";
import type { OutletScope } from "../../runtoken/index.ts";
import type { Run } from "../auth.ts";
import { type GraphBackend, type GraphCaller, type GraphTemplate, isGraphUnavailable } from "./port.ts";

export { type GraphBackend, type GraphCaller, type GraphReadName, type GraphRow, GraphUnavailable, isGraphUnavailable } from "./port.ts";

const MAX_DEPTH = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** template → its id argument and whether it walks (then it also takes `depth`). Same table as intel's port.TEMPLATES. */
const TEMPLATES: Record<GraphTemplate, { idArg: string; walks: boolean }> = {
  price_shock_path: { idArg: "ingredient_id", walks: true },
  dish_margin_drivers: { idArg: "item_id", walks: true },
  supplier_dependency: { idArg: "supplier_id", walks: false },
  claim_support: { idArg: "finding_id", walks: false },
  neighbourhood: { idArg: "entity_id", walks: true },
};

/** The checked arguments (intel's check_args); `invalid_payload` for anything else. */
export function checkArgs(template: string, args: Readonly<Record<string, unknown>>): Record<string, string | number> {
  const t = TEMPLATES[template as GraphTemplate];
  if (!t) throw new ApiError("invalid_payload");
  const allowed = new Set(t.walks ? [t.idArg, "depth"] : [t.idArg]);
  if (Object.keys(args).some((k) => !allowed.has(k))) throw new ApiError("invalid_payload");
  const id = args[t.idArg];
  if (typeof id !== "string" || !UUID.test(id)) throw new ApiError("invalid_payload");
  if (!t.walks) return { [t.idArg]: id };
  const depth = args.depth ?? MAX_DEPTH;
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) throw new ApiError("invalid_payload");
  return { [t.idArg]: id, depth };
}

// Computed, so that no type checker or bundler follows it into a build without the Postgres templates.
const POSTGRES = new URL(["postgres", "index.ts"].join("/"), new URL("./", import.meta.url));
let postgres: Promise<GraphBackend | null> | undefined;
/** The in-tree Postgres backend, or null in a build without it. */
export function postgresGraph(): Promise<GraphBackend | null> {
  postgres ??= existsSync(POSTGRES) ? import(POSTGRES.href).then((m: { postgresGraph: GraphBackend }) => m.postgresGraph) : Promise.resolve(null);
  return postgres;
}

/** The backend serving this app: the configured one, else the in-tree Postgres templates. */
export async function graphOf(deps: Pick<Deps, "graph">): Promise<GraphBackend> {
  if (deps.graph) return deps.graph;
  const pg = await postgresGraph();
  if (!pg) throw new Error("no graph backend postgres in this build");
  return pg;
}

/** The home zone of the tenant in the current transaction: its home_tz, else its first outlet's zone. */
const HOME_TZ = `SELECT coalesce((SELECT t.home_tz FROM core.tenant t WHERE t.tenant_id = $1),
  (SELECT o.tz FROM core.outlet o WHERE o.tenant_id = $1 ORDER BY o.created_at, o.id LIMIT 1)) AS tz`;

/** A verified caller over core's munim_svc pool: its own scope for the read, the whole tenant for a rebuild's books. */
export function graphCaller(svc: pg.Pool, tenantId: string, scope: OutletScope | readonly string[], clock: () => Date = () => new Date()): GraphCaller {
  const outlets = scope[0] === "*" ? ("*" as const) : (scope as readonly string[]);
  return {
    tenantId,
    scope,
    tx: (fn) => withContext(svc, { tenant_id: tenantId, outlet_ids: outlets, role: "service" }, (c) => fn(c)),
    books: (fn) => withContext(svc, { tenant_id: tenantId, outlet_ids: "*", role: "service" }, async (c) => {
      const tz = (await c.query<{ tz: string | null }>(HOME_TZ, [tenantId])).rows[0]?.tz;
      // A tenant with no zone yet (no outlet, before onboarding) has no dated books either: UTC is as good as any.
      return fn(c, localDate(clock(), tz ?? "UTC"));
    }),
  };
}

/** A backend that cannot answer → 503 graph_unavailable; its label is logged, nothing else. */
export async function graphCall<T>(deps: Pick<Deps, "log">, what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isGraphUnavailable(e)) throw e;
    deps.log(`graph ${what}: ${e.label}`);
    throw new ApiError("graph_unavailable");
  }
}

export async function graphQuery(deps: Deps, run: Pick<Run, "tenantId" | "scope">, raw: unknown): Promise<object> {
  const body = GraphQueryRequest.safeParse(raw);
  if (!body.success) throw new ApiError("invalid_payload");
  const args = checkArgs(body.data.template, body.data.args);
  const backend = await graphOf(deps);
  const rows = await graphCall(deps, body.data.template, () => backend.template(body.data.template, args, graphCaller(deps.pools.svc, run.tenantId, run.scope)));
  // A template this backend does not serve (claim_support on a graph adapter: claims stay out of the graph) is refused like an
  // unknown one.
  if (rows === null) throw new ApiError("invalid_payload");
  return { rows };
}
