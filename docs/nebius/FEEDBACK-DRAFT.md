# Feedback draft: Nebius Token Factory and NVIDIA Nemotron (for the "Most Valuable Feedback" field)

Draft updated 30 Oct 2026. Stays in this repository; it is not exported. The project owner has verified that the application
made a successful live inference call through Nebius Token Factory using a working NVIDIA Nemotron model. The detailed protocol and
performance observations below were gathered while porting Munim's agents (Google ADK, OpenAI-compatible client) and are
explicitly attributed to NVIDIA's separate endpoint (`integrate.api.nvidia.com`) where measured. They are not presented as
Token Factory benchmarks. The feedback is about provider behavior and integration ergonomics; it does not imply that the
application is disconnected from Token Factory.

**Live integration status (30 Oct):** a successful live Token Factory inference call was verified from the application. The numerical Ask results
that follow are retained as historical results and are explicitly attributed to NVIDIA's endpoint. Keep those source labels if
using this material in the feedback field.

Context in one paragraph: Munim runs five model roles per business: a router (one constrained choice per question), a reasoning
model that calls tools and must cite every number, an extractor and a vision reader (no tools, strict JSON schema, untrusted
input), and a narrator (short lines from cited cells). Calls go through one OpenAI-compatible client with per-role timeouts
(router 20 s, extract 30 s, vision 90 s), a monthly spend cap fed by each call's token usage, and traces that record the
provider and model id of every call.

## 1. Reasoning is on by default, and it makes structured calls miss their deadlines

- **Seen:** with Nemotron's default reasoning, the router's one-word answer took 19 s against a 20 s timeout; a claims
  extraction ran past its 30 s limit; an invoice read ran past 90 s. With `chat_template_kwargs: {"enable_thinking": false}` in
  the request body each took about 1 s. (NVIDIA endpoint; `nemotron-3.5-lightning-30b-a3b` and `nemotron-3.5-super-vl-120b-a12b`.)
- **Why it matters:** an OpenAI-compatible client has no standard field for this. ADK's `OpenAILlm` has no extra-body option, so
  we had to subclass its client to inject the field. Anyone who points an existing OpenAI-style app at Nemotron gets the slow
  path silently, and a timeout looks like a model failure.
- **Suggestions:** (a) treat `response_format: json_schema` (or `tool_choice` forcing one tool) as "reasoning off" unless the
  request asks for it; (b) honour the standard `reasoning_effort` field (`"none"`/`"low"`) as an alias of
  `enable_thinking`; (c) put the switch on the model card's first screen, with the latency difference.
- **Cross-provider note:** the live application integration uses Token Factory; the timing observations in this bullet were taken on NVIDIA's endpoint.

## 2. Reasoning tokens share `max_tokens`, and usage double-counts them in common clients

- **Seen:** ADK's default `max_tokens` of 4096 includes the reasoning, so a long reasoning step ended `finish_reason: length` with
  no answer at all; we raised the ceiling to 16384 for the reasoning role only. ADK reports reasoning as `thoughts_token_count`,
  which on this endpoint is a subset of `completion_tokens`, so a client that adds the two charges reasoning twice. At zero price
  that costs nothing; once a per-token price is set, the spend cap would trip early.
- **Suggestions:** (a) return `usage.completion_tokens_details.reasoning_tokens` and say plainly whether `completion_tokens`
  includes it; (b) a separate cap for visible output (`max_completion_tokens` vs a reasoning budget), so a reasoning run cannot
  spend the whole allowance and return nothing.
- **Cross-provider note:** the live application integration uses Token Factory; the usage observations in this bullet were taken on NVIDIA's endpoint.

## 3. Strict JSON schema works, and that deserves to be said louder

- **Seen:** OpenAI-style strict `response_format: {"type": "json_schema", "strict": true}` was honoured for all four of our
  schemas (a supplier quote, a list of claims, a supplier invoice with line items, and a router enum), with bare JSON in the
  reply. We needed no guided-decoding variant or filtered schema for these Nemotron runs.
  The vision model copied every invoice figure exactly as printed (720 input / 321 output tokens, `finish_reason: stop`).
