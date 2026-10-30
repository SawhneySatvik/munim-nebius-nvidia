# Munim — standalone reset design (9 Oct 2026, 23:00 IST)

**Status:** approved by the founder in a brainstorming session, 9 Oct 2026. Ratified as ledger R34–R39.
**Supersedes:** the Cup-specific parts of `docs/plan/03-architecture.md` (GCP topology, Pub/Sub, Spanner,
Cloud Run constraints) for the standalone build. Everything else in the ratified pass-1 corpus stands.
**Research:** `docs/research/R5-agent-runtime.md`.

## 1 · Focus

Build **one complete, world-class, AI-enabled POS/ERP for restaurants and shopkeepers**, targeting
**individual outlets and small chains**. Nothing in this build is shaped by the AI Builder Cup or FalkorDB
Graph Hacks. The founder forks event repos later; FalkorDB stays a separate product coded from 15 Oct (R12).

## 2 · What stays

The One Guarantee (R15) and its mechanisms (book guard, run tokens, intel has no write grant, snapshot-minted
numbers, rendered refs, number grammar, core-composed abstain text), R16 no auto-apply, R22 RFQs non-binding,
R26–R30 definitions, the eight domain packs + forecast (R3), draft → approve → commit, the pixel back office
replaying real traces (art made fresh), simulated suppliers labelled, TypeScript core (Hono) + Python intel (ADK).

## 3 · What changes

| Concern | Standalone design |
|---|---|
| Segment | Single outlets and small chains; restaurants **and** shops — the store pack (SKUs, barcodes, batches/expiry, MRP, returns) is first-class. Onboarding completes in minutes for one owner. |
| Database | Any Postgres, no vendor features (R31 static gate). Dev = hosted Supabase project. |
| Graph | `Graph` port; **default adapter = Postgres edge tables + recursive CTEs**; FalkorDB adapter optional. No Spanner. |
| AI runtime | **ADK 2.11 pinned**, Gemini via the native class; OpenAI, OpenRouter, NVIDIA via ADK's own `OpenAILlm` (base URL + key). **No LiteLLM**; never install ADK `[eval]`, `[extensions]`, `[all]`, `[test]` extras. |
| Providers | Operator chooses provider + model per **role** (router, reason, extract, narrate, vision, embed) in the platform admin; merchants never see providers. Eval harness runs the same suites across providers and prints a comparison. |
| Events | Outbox → **in-process publisher** in core-api after commit → HTTP push to intel `/events`; the long-running **core-worker process** sweeps stragglers, runs cron (watch sweep, brief, nightly) and fan-out. No Pub/Sub, no Cloud Scheduler. |
| Realtime | SSE from Postgres LISTEN/NOTIFY over a direct/session connection (R20/R33 unchanged). |
| Identity / storage | Supabase Auth and Storage behind the `IdP` and `Blob` ports; `idp-local` stub for every gate. |
| Secrets | `.env` (git-ignored). Provider keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`. |
| Deployment | Local processes against Supabase now; a hosting target is chosen later. |
| Parked (not repudiated) | GCP adapters, Cloud Run/Cloud SQL topology, Spanner, `make export-cup`, Cup submission tickets — revived when a fork is made. |

## 4 · Process

Per wave: **build all tickets in parallel lanes → wave test run** (every ticket gate + cross-ticket integration,
on a quiet tree) **→ one adversarial review of the whole wave** (with a guarantee scan) **→ ≤ 2 fix cycles →
commit by ticket → next wave.** Fully autonomous; the founder is asked only for money, hard rules, the ledger,
or a blocker only they can clear.

## 5 · Waves (backend first)

- **W0 setup (founder):** Supabase project + `.env`; provider keys.
- **W1 foundation:** contracts, core-domain, all W1–W2 migrations, core-api base, commit/outbox, stream,
  worker process.
- **W2 core modules:** tenancy + onboarding, catalogue, orders/POS/KDS, inventory + store pack, purchasing,
  finance, people, customers, compliance, imports, platform admin API.
- **W3 intelligence backend:** runtime + provider adapters + recorded model, traces, internal API, watchers,
  eight packs, forecast, ask + fan-out, brief, suppliers-sim, wiki, graph (Postgres adapter).
- **W4 frontends:** POS, KDS, storefront, console + dashboards, back office, platform admin.
- **W5:** eval harness (incl. provider comparison), end-to-end suites, polish; sweep.
Target by 10:00 on 10 Oct: W1 and W2 green, W3 under way — contingent on W0.

## 6 · Risks (stated once)

Backend-by-morning depends on the founder's Supabase project arriving soon. ADK A2A/skills are experimental and
ADK had 2026 breaking changes — pin and wrap behind our interfaces. Hosted NVIDIA tool calling is unverified.
