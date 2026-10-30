# 13 · Ask Munim

Read 00, 20, 01, 02 and 03 first, and save 12's `lib/munim/template-words.ts` (this screen's snapshot drawer uses it).
Everything here is **synthetic**. Ask Munim answers questions about the books in words. **Every number in an answer is a
snapshot cell with its source chip, or "Cannot verify".** When Munim cannot trace an answer, it says so instead of
guessing. Asking never changes the books.

| | |
|---|---|
| Routes | `/staff/ask`, `/staff/ask/[threadId]` |
| Who | Anyone signed in: owner, manager, staff, advisor, judge (`CAN.ask`) |
| New files | `lib/munim/ask.ts`, `components/staff/pages/ask.tsx`, two thin `page.tsx` (§7) |
| Uses | `useStaff()` (02 §3.1); `AiSegment`, `CannotVerify`, `SnapshotDrawer` (02 §4); `templateWords` (12 §7); `abstainText`, `specialistName`, `staffErrorText` (01 §9); `useOnline`, `useCountdown` (Cobnut's `lib/hooks.ts`); the staff client's `ask`, `listThreads`, `getThread`, `listSpecialists`, `getTenant`, `getSnapshot` |

## 1 · Purpose and who uses it

A person types a question ("How did the cake tickets go this week?") and Munim's **Manager** answers it. A question that
starts with **"@Name"** goes to one of the eight specialists, for example "@Kitchen …". Each answer is a list of
sentences.
- Every number in an answer is a ref to a snapshot cell. The screen shows the cell's value with a "Source" chip that
  opens the rows.
- A ref that does not trace shows "Cannot verify", and so does any sentence holding a digit the model typed.
- An answer Munim could not trace at all is an **abstention**: "Cannot verify" with the reason in words.

| Role | What they get |
|---|---|
| `owner`, `manager`, `judge`, `advisor` | Answers with values and chips (for the cells their role and outlets may open) |
| `staff` | The same screen. Core resolves an answer's refs only for a viewer who may open their snapshot, and every template an answer here cites is manager and up (only `cares.listings` is open to staff), so a staff member's answers show "Cannot verify" in place of each number, and the chip's drawer cannot open. The screen says so once: "Some numbers are shown only to managers and owners. Where you see Cannot verify, ask one of them." (The mock does the same.) |

**Outlet scope.**
- A new thread takes the asker's outlet scope. Its answers can only cite cells inside it.
- `GET /v1/threads` lists every thread **in the person's outlet scope**, a teammate's included. Those are marked
  "Started by a teammate" (the list carries the starter's member id, not a name). A thread scoped to every outlet is
  listed only to someone with every outlet. The mock does the same.

## 2 · Routes and layout

| Route | Component (§7) | Shows |
|---|---|---|
| `/staff/ask` | `AskPage` | The question box (a new thread) and the list of threads |
| `/staff/ask/[threadId]` | `AskPage` | One thread, its turns and the follow-up box. A `threadId` that is not a lowercase UUIDv7 shows "Not found." without calling the API |

Above every layout: the title "Ask Munim" (`.section-title`) and the scallop.

| Width | `/staff/ask` | `/staff/ask/[threadId]` |
|---|---|---|
| 390 px | One column: the question box first, then "Your questions" | One column: "← All questions", the conversation, the follow-up box. The list is hidden |
| 1024 px and up (`lg`) | Two columns: "Your questions" (320 px) on the left, the question box on the right | Two columns: the list (the current thread marked `aria-current`, with a "New question" button) and the conversation |
| 1280 px | As 1024, inside `.wrap` | As 1024 |

A turn:
- The person's question sits right-aligned in a `--bg-deep` bubble, under "You asked" (or "A teammate asked"), with
  " · to Kitchen" when the turn was addressed.
- The answer is a `.card` below it: the signature ("Kitchen · via Manager", or "Manager"), the sentences (one `<p>`
  each, via `AiSegment`), then any note and the follow-up button.

## 3 · Data loading

| When | Call | Notes |
|---|---|---|
| On load | `getTenant()`, `listSpecialists()`, `listThreads()` in parallel | The currency for `formatCell`; the "@Name" picker (the 8 with `kind: "specialist"`); the list |
| After `listThreads` | `getThread(id)` for the first 20 listed threads, in parallel | The list item has **no question text**; this reads each thread's first question for the row. A failed one shows the row without it |
| On `/staff/ask/[threadId]` | `getThread(threadId)` | The turns, each with `question`, `answer.envelope.segments`, `answer.resolved_refs`, `answer.signature` |
| On "Ask" | `ask({ question })` for a new thread, `ask({ question, thread_id })` in a thread (`deep: true` for "Dig deeper across specialists") | Not a command and **never retried automatically** (01 §5). 95 s timeout |
| After an answer | New thread: go to `/staff/ask/{thread_id}` (which calls `getThread`). In a thread: `getThread(threadId)`. Then `listThreads()` | The screen shows the stored turn, never a local copy |
| After a lost request (`kind: "network"`, including the timeout) | `findLostAnswer` (§7): `getThread(threadId)` and a turn count above the one before; or, for a new question, `listThreads()` and a thread of this person's that was not listed before | Looks, never resends. Core writes the turn (and a new thread) only after the answer is stored |
| "Refresh" (list or thread) | `listThreads()` / `getThread(threadId)` | |
| Chip tapped | `getSnapshot(snapshot_id)` (inside `SnapshotDrawer`) | 404 is "Cannot verify — These rows can't be opened." |

**There is no live stream on this screen.**
- `POST /v1/ask` returns no run id, so there is no `trace:` topic to follow (00 §7 question 11).
- No other topic carries answers.
- While the request is open, the screen shows a waiting state with the seconds counted locally. When the request
  answers, the screen refetches.

## 4 · States

| State | What shows |
|---|---|
| Loading the list | A skeleton block under "Your questions" |
| Loading a thread | A skeleton block in the conversation |
| No threads yet | "Ask about your sales, stock, kitchen or staff." |
| More threads than one page | "Older questions aren't listed here yet." (`listThreads` takes a `cursor`, but this screen reads one page) |
| Thread not found (404, or a malformed id) | `FullPage` "Not found." / "It may have been removed, or it isn't in your outlets." / "All questions" |
| List or thread failed | `staffErrorText(error, "ask")`; the thread view adds "Try again" |
| List failed on `/staff/ask` (a first question) | "Ask" stays disabled until the list loads: a lost first answer is found by comparing the list before and after. Under the box: `staffErrorText(error, "ask")` and "Try again" (`listThreads()` again). In a thread, a failed list never blocks "Ask" |
| Waiting (request open) | The question in its bubble ("You asked"), then a card: "Munim is reading your books…" (`role="status"`) and "{s} s · Answers can take up to a minute and a half. Asking never changes your books." The box is disabled; the button reads "Asking…" |
| Answered | The signature, then each sentence with values and "Source" chips |
| A number that does not trace | "Cannot verify" in place of that value (a ref missing from `resolved_refs`, a malformed ref, or a sentence with a free digit) |
| Abstained | "Cannot verify" + `abstainText(reason_code)`: `insufficient_history` "There isn't enough history to answer that yet." · `model_blocked` "Munim's AI is switched off or this month's AI budget is used up." · `not_applicable` "That question doesn't apply to the outlets you can see." · `number_grammar` / `unresolved_ref` / `cross_tenant_ref` / `missing_ref` "Munim couldn't trace every number in its answer to your books, so it didn't answer." · anything else "Munim couldn't answer that from your books." No sentences are shown |
| A turn with no stored answer (`answer: null`) | "Cannot verify" + "No answer is stored for this question." |
| A question not stored (`question: null`) | "The question wasn't stored." in the bubble |
| Tainted turn (`tainted: true`) | Under the answer: "This answer also read text from outside your books, such as a supplier's message. Its numbers still come only from your books." |
| Follow-up offered (`follow_up: "dig_deeper"`, last turn only) | Button "Dig deeper across specialists" |
| AI unavailable (503) | The box is replaced by the muted line "Munim can't answer right now. Past answers are still here." Not an error style. The list and past answers stay readable |
| Lost request, not found yet | `ErrorNote` "The connection dropped before the answer arrived. Munim may still be answering: tap Refresh in a minute before you ask again." The typed question stays in the box |
| Lost request, found | The thread opens (or refreshes) on the stored turn; the box is cleared |
| 429 | `ErrorNote` "Too many requests. Please wait a moment and try again." and "You can ask again in {s} s."; "Ask" is disabled until then; the question stays in the box |
| 403 (`forbidden`: a member with no outlets) | `ErrorNote` "Your role can't do this. Ask the owner." |
| 400 (`bad_request`) | "That didn't work. Please check and try again." The box already prevents empty and over-long questions, so this is a bug |
| Question too long (> 2000 after trimming) | `ErrorNote` "That question is too long. Keep it under 2000 characters." "Ask" is disabled. The count "{n} / 2000" shows from 1800 characters |
| Offline | `.offline-bar` "You're offline. Showing the last update."; "Ask" disabled (a question sent offline would only be lost) |
| Staff role | The line "Some numbers are shown only to managers and owners. Where you see Cannot verify, ask one of them." above the conversation |
| 401 anywhere | `handleAuth` signs out |
| Role not allowed | None: every role may ask (`CAN.ask`) |
| Simulated labels | The demo bar stays. An answer that names a simulated supplier or recipient names it as the snapshot holds it ("… (simulated)"); the drawer's foot says "Demo: all data is synthetic." |

**Who it goes to.** The line above "Ask" says where the question will go:
- "To: Manager", or "To: Kitchen" after a leading "@Kitchen".
- In a specialist's thread with no mention, it goes to that specialist.
- An "@word" that names no specialist reads "No specialist is called “@{word}”, so {Manager or the thread's
  specialist} will answer.", exactly as core routes it (`mention.ts`: an unknown name addresses no one).

## 5 · Actions

| Action | Request | Rule | After |
|---|---|---|---|
| "Ask" (or Enter in the form) | `POST /v1/ask` `{question}` or `{question, thread_id}` | Not a command, no idempotency key. One request per tap; disabled while one is open, while offline, during a 429 wait, when empty or too long, and (for a first question only) until the thread list has loaded (`findLostAnswer` needs it). **Never resent automatically**: a resend can add a second turn | §3. On 429 the person taps "Ask" again after the wait (core refused it before doing anything) |
| An "@Name" chip | none | Puts "@{Alias} " at the start of the box, replacing any mention already there (`withMention`): one of the specialist's own aliases, letters only, so core's rule matches it | The "To:" line updates |
| "Dig deeper across specialists" | `POST /v1/ask` `{question: <that turn's question>, thread_id, deep: true}` | As "Ask". Only on the last turn, only when its answer has `follow_up: "dig_deeper"` | A new turn in the same thread |
| A "Source" chip | `GET /v1/snapshots/{id}` | Read only | The drawer (02 §4) with the template in words |
| "Refresh", "New question", a thread in the list | Reads, or navigation | | |

There is no 409 handling on this screen: the ask route names none that a person can act on. Any 409 shows the generic
line. No optimistic turn is ever added: the waiting card shows the question, and the stored turn replaces it once the
thread is read back.

## 6 · Copy

| Where | Copy |
|---|---|
| Title | "Ask Munim" |
| List | "Your questions" · "Refresh" · "New question" · "Started by a teammate · {time}" · "Ask about your sales, stock, kitchen or staff." · "Older questions aren't listed here yet." |
| List row | `specialistName(specialist)` ("Manager" for the main conversation) · the first question (plain text) · `formatWhen(updated_at)` |
| Thread header | "A conversation with Kitchen" / "A conversation with the Manager" · "Refresh" · "← All questions" |
| Turn | "You asked" · "A teammate asked" · " · to {specialist}" · "The question wasn't stored." |
| Signature (`signatureWords`) | "{specialist} · via Manager" · "Manager" |
| No answer | "No answer is stored for this question." |
| Tainted | "This answer also read text from outside your books, such as a supplier's message. Its numbers still come only from your books." |
| Follow-up | "Dig deeper across specialists" |
| Waiting | "Munim is reading your books…" · "{s} s · Answers can take up to a minute and a half. Asking never changes your books." |
| Box | "Your question" (new) / "Ask a follow-up" (in a thread) · placeholder "How did the cake tickets go this week?" · "Ask a specialist:" · chips "@{specialist}" (accessible name "Ask {specialist}") · "To: {who}" · "No specialist is called “@{word}”, so {who} will answer." · " · {n} / 2000" · "Ask" · "Asking…" |
| Errors | "That question is too long. Keep it under 2000 characters." · "The connection dropped before the answer arrived. Munim may still be answering: tap Refresh in a minute before you ask again." · `staffErrorText(e, "ask")` · "You can ask again in {s} s." |
| AI unavailable | "Munim can't answer right now. Past answers are still here." |
| Staff | "Some numbers are shown only to managers and owners. Where you see Cannot verify, ask one of them." |
| Abstentions | `abstainText` (01 §9), always after the "Cannot verify" chip |
| Drawer | 02 §4 ("Where this number comes from", …), template words from `templateWords` |
| Specialist names | `SPECIALIST_NAME` (01 §9): "Manager", "Menu & Pricing", "Kitchen", "Stock & Purchasing", "Finance", "People", "Customers", "Compliance", "Market" |
| Not found / offline | "Not found." · "It may have been removed, or it isn't in your outlets." · "All questions" · "You're offline. Showing the last update." |

The question bubble shows the person's own words, as typed: plain text, digits allowed, since a person typed them.
The answer card shows **no model text except through `AiSegment`**, which renders only text parts, traced values and
"Cannot verify". The server's `message` is never shown.

## 7 · Code

```ts
// file: lib/munim/ask.ts
// Ask Munim helpers (13). Who a question will go to (core's leading-@Name rule, mirrored for the hint only: core
// decides), the answer's signature in words, and how to find out what happened to a question whose request was lost.
// That is always by looking, never by asking again: POST /v1/ask is not a command, and a resend can add a second
// turn. Plain TypeScript, no React.
import type { StaffClient } from "./staff";
import { specialistName } from "./staff-copy";
import type { Schemas } from "./types";

export type Specialist = Schemas["V1SpecialistsResponse"]["items"][number];
export type Thread = Schemas["V1Thread"];
export type ThreadItem = Schemas["V1ThreadsResponse"]["items"][number];
export type Turn = Thread["turns"][number];
export type Answer = NonNullable<Turn["answer"]>;

/** core's limit on a question (after trimming). */
export const QUESTION_MAX = 2000;

/** Only a LEADING @word counts; it ends at the end, a space, "," ":" or ";" (so "@b.c" is not a mention). */
const LEADING = /^\s*@([A-Za-z][A-Za-z0-9_]*)(?=$|[\s,:;])/u;

/** Who this question will go to: a specialist id, or "manager". `unknown` is an @word that names no specialist
 *  (core then answers as if there were no mention). In a specialist's thread, a question with no mention goes to
 *  that specialist. */
export function addressee(question: string, specialists: readonly Specialist[], threadSpecialist: string | null): { to: string; unknown: string | null } {
  const m = LEADING.exec(question);
  const fallback = threadSpecialist ?? "manager";
  if (!m) return { to: fallback, unknown: null };
  const hit = specialists.find((s) => s.kind === "specialist" && s.aliases.includes(m[1]!.toLowerCase()));
  return hit ? { to: hit.id, unknown: null } : { to: fallback, unknown: m[1]! };
}

/** The eight specialists the "@Name" picker offers (the Manager answers when nobody is named). */
export const pickable = (all: readonly Specialist[]): Specialist[] => all.filter((s) => s.kind === "specialist");

/** The question with this specialist's mention at the very start (replacing any mention already there). The word is
 *  one of the specialist's own aliases, letters only, so core's rule matches it. */
export function withMention(question: string, s: Specialist): string {
  const alias = s.aliases.find((a) => /^[a-z]+$/.test(a)) ?? s.id;
  const rest = question.replace(LEADING, "").replace(/^[\s,:;]+/, "");
  return `@${alias.charAt(0).toUpperCase()}${alias.slice(1)} ${rest}`;
}

/** "Kitchen · via Manager", or "Manager" for an answer the Manager gave itself. */
export const signatureWords = (sig: Answer["signature"]): string =>
  sig.key === "answer.signature.via_manager" ? `${specialistName(sig.specialist)} · via Manager` : "Manager";

/** After a lost POST /v1/ask (network error, or the 95 s timeout): looks, never resends. Core writes the turn (and,
 *  for a first question, the thread) only after the answer is stored, so a turn past `turnsBefore` in this thread,
 *  or a thread of this person's that was not in `before`, is the answer. Returns that thread's id, or null when it
 *  is not there (yet: core may still be working on it). */
export async function findLostAnswer(client: StaffClient, memberId: string, threadId: string | null, turnsBefore: number, before: ReadonlySet<string>): Promise<string | null> {
  if (threadId) {
    const t = await client.getThread(threadId);
    return t.ok && t.data.turns.length > turnsBefore ? threadId : null;
  }
  const l = await client.listThreads();
  return (l.ok ? l.data.items.find((i) => i.created_by === memberId && !before.has(i.thread_id))?.thread_id : undefined) ?? null;
}
```

```tsx
// file: components/staff/pages/ask.tsx
"use client";
// /staff/ask and /staff/ask/[threadId]: Ask Munim. A question goes to the Manager, or to a specialist named by a
// leading "@Name"; the answer's every number is a snapshot cell with its source chip, or "Cannot verify"; an answer
// Munim could not trace is an honest abstention. POST /v1/ask returns only when the answer is stored (up to about
// 90 s) and gives no run id to follow, so the screen shows a waiting state, then the answer, then refetches. A lost
// request is looked for, never resent. A 503 hides the ask box and keeps past answers readable.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCountdown, useOnline } from "@/lib/hooks";
import { addressee, findLostAnswer, pickable, QUESTION_MAX, signatureWords, withMention, type Specialist, type Thread, type ThreadItem, type Turn } from "@/lib/munim/ask";
import type { MunimError } from "@/lib/munim/client";
import { formatWhen } from "@/lib/munim/format";
import type { CellFormat } from "@/lib/munim/refs";
import { abstainText, specialistName, staffErrorText } from "@/lib/munim/staff-copy";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE, UUID7 } from "@/lib/site";
import { useStaff } from "../shell";
import { AiSegment, CannotVerify, SnapshotDrawer } from "../source";
import { ErrorNote, FullPage } from "../../ui";

type OpenRef = (snapshotId: string, refToken: string) => void;

const LOST = "The connection dropped before the answer arrived. Munim may still be answering: tap Refresh in a minute before you ask again.";
const TAINTED = "This answer also read text from outside your books, such as a supplier's message. Its numbers still come only from your books.";
const STAFF_NUMBERS = "Some numbers are shown only to managers and owners. Where you see Cannot verify, ask one of them.";
/** How many listed threads get their first question fetched for the list (the list item carries none). */
const PREVIEWS = 20;

function TurnBlock({ turn, mine, fmt, onOpen, onDeeper }: { turn: Turn; mine: boolean; fmt: CellFormat; onOpen: OpenRef; onDeeper: ((question: string) => void) | null }) {
  const a = turn.answer;
  return (
    <li className="space-y-2">
      <div className="ml-auto max-w-[70ch] rounded-[18px] border-[1.5px] border-line bg-bg-deep p-4">
        <p className="text-[14px] font-semibold text-muted">
          {mine ? "You asked" : "A teammate asked"}{turn.addressed_to ? ` · to ${specialistName(turn.addressed_to)}` : ""}
        </p>
        <p className="whitespace-pre-wrap">{turn.question ?? "The question wasn't stored."}</p>
      </div>
      {a === null ? (
        <div className="card p-5"><p><CannotVerify /> No answer is stored for this question.</p></div>
      ) : (
        <div className="card space-y-2 p-5">
          <p className="text-[15px] font-semibold text-muted">{signatureWords(a.signature)}</p>
          {a.envelope.abstained
            ? <p><CannotVerify /> {abstainText(a.envelope.reason_code)}</p>
            : a.envelope.segments.map((s, i) => <AiSegment key={i} segment={s} resolved={a.resolved_refs} fmt={fmt} onOpen={onOpen} />)}
          {turn.tainted && <p className="text-[14px] text-muted">{TAINTED}</p>}
          {onDeeper && a.envelope.follow_up === "dig_deeper" && turn.question && (
            <button type="button" className="btn btn-plain" onClick={() => onDeeper(turn.question!)}>Dig deeper across specialists</button>
          )}
        </div>
      )}
    </li>
  );
}

export function AskPage() {
  const params = useParams<{ threadId?: string }>();
  const threadId = params.threadId ?? null;
  const router = useRouter();
  const { session, client, outlet, handleAuth } = useStaff();
  const me = session.me;
  const [tenant, setTenant] = useState<Schemas["V1Tenant"] | null>(null);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [threads, setThreads] = useState<ThreadItem[] | null>(null);
  const [olderHidden, setOlderHidden] = useState(false);
  const [firstQ, setFirstQ] = useState<Map<string, string | null>>(new Map());
  const [listError, setListError] = useState<MunimError | null>(null);
  const [thread, setThread] = useState<Thread | "not_found" | null>(null);
  const [threadError, setThreadError] = useState<MunimError | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ question: string; since: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [aiOff, setAiOff] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const online = useOnline();
  const waitS = useCountdown(retryAt, () => setRetryAt(null));
  const valid = threadId === null || UUID7.test(threadId);

  const loadThreads = useCallback(async () => {
    const r = await client.listThreads();
    if (!r.ok) {
      if (!handleAuth(r.error)) setListError(r.error);
      return;
    }
    setListError(null);
    setThreads(r.data.items);
    setOlderHidden(r.data.next_cursor !== null);
    // The list item has no question text: read each listed thread's first question (plain text, the person's own).
    const shown = r.data.items.slice(0, PREVIEWS);
    const firsts = await Promise.all(shown.map((t) => client.getThread(t.thread_id)));
    setFirstQ(new Map(shown.map((t, i) => {
      const f = firsts[i]!;
      return [t.thread_id, f.ok ? (f.data.turns[0]?.question ?? null) : null] as const;
    })));
  }, [client, handleAuth]);

  const loadThread = useCallback(async () => {
    if (!threadId || !UUID7.test(threadId)) return;
    const r = await client.getThread(threadId);
    if (r.ok) {
      setThread(r.data);
      setThreadError(null);
    } else if (!handleAuth(r.error)) {
      if (r.error.kind === "not_found") setThread("not_found");
      else setThreadError(r.error);
    }
  }, [client, threadId, handleAuth]);

  useEffect(() => {
    void client.getTenant().then((r) => r.ok && setTenant(r.data));
    void client.listSpecialists().then((r) => r.ok && setSpecialists(pickable(r.data.items)));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the response
    void loadThreads();
  }, [client, loadThreads]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new thread: clear the last one's state, then fetch
    setThread(null);
    setNote(null);
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - pending.since) / 1000)), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const current = thread && thread !== "not_found" ? thread : null;

  const send = async (raw: string, deep = false) => {
    const question = raw.trim();
    // A first question needs the list as it was before sending, so a lost answer can be found (findLostAnswer).
    if (!question || question.length > QUESTION_MAX || pending || (threadId === null && threads === null)) return;
    const turnsBefore = current?.turns.length ?? 0;
    const before = new Set((threads ?? []).map((t) => t.thread_id));
    setPending({ question, since: Date.now() });
    setElapsed(0);
    setNote(null);
    const r = await client.ask(threadId ? { question, thread_id: threadId, ...(deep ? { deep: true } : {}) } : { question });
    if (r.ok) {
      setPending(null);
      setText("");
      if (!threadId) router.push(`/staff/ask/${r.data.thread_id}`);
      else await loadThread();
      void loadThreads();
      return;
    }
    if (handleAuth(r.error)) return setPending(null);
    if (r.error.kind === "network") {
      // Lost on the way back (or timed out): look for it, never resend.
      const found = await findLostAnswer(client, me.member_id, threadId, turnsBefore, before);
      setPending(null);
      if (found && !threadId) router.push(`/staff/ask/${found}`);
      else if (found) await loadThread();
      else setNote(LOST);
      if (found) setText("");
      void loadThreads();
      return;
    }
    setPending(null);
    if (r.error.status === 503) return setAiOff(true); // AI unavailable: hide the ask box, never an error state
    if (r.error.kind === "rate_limited") setRetryAt(Date.now() + (r.error.retryAfterMs ?? 5000));
    if (r.error.kind === "not_found") return setThread("not_found");
    setNote(staffErrorText(r.error, "ask"));
  };

  if (!valid || thread === "not_found") {
    return (
      <FullPage title="Not found." action={<Link href="/staff/ask" className="btn btn-primary">All questions</Link>}>
        <p>It may have been removed, or it isn&apos;t in your outlets.</p>
      </FullPage>
    );
  }

  const tz = outlet?.tz ?? tenant?.home_tz ?? "UTC";
  const fmt: CellFormat | null = tenant ? { locale: SITE.locale, currency: tenant.base_currency } : null;
  const open: OpenRef = (snapshotId, refToken) => setDrawer({ snapshotId, refToken });
  const to = addressee(text, specialists, current?.specialist ?? null);
  const tooLong = text.trim().length > QUESTION_MAX;
  const listBlocks = threadId === null && threads === null;
  const canSend = !!text.trim() && !tooLong && !pending && online && !aiOff && retryAt === null && !listBlocks;
  const lastTurn = current?.turns[current.turns.length - 1] ?? null;

  return (
    <main className="wrap staff-main space-y-4">
      {!online && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <h1 className="section-title">Ask Munim</h1>
      <div className="scallop" aria-hidden="true" />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside aria-labelledby="threads-title" className={`order-2 space-y-3 lg:order-1 ${threadId ? "hidden lg:block" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 id="threads-title" className="text-[22px]">Your questions</h2>
            <button type="button" className="btn btn-plain" onClick={() => void loadThreads()}>Refresh</button>
          </div>
          {threadId && <Link href="/staff/ask" className="btn btn-secondary">New question</Link>}
          {listError && threads === null && <ErrorNote>{staffErrorText(listError, "ask")}</ErrorNote>}
          {threads === null && !listError && <div className="skeleton h-40" role="status" aria-label="Loading" />}
          {threads && threads.length === 0 && <div className="state-box"><p>Ask about your sales, stock, kitchen or staff.</p></div>}
          {threads && threads.length > 0 && (
            <ul className="grid gap-2">
              {threads.map((t) => (
                <li key={t.thread_id}>
                  <Link href={`/staff/ask/${t.thread_id}`} aria-current={t.thread_id === threadId ? "page" : undefined} className="card card-link grid gap-1 p-4 no-underline">
                    <span className="font-semibold">{specialistName(t.specialist)}</span>
                    {firstQ.get(t.thread_id) && <span className="line-clamp-2">{firstQ.get(t.thread_id)}</span>}
                    <span className="text-[14px] text-muted">{t.created_by === me.member_id ? "" : "Started by a teammate · "}{formatWhen(t.updated_at, tz, SITE.locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {olderHidden && <p className="text-[14px] text-muted">Older questions aren&apos;t listed here yet.</p>}
        </aside>

        <section aria-label="Conversation" className="order-1 space-y-4 lg:order-2">
          {threadId && <Link href="/staff/ask" className="btn btn-plain lg:hidden">← All questions</Link>}
          {me.role === "staff" && <p className="text-[15px] text-muted">{STAFF_NUMBERS}</p>}
          {threadError && !current && (
            <div className="space-y-2">
              <ErrorNote>{staffErrorText(threadError, "ask")}</ErrorNote>
              <button type="button" className="btn btn-plain" onClick={() => void loadThread()}>Try again</button>
            </div>
          )}
          {threadId && !current && !threadError && <div className="skeleton h-48" role="status" aria-label="Loading" />}
          {current && fmt && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{current.specialist ? `A conversation with ${specialistName(current.specialist)}` : "A conversation with the Manager"}</p>
                <button type="button" className="btn btn-plain" onClick={() => void loadThread()}>Refresh</button>
              </div>
              <ol className="space-y-5">
                {current.turns.map((t) => (
                  <TurnBlock key={t.turn_id} turn={t} mine={t.member_id === me.member_id} fmt={fmt} onOpen={open}
                    onDeeper={t === lastTurn && !pending && !aiOff ? (q) => void send(q, true) : null} />
                ))}
              </ol>
            </>
          )}

          {pending && (
            <div className="space-y-2">
              <div className="ml-auto max-w-[70ch] rounded-[18px] border-[1.5px] border-line bg-bg-deep p-4">
                <p className="text-[14px] font-semibold text-muted">You asked</p>
                <p className="whitespace-pre-wrap">{pending.question}</p>
              </div>
              <div className="card p-5">
                <p className="font-semibold" role="status">Munim is reading your books…</p>
                <p className="text-muted"><span aria-hidden="true">{elapsed} s · </span>Answers can take up to a minute and a half. Asking never changes your books.</p>
              </div>
            </div>
          )}

          {aiOff ? (
            <p className="text-muted">Munim can&apos;t answer right now. Past answers are still here.</p>
          ) : (
            <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
              <label className="grid gap-1 font-semibold">
                {threadId ? "Ask a follow-up" : "Your question"}
                <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="How did the cake tickets go this week?" disabled={pending !== null} />
              </label>
              {specialists.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] text-muted">Ask a specialist:</span>
                  {specialists.map((s) => (
                    <button key={s.id} type="button" className="chip" aria-label={`Ask ${specialistName(s.id)}`} disabled={pending !== null} onClick={() => setText((q) => withMention(q, s))}>
                      @{specialistName(s.id)}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[15px] text-muted">
                {to.unknown ? `No specialist is called “@${to.unknown}”, so ${specialistName(to.to === "manager" ? null : to.to)} will answer.` : `To: ${specialistName(to.to === "manager" ? null : to.to)}`}
                {text.trim().length > QUESTION_MAX - 200 && ` · ${text.trim().length} / ${QUESTION_MAX}`}
              </p>
              {tooLong && <ErrorNote>That question is too long. Keep it under {QUESTION_MAX} characters.</ErrorNote>}
              {note && <ErrorNote>{note}</ErrorNote>}
              {listBlocks && listError && (
                <div className="flex flex-wrap items-center gap-3">
                  <ErrorNote>{staffErrorText(listError, "ask")}</ErrorNote>
                  <button type="button" className="btn btn-plain" onClick={() => void loadThreads()}>Try again</button>
                </div>
              )}
              {retryAt !== null && <p className="text-muted" role="status">You can ask again in {waitS} s.</p>}
              <button type="submit" className="btn btn-primary" disabled={!canSend}>{pending ? "Asking…" : "Ask"}</button>
            </form>
          )}
        </section>
      </div>
      {fmt && <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />}
    </main>
  );
}
```

```tsx
// file: app/staff/ask/page.tsx
import type { Metadata } from "next";
import { AskPage } from "@/components/staff/pages/ask";

export const metadata: Metadata = { title: "Ask Munim" };

export default function Page() {
  return <AskPage />;
}
```

```tsx
// file: app/staff/ask/[threadId]/page.tsx
import type { Metadata } from "next";
import { AskPage } from "@/components/staff/pages/ask";

export const metadata: Metadata = { title: "Ask Munim" };

export default function Page() {
  return <AskPage />;
}
```

Notes on the code:

- `addressee` mirrors core's rule (`mention.ts`): only a **leading** `@word`, ended by the end of the text, a space,
  "," ":" or ";", matched case-insensitively against the specialists' `aliases` from `GET /v1/specialists`. It drives
  the "To:" hint only. Core decides; the screen never sends who the question is for.
- `findLostAnswer` relies on how core stores a turn: one transaction after the answer exists. So "a new turn is there"
  means "it was answered", and nothing half-written appears.
- Values are formatted by `formatCell` from the ref's column (`*_sec` as "41 min", `*_minor` as money, counts as
  plain numbers). There is no other path from an answer to the screen.

## 8 · Acceptance checklist

`[mock]` = on the mock · `[unit]` = a unit test or a stubbed response · `[real]` = only on the real API.

**Reading**
- [ ] [mock] As Nandini, `/staff/ask` lists two threads: "Kitchen" with "@Kitchen how are the cake tickets doing this
      week?", and "Manager" with "What will we sell on Diwali night?".
- [ ] [mock] The cake thread reads "Kitchen · via Manager", then two sentences with five values, each with a "Source"
      chip: 14 tickets, 28 min, 5, 30 min, 41 min. No digit in the answer appears without a chip.
- [ ] [mock] A chip opens "Where this number comes from" / "Kitchen ticket times" with the rows and the cited cell
      outlined. Escape closes it.
- [ ] [mock] The Diwali thread shows "Cannot verify" with "There isn't enough history to answer that yet." and no
      sentences.
- [ ] [mock] As Imran (staff), the list holds no thread of the owner's (they are scoped to every outlet) and the staff
      line shows. After he asks about cakes, every number shows "Cannot verify" and there is no chip.
- [ ] [mock] [real] As a staff member, an answer shows "Cannot verify" in place of every number. `resolved_refs` is
      empty for them.
- [ ] [mock] As Nandini, after Imran has asked, his thread is listed as "Started by a teammate".
- [ ] [real] A manager sees a thread the owner started for their outlet, marked "Started by a teammate". A thread
      scoped to every outlet is not listed for a manager with one outlet.
- [ ] [unit] A stubbed answer whose segment is "We sold 42 cakes" with `refs: []` shows one "Cannot verify" chip and
      no "42".
- [ ] [unit] A stubbed answer whose ref is missing from `resolved_refs` shows "Cannot verify" in that place only.
- [ ] [unit] A stubbed segment with `<img src=x onerror=alert(1)>` (no digits) renders as literal text.
- [ ] [unit] A stubbed turn with `tainted: true` shows the outside-text note. One with `answer: null` shows "No answer is
      stored for this question.".

**Asking**
- [ ] [mock] Type "@Kitchen how are the cakes doing?": "To: Kitchen". "@Nobody hi": "No specialist is called “@Nobody”,
      so Manager will answer.". In the Kitchen thread, "and yesterday?": "To: Kitchen".
- [ ] [mock] The "Kitchen" chip turns "how are the cakes?" into "@Kitchen how are the cakes?". The "Stock & Purchasing"
      chip on that text replaces the mention ("@Inventory how are the cakes?").
- [ ] [mock] "Ask" on a new question opens `/staff/ask/{id}` with the answered turn, and the list gains the thread.
- [ ] [mock] A follow-up in the thread adds turn 2 under turn 1. The request body carries `thread_id` and no `deep`.
- [ ] [mock] Throttle the network (DevTools "Slow 3G"), then ask. The waiting card shows "Munim is reading your
      books…" with the seconds counting, "Ask" reads "Asking…" and is disabled, and a double tap sends one request.
- [ ] [mock] Mock controls "AI: off", then ask: the box is replaced by "Munim can't answer right now. Past answers are
      still here." No red error. Past turns stay readable.
- [ ] [mock] "AI: abstain": the new turn shows "Cannot verify" with "Munim's AI is switched off or this month's AI
      budget is used up.".
- [ ] [mock] "Force 429": "Too many requests. Please wait a moment and try again." with "You can ask again in 5 s."
      The question stays in the box, and nothing is resent by itself.
- [ ] [mock] A 2,001-character question disables "Ask" and shows "That question is too long. Keep it under 2000
      characters."
- [ ] [mock] Offline: "Ask" is disabled and the offline bar shows.
- [ ] [unit] Stub `ask` to fail with `kind: "network"` and stub `getThread` with one more turn: the thread refreshes
      to it and **`ask` was called once**. Stub `listThreads` with a new thread for a lost first question: the screen
      navigates to it. With nothing new: the "connection dropped" line, and `ask` was still called once.
- [ ] [unit] A stubbed last answer with `follow_up: "dig_deeper"` shows "Dig deeper across specialists". Tapping it
      sends `{question: <the same question>, thread_id, deep: true}`.
- [ ] [unit] A stubbed 403 `forbidden` shows "Your role can't do this. Ask the owner."
- [ ] [unit] A stubbed `listThreads` failure on `/staff/ask` keeps "Ask" disabled and shows the error with "Try again" under the box. In a thread, "Ask" still works.
- [ ] [real] On the real API a question takes seconds to a minute. The waiting card stays until it answers, and then
      the turn shows the stored answer.
- [ ] [real] Two turns are never stored for one tap: check the thread after a slow answer.

**Rules (20)**
- [ ] [mock] No `EventSource`, no stream request from this screen (network tab), no token or tenant id in any URL.
- [ ] [mock] No `dangerouslySetInnerHTML`, no Markdown renderer: answers render as text nodes and chips only.
- [ ] [mock] At 390 px: one column; on a thread, the list is hidden and "← All questions" goes back. Every chip,
      button and the drawer is ≥ 48 px and usable at 200 % zoom. The textarea is 16 px.

## 9 · Screenshots

Named `staff-<screen>-<state>-<width>.png` (00 §5), at 390 and 1280 px. No screenshot shows a token or a tenant id.

| Screen | States |
|---|---|
| `ask` | `list`, `empty`, `new-question`, `addressed-kitchen`, `unknown-mention`, `waiting`, `answered`, `drawer-open`, `abstained`, `model-blocked`, `ai-off`, `rate-limited`, `lost` (stubbed), `too-long`, `offline`, `staff-view`, `not-found`, `dig-deeper` (stubbed), `tainted` (stubbed) |

## 10 · Not in this screen

- No live progress (no run id to follow). No streaming of partial answers.
- No editing or deleting a question; turns are kept as asked.
- No "summary" view: `thread.summary` (refs of cited segments, used by core to give the next turn context) is not
  shown.
- No `?specialist=` filter on the list: `listThreads({ specialist })` exists, but this screen lists every thread.
