# 00 — Event context: AI Builder Cup 2026

Source of truth: `../../hackathon/ai-builder-cup-2026/BRIEF.md` (verified 16 Sep 2026 against
aibuildercup.com and the binding T&C). Re-verify anything load-bearing before relying on it.

## Dates (IST)
| | |
|---|---|
| Registration | **Done** — team of 2 registered (confirmed by the user, 3 Oct 2026) |
| Submission closes | **Sun 18 Oct 2026, 23:59 IST** |
| Today (session date) | 4 Oct 2026 → **14 days** |
| Internal: core correct | ~8 Oct (cut agents, not the core, if missed) |
| Internal: deployed to public URL | **12 Oct** (D-007) |
| Internal: submit with buffer | 17 Oct |

## What is judged (FACT)
| Criterion | Weight |
|---|---:|
| Technical Merit & Gen AI Implementation | **40%** |
| Problem Alignment & Impact | 25% |
| Innovation & Creativity | 25% |
| UX & Solution Design | 10% |

A pre-finale scoring round picks the **top 50 teams** for a fully sponsored Singapore Grand Finale
(only 2 members per team travel). Prizes: $10K / $7K / $5K + four $2K awards (Best use of Google Cloud
AI tools, Most Impactful, Social Choice, Best UI/UX). Registrations were ~10,483 as of 16 Sep.

## Deliverables (FACT)
1. **Working deployed live URL** on Cloud Run / GCP / Firebase.
2. **Demo video strictly under 3 minutes**, public (YouTube / Vimeo / Drive).
3. **Public GitHub repo.**
4. **Deck as PDF.**
English only.

## Required technology (FACT)
Built on Google Cloud's stack; must integrate **Gemini/Gemma** or an agentic platform; must deploy on
**Cloud Run or Firebase/GCP**. A competing cloud is disqualifying. **No credits provided.**
Google DevRel's recommended path (verbal, not a written rule): **Gemini 3.x Flash → ADK → Cloud Run**,
with Firestore / Cloud SQL / BigQuery optional.

## Rules that bite (FACT)
- **Fresh code only; prior work disqualifies.**
- **IP:** organiser gets a **6-month right of first refusal** and a perpetual marketing licence; the
  T&C "shall prevail" over verbal statements (e.g. the livestream's "you own full ownership").
  The exact clause text has **not been re-read for this session** — see open question OQ-1.
- **Eligibility:** working professionals / entrepreneurs / startups, **21+, JAPAC-based**. One student
  disqualifies the whole team, reportedly even after shortlisting. One team and one theme per person.

## Pattern from past winners (INFERENCE from four editions)
Every winner is a **named product**, with a **specific operator persona** and a **quantified claim**
("cuts documentation time ~50%"). Generic "AI assistant for X" appears nowhere. A cement-plant
agent product and a legal-document RAG product each won a track in 2025.

## Theme
**Retail & Commerce — Intelligent Customer and Business Experiences.** (BFSI was considered and
rejected by the user — see decisions. Do not re-propose it.)

## Other live events (context only — not decided, not part of this build)
| Event | Deadline | Note |
|---|---|---|
| PayPal AI Hackathon (Devpost) | 12 Nov 2026, 12:00 PST | User registered. Open-ended; PayPal sandbox + any AI. Pre-existing code allowed if significantly updated. IP stays with the entrant. |
| Amazon Build/Ship/Shape | 24 Oct 2026, 00:30 IST | Alexa+ / MCP server track was the plan. No idea locked. |
| Nebius × NVIDIA | 30 Oct 2026, 22:30 IST | `second_brain` was the planned base. No idea locked. |
Candidate projects for those: `second_brain`, Sathi (the user wrote "Saarthi"; assumed = Sathi — unconfirmed).
Do **not** let anything from this build leak into those entries or vice versa without checking the rules.
