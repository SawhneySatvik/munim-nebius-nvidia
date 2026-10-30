import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Method } from "../../../../components/Operation.tsx";
import { SchemaBlock } from "../../../../components/SchemaView.tsx";
import { loadSpec, schemaNames, usedBy } from "../../../../lib/openapi.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return schemaNames().map((name) => ({ name }));
}

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${decodeURIComponent((await params).name)} · Schema` };
}

export default async function SchemaPage({ params }: Props) {
  const name = decodeURIComponent((await params).name);
  const spec = loadSpec();
  if (!spec.components.schemas[name]) notFound();
  const ops = usedBy(name, spec);
  return (
    <>
      <p className="eyebrow">
        <Link href="/developers/reference">API reference</Link> · Schema
      </p>
      <h1 style={{ overflowWrap: "anywhere" }}>{name}</h1>
      <SchemaBlock schema={{ $ref: `#/components/schemas/${name}` }} schemas={spec.components.schemas} />
      {ops.length > 0 && (
        <>
          <h2>Used by</h2>
          <ul className="op-list">
            {ops.map((o) => (
              <li key={o.operationId}>
                <Link href={`/developers/reference/${o.section}#${o.operationId}`}>
                  <Method method={o.method} />
                  <span className="path">{o.path}</span>
                  <span className="op-sum">{o.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
