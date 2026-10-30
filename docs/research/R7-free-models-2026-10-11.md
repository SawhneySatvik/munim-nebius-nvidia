# R7 free-model snapshot, 11 Oct 2026 (R47 D8)

Taken 2026-10-11 from OpenRouter GET /api/v1/models (458 models, FACT) and /api/v1/embeddings/models (33), and NVIDIA GET https://integrate.api.nvidia.com/v1/models (80 ids, FACT, key from munim_intel.config). Capability columns for OpenRouter are the catalogue's own fields (FACT as advertised, UNVERIFIED in behaviour). Free-tier rate limits are not in the catalogue (UNVERIFIED).

## OpenRouter free chat models (prompt and completion price 0, or :free suffix) - 19 of 458

| id | context | input | tools | response_format | structured_outputs | logprobs |
|---|---|---|---|---|---|---|
| inclusionai/ling-3.1-flash | 262144 | text | yes | no | no | yes |
| apodex/apodex-1.1-mini:free | 262144 | text | yes | yes | yes | no |
| dots-studio/dots-3-note-preview:free | 512000 | text,image | yes | yes | yes | no |
| liquid/lfm-2.5-2.6b:free | 65536 | text | yes | yes | yes | yes |
| nvidia/nemotron-3.5-lightning:free | 1000000 | text | yes | no | no | no |
| thinkingmachines/inkling-small:free | 1048576 | text,image,audio | yes | no | no | no |
| poolside/laguna-s-2.1:free | 262144 | text | yes | no | no | no |
| thinkingmachines/inkling:free | 1048576 | text,image,audio | yes | no | no | no |
| poolside/laguna-xs-2.1:free | 262144 | text | yes | no | no | no |
| cohere/north-mini-code:free | 256000 | text | yes | no | no | no |
| nvidia/nemotron-3.5-content-safety:free | 128000 | text,image | no | no | no | no |
| nvidia/nemotron-3-ultra-550b-a55b:free | 1000000 | text | yes | no | no | no |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | 256000 | text,audio,image,video | yes | no | no | no |
| google/gemma-4-26b-a4b-it:free | 262144 | image,text,video | yes | yes | no | no |
| google/gemma-4-31b-it:free | 262144 | image,text,video | yes | yes | no | no |
| google/lyria-3-pro-preview | 1048576 | text,image | no | yes | no | no |
| google/lyria-3-clip-preview | 1048576 | text,image | no | yes | no | no |
| nvidia/nemotron-3-super-120b-a12b:free | 262144 | text | yes | yes | yes | no |
| openrouter/free | 200000 | text,image | yes | yes | yes | yes |

Note: google/lyria-* are audio generators and nvidia/nemotron-3.5-content-safety is a safety classifier; not chat candidates. inclusionai/ling-3.1-flash and openrouter/free (a random-model router) have price 0 without the :free suffix; openrouter/free is nondeterministic so never picked.

## OpenRouter free embedding models (FACT)

- liquid/lfm-2.5-embedding-350m:free (context 512)
- nvidia/nemotron-3-embed-1b:free (context 32768)
- nvidia/llama-nemotron-embed-vl-1b-v2:free (context 131072)

Output dimensions: UNVERIFIED for all three; the catalogue does not list them.

## NVIDIA API catalog (integrate.api.nvidia.com), 80 ids (FACT)

The list endpoint returns only id/owner: no context, tool, JSON or image fields (FACT). Hosted catalogue models run on the free trial credit allowance, not a per-token price (UNVERIFIED terms; the key is a developer-programme key). Prices are recorded as 0 per R47 D1; the credit cap is the real limit. Capabilities below are from model names/vendor cards, UNVERIFIED.

