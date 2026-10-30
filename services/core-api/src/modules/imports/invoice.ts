// A supplier invoice for intel to read (NB-6). Mounted by imports/index.ts.
//   POST /v1/imports/invoices  {filename, media_type, content_base64}  → {duplicate, document, run_id, status, draft_id}
//   GET  /v1/imports/documents/{id}/text  the text the page spans of its draft point into (documentText, below)
//   1. An owner, manager or judge over EVERY outlet: the draft it yields is tenant-wide (`outlet_ids: []`, as
//      purchasing.invoices), which only a run over every outlet may propose (internal/drafts.ts), and a run's scope is never
//      wider than its member's (gotcha 20). Anyone else is refused before anything is stored.
//   2. The bytes go to the blob port (content-addressed), and core.document (kind `supplier_invoice`, sha256 unique per
//      tenant) is inserted and COMMITTED with core's own reads under the member's context: the tenant's currency and the
//      names intel may link by exact alias (active suppliers and ingredients, and intel.alias rows of those entities).
//      Committed first: the transcript's chunks name the document by FK.
//   3. The same bytes again, when a draft already cites the document: that draft, and nothing is read again (no second
//      model call). With no such draft (the earlier read abstained, or intel failed) the page is read again.
//   4. An `ingest` run token (rule 15: only core mints; actor = the member, scope '*'), then intel's `/ingest` synchronously.
//      intel writes the transcript's chunks and the `purchasing.invoice.record.v1` draft through /internal/intel/v1 (R25)
//      and answers ids and a code only. The run is ended either way.
// Nothing here writes the books: core.document, intel.run and the draft are operational rows. The invoice is recorded only
// when a named person approves the draft, typing each figure beside its span of the page (R16, R26). The page's text never
// passes through core here: core holds the bytes, intel the transcript (rule 8). An intel failure is 503 (the document stays).
import { createHash } from "node:crypto";
import { ImportsInvoiceUploadRequest } from "@munim/contracts/imports";
import { IngestResponse } from "@munim/contracts/internal";
import type { Context } from "hono";
import { contextOf, type Principal } from "../../auth/resolve.ts";
import { uuidv7 } from "../../commit/index.ts";
import { withContext } from "../../lib/db.ts";
import { ApiError } from "../../lib/errors.ts";
import type { AppEnv, Deps } from "../../lib/types.ts";
import { endRun, mintRunTokenIn, type OutletScope, type Queryable, type RunTokenKeys } from "../../runtoken/index.ts";
import { blobKey } from "./blob.ts";

export const SERVICE_SECRET_HEADER = "x-munim-service-secret";
/** One vision read plus its one schema retry, each up to the vision role's own timeout. */
export const INGEST_TIMEOUT_MS = 120_000;
const MAX_BYTES = 5 * 1024 * 1024;
const READERS = new Set(["owner", "manager", "judge"]);

export interface IngestBody {
  document_id: string; media_type: string; content_base64: string; currency: string;
  aliases: Array<{ kind: "supplier" | "ingredient"; core_ref: string; alias: string }>;
}
/** core → intel `/ingest` with the run token; resolves to intel's JSON body (validated here). */
export type IngestPort = (runToken: string, body: IngestBody) => Promise<unknown>;
export interface IngestConfig { keys: RunTokenKeys; intel: IngestPort }

const configs = new WeakMap<Deps, IngestConfig>();
/** Wires the ingest call into one composed app, keyed by that Deps object (as configureRfq). */
export function configureIngest(deps: Deps, cfg: IngestConfig): void {
  configs.set(deps, cfg);
}

interface DocRow { id: string; kind: string; media_type: string; filename: string | null; byte_size: string; sha256: string; uploaded_by: string | null; created_at: Date }
const DOC_COLS = `id, kind, media_type, filename, byte_size, sha256, uploaded_by, created_at`;
const docView = (d: DocRow) => ({
  document_id: d.id, kind: d.kind, media_type: d.media_type, filename: d.filename, byte_size: Number(d.byte_size), sha256: d.sha256,
  uploaded_by: d.uploaded_by, created_at: d.created_at.toISOString(),
});

/** The names an invoice line or its supplier may be printed as, under the member's RLS: one tenant's only. Intel takes at most
 *  5000: every active supplier and ingredient name first, then the learned aliases newest first, up to the cap. */
const MAX_ALIASES = 5000;
const ALIASES = `
  SELECT DISTINCT kind, core_ref, alias FROM (
    SELECT 0 AS rank, NULL::timestamptz AS at, 'supplier' AS kind, 'core.supplier:' || s.id AS core_ref, s.name AS alias FROM core.supplier s WHERE s.active
    UNION ALL
    SELECT 0, NULL, 'ingredient', 'core.ingredient:' || g.id, g.name FROM core.ingredient g WHERE g.active
    UNION ALL
    SELECT 1, a.created_at, e.kind, e.core_ref, a.alias FROM intel.alias a JOIN intel.entity e ON e.tenant_id = a.tenant_id AND e.id = a.entity_id
     WHERE e.kind IN ('supplier', 'ingredient') AND e.core_ref LIKE 'core.' || e.kind || ':%'
    ORDER BY rank, at DESC NULLS LAST, kind, core_ref, alias LIMIT ${MAX_ALIASES}
  ) x ORDER BY 1, 2, 3`;

/** The file's leading bytes must be what its declared media type says (PNG, JPEG, WebP, PDF). */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  "image/jpeg": (b) => b.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
};

