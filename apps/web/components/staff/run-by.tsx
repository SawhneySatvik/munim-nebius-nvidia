// file: components/staff/run-by.tsx
"use client";
// Who made an AI answer, draft or finding, and the model that ran it (P3): "Stock & Purchasing" then a tag per model,
// "Nemotron 3 Super · NVIDIA". The agent comes from the item itself (a draft's source, a finding's pack, an answer's
// signature); the model from the calls its run's trace says were made for that item (lib/munim/models.ts CallsFor), the
// trace read once for every item of that run on screen. No run, no such call, or a trace this person can't open: the
// agent alone, never an error (rule 11).
import { useEffect, useState } from "react";
import { modelsOf, modelTags, type CallsFor, type TraceEvent } from "@/lib/munim/models";
import type { StaffClient } from "@/lib/munim/staff";
import { useStaff } from "./shell";

/** How long a read trace is reused. A finding is stored before its narration's model call is traced, so a list loaded
 *  while a sweep runs must not keep the early read for good. */
const KEEP_MS = 30_000;
const reads = new WeakMap<StaffClient, Map<string, Promise<readonly TraceEvent[]>>>();

function eventsOf(client: StaffClient, runId: string): Promise<readonly TraceEvent[]> {
  let runs = reads.get(client);
  if (!runs) reads.set(client, (runs = new Map()));
  const known = runs.get(runId);
  if (known) return known;
  const read = client.getTraces(runId).then((r) => (r.ok ? r.data.events : []));
  runs.set(runId, read);
  void read.then(() => setTimeout(() => runs.delete(runId), KEEP_MS));
  return read;
}

/** One tag per model the run used for `of` (none while reading, or when no call was made for it). */
export function useRunModels(client: StaffClient, runId: string | null, of: CallsFor): string[] {
  const [seen, setSeen] = useState<{ runId: string; events: readonly TraceEvent[] } | null>(null);
  useEffect(() => {
    if (!runId) return;
    let live = true;
    void eventsOf(client, runId).then((events) => { if (live) setSeen({ runId, events }); });
    return () => { live = false; };
  }, [client, runId]);
  return runId && seen?.runId === runId ? modelTags(modelsOf(seen.events, of)) : [];
}

/** A desk with its screen: the agent's mark, as the specialists sit at desks in the office (drawn for this project). */
const AgentMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="shrink-0">
    <rect x="4.5" y="2" width="7" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 7v2M1.5 9.5h13M3.5 9.5V14M12.5 9.5V14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
/** A chip with its pins: the model's mark (drawn for this project). */
const ModelMark = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="shrink-0">
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6 1.5v2M10 1.5v2M6 12.5v2M10 12.5v2M1.5 6h2M1.5 10h2M12.5 6h2M12.5 10h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/** The run whose trace to read for an item. core opens a run's trace only to someone whose outlets cover the run's (a
 *  sweep runs over every outlet), so a member without every outlet gets none; an ask run's scope is the asker's own, so
 *  answers are always readable by their asker. */
export function traceRunFor(outletIds: "*" | readonly string[], runId: string | null, of: CallsFor): string | null {
  return outletIds === "*" || of === "answer" ? runId : null;
}

/** The agent's name, then a tag per model the run used for this item. `runId` null: the item names no run. */
export function RunBy({ agent, runId, of }: { agent: string; runId: string | null; of: CallsFor }) {
  const { client, session } = useStaff();
  const models = useRunModels(client, traceRunFor(session.me.outlet_ids, runId, of), of);
  return (
    <span className="run-by">
      <span className="run-by-agent"><AgentMark />{agent}</span>
      {models.map((m) => <span key={m} className="model-tag"><ModelMark /><span><span className="sr-only">Model: </span>{m}</span></span>)}
    </span>
  );
}
