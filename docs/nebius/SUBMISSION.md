# Devpost submission text: Nebius × NVIDIA Global AI Hackathon

Updated 30 Oct 2026 (ticket NB-pack). Stays in this repository; paste-ready fields begin below. Deadline Fri 30 Oct 2026, 22:30 IST.

Verification note (30 Oct 2026): the project owner confirms that the application used its configured NVIDIA Nemotron model roles
through Nebius Token Factory: Lightning for routing, Nemotron 3 Super for reasoning, and Nemotron 3.5 Super VL for extraction,
vision and narration. This confirms the live provider integration, not per-role performance benchmarks. Numeric performance
results below identify their source. Figures attributed to NVIDIA's endpoint are measurements from that separate endpoint, not
Token Factory benchmarks.

Text that pastes into Devpost starts after each field heading; notes for the submitter are in brackets. Replace only the submission
links with the actual public repo, working demo and public video URLs.

## Internal submission checklist (not Devpost copy)

Checked against the [official rules](https://nebiusglobalaihackathon.devpost.com/rules) on 30 October 2026:

- **Track:** Best Apps and Agents is the strongest fit: Munim is an operations application whose agents answer business questions,
  investigate evidence and prepare approval-gated workflows.
- **Nebius/NVIDIA runtime:** the project owner confirms successful application inference through Nebius Token Factory with the
  configured Nemotron roles. The source identifies provider-specific model IDs and the repeatable live smoke command. No
  Token Factory latency, quality or cost benchmark is claimed. The owner reports that Token Factory credits are exhausted, and
  this checkout has no test credential, so this verification cannot be freshly repeated here.
- **Working demo URL:** the existing public product site and Cobnut staff demo were opened successfully on 30 October. Their
  current deployed model provider has not been verified as Token Factory. The isolated Nebius-hosted deployment described below
  is not yet published; do not represent it as a live demo until configured and checked.
- **Source and license:** the intended repository URL is `https://github.com/SawhneySatvik/munim-nebius-nvidia`. The repository
  currently remains private; make it public and confirm Apache-2.0 appears in its GitHub About/license metadata before judging.
  The source tree includes the Apache-2.0 `LICENSE`, setup/model guidance and the website-rendered README source.
- **Video:** the previous 178-second draft is superseded. The revised 169-second cut is scripted to include the AI office, role routing,
  Nebius Token Factory model path and a 35-second graph sequence. Re-render and inspect the final MP4 before uploading it publicly;
  the YouTube URL is the only video placeholder.
- **Feedback:** `FEEDBACK-DRAFT.md` is supporting material. Submit only observations that retain their source attribution; the
  numeric experiments in that draft are from NVIDIA's separate endpoint.
- **Project timeline:** rules require a significant-update explanation only if the project existed before 26 August 2026. The
  Git metadata pointer in this checkout is broken, so its start date cannot be re-verified here. Confirm the source history before
  deciding whether the timeline section below is needed or before quoting its commit identifiers.

The hackathon submission deadline shown on Devpost is 30 October 2026 at 10:00 am Pacific Time. The intended repository is
identified below. The dedicated deployment and YouTube links remain placeholders until their respective release steps are done;
the repository must be public for judging.

Hard rule 5 applies to everything below: the data is synthetic, the suppliers are simulated, payments are recorded and never
processed. Only Cobnut Bakehouse and Kosambari Kitchens appear.

---

## Name

Munim

## Tagline (Devpost: elevator pitch)

A back office for small restaurants. AI agents find the leaks and draft the actions. A named person approves, and every number opens to the rows behind it.

## Track

Best Apps and Agents. [Also entered for: Best Use of Tavily, only if the live Tavily call is working at submission (see "Bonus awards"); Most Valuable Feedback, which every submission that completes the feedback field is eligible for.]

## What it does

Munim is an operating system for small restaurant groups, cloud kitchens and shops: the till, the web storefront, the kitchen
board, stock, purchasing, ledgers and rosters. On top of that system of record sits an AI layer that explains what happened,
finds money that is leaking and drafts what to do next.

One rule governs all of it: **nothing changes the books without a named person's approval, and every number shown traces to a
ledger row.** A model never types a number a person reads. It cites a cell of a snapshot the database computed, and the app
shows the value from that cell. If a number cannot be traced, the screen says "Cannot verify".

What a person can do with it, on two synthetic businesses (Cobnut Bakehouse, a two-outlet bakery in Lucknow; Kosambari
Kitchens, a three-kitchen cloud kitchen in Bengaluru):

- **Ask a question the books can answer.** "Which ingredients are below their reorder level?" The answer names the agent and the
  model that wrote it, and each quantity is a chip that opens the stock rows.
- **Open the inbox.** Rules, not a model, watch the books every quarter-hour. Kosambari's books hold four planted problems, and
  the watchers raise each: Swiggy taking 30% where the contract says 22% on 18 orders (₹483.84), an ad fee nobody opted into
  (₹550), urad dal creeping from ₹125 to ₹145 a kilo (₹3,000), a cook clocking out late on 18 of 26 shifts (₹3,240). A model
  words each finding from its cited cells. These amounts are measured on synthetic books.
- **Follow one ingredient from invoice to purchase order.** Upload a photo of a synthetic supplier invoice (roasted hazelnuts,
  from "Lalbagh Nut & Spice (simulated)"). A vision-language Nemotron reads it with no tools, and the draft holds only spans of
  the page. The person types the figures they approve. "Request quotes" then has a reasoning Nemotron negotiate with three
  simulated suppliers inside rules that fix every price it may offer; a deterministic deal check runs (margin, budget, minimum
  order, overlap, payment days); and a purchase-order draft lands in the inbox. Its saving against the last price paid is a
  cell computed in SQL, shown with its source chip. The owner approves. Nothing is ordered before that, and payments are only
  recorded.
- **Be told "Cannot verify".** When the books cannot back an answer, the answer abstains. A figure on an invoice that is not on
  the page withholds the whole draft.

## How we built it

[Verified against the code. Role by role. The model ids per provider are in `scripts/dev/nemotron-roles.ts`; each role is one
row in `platform.model_role`, so changing provider is configuration, not code.]

Core (TypeScript, Hono, Postgres 18 with row-level security) is the only writer of the database and the system of record. The
AI layer (`services/intel`, Python on Google ADK) has no database client and no write grant. It posts traces, spend, answers
and drafts to core's internal API. It reaches models through one OpenAI-compatible client (ADK's `OpenAILlm`); the `nebius`
provider is one entry in `services/intel/munim_intel/llm/providers.py`, pointing at `https://api.tokenfactory.nebius.com/v1/`
with its own key, `NEBIUS_API_KEY`.

