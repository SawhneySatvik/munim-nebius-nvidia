# NB-1b report

Files: `scripts/dev/nemotron-smoke.ts`, `docs/plan/lanes/COMMON.md`, this report.

**Smoke diff.** In the Ask step, before the abstention check, it reads the run's `intel.intel_spend` rows, prints
`ask ran on: <provider>/<model>, ...`, and fails `ask ran on <provider(s)>, expected <--provider>` on a mismatch. The existing
`--provider=` flag is the expectation (default nvidia); no new flag. Spend rows carry the provider the route trace names.

**Red-proof** (`--provider=nebius`, roles on nvidia):
```
  ask ran on: nvidia/nvidia/nemotron-3-ultra-550b-a55b, nvidia/nvidia/nemotron-3.5-lightning-30b-a3b
nemotron-smoke: FAIL — ask ran on nvidia, expected nebius
```
(exit 1 confirmed on the first run).

**Three PASS runs** (cobnut, default question, no restart of intel needed):
`nemotron-smoke: PASS — live nvidia Nemotron, every call served live` x3 (23.7 s ... 27.8 s, 1-2 resolved refs, nvidia Ultra + Lightning).

**Five questions** (live, intel at 80 s budget):

| Question | Result | Reason | s | Resolved refs |
|---|---|---|---|---|
| Below reorder (Cobnut) | answered | - | 48.3 | 2 |
| Net sales this week (Cobnut) | answered | - | 34.7 | 1 |
| Labour share last week (Cobnut) | answered | - | 58.0 | 2 |
| Expiry next 3 days (Cobnut) | answered | - | 27.3 | 8 |
| Swiggy payout, Indiranagar (blr_kitchen), run 1 | abstained | missing_ref | 80.1 | 0 |
| same, run 2 | abstained | missing_ref | 72.1 | 0 |

The Swiggy abstention is the A2 known miss (date window, no outlet handle; spend all nvidia). Not chased; the second run
was the same failure, so I stopped.

**COMMON.md:** added the nemotron-roles line to the Gates/stack notes.

**Not done:** no intel restart (not needed), no fix for the Swiggy path, no `.env` read, no git add/commit. The blr_kitchen
token was stale; I re-minted it with `restart-svc.sh tokens blr_kitchen`. Other lanes' modified files in the tree are not mine.
