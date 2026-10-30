# Cup deck outline — 12 slides, exported as a PDF

The T&C asks for "a comprehensive presentation deck explaining the solution architecture and business case". The Challenges
page asks the deck to say the problem, the benefit to the community, the feasibility and the potential for scalability, as a
deck "converted into a PDF". No page gives a slide limit or a template. English.

**Rules for every slide**

- Say "synthetic", "simulated" and "recorded, not processed" where the slide shows data, suppliers or payments. A supplier
  slide without "Simulated supplier" on it is a defect.
- A rupee figure is a result on synthetic data and says so on the slide.
- No internal ids, no employer, no tool names, no hosting names other than Google Cloud.
- Film stills: the Cup cut is `video/munim-launch/script/cup.md`. A still is named by its line id and clock time, for example
  "film 3.3 at 0:31". Export one with the film project's snapshot command (`npx hyperframes@0.8.163 snapshot --at 31 ...`
  from `video/munim-launch/`, after `node tools/root.mjs cup`). Diagrams are the mermaid blocks in
  `scripts/export-cup/root/ARCHITECTURE.md`; render each to an image once and keep the source block named.

---

## 1. Thin margins, loose books — the problem

**Bullets**
- Two- to five-outlet restaurant groups, cloud kitchens and shops run on thin margins with no finance team.
- Money leaks quietly: waste at one outlet, supplier prices that creep, deductions nobody agreed to, regulars who stop coming.
- The owner finds out at month end, if at all, from software that records sales but does not explain them.
- A chat assistant that invents numbers does not fix this. One that can change the books is a risk.
- What owners need: answers they can check, and actions they control.

**Visual:** film 1.3 at 0:04, the stamp "BOOKS THAT DON'T ADD UP" on ledger paper.

