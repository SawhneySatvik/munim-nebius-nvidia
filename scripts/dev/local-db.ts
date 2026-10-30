// `make up LOCAL_DB=1`: a throwaway embedded Postgres 18 for local runs without the hosted project. Applies
// every migration and the country packs (the @munim/db harness), writes the runtime-role passwords to
// `<MUNIM_RUN_DIR>/db-roles.json` (m-1's bootstrap format) and the base URL to `<MUNIM_RUN_DIR>/local-db.json`,
// then runs until SIGTERM, when it stops the cluster and deletes its data. Synthetic and empty: no tenants.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RUNTIME_ROLES, startTestDb } from "../../db/src/harness.ts";

const runDir = resolve(process.env.MUNIM_RUN_DIR || join(import.meta.dirname, "../../.run/local"));
mkdirSync(runDir, { recursive: true });
const ready = join(runDir, "local-db.json");
rmSync(ready, { force: true });

const db = await startTestDb();
// The harness gives every runtime role the cluster's test password (test-only, local, discarded on stop).
const roles = Object.fromEntries(RUNTIME_ROLES.map((r) => [r, db.password]));
writeFileSync(join(runDir, "db-roles.json"), `${JSON.stringify({ written_at: new Date().toISOString(), roles }, null, 2)}\n`, { mode: 0o600 });
writeFileSync(ready, `${JSON.stringify({ url: `postgresql://127.0.0.1:${db.port}/${db.database}` })}\n`);
const skipped = db.migration.skipped.map((s) => s.name);
console.log(`local-db: embedded Postgres on 127.0.0.1:${db.port}; migrations applied ${db.migration.applied.length}, skipped ${skipped.length}`
  + `${skipped.length ? ` (${skipped.join(", ")})` : ""}; packs ${db.packs?.inserted.length ?? 0}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  rmSync(ready, { force: true });
  await db.stop().catch(() => {});
  console.log("local-db: stopped");
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
setInterval(() => {}, 1 << 30);
