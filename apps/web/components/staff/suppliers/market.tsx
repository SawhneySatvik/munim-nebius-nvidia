"use client";
// "Check market price" on a purchase-order line (NB-7b). One tap asks core (POST /v1/imports/market-price); Munim searches the
// web, or, when no search key is set, reads a recorded synthetic page, and the price comes back as an IMPORT DRAFT for an owner
// to approve: nothing is written to the books until they do (R16, R28). The pending card shows where the price is from and
// whether it is "recorded" or "live", never the price: a figure from page text is never shown. After approval the line reads
// the `market.ingredient_price` template and shows its `unit_price_minor` cell with its source chip; if no cell can be read,
// nothing is shown. Owner, manager and judge over every outlet only (the draft is tenant-wide).
import { useCallback, useEffect, useState } from "react";
import { approveGate, numericFields, type Outcome } from "@/lib/munim/drafts";
import { formatCell, snapRef, type CellFormat, type Snapshot } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { staffErrorText } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";
import { DecisionBar, useDecision } from "../decision";
import { SourcedValue } from "../source";
import { mayHandleInvoices } from "./invoices";

type Detail = Schemas["V1DraftDetail"];

/** `tavily-recorded:<host>` / `tavily:<host>` as intel writes it (a short token, 0037's source CHECK); anything else is not a web price. */
const SOURCE = /^(tavily-recorded|tavily):([a-z0-9][a-z0-9.-]{0,60})$/;
export const sourceOf = (token: unknown): { host: string; mode: "recorded" | "live" } | null => {
  const m = typeof token === "string" ? SOURCE.exec(token) : null;
  return m ? { host: m[2]!, mode: m[1] === "tavily-recorded" ? "recorded" : "live" } : null;
};

export interface MarketLine {
  /** The snapshot cell the price is shown from: formatted by formatCell, with this ref beside it. */
  text: string;
  ref: string;
  unit: string;
  host: string;
  mode: "recorded" | "live";
}
/** The newest observation of a `market.ingredient_price` snapshot (rows run oldest first), or null when there is none or its
 *  source or unit is not what the template promises. The price is the `unit_price_minor` cell, formatted: no other path. */
export function marketLine(s: Snapshot, fmt: CellFormat): MarketLine | null {
  const row = s.rows.length - 1;
  const r = s.rows[row];
  const src = sourceOf(r?.source);
  const price = r?.unit_price_minor;
  if (!r || !src || price === undefined || price === null || typeof r.unit !== "string" || !/^[a-z]{1,8}$/.test(r.unit)) return null;
  return { text: formatCell(price, "unit_price_minor", fmt), ref: snapRef(s.snapshot_id, row, "unit_price_minor"), unit: r.unit, ...src };
}

/** The market line: the price is the cell's formatted text with its source chip; the host and mode come from the source token. */
export function MarketLineView({ line, onOpen }: { line: MarketLine; onOpen: (snapshotId: string, refToken: string) => void }) {
  return (
    <p>
      Market price <SourcedValue text={`${line.text} / ${line.unit}`} refToken={line.ref} onOpen={onOpen} /> — {line.host} — <span className="font-semibold">{line.mode}</span>
    </p>
  );
}

const WORDS = {
  no_price: "No price turned up for this ingredient. Nothing was drafted.",
  unavailable: "Munim couldn't check the price just now. Nothing was drafted.",
} as const;

export function MarketPrice({ ingredientId, ingredientName, session, client, fmt, onOpen }: {
  ingredientId: string;
  ingredientName: string;
  session: Session;
  client: StaffClient;
  fmt: CellFormat;
  onOpen: (snapshotId: string, refToken: string) => void;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const allowed = mayHandleInvoices(session);

  const read = useCallback(async () => {
    const r = await client.mintSnapshot({ template_id: "market.ingredient_price", params: { outlet_id: null, ingredient_id: ingredientId, days: 30, as_of: null } });
    if (r.ok) setSnap(r.data);
  }, [client, ingredientId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    if (allowed) void read();
  }, [allowed, read]);

  if (!allowed) return null;
  const line = snap ? marketLine(snap, fmt) : null;

  const check = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const r = await client.checkMarketPrice({ ingredient_id: ingredientId });
    if (!r.ok) { setBusy(false); setNote(staffErrorText(r.error, "suppliers")); return; }
    if (r.data.status !== "previewed" || !r.data.draft_id) { setBusy(false); setNote(WORDS[r.data.status === "no_price" ? "no_price" : "unavailable"]); return; }
    const d = await client.getDraft(r.data.draft_id);
    setBusy(false);
    if (!d.ok) { setNote(staffErrorText(d.error, "suppliers")); return; }
    // An import already approved today is not a pending one: read the cell instead.
    if (d.data.draft.status === "proposed") setPending(d.data);
    else { setNote("This price was already checked today."); void read(); }
  };

  const onOutcome = (o: Outcome) => {
    if (o.kind === "done") {
      setPending(null);
      if (o.type === "drafts.reject.v1") setNote("Rejected. Nothing was recorded.");
      else { setNote("Approved. The web price is recorded."); void read(); }
    } else if (o.kind === "decided_elsewhere") { setPending(null); void read(); }
    else if (o.kind === "signed_out") setNote("Your session ended. Sign in again.");
  };

  return (
    <div className="mt-2 space-y-2">
      {line && <MarketLineView line={line} onOpen={onOpen} />}
      {!pending && <button type="button" className="btn btn-plain" disabled={busy} onClick={() => void check()}>{busy ? "Checking…" : "Check market price"}</button>}
      {note && <p role="status" className="text-[15px] text-muted">{note}</p>}
      {pending && <PendingImport detail={pending} name={ingredientName} session={session} client={client} onOutcome={onOutcome} />}
    </div>
  );
}

/** The import draft the check made: where the price is from, and the approve / reject bar. It shows no price. */
function PendingImport({ detail, name, session, client, onOutcome }: { detail: Detail; name: string; session: Session; client: StaffClient; onOutcome: (o: Outcome) => void }) {
  const d = detail.draft;
  const dec = useDecision(client, d, "suppliers", onOutcome);
  const gate = approveGate(detail, numericFields(detail), session.me);
  return (
    <div className="card space-y-2 p-4" role="group" aria-label="Proposed web price import">
      <p className="font-semibold">A web price for {name} is waiting for your approval</p>
      <p className="text-[15px]">
        Munim searched the web for it (a recorded, synthetic page when no search key is set). The price is not shown until you approve:
        approving records it as a market observation, and it then appears here with its source. Nothing changes before that.
      </p>
      <DecisionBar
        name={session.me.name} gate={gate} commandType={d.command_type} edits={{}} editing={false} onEdit={() => {}}
        busy={dec.busy} error={dec.error} retry={dec.retry} wait={dec.wait}
        onApprove={() => dec.approve(null, null)} onApproveEdited={() => {}} onReject={dec.reject}
      />
    </div>
  );
}