01-ai/yi-large, adept/fuyu-8b, ai21labs/jamba-1.5-large-instruct, aisingapore/sea-lion-7b-instruct, bigcode/starcoder2-15b, databricks/dbrx-instruct, deepseek-ai/deepseek-coder-6.7b-instruct, deepseek-ai/deepseek-v4.1-flash, google/codegemma-1.1-7b, google/codegemma-7b, google/deplot, google/diffusiongemma-26b-a4b-it, google/gemma-2b, google/gemma-3-12b-it, google/gemma-3-4b-it, google/gemma-4-31b-it, google/recurrentgemma-2b, ibm/granite-3.0-3b-a800m-instruct, ibm/granite-3.0-8b-instruct, ibm/granite-34b-code-instruct, ibm/granite-8b-code-instruct, meta/codellama-70b, meta/llama-3.2-11b-vision-instruct, meta/llama-3.2-90b-vision-instruct, meta/llama-guard-4-12b, meta/llama2-70b, meta/muse-glimmer-30b, microsoft/kosmos-2, microsoft/phi-3-vision-128k-instruct, microsoft/phi-3.5-moe-instruct, mistralai/codestral-22b-instruct-v0.1, mistralai/mistral-7b-instruct-v0.3, mistralai/mistral-large, mistralai/mistral-large-2-instruct, mistralai/mixtral-8x22b-v0.1, moonshotai/kimi-k2.6, moonshotai/kimi-k3, nv-mistralai/mistral-nemo-12b-instruct, nvidia/ai-synthetic-video-detector, nvidia/cosmos-reason2-8b, nvidia/embed-qa-4, nvidia/ising-calibration-1.5-31b, nvidia/llama-3.1-nemoguard-8b-content-safety, nvidia/llama-3.1-nemoguard-8b-topic-control, nvidia/llama-3.1-nemotron-51b-instruct, nvidia/llama-3.1-nemotron-70b-instruct, nvidia/llama-3.1-nemotron-safety-guard-8b-v3, nvidia/llama-3.1-nemotron-ultra-253b-v1, nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1, nvidia/llama-3.2-nv-embedqa-1b-v1, nvidia/llama-nemotron-embed-vl-1b-v2, nvidia/llama3-chatqa-1.5-70b, nvidia/mistral-nemo-minitron-8b-8k-instruct, nvidia/nemotron-3-embed-1b, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning, nvidia/nemotron-3-super-120b-a12b, nvidia/nemotron-3-ultra-550b-a55b, nvidia/nemotron-3.5-content-safety, nvidia/nemotron-3.5-lightning-30b-a3b, nvidia/nemotron-4-340b-instruct, nvidia/nemotron-4-340b-reward, nvidia/nemotron-nano-3-30b-a3b, nvidia/nemotron-parse, nvidia/nemotron-parse-2.0, nvidia/neva-22b, nvidia/nv-embedqa-mistral-7b-v2, nvidia/nvclip, nvidia/riva-translate-4b-instruct, nvidia/riva-translate-4b-instruct-v2, nvidia/vila, openai/gpt-oss-20b, poolside/laguna-xs-2.1, snowflake/arctic-embed-l, writer/palmyra-creative-122b, writer/palmyra-fin-70b-32k, writer/palmyra-med-70b, writer/palmyra-med-70b-32k, z-ai/glm-5.3, z-ai/glm-5.3-flash, zyphra/zamba2-7b-instruct

Candidates by role (all UNVERIFIED capabilities): reasoning/tools nvidia/nemotron-3-super-120b-a12b, nvidia/nemotron-3-ultra-550b-a55b, openai/gpt-oss-20b, z-ai/glm-5.3; vision google/gemma-4-31b-it, meta/llama-3.2-90b-vision-instruct, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning; embeddings nvidia/nemotron-3-embed-1b, nvidia/llama-3.2-nv-embedqa-1b-v1, nvidia/nv-embedqa-mistral-7b-v2, snowflake/arctic-embed-l.

## Live check (12 calls total, 10 via make-smoke-live path, 1 retry of extract, 1 embed) - see the lane report for the matrix.

Smoke runner facts (FACT, observed): a 64-token cap truncates reasoning models (MAX_TOKENS), so "reachable but cap hit" is not a model fault; free OpenRouter models returned 429 on two calls (free-tier rate limit); nvidia/nemotron-nano-3-30b-a3b and google/gemma-3-12b-it returned 404 on the NVIDIA endpoint though listed (account/function not available, UNVERIFIED); nvidia/nemotron-3-embed-1b with dimensions=768 returned HTTP 400 (UNVERIFIED cause: dimensions or input_type parameter).

