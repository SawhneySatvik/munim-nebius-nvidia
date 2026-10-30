// The butter question's stack (R68, F3 step 13): tests/manager/ask_stack.mts's line protocol (ask, http, sql, intel_reply, stop)
// on the Cobnut world, with core's graph backend the FalkorDB adapter on its own test server (adapters/falkordb/test/harness.ts:
// a local throwaway server, no Docker, no cloud). Embedded Postgres 18, the real core-api, seeded by worldgen through the API
// (synthetic data, a fixed seed and day, no .env). intel's graph tools reach FalkorDB only through core's graph:query.
//   node services/intel/tests/graph/butter_stack.mts          (prints {"ready": …} once seeded)
//   {"op":"graph","template","args"} → rows  (the graph backend itself, whole tenant: what the answer is checked against)
// core's clock is pinned to AS_OF for the run-frame (part of the recorded request). Exits non-zero on any failure (gotcha 33).
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { falkorGraph } from "../../../../adapters/falkordb/src/index.ts";
import { startTestFalkor } from "../../../../adapters/falkordb/test/harness.ts";
import { createLogger, loadConfig } from "../../../../packages/config/src/index.ts";
import { startTestDb } from "../../../../db/src/index.ts";
import { TENANT_HEADER } from "../../../../services/core-api/src/app.ts";
import { createLocalIdp } from "../../../../services/core-api/src/auth/local-idp.ts";
import { configureInternal } from "../../../../services/core-api/src/internal/index.ts";
import { graphCaller } from "../../../../services/core-api/src/internal/graph/index.ts";
import type { GraphTemplate } from "../../../../services/core-api/src/internal/graph/port.ts";
import { createPool } from "../../../../services/core-api/src/lib/db.ts";
import { localBlobStore } from "../../../../services/core-api/src/modules/imports/index.ts";
import { configureThreads } from "../../../../services/core-api/src/modules/threads/index.ts";
import { composeCoreApi, serveApi } from "../../../../services/core-api/src/server.ts";
import { parsePendingImports } from "../../../../services/core-worker/src/imports/index.ts";
import { startIntelStub } from "../../../../scripts/dev/intel-stub.ts";
import { personaIdentity } from "../../../../tools/worldgen/src/api.ts";
import { idOf } from "../../../../tools/worldgen/src/ids.ts";
import { runWorld } from "../../../../tools/worldgen/src/run.ts";

const SECRET = "f3-butter-stack-service-secret-not-real-0123456789";
/** A fixed Cobnut: the same seed, the same outlet-local "today" and history, on every run (the request is the fixture key). */
const AS_OF = "2026-10-10";
const SEED = "butter-question-v1";
const DAYS = 35; // Cobnut's ended coupon (DIWALI25) closes 30 days back, inside the history it needs
/** Any URL serves (nothing here calls the simulator); the simulated suppliers' cards must name one (T-127). */
const SIM = "http://127.0.0.1:4625";

type Req = { op: string; [k: string]: unknown };
const say = (o: unknown) => process.stdout.write(`${JSON.stringify(o)}\n`);

