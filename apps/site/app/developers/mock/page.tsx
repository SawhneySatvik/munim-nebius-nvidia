import type { Metadata } from "next";
import { Markdown } from "../../../components/Markdown.tsx";
import { loadMarkdownFile } from "../../../lib/guides.ts";
import { plainText } from "../../../lib/markdown.ts";

export const metadata: Metadata = { title: "Mock API" };

// apps/site/mock/README.md is written by the mock API's own lane; this page only renders it.
export default function MockApi() {
  const blocks = loadMarkdownFile("apps", "site", "mock", "README.md");
  const h1 = blocks?.find((b) => b.t === "h" && b.level === 1);
  return (
    <>
      <p className="eyebrow">Start</p>
      <h1>{h1 && h1.t === "h" ? plainText(h1.c) : "Mock API"}</h1>
      {blocks ? (
        <Markdown blocks={blocks.filter((b) => b !== h1)} />
      ) : (
        <div className="empty">
          <p>The mock API's notes are not published yet.</p>
        </div>
      )}
    </>
  );
}
