# 30 · The AI contract (for completeness)

**Your storefronts do not call any AI route.** There is no AI on the customer ordering path: the menu,
prices, totals, tax and tracking are plain database reads. This page exists so you recognise AI output if the
mock or a later screen shows it, and so you never imitate it.

## The rule

Nothing changes the books without a named person's approval, and every number shown traces to a ledger row.
So:

1. **Numbers are never typed by a model.** An AI answer refers to a number as a reference, and the app
   substitutes the real value from a stored snapshot: `⟨snap:<snapshot id>·<row>·<column>⟩`. A source row
   is written `⟨cite:row:core.<table>:<id>⟩`. If a number in an answer has no resolvable reference, the answer
   is not shown as an answer.
2. **"Cannot verify".** When a reference is missing, forged, from another business, or its text does not
   match the source, the UI shows a block headed **"Cannot verify"** with a reason composed by core from a
   reason code, never model text. It is a calm "abstain" state, not an error.
3. **Drafts need approval.** AI never writes to the books. It proposes a *draft*; a signed-in person with
   authority approves or rejects it (`GET /v1/drafts`, `POST /v1/drafts/{id}:approve`, `POST /v1/drafts/{id}:reject`),
   and only then does core apply it under that person's identity. Nothing auto-applies in v1.
4. **AI degrades to hidden, never to an error.** If AI is off or over budget, its panel disappears.

## What you may see in a response

| Sighting | Meaning | Your handling |
|---|---|---|
| A value beside a `ref` (for example the Cares impact `{ value, ref }`) | The value was read from a snapshot cell | Show the value, keep the ref in `data-ref` and in a "Source" disclosure |
| `Cannot verify: …` | The system refused to show an unverifiable claim | Render as a neutral notice; do not retry in a loop |
| A draft id / "needs approval" | Proposal awaiting a person | Storefronts never act on drafts |

## What storefronts must never do

* Compute and display a total, tax, saving, discount or "you save" figure that did not come from the server.
* Render model- or user-generated text as HTML.
* Write copy that implies real suppliers, real recipients or real money: everything is simulated and every
  "meals" or "saved" figure is *measured on synthetic data*.

The AI-facing routes (`POST /v1/ask`, `/v1/threads`, `/v1/investigations`) are for the back-office console and need a
signed-in member; they are out of scope here.
