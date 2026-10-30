# 02 — Product shape (as agreed in discussion, 4 Oct 2026)

**Not a spec.** This is the shared picture the next session starts from and is free to challenge.

## One line
An operating system for 2–5 outlet food groups: a deterministic core that is the single source of
truth, and seven AI agents that turn that data into decisions owners could never afford a data team
to make — proposing, never silently committing.

## Who it is for
Owners and outlet managers of small food groups (restaurants, cafés, QSR). No data team. Pain:
guessing what to prep and buy, not knowing true dish margin, supplier prices drifting unnoticed,
labour that does not match demand, month-end reconciliation by hand.

## Architecture (agreed principle)
```
Owner / manager  (daily brief · dashboards · voice/chat)
        │
  Agent layer:  Dish · Inventory · Finance · Analytics · Forecast · Procurement · Staffing
        │ read via typed tools                    │ propose commands
        ▼                                         ▼
  Deterministic core (system of record)
  orders/POS · menu & recipes · stock ledger · purchasing · simulated payments · finance/P&L · roles
  → validates and commits; refuses malformed or unsafe entries
```
Rule: **agents never write to the books directly.** Money / stock / price changes need owner
approval; low-risk actions (prep list, draft roster) may auto-apply.

## Core (deterministic)
- **Orders & POS:** counter/table entry, modifiers, split bills, shift close.
- **Menu & recipes:** recipe costing, stock-aware availability.
- **Stock ledger:** append-only movements; waste; inter-outlet transfers.
- **Purchasing:** POs, supplier price history, pooled purchasing across outlets.
- **Payments (simulated):** authorise, capture, refund, chargeback, settlement files with fees.
- **Finance:** per-outlet and group P&L.
- **Roles per outlet:** an outlet manager sees only their outlet.

## Surfaces
Staff POS · customer web/QR ordering (pickup, dine-in by table QR, delivery) · kitchen display ·
**owner home = daily brief + approval queue** · domain dashboards each with an agent panel ·
voice/chat available everywhere (Gemini Live). Import adapters for existing POS/aggregator data.

## The seven agents (all thin in v1, one shared framework)
| Agent | Job (draft) |
|---|---|
| Dish | True margin per dish (recipe cost + waste + price drift), classify, suggest price/bundle/cut |
| Inventory | Stock position, par levels, shrinkage and waste anomalies, transfer suggestions |
| Finance | Reconcile settlements to orders, explain breaks with cited rows, close the month, P&L |
| Analytics | Plain-language "why" behind trends across outlets, slots, channels |
| Forecast | Demand by outlet/day/slot (weather, events, history) → prep list + purchase list, with confidence |
| Procurement | Buyer agent negotiates with simulated supplier agents over A2A; pooled volume |
| Staffing | Labour need by slot from the forecast; draft roster; overtime/idle flags |

Plus a **review gate**: parallel reviewers check any proposed deal/commit against budget, margin,
past commitments and payment terms; every comment cites its source; says "cannot verify" instead of
guessing.

## The three demo stories (D-012)
1. **Monday-morning brief** (spine): forecast says Friday is busy and stock is short → procurement
   negotiates → the gate refuses one tempting out-of-policy deal → owner approves by voice.
2. **Hidden margin leak:** the best-seller is losing money once waste and a supplier price change count.
3. **Month-end close:** settlements reconciled to orders, breaks explained, P&L produced.

## What makes it different (INFERENCE — see 03-landscape.md)
Incumbents (Square AI, Shopify Sidekick, Toast, MarketMan…) are locked to their own platform and
mostly *advise*. Here: own system of record **plus** adapters, **many agents acting with a check on
their own actions**, pooled multi-outlet purchasing, and a refusal-first design.

## Claimable number (not yet chosen)
Candidates: forecast error vs a naive baseline; negotiated savings vs first quote (simulated
suppliers — state that); % of proposed actions caught by the gate; time to month-end close. Pick
**one** headline number plus an eval harness against a baseline.

## Time plan (draft)
| When | Goal |
|---|---|
| 4–6 Oct | Re-clear requirements; write full docs (HLD, LLD, DB, agents, plan, tickets) — **time-boxed ≤ 48 h** |
| 6–8 Oct | Core: schema, orders/POS, menu/recipes, stock ledger, purchasing; synthetic dataset |
| ~8 Oct | **Checkpoint: core correct.** If not, cut agents, not the core |
| 8–12 Oct | Agent framework + seven agents + review gate + A2A suppliers; surfaces |
| **12 Oct** | **Deployed to a public Cloud Run URL** |
| 12–16 Oct | Eval harness, polish, voice, demo script |
| 16–17 Oct | Video (<3 min), deck PDF, README, repo public, submit with buffer |
| 18 Oct 23:59 IST | Hard deadline |
