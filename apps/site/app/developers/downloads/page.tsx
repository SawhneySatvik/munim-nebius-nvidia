import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../../components/Icon.tsx";
import { downloads } from "../../../lib/downloads.ts";

export const metadata: Metadata = { title: "Downloads" };

export default function Downloads() {
  const files = downloads();
  return (
    <>
      <p className="eyebrow">Start</p>
      <h1>Downloads</h1>
      <div className="prose">
        <p className="lede">Everything here is generated from the same contracts as the API reference.</p>
      </div>
      <div className="cards">
        {files.map((f) =>
          f.bytes !== null ? (
            <a key={f.file} href={f.href} className="card-link" download>
              <Icon name="download" />
              <span>
                <strong>{f.title}</strong>
                <span>
                  {f.about} <code>{f.file}</code> · {Math.max(1, Math.round(f.bytes / 1024))} KB
                </span>
              </span>
            </a>
          ) : (
            <div key={f.file} className="card-link" aria-disabled="true">
              <Icon name="download" />
              <span>
                <strong>{f.title}</strong>
                <span>
                  {f.about} <code>{f.file}</code> is not published on this site yet.
                </span>
              </span>
            </div>
          ),
        )}
      </div>
      <div className="prose">
        <p>
          Install instructions are in <Link href="/developers/getting-started">Getting started</Link>. The OpenAPI document behind the reference is
          the source of truth for every path and body.
        </p>
      </div>
    </>
  );
}
