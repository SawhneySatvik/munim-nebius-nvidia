import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/Icon.tsx";
import { SimBadge, StatusChip } from "../../components/Labels.tsx";

export const metadata: Metadata = {
  title: "Munim Cares",
  description:
    "Munim Cares: surplus food from restaurants and shops goes to food banks and NGOs, or to other businesses, with the owner's approval. Recipients in the demo are simulated; impact is measured on synthetic data.",
};

// Copy follows ADR-015 and the founder's Cares answers (ledger R48): recipients are simulated only, B2B offer money is
// "Recorded, never processed", impact is "to simulated recipients" and "Measured on synthetic data", and the only
// legal wording is the generic "Check your local food-donation rules".
export default function CaresPage() {
  return (
    <>
      <section className="hero cares-hero" aria-labelledby="cares-h">
        <div className="wrap">
          <div className="cares-hero-band">
            <div className="hero-copy">
              <p className="eyebrow">Munim Cares</p>
              <h1 id="cares-h" className="display">
                Surplus food, shared <em>before</em> it is wasted.
              </h1>
              <p className="lede">
                Kitchens and shops end many days with good food and stock close to its date. Munim Cares notices it early, asks the owner, and gets it to
                people who can use it — with every step recorded in the books.
              </p>
              <div className="label-row">
                <StatusChip status="built" />
                <SimBadge>Simulated recipients</SimBadge>
              </div>
              <p className="muted" style={{ marginTop: 12, fontSize: "0.9375rem" }}>
                Database, API, AI and screens built. In the demo every recipient is a simulated food bank or NGO.
              </p>
            </div>
            <div className="listing" role="img" aria-label="Illustration: a donation listing approved by the owner and matched to a simulated recipient for pickup">
              <div className="listing-row">
                <strong>Donation listing · Indiranagar</strong>
                <span className="status" data-status="demo">
                  <span className="status-shape" aria-hidden="true" />
                  Approved by Meena
                </span>
              </div>
              <ul className="listing-items">
                <li>
                  <span>Packaged bread rolls, best before in 3 days</span>
                  <span className="cite">qty · row 1</span>
                </li>
                <li>
                  <span>Spinach, best before in 3 days</span>
                  <span className="cite">kg · row 2</span>
                </li>
              </ul>
              <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
                Drafted by the AI, approved by the owner. Cooked food, such as dal makhani, is a separate line the owner lists by their own hand.
              </p>
              <div className="listing-row">
                <span>Matched: Riverside Community Pantry (simulated)</span>
                <SimBadge>Simulated recipient</SimBadge>
              </div>
              <div className="listing-row muted">
                <span>Pickup window from the recipient's hours · packed by an idle staff member</span>
              </div>
              <p className="ill-caption" style={{ margin: 0 }}>
                Illustration · synthetic data
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="problem-h">
        <div className="wrap split">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">The problem</p>
            <h2 id="problem-h" className="display h-section">
              The bin is the easiest option at closing time.
            </h2>
          </div>
          <div>
            <p className="lede">
              Over-prepared dishes, stock near its date and slow days leave food a business has already paid for. Finding someone to take it, at the
              right time, while closing up, is hard — so it rarely happens.
            </p>
            <p className="lede">
              Munim already knows the stock, the forecast and the roster. Cares turns that into a short list of what can be shared, and leaves the
              decision with the owner.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="how-h">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">How it works</p>
            <h2 id="how-h" className="display h-section">
              Four steps, and a person approves the one that matters.
            </h2>
          </div>
          <ol className="steps steps-rows">
            <li className="step">
              <h3>The AI spots surplus</h3>
              <p>Stock that will expire even after the forecast has used what it can becomes a draft listing. A slot with more staff than orders suggests who could pack it.</p>
            </li>
            <li className="step">
              <h3>The owner approves</h3>
              <p>Nothing is published until the owner approves it. Cooked food is listed only by the owner's own hand.</p>
            </li>
            <li className="step">
              <h3>A recipient is matched</h3>
              <p>By city, the kinds of food they accept, their capacity, pickup window and distance. The owner confirms the match.</p>
            </li>
            <li className="step">
              <h3>The hand-over is recorded</h3>
              <p>An idle staff member packs it, and the stock leaves the books as a donation — never more than was approved.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="b2b-h">
        <div className="wrap split">
          <div>
            <p className="eyebrow">Shared surplus offers</p>
            <h2 id="b2b-h" className="display h-section">
              Or offer it to the business next door.
            </h2>
            <p className="lede">
              A business can offer its surplus to other businesses in the same city at a discount. One buyer claims the whole offer; the offering owner
              accepts or declines; both sides record the hand-over and the receipt.
            </p>
            <ul className="checks">
              <li>
                <Icon name="check" size={20} />
                <span>The offering owner sets the price, with their cost shown beside it.</span>
              </li>
              <li>
                <Icon name="check" size={20} />
                <span>Each business writes only its own records; the other side sees only what the offer shares.</span>
              </li>
              <li>
                <Icon name="check" size={20} />
                <span>
                  The price and total are <strong>Recorded, never processed</strong>: no payment moves, and no invoice is raised.
                </span>
              </li>
            </ul>
          </div>
          <div className="listing" role="img" aria-label="Illustration: a shared surplus offer claimed by another business, with money recorded and never processed">
            <div className="listing-row">
              <strong>Surplus offer · 2 trays of idli batter</strong>
              <span className="draft-tag">Claimed</span>
            </div>
            <div className="listing-row">
              <span>Offer price</span>
              <span className="cite">price · row 1</span>
            </div>
            <div className="listing-row">
              <span>Your cost</span>
              <span className="cite">cost · row 1</span>
            </div>
            <div className="listing-row">
              <span className="plain-label">Recorded, never processed</span>
            </div>
            <p className="ill-caption" style={{ margin: 0 }}>
              Illustration · synthetic data
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="impact-h">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">Impact report</p>
            <h2 id="impact-h" className="display h-section">
              Impact you can open, row by row.
            </h2>
            <p className="lede">
              Each business sees its own impact. Across Munim, a network total is published by an operator from a snapshot of the books, so every figure
              still traces to a ledger row.
            </p>
          </div>
          <div className="impact-grid">
            <div className="impact">
              <h3>Meals</h3>
              <p>Donated cooked portions, counted as portions — never converted from weight.</p>
            </div>
            <div className="impact">
              <h3>Weight and volume</h3>
              <p>Raw and packaged food, shown separately in kilograms and litres.</p>
            </div>
            <div className="impact">
              <h3>Where each number comes from</h3>
              <p>Every value sits beside its snapshot reference; open it to see the hand-over rows behind it.</p>
            </div>
          </div>
          <div className="label-row" aria-label="Labels shown on every impact figure">
            <span className="plain-label">Meals shared across Munim — to simulated recipients</span>
            <span className="plain-label">Measured on synthetic data</span>
          </div>
          <p className="muted" style={{ marginTop: 14 }}>
            The impact report always says the food went "to simulated recipients". While every contributing business is a demo business, it also says
            "Measured on synthetic data". This page shows no impact figures because none have been published yet.
          </p>
        </div>
      </section>

      <section className="section-tight" aria-label="Food-donation rules">
        <div className="wrap">
          <div className="note">
            <Icon name="shield" />
            <p>
              <strong>Check your local food-donation rules.</strong> Munim Cares helps you record and organise donations; it does not decide what may be
              donated where you are.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="cares-dev-h">
        <div className="wrap">
          <div className="cta-band cta-ink">
            <div>
              <h2 id="cares-dev-h" className="display">
                Show Munim Cares on a storefront.
              </h2>
              <p>The public network listings and a business's own Cares section are in the API reference.</p>
            </div>
            <Link href="/developers/reference/cares-network" className="btn">
              Cares API reference
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
