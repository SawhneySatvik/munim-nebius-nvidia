# Devpost submission copy

Paste-ready draft for the Nebius × NVIDIA Global AI Hackathon. Confirm the personal and experience-based fields before submitting.

## Public project page

### Project name

Munim: The AI Back Office for Food Businesses

### Elevator pitch

A source-grounded AI back office that turns restaurant records into cited answers and approval-ready actions.

### About the project

```markdown
## The problem

Independent food businesses make daily decisions across invoices, supplier quotes, stock, recipes, sales and margins. The facts are spread across records and tools, so owners often spend their time reconciling information before they can act. A general chatbot can produce a confident answer, but an operator needs to know where each number came from and what will happen next.

## What we built

Munim is an AI back office for food businesses. An owner can ask a business question, investigate a change in costs, review supplier quotes, inspect an invoice or prepare a purchase request. Munim connects those tasks to a shared operational record and a supply graph linking suppliers, ingredients, dishes and outlets.

The graph makes relationships visible. If a supplier changes a price, Munim can trace which ingredients, dishes and outlets may be affected. The owner can inspect the supporting records and see how the change affects margins.

## How the AI works

The application uses NVIDIA Nemotron models through Nebius Token Factory. We verified live application inference through Token Factory. The configured roles use Nemotron 3.5 Lightning for constrained routing, Nemotron 3 Super 120B A12B for deeper reasoning, and Nemotron 3.5 Super VL for document and image extraction and short narration.

Each role has a limited job. The router selects from a fixed set of routes. The reasoning model uses read-only tools to inspect approved business snapshots and produce answers with citations. The vision and extraction roles return structured fields from invoices or supplier responses. Those fields are checked against the source document before they can inform a proposal.

Munim’s TypeScript Core owns the database and business rules. Its Python Intelligence service uses Google ADK and an OpenAI-compatible provider adapter to call Token Factory. Intelligence has no direct database connection or write permission. Core validates citations and numeric claims against the records, applies deterministic pricing and policy checks, and stores proposed changes as drafts. A person reviews and approves each business change.

## What we learned

Choosing a model by task makes the system easier to control. A small routing decision does not need the same setup as a multi-step investigation. Structured extraction benefits from strict schemas and source checks. Business numbers should come from validated records, while models help interpret those records and explain the result.

The main engineering challenge was keeping useful AI inside a reliable operating workflow. We addressed that with role-specific prompts, scoped read tools, typed outputs, citation validation, deterministic calculations, spend controls and human approval. When the evidence does not support an answer, Munim says it cannot verify the claim.

We built the project with TypeScript, Python, PostgreSQL, Supabase, FalkorDB, Next.js, Hono, Google ADK and Nebius Token Factory. The app uses synthetic business data, simulated suppliers and recorded payment actions for its public demo.
```

### Built with

NVIDIA Nemotron, Nebius Token Factory, Supabase, PostgreSQL, FalkorDB, Next.js, TypeScript, Python, Google ADK, Hono, Vercel, AI agents, agentic AI, multimodal AI, restaurant technology, food operations, knowledge graph, human approval, source citations.

### Try it out

- **Code:** `https://github.com/SawhneySatvik/munim-nebius-nvidia` (make the repository public before submission)
- **Dedicated Nebius demo:** `[NEBIUS_DEMO_URL]` (replace after deployment and verification)
- **Existing interactive demo:** `https://munim-cobnut.vercel.app/staff/sign-in` (synthetic data; deployed model provider has not been verified as Token Factory)
- **Product site:** `https://munim-rho.vercel.app/`
- **Demo video:** `[YOUTUBE_VIDEO_URL]` (replace after public or unlisted upload)

## Judge and organizer questions

### Track

Best apps and agents.

### Project new or existing before August 26, 2026

Select based on the project's actual start date. The checkout Git metadata could not verify this date. If the product existed before the cutoff, select **Existing** and use the update answer below.

### Existing project update

We added a Nebius Token Factory provider to Munim’s AI layer and configured NVIDIA Nemotron models for routing, reasoning, document extraction, invoice vision and narration. The work added provider-specific role configuration, a model smoke path, traces that identify provider and model, and an architecture that keeps model access read-only. Core validates cited records and numeric claims, while deterministic rules and human approval govern business changes. We also built a submission cut that shows the AI office and the supplier graph in use.

### Public code repository

`https://github.com/SawhneySatvik/munim-nebius-nvidia`

The repository is pushed to `main` and uses Apache-2.0. Make it public before submission so judges can access the source, license and setup instructions.

### Working demo

Use `[NEBIUS_DEMO_URL]` after the dedicated deployment is available and checked. If submitting before then, use the existing interactive demo and state that its deployed model provider has not been verified as Token Factory.

