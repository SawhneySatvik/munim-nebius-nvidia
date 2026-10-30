// T-122: apps/web's demo sign-in on this repo's Vercel deployment (munim-cobnut) runs Supabase's password grant through
// adapters/dev/env/web-signin.ts, with the names deploy/vercel/env-setup.ts already sends. Moved from apps/web's tests,
// which now cover only the neutral modes.
import { describe, expect, it } from "vitest";
import { devSignin } from "../../env/web-signin.ts";

const PASSWORD = "test-password-not-real";
const env = { SUPABASE_PROJECT_URL: "https://project.supabase.test/", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
const login = { email: "owner@cobnut-demo.invalid", password: PASSWORD };
type Sent = { url: string; init: RequestInit };
const idp = (answer: Response | Error) => {
  const sent: Sent[] = [];
  const f = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    if (answer instanceof Error) throw answer;
    return answer.clone();
  }) as unknown as typeof fetch;
  return { f, sent };
};

describe("the dev web sign-in grant (Supabase Auth)", () => {
  it("serves MUNIM_IDP=supabase (and an unset MUNIM_IDP)", () => {
    expect(devSignin.mode).toBe("supabase");
  });
  it("runs the password grant with the publishable key and returns the access token", async () => {
    const { f, sent } = idp(Response.json({ access_token: "jwt-for-owner", refresh_token: "r" }));
    expect(await devSignin.grant(login, env, f)).toBe("jwt-for-owner");
    expect(sent[0]!.url).toBe("https://project.supabase.test/auth/v1/token?grant_type=password");
    expect((sent[0]!.init.headers as Record<string, string>).apikey).toBe("sb_publishable_test");
    expect(JSON.parse(String(sent[0]!.init.body))).toEqual(login);
  });
  it("a refused grant, an unreachable IdP or a missing setting is null, without a call when a setting is missing", async () => {
    expect(await devSignin.grant(login, env, idp(Response.json({ error: "invalid_grant", password: PASSWORD }, { status: 400 })).f)).toBeNull();
    expect(await devSignin.grant(login, env, idp(new Error("down")).f)).toBeNull();
    const none = idp(Response.json({ access_token: "never" }));
    expect(await devSignin.grant(login, { SUPABASE_PROJECT_URL: env.SUPABASE_PROJECT_URL }, none.f)).toBeNull();
    expect(await devSignin.grant(login, { SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY }, none.f)).toBeNull();
    expect(none.sent.length).toBe(0);
  });
});
