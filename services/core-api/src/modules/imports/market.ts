// "Check the market price" of one ingredient (NB-7b). Mounted by imports/index.ts.
//   POST /v1/imports/market-price  {ingredient_id}  → {status, duplicate, import_run_id, draft_id}
//   1. Owner, manager or judge over EVERY outlet (as invoice.ts): the import draft it yields is tenant-wide, which only the
//      all-outlet scope may approve (gotcha 20). Anyone else is refused before anything is read.
//   2. The ingredient's name and the outlets' business date are core's own reads under the member's RLS (another tenant's id is
//      404). The business date is the snapshot template's own expression, so the approved row falls inside its window.
//   3. An `ingest` run token (rule 15: only core mints; a dedicated trigger would need a migration), then intel's
//      `/market-price` synchronously: it answers a `market_signal_v2` CSV, its source token and a code, never read by a model.
//   4. The CSV is stored as an ordinary upload (core.document kind `market_signal`, parser pinned to `market_signal_v2`) and
//      previewed by `parseRun` as a run + `imports.run.commit.v1` draft. Nothing reaches core.market_signal: a named person
//      approves the draft through the existing approvals path (R28, R16). The price becomes a figure on screen only as the
//      `market.ingredient_price` cell, after that approval.
// intel's text is untrusted: core takes the kind, media type and parser from itself, caps the size, and the preview's own
// checks (exact ingredient name, 0037's CHECKs) judge the rows. The staged row must name the ingredient asked for.
import { createHash } from "node:crypto";
import { MarketPriceCheckRequest } from "@munim/contracts/imports";
import { MarketPriceResponse } from "@munim/contracts/internal";
import type { Context } from "hono";
import { contextOf, type Principal } from "../../auth/resolve.ts";
import { uuidv7 } from "../../commit/index.ts";
import { withContext } from "../../lib/db.ts";
import { ApiError } from "../../lib/errors.ts";
import type { AppEnv, Deps } from "../../lib/types.ts";
import { endRun, mintRunTokenIn, type OutletScope, type Queryable, type RunTokenKeys } from "../../runtoken/index.ts";
import { blobKey } from "./blob.ts";
import { SERVICE_SECRET_HEADER } from "./invoice.ts";
import { parseRun } from "./parse.ts";

const READERS = new Set(["owner", "manager", "judge"]);
export const MARKET_PRICE_TIMEOUT_MS = 30_000;
const MAX_CSV_BYTES = 2000;

export interface MarketPriceBody { ingredient: string; currency: string; on_date: string }
/** core → intel `/market-price` with the run token; resolves to intel's JSON body (validated here). */
export type MarketPricePort = (runToken: string, body: MarketPriceBody) => Promise<unknown>;
export interface MarketPriceConfig { keys: RunTokenKeys; intel: MarketPricePort }