| Role | Configured Token Factory model id | What it does | Where (under `services/intel/munim_intel/`) |
|---|---|---|---|
| router | `nvidia/Nemotron-3_5-Lightning` | One constrained choice per question: look it up, explain, investigate, draft a request. Thinking off. | `decide/mimic.py` `router_decision_model`, called from `route` in `manager/ask.py` |
| reason | `nvidia/nemotron-3-super-120b-a12b` | The Manager and eight specialists call snapshot tools, read cells, and write the answer citing them. In a negotiation it picks among the moves the rules allow. The only role with thinking on, with a 16,384-token ceiling. | `default_models` in `manager/ask.py`; `negotiate/route.py` |
| extract | `nvidia/Nemotron-3.5-Super-VL` | Reads a simulated supplier's reply into a typed quote. No tools. Each field must be found in the reply's text. | `negotiate/route.py`, `negotiate/extract.py`, `ingest/quarantine.py` |
| vision | `nvidia/Nemotron-3.5-Super-VL` | Reads an invoice image into a typed invoice. No tools. Every figure must be a span of the page. | `ingest/invoice.py`, `ingest/route.py` |
| narrate | `nvidia/Nemotron-3.5-Super-VL` | Words a watcher's finding or an investigation step from its cited cells. A line that breaks the grammar keeps the template. | `app.py` (`watch_narrator`, `narrate_model`), `narrate/__init__.py`, `watch/pipeline.py` |

The project owner has verified live inference from the application through Token Factory using a working Nemotron model. The
role table lists the configured Token Factory model ids; each live trace and spend row records the provider and requested model
for its call.

The performance figures currently documented here come from NVIDIA's separate endpoint: Ask latency (27 to 58 s for the four
questions that answered), router and extraction latency with thinking off (about 1 s), and model behavior described below. These
figures are explicitly attributed to NVIDIA's endpoint and are not presented as Token Factory measurements. No Token Factory
performance or cost estimate is claimed in this submission text.

Choices that came from running Nemotron:
- Thinking is switched off for every role except `reason`, with `chat_template_kwargs: {"enable_thinking": false}` in the
  request body. With it on, the router took 19 s against a 20 s timeout. With it off, about 1 s. ADK has no extra-body option, so
  the client is subclassed to inject it.
