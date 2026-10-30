import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "../../components/Icon.tsx";
import { loadSpec, operations, sections } from "../../lib/openapi.ts";

export const metadata: Metadata = {
  title: "Developers",
  description: "The Munim API suite: reference, SDK, guides, the AI contract and a mock API with synthetic data.",
};

const CARDS: Array<{ href: string; icon: IconName; title: string; body: string }> = [
  { href: "/developers/getting-started", icon: "arrow", title: "Getting started", body: "Install the SDK and make your first call against the mock API." },
  { href: "/developers/mock", icon: "shop", title: "Mock API", body: "Keys, routes and the errors you can trigger on purpose." },
  { href: "/developers/guides", icon: "book", title: "Guides", body: "Build the Spice Route and Laneway Cafe storefronts step by step." },
  { href: "/developers/reference", icon: "code", title: "API reference", body: "Every operation, its auth, parameters, bodies and errors. Searchable." },
  { href: "/developers/authentication", icon: "key", title: "Authentication", body: "Storefront keys, customer and guest tokens, member tokens." },
  { href: "/developers/ai-contract", icon: "shield", title: "AI contract", body: "How AI answers arrive: references, “Cannot verify”, and drafts." },
  { href: "/developers/downloads", icon: "download", title: "Downloads", body: "The TypeScript SDK package." },
];

export default function DevelopersHome() {
  const spec = loadSpec();
  const ops = operations(spec);
  const storefront = sections(spec).find((s) => s.slug === "storefront");
  return (
    <>
      <p className="eyebrow">API suite</p>
      <h1>Build on Munim</h1>
      <div className="prose">
        <p className="lede">
          Munim's core is headless: every screen — the counter, the kitchen display, the owner's console and each business's storefront — talks to the
          same HTTP API. This portal documents it for people building storefronts and other frontends.
        </p>
        <p>
          The reference below is generated from the contracts the server itself validates against ({ops.length} operations
          {storefront ? `, ${storefront.ops.length} of them for storefronts` : ""}). All data you see through it is synthetic.
        </p>
        <h2>Base URLs</h2>
      </div>
      <div className="base-urls">
        <div className="base-url">
          <strong>Mock API · available now</strong>
          <code>https://&lt;this-site&gt;/mock</code>
          <span className="muted">
            Served by this website. Contract-shaped responses over synthetic data for two demo storefronts. No sign-up; the two mock storefront keys
            are on the <Link href="/developers/mock">Mock API</Link> page.
          </span>
        </div>
        <div className="base-url">
          <strong>Real API · later</strong>
          <code>to be announced</code>
          <span className="muted">The real base URL and storefront keys come later. Paths and bodies are the same, so switching is a base-URL change.</span>
        </div>
      </div>
      <div className="prose">
        <p>
          Every path in the reference starts with <code>/v1</code> (or <code>/platform/v1</code> for operator routes), so a storefront call on the mock is{" "}
          <code>&lt;base&gt;/v1/storefront/outlets</code>.
        </p>
      </div>
      <div className="cards">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="card-link">
            <Icon name={c.icon} />
            <span>
              <strong>{c.title}</strong>
              <span>{c.body}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="prose">
        <h2>Ground rules for every frontend</h2>
        <ul>
          <li>
            <strong>Prices and totals come from the server.</strong> Send items and options; read the total back. A total your client computes is
            ignored.
          </li>
          <li>
            <strong>Payments are recorded, never processed.</strong> Storefront checkout is pay-at-the-counter; there is no card flow.
          </li>
          <li>
            <strong>Show AI numbers only through their references.</strong> See the <Link href="/developers/ai-contract">AI contract</Link>.
          </li>
          <li>
            <strong>Label what is simulated.</strong> Suppliers and Munim Cares recipients are simulated in the demo; say so wherever they appear.
          </li>
          <li>
            <strong>Writes are idempotent.</strong> Every command carries a <code>command_id</code> and an <code>idempotency_key</code>; retry with the
            same values.
          </li>
        </ul>
      </div>
    </>
  );
}
