"use client";
// /staff/suppliers/map (R68, the supply graph): who the menu depends on, and what a price change of one
// ingredient reaches, read from the supply graph core rebuilds from the books. The route exists only where core serves the
// graph (MUNIM_GRAPH: app/staff/suppliers/map/page.tsx). Owner, manager and judge. Every supplier name wears its "Simulated
// supplier" badge. Every figure is a cell of a snapshot this screen mints (each supplier's latest price on load; a dish's
// margin at this outlet when the drawer first opens) shown with its source chip, or "Cannot verify"; a count is the length
// of a list in the graph's answer. Names from the graph are text nodes only. The one action asks the simulated suppliers to
// quote: a purchase order comes back only as a draft a person approves. The view pieces are pure (props in), so each state
// renders in tests (tests/supplier-map.test.ts).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnline } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import { retryable } from "@/lib/munim/commands";
import { SAMPLE_DATA } from "@/lib/munim/copy";
import { draftTitle, findingTitle } from "@/lib/munim/drafts";
import { formatDayTime } from "@/lib/munim/format";
import {
  askAbout, daysBefore, graphDown, graphFor, ingredientsWords, marginCell, pausedAt, priceRow, reachWords, suppliersAsked, t,
  type GraphName, type IngredientReach, type MapKey, type SoleSources, type SupplierReach,
} from "@/lib/munim/graph";
import { cellOf, formatCell, outletNames, parseRef, snapRef, type CellFormat, type Snapshot } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { staffErrorText } from "@/lib/munim/staff-copy";
import { rfqAttempt, rfqErrorText, rfqOutcome, type RfqAttempt, type RfqOutcome } from "@/lib/munim/supply-flow";
import { templateWords } from "@/lib/munim/template-words";
import { SITE } from "@/lib/site";
import { CloseIcon, PathIcon } from "../../icons";
import { ErrorNote, OfflineBanner, Toast, useToast } from "../../ui";
import { useStaff } from "../shell";
import { CannotVerify, SimulatedSupplier, SnapshotDrawer, SourcedValue, StatusPill, type PillTone } from "../source";
import { NotForSuppliers } from "./suppliers";

type OpenRef = (snapshotId: string, refToken: string) => void;
/** A minted snapshot: null while it is being minted, "failed" when it could not be (its cells then read "Cannot verify"). */
type Minted = Snapshot | "failed" | null;
export interface MapData { sole: SoleSources; cards: SupplierReach[] }
export interface RfqView { busy: boolean; outcome: RfqOutcome | null; error: string | null }
const isError = (x: unknown): x is MunimError => typeof x === "object" && x !== null && "kind" in x && "status" in x;
const SEVERITY_TONE: Record<string, PillTone> = { low: "done", medium: "warn", high: "late", critical: "late" };

/** A supplier's name, with its badge when it is simulated (every demo supplier is). */
export function SupplierName({ s }: { s: GraphName }) {
  return <span className="inline-flex flex-wrap items-center gap-2">{s.name} {s.simulated && <SimulatedSupplier />}</span>;
}

/** Names in a row ("Also from", "Quoted by"), each with its badge. */
function Names({ label, list }: { label: MapKey; list: readonly GraphName[] }) {
  if (list.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted">{t(label)}</span>
      {list.map((s) => <SupplierName key={s.supplier_id} s={s} />)}
    </p>
  );
}

/** A cell of a minted snapshot with its chip; a skeleton while minting; "Cannot verify" when it does not trace. */
function Cell({ snap, row, column, fmt, onOpen }: { snap: Minted; row: number; column: string; fmt: CellFormat | null; onOpen: OpenRef }) {
  if (snap === null || !fmt) return <span className="skeleton inline-block h-6 w-24 align-middle" role="status" aria-label="Loading" />;
  const v = snap === "failed" ? undefined : snap.rows[row]?.[column];
  if (snap === "failed" || v === undefined || v === null) return <CannotVerify />;
  return <SourcedValue text={formatCell(v, column, fmt)} refToken={snapRef(snap.snapshot_id, row, column)} onOpen={onOpen} />;
}

