import Link from "next/link";
import type { OpView, Schema } from "../lib/openapi.ts";
import { Icon } from "./Icon.tsx";
import { SchemaBlock, schemaHref, TypeLabel } from "./SchemaView.tsx";

export function Method({ method }: { method: string }) {
  return (
    <span className="method" data-method={method}>
      {method}
    </span>
  );
}

export function Auth({ auth }: { auth: OpView["auth"] }) {
  if (auth.length === 0)
    return (
      <span className="cred public">
        <Icon name="globe" size={14} />
        No credential (public)
      </span>
    );
  return (
    <span className="auth-opts">
      {auth.map((set, i) => (
        <span key={i} className="auth-set">
          {i > 0 && <span className="or">or</span>}
          {set.map((c, j) => (
            <span key={c.scheme} className="auth-set">
              {j > 0 && <span className="or">+</span>}
              <span className="cred" title={c.header}>
                <Icon name="key" size={14} />
                {c.label}
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function Operation({ op, schemas }: { op: OpView; schemas: Record<string, Schema> }) {
  const ok = op.responses.filter((r) => r.status.startsWith("2"));
  const errors = op.responses.filter((r) => !r.status.startsWith("2"));
  return (
    <article className="op" id={op.operationId} aria-labelledby={`${op.operationId}-h`}>
      <header className="op-head">
        <div className="op-line">
          <Method method={op.method} />
          <h2 id={`${op.operationId}-h`} className="path">
            {op.path}
          </h2>
        </div>
        <p>{op.summary}</p>
        <span className="op-id">operationId {op.operationId}</span>
      </header>
      <div className="op-body">
        <h3>Auth</h3>
        <Auth auth={op.auth} />
        {op.params.length > 0 && (
          <>
            <h3>Parameters</h3>
            <div className="schema">
              <ul className="props">
                {op.params.map((p) => (
                  <li key={`${p.in}:${p.name}`} className="prop">
                    <div className="prop-line">
                      <span className="prop-name">{p.name}</span>
                      <span className="op-id">in {p.in}</span>
                      <span className="prop-type">
                        <TypeLabel s={p.schema} />
                      </span>
                      {p.required ? <span className="req">required</span> : <span className="opt">optional</span>}
                    </div>
                    {p.description && <p className="prop-desc">{p.description}</p>}
                    {typeof p.schema["pattern"] === "string" && (
                      <div className="constraints">
                        <span className="constraint">pattern {p.schema["pattern"]}</span>
                      </div>
                    )}
                    {Array.isArray(p.schema["enum"]) && (
                      <div className="enum-vals">
                        {(p.schema["enum"] as unknown[]).map((v) => (
                          <code key={String(v)}>{String(v)}</code>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {op.request && (
          <>
            <h3>Request body {op.request.required ? "" : "(optional)"}</h3>
            <SchemaBlock schema={op.request.schema} schemas={schemas} />
          </>
        )}
        {ok.map((r) => (
          <div key={r.status}>
            <h3>
              Response {r.status} {r.description && r.description !== "OK" ? `· ${r.description}` : ""}
            </h3>
            {r.schema ? (
              <SchemaBlock schema={r.schema} schemas={schemas} />
            ) : r.media === "text/event-stream" ? (
              <p>
                Server-sent events — each <code>data:</code> line is a <Link href={schemaHref("StreamEvent")}>StreamEvent</Link>.
              </p>
            ) : (
              <p className="muted">No body.</p>
            )}
          </div>
        ))}
        {errors.length > 0 && (
          <>
            <h3>Errors</h3>
            <ul className="resp-list">
              {errors.map((r) => (
                <li key={r.status}>
                  <span className="code-status" data-ok="false">
                    {r.status}
                  </span>
                  <span>{r.description}</span>
                  {r.schema && (
                    <span className="prop-type">
                      <TypeLabel s={r.schema} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="prop-desc">
              Every error body carries a <code>code</code>, a <code>message</code> and, where it applies, a <code>reason_code</code>.{" "}
              <Link href="/developers/errors">All error and reason codes</Link>.
            </p>
          </>
        )}
      </div>
    </article>
  );
}