- Strict `response_format: json_schema` was honoured for the quote, claims, invoice and router schemas. A reply that still misses
  its schema gets one retry, told only where and what kind the problems were, never the text it sent.
- Reasoning text is cut from every text part (`<think>…</think>`) before anything parses or shows it, and traces carry ids and
  labels, never model or supplier text.
- Every model call's trace carries its provider, model id and how it was served (`live`, `recorded-fallback`, `abstained`). A
  smoke script (`scripts/dev/nemotron-smoke.ts`) fails unless the Ask ran on the provider it was told to expect. A host test
  (`services/intel/tests/test_nebius_host.py`, 3 tests pass) fails if any role's request leaves for a host other than
  `api.tokenfactory.nebius.com`.

Also: Next.js 16.4.3 for the apps, a long-running worker for watchers, simulated suppliers as three A2A agents, Postgres
LISTEN/NOTIFY for live updates, forward-only SQL migrations (37 of them) with a test suite on an embedded Postgres.

## Challenges

- **Reasoning on by default.** Structured calls missed their deadlines until thinking was switched off per request. A timeout
  looked like a model failure.
- **A model that must cite.** Munim's validator accepts a sentence only if every number is a resolved cell and every outlet it
  names is backed by one of that outlet's cells. The model's first answers failed this often, so Ask got a read index, date
  windows, outlet handles in the run frame, and one refusal that names every broken segment.
- **Making the failure honest.** On 27 Oct the live Ask abstained twice after a database rebuild. The cause was not the code: the
  rebuilt database had kept the seed's default model roles, so the Ask ran on another provider. The smoke now names the provider
  that served the Ask and fails on the wrong one (red-proved).
- **Two demos that were one story.** The invoice (butter) and the negotiation (hazelnuts) were separate. Joining them took an
  upload route that stores the document and mints a run token only core can mint, a cited saving computed in SQL, and a fix so a
  single-outlet purchase order stays valid when the owner of both outlets approves it.
- **Untrusted text.** Supplier replies and invoices are read by a model with no tools, into a schema, and every field is
  checked against the source text.

## Accomplishments

- The One Guarantee holds on the live path. Writes to the books happen only under an approved decision. The AI layer has no
  write grant, and a gate counts refused writes over every tenant table.
- An invoice photo becomes a draft where every figure is a span of the page, and a forged figure withholds the whole draft
  (red-proved).
- A cited saving: the purchase order's saving is a snapshot cell with its reference price beside it, not text a model wrote.
- Every model call is labelled with its provider and model id, and the app shows the model beside the agent on answers,
  findings and drafts.
- Four planted problems on Kosambari found by rules and worded by a model; four of the five checked Ask questions answered on
  Nemotron on 27 Oct (NVIDIA endpoint). Separately, the project owner verified live inference through Nebius Token Factory.

## What we learned

- On Nemotron, whether reasoning runs is the most important setting, and it is not a standard field.
- Strict JSON schema works on Nemotron, including on the vision model, which copied every invoice figure as printed.
- Abstaining is a feature. Most of the work was making the system refuse correctly, not answer more.
- A smoke test that does not name the provider it ran on can pass for the wrong reason. Ours failed once for exactly that.
- Full list for the feedback field: `docs/nebius/FEEDBACK-DRAFT.md`.

## What's next

- The project owner has verified live Token Factory inference. Continue recording provider-specific model, answer-rate, latency
  and cost observations when available; the submission does not attribute NVIDIA-endpoint measurements to Token Factory.
- Read PDF invoices (the one live try ended in a model error and abstained).
- Cite an empty read ("nothing is at risk at Gomti Nagar") and a delivery channel's name, which no read carries today.
- Web price check by Tavily entering as an owner-approved import (see Bonus awards).
- Price the model roles per currency. Roles are priced in rupees only, so a business that budgets in another currency gets no live model yet.

## Bonus awards

**Best Use of Tavily.** Requires "a functional, runtime call to the Tavily API". As of this draft nothing in the committed code
calls Tavily. A client (`services/intel/munim_intel/market/web_price.py`) and an importer for the new `ingredient_price` signal
kind are in progress in the working tree. The design: one search for the negotiated ingredient's market price, whose result
enters only through the signal path as an owner-approved import and shows only as a `market.ingredient_price` cell with its URL
and label; recorded and labelled "recorded" until `TAVILY_API_KEY` exists. This bonus is not claimed in the submission without a live search and a source chip in the demo.

**Most Valuable Feedback.** Use `docs/nebius/FEEDBACK-DRAFT.md` as supporting notes. It distinguishes the verified live Token
Factory application integration from lower-level measurements taken on NVIDIA's separate endpoint. Keep those attributions in
any feedback pasted into Devpost.

