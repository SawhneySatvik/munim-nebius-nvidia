// NB-6 gates — POST /v1/imports/invoices through the real app: a supplier invoice is stored and handed to intel to read into a
// draft; nothing here writes the books.
//   (0) no ingest port wired: 503 before anything is stored;
//   (1) the owner uploads a photo: 200; the bytes are in the blob store under <tenant>/<sha256>; one core.document (kind
//       supplier_invoice) under her; intel called once with core's own reads — this tenant's currency and the names it may link
//       by exact alias (its active suppliers and ingredients, and the world's intel.alias "Sim Dairy"; no row of the other tenant's)
//       — under an `ingest` run whose actor is the owner and whose scope is '*'; the run is ended; intel's answer comes back;
//   (2) replay: the same bytes again once a draft cites the document → that draft, `duplicate`, no run, intel not called; the
//       same bytes while no draft cites it (the read abstained) → read again;
//   (3) staff and a single-outlet manager are refused (403 authority_denied) before anything is stored or called;
//   (4) intel failing → 503; the document stays and the run is ended;
//   (5) a file that is not a photo or PDF, or bytes that are not the base64 sent, are refused (422) and nothing is stored.
// The intel side is a fake at the service boundary (the port); the run token is checked with core's own verifier.
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@munim/config";
import { DocumentTextView, ImportsInvoiceUploadResponse } from "@munim/contracts/imports";
import { buildWorld, type TestDb } from "@munim/db";
import type { Hono } from "hono";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalIdp } from "../src/auth/local-idp.ts";
import { type AppEnv, createApp, TENANT_HEADER } from "../src/app.ts";
import { uuidv7 } from "../src/commit/index.ts";
import { svcTx, testKeys } from "../src/commit/testkit.ts";
import type { Deps } from "../src/lib/types.ts";
import { configureIngest, type IngestBody, localBlobStore } from "../src/modules/imports/index.ts";
import { verifyRunToken } from "../src/runtoken/index.ts";
import { openDb } from "./db.ts";

const idp = createLocalIdp();
const keys = testKeys();
let db: TestDb;
let pools: { core: pg.Pool; svc: pg.Pool };
let app: Hono<AppEnv>;
let deps: Deps;
let blobDir: string;

const T = {
  tenant: "", other: "", owner: "", staff: "", outlets: [] as string[], supplier: "", ingredient: "", otherSupplier: "", otherIngredient: "",
  manager: uuidv7(),
  subs: { owner: `owner-${uuidv7()}`, staff: `staff-${uuidv7()}`, manager: `manager-${uuidv7()}` },
};
type Who = keyof typeof T.subs;

interface Call { token: string; body: IngestBody }
const calls: Call[] = [];
let answer: (runId: string) => unknown = (runId) => ({ run_id: runId, status: "drafted", draft_id: uuidv7() });
let failIntel = false;
async function fakeIntel(token: string, body: IngestBody): Promise<unknown> {
  calls.push({ token, body });
  if (failIntel) throw new Error("intel /ingest: HTTP 502");
  const v = await verifyRunToken({ ...keys, svc: svcTx(db) }, token);
  if (!v.ok) throw new Error(`fake intel: token refused ${v.reason}`);
  return answer(v.claims.run_id);
}

