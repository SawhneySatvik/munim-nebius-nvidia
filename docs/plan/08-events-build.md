# 08 — Events build: Munim for Nebius × NVIDIA (and the shared core for Meta)

Started Sat 24 Oct 2026, 01:25 IST. Branch `intelligence`, cut from `origin/falkordb` (958b105) in the worktree
`../foodops-intel`. The branches `main`, `falkordb`, `cup-deck` and `alexa` are not touched. Decision record:
`hackathon/_meta/DECISIONS.md` D-024. Live status: [`EVENTS-STATUS.md`](./EVENTS-STATUS.md). The status file wins over
memory, both for the morning report and for resuming after a context compaction.

## Founder decisions (24 Oct, 01:00–01:30 IST)

| # | Decision |
|---|---|
| EV-1 | **Nebius:** one entry, Munim, track Best Apps & Agents. Deadline Fri 30 Oct 22:30 IST. Submit by 18:00. |
| EV-2 | **Meta:** accepted. Tonight only the event-neutral core; the Meta-specific work (`meta` provider, Muse Spark, SAM 3.1 stock-take) starts after kickoff (Mon 26 Oct 22:30 IST), once the Official Rules are read. **No Meta code tonight**, not even the provider value. |
| EV-3 | **Models tonight:** Nemotron through the founder's **NVIDIA API key** and the existing `nvidia` provider. The Nebius rules count only **Token Factory** calls, so a `nebius` provider (Token Factory base URL) is built alongside and becomes the submission configuration once the founder has a Token Factory key. Never repoint `nvidia`. |
| EV-4 | **Two more businesses tonight, each with its own UI:** (a) a synthetic Indian business; (b) **The Snacky Shack** (Geelong, AU pack), **menu and items only** from its app. No customers, orders, emails or phones. Synthetic history is generated around the menu and labelled. Using it in public needs the owner's consent first. |
| EV-5 | **Local only tonight.** Use `MUNIM_IDP=local make up LOCAL_DB=1` (embedded Postgres, local sign-in). No hosted database, no deploys. |
| EV-6 | **Pushing:** push only the `intelligence` branch, after each green milestone, after scanning for `.env`, `.run/`, keys and AI attribution. Commits carry no AI attribution. |
| EV-7 | **Tavily:** recorded responses, labelled "recorded", until `TAVILY_API_KEY` exists. |
| EV-8 | **Base:** `origin/falkordb`. The commits only on `main` are Cup / Cloud Run deploy and film work. `alexa` stays apart. |

## Guard: every lane prompt carries this verbatim

> **Local only.** Start the stack only with `MUNIM_IDP=local make up LOCAL_DB=1` (add `MUNIM_GRAPH=falkordb` only if the
> lane needs the graph). Never run plain `make up`, `make dev-db`, `make seed` without `LOCAL_DB`, or anything that reaches
> the hosted Supabase project: it serves munim-api / munim-cobnut, which FalkorDB judges are looking at. Before any seed,
> confirm the database URL is the local one (`.run/local/local-db.json`); if in doubt, stop.
> **Never read, print, grep, copy or log `.env`** (CLAUDE.md rule 20). Keys load only through `packages/config` /
> `munim_intel.config`. No key value ever appears in output, logs, fixtures, traces or commits.
> **No AI attribution** in commits or files. **Migrations:** only the migrator lane writes them; additive only; local
> database only. Stay inside your file territory. A conflict means skip and report. On the second identical failure,
> stop, write it to `EVENTS-STATUS.md` and move on.

## Tiers (morning target: P0–P3 green with evidence; P4–P6 as far as they get)

### P0 — Baseline (orchestrator, sequential, before any lane)
1. Worktree plus dependencies (pnpm and uv). Link `.env` from the main checkout; the link is never read.
2. `MUNIM_IDP=local make up LOCAL_DB=1`, then seed **Cobnut** on the local DB, then **one** `make check` run. Record
   what's green and what was already red into `EVENTS-STATUS.md`, so no lane chases a failure that predates tonight.
3. NVIDIA endpoint: list the models (`/v1/models`), with the key loaded through config. Record the Nemotron ids for text,
   reasoning, vision-language and embedding. **Model ids differ between NVIDIA's endpoint and Token Factory**; keep a
   mapping table.
4. Check whether Munim's OpenAI-compatible path supports **JSON-schema structured output**. The live path was built for
   Gemini's `response_json_schema`; this is the real porting work.
5. **Silent-degrade gotcha:** with no `platform.llm_budget` row, or a role with no INR price, AI declines and every
   surface falls back to its template. Seed budget and prices for the Nemotron roles. Every live smoke must assert that
   the trace carries a **Nemotron model id**, so a template answer can't pass as "live".

### P1 — Nemotron live, end to end, on Cobnut (lane A: intel/providers + migrator)
- `platform.model_role` → Nemotron through `nvidia`: router and narrate on a small or fast Nemotron; reason on Nemotron
  Super or Ultra; extract and vision on a Nemotron VL; embed on an NVIDIA embedding model if Munim's embed role needs one.
- A structured-output path for OpenAI-compatible providers (JSON schema, with a validate-and-retry fallback), against the
  same contract tests the Gemini path passes.
- `nebius` provider: base URL for Token Factory, key `NEBIUS_API_KEY`, plus an **additive migration** adding `nebius`
  to both provider CHECKs (`0002_platform.sql:54`, `0012_compliance_goals_intel.sql:537` → a new forward migration).
  Add a test that fails if any model call leaves Token Factory under the `nebius` configuration.
