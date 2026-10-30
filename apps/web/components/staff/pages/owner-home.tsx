// file: components/staff/pages/owner-home.tsx
"use client";
// /staff/home: the chosen outlet today, in figures that each open the rows behind them, and what waits for a person.
// Figures are snapshots minted here (owner-figures.ts) on load, on an outlet change and on "Refresh figures" only:
// every mint is a new snapshot row, so a live event never re-mints. "Orders today" is a list length, not a snapshot.
// The inbox part refetches on inbox:<tenant>. Owners and managers only.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCountdown, useOnline } from "@/lib/hooks";
import { findingTitle, draftTitle, notForYou, sourceName, sourcePack, type Draft } from "@/lib/munim/drafts";
import { formatDate, formatWhen } from "@/lib/munim/format";
import { loadOwnerFigures, noFigures, type Figure, type OwnerFigures } from "@/lib/munim/owner-figures";
import { columnOf, formatCell, outletNames, parseRef, type CellFormat } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { watchFor } from "@/lib/munim/staff-app";
import { specialistName, staffErrorText } from "@/lib/munim/staff-copy";
import { topic, type LiveState } from "@/lib/munim/staff-stream";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE } from "@/lib/site";
import { OfflineBanner } from "../../ui";
import { useStaff } from "../shell";
import { RunBy } from "../run-by";
import { CannotVerify, SnapshotDrawer, SourcedValue, StatCard, StatusPill } from "../source";
import { RequestQuotes } from "../suppliers/request-quotes";
import { Rollup } from "../rollup";
import { LiveLine, NotForRole, SEVERITY, type OpenRef } from "./inbox";

type Finding = Schemas["V1Finding"];


/** A figure as text for StatCard: undefined while loading, null for "Cannot verify". */
const shown = (f: Figure | null | undefined, fmt: CellFormat): string | null | undefined => (f === undefined ? undefined : f === null ? null : formatCell(f.value, f.column, fmt));

/** A card that shows a word, not a number: the snapshot answered with no rows. */
function WordCard({ label, word, note }: { label: string; word: string; note: string }) {
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{word}</p>
      <p className="text-[14px] text-muted">{note}</p>
    </div>
  );
}

