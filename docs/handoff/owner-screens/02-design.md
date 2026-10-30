# 02 · Design: Cobnut's look, plus the staff-only pieces

The staff screens wear the same warm patisserie look as the storefront: cream paper, hazelnut brown, rose-berry,
Fraunces headings, Inter for everything with a number, 22 px cards with a fine cocoa outline, pill buttons. Nothing
in this file replaces a Cobnut token or component; it adds the few pieces only staff see. Every new shape is drawn
by you, as the storefront's were.

## 1 · Reuse first

| From Cobnut | Use it for |
|---|---|
| `app/globals.css` tokens (`--bg`, `--bg-deep`, `--card`, `--ink`, `--muted`, `--line`, `--primary`, `--secondary`, `--accent`, `--ok`, `--danger`, `--focus`, radii, shadows) and classes (`.wrap`, `.card`, `.card-link`, `.btn` + `-primary` / `-secondary` / `-plain` / `-ghost` / `-round`, `.chip`, `.badge`, `.badge-accent`, `.choice`, `.section-title`, `.scallop`, `.ribbon`, `.skeleton`, `dialog.modal`, `dialog.drawer`, `.toast`, `.soldout-pill`, `.num`) | Everything. Staff screens add only the classes in `app/staff/staff.css` (§2) |
| `app/fonts.ts` (Fraunces, Inter) | Unchanged. Numbers, money, timers and ticket numbers are Inter with tabular figures, never the serif |
| `components/ui.tsx`: `FullPage`, `NotValid`, `ErrorNote`, `Toast` + `useToast`, `OfflineBanner`, `DietBadge`, `MockPanel` | Full-page messages, errors, the polite live region, offline, diet marks on POS tiles, the mock panel (with 03 §6's extra selects) |
| `components/cart-bits.tsx`: `QtyStepper`, `money` | The till's cart rail |
| `components/chrome.tsx`: `DemoBar` ("Sample shop — orders are not real."), `SiteFooter`, `DEMO_TOP`, `DEMO_FOOT` | The demo bar stays on every staff page; the footer stays on the shop only (§3) |
| `components/art.tsx`: `Wordmark`, `Hazelnut`, `CategoryMotif` | The staff bar's wordmark; category headers on the till |
| `components/icons.tsx` | Every icon you already drew. New ones go in the same file, same 24 × 24 grid and stroke |
| `lib/munim/format.ts`: `formatMoney`, `formatQty`, `formatRate`, `formatTime`, `formatDayTime`, `dayLabel`, `shownName`, `titleCase` | All display formatting, with the outlet's `tz` |

**Where the storefront's flourishes go.** Swash section titles and the scallop edge: on owner home, inbox, Ask,
Cares and Suppliers headers. The ticker band (`.ribbon`): **owner home only**, for synthetic-data and simulated-party
reminders, never for a number. **None** of them inside the till's working area or on the kitchen display, where the
only decoration is the ticket colour.

## 2 · New tokens and classes

```css
/* file: app/staff/staff.css */
/* Staff screens: the same patisserie look (globals.css tokens, .card, .btn, .chip, .badge), plus the few pieces only
   staff see. Imported once by app/staff/layout.tsx. Contrast of every new pair is measured in 02 §2. Written for this
   project. */
:root {
  --warn: #7a4b00;      /* "Due soon": text and edge on --warn-bg or card */
  --warn-bg: #fde7b8;
  --late: #9b1c12;      /* "Late": text and edge on --late-bg or card */
  --late-bg: #fbd9d3;
  --ok-bg: #e1f0dc;     /* "Ready", "Applied": with --ok text */
  --src: #5b3a78;       /* source chip: plum ink, the colour of a ledger stamp */
  --src-bg: #efe4f6;
}

@layer components {
  /* ---- shell ---- */
  .staff-bar { position: sticky; top: 0; z-index: 30; background: var(--bg); border-bottom: 1.5px solid var(--line); }
  .staff-bar-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; min-height: 64px; padding: 8px 16px; }
  .staff-nav { display: flex; gap: 8px; overflow-x: auto; padding: 0 16px 10px; scrollbar-width: none; }
  .staff-nav::-webkit-scrollbar { display: none; }
  .staff-nav .chip[aria-current="page"] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .staff-main { padding: 16px; }
  .staff-main-wide { padding: 12px 16px; max-width: none; }

  /* ---- source chip, Cannot verify, snapshot drawer ---- */
  .src-value { font-variant-numeric: tabular-nums; font-weight: 650; white-space: nowrap; }
  .src-chip {
    display: inline-flex; align-items: center; gap: 4px; vertical-align: baseline;
    min-height: 28px; min-width: 28px; margin-inline: 4px 2px; padding: 0 8px;
    background: var(--src-bg); color: var(--src); border: 1.5px solid var(--src); border-radius: var(--radius-pill);
    font-size: 13px; font-weight: 700; cursor: pointer; position: relative;
  }
  .src-chip::after { content: ""; position: absolute; inset: -10px; } /* a 48 px hit area around the small chip */
  .cv-chip {
    display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px;
    background: var(--card); color: var(--danger); border: 1.5px dashed var(--danger); border-radius: var(--radius-pill);
    font-size: 14px; font-weight: 700; white-space: nowrap;
  }
  .snap-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .snap-table th, .snap-table td { padding: 8px 10px; border-bottom: 1px solid var(--bg-deep); text-align: left; vertical-align: top; }
  .snap-table td.num, .snap-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .snap-table tr[aria-current="true"] td { background: var(--src-bg); }
  .snap-table td[aria-current="true"] { outline: 2px solid var(--src); outline-offset: -2px; font-weight: 700; }

  /* ---- badges and pills ---- */
  .sim-badge {
    display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px;
    background: var(--card); color: var(--ink); border: 1.5px dashed var(--ink); border-radius: var(--radius-pill);
    font-size: 14px; font-weight: 650; white-space: nowrap;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border-radius: var(--radius-pill);
    border: 1.5px solid var(--line); background: var(--card); color: var(--ink); font-size: 14px; font-weight: 650; white-space: nowrap;
  }
  .pill-new { background: var(--accent); color: var(--on-accent); border-color: var(--primary); }
  .pill-work { background: var(--card); border-color: var(--primary); color: var(--primary); }
  .pill-ready { background: var(--ok-bg); color: var(--ok); border-color: var(--ok); }
  .pill-done { background: var(--bg-deep); color: var(--muted); border-color: var(--line); }
  .pill-stop { background: var(--card); color: var(--danger); border-color: var(--danger); }
  .pill-warn { background: var(--warn-bg); color: var(--warn); border-color: var(--warn); }
  .pill-late { background: var(--late-bg); color: var(--late); border-color: var(--late); }

  /* ---- stat card (owner home) ---- */
  .stat { display: grid; gap: 6px; padding: 18px 20px; }
  .stat-label { color: var(--muted); font-size: 15px; font-weight: 600; }
  .stat-value { font-size: clamp(28px, 4vw, 36px); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }

  /* ---- draft card ---- */
  .draft-field { display: grid; grid-template-columns: minmax(120px, 1fr) 2fr; gap: 6px 14px; padding: 10px 0; border-bottom: 1px solid var(--bg-deep); }
  .draft-proposed-struck { text-decoration: line-through; color: var(--muted); }
  .draft-edit-label { color: var(--secondary); font-size: 14px; font-weight: 700; }
  .lineage { color: var(--muted); font-size: 14px; }

  /* ---- kitchen ticket (KDS) ---- */
  .kds-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); align-items: start; }
  .ticket { background: var(--card); border: 2.5px solid var(--line); border-radius: var(--radius-card); box-shadow: var(--shadow); overflow: hidden; }
  .ticket-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1.5px solid var(--bg-deep); }
  .ticket-no { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
  .ticket-timer { font-size: 22px; font-weight: 750; font-variant-numeric: tabular-nums; }
  .ticket-lines { padding: 10px 16px 14px; display: grid; gap: 10px; }
  .ticket-line { font-size: 22px; font-weight: 650; line-height: 1.25; }
  .ticket-qty { display: inline-block; min-width: 2.2ch; font-weight: 800; }
  .ticket-options { font-size: 18px; font-weight: 600; color: var(--ink); padding-left: 2.6ch; }
  .ticket-note {
    margin-left: 2.6ch; padding: 10px 12px; background: var(--accent); color: var(--on-accent);
    border: 1.5px solid var(--primary); border-radius: var(--radius-field); font-size: 20px; font-weight: 700; white-space: pre-wrap;
  }
  .ticket-actions { display: flex; gap: 10px; padding: 12px 16px 16px; }
  .ticket-actions .btn { min-height: 64px; flex: 1; font-size: 20px; }
  .ticket[data-colour="amber"] { border-color: var(--warn); }
  .ticket[data-colour="amber"] .ticket-head { background: var(--warn-bg); color: var(--warn); }
  .ticket[data-colour="red"] { border-color: var(--late); }
  .ticket[data-colour="red"] .ticket-head { background: var(--late-bg); color: var(--late); }
  .ticket[data-lane="later"] { border-style: dashed; }

  /* ---- till (POS) ---- */
  .pos { display: grid; gap: 16px; grid-template-columns: 1fr minmax(320px, 380px); align-items: start; }
  .tile-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  .tile {
    display: grid; align-content: space-between; gap: 6px; min-height: 104px; padding: 14px; text-align: left;
    background: var(--card); color: var(--ink); border: 1.5px solid var(--line); border-radius: var(--radius-card); box-shadow: var(--shadow);
    font-size: 17px; font-weight: 650; cursor: pointer;
  }
  .tile:active { transform: translateY(1px); box-shadow: none; }
  .tile[aria-disabled="true"] { background: var(--bg-deep); color: var(--muted); cursor: not-allowed; box-shadow: none; }
  .tile-price { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--primary); }
  .cart-rail { position: sticky; top: 132px; display: grid; gap: 12px; padding: 16px; max-height: calc(100dvh - 148px); overflow: auto; }
  .cart-line { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 10px 0; border-bottom: 1px solid var(--bg-deep); }
  .pay-btn { min-height: 64px; font-size: 20px; width: 100%; }
  @media (max-width: 899px) { .pos { grid-template-columns: 1fr; } .cart-rail { position: static; max-height: none; } }

  /* ---- states ---- */
  .state-box { display: grid; justify-items: center; gap: 10px; padding: 36px 20px; text-align: center; color: var(--muted); }
  .offline-bar { background: var(--ink); color: #ffffff; font-weight: 650; padding: 10px 16px; }
}
```

Measured contrast of every new pair (WCAG 2.x relative luminance; text needs 4.5 : 1, edges 3 : 1):

| Pair | Ratio | Use |
|---|---|---|
| `--warn` on `--warn-bg` | 6.10 | "Due soon" ticket head, warning pill |
| `--warn` on `--card` | 7.41 | Amber ticket edge |
| `--ink` on `--warn-bg` | 13.78 | Ticket lines under an amber head |
| `--late` on `--late-bg` | 6.22 | "Late" ticket head, late pill |
| `--late` on `--card` | 8.18 | Red ticket edge |
| `--ink` on `--late-bg` | 12.72 | |
| `--ok` on `--ok-bg` | 5.41 | "Ready", "Applied" pills |
| `--ink` on `--ok-bg` | 14.10 | |
| `--src` on `--src-bg` | 7.37 | Source chip text and edge |
| `--src` on `--card` / on `--bg` | 9.05 / 8.28 | Chip edge on a card or the page |
| `--ink` on `--src-bg` | 13.62 | The cited row in the snapshot drawer |
| `--danger` on `--card` / on `--bg` | 6.57 / 6.02 | "Cannot verify" chip (dashed edge + text) |
| `--muted` on `--bg-deep` | 6.02 | "Done" pill, disabled tile text |
| `--ink` on `--bg-deep` | 13.60 | |
| `--on-accent` on `--accent` | 12.49 | Ticket note box, "New" pill |
| `--line` on `--bg-deep` | 3.80 | Disabled tile edge |

## 3 · Layout: one app, two shells

The root layout renders `DemoBar` and `SiteFooter` around every page. Staff pages keep the demo bar but not the
shop's footer, so move the storefront pages into a route group (URLs do not change):

```bash
mkdir -p "app/(shop)"
git mv app/page.tsx app/cares app/o app/story app/not-valid "app/(shop)/"
```

Then delete `<SiteFooter />` (and its import) from `app/layout.tsx`, keep `<DemoBar />`, and add:

```tsx
// file: app/(shop)/layout.tsx
// The storefront's pages (moved into this route group; their URLs do not change) keep the site footer.
import { SiteFooter } from "@/components/chrome";

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
```

```tsx
// file: app/staff/layout.tsx
// Every /staff route: the staff stylesheet and the shell. The root layout above it still renders the demo bar. The
// shell reads the URL (usePathname), which with cacheComponents must sit inside <Suspense> or `next build` refuses
// the routes with an id in the path.
import { Suspense } from "react";
import { StaffShell } from "@/components/staff/shell";
import "./staff.css";

export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<div className="state-box" role="status">Signing you in…</div>}>
      <StaffShell>{children}</StaffShell>
    </Suspense>
  );
}
```

```tsx
// file: app/staff/page.tsx
"use client";
// /staff: send the signed-in person to the screen their role starts on.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStaff } from "@/components/staff/shell";
import { DEMO_PEOPLE } from "@/lib/munim/session";

export default function StaffIndex() {
  const { session } = useStaff();
  const router = useRouter();
  useEffect(() => {
    const demo = DEMO_PEOPLE.find((p) => p.token === session.token);
    router.replace(demo ? demo.home : session.me.role === "staff" ? "/staff/counter" : "/staff/home");
  }, [router, session]);
  return <div className="state-box" role="status">Opening…</div>;
}
```

`app/not-found.tsx` and `app/mock/` stay where they are. Routes the screen files add, all under `app/staff/`:
`counter`, `counter/orders/[orderId]` (10), `kitchen` (11), `home`, `inbox`, `inbox/[draftId]` (12), `ask`,
`ask/[threadId]` (13), `cares` (14), `suppliers`, `suppliers/[supplierId]`, `purchase-orders/[poId]` (15). Each is a
thin `page.tsx` that renders a client component from `components/staff/pages/`.

### 3.1 The staff shell

```tsx
// file: components/staff/shell.tsx
"use client";
// The staff shell: top bar (wordmark, outlet switcher, the person, "Demo sign-in" badge, sign out), the tablet nav,
// and the context every staff screen reads with useStaff(). A missing session or any 401 sends the person to
// /staff/sign-in. Screens never read sessionStorage themselves.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MunimError } from "@/lib/munim/client";
import { can, readOutlet, readSession, signOut, writeOutlet, type Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { staffFor } from "@/lib/munim/staff-app";
import { DEMO_SIGN_IN, ROLE_LABEL, staffErrorText } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";
import { Wordmark } from "../art";
import { ErrorNote } from "../ui";

type Outlet = Schemas["V1Outlets"]["outlets"][number];

export interface Staff {
  session: Session;
  client: StaffClient;
  outlets: Outlet[];
  /** The outlet the switcher chose; every outlet-scoped screen uses it. Null only while `outletsState` is "loading":
   *  the shell itself shows the "failed" and no-outlet states instead of the screen. */
  outlet: Outlet | null;
  outletsState: "loading" | "ready" | "failed";
  /** Loads the outlets again (the shell's "Try again"). */
  retryOutlets: () => void;
  setOutlet: (id: string) => void;
  /** Call with any failed result: a 401 signs the person out; returns true when it handled the error. */
  handleAuth: (e: MunimError) => boolean;
}

const StaffContext = createContext<Staff | null>(null);
export const useStaff = (): Staff => {
  const s = useContext(StaffContext);
  if (!s) throw new Error("useStaff outside StaffShell");
  return s;
};

const NAV = [
  { href: "/staff/counter", label: "Counter", screen: "counter" },
  { href: "/staff/kitchen", label: "Kitchen", screen: "kitchen" },
  { href: "/staff/home", label: "Home", screen: "home" },
  { href: "/staff/inbox", label: "Inbox", screen: "inbox" },
  { href: "/staff/ask", label: "Ask Munim", screen: "ask" },
  { href: "/staff/cares", label: "Cares", screen: "cares" },
  { href: "/staff/suppliers", label: "Suppliers", screen: "suppliers" },
] as const;

export function StaffShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [outletsState, setOutletsState] = useState<"loading" | "ready" | "failed">("loading");
  const [outletsError, setOutletsError] = useState<MunimError | null>(null);
  const [outletsTry, setOutletsTry] = useState(0);
  const signIn = path === "/staff/sign-in";

  useEffect(() => {
    const s = readSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
    setSession(s);
    if (!s && !signIn) router.replace("/staff/sign-in");
  }, [router, signIn]);

  const client = useMemo(() => (session ? staffFor(session) : null), [session]);
  const handleAuth = useCallback((e: MunimError) => {
    if (e.status !== 401) return false;
    signOut();
    router.replace("/staff/sign-in");
    return true;
  }, [router]);

  useEffect(() => {
    if (!client) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new attempt starts in "loading"
    setOutletsState("loading");
    void client.listOutlets().then((r) => {
      if (!live) return;
      if (!r.ok) {
        if (handleAuth(r.error)) return;
        setOutletsError(r.error);
        setOutletsState("failed");
        return;
      }
      // GET /v1/outlets lists every outlet of the business; the person works in those GET /v1/me names.
      const mine = r.data.outlets.filter((o) => session!.me.outlet_ids === "*" || session!.me.outlet_ids.includes(o.id));
      setOutlets(mine);
      const saved = readOutlet();
      setOutletId(mine.some((o) => o.id === saved) ? saved : (mine[0]?.id ?? null));
      setOutletsState("ready");
    });
    return () => { live = false; };
  }, [client, handleAuth, session, outletsTry]);

  if (signIn) return <>{children}</>;
  if (!session || !client) return <div className="state-box" role="status">Signing you in…</div>;

  const outlet = outlets.find((o) => o.id === outletId) ?? null;
  const setOutlet = (id: string) => { writeOutlet(id); setOutletId(id); };
  const retryOutlets = () => setOutletsTry((n) => n + 1);
  const value: Staff = { session, client, outlets, outlet, setOutlet, outletsState, retryOutlets, handleAuth };
  // Every screen needs an outlet: a failed load or a person with none is shown here, once, instead of the screen.
  const body = outletsState === "failed" ? (
    <main className="wrap staff-main space-y-3">
      <ErrorNote>{outletsError ? staffErrorText(outletsError, "home") : "Your outlets couldn't load."}</ErrorNote>
      <button type="button" className="btn btn-plain" onClick={retryOutlets}>Try again</button>
    </main>
  ) : outletsState === "ready" && outlets.length === 0 ? (
    <main className="wrap staff-main"><div className="state-box"><p>You aren&apos;t set up at any outlet yet. Ask the owner.</p></div></main>
  ) : children;

  return (
    <StaffContext.Provider value={value}>
      <header className="staff-bar">
        <div className="staff-bar-row">
          <Link href="/staff" className="text-ink no-underline" aria-label="Cobnut Bakehouse staff, home"><Wordmark /></Link>
          <span className="badge">Staff</span>
          {outlets.length > 1 ? (
            <label className="flex items-center gap-2 font-semibold">
              Outlet
              <select className="w-auto" value={outletId ?? ""} onChange={(e) => setOutlet(e.target.value)}>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          ) : outlet ? <span className="font-semibold">{outlet.name}</span> : null}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="font-semibold">{session.me.name}</span>
            <span className="text-muted">· {ROLE_LABEL[session.me.role]}</span>
            {session.demo && <span className="sim-badge">{DEMO_SIGN_IN}</span>}
            <button type="button" className="btn btn-plain" onClick={() => { signOut(); router.replace("/staff/sign-in"); }}>Sign out</button>
          </span>
        </div>
        <nav aria-label="Staff" className="staff-nav">
          {NAV.filter((n) => can(session, n.screen)).map((n) => (
            <Link key={n.href} href={n.href} className="chip" aria-current={path.startsWith(n.href) ? "page" : undefined}>{n.label}</Link>
          ))}
        </nav>
      </header>
      {body}
    </StaffContext.Provider>
  );
}
```

- Top bar, left to right: the wordmark, a "Staff" badge, the outlet switcher (a select labelled "Outlet"; the
  outlet's name as text when the person has one outlet), then on the right the person's name, "· Owner" (their role),
  the **"Demo sign-in"** badge (dashed outline) when signed in with the picker, and "Sign out".
- Below it, the nav as a row of chips that scrolls sideways on narrow screens: "Counter", "Kitchen", "Home",
  "Inbox", "Ask Munim", "Cares", "Suppliers", filtered by role (`can()` in session.ts). The current one is filled.
- Every chip and button is ≥ 48 px. At 390 px the bar wraps to two rows; nothing is hidden.
- Screens read everything through `useStaff()`: `session`, `client`, `outlets`, `outlet`, `setOutlet`,
  `outletsState`, `retryOutlets`, `handleAuth`. Pass every failed result to `handleAuth` first; it signs out on a 401.
- **Outlets, once per session.** `outletsState` is `"loading"` until `GET /v1/outlets` answers; a screen shows its own
  "Loading" while `outlet` is null. Then:
  - `"failed"` (429, offline, 5xx): the shell shows, in place of the screen, `staffErrorText(error, "home")` (for
    example "Too many requests. Please wait a moment and try again.") and "Try again" (`retryOutlets`);
  - `"ready"` with no outlet (`GET /v1/me` names none, an empty `outlet_ids`): the shell shows "You aren't set up at any
    outlet yet. Ask the owner." in place of the screen;
  - `"ready"` with outlets: `outlet` is the switcher's choice, never null, and the screen renders.

### 3.2 Demo sign-in

```tsx
// file: components/staff/sign-in.tsx
"use client";
// /staff/sign-in. On the mock: the "Demo sign-in" picker with the three invented people. Against the real API the
// picker is never shown; the IdP sign-in replaces it when the founder sends the details (00 §3).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE, IS_MOCK } from "@/lib/munim";
import { DEMO_PEOPLE, signInDemo, type DemoPerson } from "@/lib/munim/session";
import { staffErrorText } from "@/lib/munim/staff-copy";
import { ErrorNote } from "../ui";

export function StaffSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (p: DemoPerson) => {
    setBusy(p.key);
    setError(null);
    const r = await signInDemo(API_BASE, p);
    setBusy(null);
    if (r.ok) router.replace(p.home);
    else setError(staffErrorText(r.error, "sign-in"));
  };
  return (
    <main className="wrap py-10">
      <h1 className="section-title">Staff sign-in</h1>
      {IS_MOCK ? (
        <>
          <p className="mt-4 max-w-[60ch]">
            <span className="sim-badge">Demo sign-in</span> Choose who you are for this demo. These people are invented; anyone can sign in as them.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {DEMO_PEOPLE.map((p) => (
              <button key={p.key} type="button" className="card card-link grid gap-2 p-6 text-left" disabled={busy !== null} onClick={() => void go(p)}>
                <span className="display text-[24px]">{p.name}</span>
                <span className="text-muted">{p.blurb}</span>
                <span className="btn btn-primary mt-2">{busy === p.key ? "Signing in…" : `Sign in as ${p.name}`}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4">Sign-in with your work account is coming soon.</p>
      )}
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
    </main>
  );
}
```

```tsx
// file: app/staff/sign-in/page.tsx
import { StaffSignIn } from "@/components/staff/sign-in";

export default function SignInPage() {
  return <StaffSignIn />;
}
```

Strings: "Staff sign-in" (title), "Demo sign-in" (badge), "Choose who you are for this demo. These people are
invented; anyone can sign in as them.", each card's name and blurb, "Sign in as Nandini Mehrotra (demo)" and so on,
"Signing in…", the error "Sign-in didn't work. Try again.", and on the real API "Sign-in with your work account is
coming soon." Three cards in a row from 640 px, stacked below.

## 4 · AI numbers: source chip, "Cannot verify", snapshot drawer, stat card

```tsx
// file: components/staff/source.tsx
"use client";
// How an AI number looks: the value, formatted from its snapshot cell, with a source chip that opens the rows behind
// it; or the "Cannot verify" chip when it does not trace. Plus the stat card (owner home), the simulated badges and
// the status pill. AI text is rendered as text nodes only, never as HTML.
import { useEffect, useRef, useState } from "react";
import { cellOf, columnOf, formatCell, parseRef, renderSegment, type CellFormat, type Part, type ResolvedRef, type Snapshot } from "@/lib/munim/refs";
import type { StaffClient } from "@/lib/munim/staff";
import { CANNOT_VERIFY, SIMULATED_RECIPIENT, SIMULATED_SUPPLIER } from "@/lib/munim/staff-copy";
import { formatDayTime } from "@/lib/munim/format";
import { AlertIcon, CloseIcon } from "../icons";

/** The little ledger-stamp mark inside a source chip (drawn for this project: a stamp with two ruled lines). */
const StampMark = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5 6.5h6M5 9.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export function CannotVerify({ why }: { why?: string }) {
  return (
    <span className="cv-chip" title={why}>
      <AlertIcon size={16} /> {CANNOT_VERIFY}
    </span>
  );
}

/** A traced value: the formatted cell and its chip. `onOpen` gets the snapshot id (open the drawer). */
export function SourcedValue({ text, refToken, onOpen }: { text: string; refToken: string; onOpen: (snapshotId: string, refToken: string) => void }) {
  const p = parseRef(refToken);
  if (!p || p.kind !== "snap") return <span className="src-value">{text}</span>; // a quoted span: shown, no rows to open
  return (
    <>
      <span className="src-value">{text}</span>
      <button type="button" className="src-chip" onClick={() => onOpen(p.snapshotId, refToken)} aria-label={`Source of ${text}: open the rows`}>
        <StampMark /> Source
      </button>
    </>
  );
}

/** One AI segment (answer, finding): plain text, traced values with chips, and "Cannot verify" for the rest. */
export function AiSegment({ segment, resolved, fmt, onOpen }: { segment: { text: string; refs: readonly string[] }; resolved: readonly ResolvedRef[]; fmt: CellFormat; onOpen: (snapshotId: string, refToken: string) => void }) {
  const parts: Part[] = renderSegment(segment, resolved);
  return (
    <p className="leading-relaxed">
      {parts.map((p, i) =>
        p.kind === "text" ? <span key={i}>{p.text}</span>
        : p.kind === "value" ? <SourcedValue key={i} text={formatCell(p.value, columnOf(p.parsed), fmt)} refToken={p.ref} onOpen={onOpen} />
        : <CannotVerify key={i} />,
      )}
    </p>
  );
}

/** Owner home: one figure from a snapshot cell the screen minted. `value` undefined = still loading. */
export function StatCard({ label, value, refToken, note, onOpen }: { label: string; value: string | null | undefined; refToken: string | null; note?: string; onOpen: (snapshotId: string, refToken: string) => void }) {
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      {value === undefined ? <div className="skeleton h-10 w-32" aria-hidden="true" />
        : value === null || refToken === null ? <CannotVerify />
        : <p className="stat-value"><SourcedValue text={value} refToken={refToken} onOpen={onOpen} /></p>}
      {note && <p className="text-[14px] text-muted">{note}</p>}
    </div>
  );
}

/** The snapshot drawer: the rows behind a ref, with the cited cell outlined. 404 (not this person's) = Cannot verify. */
export function SnapshotDrawer({ client, open, onClose, fmt, tz, label }: {
  client: StaffClient;
  open: { snapshotId: string; refToken: string } | null;
  onClose: () => void;
  fmt: CellFormat;
  tz: string;
  /** Plain words for a template id ("inventory.waste_week" -> "Waste this week"); falls back to the id. */
  label?: (templateId: string) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [snap, setSnap] = useState<Snapshot | null | "failed">(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before loading the next snapshot
    setSnap(null);
    void client.getSnapshot(open.snapshotId).then((r) => { if (live) setSnap(r.ok ? r.data : "failed"); });
    return () => { live = false; };
  }, [open, client]);
  const cited = open ? parseRef(open.refToken) : null;
  return (
    <dialog ref={ref} className="drawer" aria-labelledby="snap-title" onClose={onClose}>
      <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-line p-4">
        <h2 id="snap-title" className="text-[24px]">Where this number comes from</h2>
        <button type="button" className="btn btn-plain btn-round" onClick={onClose} aria-label="Close"><CloseIcon size={20} /></button>
      </div>
      <div className="space-y-3 p-4">
        {snap === null && <div className="skeleton h-40" role="status" aria-label="Loading the rows" />}
        {snap === "failed" && <p><CannotVerify /> These rows can&apos;t be opened.</p>}
        {snap && snap !== "failed" && (
          <>
            <p className="font-semibold">{label?.(snap.template_id) ?? snap.template_id}</p>
            <p className="text-[14px] text-muted">
              Taken from the books {formatDayTime(snap.created_at, tz, fmt.locale)} · {snap.run_id ? "by Munim's AI, for the text you were reading" : "for this screen"} · {snap.row_count} {snap.row_count === 1 ? "row" : "rows"}
            </p>
            {cited && cited.kind === "snap" && cellOf(snap, cited) === undefined && <p><CannotVerify /> The cited cell is not in these rows.</p>}
            <div className="overflow-x-auto">
              <table className="snap-table">
                <thead><tr>{snap.columns.map((c) => <th key={c.name} className={c.type === "integer" || c.type === "numeric" ? "num" : undefined} scope="col">{c.name}</th>)}</tr></thead>
                <tbody>
                  {snap.rows.map((row, i) => {
                    const here = cited?.kind === "snap" && cited.row === i;
                    return (
                      <tr key={i} aria-current={here ? "true" : undefined}>
                        {snap.columns.map((c) => (
                          <td key={c.name} className={c.type === "integer" || c.type === "numeric" ? "num" : undefined} aria-current={here && cited?.kind === "snap" && cited.column === c.name ? "true" : undefined}>
                            {c.type === "uuid" ? String(row[c.name] ?? "—").slice(0, 8) : formatCell(row[c.name] ?? null, c.name, fmt)}
                            {c.name === "name" && row.simulated === true && <> <SimulatedRecipient /></>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[14px] text-muted">Demo: all data is synthetic.</p>
          </>
        )}
      </div>
    </dialog>
  );
}

/** Wherever a supplier's name appears. */
export const SimulatedSupplier = () => <span className="sim-badge">{SIMULATED_SUPPLIER}</span>;
/** Wherever a donation recipient's name appears (the name keeps its "(simulated)"). */
export const SimulatedRecipient = () => <span className="sim-badge">{SIMULATED_RECIPIENT}</span>;

export type PillTone = "new" | "work" | "ready" | "done" | "stop" | "warn" | "late";
/** A status in words, with a tone. Never colour alone: the word is always there. */
export const StatusPill = ({ tone, children }: { tone: PillTone; children: React.ReactNode }) => <span className={`pill pill-${tone}`}>{children}</span>;
export const ORDER_TONE: Record<string, PillTone> = { placed: "new", accepted: "work", preparing: "work", ready: "ready", completed: "done", rejected: "stop", cancelled: "stop" };
export const TICKET_TONE: Record<string, PillTone> = { queued: "new", preparing: "work", ready: "ready", done: "done" };
export const DRAFT_TONE: Record<string, PillTone> = { proposed: "new", executing: "work", executed: "ready", failed: "stop", rejected: "done", stale: "warn" };
```

| Piece | Looks like | Says | States |
|---|---|---|---|
| Traced value | The formatted cell in bold tabular figures, then a small plum pill with a stamp mark | "Source" (accessible name "Source of ₹4,860.00: open the rows") | Normal; focus ring; pressed opens the drawer |
| "Cannot verify" chip | Dashed red pill with the alert icon | "Cannot verify" | Always the same; a `title` may give the reason in words |
| Snapshot drawer | The storefront's right-side `dialog.drawer`, full height | Title "Where this number comes from"; the template in words; "Taken from the books {day time} · by Munim's AI, for the text you were reading" (or "· for this screen") "· N rows"; the rows as a table with the cited row tinted and the cited cell outlined; a recipient's `name` cell followed by "Simulated recipient" whenever its row says `simulated`; "Demo: all data is synthetic." | Loading (skeleton, "Loading the rows"); "Cannot verify — These rows can't be opened." (404); "The cited cell is not in these rows." |
| Stat card | A `.card` with a muted label, a large figure and its chip, an optional note | e.g. "Kitchen tickets today", "Net sales this week", "Waste this week", "Food shared this month" | Loading (skeleton bar); value; "Cannot verify" (mint failed or the cell is missing) |

Template words for the drawer (pass as `label`): `kitchen.ticket_coverage` "Kitchen tickets",
`kitchen.ticket_times` "Kitchen ticket times", `kitchen.prep_need` "What to prep", `people.labour_pct` "Labour and
net sales by week", `inventory.waste_week` "Waste this week", `inventory.below_reorder` "Stock below its minimum",
`purchasing.quote_compare` "Quotes from simulated suppliers", `cares.impact` "Food shared", `inventory.expiry_risk`
"Stock close to its use-by date", `cares.recipient_match` "Simulated recipients that can take this food",
`inventory.shortfall` "Stock short of what is needed", `purchasing.price_creep` "Supplier prices over time",
`purchasing.deal_inputs` "What a quote was checked against" (all in 12's
`lib/munim/template-words.ts`). Uuid columns show their first eight characters (screens may pass names where they have
them).

## 5 · The draft card

The draft page (12), the Cares proposals (14) and the purchase-order proposals (15) show AI drafts as cards. Each
numeric field uses `DraftField`, and every card decides through the one action bar, `DecisionBar` (below), on 01 §6.1's
`lib/munim/drafts.ts`:

```tsx
// file: components/staff/draft-field.tsx
"use client";
// One numeric field of an AI draft: the proposed value with its source chip, or "Cannot verify"; and, once the
// approver types a value, their edit labelled as theirs beside the struck-through proposal. The draft card in 12
// lays these out; this file fixes how each one looks and what it says.
import { columnOf, formatCell, parseTyped, type CellFormat, type DraftValue } from "@/lib/munim/refs";
import { CannotVerify, SourcedValue } from "./source";

/** The unit a person types in, by the field's name: "INR" for *_minor, "seconds" for *_sec, the line's unit otherwise. */
export const unitOf = (column: string, currency: string, lineUnit = "quantity"): string =>
  column.endsWith("_minor") ? currency : column.endsWith("_sec") ? "seconds" : column.endsWith("_milli") ? lineUnit : "number";

export function DraftField({ label, value, edit, editorName, fmt, column, lineUnit, onOpen, onEdit, editing }: {
  label: string;
  /** draftValue(leaf, path, resolved_refs, unverified_refs) from refs.ts. */
  value: DraftValue;
  /** What the approver typed, already in the field's own units (parseTyped), or null. */
  edit: number | null;
  editorName: string;
  fmt: CellFormat;
  /** The payload field name ("unit_price_minor", "qty_milli", "prep_sec") so the value is formatted by its unit. */
  column: string;
  /** The payload line's unit ("kg", "g"), for the input's label on a quantity field. */
  lineUnit?: string;
  onOpen: (snapshotId: string, refToken: string) => void;
  /** Present while the card is in edit mode: renders the input. */
  onEdit?: (v: number | null) => void;
  editing?: boolean;
}) {
  const proposed =
    value.kind === "proposed" ? <SourcedValue text={formatCell(value.value, columnOf(value.parsed) || column, fmt)} refToken={value.ref} onOpen={onOpen} />
    : value.kind === "edited" ? <span className="src-value">{formatCell(value.value, column, fmt)}</span>
    : <CannotVerify />;
  return (
    <div className="draft-field">
      <p className="font-semibold">{label}</p>
      <div className="space-y-1">
        <p className={edit !== null ? "draft-proposed-struck" : undefined}>
          {value.kind === "edited" ? <span className="draft-edit-label">Edited earlier · </span> : <span className="text-muted">Proposed · </span>}
          {proposed}
        </p>
        {edit !== null && (
          <p>
            <span className="src-value">{formatCell(edit, column, fmt)}</span> <span className="draft-edit-label">Edited by {editorName}</span>
          </p>
        )}
        {editing && onEdit && (
          <label className="block text-[14px] font-semibold">
            {value.kind === "unverified" ? "Type the value you checked" : "Change it (optional)"} ({unitOf(column, fmt.currency, lineUnit)})
            <input inputMode="decimal" onChange={(e) => onEdit(parseTyped(e.target.value, column, fmt.currency))} />
          </label>
        )}
      </div>
    </div>
  );
}
```

Card, top to bottom:

1. Header: what it proposes in words ("Change an item's prep time", "A prep list", "Order from {supplier}"), the
   specialist ("Kitchen", "Stock & Purchasing"), the status pill (`DRAFT_STATUS` words, `DRAFT_TONE` tones), the
   outlet name.
2. The fields: one `DraftField` row per numeric leaf, with plain-text rows for the rest (item, supplier with its
   "Simulated supplier" badge, dates).
3. The lineage line, muted, one line: "Proposed by Kitchen · {time} · from a finding: Tickets running past their prep
   time" and, once decided, "· Approved with edits by Nandini Mehrotra (demo) · {time}" (`lineageLine`, 01 §6.1, from
   `GET /v1/drafts/{id}`: `source`, `finding_id`, `created_at`, `decision.verdict`, `decision.decided_by.name`,
   `decision.decided_at`).
4. The action bar, `DecisionBar`, which shows what `approveGate` allows (nothing once the draft is no longer
   `proposed`). Buttons are ≥ 48 px:
   - **"Approve as {name}"** (primary): only while every number traces and nothing is being edited.
   - **"Edit"** (plain) → edit mode; then **"Approve with my edits as {name}"** (primary), enabled once every
     untraced field has a typed value and the reason box ("Why you changed it", 1–500 characters) is filled. "Cancel"
     leaves edit mode and drops the typed values.
   - **"Reject"** (plain, danger text) → "Why reject it?" (a select of `REJECT_REASONS`, first option "Choose a
     reason") and "What's wrong?" (a note, 1–500 characters) → **"Reject as {name}"**, enabled once both are filled.
   - While a request is in flight every button is disabled and the pressed one reads "Saving…". After a 429 every
     button waits, and "Try again in {s} s" counts down.

```tsx
// file: components/staff/decision.tsx
"use client";
// The action bar of an AI draft (02 §5), the one way any screen decides a draft: the draft page (12), the Cares
// proposal card (14) and the purchase-order proposal card (15). Approve as proposed, edit then approve with my edits,
// or reject with a reason; which of these show comes from approveGate (lib/munim/drafts.ts). Every button names the
// person; nothing happens without a tap; one attempt per thing confirmed, so a double tap or a retry never sends two
// decisions.
import { useRef, useState } from "react";
import { useCountdown } from "@/lib/hooks";
import type { Result } from "@/lib/munim/client";
import { approveAttempt, editsReady, gateLine, outcomeOf, rejectAttempt, type ApproveAttempt, type ApproveGate, type EditedPayload, type Outcome, type RejectAttempt, type RejectCode } from "@/lib/munim/drafts";
import type { StaffClient } from "@/lib/munim/staff";
import { REJECT_REASONS, staffWriteErrorText, type StaffWhere } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";
import { ErrorNote } from "../ui";

type Sent = Result<Schemas["CommandResult"]>;

/** Sends the decisions for one draft. `onOutcome` gets every settled answer (refetch there); the error line for a
 *  failure stays here. A retryable failure keeps its attempt: "Try again" (or the same button) resends the same envelope. */
export function useDecision(client: StaffClient, draft: { draft_id: string; command_type: string }, where: StaffWhere, onOutcome: (o: Outcome) => void) {
  const approveRef = useRef<ApproveAttempt | null>(null);
  const rejectRef = useRef<RejectAttempt | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt, () => setRetryAt(null));

  const run = async (which: "approve" | "reject", send: () => Promise<Sent>, clear: () => void, again: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(which);
    setError(null);
    setRetry(null);
    const o = outcomeOf(await send());
    inFlight.current = false;
    setBusy(null);
    if (o.kind === "retry") {
      setError(staffWriteErrorText(o.error, where));
      setRetry(() => again);
      if (o.error.retryAfterMs) setRetryAt(Date.now() + o.error.retryAfterMs);
      return;
    }
    clear();
    if (o.kind === "cannot_verify" || o.kind === "failed_to_apply" || o.kind === "refused") setError(staffWriteErrorText(o.error, where));
    onOutcome(o);
  };

  const approve = (edited: EditedPayload | null, reason: string | null): void => {
    void run("approve", () => {
      const a = approveAttempt(approveRef.current, draft, edited, reason);
      approveRef.current = a;
      return client.approveDraft(draft.draft_id, a.body);
    }, () => { approveRef.current = null; }, () => approve(edited, reason));
  };
  const reject = (code: RejectCode, note: string): void => {
    void run("reject", () => {
      const a = rejectAttempt(rejectRef.current, draft.draft_id, code, note);
      rejectRef.current = a;
      return client.rejectDraft(draft.draft_id, a.body);
    }, () => { rejectRef.current = null; }, () => reject(code, note));
  };
  return { busy, error, retry, wait, approve, reject };
}

export function DecisionBar({ name, gate, commandType, edits, editing, onEdit, busy, error, retry, wait, onApprove, onApproveEdited, onReject }: {
  /** The signed-in person's name: every button says it. */
  name: string;
  /** approveGate(detail, numericFields(detail), me): which buttons show. */
  gate: ApproveGate;
  commandType: string;
  /** What the person typed, by JSON Pointer path (in each field's own units). */
  edits: Readonly<Record<string, number>>;
  editing: boolean;
  /** false = "Cancel": the screen drops its typed values. */
  onEdit: (on: boolean) => void;
  busy: "approve" | "reject" | null;
  error: string | null;
  retry: (() => void) | null;
  /** Seconds left before a rate-limited retry may go: every button waits. */
  wait: number;
  onApprove: () => void;
  onApproveEdited: (reason: string) => void;
  onReject: (code: RejectCode, note: string) => void;
}) {
  const [why, setWhy] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState<RejectCode | "">("");
  const [note, setNote] = useState("");
  if (gate.kind === "closed") return null;
  const line = gateLine(gate, commandType);
  const off = busy !== null || wait > 0;
  const label = (which: "approve" | "reject", text: string) => (busy === which ? "Saving…" : text);
  const mayEdit = gate.kind === "open" || gate.kind === "type_first";
  return (
    <div className="space-y-3 border-t-[1.5px] border-bg-deep pt-4">
      {line && !(rejecting && gate.kind === "type_first") && <p className="font-semibold">{line}</p>}
      {editing && mayEdit && (
        <label className="block font-semibold">
          Why you changed it
          <textarea rows={2} maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} disabled={off} />
        </label>
      )}
      {rejecting && (
        <div className="grid gap-3">
          <label className="block font-semibold">
            Why reject it?
            <select value={code} onChange={(e) => setCode(e.target.value as RejectCode | "")} disabled={off}>
              <option value="">Choose a reason</option>
              {REJECT_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </label>
          <label className="block font-semibold">
            What&apos;s wrong?
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} disabled={off} />
          </label>
        </div>
      )}
      {gate.kind !== "not_for_you" && (
        <div className="flex flex-wrap gap-3">
          {gate.kind === "open" && !editing && !rejecting && (
            <button type="button" className="btn btn-primary" disabled={off} onClick={onApprove}>{label("approve", `Approve as ${name}`)}</button>
          )}
          {editing && mayEdit && (
            <>
              <button type="button" className="btn btn-primary" disabled={off || !editsReady(gate, edits, why)} onClick={() => onApproveEdited(why.trim())}>
                {label("approve", `Approve with my edits as ${name}`)}
              </button>
              <button type="button" className="btn btn-plain" disabled={off} onClick={() => { setWhy(""); onEdit(false); }}>Cancel</button>
            </>
          )}
          {!editing && !rejecting && (
            <>
              {mayEdit && <button type="button" className="btn btn-plain" disabled={off} onClick={() => onEdit(true)}>Edit</button>}
              <button type="button" className="btn btn-plain text-danger" disabled={off} onClick={() => setRejecting(true)}>Reject</button>
            </>
          )}
          {rejecting && (
            <>
              <button type="button" className="btn btn-plain text-danger" disabled={off || code === "" || note.trim() === ""} onClick={() => code !== "" && onReject(code, note.trim())}>
                {label("reject", `Reject as ${name}`)}
              </button>
              <button type="button" className="btn btn-plain" disabled={off} onClick={() => { setRejecting(false); setCode(""); setNote(""); }}>Cancel</button>
            </>
          )}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {retry && (
        <button type="button" className="btn btn-plain" disabled={off} onClick={retry}>{wait > 0 ? `Try again in ${wait} s` : "Try again"}</button>
      )}
    </div>
  );
}
```

- `useDecision` keeps one attempt per approve and one per reject. A network error, 429 or 5xx keeps it: "Try again",
  or the same button with the same inputs, resends the same envelope. Any other answer ends it.
- Every answer except a retryable one goes to `onOutcome`, and the screen refetches the draft there. The bar keeps
  the error line for "Cannot verify", "Couldn't apply" and a refusal; the screen shows the toasts for "done",
  "decided elsewhere" and "stale".
- A failed decision's network line is the write one (01 §9 `staffWriteErrorText`): "The connection dropped before
  Munim answered. Tap again: it's safe and won't happen twice." The request may have landed, and the resend is safe.

Card states and their copy:

| State | What shows |
|---|---|
| Proposed, all traced (`open`) | Fields with chips; "Approve as …", "Edit", "Reject" |
| Proposed, some unverified (`type_first`) | Those fields show "Cannot verify"; above the bar: "Some numbers in this draft don't trace to your books. Type the values you checked, or reject it."; "Approve" hidden; "Edit" and "Reject" |
| Proposed, untraceable (`untraceable`) | "Some numbers this draft relies on can't be opened with your access, so it can't be approved. You can reject it."; "Reject" only |
| Not this person's to decide (`not_for_you`) | No buttons. A whole-business draft: "Only the owner can decide this one: it changes the whole business." A draft covering outlets beyond the person's: "Only the owner can decide this one: it covers outlets beyond yours." A Cares proposal for a manager: "Only the owner can approve or reject a donation." Any other owner-only type: "Only the owner can decide this one." Staff: "Owners and managers decide proposals." |
| Editing | Inputs under each field, labelled with the unit the person types in ("Type the value you checked (INR)", "(seconds)", "(kg)": `unitOf`, with the payload line's unit through `lineUnit`); each typed value appears as "{value} Edited by {name}" beside the struck-through proposal |
| Approved | Pill "Applied"; the lineage line with "Approved by …"; no buttons |
| Approved with edits | Pill "Applied"; lineage "Approved with edits by …". The fields show the proposal, on the mock as on the real API: the draft keeps its proposed payload, and the typed value is on the purchase order or listing (00 §7 question 15) |
| Rejected | Pill "Rejected"; lineage "Rejected by …" |
| Stale (409 `stale_draft`) | Pill "Out of date"; "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it." |
| Someone else decided (409 `already_decided`) | Toast "Someone else already decided this. It has been refreshed."; the card refetches |
| Can't apply (422 `execution_failed`) | `ErrorNote` "It was approved but could not be applied. Nothing changed."; the refetched draft reads "Couldn't apply" |
| Cannot verify on approve (422 `cannot_verify`) | `ErrorNote` "Cannot verify — some numbers in this draft no longer trace to their source rows." Refetch the draft: its `unverified_refs` decide which fields show "Cannot verify". (client.ts keeps no body fields, so the error's `refs[]` never reaches the screen; a stale draft's `changes[]` are read from the refetched `history` the same way.) |
| Role refused (403 `authority_denied`) | `ErrorNote` "Your role can't do this. Ask the owner." |
| 429 | `ErrorNote` "Too many requests. Please wait a moment and try again."; "Try again in {s} s", then "Try again" |
| Network / 5xx | `ErrorNote` "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." / "Something went wrong on our side. Try again."; "Try again" resends the same envelope |

## 6 · Simulated badges and status pills

- "Simulated supplier" (`SimulatedSupplier`) and "Simulated recipient" (`SimulatedRecipient`): a dashed ink pill,
  right after the name, every time the name appears (lists, quote rows, purchase orders, draft cards, donation
  cards). The name keeps its "(simulated)".
- "Demo sign-in": the same dashed pill, in the staff bar.
- Status pills (`StatusPill`): the word always, the tone only helps.

| Thing | Status → word (tone) |
|---|---|
| Order (`ORDER_STATUS`, `ORDER_TONE`) | placed "New" (new) · accepted "Accepted" (work) · preparing "Preparing" (work) · ready "Ready" (ready) · completed "Picked up" (done) · rejected "Not accepted" (stop) · cancelled "Cancelled" (stop) |
| Ticket (`TICKET_STATUS`, `TICKET_TONE`) | queued "Waiting" (new) · preparing "Preparing" (work) · ready "Ready" (ready) · done "Done" (done) |
| Ticket colour (`TICKET_COLOUR`) | normal "On time" · amber "Due soon" (warn) · red "Late" (late) |
| Draft (`DRAFT_STATUS`, `DRAFT_TONE`) | proposed "Waiting for you" · executing "Applying" · executed "Applied" · failed "Couldn't apply" · rejected "Rejected" · stale "Out of date" |
| Cares listing (`LISTING_STATUS`) | published "Waiting for pickup" · allocated "Claimed" · closed "Handed over" · withdrawn "Withdrawn" |
| Purchase order (`PO_STATUS`) | committed "Sent" · received "Received" · cancelled "Cancelled" |

## 7 · The kitchen ticket

```tsx
// file: components/staff/kitchen-ticket.tsx
"use client";
// One kitchen ticket, readable at arm's length: big ticket number, the colour as a word ("Due soon", "Late"), every
// line with its options and the customer's note large and boxed, and one 64 px button for the next step. The board
// (11) lays tickets out in lanes and refetches on every live event.
import { formatQty, formatTime } from "@/lib/munim/format";
import { ORDER_STATUS, TICKET_COLOUR, TICKET_NEXT, TICKET_STATUS } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";
import { StatusPill, TICKET_TONE } from "./source";

type Ticket = Schemas["V1KdsBoard"]["tickets"][number];

/** Minutes since the ticket's timer started, from the board's own as_of (never the tablet's clock). */
export const elapsedMin = (t: Ticket, asOf: string): number => Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(t.started_at)) / 60_000));

export function TicketCard({ ticket, asOf, tz, locale, names, busy, onAdvance, sizeOf }: {
  ticket: Ticket;
  asOf: string;
  tz: string;
  locale: string;
  /** Display names by name_key, from GET /v1/catalogue/menu (the board sends name keys only). */
  names: (nameKey: string) => string;
  busy: boolean;
  onAdvance: (t: Ticket, to: "preparing" | "ready" | "done") => void;
  /** The line's size ("1 kg (serves 8–10)"), read from the ticket's order: the board's lines carry no variant. */
  sizeOf?: (lineNo: number) => string | null;
}) {
  const next = TICKET_NEXT[ticket.status];
  const kind = ticket.kind === "pickup" ? "Pickup" : ticket.kind === "dine_in" ? `Table ${ticket.table_ref ?? ""}`.trim() : ticket.kind === "delivery" ? "Delivery" : "Takeaway";
  return (
    <article className="ticket" data-colour={ticket.colour} data-lane={ticket.lane} aria-label={`Ticket ${ticket.ticket_no}, ${TICKET_STATUS[ticket.status]}, ${TICKET_COLOUR[ticket.colour]}`}>
      <header className="ticket-head">
        <div>
          <p className="ticket-no">#{ticket.ticket_no}</p>
          <p className="text-[15px] font-semibold">{kind} · {ticket.channel_kind === "counter" ? "Counter" : "Web"}</p>
        </div>
        <div className="text-right">
          <p className="ticket-timer">{elapsedMin(ticket, asOf)} min</p>
          <p className="text-[15px] font-bold">{TICKET_COLOUR[ticket.colour]}{ticket.due_at ? ` · due ${formatTime(ticket.due_at, tz, locale)}` : ""}</p>
        </div>
      </header>
      <div className="ticket-lines">
        <StatusPill tone={TICKET_TONE[ticket.status]!}>{TICKET_STATUS[ticket.status]}</StatusPill>
        {ticket.lines.map((l) => (
          <div key={l.line_no} className="space-y-1">
            <p className="ticket-line"><span className="ticket-qty">{formatQty(l.qty_milli, locale)}×</span> {names(l.name_key)}{sizeOf?.(l.line_no) && <span className="font-bold"> · {sizeOf?.(l.line_no)}</span>}</p>
            {l.options.length > 0 && <p className="ticket-options">{l.options.map((o) => names(o.name_key)).join(" · ")}</p>}
            {l.note && <p className="ticket-note">“{l.note}”</p>}
          </div>
        ))}
      </div>
      {next && (
        <div className="ticket-actions">
          <button type="button" className={`btn ${next.to === "ready" ? "btn-secondary" : "btn-primary"}`} disabled={busy} onClick={() => onAdvance(ticket, next.to)}>
            {busy ? "Saving…" : next.label}
          </button>
        </div>
      )}
    </article>
  );
}

/** For the counter's order list: the order's status as a pill word. */
export const orderStatusWord = (s: string): string => ORDER_STATUS[s] ?? s;
```

- Readable at arm's length on a 1024 × 768 tablet: ticket number 32 px bold, lines 22 px, options 18 px, the note 20 px
  bold in a boxed accent panel with quotation marks, the timer 22 px. One action button, 64 px tall, full width.
- Colour is never alone: the head says "On time", "Due soon · due 6:42 pm" or "Late · due 6:20 pm"; amber and red
  tickets also get a thicker edge in their colour. `lane: "later"` tickets have a dashed edge (no fading) and sit in
  their own "Later" column.
- Button words by status: "Start" (queued), "Ready" (preparing, rose-berry), "Handed over" (ready); "Saving…" while
  the request runs. Done tickets leave the board.
- Names: the board sends `name_key`s only. Load `GET /v1/catalogue/menu` for the outlet (`channel_kind: "counter"`)
  once and map `item.<slug>` and `option.<slug>` keys to `display_name`; fall back to `titleCase(name_key)`.
- Sizes: the board's lines carry no `variant_id`; the kitchen reads each ticket's order once (`GET /v1/orders/{id}`)
  and passes `sizeOf` (11), so a line reads "1× Hazelnut Praline Cake · 1 kg (serves 8–10)".
- The elapsed minutes come from the board's own `as_of` minus the ticket's `started_at`, refreshed with the board.

## 8 · The till: tiles and the cart rail

```tsx
// file: components/staff/till.tsx
"use client";
// The till's two shared pieces: an item tile (tap to add; sold out is a word, never just grey) and a cart rail line.
// The counter screen (10) owns the cart, the preview and the payment panel; numbers on the rail come only from
// the preview response.
import { formatMoney, shownName, titleCase } from "@/lib/munim/format";
import type { Schemas } from "@/lib/munim/types";
import { SITE } from "@/lib/site";
import { QtyStepper } from "../cart-bits";

type Entry = Schemas["V1CatalogueMenu"]["entries"][number];

/** "Hazelnut Praline Cake" and "1 kg (serves 8–10)": the owner's display text, else a label for the key. */
export const entryName = (e: Entry): string => shownName(e);
export const entryVariant = (e: Entry): string | null => e.variant_display_name ?? (e.variant_name_key ? titleCase(e.variant_name_key) : null);

export function Tile({ entry, onAdd }: { entry: Entry; onAdd: (e: Entry) => void }) {
  const soldOut = !entry.available;
  return (
    <button type="button" className="tile" aria-disabled={soldOut} onClick={() => !soldOut && onAdd(entry)}
      aria-label={`${entryName(entry)}${entryVariant(entry) ? `, ${entryVariant(entry)}` : ""}${soldOut ? ", sold out" : ""}`}>
      <span>
        {entryName(entry)}
        {entryVariant(entry) && <span className="block text-[15px] font-normal text-muted">{entryVariant(entry)}</span>}
      </span>
      <span className="flex items-center justify-between gap-2">
        {/* The price row's own amount, for the person choosing: never added up here. */}
        <span className="tile-price">{formatMoney(entry.price_minor, entry.currency, SITE.locale)}</span>
        {soldOut ? <span className="soldout-pill">Sold out</span> : entry.option_groups.some((g) => g.required) ? <span className="badge">Choose</span> : null}
      </span>
    </button>
  );
}

export function CartRailLine({ name, detail, note, qty, lineTotal, onQty, disabled }: {
  name: string;
  detail: string;
  note: string | null;
  qty: number;
  /** preview.lines[i].line_total_minor formatted, or null before the preview answers ("…"). */
  lineTotal: string | null;
  onQty: (q: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="cart-line">
      <div>
        <p className="font-semibold">{name}</p>
        {detail && <p className="text-[14px] text-muted">{detail}</p>}
        {note && <p className="text-[14px]">Note: “{note}”</p>}
      </div>
      <p className="num text-right font-semibold">{lineTotal ?? "…"}</p>
      <QtyStepper qty={qty} name={name} onChange={onQty} disabled={disabled} />
    </div>
  );
}
```

- `.pos` is two columns from 900 px: the tile grid (left, scrolls) and the cart rail (right, sticky). Below 900 px
  the rail drops under the grid.
- Tiles are ≥ 104 px tall, 150 px wide minimum, name 17 px, the price row's own amount in hazelnut. A sold-out tile
  keeps its name, turns `--bg-deep`, and wears the storefront's tilted "Sold out" pill; it cannot be added. An item
  with required options shows a "Choose" badge and opens the options modal (`dialog.modal`, 10).
- The rail lists lines with the stepper; each line's amount is the preview line's `line_total_minor` ("…" until the
  preview answers). Under the lines: subtotal, discount, tax and total from the preview response only, then the
  64 px "Place order · {total}" button: it places the order, and the payment is recorded on the order's page next (10;
  recorded only, never charged). With refusals the totals are replaced by the refusal copy.
- Category headers above each group of tiles use `CategoryMotif` and the category label; no swash, no scallop.

## 9 · Empty, loading, error, offline

| Pattern | Markup | Copy (literal) |
|---|---|---|
| Loading a list or board | `.skeleton` blocks at the final size (no layout shift) | none visible; `role="status"` "Loading" |
| Empty | `.state-box` with a small drawn motif | Counter "No orders yet today." · Kitchen "No tickets right now." · Inbox "Nothing waiting for you." · Ask "Ask about your sales, stock, kitchen or staff." · Cares "No food listed today." · Suppliers "No purchase orders yet." |
| Error (a call failed) | `ErrorNote` + "Try again" (`.btn-plain`) | `staffErrorText(error, where)` (01 §9) |
| Not found / not yours | `FullPage` | "Not found." + "It may have been removed, or it isn't in your outlets." |
| Offline | `.offline-bar` under the staff bar, sticky | "You're offline. Showing the last update." (kitchen: "Offline. Showing the last board; changes will need a retry.") |
| Live updates off (stream refused or retrying) | A muted line by the screen title, with "Refresh" | "Live updates are off. Tap Refresh to update." |
| AI unavailable (503, or the stream says so) | The AI section is not rendered at all | nothing: AI degrades to hidden, never an error |

## 10 · Motion and accessibility

- Reduced motion: the ribbon stops, the drawer does not slide, tickets do not pulse (globals.css already turns
  animations off). A new ticket may fade in over 150 ms; nothing bounces.
- New tickets and status changes are announced through the always-mounted `Toast` region (`aria-live="polite"`):
  "New ticket 12", "Ticket 9 ready". The chime, if you add one, is off by default with a "Sound on" toggle.
- Keyboard: every chip, tile, ticket button and drawer is reachable with Tab, opens with Enter / Space, and the
  drawer closes with Escape (native `dialog`).
- Inputs keep the storefront's 16 px minimum. On the till and the kitchen display, main actions are 64 px tall.

## 11 · Art log

Add each new drawing to the README log, for example: "2026-10-14 · `components/staff/source.tsx` · Ledger-stamp mark
in the source chip (rounded square, two ruled lines) — drawn by hand for this project." Draw your own for anything
else (an empty-inbox motif, a supplier van, a donation basket), in the style of `components/art.tsx`.