### Which models did you use, and why?

We configured three Nemotron variants across five application roles. Nemotron 3.5 Lightning (`nvidia/Nemotron-3_5-Lightning`) handles constrained route selection. Nemotron 3 Super 120B A12B (`nvidia/Nemotron-3-super-120b-a12b`) handles tool-using reasoning and bounded negotiation choices. Nemotron 3.5 Super VL (`nvidia/Nemotron-3.5-Super-VL`) handles invoice vision, typed extraction and short narration. This separates fast classification from deeper synthesis and multimodal reading. The project owner verified live application inference through Nebius Token Factory. The role table describes configured mappings; it is not a claim that every role was separately benchmarked.

### How would you rate Nemotron's output quality?

Suggested rating: **8/10**, if it matches your experience.

The models fit well into role-specific tasks with structured outputs. In Munim, an answer is useful when it follows the requested format, cites the source records and leaves business calculations to deterministic code. The application validates those requirements and falls back or abstains when the evidence is insufficient. We have not run a controlled quality benchmark through Token Factory, so this rating reflects practical integration experience.

### Did you fine-tune, prompt-engineer or use Nemotron out of the box?

We used the models without fine-tuning. We assigned a narrow role to each model and used task-specific instructions, constrained route choices, structured response schemas and read-only tools. Extractors have no tools and return candidate fields that must be checked against their source. The reasoning role can inspect approved snapshots and must cite evidence. Core validates references and numeric claims before showing an answer or storing a draft.

### How did Nemotron compare with other models?

We did not run a controlled, same-task comparison through Nebius Token Factory, so we cannot give a measured ranking. Nemotron's role separation worked well for Munim's mix of routing, grounded reasoning and document understanding. Historical timing and behavior observations from NVIDIA's separate endpoint are labeled separately in our documentation and are not used as Token Factory benchmarks.

### Which Nebius platform capabilities were most valuable?

Nebius Token Factory's OpenAI-compatible inference API let us connect hosted Nemotron inference to the application's existing model adapter. We could configure a provider and model per role without provisioning or operating GPU instances. The API key stays in the server-side Intelligence service. Traces record the provider and requested model so an operator can distinguish live inference from recorded fallback behavior. We used Token Factory API access; we did not provision a Nebius GPU instance or claim a scaling benchmark.

### How likely are you to recommend Nemotron on Nebius?

Suggested rating: **9/10**, if it matches your experience.

The API integration was a practical way to run Nemotron from an existing application stack. Role-based configuration made it straightforward to assign different models to routing, reasoning and multimodal tasks. Clearer operational metrics and model-specific guidance would improve the experience further.

### How was inference compared with previous cloud or local environments?

Suggested rating: **8/10**, if it reflects your experience.

For this project, Token Factory offered a direct API path to hosted Nemotron without local GPU setup. I verified live inference from the application. I have not completed a controlled comparison of latency, reliability or cost against another cloud or local setup, so this rating describes integration experience rather than measured performance.

### What would improve the experience?

Per-model latency and token-usage dashboards, clearer guidance on reasoning settings for structured calls, and easy-to-run evaluation examples for multimodal extraction would make it easier to tune each role. Predictable model versioning and a small development credit pool would also help teams retest their integration after credits run out.

### What do you hope to see from the Nemotron team next?

More task-specific guidance for structured outputs, tool use and multimodal extraction, along with stable model versioning and evaluation recipes that teams can run against their own data. Clear reporting of reasoning-token usage would help application teams manage latency and cost.

### Tavily

Select **No**. Tavily is documented as optional and is not part of the functioning runtime path.

### Other required fields

- Submitter type: choose Individual if submitting alone, or Team if other people contributed as teammates.
- Organization name: `N/A` if you are not representing an organization.
- Country of residence: select your actual country. If it is India, choose India.
- Canadian province: `N/A` if you do not reside in Canada.
- Builders & Brews city: select only if attending one of the listed events.
- AI tools: disclose all tools actually used by you and your teammates. List NVIDIA Nemotron via Nebius Token Factory for runtime inference and OpenAI Codex for coding and documentation if applicable. Add any other tools the team used.
- Learning: select **Significant** if this reflects your experience. The work involved role-specific inference, validating outputs against operational records and adding human approval to business actions.
- Career AI value: select **Yes** if true for you.

## Submission checklist

Before submitting, make the GitHub repository public, deploy and verify the dedicated Nebius demo, replace `[NEBIUS_DEMO_URL]`, upload `video/munim-launch/renders/munim-nebius-final.mp4` to YouTube or Vimeo, and replace `[YOUTUBE_VIDEO_URL]`. The local final cut is 2:49 and under the three-minute limit.
