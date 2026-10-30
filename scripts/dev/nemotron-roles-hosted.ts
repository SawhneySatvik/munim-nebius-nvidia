// Configure the dedicated hosted Nebius deployment through core's audited operator API.
// Never places secrets in argv or output. Prices are required and must match the current Token Factory rate card.
// Example (provide the price values from the provider console):
//   MUNIM_API_URL=https://munim-nebius-api.vercel.app MUNIM_PLATFORM_OPERATOR_TOKEN=<real operator token> \
//     node scripts/dev/nemotron-roles-hosted.ts --prices-file=.run/nebius/model-prices.json
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const MODELS = {
  router: "nvidia/Nemotron-3_5-Lightning",
  reason: "nvidia/nemotron-3-super-120b-a12b",
  narrate: "nvidia/Nemotron-3.5-Super-VL",
  extract: "nvidia/Nemotron-3.5-Super-VL",
  vision: "nvidia/Nemotron-3.5-Super-VL",
} as const;

class Usage extends Error {}
function options(argv: readonly string[]) {
  const got = new Map<string, string>();
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!m) throw new Usage(`expected --name=value, got ${arg}`);
    const [, name, value] = m;
    if (name !== "prices-file") throw new Usage(`unknown option --${name}`);
    if (got.has(name!)) throw new Usage(`--${name} given twice`);
    got.set(name!, value!);
  }
  const path = got.get("prices-file");
  if (!path) throw new Usage("--prices-file is required");
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(path), "utf8")); } catch { throw new Usage("prices file could not be read as JSON"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Usage("prices file must be an object keyed by model role");
  const prices = raw as Record<string, unknown>;
  for (const role of Object.keys(MODELS)) {
    const p = prices[role] as Record<string, unknown> | undefined;
    if (!p || !Number.isSafeInteger(p.input_price_per_mtok_minor) || Number(p.input_price_per_mtok_minor) < 1
      || !Number.isSafeInteger(p.output_price_per_mtok_minor) || Number(p.output_price_per_mtok_minor) < 1
      || typeof p.price_currency !== "string" || !/^[A-Z]{3}$/.test(p.price_currency)) {
      throw new Usage(`prices file needs positive input/output minor units per million and a currency for role ${role}`);
    }
  }
  const currencies = new Set(Object.keys(MODELS).map((role) => (prices[role] as { price_currency: string }).price_currency));
  if (currencies.size !== 1) throw new Usage("all platform model roles must use the same currency; configure one currency per deployment");
  return prices as Record<keyof typeof MODELS, { input_price_per_mtok_minor: number; output_price_per_mtok_minor: number; price_currency: string }>;
}

try {
  const prices = options(process.argv.slice(2));
  const api = process.env.MUNIM_API_URL;
  const token = process.env.MUNIM_PLATFORM_OPERATOR_TOKEN;
  if (!api || !token) throw new Error("set MUNIM_API_URL and MUNIM_PLATFORM_OPERATOR_TOKEN in the environment");
  const base = new URL(api);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/"
    || base.hostname !== "munim-nebius-api.vercel.app") {
    throw new Error("MUNIM_API_URL must be the dedicated https://munim-nebius-api.vercel.app origin");
  }
  const call = async (method: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const response = await fetch(new URL(path, base), {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const code = (value.error as { code?: string } | undefined)?.code ?? "";
      throw new Error(`${method} ${path} returned HTTP ${response.status} ${code}`);
    }
    return value;
  };
  const health = await call("GET", "/health");
  if (health.idp !== "supabase") throw new Error(`API reports idp=${String(health.idp)}; refusing a non-hosted identity profile`);
  const before = ((await call("GET", "/platform/v1/model-roles")).items ?? []) as Array<Record<string, unknown>>;
  for (const [role, model_id] of Object.entries(MODELS)) {
    const price = prices[role as keyof typeof MODELS];
    const row = before.find((candidate) => candidate.role === role);
    if (row && row.provider === "nebius" && row.model_id === model_id
      && row.input_price_per_mtok_minor === price.input_price_per_mtok_minor
      && row.output_price_per_mtok_minor === price.output_price_per_mtok_minor
      && row.price_currency === price.price_currency) continue;
    const draft = await call("POST", "/platform/v1/config-drafts", {
      target: `model_role:${role}`,
      patch: {
        provider: "nebius", model_id,
        input_price_per_mtok_minor: price.input_price_per_mtok_minor,
        output_price_per_mtok_minor: price.output_price_per_mtok_minor,
        price_currency: price.price_currency,
      },
    });
    const applied = await call("POST", `/platform/v1/config-drafts/${String(draft.id)}:approve`, {
      reason: "Configure Nemotron model role for the dedicated Nebius Token Factory deployment",
    });
    if (applied.status !== "applied") throw new Error(`configuration draft for ${role} was not applied`);
  }
  const after = ((await call("GET", "/platform/v1/model-roles")).items ?? []) as Array<Record<string, unknown>>;
  const mismatch = Object.entries(MODELS).filter(([role, model]) => !after.some((row) => row.role === role
    && row.provider === "nebius" && row.model_id === model
    && row.input_price_per_mtok_minor === prices[role as keyof typeof MODELS].input_price_per_mtok_minor
    && row.output_price_per_mtok_minor === prices[role as keyof typeof MODELS].output_price_per_mtok_minor
    && row.price_currency === prices[role as keyof typeof MODELS].price_currency));
  if (mismatch.length) throw new Error(`role read-back did not match: ${mismatch.map(([role]) => role).join(", ")}`);
  for (const [role, model] of Object.entries(MODELS)) {
    const price = prices[role as keyof typeof MODELS];
    console.log(`${role.padEnd(8)} nebius  ${model}  ${price.input_price_per_mtok_minor}/${price.output_price_per_mtok_minor} ${price.price_currency}`);
  }
  console.log(`nemotron-roles-hosted: verified ${Object.keys(MODELS).length} hosted model roles`);
} catch (error) {
  console.error(`nemotron-roles-hosted: FAIL — ${error instanceof Error ? error.message : "error"}`);
  process.exitCode = 1;
}

