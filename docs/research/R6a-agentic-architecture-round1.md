# R6a · Agentic architecture deep research — round 1 (10 Oct 2026)

Sonnet deep-research workflow (5 angles → 20 sources → 97 claims → top 25 verified by 3-vote adversarial check: 21 confirmed, 4 refuted). Research never overrides a plan doc (shipyard RULES §1); it feeds the W3 architecture ADR.

## Summary

Verified evidence supports a design that treats Munim's intelligence layer as a typed-action, ontology-style system: Palantir's Foundry/AIP pattern (Actions as typed transactions, an action log that records decisions as linked objects, one MCP tool per action, staged human review) closely matches Munim's draft, approve, commit flow, except that Palantir also allows auto-apply, which Munim forbids (R16). Anthropic and OpenAI guidance both say to start simple. Use single calls or fixed workflows for known-path specialist explain-and-cite tasks, and keep fan-out for open-ended investigation, because multi-agent runs cost about 15x chat tokens and token spend alone explains about 80% of BrowseComp variance. For context, use small curated per-run contexts (context rot) and clean-context sub-agents that return condensed summaries of roughly 1-2k tokens. Use a manager pattern in which the router/orchestrator alone owns the user-facing output. GraphRAG is a candidate for corpus-level questions over unstructured text only, since Munim's data is SQL-structured. Several areas remain unsupported by the verified set: Karpathy's writing, the JEV/JEPA question, strict-schema and constrained decoding, memory architectures, agent evaluation and benchmarks. Fresh research is needed there before the architecture is finalised.

## Findings

### Palantir's typed Action layer is the closest vendor precedent for Munim's draft, approve, commit flow. Action types are …

Palantir's typed Action layer is the closest vendor precedent for Munim's draft, approve, commit flow. Action types are user-defined transactions: a set of edits to objects, properties and links applied together, with side effects. Edits commit to the Ontology at execution and show in all applications. Actions can stay inside the Ontology or write back to external systems, under granular access control. Caveat: Palantir also lets trusted AI processes auto-close the loop without review, which Munim forbids in v1 (R16), so the analogy covers structure, not the approval guarantee. 'Writes go through a typed action layer, not direct data edits' is the claimant's gloss. It holds for user edits, but pipelines can also change backing data.

- **Confidence:** high · **Vote:** 3-0 (claims 2, 10); 2-1 (claim 3)
- **Evidence:** Claims 2, 10 voted 3-0. Claim 3 voted 2-1: the first sentence is near-verbatim in the docs and the second is a gloss. Verifiers noted that the 'configurable submission criteria as a preview/validate/approve gate' claim was refuted 0-3, so do not cite Palantir as precedent for a validate gate. Labelled FACT for vendor behaviour, INFERENCE for the Munim analogy.
- **Sources:** https://www.palantir.com/docs/foundry/action-types/overview/, https://palantir.com/docs/foundry/ontology/why-ontology/

### Decision capture and lineage pattern: Foundry's action log records every successful action submission as an Ontology obj…

Decision capture and lineage pattern: Foundry's action log records every successful action submission as an Ontology object, so decisions are queryable as data. Each log object is automatically linked to every object the action edited (one log object with N links). Limits: successful submissions only (failures go to metrics), edits made outside actions are not logged, there is no backfill, and only primary keys are stored. This maps onto Munim's audit_log, decision and decision_id model: a decision node linked to the book rows it touched, which enables lineage queries.

- **Confidence:** high · **Vote:** 3-0
- **Evidence:** Claims 0, 1 both voted 3-0 against Palantir primary docs. The 'decision lineage via graph links' wording is the report's framing, not Palantir's. Munim should also log rejected and failed drafts, because Palantir does not and that is a gap. INFERENCE.
- **Sources:** https://palantir.com/docs/foundry/action-types/action-log/

### Agents should get one dedicated typed tool per action type plus typed read paths. In Ontology MCP, each action type beco…

Agents should get one dedicated typed tool per action type plus typed read paths. In Ontology MCP, each action type becomes its own MCP tool (a specific, predefined action), object types are readable via a SQL tool, and query functions and AIP Logic functions are exposed as extra tools. For Munim this suggests one tool per draftable command type (the command registry) and read tools backed by snapshot-minting SQL, with no free-form write tool. Note that only action types added to the application are exposed, and the page says nothing about approval semantics.

