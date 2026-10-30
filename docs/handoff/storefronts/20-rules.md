# 20 · Rules (hackathon and product)

These sites may be entered in the **Google AI Builder Cup** as part of Munim. Breaking an event rule can disqualify the
whole entry, so treat every line here as a hard requirement. Tick each one before you hand the work back.

## 1 · Event rules

- [ ] **Fresh code, written now.** Every file is written by you (or your AI assistant) for this project, during the
      event period. No templates, themes, starter sites, UI kits copied as source, or code copied from any other
      project or website. Open-source libraries installed as npm dependencies are fine (Next.js, React, Tailwind and
      the like); copying their source into the repo is not.
- [ ] **Original assets only.** Fonts must be SIL OFL (Bebas Neue, Anton, Inter, Montserrat are). No stock photos, no
      icon packs, no illustration packs, no third-party art, no AI-generated images taken from elsewhere. Draw the
      shapes and icons yourself as SVG or CSS (02 §6), and keep a dated log of them in the README: date, file, "drawn
      by hand for this project".
- [ ] **No copying of any reference site.** The style in 02 is described in words on purpose. Do not look up a site in
      that style and copy its code, layout measurements, images, mascots, wording or colour values.
- [ ] **Hosting.** Vercel is fine for this build. The final Cup submission must run on **Google Cloud** (Cloud Run), so
      use nothing that works only on Vercel: no `@vercel/*` packages, Vercel KV / Blob / Edge Config / Analytics,
      cron or rewrites that exist only in `vercel.json`, or edge-only APIs. `next build && next start` (or
      `output: "standalone"` in a container) must run the site unchanged.
- [ ] **No secrets in the repo.** `.env.local` is git-ignored; the mock keys may appear in the README (they are public
      test keys), real keys never.
- [ ] **Contributor and IP terms.** Before you start, the founder confirms with you the event's contributor rules and
      what happens to submitted code (the organisers and sponsors get rights over submitted materials). Do not start
      until that is settled.

## 2 · Everything is synthetic, and the site says so

- [ ] Every page shows **"Sample shop — orders are not real."** (top bar) and **"Demo: all data is synthetic.
      Payments are recorded, never processed."** (footer).
- [ ] Wherever payment is mentioned (checkout, tracker, footer): **"Recorded only — Munim does not process payments."**
      There are no card, UPI or wallet fields anywhere. Payment happens at the counter and is only recorded there.
- [ ] Donation recipients keep their "(synthetic)" name **and** a "Simulated recipient" label. The network total, when
      shown, always carries "Measured on synthetic data". The Cares page says "Check your local food-donation rules".
- [ ] Never imply real customers, real money, real suppliers or real donations, in copy, metadata, social-card text or
      the README.

## 3 · Numbers come from the API, never from the browser

- [ ] **Never add up money in the browser.** Every subtotal, discount, tax amount and total on screen is a field of the
      preview response (before placing) or the order response (after). No `+`, `-`, `*`, `reduce` or `sum` over a
      `_minor` value anywhere in the code. (Dividing by the currency's minor unit inside `formatMoney` is display only.)
- [ ] The cart badge shows a **count**; until a preview exists the cart says "Total at checkout".
- [ ] When the preview has `refusals`, **hide the totals** and show the refusal copy instead; "Place order" stays
      disabled until the list is empty.
- [ ] Copy is chosen by `reason_code` and `code` (01 §8.2). **Never show the server's `error.message`** or any other
      server text in an error state.
- [ ] Never type a price, tax rate, percentage or deal amount into the code or the UI. Deals have no percentage in the
      API: show their name and hours only.
- [ ] Format every amount with `Intl.NumberFormat` and the response's `currency`, and every time with
      `Intl.DateTimeFormat` and the outlet's (or listing's) `tz`. Never hard-code `₹`, `$`, `IST`, `AEDT` or an offset.
- [ ] Owner-entered text (`display_name`, `description`, Cares `label`) is plain text: render it as text, never through
      `dangerouslySetInnerHTML` or any raw-HTML path.

## 4 · Credentials

- [ ] The storefront key goes only in the `X-Munim-Storefront-Key` header; the guest token only in
      `X-Munim-Guest-Token`. Neither ever appears in a URL, a query string, a log line, an error report, an analytics
      event or a screenshot you send back.
- [ ] The guest token lives in `localStorage` under `munim.guest.<order_id>`, written **before** the tracker renders.
      `localStorage` holds only guest tokens and carts (ids and counts). The checkout attempt, which includes the
      shopper's name, phone and email, lives only in `sessionStorage` and is deleted on success or on any error that
      ends the attempt (01 §8.4). Nothing about the customer is stored anywhere else.
- [ ] Every 404 (bad key, bad token, not your order, unknown id) shows the one "This link isn't valid." page and never
      says which part was wrong.
- [ ] No `EventSource`. Live updates use the fetch-based reader in 01 §6.

## 5 · Writes

- [ ] Every id you create is a UUIDv7 from `uuidv7()`.
- [ ] One checkout attempt = one frozen request body (01 §8.3). Retries after a network error, timeout, 429 or 5xx send
      that same body; any change, or any other error, makes a new attempt.
- [ ] "Place order" is disabled while a request is in flight, so a double tap can never send two attempts.
- [ ] On a 429, wait `Retry-After` before retrying, and show the wait.

## 6 · Accessibility floor

- [ ] Text contrast ≥ 4.5 : 1; borders, focus rings and controls ≥ 3 : 1 (use the measured tokens in 02).
- [ ] Tap targets ≥ 48 × 48 px; inputs ≥ 16 px font (iOS zoom).
- [ ] Status never by colour alone; status changes announced with `aria-live="polite"`.
- [ ] `prefers-reduced-motion` turns off the bob, the marquee and the drawer slide.
- [ ] Works at 320 px wide and at 200 % zoom; full keyboard path from menu to placed order.
