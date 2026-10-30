# The AI layer

Munim Intelligence is the Python service in `services/intel`. It explains, finds and drafts. It cannot write.

## Shape

- **Manager.** Routes each question and answers simple ones itself. Its routing step is a constrained decision model
  (`route.intent`) that chooses one of six paths: `lookup`, `explain`, `investigate`, `draft_request`,
  `certification_request`, `out_of_scope` (`munim_intel/decide/questions.py`, `munim_intel/manager/paths.py`).
- **Eight specialists**, each a skill (hand-written instructions plus generated tools) that the Manager loads:
  `catalogue` (Menu & Pricing), `kitchen`, `inventory_purchasing` (Stock & Purchasing), `finance`, `people`,
  `customers`, `compliance`, `market`. The registry is `packages/contracts/src/intel/specialists.ts`. A leading `@Name` in a question addresses
  one of them directly.
- **Forecast** is a shared deterministic service, not a team member (`munim_intel/forecast/`). No model is involved.

| Path | What happens |
|---|---|
| `lookup`, `explain`, `out_of_scope` | The Manager answers, loading at most two skills. |
| `investigate` | With a scored routing guess and no `@Name`, up to four read-only branches run in parallel, one per specialist, each in its own runner. Otherwise the Manager answers alone and offers a "dig deeper" follow-up. |
| `draft_request` | Exactly one specialist's skill is loaded in code with its `propose_*` tools. Without an `@Name` the answer abstains with `specialist_needed`. |
| `certification_request` | A fixed abstention, `not_a_certificate`, with no model call. |

A specialist that does not apply to the outlet kinds in scope (the kitchen on a shop-only business) answers
`not_applicable` without a model call.

## Run context and tokens

Core mints a run token for every run: an Ed25519-signed JWT with `run_id`, `tenant_id`, `outlet_scope`, `trigger`
(`event`, `watch_sweep`, `ask`, `brief`, `ingest`, `auto_step`) and `actor`, valid for 15 minutes for an ask, 30 for an
ingest and two hours for the rest. Core records the run in `intel.run`. intel holds only the public key, so it cannot
mint a token. On every internal call core checks the signature and the run row, and takes tenant and outlet scope from
the token alone. Every refusal looks the same to the caller.

Inside intel, `RunContext` (`munim_intel/runtime/context.py`) is the only source of tenant and scope. Every tool is
built per run and closes over it. No tool schema has a tenant, run or actor parameter, and a test reflects over every
registered tool to prove it.

## Tools and handles

Tools are generated from `packages/contracts/generated/ontology.json`: one `read_<template>` per agent-exposed snapshot
template and one `propose_<command>` per agent-exposed draftable. A read mints a snapshot through core and returns a
capped digest. The model never sees a UUID or a raw cell value that it could type back:

- cells have handles: `S<n>` for a snapshot, `S<n>.r<i>.<column>` for a cell, `F<n>` a finding, `P<n>` a draft,
  `D<n>` a document cite, `G<n>` a graph node;
- the model writes `{S1.r0.net_minor}` in prose, and the tool layer expands it to the canonical ref
  `⟨snap:<id>·0·net_minor⟩` before anything leaves intel;
- an id cell used as an argument is expanded to its literal value.

A context may declare at most 20 tools and load at most two skills.

## Cite or abstain

Prose is made of segments, each with the refs it uses. The two ref forms are:

- `⟨snap:<snapshot-id>·<row>·<column>⟩`, a value from a snapshot;
- `⟨cite:<kind>:<id>[·<start>-<end>]⟩`, a source, where kind is `row`, `doc`, `msg`, `claim` or `snapshot`.

Core validates every answer, finding and narration (`packages/core-domain/envelope/validator.ts`):

1. the number grammar: prose outside a ref may contain no digit of any script, no percent sign, no number word and no
   typed quotation;
2. every segment carries at least one ref and declares each ref it uses;
3. every ref resolves inside the run's tenant (`unresolved_ref`, `cross_tenant_ref`);
4. a quotation span fits its source text (`quote_mismatch`);
5. a finding's `impact_ref` is a snapshot cell that resolves.

