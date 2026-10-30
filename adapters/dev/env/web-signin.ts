// The demo sign-in's dev grant for apps/web (T-122): Supabase Auth's password grant, which the Vercel deployment of
// apps/web (munim-cobnut) uses with SUPABASE_PROJECT_URL + SUPABASE_PUBLISHABLE_KEY (sent by deploy/vercel/env-setup.ts).
// apps/web resolves `@munim-dev/web-signin` here when this file exists (its tsconfig `paths`, vitest alias) and to its
// own `lib/server/no-dev/web-signin.ts` (null) otherwise, so a build without adapters/dev has no Supabase code at all.
// Server only; nothing here logs or echoes the password or a token.
// Shaped like apps/web's DevSignin (lib/server/no-dev/web-signin.ts); apps/web's type check holds it to that.
export const devSignin = {
  mode: "supabase",
  async grant(login: { email: string; password: string }, env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<string | null> {
    const base = env.SUPABASE_PROJECT_URL?.replace(/\/+$/, "");
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (!base || !key) return null;
    try {
      const res = await fetchImpl(`${base}/auth/v1/token?grant_type=password`, {
        method: "POST", signal: AbortSignal.timeout(10_000), // a POST is never cached
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      if (!res.ok) return null;
      const b = (await res.json()) as { access_token?: unknown };
      return typeof b.access_token === "string" && b.access_token !== "" ? b.access_token : null;
    } catch {
      return null;
    }
  },
};
