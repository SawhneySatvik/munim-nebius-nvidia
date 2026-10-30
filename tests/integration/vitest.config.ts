// T-034 W2 integration suite (tests/integration). Not a workspace package (like tests/smoke): run it with core-api's
// vitest from the repo root —
//   services/core-api/node_modules/.bin/vitest run --config tests/integration/vitest.config.ts
// One embedded Postgres cluster per run (global-setup.ts); each test file works on its own clone, with the real
// composition root (composeCoreApi) served over HTTP. A plain object (no `vitest/config` import): this directory has
// no node_modules, so `vitest` itself resolves through the alias to core-api's copy.
import { createRequire } from "node:module";
import { dirname } from "node:path";

const fromCoreApi = createRequire(new URL("../../services/core-api/package.json", import.meta.url));

export default {
  root: import.meta.dirname,
  resolve: { alias: { vitest: dirname(fromCoreApi.resolve("vitest/package.json")) } },
  test: {
    include: ["*.test.ts"],
    globalSetup: ["global-setup.ts"],
    env: { NODE_ENV: "test" },
    hookTimeout: 180_000,
    testTimeout: 120_000,
  },
};
