# 11 · Kitchen: the kitchen display

Read 00, 20, 01, 02 and 03 first. Everything here is **synthetic**: the bakery, the people, the orders and every
message on a cake.

| | |
|---|---|
| Route | `/staff/kitchen` |
| Who | Roles `owner`, `manager`, `staff`, `judge` (`can(session, "kitchen")`). On the mock: "Kavya Tandon (demo)" (kitchen, Cobnut Hazratganj), "Nandini Mehrotra (demo)" (owner, both outlets), and "Imran Siddiqui (demo)" can open it too (staff) |
| Outlet scope | The outlet chosen in the shell's switcher (`useStaff().outlet`). The board is for restaurants and cloud kitchens only; both Cobnut outlets are `restaurant` |
| Devices | A tablet on the wall or the pass, landscape: **1024 × 768** and **1280 × 800**, and 200 % zoom. Read at arm's length |
| AI | None. Every number is a field of `GET /v1/kitchen/board`, plus "still to pay" from `GET /v1/orders/{id}`. No source chips, and "Cannot verify" never appears (n/a, see §4) |

## 1 · Purpose

The kitchen sees every live ticket for its outlet:

- what to make, with each line's size, options and the customer's note (the message piped on a cake) large and
  boxed;
- how long the ticket has run, and whether it is on time, due soon or late;
- whether it is for now or for later.

One tap moves a ticket one step: "Start", "Ready", "Handed over". The order follows its tickets (core's rule): the
first ticket started makes the order "Preparing", all ready makes it "Ready", and all handed over makes it "Picked
up". Each tap is the person's own command (20 §3.2).

## 2 · Route and layout

`app/staff/kitchen/page.tsx` renders `KitchenPage` from `components/staff/pages/kitchen.tsx`. The working area has no
swash, no scallop and no ticker; the only decoration is the ticket colour (02 §1).

- **Header row**, under the staff bar: "Kitchen" (30 px), the station chips "All stations", "Kitchen", "Bar" (a
  radio group, one chip per `board.stations`, labelled by `stationLabel`), then on the right "Live" (a pill) or "Live
  updates are off. Tap Refresh to update.", "Refresh", and (mock only) **"Simulate a web order"**. At 1024 px it wraps
  to two rows when it must.
- **Two lanes** (`grid lg:grid-cols-[1fr_320px]`):
  - **"Now · {n}"**: the `kds-grid` of `TicketCard`s, in core's order (late first, then due soon, then by due time and
    ticket number). At 1024 × 768 that is two tickets a row; at 1280 × 800 two wider ones.
  - **"Later · {n}"**: a 320 px column of the scheduled tickets. Each one has a dashed edge (02 §7) and the caption
    "Pickup {time} · on the board from {time}" from `promised_at` and `surface_at`.
  - `n` is the lane's list length.
- **At 200 % zoom** (a 512–640 px viewport) Later drops under Now and every ticket is one column wide. No button is
  lost.
- **Ticket** (02 §7 `TicketCard`, with its `sizeOf` prop):
  - the head: "#{ticket_no}" at 32 px, then "Pickup · Web", "Takeaway · Counter" or "Table T4 · Counter"; on the right
    the elapsed minutes ("{n} min") and "On time", "Due soon" or "Late", each followed by " · due {time}" when the ticket has a due time;
  - the status pill ("Waiting", "Preparing", "Ready");
  - the lines: "{qty}× {item} · {size}" at 22 px, the options at 18 px, the note at 20 px bold in the accent box with
    quotation marks, exactly as typed;
  - one 64 px button: "Start", "Ready" or "Handed over" ("Saving…" while it runs).
- **"Not paid yet" dialog** (`dialog.modal`): "{money} is still to pay on order #{n}. Send the customer to the counter
  first." with "Not yet" (primary) and "Handed over anyway".

Times are `formatTime(iso, outlet.tz, "en-IN")`. Elapsed minutes are the board's `as_of` minus the ticket's
`started_at` (02 `elapsedMin`), never the tablet's clock.

## 3 · Data loading

All of it is in `useBoard` (§7.2):

1. **Names, once per outlet.**
   - `listChannels()`, then `getMenu(outlet.id, kind)` for every active channel kind (counter, own site). The board
     sends name keys only (`item.*`, `option.*`), and `namesFrom` maps them to display names. A key the menus lack
     falls back to `titleCase`.
   - If the menus fail, the keys still show as words.
2. **The board.** `getBoard(outlet.id, station ?? undefined)`. The station chip filters on the server (`station`);
   `board.stations` lists the stations of the outlet's live tickets whichever chip is chosen, so the chips stay.
3. **Sizes.** The board's lines carry **no variant**, so for every order not seen yet, `getOrder(order_id)` reads its
   lines and `sizesOf` names each line's variant from the menus. A failed read is tried again on the next refetch.
4. **Refetch** the board on:
   - every event of `kds:<outlet>` (ticket created or moved, order placed or changed, tender recorded) and every
     stream reopen;
   - every 30 s while the screen is visible, because colour and elapsed time are core's verdict at `as_of` and only a
     refetch moves a ticket from "On time" to "Due soon" to "Late";
   - the tab becoming visible again;
   - "Refresh";
   - after every step, whether it succeeded or was refused.

   A failed refetch keeps the last board on screen. Nothing is patched from an event.