- **Confidence:** high · **Vote:** 3-0
- **Evidence:** Claims 4, 5 voted 3-0. A SQL read tool is a vendor capability statement, not evidence of precision. Munim's equivalent would need to enforce snapshot cell minting (R25), which Palantir's SQL tool does not do. INFERENCE for the mapping.
- **Sources:** https://www.palantir.com/docs/foundry/ontology-mcp/sample-architecture

### Decisions can be decomposed as data, logic and action, with security governing all three. That gives a usable template f…

Decisions can be decomposed as data, logic and action, with security governing all three. That gives a usable template for typing agent tools: read tools (objects/snapshots), logic tools (deterministic functions, forecasts) and action tools (draft commands). AIP Logic shows LLM functions bound to Ontology data, and AIP supports staging LLM-proposed ontology edits for human review with per-action inspectable logic and application on approval. The decomposition-to-tool-types mapping is the report's inference. Positioning is vendor marketing and is not evidence of effectiveness.

- **Confidence:** medium · **Vote:** 3-0 (6,7,8); 2-1 (9)
- **Evidence:** Claims 6, 7, 8 voted 3-0 and claim 9 voted 2-1: the decomposition is verbatim but 'template for typing tools' is claimant inference. The AIP page says edits can also apply automatically, so staging is optional there. No independent effectiveness data.
- **Sources:** https://palantir.com/docs/foundry/ontology/why-ontology/, https://palantir.com/docs/foundry/aip/aip-features/

### GraphRAG (Edge et al., Microsoft) builds an LLM-extracted entity-relationship graph, runs hierarchical Leiden community …

GraphRAG (Edge et al., Microsoft) builds an LLM-extracted entity-relationship graph, runs hierarchical Leiden community detection, pre-summarises communities, and answers global queries by map-reduce over the summaries. It targets query-focused summarisation of unstructured corpora. It is a poor fit as the core of Munim's graph layer, which is SQL-structured ledgers with typed edges in Postgres. At most it suits unstructured sources such as supplier documents, reviews and SOPs. Indexing is LLM-expensive, and the paper's win rates are LLM-judged on narrow datasets. The specific win-rate numbers claim was refuted 0-3, so do not cite those figures.

- **Confidence:** medium · **Vote:** 3-0 (method); 0-3 (win rates, refuted)
- **Evidence:** Claim 11 voted 3-0 on the method description. The quantitative win-rate claim was refuted 0-3. The 'poor fit for SQL data' conclusion is INFERENCE, supported by the verifier's caveat.
- **Sources:** https://arxiv.org/html/2404.16130v2

### Start simple and fan out sparingly. Anthropic says optimising single LLM calls with retrieval and examples is usually en…

Start simple and fan out sparingly. Anthropic says optimising single LLM calls with retrieval and examples is usually enough, and that agents suit open-ended problems with unpredictable steps. OpenAI says to maximise a single agent with tools first, and to split when it fails to follow complex instructions or picks wrong tools (often, not only), because splitting adds complexity and overhead. Both argue for a deterministic or single-call path for Munim's known-path explain-and-cite flows, with specialists split out only after measured failure.

- **Confidence:** high · **Vote:** 3-0
- **Evidence:** Claims 15, 19 voted 3-0. Anthropic Dec 2024, OpenAI Apr 2025. Neither gives quantitative evidence for 'usually enough'. Anthropic's June 2025 research system is a counterpoint for breadth-first research. Two related Anthropic claims (workflow/agent definitions and the orchestrator-workers pattern) were refuted 0-3 and must not be cited as verified.
- **Sources:** https://www.anthropic.com/engineering/building-effective-agents, https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf

### Multi-agent fan-out can improve quality but is expensive and partly a token-spend effect. Anthropic's Opus 4 lead with S…

Multi-agent fan-out can improve quality but is expensive and partly a token-spend effect. Anthropic's Opus 4 lead with Sonnet 4 subagents beat single-agent Opus 4 by 90.2% on its internal research eval. Agents use about 4x chat tokens and multi-agent about 15x. On BrowseComp, token usage alone explains about 80% of variance (95% with tool calls and model choice). The source is an internal, non-public eval on research tasks from June 2025 with older models, and it does not cover write or ERP workloads. The same post says multi-agent is ill-suited to tightly coupled or shared-context work. Treat the 90.2% as not transferable, and budget fan-out explicitly.

