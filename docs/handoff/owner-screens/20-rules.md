# 20 · Rules (hackathon and product)

The staff screens may be entered in the **Google AI Builder Cup** as part of Munim, like the storefront. Breaking an
event rule can disqualify the whole entry, so every line here is a hard requirement. The storefront pack's rules
(its `20-rules.md`, which you already follow) still hold; this file repeats the ones that bind the
staff screens and adds the rules for screens that show AI output and approve changes. Tick each one before you hand the
work back.

## 1 · Event rules

- [ ] **Fresh code, written now.** Every file is written by you (or your AI assistant) for this project, during the
      event period. No templates, admin themes, dashboard kits, starter POS or KDS apps, or code copied from any other
      project, repository or website. npm dependencies are fine; copying their source into the repo is not.
- [ ] **Your own art only.** New icons and shapes (ticket bell, approve tick, source chip mark, supplier van, donation
      basket, and so on) are drawn by you as inline SVG or CSS, in the style of `components/icons.tsx` and
      `components/art.tsx`. No icon packs, stock images, illustration packs or AI images taken from elsewhere. Add every
      new one to the README art log: date, file, what, "drawn by hand for this project".
- [ ] **No copying of any reference product.** Do not look up an existing POS, kitchen display, approvals inbox or AI
      chat product and copy its layout, wording, measurements, colours or flows. The screens in these files are
      described in words on purpose.
- [ ] **Hosting.** As before: nothing that runs only on Vercel (`@vercel/*`, KV / Blob / Edge Config / Analytics,
      Vercel-only cron or rewrites, edge-only APIs). `next build && next start` must run the app unchanged.
- [ ] **No secrets in the repo.** The mock's demo tokens are public test values and may appear in the README. Real ID
      tokens, tenant ids from a real deployment and any key the founder sends never go in the repo, a screenshot, a log
      or an issue.
- [ ] **No one's internal material.** Use public knowledge and the synthetic data in these files only. Do not model
      any employer's or third party's internal product, system, schema, partner terms or practices, in code, copy, docs
      or commit messages.

## 2 · Everything is synthetic, and the screens say so

- [ ] Every staff screen keeps the demo bar: **"Sample shop — orders are not real."** The staff shell adds the
      **"Demo sign-in"** badge whenever the person was signed in with the demo picker (02 §3.1).
- [ ] Wherever payment is recorded (the till's tender panel, an order's payments, a purchase order, a Cares offer
      price): **"Recorded only — Munim does not process payments."** There is no card number, UPI PIN, wallet or bank
      field anywhere. The till records what was paid at the counter; it never charges anything.
- [ ] Every supplier carries a **"Simulated supplier"** badge wherever its name appears: supplier lists, quote rows,
      a purchase order, a draft that names it. A supplier row without the badge is a bug.
- [ ] Every donation recipient keeps its "(simulated)" name **and** a **"Simulated recipient"** badge. Any impact or
      savings figure on Cares or Suppliers carries **"Measured on synthetic data"**. The Cares screen says **"Check
      your local food-donation rules"**.
- [ ] The demo people (owner, counter staff, kitchen staff) are invented. Never imply a real person, customer,
      supplier, recipient or amount of money, in copy, metadata or the README.

## 3 · The One Guarantee, as UI rules

Munim's one promise: **nothing changes the books without a named person's approval, and every number shown traces to
a ledger row.** On these screens that means:

### 3.1 Numbers

- [ ] **Never add up money or counts in the browser.** Every total, subtotal, tax, paid, remaining and change is a
      field of an API response. No `+`, `-`, `*`, `reduce` or `sum` over a `_minor`, `_milli` or count value anywhere.
      A badge count is a list length (`items.length`), shown as "N+" when `has_more` is true; never a server total you
      did not receive.
- [ ] **No number written by the AI is ever shown bare.** AI text (answers, findings, drafts) never contains digits;
      it carries refs like `⟨snap:ID·row·col⟩`. The screen replaces each ref with the cell it names, formatted by
      `formatCell` (01 §6), and puts a **source chip** beside it. Tapping the chip opens the **snapshot drawer** with
      the rows behind it (`GET /v1/snapshots/{id}`).
- [ ] **If a ref cannot be traced, show "Cannot verify".** A ref that is malformed, points to a snapshot that does not
      open (404), names a row or column the snapshot does not have, or appears in a draft's `unverified_refs`, renders
      as the "Cannot verify" chip in place of the value. Never fall back to any text the model wrote, and never guess.
- [ ] **Free digits in AI text are not shown.** If a segment's `text` contains a digit outside a ref, render the
      segment as "Cannot verify" (01 §6, `renderSegment`). This should never happen; the check exists so a bug can never
      put a model-typed number on screen.
- [ ] Owner home's figures (tickets today, net sales this week, waste this week, food shared this month) come only
      from snapshot cells the screen mints (01 §6) and carry their source chip like any AI number. A count of things is
      a list length ("Orders today" = `items.length` of `GET /v1/orders?business_date=…`, "N+" when `next_cursor` is
      set). **There is no "sales today" figure:** no snapshot gives one, and the browser must not add one up.

### 3.2 Changes

