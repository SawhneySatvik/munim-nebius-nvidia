# R6b · Agentic architecture deep research — round 2, gap-filling (11 Oct 2026)

Sonnet deep-research workflow, round 2. Research never overrides a plan doc; it feeds the W3 architecture ADR. Known gaps after this round: Karpathy's writing, OpenAI/Gemini strict structured-output guarantees and the 'JEV' identification were not verified here — JEV and decision APIs are covered in R6c (orchestrator lookup); Karpathy and strict outputs are cited in the ADR from pre-cutoff knowledge and labelled UNVERIFIED.

## Summary

Round-2 evidence is thin: only 20 claims survived, and none of them covers Karpathy (angle 1), OpenAI or Gemini strict structured output (angle 2), or the "JEV model" identification (angle 5). The strongest verified material falls into four areas. (a) Anthropic's tool-design guidance: consolidate tools around whole workflows, cap and paginate responses, and write actionable errors. (b) Benchmark caveats: BFCL V4's overall score is an unweighted average, and Epoch AI found defects in 48% of a 50-task sample. tau-bench grades the end database state and introduced pass^k. (c) Long-horizon state: Anthropic found compaction alone insufficient and used a progress file plus a feature list. LangGraph splits checkpointers from stores. (d) A 2026 pilot found that agent self-verdicts and in-band LLM judges are unreliable, which supports Munim's rule that checks come from ledger rows and not from model opinion. V-JEPA 2 is a robotics/video world model with no demonstrated applicability to tabular or business agents. The ADK 2.0 evidence is a landing page plus one breaking change to custom BaseAgent subclasses.

## Findings

### Tool design for Munim intel tools: consolidate around whole workflows (for example one 'draft purchase order for supplie…

Tool design for Munim intel tools: consolidate around whole workflows (for example one 'draft purchase order for supplier' tool, not list/get/create endpoint wrappers), and return bounded, filtered or paginated results with sensible defaults. Claude Code's 25k-token cap is one vendor's example, not a universal threshold. Treat tool descriptions and error text as prompt-engineered artifacts and return actionable errors, not codes or tracebacks. The effect size is unquantified and Anthropic-reported.

- **Confidence:** high · **Vote:** 3-0, 3-0, 3-0
- **Evidence:** FACT. Quotes: 'consider implementing a `schedule_event` tool which finds availability and schedules an event'; 'we restrict tool responses to 25,000 tokens by default'; 'Even small refinements to tool descriptions can yield dramatic improvements.' All three claims passed 3-0 against the primary page (11 Sep 2025). The page gives no numeric before/after figures. The SWE-bench Verified example is self-reported with no ablation.
- **Sources:** https://www.anthropic.com/engineering/writing-tools-for-agents

### Do not rely on BFCL's headline score to choose or validate a model for tool calling. Overall Accuracy is an unweighted a…

Do not rely on BFCL's headline score to choose or validate a model for tool calling. Overall Accuracy is an unweighted average of sub-categories, and Epoch AI's review found defects in 24 of 50 sampled tasks (48%), with per-category rates from 20% to 70%. The review also found that fixed-answer-key matching yields both false negatives and false positives. Munim should look at per-category results and build its own golden tool-call evals on seeded worlds.

- **Confidence:** high · **Vote:** 3-0, 3-0, 3-0
- **Evidence:** FACT for definitions and counts. 'Implication for Munim' is INFERENCE. BFCL V4 (leaderboard updated 2026-04-12) covers single-turn, multi-turn, agentic/web-search and format sensitivity. The 'overall = unweighted average' statement was verified. The Epoch review is dated 10 Sep 2026 and gives a 'Flawed' verdict. Per-category samples are only 5 to 15 items, so the category rates are noisy and the 48% has a wide confidence interval. The verifier noted the supporting quote for 'false positives' reads as a false-negative description, but the page does describe true false positives separately. The category list is incomplete in the fetched excerpt (memory and irrelevance were not confirmed from the leaderboard page itself).
- **Sources:** https://gorilla.cs.berkeley.edu/leaderboard.html, https://epoch.ai/benchmarks/berkeley-function-calling-leaderboard/review

### For eval design, tau-bench is the relevant pattern. It scores the final database state against an annotated goal state, …

For eval design, tau-bench is the relevant pattern. It scores the final database state against an annotated goal state, using simulated users in retail and airline domains, and it introduced pass^k (all k independent trials succeed) as a reliability metric distinct from pass@k. Munim's evals should assert the resulting drafts and ledger-adjacent state, not transcripts, and should report pass^k across repeated runs on recorded or seeded worlds.

