// The rest of the recreated screens: the storefront page builder (pages/storefront-builder.tsx, lib/munim/page-theme.ts),
// campaigns (pages/campaigns.tsx, lib/munim/campaign-words.ts), the Australian outlet on the AU pack (the seeded
// au_outlet world: Laneway Cafe Fitzroy), and the full tour's extras: the staff sign-in picker (sign-in.tsx), "All
// outlets" (rollup.tsx), a finding being dismissed (inbox.tsx), an investigation (pages/investigation.tsx), and the
// suppliers screen with goods received (pages/suppliers.tsx, suppliers/receive.tsx). Demo labels left off (R65 V-5).
(function () {
  const UI = (window.UI = window.UI || {});
  const esc = (s) => UI.esc(s);

  // ---------------------------------------------------------------- the page builder
  const PRESETS = [
    ["Cobnut original", "#7b3f1d", "#9e2f4e", "#f6d9c8"], ["Pistachio", "#2f5d3a", "#8a3b5c", "#dcebc9"], ["Plum and cream", "#5b2a5e", "#a3361c", "#f3dbe8"],
    ["Harbour blue", "#1f4e6b", "#9e2f4e", "#d6e8ef"], ["Espresso", "#3b2416", "#7a4b00", "#f1e0c5"],
  ];
  UI.PRESETS = PRESETS;
  /** The storefront's home sections as the preview draws them (BUILT_IN in page-theme.ts). */
  const previewSections = (F, p) => ({
    hero: `<div class="pv-sec pv-hero" id="${p}pv-hero"><p class="pv-badge">Lucknow · two bakehouses · pickup only</p><p class="display pv-name">${UI.hazelnut(30)} Cobnut Bakehouse</p><p class="pv-tag">Baked at dawn. Boxed with care. Pick up warm.</p></div>`,
    outlets: `<div class="pv-sec" id="${p}pv-outlets"><p class="display pv-h">Pick your bakehouse</p>${["hzg", "gmt"].map((k) => `<div class="pv-card"><p class="semi">${esc(F.outlets[k].name)}</p><p class="muted">${esc(F.outlets[k].area)}</p><span class="pv-btn">Order for pickup</span></div>`).join("")}</div>`,
    ribbon: `<div class="pv-sec pv-ribbon" id="${p}pv-ribbon">Pastries · Cakes · Cookies · Gift boxes · Drinks</div>`,
    cards: `<div class="pv-sec" id="${p}pv-cards"><div class="pv-card pv-soft"><p class="semi">Build a gift box</p><p class="muted">Pick a box size and two to four truffle-cookie flavours.</p></div><div class="pv-card pv-soft"><p class="semi">Cakes with a message</p><p class="muted">Classic or eggless, with your words piped on top.</p></div></div>`,
  });
  UI.builder = (F, p) => {
    const sec = previewSections(F, p);
    const NAMES = [["hero", "Welcome"], ["outlets", "Outlets"], ["ribbon", "Ribbon of words"], ["cards", "Cards"]];
    return `<div class="cb-page">${UI.staffBar(F, "owner", "Storefront")}
    <main class="staff-main-wide"><h1 class="section-title">Storefront</h1>
      <p class="muted" style="margin-top:10px;max-width:75ch">Shape how your ordering site looks: its colours, its layout and its home page. Saving keeps a numbered version and changes nothing customers see; publishing puts a version live.</p>
      <p class="card" style="padding:12px 16px;margin-top:12px"><span class="semi">Live now:</span> version 2, published 12 Oct, 6:40 pm by ${esc(F.people.owner.name)}. <span id="${p}editing">Editing from version 2.</span></p>
      <div class="bld"><div class="bld-left">
        <section class="card bld-card"><h2 style="font-size:24px">Colours</h2><div class="bld-presets">${PRESETS.map(([n, a, b, c], i) => `<label class="choice" id="${p}preset-${i}"><span class="radio${i === 0 ? " on" : ""}" id="${p}radio-${i}"></span><span class="sw" style="background:${a}"></span><span class="sw" style="background:${b}"></span><span class="sw" style="background:${c}"></span>${esc(n)}</label>`).join("")}</div></section>
        <section><h2 style="font-size:24px">Home page sections</h2><p class="muted" style="font-size:15px">Drag a section to move it, or use Move up and Move down.</p>
          <ol class="bld-secs" id="${p}secs">${NAMES.map(([k, n]) => `<li class="card bld-sec" id="${p}sec-${k}"><span class="grip">⠿</span><span class="semi grow">${n}</span><span class="badge">Shown</span></li>`).join("")}</ol></section>
        <span class="btn btn-primary" id="${p}save">Save as a new version as ${esc(F.people.owner.name)}</span>
      </div>
      <section class="bld-right"><div class="bld-ph"><h2 style="font-size:24px">Preview</h2><span class="chip" aria-current="true">Phone</span><span class="chip">Desktop</span></div>
        <div class="pv" id="${p}pv">${["hero", "outlets", "ribbon", "cards"].map((k) => sec[k]).join("")}</div>
        <p class="muted" style="font-size:14px">The preview shows your outlets without their live opening state. Nothing in it can be tapped.</p></section></div>
    </main></div>`;
  };
  /** The versions card after saving, with the owner's publish button. */
  UI.builderVersions = (F, p) => `<section class="card bld-versions" id="${p}versions"><h2 style="font-size:24px">Saved versions</h2>
    <div class="ver"><span class="semi">Version 3</span><span class="muted" style="font-size:15px">saved by ${esc(F.people.owner.name)} · 16 Oct, ${esc(F.earlier.saved)}</span><span class="badge badge-ready" id="${p}live3">Live</span><span class="btn btn-secondary" id="${p}publish">Publish version 3 as ${esc(F.people.owner.name)}</span></div>
    <div class="ver"><span class="semi">Version 2</span><span class="muted" style="font-size:15px">saved by ${esc(F.people.owner.name)} · 12 Oct, 6:38 pm</span><span class="badge badge-ready" id="${p}live2">Live</span></div></section>`;

  // ---------------------------------------------------------------- campaigns
  const MESSAGE = "We've missed you at Cobnut Bakehouse. Your favourites come out of the oven every morning — come by this week.";
  UI.campaigns = (F, p) => `<div class="cb-page">${UI.staffBar(F, "owner", "Campaigns")}
    <main class="staff-main"><h1 class="section-title">Campaigns</h1>
      <p class="muted" style="margin-top:10px;max-width:70ch">Messages to your customers. The Customers desk proposes one when regulars stop coming; a person approves it first.</p>
      <h2 class="section-title" style="font-size:28px;margin-top:22px">Waiting for approval</h2>
      <div class="card camp-prop" id="${p}prop"><span class="badge">Proposal · waiting for you</span><span class="semi" style="font-size:19px">A message to regulars who stopped coming</span><span class="muted" style="font-size:15px">From the Customers desk · Both outlets · 16 Oct, 7:10 am</span>
        <blockquote class="camp-msg">${esc(MESSAGE)}</blockquote>
        <dl class="camp-dl"><div><dt>By</dt><dd class="semi">Text message</dd></div><div><dt>Planned for</dt><dd class="semi">Mon 19 Oct</dd></div><div><dt>Customers it would reach</dt><dd>${UI.sourced("38", `${p}reach`)}</dd></div></dl>
        <div class="decision" id="${p}decide"><span class="btn btn-primary" id="${p}approve">Approve as ${esc(F.people.owner.name)}</span><span class="btn btn-plain">Reject</span></div>
        <span class="badge badge-ready" id="${p}approved" style="justify-self:start">Approved · not sent · planned for Mon 19 Oct</span>
        <p class="lineage" id="${p}lineage">Proposed by Customers · 16 Oct, ${esc(F.earlier.proposed)}</p></div>
    </main></div>`;

  // ---------------------------------------------------------------- Australia: Laneway Cafe Fitzroy on the AU pack
  /** A tax invoice from the seeded AU business, with what the AU pack sets beside it. Prices include GST (1/11). */
  UI.laneway = (F, p) => {
    const a = F.au;
    const aud = (c) => `A$${(c / 100).toFixed(2)}`;
    return `<div class="au" id="${p}au"><section class="au-receipt"><p class="au-title">Tax invoice</p><p class="semi">${esc(a.outlet)}</p><p class="muted">Fitzroy VIC 3065</p><p class="num">ABN ${esc(a.abn)}</p><p class="num">No. LCF-2214 · 16/10/2026 · ${esc(F.earlier.melbourne)} AEDT</p>
        <table class="au-t">${a.lines.map((l) => `<tr><td>${l.qty} × ${esc(l.name)}</td><td class="num">${aud(l.price * l.qty)}</td></tr>`).join("")}<tr class="au-total"><td>Total</td><td class="num">${aud(a.total)}</td></tr><tr><td class="muted">Includes GST</td><td class="num muted">${aud(a.gst)}</td></tr></table>
        <p class="muted" style="font-size:14px">Recorded only — Munim does not process payments.</p></section>
      <section class="au-pack"><p class="ms-eyebrow">Country pack · AU</p><ul>${[["Currency", "Australian dollars (A$)"], ["Tax", "GST 10%, included in every price"], ["Tax id", "ABN on the tax invoice"], ["Time zone", a.tz], ["Business day", "Melbourne's, daylight saving and all"]].map(([k, v]) => `<li><span class="semi">${k}</span><span>${esc(v)}</span></li>`).join("")}</ul>
        <p class="au-same">The same Munim, the same code. Only the pack differs.</p></section></div>`;
  };

  // ---------------------------------------------------------------- the full tour's extras
  /** The staff sign-in picker (sign-in.tsx): the four people; its demo badge and line are left off. */
  UI.picker = (F, p) => `<div class="cb-page"><main class="staff-main" style="padding-top:40px">
    <div class="pk-top"><span class="wordmark">${UI.hazelnut(30)}<span class="display">Cobnut <em>Bakehouse</em></span></span><span class="link semi">Back to the shop</span></div>
    <h1 class="section-title" style="margin-top:34px">Staff sign-in</h1><p class="muted" style="margin-top:12px">Choose who you are.</p>
    <div class="pk-grid">${["owner", "manager", "counter", "kitchen"].map((k) => {
      const x = F.people[k];
      return `<div class="card pk" id="${p}pk-${k}"><span class="pk-init">${x.name.split(" ").map((w) => w[0]).join("")}</span><span class="display pk-name">${esc(x.name)}</span><span class="muted pk-blurb">${esc(x.blurb)}</span><span class="btn btn-primary pk-btn">Sign in</span></div>`;
    }).join("")}</div></main></div>`;

  /** "All outlets today" (rollup.tsx): the business-wide figures, then outlet by outlet. */
  UI.rollup = (F, p) => {
    const r = F.rollup;
    const inr = F.fmt.inr;
    return `<div class="rollup" id="${p}rollup"><section class="stats4">
      <div class="card stat"><p class="stat-label">Kitchen tickets today</p><p class="stat-value">${UI.sourced(String(r.tickets), `${p}r-t`)}</p><p class="stat-note">Every outlet, from the books.</p></div>
      <div class="card stat"><p class="stat-label">Net sales this week</p><p class="stat-value">${UI.sourced(inr(r.sales), `${p}r-s`)}</p><p class="stat-note">Every outlet, since Monday.</p></div>
      <div class="card stat"><p class="stat-label">Most waste this week</p><p class="stat-value">${UI.sourced(inr(F.waste.waste), `${p}r-w`)}</p><p class="stat-note">The one ingredient with the most, across outlets.</p></div>
      <div class="card stat"><p class="stat-label">Food shared this month</p><p class="semi" style="font-size:18px">Hand-overs ${UI.sourced(String(F.cares.before.handovers), `${p}r-h`)}</p></div></section>
      <section class="card" style="padding:20px;margin-top:16px"><h2 style="font-size:24px">Outlet by outlet</h2><p class="muted">Each outlet's figures come from its own books. The figures above are worked out by the books for the whole business, not added up on this page.</p>
        <table class="snap-table" style="margin-top:8px"><thead><tr><th>Outlet</th><th class="num">Kitchen tickets today</th><th class="num">Net sales this week</th><th class="num">Most waste this week</th></tr></thead>
        <tbody>${r.outlets.map((o) => `<tr><th class="semi">${esc(F.outlets[o.key].name)}</th><td class="num">${UI.sourced(String(o.tickets))}</td><td class="num">${UI.sourced(inr(o.sales))}</td><td class="num">${o.waste ? UI.sourced(inr(o.waste)) : '<span class="muted">None</span>'}</td></tr>`).join("")}</tbody></table></section></div>`;
  };

  /** A finding card with Dismiss open (inbox.tsx FindingCard): the cake tickets running late. */
  UI.dismissCard = (F, p) => `<article class="card finding" id="${p}drift"><div class="find-top"><span class="badge">Finding</span><span class="badge">Low</span><span class="muted" style="font-size:15px">Kitchen · 16 Oct, 6:58 am</span></div>
    <h3 style="font-size:22px">Tickets running past their prep time</h3>
    <p>Hazelnut Praline Cake tickets ran late ${UI.sourced(String(F.kitchenDrift.late), `${p}d-late`)} times this week. The slowest fifth took longer than ${UI.sourced(F.kitchenDrift.p80, `${p}d-p80`)}; the set prep time is ${UI.sourced(F.kitchenDrift.prep, `${p}d-prep`)}.</p>
    <div class="dismiss" id="${p}dismiss-row"><span class="btn btn-plain" id="${p}dismiss">Dismiss</span></div>
    <div class="dismiss" id="${p}why-row"><label class="semi">Why dismiss it?<span class="select" style="display:flex" id="${p}why">Choose a reason</span></label><span class="btn btn-primary" id="${p}confirm">Dismiss as ${esc(F.people.owner.name)}</span><span class="btn btn-plain">Keep it</span></div>
  </article>`;

  /** An investigation (pages/investigation.tsx): "Why did the margin fall?", September against August, its checklist. */
  UI.investigation = (F, p) => {
    const v = F.investigation;
    return `<div class="cb-page">${UI.staffBar(F, "owner", "Investigations")}
    <main class="staff-main"><span class="link semi">← All investigations</span>
      <div class="inv-pills"><span class="badge badge-ready">Done</span><span class="badge">Plan</span></div>
      <h1 class="section-title">Why did the margin fall?</h1><p style="font-size:18px;margin-top:10px">September 2026 against August 2026 · All outlets</p>
      <p class="muted" style="font-size:15px">Started 16 Oct, ${esc(v.startedAt)} by you. It only reads the books; nothing here changes them.</p>
      <h2 class="section-title" style="font-size:28px;margin-top:18px">What was checked</h2>
      <ul class="inv-list">${v.items.map((it, i) => `<li class="card inv-item" id="${p}inv-${i}"><div class="inv-top"><p class="semi" style="font-size:19px">${esc(it.q)}</p><span class="badge ${it.verdict === "Explains it" ? "badge-ready" : ""}">${esc(it.verdict)}</span></div><p class="muted" style="font-size:15px">Checked by ${esc(it.by)} · settled</p>${it.cells ? `<p class="inv-cells">${it.cells.map(([label, text]) => `<span class="muted">${esc(label)}</span> ${UI.sourced(text)}`).join(" ")}</p>` : ""}</li>`).join("")}</ul>
    </main></div>`;
  };

  /** The suppliers screen (pages/suppliers.tsx): the open order from Steady Wholesale; then goods received (receive.tsx). */
  UI.suppliers = (F, p) => {
    const po = F.negotiation.po;
    return `<div class="cb-page">${UI.staffBar(F, "owner", "Suppliers")}
    <main class="staff-main"><h1 class="section-title">Suppliers</h1>
      <h2 style="font-size:24px;margin-top:18px">Purchase orders</h2>
      <article class="card po" id="${p}po-row"><div class="po-head"><h3 style="font-size:20px">Order from ${esc(po.supplier)}</h3><span class="badge badge-work" id="${p}po-status">Sent</span></div>
        <p>${esc(F.hazelnuts.name)} · ${po.qty} kg · ${UI.sourced(F.fmt.inr(po.price))} per kg · for ${esc(F.outlets.hzg.name)} · expected ${esc(po.expected)}</p>
        <span class="btn btn-plain" id="${p}receive">Record goods received</span></article>
      <section class="card po" id="${p}grn"><h3 style="font-size:20px">Record goods received</h3><p class="semi">What came in?</p>
        <label class="choice on"><span class="radio on"></span>Everything on this order</label><label class="choice"><span class="radio"></span>Part of it</label>
        <span class="btn btn-primary" id="${p}grn-save" style="justify-self:start">Record as ${esc(F.people.owner.name)}</span>
        <p class="note-ok" id="${p}grn-ok">Received: ${po.qty} kg of ${esc(F.hazelnuts.name)}. Stock is updated.</p></section>
    </main></div>`;
  };
})();
