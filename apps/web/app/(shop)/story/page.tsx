import type { Metadata } from "next";
import Link from "next/link";
import { CategoryMotif, Hazelnut, HeroArt } from "@/components/art";
import { SiteHeader } from "@/components/ui";
import { BUSINESS } from "@/lib/businesses";

export const metadata: Metadata = { title: "Our story" };

// The business's own story (lib/businesses): its words, its promises and their motifs.
const { story } = BUSINESS;
const PROMISES = story.promises;

export default function StoryPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="wrap grid items-center gap-8 py-12 sm:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="badge badge-accent">{`A sample shop · ${BUSINESS.dataWords.storyBadge}`}</p>
            <h1 className="mt-4 text-[clamp(40px,8vw,72px)]">
              {`${story.title.lead} `}<span className={`${BUSINESS.wordmark.accentClass} text-secondary`.trimStart()}>{story.title.accent}</span>
            </h1>
            {story.paragraphs.map((p, i) => (
              <p key={i} className={`${i === 0 ? "mt-5" : "mt-4"} max-w-[46ch] text-[18px] text-muted`}>{p}</p>
            ))}
            <Link href="/#outlets" className="btn btn-primary mt-8">Order for pickup</Link>
          </div>
          <HeroArt className="mx-auto w-full max-w-[400px]" />
        </section>
        <div className="scallop" aria-hidden="true" />
        <section className="bg-bg-deep py-12" aria-labelledby="promises">
          <div className="wrap">
            <h2 id="promises" className="section-title">What we promise</h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {PROMISES.map((p) => (
                <li key={p.title} className="card p-6">
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-accent"><CategoryMotif slug={p.motif} size={28} /></span>
                  <h3 className="mt-4 text-[24px]">{p.title}</h3>
                  <p className="mt-2 text-muted">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <div className="scallop scallop-up" aria-hidden="true" />
        <section className="wrap py-12">
          <div className="card flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center">
            <Hazelnut size={56} />
            <div className="flex-1">
              <h2 className="text-[28px]">{story.surplus.title}</h2>
              <p className="mt-2 text-muted">{story.surplus.body}</p>
            </div>
            <Link href="/cares" className="btn btn-plain">See Munim Cares</Link>
          </div>
        </section>
      </main>
    </>
  );
}