**Speaker note:** Start with the owner, not the technology. "This is the person we built for: no accountant, two outlets, and
a month-end she dreads. Her point-of-sale records what was sold. Nothing tells her where the money went, and the AI tools
she is being sold either guess or act on their own. We built the opposite: an AI that shows its rows and asks first." Source
for the deduction story, if asked: Inc42, 7 Aug 2026 (a delivery platform agreed to refund promotional charges allegedly
levied without restaurants' prior consent).

## 2. Who it is for, and why they would pay — business case (part 1)

**Bullets**
- Nandini owns two bakeries in Lucknow; Farah manages one; Imran works the till; Kavya runs the kitchen (all synthetic).
- The wedge: money found. Owners already pay recovery services a share of what comes back (reported at 10 percent).
- Proposed price: per outlet per month, with an outcome promise ("found in month one, or you do not pay"). A hypothesis,
  not yet tested with owners.
- India first. Australia is the same code with a second country pack.
- Not yet validated: owner interviews, real exports and a pilot are the first step after the Cup.

**Visual:** film 2.2 at 0:14, the map with two pins (Cobnut Hazratganj and Cobnut Gomti Nagar), plus a four-person role strip
cut from film 3.1.

**Speaker note:** "Munim sells an outcome. Where the books show leaked money, we show the rows. The business model is a
hypothesis and we say so: it has been run on synthetic data only. The first thing we do after this event is sit with ten
owners and test whether they name leakage as a top-three problem." Sources, to open before presenting: Medianama,
7 Apr 2026 (the recovery-service share); Inc42, 7 Aug 2026 (the refund).

## 3. A day at Cobnut Bakehouse — the product

**Bullets**
- 8:10 am: the owner's home. Every figure has a source chip; tap it and the rows appear.
- 8:30 am: a customer orders a cake on the storefront. The server prices it; the browser's total is ignored.
- Kitchen board times the ticket to the pickup; the till records a card payment. Munim records; it never moves money.
- One system: storefront, till, kitchen, stock, purchasing, ledgers, rosters, customers, compliance, public API.
- The demo business, its customers and its history are synthetic.

**Visual:** three film stills in a row: film 3.2 at 0:27 (owner home, ink circle), film 4.3 at 0:47 (the coupon refused by
the server), film 5.3 at 1:10 ("RECORDED, NOT PROCESSED" and the card line).

**Speaker note:** "One day, four people. What you are seeing is the real product on a synthetic bakery. Two things to notice:
the price on the phone is worked out by the server, and the card payment is a record, not a transaction." Cut line if short
of time: slide 5 carries the architecture.

## 4. The One Guarantee

**Bullets**
- "Nothing changes the books without a named person's approval, and every number shown traces to a ledger row."
- Approval: a write to a book table is admitted only as a person's command, an approved decision, or a derivation of an
  approved row. 105 book tables, one trigger, no bypass for any role.
- Traces: a number on screen was rendered from a snapshot cell the core minted, never typed by a model.
- If it cannot trace, the product says "Cannot verify".
- Nothing auto-applies.

**Visual:** film 10.1 at 2:46, the guarantee stamped; beside it the book-guard flowchart ("The book guard" in
`ARCHITECTURE.md`).

**Speaker note:** "This is the design decision everything else rests on. Most AI products ask you to trust the model. This
one removes the need: the model has no write path to the books, and no number it shows is its own." Differentiation, if
asked: POS-vendor assistants that launched in 2026 answer questions; as far as we found on public pages in October 2026, none
shows the row behind each number or drafts a change for approval. That is an observation, not a survey.

## 5. Architecture

**Bullets**
- Five services: `web` (Next.js), `core-api` (Hono, the only writer of Postgres), `core-worker` (jobs), `intel` (Python,
  Google ADK, no database client), `suppliers-sim` (simulated).
- Postgres with forced row-level security on every tenant table; context set per transaction; append-only books.
- Commands, events and drafts: an outbox written in the command's own transaction, published after commit, swept by the
  worker; server-sent events carry ids only.
- Run tokens: the core signs a short-lived token carrying the tenant; the AI service holds only the public key.
- A public `/v1` API and a typed SDK; country behaviour from versioned packs, not code branches.

**Visual:** the "Services and data flow" diagram from `ARCHITECTURE.md` (full width), with the run-token sequence diagram as
a small inset if space allows.

**Speaker note:** "Two halves. The core is boring on purpose: deterministic, tested against a real database with the security
rules switched on. The intelligence is a separate service that can read, propose and explain, but cannot write. The only path
from AI to books is a draft that a person approves." This slide carries the T&C's "solution architecture".

## 6. The AI layer: specialists, cite or abstain, approvals

**Bullets**
- A router picks one of six paths; a Manager and eight specialists (menu and pricing, kitchen, stock and purchasing,
  finance, people, customers, compliance, market) answer with sources.
- Tools mint SQL snapshots in the core. The model writes handles; code turns them into references. Free digits in model
  prose are refused.
- Forged or cross-tenant references, and answers that fail the grammar, are stored as abstentions: "Cannot verify".
- Proposals are drafts with every number as a reference; a person approves, edits (labelled as theirs) or rejects.
- Watchers run on events and every 15 minutes; supplier text is read by an extractor with no tools, and a run that has read
  it can no longer draft.

**Visual:** "The AI layer" flowchart from `ARCHITECTURE.md`; beside it, film 6.4 at 1:38 ("What will we sell on Diwali night?"
answered "Cannot verify") and film 6.3 at 1:32 (an answer with source chips).

**Speaker note:** "The test of an honest assistant is what it does when it does not know. Ask it something about next
Diwali and it says so. Ask it why butter waste was high and it answers with the rows." Gemini roles: router, reasoning,
extraction, narration, via ADK's native Gemini class; on the deployed demo all four run on Gemini 3.5 Flash-Lite. The ids
live in a database table and change only by approved draft.

## 7. Supplier negotiation (simulated suppliers, agent to agent)

**Bullets**
- Hazelnut stock is below its minimum. One tap on "Request quotes" asks three **simulated suppliers**.
- Munim's agent negotiates round by round over A2A, inside limits set from the last price paid.
- Models write the notes; code adds every price. A deterministic deal review (not a model) applies the rules and rejects the
  cheapest bid whose minimum order is larger than the business can use.
- The result is a purchase-order draft with each price beside "from the supplier's reply". The manager of the other outlet
  cannot approve it; the owner can, by name. Recorded only: Munim does not process payments.

**Visual:** film 7.2 at 1:52 (bid bubbles, "SIMULATED SUPPLIERS · AGENT TO AGENT") and film 7.5 at 2:11 ("APPROVED BY NANDINI
MEHROTRA" with the lineage line).

**Speaker note:** "No real supplier is involved and the screens say so. What is real is the mechanism: agents that negotiate
inside limits the owner set, a rules engine that decides, and a human who approves. The same pattern applies to any
counterparty." Say "simulated" out loud on this slide.

## 8. Munim Cares: surplus food, counted in the books

**Bullets**
- At closing time Munim finds food that will not sell before its date and drafts a donation, with its cost in the books.
- It matches a nearby **simulated** recipient; the owner approves; pickup is scheduled.
- Hand-overs and packed items are counted from the ledger, not typed. The impact figures say "Measured on synthetic data".
- Benefit to the community, as the Challenges page asks: less food thrown away, with the audit trail of a business record.

**Visual:** film 8.2 at 2:22 (the match card and the "9:00–10:30 pm" pickup) and film 8.3 at 2:28 (the impact counter).

**Speaker note:** "Waste is the same problem seen from the other side: food that is worth something to someone nearby. The
recipient here is a simulated shelter; nothing is sent to anyone. The point is that a donation is a draft like every other
change, and that it is counted."

## 9. Built on Google Cloud

**Bullets**
- Cloud Run: five services in `asia-south1`. The API and the worker hold one always-on instance (live listener and cron);
  the rest scale to zero.
- Cloud SQL for PostgreSQL 17; Cloud Storage (private buckets); Identity Platform sign-in; Secret Manager for every secret.
- Cloud Build and Artifact Registry build one image per service; one script deploys; a rollback is a traffic shift or a
  redeploy of an earlier tag.
- Gemini through Google ADK: router, reasoning, extraction and narration roles; live on the demo under a monthly cap, with a
  recorded fallback; every test runs on recorded responses.
- Least privilege: one service account per service; the AI service has no database client.

**Visual:** the "Deployment on Google Cloud" diagram from `ARCHITECTURE.md`; the table of Cloud Run services below it.

**Speaker note:** "We chose Cloud Run because the shape fits: a stateless web tier, one always-on service for streaming, and
scale-to-zero for the rest. Secret Manager and per-service accounts make the least-privilege story concrete." Say what was
measured and what was not: the deployment runbook is in the repository, and the live site is the proof.

## 10. What is measured, on synthetic data

**Bullets**
- Book guard: 105 of 105 book tables refuse a context-free write.
- AI boundary: the AI service's database role has no write on 170 of 170 tables.
- Honesty: forged reference, cross-tenant reference and free-digit cases all end in "Cannot verify".
- Tracing: 14 of 14 ADK callbacks fire on the scripted run; the audit chain is gapless under 20 concurrent writers.
- Planted in the synthetic bakery and found by Munim: a butter-waste spike (₹4,872 in a week against a usual ₹1,512), six
  of 26 regulars lapsed, hazelnut stock below its minimum.

**Visual:** a table of the five measures, the source named in small print under each: 105 and 170 in `EXPECTED_COUNTS` in
`db/tests/manifest.ts` (asserted by `guard.test.ts` and `grants.test.ts`); the forged-reference, cross-tenant and free-digit
cases in `packages/core-domain/test/`; 14 in `CALLBACKS_14` in `services/intel/tests/trace/test_trace_plugin.py` and the
20 writers in `db/tests/audit-notify.test.ts`; the planted situations in `tools/worldgen/src/worlds/cobnut.ts`. Add film 3.3
at 0:31 (the source drawer) as the proof of a traced number.

**Speaker note:** "Every figure on this slide is a result on a synthetic world. We are not claiming savings for a real
business; we are showing that the guarantees hold under test and that the product finds what we planted." Before the deck
is exported, confirm each number against the constant named on the slide; the test runners print pass counts, not these
figures.

## 11. Roadmap: from prototype to pilot — scalability and business case (part 2)

**Bullets**
- Now: a working prototype on Google Cloud for the Retail and Commerce theme.
- First six weeks: ten owner interviews; a pilot on one business's own exports (point-of-sale, payouts, bank lines),
  through the approved-import path; stated kill criteria if owners do not name leakage as a top-three problem.
- Then: Australia live in the console (the pack is complete data today) and document reading wired to the vision role (the
  role exists; no demo path calls it yet).
- Scales by design: tenant-led keys under row-level security, packs instead of code branches, services that scale
  independently on Cloud Run.
- Price test: per outlet per month, or a share of money found.

**Visual:** a simple three-column timeline (Now, Six weeks, Quarter) drawn fresh; no film still.

**Speaker note:** "We know what we have not proven. The honest sentence is that the prototype is real and the market test is
next." Do not promise dates beyond the six weeks; do not name customers.

## 12. Team and close

**Bullets**
- Satvik Sawhney, founder: product, core, AI layer, infrastructure.
- `TEAMMATE-FULL-NAME`: the Cobnut Bakehouse storefront and its design.
- Everything is original work from the event window; synthetic data; simulated suppliers; payments recorded, not processed.
- Live: `CLOUD-RUN-URL` · Code: `REPO-URL` · Film: `VIDEO-URL`.
- "Nothing changes your books without your approval. Every number traces to a row."

**Visual:** film end card at 2:52 (the Munim mark, "Built with Gemini on Google Cloud", the URL and the disclosure card).

**Speaker note:** Close on the guarantee, then the three links, then stop.

---

## Judging criteria mapped to slides

| Criterion (weight) | What the scorers look for (Challenges page) | Slides |
|---|---|---|
| Technical Merit and Gen AI Implementation (40%) | Meaningful use of Gen AI | 6, 7, 8 |
| | Technical implementation: functional, sound | 3, 5, 10 |
| | Scalability and sustainability beyond the prototype | 5, 9, 11 |
| | Google Cloud architectural depth (T&C wording) | 5, 9 |
| Problem Alignment and Impact (25%) | Problem alignment | 1, 2 |
| | Potential impact for users, community | 2, 8, 10 |
| | Measurable real-world viability (T&C wording) | 10, 11 (labelled: measured on synthetic data; pilot is next) |
| Innovation and Creativity (25%) | Originality and differentiation | 4, 6 |
| | Innovation in the use of Gen AI | 6, 7 |
| User Experience and Solution Design (10%) | Usability and accessibility | 3, 8 |
| | Components working together cohesively | 3, 5, 6 |
| T&C: "solution architecture and business case" | | Architecture: 5, 9. Business case: 2, 11 |
| Challenges page: problem, community benefit, feasibility, scalability | | Problem 1; benefit 8; feasibility 3, 5, 9, 10; scalability 9, 11 |

## Before export

1. Replace `TEAMMATE-FULL-NAME`, `CLOUD-RUN-URL`, `REPO-URL` and `VIDEO-URL`.
2. Slide 9 describes the deployment as built; it is true after `DEPLOY.md` has been followed. Change anything the deploy
   changed.
3. Slide 10: the export's `--check` run is green, and each number equals the constant named under it on the slide. If one
   differs, change the slide.
4. Export to PDF (not PPT) and check the page count, that no slide shows a hosting name other than Google Cloud, and that
   every supplier and data slide says "simulated" or "synthetic".
5. Put the PDF where the form's `DECK-URL` can be public (a public Drive link or the repository).
