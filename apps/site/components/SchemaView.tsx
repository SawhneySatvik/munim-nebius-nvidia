// Renders a JSON Schema from the OpenAPI file as a field tree. Named schemas ($ref) are links to their own page and
// are expanded only at the top of a request or response, so a large type (a draft is ~57 KB of schema) is not
// repeated inside every operation. Inline objects nest; deeper levels fold into <details>.
import Link from "next/link";
import type { ReactNode } from "react";
import { refName, type Schema } from "../lib/openapi.ts";

type Schemas = Record<string, Schema>;

export const schemaHref = (name: string) => `/developers/schemas/${encodeURIComponent(name)}`;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const variantsOf = (s: Schema): Schema[] | null => ((s["anyOf"] ?? s["oneOf"]) as Schema[] | undefined) ?? null;
const isNull = (s: Schema) => s["type"] === "null";
const props = (s: Schema) => s["properties"] as Record<string, Schema> | undefined;

export function TypeLabel({ s }: { s: Schema | boolean }): ReactNode {
  // JSON Schema allows `true` (anything) and `false` (nothing) in place of a schema, e.g. a tuple's `items: false`.
  if (typeof s !== "object" || s === null) return s === false ? "never" : "any";
  const ref = str(s["$ref"]);
  if (ref) return <Link href={schemaHref(refName(ref))}>{refName(ref)}</Link>;
  const vs = variantsOf(s);
  if (vs) {
    const real = vs.filter((v) => !isNull(v));
    const nullable = real.length !== vs.length;
    if (real.length === 1)
      return (
        <>
          <TypeLabel s={real[0]!} />
          {nullable ? " | null" : ""}
        </>
      );
    return (
      <>
        {`one of ${real.length}`}
        {nullable ? " | null" : ""}
      </>
    );
  }
  if (Array.isArray(s["allOf"])) return `all of ${(s["allOf"] as unknown[]).length}`;
  if ("const" in s) return `const ${JSON.stringify(s["const"])}`;
  if (Array.isArray(s["enum"])) return `enum (${(s["enum"] as unknown[]).length})`;
  const type = s["type"];
  if (Array.isArray(type)) return type.join(" | ");
  if (type === "array" && Array.isArray(s["prefixItems"])) {
    const parts = s["prefixItems"] as Schema[];
    return (
      <>
        {"tuple ["}
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 ? ", " : ""}
            <TypeLabel s={p} />
          </span>
        ))}
        {"]"}
      </>
    );
  }
  if (type === "array")
    return (
      <>
        {"array of "}
        <TypeLabel s={(s["items"] as Schema | undefined) ?? {}} />
      </>
    );
  if (type === "object") {
    const ap = s["additionalProperties"];
    if (!props(s) && ap && typeof ap === "object")
      return (
        <>
          {"map of "}
          <TypeLabel s={ap as Schema} />
        </>
      );
    return "object";
  }
  if (typeof type === "string") return str(s["format"]) ? `${type} (${s["format"]})` : type;
  return "any";
}

const CONSTRAINTS: Array<[string, string]> = [
  ["minLength", "min length"],
  ["maxLength", "max length"],
  ["minimum", "≥"],
  ["exclusiveMinimum", ">"],
  ["maximum", "≤"],
  ["exclusiveMaximum", "<"],
  ["minItems", "min items"],
  ["maxItems", "max items"],
  ["pattern", "pattern"],
  ["default", "default"],
];

function Constraints({ s }: { s: Schema | boolean }) {
  if (typeof s !== "object" || s === null) return null;
  // A nullable wrapper's constraints live on its non-null member.
  const vs = variantsOf(s);
  const base = vs && vs.filter((v) => !isNull(v)).length === 1 ? vs.find((v) => !isNull(v))! : s;
  if (typeof base !== "object" || base === null) return null;
  const items = CONSTRAINTS.filter(([k]) => k in base).map(([k, label]) => `${label} ${typeof base[k] === "string" ? base[k] : JSON.stringify(base[k])}`);
  const en = Array.isArray(base["enum"]) ? (base["enum"] as unknown[]) : null;
  if (!items.length && !en) return null;
  return (
    <>
      {items.length > 0 && (
        <div className="constraints">
          {items.map((c) => (
            <span key={c} className="constraint">
              {c}
            </span>
          ))}
        </div>
      )}
      {en && (
        <div className="enum-vals" aria-label="Allowed values">
          {en.map((v) => (
            <code key={String(v)}>{String(v)}</code>
          ))}
        </div>
      )}
    </>
  );
}

/** Nested structure worth drawing under a field: inline objects, arrays of them, and variants that contain them. */
function hasBody(s: Schema | boolean): s is Schema {
  if (typeof s !== "object" || s === null || s["$ref"]) return false;
  if (props(s)) return true;
  const vs = variantsOf(s);
  if (vs) return vs.some((v) => !isNull(v) && hasBody(v));
  if (s["type"] === "array" && s["items"]) return hasBody(s["items"] as Schema);
  return false;
}

function variantName(v: Schema, i: number): string {
  for (const [k, p] of Object.entries(props(v) ?? {})) if (typeof p === "object" && p !== null && "const" in p) return `${k} = ${JSON.stringify(p["const"])}`;
  return `Variant ${i + 1}`;
}

function Body({ s, depth }: { s: Schema; depth: number }): ReactNode {
  const p = props(s);
  if (p) {
    const required = new Set((s["required"] as string[] | undefined) ?? []);
    return (
      <ul className="props">
        {Object.entries(p).map(([name, ps]) => (
          <li key={name} className="prop">
            <div className="prop-line">
              <span className="prop-name">{name}</span>
              <span className="prop-type">
                <TypeLabel s={ps} />
              </span>
              {required.has(name) ? <span className="req">required</span> : <span className="opt">optional</span>}
            </div>
            {str(ps["description"]) && <p className="prop-desc">{str(ps["description"])}</p>}
            <Constraints s={ps} />
            {hasBody(ps) &&
              (depth >= 2 ? (
                <details>
                  <summary>Show fields of {name}</summary>
                  <Body s={ps} depth={depth + 1} />
                </details>
              ) : (
                <Body s={ps} depth={depth + 1} />
              ))}
          </li>
        ))}
      </ul>
    );
  }
  const vs = variantsOf(s);
  if (vs) {
    const real = vs.filter((v) => !isNull(v) && hasBody(v));
    if (real.length === 1) return <Body s={real[0]!} depth={depth} />;
    return (
      <>
        {real.map((v, i) => (
          <div key={i}>
            <p className="variant-label">{variantName(v, i)}</p>
            <Body s={v} depth={depth + 1} />
          </div>
        ))}
      </>
    );
  }
  if (s["type"] === "array" && s["items"]) return <Body s={s["items"] as Schema} depth={depth} />;
  return null;
}

/** A request or response body: a named schema is linked and expanded one level; an inline one is drawn as is. */
export function SchemaBlock({ schema, schemas }: { schema: Schema; schemas: Schemas }) {
  const ref = str(schema["$ref"]);
  const target = ref ? schemas[refName(ref)] : schema;
  return (
    <div className="schema">
      <div className="schema-name">
        <span className="prop-type">
          <TypeLabel s={schema} />
        </span>
        {target && str(target["x-munim-contract"]) && <span className="op-id">contract {str(target["x-munim-contract"])}</span>}
      </div>
      {target && str(target["description"]) && <p className="prop-desc">{str(target["description"])}</p>}
      {target && <Constraints s={target} />}
      {target && <Body s={target} depth={0} />}
    </div>
  );
}
