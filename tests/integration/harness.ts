// T-034 harness: a private clone of the run's database, the canonical world (buildWorld) and the REAL core-api
// composition root (composeCoreApi: munim_core / munim_svc / munim_platform pools, a local blob store, idp-local)
// served over HTTP on 127.0.0.1. Fixture rows that no route writes (an IdP subject on a world member, a storefront
// key) are written the way the world builder writes rows, BEFORE a flow's watermark; everything a flow asserts on
// goes through HTTP. Expected values live in the flow files, typed by hand. Synthetic data only.
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inject } from "vitest";
import { createLocalIdp, type LocalIdp } from "../../services/core-api/src/auth/local-idp.ts";
import type { IdP } from "../../services/core-api/src/auth/port.ts";
import { attachTestDb, buildWorld, ownerCtx, type TestDb, uuidv7, type World } from "../../db/src/index.ts";
import { createLogger, loadConfig } from "../../packages/config/src/index.ts";
import { GUEST_TOKEN_HEADER, STOREFRONT_KEY_HEADER, TENANT_HEADER } from "../../services/core-api/src/app.ts";
import { type BlobStore, localBlobStore } from "../../services/core-api/src/modules/imports/index.ts";
import { composeCoreApi, serveApi, type CoreApi } from "../../services/core-api/src/server.ts";

export { uuidv7, type World };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Res = { status: number; body: any; headers: Headers };

/** Who calls: an IdP subject (signed by idp-local), the tenant header, a storefront key, a guest token. */
export interface Caller { sub?: string; email?: string; verified?: boolean; tenant?: string; key?: string; guest?: string }

export interface Env {
  db: TestDb;
  api: CoreApi;
  idp: LocalIdp;
  /** Every IdP verify the app made, in order: did the caller ask for the email confirmation (R1-M5)? */
  idpCalls: Array<{ needEmailVerified: boolean }>;
  /** Every line core-api logged (R1-m12 checks; printed too with INTEGRATION_DEBUG). */
  logs: string[];
  blobs: BlobStore;
  base: string;
  http(method: "GET" | "POST", path: string, who: Caller, body?: unknown): Promise<Res>;
  /** POST a command envelope `{command_id, idempotency_key, type, payload}`. */
  cmd(who: Caller, path: string, type: string, payload: unknown, key?: string): Promise<Res>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows<R = any>(sql: string, params?: unknown[]): Promise<R[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  one<R = any>(sql: string, params?: unknown[]): Promise<R>;
  stop(): Promise<void>;
}

const info = () => inject("munimDb" as never) as unknown as Parameters<typeof attachTestDb>[0] & Parameters<typeof attachTestDb>[1];

export async function startEnv(): Promise<Env> {
  const { migration, packs, ...cluster } = info();
  const db = await attachTestDb(cluster, { migration, packs });
  const url = (role: string) => `postgresql://${role}:${db.password}@127.0.0.1:${db.port}/${db.database}`;
  const k = generateKeyPairSync("ed25519");
  const keys = { privateKeyPem: k.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }).toString() };
  const config = loadConfig({ env: {} });
  const idp = createLocalIdp();
  // The app's IdP behaves like idp-supabase on the R1-M5 flag: the email counts as confirmed only when the caller
  // asks (onboarding, bind, a customer's first link). A route that forgets to ask sees an unverified email here too.
  const idpCalls: Env["idpCalls"] = [];
  const appIdp: IdP = {
    async verify(token, o = {}) {
      idpCalls.push({ needEmailVerified: o.needEmailVerified === true });
      const id = await idp.verify(token);
      return { ...id, email_verified: o.needEmailVerified === true && id.email_verified };
    },
  };
  const blobs = localBlobStore(mkdtempSync(join(tmpdir(), "munim-int-blobs-")));
  const logs: string[] = [];
  const sink = (l: string) => {
    logs.push(l);
    if (process.env.INTEGRATION_DEBUG) console.error(l);
  };
  await plantRule(db);
  // Nothing listens on port 9: publishing after commit fails and the rows wait for the sweeper (never fails a request).
  const api = await composeCoreApi({
    coreUrl: url("munim_core"), svcUrl: url("munim_svc"), platformUrl: url("munim_platform"), listenUrl: url("munim_core"), blobs,
    idp: appIdp, config, log: createLogger(config, sink), keys, intelUrl: "http://127.0.0.1:9", serviceSecret: "s".repeat(64),
  });
  const { port, server } = await serveApi(api.app, 0);
  const base = `http://127.0.0.1:${port}`;

  const http: Env["http"] = async (method, path, who, body) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (who.sub) headers.Authorization = `Bearer ${idp.sign({ sub: who.sub, ...(who.email ? { email: who.email, email_verified: who.verified ?? true } : {}) })}`;
    if (who.tenant) headers[TENANT_HEADER] = who.tenant;
    if (who.key) headers[STOREFRONT_KEY_HEADER] = who.key;
    if (who.guest) headers[GUEST_TOKEN_HEADER] = who.guest;
    const r = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null, headers: r.headers };
  };
  return {
    db, api, idp, idpCalls, logs, blobs, base, http,
    cmd: (who, path, type, payload, key = `int-${uuidv7()}`) => http("POST", path, who, { command_id: uuidv7(), idempotency_key: key, type, payload }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: async (sql, params = []) => (await db.admin(sql, params)).rows as any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    one: async (sql, params = []) => (await db.admin(sql, params)).rows[0] as any,
    async stop() {
      await new Promise<void>((ok) => server.close(() => ok()));
      await api.close();
      await db.stop();
    },
  };
}

