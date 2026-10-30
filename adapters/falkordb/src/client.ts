// The one connection a core process holds to the graph database (D1: core is the only writer; intel never holds a credential).
// Fails fast and never queues: a 2 s connect timeout, no automatic reconnect and no offline queue, so a stopped server answers
// "unavailable" at once instead of hanging a request; the next use connects again. A connection failure, a timeout or a server error
// becomes GraphUnavailable with a fixed label, and only the label and the error's class name are logged: never the server's text (a
// syntax error quotes the query, which carries its parameters) and never the URL. Any other error is not the graph's and is rethrown.
import { FalkorDB } from "falkordb";
import { GraphUnavailable } from "../../../services/core-api/src/internal/graph/port.ts";

export type Params = Record<string, unknown>;
export type Row = Record<string, unknown>;

/** What the projector, the reads and swap.ts run on. */
export interface GraphConn {
  /** GRAPH.RO_QUERY with TIMEOUT: the engine refuses any write (D5). */
  ro(key: string, text: string, params?: Params): Promise<Row[]>;
  /** GRAPH.QUERY, the projector's writes only; returns the reply's statistics lines ("Nodes created: 7", …). */
  write(key: string, text: string, params?: Params): Promise<string[]>;
  /** A plain command (EXISTS, RENAME, SCAN, GRAPH.DELETE) for swap.ts. */
  send(args: string[]): Promise<unknown>;
}

export const CONNECT_TIMEOUT_MS = 2_000;
/** The server's own limit on a read (GRAPH.RO_QUERY … TIMEOUT). */
export const QUERY_TIMEOUT_MS = 1_000;
/** The client's limit on any one command, for a server that stops answering without closing the socket. */
const READ_WAIT_MS = 3_000;
const WRITE_WAIT_MS = 15_000;

/** A server error reply (node-redis ErrorReply and its subclasses), told apart from a connection failure by class name. */
function isServerReply(e: unknown): boolean {
  for (let p = e ? Object.getPrototypeOf(e) : null; p; p = Object.getPrototypeOf(p)) if (p.constructor?.name === "ErrorReply") return true;
  return false;
}
const className = (e: unknown) => (e && typeof e === "object" ? (e.constructor?.name ?? "Error") : typeof e);
/** node-redis's connection-layer errors and the socket's own (ECONNREFUSED, ENOTFOUND, …): the server is not reachable. */
const CONNECTION_ERRORS = new Set(["ConnectionTimeoutError", "SocketTimeoutError", "ClientClosedError", "ClientOfflineError", "DisconnectsClientError",
  "SocketClosedUnexpectedlyError", "ReconnectStrategyError", "SocketTimeoutDuringMaintenanceError"]);
function isConnectionError(e: unknown): boolean {
  if (CONNECTION_ERRORS.has(className(e))) return true;
  const code = (e as { code?: unknown } | null)?.code;
  return (typeof code === "string" && /^E[A-Z]+$/.test(code)) || /^The client is closed$/.test(String((e as Error | null)?.message));
}

export interface GraphClient {
  use<T>(fn: (c: GraphConn) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function graphClient(url: string, log: (line: string) => void = () => {}): GraphClient {
  let db: FalkorDB | null = null;
  let opening: Promise<FalkorDB> | null = null;

  const drop = () => {
    const d = db;
    db = null;
    if (d) void d.close().catch(() => {});
  };
  const open = async (): Promise<FalkorDB> => {
    if (db && (await db.connection).isReady) return db;
    drop();
    opening ??= (async () => {
      // node-redis options the falkordb wrapper passes through (its own type lists only some of them).
      const d = await FalkorDB.connect({ url, socket: { connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: false }, disableOfflineQueue: true } as never);
      // Without a listener an 'error' event would throw and end the process.
      d.on("error", (e: unknown) => log(`graph: connection error ${className(e)}`));
      return d;
    })().finally(() => {
      opening = null;
    });
    db = await opening;
    return db;
  };
  const timed = <T>(p: Promise<T>, ms: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, no) => {
      timer = setTimeout(() => no(new GraphUnavailable("timeout")), ms);
    });
    return Promise.race([p, late]).finally(() => clearTimeout(timer));
  };
  const conn = (d: FalkorDB): GraphConn => ({
    async ro(key, text, params) {
      const r = await timed(d.selectGraph(key).roQuery<Row>(text, { ...(params ? { params } : {}), TIMEOUT: QUERY_TIMEOUT_MS } as never), READ_WAIT_MS);
      return (r.data ?? []) as Row[];
    },
    async write(key, text, params) {
      const r = await timed(d.selectGraph(key).query(text, params ? { params } as never : undefined), WRITE_WAIT_MS);
      return r.metadata ?? [];
    },
    async send(args) {
      return timed((await d.connection).sendCommand(args), READ_WAIT_MS);
    },
  });

  return {
    async use(fn) {
      try {
        return await fn(conn(await open()));
      } catch (e) {
        if (e instanceof GraphUnavailable) {
          if (e.label !== "short_write") drop();
          log(`graph: ${e.label}`);
          throw e;
        }
        if (isServerReply(e)) {
          const label = /timed out/i.test(String((e as Error).message)) ? "timeout" : "error";
          log(`graph: ${label} ${className(e)}`);
          throw new GraphUnavailable(label);
        }
        if (!isConnectionError(e)) throw e; // a bug or a books error: reported as itself (500), not as the graph being down
        drop();
        log(`graph: unreachable ${className(e)}`);
        throw new GraphUnavailable("unreachable");
      }
    },
    async close() {
      const d = db ?? (opening ? await opening.catch(() => null) : null);
      db = null;
      await d?.close().catch(() => {});
    },
  };
}
