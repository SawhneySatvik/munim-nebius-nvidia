import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../../components/Icon.tsx";
import { loadGuides } from "../../../lib/guides.ts";

export const metadata: Metadata = { title: "Guides" };

export default function Guides() {
  const guides = loadGuides();
  return (
    <>
      <p className="eyebrow">Guides</p>
      <h1>Guides</h1>
      <div className="prose">
        <p className="lede">
          Step-by-step guides for building on Munim, including the two demo storefronts: Spice Route, a three-outlet restaurant group in Bengaluru, and
          Laneway Cafe in Fitzroy, Melbourne. Both businesses and all their data are synthetic.
        </p>
      </div>
      {guides.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Guides land here.</strong> None are published yet. Meanwhile, start with <Link href="/developers/getting-started">Getting started</Link>{" "}
            and the <Link href="/developers/reference/storefront">storefront reference</Link>.
          </p>
        </div>
      ) : (
        <div className="cards">
          {guides.map((g) => (
            <Link key={g.slug} href={`/developers/guides/${g.slug}`} className="card-link">
              <Icon name="book" />
              <span>
                <strong>{g.title}</strong>
                <span>{g.summary}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
