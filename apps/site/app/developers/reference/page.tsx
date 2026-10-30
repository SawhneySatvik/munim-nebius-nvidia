import type { Metadata } from "next";
import Link from "next/link";
import { OpSearch } from "../../../components/OpSearch.tsx";
import { loadSpec, searchIndex, sections } from "../../../lib/openapi.ts";

export const metadata: Metadata = { title: "API reference" };

export default function Reference() {
  const spec = loadSpec();
  const secs = sections(spec);
  return (
    <>
      <p className="eyebrow">API reference</p>
      <h1>API reference</h1>
      <div className="prose">
        <p className="lede">
          {spec.info.title}, contract version <code>{spec.info.version}</code>. Generated from the zod contracts the server validates against; storefront
          routes first.
        </p>
        <p>
          The raw document is at <a href="/developers/openapi.json">/developers/openapi.json</a> (OpenAPI {spec.openapi}).
        </p>
      </div>
      <ul className="pill-links" aria-label="Sections">
        {secs.map((s) => (
          <li key={s.slug}>
            <Link href={`/developers/reference/${s.slug}`}>
              {s.title} <span className="count">{s.ops.length}</span>
            </Link>
          </li>
        ))}
      </ul>
      <OpSearch index={searchIndex(spec)} sections={secs.map((s) => ({ slug: s.slug, title: s.title }))} />
    </>
  );
}
