# AI layer: routing, evidence and Nemotron roles

Munim Intelligence (`services/intel`) is an application service that uses language models through configured provider adapters. It is not the system of record, does not open a database connection, and has no direct book-table write path.

## Routing and specialist work

The Manager classifies a question into a constrained route: `lookup`, `explain`, `investigate`, `draft_request`, `certification_request` or `out_of_scope`. It can invoke eight specialist skills: Menu & Pricing, Kitchen, Stock & Purchasing, Finance, People, Customers, Compliance and Market. A run loads only the skills and tools its selected route needs. Investigations can fan out to a bounded number of read-only specialist branches. Forecast calculations and watcher detection are deterministic code, not model decisions.

| Role | Nebius Token Factory model ID configured by the repo | Work | Why this role is separated |
|---|---|---|---|
| `router` | `nvidia/Nemotron-3_5-Lightning` | Constrained route classification | A compact/fast model suits a small enum decision before heavier work. |
| `reason` | `nvidia/nemotron-3-super-120b-a12b` | Tool-using answers, explanations and bounded negotiation choices | More involved synthesis can use evidence tools; allowed actions and numeric business rules remain code-owned. |
| `extract` | `nvidia/Nemotron-3.5-Super-VL` | Typed extraction from simulated supplier responses or document inputs | Isolated, schema-shaped extraction keeps untrusted text away from tools and writes. |
| `vision` | `nvidia/Nemotron-3.5-Super-VL` | Reads synthetic invoice images into candidate fields | The output must be checked against page evidence and reviewed before any business change. |
| `narrate` | `nvidia/Nemotron-3.5-Super-VL` | Short explanation of findings/investigation steps | Narration receives existing findings and citations; deterministic/template text remains the fallback. |

These are Token Factory role IDs in `scripts/dev/nemotron-roles.ts`. They are not generic NVIDIA endpoint IDs. Role configuration is stored in `platform.model_role`; each role needs a provider, model ID and price. The project owner confirmed successful live application inference through Nebius Token Factory. The role table describes the configured mapping; it does not imply every role was separately exercised in every hosted environment. Provider-specific historical measurements are kept separate from Token Factory results.

## Evidence handles and answer validation

Core mints snapshots from approved SQL templates. Intelligence receives bounded digests and handles such as `S1` (snapshot), `S1.r0.net_minor` (cell), `F1` (finding), `P1` (draft), `D1` (document citation) and `G1` (graph node). A model refers to a handle; the tool layer expands it to the canonical reference before submission.

Core validates each answer segment:

1. Every claim segment carries and declares at least one source reference.
2. Each reference resolves within the run's tenant and scoped outlet set.
3. Numeric text is sourced from resolved snapshot cells rather than model-typed values.
4. Quoted ranges fit the cited source text.
5. Findings' impact references resolve to a snapshot cell.

If validation fails, Core stores a reason code and returns its fixed “Cannot verify” response. Template text is the fallback when a model is unavailable or fails the response contract.

## Untrusted input, tools and proposals

Supplier messages and uploaded documents are untrusted. Extractors receive no tools and return a strict structured response. A run that has read untrusted input cannot invoke proposal tools. Extracted fields must be validated against their source; invalid fields withhold the proposal.

For quote negotiation, deterministic policy calculates the allowed action set and price bounds for each round. A model can choose among those actions and provide a short rationale, but it cannot invent a permitted price. A deterministic deal review checks budget, margin, minimum order, overlap and terms. The result may create a purchase-order draft, never an automatic order.

## Failure and cost controls

- A call is keyed to a role configuration and records provider, model, outcome and usage/spend where available.
- Missing role configuration or pricing prevents the live role from running.
- The code supports recorded fixtures for deterministic local development. A fixture result is not evidence of live inference.
- Validation failure uses a fixed abstention or template response, not an unchecked model answer.
- Core tracks provider spend against the configured business budget.
- AI panels may be unavailable when Intelligence is down; Core approvals and books remain separate.

Implementation pointers: `services/intel/munim_intel/llm/`, `manager/`, `decide/`, `tools/`, `ingest/`, `negotiate/`, `trace/`; `db/migrations/0002_platform.sql`; `scripts/dev/nemotron-roles.ts`.
