# Cup submission form — draft text

Ready to paste. Read the notes first.

## Read first

- **The real form was not seen.** It lives in the logged-in dashboard ("Forms" section). The fields below are the ones the
  public pages imply: the T&C's four artifacts, the Challenges page's list (proposal deck, prototype, video link, problem
  statement, English) and the judging criteria. Compare with the real form on submission day (checklist step 9) and move
  text between fields; the wording below is written so each block stands alone.
- **No page states a character limit.** The main text fields have a short version and a longer one. Counts are in characters with spaces,
  measured when this file was written. Lengths are `UNVERIFIED` against the
  form; if a limit is smaller than the short version, cut from the end of the short version.
- **Placeholders:** `CLOUD-RUN-URL`, `REPO-URL`, `VIDEO-URL`, `DECK-URL`, `TEAM-NAME`, `TEAMMATE-FULL-NAME`. Replace them
  and nothing else.
- **Wording is for after the deploy has run.** Every sentence about the live site is true only once `DEPLOY.md` has been
  followed and its smoke checks pass. The box "Check before pasting" at the end lists those sentences.
- **No internal ids, no employer, no tool names** appear in the text. Do not add any.

---

## 1. Team and entry

| Field | Entry |
|---|---|
| Team name | `TEAM-NAME` (as registered on the dashboard) |
| Theme | **Retail & Commerce: Intelligent Customer and Business Experiences** (the one theme per team; confirm it is the theme the dashboard shows for the team) |
| Project title | **Munim** |
| Members | Satvik Sawhney (founder: product, backend, AI layer, infrastructure); `TEAMMATE-FULL-NAME` (the Cobnut Bakehouse storefront and its design) |
| Live URL | `CLOUD-RUN-URL` |
| Public repository | `REPO-URL` |
| Demo video (public, 2:55) | `VIDEO-URL` |
| Deck (PDF) | `DECK-URL` |
| Language | English throughout |

## 2. One-line pitch

**Short (118 characters):**

> An AI back office for small restaurant groups and shops. It finds the money leaks, and a person approves every change.

## 3. Short description

**Short (287 characters):**

> Munim runs the counter, the kitchen and the books for a small restaurant group or shop. A team of Gemini specialists watches them for money leaks. Every number traces to a ledger row and nothing changes without a named person's approval. The demo business and all its data are synthetic.

## 4. Description (medium, 926 characters)

> Munim is an operating system for restaurant groups of two to five outlets, cloud kitchens and shops. Munim Core is the
> system of record: ordering at the till and on a web storefront, the kitchen board, stock, purchasing, ledgers, rosters,
> compliance, customers and approvals, behind a public API. Munim Intelligence is a Manager and eight specialists on Google
> ADK and Gemini. They explain what happened, with a source for every number; find money leaks; and draft actions. The
> models never write to the database and never type a number: every figure is a reference to a SQL snapshot that the core
> minted, and an answer that cannot be traced is shown as "Cannot verify". Every proposal is a draft that a named person
> approves, edits or rejects. The demo business is Cobnut Bakehouse, a synthetic two-outlet bakery in Lucknow. Suppliers
> are simulated agents, payments are recorded and never processed, and every screen says so.

## 5. Problem

**Short (425 characters):**

> Small restaurant groups and shops run on thin margins and loose books. Money leaks quietly: butter thrown away at one outlet, a supplier price that crept up, a fee deducted that nobody agreed to, regulars who stopped coming. Today an owner finds out at month end, if at all. An AI that makes up numbers does not help, and an AI that can change the books is a risk. Owners need answers they can check and actions they control.

**Long:** use the short version, then add:

> The owner of two to five outlets has no finance team. Her point-of-sale system records sales; her chat assistant guesses.
> She needs to see where the money went, with the rows behind it, and to act on it without handing control to software.

## 6. Solution

**Short (467 characters):**

> Munim keeps the books in a deterministic core and puts AI beside it, never inside it. Specialists for menu and pricing, kitchen, stock and purchasing, finance, people, customers, compliance and the market watch the business and answer questions. They read only numbers the core computed, cite them, and abstain when they cannot. Their proposals land in an inbox as drafts. A named person approves, and the change is made under that person's name, with an audit entry.

**Long:** add the walkthrough, one line per step:

> In the demo, the owner opens her day to a morning brief and taps any figure to see the rows it came from. A customer orders
> a cake on the storefront; the server prices it, the kitchen board times it to the pickup, and the till records a card
> payment without moving money. Munim notices butter waste at one outlet and hazelnut stock running low. The owner taps "Request quotes". Three simulated suppliers negotiate with Munim's agent over A2A, a deterministic deal review picks one, and a
> purchase-order draft waits for the owner. The manager of the other outlet cannot approve it; the owner can, and the change
> is recorded under her name. At closing time Munim Cares drafts a donation of surplus bread to a simulated shelter.

## 7. Theme alignment (Retail & Commerce)

