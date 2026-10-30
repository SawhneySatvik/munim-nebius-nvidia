// demo-accounts with an injected fetch standing in for Supabase Auth (GoTrue): no network, no .env, synthetic keys only. What it must hold:
// the four users are created confirmed with the one password (or found and reset on a second run), each is signed in with the publishable
// key, admin calls carry the secret key and sign-ins never do, and no error message carries a key, the password or a response body.
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_KEYS, demoEmail, demoPassword, ensureDemoAccounts } from "../demo-accounts.ts";

const PROJECT = "https://synthetic-ref.supabase.example.test";
const SECRET = "sb_secret_synthetic_not_real";
const PUBLISHABLE = "sb_publishable_synthetic_not_real";
const PASSWORD = "synthetic-demo-password-0123456789";

/** A minimal GoTrue: admin create (422 when the email exists), list, update, and the password grant. */
function gotrue() {
  const users = new Map<string, { id: string; email: string; password: string; confirmed: boolean }>();
  const calls: Array<{ method: string; path: string; apikey: string | null; auth: string | null }> = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const h = new Headers(init?.headers);
    const method = init?.method ?? "GET";
    calls.push({ method, path: `${url.pathname}${url.search}`, apikey: h.get("apikey"), auth: h.get("authorization") });
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const admin = h.get("apikey") === SECRET && h.get("authorization") === `Bearer ${SECRET}`;
    if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
      if (!admin) return json(401, {});
      const email = String(body.email);
      if ([...users.values()].some((u) => u.email === email)) return json(422, { code: "email_exists" });
      const u = { id: `user-${users.size + 1}`, email, password: String(body.password), confirmed: body.email_confirm === true };
      users.set(u.id, u);
      return json(200, { id: u.id, email });
    }
    if (url.pathname === "/auth/v1/admin/users" && method === "GET") return admin ? json(200, { users: [...users.values()].map((u) => ({ id: u.id, email: u.email })) }) : json(401, {});
    const m = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(url.pathname);
    if (m && method === "PUT") {
      const u = users.get(m[1]!);
      if (!admin || !u) return json(admin ? 404 : 401, {});
      u.password = String(body.password);
      u.confirmed = body.email_confirm === true;
      return json(200, { id: u.id });
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password" && method === "POST") {
      if (h.get("apikey") !== PUBLISHABLE || h.get("authorization")) return json(401, {});
      const u = [...users.values()].find((x) => x.email === body.email);
      if (!u || u.password !== body.password || !u.confirmed) return json(400, { error: "invalid_grant", secret_echo: SECRET });
      return json(200, { access_token: `token-for-${u.id}` });
    }
    return json(404, {});
  }) as typeof globalThis.fetch;
  return { users, calls, fetch };
}

describe("demo accounts", () => {
  it("creates the four users confirmed and returns a token for each", async () => {
    const g = gotrue();
    const tokens = await ensureDemoAccounts({ projectUrl: PROJECT, secretKey: SECRET, publishableKey: PUBLISHABLE, password: PASSWORD, fetch: g.fetch });
    expect(Object.keys(tokens)).toEqual(["owner", "manager", "counter", "kitchen"]);
    expect([...g.users.values()].map((u) => [u.email, u.confirmed, u.password === PASSWORD])).toEqual([
      ["owner@cobnut-demo.invalid", true, true], ["manager@cobnut-demo.invalid", true, true], ["counter@cobnut-demo.invalid", true, true], ["kitchen@cobnut-demo.invalid", true, true],
    ]);
    expect(Object.values(tokens)).toEqual(["token-for-user-1", "token-for-user-2", "token-for-user-3", "token-for-user-4"]);
    // The secret key goes only to the admin routes; sign-ins use the publishable key alone.
    for (const c of g.calls) expect(c.path.startsWith("/auth/v1/token") ? c.apikey === PUBLISHABLE && c.auth === null : c.apikey === SECRET).toBe(true);
  });

  it("a second run finds the existing users and resets them to the current password", async () => {
    const g = gotrue();
    await ensureDemoAccounts({ projectUrl: PROJECT, secretKey: SECRET, publishableKey: PUBLISHABLE, password: "old-password-synthetic-000", fetch: g.fetch });
    const tokens = await ensureDemoAccounts({ projectUrl: PROJECT, secretKey: SECRET, publishableKey: PUBLISHABLE, password: PASSWORD, fetch: g.fetch });
    expect(g.users.size).toBe(4);
    expect([...g.users.values()].every((u) => u.password === PASSWORD)).toBe(true);
    expect(Object.keys(tokens)).toHaveLength(4);
    expect(g.calls.filter((c) => c.method === "PUT")).toHaveLength(4);
  });

  it("fails closed without leaking a key, the password or a body", async () => {
    const g = gotrue();
    const err = await ensureDemoAccounts({ projectUrl: PROJECT, secretKey: "wrong-secret", publishableKey: PUBLISHABLE, password: PASSWORD, fetch: g.fetch }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("create owner: HTTP 401");
    // Created fine, but the grant is refused with a body that echoes the secret: the message is the step and status only.
    const bad = await ensureDemoAccounts({ projectUrl: PROJECT, secretKey: SECRET, publishableKey: "wrong-publishable", password: PASSWORD, fetch: g.fetch }).catch((e: Error) => e);
    expect((bad as Error).message).toBe("sign in owner: HTTP 401");
    for (const e of [err, bad]) for (const s of [SECRET, PUBLISHABLE, PASSWORD]) expect(String((e as Error).message)).not.toContain(s);
  });

  it("the demo emails are <key>@cobnut-demo.invalid", () => {
    expect(DEMO_KEYS.map(demoEmail)).toEqual(["owner@cobnut-demo.invalid", "manager@cobnut-demo.invalid", "counter@cobnut-demo.invalid", "kitchen@cobnut-demo.invalid"]);
  });

  it("the password is generated once into the run dir, owner-only, and reused", () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-accounts-"));
    const a = demoPassword(dir);
    const b = demoPassword(dir);
    expect(a.password).toBe(b.password);
    expect(a.password.length).toBeGreaterThanOrEqual(32);
    expect(readFileSync(a.file, "utf8").trim()).toBe(a.password);
    expect(statSync(a.file).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "cobnut")).mode & 0o777).toBe(0o700);
  });
});
