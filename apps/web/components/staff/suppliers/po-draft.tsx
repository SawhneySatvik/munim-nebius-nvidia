// file: components/staff/suppliers/po-draft.tsx
"use client";
// An AI proposal to buy from a simulated supplier (a purchasing.po.create.v1 draft). Its quantity and price are cells
// of the negotiation's quote comparison, each with its source chip. It changes nothing until a person taps "Approve as
// …" or "Approve with my edits as …" (a typed price or quantity, labelled as theirs); the buttons follow 01 §6.1's
// approveGate, so someone who cannot open the quotes is offered Reject only.
import { useState } from "react";
import { approveGate, lineageLine, numericFields, sourceName, sourcePack, withEdits, type Outcome } from "@/lib/munim/drafts";
import { formatDate, formatDayTime } from "@/lib/munim/format";
import type { CellFormat, Snapshot } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { DRAFT_STATUS } from "@/lib/munim/staff-copy";
import { formatCell } from "@/lib/munim/refs";
import { ingredientOf, poDraftLines, poSaving, type PoDraft, type Supplier } from "@/lib/munim/supply-flow";
import type { Schemas } from "@/lib/munim/types";
import { DecisionBar, useDecision } from "../decision";
import { DraftField } from "../draft-field";
import { RunBy } from "../run-by";
import { DRAFT_TONE, SimulatedSupplier, SourcedValue, StatusPill } from "../source";
import { MarketPrice } from "./market";
import { QuoteTable } from "./quotes";

type Detail = Schemas["V1DraftDetail"] & { draft: PoDraft };

export function PoDraftCard({ detail, quotes, suppliers, ingredients, outletName, session, client, fmt, tz, onOpen, onOutcome }: {
  detail: Detail;
  /** purchasing.quote_compare minted for this viewer with the proposal's negotiation_run_id; null while loading;
   *  "none" for a proposal that names no negotiation run. */
  quotes: Snapshot | null | "failed" | "none";
  suppliers: readonly Supplier[];
  ingredients: readonly Schemas["V1InventoryIngredients"]["items"][number][];
  outletName: (id: string) => string;
  session: Session;
  client: StaffClient;
  fmt: CellFormat;
  tz: string;
  onOpen: (snapshotId: string, refToken: string) => void;
  onOutcome: (o: Outcome) => void;
}) {
  const d = detail.draft;
  const lines = poDraftLines(d, detail.unverified_refs);
  const saving = poSaving(d);
  const supplier = suppliers.find((s) => s.supplier_id === d.payload.supplier_id);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const dec = useDecision(client, d, "suppliers", onOutcome);
  const gate = approveGate(detail, numericFields(detail), session.me);
  const put = (path: string) => (v: number | null) =>
    setEdits((e) => { const n = { ...e }; if (v === null) delete n[path]; else n[path] = v; return n; });

  return (
    <article className="card grid grid-cols-1 gap-3 p-5" aria-label="Proposed purchase order">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[22px]">Order from {supplier?.name ?? "a supplier no longer listed"}</h3>
        <SimulatedSupplier />
        <StatusPill tone={DRAFT_TONE[d.status] ?? "new"}>{DRAFT_STATUS[d.status] ?? d.status}</StatusPill>
      </header>
      <p className="text-[15px]"><RunBy agent={sourceName(d.source)} runId={d.run_id} of={{ draft: sourcePack(d.source) }} /></p>
      <div className="draft-field"><p className="font-semibold">For</p><p>{d.payload.outlet_ids.map(outletName).join(", ")}</p></div>
      <div className="draft-field"><p className="font-semibold">Expected</p><p>{d.payload.expected_on ? formatDate(d.payload.expected_on, fmt.locale) : "Not set"}</p></div>
      {lines.map((l) => {
        const ing = ingredientOf(ingredients, l.line.ingredient_id);
        return (
          <div key={l.index} className="rounded-[var(--radius-field)] border-[1.5px] border-bg-deep p-3">
            <p className="font-semibold">{ing.name}</p>
            <DraftField label={`Quantity (${l.line.unit})`} value={l.qty} column="qty_milli" fmt={fmt} onOpen={onOpen}
              lineUnit={l.line.unit} edit={edits[`/lines/${l.index}/qty_milli`] ?? null} editorName={session.me.name} editing={editing} onEdit={put(`/lines/${l.index}/qty_milli`)} />
            <DraftField label={`Price per ${l.line.unit}`} value={l.price} column="unit_price_minor" fmt={fmt} onOpen={onOpen}
              edit={edits[`/lines/${l.index}/unit_price_minor`] ?? null} editorName={session.me.name} editing={editing} onEdit={put(`/lines/${l.index}/unit_price_minor`)} />
            <MarketPrice ingredientId={l.line.ingredient_id} ingredientName={ing.name} session={session} client={client} fmt={fmt} onOpen={onOpen} />
          </div>
        );
      })}
      {saving && (
        // NB-6: the saving and the last price paid it was taken from, each core's cell from the quote comparison with its
        // source chip. Its sign is read, never changed: a negative saving is shown as it is, with a line saying what it means.
        <div className="draft-field">
          <p className="font-semibold">Saving against the last price paid</p>
          <div className="space-y-1">
            <p><SourcedValue text={formatCell(saving.saving.value, "saving_minor", fmt)} refToken={saving.saving.ref} onOpen={onOpen} /></p>
            {saving.reference && (
              <p className="text-[15px]">Last price paid per {d.payload.lines[0]?.unit ?? "unit"}{" "}
                <SourcedValue text={formatCell(saving.reference.value, "reference_unit_price_minor", fmt)} refToken={saving.reference.ref} onOpen={onOpen} /></p>
            )}
            {String(saving.saving.value).startsWith("-") && <p className="text-[14px] text-muted">Below zero: this quote costs more than the last price paid.</p>}
          </div>
        </div>
      )}
      <p className="text-[14px] text-muted">Munim works out the total when it is approved. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business.</p>
      <details open>
        <summary className="min-h-12 cursor-pointer font-semibold">Compare the quotes</summary>
        <div className="mt-3">
          {quotes === null ? <div className="skeleton h-24" role="status" aria-label="Loading" />
            : quotes === "none" ? <p className="text-muted">No quote comparison for this proposal.</p>
            : quotes === "failed" ? <p className="text-muted">The quotes can&apos;t be opened.</p>
            : <QuoteTable snapshot={quotes} suppliers={suppliers} citedRow={lines[0]?.quoteRow ?? null} fmt={fmt} onOpen={onOpen} />}
        </div>
      </details>
      <p className="lineage">{lineageLine(detail, (iso) => formatDayTime(iso, tz, fmt.locale), null)}</p>
      <DecisionBar
        name={session.me.name} gate={gate} commandType={d.command_type} edits={edits} editing={editing}
        onEdit={(on) => { setEditing(on); if (!on) setEdits({}); }}
        busy={dec.busy} error={dec.error} retry={dec.retry} wait={dec.wait}
        onApprove={() => dec.approve(null, null)}
        onApproveEdited={(reason) => dec.approve(withEdits(d.payload, edits, session.me.member_id), reason)}
        onReject={dec.reject}
      />
    </article>
  );
}
