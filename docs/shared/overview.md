# Munim: what it is

Munim is an operating system for small restaurant groups, cloud kitchens and shops (two to five outlets). It runs the
day: orders at the till and on a web storefront, the kitchen board, stock, purchasing, ledgers, rosters, compliance and
customers. On top of that sits an AI layer that explains what happened, finds money that is leaking, and drafts the
actions a person might take.

India is the first market. Australia is a second country pack that the same code runs by configuration.

All data in the demo is synthetic. Suppliers are simulated programs. Payments are recorded, never processed.

## Two parts

**Munim Core** is the system of record. It is deterministic and has no AI inside it. It holds the books, takes orders,
checks permissions and publishes events. It exposes one public HTTP API, `/v1`.

**Munim Intelligence** is the AI layer. A Manager routes each question to one of eight specialists: Menu & Pricing,
Kitchen, Stock & Purchasing, Finance, People, Customers, Compliance, Market.
They read the business through snapshots that Core mints, answer with citations, and propose changes as drafts.
They never change anything themselves.

## The One Guarantee

> Nothing changes the books without a named person's approval, and every number shown traces to a ledger row.

*The books* are every record the business keeps: ledgers, stock, prices, the catalogue, rosters and payroll, customer
records, and messages to customers, staff or real outside parties. Changes to platform configuration are approved
drafts too.

*Traces to a ledger row* means the number on screen was rendered from a SQL snapshot cell that Core minted. A model
never types a number that a person reads. When a number cannot be traced, the screen says "Cannot verify".

The guarantee is held in more than one place, so a bug in one does not break it:

- the database refuses writes to book tables unless a person's own command or an approved decision is in force;
- the AI service has no database client, and the database roles it can reach have no write grant on any book table;
- API payloads, event notifications and error messages carry ids and fixed text, never raw model text;
- a draft is executed in one transaction with its audit entry, under the approver's identity.

Nothing auto-applies in v1. An investigation in Auto mode only re-runs read-only steps when new data arrives, under a
grant its creator gave; it creates no drafts and changes no book.

## What a person sees

- A **storefront** for customers: menu, a priced cart, pickup times, checkout, order tracking.
- **Staff screens** by role: the till, the kitchen board, the owner's home, an approvals inbox, Ask, investigations,
  the AI "office" with a page per specialist, suppliers and purchase orders, campaigns, and a storefront page builder.
- **Ask**: a question box. The answer is a few sentences, each carrying source chips that open the rows behind the
  numbers. Anything that cannot be traced is shown as "Cannot verify".
- **Supplier quotes**: a rule-bounded negotiation with simulated suppliers that ends in a purchase-order draft.
- **Munim Cares**: surplus food is listed for simulated community recipients. Impact figures are labelled as measured
  on synthetic data.

## What it does not do

- It does not process payments. A payment is a recorded fact.
- It does not send a message to a real customer, supplier or regulator on its own.
- It does not let the AI set a price, post a journal entry, change stock or edit a roster. It drafts; a person approves.
- It does not certify compliance or tax. It shows logs and figures from the books and says so.