- **Suggestion:** publish the supported JSON Schema subset (formats, `pattern`, `anyOf`, nesting depth) on the model card; it is
  a selling point, and it tells a team up front that no fallback mode is needed.
- **Cross-provider note:** the live application integration uses Token Factory; the schema observations in this bullet were taken on NVIDIA's endpoint.

## 4. Where the reasoning text goes is not consistent

- **Seen:** NVIDIA's endpoint returns the reasoning in a non-standard `reasoning_content` field, which the OpenAI SDK and ADK
  ignore (good for us, invisible for anyone debugging). Some OpenAI-compatible hosts inline it as `<think>…</think>` inside
  `content` instead; we now strip that before parsing or showing anything, because a reasoning trace about an untrusted supplier
  reply must never reach a person's screen or a log.
- **Suggestions:** one documented placement across NVIDIA's endpoint and Token Factory; never inline reasoning in `content` when
  a `response_format` is set; a flag to drop it server-side.
- **Cross-provider note:** the live application integration uses Token Factory; the reasoning-field observations in this bullet were taken on NVIDIA's endpoint.

## 5. Model ids differ between NVIDIA's endpoint and Token Factory

- **Seen:** the same model has different ids and casing: `nvidia/nemotron-3.5-lightning-30b-a3b` vs `nvidia/Nemotron-3_5-Lightning`;
  `nvidia/nemotron-3.5-super-vl-120b-a12b` vs `nvidia/Nemotron-3.5-Super-VL`; `nvidia/nemotron-3-ultra-550b-a55b` vs
  `nvidia/Nemotron-3-Ultra-550b-a55b`; `nvidia/nemotron-nano-3-30b-a3b` vs `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. We keep a mapping table and a
  per-provider id list in code, and our database stores the id per provider.
- **Also seen:** a response's `model` field can name a different model than the one requested: requests to
  `nvidia/nemotron-3.5-super-vl-120b-a12b` came back labelled `private/nvidia/nemotron-3.5-super-120b-a12b`. We record the
  requested id in traces, because the served label would not match any id we can configure.
- **Suggestions:** accept NVIDIA's canonical ids as aliases on Token Factory (case-insensitive), publish the alias table, and
  return the requested id in `model` (or document why it differs).
- **Cross-provider note:** model IDs are provider-specific. Live traces identify the configured and requested model on each call.

## 6. Listed models answer 404

- **Seen:** `GET /v1/models` on the NVIDIA account listed 85 models, including `nvidia/nemotron-3-super-120b-a12b` and
  `nvidia/nemotron-nano-3-30b-a3b`, but a chat completion to either answered 404. We moved the reasoning role to Ultra, which
  costs latency (5 to 25 s a step) for no reason the API could tell us.
- **Suggestions:** list only the models the key can call, or answer 403 with a reason (entitlement, region, tier) instead of 404.
- **Cross-provider note:** the application records the selected provider/model; the 404 observations in this section concern NVIDIA's endpoint account only.

## 7. Smaller observations

- **Format-following with reasoning off:** Lightning with thinking off wrote narration lines in the wrong form (`C1: …` where the
  instruction asked for `item_id: …`), so every line fell back to our template; 3.5 Super VL followed the same instruction. A
  note on the model card about which sizes follow output-format instructions without reasoning would help pick roles.
- **Tool loops:** on tool-heavy questions, Ultra sometimes re-read the same tool until our per-run cap
  stopped it. A sampling or system-prompt recommendation for agentic tool use on Nemotron would help.
- **Tail latency:** one extraction call on NVIDIA's endpoint took over 30 s once, out of dozens at about 1 s.
- **Log-probabilities:** an earlier router implementation scored its choice from log-probabilities; on the current OpenAI-compatible path we get
  none (our framework's client does not request them). The application integration has been verified on Token Factory; this observation concerns the OpenAI-compatible response surface.
  for Nemotron, which would let a constrained choice carry a confidence.

## What went well

- One OpenAI-compatible client serves every role, so connecting Token Factory is provider configuration plus the required
  reasoning setting, not a separate orchestration stack.
- Strict JSON schema on a vision model, on a real invoice image, with every figure exact.
- A live run of the whole Ask path (router on 3.5 Lightning, three reasoning steps on 3 Ultra) answered with four citations that
  all resolved, in about 20 s.
