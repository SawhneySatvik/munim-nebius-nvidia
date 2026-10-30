# T-125 — live models with a recorded fallback (R56 G-4 amended)

Read `CLAUDE.md` (rules 3, 11, 13, 17, 19, 20; gotchas 4, 5, 25, 35, 36 bind you), ledger R25, R36, R45, R47, R56 G-4,
`docs/plan/04-agent-framework.md` (cite-or-abstain validator, traces) and plan 06's T-125 row.

## What
The Cup's live URL runs `MUNIM_MODEL_MODE=live` (Gemini free tier, the founder's key, spend cap per R47). In live mode, a
model call that **fails, is rate-limited (free-tier 429) or is over the cap** is served from the **recorded fixture when
one exists for that exact call** (the curated Ask questions and the negotiation's calls — Lane C/T-114 is adding Cobnut
fixtures right now under `services/intel/fixtures/recorded/` and `munim_intel/decide/fixtures/`). With no fixture, it
abstains exactly as today (rule 11: template, never an error state). The trace records which path served the call —
labels only (`live` / `recorded-fallback` / `abstained`), never untrusted text. The validator is unchanged: a recorded
answer passes cite-or-abstain like a live one. Gates stay `recorded`; the standalone Vercel deploy stays `recorded`.

Find how intel picks a model and how recorded mode keys and loads fixtures (`services/intel/munim_intel/llm/**` and
wherever `MUNIM_MODEL_MODE` is read); implement the fallback at that single seam (no second fixture loader). Model ids
come from `platform.model_role`; never a `gemini-2.5-*` id (rule 13); never install litellm or ADK extras.

## Tests (recorded-only; no network, no live call, no key)
- A planted 429 from the live client reaches the fixture for a call that has one → the recorded answer is returned and the
  trace says `recorded-fallback`.
- A planted 429 for a call with **no** fixture → abstains (the same output as today's degraded path), trace `abstained`.
- Over-cap (the R47 spend check) behaves like 429. A generic exception behaves like 429. A successful live call (stubbed
  client) is used as is, trace `live`.
- The fallback answer goes through the validator: a fixture with a free digit or a forged ref still → "cannot verify".
- Red-prove each (a non-zero exit when the fallback is removed or always taken).
- intel pytest, ruff, mypy green; `make intel-redproof` green; `make boundaries` green.

## Limits
Territory: `services/intel/munim_intel/llm/**` and the one seam that reads the model mode, plus new tests under
`services/intel/tests/`. **Lane C (T-114) is editing** `services/intel/munim_intel/negotiate/**`, `watch/**`,
`detect/__init__.py`, `app.py`, the fixtures directories, and core-api purchasing — do not touch those files; if your seam
is in one of them, report the exact change instead. Do not commit; no AI attribution in anything you write; never read
`.env`; no live calls; don't touch `uv.lock`/`pyproject.toml` (report dependencies). Ports 4390–4399 if you need any.

Report: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad/lane-T125.md`
(files, the seam, gate output, red-proofs, guarantee scan both clauses, what you did not do). Final message ≤ 20 lines.