- **Confidence:** high · **Vote:** 3-0, 3-0
- **Evidence:** FACT. Abstract: 'compares the database state at the end of a conversation with the annotated goal state' and 'We also propose a new metric (pass^k) to evaluate the reliability of agent behavior over multiple trials.' Limits: synthetic domains, LLM-simulated users. The verifier recalls that some tasks also require specific strings in the agent's replies, so the reward is not purely DB-state (not re-checked). The paper reports pass^8 below 25% in retail for GPT-4o-class agents. tau2-bench was not covered by any surviving claim.
- **Sources:** https://arxiv.org/pdf/2406.12045

### Self-reported success and in-band LLM judges are poor verifiers on open-ended outcomes. In one 54-cycle pilot, the agent…

Self-reported success and in-band LLM judges are poor verifiers on open-ended outcomes. In one 54-cycle pilot, the agent claimed improvement in all 54 cycles while 56% had a measured real-world delta of zero or below. A self-verdict gate degenerated to accept-all and eroded the best deployed state by 19%. The strongest in-band judge accepted cycles of which 44% were regressions and rejected 38% of real improvements. This supports Munim's design of external grounding (snapshot cells and ledger rows, a human approver) over model self-assessment or LLM-judge gates. Treat it as pilot evidence, not a general law.

- **Confidence:** medium · **Vote:** 3-0, 3-0
- **Evidence:** FACT for the reported numbers, INFERENCE for the Munim implication. Park and Choi, arXiv 2607.25152, submitted 27 Jul 2026, revised 29 Sep 2026. Preregistered pilot, one agent, one testbed, 54 cycles, no peer review found, and the verifiers read only the abstract. The harness labelled the source 'secondary', but the verifiers treat the abstract page as the paper itself. A related claim, that the judge's error vanishes when success is verifiable from the artifact itself, was REFUTED 0-3 and must not be relied on.
- **Sources:** https://arxiv.org/pdf/2607.25152

### Long-horizon work needs explicit external state, not compaction alone. Anthropic's harness has an initializer session th…

Long-horizon work needs explicit external state, not compaction alone. Anthropic's harness has an initializer session that creates init.sh, claude-progress.txt and an initial git commit. Later sessions read the log and git history, work on one feature, then commit and update the log. Its experiments found that compaction alone fell short for a high-level prompt, even with Opus 4.5. Munim's analogue is a durable task or draft record in Postgres (feature-list style checklist plus progress notes) that each resumed run reads, with ADK sessions kept in-memory per request. Transfer from coding agents to business or ERP tasks is unproven.

- **Confidence:** medium · **Vote:** 3-0, 3-0
- **Evidence:** FACT for the description, INFERENCE for the Munim mapping. Anthropic Engineering, 26 Nov 2025. Evidence is qualitative with no benchmark numbers. The article never ablates the feature list and progress log in isolation, so 'needed' slightly overreaches. It names two failure patterns: attempting too much at once, and declaring the project complete too early. Optimised for full-stack web apps. The article lists generalisation to other fields as future work.
- **Sources:** https://anthropic.com/engineering/effective-harnesses-for-long-running-agents

### LangGraph's vocabulary maps cleanly onto Munim. Checkpointers save thread-scoped graph state for resume, recovery and hu…

LangGraph's vocabulary maps cleanly onto Munim. Checkpointers save thread-scoped graph state for resume, recovery and human-in-the-loop. Stores hold long-term cross-thread memory. Resuming replays from the last checkpoint, so any side-effecting step must be idempotent. In Munim, drafts are the only side effect, and approval execution runs through core-api idempotency.

- **Confidence:** medium · **Vote:** 3-0, 3-0
- **Evidence:** FACT: 'LangGraph's persistence layer gives agents short-term memory through checkpointers and long-term memory through stores.' The idempotency caveat is the verifier's INFERENCE; the fetched page said nothing about it. Vendor documentation describes the design, not its effectiveness. No evidence was gathered on MemGPT/Letta, generative-agents memory, or episodic/semantic/procedural memory.
- **Sources:** https://docs.langchain.com/oss/python/langgraph/durable-execution

### ADK 2.0 introduces graph-based (deterministic) workflows, dynamic code-based workflows with loops and branching, and coo…

ADK 2.0 introduces graph-based (deterministic) workflows, dynamic code-based workflows with loops and branching, and coordinator/sub-agent collaboration. In Python 2.0, BaseAgent now extends BaseNode, and custom `_run_async_impl()` overrides are bypassed by the workflow graph engine (silently ignored). Any Munim custom agent subclass must move to BeforeAgentCallback/AfterAgentCallback or to the new workflow primitives, and a boot-time test should assert that every custom agent actually executes.

