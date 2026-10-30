// Renders the tree from lib/markdown.ts as React elements. Every string becomes a text node, so React escapes it;
// there is no raw-HTML path here (gotcha 15). A link whose target failed the allow-list renders as plain text.
import Link from "next/link";
import type { ReactNode } from "react";
import type { Block, Inline } from "../lib/markdown.ts";
import { CodeBlock } from "./CodeBlock.tsx";

function inlines(c: Inline[]): ReactNode[] {
  return c.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "code":
        return <code key={i}>{n.v}</code>;
      case "strong":
        return <strong key={i}>{inlines(n.c)}</strong>;
      case "em":
        return <em key={i}>{inlines(n.c)}</em>;
      case "br":
        return <br key={i} />;
      case "link":
        if (n.href === null)
          return (
            <span key={i} className="dead-link">
              {inlines(n.c)}
            </span>
          );
        if (n.href.startsWith("/")) return <Link key={i} href={n.href}>{inlines(n.c)}</Link>;
        if (/^https?:/i.test(n.href))
          return (
            <a key={i} href={n.href} rel="noopener noreferrer">
              {inlines(n.c)}
            </a>
          );
        return (
          <a key={i} href={n.href}>
            {inlines(n.c)}
          </a>
        );
    }
  });
}

function block(b: Block, key: number): ReactNode {
  switch (b.t) {
    case "h": {
      const H = `h${Math.min(Math.max(b.level, 2), 6)}` as "h2";
      return (
        <H key={key} id={b.id}>
          {inlines(b.c)}
        </H>
      );
    }
    case "p":
      return <p key={key}>{inlines(b.c)}</p>;
    case "code":
      return <CodeBlock key={key} code={b.v} lang={b.lang} />;
    case "hr":
      return <hr key={key} />;
    case "quote":
      return <blockquote key={key}>{b.c.map(block)}</blockquote>;
    case "list": {
      const items = b.items.map((item, i) => (
        <li key={i}>
          {/* an item with one paragraph renders it without <p> (a tight list), nested lists after it */}
          {item.filter((x) => x.t === "p").length === 1
            ? item.map((x, j) => (x.t === "p" ? <span key={j}>{inlines(x.c)}</span> : block(x, j)))
            : item.map(block)}
        </li>
      ));
      return b.ordered ? (
        <ol key={key} start={b.start === 1 ? undefined : b.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case "table":
      return (
        <div key={key} className="table-wrap">
          <table>
            <thead>
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} style={b.align[i] ? { textAlign: b.align[i]! } : undefined}>
                    {inlines(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, i) => (
                    <td key={i} style={b.align[i] ? { textAlign: b.align[i]! } : undefined}>
                      {inlines(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function Markdown({ blocks }: { blocks: Block[] }) {
  return <div className="prose">{blocks.map(block)}</div>;
}
