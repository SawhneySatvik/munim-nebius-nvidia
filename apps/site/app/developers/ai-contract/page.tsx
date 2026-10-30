import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "../../../components/CodeBlock.tsx";
import { Icon } from "../../../components/Icon.tsx";
import { SchemaBlock } from "../../../components/SchemaView.tsx";
import { loadSpec } from "../../../lib/openapi.ts";

export const metadata: Metadata = { title: "AI contract" };

// Summarised from packages/contracts/src/shared/{envelope,refs}.ts and src/approvals; the schemas below are rendered
// from the OpenAPI file, not retyped.
const EXAMPLE = `{
  "answer_id": "0192…",
  "segments": [
    {
      "text": "Paneer cost rose to ⟨snap:0192…·4·unit_cost⟩ last week.",
      "refs": ["snap:0192…"]
    }
  ],
  "abstained": false,
  "reason_code": null
}
// resolved_refs (beside the envelope in the response):
[{ "ref": "⟨snap:0192…·4·unit_cost⟩", "value": 41000 }]`;

const RENDER = `for each segment:
  split segment.text on ref tokens  ⟨…⟩
  plain text  → render as text (never as HTML)
  ref token   → look it up in resolved_refs by the exact token
                found     → format the value (money in minor units, the
                            business's locale) inside a citation chip that
                            opens the snapshot rows
                not found → show the "Cannot verify" block instead
if envelope.abstained:
  show "Cannot verify" with your copy for envelope.reason_code`;

const SCHEMAS = ["AnswerEnvelope", "FindingEnvelope", "Snapshot", "V1AskResponse"];

export default function AiContract() {
  const spec = loadSpec();
  const schemas = spec.components.schemas;
  return (
    <>
      <p className="eyebrow">Start</p>
      <h1>The AI contract</h1>
      <div className="prose">
        <p className="lede">
          Munim's AI never types a number and never changes the books. Any frontend that shows AI output keeps those two promises by following this
          page.
        </p>

        <h2 id="refs">1. Numbers arrive as references</h2>
        <p>
          AI prose carries no digits of its own. Every number, date or quotation is a reference token that the server already resolved against the
          business's own records:
        </p>
        <ul>
          <li>
            <code>⟨snap:&lt;snapshot-id&gt;·&lt;row&gt;·&lt;column&gt;⟩</code> — one cell of a snapshot: a fixed, hashed query result minted by the core
            server.
          </li>
          <li>
            <code>⟨cite:&lt;kind&gt;:&lt;id&gt;⟩</code>, kind one of <code>row</code>, <code>doc</code>, <code>msg</code>, <code>claim</code>,{" "}
            <code>snapshot</code> — a cited record or a span of a document (<code>·start-end</code>).
          </li>
        </ul>
        <p>
          The delimiters are U+27E8 <code>⟨</code>, U+27E9 <code>⟩</code> and the middle dot U+00B7 <code>·</code>. Each segment's <code>refs</code>{" "}
          array lists the bare ids it uses (<code>snap:&lt;id&gt;</code>, <code>row:core.table:&lt;id&gt;</code>).
        </p>
      </div>
      <CodeBlock code={EXAMPLE} lang="json" title="An answer (ids shortened)" />
      <div className="prose">
        <h2 id="render">2. Render references, not text</h2>
      </div>
      <CodeBlock code={RENDER} lang="text" title="Rendering rule" />
      <div className="prose">
        <p>
          Show the value inside a citation chip that opens the rows behind it (<code>GET /v1/snapshots/{"{id}"}</code>). Model text is always rendered as
          plain text — never through a raw-HTML path.
        </p>

        <h2 id="cannot-verify">3. "Cannot verify" is an answer</h2>
        <div className="note" style={{ marginBottom: "1em" }}>
          <Icon name="shield" />
          <p>
            When the server cannot trace a claim — a missing file, a reference that does not resolve, a number written outside a reference — the
            envelope comes back with <code>abstained: true</code> and a <code>reason_code</code>. Show a calm "Cannot verify" block with your own copy
            for that code. It is not an error state and never shows the model's own words.
          </p>
        </div>
        <p>
          The reason codes are listed on the <Link href="/developers/errors#reasons">Errors</Link> page.
        </p>

        <h2 id="drafts">4. Changes are drafts until a person approves</h2>
        <ul>
          <li>Anything the AI proposes — a price, a purchase order, a roster, a listing — is a draft in the inbox, never applied by itself.</li>
          <li>Each proposed number is a reference shown beside its value. A person may edit a value; the edit is labelled as theirs.</li>
          <li>
            A named person with the authority approves (<code>POST /v1/drafts/{"{id}"}:approve</code>) or rejects with a reason. If the numbers behind
            the draft changed since it was written, it comes back <code>stale</code> and nothing runs.
          </li>
          <li>Your UI must never offer an "auto-apply" state.</li>
        </ul>

        <h2 id="degrade">5. When AI is unavailable</h2>
        <p>Hide the AI surface or show a plain template. AI features degrade to hidden — never to an error screen.</p>

        <h2 id="schemas">Schemas</h2>
        <p>Rendered from the OpenAPI file.</p>
      </div>
      {SCHEMAS.filter((n) => schemas[n]).map((n) => (
        <section key={n} style={{ marginBottom: 20 }} aria-label={n}>
          <SchemaBlock schema={{ $ref: `#/components/schemas/${n}` }} schemas={schemas} />
        </section>
      ))}
    </>
  );
}
