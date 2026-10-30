// idp-supabase with an injected fetch (W1 fix #71): no network, no .env. Synthetic keys and subjects only.
// What it must hold: the JWKS comes from <project>/auth/v1/.well-known/jwks.json; issuer and audience are
// checked; a symmetric (HS256) token is refused; an unknown kid triggers one rate-limited refetch (rotation).
import { createHmac, generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { supabaseIdp } from "../index.ts";

const PROJECT = "https://synthetic-ref.supabase.example.test";
const KEY = "sb_publishable_synthetic";
const ISSUER = `${PROJECT}/auth/v1`;
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function es256Key(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" } };
}

function token(key: { kid: string; privateKey: KeyObject }, claims: Record<string, unknown> = {}) {
  const head = b64({ alg: "ES256", typ: "JWT", kid: key.kid });
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ sub: "user-1", email: "c@example.test", iss: ISSUER, aud: "authenticated", iat: now, exp: now + 600, ...claims });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: key.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** A fetch that serves the current JWKS and records every URL it was asked for. */
function jwksServer(initial: object[]) {
  type UserReply = () => Response | Promise<Response>;
  const state = { keys: initial, calls: [] as string[], userCalls: [] as Array<{ url: string; headers: Record<string, string> }>, user: (() => new Response("{}", { status: 401 })) as UserReply };
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url) === `${ISSUER}/user`) {
      state.userCalls.push({ url: String(url), headers: init?.headers as Record<string, string> });
      return state.user();
    }
    state.calls.push(String(url));
    return new Response(JSON.stringify({ keys: state.keys }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { state, fetch };
}

const refused = async (p: Promise<unknown>) => {
  try {
    await p;
    return "accepted";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("idp-supabase", () => {
  describe("email_verified comes from GoTrue GET /auth/v1/user, never from the token", () => {
    const user = (o: Record<string, unknown>) => () => new Response(JSON.stringify({ email: "c@example.test", email_confirmed_at: "2026-10-01T00:00:00Z", ...o }), { status: 200 });
    const run = async (reply: () => Response | Promise<Response>, claims: Record<string, unknown> = {}) => {
      const k = es256Key("k1");
      const { state, fetch } = jwksServer([k.jwk]);
      state.user = reply;
      const t = token(k, claims);
      const id = await supabaseIdp({ projectUrl: PROJECT, publishableKey: KEY, fetch }).verify(t, { needEmailVerified: true });
      return { id, state, t };
    };

    it("confirmed with the same email (case-insensitive) → true; sends the same bearer and the publishable key", async () => {
      const { id, state, t } = await run(user({ email: "C@Example.Test" }));
      expect(id.email_verified).toBe(true);
      expect(state.userCalls).toEqual([{ url: `${ISSUER}/user`, headers: { Authorization: `Bearer ${t}`, apikey: KEY } }]);
    });
    it.each([
      ["email_confirmed_at null", user({ email_confirmed_at: null })],
      ["email mismatch", user({ email: "someone-else@example.test" })],
      ["401", () => new Response("{}", { status: 401 })],
      ["network error", () => { throw new TypeError("fetch failed"); }],
    ])("%s → false", async (_l, reply) => {
      expect((await run(reply)).id.email_verified).toBe(false);
    });
    it("a user_metadata.email_verified claim alone → false (GoTrue says unconfirmed)", async () => {
      expect((await run(user({ email_confirmed_at: null }), { user_metadata: { email_verified: true }, email_verified: true })).id.email_verified).toBe(false);
    });
    it("cached per token for 60 s: a second verify makes no second call; a different token does", async () => {
      const k = es256Key("k1");
      let now = 1_000_000;
      const { state, fetch } = jwksServer([k.jwk]);
      state.user = user({});
      const idp = supabaseIdp({ projectUrl: PROJECT, publishableKey: KEY, fetch, now: () => now });
      const t = token(k);
      const need = { needEmailVerified: true };
      await idp.verify(t, need);
      await idp.verify(t, need);
      expect(state.userCalls.length).toBe(1);
      await idp.verify(token(k, { sub: "user-2" }), need);
      expect(state.userCalls.length).toBe(2);
      now += 61_000;
      await idp.verify(t, need);
      expect(state.userCalls.length).toBe(3);
    });
  });

  // R1-M5: member and customer requests never wait on GoTrue; only a caller that binds an email asks.
  it("without needEmailVerified: no GET /user at all, email_verified false even for a confirmed user", async () => {
    const k = es256Key("k1");
    const { state, fetch } = jwksServer([k.jwk]);
    state.user = () => new Response(JSON.stringify({ email: "c@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" }), { status: 200 });
    const idp = supabaseIdp({ projectUrl: PROJECT, publishableKey: KEY, fetch });
    const t = token(k);
    expect((await idp.verify(t)).email_verified).toBe(false);
    expect((await idp.verify(t, { needEmailVerified: false })).email_verified).toBe(false);
    expect(state.userCalls).toHaveLength(0);
    expect((await idp.verify(t, { needEmailVerified: true })).email_verified).toBe(true);
    expect(state.userCalls).toHaveLength(1);
  });

  describe("R1-M5: a hung Supabase is cut off by an AbortSignal timeout (fails closed)", () => {
    /** A fetch that never answers on its own: it settles only when the caller's signal aborts. */
    const hang = (seen: Array<AbortSignal | undefined>) => ((_url: string | URL, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return new Promise<Response>((_ok, fail) => {
        if (!init?.signal) return; // no signal: this request would hang forever (the test times out → red)
        init.signal.addEventListener("abort", () => fail(init.signal!.reason));
      });
    }) as typeof globalThis.fetch;

    it("JWKS fetch: refused 'jwks unavailable' within the timeout", async () => {
      const seen: Array<AbortSignal | undefined> = [];
      const k = es256Key("k1");
      const t0 = Date.now();
      const idp = supabaseIdp({ projectUrl: PROJECT, publishableKey: KEY, fetch: hang(seen), timeoutMs: 50 });
      expect(await refused(idp.verify(token(k)))).toBe("jwks unavailable");
      expect(Date.now() - t0).toBeLessThan(2_000);
      expect(seen.map((s) => s instanceof AbortSignal)).toEqual([true]);
    }, 5_000);

    it("GET /user: email_verified false within the timeout; the JWKS still verifies the token", async () => {
      const seen: Array<AbortSignal | undefined> = [];
      const k = es256Key("k1");
      const { fetch: serve } = jwksServer([k.jwk]);
      const mixed = ((url: string | URL, init?: RequestInit) =>
        String(url) === `${ISSUER}/user` ? hang(seen)(url, init) : serve(url, init)) as typeof globalThis.fetch;
      const t0 = Date.now();
      const id = await supabaseIdp({ projectUrl: PROJECT, publishableKey: KEY, fetch: mixed, timeoutMs: 50 }).verify(token(k), { needEmailVerified: true });
      expect([id.sub, id.email_verified]).toEqual(["user-1", false]);
      expect(Date.now() - t0).toBeLessThan(2_000);
      expect(seen.map((s) => s instanceof AbortSignal)).toEqual([true]);
    }, 5_000);
  });

  it("R1-M5: the confirmation cache holds at most confirmMax tokens, least recently used evicted first", async () => {
    const k = es256Key("k1");
    const { state, fetch } = jwksServer([k.jwk]);
    state.user = () => new Response(JSON.stringify({ email: "c@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" }), { status: 200 });
    const idp = supabaseIdp({ projectUrl: PROJECT, publishableKey: KEY, fetch, confirmMax: 3 });
    const need = { needEmailVerified: true };
    const [a, b, c, d] = ["u-a", "u-b", "u-c", "u-d"].map((sub) => token(k, { sub }));
    for (const t of [a, b, c]) await idp.verify(t!, need);
    expect(state.userCalls).toHaveLength(3);
    await idp.verify(a!, need); // a hit: a becomes the most recent; b is now the oldest
    expect(state.userCalls).toHaveLength(3);
    await idp.verify(d!, need); // a 4th token → b evicted
    expect(state.userCalls).toHaveLength(4);
    await idp.verify(a!, need);
    await idp.verify(c!, need);
    expect(state.userCalls).toHaveLength(4); // a, c, d still cached
    await idp.verify(b!, need); // b was evicted → asked again
    expect(state.userCalls).toHaveLength(5);
  });

  it("valid ES256 token → identity, JWKS fetched once from the project's auth path and cached", async () => {
    const k = es256Key("k1");
    const { state, fetch } = jwksServer([k.jwk]);
    const idp = supabaseIdp({ publishableKey: KEY, projectUrl: `${PROJECT}/`, fetch });
    expect(await idp.verify(token(k))).toEqual({ sub: "user-1", email: "c@example.test", email_verified: false });
    expect(await idp.verify(token(k, { sub: "user-2" }))).toEqual({ sub: "user-2", email: "c@example.test", email_verified: false });
    expect(state.calls).toEqual([`${ISSUER}/.well-known/jwks.json`]);
  });

  it("wrong issuer, wrong audience, expired, HS256 and alg none → refused", async () => {
    const k = es256Key("k1");
    const { fetch } = jwksServer([k.jwk]);
    const idp = supabaseIdp({ publishableKey: KEY, projectUrl: PROJECT, fetch });
    expect(await refused(idp.verify(token(k, { iss: "https://other.supabase.example.test/auth/v1" })))).toBe("issuer");
    expect(await refused(idp.verify(token(k, { aud: "anon" })))).toBe("audience");
    expect(await refused(idp.verify(token(k, { exp: Math.floor(Date.now() / 1000) - 120 })))).toBe("expired");
    // A legacy shared-secret token, even one whose kid matches a published key.
    const head = b64({ alg: "HS256", typ: "JWT", kid: "k1" });
    const body = b64({ sub: "user-1", iss: ISSUER, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 });
    const hs = `${head}.${body}.${createHmac("sha256", "synthetic-secret").update(`${head}.${body}`).digest("base64url")}`;
    expect(await refused(idp.verify(hs))).toBe("algorithm");
    expect(await refused(idp.verify(`${b64({ alg: "none", kid: "k1" })}.${body}.`))).toBe("algorithm");
  });

  it("rate limit: inside the refetch window an unknown kid is refused without a second JWKS fetch", async () => {
    const old = es256Key("old");
    const next = es256Key("new");
    const { state, fetch } = jwksServer([old.jwk]);
    const idp = supabaseIdp({ publishableKey: KEY, projectUrl: PROJECT, fetch });
    expect((await idp.verify(token(old))).sub).toBe("user-1");
    // The project rotates: the new key is published after our first fetch.
    state.keys = [old.jwk, next.jwk];
    // Rate limit: within MIN_REFETCH_MS of the first fetch, an unknown kid is refused without a refetch …
    expect(await refused(idp.verify(token(next)))).toBe("unknown key");
    expect(state.calls).toHaveLength(1);
  });

  it("key rotation after the refetch window: one refetch, then the new key verifies", async () => {
    const old = es256Key("old");
    const next = es256Key("new");
    const { state, fetch } = jwksServer([old.jwk]);
    let now = 1_000_000_000_000;
    const idp = supabaseIdp({ publishableKey: KEY, projectUrl: PROJECT, fetch, now: () => now });
    expect((await idp.verify(token(old))).sub).toBe("user-1");
    state.keys = [old.jwk, next.jwk];
    now += 61_000;
    expect((await idp.verify(token(next))).sub).toBe("user-1");
    expect(state.calls).toHaveLength(2);
    expect((await idp.verify(token(next))).sub).toBe("user-1"); // cached now
    expect(state.calls).toHaveLength(2);
  });
});
