import { CopyButton } from "./CopyButton.tsx";

export function CodeBlock({ code, lang, title }: { code: string; lang?: string; title?: string }) {
  return (
    <div className="code-card">
      <div className="code-head">
        <span>{title ?? (lang || "text")}</span>
        <CopyButton text={code} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
