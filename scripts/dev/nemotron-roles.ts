// Points platform.model_role at Nemotron (events build, P1). Local only: refuses unless core-api's /health says `idp: "local"`,
// and signs in as the local cluster's Cobnut operator (scripts/dev/local-operator.ts adds that row). Each role changes through an
// operator config draft, proposed and approved (R24, R27), never SQL. Prints role, provider, model id and price; never a token.
//   node scripts/dev/nemotron-roles.ts --provider=nvidia                 the NVIDIA endpoint (free key: 0 INR per 1M tokens)
//   node scripts/dev/nemotron-roles.ts --provider=nebius --prices-file=.run/local/model-prices.json
//   node scripts/dev/nemotron-roles.ts --provider=nebius --zero-prices   Local smoke only; zero hides Token Factory spend from the cap.
// Options: --url=<core-api> (default http://127.0.0.1:8787), --run-dir=<dir> (default .run/local).
// The embed role is left alone: intel builds no live embedder (services/intel/munim_intel/ingest/embed.py).
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createPersistentLocalIdp } from "../../services/core-api/src/auth/local-idp.ts";
import { personaIdentity } from "../../tools/worldgen/src/api.ts";

// Probed on the NVIDIA endpoint, 24 Oct (one-line chat, the quarantine schemas, a tool call, live Cobnut asks and investigation
// steps): nemotron-3-super-120b-a12b and nemotron-nano-3-30b-a3b answer 404 for this account, so reason runs on Ultra (3.5 Super
// as reason ran an ask into the tool cap). Lightning with thinking off answers the router's enum in under a second but wrote
// investigation narration in the wrong form (every line kept the template), so narrate runs on 3.5 Super (served under the VL
// id). Token Factory model ids are provider-specific; the project owner has verified live inference from the application through Token Factory.
const MODELS = {
  nvidia: {
    router: "nvidia/nemotron-3.5-lightning-30b-a3b",
    narrate: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    reason: "nvidia/nemotron-3-ultra-550b-a55b",
    extract: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    vision: "nvidia/nemotron-3.5-super-vl-120b-a12b",
  },
  nebius: {
    router: "nvidia/Nemotron-3_5-Lightning",
    narrate: "nvidia/Nemotron-3.5-Super-VL",
    reason: "nvidia/nemotron-3-super-120b-a12b",
    extract: "nvidia/Nemotron-3.5-Super-VL",
    vision: "nvidia/Nemotron-3.5-Super-VL",
  },
} as const;
type Provider = keyof typeof MODELS;

function args(): { provider: Provider; url: string; runDir: string; zero: boolean; pricesFile?: string } {
  const out = { provider: "", url: "http://127.0.0.1:8787", runDir: resolve(import.meta.dirname, "../../.run/local"), zero: false, pricesFile: undefined as string | undefined };
  for (const a of process.argv.slice(2)) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    const [k, v] = [m?.[1], m?.[2]];
    if (k === "zero-prices" && v === undefined) out.zero = true;
    else if (v === undefined || v === "") throw new Error(`unknown or valueless argument ${a} (use --name=value)`);
    else if (k === "provider") out.provider = v;
    else if (k === "url") out.url = v;
    else if (k === "run-dir") out.runDir = resolve(v);
    else if (k === "prices-file") out.pricesFile = resolve(v);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!(out.provider in MODELS)) throw new Error("--provider must be exactly nvidia or nebius");
  if (out.provider === "nebius" && !out.zero && !out.pricesFile) throw new Error("Token Factory roles require --prices-file with per-role rates from the current provider rate card");
  if (out.zero && out.pricesFile) throw new Error("--zero-prices cannot be combined with --prices-file");
  if (out.provider !== "nebius" && out.pricesFile) throw new Error("explicit prices are supported for --provider=nebius only");
  return out as { provider: Provider; url: string; runDir: string; zero: boolean; pricesFile?: string };
}

type Row = { role: string; provider: string; model_id: string; input_price_per_mtok_minor: number | null; output_price_per_mtok_minor: number | null; price_currency: string | null };

