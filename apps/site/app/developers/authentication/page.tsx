import type { Metadata } from "next";
import Link from "next/link";
import { loadSpec, operations } from "../../../lib/openapi.ts";

export const metadata: Metadata = { title: "Authentication" };

export default function Authentication() {
  const spec = loadSpec();
  const ops = operations(spec);
  // Only schemes that a public operation actually uses; how many operations accept each.
  const uses = new Map<string, number>();
  for (const op of ops) for (const s of new Set(op.auth.flat().map((c) => c.scheme))) uses.set(s, (uses.get(s) ?? 0) + 1);
  const open = ops.filter((o) => o.auth.length === 0).length;
  const schemes = Object.entries(spec.components.securitySchemes).filter(([k]) => uses.has(k));
  return (
    <>
      <p className="eyebrow">Start</p>
      <h1>Authentication</h1>
      <div className="prose">
        <p className="lede">Each operation in the reference lists the credentials it accepts. There are four kinds of caller.</p>

        <h2 id="storefront">Storefronts: a storefront key</h2>
        <p>
          A storefront sends <code>X-Munim-Storefront-Key</code> on every call. The key names one business and one sales channel, so it is all a public
          ordering website needs to read outlets and menus and to place orders. It is designed to sit in a browser; it grants nothing beyond that
          storefront.
        </p>
        <ul>
          <li>
            <strong>Customer token (optional).</strong> A signed-in customer adds <code>Authorization: Bearer &lt;token&gt;</code> to see their own
            account, orders and loyalty.
          </li>
          <li>
            <strong>Guest token.</strong> When a guest places an order, the response returns a guest access token for that one order, once. Keep it
            (for example in the browser's storage) and send it as <code>X-Munim-Guest-Token</code>, with the storefront key, to read the order's status.
          </li>
        </ul>

        <h2 id="members">Staff and owners: a member token and a tenant</h2>
        <p>
          People who work in a business sign in and send <code>Authorization: Bearer &lt;token&gt;</code> plus <code>X-Munim-Tenant</code> naming the
          business they are acting in. Their role and outlet scope decide what they may see and do; a manager sees only their own outlet. A few identity
          routes (such as "which businesses can I act in") take the token alone.
        </p>

        <h2 id="operators">Munim operators</h2>
        <p>Operator routes under <code>/platform/v1</code> take an operator's token. Storefront builders never need them.</p>

        <h2 id="public">No credential</h2>
        <p>
          {open} read-only operations take no credential at all: the Munim Cares network pages.
        </p>

        <h2 id="bad-keys">A bad key is a 404, not a 403</h2>
        <p>
          A wrong, revoked or mistyped storefront key or guest token gets <code>404 not_found</code> — the same answer as a resource that does not exist
          — so a key cannot be probed. Treat a 404 on every call as "check your key". Never log a key or a token.
        </p>

        <h2 id="schemes">Credentials in the OpenAPI file</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Scheme</th>
              <th>Sent as</th>
              <th>What it is</th>
              <th>Operations</th>
            </tr>
          </thead>
          <tbody>
            {schemes.map(([name, s]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>
                  <code>{s.type === "http" ? `Authorization: Bearer` : s.name}</code>
                </td>
                <td>{s.description}</td>
                <td>{uses.get(name)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Counts are read from the OpenAPI file at build time. See them per operation in the <Link href="/developers/reference">API reference</Link>.
      </p>
    </>
  );
}