- [ ] **Nothing applies without a named person's approve.** An AI draft changes nothing until a signed-in person taps
      **"Approve"** (or **"Approve with my edits"**). There is no auto-apply, no "approve all", no timer, no default
      action. The button names the person: "Approve as Nandini Mehrotra (demo)".
- [ ] While a draft has any `unverified_refs`, **"Approve" is hidden** and each such field shows "Cannot verify".
      **"Approve with my edits"** becomes available only once the person has typed a value for every unverified field;
      those values are sent as `{ value, typed_by }` and labelled as theirs. Reject is always available. (A number
      that is a snapshot cell the person cannot open cannot be typed over, because core re-reads it on approve: then
      only Reject is offered, 01 §6.1.)
- [ ] The inbox list does not carry `unverified_refs`: open `GET /v1/drafts/{id}` before showing any approve button.
- [ ] Only a role that may decide the draft sees its buttons: core checks `drafts.approve.v1` **and** the draft's own
      command type (a Cares listing is owner and judge only). One module decides every draft (01 §6.1, 02 §5).
- [ ] **A person's edit is labelled as theirs.** When the approver changes a proposed number, the edited field is sent
      as `{ value, typed_by: <their member_id> }` and shown with "Edited by <name>" beside it, never mixed with the
      proposed value or its source chip. The proposed value stays visible, struck through, with its chip.
- [ ] Reject always asks for a reason (a reason code and a note); approve with edits asks for a reason too.
      Dismissing a finding asks for a reason code only: `findings.dismiss.v1` has no note field.
- [ ] Counter and kitchen actions (place an order, record a payment, accept, advance a ticket) are the person's own
      commands. They show the person's name in the shell, and every one of them is a command envelope (01 §4).

### 3.3 Text from the server or the AI

- [ ] **Never show a server or model `message`.** Error copy is chosen by `code` and `reason_code` (01 §9). The client
      drops `message` before your code sees it.
- [ ] AI segment text, finding text, owner-entered names and notes are plain text: rendered as text nodes, never
      through `dangerouslySetInnerHTML`, Markdown-to-HTML or any raw-HTML path.
- [ ] The cake message and other line notes are shown exactly as typed (plain text), large on the kitchen ticket.

## 4 · Credentials

- [ ] The member token goes only in `Authorization: Bearer <token>` and the tenant only in `X-Munim-Tenant`. Neither
      appears in a URL, query string, log line, error report, analytics event, screenshot or the README (the public mock
      demo tokens excepted), except the `inbox:<tenant>` stream topic, which core requires: the SDK sends topics in
      the stream's URL (01 §7; 00 §7 question 25).
- [ ] The session (token, tenant, member id) lives in `sessionStorage` only (01 §8). Signing out deletes it. The
      shopper's guest tokens stay where they were (`localStorage`, `munim.guest.<order_id>`); the two never mix.
- [ ] **A bad or missing member token is `401`; a token for someone with no membership in that tenant is `404`.** Treat
      `401` as "signed out" (back to the sign-in page) and any `404` on a member route as "not found or not yours":
      the one "This link isn't valid." page or an inline "Not found" state. Never say which part was wrong.
- [ ] A bad storefront key or guest token is still `404`, exactly as on the storefront.
- [ ] No `EventSource`. Live updates use the SDK's `openStream` with the bearer token and the tenant header (01 §7).

## 5 · Writes

- [ ] Every id you create (command ids, idempotency keys, order, line, tender, listing, PO ids) is a UUIDv7 from the
      SDK's `uuidv7()`.
- [ ] **One attempt = one frozen command envelope** (01 §4). A retry after a network error, timeout, 429 or 5xx sends
      the same envelope again (same `command_id`, same `idempotency_key`, same body). Any change to what the person
      confirmed makes a new attempt with new ids.
- [ ] Every action button is disabled while its request is in flight; a double tap can never send two attempts.
- [ ] A write that failed on the network never says "Nothing was changed": it may have reached core. It says "The
      connection dropped before Munim answered. Tap again: it's safe and won't happen twice." (01 §9
      `staffWriteErrorText`), and the next tap resends the same envelope.
- [ ] A `409` with a `reason_code` (a ticket another screen already moved, a draft someone else decided) is shown as
      its own copy and followed by a refetch. Never retry a `409` with the same body.
- [ ] On a 429, wait `Retry-After` before retrying, and show the wait.

## 6 · Accessibility and the floor

- [ ] Text contrast ≥ 4.5 : 1; borders, focus rings and controls ≥ 3 : 1. Use the measured pairs in 02 §2.
- [ ] Tap targets ≥ 48 × 48 px everywhere; on the till and the kitchen display, primary actions are ≥ 64 px tall.
      Inputs use ≥ 16 px text.
- [ ] Status is never colour alone: every ticket colour, order status, draft state and chip has a word.
- [ ] New tickets, status changes and approvals are announced with `aria-live="polite"`; the kitchen display's new
      ticket chime (if you add one) is off by default and has a visible toggle.
- [ ] `prefers-reduced-motion` turns off the ticker band, the drawer slide and any ticket pulse.
- [ ] Owner home and Ask Munim work at 390 px wide; the till and the kitchen display at 1024 × 768 and 1280 × 800
      landscape; every screen at 200 % zoom without losing an action.
