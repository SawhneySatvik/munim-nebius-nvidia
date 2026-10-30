import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Method, Operation } from "../../../../components/Operation.tsx";
import { loadSpec, sections } from "../../../../lib/openapi.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return sections().map((s) => ({ section: s.slug }));
}

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const s = sections().find((x) => x.slug === section);
  return s ? { title: `${s.title} · API reference`, description: s.blurb } : {};
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const spec = loadSpec();
  const all = sections(spec);
  const s = all.find((x) => x.slug === section);
  if (!s) notFound();
  const i = all.indexOf(s);
  const prev = all[i - 1];
  const next = all[i + 1];
  return (
    <>
      <p className="eyebrow">
        <Link href="/developers/reference">API reference</Link>
      </p>
      <h1>{s.title}</h1>
      <div className="prose">
        <p className="lede">{s.blurb}</p>
      </div>
      <nav aria-label={`${s.title} operations`}>
        <ul className="op-list" style={{ marginBottom: 28 }}>
          {s.ops.map((o) => (
            <li key={o.operationId}>
              <a href={`#${o.operationId}`}>
                <Method method={o.method} />
                <span className="path">{o.path}</span>
                <span className="op-sum">{o.summary}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {s.ops.map((o) => (
        <Operation key={o.operationId} op={o} schemas={spec.components.schemas} />
      ))}
      <nav className="pill-links" aria-label="More sections">
        {prev && <Link href={`/developers/reference/${prev.slug}`}>← {prev.title}</Link>}
        {next && <Link href={`/developers/reference/${next.slug}`}>{next.title} →</Link>}
      </nav>
    </>
  );
}
