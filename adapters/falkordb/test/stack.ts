// Test-mode composition for the graph gates (as tools/worldgen/test/stack.ts, on this run's embedded Postgres clone): the real
// core-api app served on 127.0.0.1, the intel stub, the local IdP for persona tokens, the import-parse pass of core-worker on a
// timer, and the graph backend under test. The Cobnut world is seeded through the public API (core commands), never by SQL.
// Synthetic data only; nothing here reads .env.
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestDb } from "@munim/db";
import { createLogger, loadConfig } from "../../../packages/config/src/index.ts";
import { startIntelStub } from "../../../scripts/dev/intel-stub.ts";
import { createLocalIdp } from "../../../services/core-api/src/auth/local-idp.ts";
import type { GraphBackend } from "../../../services/core-api/src/internal/graph/port.ts";
import { createPool } from "../../../services/core-api/src/lib/db.ts";
import { localBlobStore } from "../../../services/core-api/src/modules/imports/index.ts";
import { composeCoreApi, type CoreApi, serveApi } from "../../../services/core-api/src/server.ts";
import { parsePendingImports } from "../../../services/core-worker/src/imports/index.ts";
import { personaIdentity } from "../../../tools/worldgen/src/api.ts";
import { idOf } from "../../../tools/worldgen/src/ids.ts";
import { runWorld } from "../../../tools/worldgen/src/run.ts";
import { businessToday } from "../../../tools/worldgen/src/time.ts";

export interface Stack {
  api: CoreApi;
  baseUrl: string;
  /** What core-worker's composition takes (as main.ts hands it). */
  worker: { svcUrl: string; keys: { privateKeyPem: string; publicKeyPem: string }; intelUrl: string; serviceSecret: string };
  /** A persona's bearer token (Cobnut's: owner, manager, counter, kitchen, operator). */
  token(persona: string): string;
  stop(): Promise<void>;
}

/** Any URL serves (nothing here calls the simulator); the cards must be on it (T-127). */
const SIM = "http://127.0.0.1:4625";

export async function startStack(db: TestDb, o: { graph?: GraphBackend; log?: (line: string) => void } = {}): Promise<Stack> {
  const stub = await startIntelStub();
  const idp = createLocalIdp();
  const operator = personaIdentity("cobnut", "operator");
  await db.admin(`INSERT INTO platform.operator (id, idp_sub, email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [idOf("graph-stack", "cobnut", "operator"), operator.sub, operator.email]);
  const url = (role: string) => `postgresql://${role}:${db.password}@127.0.0.1:${db.port}/${db.database}`;
  const config = loadConfig({ env: {} });
  const log = o.log ? createLogger(config, o.log) : createLogger(config, () => {});
  const pair = generateKeyPairSync("ed25519");
  const keys = { privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
  const serviceSecret = "graph-test-service-secret-not-real-0123";
  const blobDir = await mkdtemp(join(tmpdir(), "graph-blobs-"));
  const blobs = localBlobStore(blobDir);
  const api = await composeCoreApi({
    coreUrl: url("munim_core"), svcUrl: url("munim_svc"), platformUrl: url("munim_platform"), listenUrl: url("munim_core"), idp, config, log, blobs,
    keys, intelUrl: stub.url, serviceSecret, ...(o.graph ? { graph: o.graph } : {}),
  });
  const served = await serveApi(api.app, 0);
  const svcPool = createPool(url("munim_svc"), 2);
  const timer = setInterval(() => void parsePendingImports({ pool: svcPool, blobs, log: () => {} }).catch(() => {}), 150);
  return {
    api,
    baseUrl: `http://127.0.0.1:${served.port}`,
    worker: { svcUrl: url("munim_svc"), keys, intelUrl: stub.url, serviceSecret },
    token: (persona) => idp.sign(personaIdentity("cobnut", persona)),
    async stop() {
      clearInterval(timer);
      await new Promise((ok) => served.server.close(() => ok(undefined)));
      await api.close();
      await svcPool.end();
      await stub.close();
      await rm(blobDir, { recursive: true, force: true });
    },
  };
}

/** Seeds one Cobnut tenant (a fresh tenant per seed) through the public API. 30 history days: the fewest that seed cleanly (its
 *  ended coupon runs to 30 days back and must start after the history does). */
export async function seedCobnut(stack: Stack, seed: string): Promise<{ tenantId: string; api: Awaited<ReturnType<typeof runWorld>>["api"] }> {
  const r = await runWorld({ world: "cobnut", seed, asOf: businessToday(new Date(), "Asia/Kolkata"), days: 30, baseUrl: stack.baseUrl, token: stack.token, operator: true, simUrl: SIM });
  return { tenantId: r.api.tenantId!, api: r.api };
}
