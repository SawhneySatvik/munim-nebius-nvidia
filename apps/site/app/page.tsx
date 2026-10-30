import Link from "next/link";
import { CodeBlock } from "../components/CodeBlock.tsx";
import { Icon, type IconName } from "../components/Icon.tsx";
import { SimBadge, STATUS, type Status, StatusChip } from "../components/Labels.tsx";

// Status per feature, checked against the code on 16 Oct 2026 (T-128): the core engine, API, intelligence layer and the
// staff screens are built and tested on synthetic data, Munim Cares and the storefront page builder included. Australia
// runs on its own pack in code and tests; the live demo business is the Indian one.
const FEATURES: Array<{ icon: IconName; title: string; body: string; status: Status; note: string }> = [
  {
    icon: "pos",
    title: "Counter, kitchen and online ordering",
    body: "Point of sale, a kitchen display with short ticket numbers and timers, and QR or web ordering with pickup windows. Prices and totals are worked out on the server, and order status only moves through allowed steps.",
    status: "built",
    note: "Engine, API and screens built: the till, the kitchen display and the Cobnut storefront.",
  },
  {
    icon: "team",
    title: "Eight AI specialists and a Manager",
    body: "Catalogue, kitchen, purchasing, finance, people, customers, compliance and market specialists explain what happened, find money leaking out, and draft fixes. The Manager routes your question to the right desk.",
    status: "built",
    note: "Built and evaluated on synthetic businesses. Ask Munim, each specialist's desk and a replay of their work are in the staff screens.",
  },
  {
    icon: "search",
    title: "Investigations",
    body: "Ask a hard question and Munim plans an investigation across specialists, step by step or on a plan you approve. Every finding carries the rows it came from.",
    status: "built",
    note: "Step, Plan and Auto modes built, with screens: the plan to approve, each cause's verdict and the rows behind it.",
  },
  {
    icon: "cares",
    title: "Munim Cares",
    body: "Surplus food goes to food banks and NGOs instead of the bin, and businesses can offer surplus to each other. The AI spots it; you approve every listing.",
    status: "built",
    note: "Database, API, AI and screens built. Recipients are simulated.",
  },
  {
    icon: "shop",
    title: "A storefront for every business",
    body: "Each business gets its own ordering website over the public storefront API: menus, pickup windows, checkout with pay-at-the-counter, and order status.",
    status: "demo",
    note: "Storefront API, mock API and build guides are live on this site.",
  },
  {
    icon: "layout",
    title: "Theming and a drag-and-drop page builder",
    body: "Brand colours, layout presets and a visual editor so an owner can shape their storefront without a developer.",
    status: "built",
    note: "Built: colour presets with a contrast check, layouts, and the home page's sections in a drag-and-drop editor with numbered versions. Publishing is switched off on the shared demo business.",
  },
  {
    icon: "outlets",
    title: "Many outlets, many brands",
    body: "Run two to five outlets, or several brands from one cloud kitchen, with each outlet's books kept apart and rolled up for the owner. Managers see only their own outlet.",
    status: "built",
    note: "Built: each outlet's books kept apart, an all-outlets view for the owner, managers limited to their own outlet, and a brand switch for businesses with more than one brand.",
  },
  {
    icon: "crate",
    title: "Purchasing with simulated suppliers",
    body: "When stock runs short, Munim asks suppliers for quotes, reviews every deal against your rules and drafts the purchase order for you to approve.",
    status: "built",
    note: "Suppliers in the demo are simulated agents, labelled everywhere.",
  },
  {
    icon: "globe",
    title: "India first, Australia on its own pack",
    body: "Currency, tax lines, receipts, time zones and compliance calendars come from a country pack, not from the code. A business in Australia runs on the AU pack — same code, different country pack. Country is fixed when the business is onboarded.",
    status: "built",
    note: "India and Australia packs built and tested. The live demo business is in India.",
  },
];