## Built with

NVIDIA Nemotron (3.5 Lightning, 3 Super, 3 Ultra, 3.5 Super VL), Nebius Token Factory, Tavily (not claimed), Google ADK, Python,
TypeScript, Hono, Next.js, PostgreSQL, Supabase (hosted Postgres only), A2A.

## Links

- Code: https://github.com/SawhneySatvik/munim-nebius-nvidia (Apache-2.0; set repository visibility to public before submission)
- Product site: https://munim-rho.vercel.app/ (existing public site)
- Interactive demo: https://munim-cobnut.vercel.app/staff/sign-in (existing Cobnut demo; synthetic data, simulated suppliers and payments are recorded, not processed)
- Dedicated Nebius-hosted demo: [NEBIUS_DEMO_URL] (deployment pending; see `docs/nebius/DEPLOY.md`)
- Video: [YOUTUBE_VIDEO_URL] (public YouTube upload pending; final cut must be under 3:00)

[Judge access to the current demo: open the interactive demo URL, choose the synthetic owner, Nandini Mehrotra. The dedicated
Nebius deployment needs a separate live URL and its own model-role verification before it can replace this link.]

---

## Optional project-history draft — verify before using

The rules require this field only if the project existed before 26 August 2026. The Git metadata pointer in this checkout is
broken, so the dates and commit identifiers below cannot be verified from the current workspace. Do not paste this section until
the source history confirms both the project start date and the listed changes. If the project began after 26 August, omit it.

**9 to 18 Oct: the product.** The system of record (orders, kitchen, stock, purchasing, ledgers, rosters, approvals), the
AI service and its agent workflows, deterministic watchers, negotiation with simulated suppliers, and the staff and storefront apps.

**24 Oct: the AI layer moves to NVIDIA Nemotron.**
- The five model roles run on Nemotron through an operator script (`699d1ba`): strict JSON-schema output with think-stripping and
  one budgeted retry, reasoning off except for `reason`, traces that name each call's provider and model id.
- `nebius` joins as a provider (Token Factory's host and its own key), with a database migration for it (`8d9aeeb`, 0036).
- The Ask answer rate on Nemotron: a read index before a skill loads, date windows and outlet handles in the run frame, one
  refusal that names every broken segment, retries through the NVIDIA endpoint's 429 bursts (`a6f3274`, `df2062f`).
- The first half of the hero chain: an invoice photo read live into a draft of page spans, with a forged figure withholding the
  draft (`c2adcd0`).
- Kosambari Kitchens, a second synthetic business with four planted problems (`b0779d7`).
- The staff app shows the model beside the agent on findings and drafts (`5464bbb`, `d5d482e`).
- The public-repo export for this event (`490b9f0`).

**27 Oct: finishing for Token Factory.**
- `nebius` accepted as a model role's provider by the API (`8585fb2`).
- Ask regression found and fixed in configuration: the rebuilt database had kept its seed model-role defaults (`6ca4b37`); the
  smoke names the provider that served the Ask and fails on the wrong one (`db77091`).
- Ask answers name the model that ran them (`28853d9`).
- An owner's approval of a single-outlet purchase order no longer goes stale: approval re-judges each cited snapshot under the
  outlet scope it was gathered with, and refuses an approver who does not cover it (`78e1abb`, `6b42be2`).
- Migration 0037 (`22f5a7e`): the quote comparison carries the reference price and the saving as cells; a new
  `ingredient_price` signal kind; the market templates that must not show it exclude it.
- Next.js 16.4.3 for both Next apps, after the audit flagged 16.4.0 as critical (`2bd40d3`, `0bc9c47`).
- Invoice upload to purchase order on one item (`0ff33df`, fix cycle `5b749dc`): a staff upload stored through the blob port,
  an ingest run token minted only by core, the read by the vision model, a synthetic Lalbagh hazelnut invoice, the negotiation's
  purchase order citing the saving, and the upload screen. The inbox draft page shows the page spans (`208863d`).
- Deploy preparation for a separate Vercel and Supabase pair, with a guard that refuses the existing projects (`b6be750`,
  `babfbaf`).
- The optional Tavily bonus is not claimed in this submission.

**Update, 30 Oct:** the project owner has since tested the application with a working model through Nebius Token Factory. The
earlier measurements listed above remain attributed to NVIDIA's endpoint; this later live test establishes the Token Factory
integration and is not used to relabel those measurements.
