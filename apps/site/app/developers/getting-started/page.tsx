import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "../../../components/CodeBlock.tsx";
import { downloads } from "../../../lib/downloads.ts";
import { loadGuides } from "../../../lib/guides.ts";

export const metadata: Metadata = { title: "Getting started" };

const INSTALL = `# from the folder of your storefront project
npm install ./munim-sdk-0.3.1.tgz
# or
pnpm add ./munim-sdk-0.3.1.tgz`;

const CLIENT = `import { createMunimClient } from "@munim/sdk";

const munim = createMunimClient({
  baseUrl: "https://<this-site>/mock",           // the real API URL comes later
  storefrontKey: process.env.MUNIM_STOREFRONT_KEY!, // a mock key (see the Mock API page)
});

const { data, error } = await munim.GET("/v1/storefront/outlets");
if (error) throw new Error(error.error.code);    // e.g. "not_found" for a bad key
console.log(data);`;

const CURL = `curl -s https://<this-site>/mock/v1/storefront/outlets \\
  -H "X-Munim-Storefront-Key: $MUNIM_STOREFRONT_KEY"`;

export default function GettingStarted() {
  const sdk = downloads().find((d) => d.file === "munim-sdk-0.3.1.tgz")!;
  const guides = loadGuides();
  return (
    <>
      <p className="eyebrow">Start</p>
      <h1>Getting started</h1>
      <div className="prose">
        <p className="lede">Three steps to your first response: get the SDK, point it at the mock API, call a storefront route.</p>
        <h2 id="sdk">1. Get the SDK</h2>
        <p>
          The SDK is a typed client generated from the same contracts as the <Link href="/developers/reference">API reference</Link>. It ships as a
          package file you install directly — no registry account needed.
        </p>
        <p>
          {sdk.bytes !== null ? (
            <a href={sdk.href} download>
              Download munim-sdk-0.3.1.tgz
            </a>
          ) : (
            <>
              <code>{sdk.href}</code> — not published on this site yet. Until it is, use plain HTTP (step 3).
            </>
          )}
        </p>
      </div>
      <CodeBlock code={INSTALL} lang="shell" title="Install from the file" />
      <div className="prose">
        <p>
          The SDK ships TypeScript source. In a Next.js site add <code>transpilePackages: ["@munim/sdk"]</code> to <code>next.config</code>. API ids
          made by your client (<code>command_id</code>, <code>order_id</code>, …) must be UUIDv7; the{" "}
          {guides.some((g) => g.slug === "getting-started") ? (
            <Link href="/developers/guides/getting-started">getting-started guide</Link>
          ) : (
            "getting-started guide"
          )}{" "}
          has a helper to copy.
        </p>
        <h2 id="client">2. Create a client</h2>
        <p>
          A storefront authenticates with its <strong>storefront key</strong> only. Customer sign-in is optional and adds a customer token; see{" "}
          <Link href="/developers/authentication">Authentication</Link>.
        </p>
      </div>
      <CodeBlock code={CLIENT} lang="typescript" title="storefront.ts" />
      <div className="prose">
        <h2 id="http">3. Or call it over plain HTTP</h2>
        <p>Every SDK method is one HTTP request. JSON in, JSON out.</p>
      </div>
      <CodeBlock code={CURL} lang="shell" title="curl" />
      <div className="prose">
        <h2 id="next">Next</h2>
        {guides.length > 0 ? (
          <ul>
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={`/developers/guides/${g.slug}`}>{g.title}</Link>
                {g.summary ? ` — ${g.summary}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>The step-by-step storefront guides will appear under <Link href="/developers/guides">Guides</Link>.</p>
        )}
      </div>
    </>
  );
}
