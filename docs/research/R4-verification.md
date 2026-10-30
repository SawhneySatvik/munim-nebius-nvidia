# R4 — Verification research (9 Oct 2026)

Status: research input (Shipyard RULES §1: never overrides the ledger or plan docs). Five read-only
agents, one per angle, 9 Oct 2026. Every claim in §A–§E is `FACT` (URL read), `INFERENCE` or
`UNVERIFIED`; this head section is the orchestrator's synthesis (`INFERENCE` unless marked).
Scope: verify what is load-bearing in the spec and R1–R3, and find what would kill or reshape the plan.

---

## 0 · Kill or reshape — ranked

| # | Finding | Source | Effect on the plan |
|---|---|---|---|
| K1 | **Gemini 2.5 Pro/Flash/Flash-Lite retire on Agent Platform on 20 Oct 2026** — the day after judging opens. 3.6 Flash retires 19 Nov. | §C | Use `gemini-3.8-flash` (top tier; no retirement date posted) and `gemini-3.5-flash-lite` / `gemini-3.1-flash-lite`. Never 2.5. Probe confirms IDs before pinning. |
| K2 | T&C: "exclusively of fresh code **and original assets** created during the official hackathon timeline". Both pixel-office reference repos use third-party sprite packs (one non-commercial). | §A | All back-office art is generated fresh (Gemini/Imagen) with a dated provenance log. `shipyard:art-pipeline` applies. Copy no sprites. |
| K3 | The live URL must work **unattended 19 Oct – 6 Nov** (and to ~4 Dec if shortlisted). No credits. | §A | Seeded demo tenants, a no-signup judge entry, min-instances where cold start hurts, budget alerts, a re-snapshot of the T&C on 17–18 Oct (they changed silently once already). |
| K4 | **Spanner free-trial instance supports Graph** (90 days, 10 GB, one trial per project ever, no backups). The **emulator runs GQL**. Graph requires the **GoogleSQL dialect**. Paid fallback in Mumbai is ~$126/month (not ~$90 — that was Iowa). | §B | Cup graph cost likely $0. Contract tests run offline against emulator + FalkorDB. One graph with `tenant_id` in keys, not a graph per tenant. Create the trial only once the graph schema is settled, in a dedicated project. Trial ends ~8 Jan 2027. |
| K5 | **Pub/Sub → SSE on request-based Cloud Run stalls** (CPU throttled between requests; 60-min request cap). | §C | Candidate amendment to R9: fan SSE out from Postgres `LISTEN/NOTIFY` on the outbox (replay with `Last-Event-ID`); keep Pub/Sub for core → intel. **Founder call** — R9 names Pub/Sub + SSE. |
| K6 | ADK can serve **several A2A agents from one server**, each with its own path and agent card. `to_a2a()` advertises `localhost` unless given the public URL. | §C | Candidate: three simulated suppliers in **one** Cloud Run service (4 services, not 6); negotiation is still a real network call. Touches R7's "separate services" wording — **founder call**. |
| K7 | **Gemini 3.x Flash models have no India data-residency** (US/EU only). | §C | Data at rest stays in `asia-south1`; model calls go to the `global` endpoint (also ~10% cheaper). State this in the security doc. Synthetic data only for the Cup, so no DPDP exposure now. |
| K8 | **A US product, Kit (KitchenSync), already sells "the AI back office for restaurant groups"** (POS + bank + delivery + supplier invoices + accounting, asks before acting, $1,500–7,500/location/month, 400+ locations). India has the pieces sold separately (HelloBooks from ₹499/month: aggregator + bank + GST; TransactIG for enterprise). | §D | Narrow the claim: *no product found that joins all four sources for Indian/Australian 2–5 outlet groups, with drafted actions and tamper-evident books.* Name Kit in the deck as US prior art. Do not copy its wording (rule 4). |
| K9 | Best-evidenced owner pain: **aggregator ad/promo deductions without consent** (Swiggy agreed to refund after a Bengaluru boycott threat, Inc42, 7 Aug 2026). Also a ₹18L UPI-QR swap fraud by a manager. | §D | Lead the leak story with unapproved aggregator deductions; keep the void/QR-swap pattern as a planted problem. |
| K10 | Australia: **Menulog exited 26 Nov 2025**; **card surcharge ban in force from 1 Oct 2026**; Single Touch Payroll + payday super make payroll a regulated product. | §D | AU pack = AUD, GST 10% inclusive, every receipt a valid tax invoice (ABN, "tax invoice", GST amount), IANA time zones, Uber Eats + DoorDash only, no surcharges, roster drafts only — no AU payroll. |
| K11 | Identity Platform multi-tenancy does not fit per-outlet roles; custom claims cap at 1000 bytes and refresh only with the token. | §C | One user pool; outlet membership and roles live in Postgres (the RLS source of truth); at most an `org_id` claim. |
| K12 | Cloud SQL Postgres 16+ defaults to Enterprise Plus (no shared-core). | §C | Create with `--edition=ENTERPRISE --tier=db-f1-micro` (no SLA; fine for a demo). |
| K13 | FalkorDB `latest` is a brand-new Rust engine (v6.0.x, 29 Sep – 8 Oct). | §B | Pin an explicit 4.x tag for dev. |
| K14 | ADK is on **2.11.0** (2 Oct 2026); most tutorials show 1.x. `to_a2a`, `RemoteA2aAgent` and Skills are Experimental. Plugin hooks with a misspelled `_callback` suffix are silently never called. | §C | Pin `google-adk==2.11.0`, `google-genai==2.29.0`, `a2a-sdk` 1.2.x. Red-prove every trace hook (a gate that the hook fired). |

**Nothing found kills the build.** K1–K3 are hard constraints; K5–K6 are amendments only the founder
can make; K8 changes the pitch, not the product.

## 1 · Cost (Cup demo, per month, USD) — `INFERENCE` from §B/§C pricing pages

| Line | Low | Expected |
|---|---:|---:|
| Cloud Run (web, core-api, intel, suppliers), Cloud SQL f1-micro, GCS, Secret Manager, Pub/Sub, Gemini for demos/evals | 15–20 | 55–70 (min-instances=1 on core-api + intel during judging) |
| Spanner Graph | 0 (free trial) | 126 (paid Mumbai, if the trial cannot be used) |
| Gemini Live voice | 0 | ~0.20 per 3-min session; cap sessions ~3 min (cost grows with the square of length) |
| **Total** | **≈ $15–20** | **≈ $55–70, or ≈ $180–200 without the Spanner trial** |

Judging runs 19 Oct – 6 Nov, so budget at least two months.

## 2 · Live-probe debt

