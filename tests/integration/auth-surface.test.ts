// R1-M5 — which requests may ask the IdP whether an email is confirmed (with idp-supabase that is a GoTrue round
// trip; idp-supabase now has a 3 s AbortSignal timeout and a bounded cache, gated in its own tests). Only the
// requests that bind an email to a person ask: /v1/onboarding, /v1/members:bind and a customer's first sign-in at a
// merchant (/v1/account:link — R41's verified-email merge and email_verified_at need it; a deviation from the
// fix-list wording, reported). Every member, operator and customer request is verified by signature alone.
// The harness records each verify the app makes ({needEmailVerified}) and, like idp-supabase, reports an email as
// confirmed only when asked — so a route that forgot to ask would also fail its flow.
// Hand: each request below makes exactly the verify calls listed beside it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Caller, type Env, startEnv, storefrontKey, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let key = "";

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  key = await storefrontKey(env, w, w.channel);
});
afterAll(async () => env?.stop());

const envelope = (type: string, payload: unknown) => ({ command_id: uuidv7(), idempotency_key: `as-${uuidv7()}`, type, payload });
/** The verify calls one request made, as the flag each asked with. */
async function asked(fn: () => Promise<{ status: number }>, status: number): Promise<boolean[]> {
  env.idpCalls.length = 0;
  const r = await fn();
  expect(r.status).toBe(status);
  return env.idpCalls.map((c) => c.needEmailVerified);
}

describe("R1-M5: only onboarding, bind and a customer's first link ask for the email confirmation", () => {
  it("member and customer requests never ask; onboarding, bind and first link ask once", async () => {
    // Members: signature only.
    expect(await asked(() => env.http("GET", "/v1/tenant", owner), 200)).toEqual([false]);
    expect(await asked(() => env.http("GET", "/v1/me/tenants", owner), 200)).toEqual([false]);
    const invitee = { member: uuidv7(), sub: `invitee-${uuidv7()}`, email: "invitee.as@example.test" };
    expect(await asked(() => env.cmd(owner, "/v1/members:invite", "tenancy.member.invite.v1",
      { member_id: invitee.member, name: "Synthetic Invitee", email: invitee.email, role: "staff", outlet_ids: [w.outlets[0]] }), 200)).toEqual([false]);
    // Bind: asks; the confirmed invitee is bound (with the flag the email counts as verified).
    expect(await asked(() => env.cmd({ sub: invitee.sub, email: invitee.email, tenant: w.tenant }, "/v1/members:bind", "tenancy.member.bind.v1",
      { member_id: invitee.member }), 200)).toEqual([true]);
    expect(await asked(() => env.http("GET", "/v1/tenant", { sub: invitee.sub, tenant: w.tenant }), 200)).toEqual([false]);

    // Customers: the storefront key + token; only the first link asks (requireCustomer verifies first, without).
    const shopper: Caller = { key, sub: `as-shopper-${uuidv7()}`, email: "shopper.as@example.test" };
    expect(await asked(() => env.http("GET", "/v1/account", shopper), 404)).toEqual([false]);
    expect(await asked(() => env.http("POST", "/v1/account:link", shopper,
      envelope("customers.account.link.v1", { name: "Synthetic Shopper", phone: null })), 200)).toEqual([false, true]);
    expect(await asked(() => env.http("GET", "/v1/account", shopper), 200)).toEqual([false]);
    expect(await asked(() => env.http("GET", "/v1/account/orders", shopper), 200)).toEqual([false]);
    expect(await asked(() => env.http("POST", "/v1/account/consent", shopper, envelope("customers.consent.set.v1", { marketing: true })), 200)).toEqual([false]);
    // The linked profile's email was confirmed through the flag.
    expect(await env.rows(`SELECT email_verified_at IS NOT NULL AS v FROM core.customer WHERE tenant_id = $1 AND idp_sub = $2`, [w.tenant, shopper.sub])).toEqual([{ v: true }]);

    // Onboarding: asks once.
    const founder = { sub: `as-founder-${uuidv7()}`, email: "founder.as@example.test" };
    expect(await asked(() => env.cmd(founder, "/v1/onboarding", "tenancy.onboard.v1", {
      tenant_id: uuidv7(), owner_member_id: uuidv7(), outlet_id: uuidv7(), owner_name: "Synthetic Founder", business_name: "Synthetic AS",
      kind: "restaurant", country_code: "IN", outlet: { name: "Main outlet", address: "1 Synthetic Street", tax_ids: {} } }), 201)).toEqual([true]);
  });
});
