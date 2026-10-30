# 01 — Product definition (PDR)

**Purpose.** What Munim is for, for whom, what is in and out, and how success is measured.
**Depends on:** ledger R1–R5, R11, R15–R18, R21; spec §1–§4, §10–§11; research R2, R4.
`FACT` = sourced; `INFERENCE` = reasoning.

---

## 1 · Problem

A 2–5 outlet restaurant group or a multi-brand cloud kitchen in India runs on several systems that never
agree: a POS, Swiggy and Zomato payouts, supplier invoices, bank/UPI statements and Tally. The owner cannot
say where money went last month. `FACT` (R4 §D): aggregators deducted ad and promo fees without consent
(Swiggy agreed to refunds after a Bengaluru boycott threat, Aug 2026); a manager swapping the UPI QR took
~₹18L; aggregator commissions run 25–35% before fees (NRAI to CCI, 2021, R2). Assistants that exist are
stuck in one silo: Petpooja's AMA answers over POS data, Swiggy Guru over Swiggy data (`FACT` R4 §D).

## 2 · Positioning (the claim we can defend)

`INFERENCE` from R4 K8: *Munim is the first operating system we found for Indian and Australian 2–5 outlet
food groups that runs the business on books it cannot quietly change, joins POS, aggregator, supplier and
bank data, finds the money that leaked with every number traced to a row, and drafts the fix for the owner
to approve.* US prior art (Kit) is named in the deck. Sell outcomes — ₹ found, the month closed, every
number explained — not "an AI brain" (R2).

## 3 · Personas and jobs

| Persona | Jobs to be done | Surface |
|---|---|---|
| **Meena, owner of 3 outlets** (primary) | Know each morning what needs her decision and what it is worth; approve or reject in one tap; ask "why" and get a cited answer; close the month | `console/` home = brief + inbox |
| Outlet manager | Run today: counts, waste, roster, cash close, checklists; only their outlet | `console/` scoped |
| Kitchen / floor staff | Take orders, fire tickets, see what is late, log waste and temperatures | `pos/`, `kds/` |
| Advisor (CA) | Read the books and reports; export to Tally | `console/` read-only |
| Customer | Order by table QR or pickup slot, see honest wait times, use deals and loyalty | `order/` storefront |
| Munim operator | Provision tenants, edit country packs, plans, flags, budgets as approved drafts | `admin/` |

## 4 · Scope (all in product scope — R2, R3, R18)

Built in dependency waves (R18); the board orders them. Per pack the minimum "real" behaviour is: one
working core flow, ≥ 1 SQL detector producing a cited finding, ≥ 1 draft type, ≥ 1 visible refusal.

| Pack | Core (deterministic) | Intelligence |
|---|---|---|
| Catalogue & menu | items/variants/options, versioned recipes, price lists per outlet/channel, deals with time windows, coupons | true dish margin (recipe × latest supplier price × waste), price-change drafts, menu engineering |
| Kitchen ops | KDS with allowed transitions, short ticket numbers, timers, late colouring, stations; prep lists | ticket-time drift, prep-time proposals with evidence |
| Inventory & purchasing | append-only stock ledger, counts, waste, transfers, reorder levels, POs, GRNs, supplier invoices (duplicate refused), batches/expiry | shortfall from forecast, price creep, waste spikes, **A2A negotiation with simulated suppliers → PO draft after deal review** |
| Finance | double-entry ledger with posting rules, settlements, bank lines, reconciliation breaks, period close, GST/Tally export | reconcile payouts to orders, explain breaks, unapproved ad fees, P&L by outlet/brand/channel, close checklist |
| People | rosters, attendance, payroll drafts (IN), advances, tips | labour vs forecast, overtime drift, roster drafts |
| Customers & growth | customers, append-only loyalty ledger, coupons, campaigns, reservations, reviews | coupon leakage, churn segments, campaign drafts (never auto-sent) |
| Compliance & assets | licence calendar from the pack, checklists, temp logs, assets, maintenance | expiry alerts, missed-log findings |
| Market & strategy | goals and tasks | weather/festival-aware forecast notes, new-outlet viability (cited) |
| Forecast service | — | demand per outlet/item/day/slot; must beat a seasonal-naive baseline |
| Platform | country packs (IN, AU), plans, flags, tenants, budgets, model roles | — |

Surfaces: `pos/`, `kds/`, `order/`, `console/` (brief + inbox home, ask, wiki, 8 dashboards, back office,
group ↔ outlet switch), `admin/`. Onboarding: sign up → type → import wizard (menu photo → catalogue draft;
POS export, payout and bank files) → optional sample world.

## 5 · Non-goals (binding)

- No online payments; no card data stored (R4). No auto-apply of anything (R16).
- No placing orders on aggregators; aggregator data is imported only. No WhatsApp integration (R5).
- No AU payroll or Single Touch Payroll; AU people pack = rosters only (R21).
- No offline sync engine in the Cup build — schema is offline-ready only (spec §5.4).
- No per-customer forks of product UI; bespoke frontends are separate SDK projects (R11).
- No real supplier negotiation; suppliers are simulated and labelled (R7).
- No market or "savings" claims beyond measured results on synthetic data (CLAUDE.md rule 5).
- No FalkorDB Graph Hacks work in this repo (R12).

## 6 · Headline numbers (spec §10; each produced by CI from seeded worlds, labelled synthetic)

| # | Number | Baseline | Source |
|---|---|---|---|
| N1 | ₹ found ÷ ₹ planted, plus false alarms | — (answer key) | `tools/worldgen` answer key vs findings |
| N2 | Answer accuracy with valid citations on 200 owner questions | plain retrieval (no snapshots, no validator) | `evals/qa` |
| N3 | Month-end close time | estimated manual time (stated as an estimate) | `evals/close` |
| N4 | LLM ₹ per outlet per month | naive design estimate (R3) | `intel_spend` |
| N5 | Forecast error (WAPE) | seasonal-naive | `evals/forecast` |

The deck leads with N1 and the deal-review refusal; a number that CI did not produce is never shown.

## 7 · Demo stories (spec §11)

S1 Morning brief → "why was this week bad?" fan-out with cited answer → shortfall → negotiation → one deal
refused by review → PO draft approved. S2 Margin leak: the best-seller loses money once waste and a
supplier price change count. S3 Month-end close on Swiggy/Zomato-shaped payouts + POS export, breaks
explained (lead with unapproved ad fees, R4 K9), P&L produced. Plus one beat: flip a fresh tenant from IN
to AU (R21).

## 8 · Cut ladder (decided calm; R18 means it is reverse wave order, not a descope)

Under pressure, the board stops at the last green wave. Within a wave, drop in this order: polish of
non-story dashboards → wiki versions/diff view → store pack depth (batches/expiry UI) → AU seeded world
(keep the flip) → voice (Gemini Live) → back-office art (fall back to the console view; traces stay real)
→ second graph adapter in CI (keep Spanner). **Never cut:** the One Guarantee gates, tenant isolation,
the W1 skeleton, simulation labels.

## 9 · Success metrics

Cup: live URL green through judging (19 Oct – 6 Nov) with seeded tenants; video < 3:00; N1–N5 reproducible
by `make eval`. Product (post-Cup, R4 §3): T1 interviews, T2 data access, T3 money found.
