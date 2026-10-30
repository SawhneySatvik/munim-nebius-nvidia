// One embedded Postgres 18 cluster for the whole run (no Docker, no .env); each test file attaches to a private
// clone of its migrated, pack-seeded database (harness.ts). The embedded-postgres exit-hook fix (gotcha 33) lives in
// the @munim/db harness, so a failing run exits non-zero.
import { startTestDb, type TestDb } from "../../db/src/harness.ts";

let db: TestDb | undefined;

export default async function setup(project: { provide(key: string, value: unknown): void }) {
  db = await startTestDb();
  project.provide("munimDb", { port: db.port, password: db.password, database: db.database, migration: db.migration, packs: db.packs });
  return async () => {
    await db?.stop();
  };
}