5. **Before "Handed over":** `getOrder(order_id)` reads `remaining_minor`. If it is not 0, the dialog opens.
6. **Announcements.** After each refetch, `ticketNews(previous, next)` gives "New ticket 12" and "Ticket 9 ready" for
   the polite live region. The first board of a session announces nothing. No chime is added; if you add one, it is
   off by default with a visible toggle (20 §6).

The chosen station is kept in `sessionStorage` under `munim.staff.station.<outletId>` (an id, not a credential).

## 4 · States

| State | What shows |
|---|---|
| Loading | Four skeleton tickets at their final size |
| No outlet yet | `role="status"` "Loading" while `useStaff().outlet` is null, which is only while the shell loads the outlets (`outletsState: "loading"`). The shell shows a failed load ("Try again") and a person with no outlet ("You aren't set up at any outlet yet. Ask the owner.") in place of the screen (02 §3.1) |
| Empty | "Now · 0" with "No tickets right now."; "Later · 0" with "Nothing scheduled for later." |
| Error, no board yet | `staffErrorText(e, "kitchen")` + "Try again" |
| Error, board shown | The last board stays; 429 adds "Too many requests. Please wait a moment and try again." under the header and refetches once after `Retry-After` |
| Offline | `.offline-bar` "Offline. Showing the last board; changes will need a retry." (no connection, or the last refetch failed with `network`); the last board stays and its buttons still work: a step tried offline fails with "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." (a timeout may have reached core) and is resent unchanged on the next tap |
| Not found (404) | Full page "Not found." / "It may have been removed, or it isn't in your outlets." (an outlet outside the person's scope; never says which) |
| `not_applicable` (400) | Full page "No kitchen display" / "This outlet has no kitchen display." (a shop outlet) |
| 401 | `handleAuth`: signed out, back to `/staff/sign-in` |
| Role not allowed | Full page "Not for your role" / "The counter and the kitchen are for owners, managers and staff. Ask the owner if you need them." + "Go to your start page". A role core refuses gets 403 `authority_denied` on a step: "Your role can't do this. Ask the owner." |
| Ticket statuses | `queued` "Waiting" + "Start" · `preparing` "Preparing" + "Ready" (rose-berry) · `ready` "Ready" + "Handed over". Done tickets leave the board |
| Ticket colours | `normal` "On time" · `amber` "Due soon" (amber head, thicker edge) · `red` "Late" (red head, thicker edge), each with " · due {time}" when there is a due time. Never colour alone |
| Lanes | `now` in the grid · `later` in the Later column, dashed edge, with "Pickup {time} · on the board from {time}" ("Scheduled" when it has no promised time) |
| Kinds and channels | "Pickup", "Takeaway", "Delivery", "Table {t}" · "Counter" or "Web" |
| Options and notes | The options joined by " · " at 18 px; the note boxed at 20 px in quotation marks, plain text, `white-space: pre-wrap` |
| Size | " · 1 kg (serves 8–10)" after the item name once its order has been read; nothing while unknown |
| Saving | The pressed ticket's button reads "Saving…" and is disabled; other tickets stay usable |
| Stale step (409 `illegal_transition`) | Toast "Someone already moved this ticket. The board has been refreshed." and a refetch |
| Ticket gone (404) | Toast "This ticket isn't on the board any more. The board has been refreshed." and a refetch |
| Step 429 / 5xx | Toast with `staffErrorText(e, "kitchen")` ("Too many requests. Please wait a moment and try again." / "Something went wrong on our side. Try again."); the attempt is kept and the next tap resends it |
| Not paid yet | The dialog (§2) before a "Handed over" on an order with something left to pay; "Couldn't check whether order #{n} is paid." when the read failed |
| Live | "Live" pill while the stream is open. "Live updates are off. Tap Refresh to update." when it is refused or has retried for more than 5 s. The planned reconnect takes about a second and is not shown. The 30 s refetch keeps running either way |
| Simulated labels | The demo bar and the "Demo sign-in" badge (shell); "Simulate a web order" only with Mock controls on. No supplier, recipient or payment field appears here |
| "Cannot verify" | **n/a.** No AI text or AI number appears on the board. Every number is a field of the board or the order view |

**Contract notes the board lives with** (00 §7; don't work around them):

- **Kitchen ticket lines carry no `variant_id`.** The size is read from each ticket's order (`getOrder`), one read
  per order.
- **An order completes when its last ticket is handed over, paid or not.** That's why "Handed over" reads the
  order's `remaining_minor` first.
- The board sends name keys only; names come from the menus. Two different options sharing one name key would show
  the same name.
- `stations` lists only stations with live tickets (core and the mock alike). The board keeps the chosen chip even
  when it is absent.

## 5 · Actions

### 5.1 Advance a ticket

`POST /v1/kitchen/tickets/{id}:advance` with `kitchen.ticket.advance.v1` `{ticket_id, from_status, to_status}`, one
step forward (`TICKET_NEXT`): queued → preparing → ready → done.

- **Attempt rule** (`useAdvance`): the fingerprint is `[ticket_id, from_status, to_status]`.
  - After `network`, `rate_limited` or `server`, the same envelope is kept, and the next tap of the same button
    resends it. Core replays it if it had landed; it never moves twice.
  - Any other answer ends the attempt.
- **No optimistic update.** The ticket stays where it is, with "Saving…", until core answers. Then the board refetches
  and shows core's state.
- **409 `illegal_transition`** (another tablet, the counter, or the other station moved it first; or its order was
  cancelled): "Someone already moved this ticket. The board has been refreshed." and a refetch. A 409 is never
  retried with the same body.
- **404**: "This ticket isn't on the board any more. The board has been refreshed."
- **403 `authority_denied`**: "Your role can't do this. Ask the owner."

### 5.2 "Handed over"

First `getOrder(ticket.order_id)`:

- `remaining_minor` is 0: the step is sent at once.
- Something is still to pay: the "Not paid yet" dialog opens. "Not yet" closes it and nothing is sent; "Handed over
  anyway" sends the step.
- The read failed: the dialog says "Couldn't check whether order #{n} is paid." with the same two buttons.
- A 401 on the read signs the person out.

### 5.3 Station chips (no request beyond the refetch)

"All stations" sends no `station`; a station chip sends `station=<slug>`. The choice is per outlet and per browser
session.

### 5.4 Refresh

"Refresh" refetches the board now. It is always there, because a refused stream never retries.

### 5.5 Simulate a web order (mock only)

"Simulate a web order" (when `IS_MOCK` and `NEXT_PUBLIC_MUNIM_MOCK_CONTROLS=1`) calls `simulateWebOrder(session,
outlet.id)`. That is 03's `POST /v1/_mock/web-order`, never a Munim route. It places a pickup order on "Website
(pickup)" with two Hazelnut Croissants (kitchen) and an Oat Cold Coffee with the note "Less ice, please" (bar). Its
pickup is 15 minutes away (the outlet's prep time), so it appears in **Now** at once.

- Toast: "A simulated web order was sent to the kitchen." or "The simulated order didn't go through.", then a refetch.
- The live event announces "New ticket {n}".

On the real API there is no such button: a shopper's storefront order arrives by itself (the `[real]` check, §9).

## 6 · Copy

Literal strings. API-state copy not listed here comes from `staffErrorText` / `reasonText` (01 §9); ticket words come
from `TICKET_STATUS`, `TICKET_NEXT` and `TICKET_COLOUR` (01 §9) through 02's `TicketCard`.

| Where | Copy |
|---|---|
| Header | "Kitchen" · "All stations" · "Kitchen" · "Bar" (other stations title-cased) · group label "Station" · "Live" · "Live updates are off. Tap Refresh to update." · "Refresh" |
| Lanes | "Now · {n}" · "Later · {n}" · "No tickets right now." · "Nothing scheduled for later." · "Pickup {time}" · " · on the board from {time}" · "Scheduled" |
| Ticket (02) | "#{n}" · "Pickup" / "Takeaway" / "Delivery" / "Table {t}" · "Counter" / "Web" · "{n} min" · "On time" · "Due soon" · "Late" · " · due {time}" · "Waiting" · "Preparing" · "Ready" · "Start" · "Ready" · "Handed over" · "Saving…" · "{qty}×" · " · {size}" · "“{note}”" |
| Dialog | "Not paid yet" · "{money} is still to pay on order #{n}. Send the customer to the counter first." · "Couldn't check whether order #{n} is paid." · "Not yet" · "Handed over anyway" |
| Toasts | "New ticket {n}" · "Ticket {n} ready" (joined with ". " when several) · "Someone already moved this ticket. The board has been refreshed." · "This ticket isn't on the board any more. The board has been refreshed." · "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." |
| Full pages | "Not found." / "It may have been removed, or it isn't in your outlets." · "No kitchen display" / "This outlet has no kitchen display." · "Not for your role" / "The counter and the kitchen are for owners, managers and staff. Ask the owner if you need them." / "Go to your start page" |
| Banners | "Offline. Showing the last board; changes will need a retry." · "Try again" |
| Mock | "Simulate a web order" · "Sending…" · "A simulated web order was sent to the kitchen." · "The simulated order didn't go through." |

## 7 · Code

Save each block at its path. `lib/munim/kitchen.ts` is plain TypeScript. The page uses 02's `TicketCard` **with its
`sizeOf` prop** (02 §7), Cobnut's `ErrorNote`, `FullPage`, `Toast`, `useToast` and `useOnline`.
`components/staff/simulate.tsx` is the same file as in 10. Save it once.

### 7.1 The board's logic

```ts
// file: lib/munim/kitchen.ts
// The kitchen display's logic, with no React: display names for the board's name keys, each line's size (the
// board's lines have no variant, so it comes from the order), the two lanes, what to announce after a refetch, and
// the words for a refused step. Every number on the board is a field of GET /v1/kitchen/board.
import { titleCase } from "./format";
import { staffWriteErrorText } from "./staff-copy";
import type { MunimError } from "./client";
import type { Schemas } from "./types";

export type Board = Schemas["V1KdsBoard"];
export type Ticket = Board["tickets"][number];
type Menu = Schemas["V1CatalogueMenu"];
type Order = Schemas["V1Order"];

/** name_key -> display name, for items and options, from every menu loaded (counter and own-site); else a label
 *  for the key ("item.cardamom_knot" -> "Cardamom knot"). */
export function namesFrom(menus: readonly Menu[]): (nameKey: string) => string {
  const m = new Map<string, string>();
  for (const menu of menus) {
    for (const e of menu.entries) {
      if (e.display_name) m.set(e.name_key, e.display_name);
      for (const g of e.option_groups) for (const o of g.options) if (o.display_name) m.set(o.name_key, o.display_name);
    }
  }
  return (k) => m.get(k) ?? titleCase(k);
}

/** line_no -> the size ("1 kg (serves 8–10)", "Large") for an order's lines that have a variant. */
export function sizesOf(order: Order, menus: readonly Menu[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const l of order.lines) {
    if (!l.variant_id) continue;
    const e = menus.flatMap((m) => m.entries).find((x) => x.item_id === l.item_id && x.variant_id === l.variant_id);
    const name = e ? (e.variant_display_name ?? (e.variant_name_key ? titleCase(e.variant_name_key) : null)) : null;
    if (name) out.set(l.line_no, name);
  }
  return out;
}

/** The board's two lanes, each in core's order (red, amber, due time, ticket number). */
export function boardLanes(board: Board): { now: Ticket[]; later: Ticket[] } {
  return { now: board.tickets.filter((t) => t.lane === "now"), later: board.tickets.filter((t) => t.lane === "later") };
}

/** What changed since the last board, in words for the polite live region: "New ticket 12", "Ticket 9 ready".
 *  The first board of a session announces nothing. */
export function ticketNews(prev: Board | null, next: Board): string[] {
  if (!prev) return [];
  const before = new Map(prev.tickets.map((t) => [t.ticket_id, t]));
  const out: string[] = [];
  for (const t of next.tickets) {
    const was = before.get(t.ticket_id);
    if (!was) out.push(`New ticket ${t.ticket_no}`);
    else if (was.status !== "ready" && t.status === "ready") out.push(`Ticket ${t.ticket_no} ready`);
  }
  return out;
}

const STATION_LABEL: Record<string, string> = { kitchen: "Kitchen", bar: "Bar" };
export const stationLabel = (s: string): string => STATION_LABEL[s] ?? titleCase(s);

/** Copy for a failed ticket step. 404 = the ticket left the board. A `network` failure may have reached core (a 15 s
 *  timeout counts as one), so it says the same tap is safe: the retry sends the same envelope. */
export function stepErrorText(e: MunimError): string {
  if (e.kind === "not_found") return "This ticket isn't on the board any more. The board has been refreshed.";
  return staffWriteErrorText(e, "kitchen");
}
```

### 7.2 Hooks

```ts
// file: lib/kitchen-hooks.ts
"use client";
// The kitchen display's client hooks. useBoard keeps the last good board and refetches it on every live event of
// kds:<outlet>, on every stream reopen, every 30 s while the screen is visible (colour and timers are core's verdict
// at `as_of`, never the tablet's clock) and when the tab comes back. useAdvance sends one step per tap with the
// one-attempt rule and refetches after every answer; nothing is moved on screen before core says so.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MunimError } from "./munim/client";
import { envelope, retryable, type Envelope } from "./munim/commands";
import { boardLanes, namesFrom, sizesOf, ticketNews, type Board, type Ticket } from "./munim/kitchen";
import type { Session } from "./munim/session";
import type { StaffClient } from "./munim/staff";
import { watchFor } from "./munim/staff-app";
import { topic, type LiveState } from "./munim/staff-stream";
import type { Schemas } from "./munim/types";

type Menu = Schemas["V1CatalogueMenu"];
type Order = Schemas["V1Order"];
const POLL_MS = 30_000;

export interface BoardState {
  /** The last board core sent (kept while offline or after a failed refetch); null until the first one. */
  board: Board | null;
  /** The last refetch's failure, or null. A not_found / not_applicable error with no board is a full-page state. */
  error: MunimError | null;
  names: (nameKey: string) => string;
  /** The size of a line ("1 kg (serves 8–10)"), from the ticket's order; null while unknown or when it has none. */
  sizeOf: (orderId: string, lineNo: number) => string | null;
  live: LiveState;
  /** "Live updates are off": refused, or retrying for over 5 s (a planned reconnect takes about a second). */
  liveOff: boolean;
  lanes: { now: Ticket[]; later: Ticket[] };
  refresh: () => void;
}

export function useBoard(client: StaffClient, session: Session, outletId: string, station: string | null, onAuth: (e: MunimError) => boolean, announce: (lines: string[]) => void): BoardState {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<MunimError | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [orders, setOrders] = useState<Map<string, Order>>(new Map());
  const [live, setLive] = useState<LiveState>("connecting");
  const [stuck, setStuck] = useState(false);
  const last = useRef<Board | null>(null);
  const asked = useRef(new Set<string>());
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useRef(announce);
  const wake = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { say.current = announce; });

  // A new station starts a new board: nothing on it is "new" (no false announcements).
  useEffect(() => { last.current = null; }, [station]);

  // Names: once per outlet, from the menu of every active channel kind (the board sends name keys only).
  useEffect(() => {
    let alive = true;
    void client.listChannels().then(async (c) => {
      const kinds = c.ok ? [...new Set(c.data.channels.filter((x) => x.active).map((x) => x.kind))] : ["counter"];
      const got = await Promise.all(kinds.map((k) => client.getMenu(outletId, k)));
      if (alive) setMenus(got.flatMap((r) => (r.ok ? [r.data] : [])));
    });
    return () => { alive = false; };
  }, [client, outletId]);

  const refresh = useCallback(async () => {
    const r = await client.getBoard(outletId, station ?? undefined);
    if (!r.ok) {
      if (onAuth(r.error)) return;
      setError(r.error);
      if (r.error.kind === "rate_limited" && !retryTimer.current) {
        retryTimer.current = setTimeout(() => { retryTimer.current = null; void wake.current(); }, r.error.retryAfterMs ?? 5000);
      }
      return;
    }
    setError(null);
    say.current(ticketNews(last.current, r.data));
    last.current = r.data;
    setBoard(r.data);
    // Sizes: one order read per order not seen yet (the board's lines carry no variant).
    for (const id of new Set(r.data.tickets.map((t) => t.order_id))) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      void client.getOrder(id).then((o) => {
        if (o.ok) setOrders((m) => new Map(m).set(id, o.data));
        else asked.current.delete(id); // try again on the next refetch
      });
    }
  }, [client, outletId, station, onAuth]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first board loads when the outlet or station is known
    void refresh();
    const tick = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [refresh]);

  // Live: every event and every reopen is a wake-up to refetch. A refused stream keeps polling and the Refresh button.
  useEffect(() => { wake.current = refresh; });
  useEffect(() => watchFor(session, [topic.kds(outletId)], () => void wake.current(), setLive), [session, outletId]);

  useEffect(() => {
    if (live !== "retrying") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the stream recovered
      setStuck(false);
      return;
    }
    const t = setTimeout(() => setStuck(true), 5000);
    return () => clearTimeout(t);
  }, [live]);

  const sizeOf = (orderId: string, lineNo: number) => {
    const o = orders.get(orderId);
    return o ? (sizesOf(o, menus).get(lineNo) ?? null) : null;
  };
  return {
    board, error, names: namesFrom(menus), sizeOf, live, liveOff: live === "refused" || stuck,
    lanes: board ? boardLanes(board) : { now: [], later: [] },
    refresh: () => void refresh(),
  };
}

type AdvanceCommand = Envelope<"kitchen.ticket.advance.v1", Schemas["KitchenTicketAdvanceV1"]>;
export type AdvanceOutcome = { ok: true } | { ok: false; error: MunimError };

/** One step per tap, waiting for core's 200 (no optimistic move). The same envelope is resent after a network
 *  error, timeout, 429 or 5xx; a 409 (someone moved it first) or 404 ends the attempt, and the board refetches. */
export function useAdvance(client: StaffClient, refresh: () => void) {
  const attempts = useRef(new Map<string, AdvanceCommand>());
  const [busy, setBusy] = useState<string | null>(null);
  const advance = useCallback(async (t: Ticket, to: "preparing" | "ready" | "done"): Promise<AdvanceOutcome> => {
    const fp = JSON.stringify([t.ticket_id, t.status, to]);
    const body = attempts.current.get(fp) ?? envelope("kitchen.ticket.advance.v1", { ticket_id: t.ticket_id, from_status: t.status, to_status: to });
    attempts.current.set(fp, body);
    setBusy(t.ticket_id);
    const r = await client.advanceTicket(t.ticket_id, body);
    setBusy(null);
    if (r.ok || !retryable(r.error)) attempts.current.delete(fp);
    if (r.ok || r.error.kind !== "network") refresh();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }, [client, refresh]);
  return { advance, busy };
}
```

### 7.3 The kitchen screen

```tsx
// file: components/staff/pages/kitchen.tsx
"use client";
// /staff/kitchen: the kitchen display. Live tickets in two lanes (Now, Later), one station or all, one 64 px button
// per ticket for the next step. Every move waits for core's answer and is followed by a refetch; a move someone made
// first (409) says so and refreshes. No AI and no money on this screen except "still to pay" read from the order.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/lib/hooks";
import { useAdvance, useBoard } from "@/lib/kitchen-hooks";
import { formatMoney, formatTime } from "@/lib/munim/format";
import { stationLabel, stepErrorText, type Ticket } from "@/lib/munim/kitchen";
import { can } from "@/lib/munim/session";
import { reasonText, staffErrorText } from "@/lib/munim/staff-copy";
import { SITE } from "@/lib/site";
import { ErrorNote, FullPage, Toast, useToast } from "../../ui";
import { TicketCard } from "../kitchen-ticket";
import { useStaff } from "../shell";
import { SimulateWebOrder } from "../simulate";

const STATION_KEY = (outletId: string) => `munim.staff.station.${outletId}`;

export function KitchenPage() {
  const { session, outlet } = useStaff();
  if (!can(session, "kitchen")) {
    return (
      <FullPage title="Not for your role" action={<Link href="/staff" className="btn btn-primary">Go to your start page</Link>}>
        <p>The counter and the kitchen are for owners, managers and staff. Ask the owner if you need them.</p>
      </FullPage>
    );
  }
  if (!outlet) return <div className="state-box" role="status">Loading</div>;
  return <Board key={outlet.id} outletId={outlet.id} tz={outlet.tz} />;
}

function Board({ outletId, tz }: { outletId: string; tz: string }) {
  const { session, client, handleAuth } = useStaff();
  const online = useOnline();
  const [toast, say] = useToast();
  const [station, setStation] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
      setStation(sessionStorage.getItem(STATION_KEY(outletId)) || null);
    } catch {
      // storage blocked: all stations
    }
  }, [outletId]);
  const chooseStation = (s: string | null) => {
    setStation(s);
    try {
      if (s) sessionStorage.setItem(STATION_KEY(outletId), s);
      else sessionStorage.removeItem(STATION_KEY(outletId));
    } catch {
      // storage blocked: the choice lasts for this page only
    }
  };
  const b = useBoard(client, session, outletId, station, handleAuth, (lines) => { if (lines.length) say(lines.join(". ")); });
  const { advance, busy } = useAdvance(client, b.refresh);
  const [confirm, setConfirm] = useState<{ ticket: Ticket; text: string } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (confirm && !d.open) d.showModal();
    if (!confirm && d.open) d.close();
  }, [confirm]);

  const step = async (t: Ticket, to: "preparing" | "ready" | "done") => {
    const r = await advance(t, to);
    if (r.ok) return;
    if (handleAuth(r.error)) return;
    say(stepErrorText(r.error));
  };
  /** "Handed over" completes the order when it is the order's last ticket, paid or not: check the order first. */
  const onAdvance = async (t: Ticket, to: "preparing" | "ready" | "done") => {
    if (to !== "done") return void step(t, to);
    if (checking) return;
    setChecking(t.ticket_id); // the button reads "Saving…" while the payment is checked: a double tap sends nothing twice
    const o = await client.getOrder(t.order_id);
    setChecking(null);
    if (o.ok && o.data.remaining_minor === 0) return void step(t, to);
    if (!o.ok && handleAuth(o.error)) return;
    setConfirm({
      ticket: t,
      text: o.ok ? `${formatMoney(o.data.remaining_minor, o.data.currency, SITE.locale)} is still to pay on order #${t.ticket_no}. Send the customer to the counter first.` : `Couldn't check whether order #${t.ticket_no} is paid.`,
    });
  };

  const err = b.error;
  if (!b.board && err) {
    if (err.kind === "not_found") return <FullPage title="Not found."><p>It may have been removed, or it isn&apos;t in your outlets.</p></FullPage>;
    if (err.reasonCode === "not_applicable") return <FullPage title="No kitchen display"><p>{reasonText("not_applicable")}</p></FullPage>;
    if (err.kind !== "network") return <main className="staff-main"><ErrorNote>{staffErrorText(err, "kitchen")}</ErrorNote><button type="button" className="btn btn-plain mt-3" onClick={b.refresh}>Try again</button></main>;
  }
  const stations = [...new Set([...(b.board?.stations ?? []), ...(station ? [station] : [])])];
  const offline = !online || err?.kind === "network";

  return (
    <main className="staff-main-wide">
      {offline && <div className="offline-bar" role="status">Offline. Showing the last board; changes will need a retry.</div>}
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <h1 className="text-[30px]">Kitchen</h1>
        <div role="radiogroup" aria-label="Station" className="flex flex-wrap gap-2">
          <button type="button" role="radio" aria-checked={station === null} className="chip" aria-current={station === null ? "true" : undefined} onClick={() => chooseStation(null)}>All stations</button>
          {stations.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={station === s} className="chip" aria-current={station === s ? "true" : undefined} onClick={() => chooseStation(s)}>{stationLabel(s)}</button>
          ))}
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {b.live === "open" && <span className="pill pill-ready">Live</span>}
          {b.liveOff && <span className="text-[14px] text-muted">Live updates are off. Tap Refresh to update.</span>}
          <button type="button" className="btn btn-plain" onClick={b.refresh}>Refresh</button>
          <SimulateWebOrder onDone={(ok) => { say(ok ? "A simulated web order was sent to the kitchen." : "The simulated order didn't go through."); b.refresh(); }} />
        </span>
      </div>
      {err?.kind === "rate_limited" && <p className="pb-2 font-semibold">{staffErrorText(err, "kitchen")}</p>}

      {!b.board ? (
        <div className="kds-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-72" aria-hidden="true" />)}</div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
          <section aria-labelledby="lane-now">
            <h2 id="lane-now" className="pb-2 text-[22px]">Now · {b.lanes.now.length}</h2>
            {b.lanes.now.length === 0 ? <p className="state-box">No tickets right now.</p> : (
              <div className="kds-grid">
                {b.lanes.now.map((t) => (
                  <TicketCard key={t.ticket_id} ticket={t} asOf={b.board!.as_of} tz={tz} locale={SITE.locale} names={b.names} sizeOf={(n) => b.sizeOf(t.order_id, n)} busy={busy === t.ticket_id || checking === t.ticket_id} onAdvance={(x, to) => void onAdvance(x, to)} />
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="lane-later">
            <h2 id="lane-later" className="pb-2 text-[22px]">Later · {b.lanes.later.length}</h2>
            {b.lanes.later.length === 0 ? <p className="text-muted">Nothing scheduled for later.</p> : (
              <div className="grid gap-3">
                {b.lanes.later.map((t) => (
                  <div key={t.ticket_id} className="space-y-1">
                    <p className="text-[15px] font-semibold">{t.promised_at ? `Pickup ${formatTime(t.promised_at, tz, SITE.locale)}` : "Scheduled"}{t.surface_at ? ` · on the board from ${formatTime(t.surface_at, tz, SITE.locale)}` : ""}</p>
                    <TicketCard ticket={t} asOf={b.board!.as_of} tz={tz} locale={SITE.locale} names={b.names} sizeOf={(n) => b.sizeOf(t.order_id, n)} busy={busy === t.ticket_id || checking === t.ticket_id} onAdvance={(x, to) => void onAdvance(x, to)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <dialog ref={dialog} className="modal" aria-labelledby="unpaid-title" onClose={() => setConfirm(null)}>
        {confirm && (
          <div className="grid gap-4 p-6">
            <h2 id="unpaid-title" className="text-[28px]">Not paid yet</h2>
            <p className="text-[20px]">{confirm.text}</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary min-h-16 flex-1" onClick={() => setConfirm(null)}>Not yet</button>
              <button type="button" className="btn btn-plain min-h-16 flex-1" onClick={() => { const t = confirm.ticket; setConfirm(null); void step(t, "done"); }}>Handed over anyway</button>
            </div>
          </div>
        )}
      </dialog>
      <Toast message={toast} />
    </main>
  );
}
```

### 7.4 Mock button and page

```tsx
// file: components/staff/simulate.tsx
"use client";
// Mock only: the "Simulate a web order" button (03 §6). A shopper's storefront order cannot reach the mock kitchen
// (it lives in the shopper's signed token), so this places a synthetic pickup order at the chosen outlet. Never
// rendered against the real API, where real storefront orders arrive on their own.
import { useState } from "react";
import { IS_MOCK } from "@/lib/munim";
import { MOCK_CONTROLS_ENABLED } from "@/lib/munim/mock-controls";
import { simulateWebOrder } from "@/lib/munim/staff-app";
import { useStaff } from "./shell";

export function SimulateWebOrder({ onDone }: { onDone: (ok: boolean) => void }) {
  const { session, outlet } = useStaff();
  const [busy, setBusy] = useState(false);
  if (!IS_MOCK || !MOCK_CONTROLS_ENABLED || !outlet) return null;
  return (
    <button type="button" className="btn btn-plain" disabled={busy} onClick={async () => {
      setBusy(true);
      const ok = await simulateWebOrder(session, outlet.id);
      setBusy(false);
      onDone(ok);
    }}>
      {busy ? "Sending…" : "Simulate a web order"}
    </button>
  );
}
```

```tsx
// file: app/staff/kitchen/page.tsx
import { Suspense } from "react";
import { KitchenPage } from "@/components/staff/pages/kitchen";

export default function Page() {
  return <Suspense fallback={<div className="state-box" aria-busy="true" />}><KitchenPage /></Suspense>;
}
```

## 8 · What the mock gives the board

The seeded day (03 §4) is built from the clock on the mock's first request, so the times below are relative to that
moment. Restart `npm run dev` for a fresh day.

**Cobnut Hazratganj**

| # | Ticket(s) | Lane, colour, status | What to look for |
|---|---|---|---|
| 3 | kitchen | Now, "On time", "Ready" | Three cookies, paid by UPI: "Handed over" goes straight through and the order becomes "Picked up" |
| 4 | kitchen | Now, "Late", "Preparing" | Two mousse cups, unpaid: after "Ready", "Handed over" opens "Not paid yet" with "₹546.00 is still to pay on order #4." |
| 5 | kitchen | **Later** for its first 20 minutes, "Preparing" | Hazelnut Praline Cake · 1 kg (serves 8–10), "Eggless", the boxed note "Happy 60th, Nani! — with love, Zoya" |
| 6 | kitchen + bar | Now, "Due soon", "Waiting" | Two Cardamom Knots (kitchen) and a Cold Coffee with "Dairy" (bar): one ticket per station; it turns "Late" two minutes in, on the next refetch |
| 7 | kitchen | Later, "Waiting" | A Truffle Tin for a pickup three hours away |

**Cobnut Gomti Nagar** (Nandini, outlet switcher)

| # | Ticket(s) | Lane, colour, status | What to look for |
|---|---|---|---|
| 2 | kitchen | Later for its first 5 minutes, "Preparing" | Build-a-Box · Box of 9 with "Hazelnut praline · Salted caramel · Kesar badam · Ribbon and gift card" and the note "For Mr Rastogi — thank you for everything" |
| 3 | bar | Now, "Waiting" | Two Large Hazelnut Hot Chocolates |

## 9 · Acceptance checklist

`[mock]` = check on the extended mock · `[unit]` = a unit test or a stubbed response · `[real]` = only on the real API.

**Board and lanes**
- [ ] [mock] Signed in as "Kavya Tandon (demo)", `/staff/kitchen` shows "Cobnut Hazratganj", "Now" with tickets 4, 6 (two tickets) and 3 in core's order (late first), and "Later" with 5 and 7 on dashed tickets with "Pickup {time} · on the board from {time}". Lane counts equal the tickets shown.
- [ ] [mock] Ticket 5 reads "1× Hazelnut Praline Cake · 1 kg (serves 8–10)", "Eggless" at 18 px, and the note boxed at 20 px with its quotation marks and the em dash exactly as typed. Ticket 6's bar ticket reads "1× Cold Coffee" with "Dairy".
- [ ] [mock] "Bar" shows only bar tickets; "All stations" shows all; the choice survives a reload in the same tab.
- [ ] [mock] Ticket 6 turns from "Due soon" to "Late" about two minutes after the mock's first request without a reload (30 s refetch), and the elapsed minutes advance with each refetch; with the computer's time zone set to `America/New_York`, the due times still read in Lucknow time.
- [ ] [mock] As "Nandini Mehrotra (demo)" switching to Gomti Nagar shows ticket 3 at the bar and the Build-a-Box with all four options and the card message.
- [ ] [unit] A stubbed board with a `name_key` the menus lack shows its `titleCase` label; a stubbed `<b>x</b>` note renders as the literal text.

**Steps**
- [ ] [mock] "Start" on ticket 6's kitchen ticket shows "Saving…", then "Preparing" with "Ready"; the counter's list shows order 6 "Preparing" (live), and the bar ticket stays "Waiting".
- [ ] [mock] Ticket 3: "Handed over" sends the step at once (paid); the ticket leaves the board and order 3 reads "Picked up" on the counter.
- [ ] [mock] Ticket 4: "Ready", then "Handed over" opens "Not paid yet" with "₹546.00 is still to pay on order #4. Send the customer to the counter first."; "Not yet" sends nothing; "Handed over anyway" completes it.
- [ ] [mock] Kavya and Nandini on Hazratganj in two browsers: both tap "Start" on the same ticket; the second sees "Someone already moved this ticket. The board has been refreshed." and the ticket shows "Preparing". The request was not retried.
- [ ] [mock] Double-tapping "Start" sends one request.
- [ ] [mock] DevTools offline: the offline bar shows, the board stays; "Start" fails with "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice."; back online, the same tap resends a byte-identical body and the ticket moves once.
- [ ] [mock] Double-tapping "Handed over" on ticket 3 sends one order read and one step ("Saving…" covers the payment check too).
- [ ] [mock] Switching from "Bar" to "All stations" announces nothing (only tickets that are really new are announced).
- [ ] [mock] Mock controls "Force 429" on: the board stays with "Too many requests. Please wait a moment and try again." and recovers by itself about 5 s after it is switched off.
- [ ] [unit] A stubbed advance 404 shows "This ticket isn't on the board any more. The board has been refreshed." and refetches; a stubbed 403 `authority_denied` shows "Your role can't do this. Ask the owner."
- [ ] [unit] Stubbed board errors: 404 → "Not found."; 400 `not_applicable` → "No kitchen display"; a session with role `advisor` → "Not for your role".

**Live and the web order**
- [ ] [mock] A counter order placed on `/staff/counter` in another tab appears as a new ticket within a second, with "New ticket {n}" announced; "Live" is shown.
- [ ] [mock] "Simulate a web order" adds ticket {n} as "Pickup · Web" in Now (two tickets: croissants in the kitchen, the oat cold coffee with "Less ice, please" at the bar), "On time", due in 15 minutes.
- [ ] [mock] Blocking `/v1/stream` shows "Live updates are off. Tap Refresh to update." after about 5 s; tickets still appear within 30 s, and at once on "Refresh". The mock's planned reconnect (about every 50 s) shows nothing.
- [ ] [real] **Storefront → kitchen:** a shopper's order placed on Cobnut's storefront, pointed at the real API, appears on `/staff/kitchen` for that outlet within a few seconds as "Pickup · Web", with its options, size and note. No button press is needed. This can't be checked on the mock (a storefront order lives in the shopper's token, 03 §2), and member routes need the founder's answer on browser access first (00 §7 question 1).
- [ ] [real] On the real API `board.stations` lists only stations with live tickets; the chip row follows it and keeps a chosen station that has none.

**Quality**
- [ ] [mock] No `EventSource` (`grep -r EventSource app lib components` is empty); the token and tenant appear in no URL and no console line.
- [ ] [mock] At 1024 × 768 and 1280 × 800: ticket number 32 px, lines 22 px, options 18 px, note 20 px, every step button 64 px tall, every chip ≥ 48 px; at 200 % zoom both lanes stack and no button is lost.
- [ ] [mock] `prefers-reduced-motion` stops any ticket fade; colour is never alone (every head has its word); new tickets and "ready" are announced politely.

## 10 · Screenshots

Name them `staff-kitchen-<state>-<width>.png` at **1024** and **1280** (both widths for every state):

`loading`, `board-hazratganj`, `board-bar-only`, `ticket-cake-note`, `ticket-late`, `ticket-due-soon`,
`ticket-saving`, `stale-409`, `not-paid-yet`, `board-gomti-nagar`, `web-order`, `empty` (stubbed), `offline`,
`rate-limited`, `live-off`, `not-found` (stubbed), `not-applicable` (stubbed), `not-for-role` (stubbed).

No screenshot shows a token or a tenant id.
