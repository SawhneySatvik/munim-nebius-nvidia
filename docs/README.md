# docs/ — map and status

## Current implementation guides

The hackathon-ready architecture deep dives are in [`architecture/README.md`](./architecture/README.md): system map,
AI/Nemotron roles, data and event flow, security/approvals, and Vercel/Supabase deployment. This guide follows current
implementation boundaries; the historical `plan/` corpus below is design history and can include superseded decisions.

Status: ⬜ not started · 🟨 draft · 🔍 in adversarial review · ✅ ratified by the founder

Authority order (Shipyard RULES §1): ledger > migrations/contracts (once they exist) > `plan/` > `specs/` > `research/` > history.

## Binding
| Doc | Status |
|---|---|
| `plan/00-decision-ledger.md` — R1–R25 | ✅ (each entry ratified on the day) |
| `DECISIONS.md` — append-only build journal | live |

## Planning corpus — pass 1 (R19)
| Doc | Status |
|---|---|
| `plan/01-pdr.md` | 🔍 |
| `plan/02-schema.md` | 🔍 |
| `plan/03-architecture.md` + `plan/adr/ADR-001…012` | 🔍 |
| `plan/04-agent-framework.md` | 🔍 |
| `plan/BOARD.md` (round 1) | 🔍 |
| `../CLAUDE.md` (operating manual) | 🔍 |

## Planning corpus — pass 2 (written while wave 1 builds)
| Doc | Status |
|---|---|
| `plan/packs/` — one spec per domain pack (watchers, findings, drafts, refusals) | ⬜ |
| `plan/05-stack.md` — versions pinned by live probe | ⬜ (needs founder GCP credentials) |
| `plan/06-events.md` — event catalogue (CloudEvents) | ⬜ |
| `plan/07-security.md` — threat model, prompt injection, roles | ⬜ |
| `plan/08-country-packs.md`, extensibility (API, webhooks, SDK, themes) | ⬜ |
| `plan/09-ingestion-wiki-retrieval.md`, cost model + budgets | ⬜ |
| `plan/screens/`, `plan/flows/`, `plan/design-system.md`, art direction | ⬜ |
| `plan/10-evals.md` — worldgen, ~40 planted problems, suites, CI thresholds | ⬜ |
| `delivery/` — demo script, deck outline, submission checklist | ⬜ |

## Research and admin
| Doc | Status |
|---|---|
| `research/R1–R3` | input (8 Oct) |
| `research/R4-verification.md` | ✅ committed 9 Oct |
| `admin/cup-tnc-snapshot-2026-10-09.md` | verbatim snapshot |
| `admin/rofr-clarification-email.md` | draft — **founder to send** |

## History (superseded)
`specs/2026-10-09-munim-design.md` (agreed design; ledger outranks it) · `00-context` … `05-ideation-trail` ·
`01-decisions.md` (D-001…D-019, pre-ledger log) · `../HANDOFF.md`, `../INITIAL-PROMPT.md`.
