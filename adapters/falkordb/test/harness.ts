// The FalkorDB test server every graph gate starts, as `startTestDb()` starts Postgres: no Docker, no cloud instance. Runs the
// Redis + FalkorDB binaries `make falkordb-fetch` put under `.run/falkordb/<platform>/` on a free port in 4540–4559, with a temp
// directory and no persistence; ready on PONG; stopped by PID and its directory removed. A missing binary is a failure, never a
// skip. FALKORDB_TEST_VERSION=4.22.1 loads the official v4.22.1 module (fetched alongside) instead of the wheel's 4.18.3.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const PORTS = { first: 4540, last: 4559 } as const;
const ROOT = resolve(import.meta.dirname, "../../..");

export interface TestFalkor {
  port: number;
  /** `redis://127.0.0.1:<port>` (no password: a local throwaway server). */
  url: string;
  pid: number;
  /** The module version loaded (MODULE LIST is checked against it by the harness self-test). */
  version: string;
  /** SIGTERM by PID, wait for the exit, remove the temp directory. Idempotent. */
  stop(): Promise<void>;
}

/** Where the fetched binaries are; throws (never skips) when `make falkordb-fetch` has not run. */
export function binaries(version = process.env.FALKORDB_TEST_VERSION ?? "4.18.3"): { server: string; module: string; version: string } {
  const dir = join(ROOT, ".run", "falkordb", `${process.platform}-${process.arch}`);
  const server = join(dir, "redislite", "bin", "redis-server");
  const module = version === "4.18.3" ? join(dir, "redislite", "bin", "falkordb.so") : version === "4.22.1" ? join(dir, "falkordb-4.22.1.so") : "";
  if (!module) throw new Error(`FALKORDB_TEST_VERSION must be 4.18.3 or 4.22.1`);
  for (const f of [server, module]) if (!existsSync(f)) throw new Error(`FalkorDB test server not found (${f}): run make falkordb-fetch${version === "4.22.1" ? " with FALKORDB_TEST_VERSION=4.22.1" : ""}`);
  return { server, module, version };
}

const portFree = (port: number) =>
  new Promise<boolean>((ok) => {
    const s = createServer();
    s.once("error", () => ok(false));
    s.listen(port, "127.0.0.1", () => s.close(() => ok(true)));
  });

/** PING over a raw socket; true on +PONG. */
export const ping = (port: number) =>
  new Promise<boolean>((ok) => {
    const s = connect({ host: "127.0.0.1", port });
    let buf = "";
    const done = (v: boolean) => {
      s.destroy();
      ok(v);
    };
    s.setTimeout(500, () => done(false));
    s.once("error", () => done(false));
    s.on("data", (d) => {
      buf += d.toString("utf8");
      if (buf.includes("\r\n")) done(buf.startsWith("+PONG"));
    });
    s.once("connect", () => s.write("PING\r\n"));
  });

const exited = (child: ChildProcess) => new Promise<void>((ok) => (child.exitCode !== null || child.signalCode !== null ? ok() : child.once("exit", () => ok())));
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** `port`: start on exactly this port (a restart test); otherwise the first free one from a random point of the range. */
export async function startTestFalkor(o: { version?: string; port?: number } = {}): Promise<TestFalkor> {
  const bin = binaries(o.version);
  const span = o.port ? 1 : PORTS.last - PORTS.first + 1;
  const offset = Math.floor(Math.random() * span);
  for (let i = 0; i < span; i++) {
    const port = o.port ?? PORTS.first + ((offset + i) % span);
    if (!(await portFree(port))) continue;
    const dir = mkdtempSync(join(tmpdir(), "munim-falkor-"));
    const child = spawn(bin.server, ["--port", String(port), "--bind", "127.0.0.1", "--loadmodule", bin.module, "--save", "", "--appendonly", "no", "--dir", dir], { stdio: "ignore" });
    // A server left behind by a crashed test run would hold the port: kill it when this process exits.
    const onExit = () => child.kill("SIGKILL");
    process.once("exit", onExit);
    let ready = false;
    for (let t = 0; t < 500 && child.exitCode === null && child.signalCode === null; t++) {
      if (await ping(port)) {
        ready = true;
        break;
      }
      await sleep(10);
    }
    if (!ready) {
      // Lost the port to another lane between the check and the bind, or the server refused to start: try the next port.
      child.kill("SIGKILL");
      await exited(child);
      process.removeListener("exit", onExit);
      rmSync(dir, { recursive: true, force: true });
      continue;
    }
    let stopped = false;
    return {
      port, url: `redis://127.0.0.1:${port}`, pid: child.pid!, version: bin.version,
      async stop() {
        if (stopped) return;
        stopped = true;
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        await exited(child);
        clearTimeout(timer);
        process.removeListener("exit", onExit);
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }
  throw new Error(`no FalkorDB test server could start on a free port in ${PORTS.first}–${PORTS.last}`);
}