function Header() {
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-primary"><PathIcon size={32} /></span>
        <h1 className="section-title">{t("map.title")}</h1>
        <span className="badge badge-sim">{t("map.badge")}</span>
        <span className="badge badge-sim">{SAMPLE_DATA}</span>
      </div>
      <p className="max-w-[70ch]">{t("map.lede")}</p>
    </header>
  );
}

/** "Only one source": one pill per menu ingredient with one supplier on record, or none. */
export function SoleStrip({ sole, onIngredient }: { sole: SoleSources; onIngredient: (id: string) => void }) {
  return (
    <section aria-labelledby="sole-title" className="space-y-3">
      <h2 id="sole-title" className="flex flex-wrap items-baseline gap-3 text-[26px]">
        {t("map.sole.title")} <span className="text-[16px] font-semibold text-muted">{ingredientsWords(sole.ingredients)}</span>
      </h2>
      {sole.ingredients.length === 0 ? <p className="text-muted">{t("map.sole.none")}</p> : (
        <ul className="grid gap-2 sm:flex sm:flex-wrap">
          {sole.ingredients.map((i) => (
            <li key={i.ingredient_id}>
              <button type="button" className="card card-link flex min-h-12 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-field)] px-4 py-2 text-left sm:w-auto" onClick={() => onIngredient(i.ingredient_id)}>
                <span className="font-semibold">{i.name}</span>
                {i.sources[0] ? <><span>{t("map.sole.from")}</span> <SupplierName s={i.sources[0]} /></> : <span>{t("map.sole.nobody")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One supplier and what depends on it: a row per ingredient it supplies. */
export function SupplierCard({ reach, prices, fmt, focused, onIngredient, onOpen }: {
  reach: SupplierReach;
  prices: Minted;
  fmt: CellFormat | null;
  focused: boolean;
  onIngredient: (id: string) => void;
  onOpen: OpenRef;
}) {
  const s = reach.supplier;
  return (
    <article id={`supplier-${s.supplier_id}`} className={`card scroll-mt-36 space-y-3 p-5 ${focused ? "outline outline-2 outline-primary" : ""}`} aria-current={focused ? "true" : undefined} aria-labelledby={`supplier-${s.supplier_id}-name`}>
      <h3 id={`supplier-${s.supplier_id}-name`} className="text-[22px]"><SupplierName s={s} /></h3>
      <ul className="grid gap-3">
        {reach.ingredients.map((i) => {
          const row = prices && prices !== "failed" ? priceRow(prices, s.supplier_id, i.ingredient_id) : 0;
          return (
            <li key={i.ingredient_id} className="grid gap-2 border-t-[1.5px] border-bg-deep pt-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-[19px] font-semibold">
                  {i.name} {i.only_source && <StatusPill tone="warn">{t("map.only")}</StatusPill>}
                </p>
                <Names label="map.also" list={i.other_sources} />
                <Names label="map.quoted" list={i.quoted_by} />
                <p>
                  <span className="text-muted">{t("map.price")}</span>{" "}
                  {row < 0 ? <span>{t("map.price.none")}</span> : <Cell snap={prices} row={row} column="latest_minor" fmt={fmt} onOpen={onOpen} />}
                </p>
                <p>{reachWords(i.dishes, i.outlets)}</p>
              </div>
              <button type="button" className="btn btn-plain" onClick={() => onIngredient(i.ingredient_id)}>{t("map.open")}</button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export interface MapViewProps {
  /** null while loading; an error when a read failed (503 graph_unavailable is its own state). */
  data: MapData | MunimError | null;
  prices: Minted;
  fmt: CellFormat | null;
  focus: string | null;
  onRetry: () => void;
  onIngredient: (id: string) => void;
  onOpen: OpenRef;
}

export function MapView({ data, prices, fmt, focus, onRetry, onIngredient, onOpen }: MapViewProps) {
  return (
    <div className="space-y-6">
      <Header />
      {data === null ? (
        <div className="space-y-4" role="status" aria-label="Loading">
          <div className="skeleton h-24" />
          <div className="grid gap-4 lg:grid-cols-2"><div className="skeleton h-64" /><div className="skeleton h-64" /></div>
        </div>
      ) : isError(data) ? (
        <div className="card space-y-3 p-5">
          {graphDown(data) ? <p className="font-semibold" role="alert">{t("map.down")}</p> : <ErrorNote>{staffErrorText(data, "suppliers")}</ErrorNote>}
          <button type="button" className="btn btn-plain" onClick={onRetry}>{t("map.retry")}</button>
        </div>
      ) : data.cards.length === 0 ? (
        <div className="card state-box">
          <p className="text-[19px] font-semibold text-ink">{t("map.empty")}</p>
          <Link href="/staff/suppliers" className="btn btn-primary">{t("map.empty.link")}</Link>
        </div>
      ) : (
        <>
          <SoleStrip sole={data.sole} onIngredient={onIngredient} />
          <section aria-labelledby="cards-title" className="space-y-3">
            <h2 id="cards-title" className="text-[26px]">{t("map.cards.title")}</h2>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {data.cards.map((r) => (
                <SupplierCard key={r.supplier.supplier_id} reach={r} prices={prices} fmt={fmt} focused={focus === r.supplier.supplier_id} onIngredient={onIngredient} onOpen={onOpen} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export interface DetailProps {
  /** null while loading; an error when the read failed. */
  detail: IngredientReach | MunimError | null;
  margins: Minted;
  /** Opened finding-impact snapshots, by snapshot id. */
  impacts: Readonly<Record<string, Snapshot | "failed">>;
  fmt: CellFormat | null;
  outlet: { id: string; name: string; tz: string };
  rfq: RfqView;
  onRfq: (ingredientId: string) => void;
  onRetry: () => void;
  onOpen: OpenRef;
}

/** A dish's margin at this outlet (design §5.3): its cell when the row costs the recipe the graph reached, else "Cannot
 *  verify"; no row at all means it sold nothing here. */
function Margin({ snap, itemId, recipeId, fmt, onOpen }: { snap: Minted; itemId: string; recipeId: string | null; fmt: CellFormat | null; onOpen: OpenRef }) {
  if (snap === null || snap === "failed") return <Cell snap={snap} row={0} column="margin_bp" fmt={fmt} onOpen={onOpen} />;
  const m = marginCell(snap, itemId, recipeId);
  if (m.kind === "no_sales") return <span>{t("drawer.no_sales")}</span>;
  if (m.kind === "cannot_verify") return <CannotVerify />;
  return <Cell snap={snap} row={m.row} column="margin_bp" fmt={fmt} onOpen={onOpen} />;
}

/** The ingredient drawer's body: "What a price change touches". */
export function IngredientDetail({ detail, margins, impacts, fmt, outlet, rfq, onRfq, onRetry, onOpen }: DetailProps) {
  if (detail === null) return <div className="skeleton h-96" role="status" aria-label="Loading" />;
  if (isError(detail)) {
    return (
      <div className="space-y-3">
        {graphDown(detail) ? <p className="font-semibold" role="alert">{t("map.down")}</p> : <ErrorNote>{staffErrorText(detail, "suppliers")}</ErrorNote>}
        <button type="button" className="btn btn-plain" onClick={onRetry}>{t("map.retry")}</button>
      </div>
    );
  }
  const supplies = detail.sources.filter((s) => s.relation === "supplies");
  const quoted = detail.sources.filter((s) => s.relation === "quoted");
  const impact = (ref: string) => {
    const p = parseRef(ref);
    if (!p || p.kind !== "snap") return <CannotVerify />;
    const snap = impacts[p.snapshotId];
    if (snap === undefined || !fmt) return <span className="skeleton inline-block h-6 w-24 align-middle" role="status" aria-label="Loading" />;
    const v = snap === "failed" ? undefined : cellOf(snap, p);
    return v === undefined || v === null ? <CannotVerify /> : <SourcedValue text={formatCell(v, p.column, fmt)} refToken={ref} onOpen={onOpen} />;
  };
  return (
    <div className="space-y-6">
      <section aria-labelledby="d-sources" className="space-y-2">
        <h3 id="d-sources" className="text-[20px]">{t("drawer.sources")}</h3>
        {supplies.length === 0 ? <p>{t("drawer.sources.none")}</p> : <ul className="grid gap-1">{supplies.map((s) => <li key={s.supplier_id}><SupplierName s={s} /></li>)}</ul>}
        <Names label="map.quoted" list={quoted} />
      </section>

      <section aria-labelledby="d-dishes" className="space-y-2">
        <h3 id="d-dishes" className="text-[20px]">{t("drawer.dishes")} <span className="text-[16px] text-muted">{reachWords(detail.dishes, detail.outlets)}</span></h3>
        {detail.dishes.length === 0 ? <p className="text-muted">{t("drawer.dishes.none")}</p> : (
          <ul className="grid gap-3">
            {detail.dishes.map((d) => {
              const here = d.outlets.some((o) => o.outlet_id === outlet.id);
              return (
                <li key={d.item_id} className="card space-y-2 p-3">
                  <p className="font-semibold">{d.name}</p>
                  <p className="flex flex-wrap gap-2">
                    {d.outlets.map((o) => <span key={o.outlet_id} className={`badge ${o.available ? "" : "badge-warn"}`}>{o.available ? o.name : pausedAt(o.name)}</span>)}
                  </p>
                  {here && <p><span className="text-muted">{t("drawer.margin")}</span> <Margin snap={margins} itemId={d.item_id} recipeId={d.recipe_id} fmt={fmt} onOpen={onOpen} /></p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="d-findings" className="space-y-2">
        <h3 id="d-findings" className="text-[20px]">{t("drawer.findings")}</h3>
        {detail.findings.length === 0 ? <p className="text-muted">{t("drawer.findings.none")}</p> : (
          <ul className="grid gap-2">
            {detail.findings.map((f) => (
              <li key={f.finding_id} className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {findingTitle(f.type)} <StatusPill tone={SEVERITY_TONE[f.severity] ?? "warn"}>{t(`severity.${f.severity}`)}</StatusPill>
                </p>
                {f.impact_ref && <p><span className="text-muted">{t("drawer.impact")}</span> {impact(f.impact_ref)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="d-drafts" className="space-y-2">
        <h3 id="d-drafts" className="text-[20px]">{t("drawer.drafts")}</h3>
        {detail.drafts.length === 0 ? <p className="text-muted">{t("drawer.drafts.none")}</p> : (
          <ul className="grid gap-2">
            {detail.drafts.map((d) => (
              <li key={d.draft_id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{draftTitle(d.command_type)}</span>
                <Link href={`/staff/inbox/${d.draft_id}`} className="btn btn-plain">{t("drawer.draft.open")}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 border-t-[1.5px] border-bg-deep pt-4">
        {supplies.length === 1 && (
          <div className="space-y-2">
            <button type="button" className="btn btn-primary w-full" disabled={rfq.busy} onClick={() => onRfq(detail.ingredient.id)}>
              {rfq.busy ? t("drawer.rfq.busy") : t("drawer.rfq")}
            </button>
            <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted"><SimulatedSupplier /> {t("drawer.rfq.note")}</p>
            {rfq.busy && <p className="text-muted" role="status">{t("drawer.rfq.wait")}</p>}
            {rfq.outcome && (
              <p className="font-semibold" role="status">
                {rfq.outcome.text}{" "}
                {rfq.outcome.draftId ? <Link href={`/staff/inbox/${rfq.outcome.draftId}`}>{t("drawer.rfq.draft")}</Link>
                  : rfq.outcome.inbox ? <Link href="/staff/inbox">{t("drawer.rfq.inbox")}</Link> : null}
              </p>
            )}
            {rfq.error && <ErrorNote>{rfq.error}</ErrorNote>}
          </div>
        )}
        <Link href={`/staff/ask?q=${encodeURIComponent(askAbout(detail.ingredient.name))}`} className="btn btn-plain w-full">{t("drawer.ask")}</Link>
        <p className="text-[14px] text-muted">{t("map.stamp")} · {formatDayTime(detail.graph.projected_at, outlet.tz, SITE.locale)}</p>
      </section>
    </div>
  );
}

// =============================================================== /staff/suppliers/map
export function SupplierMapScreen() {
  const { session, outlet } = useStaff();
  if (!can(session, "suppliers")) return <NotForSuppliers />;
  if (!outlet) return <main className="wrap staff-main"><div className="state-box" role="status">Loading</div></main>;
  return <SupplierMap key={outlet.id} />;
}

const IDLE: RfqView = { busy: false, outcome: null, error: null };

function SupplierMap() {
  const { session, client, outlet: chosen, outlets, handleAuth } = useStaff();
  const outlet = chosen!;
  const graph = useMemo(() => graphFor(session), [session]);
  const focus = useSearchParams().get("supplier");
  const online = useOnline();
  const [toast, say] = useToast();
  const [data, setData] = useState<MapData | MunimError | null>(null);
  const [fmt, setFmt] = useState<CellFormat | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [prices, setPrices] = useState<Minted>(null);
  const [netDown, setNetDown] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<IngredientReach | MunimError | null>(null);
  const [margins, setMargins] = useState<Minted>(null);
  const [impacts, setImpacts] = useState<Record<string, Snapshot | "failed">>({});
  const [rfq, setRfq] = useState<RfqView>(IDLE);
  const [snapOpen, setSnapOpen] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const attempt = useRef<RfqAttempt | null>(null);
  const showing = useRef<string | null>(null);
  // Each figure is minted once per outlet (a mint writes a snapshot row): prices on the first good load, margins on the
  // first drawer.
  const pricesMinted = useRef(false);
  const marginsMinted = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const seen = useCallback((e: MunimError): MunimError | null => {
    if (handleAuth(e)) return null;
    if (e.kind === "network") setNetDown(true);
    return e;
  }, [handleAuth]);

  const load = useCallback(async () => {
    setData(null);
    const [sole, list, tenant, menu] = await Promise.all([graph.listSoleSources(), client.listSuppliers(), client.getTenant(), client.getMenu(outlet.id, "counter")]);
    const bad = [sole, list, tenant].find((r) => !r.ok);
    if (bad && !bad.ok) { const e = seen(bad.error); if (e) setData(e); return; }
    if (!sole.ok || !list.ok || !tenant.ok) return;
    // One read per supplier on record; one the graph does not hold (404) has nothing that depends on it.
    const reaches = await Promise.all(list.data.items.filter((s) => s.active).map((s) => graph.getSupplierReach(s.supplier_id)));
    const failed = reaches.find((r) => !r.ok && r.error.kind !== "not_found");
    if (failed && !failed.ok) { const e = seen(failed.error); if (e) setData(e); return; }
    setNetDown(false);
    const cards = reaches.flatMap((r) => (r.ok && r.data.ingredients.length > 0 ? [r.data] : []));
    const day = menu.ok ? menu.data.business_date : null;
    setFmt({ locale: SITE.locale, currency: tenant.data.base_currency, outletNames: outletNames(outlets) });
    setToday(day);
    setData({ sole: sole.data, cards });
    if (cards.length === 0 || pricesMinted.current) return;
    pricesMinted.current = true;
    if (!day) { setPrices("failed"); return; }
    const p = await client.mintSnapshot({ template_id: "purchasing.price_creep", params: { as_of: day } });
    if (p.ok) setPrices(p.data);
    else { seen(p.error); setPrices("failed"); }
  }, [graph, client, outlet.id, outlets, seen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the responses
    void load();
  }, [load]);

  // From a supplier's page (?supplier=<id>): bring its card into view once the cards are there.
  useEffect(() => {
    if (focus && data && !isError(data)) document.getElementById(`supplier-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, data]);

  const openIngredient = useCallback(async (id: string) => {
    showing.current = id;
    attempt.current = null;
    setOpen(id);
    setDetail(null);
    setRfq(IDLE);
    const r = await graph.getIngredientReach(id);
    if (showing.current !== id) return;
    if (!r.ok) { const e = seen(r.error); if (e) setDetail(e); return; }
    setDetail(r.data);
    // Finding impacts: open each cited snapshot (a read; nothing is minted).
    const ids = [...new Set(r.data.findings.flatMap((f) => { const p = f.impact_ref ? parseRef(f.impact_ref) : null; return p?.kind === "snap" ? [p.snapshotId] : []; }))];
    void Promise.all(ids.map(async (sid) => {
      const s = await client.getSnapshot(sid);
      setImpacts((was) => ({ ...was, [sid]: s.ok ? s.data : "failed" }));
    }));
    if (marginsMinted.current) return;
    marginsMinted.current = true;
    if (!today) { setMargins("failed"); return; }
    const m = await client.mintSnapshot({ template_id: "catalogue.dish_margin", params: { outlet_id: outlet.id, channel_kind: null, from: daysBefore(today, 27), to: today } });
    if (m.ok) setMargins(m.data);
    else { seen(m.error); setMargins("failed"); }
  }, [graph, client, outlet.id, today, seen]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const askQuotes = async (ingredientId: string) => {
    if (rfq.busy) return;
    const a = rfqAttempt(attempt.current, ingredientId, [outlet.id]);
    attempt.current = a;
    setRfq({ busy: true, outcome: null, error: null });
    const r = await client.requestQuotes(a.body);
    if (showing.current !== ingredientId) return; // the drawer moved on to another ingredient meanwhile
    if (r.result.ok) {
      attempt.current = null;
      setRfq({ busy: false, outcome: rfqOutcome(r.negotiation, r.draftId), error: null });
      // Only when a simulated supplier was asked: "no shortfall" and the like asked nobody, and their own words say so.
      if (suppliersAsked(r.negotiation)) say(t("drawer.rfq.sent"));
      return;
    }
    const e = r.result.error;
    if (handleAuth(e)) return;
    // 503: core recorded the request but never reached the negotiation, so the same envelope would only replay it.
    if (!retryable(e) || e.status === 503) attempt.current = null;
    setRfq({ busy: false, outcome: null, error: rfqErrorText(e) });
  };

  const name = detail && !isError(detail) ? detail.ingredient.name : null;
  return (
    <>
      <OfflineBanner top="staff" show={!online || netDown} text={t("map.offline")} />
      <main className="wrap staff-main pb-12">
        <MapView data={data} prices={prices} fmt={fmt} focus={focus} onRetry={() => void load()} onIngredient={(id) => void openIngredient(id)} onOpen={(snapshotId, refToken) => setSnapOpen({ snapshotId, refToken })} />
      </main>
      <dialog ref={dialog} className="drawer" aria-labelledby="ing-title" onClose={() => { showing.current = null; setOpen(null); }}>
        <div className="flex items-start justify-between gap-3 border-b-[1.5px] border-line p-4">
          <div>
            <h2 id="ing-title" className="text-[24px]">{t("drawer.title")}</h2>
            {name && <p className="font-semibold">{name}</p>}
          </div>
          <button type="button" className="btn btn-plain btn-round" onClick={() => setOpen(null)} aria-label={t("drawer.close")}><CloseIcon size={20} /></button>
        </div>
        <div className="p-4">
          {open && (
            <IngredientDetail detail={detail} margins={margins} impacts={impacts} fmt={fmt} outlet={outlet} rfq={rfq} onRfq={(id) => void askQuotes(id)}
              onRetry={() => void openIngredient(open)} onOpen={(snapshotId, refToken) => setSnapOpen({ snapshotId, refToken })} />
          )}
        </div>
        {/* Inside the drawer: a modal dialog sits above the page, so a toast outside it would be hidden behind it. */}
        <Toast message={toast} />
      </dialog>
      {fmt && <SnapshotDrawer client={client} open={snapOpen} onClose={() => setSnapOpen(null)} fmt={fmt} tz={outlet.tz} label={templateWords} />}
    </>
  );
}