- **Confidence:** medium · **Vote:** 3-0 (workflows), 2-1 (BaseAgent change), 3-0 (release-notes index)
- **Evidence:** FACT from the vendor's docs. The breaking-change claim passed 2-1; the dissent concerned wording (bypassed by the Workflow Graph engine versus ignored everywhere) and that 'breaking for Munim' only holds if custom `_run_async_impl` subclasses exist. adk.dev/2.0 lists GA releases (Python v2.0.0 on 19 May 2026). The release-notes page is only an index to per-language GitHub repos, with no Python 2.11 notes. Nothing verified on plugins, callbacks, sessions, memory, artifacts, A2A or structured output with tools.
- **Sources:** https://adk.dev/2.0/, https://adk.dev/release-notes/

### V-JEPA 2 is not applicable to Munim's tabular/business agents. It is a 1.2B-parameter joint-embedding predictive world m…

V-JEPA 2 is not applicable to Munim's tabular/business agents. It is a 1.2B-parameter joint-embedding predictive world model, pre-trained self-supervised without action labels on over 1M hours of video and 1M images. Planning comes from a second-stage action-conditioned predictor trained on only 62 hours of robot data, used in model-predictive control (imagine the outcomes of candidate actions, rank by closeness to a goal). The transferable idea is the pattern of predicting consequences of candidate actions before choosing. For Munim that would be a deterministic simulation or what-if over ledger snapshots, not a learned video model.

- **Confidence:** high · **Vote:** 3-0, 3-0
- **Evidence:** FACT for the model description (Meta AI blog, 11 Jun 2025, primary). 'Not applicable to tabular or business data' is INFERENCE by omission, since the blog is silent on it, and the 'needs an action space and learned dynamics' clause is the claim author's inference. Robotics success rates are self-reported. Whether 'JEV model' means JEPA was not established by any surviving claim. That identification is unresolved.
- **Sources:** https://ai.meta.com/blog/v-jepa-2-world-model-benchmarks/

## Caveats

- Coverage gaps are the main limitation. No surviving claim addresses Karpathy (context engineering, autonomy slider, Software 3.0, memory, graph knowledge), OpenAI Structured Outputs or strict function calling, Gemini controlled generation, grammar-constrained decoding, Pydantic validate-and-retry, MCP tool-design practice, MemGPT/Letta, generative-agents memory, tau2-bench, verifier or self-consistency results, citation-accuracy evaluation, plan-and-execute versus ReAct, Palantir AIP scenario modelling, or ADK sessions, memory, artifacts, A2A and callbacks. The "JEV model" meaning is therefore unresolved, though JEPA is the most plausible reading. Two Gemini structured-output claims (JSON mode without a schema, and the supported schema subset) and one ADK built-in-tool-combination claim were refuted 0-3 and are excluded. Do not infer the opposite from the refutations, because they may have failed on wording or on stale docs. A related claim about in-band judge error vanishing when success is verifiable from the artifact was also refuted 0-3. Several sources are single-vendor self-reports (Anthropic, Meta, LangChain, Google). The 2607.25152 preprint is unreviewed and a single pilot. Verifiers often read only abstracts or landing pages, and none ran independent contradiction searches. Time-sensitive: BFCL leaderboard and Epoch review (2026), ADK 2.x (GA May 2026, Python 2.11 not documented in the verified material), and Anthropic guidance from Sep and Nov 2025.

## Refuted

- {"claim": "FACT: Gemini JSON mode (response_mime_type=application/json) without a response_schema is only a hint and does not guarantee valid JSON; schema plus mime type is required for 100% valid JSON. Google advises a client-side validator with retry when no schema can be predefined. Limit: this guarantees syntactic/schema conformance, not semantic correctness of values.", "vote": "0-3", "source": "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output"}
- {"claim": "FACT: Gemini structured output supports only a subset of the schema. Unsupported fields are silently ignored rather than rejected, and enums are limited to string enums. Munim's tool/draft schemas must be restricted to this subset or validated server-side, because constraints outside it will not be enforced.", "vote": "0-3", "source": "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output"}
- {"claim": "Adding context-retrieval and full-text snippet search actions raised accuracy by about 10 points over CiteAgent with GPT-4o (45.1% vs 35.3%), reported as a 17% gain. This suggests that a verifier able to inspect the source text beats title/abstract-only grounding.", "vote": "0-3", "source": "https://arxiv.org/html/2510.17853v3"}
- {"claim": "In ADK, certain built-in tools (Code Execution, Google Search, Agent/Vertex AI Search) cannot be combined with any other tool in the same agent (FACT per docs, limited to the listed tools and models/SDKs).", "vote": "0-3", "source": "https://raw.githubusercontent.com/google/adk-docs/refs/heads/main/docs/tools/limitations.md"}
- {"claim": "The in-band judge's error vanishes (mirage 0) when success is verifiable from the artifact itself; the gap depends on where the success signal resides, not on judge quality. Implication: LLM judging suffices only for transcript-verifiable checks; open-ended real-world outcomes need an out-of-band evaluator reading ground truth (databases, append-only ledgers).", "vote": "0-3", "source": "https://arxiv.org/pdf/2607.25152"}

