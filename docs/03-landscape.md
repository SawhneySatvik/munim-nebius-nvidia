# 03 — Landscape: what already exists

Researched 4 Oct 2026 by web search. `FACT` = from a cited page; `INFERENCE` = reasoning. These are
search-result summaries, not deep teardowns — **verify before quoting in the deck.**

## Incumbent small-business AI
- `FACT` **Square AI** — free, built into Square; uses local weather, nearby events, news and reviews to
  advise on staffing, inventory planning and menu decisions.
  [Square AI](https://squareup.com/ca/en/press/square-ai)
- `FACT` **Shopify Sidekick** — answers store questions and executes tasks; **Pulse** proactively
  surfaces recommendations; both free to merchants.
  [Shopify Spring '26](https://www.digitalapplied.com/blog/shopify-spring-2026-edition-sidekick-campaign-autopilot-ai)
- `FACT` **Restaurant ops AI** — Momos, Toast, 7shifts, Restaurant365, MarketMan, Lineup.ai and others
  cover forecasting, suggested ordering, labour, food-cost control.
  [Momos roundup](https://www.momos.com/blog/best-ai-agents-for-restaurant-operations)
- `FACT` **Oracle NetSuite Restaurant Operations** — enterprise AI ERP consolidating inventory,
  procurement, scheduling, production and cash.
  [analysis](https://www.houseblend.io/articles/netsuite-restaurant-operations-ai-erp-analysis)
- Toast IQ: not found in the search; unverified.

## Procurement negotiation
- `FACT` An established **enterprise** category (Pactum, Nibble, Keelvar); typical value 2–30% on
  negotiated spend; Walmart and Maersk use agents for tail-end vendors.
  [Gartner category](https://www.gartner.com/reviews/market/ai-agents-for-procurement),
  [IEEE Spectrum](https://spectrum.ieee.org/ai-contracts)
- No result targeted restaurants/ingredient ordering specifically (search limitation, not proof).

## Google's own A2A material (important for novelty)
- `FACT` Google publishes an A2A **"Purchasing Concierge and Remote Seller Agent"** codelab on Cloud
  Run and Agent Engine.
  [codelab](https://codelabs.developers.google.com/intro-a2a-purchasing-concierge)
- `FACT` Other samples: a Reservation Agent (restaurant table booking) with ADK session state; an LLM
  Auditor; a cross-language contract-compliance pipeline.
  [ADK + A2A codelab](https://codelabs.developers.google.com/adk-a2a-agent-runtime)
- `INFERENCE` Many entrants will start from the purchasing-concierge codelab. A bare buyer↔seller
  pair will not look novel to Google judges. The novelty has to be the **review gate**, the
  **data-first start** (forecast drives the order), and the **whole system around it**.

## The gap (INFERENCE)
1. Incumbents are **tied to their own POS/platform**; a shop on a custom site, spreadsheets or
   several tools gets nothing.
2. Incumbent assistants **advise**; few **act with a check on their own actions**.
3. Small **multi-outlet** groups are squeezed between single-shop POS assistants and enterprise ERPs.
   Pooled purchasing across 2–5 outlets is a real lever.

## Risks this landscape implies
- Crowded category → the first 20 s of the video must state the difference.
- "Seven agents" can read as seven chatbots → shared framework, citations, visible refusals.
- A2A procurement echoes Google's codelab → lead with the gate and the forecast-driven order.
