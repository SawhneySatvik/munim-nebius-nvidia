import type { Metadata } from "next";
import Link from "next/link";

// Marketing-site build setting: point judges to the isolated Nebius demo after it is deployed.
// The existing Cobnut demo remains the fallback until that new deployment is ready.
const DEMO_ORIGIN = (process.env.NEXT_PUBLIC_MUNIM_DEMO_ORIGIN || "https://munim-cobnut.vercel.app").replace(/\/+$/, "");
const STAFF_DEMO_URL = `${DEMO_ORIGIN}/staff/sign-in`;

export const metadata: Metadata = {
  title: "Nebius Token Factory and Nemotron",
  description:
    "How Munim uses NVIDIA Nemotron models through Nebius Token Factory, and how the AI back office keeps answers grounded in business records.",
};

const MODELS = [
  {
    role: "Router",
    id: "nvidia/Nemotron-3_5-Lightning",
    purpose: "Chooses the next workflow from a constrained set of routes, so the right specialist can handle the request.",
    reason: "A fast model fits a small, structured decision that happens before deeper reasoning.",
  },
  {
    role: "Reasoner",
    id: "nvidia/nemotron-3-super-120b-a12b",
    purpose: "Works through multi-step questions with read-only business tools and chooses among bounded negotiation moves.",
    reason: "The reasoning role handles the most context-heavy tasks; application rules still set the allowed actions and prices.",
  },
  {
    role: "Extractor",
    id: "nvidia/Nemotron-3.5-Super-VL",
    purpose: "Turns simulated supplier replies into typed quote fields that can be checked against their source text.",
    reason: "Schema-shaped extraction keeps untrusted supplier content separate from tools and business writes.",
  },
  {
    role: "Invoice vision",
    id: "nvidia/Nemotron-3.5-Super-VL",
    purpose: "Reads synthetic supplier invoice images and prepares structured fields for a human-reviewed draft.",
    reason: "The vision-language model can process the invoice image while validation and approval remain in Munim.",
  },
  {
    role: "Narrator",
    id: "nvidia/Nemotron-3.5-Super-VL",
    purpose: "Writes short explanations from an already-detected finding and its cited cells.",
    reason: "Narration explains the evidence; deterministic findings and templates remain available if model output fails validation.",
  },
];

const FLOW = [
  ["01", "Authenticate and scope", "Core verifies the person and business, then issues a signed, short-lived run token for the allowed scope."],
  ["02", "Route to a specialist", "The configured Nemotron router selects a supported workflow. The Manager chooses only from tools exposed for that run."],
  ["03", "Read the books", "Read tools return curated PostgreSQL snapshots through core. The AI service has no database client or book-table write permission."],
  ["04", "Validate the answer", "Every figure must resolve to a snapshot cell. Extracted fields must match their source; unsupported claims are withheld."],
  ["05", "Ask a person to decide", "Changes land as drafts. Core applies one only after a named person approves it, in the same transaction as its audit record."],
] as const;

const PLATFORM = [
  ["Web app", "Vercel", "The staff and storefront experience are delivered as a Next.js app."],
  ["Application API", "Vercel", "The TypeScript API validates identity, scope, evidence and approvals before business data changes."],
  ["System of record", "Supabase Postgres", "PostgreSQL stores tenant-scoped operational records with database access controls."],
  ["Inference", "Nebius Token Factory", "The Python intelligence service calls the configured NVIDIA Nemotron model for each model role."],
] as const;

