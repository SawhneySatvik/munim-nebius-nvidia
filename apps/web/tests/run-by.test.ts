// [unit] NB-2: which run's trace a RunBy reads. An answer's run is an ask run, scoped to its asker, so core opens its trace to
// them whatever their outlets; a finding's or draft's run may span every outlet, so only an all-outlet member reads it.
import { describe, expect, it } from "vitest";
import { traceRunFor } from "@/components/staff/run-by";

const RUN = "019f0000-0000-7000-8000-0000000000c1";
const ONE = ["019f0000-0000-7000-8000-0000000000d1"];

describe("traceRunFor", () => {
  it("an answer's run is read by a single-outlet member", () => expect(traceRunFor(ONE, RUN, "answer")).toBe(RUN));
  it("a finding's or draft's run is not read by a single-outlet member", () => {
    expect(traceRunFor(ONE, RUN, { finding: "f" })).toBeNull();
    expect(traceRunFor(ONE, RUN, { draft: null })).toBeNull();
  });
  it("an all-outlet member reads every run; no run reads none", () => {
    expect(traceRunFor("*", RUN, { finding: "f" })).toBe(RUN);
    expect(traceRunFor("*", null, "answer")).toBeNull();
  });
});

// Render level: no DOM library is installed (no jsdom, no testing-library, and none may be added), so RunBy is server-rendered with
// useEffect run inline, which is all useRunModels needs to start its trace read. Only the staff context is stubbed.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

const staff = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), useEffect: (f: () => void) => { f(); } }));
vi.mock("@/components/staff/shell", () => ({ useStaff: () => staff.value }));

describe("RunBy", () => {
  it("reads an answer's trace by its run id for a single-outlet member", async () => {
    const { RunBy } = await import("@/components/staff/run-by");
    const getTraces = vi.fn(() => Promise.resolve({ ok: true, data: { events: [] } }));
    staff.value = { client: { getTraces }, session: { me: { outlet_ids: ONE } } };
    const html = renderToString(createElement(RunBy, { agent: "Stock & Purchasing", runId: RUN, of: "answer" }));
    expect(getTraces).toHaveBeenCalledWith(RUN);
    expect(html).toContain("Stock &amp; Purchasing");
  });
});