> The theme asks for solutions that transform how businesses understand, engage and serve customers while improving
> operational efficiency across physical and digital commerce, with demand planning, inventory and customer insights named.
> Munim covers each: a web storefront and live order tracker (serve customers), win-back campaign drafts for lapsing regulars that
> need approval (engage; the demo records the approval and sends nothing), stock, waste, expiry and supplier pricing with a quote negotiation (inventory and
> efficiency), a per-outlet demand forecast, and a question box where every answer cites its rows (understand).

## 8. How Google Cloud is used

Only what `infra/gcp/` builds and `scripts/deploy-gcp.sh` deploys.

| Service | Use |
|---|---|
| **Cloud Run** | Five services in `asia-south1`: `munim-web` (Next.js storefront and staff screens), `munim-core-api` (Hono, the only writer of the database), `munim-core-worker` (the scheduled jobs), `munim-intel` (Python, ADK) and `munim-suppliers-sim` (the simulated suppliers). The API and the worker keep one instance with CPU always allocated, because they hold a live database listener and the cron loop; the other three scale to zero. |
| **Cloud SQL for PostgreSQL** | The system of record: Postgres 17, forced row-level security on every tenant table, append-only books, a hash-chained audit log. The instance has a public address with no authorised networks; it is reached only through Cloud Run's built-in Cloud SQL connection and the auth proxy, both IAM-gated, and refuses unencrypted connections. |
| **Identity Platform** | Staff, customer and operator sign-in. The API verifies the ID tokens; roles live in the database, not in the token. |
| **Secret Manager** | Every secret: database role passwords, the service secret, the run-token signing keys, the Gemini key. Each service account reads only its own. |
| **Cloud Storage** | A private bucket (public access prevented) for uploaded documents, as `<tenant>/<sha256>` objects; a second private bucket for build sources. |
| **Cloud Build, Artifact Registry** | One image per service, built and stored there. |
| **Gemini API** | Through Google ADK. See the next section. |

Least privilege is in the build: one service account per service, project-wide roles only where required, and the model
service has no database client at all.

## 9. How Gemini is used

> Munim Intelligence is built on Google ADK 2.11 with Gemini through ADK's native Gemini model class. Each model role is a
> row in the database. The demo uses four: a router that picks one of six paths for a question, a reasoning model for the
> Manager, the specialists and the negotiation's chooser, an extractor that reads supplier replies and has no tools, and a
> narrator that words findings, the morning brief and investigation steps. (Roles for vision and embeddings are defined for
> document reading, which no demo path calls yet.) All four demo roles run on Gemini 3.5 Flash-Lite: the seeded defaults
> put the router, extractor and narrator there, and the deployment moves the reasoning role (default Gemini 3.8 Flash) there
> with one approved config draft. An operator changes a role only through an approved config draft. On the deployed demo the calls are live, under a
> per-business monthly cap. If a call fails or the cap is reached, the product serves the recorded answer for that exact
> request when one exists and otherwise abstains or keeps its template text. It never shows an error state for an AI
> surface. All tests run on recorded model responses and need no key.

## 10. The AI layer

- **A Manager and eight specialists** (Menu & Pricing, Kitchen, Stock & Purchasing, Finance, People, Customers,
  Compliance, Market). A specialist is a skill: instructions plus tools generated from the contracts. A question can address
  one with `@Name`.
- **Cite or abstain.** A tool asks the core to run an allow-listed SQL template under the run's row-level security. The
  core stores the rows and returns ids; the model writes handles, and code expands them to references. Model prose may not
  contain a digit, a percent sign or a number word outside a reference. The core validates every answer; on any failure it
  stores an abstention and the screen shows "Cannot verify".
- **No authority.** The core mints an Ed25519-signed run token for each run, carrying the tenant and the outlets. The AI
  service holds only the public key. No tool has a tenant argument. The database role that serves the AI service has no
  write grant on any table.
- **Drafts, not actions.** A proposal is a draft with its references; a person approves, edits or rejects it. A person's
  edit is labelled as theirs.
- **Untrusted text is quarantined.** Supplier replies are read by an extractor with no tools; once a run has read
  untrusted text it can no longer propose a draft.
- **Watchers** run on events and every 15 minutes and put findings in the owner's inbox; a daily brief is composed at 06:00
  local time.
- **Supplier negotiation over A2A.** Munim's agent asks three simulated suppliers for quotes, counters within the owner's
  target and walk-away prices, and a deterministic deal review (not a model) decides. The result is a purchase-order draft
  with each price shown beside "from the supplier's reply".
- **Traces** of every step (route, skill, tool call, A2A message, finding, draft, abstention) carry ids and short labels
  only, and the staff screens replay them.

## 11. The One Guarantee

> **Nothing changes the books without a named person's approval, and every number shown traces to a ledger row.**

How the code holds each half:

- **Approval.** Every book table (105 of them) is protected by grants and a trigger. A write is admitted only as a person's
  own command, as an approved decision executing in the same transaction, or as an allow-listed derivation of an approved
  row. Approving a draft executes the change as the approver and writes the audit entry in one transaction. Nothing applies
  itself.
- **Traces to a row.** A number on screen was rendered from a snapshot cell the core minted, never typed by a model. If it
  cannot be traced, the product says "Cannot verify".

