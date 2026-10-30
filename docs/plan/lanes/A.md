# Lane A: Nemotron live + the `nebius` provider (P1), then the hero chain (P2)

Read `docs/plan/lanes/COMMON.md` first; its guard binds you. Report: `docs/plan/lanes/A.report.md`.

## Territory

`services/intel/**`; `packages/contracts/src/platform/**` and `packages/contracts/src/internal/**` (the provider enums);
the generated files `make contracts` rewrites; `packages/config/**` (key names only); `services/core-api/src/platform/**`
(provider validation only); new files `scripts/dev/nemotron-*.ts`; a synthetic invoice image under
`services/intel/tests/fixtures/` or an existing fixtures folder. **Not** `db/migrations` (the migrator agent adds `nebius`
to both provider CHECKs, applies it to the local DB and restarts core-api, in parallel with you).
**Order:** until `docs/plan/lanes/M.report.md` exists, do intel-only work (model-id probes, roles script, structured
output, the Python `nebius` provider and its test, fixtures) and **do not restart core-api or run `make contracts`**.
After it exists, do the contracts/config/core-api part, then `make contracts` (yours alone), then restart.
Not `apps/web`, not `tools/worldgen`.

## P1 — Nemotron live, end to end, on Cobnut

1. **Roles → Nemotron.** `platform.model_role` is changed by an operator config draft, not SQL: see
   `tools/worldgen/src/kit.ts` `aiRolePrices` (POST `/platform/v1/config-drafts` `{draft_id, target: "model_role:<role>",
   patch: {provider, model_id, input_price_per_mtok_minor, output_price_per_mtok_minor, price_currency}}`, then approve as
   operator). Write `scripts/dev/nemotron-roles.ts` (local only: refuse unless core-api /health says `idp: "local"`) with
   `--provider=nvidia|nebius`: router + narrate → a fast Nemotron (`nvidia/nemotron-3.5-lightning-30b-a3b` or
   `nvidia/nemotron-nano-3-30b-a3b`), reason → `nvidia/nemotron-3-super-120b-a12b`, extract + vision →
   `nvidia/nemotron-3.5-super-vl-120b-a12b`, embed → an NVIDIA embedding model only if Munim's embed role is used. Keep
   0 INR prices on the free NVIDIA key; the `nebius` mapping uses the Token Factory ids in `EVENTS-STATUS.md`. First
   confirm each id answers a one-line chat on the NVIDIA endpoint (load the key through `munim_intel.config`, never print
   it). Pick the ids that work and say which in the report.
2. **Structured output on OpenAI-compatible providers.** The live path was built for Gemini's `response_json_schema`;
   `decide/mimic.py` already uses OpenAI-style strict `json_schema`; `ingest/quarantine.py` passes `response_schema`.
   Make every structured call work on Nemotron through `nvidia`: send `response_format: {type: "json_schema", …}` (or
   NVIDIA's guided JSON if the endpoint needs it — verify live), then validate against the schema and retry once with the
   validation error before failing. Same contract tests as the Gemini path. Nemotron "reasoning" models may emit
   `<think>` text or a `reasoning_content` field: strip it before parsing, never surface it.
3. **`nebius` provider.** `providers.py`: `"nebius": Provider("NEBIUS_API_KEY", "https://api.tokenfactory.nebius.com/v1/")`;
   add `NEBIUS_API_KEY` to `PROVIDER_KEY_NAMES` in `munim_intel/config.py` and to `packages/config` if it lists provider
   keys; add `nebius` to `MODEL_PROVIDERS` (`packages/contracts/src/platform/index.ts:12`) and the enum at
   `packages/contracts/src/internal/index.ts:259`; core-api provider validation; `make contracts` to regenerate. **Never
   repoint `nvidia`.** Add a test that **fails if any model call leaves `api.tokenfactory.nebius.com` under the `nebius`
   configuration** (intercept the HTTP layer; prove it red by planting a call to another host).
4. **Recorded fixtures** for the Nemotron path so the gates run with `MUNIM_MODEL_MODE=recorded` (CLAUDE.md rule 17);
   no key, prompt secret or token in a fixture.
5. **Live smoke** (a script, e.g. `scripts/dev/nemotron-smoke.ts` or a pytest marked live and skipped without the key):
   on the local Cobnut, one Ask Munim question and one investigation run live; assert the trace/spend carries a Nemotron
   model id and the live served path (not the recorded fallback), and that the answer's numbers are resolved refs.
   Check the budget: a role with no INR price or a tenant with no `platform.llm_budget` row makes AI decline silently
   (template); Cobnut's seed set both for the current month — confirm.
- **Done when:** Ask + one investigation live on Nemotron locally with trace evidence; your package tests green; the
  recorded fixtures exist. Restart intel (and core-api if you changed it) with `scripts/dev/restart-svc.sh`; lane B is
  using the web at the same time, so restart only when needed.

## P2 — Hero chain on Cobnut (only after P1 is done with evidence)

A supplier invoice photo → Nemotron VL extracts it (quarantined path, no tools, rule 8) → the price of one staple is
checked through **Tavily** (no key tonight: a recorded response, labelled "recorded" wherever it shows; it enters
through the signal path and is cited, F-6) → Nemotron reasoning negotiates with the simulated suppliers (existing
`negotiate`) → Munim's deterministic deal check → a **purchase-order draft** the owner approves → the saving on that
line, cited. Make one synthetic, labelled sample invoice image (render HTML with headless Chrome at
`/Applications/Google Chrome.app`; "SAMPLE — synthetic" on it; a Cobnut supplier and real Cobnut staples).
- **Done when:** the chain runs live on Nemotron locally from that image; every number in the draft is a ref; a
  red-proof shows a forged number becomes "cannot verify". If P2 can't finish tonight, leave it in a clean,
  compiling state and report exactly where it stopped.
