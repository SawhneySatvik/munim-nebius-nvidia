# Flow — approve, edit or reject a draft

**Refs:** 03-arch §1.6 (draft lifecycle, conditional update, `based_on` re-check), §5.4; contracts
`commands/drafts.ts` (`drafts.approve.v1 {draft_id, edited_payload|null, reason|null}`, `drafts.reject.v1
{draft_id, reason 1–500}`), `public.ts` `DraftView`; ledger R15, R16, R26, R27. Screen: `screens/console-home-inbox-ask.md` C2.
**Draftable today (contracts):** `purchasing.po.create.v1`, `catalogue.price.set.v1`,
`inventory.reorder_level.set.v1`. D-1 proposes more (prep list, prep time, recipe, deal); each needs adding
to `DRAFTABLE` before its screen can work.

## Main path (approve as proposed)

| # | Screen | User does | API | User sees |
|---|---|---|---|---|
| 1 | Home / any | sees inbox row | `GET /v1/inbox` (+ SSE `inbox:<tenant>`) | "Price change · Paneer tikka · proposed by Catalogue" with impact ⟨snap⟩ |
| 2 | Draft detail C2 | taps "Review" | draft get — route not fixed — T-008 | WHY envelope; **full payload**; each numeric field = value + ref chip; "RELIES ON" cells |
| 3 | Rows drawer | taps a ref chip | `GET /v1/snapshots/{id}` | "Source rows", template id, minted time, rows — the ledger rows behind the number |
| 4 | C2 | taps "Approve" | `POST /v1/drafts/{id}:approve` `{edited_payload: null, reason: null}` | button → "Applying…" (`D-exec`) |
| 5 | core (server) | — | conditional `proposed → executing` (one winner); authority on final payload; re-run `based_on` templates; execute as approver with `app.decision_id`; audit; `executed` — one transaction | — |
| 6 | C2 | — | 200 `CommandResult` | "Approved by Meena at {time}. Applied." + link to the changed record (row) |
| 7 | Home | — | SSE `inbox:<tenant>` | row leaves the inbox; office: owner's-desk paper cleared |

## Edit then approve

| # | Screen | User does | API | User sees |
|---|---|---|---|---|
| E1 | C2 | taps "Edit" | — | proposed numeric values become inputs (≥ 16 px); refs stay visible beside them |
| E2 | C2 | changes amount | — | diff line "was {old} ⟨ref⟩ → now {new}" + label "Typed by Meena" |
| E3 | C2 | "Approve edited" (optional note "Why did you change it?") | `POST /v1/drafts/{id}:approve` `{edited_payload: {...}, reason}` | `D-exec` → "Approved with your changes." decision verdict `edited` |
| E4 | — | — | authority checked against the **edited** payload | if the edit exceeds the role's cap → `S-deny` "Your role can't approve this amount. An owner can." |

## Reject

| # | Screen | User does | API | User sees |
|---|---|---|---|---|
| R1 | C2 | "Reject" | — | sheet "Why are you rejecting this?" (required; "Reject" disabled until 1+ chars) |
| R2 | sheet | types reason, confirms | `POST /v1/drafts/{id}:reject` `{reason}` | "Rejected. The {pack} agent will see your reason." — reason appears in its track record (back-office B5) |

## Failure branches

| Case | Server | User sees |
|---|---|---|
| Stale (a `based_on` cell changed) | status `stale`; nothing executes | `D-stale` "This proposal is out of date: the numbers it relied on have changed." + what changed (old ⟨ref⟩ vs new value) + "Ask for a fresh proposal" |
| Concurrent decision | conditional update loses | `D-done` "Already decided by {name} at {time}." |
| Execution failed (e.g. price validity overlap) | status `failed`, rolled back | `D-fail` "Approved, but it could not be applied. Nothing was changed." + core error message (i18n) |
| Network lost after tap | — | `S-off`; "Retry" resends the same idempotency key → original result, never a double apply |
| Refs no longer resolve | — | `S-abst` on C2: numbers read "cannot verify"; Approve hidden; Reject available |
| Advisor / staff without authority | 403 | buttons hidden; direct call → `S-deny` |
| intel down | — | approval still works (needs only core — 03-arch §9) |

**Guarantee check (both clauses):** the only book write is step 5 under the approver's identity with a
decision id; every number on C2 is either a resolved ref (intel) or a value labelled "Typed by {name}".
