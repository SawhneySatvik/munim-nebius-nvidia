# HANDOFF — backend closed, site live (13 Oct 2026)

The standalone backend of Munim is closed, the Munim site with the teammate's integration kit is live on Vercel, and the session
is ended with no local servers running. This file is the resume point (it supersedes `HANDOFF-W3.md`, which stays as history).
Binding reasoning lives in the ledger (`docs/plan/00-decision-ledger.md` R48, R49) and `docs/DECISIONS.md` (12–13 Oct entries).

---

## 1. State at the close

| Item | State |
|---|---|
| Last commit | `5c9e486` (tree clean) |
| `make check` | **ok, 8/8 targets** at `9d5fa33` (lint, typecheck, boundaries, test, boundaries-redproof, intel-redproof, smoke, smoke-redproof) |
| Test counts | db 461 · core-api 1020 · integration 47 · intel 859 (+ruff, mypy) · contracts 257 · site 111 · core-domain 137 · core-worker 38 · worldgen 70 · config 12 · publisher 10 · idp 15 · smoke 4 |
| DB red-proofs | `db/tests/redproof-0017…0029.sh` all PASS (0028: 76 plants; 0029: 22 + definer-filter plants) |
| Migrations | 0001–0029 in the repo. **Hosted dev Supabase is still at 26** (0027–0029 and pack v4 not applied there) |
| API surface | 260 public operations (135 read, 125 write; 22 Cares, 11 storefront) + 21 internal intel routes; every mounted route is in OpenAPI (gate) |
| Site | **Live: https://munim-rho.vercel.app** (Vercel project `satvik-sawhneys-projects/munim`) |
| Local processes | none from this session (stopped: next dev :3100, a scratch `node server.ts`, three orphaned embedded-Postgres test clusters; 3.4 GB of temp test DBs deleted). Untouched: the founder's port 8787 and `swe_harness` (:4102) |
| Disk | ~26 GB free (lanes' scratch copies cleared twice this session) |

---

## 2. What this session built (after `20e1a51`, the W3 handoff)

| Ticket | What | Commits |
|---|---|---|
| R48 | Founder decisions: integration kit first (screens in a separate repo); AI prices per currency; Munim Cares scope + design answers | `be7cfad`, `99b1c7a`, `f7ec0b5` |
| T-096 | core-api / core-worker no longer crash on a broken *checked-out* pg client (hosted pooler "received invalid response: 0") | `df9b263` |
| T-097 | worldgen verify caches only after a full load (the RG-K2/RG-G7 misreads); demo budget draft id per tenant | `2c28198` |
| T-098 | 0027: a lowered ceiling downgrades Auto → Plan (`stop_reason 'ceiling'`, trigger-set; munim_svc gains no privilege); Auto only via the plan-approving update; creator sees `ceiling` | `d6ef366` |
| T-095 design | ADR-015 Munim Cares (reviewed: 3 sev-1, 9 sev-2 fixed in one revision) | `b60f7e7` |
| M-D + T-095c | 0028 (13 tables, 9 book, 5 definer reads, 4 stock kinds + derivations), contracts, packs v4, ontology; review (7 sev-2) fixed in place; 51 intel fixtures re-recorded (founder-approved, backup kept) | `1425648` |
| R49 | Integration kit + site decisions (Spice Route + Laneway Cafe storefronts, mock API, one site, Vercel for the standalone build) | `801f961` |
| T-099 | 0029 storefront completeness: display names/descriptions/diet, outlet phone + tax ids, GST components, refusal params, pickup-window check, CORS, `/v1/stream` documented, Cares `tz` | `b46f07f` |
| T-095a/b/d | Munim Cares built: core (10 commands), public network + storefront section + operator impact snapshot + limiter, intel mappings | `daeeec1` |
| Integration | Cares mounted, CORS/hops via `packages/config`, pack `pay_at_counter_methods`, generator prunes public.json, regeneration | `e2756b3`, `be60be5` |
| K1–K4 | `apps/site` (landing, /cares, /developers), mock API, `docs/kit`, `@munim/sdk` 0.1.0 tarball + example | `974b252` |
| Wave review + fix cycle | 2 sev-2 (place replay; stranded B2B claim) + 16 sev-3 fixed; rulings recorded | `21b8c85`, `bed22f1`, `1a4b04f` |
| T-034 scanner | integration clause-1 scan keys `core.cares_outlet` by outlet (make check had failed on it) | `9d5fa33` |
| Deploy | site live on Vercel (prebuilt, no source upload) | `5c9e486` |

### 2.1 Munim Cares (ADR-015, R46, R48 F-2)
- **Recipients:** listed NGOs/food banks, **simulated only** (DB CHECK: `simulated = true`, name contains "(simulated)").
- **Where:** one network page across opted-in businesses (by city) + a Cares section on each storefront. Every listing is published by the owner's approval (the AI only drafts).
- **AI:** `inventory.expiry_risk` → donation listing draft to the top-ranked recipient (`cares.recipient_match`, deterministic SQL); `people.overstaffed_slot` + `munim.cares.listing.published.v1` → "pack and hand over" task for a rostered staff member (`cares.pickup_crew`); market reads `cares.listings` / `cares.impact`. Not opted in → nothing.
- **B2B shared surplus offers:** record-only money ("Recorded, never processed"); one accepted claim per offer; **offer hand-overs are all-or-nothing and final** (ruling 2-B); the buyer's receive copies the accepted allocation and handed quantity; no cross-tenant writes (three id-keyed definer reads).
- **Impact:** member `cares.impact` snapshot; public "meals shared across Munim" = an operator-minted `platform.network_snapshot`, published only through an approved config draft; labels **"Measured on synthetic data"** and **"to simulated recipients"** are unconditional; legal copy is only "Check your local food-donation rules".
- **Operator switches:** `cares_city`, `cares_recipient`, `cares_enablement:<tenant>`, `cares_public_impact:<id>` config drafts (applied in the approving transaction; DB deferred trigger enforces it).

### 2.2 Storefront API (T-099) — what the teammate's sites rely on
Display names/descriptions/diet on items, variants, options; menu `channel_id`, `brands`, `prices_include_tax`, `pay_at_counter_methods`; preview `tax_rate_bp` + `tax_components` (IN CGST/SGST halves, AU GST) from the pack; outlet `phone` + `tax_ids`; refusal `params` (shortfall, old/new totals); `promised_at` must lie in the chosen window (`pickup_time_outside_window`); a used idempotency key replays the stored order before any availability re-check; CORS on `/v1/storefront/**`, `/v1/stream`, `/v1/cares-network/**` (exact-origin echo, preflight before the limiter); `/v1/stream` (fetch-based SSE) in OpenAPI.

---

## 3. The live site and the teammate kit

**https://munim-rho.vercel.app** — public; everything synthetic and labelled.

| Path | What |
|---|---|
| `/` | landing (One Guarantee, features with honest status labels, eight specialists, Cares, India + Australia, "Contact us") |
| `/cares` | Munim Cares story for judges |
| `/developers` | API suite: reference for all 260 operations, schemas, authentication, errors, AI contract, guides, changelog, gaps, downloads |
| `/developers/mock` | mock API keys and behaviour |
| `/developers/guides/storefront-spice-route`, `…/storefront-laneway-cafe` | full build specs for the two storefronts (pages, states, exact API calls, copy, a11y, checklist) |
| `/mock/v1/...` | contract-valid mock storefront API (12 ops incl. SSE) — Spice Route key `sfk_mock_spice_route_7f3a91c2`, Laneway key `sfk_mock_laneway_cafe_c42e08d1`; header `X-Munim-Storefront-Key`; `X-Mock-Force-429: 1` simulates a rate limit |
| `/downloads/munim-sdk.tgz` | `@munim/sdk` 0.1.0 (sha256 `7313803552be94d5…`), Node ≥ 20, includes `uuidv7` and `openStream` |
| `/developers/openapi.json` | the public OpenAPI file |

Verified live (13 Oct): every page 200; wrong key → 404; the SDK tarball matches the local `.sha256`; `examples/storefront-min`
placed and tracked an order on each store over the live SSE (Spice Route ₹294 with CGST ₹7 + SGST ₹7; Laneway A$4.80 with GST
A$0.44). The mock keeps state in memory per serverless instance — orders can reset (documented for the teammate).

**Redeploy** (from the repo root; `.vercel/` is git-ignored; nothing but the build output is uploaded):
```
vercel build --prod --yes && vercel deploy --prebuilt --prod --yes
```
Deploying from `apps/site` fails (pnpm keeps dependencies in the root `node_modules/.pnpm`); the root link sets
`rootDirectory: apps/site`. `apps/site/.env.local` holds a Vercel OIDC token written by `vercel link` — never read or commit it.

---

## 4. Decisions made this session (all recorded)

- **Ledger R48:** F-1 integration kit first; F-4 AI prices per currency (no FX); F-2 Munim Cares scope + design answers (record-only B2B, simulated-only recipients, public impact total, generic legal note).
- **Ledger R49:** SDK + API suite + landing page on one site; teammate builds Spice Route and Laneway Cafe storefronts against a site-hosted mock; Vercel for the standalone build only (the Cup fork stays on Google Cloud).
- **DECISIONS 12–13 Oct:** `handed_at` stamped by core; synthetic labels unconditional (hard rule 5); `transfer_in → core.batch` tightened to insert-only (orchestrator, guarantee fix); place replay before availability checks (2-A); offer hand-overs all-or-nothing and final (2-B); pack v4 edited in place (never reached hosted); `prices_include_tax` nullable = "cannot verify"; **founder: OFL fonts are fine** (binds the Cup copy).

---

## 5. Waiting on the founder

1. **F-3 AI prices** — enter per-role prices (operator config draft). Until then every live AI call is refused (`price_missing`); recorded mode is unaffected.
2. **Site settings** — set `NEXT_PUBLIC_CONTACT_EMAIL` in the Vercel project, then redeploy ("Contact us" shows "coming soon" until then).
3. **Real API for the teammate** — needs a long-running host (SSE + core-worker; not Vercel functions) with `MUNIM_CORS_ORIGINS` (the teammate's site origins) and `MUNIM_TRUSTED_PROXY_HOPS` set in the process environment (they are not read from `.env`; adding them to `.env.example` needs `packages/config` `ENV_NAMES` changed in the same commit). Costs money → founder's call.
4. **Hosted dev DB** — apply 0027–0029 and seed pack v4 (`make dev-db`, then a fresh `make demo` with a new tag) when ready.
5. **Open product calls** — G-06 customer login for storefronts (auth-flow change; sites are guest-only now); G-05 guest order lookup after a lost token; an exit for an accepted-but-never-handed-over B2B offer; F-5 P2 norm, F-6 snapshot row cap, F-7 demo deal values, F-8 cost notes (HANDOFF-W3 §4).

---

## 6. Carried items (not founder decisions)

- 2-B is enforced in core-api only; a DB backstop (offer hand-over complete + no void) needs a migration.
- The place-replay early key lock copies `commit/execute.ts`'s lock-key format by hand (no deterministic test).
- OpenAPI documents no 429 responses; the mock sends 429 only on `X-Mock-Force-429`.
- Category display text (no category table; `core.item.category` is free text).
- `impact?city=` may fall back to a network-wide snapshot; `listNetworkSnapshots` has no cursor (LIMIT 200).
- Two concurrent publishes can over-list the same stock (a later hand-over reports `negative_on_hand`).
- From HANDOFF-W3: provider fallbacks (W5 T-070), draft-linking, ingestion upload wiring, wiki scheduler, eval gaps, brief top-5 hand data.
- `examples/storefront-min/scripts/run.mjs` type-check needs `MUNIM_TSC` + node types (`MUNIM_SKIP_TSC=1` skips it).

---

## 7. How to resume

1. Read this file, then ledger R44–R49 and `docs/DECISIONS.md` from "12 Oct 2026".
2. `git log --oneline -25`; the tree should be clean at `5c9e486` or later.
3. Run `make check` on a quiet tree (~50 min) before starting anything.
4. Lanes: rsync scratch copies with `--exclude .git --exclude .env --exclude .run --exclude /scratchpad --exclude .venv --exclude apps/site/.next` and **delete them when done** (they filled the disk once). Lanes never commit; the orchestrator stages by name.
5. Recorded intel fixtures re-record only through the kits' `--record` scripts (they wipe fixture dirs) — **ask the founder first**, back up, then diff.
6. Never read `.env` or `apps/site/.env.local`; never use port 8787.

---

## 8. Next (on the founder's go)

Port Munim into **two event folders/repos** — the Google AI Builder Cup and the FalkorDB hackathon — each with detailed tech and
architecture docs. Before porting: re-snapshot both events' T&Cs and diff them (gotcha 19); check fresh-code and timeline rules
(hard rule 1); the Cup copy runs on Google Cloud only (hard rule 2 — no Vercel, no Supabase in that repo); simulated means
labelled (hard rule 5). The founder's goal: win both.
