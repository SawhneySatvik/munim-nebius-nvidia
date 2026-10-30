// Harness self-test (design §10 row 3): a server starts on a port in 4540–4559, answers a graph query with the pinned module
// loaded, and once stopped its process is gone and its port is free again. Expected module versions are the pins of
// scripts/dev/fetch-falkordb.ts (4.18.3 → MODULE LIST ver 41803; 4.22.1 → 42201), typed here by hand.
import { FalkorDB } from "falkordb";
import { describe, expect, it } from "vitest";
import { binaries, ping, PORTS, startTestFalkor } from "./harness.ts";

const MODULE_VER: Record<string, number> = { "4.18.3": 41803, "4.22.1": 42201 };
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("startTestFalkor", () => {
  it("starts, answers a graph query, stops by PID and frees its port", async () => {
    const t0 = performance.now();
    const s = await startTestFalkor();
    const startMs = Math.round(performance.now() - t0);
    expect(s.port).toBeGreaterThanOrEqual(PORTS.first);
    expect(s.port).toBeLessThanOrEqual(PORTS.last);
    expect(alive(s.pid)).toBe(true);
    const db = await FalkorDB.connect({ socket: { host: "127.0.0.1", port: s.port } });
    const conn = await db.connection;
    const modules = JSON.stringify(await conn.sendCommand(["MODULE", "LIST"]));
    expect(modules).toContain(`"graph","ver",${MODULE_VER[s.version]}`);
    const g = db.selectGraph("munim:harness-self-test");
    await g.query("CREATE (:outlet {id: 'o1'}), (:outlet {id: 'o2'})");
    expect((await g.roQuery<{ c: number }>("MATCH (n:outlet) RETURN count(n) AS c")).data).toEqual([{ c: 2 }]);
    await db.close();
    await s.stop();
    expect(alive(s.pid)).toBe(false);
    expect(await ping(s.port)).toBe(false);
    console.log(`harness: FalkorDB ${s.version} on ${s.port}, ready in ${startMs} ms`);
  });

  it("an unknown version refuses; the binaries named exist", () => {
    expect(() => binaries("9.9.9")).toThrow(/FALKORDB_TEST_VERSION must be/);
    expect(binaries().server).toMatch(/redislite\/bin\/redis-server$/);
  });
});
