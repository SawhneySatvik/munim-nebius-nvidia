// blob-supabase — the BlobStore over Supabase Storage (03-arch ports; the port is services/core-api/src/modules/imports/blob.ts),
// so an upload on one serverless instance is readable by the import parse in a tick on another (T-116). Dev adapter (R9):
// Supabase lives only under adapters/dev and is never part of a Cup export (the Cup uses adapters/gcp/blob-gcs).
// Storage's REST API over fetch, no SDK. One private bucket; objects at the content-addressed `<tenant>/<sha256>` keys the local
// store uses (checked here too, so a key can never walk out of its tenant prefix). The project's secret key is server-side
// only and rides in the `apikey` header. Errors name the step and the HTTP status only — never the key, the URL or a body.
// UNVERIFIED against the hosted project: the routes, the `x-upsert` header and the not-found reply follow the public
// storage-api source (upload `POST /storage/v1/object/{bucket}/{path}`, read `GET /storage/v1/object/authenticated/{bucket}/{path}`;
// a missing object is HTTP 400 with `"statusCode": "404"` in its JSON body by default, HTTP 404 where the server keeps
// statuses), and the `apikey`-only header follows Supabase's API-keys guide.
import type { BlobStore } from "../../../services/core-api/src/modules/imports/blob.ts";

const KEY = /^[0-9a-f-]{36}\/[0-9a-f]{64}$/;
const TIMEOUT_MS = 30_000;

export function supabaseBlobStore(o: {
  projectUrl: string; secretKey: string; bucket: string; fetch?: typeof fetch | undefined; timeoutMs?: number | undefined;
}): BlobStore {
  const call = o.fetch ?? fetch;
  const base = `${o.projectUrl.replace(/\/+$/, "")}/storage/v1/object`;
  const bucket = encodeURIComponent(o.bucket);
  const send = async (url: string, init: RequestInit, what: string): Promise<Response> => {
    try {
      return await call(url, { ...init, headers: { ...init.headers, apikey: o.secretKey }, signal: AbortSignal.timeout(o.timeoutMs ?? TIMEOUT_MS) });
    } catch {
      throw new Error(`blob ${what}: storage unreachable`);
    }
  };
  // The key's `/` stays a path separator (a folder per tenant); both halves are URL-safe once the pattern holds.
  const checked = (key: string) => {
    if (!KEY.test(key)) throw new Error("blob key is not <tenant>/<sha256>");
    return key;
  };
  return {
    async put(key, bytes) {
      // x-upsert: the key is content-addressed, so a second put of the same key writes the same bytes (the port's contract).
      const res = await send(`${base}/${bucket}/${checked(key)}`,
        { method: "POST", headers: { "content-type": "application/octet-stream", "x-upsert": "true" }, body: Buffer.from(bytes) }, "put");
      if (!res.ok) throw new Error(`blob put: HTTP ${res.status}`);
    },
    async get(key) {
      const res = await send(`${base}/authenticated/${bucket}/${checked(key)}`, {}, "get");
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      if (res.status === 404 || (res.status === 400 && (await notFoundBody(res)))) throw new Error("blob get: not found");
      throw new Error(`blob get: HTTP ${res.status}`);
    },
  };
}

/** Storage's default error reply carries the real status in its body: `{"statusCode": "404", "error": "not_found", …}`. */
async function notFoundBody(res: Response): Promise<boolean> {
  const j = (await res.json().catch(() => null)) as { statusCode?: unknown } | null;
  return j?.statusCode === "404";
}