## Sources

- {"url": "https://shiftmag.dev/?p=7751", "quality": "secondary", "angle": "Karpathy primary sources", "claimCount": 4}
- {"url": "https://fourweekmba.com/the-era-of-context-engineering/", "quality": "unreliable", "angle": "Karpathy primary sources", "claimCount": 0}
- {"url": "https://andrewships.substack.com/p/autonomy-sliders", "quality": "blog", "angle": "Karpathy primary sources", "claimCount": 5}
- {"url": "https://www.anthropic.com/engineering/writing-tools-for-agents", "quality": "primary", "angle": "Strict tool calling and tool design", "claimCount": 5}
- {"url": "https://simonwillison.net/2024/Aug/6/openai-structured-outputs", "quality": "blog", "angle": "Strict tool calling and tool design", "claimCount": 5}
- {"url": "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output", "quality": "primary", "angle": "Strict tool calling and tool design", "claimCount": 5}
- {"url": "https://gorilla.cs.berkeley.edu/leaderboard.html", "quality": "primary", "angle": "Strict tool calling and tool design", "claimCount": 4}
- {"url": "https://dylancastillo.co/posts/gemini-structured-outputs.html", "quality": "blog", "angle": "Strict tool calling and tool design", "claimCount": 4}
- {"url": "https://epoch.ai/benchmarks/berkeley-function-calling-leaderboard/review", "quality": "primary", "angle": "Strict tool calling and tool design", "claimCount": 4}
- {"url": "https://anthropic.com/engineering/effective-harnesses-for-long-running-agents", "quality": "primary", "angle": "Agent memory and long-horizon state", "claimCount": 5}
- {"url": "https://docs.langchain.com/oss/python/langgraph/durable-execution", "quality": "primary", "angle": "Agent memory and long-horizon state", "claimCount": 4}
- {"url": "https://www.letta.com/blog/benchmarking-ai-agent-memory", "quality": "blog", "angle": "Agent memory and long-horizon state", "claimCount": 4}
- {"url": "https://arxiv.org/pdf/2406.12045", "quality": "primary", "angle": "Agent evals and precision", "claimCount": 5}
- {"url": "https://arxiv.org/pdf/2609.02246", "quality": "blog", "angle": "Agent evals and precision", "claimCount": 5}
- {"url": "https://arxiv.org/pdf/2607.25152", "quality": "secondary", "angle": "Agent evals and precision", "claimCount": 5}
- {"url": "https://arxiv.org/pdf/2608.13564", "quality": "secondary", "angle": "Agent evals and precision", "claimCount": 5}
- {"url": "https://arxiv.org/html/2510.17853v3", "quality": "primary", "angle": "Agent evals and precision", "claimCount": 5}
- {"url": "https://arize.com/blog/agent-as-a-judge-agentic-evaluation/", "quality": "blog", "angle": "Agent evals and precision", "claimCount": 4}
- {"url": "https://adk.dev/2.0/", "quality": "primary", "angle": "ADK 2.x and world models/planning", "claimCount": 5}
- {"url": "https://adk.dev/release-notes/", "quality": "primary", "angle": "ADK 2.x and world models/planning", "claimCount": 3}
- {"url": "https://raw.githubusercontent.com/google/adk-docs/refs/heads/main/docs/tools/limitations.md", "quality": "primary", "angle": "ADK 2.x and world models/planning", "claimCount": 4}
- {"url": "https://ai.meta.com/blog/v-jepa-2-world-model-benchmarks/", "quality": "primary", "angle": "ADK 2.x and world models/planning", "claimCount": 5}

## Stats

{"angles": 5, "sourcesFetched": 22, "claimsExtracted": 95, "claimsVerified": 25, "confirmed": 20, "killed": 5, "unverified": 0, "afterSynthesis": 8, "urlDupes": 0, "budgetDropped": 7, "agentCalls": 104}