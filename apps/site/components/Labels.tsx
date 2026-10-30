// Status and simulation labels. Status is never colour alone: each chip has a text label and its own shape.
// The simulation strip is the site-wide disclosure (CLAUDE.md hard rule 5); it cannot be hidden or themed away.

// demo: a visitor can use it today (this site, the mock API, the guides). built: the engine, the API and the screens exist
// and are tested on synthetic data. progress: partly built. roadmap: not started.
export type Status = "demo" | "built" | "progress" | "roadmap";

export const STATUS: Record<Status, string> = {
  demo: "In the demo",
  built: "Built",
  progress: "In progress",
  roadmap: "On the roadmap",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className="status" data-status={status}>
      <span className="status-shape" aria-hidden="true" />
      {STATUS[status]}
    </span>
  );
}

export function SimBadge({ children = "Simulated" }: { children?: string }) {
  return <span className="sim-badge">{children}</span>;
}

export const DISCLOSURE =
  "Demo build. Suppliers and food-donation recipients are simulated, all business data is synthetic, and payments are recorded — never processed.";

export function SimulationStrip() {
  return (
    <aside className="sim-strip" aria-label="Simulation notice">
      <div className="wrap sim-strip-inner">
        <SimBadge>Simulated data</SimBadge>
        <p>{DISCLOSURE}</p>
      </div>
    </aside>
  );
}
