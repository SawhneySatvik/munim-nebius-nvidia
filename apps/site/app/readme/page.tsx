import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Project README",
  description: "Munim product overview, architecture, AI workflow and deployment profile.",
};

const MODELS = [
  ["Router", "nvidia/Nemotron-3_5-Lightning", "Classifies a request into a constrained workflow."],
  ["Reasoner", "nvidia/nemotron-3-super-120b-a12b", "Answers with read-only evidence tools and selects only rule-approved negotiation moves."],
  ["Extractor and vision", "nvidia/Nemotron-3.5-Super-VL", "Extracts structured fields from simulated supplier text and synthetic invoice images."],
  ["Narrator", "nvidia/Nemotron-3.5-Super-VL", "Explains already-detected findings; templates remain the fallback."],
] as const;

export default function ReadmePage() {
  return (
    <div className="architecture-page">
      <section className="section">
        <div className="wrap architecture-wrap">
          <p className="eyebrow">Project README · Munim</p>
          <h1 className="display">The back office that keeps honest books.</h1>
          <p className="lede">
            Munim is an operating system for small restaurant groups, cloud kitchens and shops. It brings the counter,
            kitchen, stock, purchasing and books together, then adds an AI back office that explains what happened and
            prepares human-reviewed actions.
          </p>
          <p className="architecture-callout"><strong>The One Guarantee</strong><br />Nothing changes the books without a named person&apos;s approval, and every number shown traces to a source row. When evidence is missing, Munim says “Cannot verify.”</p>
          <div className="cta-row">
            <Link className="btn btn-primary" href="/nebius">Nebius and Nemotron</Link>
            <Link className="btn btn-secondary" href="/developers">Developer docs</Link>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap architecture-wrap">
          <h2 className="display h-section">Product in one view</h2>
          <div className="architecture-grid">
            <article><h3>Run the day</h3><p>Customer storefront, POS, kitchen display, owner home, inventory, purchasing, finance, rosters and customer workflows.</p></article>
            <article><h3>See what needs attention</h3><p>Deterministic watchers surface business signals. Ask and investigations help staff explore them through evidence-backed snapshots.</p></article>
            <article><h3>Prepare the next action</h3><p>Intelligence may create a sourced draft. A named person reviews it; only Core can apply the approved command.</p></article>
          </div>
          <p className="architecture-note">The public demo uses synthetic business data. Supplier agents and donation recipients are simulated. Payments are recorded; Munim does not process them.</p>
        </div>
      </section>

      <section className="section">
        <div className="wrap architecture-wrap">
          <h2 className="display h-section">Architecture</h2>
          <p>Munim is split into a deterministic system of record and a separately permissioned intelligence service. The web client talks to Core through a typed API; Core owns identity, authorization, database writes, evidence snapshots, approvals and audit. Intelligence receives a signed run token and calls Core tools for scoped data. It never receives direct book-table write access.</p>
          <div className="architecture-flow" aria-label="Request flow">
            <span>Web app</span><b aria-hidden="true">→</b><span>Core API</span><b aria-hidden="true">→</b><span>PostgreSQL</span>
            <span className="architecture-flow-break">Core-scoped snapshots</span><b aria-hidden="true">→</b><span>Intelligence</span><b aria-hidden="true">→</b><span>Nebius Token Factory</span><b aria-hidden="true">→</b><span>NVIDIA Nemotron</span>
          </div>
          <div className="architecture-grid">
            <article><h3>Web apps</h3><p>The marketing site in <code>apps/site</code> is separate from the customer storefront and staff product app in <code>apps/web</code>; both use Next.js, React and TypeScript.</p></article>
            <article><h3>Core</h3><p>Hono and TypeScript validate commands and scope, maintain PostgreSQL state and expose trusted internal APIs.</p></article>
            <article><h3>Intelligence</h3><p>Python service for routing, specialist skills, answer validation, extraction, narration, traces and spend accounting.</p></article>
            <article><h3>Database</h3><p>PostgreSQL schemas separate core business records, evidence, intelligence workflow state and platform configuration. Supabase can host the database and auth/storage integrations.</p></article>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap architecture-wrap">
          <h2 className="display h-section">Nemotron roles through Token Factory</h2>
          <p>The project uses role-based model configuration: the task selects a role, and the configured provider/model serves it. The owner has confirmed successful live application inference through Nebius Token Factory. This table shows the repository&apos;s configured Token Factory model IDs; it does not claim that each role was independently benchmarked in every deployment.</p>
          <div className="architecture-models">
            {MODELS.map(([role, model, purpose]) => <article key={role}><p className="eyebrow">{role}</p><code>{model}</code><p>{purpose}</p></article>)}
          </div>
          <p>Role separation keeps fast constrained routing separate from deeper reasoning and schema-focused vision/extraction. The application, not the model, decides which tools are exposed and what actions are permitted. Prices, permissions and data scope remain application configuration.</p>
        </div>
      </section>

      <section className="section">
        <div className="wrap architecture-wrap">
          <h2 className="display h-section">How an AI answer is grounded</h2>
          <ol className="architecture-steps">
            <li><strong>Scope.</strong> Core verifies the member and issues a short-lived signed run token for one tenant and outlet scope.</li>
            <li><strong>Route.</strong> The Manager chooses a constrained workflow and loads only the relevant specialist skills/tools.</li>
            <li><strong>Read.</strong> Tools request curated SQL snapshots from Core; models receive bounded digests and evidence handles.</li>
            <li><strong>Validate.</strong> Every number and claim must resolve to evidence inside the active tenant scope. Invalid answers abstain.</li>
            <li><strong>Approve.</strong> Proposed changes wait in an inbox. Core rechecks authority and source snapshots before applying an approved command with its audit record.</li>
          </ol>
          <p className="architecture-callout">A model can explain and propose. It cannot post a journal entry, change stock, set a price, or approve its own draft.</p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap architecture-wrap">
          <h2 className="display h-section">Data, events and graph</h2>
          <p>Core commands run in PostgreSQL transactions with idempotency, audit entries and outbox events. Workers retry unpublished events, while Intelligence claims each event ID once. PostgreSQL notifications wake authorized streams; clients re-read under their own scope.</p>
          <p>The supply graph connects suppliers, ingredients, dishes and outlets so staff can trace exposure to a supplier or price change. A graph port supports the in-tree PostgreSQL implementation; FalkorDB is an optional adapter. The active backend depends on deployment configuration.</p>
          <p>Tenant-bearing tables use row-level security. Business money is stored in integer minor units with currency, and business times use timezone-aware timestamps. Current schema details live in ordered SQL migrations.</p>
        </div>
      </section>

      <section className="section">
        <div className="wrap architecture-wrap">
          <h2 className="display h-section">Deployment and dependencies</h2>
          <p>The marketing/site package has three production JavaScript dependencies: Next.js, React and React DOM. Its development tools are TypeScript, Vitest and React/Node type packages. The product app in <code>apps/web</code> is a separate Vercel workload with its own direct dependencies. The complete product also needs Node API/worker processes, a Python Intelligence service, PostgreSQL, and optionally a supplier simulator and object storage.</p>
          <p>Vercel is suitable for the Next.js site. A Vercel-only site build does not deploy the Python service, persistent worker, database or supplier simulator. The Nebius profile uses a dedicated Supabase project and requires server-side Token Factory credentials and priced Nemotron role configuration.</p>
          <p>See the <Link href="/nebius">Nebius deployment and interactive-demo page</Link> for the hosting profile and model roles.</p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap architecture-wrap">
          <h2 className="display h-section">Architecture deep dives</h2>
          <div className="architecture-grid">
            <Link href="/nebius">Nebius Token Factory and Nemotron</Link>
            <Link href="/developers">API and developer guides</Link>
            <a href="https://github.com/SawhneySatvik/munim-nebius-nvidia">Source repository</a>
          </div>
          <p className="architecture-note">Project documentation: <code>docs/architecture/</code> in the repository, including AI routing, data and events, security/approvals, and deployment.</p>
        </div>
      </section>
    </div>
  );
}
