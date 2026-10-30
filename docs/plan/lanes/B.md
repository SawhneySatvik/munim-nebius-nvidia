# Lane B: "which agent, which model" + Cobnut owner polish (P3)

Read `docs/plan/lanes/COMMON.md` first; its guard binds you. Report: `docs/plan/lanes/B.report.md`.

## Territory

`apps/web/components/staff/**`, `apps/web/app/staff/**`, `apps/web/lib/munim/**` (except `page-theme.ts`),
`apps/web/mock-server/**` (staff data only), `apps/web/tests/**` for what you touch, `.screenshots/EV-P3/`. **No changes to
`packages/contracts`, `services/core-api` or generated files tonight** (lane A owns `make contracts`). Use what the API
already returns; if the model isn't reachable from the web without an API change, show the agent only and write the
exact gap (which route, which field) in your report. **Not yours:** `apps/web/lib/site.ts`,
`apps/web/components/storefront-theme.tsx`, the shop pages (`app/(shop)`, `components/pages`), `app/layout.tsx`,
`globals.css` — lane C is making the brand per business there. Keep using `SITE` exactly as today. Nothing comes from
the `alexa` branch.

## P3

1. **Agent + model on every answer and draft.** In **Ask Munim** (`components/staff/pages/ask.tsx`,
   `lib/munim/ask.ts` `signatureWords`) and the **inbox** (`pages/inbox.tsx`, `pages/draft-detail.tsx`,
   `components/staff/decision.tsx`), show the agent (Manager, Stock & purchasing, Customers, Money, Compliance, Menu &
   recipes… — `specialistName`) **and the model that ran it**, e.g. "Stock & purchasing · Nemotron 3 Super · NVIDIA".
   Find where the run's model is recorded: intel writes spend records with `role`, `provider`, `model_id`
   (`services/intel/munim_intel/trace/spend.py`); the run's trace is `GET /v1/traces/:run`
   (`services/core-api/src/modules/traces/index.ts`). Use what the API already returns if it is enough. A small mapping
   in `lib/munim/models.ts` turns ids into names (nvidia/nemotron-3-super-120b-a12b → "Nemotron 3 Super",
   nemotron-3.5-lightning → "Nemotron 3.5 Lightning", nemotron-3.5-super-vl → "Nemotron 3.5 Super VL", gemini-2.5-* →
   "Gemini 2.5 …"; provider nvidia → "NVIDIA", nebius → "Token Factory", gemini → "Google"). Unknown id → show the raw
   id; no model recorded → show the agent only. **Never invent a model.** Lane A is switching Cobnut's roles from
   Gemini to Nemotron tonight; both must render.
2. **Polish the Cobnut owner surfaces** where the last session stopped: the Home brief (`pages/owner-home.tsx`), the Ask
   answer with citation chips, the approval flow (draft detail → approve/reject). Keep the existing design language
   (`app/staff/staff.css`, `components/ui.tsx`); improve hierarchy, spacing, empty and loading states, and the citation
   chips' readability. No wholesale redesign.
3. **States + screenshots** in `.screenshots/EV-P3/` (playwright-core with system Chrome at
   `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; use `domcontentloaded`, not `networkidle`): owner home;
   Ask question pending; Ask answer with agent + model + citation chips; an abstained answer ("can't verify"); inbox list
   with agent + model; draft detail; after approve; after reject; a **degraded mode** (AI off → the template, not an
   error, CLAUDE.md rule 11 — use the mock server `NEXT_PUBLIC_MUNIM_API` unset → `/mock`, or a test, rather than
   stopping intel). Phone width (390) and desktop (1440) for home and Ask. No console errors on any of them.
   Live screenshots: sign in through `/staff/demo-session` (owner); re-mint tokens with
   `scripts/dev/restart-svc.sh tokens cobnut` if sign-in starts failing after an hour.
- **Done when:** the screenshots exist; `pnpm --filter web test`, `typecheck` and `lint` pass; no console errors.
