// The FalkorDB mapping as packages/config loads it in this checkout (design §10 row 7): MUNIM_GRAPH=falkordb selects it, its URL is a
// secret redacted from every log line (the password inside it too), a URL that is not redis:// or rediss:// refuses, and in a build
// without this folder MUNIM_GRAPH=falkordb refuses by name. No server is needed: the backend connects on first use.
import { describe, expect, it } from "vitest";
import { createLogger, graphEnvs, loadConfig } from "../../../packages/config/src/index.ts";
import { graphFromConfig } from "../../../services/core-api/src/graph.ts";
import { falkorUrl, graphEnv } from "../env.ts";

const PW = "pl4nted-falkor-pw-0b7c";
const URL_ = `rediss://default:${PW}@graph.example.test:6380`;

describe("the FalkorDB mapping", () => {
  it("config found it by path, and it is the module this test imports", () => {
    expect(graphEnvs).toContain(graphEnv);
    expect([graphEnv.mode, graphEnv.names, graphEnv.secretNames]).toEqual(["falkordb",
      ["MUNIM_FALKORDB_URL", "FALKOR_DB_HOST", "FALKOR_DB_PORT", "FALKOR_DB_NAME", "FALKOR_DB_PASSWORD", "FALKOR_DB_TLS"],
      ["MUNIM_FALKORDB_URL", "FALKOR_DB_PASSWORD"]]);
  });

  it("MUNIM_GRAPH=falkordb builds the backend; the URL and its password never reach a log line", async () => {
    const cfg = loadConfig({ env: { MUNIM_GRAPH: "falkordb", MUNIM_FALKORDB_URL: URL_ } });
    const lines: string[] = [];
    const log = createLogger(cfg, (l) => lines.push(l));
    const backend = await graphFromConfig(cfg, log);
    expect(backend.mode).toBe("falkordb");
    expect([typeof backend.read, typeof backend.fresh, typeof backend.cleanup]).toEqual(["function", "function", "function"]);
    log(`url ${URL_} and password ${PW}`);
    expect(lines).toEqual(["url [redacted:MUNIM_FALKORDB_URL] and password [redacted:MUNIM_FALKORDB_URL]"]);
    await backend.close?.();
  });

  it("unset MUNIM_GRAPH keeps Postgres in this build (it has both); a bad URL refuses without echoing it", async () => {
    const lines: string[] = [];
    const plain = loadConfig({ env: { MUNIM_FALKORDB_URL: URL_ } });
    expect((await graphFromConfig(plain, createLogger(plain, (l) => lines.push(l)))).mode).toBe("postgres");
    const bad = loadConfig({ env: { MUNIM_GRAPH: "falkordb", MUNIM_FALKORDB_URL: `http://default:${PW}@graph.example.test` } });
    await expect(graphFromConfig(bad, createLogger(bad, (l) => lines.push(l)))).rejects.toThrow(/^MUNIM_FALKORDB_URL must be a redis:\/\/ or rediss:\/\/ URL$/);
    const unset = loadConfig({ env: { MUNIM_GRAPH: "falkordb" } });
    await expect(graphFromConfig(unset, createLogger(unset, () => {}))).rejects.toThrow(/MUNIM_FALKORDB_URL is not set/);
  });

  it("in a build without this adapter, MUNIM_GRAPH=falkordb refuses by name", () => {
    expect(() => loadConfig({ env: { MUNIM_GRAPH: "falkordb", MUNIM_FALKORDB_URL: URL_ }, graphs: [] })).toThrow("no graph backend falkordb in this build");
  });
});

describe("FalkorDB Cloud's parts (FALKOR_DB_*)", () => {
  const parts = { FALKOR_DB_HOST: "r-abc.falkordb.example.test", FALKOR_DB_PORT: "55011", FALKOR_DB_NAME: "falkordb", FALKOR_DB_PASSWORD: PW };

  it("builds the URL from the parts, the user and password encoded; TLS only when asked", () => {
    expect(falkorUrl(loadConfig({ env: parts }))).toBe(`redis://falkordb:${PW}@r-abc.falkordb.example.test:55011`);
    expect(falkorUrl(loadConfig({ env: { ...parts, FALKOR_DB_TLS: "1" } }))).toMatch(/^rediss:\/\//);
    expect(falkorUrl(loadConfig({ env: { ...parts, FALKOR_DB_PASSWORD: "p@ss:w/rd" } }))).toContain("p%40ss%3Aw%2Frd@");
    expect(falkorUrl(loadConfig({ env: { ...parts, FALKOR_DB_PORT: undefined } }))).toMatch(/:6379$/);
  });

  it("MUNIM_FALKORDB_URL wins over the parts; with neither, it names the missing setting; a bad port refuses", () => {
    expect(falkorUrl(loadConfig({ env: { ...parts, MUNIM_FALKORDB_URL: URL_ } }))).toBe(URL_);
    expect(() => falkorUrl(loadConfig({ env: {} }))).toThrow(/MUNIM_FALKORDB_URL/);
    expect(() => falkorUrl(loadConfig({ env: { ...parts, FALKOR_DB_PORT: "63 79" } }))).toThrow(/FALKOR_DB_PORT must be a port number/);
  });

  it("the password is redacted from every log line", () => {
    const cfg = loadConfig({ env: parts });
    const lines: string[] = [];
    createLogger(cfg, (l) => lines.push(l))(`password ${PW}`);
    expect(lines).toEqual(["password [redacted:FALKOR_DB_PASSWORD]"]);
  });
});