type Res = Omit<Response, "json"> & { json(): Promise<any> };
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001", "hex");
const upload = async (who: Who, bytes: Buffer = PNG, extra: Record<string, unknown> = {}): Promise<Res> =>
  (await app.request("/v1/imports/invoices", {
    method: "POST",
    headers: { Authorization: `Bearer ${idp.sign({ sub: T.subs[who] })}`, [TENANT_HEADER]: T.tenant, "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "synthetic_invoice.png", media_type: "image/png", content_base64: bytes.toString("base64"), ...extra }),
  })) as Res;
const count = async (sql: string, params: unknown[] = []) => Number((await db.admin(sql, params)).rows[0]!.n);
const docs = () => count(`SELECT count(*) n FROM core.document WHERE tenant_id = $1`, [T.tenant]);
const runs = () => count(`SELECT count(*) n FROM intel.run WHERE tenant_id = $1 AND trigger = 'ingest'`, [T.tenant]);
const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as { run_id: string };

beforeAll(async () => {
  db = await openDb();
  const w = await buildWorld(db);
  const o = await buildWorld(db);
  Object.assign(T, { tenant: w.tenant, other: o.tenant, owner: w.owner, staff: w.staff, outlets: [...w.outlets], supplier: w.supplier, ingredient: w.ingredient,
    otherSupplier: o.supplier, otherIngredient: o.ingredient });
  await db.withContext("munim_core", { tenant_id: T.tenant, outlet_ids: "*", role: "owner", member_id: T.owner, command_type: "tenancy.member.invite.v1" }, async (c) => {
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [T.owner, T.subs.owner]);
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [T.staff, T.subs.staff]);
    await c.query(`INSERT INTO core.member (tenant_id, id, idp_sub, name, email) VALUES ($1, $2, $3, 'Synthetic manager', 'manager@example.test')`, [T.tenant, T.manager, T.subs.manager]);
    await c.query(`INSERT INTO core.membership (tenant_id, member_id, role, outlet_ids) VALUES ($1, $2, 'manager', $3)`, [T.tenant, T.manager, [T.outlets[0]]]);
  });
  blobDir = await mkdtemp(join(tmpdir(), "nb6-blobs-"));
  pools = { core: db.pool("munim_core", 8), svc: db.pool("munim_svc", 4) };
  const config = { nodeEnv: "test", redact: (s: string) => s };
  deps = { pools, idp, storefronts: async () => null, blobs: localBlobStore(blobDir), config, log: createLogger(config, () => {}) };
  app = await createApp(deps);
});

afterAll(async () => {
  await pools?.core.end();
  await pools?.svc.end();
  await db?.stop();
});

