// Demo accounts for the Cobnut world (R54; interface.md): the four demo people as Supabase Auth users `<key>@cobnut-demo.invalid` (the
// `.invalid` TLD can never receive mail), confirmed, all with ONE generated password. Dev adapter (R9): Supabase lives only under
// adapters/dev/, so this is not part of any Cup export. Run it to get the persona tokens `make seed WORLD=cobnut` needs on a Supabase-mode
// core-api:
//   MUNIM_SEED_TOKENS="$(node adapters/dev/idp-supabase/demo-accounts.ts)" MUNIM_API_URL=<core-api> make seed WORLD=cobnut
// It prints only a JSON {owner, manager, counter, kitchen[, operator]} of access tokens on stdout (for the caller to capture, never shown) —
// `operator` from MUNIM_SEED_OPERATOR_TOKEN when set: the platform operator is a real person's own sign-in, never a demo account. The
// password is generated once into `<run dir>/cobnut/demo-password` (0600, git-ignored; the site's MUNIM_DEMO_PASSWORD) and reused, so a
// reseed keeps the same accounts. Supabase URL and keys come only through packages/config (SUPABASE_PROJECT_URL, SUPABASE_SECRET_KEY,
// SUPABASE_PUBLISHABLE_KEY). UNVERIFIED against the hosted project: the admin routes and headers follow Supabase's public Auth docs, and
// whether GoTrue accepts an `.invalid` address was not checked.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_KEYS = ["owner", "manager", "counter", "kitchen"] as const;
export type DemoKey = (typeof DEMO_KEYS)[number];
export const demoEmail = (key: DemoKey): string => `${key}@cobnut-demo.invalid`;

export interface DemoAccountsOptions {
  projectUrl: string;
  /** Server-side secret key: the admin API. */
  secretKey: string;
  /** Publishable key: the password grant, as the site's sign-in route makes it. */
  publishableKey: string;
  password: string;
  fetch?: typeof fetch;
}

export class DemoAccountError extends Error {
  override name = "DemoAccountError";
}

/** Creates (or resets the password of) each demo user, confirmed, then signs each in with the password: their access tokens. Errors name
 *  the step and the HTTP status only — never a body, a key or the password. */
export async function ensureDemoAccounts(o: DemoAccountsOptions): Promise<Record<DemoKey, string>> {
  const base = `${o.projectUrl.replace(/\/+$/, "")}/auth/v1`;
  const call = o.fetch ?? fetch;
  const admin = { apikey: o.secretKey, Authorization: `Bearer ${o.secretKey}`, "content-type": "application/json" };
  const send = async (step: string, url: string, init: RequestInit, ok: number[]): Promise<{ status: number; json: Record<string, unknown> }> => {
    let res: Response;
    try {
      res = await call(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new DemoAccountError(`${step}: Supabase Auth unreachable`);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!ok.includes(res.status)) throw new DemoAccountError(`${step}: HTTP ${res.status}`);
    return { status: res.status, json };
  };
  let users: Array<{ id: string; email: string }> | null = null;
  const tokens = {} as Record<DemoKey, string>;
  for (const key of DEMO_KEYS) {
    const email = demoEmail(key);
    const made = await send(`create ${key}`, `${base}/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email, password: o.password, email_confirm: true }) }, [200, 201, 422]);
    if (made.status === 422) {
      // Already there (an earlier seed): find it and set the current password, confirmed.
      users ??= ((await send("list users", `${base}/admin/users?page=1&per_page=1000`, { headers: admin }, [200])).json.users as Array<{ id: string; email: string }> | undefined) ?? [];
      const u = users.find((x) => x.email?.toLowerCase() === email);
      if (!u) throw new DemoAccountError(`create ${key}: refused and not found`);
      await send(`update ${key}`, `${base}/admin/users/${u.id}`, { method: "PUT", headers: admin, body: JSON.stringify({ password: o.password, email_confirm: true }) }, [200]);
    }
    const signed = await send(`sign in ${key}`, `${base}/token?grant_type=password`, {
      method: "POST", headers: { apikey: o.publishableKey, "content-type": "application/json" }, body: JSON.stringify({ email, password: o.password }),
    }, [200]);
    if (typeof signed.json.access_token !== "string") throw new DemoAccountError(`sign in ${key}: no access token`);
    tokens[key] = signed.json.access_token;
  }
  return tokens;
}

/** The one demo password: read from `<runDir>/cobnut/demo-password`, else generated there (0600 in a 0700 directory). */
export function demoPassword(runDir: string): { password: string; file: string } {
  const dir = join(runDir, "cobnut");
  const file = join(dir, "demo-password");
  if (existsSync(file)) return { password: readFileSync(file, "utf8").trim(), file };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const password = randomBytes(24).toString("base64url");
  writeFileSync(file, `${password}\n`, { mode: 0o600 });
  return { password, file };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error("takes no arguments (the run directory is MUNIM_RUN_DIR, default <repo>/.run)");
    const { loadRepoConfig } = await import("../../../packages/config/src/index.ts");
    const root = resolve(import.meta.dirname, "../../..");
    const cfg = loadRepoConfig(root);
    const { password } = demoPassword(cfg.runDir);
    const tokens: Record<string, string> = await ensureDemoAccounts({
      projectUrl: cfg.require("SUPABASE_PROJECT_URL"), secretKey: cfg.require("SUPABASE_SECRET_KEY"), publishableKey: cfg.require("SUPABASE_PUBLISHABLE_KEY"), password,
    });
    const operator = process.env.MUNIM_SEED_OPERATOR_TOKEN;
    if (operator) tokens.operator = operator;
    console.log(JSON.stringify(tokens));
  } catch (e) {
    console.error(`demo-accounts: FAIL — ${e instanceof Error ? e.message : "error"}`);
    process.exit(1);
  }
}