- **Confidence:** high · **Vote:** 3-0
- **Evidence:** Claims 12, 13, 14 voted 3-0 against the primary post dated 13 Jun 2025. FACT for the numbers, INFERENCE that the multi-agent gain is partly token spend (the post says 'mainly'). The 80% figure is correlational with no published method.
- **Sources:** https://www.anthropic.com/engineering/multi-agent-research-system

### Per-run context should be small and curated. Anthropic defines context engineering as curating the full set of tokens av…

Per-run context should be small and curated. Anthropic defines context engineering as curating the full set of tokens available at inference, not only the prompt. Recall degrades as context grows (context rot), so context is a finite attention budget. Clean-context sub-agents that return condensed summaries (often 1,000-2,000 tokens) are recommended for focused tasks, alongside compaction and structured note-taking. Directional degradation is corroborated by independent work the verifier recalled: Chroma 2025, Lost in the Middle 2024, RULER 2024. Those were not re-fetched here. The effect size for Munim needs its own evals.

- **Confidence:** high · **Vote:** 3-0
- **Evidence:** Claims 16, 17, 18 voted 3-0. Anthropic, 29 Sep 2025. Design recommendations, not benchmarks. FACT for the definition and the directional claim, INFERENCE for 'therefore specialists get small run contexts' and for how this applies to Munim's boundaries. The 1-2k figure is 'often', not a rule.
- **Sources:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

### Orchestrator topology: OpenAI's manager pattern (a central agent calls specialists as tools and alone owns user access a…

Orchestrator topology: OpenAI's manager pattern (a central agent calls specialists as tools and alone owns user access and workflow control) fits Munim's router plus eight specialists, with one agent owning the user-facing, snapshot-rendered output. The decentralised peer-handoff pattern is the alternative, optimal when no central synthesis is needed. The OpenAI guide's own decentralised example is a triage agent handing off to specialists, so the router-like fit is not unique to manager. Manager is preferred here because the cite-or-abstain renderer must be a single choke point.

- **Confidence:** medium · **Vote:** 3-0
- **Evidence:** Claim 20 voted 3-0 on the two-pattern taxonomy, verified from extracted PDF text. The fit to Munim and the single-choke-point argument are INFERENCE. Single vendor source, April 2025.
- **Sources:** https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf

## Caveats

- The verified set is narrow: only Palantir docs, Anthropic and OpenAI first-party posts, and the GraphRAG paper survived. Almost all evidence is vendor documentation, so it shows what vendors say and do, not independent effectiveness. Nothing verified covers several requested angles: Karpathy on context engineering and LLM OS, the JEV/JEPA question (JEPA/world models remain only a candidate reading, not confirmed), strict-schema and constrained decoding, Pydantic and structured outputs, memory architectures, plan-and-execute, reflection and verifier models, and agent evaluation and benchmarks. Four claims were refuted 0-3, including GraphRAG win rates, the workflow-versus-agent definition and orchestrator-workers description, and Palantir 'submission criteria as a validation gate', so do not cite those. Palantir pages are undated and can change. Anthropic and OpenAI sources are 12-22 months old as of 10 Oct 2026, and the 15x and 90.2% figures used older models. Several verifiers did not re-fetch pages or search for contradictions. Recommended patterns here are INFERENCE for Munim, since none were tested on restaurant or ERP workloads. Palantir permits auto-apply, which Munim's R16 forbids.

## Refuted

- {"claim": "Action types have configurable submission criteria and rules that validate whether and how an action can run. This is a precedent for a preview/validate/approve gate before commit.", "vote": "0-3", "source": "https://www.palantir.com/docs/foundry/action-types/overview/"}
- {"claim": "On global sensemaking questions over ~1M-token podcast and ~1.7M-token news corpora, GraphRAG beat vector RAG on comprehensiveness (72-83% and 72-80% win rates, p<.001) and on diversity (75-82%).", "vote": "0-3", "source": "https://arxiv.org/html/2404.16130v2"}
- {"claim": "Anthropic distinguishes workflows (LLMs and tools orchestrated through predefined code paths) from agents (LLMs dynamically direct their own process and tool use), which maps to Munim's split between deterministic core paths and model-driven specialists.", "vote": "0-3", "source": "https://www.anthropic.com/engineering/building-effective-agents"}
- {"claim": "The orchestrator-workers pattern fits tasks whose subtasks cannot be predicted in advance. A central LLM decomposes the task, delegates to workers and synthesizes their results. This is the basis for a router/orchestrator over domain specialists.", "vote": "0-3", "source": "https://www.anthropic.com/engineering/building-effective-agents"}

