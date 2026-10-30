import { defineConfig } from "vitest/config";

// The tests that need Postgres attach to one embedded cluster per run (test/global-setup.ts); every FalkorDB test starts its
// own server (test/harness.ts).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    env: { NODE_ENV: "test" },
    hookTimeout: 180_000,
    testTimeout: 60_000,
  },
});
