// Which model ran an AI run, in words (P3: "Stock & Purchasing · Nemotron 3 Super · NVIDIA"). A member can see a model
// only in a run's trace (GET /v1/traces/{run}): intel's `route` event for each model call carries the served path
// (`model_path`, T-125: live / recorded-fallback / abstained) and, when intel writes them, the call's `provider` and
// `model_id` (the names its spend rows use, services/intel/munim_intel/trace/spend.py). A model is named only from a
// call that carries both labels and was served live or from its recording; an abstained call names none. An id this file
// does not know is shown as it is: never a guess. Plain TypeScript, no React.
import type { Schemas } from "./types";

export type TraceEvent = Schemas["V1TracesResponse"]["events"][number];

const PROVIDER: Record<string, string> = { nvidia: "NVIDIA", nebius: "Token Factory", gemini: "Google", openrouter: "OpenRouter", openai: "OpenAI" };

/** Exact ids, lower-cased: NVIDIA's endpoint and Token Factory spell the same model differently (EVENTS-STATUS.md). */
const MODEL: Record<string, string> = {
  "nvidia/nemotron-3-super-120b-a12b": "Nemotron 3 Super",
  "nvidia/nemotron-3-ultra-550b-a55b": "Nemotron 3 Ultra",
  "nvidia/nemotron-3.5-super-vl-120b-a12b": "Nemotron 3.5 Super VL",
  "nvidia/nemotron-3.5-super-vl": "Nemotron 3.5 Super VL",
  "nvidia/nemotron-3.5-lightning-30b-a3b": "Nemotron 3.5 Lightning",
  "nvidia/nemotron-3_5-lightning": "Nemotron 3.5 Lightning",
  "nvidia/nemotron-nano-3-30b-a3b": "Nemotron 3 Nano",
  "nvidia/nvidia-nemotron-3-nano-30b-a3b": "Nemotron 3 Nano",
  "nvidia/nemotron-3.5-embed-1b": "Nemotron 3.5 Embed",
  "nvidia/nemotron-3.5-embed-8b": "Nemotron 3.5 Embed",
};
/** Gemini ids name themselves: "gemini-3.5-flash-lite" is Gemini 3.5 Flash-Lite. */
const GEMINI = /^(?:models\/)?gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(?:-[a-z0-9.-]+)?$/;
const GEMINI_TIER: Record<string, string> = { "flash-lite": "Flash-Lite", flash: "Flash", pro: "Pro" };

export function modelName(id: string): string {
  const k = id.toLowerCase();
  const g = GEMINI.exec(k);
  return MODEL[k] ?? (g ? `Gemini ${g[1]} ${GEMINI_TIER[g[2]!]}` : id);
}
export const providerName = (provider: string): string => PROVIDER[provider] ?? provider;

/** One model a run used. `recorded`: the provider failed and the recording of that exact call served it. */
export interface ModelUse { provider: string; modelId: string; recorded: boolean }

/** Which of a run's model calls were made for the item on screen:
 *  - a finding: only calls labelled with its id. intel labels a narration's calls `finding_id` (narrate/__init__.py);
 *    only a high or critical finding newly stored by that run is narrated (watch/pipeline.py NARRATE_AT), so every other
 *    finding of the same sweep, even of the same watcher, made no model call. Known gap: the envelope cannot tell model
 *    prose from the template, so a narration core refused (the template stays) or a later re-detection that put the
 *    template back (core keeps the finding's first run_id, core-api internal/writes.ts) still shows the narration's model.
 *  - a draft: only its specialist's own calls (`specialist:<pack>`, the negotiation that wrote a purchase order). A
 *    sweep's draft is made by code (`watcher:` calls narrate findings) and an investigation's `branch:` calls answer the
 *    Manager: neither wrote the draft. A draft with no specialist names no model.
 *  - an answer: every call of its run. */
export type CallsFor = { finding: string } | { draft: string | null } | "answer";

function madeFor(e: TraceEvent, labels: Record<string, unknown>, of: CallsFor): boolean {
  if (of === "answer") return true;
  if ("finding" in of) return labels.finding_id === of.finding;
  return of.draft !== null && e.actor === `specialist:${of.draft}`;
}

/** The models that served the calls a run made for `of`, in the order first seen. */
export function modelsOf(events: readonly TraceEvent[], of: CallsFor): ModelUse[] {
  const out: ModelUse[] = [];
  for (const e of events) {
    if (e.kind !== "route") continue;
    const p = e.payload as Record<string, unknown>;
    const path = p.model_path, provider = p.provider, modelId = p.model_id;
    if ((path !== "live" && path !== "recorded-fallback") || typeof provider !== "string" || typeof modelId !== "string" || !madeFor(e, p, of)) continue;
    const use = { provider, modelId, recorded: path === "recorded-fallback" };
    if (!out.some((u) => u.provider === use.provider && u.modelId === use.modelId && u.recorded === use.recorded)) out.push(use);
  }
  return out;
}

/** One tag per model, "Nemotron 3 Super · NVIDIA" (a recorded call says so), so a narrow card wraps between tags. Two
 *  spellings of one model on one provider are one tag. */
export const modelTags = (uses: readonly ModelUse[]): string[] =>
  [...new Set(uses.map((u) => `${modelName(u.modelId)}${u.recorded ? " (recorded)" : ""} · ${providerName(u.provider)}`))];
