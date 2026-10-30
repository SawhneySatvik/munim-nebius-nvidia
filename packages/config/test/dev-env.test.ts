// T-122: the dev mapping (adapters/dev/env), as config loads it in this repo. Not part of the Cup export, which has no
// adapters/dev: there config.test.ts covers the neutral names alone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { devEnv as mapping } from "../../../adapters/dev/env/index.ts";
import { ConfigError, devEnv, ENV_NAMES, graphEnvs, loadConfig, resolveIdpMode } from "../src/index.ts";

const PLANTED_PW = "pl4nted-Pw-dev-91c2";
const pooler = (port: number, pw = PLANTED_PW) => `postgresql://postgres.ref:${pw}@pooler.example.test:${port}/postgres`;

describe("the dev mapping is loaded in this repo", () => {
  it("config found it by its computed path, and it is the module the test imports", () => {
    expect(devEnv).toBe(mapping);
  });

  it(".env.example (the founder's template) is exactly the neutral names it does not stand in for, plus its own names", () => {
    const example = readFileSync(join(import.meta.dirname, "../../../.env.example"), "utf8");
    const names = [...example.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(20);
    expect([...ENV_NAMES.filter((n) => !mapping.aliases[n]), ...mapping.names, ...graphEnvs.flatMap((g) => g.names)].sort()).toEqual([...names].sort());
  });
});

describe("dev names stand in for the neutral ones", () => {
  it("the pooler URLs stand in for MUNIM_DB_URL_*, and a role logs in as <role>.<project id>", () => {
    const cfg = loadConfig({
      env: {
        SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING: pooler(6543), SUPABASE_SESSION_POOLER_CONNECTION_STRING: pooler(5432),
        SUPABASE_PROJECT_ID: "ref", MUNIM_DB_PASSWORD_MUNIM_CORE: "core-role-pw-1",
      },
    });
    expect(cfg.get("MUNIM_DB_URL_TRANSACTION")).toBe(pooler(6543));
    const t = new URL(cfg.dbUrl("munim_core"));
    const s = new URL(cfg.sessionDbUrl("munim_core"));
    expect([t.username, t.password, t.port, s.username, s.port]).toEqual(["munim_core.ref", "core-role-pw-1", "6543", "munim_core.ref", "5432"]);
  });

  it("a neutral URL logs in as the plain role even when the project id is set", () => {
    const cfg = loadConfig({ env: { MUNIM_DB_URL_TRANSACTION: "postgres://db.example.test:5432/munim", SUPABASE_PROJECT_ID: "ref", MUNIM_DB_PASSWORD_MUNIM_SVC: "svc-pw" } });
    expect(new URL(cfg.dbUrl("munim_svc")).username).toBe("munim_svc");
  });

  it("the env file's dev names are read, and get() still returns them by name (deploy/vercel/env-setup.ts reads them so)", () => {
    const cfg = loadConfig({ env: { SUPABASE_PROJECT_URL: "https://ref.example.test", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" } });
    expect([cfg.get("SUPABASE_PROJECT_URL"), cfg.require("SUPABASE_PUBLISHABLE_KEY")]).toEqual(["https://ref.example.test", "sb_publishable_x"]);
  });

  it("both names set and different is refused, naming both and never a value; the same value is accepted", () => {
    const other = pooler(6543, "pl4nted-Pw-other-77");
    let thrown: unknown;
    try {
      loadConfig({ env: { MUNIM_DB_URL_TRANSACTION: other, SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING: pooler(6543) } });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    const msg = (thrown as Error).message;
    expect(msg).toBe("MUNIM_DB_URL_TRANSACTION and SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING are both set and differ — set one");
    expect(msg).not.toContain(PLANTED_PW);
    expect(msg).not.toContain("pl4nted-Pw-other-77");
    expect(loadConfig({ env: { MUNIM_DB_URL_SESSION: pooler(5432), SUPABASE_SESSION_POOLER_CONNECTION_STRING: pooler(5432) } }).get("MUNIM_DB_URL_SESSION")).toBe(pooler(5432));
  });

  it("an unset neutral name says which dev name may stand in for it", () => {
    expect(() => loadConfig({ env: {} }).dbUrl("munim_core")).toThrow("MUNIM_DB_URL_TRANSACTION (or SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING) is not set");
  });

  it("dev secrets are redacted, the password inside a pooler URL too", () => {
    const cfg = loadConfig({ env: { SUPABASE_SESSION_POOLER_CONNECTION_STRING: pooler(5432), SUPABASE_SECRET_KEY: "sb_secret_pl4nted_0042" } });
    const line = cfg.redact(`a ${PLANTED_PW} b sb_secret_pl4nted_0042 c`);
    expect(line).toMatch(/a \[redacted:(MUNIM_DB_URL_SESSION|SUPABASE_SESSION_POOLER_CONNECTION_STRING)\] b/); // the alias registers it under both names
    expect(line).toContain("[redacted:SUPABASE_SECRET_KEY]");
    expect(line).not.toContain(PLANTED_PW);
  });
});

describe("its IdP and blob store", () => {
  it("MUNIM_IDP unset means its IdP; MUNIM_BLOB=supabase is accepted; both adapters are built from its names", () => {
    expect(resolveIdpMode({}, [])).toBe("supabase");
    expect(resolveIdpMode({ MUNIM_IDP: "identity-platform" }, [])).toBe("identity-platform");
    expect(() => resolveIdpMode({ MUNIM_IDP: "Supabase" }, [])).toThrow(/exactly one of "local", "identity-platform", "supabase"/);
    const cfg = loadConfig({
      env: { MUNIM_BLOB: "supabase", MUNIM_BLOB_BUCKET: "munim-uploads", SUPABASE_PROJECT_URL: "https://ref.example.test", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x", SUPABASE_SECRET_KEY: "sb_secret_x" },
    });
    expect(cfg.blob).toBe("supabase");
    expect(typeof (cfg.devAdapter("idp", "supabase") as { verify?: unknown }).verify).toBe("function");
    expect(typeof (cfg.devAdapter("blob", "supabase") as { put?: unknown }).put).toBe("function");
    expect(() => loadConfig({ env: { MUNIM_BLOB: "supabase" } }).devAdapter("blob", "supabase")).toThrow(/SUPABASE_PROJECT_URL is not set/);
  });
});
