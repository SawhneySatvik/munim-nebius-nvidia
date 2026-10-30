// R44a: `make seed` mints its own tokens only against a server that reports idp "local" (adapters/dev/idp-local's minter).
// Drives this repo's Makefile and dev minter, so it is not part of the Cup export (scripts/export-cup/rules.py).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@munim/config";
import type { TestDb } from "@munim/db";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createLocalIdp, createPersistentLocalIdp } from "../src/auth/local-idp.ts";
import { setIdpMode } from "../src/health/index.ts";
import type { Deps } from "../src/lib/types.ts";
import { serveApi } from "../src/server.ts";
import { openDb } from "./db.ts";

const MINTER = join(import.meta.dirname, "../../../adapters/dev/idp-local/mint-seed-tokens.ts");
const ROOT = join(import.meta.dirname, "../../..");
const scratch = mkdtempSync(join(tmpdir(), "munim-minter-"));

describe("the seed minter", () => {
  let db: TestDb;
  let pools: { core: pg.Pool; svc: pg.Pool };
  let otherApp: Awaited<ReturnType<typeof createApp>>;
  let localApp: Awaited<ReturnType<typeof createApp>>;
  const local = createPersistentLocalIdp(scratch);
  beforeAll(async () => {
    db = await openDb();
    pools = { core: db.pool("munim_core", 2), svc: db.pool("munim_svc", 2) };
    const config = { nodeEnv: "test", redact: (s: string) => s };
    const mk = (idp: Deps["idp"]): Deps => ({ pools, idp, storefronts: async () => null, config, log: createLogger(config, () => {}) });
    const otherDeps = mk(createLocalIdp()); // another key, as a server on a real IdP would verify with
    setIdpMode(otherDeps, "identity-platform");
    const localDeps = mk(local);
    setIdpMode(localDeps, "local");
    otherApp = await createApp(otherDeps);
    localApp = await createApp(localDeps);
  });
  afterAll(async () => {
    await Promise.allSettled([pools.core.end(), pools.svc.end()]);
    await db?.stop();
  });

  it("worldgen refuses to self-mint against a server that is not on the local IdP, and mints against a local one", async () => {
    const listen = async (app: Awaited<ReturnType<typeof createApp>>) => {
      const { port, server } = await serveApi(app, 0);
      return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
    };
    const run = (args: string[], env: Record<string, string> = {}) => new Promise<{ code: number | null; out: string; err: string }>((ok) => {
      const p = spawn(args[0] === "make" ? "make" : process.execPath, args[0] === "make" ? args.slice(1) : args, { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MUNIM_RUN_DIR: scratch, ...env } });
      let out = "", err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => ok({ code, out, err }));
    });
    const sup = await listen(otherApp);
    const loc = await listen(localApp);
    try {
      const m1 = await run([MINTER, "--world=store", `--url=${sup.url}`, `--run-dir=${scratch}`]);
      expect(m1.code).toBe(1);
      expect(m1.out).toBe("");
      expect(m1.err).toContain('not "local"');
      // `make seed` with no tokens: the minter runs first; its refusal stops the seed before worldgen starts.
      const w = await run(["make", "-C", ROOT, "seed", "WORLD=store", `RUN=${scratch}`], { MUNIM_API_URL: sup.url });
      expect(w.code).not.toBe(0);
      expect(w.err).toContain('not "local"');
      expect(w.err).toContain("none can be minted");
      expect(w.out).not.toContain("worldgen:");
      const m2 = await run([MINTER, "--world=store", `--url=${loc.url}`, `--run-dir=${scratch}`]);
      expect(m2.code).toBe(0);
      const tok = (JSON.parse(m2.out) as { owner: string }).owner;
      await expect(local.verify(tok)).resolves.toMatchObject({ sub: "worldgen-store-owner", email_verified: true });
    } finally {
      sup.close();
      loc.close();
    }
  });
});
