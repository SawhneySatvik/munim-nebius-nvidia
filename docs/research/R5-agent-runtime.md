# R5 — Agent runtime: ADK + LiteLLM, provider adapters, framework comparison (9 Oct 2026)

Status: research input (RULES §1). Two read-only agents, 9 Oct 2026. `FACT`/`INFERENCE`/`UNVERIFIED` as labelled.

## 0 · Orchestrator synthesis (INFERENCE from §A, §B)

1. **LiteLLM is no longer needed with ADK.** ADK Python 2.10+ ships `OpenAILlm` (`google-adk[openai]`) taking
   `base_url` + `api_key` — it reaches OpenAI, OpenRouter and NVIDIA's hosted endpoint directly; Gemini uses ADK's
   native class. R3/R4's "ADK reaches other models via LiteLLM" is out of date.
2. **Never install `google-adk[eval]`, `[extensions]`, `[all]` or `[test]`** — they pull LiteLLM (incl. a version
   inside later advisory ranges). Bare `google-adk`, `[gcp]`, `[a2a]`, `[openai]` resolve with no LiteLLM.
3. **Not disqualifying.** Other providers in the standalone product do not touch the Cup. The Cup repo is Gemini-only:
   `google-adk[gcp,a2a]`, a red-proven CI check that `litellm`/`openai`/`anthropic` are absent from the lockfile.
4. **Framework ranking for Munim:** ADK 2.11 (#1: Google's agentic platform, native A2A + MCP, 14 callbacks,
   parallel fan-out, skills) > Pydantic AI 2.x (#2: best testing and typing; A2A client unverified; weaker Cup fit)
   > thin in-house loop (fallback). Avoid AWS Strands (bare model string defaults to Bedrock — competing-cloud
   risk), Microsoft Agent Framework (Gemini/A2A beta), OpenAI Agents SDK (no A2A, churn), smolagents (stale),
   LangGraph (A2A via hosted server), Mastra (built on Vercel AI SDK).
5. **Consequence for the plan:** with ADK + native adapters, the Cup repo's AI-layer change is small (drop the
   `[openai]` adapter, Gemini/Vertex defaults, GCP adapters) — not a rewrite.

---

## §A · ADK + LiteLLM, provider adapters, Cup rules

## Bottom line (R5-A · ADK + LiteLLM, native non-Google models, LiteLLM security, Cup risk · 9 Oct 2026)
1. ADK Python 2.11.0 (2 Oct 2026) no longer needs LiteLLM for non-Google models. It ships a native `OpenAILlm` with `base_url`/`api_key` (added in 2.10.0), plus `Claude` and `FallbackModel`. R3's line that "ADK reaches other models via LiteLLM" is **stale**. ADK's docs still say so; the code is newer. `FACT`
2. LiteLLM is **not** a base dependency of google-adk. It arrives with `[extensions]`, `[all]` and `[test]` directly, **and transitively with `[eval]`**: the dry-run resolved `litellm==1.85.7` via `google-cloud-aiplatform[evaluation]`. `FACT`
3. The incident was **litellm 1.82.7 and 1.82.8** on PyPI on 24 Mar 2026. It was a credential stealer, and both versions are now gone from PyPI. 1.83.0 was declared clean on 30 Mar. The latest release, 1.104.2, is outside every GHSA range listed today. ADK's `>=1.84` floor is **not** a safe floor. `FACT`
4. For OpenAI, OpenRouter and NVIDIA, the standalone product can use `OpenAILlm(base_url=…)` against each OpenAI-compatible endpoint, with no LiteLLM in the tree. All four providers document an OpenAI-compatible `/chat/completions`. `FACT`/`INFERENCE`
5. Cup verdict: ADK + Gemini on Vertex as the primary path does not breach the T&C wording. The **safest** Cup repo, though, has **zero** non-Google model code and no LiteLLM, `openai` or `[eval]`/`[extensions]` extras, which fits the spirit of CLAUDE.md rule 2 ("Google Cloud only … Gemini/Gemma"). This is a recommendation, not a rule. The standalone product's providers do not affect the Cup. `INFERENCE`
6. The bigger Cup risk is **Fresh Code**, not the provider choice. Porting standalone-product code into the Cup repo risks T&C L23 ("ongoing projects, or code developed prior to the official launch") and CLAUDE.md rule 1. Build the Cup repo fresh. `INFERENCE`

## 1 · What "ADK + LiteLLM" is in ADK Python 2.x
- **Class.** It is `google.adk.models.lite_llm.LiteLlm(model: str, **kwargs)`. Extra kwargs (for example `api_base`, `custom_llm_provider`, `drop_params`) go to `litellm.acompletion`. The `messages`, `tools` and `stream` kwargs are stripped because ADK manages them. `FACT` (wheel `google_adk-2.11.0`, `models/lite_llm.py` L3313–3365, read 9 Oct)
- **Model strings.**
  - The registry maps these LiteLLM prefixes explicitly: `openai/`, `azure/`, `azure_ai/`, `groq/`, `anthropic/`, `bedrock/`, `ollama/`, `ollama_chat/`, `together_ai/`, `vertex_ai/`, `mistral/`, `deepseek/`, `fireworks_ai/`, `cohere/`, `databricks/`, `ai21/`. `FACT` (`models/__init__.py` `_LAZY_PROVIDERS`)
  - Any other `provider/model` string (such as `openrouter/…`, `nvidia_nim/…` or `gemini/…`) resolves to `LiteLlm` only if LiteLLM is installed and the provider is in `litellm.provider_list`. Otherwise it raises "Model … not found". `FACT` (`models/registry.py` `_resolve_litellm_provider`, `resolve()`)
  - Passing an explicit `LiteLlm(model=…)` instance avoids depending on that lookup. `INFERENCE`