describe("POST /v1/imports/invoices", () => {
  it("(0) no ingest port wired → 503 and nothing stored", async () => {
    const d0 = await docs();
    expect((await upload("owner")).status).toBe(503);
    expect(await docs()).toBe(d0);
    configureIngest(deps, { keys, intel: fakeIntel });
  });

  it("(1) the owner's photo: stored, then read under an ingest run of hers over every outlet, with this tenant's names only", async () => {
    const [d0, r0, n0] = [await docs(), await runs(), calls.length];
    const r = await upload("owner");
    expect(r.status).toBe(200);
    const out = ImportsInvoiceUploadResponse.parse(await r.json());
    expect([await docs(), await runs(), calls.length]).toEqual([d0 + 1, r0 + 1, n0 + 1]);
    const doc = (await db.admin(`SELECT id, kind, media_type, storage_ref, uploaded_by, byte_size FROM core.document WHERE tenant_id = $1 AND id = $2`,
      [T.tenant, out.document.document_id])).rows[0];
    const sha = out.document.sha256;
    expect(doc).toEqual({ id: out.document.document_id, kind: "supplier_invoice", media_type: "image/png", storage_ref: `${T.tenant}/${sha}`,
      uploaded_by: T.owner, byte_size: String(PNG.length) });
    expect(Buffer.from(await readFile(join(blobDir, T.tenant, sha))).equals(PNG)).toBe(true);
    const call = calls.at(-1)!;
    const run = (await db.admin(`SELECT trigger, actor, outlet_scope::text[] AS scope, ended_at IS NOT NULL AS ended FROM intel.run WHERE tenant_id = $1 AND id = $2`,
      [T.tenant, claimsOf(call.token).run_id])).rows[0];
    expect(run).toEqual({ trigger: "ingest", actor: T.owner, scope: ["*"], ended: true });
    expect((await verifyRunToken({ ...keys, svc: svcTx(db) }, call.token)).ok).toBe(false);
    expect({ ...call.body, aliases: undefined }).toEqual({
      document_id: out.document.document_id, media_type: "image/png", content_base64: PNG.toString("base64"), currency: "INR", aliases: undefined,
    });
    expect(call.body.aliases).toEqual([
      { kind: "ingredient", core_ref: `core.ingredient:${T.ingredient}`, alias: "Paneer" },
      { kind: "supplier", core_ref: `core.supplier:${T.supplier}`, alias: "Sim Dairy" },
      { kind: "supplier", core_ref: `core.supplier:${T.supplier}`, alias: "Simulated Dairy" },
    ]);
    expect(JSON.stringify(call.body)).not.toContain(T.otherSupplier);
    expect(JSON.stringify(call.body)).not.toContain(T.otherIngredient);
    expect(out).toMatchObject({ duplicate: false, run_id: claimsOf(call.token).run_id, status: "drafted" });
    expect(out.draft_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("(2) a replay of the same bytes answers the draft that cites them and reads nothing; with no such draft it reads again", async () => {
    const first = ImportsInvoiceUploadResponse.parse(await (await upload("owner", Buffer.concat([PNG, Buffer.from("01", "hex")]))).json());
    // The draft intel would have stored (the fake answers without writing one): proposed, citing the document.
    const draft = uuidv7();
    await db.admin(`INSERT INTO core.draft (tenant_id, id, outlet_ids, source, command_type, command_payload, evidence, based_on)
                    VALUES ($1, $2, '{}', 'intel:inventory_purchasing', 'purchasing.invoice.record.v1', '{}', $3, '[]')`,
      [T.tenant, draft, JSON.stringify([`doc:${first.document.document_id}`])]);
    const [d0, r0, n0] = [await docs(), await runs(), calls.length];
    const again = await upload("owner", Buffer.concat([PNG, Buffer.from("01", "hex")]));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ duplicate: true, document: first.document, run_id: null, status: null, draft_id: draft });
    expect([await docs(), await runs(), calls.length]).toEqual([d0, r0, n0]);

    answer = (runId) => ({ run_id: runId, status: "abstained", draft_id: null });
    try {
      const bytes = Buffer.concat([PNG, Buffer.from("02", "hex")]);
      const abstained = ImportsInvoiceUploadResponse.parse(await (await upload("owner", bytes)).json());
      expect(abstained).toMatchObject({ duplicate: false, status: "abstained", draft_id: null });
      const retry = ImportsInvoiceUploadResponse.parse(await (await upload("owner", bytes)).json());
      expect(retry).toMatchObject({ duplicate: true, document: abstained.document, status: "abstained" });
      expect(retry.run_id).not.toBe(abstained.run_id);
      expect([await docs(), await runs(), calls.length]).toEqual([d0 + 1, r0 + 2, n0 + 2]);
    } finally {
      answer = (runId) => ({ run_id: runId, status: "drafted", draft_id: uuidv7() });
    }
  });

  it("(3) staff and a single-outlet manager are refused before anything is stored or called", async () => {
    const before = [await docs(), await runs(), calls.length];
    for (const who of ["staff", "manager"] as const) {
      const r = await upload(who, Buffer.concat([PNG, Buffer.from("03", "hex")]));
      expect(r.status).toBe(403);
      expect((await r.json()).error.reason_code).toBe("authority_denied");
    }
    expect([await docs(), await runs(), calls.length]).toEqual(before);
  });

  it("(4) intel failing → 503; the document stays and the run is ended", async () => {
    failIntel = true;
    try {
      const [d0, r0] = [await docs(), await runs()];
      expect((await upload("owner", Buffer.concat([PNG, Buffer.from("04", "hex")]))).status).toBe(503);
      expect([await docs(), await runs()]).toEqual([d0 + 1, r0 + 1]);
      expect(await count(`SELECT count(*) n FROM intel.run WHERE tenant_id = $1 AND trigger = 'ingest' AND ended_at IS NULL`, [T.tenant])).toBe(0);
    } finally {
      failIntel = false;
    }
  });

  it("(5) not a photo or PDF, or bytes that are not the base64 sent → 422, nothing stored", async () => {
    const before = [await docs(), calls.length];
    expect((await upload("owner", PNG, { media_type: "text/csv" })).status).toBe(422);
    expect((await upload("owner", PNG, { content_base64: "iVBORw0KGgo=!" })).status).toBe(422);
    expect([await docs(), calls.length]).toEqual(before);
  });
});

// (7) NB-6 fix cycle 1: the body cap, a dead draft, the bytes forwarded, the file's own magic, the alias cap.
describe("POST /v1/imports/invoices (fix cycle 1)", () => {
  const raw = (body: string): Promise<Res> =>
    Promise.resolve(app.request("/v1/imports/invoices", {
      method: "POST",
      headers: { Authorization: `Bearer ${idp.sign({ sub: T.subs.owner })}`, [TENANT_HEADER]: T.tenant, "Content-Type": "application/json" },
      body,
    }) as Promise<Res>);
  const png = (n: number, tag: number) => Buffer.concat([PNG, Buffer.alloc(n, tag)]);

  it("(7a) a ~1 MiB photo reaches the handler (not the 256 KiB default cap); a body over the route's cap is 413", async () => {
    const n0 = calls.length;
    const r = await upload("owner", png(1024 * 1024, 7));
    expect(r.status).toBe(200);
    expect(calls.length).toBe(n0 + 1);
    const big = await raw(JSON.stringify({ filename: "x.png", media_type: "image/png", content_base64: "A".repeat(8 * 1024 * 1024 + 1) }));
    expect([big.status, (await big.json()).error.code]).toEqual([413, "bad_request"]);
  });

  it("(7b) a file over MAX_BYTES (5 MiB) gets the route's own 422, not the body cap", async () => {
    const [d0, n0] = [await docs(), calls.length];
    const r = await upload("owner", png(5 * 1024 * 1024 + 1 - PNG.length, 8));
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe("invalid_payload");
    expect([await docs(), calls.length]).toEqual([d0, n0]);
  });

  it("(7c) a rejected draft is not cited: the re-upload reads again; a recorded one still is", async () => {
    const bytes = png(16, 9);
    const first = ImportsInvoiceUploadResponse.parse(await (await upload("owner", bytes)).json());
    const dead = uuidv7();
    await db.admin(`INSERT INTO core.draft (tenant_id, id, outlet_ids, source, command_type, command_payload, evidence, based_on)
                    VALUES ($1, $2, '{}', 'intel:inventory_purchasing', 'purchasing.invoice.record.v1', '{}', $3, '[]')`,
      [T.tenant, dead, JSON.stringify([`doc:${first.document.document_id}`])]);
    await db.admin(`UPDATE core.draft SET status = 'rejected' WHERE tenant_id = $1 AND id = $2`, [T.tenant, dead]);
    const n0 = calls.length;
    const again = ImportsInvoiceUploadResponse.parse(await (await upload("owner", bytes)).json());
    expect(calls.length).toBe(n0 + 1);
    expect(again.draft_id).not.toBe(dead);
    expect(again.status).toBe("drafted");
  });

  it("(7d) whitespace in the base64 is forwarded canonical; the bytes must be what media_type says", async () => {
    const bytes = png(24, 10);
    const b64 = bytes.toString("base64");
    const r = await raw(JSON.stringify({ filename: "x.png", media_type: "image/png", content_base64: `${b64.slice(0, 8)}\n${b64.slice(8)}\n` }));
    expect(r.status).toBe(200);
    expect(calls.at(-1)!.body.content_base64).toBe(b64);
    const [d0, n0] = [await docs(), calls.length];
    const jpg = await upload("owner", png(24, 11), { media_type: "image/jpeg" });
    expect(jpg.status).toBe(422);
    const pdf = await upload("owner", png(24, 12), { media_type: "application/pdf", filename: "x.pdf" });
    expect(pdf.status).toBe(422);
    expect([await docs(), calls.length]).toEqual([d0, n0]);
    expect((await upload("owner", Buffer.from("%PDF-1.4 synthetic"), { media_type: "application/pdf", filename: "x.pdf" })).status).toBe(200);
  });

  it("(7e) at most 5000 aliases go to intel: the active names first, then learned aliases newest first", async () => {
    const entity = (await db.admin(`SELECT id FROM intel.entity WHERE tenant_id = $1 AND core_ref = $2`, [T.tenant, `core.supplier:${T.supplier}`])).rows[0]!.id;
    await db.admin(`INSERT INTO intel.alias (tenant_id, id, entity_id, alias, normalized, source, created_at)
                    SELECT $1, gen_random_uuid(), $2, 'Learned ' || g, 'learned ' || g, 'member', now() - g * interval '1 second' FROM generate_series(1, 5100) g`,
      [T.tenant, entity]);
    await upload("owner", png(32, 13));
    const sent = calls.at(-1)!.body.aliases;
    expect(sent.length).toBe(5000);
    expect(sent.some((a) => a.alias === "Paneer") && sent.some((a) => a.alias === "Sim Dairy")).toBe(true);
    expect(sent.some((a) => a.alias === "Learned 1")).toBe(true);
    expect(sent.some((a) => a.alias === "Learned 5100")).toBe(false);
  });
});

// (6) GET /v1/imports/documents/{id}/text: the chunks a page span points into, for the owner; another tenant's document is
//     404 (RLS), a single-outlet manager 403 — as the upload.
describe("GET /v1/imports/documents/{id}/text", () => {
  const read = async (who: Who, id: string): Promise<Res> =>
    (await app.request(`/v1/imports/documents/${id}/text`, {
      headers: { Authorization: `Bearer ${idp.sign({ sub: T.subs[who] })}`, [TENANT_HEADER]: T.tenant },
    })) as Res;

  it("(6) the owner reads her document's chunks at their offsets; another tenant's is 404; a one-outlet manager 403", async () => {
    const mine = ImportsInvoiceUploadResponse.parse(await (await upload("owner", Buffer.concat([PNG, Buffer.from("06", "hex")]))).json()).document.document_id;
    // The transcript's chunks as intel's chunks:batch writes them: a gap between them (a whitespace-only slice is not stored).
    await db.admin(`INSERT INTO intel.chunk (tenant_id, id, document_id, seq, char_start, text) VALUES ($1, $2, $3, 0, 0, 'Roasted hazelnuts (synthetic)'),
                    ($1, $4, $3, 1, 31, '2 kg 1560.00 156.00')`, [T.tenant, uuidv7(), mine, uuidv7()]);
    const theirs = uuidv7();
    await db.admin(`INSERT INTO core.document (tenant_id, id, kind, media_type, byte_size, sha256, storage_ref) VALUES ($1, $2, 'supplier_invoice', 'image/png', 1, $3, 'fixture')`,
      [T.other, theirs, "a".repeat(64)]);
    await db.admin(`INSERT INTO intel.chunk (tenant_id, id, document_id, seq, char_start, text) VALUES ($1, $2, $3, 0, 0, 'Another business')`, [T.other, uuidv7(), theirs]);
    const r = await read("owner", mine);
    expect(r.status).toBe(200);
    expect(DocumentTextView.parse(await r.json())).toEqual({ document_id: mine, chunks: [{ char_start: 0, text: "Roasted hazelnuts (synthetic)" }, { char_start: 31, text: "2 kg 1560.00 156.00" }] });
    expect((await read("owner", theirs)).status).toBe(404);
    // Only a supplier invoice's text is served here; a later read's chunks replace an earlier read's.
    const bank = uuidv7();
    await db.admin(`INSERT INTO core.document (tenant_id, id, kind, media_type, byte_size, sha256, storage_ref) VALUES ($1, $2, 'bank_statement', 'text/csv', 1, $3, 'fixture')`,
      [T.tenant, bank, "b".repeat(64)]);
    await db.admin(`INSERT INTO intel.chunk (tenant_id, id, document_id, seq, char_start, text) VALUES ($1, $2, $3, 0, 0, 'A bank line')`, [T.tenant, uuidv7(), bank]);
    expect((await read("owner", bank)).status).toBe(404);
    // The first read's chunks (run r1) are replaced by the re-read's (run r2, newer).
    const reread = ImportsInvoiceUploadResponse.parse(await (await upload("owner", Buffer.concat([PNG, Buffer.from("66", "hex")]))).json()).document.document_id;
    const [r1, r2] = [uuidv7(), uuidv7()];
    for (const r of [r1, r2]) await db.admin(`INSERT INTO intel.run (tenant_id, id, trigger, actor, outlet_scope, expires_at) VALUES ($1, $2, 'ingest', $3, '{"*"}', now() + interval '1 hour')`, [T.tenant, r, T.owner]);
    await db.admin(`INSERT INTO intel.chunk (tenant_id, id, document_id, seq, char_start, text, run_id, created_at) VALUES ($1, $2, $4, 0, 0, 'first read', $3, now() - interval '1 hour')`, [T.tenant, uuidv7(), r1, reread]);
    await db.admin(`INSERT INTO intel.chunk (tenant_id, id, document_id, seq, char_start, text, run_id) VALUES ($1, $2, $4, 0, 0, 'second read', $3)`, [T.tenant, uuidv7(), r2, reread]);
    expect((await (await read("owner", reread)).json()).chunks).toEqual([{ char_start: 0, text: "second read" }]);
    const m = await read("manager", mine);
    expect([m.status, (await m.json()).error.reason_code]).toEqual([403, "authority_denied"]);
  });
});