const DESKS: Array<{ icon: IconName; name: string; id: string; does: string }> = [
  { icon: "menu", name: "Catalogue and pricing", id: "@catalogue", does: "True dish margin from recipe, supplier price and waste; price-change drafts." },
  { icon: "pot", name: "Kitchen", id: "@kitchen", does: "Ticket-time drift, remakes and prep-time proposals with evidence." },
  { icon: "crate", name: "Purchasing and inventory", id: "@inventory_purchasing", does: "Shortfalls, price creep, waste spikes and purchase-order drafts." },
  { icon: "coins", name: "Finance", id: "@finance", does: "Payouts reconciled to orders, unexplained fees, month-end close." },
  { icon: "team", name: "People", id: "@people", does: "Labour against demand, overtime drift and roster drafts." },
  { icon: "heart", name: "Customers", id: "@customers", does: "Coupon leakage, lapsing regulars and campaign drafts — never auto-sent." },
  { icon: "clipboard", name: "Compliance", id: "@compliance", does: "Licence expiry, missed temperature logs and checklists." },
  { icon: "chart", name: "Market and strategy", id: "@market", does: "Goals, forecast notes and the surplus picture for Munim Cares." },
];

const SNIPPET = `curl https://<this-site>/mock/v1/storefront/outlets \\
  -H "X-Munim-Storefront-Key: <a mock key from the developer portal>"`;