const configs = new WeakMap<Deps, MarketPriceConfig>();
/** Wires the call into one composed app, keyed by that Deps object (as configureIngest). */
export function configureMarketPrice(deps: Deps, cfg: MarketPriceConfig): void {
  configs.set(deps, cfg);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
const answer = (c: Context<AppEnv>, status: "previewed" | "no_price" | "unavailable", duplicate = false, run: string | null = null, draft: string | null = null) =>
  c.json({ status, duplicate, import_run_id: run, draft_id: draft }, 200);

export async function checkMarketPrice(c: Context<AppEnv>) {
  const deps = c.var.deps;
  const m: Principal = c.var.principal;
  if (m.kind !== "member" || !READERS.has(m.role) || m.outlet_ids !== "*") throw new ApiError("forbidden", "authority_denied");
  const cfg = configs.get(deps);
  if (!cfg || !deps.blobs) throw new ApiError("unavailable");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError("bad_request");
  }
  const parsed = MarketPriceCheckRequest.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid_payload");
  const ingredientId = parsed.data.ingredient_id;

  const ask = await withContext(deps.pools.core, contextOf(m), async (db) => {
    const ing = (await db.query<{ name: string }>(`SELECT name FROM core.ingredient WHERE id = $1 AND active`, [ingredientId])).rows[0];
    if (!ing) throw new ApiError("not_found");
    // The market.ingredient_price template's own "today" (0037), the earliest of the outlets': the row lands inside its window.
    const day = (await db.query<{ d: string | null }>(
      `SELECT to_char(min(((now() AT TIME ZONE o.tz) - o.business_day_cutoff)::date), 'YYYY-MM-DD') AS d FROM core.outlet o`)).rows[0]?.d;
    if (!day) throw new ApiError("unavailable");
    const currency = (await db.query<{ c: string }>(`SELECT base_currency AS c FROM core.tenant`)).rows[0]!.c;
    return { name: ing.name, day, currency };
  });

  const scope: OutletScope = ["*"];
  const svcCtx = { tenant_id: m.tenant_id, outlet_ids: "*" as const, role: "service" as const };
  const svc = <T>(fn: (q: Queryable) => Promise<T>) => withContext(deps.pools.svc, svcCtx, fn);
  const { token, claims } = await svc((q) => mintRunTokenIn(q, cfg.keys, { tenantId: m.tenant_id, outletScope: scope, trigger: "ingest", actor: m.member_id }));
  let found;
  try {
    const out = MarketPriceResponse.safeParse(await cfg.intel(token, { ingredient: ask.name, currency: ask.currency, on_date: ask.day }));
    if (!out.success || out.data.run_id !== claims.run_id) throw new ApiError("unavailable");
    found = out.data;
    deps.log(`POST /v1/imports/market-price: run ${claims.run_id} ${found.status}`);
  } catch (e) {
    if (!(e instanceof ApiError)) deps.log("POST /v1/imports/market-price: intel call failed", e);
    throw new ApiError("unavailable");
  } finally {
    await endRun({ svc: (_s, fn) => svc(fn) }, m.tenant_id, claims.run_id);
  }
  if (found.status !== "proposed") return answer(c, found.status === "no_price" ? "no_price" : "unavailable");
  const bytes = Buffer.from(found.csv ?? "", "utf8");
  if (bytes.length === 0 || bytes.length > MAX_CSV_BYTES) return answer(c, "unavailable");

  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = blobKey(m.tenant_id, sha);
  await deps.blobs.put(key, bytes);
  const made = await withContext(deps.pools.core, contextOf(m), async (db) => {
    const inserted = (await db.query<{ id: string }>(
      `INSERT INTO core.document (tenant_id, id, kind, media_type, filename, byte_size, sha256, storage_ref, uploaded_by)
       VALUES ($1, $2, 'market_signal', 'text/csv', $3, $4, $5, $6, $7) ON CONFLICT ON CONSTRAINT document_sha256_unique DO NOTHING RETURNING id`,
      [m.tenant_id, uuidv7(), `market-price-${slug(ask.name)}-${ask.day}.csv`, bytes.length, sha, key, m.member_id])).rows[0];
    const doc = inserted ?? (await db.query<{ id: string }>(`SELECT id FROM core.document WHERE sha256 = $1`, [sha])).rows[0]!;
    // The same file today again: its live run comes back (a rejected or failed run is proposed anew).
    const had = inserted ? undefined : (await db.query<{ id: string; draft_id: string | null }>(
      `SELECT id, draft_id FROM core.import_run WHERE document_id = $1 AND status IN ('parsing', 'previewed', 'committed') ORDER BY created_at DESC, id DESC LIMIT 1`, [doc.id])).rows[0];
    if (had) return { run: had.id, draft: had.draft_id, duplicate: true };
    const run = uuidv7();
    await db.query(
      `INSERT INTO core.import_run (tenant_id, id, document_id, kind, parser, created_by) VALUES ($1, $2, $3, 'market_signal', 'market_signal_v2', $4)`,
      [m.tenant_id, run, doc.id, m.member_id]);
    return { run, draft: null, duplicate: !inserted };
  });
  if (made.draft || made.duplicate) return answer(c, "previewed", true, made.run, made.draft);

  // Previewed now, not at the worker's next minute: the person waits for the draft. munim_svc has no book grants (rule 14).
  await svc((q) => parseRun(q, deps.blobs!, made.run));
  const out = await withContext(deps.pools.core, contextOf(m), async (db) => {
    const run = (await db.query<{ status: string; draft_id: string | null }>(`SELECT status, draft_id FROM core.import_run WHERE id = $1`, [made.run])).rows[0];
    const rows = (await db.query<{ ingredient_id: string | null }>(
      `SELECT data->>'ingredient_id' AS ingredient_id FROM core.import_staging WHERE import_run_id = $1`, [made.run])).rows;
    return { run, rows };
  });
  if (out.run?.status !== "previewed" || out.rows.length !== 1 || out.rows[0]!.ingredient_id !== ingredientId) return answer(c, "unavailable", false, made.run);
  return answer(c, "previewed", false, made.run, out.run.draft_id);
}

/** The HTTP port: core → intel `POST /market-price` with the run token as the bearer and the service secret. Errors carry the
 *  status or the error's name only, never a body or the token. */
export function createHttpMarketPricePort(o: { url: string; serviceSecret: string; timeoutMs?: number; fetch?: typeof fetch }): MarketPricePort {
  const endpoint = new URL("market-price", o.url.endsWith("/") ? o.url : `${o.url}/`).toString();
  const doFetch = o.fetch ?? fetch;
  return async (runToken, body) => {
    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${runToken}`, [SERVICE_SECRET_HEADER]: o.serviceSecret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? MARKET_PRICE_TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`intel /market-price: ${(e as Error).name}`);
    }
    if (!res.ok) {
      await res.arrayBuffer().catch(() => undefined);
      throw new Error(`intel /market-price: HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (e) {
      throw new Error(`intel /market-price: ${(e as Error).name}`);
    }
  };
}