/** redproof.sh: MUNIM_INT_PLANT=rule:<rule_id> switches one derivation off on this clone, silently — a BEFORE
 *  trigger (named to fire before the book guard) drops every row written under that rule, as code that forgot to
 *  derive would. The flow's hand values must then fail. Unknown rules are refused (gotcha 17). */
async function plantRule(db: TestDb): Promise<void> {
  const v = process.env.MUNIM_INT_PLANT ?? "";
  if (!v.startsWith("rule:")) {
    if (v !== "" && !v.startsWith("scan:")) throw new Error(`MUNIM_INT_PLANT: unknown plant ${v}`);
    return;
  }
  const rule = v.slice("rule:".length);
  const targets = (await db.admin<{ t: string }>(`SELECT DISTINCT target_table AS t FROM core.derivation_rule WHERE rule_id = $1`, [rule])).rows.map((r) => r.t);
  if (!targets.length) throw new Error(`MUNIM_INT_PLANT: no derivation rule ${rule}`);
  await db.admin(`CREATE SCHEMA IF NOT EXISTS t034_plant`);
  await db.admin(`CREATE FUNCTION t034_plant.skip() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL; END $f$`);
  for (const t of targets) {
    await db.admin(`CREATE TRIGGER aaa_plant_skip BEFORE INSERT OR UPDATE ON ${t} FOR EACH ROW
      WHEN (current_setting('app.posting_rule', true) = '${rule.replaceAll("'", "''")}') EXECUTE FUNCTION t034_plant.skip()`);
  }
}

/** The canonical world plus IdP subjects for its owner and its outlet-1 staff member (fixture, before any watermark). */
export async function world(env: Env, country: "IN" | "AU" = "IN") {
  const w = await buildWorld(env.db, { country });
  const subs = { owner: `owner-${uuidv7()}`, staff: `staff-${uuidv7()}` };
  await env.db.withContext("munim_core", ownerCtx(w, { command_type: "tenancy.member.invite.v1" }), async (c) => {
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [w.owner, subs.owner]);
    await c.query(`UPDATE core.member SET idp_sub = $2 WHERE id = $1`, [w.staff, subs.staff]);
  });
  return { w, owner: { sub: subs.owner, tenant: w.tenant } as Caller, staff: { sub: subs.staff, tenant: w.tenant } as Caller };
}

/** A storefront key (core.storefront_key is operational: only sha256(key) is stored) bound to `channel`. */
export async function storefrontKey(env: Env, w: World, channel: string): Promise<string> {
  const key = `sfk_int_${randomBytes(24).toString("hex")}`;
  await env.db.withContext("munim_core", ownerCtx(w), (c) =>
    c.query(`INSERT INTO core.storefront_key (tenant_id, id, channel_id, key_hash) VALUES ($1, $2, $3, $4)`,
      [w.tenant, uuidv7(), channel, createHash("sha256").update(key).digest("hex")]));
  return key;
}

/** Σ postings per account code of the entries derived from `sourceId`, by rule — e.g. {"finance.post_order": {"1110": 25200, …}}. */
export async function postingsOf(env: Env, sourceId: string): Promise<Record<string, Record<string, number>>> {
  const r = await env.rows<{ rule: string; code: string; amount: string }>(
    `SELECT j.posting_rule AS rule, a.code, sum(p.amount_minor)::text AS amount
       FROM core.journal_entry j JOIN core.posting p ON p.tenant_id = j.tenant_id AND p.journal_entry_id = j.id
       JOIN core.account a ON a.tenant_id = p.tenant_id AND a.id = p.account_id
      WHERE j.source_id = $1 GROUP BY 1, 2 ORDER BY 1, 2`, [sourceId]);
  const out: Record<string, Record<string, number>> = {};
  for (const x of r) (out[x.rule] ??= {})[x.code] = Number(x.amount);
  return out;
}
