"use client";

// Client-side filter over the operation index (method, path, summary, operationId — never the schemas).
import Link from "next/link";
import { useState } from "react";
import type { SearchEntry } from "../lib/openapi.ts";

export function OpSearch({ index, sections }: { index: SearchEntry[]; sections: Array<{ slug: string; title: string }> }) {
  const [q, setQ] = useState("");
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = index.filter((e) => {
    const hay = `${e.method} ${e.path} ${e.summary} ${e.id} ${e.sectionTitle}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  return (
    <>
      <div className="search" role="search">
        <label htmlFor="op-search">Search operations</label>
        <input
          id="op-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try “storefront orders”, “menu” or “approve”"
          autoComplete="off"
        />
        <span className="search-count" aria-live="polite">
          {q ? `${hits.length} of ${index.length} operations match` : `${index.length} operations`}
        </span>
      </div>
      {sections.map((s) => {
        const ops = hits.filter((h) => h.section === s.slug);
        if (!ops.length) return null;
        return (
          <section key={s.slug} className="ref-section" aria-labelledby={`sec-${s.slug}`}>
            <h2 id={`sec-${s.slug}`}>
              <Link href={`/developers/reference/${s.slug}`}>{s.title}</Link>
              <span className="count">{ops.length}</span>
            </h2>
            <ul className="op-list">
              {ops.map((o) => (
                <li key={o.id}>
                  <Link href={`/developers/reference/${s.slug}#${o.id}`}>
                    <span className="method" data-method={o.method}>
                      {o.method}
                    </span>
                    <span className="path">{o.path}</span>
                    <span className="op-sum">{o.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
