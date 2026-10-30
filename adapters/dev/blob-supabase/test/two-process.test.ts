// T-116 gate: an upload through core-api in one process is parsed by a tick in another, through the shared store.
//   process 1 (this one): core-api composed with the store env-root's blobStoreFromEnv picks for MUNIM_BLOB=supabase (pointed at
//             the local Storage stand-in); the owner uploads a synthetic bank statement, which starts its import run (parsing)
//   process 2 (a child with its own TMPDIR and run dir): the serverless boot (env-root's composeFromEnv, env only) with the same
//             store settings, called on its tick route; its imports-parse job reads the bytes back from the stand-in
//   → the run is `previewed` with the file's 4 rows staged; no secret appears in the child's output.
// Embedded Postgres and a local stand-in only: no network, no hosted project. Synthetic data.
// Red-proofs: adapters/dev/blob-supabase/test/redproof-t116.sh (the child on an empty stand-in; env-root ignoring MUNIM_BLOB; the
// chooser falling back to a per-process directory) — each must exit non-zero.
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, startTestDb, type TestDb, type World } from "../../../../db/src/index.ts";
import { createLogger, loadConfig } from "../../../../packages/config/src/index.ts";
import { TENANT_HEADER } from "../../../../services/core-api/src/app.ts";
import { blobStoreFromEnv } from "../../../../services/core-api/src/env-root.ts";
import { composeCoreApi, type CoreApi } from "../../../../services/core-api/src/server.ts";
import { createLocalIdp } from "../../idp-local/index.ts";
import { startStorageStandin, type StorageStandin } from "./storage-standin.ts";

const SECRET = "sb_secret_synthetic_two_process_0123";
const BUCKET = "munim-uploads";
const CRON = "tick-secret-for-tests-0123456789";
const SERVICE = "service-secret-for-tests-0123";
const FILE = join(import.meta.dirname, "../../../../services/core-worker/test/fixtures/imports/synthetic_bank_1.csv");
const idp = createLocalIdp();
const ownerSub = "owner-t116-two-process";
let db: TestDb;
let w: World;
let standin: StorageStandin;
let api: CoreApi;
const pem = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

beforeAll(async () => {
  db = await startTestDb();
  w = await buildWorld(db);
  await db.withContext("munim_core", { tenant_id: w.tenant, outlet_ids: "*", role: "owner", member_id: w.owner, command_type: "tenancy.member.invite.v1" },
    (c) => c.query("UPDATE core.member SET idp_sub = $3 WHERE tenant_id = $1 AND id = $2", [w.tenant, w.owner, ownerSub]));
  standin = await startStorageStandin({ secretKey: SECRET, bucket: BUCKET });
  const url = (role: string) => `postgres://${role}:${db.password}@127.0.0.1:${db.port}/${db.database}`;
  const config = { nodeEnv: "test", redact: (s: string) => s };
  api = await composeCoreApi({
    coreUrl: url("munim_core"), svcUrl: url("munim_svc"), listenUrl: url("munim_core"), idp, config, log: createLogger(config, () => {}),
    keys: { privateKeyPem: pem.privateKey, publicKeyPem: pem.publicKey }, intelUrl: "http://127.0.0.1:9", serviceSecret: SERVICE,
    // The one chooser, as every host entry calls it.
    blobs: blobStoreFromEnv(loadConfig({ env: { MUNIM_BLOB: "supabase", MUNIM_BLOB_BUCKET: BUCKET, SUPABASE_PROJECT_URL: standin.url, SUPABASE_SECRET_KEY: SECRET } })),
  });
});
afterAll(async () => {
  await api?.close();
  await standin?.close();
  await db?.stop();
});

/** Process 2: the serverless boot on its own TMPDIR and run dir, so nothing written by this process's filesystem can reach it. */
async function tickInAnotherProcess(): Promise<{ code: number | null; out: string; err: string }> {
  const scratch = mkdtempSync(join(tmpdir(), "munim-t116-child-"));
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "", TMPDIR: scratch, MUNIM_RUN_DIR: join(scratch, "run"), NODE_ENV: "production",
    MUNIM_IDP: "supabase", SUPABASE_PROJECT_URL: standin.url, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
    SUPABASE_SECRET_KEY: SECRET, MUNIM_BLOB: "supabase", MUNIM_BLOB_BUCKET: BUCKET,
    MUNIM_DATABASE_URL: `postgres://127.0.0.1:${db.port}/${db.database}`,
    MUNIM_DB_PASSWORD_MUNIM_CORE: db.password, MUNIM_DB_PASSWORD_MUNIM_SVC: db.password, MUNIM_DB_PASSWORD_MUNIM_PLATFORM: db.password,
    MUNIM_SERVICE_SECRET: SERVICE, MUNIM_RUN_TOKEN_PRIVATE_KEY_PEM: pem.privateKey, MUNIM_RUN_TOKEN_PUBLIC_KEY_PEM: pem.publicKey,
    MUNIM_CRON_SECRET: CRON, MUNIM_INTEL_URL: "http://127.0.0.1:9", MUNIM_TICK_BUDGET_S: "90",
  };
  const child = spawn(process.execPath, [fileURLToPath(new URL("./fixtures/tick-child.ts", import.meta.url))], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr.on("data", (d: Buffer) => (err += d.toString()));
  const code = await new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
  rmSync(scratch, { recursive: true, force: true });
  return { code, out, err };
}

describe("two processes, one store", () => {
  it("an upload through core-api here is parsed by a tick in another process: the run is previewed with the file's rows", async () => {
    const bytes = readFileSync(FILE);
    const up = await api.app.request("/v1/imports/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${idp.sign({ sub: ownerSub })}`, [TENANT_HEADER]: w.tenant, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "bank_statement", filename: "synthetic_bank_1.csv", media_type: "text/csv", content_base64: bytes.toString("base64") }),
    });
    expect(up.status).toBe(200);
    const run = ((await up.json()) as { run: { import_run_id: string; status: string } }).run;
    expect(run.status).toBe("parsing");
    // The bytes are on the stand-in, at the content-addressed key, and nowhere else this test can see.
    const key = `${w.tenant}/${createHash("sha256").update(bytes).digest("hex")}`;
    expect(standin.objects.get(key)).toEqual(bytes);

    const child = await tickInAnotherProcess();
    const line = child.out.trim().split("\n").at(-1) ?? "";
    const after = (await db.admin<{ status: string; rows_ok: number }>("SELECT status, rows_ok FROM core.import_run WHERE id = $1", [run.import_run_id])).rows[0];
    console.log(`two-process: child exit ${child.code}, tick ${line}\n  run ${JSON.stringify(after)}`);
    expect(child.code).toBe(0);
    const tick = JSON.parse(line) as { status: number; body: { ran: boolean; jobs: Record<string, string> } };
    expect(tick.status).toBe(200);
    expect(tick.body.ran).toBe(true);
    expect(tick.body.jobs["imports-parse"]).toBe("ok");
    expect(after).toEqual({ status: "previewed", rows_ok: 4 });
    expect(child.out + child.err).not.toContain(SECRET);
    expect(child.out + child.err).not.toContain(db.password);
  });
});
