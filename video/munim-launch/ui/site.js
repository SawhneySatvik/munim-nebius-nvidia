// Munim's own pages and the film's chrome boards: the site's hero (apps/site/app/page.tsx), the One Guarantee section and
// the Cares page hero (full tour), the developer portal's Getting started (apps/site/app/developers/getting-started),
// a stylised map of Lucknow, and the close (the guarantee, the end card, the disclosure card). In the site's own
// "Ledger, softened" look. Ids carry a scene prefix (`p`).
(function () {
  const UI = (window.UI = window.UI || {});
  const esc = (s) => UI.esc(s);
  UI.munimMark = (size) => `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#b4232a"/><path d="M8.5 21.5V10.5L16 18l7.5-7.5v11" fill="none" stroke="#fff8ef" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 25.5h18" stroke="#fff8ef" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="25.5" r="1.9" fill="#fff8ef"/></svg>`;
  const check = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#1f6b3a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  /** The site header (layout.tsx): the mark, the nav, "Contact us". */
  UI.siteHeader = () => `<header class="ms-head"><span class="ms-logo">${UI.munimMark(34)}<span class="ms-word">Munim</span></span>
    <nav class="ms-nav"><span>Product</span><span>Munim Cares</span><span>Developers</span></nav><span class="ms-btn ms-primary">Contact us</span></header>`;

  /** The home hero (page.tsx): the ruled ledger card, the headline, the lede, the buttons, the Ask Munim sample. */
  UI.siteHero = (p) => `<div class="ms-page">${UI.siteHeader()}
    <section class="ms-hero"><div class="ms-hero-card" id="${p}hero">
      <div class="ms-hero-copy"><p class="ms-eyebrow">For restaurant groups, cloud kitchens and shops</p>
        <h1 class="ms-h1">The AI back office that keeps <em>honest books</em>.</h1>
        <p class="ms-lede">Munim runs your counter, kitchen and ledgers, then explains what happened, finds money leaking out and drafts the fix. Nothing changes until you approve it.</p>
        <div class="ms-cta"><span class="ms-btn ms-primary">Contact us</span><span class="ms-btn ms-secondary">Explore the API</span></div>
        <ul class="ms-meta"><li>${check}India first</li><li>${check}Australia on its own country pack</li><li>${check}2 to 5 outlets, many brands</li></ul></div>
      <figure class="ms-ill"><div class="ms-ill-card"><div class="ms-ill-top">Ask Munim · Koramangala outlet</div>
        <div class="ms-ill-q">Why did paneer tikka make less money last week?</div>
        <div class="ms-ill-a"><p><span class="ms-who">@catalogue</span> The supplier's paneer price went up <span class="ms-cite">⟨snap · row 4 · unit_cost⟩</span> and Tuesday's waste ran above its usual level <span class="ms-cite">⟨snap · row 2 · waste_qty⟩</span>.</p></div>
        <div class="ms-abstain"><p><strong>Cannot verify</strong> the delivery-app payout for that week: its file has not been imported yet.</p></div>
        <div class="ms-draft"><div class="ms-draft-head"><span class="semi">Price change · Paneer tikka</span><span class="ms-tag">Draft</span></div><div>New price <span class="ms-cite">⟨snap · row 4 · suggested⟩</span> · waiting for Meena</div></div>
      </div></figure></div></section></div>`;

  /** The One Guarantee section (page.tsx #guarantee), for the full tour. */
  UI.siteGuarantee = (p) => `<div class="ms-page">${UI.siteHeader()}
    <section class="ms-sec"><div class="ms-sec-head"><p class="ms-eyebrow">The One Guarantee</p>
      <h2 class="ms-h2">Nothing changes your books without your approval<span class="ms-red">.</span> Every number traces to your records<span class="ms-red">.</span></h2></div>
      <div class="ms-g-grid"><div class="ms-g-card"><h3><span class="ms-g-num">1</span>You approve every change</h3><ul><li>Prices, stock, rosters, payroll, purchase orders and messages to customers all start as drafts.</li><li>A named person approves or rejects each one. Nothing applies itself.</li></ul></div>
        <div class="ms-g-card"><h3><span class="ms-g-num">2</span>Every number has a source</h3><ul><li>The AI never types a number. Each figure is filled in from a snapshot of your own records.</li><li>If a number can't be traced, Munim says <strong>"Cannot verify"</strong> instead of guessing.</li></ul></div></div></section></div>`;

  /** The Munim Cares page hero (apps/site/app/cares/page.tsx), for the full tour; its demo label is left off. */
  UI.siteCares = (p) => `<div class="ms-page">${UI.siteHeader()}
    <section class="ms-hero"><div class="ms-hero-card ms-cares"><div class="ms-hero-copy"><p class="ms-eyebrow">Munim Cares</p>
      <h1 class="ms-h1">Surplus food, shared <em>before</em> it is wasted.</h1>
      <p class="ms-lede">Kitchens and shops end many days with good food and stock close to its date. Munim Cares notices it early, asks the owner, and gets it to people who can use it — with every step recorded in the books.</p></div></div></section></div>`;

  /** A stylised map of Lucknow: the Gomti, a few roads, and the two Cobnut outlets. Drawn for the film. */
  UI.lucknowMap = (p, F) => `<div class="map" id="${p}map"><svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
      <path d="M-40 260C300 300 520 470 760 520S1180 480 1360 620S1660 900 1980 960" fill="none" stroke="#a9bccb" stroke-width="64" stroke-linecap="round"/>
      <path d="M-40 260C300 300 520 470 760 520S1180 480 1360 620S1660 900 1980 960" fill="none" stroke="#1b1611" stroke-width="3" stroke-dasharray="2 16" opacity="0.35"/>
      <g fill="none" stroke="#1b1611" stroke-width="5" stroke-linecap="round" opacity="0.55"><path d="M120 820C420 760 700 700 980 760S1500 860 1800 820"/><path d="M640 120C660 360 700 600 690 1000"/><path d="M1180 140C1150 380 1120 560 1210 900"/><path d="M300 600L900 300"/></g>
      <g fill="none" stroke="#1b1611" stroke-width="2.5" opacity="0.3"><path d="M200 420L560 980"/><path d="M1500 200L1380 1000"/><path d="M820 60L1700 520"/></g>
    </svg>
    <p class="map-river">Gomti</p><p class="map-city">Lucknow</p>
    <div class="pin" id="${p}pin-hzg" style="left:600px;top:560px"><span class="pin-dot"></span><span class="pin-label">${esc(F.outlets.hzg.name)}</span></div>
    <div class="pin" id="${p}pin-gmt" style="left:1260px;top:420px"><span class="pin-dot"></span><span class="pin-label">${esc(F.outlets.gmt.name)}</span></div></div>`;

  /** The developer portal's Getting started (getting-started/page.tsx): the SDK download and the client snippet. */
  UI.devPortal = (p) => `<div class="ms-page">${UI.siteHeader()}
    <div class="ms-dev"><nav class="ms-dev-nav"><span class="on">Getting started</span><span>Authentication</span><span>Reference</span><span>Schemas</span><span>Errors</span><span>Downloads</span><span>Mock API</span></nav>
      <article class="ms-dev-body"><p class="ms-eyebrow">API suite</p><h1 class="ms-h1 ms-dev-h1">Getting started</h1>
        <h2 class="ms-h3">1. Get the SDK</h2><p>A typed client for every operation, generated from the same contracts the server validates against.</p>
        <span class="ms-btn ms-primary" id="${p}download">Download munim-sdk-0.2.0.tgz</span>
        <pre class="ms-code" id="${p}install"># from the folder of your storefront project
npm install ./munim-sdk-0.2.0.tgz</pre>
        <h2 class="ms-h3">2. Create a client</h2>
        <pre class="ms-code" id="${p}client"></pre></article></div></div>`;
  UI.SDK_SNIPPET = `import { createMunimClient } from "@munim/sdk";

const munim = createMunimClient({
  baseUrl: "https://<this-site>/mock",
  storefrontKey: process.env.MUNIM_STOREFRONT_KEY!,
});

const { data, error } = await munim.GET("/v1/storefront/outlets");
if (error) throw new Error(error.error.code);
console.log(data);`;

  /** The close: the guarantee, written; then the end card and the disclosure card. */
  UI.close = (p, F, cut) => `<div class="close-guarantee" id="${p}guarantee"><p class="close-line" id="${p}g1">Nothing changes your books without your approval.</p><p class="close-line" id="${p}g2">Every number traces to a row.</p></div>
    <div class="endcard" id="${p}end"><div class="logo endlogo">${UI.munimMark(132)}<span class="logo-word" style="font-size:136px">Munim</span></div>
      <p class="end-line">${esc(F.endCard[cut].line)}</p>${F.endCard[cut].track ? `<p class="end-track">Track · ${esc(F.endCard[cut].track)}</p>` : ""}<p class="end-url fig">${esc(F.endCard[cut].url)}</p>${F.endCard[cut].repo ? `<p class="end-repo fig">${esc(F.endCard[cut].repo)}</p>` : ""}
      <div class="disclosure" id="${p}disclosure">${esc(F.disclosure)}</div></div>`;
})();