## 12. What is simulated

Plainly, and the same wording is on the screens, in the video and in the repository:

- **All data is synthetic.** Cobnut Bakehouse, its customers, staff and history are generated by a script in the
  repository.
- **Suppliers are simulated.** Three supplier agents are programs; every screen that shows them says "Simulated supplier".
  No real supplier is contacted.
- **Community-food recipients are simulated** in Munim Cares.
- **Payments are recorded, never processed.** No money moves and no code talks to a payment provider.
- **Nothing is sent.** No message reaches a real customer, supplier or regulator.
- **Every figure is a result on synthetic data.** Staff screens say "Sample data".

## 13. Measured, on synthetic data

The numbers that the repository's own tests assert, plus the situations the Cobnut world plants and Munim finds. None is a
claim about a real business.

- The book guard refuses a context-free write on all **105 of 105** book tables.
- The AI service's database role has no write grant on any of the **170 of 170** tables and no function.
- All **14 of 14** ADK callbacks the trace plugin depends on fire on the scripted run (a misspelt hook is otherwise
  silent).
- The audit log's hash chain stays gapless under 20 concurrent writers; tampering and deletion are detected.
- A forged reference, a cross-tenant reference and a free digit in model prose each produce "Cannot verify".
- Cobnut plants a butter-waste spike at one outlet (**₹4,872** in a week against a usual **₹1,512**, synthetic rupees), six
  regulars who stopped coming (6 of 26), hazelnut stock below its minimum, and sourdough about to expire. The world's own
  test checks the planted situations are there for the watchers to find.

## 14. Feasibility and scalability

- **Feasible:** a working end-to-end prototype on Google Cloud; five services; a public `/v1` API and a typed SDK.
- **Scalable by design:** every tenant table leads its keys with `tenant_id` under forced row-level security; country
  behaviour comes from versioned country packs (India is live, Australia is complete data that the tests exercise), so a
  new country is a data change; services scale independently on Cloud Run.
- **Honest limits:** the demo runs one core-api and one worker instance by design; the Australia pack is not in the live
  demo business; the AI service reads no documents yet (the ingest path validates a token only).

## 15. Business case

> Owners of two- to five-outlet groups, cloud kitchens and shops have no finance team and pay for POS software that records
> but does not explain. Public reporting from 2026 shows restaurants disputing deductions they did not agree to (a delivery
> platform agreed to refund promotional charges allegedly levied without prior consent, after boycott threats from
> restaurant associations, as reported by Inc42 on 7 Aug 2026), and owners are reported to pay recovery services a share
> of what they get back. Munim's proposed model is
> per outlet per month, with an outcome promise ("money found, or you do not pay"). This is a hypothesis, tested so far only
> on synthetic data; the plan after the Cup is owner interviews and a pilot on real exports, with a stated kill criterion.

## 16. Team

> Satvik Sawhney, founder, built the core, the AI layer and the infrastructure. `TEAMMATE-FULL-NAME` designed and built the
> Cobnut Bakehouse storefront.

(Founder, 16 Oct: both members confirmed eligible.)

## 17. Fresh code, original assets, third-party material

> All code and assets were created during the event window. The repository's history begins in October 2026. The art
> and the film were made for this project; no third-party sprite packs or art are used. Dependencies are open-source
> packages installed from public registries and pinned by lockfile.

(Founder, 16 Oct: no sentence about tooling.)

## 18. Links and demo access

> Live site: `CLOUD-RUN-URL`. Open **Sign in**, pick a person (owner, manager, counter or kitchen) and use the staff screens;
> no password is typed. The shop is the home page. The five-minute tour in the repository's README (`REPO-URL`) lists
> what to click. Every staff screen says "Sample data" and every supplier screen says "Simulated supplier".

## Check before pasting

Each of these is true only after the deploy has run and been checked. If one is not true, edit the text to what is.

1. Section 8 describes `infra/gcp/` as designed. **That deploy had never been run when this was written.** If any part
   was changed or dropped to make it work (for example a Cloud Storage bucket, Identity Platform sign-in), change the table.
2. Section 9: the live models are on in the deployed intel service (`/health` of `munim-intel` reports live mode), and the
   four demo roles are on `gemini-3.5-flash-lite` after the one-time role change (the `model-roles` call in the runbook's
   reasoning-role step lists them). If any shows another id, change the sentence.
3. Section 13: the export's `--check` run is green (checklist step 10), and each number equals its constant in the named
   source: 105 (book tables) and 170 (all tables) in `EXPECTED_COUNTS` in `db/tests/manifest.ts`, which `guard.test.ts` and
   `grants.test.ts` assert; 14 in `CALLBACKS_14` in `services/intel/tests/trace/test_trace_plugin.py`; 20 writers in
   `db/tests/audit-notify.test.ts`; 6 of 26 regulars and ₹4,872 against ₹1,512 in `tools/worldgen/src/worlds/cobnut.ts`.
   The test runners print pass counts, not these figures, so the constants are the evidence. If one differs, change the text.
4. Section 18: the sign-in picker works on the Cloud Run URL and the demo accounts exist.
