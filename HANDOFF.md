# HANDOFF — end of discussion session, 4 Oct 2026

Written for the session that picks this up. Read this, then `CLAUDE.md`, then `docs/`.

## Where things stand
- **Hackathon HQ** (`../hackathon/`): PromptWars (Sanad) and the Razorpay × Replit buildathon (Kosh)
  are **done** per the user; `hackathon/README.md` status board updated. AI Builder Cup registration
  is **done** (team of 2). Amazon and Nebius are still in progress with **no idea locked**. The user
  also registered for the **PayPal AI Hackathon** (deadline 12 Nov, 12:00 PST) — not yet added to the
  hackathon README calendar.
- **This build (AI Builder Cup, deadline 18 Oct 23:59 IST):** the user and I shaped the product through
  ten multiple-choice rounds. Ten decisions are logged (`docs/01-decisions.md`, D-001…D-015). **No
  code exists. No spec is ratified.** `docs/02-product-shape.md` is the agreed picture, not a spec.
- Product in one line: an operating system for 2–5 outlet food groups — a deterministic core
  (orders/POS, menu & recipes, stock ledger, purchasing, simulated payments, finance) with seven AI
  agents on top (Dish, Inventory, Finance, Analytics, Forecast, Procurement, Staffing) that propose
  and never write directly; owner approves money/stock/price changes.

## What the user asked for next
A fresh session, in this folder, that: **re-clears requirements → features → architecture → stack**,
then writes the **complete docs**: HLD, LLDs, DB design, agent designs, plan and ticket board. The
exact starting prompt is `INITIAL-PROMPT.md`. Time-box the docs phase to **≤ 48 hours** — the build
window is only 14 days and the user is mostly solo.

## How the user likes to work (observed)
- Decides for themselves. **Do not push to lock an idea** — I did, twice, and it annoyed them.
- Picks the widest scope every time. Lead with it, name the risk once, then commit and engineer for it.
- Hates generic/crowded choices (BFSI/fraud). Wants something genuinely useful and elaborate, fast.
- Answers option questions with free-text additions ("1, and 3; 2 is just a surface"). Read the
  whole answer. One question per message, multiple choice with a recommendation first, worked well.
- Terse and direct; frustration is a signal that I misread or over-steered. Own the error in one
  line and fix it — don't over-apologise.
- Writes "ORM" meaning (interpreted) an operations management system; unconfirmed (OQ-4).

## Mistakes already made (don't repeat)
1. Told the user I could not find "Saarthi" without mentioning that my grep did hit the string (it was a
   company name in a recruiting dataset). Report what you found, even when it is noise.
2. Recommended BFSI/fraud because of the user's Juspay job; they find it the most generic option.
3. Pushed toward a decision ("lock it in", "want me to draft the spec?") when the user was still
   deliberating.
4. Over-long option dumps early on. Keep answers tight; put detail in files.

## Things to be careful about
- **Fresh code only; GCP only** (CLAUDE.md). Nothing from `projects_26` repos, nothing from the
  inspirations, nothing Juspay-proprietary. Xyne is Juspay's product.
- The friend's repo was read through the user's `gh` access (private repo; README and model names
  only). Nothing was copied. Design your own schema.
- Supplier agents and payments are **simulated**; say so everywhere.
- **ROFR is unresolved** (OQ-1): read the clause before the user commits further, and draft the
  clarification email.
- Google's A2A purchasing-concierge codelab means the buyer/seller shape is not novel on its own.

## Open items carried over
See `docs/04-open-questions.md` (OQ-1…OQ-20). The five that block the architecture phase: OQ-1 (ROFR),
OQ-2 (name), OQ-3 (headline number), OQ-5 (teammate), OQ-6/7 (locale and languages).

## Files in this folder
```
README.md                  index
CLAUDE.md                  standing rules
HANDOFF.md                 this file
INITIAL-PROMPT.md          paste into the next session
docs/
  README.md                map of docs still to be written, with status
  00-context.md            event rules, rubric, deliverables, dates
  01-decisions.md          decision log D-001…D-015
  02-product-shape.md      agreed product shape (not a spec)
  03-landscape.md          competitors + sources + the gap
  04-open-questions.md     OQ-1…OQ-20
  05-ideation-trail.md     rejected ideas and how the idea evolved
```

## Side effects of this session outside this folder
- `../hackathon/README.md`: PromptWars and Razorpay marked done; AI Builder Cup registration noted.
- `../hackathon/ai-builder-cup-2026/IDEAS-smb-ops.md`: earlier, shorter write-up of the SMB-ops idea.
- `../hackathon/_meta/DECISIONS.md`: D-018 appended pointing here.