## Sources

- {"url": "https://palantir.com/docs/foundry/action-types/action-log/", "quality": "primary", "angle": "Ontology and decision lineage", "claimCount": 5}
- {"url": "https://www.palantir.com/docs/foundry/action-types/overview/", "quality": "primary", "angle": "Ontology and decision lineage", "claimCount": 5}
- {"url": "https://www.palantir.com/docs/foundry/ontology-mcp/sample-architecture", "quality": "primary", "angle": "Ontology and decision lineage", "claimCount": 4}
- {"url": "https://palantir.com/docs/foundry/aip/aip-features/", "quality": "primary", "angle": "Ontology and decision lineage", "claimCount": 5}
- {"url": "https://palantir.com/docs/foundry/ontology/why-ontology/", "quality": "primary", "angle": "Ontology and decision lineage", "claimCount": 5}
- {"url": "https://morphsys.substack.com/p/ai-agents-and-ontologies-create-a", "quality": "blog", "angle": "Ontology and decision lineage", "claimCount": 5}
- {"url": "https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/anthropic/", "quality": "secondary", "angle": "Context engineering and graph retrieval", "claimCount": 5}
- {"url": "https://arxiv.org/html/2404.16130v2", "quality": "primary", "angle": "Context engineering and graph retrieval", "claimCount": 5}
- {"url": "https://www.mindstudio.ai/blog/software-3-0-explained-karpathy-context-window-ram-model-weights-cpu", "quality": "blog", "angle": "Context engineering and graph retrieval", "claimCount": 5}
- {"url": "https://www.anthropic.com/engineering/multi-agent-research-system", "quality": "primary", "angle": "First-party agent guidance and orchestration trade-offs", "claimCount": 5}
- {"url": "https://www.anthropic.com/engineering/building-effective-agents", "quality": "primary", "angle": "First-party agent guidance and orchestration trade-offs", "claimCount": 5}
- {"url": "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents", "quality": "primary", "angle": "First-party agent guidance and orchestration trade-offs", "claimCount": 5}
- {"url": "https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf", "quality": "primary", "angle": "First-party agent guidance and orchestration trade-offs", "claimCount": 5}
- {"url": "https://openai.github.io/openai-agents-python/", "quality": "primary", "angle": "First-party agent guidance and orchestration trade-offs", "claimCount": 5}
- {"url": "https://blog.langchain.com/how-and-when-to-build-multi-agent-systems", "quality": "blog", "angle": "First-party agent guidance and orchestration trade-offs", "claimCount": 4}
- {"url": "https://www.anthropic.com/engineering/writing-tools-for-agents", "quality": "primary", "angle": "Typed tools, grounding and human approval", "claimCount": 5}
- {"url": "https://learn.traeai.com/t/ai-engineering/phases/15-autonomous-systems/15-propose-then-commit.html", "quality": "blog", "angle": "Typed tools, grounding and human approval", "claimCount": 5}
- {"url": "https://mishig-jepawiki.hf.space/wiki/papers/lecun-position-paper", "quality": "secondary", "angle": "World models, planning, memory and benchmarks", "claimCount": 4}
- {"url": "https://arxiv.org/pdf/2406.12045", "quality": "primary", "angle": "World models, planning, memory and benchmarks", "claimCount": 5}
- {"url": "https://arxiv.org/pdf/2309.02427", "quality": "primary", "angle": "World models, planning, memory and benchmarks", "claimCount": 5}

## Stats

{"angles": 5, "sourcesFetched": 20, "claimsExtracted": 97, "claimsVerified": 25, "confirmed": 21, "killed": 4, "unverified": 0, "afterSynthesis": 9, "urlDupes": 0, "budgetDropped": 10, "agentCalls": 102}