export async function uploadInvoice(c: Context<AppEnv>) {
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
  const parsed = ImportsInvoiceUploadRequest.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid_payload");
  const req = parsed.data;
  const bytes = Buffer.from(req.content_base64, "base64");
  const canonical = bytes.toString("base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES || canonical !== req.content_base64.replace(/\s/g, "") || !MAGIC[req.media_type]?.(bytes)) {
    throw new ApiError("invalid_payload");
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = blobKey(m.tenant_id, sha);
  await deps.blobs.put(key, bytes);
  const stored = await withContext(deps.pools.core, contextOf(m), async (db) => {
    const inserted = (await db.query<DocRow>(
      `INSERT INTO core.document (tenant_id, id, kind, media_type, filename, byte_size, sha256, storage_ref, uploaded_by)
       VALUES ($1, $2, 'supplier_invoice', $3, $4, $5, $6, $7, $8) ON CONFLICT ON CONSTRAINT document_sha256_unique DO NOTHING
       RETURNING ${DOC_COLS}`,
      [m.tenant_id, uuidv7(), req.media_type, req.filename, bytes.length, sha, key, m.member_id])).rows[0];
    const doc = inserted ?? (await db.query<DocRow>(`SELECT ${DOC_COLS} FROM core.document WHERE sha256 = $1`, [sha])).rows[0]!;
    const cited = inserted ? undefined : (await db.query<{ id: string }>(
      `SELECT id FROM core.draft WHERE command_type = 'purchasing.invoice.record.v1' AND status IN ('proposed', 'executing', 'executed') AND evidence @> $1::jsonb ORDER BY created_at DESC, id DESC LIMIT 1`,
      [JSON.stringify([`doc:${doc.id}`])])).rows[0];
    const currency = (await db.query<{ c: string }>(`SELECT base_currency AS c FROM core.tenant`)).rows[0]!.c;
    const aliases = (await db.query<IngestBody["aliases"][number]>(ALIASES)).rows;
    return { doc, duplicate: !inserted, cited: cited?.id ?? null, currency, aliases };
  });
  const view = { duplicate: stored.duplicate, document: docView(stored.doc) };
  if (stored.cited) return c.json({ ...view, run_id: null, status: null, draft_id: stored.cited }, 200);

  const scope: OutletScope = ["*"];
  const svc = <T>(fn: (q: Queryable) => Promise<T>) => withContext(deps.pools.svc, { tenant_id: m.tenant_id, outlet_ids: "*", role: "service" }, fn);
  const { token, claims } = await svc((q) => mintRunTokenIn(q, cfg.keys, { tenantId: m.tenant_id, outletScope: scope, trigger: "ingest", actor: m.member_id }));
  try {
    const out = IngestResponse.safeParse(await cfg.intel(token, {
      document_id: stored.doc.id, media_type: req.media_type, content_base64: canonical, currency: stored.currency, aliases: stored.aliases,
    }));
    if (!out.success || out.data.run_id !== claims.run_id) throw new ApiError("unavailable");
    deps.log(`POST /v1/imports/invoices: run ${claims.run_id} ${out.data.status}`);
    return c.json({ ...view, run_id: claims.run_id, status: out.data.status, draft_id: out.data.draft_id }, 200);
  } catch (e) {
    if (!(e instanceof ApiError)) deps.log("POST /v1/imports/invoices: intel call failed", e);
    throw new ApiError("unavailable");
  } finally {
    await endRun({ svc: (_s, fn) => svc(fn) }, m.tenant_id, claims.run_id);
  }
}

/** GET /v1/imports/documents/{id}/text: the document's text as Munim read it, in its chunks at their offsets — what an invoice
 *  draft's page spans point into, for the chips beside each figure. The same people as the upload (the draft is tenant-wide);
 *  RLS confines both reads to the member's tenant, so another tenant's id is 404. Untrusted text, returned as stored. */
export async function documentText(c: Context<AppEnv>) {
  const m: Principal = c.var.principal;
  if (m.kind !== "member" || !READERS.has(m.role) || m.outlet_ids !== "*") throw new ApiError("forbidden", "authority_denied");
  const id = c.req.param("id")!;
  const chunks = await withContext(c.var.deps.pools.core, contextOf(m), async (db) => {
    if (!(await db.query(`SELECT 1 FROM core.document WHERE id = $1 AND kind = 'supplier_invoice'`, [id])).rows[0]) throw new ApiError("not_found");
    // A page read again after a failed read has two sets of chunks (their ids name their text): the newest read's run is the one
    // a proposed draft's spans point into.
    return (await db.query<{ char_start: number; text: string }>(
      `SELECT char_start, text FROM intel.chunk WHERE document_id = $1
         AND run_id IS NOT DISTINCT FROM (SELECT run_id FROM intel.chunk WHERE document_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1)
       ORDER BY seq, id LIMIT 1000`, [id])).rows;
  });
  return c.json({ document_id: id, chunks }, 200);
}

export interface HttpIngestPortOptions {
  /** intel's base URL, e.g. http://127.0.0.1:8081 */
  url: string;
  serviceSecret: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** The HTTP IngestPort: core → intel `POST /ingest` with the run token as the bearer and the service secret. Errors carry the
 *  status or the error's name only, never a body or the token. */
export function createHttpIngestPort(o: HttpIngestPortOptions): IngestPort {
  const endpoint = new URL("ingest", o.url.endsWith("/") ? o.url : `${o.url}/`).toString();
  const doFetch = o.fetch ?? fetch;
  return async (runToken, body) => {
    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${runToken}`, [SERVICE_SECRET_HEADER]: o.serviceSecret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? INGEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`intel /ingest: ${(e as Error).name}`);
    }
    if (!res.ok) {
      await res.arrayBuffer().catch(() => undefined);
      throw new Error(`intel /ingest: HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (e) {
      throw new Error(`intel /ingest: ${(e as Error).name}`);
    }
  };
}
