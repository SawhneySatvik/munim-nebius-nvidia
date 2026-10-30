# Lane B report: P3 "which agent, which model" + Cobnut owner polish

**Status: done, except the lint gate.** `pnpm --filter web lint` is red, and only because of the untracked `.next-*` dev
build directories; the one-line fix in `eslint.config.mjs` is under "Gates". The orchestrator's `make check` lint hits the
same failure, so don't read it as green. Every Ask answer, inbox finding, proposal, draft page, home-brief
item and purchase-order proposal now names its agent. The model is read from the run's trace and shown as a tag
("Nemotron 3 Super · NVIDIA", "… · Token Factory") **only when the trace names one**. Tonight no member-visible route
carries a model id, so the live screens show the agent alone. That is the rule in B.md ("no model recorded → show the
agent only"); no model is invented. The two gaps that would light the model tag up are listed under "API gaps". Neither
needs a web change beyond one line for Ask.

## Files changed or created (all lane B; commit exactly these)

Created:
```
apps/web/lib/munim/models.ts
apps/web/components/staff/run-by.tsx
apps/web/tests/models.test.ts
apps/web/tests/chips.test.ts
apps/web/tests/ev-p3-shots.ts
docs/plan/lanes/B.report.md
```
Edited:
```
apps/web/app/staff/staff.css
apps/web/components/staff/source.tsx
apps/web/components/staff/pages/ask.tsx
apps/web/components/staff/pages/inbox.tsx
apps/web/components/staff/pages/draft-detail.tsx
apps/web/components/staff/pages/owner-home.tsx
apps/web/components/staff/suppliers/po-draft.tsx
apps/web/lib/munim/drafts.ts
apps/web/lib/munim/refs.ts
apps/web/lib/munim/template-words.ts
```
**Not mine, though they sit in or near `apps/web`:** these are lane C's or the orchestrator's.
- `apps/web/lib/munim/page-theme.ts`
- `apps/web/lib/businesses/`
- `apps/web/tests/businesses.test.ts`
- `apps/web/lib/site.ts`
- `apps/web/app/{layout.tsx,globals.css,fonts.ts,(shop)/…}`
- `apps/web/components/{art,chrome,storefront-theme}.tsx`
- `apps/web/components/pages/*`
- `apps/web/AGENTS.md` (written by `next dev`; left alone)

No dependency added, so there is no change to the lockfile or `package.json`. `git status --short pnpm-lock.yaml` was
empty after the pnpm runs. No contracts, core-api, intel, migration or generated file was touched. Nothing was staged or
committed.

## What changed

**1. Agent + model (P3.1)**
- **`lib/munim/models.ts`** (new):
  - `modelName` maps ids to names:
    - NVIDIA endpoint and Token Factory spellings: Nemotron 3 Super, Ultra, Nano, 3.5 Lightning, 3.5 Super VL, 3.5 Embed.
    - Gemini ids by rule: `gemini-3.5-flash-lite` reads as "Gemini 3.5 Flash-Lite", and `gemini-2.5-*` would read as
      "Gemini 2.5 …".
    - An unknown id is shown raw.
  - `providerName`: nvidia → NVIDIA, nebius → Token Factory, gemini → Google.
  - `modelsOf(events, pack?)` names a model only from a `route` trace event that carries **both** `provider` and `model_id`
    labels **and** `model_path` = `live`. A `recorded-fallback` path shows "(recorded)"; an `abstained` path names nothing.
  - With `pack`, it keeps only that specialist's calls (`watcher:`, `specialist:` or `branch:<pack>`). This way a finding
    never borrows the model a sibling watcher used in the same sweep.
- **`components/staff/run-by.tsx`** (new): `<RunBy agent runId pack>` shows the agent with a desk mark, then the model tag
  once the run's trace names a model.
  - Traces are read once per run for every item on screen and reused for 30 s. A finding is stored before its narration's
    model call is traced, so the cache must not keep an early read for good.
  - It reads traces only for members with every outlet. core 404s a sweep's trace for a one-outlet manager (measured), and
    each 404 would be a console error. Such a member sees the agent alone.
- **Wired into:**
  - Ask answers: the signature, as the agent.
  - Inbox finding cards and proposal rows.
  - The draft page header.
  - The home brief.
  - The purchase-order proposal card (`suppliers/po-draft.tsx`): the P2 hero chain ends there.

**2. Owner polish (P3.2)**
- **Home brief** ("What needs you"):
  - It is now two groups: "To approve or reject · N" (proposals first, since they wait on a decision) and "What Munim
    noticed · N", most severe first. The sort is stable, so core's newest-first order holds within a severity.
  - Each finding shows its severity pill, its agent and its **impact with its source chip**, or "Cannot verify".
  - Title links are at least 48 px.
- **Ask:**
  - The pending card says who is reading ("The Manager is reading your books…", or the addressed specialist) and has
    skeleton lines.
  - A fully traced answer ends with "Every number here comes from your books: tap Source to open its rows." This shows
    only when at least one value is shown and nothing in the answer is "Cannot verify".
  - The AI-off state is a calm card with a second line about what still works (rule 11).
- **Citation chips:**
  - A value and its chip are one unbreakable pair (`.src-pair`).
  - Punctuation right after a value rides with the chip (`refs.ts` `withTrails`, unit-tested), so a line never starts with
    a lone "." under a chip. This was visible at 390 px before the fix.
  - AI text has a 1.85 line height, so chips don't crowd the lines.
  - Stat-card chips keep their spacing.
- **Approval flow:**
  - The draft page shows a **decided panel** where the buttons were: "Approved by <name> · <time>" (tinted OK), or
    "Rejected by <name>" with the reason.
  - Below it, what the decision did, taken from the draft **status** and never assumed from the verdict:
    - executed: "Applied. The change is in the books under their approval."
    - rejected: "Nothing in the books changed."
    - failed: "It was approved but could not be applied. Nothing changed."
  - A "·" separator now sits between the agent and the outlet.
- **Words:**
  - Every finding type intel emits (41, listed from `watch/detectors`) gets a plain title. This replaces "Labour pct high"
    and similar.
  - About 45 snapshot templates get plain words in the source drawer and "Based on". This replaces
    "catalogue.recipe_current: 2".
  - Recipe-draft field labels are fixed: "Waste pct bp (kg)" becomes "Waste allowance" (a rate gets no unit), and "Yield
    qty milli" becomes "Yield".
  - The new titles and template words also cover lane C's worlds.

## Gates (run for real; output verbatim, trimmed)

- **`pnpm --filter web test`**: `Test Files  13 passed (13)` · `Tests  149 passed (149)`, exit 0.
  - It includes `tests/models.test.ts` (9) and `tests/chips.test.ts` (3).
- **`pnpm --filter web typecheck`**: `$ tsc --noEmit`, exit 0.
- **`pnpm --filter web lint`**: **exit 1, and the cause is not lane B's source.** `eslint.config.mjs` ignores only `.next/**`.
  The per-world dev build directories get linted, about 5,800 problems each: `.next-cobnut`, `.next-blr_kitchen` and
  `.next-snacky_shack` (lane C's), and my temporary `.next-mockb` while it existed (now deleted).
  - Source only: `node_modules/.bin/eslint --ignore-pattern '.next-*/**'` gives
    `✖ 1 problem (0 errors, 1 warning)`, exit 0.
  - That one warning is pre-existing: `tests/traces.test.ts:62 'input' is defined but never used`.
  - **This also breaks the orchestrator's `make check` lint while any `.next-<world>` exists.** The fix is one line in
    `apps/web/eslint.config.mjs` `globalIgnores`: add `".next-*/**"`. That file is outside my territory, so I did not
    edit it.
- **Red-proofs** (each showed a non-zero exit, then green after restoring):
  - `models.test.ts`: planted a wrong name (Super → Ultra) and dropped the served-path gate. Result:
    `Tests  4 failed | 5 passed (9)`, exit 1. Restored: `9 passed`, exit 0.
  - `chips.test.ts`: planted `last.trail = ""`. Result: `Tests  2 failed | 1 passed (3)`, exit 1. Restored: `3 passed`,
    exit 0.
  - Screenshot gate, manager no-console-error check: removed the every-outlet gate in `RunBy`. Result:
    `FAIL manager manager-home: no console errors: 404 /api/v1/traces/01a16a67-… | 404 /api/v1/traces/01a16a59-…`,
    `ev-p3-shots: FAIL (2 failed, 2 passed)`, exit 1. Restored: `ok (4 checks)`, exit 0.
- **Trace labels pass core's schema:**
  - `TracePayload` from `packages/contracts/src/shared/trace.ts` accepts `{model_path, provider, model_id}` for all 12 ids
    in EVENTS-STATUS, in both NVIDIA and Token Factory casing (`ok` ×12).
  - A label with spaces is refused.
  - intel's `trace/buffer.py` `LABEL` is the same pattern.
- **Screenshot gate:** `node_modules/.bin/tsx tests/ev-p3-shots.ts --live=http://127.0.0.1:3000 --mock=http://127.0.0.1:3005
  --out=.screenshots/EV-P3` gave `ev-p3-shots: ok (42 checks)`, exit 0. It has a "no console errors" check per state.
  - The only browser lines it tolerates are the 503 the AI-off state makes on purpose.
  - `Failed to load resource` console lines are judged through the response check, which flags any unexpected 4xx/5xx.
  - The Next.js dev indicator (it shows "1 Insight", pre-existing, dev tooling) is hidden from the shots by CSS.

## Screenshots (`.screenshots/EV-P3/`, git-ignored; 18 files)

| State | File(s) | Source |
|---|---|---|
| Owner home (brief) | `home-1440.png`, `home-390.png` | live :3000 |
| Ask, question pending | `ask-pending-1440.png`, `ask-pending-390.png` | live (the ask call held 6 s in the browser, then sent) |
| Ask, abstained ("Cannot verify") | `ask-abstained-live-1440.png`, `ask-abstained-live-390.png` | live: a real abstention, `missing_ref` (intel has no fixture for it) |
| Ask answer with agent + citation chips | `ask-answer-1440.png`, `ask-answer-390.png`, and the chip opening its rows in `ask-source-drawer-{1440,390}.png` | mock :3005 (no live answer is non-abstained tonight). **Agent only, no model:** gap B |
| Inbox list with agent (+ model when traced) | `inbox-1440.png` | live. 22 agent lines, 0 model tags: gap A. Its findings are also rule 11's template fallback: their traces show `RecordedFixtureMissing` on narrate, so the cards show intel's template narration (`narrate/__init__.py`: the detector's prose with cited cells), not an error |
| Draft detail | `draft-detail-1440.png` | live |
| After approve | `after-approve-1440.png` | live |
| After reject | `after-reject-1440.png` | live |
| Degraded: AI off, the template line and not an error | `ask-ai-off-1440.png`, `ask-ai-off-390.png` | live, with `/api/v1/ask` answered 503 in the browser (intel was not stopped) |
| Manager (one outlet): agent only, no 404s | `manager-home-1440.png`, `manager-inbox-1440.png` | live |

**Model-tag CSS check only, not evidence:** there are three shots in which the browser added `provider`/`model_id` to
the live trace responses, so I could see the tag render. They are named `STUB-*` and kept in my scratchpad:
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-hackathon/21345af3-caf8-4ed4-af89-03fe79b85dcd/scratchpad/stub/`.
They show "Nemotron 3.5 Lightning · NVIDIA" and "(recorded)" tags. Do not use them as a live claim.

## How the model is sourced

The only member-visible place a model could appear is the run's trace (`GET /v1/traces/{run}`). Drafts and findings
carry `run_id`.
- **What the trace has today:**
  - intel traces `route {agent}` and, in live mode, `route {model_path: live|recorded-fallback|abstained}` per model call.
  - It traces no provider or model id.
- **Where the model id does exist:** intel's spend rows (`trace/spend.py`, `intel.intel_spend`), but no member route reads
  them. The platform `model_role` routes are operator-only.
- **What the web does:** it names a model only from a route event carrying `provider` + `model_id` with a live (or
  recorded-fallback, labelled) path. It never infers one from the role config, from timing, or from a sibling run.

## API gaps (exact)

**Gap A: drafts, findings, home, PO card.** No contract or core-api change is needed. It is lane A's to do.
- **Change:** every `route` trace event that carries `model_path` should also carry `"provider"` and `"model_id"`. Their
  values must equal **that call's spend row** (`trace/spend.py`). I have not checked that `self.state.meter` holds the
  right values for every fan-out branch.
- **The four sites that trace `model_path` today** (`grep -rn model_path services/intel/munim_intel`):
  - `trace/plugin.py:206`, `after_model_callback`: every ADK agent call. This covers the Manager, branches, narrations,
    and the negotiation chooser run through `run_agent`.
  - `trace/plugin.py:215`, `on_model_error_callback`: a recorded fallback, or an abstained call.
  - `ingest/quarantine.py:151`: extraction and vision.
  - `manager/ask.py:233`: the DecisionModel's routing call, on the ask's `route {intent, band, path, model_path}` event.
- **Actor rule (the web needs it, or a tag never shows on a finding or draft):**
  - A finding or draft is matched to its specialist's calls only, by the event's `actor`: `watcher:<pack>`,
    `specialist:<pack>` or `branch:<pack>`, where pack is the finding's `pack` or the draft's `source` `intel:<pack>`.
  - The negotiation already traces as `specialist:inventory_purchasing` (`negotiate/run.py:55`, `chooser.py:29`), so the
    PO card matches.
  - A call traced under `manager` names a model only on an Ask answer (gap B).
- **Then:** the inbox, the home brief, the draft page and the PO card show the tag with no web change.

**Gap B: Ask answers.** Contract + core-api; orchestrator / lane A, with `make contracts`.
- **Contract:** `packages/contracts/src/threads/index.ts` `AnswerView` has no `run_id`. Add `run_id: Uuid7.nullable()`.
- **core-api:** `services/core-api/src/modules/threads/index.ts`. `intel.answer` has `run_id`, and the `POST /v1/ask`
  handler already holds `claims.run_id` and selects with it. `answerViews` should return it.
- **Then, in the web,** one line in `components/staff/pages/ask.tsx` `TurnBlock`: `runId={null}` becomes
  `runId={a.run_id}`, with no pack, so all of the run's models show.
- **Widen one gate when `run_id` lands:** `RunBy` reads traces only for members with every outlet (a sweep's trace 404s for a
  one-outlet manager). A scoped member can read their own ask run, so the gate should then allow it, for instance by not
  gating Ask answers.
- **Without gap A,** gap B alone shows nothing.

## Open issues / for the orchestrator

1. **`scripts/dev/restart-svc.sh web …` breaks every staff screen in a browser.**
   - It hard-codes `NEXT_PUBLIC_MUNIM_API=http://127.0.0.1:8787`. core-api sends CORS only on storefront, stream and
     cares-network routes, so the browser's `GET /v1/me` is blocked. Sign-in silently stays on `/staff/sign-in`
     (measured).
   - **What I did:** restarted :3000 exactly as the script does (re-minted tokens with `restart-svc.sh tokens cobnut`,
     sourced `site.env`, same `.run/web.pid`/`web.log`, killed the old pid by PID). I changed only two values:
     `NEXT_PUBLIC_MUNIM_API=/api` and `MUNIM_API_ORIGIN=http://127.0.0.1:8787`. These are the same values the FalkorDB
     export's Makefile uses.
   - **Fix in the script:** the same two values (`MUNIM_API_ORIGIN=http://127.0.0.1:${PORT:-8787}`).
   - **Re-running the script as it stands re-breaks staff on :3000** (and on lane C's :3001/:3002). The shop `/` still
     answered 200 after my restart.
2. **eslint and the `.next-*` build dirs:** see Gates. Add `".next-*/**"` to `apps/web/eslint.config.mjs`.
3. **Local DB state I changed** (synthetic Cobnut, local only, all through the UI as the demo owner):
   - Three runs of the screenshot gate (one scratch, two into the evidence folder) **approved 3 and rejected 3 proposed
     `catalogue.recipe.version.create.v1` drafts**.
   - They also added about 6 Ask threads ("How did net sales go this week?").
   - Two recipe-version drafts are still proposed. The gate needs two per run, so a re-run after that fails its "two
     proposed recipe-version drafts" check rather than deciding a cares, campaign or task draft.
4. **Live Ask abstains tonight:** intel answers from recorded fixtures it doesn't have (`RecordedFixtureMissing`, trace
   seen). Once lane A runs live Nemotron, re-run the gate: it names the live answer state by what it shows.
5. **Not done:**
   - No model shown on Ask (gap B).
   - No change to `decision.tsx`: the bar needs no agent, and the draft page and PO card show it.
   - No Cares-proposal agent line.
   - No new numbers computed in the browser. The home's group counts are list lengths, like the inbox tabs and "Orders
     today".
6. **Cleanup (done, with output):**
   - **Mock server killed by PID:** `mockb pid 51224` · `mockb stopped` · `lsof :3005 exit 1 (1 = nothing listening)`.
   - **`.next-mockb` deleted:** `ls: …/apps/web/.next-mockb: No such file or directory`.
   - **`git status --short apps/web/tsconfig.json apps/web/AGENTS.md`** gives only `?? apps/web/AGENTS.md` (tsconfig clean).
     `next dev` edited tsconfig; I put it back from a clean copy taken before the start.
   - **Lint breakdown after cleanup:** `{ '.next-blr_kitchen': 5904, '.next-cobnut': 5837, '.next-snacky_shack': 5642,
     tests: 1 }`. Only lane C's build directories and the pre-existing test warning remain.
   - **Live :3000:** still answers 200.
   - **Next.js security-upgrade notice:** it appeared once. I did not run the upgrade (founder's decision).
7. **Latent wording:** "Every number here comes from your books: tap Source to open its rows" is exact for snapshot refs.
   A `⟨cite:…⟩` value (a quoted span) renders without a chip. Answers cite snapshot cells today (rule 3), so it doesn't show.
   Tightening `allTrace` to `parsed.kind === "snap"` would make the screenshots stale. Re-shooting would use the last two
   proposed recipe drafts, so I left it.

## Guarantee scan (both clauses)

- **Clause 1 (nothing changes the books without a named person's approval):** clean.
  - This lane adds no write path.
  - Approve and reject still go only through `DecisionBar` → `useDecision` → `POST /v1/drafts/{id}:approve|reject`, the
    person's own command with their name on the button.
  - The decided panel only reads the draft's status and decision.
  - Nothing auto-applies.
  - The screenshot gate's decisions were made in the UI by the named demo owner on the local database.
- **Clause 2 (every number shown traces to a ledger row):** clean.
  - **New figures:** the home brief's impact figures are `SourcedValue` from core's `resolved_refs` (snapshot cells), or
    "Cannot verify".
  - **Counts:** the group counts are list lengths of the inbox page, as the existing tab counts are.
  - **Model names:** they contain digits ("Nemotron 3.5"). These are config labels that intel copies from
    `platform.model_role` into traces, never model prose, and they are rendered as text nodes.
  - **Moved punctuation:** the moved characters are digit-free. The free-digit check in `renderSegment` runs before
    `withTrails`, so a model-typed number is still one "Cannot verify".
  - **"Every number here comes from your books":** shown only when no part of the answer is unverified.
  - **Channels:** traces are read as ids and labels only. No raw model text or server message reaches the screen. No key
    or token was printed, logged or written; tokens stayed in shell variables or scratchpad files.

## Fix cycle 1 (review findings: 2 major, 3 minor)

**Status: done.** All five findings are fixed. `test`, `typecheck` and `lint` pass. The mock part of the screenshot
gate passes (39 checks). Every new check was red-proved. Nothing above this section was rewritten. Where this section
disagrees with it, this section wins.

### The model rule (MAJOR 1); supersedes two earlier claims

Under "What changed", the earlier report said: "With `pack`, it keeps only that specialist's calls … a finding never
borrows the model a sibling watcher used". Under gap A, it gave an "Actor rule" (`watcher:`/`specialist:`/`branch:<pack>`).
**Both are withdrawn.** Inside one sweep, every finding and every sweep draft of a pack would have shown that watcher's
narration model, though only one finding was narrated. The new rule is `lib/munim/models.ts` `CallsFor`, and every
`<RunBy>` now has to say which one applies (`of`, a required prop):
- **Finding** (`{ finding: id }`): only route events whose labels include `finding_id` equal to that finding's id. Lane
  A's uncommitted intel change in the working tree adds exactly this label to narration calls (`narrate/__init__.py`
  `route_labels={"finding_id": …}`, `trace/plugin.py`). Until it lands, no finding shows a model. Low and medium
  findings are never narrated (`NARRATE_AT`), so they never show one.
- **Draft** (`{ draft: pack }`): only `specialist:<pack>` calls, meaning the negotiation that wrote a purchase order.
  - A sweep draft (`watcher:` calls), an investigation `branch:` call, a `manager` call, or a draft whose source is not
    `intel:<pack>` shows the agent only.
  - The negotiation's quarantined reply extraction also traces as `specialist:inventory_purchasing` (`ingest/quarantine.py`
    `_once`, `actor=ACTOR`). So a PO card names the extraction model and the chooser model. That is the rule as given;
    I added no filter beyond it.
- **Answer** (`"answer"`): every call of the run, with no filter. `ask.tsx` still passes `runId={null}` (gap B, unchanged).
- **One tag per model** (MINOR 2): `modelTags` replaces `modelWords`. Two spellings of one model on one provider give
  one tag.
- **Re-detection guard: not possible from the envelope.**
  - The template and the model narration are the same shape: one segment, with `refs` = the snap ids in its text.
  - core rewrites `envelope.finding_id` to the open finding's id on merge (`internal/writes.ts`), so the narration's
    own id never survives.
  - I built no text heuristic. The two cases are under residual risks.

### The mock (MAJOR 2)
- **`RUN.pooled` is now a seeded run with its own trace.** This is truer to the live API: a PO draft always has its
  negotiation run.
  - The run has scope `["*"]`, the same as its `purchasing.quote_compare` snapshot.
  - The trace runs shortfall → one simulated supplier → reply read (`recorded-fallback`) → quote compare → chooser
    (`live`) → the draft.
- **`tracesOf` returns `null` for an unknown run.** Before, any unknown run silently got the kitchen sweep's trace.
- **The other mock run ids** (inbox items: waste, kitchen, food-at-risk sweeps, nuts and pooled negotiations) all
  resolve now. A new vitest checks this through the mock's own API, so a future dangling id fails a test.
- **Mock traces now carry live-labelled model calls** (`provider`, `model_id`, as `trace/plugin.py` writes them):
  - The nuts negotiation: Super VL reads the replies, Nemotron 3 Super chooses.
  - The pooled negotiation: Super VL recorded, Super live.
  - One kitchen-sweep narration call that names no finding. Under the old rule it would have lit the cake finding and
    both kitchen drafts. Under the new rule it lights none, and the browser gate checks that.
  - These are mock fixtures, not a live claim.
- **`t128.test.ts`**: the owner now sees 6 seeded runs, not 5. The counter's 3 is unchanged.

### MINOR 1: the decided panel follows the draft's status
- `data-status={draft.status}` replaces `data-verdict`. Icon by status:
  - executed: check, ok tint.
  - failed: alert, `--late`/`--late-bg` tint.
  - executing: clock, plain.
  - rejected: close, plain.
- A failed draft is not green and has no check mark (shot `mock-after-failed-1440.png`).

### MINOR 3: the home counts only what this person may decide
- `drafts.ts` `notForYou(draft, me)` is lines 119–127 of `approveGate` lifted out. `approveGate` now calls it, so it is
  the same rule. `staff-gates.test.ts` is unchanged and green.
- The home lists and counts:
  - "To approve or reject · N": drafts with `notForYou === null`.
  - "For the owner to decide · M": the rest, shown last and only when there are any. For a manager, every `not_for_you`
    reason is "Only the owner can decide this one" (`gateLine`).
- The mock manager (Gomti Nagar) now sees the pooled order under "For the owner to decide · 1", and no "To approve or
  reject" (shot `mock-manager-home-1440.png`).

### Files changed in this cycle (all lane B; commit exactly these)
```
apps/web/app/staff/staff.css
apps/web/components/staff/run-by.tsx
apps/web/components/staff/pages/ask.tsx
apps/web/components/staff/pages/draft-detail.tsx
apps/web/components/staff/pages/inbox.tsx
apps/web/components/staff/pages/owner-home.tsx
apps/web/components/staff/suppliers/po-draft.tsx
apps/web/lib/munim/drafts.ts
apps/web/lib/munim/models.ts
apps/web/mock-server/staff-data-t128.ts
apps/web/tests/ev-p3-shots.ts
apps/web/tests/models.test.ts
apps/web/tests/t128.test.ts
docs/plan/lanes/B.report.md
```
**Not mine, and they are in the tree now:**
- `docs/plan/lanes/A.report.md` and everything under `services/intel/**` (lane A, uncommitted).
- `apps/web/AGENTS.md` (written by `next dev`).
- No `package.json`, lockfile, `tsconfig.json`, contracts, core-api, intel or migration change.
- `git status --short pnpm-lock.yaml apps/web/package.json apps/web/tsconfig.json` is empty.

### Gates (run for real)
- `pnpm --filter web test`: `Test Files  13 passed (13)` · `Tests  156 passed (156)`, exit 0.
- `pnpm --filter web typecheck`: `$ tsc --noEmit`, exit 0.
- `pnpm --filter web lint`: `✖ 1 problem (0 errors, 1 warning)`, exit 0. The warning is the pre-existing
  `tests/traces.test.ts:62 'input'`. Lint is green now that `eslint.config.mjs` ignores `.next-*` (9773c07, not mine).
- **Screenshot gate, mock part only:** `node_modules/.bin/tsx tests/ev-p3-shots.ts --mock=http://127.0.0.1:3005
  --out=../../.screenshots/EV-P3` gave `ev-p3-shots: ok (39 checks)`, exit 0.
  - `--live` is now optional. Without it, the live and manager states (which approve or reject live drafts) do not run.
    **The live part was not re-run.** The 2 proposed recipe drafts on the local Cobnut are untouched.
  - New mock checks, at 1440 and 390 unless marked:
    - Home, inbox and suppliers: no console errors.
    - Inbox: exactly 4 model tags, all on the two "A purchase order" rows (2 each). No tag inside any finding card.
    - Suppliers: 2 tags per PO proposal card.
    - Home, inbox and suppliers: no `.model-tag` past its card's content edge or the window.
    - 1440 only: the failed panel. Its words; background `rgb(251, 217, 211)` (`--late-bg`); no check-mark path; the
      alert path.
    - 1440 only: the mock manager's home.

### Red-proofs (each planted, run, then restored; restore verified by `diff` against a scratchpad copy)
- **`models.test.ts`, the old pack matching for findings** (any `watcher|specialist|branch:<pack>` call, with the pack
  taken from the finding's own trace event):
  - `× the narrated finding names its narration's model; its sibling of the same watcher and run names none`.
  - `Tests  1 failed | 13 passed (14)`, vitest exit 1. Restored: `14 passed`, exit 0.
- **`models.test.ts`, the old pack matching for drafts:**
  - `× the sweep's draft shows its agent only` and `× an investigation branch or the Manager answering does not lend its
    model to a draft`.
  - `Tests  2 failed | 12 passed (14)`, exit 1. Restored: `14 passed`, exit 0.
- **`models.test.ts`, the pooled run dropped from `seedRuns`:**
  - `× each finding's and draft's run answers 200` with `+ "019a0c5e-1834-7114-8d46-25f9af4cb503"`.
  - `Tests  1 failed | 13 passed (14)`, exit 1. Restored: exit 0.
- **`models.test.ts`, `modelTags` without the de-duplication:** `Tests  1 failed | 13 passed (14)`, exit 1. Restored:
  exit 0.
- **Screenshot gate, plant set A** (pooled run dropped; the old verdict-tinted panel; the old home count `toDecide = drafts`):
  - Result: `FAIL (13 failed, 25 passed)`, exit 1.
  - Console check: `FAIL 1440 mock inbox: no console errors: 404 /mock/v1/traces/019a0c5e-1834-…`. The same line fired
    for suppliers (1440 and 390), inbox at 390 and home at 390.
  - Also: `FAIL … mock manager home: the pooled order waits for the owner` and `… nothing for her to approve or reject`.
- **Screenshot gate, plant set B** (the old pack matching for findings and drafts; `white-space: nowrap` back; the old panel):
  - Result: `FAIL (5 failed, 33 passed)`, exit 1.
  - `FAIL 1440 mock inbox: model tags on the two purchase orders, two each: 7 tags on Change an item's prep time, A prep
    list, A purchase order, A purchase order, Tickets running past their prep time`.
  - `FAIL … no finding shows a model`.
  - `FAIL 1440 mock failed: not green, no check mark, the alert mark: {"bg":"rgb(225, 240, 220)","check":true,"alert":false}`.
  - `nowrap` alone did not overflow: one pill per model fits at 390.
- **Screenshot gate, plant set C** (the original layout: every model joined into one `nowrap` pill):
  - Result: `FAIL (7 failed, 32 passed)`, exit 1.
  - `FAIL 390 mock inbox: no model tag past its card: Model: Nemotron 3.5 Super VL (recorded) · NVIDIA + Nemotron 3
    Super · NVIDIA`. The same check failed on home and suppliers at 390.
- **Final green run**, on a fresh mock after every file was restored and after the last code change (the `modelTags`
  de-duplication): `ev-p3-shots: ok (39 checks)`, exit 0. The shots are 04:07; `models.ts` is 04:03.

### Screenshots (`.screenshots/EV-P3/`, git-ignored; all mock, from :3005)
- New:
  - `mock-home-{1440,390}.png`
  - `mock-inbox-{1440,390}.png`
  - `mock-suppliers-{1440,390}.png`: the 390 shot shows the tags one per line inside the card.
  - `mock-after-failed-1440.png`
  - `mock-manager-home-1440.png`
- Re-shot from the mock as before: `ask-answer-*` and `ask-source-drawer-*`.
- Live shots: unchanged from the first cycle.

### Residual risks
1. **A finding can show a model whose prose is not on screen.** The envelope cannot tell template prose from model
   prose. Two cases:
   - **(a) Re-detection.** A later sweep's merge puts the template back. core keeps the finding's first `run_id`
     (`internal/writes.ts`), and that run's trace still has the labelled narration call.
   - **(b) Refused or empty narration.** core refuses the prose (`number_grammar` and similar): the open finding keeps
     its template and core returns `abstained`. An empty narration is never posted. Either way, the labelled live
     route event exists.
   - **Fix (lane A or core, not web):** label the narration's outcome with `finding_id`, for example a `finding
     {finding_id, outcome: narrated}` event after the merge, and have the web require it. Or mark model prose in the
     envelope (a contract change). Or have core move `run_id` on a merge.
2. **The PO card names the extraction model too.** This is the literal `specialist:<pack>` rule (see above).
3. **The mock's failed state decides one of its two kitchen drafts per run.** The mock keeps its books per process.
   After two gate runs the check fails with "none left on this mock server: restart it", by design.
4. **Unchanged from the first cycle:**
   - The model tag shows only to members with every outlet.
   - Ask answers show the agent only (gap B).
5. **Not touched:** the office (`lib/munim/office.ts`) shows a model-call `route` event as "Writing the answer". This
   pre-existing wording now also appears for the mock negotiations' calls. It is outside these findings, so I left it.

### Cleanup (output)
- Mock server (`MUNIM_MOCK=1 NEXT_PUBLIC_MUNIM_API=/mock MUNIM_WEB_DIST_DIR=.next-mockb next dev -p 3005`):
  - Two starts stopped on the Next.js security notice and were re-run. I did not run the upgrade.
  - Each server that came up was killed by PID: `mockb pid 70887` · `mockb stopped`; `mockb pid 74166` ·
    `mockb stopped`; `mockb pid 76702` · `mockb stopped` · `lsof :3005 exit=1 (1 = nothing listening)`.
- `.next-mockb` deleted: `ls: .next-mockb: No such file or directory`.
- `tsconfig.json`: restored from a scratchpad copy after each `next dev` start. `git status --short
  apps/web/tsconfig.json` is empty.
- Live :3000: not restarted, still answers 200. No service was stopped. No seed was run, and the database was not
  touched.

### Guarantee scan (both clauses)
- **Clause 1 (nothing changes the books without a named person's approval):** clean.
  - No write path was added or changed.
  - `notForYou` is lifted out of `approveGate` unchanged, so the decision buttons follow the same rule.
  - The home's split only lists and counts.
  - The decided panel only reads the status.
  - The gate's forced `execution_failed` approve ran on the in-memory mock, by the named demo owner tapping "Approve as
    Nandini Mehrotra". Nothing ran on the local Cobnut database.
- **Clause 2 (every number shown traces to a ledger row):** clean.
  - No new figure.
  - Home group counts are list lengths of the inbox page, as before.
  - Model names are config labels from trace payloads, rendered as text nodes, never model prose.
  - Traces are read as ids and labels only.
  - No key or token appears in output, files or logs. The gate uses the mock's public demo token (`lib/munim/session.ts`).
