import type { Metadata } from "next";
import { CodeBlock } from "../../../components/CodeBlock.tsx";
import { SchemaBlock } from "../../../components/SchemaView.tsx";
import { errorCodes, loadSpec } from "../../../lib/openapi.ts";

export const metadata: Metadata = { title: "Errors" };

const EXAMPLE = `{
  "error": {
    "code": "conflict",
    "message": "That pickup window is full.",
    "reason_code": "window_full"
  }
}`;

const STATUSES: Array<[string, string]> = [
  ["400", "The request is malformed (bad JSON, a bad path or query value)."],
  ["401", "No valid credential was sent where one is required."],
  ["403", "The caller is known but not allowed to do this (role or outlet scope)."],
  ["404", "Not found — and also the answer to a bad storefront key or guest token, so keys cannot be probed."],
  ["409", "A conflict with the current state: an order already moved on, a full pickup window, a repeated idempotency key with a different body."],
  ["422", "The body is well-formed but fails validation or a business rule; reason_code says which."],
];

export default function Errors() {
  const spec = loadSpec();
  const { codes, reasons } = errorCodes(spec);
  const decision = spec.components.schemas["DraftsDecisionError"];
  return (
    <>
      <p className="eyebrow">Start</p>
      <h1>Errors</h1>
      <div className="prose">
        <p className="lede">
          Every error has the same shape: a machine-readable <code>code</code>, a short <code>message</code> written by the server (never by an AI
          model), and a <code>reason_code</code> when a business rule made the decision.
        </p>
      </div>
      <CodeBlock code={EXAMPLE} lang="json" title="Example error body" />
      <div className="prose">
        <p>
          Show your own copy keyed by <code>code</code> and <code>reason_code</code>; use <code>message</code> for logs. Retry a failed write with the
          same <code>command_id</code> and <code>idempotency_key</code> — a replay of an accepted command returns the original result.
        </p>
        <h2 id="statuses">HTTP statuses</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map(([s, m]) => (
              <tr key={s}>
                <td>
                  <code>{s}</code>
                </td>
                <td>{m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prose">
        <h2 id="codes">Error codes ({codes.length})</h2>
        <p>The full set of <code>error.code</code> values in the OpenAPI file.</p>
      </div>
      <ul className="code-grid">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <div className="prose">
        <h2 id="reasons">Reason codes ({reasons.length})</h2>
        <p>
          The full set of <code>reason_code</code> values. The same list explains why an AI answer says "Cannot verify" (see the AI contract) — for
          example <code>missing_ref</code> or <code>settlements_missing</code>. Storefronts mostly meet the ordering ones: <code>window_full</code>,{" "}
          <code>item_sold_out</code>, <code>outlet_paused</code>, <code>coupon_invalid</code>, <code>preview_total_changed</code>.
        </p>
      </div>
      <ul className="code-grid">
        {reasons.map((c) => (
          <li key={c} id={`reason-${c}`}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      {decision && (
        <>
          <div className="prose">
            <h2 id="drafts">Draft decision errors</h2>
            <p>Approving or rejecting a draft can fail with an extended body:</p>
          </div>
          <SchemaBlock schema={{ $ref: "#/components/schemas/DraftsDecisionError" }} schemas={spec.components.schemas} />
        </>
      )}
    </>
  );
}