- Recorded fixtures for the Nemotron path, so gates run with `MUNIM_MODEL_MODE=recorded` (rule 17).
- **Done when:** Ask Munim and one investigation run live on Nemotron on the local Cobnut, the trace shows the
  Nemotron ids, `make check` is green, and the recorded fixtures are committed.

### P2 — Hero chain on Cobnut (lane A after P1, or lane A2)
A supplier invoice photo → Nemotron VL extracts it (quarantined: no tools, rule 8) → the price of one staple is
checked through **Tavily** (recorded and labelled until there's a key), entering through the signal path and cited
(F-6) → Nemotron reasoning negotiates with the simulated suppliers (existing `negotiate`) → Munim's deterministic deal
check → a **purchase-order draft** the owner approves → the saving on that line, cited.
- **Done when:** the chain runs live on Nemotron locally from one committed sample invoice image (synthetic, labelled);
  every number in the draft is a ref; a red-proof shows a forged number becomes "cannot verify".

### P3 — "Which agent, which model" in the product (lane B: apps/web)
- In **Ask Munim** and the **inbox**, every answer and draft shows the agent (manager, stock & purchasing, customers,
  money, compliance, menu & recipes…) **and the model that ran it** (for example "Nemotron 3 Super via Token Factory").
  This is native to the staff app; nothing is taken from `alexa`.
- Polish the Cobnut owner surfaces where the last session stopped: Home brief, the Ask answer with citation chips, the
  approval flow.
- **Done when:** screenshots of every named state are in `.screenshots/EV-P3/`; there are no console errors; a
  degraded mode (AI off) shows the template, not an error (rule 11).

### P4 — A second business: synthetic Indian (lane C: tools/worldgen + themes)
- A new worldgen world, e.g. a **South Indian cloud kitchen in Bengaluru** (2–3 kitchens, delivery-app heavy), on the IN
  pack. It has its own people, menu, simulated suppliers, history, and planted situations the agents should find
  (delivery-app commission leak, an ingredient price creep, a staff overtime spike).
- **Its own UI:** a storefront theme and brand (colours, type, imagery placeholders), published through the existing
  storefront-theme mechanism, so the same Munim looks like a different business.
- **Done when:** `--world=<new>` seeds on the local DB; its storefront renders in its own theme; an Ask on it returns
  cited answers from its own books.

### P5 — The Snacky Shack (lane C after P4)
- AU pack (`Australia/Melbourne`, AUD, GST). Menu and items **only**, from `the-snacky-shack` app's seed or schema.
  Synthetic history is generated around the menu and labelled "real menu, synthetic history".
- Its own theme (smash burgers, loud and warm) through the storefront-theme mechanism.
- **Done when:** it seeds locally; the AU golden-receipt and DST gates pass (verification-gate table); a PII scan of the
  tenant finds nothing; its storefront renders in its own theme.

### P6 — Nebius packaging prep (orchestrator, last)
- An export script for a public repo (`munim-nebius`) with an **Apache-2.0** licence and the full source; secrets and
  `.run/` excluded; the history scanned.
- README sections "Where Nemotron and Token Factory are used" (call sites, roles, model ids) and "Limitations"
  (documented failure cases; the judges said they read these as rigor).
- A draft of the feedback write-up (Most Valuable Feedback).

## How it runs

- At most **3 lanes** with separate territories: **A** = `services/intel` + `packages/contracts` (model and providers),
  with the **migrator** serial for `db/migrations`; **B** = `apps/web`; **C** = `tools/worldgen` + theme data. Shipyard
  agents: builder, migrator, reviewer and tester.
- **One `make check` at a time, on a quiet tree.** After each wave: one adversarial review, at most 2 fix cycles,
  commits per ticket with no attribution, then push `intelligence` after a scan.
- Every wave updates `EVENTS-STATUS.md`: what's green and its evidence, what's blocked, what needs the founder.

## Founder's to-dos (morning)

1. **Token Factory:** sign up, add a card, put `NEBIUS_API_KEY` into `foodops-os/.env`. Submission needs it, because
   NVIDIA's endpoint doesn't count.
2. **Tavily:** create an account (promo code `BBDEVPOST`), put `TAVILY_API_KEY` into `.env`.
3. **Meta:** sign up at dev.meta.ai, add a card, create a key (Muse), check `/v1/models` works from India. Read the
   Official Rules on Mon 26 Oct before kickoff.
4. **The Snacky Shack:** get the owner's written consent before anything of theirs goes public.
5. Decide on deployment for the Nebius live URL: a new isolated stack (a new Supabase project plus new Vercel projects).

## Calendar to submission

| Day | Target |
|---|---|
| Sat 24 (overnight) | P0–P3 green; P4/P5 started |
| Sat 24–Sun 25 | P4, P5 done; Token Factory key switched in; Tavily live |
| Mon 26 | Isolated deploy (new Supabase + Vercel); Meta Official Rules read; Meta kickoff 22:30 |
| Tue 27 | Live journey on the deployed stack; film plan |
| Wed 28 | **Film cut** |
| Thu 29 | **Devpost draft saved**; export repo public |
| Fri 30 | Submit by **18:00** (deadline 22:30) |
| 31 Oct – 4 Nov | Meta build (Muse Spark provider, SAM 3.1 stock-take); submit Wed 4 Nov evening (deadline Thu 5 Nov 07:30) |
