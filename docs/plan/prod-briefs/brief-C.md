# Lane C — real-world parity in intel: negotiation trigger, recorded Cobnut fixtures, outlet on compliance findings

Repo: `/Users/satviksawhney/Downloads/projects_26/foodops-os` (read `CLAUDE.md`; it binds you).
SCRATCH = `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad`
Read `docs/plan/prod-briefs/interface.md` (lane rules, names). Read Lane B1's report `SCRATCH/reports/lane-B1.md` §5 (what
the real Cobnut world cannot produce, with file:line evidence) and the world `tools/worldgen/src/worlds/cobnut.ts`.

Territory: `services/intel/munim_intel/negotiate/**`, `services/intel/munim_intel/watch/**` (compliance mapping only),
`services/intel/fixtures/recorded/**`, a **new** router module in intel for the negotiation route (Lane B2 owns intel's
app/boot/config files — if you need a one-line include in `munim_intel/app.py`, report it and B2/orchestrator adds it),
`services/core-api/src/modules/purchasing/**` (the person's command that starts it), `packages/contracts/src/purchasing/**`
+ `make contracts` output (you are the only lane running `make contracts` now), core-api tests, intel tests. Lane B2 is
concurrently editing core-api boot/stream/internal sweep and intel config — do not touch those files.

## Work
1. **A person starts a negotiation.** Today no route starts one (`negotiate/run.py`, callers are tests). Add:
   - a member command in core, e.g. `purchasing.rfq.request.v1` (owner or manager, outlet-scoped; the person's own
     command — RFQs to **simulated** suppliers are not books, R22), taking an ingredient (or a below-reorder/shortfall
     finding) and the outlet ids it covers; core mints the run token and calls intel's negotiation route; core-api and
     intel keep every existing rule (run token carries tenant/outlets; intel writes only through `/internal/intel/v1`;
     quotes via `quotes:batch`; the PO comes back as a **draft** citing `purchasing.quote_compare` cells; nothing
     auto-applies);
   - the intel route running `negotiate/run.py` against suppliers-sim (simulated) in recorded mode;
   - contract + SDK (`make contracts`), tests incl. role/outlet refusals, idempotency replay, audit entry, red-proofs.
   - Founder Q16 (negotiation-run scope) is open: default = one ingredient, the person's chosen outlets within their scope;
     state it in your report.
   - With two outlets chosen, the PO draft's `outlet_ids` covers both — the real **two-outlet draft** for the gate demo.
2. **Recorded fixtures for Cobnut** (`MUNIM_MODEL_MODE=recorded` is how production runs until the founder sets AI
   prices, F-3): whatever the negotiation's model calls need, plus **Ask** answers for a short curated list of Cobnut
   questions (5–8, e.g. "Why was butter waste high at Hazratganj this week?", "Which ingredients are below reorder?",
   "What should the kitchen prep tomorrow?" → a prep-list draft, "How much did we donate through Cares?"). Every number in
   an answer must be a snapshot ref; follow exactly how existing recorded fixtures are keyed and validated (find the
   fixture key scheme and the recorder; never hand-write digits into prose). Report the exact question list (the Ask
   screen will offer them as suggestions).
3. **Compliance finding outlet:** Gomti Nagar's missing-licence finding carries `outlet_ids []` while its task draft is at
   Gomti Nagar (`watch/detectors/compliance/tasks.py:37`, `mapping/__init__.py:131`). When a compliance detection is about
   one outlet, the finding carries that outlet. Tests.

## Gates
- intel pytest, ruff, mypy; core-api vitest for purchasing + approvals; `make contracts` clean diff re-run (no drift);
  `make boundaries`; the intel red-proof suite still passes (`make intel-redproof`).
- End-to-end on a fresh local embedded PG + core-api + intel + suppliers-sim on ports **4350–4359** (never 8787/4102/3000;
  leave 8790/8081/8090 alone): seed `MUNIM_SEED_OPERATOR=1 make seed WORLD=cobnut`, sign in as Nandini, request quotes for
  hazelnuts for both outlets → PO draft appears with both outlets and traced qty/price → Farah (Gomti Nagar manager) sees
  it but core refuses her approval (403) → Nandini approves → PO row + audit entry under her name. Each Ask question
  returns a cited answer (no "cannot verify" unless designed).
- Guarantee scan, both clauses, stated.

No commits; never print tokens/keys; delete copies and token files. Report `SCRATCH/reports/lane-C.md`; final message ≤ 30
lines.
