// supabaseBlobStore against a local stand-in for Storage's REST API (test/storage-standin.ts): real HTTP, so binary bodies and
// the routes are really exercised. No call reaches a hosted project. The port's contract cases are shared with every BlobStore
// adapter (services/core-api/test/blob-store.kit.ts); the cases after them are this adapter's own.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLOB_STORE_CONTRACT, type BlobStoreSubject } from "../../../../services/core-api/test/blob-store.kit.ts";
import { supabaseBlobStore } from "../index.ts";
import { startStorageStandin, type StorageStandin } from "./storage-standin.ts";

const SECRET = "sb_secret_synthetic_0123456789";
const TENANT = "11111111-2222-3333-4444-555555555555";
let standin: StorageStandin;
let keeps404: StorageStandin;

beforeAll(async () => {
  standin = await startStorageStandin({ secretKey: SECRET, bucket: "munim-uploads" });
  keeps404 = await startStorageStandin({ secretKey: SECRET, bucket: "munim-uploads", notFoundStatus: 404 });
});
afterAll(async () => {
  await standin.close();
  await keeps404.close();
});

const subject: BlobStoreSubject = {
  store: () => supabaseBlobStore({ projectUrl: standin.url, secretKey: SECRET, bucket: "munim-uploads" }),
  refused: () => supabaseBlobStore({ projectUrl: standin.url, secretKey: "sb_secret_wrong", bucket: "munim-uploads" }),
  unreachable: () => supabaseBlobStore({ projectUrl: "http://127.0.0.1:9", secretKey: SECRET, bucket: "munim-uploads" }),
  requests: () => standin.requests(),
  secrets: [SECRET, "127.0.0.1"],
};

describe("supabaseBlobStore (BlobStore contract)", () => {
  for (const c of BLOB_STORE_CONTRACT) it(c.name, () => c.run(subject));
});

describe("supabaseBlobStore (Storage specifics)", () => {
  it("routes: upload to /object/{bucket}/{tenant}/{sha} with x-upsert, read from /object/authenticated/…; the key only in apikey", async () => {
    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const spy: typeof fetch = (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) } });
      return fetch(url, init);
    };
    const s = supabaseBlobStore({ projectUrl: `${standin.url}/`, secretKey: SECRET, bucket: "munim-uploads", fetch: spy });
    const key = `${TENANT}/${"f".repeat(64)}`;
    await s.put(key, new Uint8Array([7]));
    expect(await s.get(key)).toEqual(new Uint8Array([7]));
    expect(calls.map((c) => [c.method, c.url.slice(standin.url.length)])).toEqual([
      ["POST", `/storage/v1/object/munim-uploads/${key}`],
      ["GET", `/storage/v1/object/authenticated/munim-uploads/${key}`],
    ]);
    expect(calls[0]!.headers).toEqual({ "content-type": "application/octet-stream", "x-upsert": "true", apikey: SECRET });
    expect(calls[1]!.headers).toEqual({ apikey: SECRET });
    expect(standin.objects.get(key)).toEqual(Buffer.from([7]));
  });

  it("a missing object is 'not found' whether the server answers 400 with statusCode 404 or a plain 404", async () => {
    const s = supabaseBlobStore({ projectUrl: keeps404.url, secretKey: SECRET, bucket: "munim-uploads" });
    await expect(s.get(`${TENANT}/${"0".repeat(64)}`)).rejects.toThrow(/^blob get: not found$/);
    const wrongBucket = supabaseBlobStore({ projectUrl: standin.url, secretKey: SECRET, bucket: "other" });
    await expect(wrongBucket.put(`${TENANT}/${"1".repeat(64)}`, new Uint8Array([1]))).rejects.toThrow(/^blob put: HTTP 400$/);
  });

  it("any other 400 is reported by status, its body unread into the message", async () => {
    const s = supabaseBlobStore({ projectUrl: "http://stand.in", secretKey: SECRET, bucket: "b",
      fetch: async () => new Response(JSON.stringify({ statusCode: "400", error: "InvalidKey", message: `bad ${SECRET}` }), { status: 400 }) });
    const e = await s.get(`${TENANT}/${"2".repeat(64)}`).catch((x: Error) => x);
    expect((e as Error).message).toBe("blob get: HTTP 400");
  });
});
