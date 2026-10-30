// idp-supabase — the dev IdP adapter (R35, R42): verifies Supabase Auth access tokens against the project's
// published JWKS. Dev only; excluded from any Cup export (R9). UNVERIFIED against the hosted project: the
// JWKS path, issuer `<project>/auth/v1` and audience `authenticated` follow Supabase's public docs and the
// project must use asymmetric signing keys (a legacy HS256 shared secret is refused by verifyJwt).
import { createHash } from "node:crypto";
import { verifyJwt, type Jwks } from "../../../services/core-api/src/auth/jwt.ts";
import { IdpError, type Identity, type IdP, type VerifyOpts } from "../../../services/core-api/src/auth/port.ts";

const TTL_MS = 10 * 60_000;
const MIN_REFETCH_MS = 60_000;
const CONFIRM_TTL_MS = 60_000;
// R1-M5: a slow or hung Supabase must not hold a request (or a pooled connection) open, and the confirmation
// cache must not grow with every token ever presented.
const TIMEOUT_MS = 3_000;
const CONFIRM_MAX = 1_000;

export function supabaseIdp(opts: {
  projectUrl: string; publishableKey: string; fetch?: typeof fetch; now?: () => number; timeoutMs?: number; confirmMax?: number;
}): IdP {
  const base = opts.projectUrl.replace(/\/+$/, "");
  const issuer = `${base}/auth/v1`;
  const get = opts.fetch ?? fetch;
  const clock = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const confirmMax = opts.confirmMax ?? CONFIRM_MAX;
  let cached: { jwks: Jwks; at: number } | null = null;

  async function load(force: boolean): Promise<Jwks> {
    const now = clock();
    if (cached && (now - cached.at < (force ? MIN_REFETCH_MS : TTL_MS))) return cached.jwks;
    let res: Response;
    try {
      res = await get(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new IdpError("jwks unavailable");
    }
    if (!res.ok) throw new IdpError("jwks unavailable");
    const jwks = (await res.json()) as Jwks;
    if (!Array.isArray(jwks.keys)) throw new IdpError("jwks malformed");
    cached = { jwks, at: now };
    return jwks;
  }

  // email_verified comes from GoTrue itself, never from the token: user_metadata is user-editable, so a claim
  // there proves nothing. Fail closed on any error or timeout. Cached per sha256(token) for at most 60 s, at most
  // `confirmMax` entries, least recently used evicted first (a Map iterates in insertion order; a hit re-inserts).
  const confirmed = new Map<string, { ok: boolean; at: number }>();
  async function emailConfirmed(token: string, email: string | null): Promise<boolean> {
    if (email === null) return false;
    const key = createHash("sha256").update(token).digest("hex");
    const hit = confirmed.get(key);
    confirmed.delete(key);
    if (hit && clock() - hit.at < CONFIRM_TTL_MS) {
      confirmed.set(key, hit);
      return hit.ok;
    }
    let ok = false;
    try {
      const res = await get(`${issuer}/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: opts.publishableKey }, signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const u = (await res.json()) as { email?: unknown; email_confirmed_at?: unknown };
        ok = typeof u.email_confirmed_at === "string" && u.email_confirmed_at !== "" && typeof u.email === "string" && u.email.toLowerCase() === email.toLowerCase();
      }
    } catch {
      ok = false;
    }
    confirmed.set(key, { ok, at: clock() });
    if (confirmed.size > confirmMax) confirmed.delete(confirmed.keys().next().value!);
    return ok;
  }

  return {
    /** GoTrue is asked only when the caller needs the confirmation (VerifyOpts); otherwise false, no request. */
    async verify(token: string, o: VerifyOpts = {}): Promise<Identity> {
      const opt = { issuer, audience: "authenticated", now: clock, emailVerified: () => false };
      let id: Identity;
      try {
        id = verifyJwt(token, await load(false), opt);
      } catch (e) {
        // A rotated key: refetch once (rate-limited) and retry.
        if (e instanceof IdpError && e.message === "unknown key") id = verifyJwt(token, await load(true), opt);
        else throw e;
      }
      return { ...id, email_verified: o.needEmailVerified === true && await emailConfirmed(token, id.email) };
    },
  };
}
