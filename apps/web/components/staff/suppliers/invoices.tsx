// file: components/staff/suppliers/invoices.tsx
"use client";
// Supplier invoices on /staff/suppliers (NB-6). A person uploads a photo or PDF of a simulated supplier's invoice; Munim reads
// the page into a draft (purchasing.invoice.record.v1) and the draft waits here. Each figure on it is a span of the page as
// Munim read it, shown as "Read on the page" — the model's reading, not a number from the books — so the person types every
// figure they checked against the photo before "Approve with my edits" (R26; approveGate's type_first). Nothing is filled
// in from the page and nothing is added up here: core totals the invoice when it is recorded. An invoice is the whole
// business's: owner, manager or judge over every outlet. The page's text is untrusted and is rendered as text only.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MunimError } from "@/lib/munim/client";
import { approveGate, lineageLine, numericFields, sourceName, sourcePack, withEdits, type DraftDetail, type Outcome } from "@/lib/munim/drafts";
import { formatDate, formatDayTime } from "@/lib/munim/format";
import {
  fileProblem, INVOICE_FIGURES, INVOICE_TYPES, invoiceDocument, invoiceErrorText, invoiceOutcome, isInvoiceDraft, spanText, toBase64,
  type DocumentChunk, type InvoiceDraft, type InvoiceOutcome,
} from "@/lib/munim/invoice-flow";
import { formatCell, parseTyped, type CellFormat } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { DRAFT_STATUS } from "@/lib/munim/staff-copy";
import { ingredientOf, type Supplier } from "@/lib/munim/supply-flow";
import type { Schemas } from "@/lib/munim/types";
import { ErrorNote } from "../../ui";
import { DecisionBar, useDecision } from "../decision";
import { unitOf } from "../draft-field";
import { RunBy } from "../run-by";
import { CannotVerify, DRAFT_TONE, PageRead, SimulatedSupplier, StatusPill } from "../source";

type Ingredient = Schemas["V1InventoryIngredients"]["items"][number];
type Detail = DraftDetail & { draft: InvoiceDraft };
/** One proposed invoice draft and the page text its spans point into ("failed": the text could not be read). */
type Item = { detail: Detail; chunks: DocumentChunk[] | "failed" };

/** Who sees this section: an invoice draft is tenant-wide, so only someone over every outlet may upload or decide one. */
export const mayHandleInvoices = (s: Session): boolean => ["owner", "manager", "judge"].includes(s.me.role) && s.me.outlet_ids === "*";