const SEVERITY_ORDER: Record<Finding["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** A finding in the home brief: how serious, what, who noticed it (and with which model), and its impact with its source. */
function FindingBrief({ finding, fmt, tz, onOpen }: { finding: Finding; fmt: CellFormat | null; tz: string; onOpen: OpenRef }) {
  const e = finding.envelope;
  const impact = e.impact_ref ? finding.resolved_refs.find((r) => r.ref === e.impact_ref) : undefined;
  const ref = e.impact_ref ? parseRef(e.impact_ref) : null;
  const [sev, tone] = SEVERITY[finding.severity];
  return (
    <li className="card grid gap-1 p-4">
      <span className="flex flex-wrap items-center gap-2 text-[14px] text-muted"><StatusPill tone={tone}>{sev}</StatusPill>{formatWhen(finding.created_at, tz, SITE.locale)}</span>
      <Link href={`/staff/inbox#finding-${finding.finding_id}`} className="inline-flex min-h-12 items-center text-[19px] font-semibold">{findingTitle(finding.type)}</Link>
      <p className="text-[15px]"><RunBy agent={specialistName(finding.pack)} runId={finding.run_id} of={{ finding: finding.finding_id }} /></p>
      {fmt && !e.abstained && (
        <p className="text-[15px]">
          Impact{" "}
          {impact && ref ? <SourcedValue text={formatCell(impact.value, columnOf(ref), fmt)} refToken={impact.ref} onOpen={onOpen} /> : <CannotVerify />}
        </p>
      )}
    </li>
  );
}

/** One sourced figure inline, or "Cannot verify". */
function Inline({ f, fmt, onOpen, unit }: { f: Figure | null; fmt: CellFormat; onOpen: OpenRef; unit?: string }) {
  if (!f) return <CannotVerify />;
  const text = formatCell(f.value, f.column, fmt);
  return <SourcedValue text={unit ? `${text} ${unit}` : text} refToken={f.ref} onOpen={onOpen} />;
}

/** Proposals in the home brief under one heading, its count, and the first three. */
function DraftGroup({ title, drafts, more, tz, outletName }: { title: string; drafts: Draft[]; more: string; tz: string; outletName: (id: string) => string }) {
  if (drafts.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-[19px]">{title} <span className="text-muted">· {drafts.length}{more}</span></h3>
      <ul className="grid gap-3">
        {drafts.slice(0, 3).map((d) => (
          <li key={d.draft_id} className="card grid gap-1 p-4">
            <span className="text-[14px] text-muted">Proposed {formatWhen(d.created_at, tz, SITE.locale)} · {d.outlet_ids.length === 0 ? "Whole business" : d.outlet_ids.map(outletName).join(", ")}</span>
            <Link href={`/staff/inbox/${d.draft_id}`} className="inline-flex min-h-12 items-center text-[19px] font-semibold">{draftTitle(d.command_type)}</Link>
            <p className="text-[15px]"><RunBy agent={sourceName(d.source)} runId={d.run_id} of={{ draft: sourcePack(d.source) }} /></p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OwnerHomePage() {
  const { session, client, outlet, outlets, handleAuth } = useStaff();
  const allowed = can(session, "home");
  const [tenant, setTenant] = useState<Schemas["V1Tenant"] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [figures, setFigures] = useState<OwnerFigures | null>(null);
  const [orders, setOrders] = useState<{ n: number; more: boolean } | "failed" | null>(null);
  const [ingredients, setIngredients] = useState<Schemas["V1InventoryIngredients"]["items"]>([]);
  const [inbox, setInbox] = useState<Schemas["V1InboxResponse"] | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const online = useOnline();
  const waitS = useCountdown(retryAt, () => setRetryAt(null));
  const outletId = outlet?.id ?? null;
  // T-128: the owner of several outlets also sees them together ("All outlets"); each outlet's books stay apart.
  const [scope, setScope] = useState<"outlet" | "all">("outlet");
  const rollupAllowed = session.me.outlet_ids === "*" && outlets.length > 1 && ["owner", "judge"].includes(session.me.role);

  const loadFigures = useCallback(async () => {
    if (!outletId) return;
    setFigures(null);
    setOrders(null);
    // "Today" is the outlet's business date, as the menu reports it.
    const menu = await client.getMenu(outletId, "counter");
    if (!menu.ok) {
      if (handleAuth(menu.error)) return;
      setToday(null);
      setFigures(noFigures(menu.error));
      setOrders("failed");
      return;
    }
    const day = menu.data.business_date;
    setToday(day);
    const [f, o] = await Promise.all([loadOwnerFigures(client, outletId, day), client.listOrders({ outlet: outletId, business_date: day, limit: 100 })]);
    if (f.error && handleAuth(f.error)) return;
    if (f.error?.kind === "rate_limited") setRetryAt(Date.now() + (f.error.retryAfterMs ?? 5000));
    setFigures(f);
    setOrders(o.ok ? { n: o.data.items.length, more: o.data.next_cursor !== null } : "failed");
  }, [client, outletId, handleAuth]);

  const loadInbox = useCallback(async () => {
    const r = await client.listInbox();
    if (r.ok) setInbox(r.data);
    else handleAuth(r.error);
  }, [client, handleAuth]);

  useEffect(() => {
    if (!allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and on an outlet change
    void loadFigures();
  }, [allowed, loadFigures]);

  useEffect(() => {
    if (!allowed) return;
    void client.getTenant().then((r) => r.ok && setTenant(r.data));
    void client.listIngredients().then((r) => r.ok && setIngredients(r.data.items));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the response
    void loadInbox();
    return watchFor(session, [topic.inbox(session.tenantId)], () => void loadInbox(), setLive);
  }, [allowed, client, loadInbox, session]);

  if (!allowed) return <NotForRole />;
  if (!outlet) return <main className="wrap staff-main"><div className="state-box" role="status">Loading</div></main>;

  const tz = outlet.tz;
  const fmt: CellFormat | null = tenant ? { locale: SITE.locale, currency: tenant.base_currency, outletNames: outletNames(outlets) } : null;
  const open: OpenRef = (snapshotId, refToken) => setDrawer({ snapshotId, refToken });
  const ing = (id: string | null) => ingredients.find((i) => i.ingredient_id === id);
  const f = fmt ? figures : null;
  // Proposals first: they wait on a decision. Then findings, the most severe first (a stable sort keeps core's newest-first order within a severity).
  const drafts = inbox?.items.flatMap((i) => (i.kind === "draft" ? [i.draft] : [])) ?? [];
  // Only what this person may approve or reject is theirs to decide (the draft page's own rule, notForYou); a manager
  // sees the rest under the owner's name.
  const toDecide = drafts.filter((d) => notForYou(d, session.me) === null);
  const forOwner = drafts.filter((d) => notForYou(d, session.me) !== null);
  const findings = (inbox?.items.flatMap((i) => (i.kind === "finding" ? [i.finding] : [])) ?? []).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const more = inbox?.next_cursor ? "+" : "";
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "Another outlet";
  const waiting = inbox ? `${inbox.items.length}${inbox.next_cursor ? "+" : ""}` : null;

  return (
    <>
      <OfflineBanner top="staff" show={!online} text="You're offline. Showing the last update." />
      <main className="space-y-6 pb-10">
        <div className="wrap staff-main space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              {rollupAllowed && (
                <div role="radiogroup" aria-label="Show" className="mb-3 flex flex-wrap gap-2">
                  <button type="button" role="radio" aria-checked={scope === "outlet"} className="chip" aria-current={scope === "outlet" ? "true" : undefined} onClick={() => setScope("outlet")}>{outlet.name}</button>
                  <button type="button" role="radio" aria-checked={scope === "all"} className="chip" aria-current={scope === "all" ? "true" : undefined} onClick={() => setScope("all")}>All outlets</button>
                </div>
              )}
              <h1 className="section-title">{scope === "all" && rollupAllowed ? "All outlets today" : `${outlet.name} today`}</h1>
              <p className="mt-3 text-muted">
                {today ? `Business date ${formatDate(today, SITE.locale)} · ` : ""}Figures are taken from the books when this page opens.
              </p>
            </div>
            {scope === "outlet" && <button type="button" className="btn btn-plain" disabled={figures === null || retryAt !== null} onClick={() => void loadFigures()}>Refresh figures</button>}
          </div>
          {retryAt !== null && <p className="text-muted" role="status">Too many requests. Please wait a moment and try again. You can refresh in {waitS} s.</p>}
          {figures?.error && figures.error.kind !== "rate_limited" && !today && <p className="text-muted">{staffErrorText(figures.error, "home")}</p>}
        </div>

        {scope === "all" && rollupAllowed && today && fmt && (
          <div className="wrap"><Rollup client={client} outlets={outlets} today={today} fmt={fmt} onOpen={open} onAuth={handleAuth} /></div>
        )}
        {(scope === "outlet" || !rollupAllowed) && (
        <section aria-label="Today's figures" className="wrap grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card stat">
            <p className="stat-label">Orders today</p>
            {orders === null ? <div className="skeleton h-10 w-32" aria-hidden="true" />
              : orders === "failed" ? <p className="text-muted">Couldn&apos;t load. Tap Refresh figures.</p>
              : <p className="stat-value">{new Intl.NumberFormat(SITE.locale).format(orders.n)}{orders.more ? "+" : ""}</p>}
            <p className="text-[14px] text-muted">Counted from today&apos;s order list. <Link href="/staff/counter">See them at the counter</Link></p>
          </div>

          {!f ? <StatCard label="Kitchen tickets today" value={undefined} refToken={null} onOpen={open} />
            : <StatCard label="Kitchen tickets today" value={f.tickets === "none" ? null : shown(f.tickets, fmt!)} refToken={f.tickets && f.tickets !== "none" ? f.tickets.ref : null} onOpen={open} />}

          {!f ? <StatCard label="Net sales this week" value={undefined} refToken={null} onOpen={open} />
            : f.netSales === "none" ? <WordCard label="Net sales this week" word="None yet" note="No completed orders since Monday." />
            : <StatCard label="Net sales this week" value={shown(f.netSales, fmt!)} refToken={f.netSales?.ref ?? null} note="Completed orders since Monday, after discounts." onOpen={open} />}

          {!f ? <StatCard label="Most waste this week" value={undefined} refToken={null} onOpen={open} />
            : f.waste === "none" ? <WordCard label="Most waste this week" word="None" note="No waste recorded since Monday." />
            : <StatCard label="Most waste this week" value={f.waste ? shown(f.waste.amount, fmt!) : null} refToken={f.waste?.amount?.ref ?? null}
                note={f.waste ? `${ing(f.waste.ingredientId)?.name ?? "One ingredient"}, since Monday. Open the source for every ingredient.` : undefined} onOpen={open} />}

          <div className="card stat lg:col-span-2">
            <p className="stat-label">Food shared this month</p>
            {!f ? <div className="skeleton h-10 w-32" aria-hidden="true" />
              : !f.shared ? <CannotVerify />
              : (
                <ul className="flex flex-wrap gap-x-8 gap-y-2 text-[18px] font-semibold">
                  <li>Portions <Inline f={f.shared.portions} fmt={fmt!} onOpen={open} /></li>
                  <li>Packed items <Inline f={f.shared.units} fmt={fmt!} onOpen={open} /></li>
                  <li>Hand-overs <Inline f={f.shared.handovers} fmt={fmt!} onOpen={open} /></li>
                </ul>
              )}
            <p className="text-[14px] text-muted">To simulated recipients. Measured on synthetic data. <Link href="/staff/cares" className="inline-flex min-h-12 items-center font-semibold">Open Cares</Link></p>
          </div>
        </section>
        )}

        <div className="wrap grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section aria-labelledby="needs-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="needs-title" className="section-title text-[28px]">What needs you</h2>
              <LiveLine state={live} onRefresh={() => void loadInbox()} />
            </div>
            {inbox === null ? <div className="skeleton h-32" role="status" aria-label="Loading" />
              : inbox.items.length === 0 ? <div className="state-box"><p>Nothing waiting for you.</p></div>
              : (
                <>
                  <DraftGroup title="To approve or reject" drafts={toDecide} more={more} tz={tz} outletName={outletName} />
                  {findings.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[19px]">What Munim noticed <span className="text-muted">· {findings.length}{more}</span></h3>
                      <ul className="grid gap-3">
                        {findings.slice(0, 3).map((f) => <FindingBrief key={f.finding_id} finding={f} fmt={fmt} tz={tz} onOpen={open} />)}
                      </ul>
                    </div>
                  )}
                  <DraftGroup title="For the owner to decide" drafts={forOwner} more={more} tz={tz} outletName={outletName} />
                </>
              )}
            {waiting && <Link href="/staff/inbox" className="btn btn-secondary">Open the inbox · {waiting} waiting</Link>}
          </section>

          <section aria-labelledby="low-title" className="card space-y-3 self-start p-5">
            <h2 id="low-title" className="text-[22px]">Low stock</h2>
            {!f ? <div className="skeleton h-24" aria-hidden="true" />
              : f.lowStock === null ? <CannotVerify />
              : f.lowStock.length === 0 ? <p className="text-muted">Nothing is below its minimum.</p>
              : (
                <ul className="space-y-2">
                  {f.lowStock.map((r, i) => (
                    <li key={r.ingredientId ?? i} className="space-y-2">
                      <p className="font-semibold">{r.name ?? ing(r.ingredientId)?.name ?? "An ingredient"}</p>
                      <p className="text-[15px]">
                        On hand <Inline f={r.onHand} fmt={fmt!} onOpen={open} unit={ing(r.ingredientId)?.base_unit} /> · minimum{" "}
                        <Inline f={r.minimum} fmt={fmt!} onOpen={open} unit={ing(r.ingredientId)?.base_unit} />
                      </p>
                      {r.ingredientId && (
                        <RequestQuotes key={outlet.id} ingredientId={r.ingredientId} ingredientName={r.name ?? ing(r.ingredientId)?.name ?? "this ingredient"}
                          outlets={outlets} current={outlet.id} client={client} onAuth={handleAuth} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            <Link href="/staff/suppliers" className="btn btn-plain">Open suppliers</Link>
          </section>
        </div>

        {fmt && <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />}
      </main>
    </>
  );
}