async function main() {
  const db = await startTestDb();
  const falkor = await startTestFalkor();
  const stub = await startIntelStub();
  const blobDir = await mkdtemp(join(tmpdir(), "f3-butter-blobs-"));
  const url = (role: string) => `postgresql://${role}:${db.password}@127.0.0.1:${db.port}/${db.database}`;
  const config = loadConfig({ env: {} });
  const keys = generateKeyPairSync("ed25519");
  const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const idp = createLocalIdp();
  const graph = falkorGraph({ url: falkor.url });
  const operator = personaIdentity("cobnut", "operator");
  await db.admin(`INSERT INTO platform.operator (id, idp_sub, email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [idOf("butter-stack", "cobnut", "operator"), operator.sub, operator.email]);
  const api = await composeCoreApi({
    coreUrl: url("munim_core"), svcUrl: url("munim_svc"), platformUrl: url("munim_platform"), listenUrl: url("munim_core"), idp, config,
    log: createLogger(config, () => {}), blobs: localBlobStore(blobDir),
    keys: { privateKeyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem },
    intelUrl: stub.url, serviceSecret: SECRET, graph,
  });
  configureInternal(api.deps, { serviceSecret: SECRET, keys: api.keys, watchWindowMs: 0, clock: () => new Date(`${AS_OF}T06:30:00Z`) });
  const served = await serveApi(api.app, 0);
  const svcPool = createPool(url("munim_svc"), 2);
  const timer = setInterval(() => void parsePendingImports({ pool: svcPool, blobs: localBlobStore(blobDir), log: () => {} }).catch(() => {}), 150);

  // The bridged AskPort, as ask_stack.mts: one pending call per id.
  const pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  let next = 0;
  configureThreads(api.deps, {
    keys: api.keys,
    intel: (token, body) => new Promise((ok, fail) => {
      const id = next++;
      pending.set(id, { ok, fail });
      say({ intel_ask: { id, token, body } });
    }),
  });

  const bearer = (persona: string) => idp.sign(personaIdentity("cobnut", persona));
  try {
    const r = await runWorld({ world: "cobnut", seed: SEED, asOf: AS_OF, days: DAYS, baseUrl: `http://127.0.0.1:${served.port}`, token: bearer, operator: true, simUrl: SIM });
    const tenant = r.api.tenantId!;
    clearInterval(timer);
    const currency = (await db.admin(`SELECT base_currency FROM core.tenant WHERE tenant_id = $1`, [tenant])).rows[0]!.base_currency as string;
    await db.admin(`UPDATE platform.feature_flag SET value = 'true' WHERE key = 'intel.enabled'`);
    // Cobnut's operator already set a month budget: one far above any run, so the run-frame says "model".
    await db.admin(`INSERT INTO platform.llm_budget (tenant_id, month, limit_minor, currency) VALUES ($1, $2, 100000000, $3)
                    ON CONFLICT (tenant_id, month) DO UPDATE SET limit_minor = EXCLUDED.limit_minor`, [tenant, `${AS_OF.slice(0, 8)}01`, currency]);
    say({ ready: true, tenant, public_key_pem: publicKeyPem, secret: SECRET, as_of: AS_OF });

    const handle = async (m: Req): Promise<unknown> => {
      if (m.op === "ask") {
        const res = await api.app.request("/v1/ask", {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer(m.persona as string)}`, [TENANT_HEADER]: tenant, "content-type": "application/json" },
          body: JSON.stringify({ question: m.question }),
        });
        return { status: res.status, body: await res.text() };
      }
      if (m.op === "graph") return graph.template(m.template as GraphTemplate, m.args as Record<string, string | number>, graphCaller(svcPool, tenant, ["*"]));
      if (m.op === "http") {
        const res = await api.app.request(m.path as string, {
          method: m.method as string, headers: m.headers as Record<string, string>, ...(m.body === undefined || m.body === null ? {} : { body: m.body as string }),
        });
        return { status: res.status, body: await res.text() };
      }
      if (m.op === "sql") return (await db.admin(m.q as string, (m.params as unknown[]) ?? [])).rows;
      throw new Error(`unknown op ${m.op}`);
    };

    await new Promise<void>((done, fail) => {
      const rl = createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const m = JSON.parse(line) as Req;
        if (m.op === "stop") return void (rl.close(), done());
        if (m.op === "intel_reply") {
          const p = pending.get(m.id as number);
          pending.delete(m.id as number);
          if (m.status === 200) p?.ok(JSON.parse(m.body as string));
          else p?.fail(new Error(`intel /ask: HTTP ${m.status}`));
          return;
        }
        handle(m).then((out) => say({ ok: out }), fail);
      });
      rl.on("close", () => done());
    });
  } finally {
    clearInterval(timer);
    await new Promise((ok) => served.server.close(() => ok(undefined)));
    await api.close();
    await svcPool.end();
    await stub.close();
    await falkor.stop();
    await db.stop();
    await rm(blobDir, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (e) => {
  console.error("butter_stack failed:", e);
  process.exit(1);
});