try {
  const o = args();
  let prices: Record<string, { input_price_per_mtok_minor?: unknown; output_price_per_mtok_minor?: unknown; price_currency?: unknown }> = {};
  if (o.pricesFile) {
    try { prices = JSON.parse(readFileSync(o.pricesFile, "utf8")) as typeof prices; }
    catch { throw new Error("prices file could not be read as JSON"); }
    if (!prices || typeof prices !== "object" || Array.isArray(prices)) throw new Error("prices file must be an object keyed by model role");
    const currencies = new Set(Object.keys(MODELS.nebius).map((role) => prices[role]?.price_currency));
    if (currencies.size !== 1) throw new Error("all platform model roles must use the same currency; configure one currency per deployment");
  }
  const priceFor = (role: string) => {
    if (o.provider === "nvidia" || o.zero) return { input: 0, output: 0, currency: "INR" };
    const p = prices[role];
    if (!p || !Number.isSafeInteger(p.input_price_per_mtok_minor) || Number(p.input_price_per_mtok_minor) < 1
      || !Number.isSafeInteger(p.output_price_per_mtok_minor) || Number(p.output_price_per_mtok_minor) < 1
      || typeof p.price_currency !== "string" || !/^[A-Z]{3}$/.test(p.price_currency)) throw new Error(`prices file needs positive rates and a currency for role ${role}`);
    return { input: Number(p.input_price_per_mtok_minor), output: Number(p.output_price_per_mtok_minor), currency: p.price_currency };
  };
  const health = (await (await fetch(new URL("/health", o.url))).json()) as { idp?: unknown };
  if (health.idp !== "local") throw new Error(`core-api reports idp=${JSON.stringify(health.idp)}, not "local" — refusing (local only)`);
  const token = createPersistentLocalIdp(o.runDir).sign(personaIdentity("cobnut", "operator"));
  const call = async (method: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const r = await fetch(new URL(path, o.url), {
      method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`${method} ${path}: HTTP ${r.status} ${JSON.stringify((j.error as { code?: string } | undefined)?.code ?? "")}`);
    return j;
  };
  const roles = async () => ((await call("GET", "/platform/v1/model-roles")).items ?? []) as Row[];
  const want = MODELS[o.provider];
  const before = await roles();
  for (const [role, model_id] of Object.entries(want)) {
    const row = before.find((r) => r.role === role);
    const price = priceFor(role);
    if (row && row.provider === o.provider && row.model_id === model_id && row.input_price_per_mtok_minor === price.input
      && row.output_price_per_mtok_minor === price.output && row.price_currency === price.currency) continue;
    const patch = { provider: o.provider, model_id, input_price_per_mtok_minor: price.input, output_price_per_mtok_minor: price.output, price_currency: price.currency };
    const draft = await call("POST", "/platform/v1/config-drafts", { target: `model_role:${role}`, patch });
    const done = await call("POST", `/platform/v1/config-drafts/${String(draft.id)}:approve`, { reason: "events build: Nemotron roles (nemotron-roles.ts)" });
    if (done.status !== "applied") throw new Error(`draft for ${role} is ${String(done.status)}, not applied`);
  }
  for (const r of await roles()) {
    console.log(`${r.role.padEnd(8)} ${r.provider.padEnd(10)} ${r.model_id.padEnd(42)} ${r.input_price_per_mtok_minor ?? "-"}/${r.output_price_per_mtok_minor ?? "-"} ${r.price_currency ?? "unpriced"}`);
  }
  const after = await roles();
  const off = Object.entries(want).filter(([role, id]) => !after.some((r) => r.role === role && r.provider === o.provider && r.model_id === id));
  if (off.length) throw new Error(`not applied: ${off.map(([r]) => r).join(", ")}`);
  console.log(`nemotron-roles: ${Object.keys(want).length} roles on ${o.provider}`);
} catch (e) {
  console.error(`nemotron-roles: FAIL — ${(e as Error).message}`);
  process.exit(1);
}