export default function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap">
          <div className="hero-card ruled margin-line">
            <div className="hero-copy">
              <p className="eyebrow">For restaurant groups, cloud kitchens and shops</p>
              <h1 id="hero-h" className="display">
                The AI back office that keeps <em>honest books</em>.
              </h1>
              <p className="lede">
                Munim runs your counter, kitchen and ledgers, then explains what happened, finds money leaking out and drafts the fix. Nothing changes until
                you approve it.
              </p>
              <div className="cta-row">
                <Link href="/contact" className="btn btn-primary">
                  Contact us
                  <Icon name="arrow" size={18} />
                </Link>
                <Link href="/developers" className="btn btn-secondary">
                  Explore the API
                </Link>
                <Link href="/nebius" className="btn btn-secondary">
                  How the Nebius AI layer works
                </Link>
              </div>
              <ul className="hero-meta">
                <li>
                  <Icon name="check" size={18} />
                  India first
                </li>
                <li>
                  <Icon name="check" size={18} />
                  Australia on its own country pack
                </li>
                <li>
                  <Icon name="check" size={18} />2 to 5 outlets, many brands
                </li>
              </ul>
            </div>
            <HeroIllustration />
          </div>
        </div>
      </section>

      <section id="guarantee" className="section section-alt guarantee" aria-labelledby="g-h">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">The One Guarantee</p>
            <h2 id="g-h" className="display g-quote">
              Nothing changes your books without your approval<span className="mark">.</span> Every number traces to your records
              <span className="mark">.</span>
            </h2>
          </div>
          <div className="g-grid">
            <div className="g-card">
              <h3>
                <span className="g-num" aria-hidden="true">
                  1
                </span>
                You approve every change
              </h3>
              <ul>
                <li>Prices, stock, rosters, payroll, purchase orders and messages to customers all start as drafts.</li>
                <li>A named person approves or rejects each one. Nothing applies itself.</li>
                <li>An approved change runs in one step with its audit entry, under the approver's name.</li>
                <li>The books are append-only: a mistake is corrected by a reversal with a reason, never erased.</li>
              </ul>
            </div>
            <div className="g-card">
              <h3>
                <span className="g-num" aria-hidden="true">
                  2
                </span>
                Every number has a source
              </h3>
              <ul>
                <li>The AI never types a number. Each figure is filled in from a snapshot of your own records.</li>
                <li>Tap any number to open the rows it came from.</li>
                <li>
                  If a number can't be traced, Munim says <strong>"Cannot verify"</strong> instead of guessing.
                </li>
                <li>The AI has no permission to write to your books; it can only propose.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="section" aria-labelledby="f-h">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">What Munim does</p>
            <h2 id="f-h" className="display h-section">
              One system for the counter, the kitchen and the books.
            </h2>
            <p className="lede">Each feature says honestly where it stands today.</p>
          </div>
          <div className="legend" aria-label="Status labels">
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
          <div className="feature-list">
            {FEATURES.map((f) => (
              <article key={f.title} className="feature">
                <span className="feature-icon">
                  <Icon name={f.icon} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <div className="feature-status">
                  <StatusChip status={f.status} />
                  <small>{f.note}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="d-h">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">The team behind the desk</p>
            <h2 id="d-h" className="display h-section">
              Eight specialists. One Manager. You decide.
            </h2>
            <p className="lede">
              Fixed rules find the problem first; the model only explains it, with a reference beside every number. Address any desk directly, like{" "}
              <code>@finance</code>.
            </p>
          </div>
          <div className="desks">
            {DESKS.map((d) => (
              <div key={d.id} className="desk">
                <Icon name={d.icon} />
                <h3>{d.name}</h3>
                <p>{d.does}</p>
                <code>{d.id}</code>
              </div>
            ))}
          </div>
          <div className="manager">
            <Icon name="compass" size={32} />
            <p>
              <strong>The Manager</strong> reads your question, sends it to the right specialists, and brings back one answer with its sources. A
              forecast service sits behind them all, measured against a simple seasonal baseline.
            </p>
          </div>
        </div>
      </section>

      <section id="how" className="section" aria-labelledby="h-h">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">How it works</p>
            <h2 id="h-h" className="display h-section">
              From the day's orders to a fix you approve.
            </h2>
          </div>
          <ol className="steps">
            <li className="step">
              <h3>Run the day</h3>
              <p>Orders, tickets, stock, cash and payouts land in append-only books, one business and one outlet at a time.</p>
            </li>
            <li className="step">
              <h3>Spot what matters</h3>
              <p>Watchers and fixed rules flag margin leaks, missing payouts, waste spikes and expiring stock.</p>
            </li>
            <li className="step">
              <h3>Explain and draft</h3>
              <p>A specialist explains the finding with the rows behind it and drafts the fix, a source beside each number.</p>
            </li>
            <li className="step">
              <h3>You decide</h3>
              <p>Approve or reject in one tap. The change runs under your name, with its audit entry, or not at all.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="c-h">
        <div className="wrap">
          <div className="cares-band">
            <div className="cares-band-copy">
              <p className="eyebrow">Munim Cares</p>
              <h2 id="c-h" className="display h-section">
                Good food shouldn't end the day in the bin.
              </h2>
              <p className="lede">
                Munim spots surplus and near-expiry stock, drafts a donation listing for your approval, matches it to a food bank or NGO, and records the
                hand-over in your books.
              </p>
              <div className="cta-row">
                <Link href="/cares" className="btn btn-secondary">
                  How Munim Cares works
                  <Icon name="arrow" size={18} />
                </Link>
              </div>
            </div>
            <div className="listing" role="img" aria-label="Illustration of a surplus listing waiting for the owner's approval, offered to a simulated recipient">
              <div className="listing-row">
                <strong>Surplus listing</strong>
                <span className="draft-tag">Draft</span>
              </div>
              <ul className="listing-items">
                <li>
                  <span>Packaged basmati rice, best before in 3 days</span>
                  <span className="cite">qty · row 1</span>
                </li>
                <li>
                  <span>Tomatoes, near expiry</span>
                  <span className="cite">qty · row 2</span>
                </li>
              </ul>
              <div className="listing-row">
                <span>Neighbourhood Food Bank (simulated)</span>
                <SimBadge>Simulated recipient</SimBadge>
              </div>
              <div className="draft-actions">
                <span className="fake-btn primary">Approve listing</span>
                <span className="fake-btn">Not today</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="dev-h">
        <div className="wrap">
          <div className="home-dev">
            <div className="home-dev-copy">
              <p className="eyebrow">For developers</p>
              <h2 id="dev-h" className="display h-section">
                Build your own storefront on the Munim API.
              </h2>
              <ul className="checks">
                <li>
                  <Icon name="check" size={20} />
                  <span>A full API reference generated from the same contracts the server enforces.</span>
                </li>
                <li>
                  <Icon name="check" size={20} />
                  <span>A mock API on this site, with synthetic data and two demo storefronts. No setup, no keys to request.</span>
                </li>
                <li>
                  <Icon name="check" size={20} />
                  <span>Step-by-step guides for two storefronts: a restaurant group in Bengaluru and a café in Melbourne.</span>
                </li>
              </ul>
              <Link href="/developers" className="btn btn-primary">
                Open the developer portal
              </Link>
            </div>
            <CodeBlock code={SNIPPET} title="Try the mock API" />
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="p-h">
        <div className="wrap">
          <div className="section-head ruled margin-line">
            <p className="eyebrow">Country packs</p>
            <h2 id="p-h" className="display h-section">
              Same code. Different country.
            </h2>
            <p className="lede">Everything that differs by country lives in a pack, so the code never branches on it.</p>
          </div>
          <div className="packs">
            <div className="pack">
              <h3>
                India <span className="pack-code">IN</span>
              </h3>
              <dl>
                <dt>Currency</dt>
                <dd>Indian rupee (<span className="fig">₹</span>), lakh grouping</dd>
                <dt>Receipt lines</dt>
                <dd>GSTIN and FSSAI licence</dd>
                <dt>Time zone</dt>
                <dd>Asia/Kolkata</dd>
                <dt>People</dt>
                <dd>Rosters, attendance and payroll drafts</dd>
              </dl>
            </div>
            <div className="pack">
              <h3>
                Australia <span className="pack-code">AU</span>
              </h3>
              <dl>
                <dt>Currency</dt>
                <dd>Australian dollar (A$), GST-inclusive prices</dd>
                <dt>Receipt lines</dt>
                <dd>ABN on tax invoices</dd>
                <dt>Time zone</dt>
                <dd>Australia/Melbourne, daylight saving handled</dd>
                <dt>People</dt>
                <dd>Rosters only (no Australian payroll)</dd>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="cta-h">
        <div className="wrap">
          <div className="cta-band">
            <div>
              <h2 id="cta-h" className="display">
                Running a few outlets, a cloud kitchen or a shop?
              </h2>
              <p>Tell us how you work today. We'll show you Munim on a synthetic business like yours.</p>
            </div>
            <Link href="/contact" className="btn">
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function HeroIllustration() {
  return (
    <figure className="ill">
      <div
        className="ill-card"
        role="img"
        aria-label="Illustration: an owner asks why a dish's margin fell; Munim answers with references to snapshot rows, says 'Cannot verify' for a payout it has no file for, and drafts a price change that waits for her approval."
      >
        <div className="ill-top">
          <span>Ask Munim · Koramangala outlet</span>
        </div>
        <div className="ill-q">Why did paneer tikka make less money last week?</div>
        <div className="ill-a">
          <span className="ill-avatar">
            <Icon name="coins" size={18} />
          </span>
          <p>
            <span className="who">@catalogue</span>
            The supplier's paneer price went up <span className="cite">⟨snap · row 4 · unit_cost⟩</span> and Tuesday's waste ran above its usual
            level <span className="cite">⟨snap · row 2 · waste_qty⟩</span>.
          </p>
        </div>
        <div className="abstain">
          <Icon name="shield" size={18} />
          <p>
            <strong>Cannot verify</strong> the delivery-app payout for that week: its file has not been imported yet.
          </p>
        </div>
        <div className="draft">
          <div className="draft-head">
            <span className="draft-title">Price change · Paneer tikka</span>
            <span className="draft-tag">Draft</span>
          </div>
          <div className="draft-row">
            New price <span className="cite">⟨snap · row 4 · suggested⟩</span> · waiting for Meena
          </div>
          <div className="draft-actions">
            <span className="fake-btn primary">Approve</span>
            <span className="fake-btn">Reject</span>
          </div>
        </div>
      </div>
      <figcaption className="ill-caption">Illustration · synthetic data</figcaption>
    </figure>
  );
}