On failure core stores an abstention with a reason code and shows "Cannot verify", composed from its own text.
intel also runs the same grammar before it posts (`munim_intel/tools/grammar.py`), and a parity test compares the two
implementations on one table of probes, so one bad line falls back to its template instead of failing a whole answer.

## Drafts

A specialist proposes a change with a `propose_*` tool. Every numeric leaf in the payload must be a ref (a snapshot cell,
a quote row or a document span), never a typed number. Core stores the draft as `proposed` and the inbox shows each value
beside its source. When a person edits a number, the edited leaf is labelled `{value, typed_by}`. Approval runs
authority on the final payload. Some drafts come from deterministic mapping code instead of a model
(`munim_intel/mapping/`): the mapping holds the snapshot id and fills every leaf with a ref, an id, pack data or a date
chosen from the business date.

## Untrusted text

Text from outside (a supplier's reply, an uploaded document, a customer review) is untrusted. It is read only by an
extractor call that has no tools and a JSON response schema (`munim_intel/ingest/quarantine.py`). The run is marked
tainted before the call. A tainted run keeps its `propose_*` tools bound, but the plugin refuses each call. Traces and
errors never carry untrusted text.

## Watchers, briefs, investigations

- **Watchers.** Core publishes events; intel claims each event id once (`events:claim`), then runs the detectors that
  watch that event type. The worker also calls `/watch:sweep` every 15 minutes. A detector mints a template per outlet,
  applies pack thresholds, writes a finding with a ref-valued impact, and maps it to a draft by code. Narration is
  template text by default. A model writes it only for high or critical findings and only when the run's frame allows.
- **Daily brief.** Core ranks the open findings (impact, confidence, urgency). intel words them: template text always,
  and at most one model call for the whole brief.
- **Investigations.** A playbook is a checklist of hypotheses. Core mints each item's snapshot and decides its verdict
  and the investigation's status in code; no model sets a verdict. intel only narrates each step, in one call with no
  tools, and the template sentence stands when the call fails. Modes are Step, Plan and Auto, capped by a per-role
  ceiling the owner sets.

## Negotiation with simulated suppliers

A request for quotes runs one workflow (`munim_intel/negotiate/`). Every supplier is checked before anything is sent: its
row must be of kind `simulated`, its agent card must sit on the configured simulator origin and be named "Simulated
supplier". Messages are typed A2A data parts. A rule policy computes, for each supplier and round, the allowed moves
(accept, counter, walk) and a default; the counter price is the policy's, never a model's. A chooser model picks among
the allowed moves and writes a short note; code renders the numbers. Each reply goes to the no-tools extractor, whose
typed fields are grounded field by field in the reply text. Then a deterministic deal review runs five rules (budget,
margin floor, minimum order, open commitments, payment terms), and at most one purchase-order draft is proposed.

## Traces and spend

Every step is a trace event with ids and short labels only: route, skill load, sub-agent start and end, tool call and
result, A2A send and receive, finding, draft, abstain, error and review. The database rejects a payload with a string
over 200 characters or a key that is not snake_case. Traces are flushed before intel answers, including on failure.
Every provider call is a spend row posted to core, which sums them against the business's monthly AI cap.

## Models

Each role (`router`, `reason`, `extract`, `narrate`, `vision`, `embed`) is a row in `platform.model_role` with a provider,
a model id and a price. A database check refuses retired model ids. A role without a price does not run
live. Gates and tests run with `MUNIM_MODEL_MODE=recorded`: each model call is served from a committed fixture keyed by
a hash of the request. A missing fixture is an error that names the key; it never falls through to a live model. In
live mode, a call that fails is served from its recorded fixture when one exists.

## Built but not reached from a route

These modules have code and tests but nothing in this build calls them: document and invoice ingestion
(`munim_intel/ingest/`, apart from the quarantined extractor the negotiation uses), the wiki compiler
(`munim_intel/wiki/`) and the graph projector (`munim_intel/graph/project.py`). The route `/ingest` validates a token and
does nothing else. The graph tools exist on two skills and read whatever edges the database holds.