export default function NebiusPage() {
  return (
    <>
      <section className="section" aria-labelledby="nebius-title">
        <div className="wrap">
          <div className="nebius-hero ruled margin-line">
            <p className="eyebrow">Munim × Nebius Token Factory × NVIDIA Nemotron</p>
            <h1 id="nebius-title" className="display">
              An AI back office that can show its work.
            </h1>
            <p className="lede">
              Munim uses Nemotron models for routing, reasoning, supplier extraction, invoice vision and concise narration.
              Token Factory serves those role-configured models; Munim's core application controls the data, validation and
              approvals around every inference call.
            </p>
            <p className="nebius-status">
              <strong>Live integration:</strong> the project owner has confirmed successful application inference through
              Nebius Token Factory with the Nemotron model roles listed below. Historical performance measurements shown in
              the project materials were made against NVIDIA's separate endpoint and are not Token Factory benchmarks.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href={STAFF_DEMO_URL}>
                Open the interactive staff demo
              </a>
              <a className="btn btn-secondary" href={DEMO_ORIGIN}>
                Browse the sample storefront
              </a>
              <Link className="btn btn-secondary" href="/developers">
                Explore the API
              </Link>
            </div>
            <p className="nebius-disclosure">
              Demo businesses and records are synthetic. Supplier agents and food-donation recipients are simulated. Payments
              are recorded, never processed. The public interactive demo is a separate hosted deployment; its active inference
              provider depends on that deployment's environment configuration.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="nebius-platform">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">Deployment architecture</p>
            <h2 id="nebius-platform" className="display h-section">Vercel and Supabase around a dedicated AI service.</h2>
            <p className="lede">
              The Nebius deployment profile provisions a separate Vercel web/API pair and a separate Supabase project. It
              supplies the Token Factory key to the intelligence service and keeps the existing public demo resources isolated.
              Model roles are platform configuration, so a deployment must point them at the Nemotron IDs above before its
              interactive AI path is described as Token Factory-backed.
            </p>
          </div>
          <div className="nebius-model-grid">
            {PLATFORM.map(([component, platform, detail]) => (
              <article className="nebius-model" key={component}>
                <p className="eyebrow">{component}</p>
                <code>{platform}</code>
                <p>{detail}</p>
              </article>
            ))}
          </div>
          <p className="nebius-disclosure">
            The verified Token Factory application test and the hosting profile are separate facts: testing confirms the
            inference integration; each hosted deployment still needs its own credentials, database, role configuration and
            live verification.
          </p>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="nebius-models">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">Role-based model routing</p>
            <h2 id="nebius-models" className="display h-section">One model role per kind of work.</h2>
            <p className="lede">
              Model IDs are stored by provider in Munim's platform configuration. The AI service builds a role from that
              configuration, so a model choice does not change who can read or write business data.
            </p>
          </div>
          <div className="nebius-model-grid">
            {MODELS.map((model) => (
              <article className="nebius-model" key={model.role}>
                <p className="eyebrow">{model.role}</p>
                <code>{model.id}</code>
                <p>{model.purpose}</p>
                <p className="muted">Why this role: {model.reason}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="nebius-guardrails">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">The AI boundary</p>
            <h2 id="nebius-guardrails" className="display h-section">Inference is one part of the workflow.</h2>
            <p className="lede">
              Nebius hosts inference. Munim's database, API and approval path decide what the model can see and what may
              change.
            </p>
          </div>
          <ol className="nebius-flow">
            {FLOW.map(([number, title, body]) => (
              <li key={number}>
                <span className="nebius-flow-number">{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="nebius-try">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">Open demos</p>
            <h2 id="nebius-try" className="display h-section">Explore Munim with a synthetic business.</h2>
            <p className="lede">
              The staff demo provides open access through a demo-persona picker. Choose Nandini Mehrotra, the synthetic
              Cobnut owner, then explore the modules below.
            </p>
          </div>
          <div className="nebius-demo-grid">
            <article className="nebius-demo">
              <h3>Ask Munim and inspect its sources</h3>
              <p>Choose the synthetic owner and ask about the seeded business records. Open a source chip to inspect its rows; if the records cannot support an answer, Munim should say “Cannot verify.”</p>
              <a href={STAFF_DEMO_URL}>Open staff demo →</a>
            </article>
            <article className="nebius-demo">
              <h3>Review findings and drafts</h3>
              <p>Explore the owner inbox, see evidence-backed findings and inspect the approval boundary around a draft.</p>
              <a href={STAFF_DEMO_URL}>Open staff demo →</a>
            </article>
            <article className="nebius-demo">
              <h3>Try purchasing workflows</h3>
              <p>Explore stock and quote requests with simulated suppliers. A purchase-order draft never sends a real order.</p>
              <a href={STAFF_DEMO_URL}>Open staff demo →</a>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