export function InvoiceSection({ session, client, suppliers, ingredients, fmt, tz, wake, onAuth, say }: {
  session: Session;
  client: StaffClient;
  suppliers: readonly Supplier[];
  ingredients: readonly Ingredient[];
  fmt: CellFormat;
  tz: string;
  /** Bumped by the page on a refresh or a live wake-up (inbox:<tenant>): the list is read again. */
  wake: number;
  onAuth: (e: MunimError) => boolean;
  say: (m: string) => void;
}) {
  const [items, setItems] = useState<Item[] | MunimError | null>(null);
  const load = useCallback(async () => {
    const list = await client.listDrafts({ status: "proposed" });
    if (!list.ok) { if (!onAuth(list.error)) setItems((was) => (Array.isArray(was) ? was : list.error)); return; }
    const ids = list.data.items.filter((i) => isInvoiceDraft(i.draft)).map((i) => i.draft.draft_id);
    const details = await Promise.all(ids.map((id) => client.getDraft(id)));
    const kept = details.flatMap((d) => (d.ok && isInvoiceDraft(d.data.draft) && d.data.draft.status === "proposed" ? [d.data as Detail] : []));
    setItems(await Promise.all(kept.map(async (detail): Promise<Item> => {
      const doc = invoiceDocument(detail.draft);
      const text = doc ? await client.getDocumentText(doc) : null;
      return { detail, chunks: text?.ok ? text.data.chunks : "failed" };
    })));
  }, [client, onAuth]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read on mount, after an upload and on every wake-up
  useEffect(() => { void load(); }, [load, wake]);

  const onOutcome = (o: Outcome) => {
    if (o.kind === "signed_out") { onAuth(o.error); return; }
    if (o.kind === "done" && o.type === "purchasing.invoice.record.v1") say("Approved. The invoice is recorded with the figures you typed.");
    if (o.kind === "done" && o.type === "drafts.reject.v1") say("Rejected. Nothing was recorded.");
    if (o.kind === "decided_elsewhere") say("Someone else already decided this. It has been refreshed.");
    if (o.kind === "stale") say("This draft is out of date. Upload the invoice again.");
    void load();
  };

  return (
    <section aria-labelledby="invoices-title" className="space-y-3">
      <h2 id="invoices-title" className="text-[26px]">Supplier invoices</h2>
      <p>Upload a photo or PDF of a supplier&apos;s invoice. Munim reads it into a draft; you check each figure against the photo, type it, and approve. Every supplier here is simulated and every invoice is synthetic.</p>
      <InvoiceUpload client={client} onAuth={onAuth} onRead={() => void load()} />
      {items === null ? <div className="skeleton h-40" role="status" aria-label="Loading" />
        : !Array.isArray(items) ? <ErrorNote>{invoiceErrorText(items)}</ErrorNote>
        : items.length === 0 ? <p className="text-muted">No invoice drafts waiting.</p>
        : items.map((it) => (
          <InvoiceDraftCard key={it.detail.draft.draft_id} item={it} suppliers={suppliers} ingredients={ingredients} session={session} client={client}
            fmt={fmt} tz={tz} onOutcome={onOutcome} />
        ))}
    </section>
  );
}

/** The upload: choose a file (shown beside the result, so the figures can be checked against the real page), send it once,
 *  and say what came of it. The photo never leaves the browser except in the upload itself. */
function InvoiceUpload({ client, onAuth, onRead }: { client: StaffClient; onAuth: (e: MunimError) => boolean; onRead: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<InvoiceOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const problem = file ? fileProblem(file) : null;

  const choose = (f: File | null) => {
    setFile(f);
    setOutcome(null);
    setError(null);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };
  const send = async () => {
    if (!file || problem || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setOutcome(null);
    const content = toBase64(new Uint8Array(await file.arrayBuffer()));
    const r = await client.uploadInvoice({ filename: file.name.slice(0, 255) || "invoice", media_type: file.type as (typeof INVOICE_TYPES)[number], content_base64: content });
    sending.current = false;
    setBusy(false);
    if (r.ok) { setOutcome(invoiceOutcome(r.data)); onRead(); return; }
    if (!onAuth(r.error)) setError(invoiceErrorText(r.error));
  };

  return (
    <div className="card grid gap-3 p-4">
      <label className="block font-semibold">
        Invoice photo or PDF
        <input type="file" accept={INVOICE_TYPES.join(",")} disabled={busy} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
      </label>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the person's own photo, never a remote image */}
      {preview && <img src={preview} alt="The invoice you chose" className="max-h-[480px] w-auto max-w-full justify-self-start rounded-[var(--radius-field)] border-[1.5px] border-bg-deep" />}
      {file && !preview && <p className="text-muted">{file.name}</p>}
      {problem && <ErrorNote>{problem}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={!file || problem !== null || busy} onClick={() => void send()}>
          {busy ? "Reading the invoice…" : "Read this invoice"}
        </button>
        {busy && <span role="status">Munim is reading the page. This can take up to a minute.</span>}
      </div>
      {outcome && <p role="status" className="font-semibold">{outcome.text}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

function InvoiceDraftCard({ item, suppliers, ingredients, session, client, fmt, tz, onOutcome }: {
  item: Item;
  suppliers: readonly Supplier[];
  ingredients: readonly Ingredient[];
  session: Session;
  client: StaffClient;
  fmt: CellFormat;
  tz: string;
  onOutcome: (o: Outcome) => void;
}) {
  const { detail, chunks } = item;
  const d = detail.draft;
  const doc = invoiceDocument(d);
  const supplier = suppliers.find((s) => s.supplier_id === d.payload.supplier_id);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const dec = useDecision(client, d, "suppliers", onOutcome);
  const gate = approveGate(detail, numericFields(detail), session.me);
  const put = (path: string) => (v: number | null) =>
    setEdits((e) => { const n = { ...e }; if (v === null) delete n[path]; else n[path] = v; return n; });

  return (
    <article className="card grid grid-cols-1 gap-3 p-5" aria-label="Invoice read by Munim">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[22px]">Invoice from {supplier?.name ?? "a supplier no longer listed"}</h3>
        <SimulatedSupplier />
        <StatusPill tone={DRAFT_TONE[d.status] ?? "new"}>{DRAFT_STATUS[d.status] ?? d.status}</StatusPill>
      </header>
      <p className="text-[15px]"><RunBy agent={sourceName(d.source)} runId={d.run_id} of={{ draft: sourcePack(d.source) }} /></p>
      {/* Read from the page too, and recorded as shown (nothing to type): marked so the approver checks them against the photo. */}
      <div className="draft-field"><p className="font-semibold">Invoice</p><p><PageRead text={d.payload.invoice_no} /></p></div>
      <div className="draft-field"><p className="font-semibold">Dated</p><p><PageRead text={formatDate(d.payload.invoice_date, fmt.locale)} /></p></div>
      {d.payload.lines.map((line, i) => (
        <div key={line.line_id} className="rounded-[var(--radius-field)] border-[1.5px] border-bg-deep p-3">
          <p className="font-semibold">{line.ingredient_id ? ingredientOf(ingredients, line.ingredient_id).name : (line.description ?? "A line not matched to a stock item")}</p>
          {INVOICE_FIGURES.map((f) => {
            const path = `/lines/${i}/${f.column}`;
            const read = doc && chunks !== "failed" ? spanText((line as Record<string, unknown>)[f.column], doc, chunks) : null;
            const typed = edits[path] ?? null;
            return (
              <div key={f.column} className="draft-field">
                <p className="font-semibold">{f.label(line.unit)}</p>
                <div className="space-y-1">
                  <p>
                    {read !== null ? <PageRead text={read} /> : <CannotVerify />}
                  </p>
                  {typed !== null && (
                    <p><span className="src-value">{formatCell(typed, f.column, fmt)}</span> <span className="draft-edit-label">Typed by {session.me.name}</span></p>
                  )}
                  {editing && (
                    <label className="block text-[14px] font-semibold">
                      Type the figure you checked on the photo ({unitOf(f.column, fmt.currency, line.unit)})
                      <input inputMode="decimal" onChange={(e) => put(path)(parseTyped(e.target.value, f.column, fmt.currency))} />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <p className="text-[14px] text-muted">
        &ldquo;Read on the page&rdquo; is what Munim read from the photo, not a number from your books: type each figure you checked. Munim totals the
        invoice when it is approved. Recorded only — Munim does not process payments. Simulated supplier: a synthetic invoice.
      </p>
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
