import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "../../../../components/Markdown.tsx";
import { loadGuides } from "../../../../lib/guides.ts";
import { plainText } from "../../../../lib/markdown.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadGuides().map((g) => ({ slug: g.slug.split("/") }));
}

type Props = { params: Promise<{ slug: string[] }> };

function find(slug: string[]) {
  return loadGuides().find((g) => g.slug === slug.join("/"));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = find((await params).slug);
  return g ? { title: g.title, description: g.summary } : {};
}

export default async function GuidePage({ params }: Props) {
  const guide = find((await params).slug);
  if (!guide) notFound();
  const toc = guide.blocks.flatMap((b) => (b.t === "h" && (b.level === 2 || b.level === 3) ? [{ id: b.id, level: b.level, text: plainText(b.c) }] : []));
  return (
    <article>
      <p className="eyebrow">
        <Link href="/developers/guides">Guides</Link>
      </p>
      <h1>{guide.title}</h1>
      {toc.length > 2 && (
        <nav className="toc" aria-label="On this page">
          <ul>
            {toc.map((t) => (
              <li key={t.id} className={`lvl-${t.level}`}>
                <a href={`#${t.id}`}>{t.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Markdown blocks={guide.blocks} />
    </article>
  );
}