- **Gotcha.** A bare `nvidia.…` string resolves to **`OCIGenAILlm` (Oracle OCI)**, not NVIDIA NIM. `FACT` (`_LAZY_PROVIDERS['OCIGenAILlm']`)
- **Gemini through LiteLLM.** `LiteLlm("gemini/…")` raises a `[GEMINI_VIA_LITELLM]` UserWarning telling you to use the native `Gemini` class. `ADK_SUPPRESS_GEMINI_LITELLM_WARNINGS=true` silences it. `FACT` (`_warn_gemini_via_litellm`)
- **Environment variables.**
  - `OPENAI_API_KEY` for OpenAI. `FACT` ([ADK litellm.md](https://github.com/google/adk-docs/blob/main/docs/agents/models/litellm.md), last commit 3 Aug 2026)
  - `OPENROUTER_API_KEY`, with optional `OPENROUTER_API_BASE` (default `https://openrouter.ai/api/v1`). `FACT` ([LiteLLM OpenRouter](https://docs.litellm.ai/docs/providers/openrouter), read 9 Oct)
  - `NVIDIA_NIM_API_KEY`, with optional `NVIDIA_NIM_API_BASE` (default `https://integrate.api.nvidia.com/v1/`). `FACT` ([LiteLLM NIM](https://docs.litellm.ai/docs/providers/nvidia_nim), read 9 Oct)
  - `GEMINI_API_KEY` for `gemini/`. `UNVERIFIED` (LiteLLM page not read)
  - ADK sets `LITELLM_MODE=PRODUCTION` so LiteLLM does not autoload `.env`. `FACT` (`_ensure_litellm_imported`)
  - The native Vertex path now uses `GOOGLE_GENAI_USE_ENTERPRISE`. `GOOGLE_GENAI_USE_VERTEXAI` is **deprecated** and emits a DeprecationWarning, so project docs that use the old name need updating. `FACT` (`utils/env_utils.py` L63–78)
- **Tool calling.**
  - It works, with a long tail of fixed bugs. Since 2.0 these include malformed tool arguments (#5896), dropped `anyOf` (#6738), MCP `outputSchema` dropped (#6784) and tool calls lost behind a proxy (#6091). `FACT` ([CHANGELOG](https://github.com/google/adk-python/blob/main/CHANGELOG.md), and the issues via `gh`, 9 Oct)
  - `tool_choice` is propagated as of 2.6.0. `FACT` (CHANGELOG)
- **Streaming.**
  - Streaming works. Issue **#7004 is OPEN**: a LiteLLM stream keeps only the last tool call when one chunk carries N calls plus a finish_reason, so parallel tool calls can be lost (opened 3 Sep 2026). #7438 (dropped Gemini `thought_signature`) is closed. `FACT`
- **Structured output.**
  - ADK converts `output_schema`/`response_schema` into `response_format: json_schema` with `strict: True`, or into `response_schema` for Gemini models. `FACT` (`_to_litellm_response_format`)
  - Schema + tools together is resolved per provider. It is True for `openai`/`azure` or when `litellm.supports_response_schema()` says so. It is False for Gemini unless the provider is `vertex_ai`, and False for Claude routes. Otherwise ADK falls back to its SetModelResponseTool workaround. The hard-coded True (#6954) was fixed. `FACT` (`LiteLlm._resolve_capabilities`, `_NATIVE_SCHEMA_PROVIDERS` L415)
  - Issue **#7360 is OPEN**: `thinking_config` is dropped and not mapped to `reasoning_effort`. `FACT`
- **Parallel sub-agents.** `ParallelAgent`, `SequentialAgent` and `LoopAgent` exist in `google/adk/agents/` and orchestrate agents rather than calling models. They should therefore work with any `BaseLlm`. `INFERENCE` (source tree; not run). Not the same as parallel *tool calls* (#7004).

**Illustrative snippet.** Our own words; not run; model IDs are placeholders.
```python
# ILLUSTRATIVE ONLY: one agent whose model is picked by config (MODEL_ROUTE env var).
import os
from google.adk.agents import LlmAgent

def pick_model(route: str):
    if route == "vertex":                      # native Gemini class, no LiteLLM, no openai pkg
        return "gemini-3.8-flash"              # needs GOOGLE_GENAI_USE_ENTERPRISE + project/location
    from google.adk.integrations.openai import OpenAILlm   # pip install "google-adk[openai]"
    hosts = {  # route -> (base_url, key env var)
        "openai":     (None, "OPENAI_API_KEY"),
        "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
        "nvidia":     ("https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
        "gemini_oa":  ("https://generativelanguage.googleapis.com/v1beta/openai/", "GEMINI_API_KEY"),
    }
    base, key = hosts[route]
    return OpenAILlm(model=os.environ["MODEL_ID"], base_url=base, api_key=os.environ[key])

agent = LlmAgent(name="ledger_reader", model=pick_model(os.getenv("MODEL_ROUTE", "vertex")),
                 instruction="Read via tools; propose, never commit.")
# LiteLLM variant: from google.adk.models.lite_llm import LiteLlm; LiteLlm(model="openrouter/<vendor>/<model>")
```

## 2 · Reaching non-Google models without LiteLLM
- **Native classes in 2.11.0.** The wheel's model registry contains these classes. `FACT` (`models/__init__.py`)
  - `Gemini`; `Gemma` / `Gemma3Ollama`; `Claude` (pattern `claude-.*`, needs `anthropic`); `ApigeeLlm`; `OCIGenAILlm`; `LiteLlm`.
  - `OpenAILlm` / `OpenAIResponsesLlm` / `AzureOpenAIResponsesLlm` (in `google.adk.integrations.openai`).
  - `FallbackModel` (failover between models, added in 2.9.0, marked `experimental`).
- **History of `OpenAILlm`.** 2.10.0 (24 Sep) added `api_key`/`base_url`, added the `google-adk[openai]` extra (`openai<3,>=2.20`) and moved the class out of `labs` into `integrations`. `FACT` (CHANGELOG L161–171)
  - Its docstring says it can reach "any OpenAI-compatible backend". `FACT` (`_openai_llm.py` L338–366)
  - It has no experimental decorator in the code, although `google.adk.labs.openai` still re-exports it. `FACT` (grep)
- **Docs lag the code.** ADK docs' `openai.md` (last commit 1 Oct 2026) still says "Python — via LiteLLM", with native support listed only for Go. The 2.11.0 code is authoritative. `FACT` ([adk-docs openai.md](https://github.com/google/adk-docs/blob/main/docs/agents/models/openai.md))
- **What `OpenAILlm` supports.** `FACT` (`_openai_llm.py` L383–650)
  - Function tools only (others skipped with a warning); `tool_choice`; streaming with incremental tool-call arguments.
  - `response_format` as `json_schema` with `strict: True`, or `json_object`; reasoning-model parameter fixes; `client=` takes a pre-built `AsyncOpenAI`.
- **Limits of `OpenAILlm`.**
  - It always sends `strict: True` and `stream_options`, and it has no per-request `extra_body`. OpenRouter provider preferences such as `require_parameters`, or backends that reject strict mode, therefore need a small subclass or a custom `client`. `INFERENCE` (from code)
  - It does not override `capabilities`. The legacy name check is True only for Gemini names, so for **every** non-Gemini name (gpt-* included) an output schema plus tools goes through ADK's fallback path. `INFERENCE` (`base_llm.py` L49–125)
- **Custom `BaseLlm`.** One abstract method, `generate_content_async(llm_request, stream) -> AsyncGenerator[LlmResponse]`. You optionally declare `capabilities` and `supported_models`. `FACT` (`base_llm.py`)
  - Subclassing `OpenAILlm` is much cheaper than writing ~650 lines of mapping from scratch. Estimate: about a day for a thin subclass with tests, and several days from scratch. `INFERENCE`
- **OpenAI-compatible endpoints, all verified 9 Oct.**
  - **Gemini.** Endpoint `https://generativelanguage.googleapis.com/v1beta/openai/`. Function calling, streaming and JSON-schema output are listed as supported. The page says "Support for the OpenAI libraries is still in beta", and some parameters are silently ignored. `FACT` ([Gemini OpenAI compat](https://ai.google.dev/gemini-api/docs/openai), updated 2 Sep 2026)
    - Vertex has its own OpenAI-compatible surface (`endpoints/openapi`), using a Google access token as the key. `FACT` (OpenAILlm docstring); exact URL `UNVERIFIED`
  - **NVIDIA.** Hosted endpoint `https://integrate.api.nvidia.com`, `POST /v1/chat/completions`, with 60+ models. `FACT` ([NIM API ref](https://docs.api.nvidia.com/nim/reference/llm-apis))
    - Tool calling via vLLM (`"tool_choice": "auto"`) is documented for **self-hosted** NIM only. `FACT` ([NIM 2.0.12 tool calling](https://docs.nvidia.com/nim/large-language-models/2.0.12/advanced-use-cases/tool-calling-and-mcp.html)). The none/auto/named values come from a search snippet only. `UNVERIFIED`
    - Hosted tool calling, structured output and per-model support are `UNVERIFIED`.
  - **OpenRouter.** `https://openrouter.ai/api/v1` works as a drop-in base URL for the OpenAI SDK, with streaming and tools. `FACT` ([quickstart](https://openrouter.ai/docs/quickstart))
    - Structured-output enforcement "varies by provider"; set `require_parameters: true` to route only to endpoints that support it. `FACT` ([structured outputs](https://openrouter.ai/docs/features/structured-outputs))
  - **OpenAI.** This is `OpenAILlm`'s default host. `FACT`

## 3 · LiteLLM security
- **What happened.** litellm **1.82.7** had a malicious payload in `proxy_server.py`. **1.82.8** had the same payload plus `litellm_init.pth`. The payload was a credential stealer that exfiltrated to `models.litellm[.]cloud`. `FACT` ([LiteLLM blog](https://docs.litellm.ai/blog/security-update-march-2026), published 24 Mar, updated 30 Mar 2026)
- **Time window.** The packages were "live on March 24, 2026 from 10:39 UTC for about 40 minutes before being quarantined". The blog's who-is-affected list says you are at risk if you installed "between 10:39 UTC and 16:00 UTC". `FACT` (same blog)
- **Root cause.** Suspected compromise through "the Trivy dependency used in our CI/CD security scanning workflow". The official Proxy Docker image was not affected. `FACT`
- **Clean releases.** "A new clean version of LiteLLM is now available (v1.83.0)" (30 Mar update). Versions 1.78.0 through 1.82.6 were audited clean. `FACT` (same blog)
- **ADK advisory.** [google/adk-python#5005](https://github.com/google/adk-python/issues/5005) (26 Mar, closed) told users to rotate credentials. ADK 1.27.4 and 1.28.0 pinned 1.82.6, and the floor later rose to `>=1.83.7` (1.32.0) and then `>=1.84` (2.4.0). `FACT` (issue body; CHANGELOG L1426, L1874, L2100, L2141)
- **PyPI state.** The PyPI JSON shows **no 1.82.7, 1.82.8 or 1.82.9 releases**, 1.82.6 uploaded 22 Mar, and 1.83.0 on 31 Mar. The latest stable is **1.104.2** (8 Oct 2026). `FACT` ([pypi.org/pypi/litellm/json](https://pypi.org/pypi/litellm/json), read 9 Oct)
- **Later advisories (GHSA).** Several post-date the incident. `FACT` (`gh api repos/BerriAI/litellm/security-advisories`, 9 Oct)
  - **GHSA-g5ff-637f-6q2m** (high, <1.95.0); **GHSA-3cv6-jpf6-8222** (medium, <1.94.0); **GHSA-7hp6-4w63-5g45** (critical, several ranges, patched by 1.103.1 / 1.104.0rc2); **GHSA-4xpc** (critical, <1.84.0).
  - 1.104.2 is in none of the listed ranges. `INFERENCE` (range check)
  - Most of these advisories are against the LiteLLM **Proxy server** (admin roles, SSO, `/prompts/test`), not the SDK `completion()` path that ADK uses. `INFERENCE` (from the advisory titles; per-advisory text not read)
- **Dependency status in google-adk 2.11.0.** `FACT` (PyPI JSON for google-adk 2.11.0, plus a `pip --dry-run` resolution on Python 3.12, 9 Oct)
  - Base `requires_dist` contains **no litellm and no openai**.
  - `litellm>=1.84` appears only under the extras `all`, `extensions` and `test`.
  - `[eval]` pulls `google-cloud-aiplatform[evaluation]` 1.165.1. That package requires `litellm<1.86.0,>=1.83.7` on Python <3.14, so the resolver chose **litellm 1.85.7**, which falls inside the <1.94 and <1.95 GHSA ranges.
  - Bare install, `[gcp]`, `[a2a]` and `[openai]` all resolved **without** litellm.
- **Safe stance.** For the Cup repo, keep LiteLLM out of the tree. Use ADK's own eval only if you accept that pull, or write evals as plain pytest. For the standalone product, if LiteLLM is used at all, pin an exact version (for example `1.104.2`) with `--require-hashes` and keep LiteLLM off the Proxy server role. `INFERENCE`

## 4 · Disqualification analysis (AI Builder Cup)
- **Exact T&C wording.** `FACT` (`docs/admin/cup-tnc-snapshot-2026-10-09.md`)
  - L22: "All submitted prototypes must be built primarily using the Google Cloud tech stack (e.g., Cloud Run, GCP, Firebase). Solutions built primarily on competing cloud infrastructure will be deemed ineligible and disqualified."
  - L23: "Submissions must consist exclusively of fresh code and original assets created during the official hackathon timeline. Pre-existing products, ongoing projects, or code developed prior to the official launch will be disqualified."
  - L24: "a) A working deployed live URL (on Cloud Run/GCP/Firebase) … c) A public GitHub repository containing the source code."
  - L38: "Technical Merit & GenAI Implementation (40%): Robustness, Google Cloud architectural depth".
- **Q: Is ADK + Gemini on Vertex as the primary path, with LiteLLM present for optional providers, a breach?** **Not by the letter.** L22 tests "primarily" and "competing cloud *infrastructure*". An optional model adapter that is not called at runtime does not make the build primarily anything else. `INFERENCE`
  - The project's own rule 2 is stricter in spirit ("Google Cloud only"; "no Vercel, no Supabase, no AWS for any part that is submitted"), and R3 already ruled Nemotron out for the Cup.
  - Code paths to OpenAI, OpenRouter or NVIDIA in a public repo invite a judge to ask whether the demo really ran on Gemini. `INFERENCE`
- **What a judge would see.** The public repo's `requirements`/`pyproject` (with `litellm`, `openai` or `[extensions]` visible), any `MODEL_ROUTE`-style switch, `.env.example` keys like `OPENROUTER_API_KEY`, and the deck's architecture slide. `INFERENCE`
  - L38 weights "Google Cloud architectural depth" at 40%. A visible multi-provider port reads as hedging and spends deck time on non-GCP parts. `INFERENCE`
- **Q: Does the standalone (non-submitted) product's use of OpenAI, OpenRouter or NVIDIA affect the Cup?** **No**, as long as nothing from it is submitted. The T&C judge only "submitted prototypes". `INFERENCE`
  - The real link is **L23**: standalone code written **before** the official launch, or from an "ongoing project", must not be copied into the Cup repo. CLAUDE.md rule 1 also forbids porting from anything in `projects_26`. The launch date is not in the snapshot. `UNVERIFIED`
- **Verdict.** `INFERENCE`
  - LiteLLM merely being present is low risk under the T&C. Rule 2's "for any part that is submitted" names competing clouds, so an unused model dependency conflicts with the *spirit* of rule 2 ("Google Cloud only … Gemini/Gemma") rather than its letter. Options: (a) Gemini-only Cup repo (**recommended**); (b) LiteLLM/OpenAI adapters present but disabled, which is legal under the T&C and weaker in front of judges. Shared code between the standalone product and the Cup repo is the real disqualification vector.
- **Safest Cup configuration.** `INFERENCE`
  1. Install `google-adk[gcp]` (plus `[a2a]` if needed). **Not** `[eval]`, `[extensions]`, `[all]` or `[openai]`.
  2. Use the native `Gemini` class with `GOOGLE_GENAI_USE_ENTERPRISE`, Gemini/Gemma IDs only, and Vertex in the project's own GCP project.
  3. Add a CI gate that fails if `litellm`, `openai` or `anthropic` appears in the lockfile. Red-prove it by adding one.
  4. Keep the provider seam as an interface (`ModelPort`, per R3) with **only** a Gemini adapter in the Cup repo. Other adapters live only in the standalone repo, written separately.
  5. The README and deck say "Gemini on Vertex AI, deployed on Cloud Run". No other model vendor is named in the submission.

## Could not verify
- Hosted build.nvidia.com: per-model tool calling, `response_format`/strict JSON schema support, and the exact env var name. (`NVIDIA_API_KEY` is assumed; LiteLLM uses `NVIDIA_NIM_API_KEY`.)
- The exact URL and feature matrix of the Vertex OpenAI-compatible endpoint. The doc page fetch was incomplete.
- LiteLLM's `gemini/` env var (`GEMINI_API_KEY`) and whether `openrouter`/`nvidia_nim` are in `litellm.provider_list` at 1.104.2. The latter is very likely, since the LiteLLM docs document both prefixes.
- That the illustrative snippet runs. No ADK install or API keys were exercised. Whether OpenRouter or NVIDIA accept `stream_options` and `strict: True` from `OpenAILlm` is untested.
- The Cup's "official launch" date, which governs L23 for any reused standalone code.
- Whether each GHSA advisory affects only the LiteLLM Proxy. Only titles and ranges were read.


---

## §B · Framework comparison


Method: PyPI/npm JSON and the GitHub API, read 2026-10-09. Shallow clones of each repo at the commit listed in Sources, grepped for each feature, plus official doc pages. Cell tags: `F`=FACT (source id [Sx]), `I`=INFERENCE, `U`=UNVERIFIED.
"2026 churn" = number of distinct minor/major version lines first published on PyPI in 2026 (not release count).

## (a) Bottom line
1. **#1 Google ADK 2.11 as the runtime.** It is the only option that is Google's own agentic platform (criterion 9; CLAUDE.md rule 2 names ADK) *and* has first-party A2A + MCP, plugin callbacks on every run/agent/model/tool step, parallel fan-out (ParallelAgent / 2.0 workflow graph) and a SkillToolset. Since 2.10 (2026-09-24) its native `OpenAILlm(base_url=…)` reaches OpenAI, NIM and OpenRouter without LiteLLM. (F [S1–S5])
2. ADK risks: A2A and Skills are flagged *experimental*. Changelog BREAKING sections at 2.6 and 2.7, plus other 'breaking' notes in 2.4, 2.9 and 2.10. Its `MockModel` lives only in `tests/`. Mitigation: pin the exact version, write our own ~50-line scripted `BaseLlm` fake, and wrap A2A behind Munim's own port. (F [S4–S7]; mitigation is I)
3. **#2 Pydantic AI 2.x.** Best testability (`TestModel`/`FunctionModel`), best typed I/O, on-demand capabilities ≈ skills, hooks at every stage, and a stated policy of no breaking changes in minors. It is weaker on A2A (moved to third-party `fasta2a`) and on Cup fit, because it is not a Google platform. (F [S9])
4. If you want neither framework: a thin in-house loop over the OpenAI-compatible port plus `a2a-sdk` 1.2.2 and `mcp` 2.3.0. All four providers speak chat-completions [S18], but you rebuild routing, fan-out and tracing, and you lose the "built on ADK" story. (I)
5. Avoid for Munim: Strands (AWS; a bare model string defaults to Bedrock), Microsoft Agent Framework (its Gemini and A2A packages are Beta), OpenAI Agents SDK (no A2A, 17 minor lines in 2026, which its policy reserves for breaking changes, OpenAI optics) and smolagents (no release since 29 May). (F + I)
6. Tension: being provider-agnostic is not the same as "built primarily on Google Cloud". The submitted build should default every agent to Gemini/Gemma. The other providers should be optional adapters behind a config flag. (I)

## (b) Comparison (criteria: 1 providers · 2 router+skills+fan-out · 3 trace hooks · 4 typed tools/output · 5 A2A / MCP · 6 fake model · 7 language · 8 licence/maturity · 9 Cup fit · 10 vendor)
| Framework (latest, date) | 1 | 2 | 3 | 4 | 5 A2A / MCP | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Google ADK** 2.11.0, 2026-10-02 | ✓ Gemini native; OpenAILlm base_url F[S1] | ✓ Parallel+workflow; Skills exp. F[S3,S4] | ✓ 14 plugin callbacks F[S2] | ✓ output_schema+tools (2.7) F[S7] | partial: A2A experimental / ✓ McpToolset F[S5] | partial: MockModel tests-only F[S6] | Py ✓ (also TS/Go/Kotlin) F[S4] | Apache-2.0, 21.8k★, churn 30, 2.0 in May F[P,G,S7] | ✓ Google's own I | Google: none I |
| **OpenAI Agents SDK** 0.23.1, 2026-10-02 | ✓ any base_url client F[S8] | partial: handoffs; skills Sandbox-only F[S8] | ✓ RunHooks llm/tool/agent F[S8] | ✓ Pydantic tools F[S8] | ✗ no A2A (0 hits) / ✓ MCP F[S8] | ✓ ScriptedModel F[S8] | Py ✓ | MIT, 29.9k★, 17 minor lines in 2026; minors = breaking (0.7–0.22 documented) F[S8,P] | ✗ OpenAI-branded I | OpenAI (model vendor) I |
| **Pydantic AI** 2.54.0, 2026-10-03 | ✓ google/openai/openrouter native; NIM via base_url F[S9] | ✓ on-demand caps; graph broadcast F[S9] | ✓ Hooks every stage F[S9] | ✓ Pydantic-native F[S9] | partial: fasta2a (3rd-party) / ✓ client+server F[S9] | ✓ TestModel/FunctionModel F[S9] | Py ✓ | MIT, 20.5k★, v2 Jun-26, no-break minors F[S9,G] | partial: Gemini, not GCP I | neutral I |
| **LangGraph** 1.2.14, 2026-10-06 | ✓ via langchain-* pkgs (ChatNVIDIA) F[S10] | ✓ Send fan-out; skills DIY I | ✓ callbacks+stream events I | ✓ I | partial: A2A only in Agent Server / MCP adapters U | ✓ in-memory fakes F[S10] | Py/TS ✓ | MIT, 43.0k★, churn 2 (stable) F[P,G] | partial I | neutral I; LangSmith SaaS optional |
| **CrewAI** 1.15.26, 2026-10-08 | partial: NIM needs [litellm] F[S11] | ✓ skills; crews/Flows F[S11] | ✓ event bus (llm/tool/a2a/skill) F[S11] | ✓ I | ✓ A2A delegation / ✓ MCP F[S11] | ✗ `crewai test` OpenAI-only F[S11] | Py <3.14 | MIT, 59.5k★, 279 releases in 2026 F[P,G] | partial I | neutral I |
| **MS Agent Framework** 1.21.0, 2026-10-08 | partial: Gemini pkg Beta F[S12] | ✓ fan-out/fan-in edges; skills F[S12] | ✓ agent/chat/function middleware F[S12] | ✓ I | partial: A2A pkg Beta / ✓ MCP F[S12] | U none found | Py/.NET | MIT, 14.0k★, 1.0 Apr-26, churn 22 F[P,G] | ✗ Azure/Foundry-centric I | **Microsoft**: flag I |
| **AWS Strands** 1.59.0, 2026-10-08 | ✓ gemini/openai native; **default Bedrock** F[S13] | ✓ graph/swarm; AgentSkills F[S13] | ✓ before/after model/tool/node F[S13] | ✓ I | ✓ A2A server / ✓ MCP F[S13] | U mocks only in tests | Py/TS | Apache-2.0, 8.8k★ (repo now `harness-sdk`), churn 38 F[P,G] | ✗ AWS optics I | **AWS**: highest risk I |
| **smolagents** 1.26.0, 2026-05-29 | ✓ OpenAIModel/LiteLLM F[S14] | partial: managed agents I | partial: step_callbacks only F[S14] | partial: code-agent first I | ✗ (0 hits) / ✓ MCP F[S14] | partial: subclass Model I | Py | Apache-2.0, 29.8k★, no release >4 mo (repo active 10-06) F[P,G] | ✗ I | neutral I |
| **Agno** 3.1.2, 2026-10-08 | ✓ google/openai/nvidia/openrouter native F[S15] | ✓ Team route/broadcast; skills F[S15] | ✓ ~39 run event types F[S15] | ✓ I | ✓ A2A client+server / ✓ MCP F[S15] | U none found | Py | Apache-2.0, 42.6k★, 3.0 Aug-26 major F[P,G] | partial I | neutral I; AgentOS UI U |
| **LlamaIndex agents** core 0.14.25, 2026-09-21 | ✓ integration pkgs (nvidia, openrouter, genai) F[S16] | partial: AgentWorkflow handoff I | ✓ ToolCall/AgentOutput events F[S16] | ✓ I | ✗/U A2A / ✓ tools-mcp F[S16] | ✓ MockLLM F[S16] | Py/TS | MIT, 52.5k★ F[G]; RAG-centric I | partial I | neutral I |
| **Mastra** 1.75.0, 2026-10-07 | ✓ "provider/model" incl. nvidia, OpenRouter F[S17] | ✓ subagents/networks/skills F[S17] | ✓ observability U detail | ✓ Zod I | ✓ A2AAgent / ✓ MCP F[S17] | U | **TS only** | Apache-2.0 except `ee/` F[S17] | partial I | uses Vercel AI SDK pkgs F[S17]; see note |
| **No framework** (own loop) | ✓ all 4 OpenAI-compatible F[S18] | build: asyncio.gather I | ✓ you emit every event I | ✓ Pydantic→JSON schema I | add a2a-sdk 1.2.2 / mcp 2.3.0 F[S19] | ✓ trivial fake port I | Py | ours; no churn, we own the bugs I | weak: no platform used I | none I |

Inference bases, by column (I):
- **Col 4:** an untagged-source ✓ means a documented function-tool/Pydantic (or Zod) decorator that I did not grep this round.
- **Col 9:** only ADK is Google's agentic platform (CLAUDE.md rule 2), so it gets ✓. Gemini-capable third-party frameworks get partial. Frameworks from competing vendors or tied to their branding get ✗.
- **Col 10:** "neutral" means the owner is not a cloud vendor and the defaults are not wired to a competing cloud.
- **Col 2:** "partial" means no built-in skills loader or merge step was found, so it would be built on top.

Note on criterion 10 (I): rule 2 bans competing cloud *infrastructure*. An open-source library such as Strands, MAF or the Vercel AI SDK is probably allowed, but:
- **Strands** silently calls AWS Bedrock if `model=` is omitted. That is a real breach vector, not just optics.
- **MAF** pulls in Azure-first defaults.
- **Mastra** documents Vercel gateways and Vercel deploy. Never route calls through the Vercel AI Gateway, because that would be a breach.

## (c) Serious contenders in Munim
**Google ADK**
- Shape: a root `LlmAgent` router with a `SkillToolset` per domain (stock, prices, roster, suppliers). Fan-out goes through `ParallelAgent` or a 2.0 workflow join node into a merge agent. Supplier agents are separate Cloud Run services exposed via `to_a2a()` and consumed via `RemoteA2aAgent`.
- Trace: one `BasePlugin` (before/after agent, model, tool, `on_event`) writes trace rows for UI replay.
- Agents get only read tools plus `propose_command`; the core commits.
- Risk: experimental A2A/Skills APIs and breaking minors. Pin `google-adk==2.11.0` and keep our own scripted `BaseLlm` for tests (I).

**Pydantic AI**
- Shape: a router `Agent` with `Capability(defer_loading=True)` per domain (≈ skills). Fan-out goes through `pydantic_graph` broadcast, or delegation tools run under `asyncio.gather`.
- Trace: the `Hooks` capability emits trace events. Typed tools and `output_type` produce citation-bearing structured outputs.
- Tests: `TestModel`/`FunctionModel` give deterministic tests for free.
- Risk: A2A depends on third-party `fasta2a` 2.1.1, which describes itself as "Convert an AI Agent into a A2A server" (F, PyPI). A client side is U, so consuming supplier agents would likely mean wrapping an `a2a-sdk` client as a tool (I). Judges may read it as "not built on Google's platform" even with Gemini as the model (I).

**LangGraph**
- Shape: an explicit StateGraph (router node → `Send` fan-out → merge node). It gives the most legible replayable trace.
- Risk: A2A is only via the LangSmith Agent Server. Whether that is self-hostable on Cloud Run without a licence is UNVERIFIED. It also brings a heavy langchain-* dependency surface (I).

**Agno**
- Has the widest native provider list (google, openai, nvidia, openrouter all first-class) and Team `route`/`broadcast` modes that match router + fan-out directly.
- Risk: a major version (3.0) shipped 6 weeks ago, no shipped fake model was found, and its AgentOS/control-plane pull adds lock-in (I).

**Thin in-house loop**
- Shape: one `ChatPort` (OpenAI chat-completions shape) with 4 base URLs, a Pydantic tool registry, an `asyncio.gather` fan-out and one trace writer. A2A goes via `a2a-sdk`, MCP via `mcp`.
- Fully deterministic and fully owned. It fits the "agents propose, core commits" rule cleanly.
- Risk: build time before the 12 Oct deploy milestone. Also, Gemini's OpenAI-compat layer may not expose every native feature (U).

## (d) Could not verify
- The exact AI Builder Cup wording "built primarily using the Google Cloud tech stack", and whether a non-ADK framework scores lower. I only saw it quoted in the brief and in CLAUDE.md.
- Whether the Gemini OpenAI-compat endpoint is still labelled beta, and which native features it drops. The page shows "Last updated 2026-09-02" but its status markup did not parse.
- Whether LangGraph's Agent Server A2A can be self-hosted on Cloud Run free of a licence key, and which version of `langchain-mcp-adapters` is current.
- Shipped fake-model utilities for MAF, Strands, Agno and Mastra (none found by grep; they may exist under other names).
- Whether CrewAI supports parallel sub-agent fan-out with a merge step beyond async tasks.
- Mastra's trace/hook granularity, and whether its default model resolution touches any Vercel-hosted service.
- Star counts are as of 2026-10-09. Strands' count is for the renamed `strands-agents/harness-sdk` repo.

## Sources (all read 2026-10-09; GH = github.com, path at the commit shown)
- [P] PyPI JSON `https://pypi.org/pypi/<pkg>/json` (version/date/licence/release history); npm `registry.npmjs.org/@mastra/core`.
- [G] GitHub REST `api.github.com/repos/<org>/<repo>` (stars, licence, pushed_at).
- [S1] GH google/adk-python@c11060c `src/google/adk/integrations/openai/README.md`; CHANGELOG 2.10.0 (2026-09-24) "add api_key/base_url … to OpenAILlm".
- [S2] same repo, `src/google/adk/plugins/base_plugin.py` (before/after run, agent, model, tool, on_event, error callbacks).
- [S3] same repo, `src/google/adk/agents/parallel_agent.py`, `workflow/_parallel_worker.py`; CHANGELOG 2.0.0 GA (2026-05-19).
- [S4] GH google/adk-docs@57e34aa `docs/skills/index.md` ("Experimental"); adk-python `tools/skill_toolset.py`.
- [S5] adk-python `a2a/utils/agent_to_a2a.py` (`@a2a_experimental`), `agents/remote_a2a_agent.py`, `tools/mcp_tool/mcp_toolset.py`. All confirmed present in the 2.11.0 wheel.
- [S6] adk-python `tests/unittests/testing_utils.py:416 class MockModel`; `src/google/adk/cli/plugins/replay_plugin.py`.
- [S7] adk-python CHANGELOG: "BREAKING CHANGES" sections in 2.6.0 and 2.7.0; other "breaking" mentions in 2.4/2.9/2.10; 2.7.0 (2026-08-13) "pairs an output schema with tools".
- [S8] GH openai/openai-agents-python@125efa0 `docs/testing.md`, `docs/models/index.md`, `src/agents/lifecycle.py`, `docs/release.md`, `docs/sandbox_agents.md`; grep "a2a" = 0.
- [S9] GH pydantic/pydantic-ai@566ea13 `pydantic_ai_slim/pydantic_ai/providers/`, `docs/hooks.md`, `docs/capabilities/on-demand.md`, `docs/graph/builder/parallel.md`, `docs/testing.md`, `docs/migration.md` (to_a2a → fasta2a), `docs/version-policy.md`, `docs/mcp/overview.md`.
- [S10] GH langchain-ai/langgraph@cba111d `libs/langgraph/langgraph/types.py` (Send), `libs/cli/langgraph_cli/schemas.py` (disable_a2a); docs.langchain.com/langsmith/server-a2a.md, …/oss/python/langchain/test.md, …/integrations/providers/nvidia.md.
- [S11] GH crewAIInc/crewAI@140bfcb `lib/crewai/src/crewai/{llms/providers,a2a,events/types}`; `docs/v1.15.26/en/concepts/{llms,skills,testing}.mdx`.
- [S12] GH microsoft/agent-framework@c1c288b `python/packages/*`, `core/agent_framework/{_middleware.py,_mcp.py,_skills.py,_workflows/_workflow_builder.py}`; PyPI agent-framework-gemini 1.0.0b261008 and -a2a 1.0.0b261002 (Beta).
- [S13] GH strands-agents/harness-sdk@e46b0db `strands-py/src/strands/{models,hooks/events.py,multiagent/a2a,vended_plugins/skills}`; `agent/agent.py:236-238` ("Defaults to strands.models.BedrockModel").
- [S14] GH huggingface/smolagents@96f33fa `src/smolagents/{models.py,mcp_client.py,agents.py}`.
- [S15] GH agno-agi/agno@ff9b86d `libs/agno/agno/{models,client/a2a,os/interfaces/a2a,team/mode.py,skills,run/agent.py}`.
- [S16] GH run-llama/llama_index@6dd2f3c `llama-index-core/llama_index/core/{llms/mock.py,agent/workflow/workflow_events.py}`; PyPI llama-index-llms-{nvidia,openrouter,google-genai}, -tools-mcp.
- [S17] GH mastra-ai/mastra@908f923 `LICENSE.md`, `docs/src/content/en/{docs/connections/overview.mdx,docs/skills.mdx,models/providers/nvidia.mdx,models/gateways/}`; npm @mastra/core 1.75.0 deps `@ai-sdk/provider*`.
- [S18] ai.google.dev/gemini-api/docs/openai (base_url `…/v1beta/openai/`, updated 2026-09-02); openrouter.ai/docs/quickstart (`/api/v1/chat/completions`); docs.api.nvidia.com/nim/reference/llm-apis (`https://integrate.api.nvidia.com`, OpenAI API spec).
- [S19] PyPI a2a-sdk 1.2.2 (2026-10-05, Apache-2.0; 1.0 on 2026-04-20); mcp 2.3.0 (2026-10-02, MIT).
