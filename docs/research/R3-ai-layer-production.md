# R3 — Running the AI layer in production: unit economics, multi-tenancy, graph, safety

Status: research input, not a decision. Every claim is tagged `FACT` (with source), `INFERENCE`
(reasoning) or `UNVERIFIED` (from a secondary or aggregator source, not checked against a primary page).
Prices are **list prices as of 8 Oct 2026**. FX is ₹96 per US$: `INFERENCE`, mid-Sep 2026 spot from a
forecast site ([longforecast](https://longforecast.com/usd-to-inr-forecast-2017-2018-2019-2020-2021-indian-rupee)).
Companion to R1 (architecture), which already makes FalkorDB a rebuildable projection.

---

## 1. Verdict in 10 lines

1. **At ₹3,000–5,000 per outlet, the LLM layer is affordable if designed right:** about ₹570 a month with evals and retries, about ₹780 with voice and graph hosting. That is about 19–26% of a ₹3,000 plan. `INFERENCE` (§2)
2. **At ₹1,000 it does not pay as designed.** It pays only if free-form Q&A and voice are capped and default to Flash-Lite. `INFERENCE`
3. **The naive design costs about ₹8,400 per outlet a month,** more than the top price. Two features cause it: watchers that call the LLM on every event (about ₹5,200) and a daily full wiki recompile (about ₹1,800). `INFERENCE`
4. **Watchers must be SQL rules first and an LLM narrator second.** About 5 flagged findings a day reach a model, not 160 raw events. `INFERENCE`
5. **Q&A is the swing cost:** ₹130–1,360 per outlet, depending on model and how often the owner asks. Meter it per plan. `INFERENCE`
6. **Collapse the coordinator plus 8 agents into a router plus one tool-using agent** with just-in-time instruction packs. Every extra hop multiplies input tokens. `INFERENCE`, consistent with Shopify's findings (`FACT`, §3).
7. **Postgres is the source of truth for claims.** The graph is a projection rebuilt from it. Do not build Spanner Graph; FalkorDB is optional until a traversal need is measured. `INFERENCE`
8. **Fairness, budgets and quotas have to be application code.** Gemini quotas are per project and Cloud Tasks caps a region at 1,000 queues, so neither gives per-tenant isolation. `FACT` for the limits, `INFERENCE` for the conclusion (§3)
9. **Prompt-injection defence is architectural.** Use a quarantined extractor, plan-then-execute and the Rule of Two. Classifiers fall to adaptive attacks. Citation checks should be deterministic, not an LLM judge. `FACT` for the attack results, `INFERENCE` for the design (§5)
10. **Keep the provider port narrow,** for text-in/JSON-out extraction and narration only. Accept Gemini lock-in for Live, Batch and ADK. Nemotron via Nebius is a post-hackathon option only, because CLAUDE.md rule 2 is Google Cloud only. `INFERENCE`

---

## 2. Cost model (per outlet per month)

**Volume assumptions** (`INFERENCE`): about 150 orders and 160 business events a day; 60 two-page supplier invoices and about 300k tokens of documents and chat exports a month; 5 owner questions and 1 brief a day; 150 voice minutes a month.

**Prices**, per 1M tokens, input / output (`FACT` [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)):

| Model | Interactive | Batch | Cached input |
|---|---|---|---|
| 3.8 Flash | $1.50 / $7.50 (list from 1 Jan 2027; promo $0.75 / $3.75 until then) | 50% off | $0.15 |
| 3.5 Flash-Lite | $0.30 / $2.50 | $0.15 / $1.25 | — |
| 3.1 Pro | $2 / $12 | — | — |

- **Live voice** costs $0.005/min for audio in and $0.018/min for audio out. `FACT` [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- **Images** at Gemini 3 `medium` resolution cost 560 tokens, and OCR "saturates at medium". `FACT` [media resolution](https://ai.google.dev/gemini-api/docs/media-resolution)
- **Nemotron 3 Nano** costs about $0.06 / $0.24 on Nebius. `UNVERIFIED` [typingmind](https://custom.typingmind.com/tools/estimate-llm-usage-costs/nebius/nvidia-nemotron-3-nano-30b-a3b)

| Feature | Volume | Naive design | ₹ naive | Recommended design | ₹ rec |
|---|---|---|---|---|---|
| Invoice vision extraction | 60 invoices, about 2.6k in / 0.8k out each | 3.8 Flash | 57 | 3.5 Flash-Lite, schema-constrained JSON | **16** |
| Document and chat claim extraction | 300k in / 60k out | 3.8 Flash | 86 | Flash-Lite **Batch** (Nemotron Nano about ₹3) | **12** |
| Living wiki | Naive: full recompile daily (200k in / 45k out). Rec: about 3 dirty pages a day (8k / 1.5k each) | 3.8 Flash | 1,836 | Flash-Lite Batch, dependency-tracked incremental | **27** |
| Q&A, 5 a day | Naive: 4 hops × 8k in. Rec: router plus 2 hops × 10k in, 60% implicit-cache hits (`INFERENCE`) | 3.8 Flash | 907 | Flash-Lite router plus 3.8 Flash | **338** |
| Watchers | Naive: an LLM call on each of about 160 events a day. Rec: SQL rules, about 5 findings a day narrated | 3.8 Flash | 5,184 | Rules plus Flash-Lite narration | **32** |
| Morning brief | 1 a day, 20k in / 1.5k out | 3.8 Flash | 119 | 3.8 Flash Batch, with an interactive fallback | **59** |
| Forecast | Daily | — | 0 | Statistical service; the brief narrates it | **0** |
| Embeddings | About 1M tokens | gemini-embedding-2 | 19 | Batch | **10** |
| Evals, retries, judge sampling | +15% | — | — | — | **74** |
| Gemini Live voice | 150 min in / 60 min out | Live | 176 | Live, capped by plan | **176** |
| Graph hosting | Shared instance | Per-tenant FalkorDB | ? | Postgres edges (≈0), or a shared FalkorDB 8 GB Pro at $350 a month across about 1,000 tenants (price `UNVERIFIED`, density `INFERENCE`) | **0–34** |
| **Total** | | | **≈ 8,400** | | **≈ 570 without voice; ≈ 780 all-in** |

**Q&A sensitivity** (`INFERENCE`):

| Case | ₹ per month |
|---|---|
| 5 a day on Flash-Lite | about 130 |
| 5 a day on Flash, 60% cache hits | about 338 |
| 5 a day on Flash, no cache hits | about 570 |
| 5 a day on 3.1 Pro | about 470 |
| 20 a day on Flash | about 1,355 |

Running Q&A on the 3.8 Flash promo price halves the Flash figure until 31 Dec 2026.

**What fits which price** (`INFERENCE`):

| Monthly price | What fits |
|---|---|
| ₹1,000 | Extraction, watchers, brief and wiki (about ₹160), plus about 3 Flash-Lite questions a day. No voice. |
| ₹3,000 | Everything above, with Q&A on Flash and voice capped at about 150 min. |
| ₹5,000 | Q&A at about 15 a day, with Pro used for hard questions. |

**Levers:**

- **Batch:** 50% off, 24-hour "target turnaround", caching works inside batch. `FACT` [Batch](https://ai.google.dev/gemini-api/docs/batch-mode)
- **Implicit caching:** on by default from 2.5, minimum 4,096 tokens on 3.x Flash; cached input is about 10% of list. `FACT` [Caching](https://ai.google.dev/gemini-api/docs/caching)
- **Small models:** 2.5 Flash-Lite ($0.10 / $0.40) is now "limited access"; new projects are pointed to 3.5 Flash-Lite at 3× the input price. `FACT` [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) Plan on $0.30 / $2.50.
- **Incremental recompilation:** the largest single saving, about 68× on the wiki row. `INFERENCE`

---

## 3. Architecture recommendations

### Tenant isolation (context, memory, graph)

- **The server derives `tenant_id`** from the session and binds it into every tool closure; no tool accepts it as an LLM argument. Postgres RLS under the intel read role (R1); graph name `g:{tenant_id}` derived server-side. ADK sessions and memory scoped by (`app_name`, `tenant:user`); caches keyed by tenant. `INFERENCE`
- **Tenant-invariant prefix first** (system prompt, tool schemas, instruction packs), tenant data last, so implicit caching hits across all tenants. `INFERENCE` from the [caching](https://ai.google.dev/gemini-api/docs/caching) prefix model.
- **CI leak test:** seed two tenants with canary strings; assert no answer, citation or trace for A contains B's canary. `INFERENCE`

### Watchers at thousands of tenants

1. **Events:** core outbox → Pub/Sub, `tenant_id` as an attribute (R1).
2. **Stage 1, no LLM:** SQL detectors (price drift, stock-out risk, margin leak, forecast variance), debounced per tenant over a 15-minute window. `INFERENCE`
3. **Stage 2:** only findings above a severity threshold are narrated, at most N per tenant per day; the rest roll into the brief. `INFERENCE`
4. **Fairness:** Cloud Tasks allows **1,000 queues per region** and 500 dispatches/s per queue (`FACT` [quotas](https://docs.cloud.google.com/tasks/docs/quotas)); Gemini limits are **per project** (`FACT` [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)). So: shared queues by **priority class** (interactive > watcher > batch); a per-tenant **token bucket and ₹ spend ledger** checked before every call; soft cap degrades Flash → Flash-Lite → template, hard cap goes rules-only; interactive and background in **separate GCP projects**. `INFERENCE`
5. **Batch tier gate:** 3.8 Flash batch enqueued tokens are **3M at Tier 1**, 400M at Tier 2 ($100 spend + 3 days). `FACT` [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) A nightly brief for 1,000 tenants is about 21M tokens, so it needs Tier 2. `INFERENCE`

### Serverless versus worker pools

Cloud Run **services** for interactive Q&A and Live. **Worker pools** pulling Pub/Sub, autoscaled on queue depth via CREMA, for extraction and narration (`FACT` [tutorial](https://docs.cloud.google.com/run/docs/tutorials/autoscale-workerpools-pubsub)). **Jobs** for nightly batch submission, wiki rebuild and graph projection. Pull workers let you cap concurrency, which is what keeps you under a shared per-project RPM. `INFERENCE`

### What production companies do

| Company | Practice | Source |
|---|---|---|
| Shopify Sidekick | Behaviour degrades past about 20 tools. Fix: **just-in-time instructions** returned with tool results, which also helps caching. Judges went from κ 0.02 to 0.61 (humans 0.69) after calibration. | `FACT` [Shopify](https://shopify.engineering/building-production-ready-agentic-systems) |
| Glean | Fast path for simple Q&A; agentic path only when reflection finds the fast answer insufficient. The agentic engine raised tokens per query by about 50%. | `FACT` [Glean docs](https://docs.glean.com/administration/assistant/features/agentic-reasoning) |
| Intercom Fin | In-house ModernBERT reranker replaced Cohere: **reranking cost down 80%**, quality up. Bills $0.99 per resolution (`UNVERIFIED` [eesel](https://www.eesel.ai/blog/intercom-fin-ai-pricing-per-resolution-2025)). | `FACT` [fin.ai](https://fin.ai/research/how-we-built-a-world-class-reranker-for-fin/) |
| Notion | Regression plus frontier evals on every model; ships a new model within hours. | `FACT` [Braintrust](https://www.braintrust.dev/blog/notion) |
| Sierra | Multi-model "constellation" with a supervisor model; per-outcome pricing. | `UNVERIFIED` [Atlan](https://atlan.com/know/ai-agent/ai-agent-applications/what-is-sierra-ai/) |

**Common pattern:** a cheap fast path, escalation only on need, few tools per context, custom small models where volume is high, and evals gating every change. `INFERENCE`

### Living wiki and retrieval

Precompute only what is read daily (brief, supplier and dish-margin pages); mark a page dirty when a cited claim changes and recompile dirty sections in nightly Batch; answer the rest on demand. `INFERENCE` Evidence: GraphRAG wins multi-hop, RAG wins single-hop and detail questions (`FACT` [Han et al.](https://arxiv.org/abs/2502.11371)); LazyGraphRAG indexes at 0.1% of GraphRAG's cost and is over 700× cheaper per global query at comparable quality (`FACT` [Microsoft Research](https://www.microsoft.com/en-us/research/blog/lazygraphrag/)). Default: SQL tools for numbers plus hybrid retrieval (keyword + pgvector) over claims; graph hops only for explicit multi-hop questions (supplier → ingredient → dish). `INFERENCE`

### Provider portability

- **Holds** for extraction, narration and judging: stateless JSON-schema calls behind a `ModelPort` with Gemini and OpenAI-compatible adapters. `INFERENCE`
- **Leaks** for Live (Gemini-only audio), explicit caching, Batch semantics and ADK built-ins. ADK reaches other models via LiteLLM, whose PyPI 1.82.7–1.82.8 contained unauthorized code (Mar 2026). `FACT` [ADK doc](https://raw.githubusercontent.com/google/adk-docs/refs/heads/main/docs/agents/models/litellm.md)
- **Nebius** public endpoints are "Global" with no region commitment and retain inputs/outputs for speculative decoding unless ZDR is on. `FACT` [Nebius legal](https://docs.tokenfactory.nebius.com/legal/legal-quick-guide) Nemotron is also out for the Cup under rule 2; the GCP small model is Flash-Lite or Gemma. `INFERENCE`

---

## 4. Graph store recommendation at scale

**Recommendation:**

- **Canonical:** a Postgres `claims` table and an `edges` table (`tenant_id`, src, dst, type, provenance, valid_from/to), with RLS.
- **Optional projection:** FalkorDB, one graph per tenant, rebuilt from Postgres.
- **Drop the Spanner Graph adapter.** `INFERENCE`

| Option | Evidence | Fit for thousands of small graphs |
|---|---|---|
| **Postgres edges** | Apache AGE is **not** in Cloud SQL's supported extensions; pgvector is. `FACT` [Cloud SQL extensions](https://docs.cloud.google.com/sql/docs/postgres/extensions) AGE 1.8.0 (Aug 2026) supports only PG 18. `FACT` [EDB notes](https://www.enterprisedb.com/docs/pg_extensions/apache_age/rel_notes/apache_age_1.8.0_rel_notes/) | Best default. Recursive CTEs cover 2–3 hop queries on graphs of thousands of nodes. The marginal cost is zero, and backups come with the database. `INFERENCE` |
| **FalkorDB** | Vendor claims more than 10,000 graphs per deployment. `FACT` (vendor claim) [FalkorDB](https://www.falkordb.com/falkordb-graph-database/) Startup tier: $0.10/GB-hour (about $73/GB-month), **12-hourly backups, 7-day retention, no high availability**. `FACT` [Startup tier](https://docs.falkordb.com/cloud/startup-tier) Noisy-neighbour knobs `TIMEOUT_MAX`, `QUERY_MEM_CAPACITY` and `MAX_QUEUED_QUERIES` all default to unlimited. `FACT` [config](https://docs.falkordb.com/getting-started/configuration) Licence is SSPLv1, and internal use without exposing FalkorDB is allowed. `FACT` [license](https://docs.falkordb.com/references/license) | Good as a projection. **Per-graph overhead is unmeasured** (`NODE_CREATION_BUFFER` defaults to 16,384): run `GRAPH.MEMORY` on a synthetic tenant, set all three limits, get a legal read on SSPL. `INFERENCE` |
| **Spanner Graph** | Needs **Enterprise** edition or higher. `FACT` [overview](https://docs.cloud.google.com/spanner/docs/graph/overview) Enterprise is $1.23/node-hour. `FACT` [pricing](https://cloud.google.com/spanner/pricing) The smallest size is 100 PU, about $90 a month. `INFERENCE` from [granular sizing](https://cloud.google.com/blog/products/databases/use-spanner-at-low-cost-with-granular-instance-sizing) | Overkill: a third store and second adapter for graphs of a few MB. `INFERENCE` |

**Rebuild pipeline:** claim outbox events → idempotent projector upsert keyed on claim id → nightly Postgres-vs-graph count diff, rebuilding on drift. Disaster recovery is "replay from Postgres", so FalkorDB snapshots are secondary. `INFERENCE`

---

## 5. Quality and safety stack

**Evals.** Three layers: (1) deterministic evals on every PR (schema validity, SQL-number match, refusal cases); (2) a ground-truth set sampled from production traces, labelled by 2–3 people; (3) LLM judges only after their κ against humans is measured. Gate on regression, not absolute scores. `INFERENCE`; method `FACT` from [Shopify](https://shopify.engineering/building-production-ready-agentic-systems) and [Notion](https://www.braintrust.dev/blog/notion). Judges show position, verbosity and self-enhancement bias (`FACT` [Zheng et al.](https://arxiv.org/abs/2306.05685)): swap pair order, cap length, and judge Flash with Pro rather than itself. `INFERENCE`

**Citation validation is deterministic** (`INFERENCE`). Each check is code:

1. Every number in an answer must equal a value returned by a SQL tool in the same trace.
2. Every cited row or document ID must exist and belong to the tenant.
3. Every quoted span must be an exact substring of the source.

On failure: retry once, then **abstain** with "can't verify". Track the abstention rate as a KPI next to accuracy.

**Prompt injection from invoices and chats.** Filters and classifiers don't hold: adaptive attacks bypassed 12 published defences at over 90% success (`FACT` [Nasr, Carlini et al.](https://arxiv.org/abs/2510.09023)). Architecture does (`FACT` [design patterns](https://arxiv.org/abs/2506.08837), [CaMeL](https://arxiv.org/abs/2503.18813), [Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/)): a **quarantined extractor** with no tools and schema-constrained output turns documents into typed claims; watchers **plan-then-execute**, fixing the tool plan before reading untrusted content; the Q&A agent holds untrusted input and private data, so it gets **no outbound channel**. Supplier drafts are the exfiltration path: approval shows full text and recipients, renders no links or images, never auto-sends. `INFERENCE`

**Observability.** OpenTelemetry GenAI spans (`invoke_agent`, `execute_tool`, model calls) tagged with `tenant_id`, model and ₹ cost. The conventions moved to [their own repo](https://github.com/open-telemetry/semantic-conventions-genai) and are still "Development" status (`UNVERIFIED` [dev.to](https://dev.to/azena-ai/opentelemetrys-genai-semantic-conventions-are-not-stable-yet-heres-what-actually-shipped-in-2026-3mke)). Self-hosted Langfuse ingests OTel but needs Postgres, ClickHouse, Redis and S3 (`FACT` [Langfuse](https://langfuse.com/self-hosting)); Cloud Trace plus a per-tenant cost table is enough to start. `INFERENCE`

---

## 6. Pushback list

| # | Design part | Why it won't scale or won't pay | Alternative |
|---|---|---|---|
| X1 | **Watchers triggered by events, calling the LLM per event** | About ₹5,200 a month, above ARPU; busy tenants starve the shared quota. | SQL detectors → severity threshold → Flash-Lite narration of about 5 findings a day (about ₹32). |
| X2 | **A wiki recompiled in full** | About ₹1,800 a month, mostly regenerating unchanged prose. | Dirty-page tracking, nightly Flash-Lite Batch (about ₹27); precompute only daily-read pages. |
| X3 | **A coordinator plus 8 domain agents as separate LLM hops** | Each hop re-sends prompt, tools and context. Shopify saw degradation past about 20 tools; Glean's agentic path costs about 50% more tokens. | Flash-Lite router, then one agent with JIT instruction packs; domains are prompt/tool modules, not hops. |
| X4 | **One FalkorDB graph per tenant as primary memory** | Per-graph overhead is unmeasured, the Startup tier has no HA, the noisy-neighbour limits default to unlimited, and the licence is SSPL. | Postgres claims and edges canonical; FalkorDB a rebuildable projection, added when a traversal need is proven. |
| X5 | **A Spanner Graph adapter** | An Enterprise-edition floor and a second adapter to maintain, for graphs of a few MB. | Delete it from scope. The Postgres edges table keeps the migration path open. |
| X6 | **Explicit per-tenant context caching** | Storage is $1 per 1M tokens per hour from 2027: a 10k-token cache held a month is about ₹700 *per tenant*. | No per-tenant explicit caches. Implicit caching by default, with a tenant-invariant prefix of at least 4,096 tokens first. If the measured hit rate is low, one shared explicit cache for that prefix costs about ₹700 a month for the whole fleet (whether ADK can share `cached_content` across sessions: `INFERENCE`, verify). |
| X7 | **Morning brief on Batch with no fallback** | Batch is a 24-hour target, not an SLA. Tier 1 caps enqueued tokens at 3M. | Submit at close; if missing at 06:00, fall back to interactive Flash-Lite. Reach Tier 2 before launch. |
| X8 | **Per-tenant queues for fairness** | Cloud Tasks allows 1,000 queues per region, and Gemini quotas are per project. | Queues by priority class, a per-tenant token bucket plus ₹ ledger, degrade tiers, and separate GCP projects for interactive and background work. |
| X9 | **Gemini and Nemotron behind one port, for everything** | Live, Batch, caching and ADK are Gemini-specific; LiteLLM was compromised in Mar 2026; Nebius retains data by default with no region commitment and breaks the Cup's GCP-only rule. | Port only stateless JSON calls; accept lock-in for Live and ADK; evaluate Nemotron after the Cup on ZDR with a dedicated regional endpoint. |
| X10 | **An LLM-as-judge for citations and numbers** | Judges are biased and poorly calibrated: Shopify's κ started at 0.02. | Deterministic validators plus abstention. Keep judges for tone and helpfulness, calibrated against humans. |
| X11 | **Injection classifiers or "ignore instructions" prompts** | Adaptive attacks bypass them more than 90% of the time. | Quarantined extraction, plan-then-execute, the Rule of Two, and full-content approval for any outbound draft. |
| X12 | **GraphRAG-style community summaries** | Expensive indexing; RAG is equal or better on single-hop questions, which most owner questions are (`INFERENCE`). | SQL tools plus hybrid retrieval, graph hop only for multi-hop; LazyGraphRAG if global summaries are ever needed. |
| X13 | **Unmetered Q&A and voice at ₹1,000** | Q&A runs ₹130–1,360 and voice about ₹176. | Plan quotas: Flash-Lite by default, Flash/Pro on higher tiers, voice minutes as an add-on. |