No `gcloud` and no Gemini key on this machine. Before STACK.md pins anything, a probe must confirm:
model IDs answering at `global` and `asia-south1` (`gemini-3.8-flash`, `gemini-3.5-flash-lite`,
`gemini-3.1-flash-lite`, the embedding model, `gemini-3.8-live` on a regional endpoint); the Spanner
trial's processing units; composite `(tenant_id, id)` keys in schemaless graph tables; `adk deploy
cloud_run` flag pass-through. §C lists the exact calls.

## 3 · Validation gates and kill criteria (venture-research §3)

**Cup build — by wave, not date:**

| Gate | Passes when | If it fails |
|---|---|---|
| W1 walking skeleton | `make up` works; every service on Cloud Run; one order → event → finding → draft → approval → commit, visible in the back office | Nothing else starts until it passes |
| Demo-story waves | Each of the three stories runs end to end on the live URL against a seeded world | Cut breadth from later waves, never the One Guarantee gates |
| Numbers | Each headline number is produced by CI from the seeded worlds | Ship a qualitative claim; never invent a number |

**After the Cup (product):**

| Gate | Test | Kill / pivot criterion |
|---|---|---|
| T1 interviews | 10 owners of 2–5 outlet groups / cloud kitchens | < 4 of 10 name aggregator or supplier leakage as a top-3 money problem → pivot the wedge |
| T2 data access | Same owners asked to share 1 month of POS export + payout files + bank statement | < 3 of 10 share → the layer can't get data; rethink |
| T3 money found | Run Munim on shared data | < ₹ one month's subscription found in 2 of 3 pilots → kill the "₹ found" pricing promise |
| Budget | ~6 weeks, ~₹50k | — |

---

## §A · Cup rules, IP, office-view reference

Sources read this session: the T&C snapshot `docs/admin/cup-tnc-snapshot-2026-10-09.md` (cited as "T&C L<n>").
Also aibuildercup.com `/`, `/Faqs.html`, `/themes.html` and `/rewards.html`, fetched with curl, tags stripped and quoted from the raw text.
Also `raw/event-details.json` (Hack2skill API snapshot, 16 Sep) and the GitHub API and READMEs.

### Kill or reshape
1. **The "original assets" clause rules out bought or free sprite packs.** `FACT` T&C L23 says *"Submissions must consist exclusively of fresh code and original assets created during the official hackathon timeline."*
   - Both pixel-office references ship third-party art: pixel-agents uses the JIK-A-4 Metro City pack, and Star-Office-UI uses LimeZu art, which is non-commercial.
   - `INFERENCE`: any office or agent visual in Munim needs sprites drawn or generated in-window, with a dated provenance log (prompt, model, date) in the repo.
   - Generating them with Imagen or Gemini also feeds the "Best use of Google Cloud AI tools" prize (USD 2,000).
2. **The live URL must keep working unattended for weeks.** `FACT` aibuildercup.com/ gives the timeline: *"Evaluation Phase Oct 19 - Nov 6, 2026"*, *"Finalists Announcement Nov 7"* and *"Grand Finale … Dec 4, 2026"*. `FACT` from BRIEF.md: no cloud credits.
   - `INFERENCE`: budget GCP and Gemini spend to 6 Nov (4 Dec if shortlisted).
   - Plan for cold starts and Gemini quota, and pre-seed the synthetic data.
   - Give judges a no-login path or a demo account. This is a sequencing item for deploy, not polish.
3. **The T&C have been amended silently at least once.** `FACT` BRIEF.md (written 16 Sep) records the roster close as **4 Oct** "(FAQ + T&C)". Today the T&C L17 and the FAQ both say **11 Oct**, and the API has `registrationEnd 2026-10-11T18:29Z`.
   - BRIEF's "treat as 4 Oct" is stale.
   - `INFERENCE`: re-snapshot the T&C and FAQ on 17–18 Oct and diff before submitting. T&C L10/L36 allow amendment "without prior notice".
4. **The video must be strictly under 3 minutes and show the product working.** `FACT` T&C L24: *"A video demonstration strictly under three (3) minutes in length."* `FACT` themes.html: *"Include a link to a public YouTube or Vimeo video or public Google drive link (3 minutes) showcasing your AI creation in action."*
   - The T&C prevails (L91), so target ≤ 2:55, in English, with a public link.
   - `INFERENCE`: "in action" means live product footage, not slides.
5. **The deck is a PDF with required content.** See Q1 for the sections. Scalability is also scored inside the 40% bucket, so it needs its own slide.
6. **A theme must be chosen and named on the submission (user's decision).** `FACT` themes.html lists six themes. The candidates are:
   - **Retail & Commerce**, which lists *"demand planning, inventory, customer insights"*.
   - **Future of Work & Enterprise Productivity**, which lists *"make decisions, and complete everyday work"*.

   `INFERENCE`: Retail & Commerce is the closer textual fit for restaurant operations, and Future of Work fits an "ops OS" framing. This is an option, not a recommendation to lock.
7. **The themes page carries stale copy from an earlier edition.** `FACT` themes.html: *"Category Specification: Clearly identify the problem statement you are submitting for (Healthcare, Education, Sustainability, Accessibility, Social Good)"* and *"Ensure that your project aligns with the hackathon's focus on social impact."* Neither matches the six themes. `INFERENCE`: ignore the stale lists, obey "clearly identify the problem statement", and note that the T&C prevails (L91).

### Q1. Submission, judging and stack rules (verbatim where load-bearing)
- **Four mandatory artifacts.** `FACT` T&C L24: *"a) A working deployed live URL (on Cloud Run/GCP/Firebase). b) A video demonstration strictly under three (3) minutes in length. c) A public GitHub repository containing the source code. d) A comprehensive presentation deck explaining the solution architecture and business case."*
  - `FACT` FAQ (aibuildercup.com/Faqs.html): *"a working deployed link of your prototype, a video demo under 3 minutes, the public GitHub repository of your prototype and a deck explaining your solution in detail."*
- **Deck format and content.** `FACT` themes.html: *"Submit a compelling vision for your AI solution, highlighting its positive impact and alignment with one of the problem statements in a deck/PPT converted into a PDF. Clearly articulate the problem your solution addresses and how it will benefit the community. Demonstrate the feasibility of your project and its potential for scalability."*
  - Required sections, merged from T&C and themes: problem; theme alignment; solution vision and impact; **architecture**; **business case**; community or user benefit; feasibility; scalability.
  - No slide count, length or template appears on any public page.
- **Language.** `FACT` themes.html: *"All submission materials, including code, documentation, and presentations, must be in English."*
- **Repo.** `FACT`: it must be "public" (T&C L24). No licence requirement appears anywhere.
  - `INFERENCE`: it must be public at submission and should stay public through evaluation.
  - `INFERENCE`: tag a release at the deadline, because commits after 18 Oct could read as post-deadline work.
  - `INFERENCE` on licence choice: the ROFR (Q2) covers an *exclusive* licence, so a permissive open-source licence is non-exclusive and does not trigger it. Leaving the repo unlicensed keeps more rights. This is the user's call.
- **Judging.** `FACT` T&C L38 and themes.html: Technical Merit & Gen AI Implementation **40%**, Problem Alignment & Impact **25%**, Innovation & Creativity **25%**, User Experience & Solution Design **10%**. The sub-criteria, verbatim from themes.html:
  - 40%: *"Meaningful use of Gen AI … Does the use of Gen AI contribute directly to solving the problem"*; *"Technical implementation: Is the solution functional, technically sound"*; *"Scalability & sustainability: … potential for wider adoption, scalability, and future development beyond the prototype stage"*.
  - 25%: *"Problem alignment"*; *"Potential impact: … clear and meaningful value for its intended users"*. T&C L38 adds *"measurable real-world viability"*.
  - 25%: *"Originality & differentiation … meaningful differentiation from existing solutions"*; *"Innovation in the use of Gen AI: … beyond a basic or superficial implementation"*.
  - 10%: *"Usability & accessibility"*; *"Experience & integration: Do the various components, including the Gen AI capabilities, work together cohesively"*.
  - `FACT` T&C L37 and FAQ: a pre-finale scoring round selects the finalists. `FACT` FAQ: *"Judging panel to be announced closer to the Grand Finale."*
- **Fresh-code start date.** `FACT` FAQ: *"Submissions based on pre-existing projects, or work started before the program launch, will not be considered."* `FACT` aibuildercup.com/: *"Registration & Team Formation 1 Sept - 11 Oct"*, *"Prototype Building & Submission 7 Sept - 18 Oct, 2026"*. `FACT` API: `submissionStart 2026-09-07T08:30Z` (14:00 IST) and `submissionEnd 2026-10-18T18:29Z` (23:59 IST).
  - "Official launch" is never defined. `INFERENCE`: it is 1 Sep at the earliest and 7 Sep at the latest.
  - It does not matter here: `FACT` the oldest foodops-os files are dated 4 Oct 2026 (`stat` birth time).
- **Third-party open-source databases and SaaS.** `FACT`: no clause bans them. The stack test is "primarily": *"built primarily using the Google Cloud tech stack … Solutions built primarily on competing cloud infrastructure will be deemed ineligible"* (T&C L22). The FAQ says *"Solutions built primarily on other cloud platforms will not be eligible for evaluation."*
  - `FACT` themes.html: *"all submissions must leverage Google AI models (like Gemini or Gemma) or be built using agentic platforms (such as Agent Platform, Antigravity, or AI Studio), and they must be deployed on Google Cloud via Cloud Run or Firebase."*
  - Commercial-availability risk. `FACT` T&C L67: *"Should the right from identified third party right owners not be commercially available, the result may not be qualified to win the prize."*
  - `INFERENCE`: self-hosted FalkorDB on GCE is permitted. So is a third-party SaaS that is not "infrastructure", but each one dilutes "Google Cloud architectural depth" (40%).
  - `INFERENCE`: "exclusively of fresh code" (L23), read literally, would bar npm or pip dependencies. The common reading lets you use libraries but not your own earlier code or assets. **UNVERIFIED**; no clarifying FAQ exists.
- **Editing after submit.** Not stated on any public page. **UNVERIFIED**.
- **AI-generated code.** No rule either way. `INFERENCE`: AI-assisted building is contemplated, because themes.html names Antigravity (Google's agentic IDE) as an accepted platform. The only tension is T&C L78, *"Participant represents and warrants that he or she is the sole author and copyright owner of the Submission"*.
- **Simulated-data disclosure.** No direct rule. The nearest hooks are:
  - T&C L71: *"will not publish falsehoods or misrepresentations that could damage the Organiser, its sponsors, or any third party"*.
  - The "measurable real-world viability" criterion.

  `INFERENCE`: CLAUDE.md rule 5 (label simulated data plainly) is consistent with both and costs nothing.
- **Operational rule.** `FACT` T&C L44: *"Participants are not permitted to leave the online communication platform and Hackathon Dashboard once the Hackathon officially begins."* Do not leave the Discord or the dashboard.
- **Prizes.** `FACT` rewards.html: Winner USD 10,000; 1st runner-up USD 7,000; 2nd runner-up USD 5,000; Best use of Google Cloud AI tools, Most Impactful Solution, Social Choice Award and Best UI/UX at USD 2,000 each. The "total cash prize pool" shows "USD 0", a page bug; the homepage says USD 30,000.

### Q2. Who the "Organiser" is for IP purposes
- `FACT` T&C L8: *"organized by Hack2skill ("Organizer")"*. The defined term is spelled "Organizer" while the body uses "Organiser". `INFERENCE`: the spelling split is cosmetic.
- `FACT` aibuildercup.com/ disclaimer: *"organized by Hack2skill and sponsored by Google Cloud. This program is independently operated by Hack2skill and is not directly administered by Google Cloud."*
- The **ROFR** (T&C L65) runs to "the Organiser", which means **Hack2skill, not Google**. It covers "acquisition of any exclusive license", lasts 6 months after the Hackathon concludes, and gives a 30-day matching window.
  - `INFERENCE`: when the Hackathon "concludes" is undefined. It is plausibly the 4 Dec finale, which would put the ROFR end around early June 2027.
- The **publication right** (T&C L66) is a separate grant. It is perpetual and worldwide, also to the Organiser, over "the submitted ideas".
- The **marketing licence** (T&C L76) goes to *"the Hackathon and its sponsors, their respective affiliates … third-party contractors"*. That includes Google Cloud. It is non-exclusive, perpetual, irrevocable and sublicensable.
- **"Company" is never defined.** It appears in T&C L12, L28 and L89 ("Organizer/Company"). `INFERENCE`: it most plausibly means Google Cloud. It does not change the ROFR reading, because the ROFR names only the Organiser.
- Net: nothing found changes the existing ROFR reading. The only refinement is that the counterparty is Hack2skill.

### Q3. "AI agents as pixel-art office workers": reference repos (ideas only, copy nothing)
**Ranked by fit to Munim, not by stars.**

1. **pixel-agents.** https://github.com/pixel-agents-hq/pixel-agents (`pablodelucca/pixel-agents` redirects here).
   - `FACT` (GitHub API): 9,604 stars, MIT, created 8 Feb 2026, active today. This is the viral one: a VS Code extension plus `npx pixel-agents`.
   - `FACT` (README) **Art:** a top-down pixel office; 6 characters "based on … JIK-A-4, Metro City" (third-party pack); furniture and pets; a 64×64-tile layout editor with named "Areas".
   - `FACT` (README) **Behaviour:**
     - Each agent "walk[s] to their desks, sit[s] down, type[s] when they're editing files, read[s] when they're searching, and flag[s] you visually when they're stuck waiting for input".
     - Speech bubbles appear for waiting or permission.
     - Optional chimes play on finish or permission.
     - Sub-agents and teammates appear as separate characters.
   - `FACT` (README) **Binding:**
     - Claude Code hooks (`SessionStart`, `PreToolUse`, `PermissionRequest`, `Stop`) are pushed to a local server.
     - A JSONL transcript scan is the fallback.
     - Both are normalised into a typed `AgentEvent`, then fed to `AgentRuntime`, then a state store, then typed messages, then a React webview.
     - Rendering is Canvas 2D "with pathfinding and character state machines". An agent-agnostic `HookProvider` interface is the integration boundary.
   - `INFERENCE` for Munim: the `PermissionRequest` bubble maps one-to-one onto "proposal awaiting owner approval". The core pattern is typed agent events, then per-agent state, then sprite animation. The UI could also show the refusal and citation as bubble content.
2. **Star-Office-UI.** https://github.com/ringhyacinth/Star-Office-UI
   - `FACT` (GitHub API and README): 7,500 stars, created 26 Feb 2026. Code is MIT; README: *"美术资产：禁止商用"* (art: no commercial use).
   - Built for OpenClaw.
   - It has 6 states (`idle/writing/researching/executing/syncing/error`), each mapped to a different office **zone**; the character walks there and shows animation plus a bubble.
   - A "yesterday's notes" card is built from `memory/*.md`.
   - Other agents join through a join key.
   - Binding is **plain HTTP push** of state (`set_state.py writing "…"`), backed by Python/Flask.
   - An optional **Gemini API** call generates office backgrounds.
   - `INFERENCE`: this is the simplest binding pattern, state pushed to zones. The Gemini-generated decor is a fit for the Google prize.
3. **AI Town.** https://github.com/a16z-infra/ai-town
   - `FACT`: 10,605 stars, MIT, 2023. It is a Convex-backed simulation of "generative agents" socialising in a pixel town.
   - `INFERENCE`: it is a social sim, not agent observability. It is the weakest fit and is useful only for walking and conversation-bubble ideas.
- `FACT`: a GitHub search also turned up many small clones of the above (`Star-Office-UI-Node`, `agent-office`, `pixel-office-openclaw`), each under 25 stars. They are noise.

### Could not verify
- The **logged-in Hack2skill dashboard / submission form** was not reached. It is the only likely source for three things:
  - whether a submission can be **edited after submit**;
  - any **deck template** or slide limit;
  - the exact form fields, such as the theme dropdown or a separate architecture upload.

  **Action:** open the submission form and screenshot it.
- The **official livestream** (youtube.com/watch?v=mhDd6qSBMg4) was not re-checked; yt-dlp is unavailable. Its "you own full ownership" line rests on BRIEF.md only. The **Discord** was not read.
- Whether the live API `registrationEnd` still reads 11 Oct; only the 16 Sep JSON was read.
- The JIK-A-4 and LimeZu asset licences (moot, since external art is out under L23).
- Whether "fresh code" excludes open-source libraries; no official clarification was found.

---

## §B · Spanner Graph and FalkorDB

Labels: FACT (URL read this session) · INFERENCE (basis stated) · UNVERIFIED. Prices are USD list prices, read from the pricing page HTML on 9 Oct 2026.

### Kill or reshape
1. **The Spanner emulator runs GQL, so local tests and CI cost $0.** The emulator README puts "GQL support" under "Notable supported features". FACT: https://github.com/GoogleCloudPlatform/cloud-spanner-emulator/blob/master/README.md. Release notes add PropertyGraph in v1.5.30 (2025-03-12) and dynamic label/properties (schemaless) in v1.5.40 (2025-08-11). The latest is v1.5.58 (2026-09-15). FACT: https://github.com/GoogleCloudPlatform/cloud-spanner-emulator/releases. A Dec 2025 forum reply says the emulator has no Graph/GQL support; the README and releases contradict it. https://discuss.google.dev/t/spanner-graph-gql-support-in-spanner-emulator/293954. **Reshape:** run the contract suite against the emulator plus FalkorDB in CI and never touch a paid instance for tests. INFERENCE: the emulator alone could replace FalkorDB for dev. That is your call; it would drop one adapter.
2. **"$1.23/node-hour, ≈$90/month" is the Iowa (us-central1) price, not India's.** Enterprise per node-hour: us-central1 $1.23, asia-south1 Mumbai $1.722, asia-south2 Delhi $1.722, asia-southeast1 Singapore $1.40712. The page shows Mumbai Enterprise at $1257.06/month per node. FACT: https://cloud.google.com/spanner/pricing. At 100 PU (0.1 node) × 730 h that is INFERENCE ≈ **Mumbai $125.7/mo ($4.13/day)**, Singapore $102.7/mo, Iowa $89.8/mo. Billing has a 1-hour minimum, then is prorated (FACT, same page).
3. **The free-trial instance supports Graph, so the Cup can likely run at $0 compute.** Read the trial limits before relying on it (§1). It is one trial per project for life: delete it by mistake and you cannot recreate it in that project. Create it in a dedicated project, and only once the schema is final on the emulator.
4. **Spanner Graph is GoogleSQL-dialect only.** Toolbox doc: "Spanner Graph isn't available in the PostgreSQL dialect." FACT: https://github.com/googleapis/mcp-toolbox/blob/main/docs/en/integrations/spanner/tools/spanner-list-graphs.md. Postgres stays canonical in Cloud SQL or wherever it lives; the Spanner projection database must be created as GoogleSQL.
5. **Use one static graph with the tenant in the key, not a graph per tenant.** That avoids minutes of DDL every time a tenant is onboarded (§2, §4).
6. **FalkorDB `latest` is now a brand-new Rust engine.** v6.0.0 shipped 2026-09-29 and v6.0.2 on 2026-10-08. Pin an explicit image tag (§5).

### 1. Spanner Graph: edition, price, free trial
- Edition: "This feature is available with the Spanner Enterprise edition and Enterprise Plus edition." It is not in Standard. FACT: https://docs.cloud.google.com/spanner/docs/graph/overview and https://docs.cloud.google.com/spanner/docs/editions-overview
- Minimum size: "100 processing units or one node (1000 processing units)" (FACT, editions page). Billing is per node-hour pro-rata, e.g. "200 processing units × 6 hours ÷ 1000" = 1.2 node-hours (FACT, pricing page).
- Storage, SSD including all 3 replicas: Mumbai $0.42/GiB-month, Singapore $0.3432, Iowa $0.30 (FACT, pricing page). At a few MB per tenant this rounds to $0.00 (INFERENCE).
- Free trial instance. FACT from https://docs.cloud.google.com/spanner/docs/free-trial-instance plus the pricing page:
  - Lasts 90 days. Up to 10 GB storage. "up to 500 queries per second (QPS) of reads or 100 QPS of writes". Max 5 databases.
  - Supports "Spanner Standard edition features and Spanner Graph", plus vector and full-text search. Data Boost and the graph algorithms that depend on it are not available.
  - Available in all regional configs (so asia-south1 works), but not dual-region or multi-region.
  - "One free trial instance allowed per project lifecycle"; max 5 per billing account. An active billing account is required.
  - Cannot be resized. No backup/restore, no CMEK, no SLA. The docs say: "We don't recommend running production applications" in it.
  - At expiry: "the instance stops serving requests and enters a 30-day grace period". If it is not upgraded, "the instance, along with the data in it, is deleted". An upgrade defaults to Enterprise edition.
  - The trial sits on top of the $300 new-customer credit (FACT, pricing page).
- Timeline: an instance created around 10 Oct stops serving around 8 Jan 2027 and is deleted around 7 Feb 2027 (INFERENCE: date arithmetic). Whether the Cup judging and any IP right-of-first-refusal demo window ends before then is UNVERIFIED.
- Cloud Run access: nothing in the trial doc forbids it. It uses the normal Spanner API with a service account that has `roles/spanner.databaseUser` (INFERENCE: same API surface; no explicit statement found).
- Fallback if the trial is unusable: a paid Enterprise 100 PU instance in Mumbai at ~$4.13/day. Over 10–18 Oct (~9 days) that is ≈ $37, then ≈ $126 per month kept alive (INFERENCE from FACT rates). Delete it after judging.

### 2. Query language, schema, multi-tenancy
- GQL: "The ISO GQL interface offers a familiar, purpose-built graph experience that's based on open standards." FACT (overview page). Queries take the form `GRAPH g MATCH ... RETURN ...` with `@param` parameters. Quantified paths use `-[e:Transfers]->{1,3}`, where `e` becomes an array (`ARRAY_LENGTH(e)`). Path prefixes are `ANY`, `ANY SHORTEST` and `ANY CHEAPEST`. FACT: https://docs.cloud.google.com/spanner/docs/graph/queries-overview
- Defining the graph: `CREATE [OR REPLACE] PROPERTY GRAPH g NODE TABLES (T KEY(..) LABEL .. PROPERTIES(..)) EDGE TABLES (E SOURCE KEY(..) REFERENCES N(..) DESTINATION KEY(..) REFERENCES N(..))`. Rows with a null element key are ignored. Spanner blocks schema changes that would break a table the graph depends on. Interleaving edges into the source node table is "critical for graph query performance". FACT: https://docs.cloud.google.com/spanner/docs/graph/schema-overview and https://docs.cloud.google.com/spanner/docs/graph/set-up
- Schemaless model (fits a projector best). One `GraphNode(id, label STRING, properties JSON)` table and one `GraphEdge(id, dest_id, edge_id, label, properties)` table, with `PRIMARY KEY (id, dest_id, edge_id), INTERLEAVE IN PARENT GraphNode`. The graph uses `DYNAMIC LABEL (label) DYNAMIC PROPERTIES (properties)`. Constraints: only one node table and one edge table per graph; labels and property names must be lowercase; only top-level JSON keys become properties. FACT: https://docs.cloud.google.com/spanner/docs/graph/manage-schemaless-data
- Reverse traversal (ingredient ← supplier): add a secondary index on the edge table interleaved in the destination node table. Use informational foreign keys if enforced ones slow writes. FACT: https://docs.cloud.google.com/spanner/docs/graph/best-practices-designing-schema
- Limits: 250 property graphs per database; 5,000 tables per database; 10 databases per 100 PU (100 at ≥1 node); interleave depth 7; "Joins produced by a graph query" capped at 100. FACT: https://docs.cloud.google.com/spanner/quotas
- Multi-tenancy recommendation (INFERENCE):
  - Use one graph. Put `tenant_id` as the leading primary-key column on both tables, `SOURCE KEY (tenant_id,id) REFERENCES GraphNode(tenant_id,id)`, and filter every template on `@tenant`.
  - A graph per tenant means DDL per tenant (minutes) plus, in the schemaless model, a node and edge table pair per tenant, which walks into the 250/5,000 caps.
  - UNVERIFIED: whether composite keys are accepted on DYNAMIC LABEL tables. One doc summary described the node key as a single `id`. Test it on the emulator first. If it fails, use a string id of the form `"{tenant}/{entity}"` and a key-range on that prefix.

### 3. Python, agent integrations, emulator
- `google-cloud-spanner` 3.71.0, released 2026-09-03, Python ≥3.10. FACT: https://pypi.org/project/google-cloud-spanner/
- GQL runs through the ordinary `database.snapshot().execute_sql("GRAPH g MATCH ...")` call. Writes go through `database.batch()` / table mutations; there is no graph DML. FACT: set-up page. The changelog includes "Support GRAPH and pipe syntax in dbapi". FACT: https://github.com/googleapis/python-spanner/blob/main/CHANGELOG.md. The exact `params=` / `param_types=` usage for GQL was not read: UNVERIFIED, but it is the standard execute_sql signature (INFERENCE).
- Async: the changelog shows only the low-level GAPIC `SpannerAsyncClient`. The high-level Database API is sync, so wrap it in `asyncio.to_thread` (INFERENCE).
- ADK: `SpannerToolset` needs ADK Python ≥1.11.0. Its tools are list_table_names, list_table_indexes, list_table_index_columns, list_named_schemas, get_table_schema, execute_sql, similarity_search and vector_store_similarity_search; `Capabilities.DATA_READ` restricts it to reads. It has **no graph-specific tool**. FACT: https://adk.dev/integrations/spanner/. Current google-adk is 2.11.0 (FACT, PyPI).
- MCP Toolbox: has `spanner-list-graphs` (read-only schema introspection) and `spanner-sql` with a `readOnly` flag that runs the statement in a read-only transaction. FACT: https://github.com/googleapis/mcp-toolbox/blob/main/docs/en/integrations/spanner/tools/spanner-sql.md. Whether `spanner-sql` accepts a `GRAPH … MATCH` statement is UNVERIFIED.
- LangChain: `langchain-google-spanner` 0.10.0 (2026-07-21) ships `SpannerGraphStore` and `SpannerGraphQAChain`. FACT: https://github.com/googleapis/langchain-google-spanner-python/blob/main/README.rst
- **Product-rule note** (INFERENCE): ADK `execute_sql` and Toolbox free-form SQL let an agent write arbitrary queries and skip the Graph port. That conflicts with "agents read through typed tools". Expose the 5 port templates as your own FunctionTools instead, and do not hand agents `SpannerToolset`.
- Emulator: `docker run -p 9010:9010 -p 9020:9020 gcr.io/cloud-spanner-emulator/emulator:<ver>` (FACT, README). Pin ≥1.5.54 so the schemaless and property-graph fixes are included (INFERENCE from the release notes). It does not emulate IAM, query plans or performance (FACT: https://docs.cloud.google.com/spanner/docs/emulator). Whether the emulator enforces editions is UNVERIFIED (assumption: it does not).

### 4. Feasibility this week (INFERENCE: one builder, emulator-first)
- Estimate: about 1.5–2.5 focused days for the Spanner adapter.
  - DDL (schemaless plus tenant key plus reverse index): 2 h.
  - Projector: tenant delete-range, then chunked `insert_or_update` keyed by claim id (edge_id = claim id): 3–4 h.
  - 5 GQL templates: 3–4 h.
  - Contract suite on the emulator: 3 h.
  - Real instance, IAM and a Cloud Run smoke test: 2 h.
  - Add a day if composite keys or JSON-property filtering fight back.
- Gotchas (FACT unless marked):
  - **Mutation limits:** 80,000 mutations per commit and 100 MiB per commit. Inserts and updates count one mutation per column touched, primary-key columns included; a delete or delete-range counts as 1 (https://docs.cloud.google.com/spanner/quotas). INFERENCE: 5k nodes × 5 columns plus 10k edges × 7 columns ≈ 95k, so a full tenant rebuild in one commit fails. Chunk at about 2k rows.
  - **DDL latency:** schema updates are long-running operations taking "minutes"; index builds take "minutes to hours". Reads and writes continue while they run. FACT: https://docs.cloud.google.com/spanner/docs/schema-updates. Keep DDL out of the request path.
  - **JSON dynamic properties:** comparisons may need explicit casts in WHERE clauses (UNVERIFIED). Lowercase all labels and keys in both adapters, or the fixtures will diverge.
  - **Minimum size and trial limits:** compute cannot go below 100 PU, and the trial cannot be resized. 100 PU caps storage and throughput, but a few MB per tenant is far below any cap (INFERENCE).

### 5. FalkorDB (dev only)
- Client: `falkordb` 1.7.1 (2026-08-13), Python ≥3.10, MIT licence, depends on `redis>=8,<9`. Async uses `from falkordb.asyncio import FalkorDB` with a redis asyncio pool. It has `ro_query` for read-only queries. FACT: https://pypi.org/project/falkordb/
- Server:
  - Image: `docker run -p 6379:6379 falkordb/falkordb` (FACT, PyPI readme). The tags `latest` and `6.0.2` were both updated 2026-10-08 (FACT: Docker Hub tags API).
  - 6.0 is "the first release of the new FalkorDB engine, written in Rust", with the "same GRAPH.* commands, the same Cypher". The 4.x line is still shipping (v4.22.0, 2026-09-30). FACT: https://github.com/FalkorDB/FalkorDB/releases
  - Pin `falkordb/falkordb:4.22.0` for stability, or `6.0.2` deliberately (INFERENCE).
- Multi-graph:
  - Each graph is its own key, and each query targets one graph key. FalkorDB claims "over 10,000 isolated graphs per deployment"; its benchmark ran "629 isolated graphs on one node".
  - Per-graph overhead is not quantified: "Adding more graphs increases memory usage and snapshot duration".
  - Source: FACT (vendor blog) https://www.falkordb.com/news-updates/multigraph-topology-isolation-linear-scale/
- Config knobs:
  - Settable at runtime through `GRAPH.CONFIG SET`: `TIMEOUT_DEFAULT`, `TIMEOUT_MAX`, `QUERY_MEM_CAPACITY`, `MAX_QUEUED_QUERIES`, `RESULTSET_SIZE`. `THREAD_COUNT` and `CACHE_SIZE` are load-time only.
  - In Docker, set them through the `FALKORDB_ARGS` env var. Runtime changes are not persisted.
  - `TIMEOUT` is deprecated; use `TIMEOUT_DEFAULT` / `TIMEOUT_MAX`.
  - Sources: FACT https://docs.falkordb.com/getting-started/configuration.html and the v6.0.0 release notes.
  - `GRAPH.QUERY g "q" [timeout ms]` takes a per-query timeout. FACT: https://docs.falkordb.com/commands/graph.query.html
- Licence:
  - The server is SSPLv1 (FACT: https://github.com/FalkorDB/FalkorDB/blob/master/LICENSE.txt).
  - FAQ: "If you're using FalkorDB for internal purposes only ... you are not required to open-source your code". But "if your application provides FalkorDB as a service to users ... you must open-source the code that enables this service". FACT: https://docs.falkordb.com/references/license
  - INFERENCE, not legal advice: this does not affect the submission, because FalkorDB is dev-only and nothing deployed uses it. For a future SaaS, the FAQ's wording is ambiguous about a backend graph that end users query indirectly; get a commercial licence or keep Spanner in prod.
  - Do not use FalkorDB Cloud for anything submitted (rule 2).

### 6. One contract suite for both adapters
- Yes, at the **port boundary** (INFERENCE). Load the same fixture events through each adapter's projector, call the same 5 port methods, and assert identical domain objects (sorted, lowercased, with claim ids as evidence). Query text is per adapter; no shared query strings.
- Concrete syntax differences (FACT: https://docs.cloud.google.com/spanner/docs/graph/opencypher-reference, https://docs.falkordb.com/cypher/match.html, https://docs.falkordb.com/cypher/index.html):

| Feature | FalkorDB (Cypher) | Spanner (GQL) |
|---|---|---|
| Graph selection | key is the graph: `GRAPH.QUERY tenant_x "MATCH …"` | `GRAPH munim MATCH …`, with a tenant filter inside |
| Variable-length path | `-[:SUPPLIES*1..3]->` | `-[e:supplies]->{1,3}`; `e` is an array |
| Parameters | `$p`, sent as a `CYPHER p=…` prefix by the client | `@p` |
| Writes | `CREATE` / `MERGE` | none in GQL; use table mutations or DML |
| Aggregation | `collect(x)` | `ARRAY_AGG(x)` |
| List expansion | `UNWIND` | `FOR x IN arr` |
| RETURN | expressions need no alias | complex expressions need an alias |
| Not supported in Spanner | n/a | `CALL … YIELD`, `MANDATORY MATCH`, bracket property access |

- Tenant isolation differs by adapter. FalkorDB isolates by graph key; Spanner isolates by a tenant column in the key. Add one contract test per adapter proving that tenant A's query returns 0 of tenant B's rows; red-prove it by deliberately dropping the filter.

### Could not verify
- Processing units of the free-trial instance (the doc gives no figure), and whether Cup judging and demo windows end before expiry (~8 Jan 2027).
- Whether composite (tenant_id, id) keys work with DYNAMIC LABEL tables; whether JSON dynamic-property predicates need casts; whether `OPTIONAL MATCH` behaves the same on both engines.
- Whether MCP Toolbox `spanner-sql` accepts GQL statements; the exact Python `params`/`param_types` usage for GQL (not read).
- Whether the emulator enforces the Enterprise edition requirement.
- FalkorDB per-graph memory overhead (vendor gives no number); 6.0 Rust-engine stability (9 days old).
- Not reached: a Google Cloud Pricing Calculator check. All prices come from the public pricing page HTML; I did not confirm them against the billing account's SKUs.

---

## §C · ADK, A2A, Gemini, GCP cost and auth

Labels: FACT (URL read 2026-10-09) · INFERENCE (basis given) · UNVERIFIED. All versions were seen 2026-10-09.

### Kill or reshape (read first)
1. **Do not use any `gemini-2.5-*` ID.** gemini-2.5-pro, gemini-2.5-flash and gemini-2.5-flash-lite **retire 20 Oct 2026** on Agent Platform, the day after judging opens. gemini-3.6-flash retires 19 Nov 2026. FACT: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions?hl=en (page last updated 2026-10-07). Use `gemini-3.8-flash`, `gemini-3.5-flash-lite` or `gemini-3.1-flash-lite` (both available until at least May/Jul 2027). 3.8 Flash is in the "short-term" class, which promises at least 45 days' notice before retirement. No date had been posted as of 7 Oct, so it cannot retire before late November, after judging ends. The only Pro is `gemini-3.1-pro-preview`, so treat Flash as the top tier and use Pro only behind a flag.
2. **"Vertex AI" is now "Gemini Enterprise Agent Platform"** FACT: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models (redirects to the new docs). The docs now say "Agent Runtime" where the old name was Agent Engine; that this is a straight rename is INFERENCE. The CLI and URIs still use the old names: `adk deploy agent_engine`, `agentengine://` and `reasoningEngines`. The env var is `GOOGLE_GENAI_USE_ENTERPRISE=true`; the legacy `GOOGLE_GENAI_USE_VERTEXAI` is still read, and ENTERPRISE wins if they conflict. FACT: python-genai `_api_client.py` L675-694 (main). Most tutorials and model memory describe ADK 1.x with Vertex naming.
3. **ADK is on 2.x.** It is at 2.11.0 (2 Oct 2026); 2.0.0 shipped 19 May 2026. FACT: https://pypi.org/project/google-adk/. Pin `google-adk==2.11.0`. 2.x added graph and dynamic workflows (FACT: https://adk.dev/workflows/). Breaking change: `InMemorySessionService` now raises on a missing session, so create the session before `run_async`. FACT: https://github.com/google/adk-python/releases.
4. **Cloud SQL edition trap.** For PostgreSQL 16+ the default edition is Enterprise Plus, which has no shared-core tier. FACT: https://docs.cloud.google.com/sql/docs/postgres/editions-intro. Create with `--edition=ENTERPRISE --tier=db-f1-micro` (or db-g1-small). Shared-core is not covered by the SLA. FACT: https://cloud.google.com/sql/pricing.
5. **SSE plus Pub/Sub on request-based Cloud Run.** After a request ends, CPU is "disabled or severely limited", and background work needs instance-based billing. FACT: https://docs.cloud.google.com/run/docs/tips/general. The maximum request timeout is 60 min. FACT: https://docs.cloud.google.com/run/docs/configuring/request-timeout.
   - Consequences (INFERENCE): a background Pub/Sub pull in core-api stalls when no request is open. A push to one instance cannot reach SSE clients held by another instance. Every open SSE tab bills core-api as active time.
   - Options: (a) give the SSE service instance-based billing with max-instances=1 at demo scale; (b) open one Pub/Sub streaming pull per SSE connection, inside that request; (c) replace Pub/Sub with Postgres LISTEN/NOTIFY from the outbox (simplest, still all-GCP).
   - Cost of (a): instance-based billing is $0.000018/vCPU-s and $0.000002/GiB-s for every second the instance lives, which is about **$50/mo** for 1 vCPU/512 MiB around the clock (FACT rates: run pricing page). (b) and (c) work under request-based billing, because the subscriber or LISTEN connection lives inside the open SSE request.
   - **Recommendation: (c).** Run one LISTEN connection per instance, fan it out in-process, and replay missed events from the outbox using the client's `Last-Event-ID`. The client must also reconnect at least every 60 min.
6. **Merge the 3 supplier agents into one Cloud Run service.** `adk api_server --a2a` "enables multi-agent hosting from a single server". FACT: https://adk.dev/a2a/quickstart-exposing/. Each supplier keeps its own A2A path and agent card. INFERENCE: this takes 6 services down to 4, which means fewer deploys, cold starts and min-instance bills. The demo can still say "3 separate A2A agents" because the protocol boundary is the same.
7. **`to_a2a()` defaults to `host="localhost", protocol="http", port=8000`.** On Cloud Run the generated card would advertise localhost. Pass the public https host and port 443, or a custom `agent_card`. FACT (signature): https://adk.dev/a2a/quickstart-exposing/. Both `to_a2a` and `RemoteA2aAgent` are marked **Experimental**.
8. **Gemini 3.8 Flash has no India-residency endpoint.** The table gives it US/EU only. The same holds for 3.7/3.6 Flash, 3.5/3.1 Flash-Lite, embedding-2 and the 2.5 Live native-audio model. India is ticked only for gemini-3.5-flash and gemini-2.5-flash (128k), and the latter is retiring. FACT (parsed table): https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency?hl=en
   - Recommendation: run Cloud Run in asia-south1 and call text models with `location="global"`, which is 10% cheaper. Caveat (INFERENCE): a residency table is not an availability list, so the probe in §5 decides.
9. **Identity Platform tenants do not fit per-outlet roles.**
   - Each tenant is a separate user pool, and `auth.tenantId` must be set before sign-in. FACT: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication
   - Claims are capped at 1000 bytes and change only when the token refreshes. FACT: https://firebase.google.com/docs/auth/admin/custom-claims
   - Reshape (INFERENCE): one project-level user pool with no tenants. `outlet_membership(user, outlet, role)` in Postgres is the source of truth; at most an `org_id` claim.

### 1. ADK Python: versions, composition, skills, sessions
- FACT google-adk **2.11.0** (2026-10-02), requires Python ≥3.10. 2.x is the only active line, and 2.0.0 shipped 2026-05-19. Source: https://pypi.org/pypi/google-adk/json
- FACT: release notes for 2.9–2.11 list `FallbackModel` (model failover), `abort_signal` cancellation, `RequestInput` tool confirmation in workflows, skill lifecycle with ephemeral modes, and eval metrics for duration, tokens and call counts. Source: https://github.com/google/adk-python/releases
- FACT `ParallelAgent` "initiates the `run_async()` method of each sub-agent … concurrently". There is "no automatic sharing of conversation history or state between these branches." Results are combined by having each branch write `output_key` into session state; a following agent in a `SequentialAgent` then merges them through `{key}` templating. Source: https://adk.dev/agents/workflow-agents/parallel-agents/
- FACT: other building blocks are `SequentialAgent`, `LoopAgent` and `LlmAgent(sub_agents=[…])`, which routes through a `transfer_to_agent` tool; `AgentTool` lives in `tools/agent_tool.py`. 2.x adds graph, dynamic and collaborative workflows. Sources: https://adk.dev/workflows/ and the repo tree at v2.11.0.
- INFERENCE (fan-out): a router `LlmAgent` hands deep questions to a `SequentialAgent[ParallelAgent[specialists…], merger]` wrapped as an `AgentTool`. The router then gets one merged result back and keeps control, instead of transferring away.
- FACT **Skills** are real and still **Experimental**. They arrived in Python v1.25.0 and are loaded through `SkillToolset`, from a directory (`load_skill_from_dir`) or inline (`models.Skill`), following the SKILL.md L1/L2/L3 structure. Source: https://adk.dev/skills/
- FACT: the toolset's own tools are `list_skills`, `search_skills`, `load_skill`, `unload_skill`, `load_skill_resource` and `run_skill_script`, and lifecycle modes include `EPHEMERAL`. Source: `src/google/adk/tools/skill_toolset.py` L75-80, L112-130 at tag v2.11.0.
- INFERENCE: a skill load is an ordinary tool call, so it already shows up as a function_call event and in `before_tool_callback`. No special hook is needed to trace it.
- FACT **Sessions:**
  - `InMemorySessionService` is for development only.
  - `DatabaseSessionService` supports Postgres, MySQL and SQLite with async drivers (`postgresql+asyncpg://…`) and needs `pip install google-adk[db]`.
  - `VertexAiSessionService` is "recommended for production on Google Cloud" but needs an Agent Runtime resource and `[gcp]`.
  - Source: https://adk.dev/sessions/session/
  - The 2.11 source tree also has `sqlite_session_service.py`, Firestore and Redis session services, and memory services (InMemory, SQLite, Vertex RAG, Firestore).
- FACT: `DatabaseSessionService` runs `metadata.create_all`. A schema change in v1.22.0 required a migration, and the service has a schema check. Source: `database_session_service.py` L66, L272 (v2.11.0) and the sessions doc.
- **Recommendation:** use DatabaseSessionService against a **separate database** (`adk_sessions`) on the same Cloud SQL instance, so ADK's `create_all` never touches core's schema-as-contract. INFERENCE.

### 2. Events, callbacks, plugins, tracing → back-office trace events
- FACT **Event fields:** `author`, `invocation_id`, `id`, `timestamp`, `branch`, `content`, `partial`, `turn_complete`, `long_running_tool_ids`. `actions` holds `state_delta`, `artifact_delta`, `transfer_to_agent`, `escalate` and `skip_summarization`. Helper methods are `get_function_calls()`, `get_function_responses()` and `is_final_response()`. You consume the stream by iterating `runner.run_async()`. Source: https://adk.dev/events/
- FACT **Plugin hooks.** Exact `async def` names in `plugins/base_plugin.py` at v2.11.0: `on_user_message_callback`, `before_run_callback`, `on_event_callback`, `after_run_callback`, `before_agent_callback`, `after_agent_callback`, `before_model_callback`, `after_model_callback`, `on_model_error_callback`, `before_tool_callback`, `after_tool_callback`, `on_tool_error_callback`, `on_agent_error_callback` and `on_run_error_callback`.
  - A hook spelled without the `_callback` suffix is silently never called.
  - Plugins are registered with `App(plugins=[…])`, run before agent callbacks, and can short-circuit (https://adk.dev/plugins/).
  - Agent-level kwargs (FACT, `llm_agent.py` and `base_agent.py`): `before/after_agent_callback`, `before/after_model_callback`, `on_model_error_callback`, `before/after_tool_callback` and `on_tool_error_callback`.
  - Prebuilt plugins include Logging, Debug Logging, BigQuery Analytics, Model Armor, Reflect-and-Retry and Auto Tracing.
  - Source: https://adk.dev/plugins/
- INFERENCE (mapping to trace events):
  - one `TraceEmitterPlugin` maps hooks to events: `before_agent_callback` → "agent.enter", `transfer_to_agent` → "route", `load_skill` tool call → "skill.load", `before/after_tool_callback` → "tool.call/result", `before/after_model_callback` → "llm.call" with token usage, and `on_*_error_callback` → "refusal/error".
  - `Event.branch` tells the parallel sub-agent lanes apart in the UI.
  - Write events to the outbox (or straight to Pub/Sub) from inside the plugin, so the agent never touches the books.
- FACT **Cloud Trace:** deploy with `--otel_to_cloud` (legacy flag `--trace_to_cloud`), or set `enable_tracing=True` on the app, or call `get_gcp_exporters(enable_cloud_tracing=True)` for a custom runtime. Spans include `invoke_agent`, `generate_content`, `call_llm` and `execute_tool`. Message content is redacted by default (`ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS='false'`). Source: https://adk.dev/integrations/cloud-trace/

### 3. Deploying the intel service
- FACT `adk deploy cloud_run`:
  - flags: `--project --region --service_name --with_ui --session_service_uri --artifact_service_uri --memory_service_uri --port --allow_origins --app_name`, plus `--a2a` and `--otel_to_cloud` in the source
  - alternative: `get_fast_api_app(agents_dir=…, session_service_uri=…, allow_origins=…, web=…)` behind `gcloud run deploy`
  - without a session URI, "sessions … are lost whenever a Cloud Run instance is recycled"
  - Sources: https://adk.dev/deploy/cloud-run/ and `cli/cli_deploy.py` (v2.11.0)
- INFERENCE (from `allow_extra_args` / `extra_gcloud_args` in `cli_tools_click.py`): extra flags pass through to gcloud, e.g. `adk deploy cloud_run … -- --min-instances=1 --cpu-boost`. This needs a probe.
- **Recommendation:** use `get_fast_api_app` (or a custom FastAPI plus `Runner`) on Cloud Run. Generated Dockerfiles are opaque, and we need our own SSE and trace endpoint.
- FACT, cold start: use min instances, startup CPU boost and lazy loading. Source: https://docs.cloud.google.com/run/docs/tips/general. The ADK plus genai import is heavy (INFERENCE), so set min-instances=1 on intel during judging only.
- FACT **Agent Runtime** (alternative):
  - compute $0.085/vCPU-h and memory $0.009/GiB-h; "idle time … between turns is not billed"
  - Sessions and Memory Bank storage $0.30/GiB-mo, with operations billed per million; Sessions/Memory Bank billing started 1 Sep 2026
  - Source: https://cloud.google.com/gemini-enterprise-agent-platform/pricing?hl=en
  - Release notes claim "sub-second cold starts". FACT that the claim exists: https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes. It is UNVERIFIED in practice.
  - Verdict (INFERENCE): skip it. A custom SSE trace stream out of a managed runtime is harder, and Cloud Run already satisfies the rules.

### 4. A2A
- FACT: spec **1.0.0** is the "Latest Released Version", and A2A has joined the Agentic AI Foundation. Breaking changes from 0.3 include removal of the `kind` discriminator. Source: https://a2a-protocol.org/latest/specification/
- FACT **a2a-sdk 1.2.2** (2026-10-05) implements spec 1.0 with a 0.3 compatibility mode and supports JSON-RPC, HTTP+JSON/REST and gRPC. Source: https://pypi.org/project/a2a-sdk/
- FACT: ADK pins `a2a-sdk[http-server]>=0.3.4,<2` through the `[a2a]` extra (https://pypi.org/pypi/google-adk/json). `a2a/_compat.py` is the "single point of divergence between a2a-sdk 0.3.x and 1.x".
- UNVERIFIED: which card `protocolVersion` `to_a2a` emits under sdk 1.2.2. The docs example shows 0.2.6, which is stale, so the probe must read `/.well-known/agent-card.json`.
- FACT, exposing an agent: `from google.adk.a2a.utils.agent_to_a2a import to_a2a`; `to_a2a(agent, host, protocol, port, agent_card, runner, lifespan)`; serve with uvicorn. The card is at `/.well-known/agent-card.json`. Source: https://adk.dev/a2a/quickstart-exposing/
- FACT, consuming: `RemoteA2aAgent(name, agent_card, *, description, httpx_client, timeout, a2a_client_factory, a2a_request_meta_provider, config, use_legacy=True, auth_scheme, auth_credential, …)`. Use it as a `sub_agent`. Source: `a2a/agent/_remote_a2a_agent.py` L661-688 (v2.11.0).
- FACT, Cloud Run service-to-service: grant `roles/run.invoker` to the caller's service account, then send `Authorization: Bearer <ID token>` with aud = receiving service URL. Tokens come from the metadata server `…/identity?audience=…` and last about 1 h. Source: https://docs.cloud.google.com/run/docs/authenticating/service-to-service
- INFERENCE (wiring): pass `httpx_client=httpx.AsyncClient(auth=<hook adding google.oauth2.id_token.fetch_id_token(req, aud)>)`. The card fetch also needs the token while suppliers stay private. One supplier service means one audience.

### 5. Gemini on Agent Platform (Standard PAYG, USD per 1M tokens). FACT: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=en
| Model ID | In | Out | Notes |
|---|---|---|---|
| gemini-3.8-flash (GA 2 Sep 2026) | 0.75 global / 0.825 non-global | 3.75 / 4.125 | introductory price to 31 Dec 2026, then 1.50/7.50; cache 0.075 |
| gemini-3.5-flash | 1.50 / 1.65 | 9.00 / 9.90 | the only 3.x Flash with India residency |
| gemini-3.5-flash-lite | 0.30 / 0.33 | 2.50 / 2.75 | available to ≥ Jul 2027 |
| gemini-3.1-flash-lite | 0.25 (audio 0.50) | 1.50 | cheapest current text model; to ≥ May 2027 |
| gemini-3.1-pro-preview | 2.00 (>200k: 4.00) | 12.00 (18.00) | global only; Preview |
| gemini-3.8-live (Live API) | text 0.75 · audio 3.00 | text 4.50 · audio 12.00 | priced non-global only; 25 tokens per audio second; context re-billed every turn |
| gemini-embedding-001 / gemini-embedding-2 | $0.00015 per 1k input (= $0.15/M); Gemini API lists embedding-2 at $0.20/M text | — | embedding-001 available ≥ May 2028 |
- FACT: Priority tier is about 1.8× (3.8 Flash $1.35/$6.75), and Flex/Batch is about 50% off. Thinking tokens bill as output.
- FACT, deprecations: on Agent Platform, 2.5 Pro/Flash/Flash-Lite retire **20 Oct 2026** and `gemini-live-2.5-flash-native-audio` retires 13 Dec 2026 (model-versions page). On the **Gemini Developer API** (ai.google.dev lifecycle), `gemini-2.5-flash-native-audio-preview-12-2025`, `gemini-3.1-flash-live-preview` and `gemini-3.1-flash-tts-preview` shut down **17 Nov 2026**, with `gemini-3.8-live` as the replacement. Source: https://ai.google.dev/gemini-api/docs/deprecations. Some open-model endpoints retire **21 Oct 2026** (release notes), so check any Gemma ID against that list.
- **The probe must confirm:**
  - that `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview` and `gemini-embedding-001` answer at `location=global`, and which also answer at `asia-south1`
  - `gemini-3.8-live` at a **regional** location (us-central1, then asia-south1), not global. It is priced non-global only and needs its own Live client config.
- How to list models:
  - SDK (FACT, python-genai `models.list` docstring): `genai.Client(enterprise=True, project=P, location="global").models.list(config={"query_base": True})`
  - REST (INFERENCE from the SDK's `t_models_url` → `publishers/google/models` and its v1beta1 default): `curl -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $P" https://aiplatform.googleapis.com/v1beta1/publishers/google/models`
  - Definitive test: one `generateContent` per ID at `https://aiplatform.googleapis.com/v1/projects/$P/locations/global/publishers/google/models/$ID:generateContent`
  - Also pin google-genai **2.29.0** (2026-10-07). Source: https://pypi.org/pypi/google-genai/json

### 6. Cost per month for a low-traffic demo (USD; build plus judging is about one billing month)
FACT inputs:
- Cloud Run asia-south1 is **Tier 1**: active $0.000024/vCPU-s and $0.0000025/GiB-s; **idle min-instance** $0.0000025/vCPU-s and $0.0000025/GiB-s; $0.40 per million requests. Instance-based billing is $0.000018/vCPU-s and $0.000002/GiB-s.
- Cloud Run free tier: 180k vCPU-s, 360k GiB-s and 2M requests per billing account, applied as a spend discount of about $5.2. Source: https://cloud.google.com/run/pricing?hl=en
- Cloud SQL default-region table (not Mumbai): db-f1-micro $0.0105/h, db-g1-small $0.035/h, SSD $0.000232877/GiB-h. Source: https://cloud.google.com/sql/pricing?hl=en
- Pub/Sub: first 10 GiB per month free, then $40/TiB. Source: https://cloud.google.com/pubsub/pricing?hl=en
- Secret Manager: 6 active versions and 10k accesses free, then $0.06 per version-month. Source: https://cloud.google.com/secret-manager/pricing?hl=en
- Identity Platform: Tier 1 (email/social) free to 50k MAU; SMS billed per message. Source: https://cloud.google.com/identity-platform/pricing?hl=en
- GCS: Always Free covers only us-west1/us-central1/us-east1. Source: https://cloud.google.com/storage/pricing?hl=en

| Line | Low | Expected | Basis |
|---|---|---|---|
| Cloud Run, min=0 (web, core-api, intel, suppliers ×1 merged) | $0 | $3–8 | INFERENCE: free tier ≈ 57 active h at 1 vCPU/512 MiB; open SSE tabs count as active |
| + min=1 on core-api (512 MiB) and intel (1 GiB) for judging | — | +$23 | INFERENCE: $9.9 + $13.1 idle per month at request-based idle rates (730 h). min=1 on all 6 unmerged services ≈ $59; instance-based SSE (option a) ≈ $50 per service |
| Cloud SQL Enterprise db-f1-micro + 10 GiB SSD + backups | $9.5 | $10–12 | Iowa math $7.7 + $1.7. Mumbai rates UNVERIFIED and probably somewhat higher. g1-small ≈ $27 if f1 (0.6 GB RAM) chokes the connection pools |
| Gemini text: ~300k tokens/day (250k in / 50k out) | $4 (3.1 Flash-Lite) | $11 (3.8 Flash global) + $5–10 eval bursts | INFERENCE: fan-out re-sends context, so measure tokens per question. Pro-preview everywhere ≈ $33/mo |
| Gemini Live (optional; excluded from total) | $0 | ~$0.2 per 3-min session; ~$7 per 20-min session | INFERENCE: every turn re-bills the whole context (25 tokens/s audio at $3/M), so cost grows with the square of session length. Cap sessions at about 3 min or enable context compression |
| Embeddings | <$0.5 | <$0.5 | $0.15/M |
| Pub/Sub · Secret Manager (~10 secrets) · GCS (few GB) · Identity Platform | $0.3 | $1 | free tiers above; avoid phone auth |
| Artifact Registry (4–6 images) · Cloud Build · Logging/Trace · egress | $0.5 | $2–4 | UNVERIFIED: pricing pages not read |
| Spanner | — | — | see the Spanner agent's report |
| **Total, excluding Live** | **≈ $15–20** | **≈ $55–70** (with min=1 and evals) | Set billing budget alerts at $50 and $100 |

### 7. Identity Platform vs Firebase Auth
- FACT: "Identity Platform serves as the backend for Firebase Authentication with Identity Platform and offers identical features." Only the upgraded tier has MFA, blocking functions, OIDC/SAML, multi-tenancy and a 99.95% SLA. Source: https://docs.cloud.google.com/identity-platform/docs/product-comparison
- FACT: custom claims are set with `setCustomUserClaims` from a server, are capped at 1000 bytes, and take effect "the next time a new [token] is issued" (client calls `getIdToken(true)`). Keep other data server-side. Source: https://firebase.google.com/docs/auth/admin/custom-claims
- FACT, verifying in Node:
  - with the SDK: `getAuth().verifyIdToken(idToken, checkRevoked)`
  - manually: RS256, `kid` from `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`, `aud`=projectId, `iss`=`https://securetoken.google.com/<projectId>`, plus checks on `exp`/`iat`/`auth_time`/`sub`
  - Source: https://firebase.google.com/docs/auth/admin/verify-id-tokens
  - Tenant tokens use `tenantManager().authForTenant(id)` (multi-tenancy doc).
- **Recommendation (INFERENCE):** upgrade Firebase Auth to Identity Platform (free at our scale, and better for the "Google Cloud only" story), with no tenants and email/Google sign-in.
  - A Hono middleware verifies the token: firebase-admin on the Node runtime, or `jose` against Google certs.
  - It then loads `outlet_membership` from Postgres for every request that touches money, stock or prices, so revocation is immediate.
  - An optional `org_id` claim is for routing only.

### Could not verify
- Cloud SQL, GCS and Secret Manager **asia-south1** prices: the pricing pages load regional rates with JS and gcloud was not available. The Iowa or default rates were used instead.
- Prices for Artifact Registry, Cloud Build, Logging and Trace free tiers, and egress were not read.
- Which models actually answer at the `asia-south1` endpoint, beyond the residency table; whether `gemini-3.8-live` is served in asia-south1.
- The card `protocolVersion` emitted by `to_a2a` with a2a-sdk 1.2.2, and whether `use_legacy=True` speaks spec 1.0 or 0.3 on the wire.
- That `adk deploy cloud_run -- <gcloud flags>` passes `--min-instances` (inferred from source).
- The exact REST path for listing publisher models (inferred from SDK source).
- The ID-token claim name for a tenant (`firebase.tenant`); the JWK (vs x509) URL for `jose`.
- The "sub-second cold start" claim for Agent Runtime; Cloud Run cold-start seconds for an ADK image (measure it).
- Several facts came through a summarising fetcher. Exact numbers and dates were re-read from curl-parsed HTML (pricing, model-versions, residency, PyPI JSON, ADK source). The prose descriptions of ADK docs were not.

---

## §D · Market verification and Australia pack

Researched 9 Oct 2026. `FACT` = read on the linked page. Quotes marked *raw* were pulled from the page HTML with curl. Unmarked quotes came through the fetch tool's extractor, which paraphrases: it misread one PDF in this session. `INFERENCE` = our reasoning, with its basis given. `UNVERIFIED` = search snippet only.

### Kill or reshape

1. **R2's "no product does cross-source" is false globally.**
   - **Kit (KitchenSync, US)** describes itself as "The AI back office for restaurant groups". It "reconciles transactions, codes AP, forecasts cash, and flags payroll, labor, and margin issues". It matches "transactions across all 6 locations against Toast and your bank feeds", flags "Price creep and double-bills … the moment the invoice arrives", and asks before acting: "Want me to dispute the duplicate with Sysco?", "Want me to raise truffle pasta to $32?". `FACT` *raw* [kitchensync.us](https://kitchensync.us/)
   - Its prices are $1,500, $1,950 and $7,500 "All-in, per location, per month", bundling a dedicated team, payroll, HR and banking. It claims 400+ locations. US only. `FACT` *raw*
   - **Reshape:** claim only "none found for Indian or Australian 2–5 outlet groups". Name Kit as the proof that the category exists.
   - Our propose-then-approve flow is close to Kit's. Per CLAUDE.md rule 4, our wording and schemas must come from first principles. Do not echo Kit's prompts. `INFERENCE`
2. **India already has the pieces, sold separately.**
   - **TransactIG** (Terra Insight, est. 2024) reconciles aggregator payouts, bank credits, POS and TDS/TCS. It posts to Tally/SAP downstream. "Configuration takes 2–4 weeks." This is enterprise finance-team tooling. `FACT` [terra-insight](https://www.terra-insight.com/insights/swiggy-restaurant-settlement-reconciliation/)
   - **HelloBooks** is AI bookkeeping. Aggregator orders are "already posted to the ledger … reconciliation is a match-and-confirm pass". It matches UTRs and files GSTR-1 and GSTR-3B. Price: "Free Plan to start, Pro from ₹499/mo". `FACT` [hellobooks](https://hellobooks.ai/guides/swiggy-zomato-reconciliation)
   - **Cointab** reconciles POS against Swiggy/Zomato for chains. `UNVERIFIED` (snippet)
   - **Reshape:** the gap is narrower than R2 said. What is still missing is *supplier invoices + aggregator + bank + POS together, for 2–5 outlet SMBs, with drafted actions*. HelloBooks at ₹499/month also undercuts R2's ₹1,500–3,000 per outlet price, at least for the reconciliation part alone. `INFERENCE`
3. **Contingency pricing has a precedent.** Owners pay a refund-recovery service, GetMyRefund, "10% of recovered amount". One owner recovered about 70% of ₹16 lakh. `FACT` via [Medianama, 7 Apr 2026](https://www.medianama.com/2026/04/223-swiggy-ad-charges-without-consent-unauthorized-deductions-restaurants/). We could not find GetMyRefund's own site (`UNVERIFIED`). This supports R2's "₹ found or don't pay". `INFERENCE`
4. **Unconsented aggregator deductions are the sharpest, best-documented pain.** Swiggy agreed to refund "promotional charges, which were allegedly levied … without prior consent". This followed boycott threats from BBHA, NRAI and FHRAI. The refund deadline was extended to 1 Sep 2026. `FACT` [Inc42, 7 Aug 2026](https://inc42.com/buzz/after-boycott-calls-swiggy-to-refund-alleged-unauthorised-charges-to-restaurants/)
   - **Reshape:** lead the demo leak story with *"ad/promo deductions you never approved"*, not generic payout mismatch. `INFERENCE`
5. **Australia: the aggregator market is now two players.** Menulog stopped taking orders "from midnight, Wednesday 26 November 2025" `FACT` [JET newsroom](https://newsroom.justeattakeaway.com/en-WW/257572-just-eat-takeaway-com-ceases-operations-in-australia). The AU pack ships **Uber Eats and DoorDash only**.
6. **Australia: card surcharges are banned from 1 Oct 2026.** Any surcharge line on AU receipts must be gone for eftpos, Mastercard and Visa (§3).
7. **Australia: keep payroll out of the pack.** STP Phase 2 and Payday Super make payroll a regulated filing product. Draft rosters only, and hand off to existing payroll software. `INFERENCE`
8. **Australia already has an AI invoice-matching competitor.** Supy runs AI invoice matching against POs for multi-branch F&B and has an AU site. `FACT` [Supy AU](https://supy.io/en-au/product-features/invoice-receiving) (the claim itself is snippet-level). Its overbilling dataset includes Australia: "22.7%" of invoices carry "at least one line billed at a price the restaurant never agreed"; 6.6% of lines are over and 3.9% under, across 8 markets and **not India** `FACT` [Supy, The Spread](https://supy.io/the-spread). This is useful evidence for supplier drift, with the market caveat stated.

### 1. Verifying R2's competitor claims

| Claim in R2 | Primary wording | Verdict |
|---|---|---|
| Petpooja AMA, Jul 2026, all plans, compares outlets | Published 29 Jul 2026. *Raw:* "It is not locked behind a higher plan, so every Petpooja user on **Electron POS** has it regardless of their subscription category." / "A chain owner can ask about performance across outlets instead of logging into each one." / "sits on top of the same data your restaurant reports already hold". It answers only and does not act. Its data is billing data only. [blog](https://blog.petpooja.com/operations-workflows/restaurant-ai-assistant-ask-me-anything/) | `FACT`, **narrower than R2**: "all plans" holds only for Electron POS users. |
| Best Match, May 2026, Hyperpure/DMart/local, fills the cart | *Raw:* "live price comparison across HyperPure, DMart, and local suppliers" / "Best Match scans every connected supplier's current rate, picks the cheapest option for each item, and drops it into your cart." / "Best Match builds the starting point; you make the final call." Post published 29 May 2026, updated 1 Sep 2026. [blog](https://blog.petpooja.com/industry-business-guides/petpooja-purchase-manager-features-setup/) | `FACT`. "May 2026" is the **post date**; no launch date is given. It does no invoice-vs-PO or price-drift check. |
| Swiggy Guru, Aug 2026, 2.7 lakh restaurants, 20+ languages | *Raw:* "available in over 20 vernacular languages including Hindi, Kannada and Telugu" / "manage their ads and discount campaigns as well as view their payout annexures in detail, including tax reports, and payout summaries" / "will benefit over 2.7 lakh restaurants". 2.7 lakh is Swiggy's **whole restaurant base**, not adoption. Dated 17 Aug 2026 per [FoneArena](https://www.fonearena.com/blog/489703/swiggy-guru-ai-partner-assistant.html). [Swiggy](https://www.swiggy.com/corporate/press-release/say-hello-to-guru-swiggys-24x7-ai-business-partner-built-for-indias-restaurant-industry/) | `FACT`. Guru **views** payouts; we found no dispute or reconciliation feature. |

**Who reconciles what (cross-source landscape):**

| Product | POS↔aggregator | Bank/UPI | Supplier invoices | Tally/ERP | Drafts actions | Source |
|---|---|---|---|---|---|---|
| Petpooja Online Order Reconciliation | Yes: status mismatches, amount variances, missing orders, commission vs contract | No (Pay+ splits card/UPI tenders separately) | No | Not on page | No | `FACT` [page](https://www.petpooja.com/online-order-reconciliation), [Pay+ blog](https://blog.petpooja.com/operations-workflows/why-swiggy-zomato-sales-bank-deposits-never-match/) |
| UrbanPiper reconciliation | Yes: marks orders "missing or inconsistent" (2022, free to Prime/Hub users) | No | No | No | No | `FACT` [blog](https://urbanpiper.com/blog/save-money-by-identifying-payment-errors-on-zomato-swiggy) |
| TransactIG (Terra Insight) | Yes | Yes | No | Posts downstream | No | `FACT` (above) |
| HelloBooks | Yes (ledger-first) | UTR matching | Not stated | Is the ledger | No | `FACT` (above) |
| Kit (US) | Yes (Toast, DoorDash) | Yes | Yes | QuickBooks/R365 | **Yes, with approval** | `FACT` (above) |
| Restroworks, Zoho | No reconciliation AI launch found | — | — | — | — | Searched; nothing found |

`INFERENCE`: in India, nobody we found joins all four sources for SMB groups *and* drafts the dispute or counter-offer. That gap is real but narrow, and Kit shows it can be built.

### 2. Owner-complaint evidence

1. **Ads run without consent.** A South Indian restaurant owner said he "did not want ads. Ads ran anyway for six months", with deductions above ₹20 lakh. Some monthly payouts hit zero. [r/swiggy](https://www.reddit.com/r/swiggy/comments/1sbcocl/swiggy_falsely_charged_me_more_than_25_lakhs_for/), `FACT` via Medianama (Reddit itself not read).
2. **Ads charged while closed.** Ads "kept reactivating automatically" during a three-month closure with zero orders, leaving a ₹10,000 negative balance. [r/swiggy](https://www.reddit.com/r/swiggy/comments/1rqn5pn/i_am_extremely_disappointed_by_these_greedy_mfs/), via Medianama.
3. **A multi-outlet operator lost ₹16 lakh across six restaurants** since January. He recovered about 70% through GetMyRefund at a 10% fee. [r/LegalAdviceIndia](https://www.reddit.com/r/LegalAdviceIndia/comments/1osreou/swiggy_falsely_charged_for_ads_accumulating_upto/), via Medianama. This is our exact ICP.
4. **Cost-per-sale charges without consent:** two months of deductions, and the promised refund never arrived. [r/swiggy](https://www.reddit.com/r/swiggy/comments/1n81sg4/swiggy_deducting_ad_charges_without_consent_no/), via Medianama. Swiggy's reply: "fewer than 1% of partners".
5. **An association-level revolt.** Over 250 Bengaluru restaurants threatened a boycott over forced promotional levies and demanded "greater transparency" and support "for operational and payout issues". `FACT` Inc42, 7 Aug 2026 (above).
6. **Refund liability.** On Zomato's paused 50:50 refund-sharing: "If the food gets cold … because the delivery executive took a longer route, why should the restaurant pay for that?" Under that policy, restaurants "wouldn't have any say". `FACT` [Inc42](https://inc42.com/buzz/zomato-puts-5050-refund-sharing-with-restaurants-on-hold)
7. **Staff theft via UPI.** A Kochi pizzeria manager swapped the shop's Google Pay QR for his own for about 8 months, taking about ₹18 lakh. It was caught when staff noticed "a significant rise in the number of cancelled transactions" while the payments still went through. `FACT` [Curly Tales, Jun 2023](https://curlytales.com/pizzeria-manager-switches-qr-codes-dupes-kochi-owner-of-18-lakhs/amp/). This is exactly the POS-void ↔ UPI-credit join we propose.
8. **Vendor refund and support.** A Petpooja customer wrote: "refund has still not been credited, and no UTR / transaction reference has been shared till date." `FACT` [Trustpilot, 9 Jan 2026](https://www.trustpilot.com/review/petpooja.com)
9. **Reconciliation is skipped.** A vendor blog says it is the task "almost every Indian cloud kitchen and restaurant owner knows they should be doing — and almost nobody actually does". It cites "₹5,000 to ₹20,000 per month in disputed payments". `FACT`, *vendor source, not an owner* [menuhelper, May 2026](https://www.menuhelper.in/blog/reconciling-swiggy-zomato-payouts-2026). The "₹2,000–8,000/month" figure was not on the page; drop it.

**Gaps.** We found no first-hand owner quote on month-end close pain, inventory-module pain or supplier price creep in India. Supplier drift evidence is non-India (Supy) or an NRAI treasurer saying "we can't fluctuate our prices like suppliers can" (`UNVERIFIED`; Deccan Herald returned 403).

### 3. Australia country pack: minimum

| Item | Rule | Label |
|---|---|---|
| GST | "a tax of 10% on most goods, services…". Registration is required at "GST turnover of $75,000 or more". | `FACT` [business.gov.au](https://business.gov.au/registrations/register-for-taxes/register-for-goods-and-services-tax-gst) |
| Menu prices | Show the GST-inclusive single total price. Surcharge days may be shown on the menu as "a surcharge of [x%] applies on [day]", displayed as prominently as the most prominent price. | `UNVERIFIED` (ACCC 403; snippets from [WA Consumer Protection](https://consumerprotection.wa.gov.au/price-display), LegalVision) |
| Tax invoice | A tax invoice is required where "a taxable sale is more than $82.50 (including GST)", within 28 days of a request. It needs the words "tax invoice", seller name, ABN, date, items with quantity and price, and GST amount. Buyer identity or ABN is added "for sales over $1000". The GST line may read "Total price includes GST" when GST is exactly 1/11. | `FACT` [business.gov.au](https://business.gov.au/finance/payments-and-invoicing/invoicing). The 1/11 wording and the exact ">" vs "≥" threshold are `UNVERIFIED` (ATO 403, sources conflict). |
| Pack decision | Make **every receipt a valid tax invoice** (the words "Tax invoice", ABN, GST line). The threshold question then disappears. Add a buyer-ABN field for ≥ $1,000 catering orders. | `INFERENCE` |
| Money | AUD, en-AU, "$" (use "A$" only when context mixes currencies). Store integer cents. Round GST at invoice level. Cash rounding to 5c applies to cash tenders only. | `INFERENCE` (cash and GST rounding rules not verified) |
| Time zones | Victoria (Geelong) began DST "Sunday, October 4, 2026": "At 2am, clocks will jump forward one hour to 3am". It ends "Sunday, April 4, 2027". "Queensland, Western Australia and the Northern Territory don't observe daylight saving." | `FACT` [Time Out](https://www.timeout.com/melbourne/news/daylight-savings-victoria-2026-090726) |
| Pack decision | Store IANA zones (`Australia/Melbourne`, `Australia/Adelaide`, `Australia/Darwin`, `Australia/Perth`, `Australia/Brisbane`), never fixed offsets. Business day = local trading day. Test across the 4 Oct 2026 and 4 Apr 2027 transitions (the 23 h and 25 h days). | `INFERENCE` |
| Aggregators | Menulog closed 26 Nov 2025 (above). Pre-exit shares (IBISWorld via USyd): Uber Eats "around 54%", Menulog about 24%, DoorDash "about 15%". A Menulog→Uber Eats migration deal was reported. | Shares `FACT` [USyd](https://www.sydney.edu.au/news-opinion/news/2025/11/14/menulog-is-closing-in-australia.html); deal `UNVERIFIED`. AU payout file formats not researched. |
| Card surcharges | RBA, 31 Mar 2026: "removing surcharging on debit, prepaid and credit cards on the designated eftpos, Mastercard and Visa card networks", from **1 Oct 2026**. Foreign-card caps and transparency changes follow from 1 Apr 2027. | `FACT` [RBA](https://rba.gov.au/media-releases/2026/mr-26-10.html). Amex and PayPal are not mentioned, which does not mean they are allowed. The 0.30% credit interchange cap is `UNVERIFIED`. |
| Pack decision | No surcharge line on eftpos, Mastercard or Visa tenders. Block it in the receipt validator. The leak finder should track MSF cost per tender instead. | `INFERENCE` |
| Payroll | STP Phase 2: report each pay event from payroll software (mandatory since 1 Jan 2022). Payday Super from 1 Jul 2026: super paid each payday and received by the fund within 7 business days. | Both `UNVERIFIED` (snippets; ATO and Fair Work not fetchable). Out of scope: roster drafts only (Kill #7). |
| Vic food safety | Class 2 covers premises handling "unpackaged potentially hazardous food" and includes "restaurants, take away outlets, caterers". Class 2 needs registration and a food safety supervisor. Food services are "exempt from the requirement to have a food safety program for a period of five years except if one or more of the high-risk food activities… is undertaken" (sous vide, sushi or cured meats, raw-egg desserts, steak tartare). Effective 2 Aug 2022. | `FACT` [Vic class 2 factsheet](https://sthgrampians.vic.gov.au/files/assets/public/v/1/public_health/new_classification_class_2_factsheet_august_2022.pdf). The exemption ends about Aug 2027 (`INFERENCE`; any extension `UNVERIFIED`). |
| Standard 3.2.2A | Category 1 (cafes, restaurants, takeaways) needs a certified FSS, food-handler training, and must "maintain records or show via other means" of compliance (receiving, storage, temperatures, cleaning). Vic Class 1 and 2 premises *with* an FSP are exempt from Tool 3. Enforceable 8 Dec 2023. | Category 1 `FACT` [Moreton Bay](https://www.moretonbay.qld.gov.au/Services/Licences-Regulations/Food-Business/Standard-3.2.2A-Food-Safety-Management-Tools). Vic Tool 3 exemption and date `UNVERIFIED`. |
| Pack decision | Ship an optional temperature, receiving and cleaning log. Mark it "evidence record" so it is never presented as a compliance certificate. | `INFERENCE` |

### Could not verify / could not reach

- **Blocked:** Reddit (www and old), Play Store, G2, Capterra (403), ATO (403 to both fetch and curl), ACCC (403), Fair Work (timeout), several health.vic.gov.au pages (404), Deccan Herald (403). Every Reddit quote above is second-hand via Medianama. **We have no Play Store reviews and no YouTube or LinkedIn owner posts.**
- **Not found:** GetMyRefund's own site or terms; Cointab's restaurant product page; any Restroworks or Zoho reconciliation AI; any AU product that reconciles Uber Eats + DoorDash + bank + supplier invoices for SMB groups (we found only Xero-sync POS products such as Eats365 and Bustle, snippet-level).
- **Unconfirmed:** the RBA 0.30% interchange cap; the Amex surcharge position; the Payday Super and STP specifics; whether the Vic FSP exemption has been extended past Aug 2027; AU GST treatment of aggregator orders (no India-style Sec 9(5) equivalent found; not researched); Uber Eats and DoorDash AU payout statement formats.
- **Still needed:** first-hand owner evidence on month-end close, inventory-module pain and supplier price creep in India. R2's advice to run 10 owner interviews stands.

---

## §E · Reference merchant (Snacky Shack) — ideas only

`FACT` The reference repo is **private** (no licence; anonymous GitHub API returns 404); it was read on
9 Oct 2026 through the founder's credentials, outside this repo, and nothing was carried over. File paths
and names from it are deliberately omitted here (`CLAUDE.md` rule 4). Full teardown kept outside the repo.

Behaviour observed (`FACT` from the code and live site, paraphrased): single shop; ASAP or 15-minute pickup
slots with a 30-minute lead and **no per-slot capacity**; open/closed only from a weekly timetable (no pause,
busy, or holiday override); the server allows almost any status jump (a refunded, cancelled order can be
revived and earn points); **time-boxed deal prices survive a pickup-time change**; loyalty history is
overwritten to a net figure and can go negative under concurrency; no automated tests; dashboard revenue
counts unaccepted and uncollected orders; kitchen display has chime and banner but no timers, late flags,
stations or short ticket numbers; the customer tracker never refreshes. Done well: the server re-prices every
order from the menu; cancelling reverses points, coupon and gift in one step.

**Requirements for Munim's storefront and kitchen display (our words):**
1. Orders are ASAP or for a pickup window. Each outlet sets window length, lead time and a **max orders (or items) per window**.
   Full windows are hidden, and the server re-checks capacity when the order is committed.
2. Each outlet has an **"accepting orders" control** (open / busy +N min / paused) and a dated **holiday/override calendar** on top of
   weekly hours. The storefront shows the effective state and the next opening.
3. Prices, option rules (required, single/multi, min/max) and promo eligibility are **re-derived on the server** from the menu
   version in force. The order stores a snapshot of what was sold at what price.
4. Simple items add in one tap. Items with options open a sheet with a live price. Sold-out is per outlet and visible before checkout.
5. Time-boxed deals are judged **at the promised pickup time**, and **re-judged whenever that time changes** (customer or staff).
   When a deal is edited, carts holding it get a clear message instead of a cryptic failure.
6. Coupons support per-customer and global caps, a minimum spend, a validity window and an outlet scope. Stacking rules are written
   down and shown to the customer as a line-by-line breakdown.
7. Loyalty is an **append-only ledger** (earn, redeem, reverse, adjust-with-reason each a separate entry). The balance can never go
   negative. Earning happens only on completion; reversal happens on cancel/refund.
8. Guest checkout with phone or email is allowed. An account is optional and offered after the order.
9. The tracker page **updates itself** (push, polling fallback). It shows state, promised time, any change of promise, and the
   reason for a rejection. Status messages also go out on at least one non-email channel.
10. Customer cancel/reschedule windows are outlet-configurable, shown as a live countdown, and enforced on the server. Every
    reversal (points, coupon, gift, recorded tender) happens in one atomic step.
11. KDS: every state change is **conditional on the current state**, through an explicit allowed-transition table. Cancelled/refunded
    orders are terminal. Skips happen only through a logged "complete" action (who, when, where) that still honours time rules.
12. KDS tickets show a **short daily ticket number**, elapsed time since accept, promised time, and amber/red when at risk or late.
    Scheduled tickets surface automatically at "promise minus prep time".
13. Accepting an order sets or confirms that order's promised time, with a quick "push back +5/+10" that notifies the customer.
    Each outlet has a default prep time, and Munim's AI layer may **propose** a different time, citing current load.
14. New-order alert = sound + visual + tab title, repeating until acknowledged; the KDS detects blocked audio and asks for one tap.
15. Every money/points/status mutation writes an audit entry (actor, outlet, before/after). The daily close produces a
    reconciliation of orders vs recorded tenders, with no-shows listed separately.
