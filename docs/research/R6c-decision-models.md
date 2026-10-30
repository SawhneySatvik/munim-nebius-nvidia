# R6c · Decision models: TypeSafe Jev and the OpenAI Decisions API (11 Oct 2026)

Orchestrator lookup, done at the founder's request instead of another deep-research run. The sources are secondary
write-ups dated 15 Sep – 7 Oct 2026, and everything here postdates the model's knowledge cutoff. Each claim is labelled.
**Before any build lane depends on these numbers, check them against the vendors' own docs.**

## What they are

| | TypeSafe **Jev** ("System One" model) | OpenAI **Decisions API** |
|---|---|---|
| What it is | A purpose-built model that returns typed decisions with calibrated probabilities. It **cannot generate text** (FACT per [DigitalOcean], [Firecrawl]) | `/v1/decisions`, a constrained mode of GPT-6 Luna, not a new model (FACT per [Firecrawl], [NYU Shanghai RITS]) |
| Input | Unstructured state (string, JSON object or array) plus typed questions. Text only (FACT) | Text or images (FACT) |
| Output types | `Choice` (one of a bounded set), `Score` (ordered levels), `Noul` (yes/no probability). Each comes with per-option probabilities and a confidence value (FACT) | Predicates (P(statement true)), choices (one option plus confidence), scores (probability-weighted rating) (FACT per [NYU Shanghai RITS]) |
| How it decides | One parallel pass that scores every question at once. Values outside the schema are impossible by construction (FACT; vendor claim) | The answer space is bounded before inference, unlike structured outputs, which constrain the shape after generation (INFERENCE from [Firecrawl]) |
| Latency | 70–500 ms; P50 0.21 s / P95 0.34 s / P99 0.75 s measured via OpenRouter on 1 Oct 2026 (FACT per [Firecrawl]) | About 150 ms vs 1.6 s for Luna through the Responses API ("up to 10× faster") (vendor claim) |
| Price | $0.042 per million input tokens, output free (FACT) | $0.10 per million input tokens, no output or cache charge, public beta from 6 Oct 2026 (FACT per [Dealroom], [ProPakistani]) |
| Context | 32K on OpenRouter, 64K per TypeSafe docs (FACT per [Firecrawl]) | Not published |
| Availability | Generally available: TypeSafe API, OpenRouter, DigitalOcean serverless inference (FACT) | Public beta for all developers from 6 Oct 2026 |
| Accuracy | 67.8% vs 67.9% for frontier LLMs on the vendor's own benchmark, at about 1/76 of the cost (vendor claim, UNVERIFIED) | Not published |
| Open weights / fine-tuning | None found | None found |

## What they are for, and what they are not

- **Good fit (FACT, per the vendors):** classification, routing, scoring and ranking at volume, moderation, agent guardrails and verification, and real-time control loops. The pattern is many repeated decisions over shared state, where the possible answers are known up front.
- **Not a fit (FACT):** chat, planning, open-ended reasoning, tool orchestration, written explanations.
- **Schema safety is not the same as correctness (FACT, [DigitalOcean]).** A malformed answer is impossible; a wrong one is not.
- **A decision model must not quietly become the policy-enforcement layer ([Firecrawl]).** For Munim, policy stays in the core: the book guard, authority, and approvals.

## Why this matters for Munim (INFERENCE, for the W3 ADR)

1. **A `DecisionModel` port next to the LLM port.** It holds typed questions with finite answer sets: `choice`, `score`, `predicate`. Each returns an answer, per-option probabilities and calibrated confidence. Adapters:
   - **Jev**, through OpenRouter. This fits R36: OpenRouter is an approved provider, and no new vendor is needed.
   - **OpenAI Decisions**, once an OpenAI key exists. The founder has none today, so this path is skipped loudly.
   - **LLM mimic.** Any approved LLM, constrained to an enum (Gemini response schema / OpenAI strict), with token logprobs used as probabilities where the provider exposes them. Calibration is unknown until we measure it.
   - **Fine-tuned Gemma, later.** It can be trained on our labelled decisions, which the approvals and decision log already produce, and served locally. This costs training compute and hosting, so it is a founder money decision and comes with no v1 commitment.
2. **Candidate Munim decisions**, all with known answer sets:
   - which specialist or pack a question routes to (the router);
   - detector triage: is this a real finding, which severity, is it a duplicate of an open finding;
   - inbox ranking scores (impact, confidence, urgency);
   - import column-to-field mapping suggestions (renames only; R28);
   - moderation and injection screening of untrusted text before extraction;
   - reason-code classification for refunds, voids and waste;
   - verifier checks on drafts: does every number cite a snapshot, does the draft match the finding.
3. **Never for numbers or prose.** Every number still comes from a snapshot cell minted by the core (R25). Explanations still come from an LLM through cite-or-abstain. A decision's confidence is metadata on the finding or route. It is never a book value, and it never auto-applies anything (R16).
4. **Evaluation.** Calibration (reliability curve, Brier score) and accuracy per question on the worldgen answer keys. Compare the adapters on cost and latency per decision. This fits the W5 provider comparison.

## Sources
- [What is Jev (2026)? — DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev)
- [OpenAI's Decisions API vs Jev — Firecrawl](https://www.firecrawl.dev/blog/openai-decisions-api-vs-jev)
- [OpenAI's Decisions API picks answers instead of writing them — NYU Shanghai RITS](https://rits.shanghai.nyu.edu/ai/openais-decisions-api-picks-answers-instead-of-writing-them/)
- [OpenAI opens Decisions API to all developers — Dealroom](https://app.dealroom.co/news/note/openai-opens-decisions-api-to-all-developers-adding-image-input-in-challenge-to-typesafe-s-jev)
- [OpenAI launches Decisions API — ProPakistani, 7 Oct 2026](https://propakistani.pk/2026/10/07/openai-launches-decisions-api-with-up-to-10x-faster-responses/)
- [Introducing Jev — YourStory](https://yourstory.com/ai-story/what-is-jev-typesafe-ai-decision-model)
- [TypeSafe AI launches with Jev — VKTR](https://www.vktr.com/ai-platforms/chatgpt-cocreator-launches-typesafe-ai-with-jev/)
