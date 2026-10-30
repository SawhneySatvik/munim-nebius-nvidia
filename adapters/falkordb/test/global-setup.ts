// One embedded Postgres cluster for the run (as core-api's gates); each test file that needs the books attaches to a private
// clone (test/db.ts). The exit-code fix for embedded-postgres' exit hook lives in the @munim/db harness (gotcha 33).
import { startTestDb, type TestDb } from "@munim/db";
import type { TestProject } from "vitest/node";

let db: TestDb | undefined;

export default async function setup(project: TestProject) {
  db = await startTestDb();
  project.provide("munimDb", { port: db.port, password: db.password, database: db.database, migration: db.migration, packs: db.packs });
  return async () => {
    await db?.stop();
  };
}
