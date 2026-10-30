// A local stand-in for the subset of Supabase Storage's REST API the adapter uses — no network, port 0. Behaviour follows the
// public storage-api source as the adapter's header records it: upload `POST /storage/v1/object/{bucket}/{path}` (a second
// upload of a path is refused unless `x-upsert: true`), read `GET /storage/v1/object/authenticated/{bucket}/{path}`; a missing
// object or bucket is HTTP 400 with `"statusCode": "404"` in the JSON body (or HTTP 404 with `notFoundStatus: 404`); a wrong
// `apikey` is 401. Objects live in this process's memory only.
import { createServer, type Server } from "node:http";

export interface StorageStandin {
  url: string;
  /** Requests received so far. */
  requests(): number;
  objects: Map<string, Buffer>;
  close(): Promise<void>;
}

export async function startStorageStandin(o: { secretKey: string; bucket: string; notFoundStatus?: 400 | 404 }): Promise<StorageStandin> {
  const objects = new Map<string, Buffer>();
  let requests = 0;
  const reply = (res: import("node:http").ServerResponse, status: number, body: unknown) =>
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  const notFound = (res: import("node:http").ServerResponse, error: string) =>
    reply(res, o.notFoundStatus ?? 400, { statusCode: "404", error, message: error === "not_found" ? "Object not found" : "Bucket not found" });
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      requests++;
      if (req.headers.apikey !== o.secretKey) return reply(res, 401, { message: "Invalid API key" });
      const path = new URL(req.url!, "http://x").pathname;
      const read = /^\/storage\/v1\/object\/authenticated\/([^/]+)\/(.+)$/.exec(path);
      const write = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(path);
      if (req.method === "GET" && read) {
        if (decodeURIComponent(read[1]!) !== o.bucket) return notFound(res, "Bucket not found");
        const obj = objects.get(read[2]!);
        if (!obj) return notFound(res, "not_found");
        return res.writeHead(200, { "content-type": "application/octet-stream" }).end(obj);
      }
      if (req.method === "POST" && write && write[1] !== "authenticated") {
        if (decodeURIComponent(write[1]!) !== o.bucket) return notFound(res, "Bucket not found");
        if (objects.has(write[2]!) && req.headers["x-upsert"] !== "true") return reply(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        objects.set(write[2]!, Buffer.concat(chunks));
        return reply(res, 200, { Id: write[2], Key: `${o.bucket}/${write[2]}` });
      }
      reply(res, 400, { statusCode: "400", error: "invalid_route" });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => requests,
    objects,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
