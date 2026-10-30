# 04 — Open questions

Resolve in the next session (requirements round). Log each answer in `01-decisions.md`.

## Blocking / high impact
| ID | Question | Why it matters |
|---|---|---|
| OQ-1 | **Right of first refusal:** what does the T&C clause say exactly (scope, trigger, duration, what counts as "the project")? Draft a clarification request for the organiser; the user sends it. | The user wants a real product; D-002 accepted the risk without reading the text. |
| OQ-2 | **Product name.** | Winners are named products; needed for repo, URL, deck. |
| OQ-3 | **Headline claimable number** (forecast error, negotiated savings, gate catch rate, close time). One number + baseline. | Judges reward a quantified delta; it drives the eval harness design. |
| OQ-4 | Is **"ORM"** = operations management system? (D-015, interpreted) | Terminology and scope. |
| OQ-5 | **Teammate:** what are they good at and how many hours? User says "mostly alone". Which lanes can they own, if any? | Lane planning and review capacity. |

## Product / scope
| ID | Question |
|---|---|
| OQ-6 | Currency, tax and locale: one at launch (which?), or multi-currency from day one? |
| OQ-7 | Languages for voice/chat: English only, or English + Hindi, or more? |
| OQ-8 | Customer-facing ordering: is delivery (own riders) in scope, or only pickup + dine-in QR + aggregator import? |
| OQ-9 | Aggregator import adapters: which formats do we mimic (generic CSV only, or Swiggy/Zomato/Uber Eats-shaped files)? Public formats only. |
| OQ-10 | Real pilot shop (with consent, no real data) or synthetic only? Impact narrative differs. |
| OQ-11 | Multi-tenancy: one demo group seeded, or live signup of new groups in the deployed demo? |
| OQ-12 | What is the minimum each of the seven agents must show to count as "real" (a refusal, a cited output, an eval)? |

## Technical (for the architecture phase)
| ID | Question |
|---|---|
| OQ-13 | Cloud SQL Postgres vs AlloyDB vs Firestore for the book of record; cost under "no credits". |
| OQ-14 | ADK version and A2A transport details to pin; what does the deployed supplier-agent topology look like on Cloud Run? |
| OQ-15 | Gemini model roles (reasoning / extraction / classification / embedding / live voice) and a live probe for ids rather than hard-coding. |
| OQ-16 | Auth: Firebase Auth / Identity Platform vs custom; roles per outlet. |
| OQ-17 | Realtime for KDS and brief (Firestore listeners? SSE from Cloud Run? Pub/Sub?). |
| OQ-18 | Forecasting method: classical (e.g. seasonal baselines in BigQuery ML) plus Gemini explanation, vs LLM-only. Must beat a naive baseline measurably. |
| OQ-19 | Synthetic dataset: 3 outlets × 6 months, planted anomalies for the three demo stories, generator seeded and reproducible. |
| OQ-20 | Weather/events enrichment: which public sources, and a fallback when offline. |

## Administrative
- Draft the ROFR clarification email (OQ-1).
- Decide what, if anything, of this carries to PayPal / Amazon / Nebius — **check each event's rules
  first**; this build is fresh-code-for-the-Cup and must not be double-counted without checking.
- Confirm "Saarthi" = Sathi for the other events (unrelated to this build).
