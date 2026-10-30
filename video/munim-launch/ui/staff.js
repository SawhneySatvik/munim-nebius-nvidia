// The recreated Cobnut staff screens beyond the owner home (ui/cobnut.js), from apps/web/components/staff: the kitchen
// board (pages/kitchen.tsx, kitchen-ticket.tsx), the till and its payment panel and receipt (pages/counter*.tsx,
// till.tsx, order-bits.tsx), Ask Munim (pages/ask.tsx), the office (pages/office.tsx, office-art.tsx, lib/munim/office.ts),
// a purchase-order proposal (suppliers/po-draft.tsx, decision.tsx), Cares (inbox FindingCard, cares/listing-draft.tsx),
// and the full tour's extra screens. Filled from the fixture; demo badges left off (R65 V-5). Ids carry a prefix (`p`).
(function () {
  const UI = (window.UI = window.UI || {});
  const esc = (s) => UI.esc(s);

  // ---------------------------------------------------------------- the kitchen board
  /** One ticket card (kitchen-ticket.tsx). t: {no, kind, channel, min, colour, due, status, lines: [{qty, name, opts, note}], next, lane} */
  UI.ticket = (t, id) => `<article class="ticket" id="${id}" data-colour="${t.colour || "normal"}"${t.lane === "later" ? ' data-lane="later"' : ""}>
    <header class="ticket-head"><div><p class="ticket-no num">#${t.no}</p><p class="semi" style="font-size:15px">${esc(t.kind)} · ${esc(t.channel)}</p></div>
      <div class="ticket-meta"><p class="ticket-timer num" id="${id}-timer">${t.min} min</p><p style="font-size:15px;font-weight:700">${t.colour === "amber" ? "Due soon" : t.colour === "red" ? "Late" : "On time"} · due ${esc(t.due)}</p></div></header>
    <div class="ticket-lines"><span class="badge ${t.status === "Ready" ? "badge-ready" : t.status === "Waiting" ? "badge-new" : "badge-work"}" id="${id}-status">${esc(t.status)}</span>
      ${t.lines.map((l) => `<div><p class="ticket-line"><span class="ticket-qty num">${l.qty}×</span> ${esc(l.name)}${l.size ? `<span style="font-weight:700"> · ${esc(l.size)}</span>` : ""}</p>${l.opts ? `<p class="ticket-options">${esc(l.opts)}</p>` : ""}${l.note ? `<p class="ticket-note">“${esc(l.note)}”</p>` : ""}</div>`).join("")}</div>
    ${t.next ? `<div class="ticket-actions"><span class="btn ${t.next === "Ready" ? "btn-secondary" : "btn-primary"}" id="${id}-btn">${esc(t.next)}</span></div>` : ""}
  </article>`;

  /** The kitchen board at Hazratganj (pages/kitchen.tsx) for Kavya: a Now lane and a Later lane. `now`/`later` are
   *  arrays of ticket specs; the cake ticket's id is `${p}cake`. */
  UI.kitchenBoard = (F, p, { now, later, laterHead }) => `<div class="cb-page">
    ${UI.staffBar(F, "kitchen", "Kitchen")}
    <main class="staff-main-wide">
      <div class="kds-top"><h1 class="section-title">Kitchen</h1><span class="chip" aria-current="page">All stations</span><span class="chip">Bar</span><span class="chip">Kitchen</span>
        <span class="spacer"><span class="badge badge-ready">Live</span><span class="btn btn-plain">Refresh</span></span></div>
      <div class="kds-lanes"><section><h2 class="lane-h" id="${p}now-h">Now · ${now.length}</h2><div class="kds-grid" id="${p}now">${now.map((t) => UI.ticket(t, t.id)).join("")}</div></section>
        <section><h2 class="lane-h" id="${p}later-h">Later · ${later.length}</h2><div class="kds-later" id="${p}later">${later.map((t) => `<div><p class="semi" style="font-size:15px">${esc(laterHead)}</p>${UI.ticket(t, t.id)}</div>`).join("")}</div></section></div>
    </main></div>`;

  // ---------------------------------------------------------------- the till
  const tile = (F, slug, variant, extra = "") => {
    const it = F.items[slug];
    const v = variant ? it.variants[variant] : null;
    return `<span class="tile${it.soldOut ? " off" : ""}" ${extra}><span>${esc(it.name)}${v ? `<span class="tile-sub">${esc(v.name)}</span>` : ""}</span>
      <span class="tile-foot"><span class="tile-price num">${F.fmt.inr(v ? v.price : it.price)}</span>${it.soldOut ? '<span class="soldout-pill">Sold out</span>' : it.groups ? '<span class="badge">Choose</span>' : ""}</span></span>`;
  };
  /** The counter's New order view (pages/counter.tsx): tiles by category and the cart rail, for Imran. Cart lines and
   *  totals are drawn from the fixture's walk-in; the scene reveals them line by line. */
  UI.till = (F, p) => {
    const w = F.walkIn.priced;
    const inr = F.fmt.inr;
    const l1 = w.lines[0], l2 = w.lines[1];
    return `<div class="cb-page">${UI.staffBar(F, "counter", "Counter")}
    <main class="staff-main-wide">
      <div class="kds-top"><span class="chip" aria-current="true">New order</span><span class="chip">Today's orders · ${F.walkIn.ticket - 1}</span></div>
      <div class="pos"><section>
        <h2 class="pos-h">${UI.motif("pastries", 26)} Pastries</h2>
        <div class="tile-grid">${tile(F, "hazelnut_croissant", null, `id="${p}t-croissant"`)}${tile(F, "pain_au_chocolat")}${tile(F, "cardamom_knot")}${tile(F, "pistachio_danish")}</div>
        <h2 class="pos-h">${UI.motif("drinks", 26)} Drinks</h2>
        <div class="tile-grid">${tile(F, "hazelnut_hot_chocolate", "regular", `id="${p}t-hc-regular"`)}${tile(F, "hazelnut_hot_chocolate", "large", `id="${p}t-hc-large"`)}${tile(F, "cold_coffee")}</div>
        <h2 class="pos-h">${UI.motif("cookies", 26)} Cookies</h2>
        <div class="tile-grid">${tile(F, "brown_butter_cookie")}${tile(F, "eggless_choc_chip")}${tile(F, "oat_jaggery_cookie")}</div>
      </section>
      <aside class="card cart-rail" id="${p}rail"><h2 style="font-size:24px">New order</h2>
        <div class="kind2"><span class="btn btn-primary">Takeaway</span><span class="btn btn-plain">Dine in</span></div>
        <p class="muted" id="${p}empty">Tap an item to start an order.</p>
        <div class="cart-line" id="${p}line1"><div><p class="semi">${esc(F.items.hazelnut_croissant.name)}</p><p class="muted" style="font-size:14px">${esc(F.deal.name)} · 20% off</p></div><p class="num semi"><span id="${p}l1-qty">2</span> · <span id="${p}l1-total">${inr(l1.total)}</span></p></div>
        <div class="cart-line" id="${p}line2"><div><p class="semi">${esc(F.items.hazelnut_hot_chocolate.name)}</p><p class="muted" style="font-size:14px">Regular</p></div><p class="num semi">1 · ${inr(l2.total)}</p></div>
        <dl class="rail-totals num" id="${p}totals"><dt>Subtotal <span class="badge">Preview</span></dt><dd>${inr(w.subtotal)}</dd><dt>Discount</dt><dd>−${inr(w.discount)}</dd><dt>Tax</dt><dd>${inr(w.tax)}</dd><dt class="big">Total</dt><dd class="big">${inr(w.total)}</dd></dl>
        <span class="btn btn-primary pay-btn" id="${p}place">Place order · ${inr(w.total)}</span>
        <p class="muted" style="font-size:14px">Payment is recorded on the next screen. Recorded only — Munim does not process payments.</p>
      </aside></div>
    </main></div>`;
  };

  /** The order's payment panel (order-bits.tsx TenderPanel), before and after a card payment is recorded, and the GST
   *  tax invoice (ReceiptBlock), for the walk-in. */
  UI.payment = (F, p) => {
    const w = F.walkIn;
    const inr = F.fmt.inr;
    const o = F.outlets.hzg;
    const lineRow = (l) => {
      const it = l.it;
      const name = it.name + (l.l.variant ? ` · ${it.variants[l.l.variant].name}` : "");
      return `<tr><td>${esc(name)}<span class="sub">${l.tax.map((x) => `${x.code} 2.5% ${inr(x.amount)}`).join(" · ")}</span></td><td class="num">${l.l.qty || 1}</td><td class="num">${inr(l.unit)}</td><td class="num">${l.discount ? inr(l.discount) : "—"}</td><td class="num">${inr(l.taxTotal)}</td><td class="num">${inr(l.total)}</td></tr>`;
    };
    return `<div class="cb-page">${UI.staffBar(F, "counter", "Counter")}
    <main class="staff-main-wide"><span class="link semi">← Back to the counter</span>
      <div class="pay-grid">
        <section class="card pay-panel"><h2 style="font-size:24px">Take payment</h2>
          <p class="semi">Order #${w.ticket} · Takeaway · ${esc(w.at)}</p>
          <dl class="pay-dl num"><dt>Total</dt><dd class="semi">${inr(w.priced.total)}</dd><dt>Paid</dt><dd id="${p}paid">${inr(0)}</dd><dt style="font-weight:700">Left to pay</dt><dd class="big" id="${p}left">${inr(w.priced.total)}</dd></dl>
          <p class="note-ok" id="${p}recorded">Card ${inr(w.priced.total)} recorded by ${esc(F.people.counter.name)}.</p>
          <div id="${p}pay-form"><div class="kind3"><span class="btn btn-plain">Cash</span><span class="btn btn-plain" id="${p}card">Card</span><span class="btn btn-plain">UPI</span></div>
            <p class="semi" style="margin-top:10px">Amount taken (INR)</p><span class="field num">${(w.priced.total / 100).toFixed(2)}</span>
            <span class="btn btn-primary pay-btn" id="${p}record" style="margin-top:12px">Record Card payment</span></div>
          <p class="muted" style="font-size:14px;margin-top:10px">Recorded only — Munim does not process payments. Nothing is charged here: record what the customer paid at the counter.</p>
        </section>
        <section class="card receipt" id="${p}receipt"><h2 style="font-size:22px">Tax Invoice</h2><p class="semi">${esc(o.name)}</p><p class="muted">${esc(o.area)}</p>
          <p class="num">GSTIN ${esc(o.gstin)}</p><p class="num">FSSAI Lic. No. ${esc(o.fssai)}</p><p class="num">No. ${esc(w.invoice)} · 16/10/2026</p>
          <table class="snap-table"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Discount</th><th class="num">Tax</th><th class="num">Total</th></tr></thead><tbody>${w.priced.lines.map(lineRow).join("")}</tbody></table>
          <dl class="pay-dl num"><dt>Net</dt><dd>${inr(w.priced.taxable)}</dd><dt>CGST 2.5%</dt><dd>${inr(w.priced.cgst)}</dd><dt>SGST 2.5%</dt><dd>${inr(w.priced.sgst)}</dd><dt>Tax</dt><dd>${inr(w.priced.tax)}</dd><dt style="font-weight:700">Total</dt><dd style="font-weight:700">${inr(w.priced.total)}</dd></dl>
          <p class="muted" style="font-size:14px">Recorded only — Munim does not process payments.</p></section>
      </div></main></div>`;
  };

  // ---------------------------------------------------------------- Ask Munim
  /** The Ask Munim page (pages/ask.tsx) for the owner: the question list on the left, the conversation on the right.
   *  `turns` are placeholders the scene fills: question text (typed), a pending card, an answer card. */
  UI.askPage = (F, p, { threads = [] } = {}) => `<div class="cb-page">${UI.staffBar(F, "owner", "Ask Munim")}
    <main class="staff-main"><h1 class="section-title">Ask Munim</h1>
      <div class="ask-grid"><aside class="ask-side"><div class="ask-side-h"><h2 style="font-size:22px">Your questions</h2><span class="btn btn-plain">Refresh</span></div>
        <ul class="ask-threads">${threads.map((t) => `<li class="card ask-thread"><span class="semi">${esc(t.who)}</span><span>${esc(t.q)}</span><span class="muted" style="font-size:14px">${esc(t.when)}</span></li>`).join("")}</ul></aside>
        <section class="ask-conv" id="${p}conv">
          <ol class="ask-turns" id="${p}turns"></ol>
          <form class="card ask-form" id="${p}form"><p class="semi">Your question</p><div class="textarea" id="${p}q"></div>
            <div class="ask-chips"><span class="muted" style="font-size:15px">Ask a specialist:</span>${F.specialists.slice(0, 5).map((s) => `<span class="chip">@${esc(s.name)}</span>`).join("")}</div>
            <p class="muted" style="font-size:15px">To: the Manager</p><span class="btn btn-primary" id="${p}ask">Ask</span></form>
        </section></div></main></div>`;
  /** One question bubble and its answer card (TurnBlock), returned as elements the scene appends. */
  UI.askTurn = (p, q) => `<li class="ask-turn"><div class="ask-q"><p class="muted semi" style="font-size:14px">You asked</p><p>${esc(q)}</p></div>
    <div class="card ask-pending" id="${p}pending"><p class="semi">Munim is reading your books…</p><p class="muted"><span class="mk-think" id="${p}think"><i></i><i></i><i></i></span> Answers can take up to a minute and a half. Asking never changes your books.</p></div>
    <div class="card ask-a" id="${p}a"><p class="muted semi" style="font-size:15px" id="${p}sig"></p><p class="ask-body" id="${p}body"></p></div></li>`;

  // ---------------------------------------------------------------- the office (the product's own page)
  const SKIN = "#d9a37a";
  const SHIRT = { manager: "#7b3f1d", catalogue: "#9e2f4e", kitchen: "#ffffff", inventory_purchasing: "#8c6e5a", finance: "#5b3a78", people: "#2e6b34", customers: "#9e2f4e", compliance: "#7a4b00", market: "#7b3f1d" };
  const st = 'stroke="#2a1a12" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
  const PROP = {
    manager: `<g ${st}><path d="M74 50a8 8 0 0 1 16 0z" fill="#f6d9c8"/><path d="M72 50h20"/><path d="M82 41v-2"/></g>`,
    catalogue: `<g ${st}><rect x="74" y="36" width="15" height="15" rx="2" fill="#ffffff"/><path d="M77 41h9M77 45h6"/></g>`,
    kitchen: `<g ${st}><path d="M72 46h18a9 6 0 0 1-18 0z" fill="#f6d9c8"/><path d="M84 46l4-12"/><ellipse cx="88.5" cy="33" rx="2.4" ry="3.4" fill="none"/></g>`,
    inventory_purchasing: `<g ${st}><rect x="73" y="38" width="17" height="13" rx="1.5" fill="#e8c49a"/><path d="M73 44h17M81.5 38v13"/></g>`,
    finance: `<g ${st}><path d="M72 40l9 2v10l-9-2z" fill="#ffffff"/><path d="M81 42l9-2v10l-9 2z" fill="#ffffff"/><path d="M74 44l5 1M83 44l5-1"/></g>`,
    people: `<g ${st}><rect x="74" y="35" width="14" height="17" rx="2" fill="#ffffff"/><path d="M77 40h8M77 44h8M77 48h5"/><rect x="78" y="33" width="6" height="3" rx="1" fill="#8c6e5a"/></g>`,
    customers: `<g ${st}><path d="M72 37h17v10h-10l-4 4v-4h-3z" fill="#ffffff"/><path d="M80.5 44.5l-3-3a1.6 1.6 0 0 1 3-1.6 1.6 1.6 0 0 1 3 1.6z" fill="#9e2f4e" stroke-width="1"/></g>`,
    compliance: `<g ${st}><rect x="79" y="32" width="5" height="16" rx="2.5" fill="#ffffff"/><circle cx="81.5" cy="49" r="3.6" fill="#9e2f4e"/><path d="M81.5 38v10" stroke="#9e2f4e"/></g>`,
    market: `<g ${st}><path d="M77 52V33"/><path d="M77 34h12l-3 4 3 4H77" fill="#f6d9c8"/></g>`,
  };
  const deskArt = (d, id) => `<svg viewBox="0 0 120 90" class="office-art" aria-hidden="true">
    <ellipse cx="60" cy="82" rx="46" ry="6" fill="#f3e6d3"/><rect x="31" y="30" width="32" height="36" rx="9" fill="#8c6e5a" stroke="#2a1a12" stroke-width="1.6"/>
    <g class="office-person" id="${id}-person"><path d="M29 62c0-17 8-26 18-26s18 9 18 26z" fill="${SHIRT[d]}" stroke="#2a1a12" stroke-width="1.6"/><circle cx="47" cy="23" r="11" fill="${SKIN}" stroke="#2a1a12" stroke-width="1.6"/><path d="M36 20a11 11 0 0 1 22 0c-4-4-17-4-22 0z" fill="#2a1a12"/><circle cx="43" cy="24" r="1.3" fill="#2a1a12"/><circle cx="51" cy="24" r="1.3" fill="#2a1a12"/></g>
    <path d="M16 54h88l-6 8H22z" fill="#ffffff" stroke="#2a1a12" stroke-width="1.6" stroke-linejoin="round"/><rect x="22" y="62" width="76" height="16" rx="3" fill="#e8c49a" stroke="#2a1a12" stroke-width="1.6"/><path d="M60 62v16" stroke="#2a1a12" stroke-width="1.2"/>
    <path d="M24 54V38l8-6" fill="none" stroke="#2a1a12" stroke-width="1.6" stroke-linecap="round"/><path id="${id}-lamp" d="M28 30l10 2-4 8z" fill="#8c6e5a" stroke="#2a1a12" stroke-width="1.4" stroke-linejoin="round"/>${PROP[d]}</svg>`;
  const bayArt = () => `<svg viewBox="0 0 120 90" class="office-art" aria-hidden="true"><ellipse cx="60" cy="82" rx="46" ry="6" fill="#f3e6d3"/><rect x="14" y="16" width="92" height="62" rx="6" fill="none" stroke="#2a1a12" stroke-width="1.6" stroke-dasharray="5 4"/><path d="M18 24h84l-6 10H24z" fill="#f6d9c8" stroke="#2a1a12" stroke-width="1.4" stroke-linejoin="round"/><path d="M38 24l-3 10M58 24v10M78 24l3 10" stroke="#9e2f4e" stroke-width="3"/>${[24, 50, 76].map((x) => `<g><rect x="${x}" y="50" width="20" height="24" rx="2" fill="#e8c49a" stroke="#2a1a12" stroke-width="1.6"/><path d="M${x} 58h20M${x + 10} 50v24" stroke="#2a1a12" stroke-width="1.2"/></g>`).join("")}</svg>`;
  const ownerArt = () => `<svg viewBox="0 0 120 90" class="office-art" aria-hidden="true"><ellipse cx="60" cy="82" rx="46" ry="6" fill="#f3e6d3"/><path d="M16 54h88l-6 8H22z" fill="#ffffff" stroke="#2a1a12" stroke-width="1.6" stroke-linejoin="round"/><rect x="22" y="62" width="76" height="16" rx="3" fill="#e8c49a" stroke="#2a1a12" stroke-width="1.6"/><path d="M40 54l4-10h32l4 10" fill="#ffffff" stroke="#2a1a12" stroke-width="1.6" stroke-linejoin="round"/><path d="M48 47l2-12h20l2 12" fill="#f6d9c8" stroke="#2a1a12" stroke-width="1.4" stroke-linejoin="round"/><path d="M54 40h12" stroke="#2a1a12" stroke-width="1.2"/><circle cx="96" cy="44" r="7" fill="#9e2f4e" stroke="#2a1a12" stroke-width="1.4"/><path d="M92.5 44l2.5 2.5 4.5-5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  UI.DESKS = ["manager", "catalogue", "kitchen", "inventory_purchasing", "finance", "people", "customers", "compliance", "market"];
  const deskName = (F, d) => (d === "manager" ? "Manager" : F.specialists.find((s) => s.id === d).name);
  /** The office page (pages/office.tsx): the run picker and the floor of eleven tiles. Each tile's bubble
   *  (`${p}bub-<spot>`) and border are switched by the scene as the replay steps. */
  UI.officePage = (F, p, run) => `<div class="cb-page">${UI.staffBar(F, "owner", "The office")}
    <main class="staff-main"><h1 class="section-title">The office</h1>
      <p class="muted" style="margin-top:12px;max-width:70ch">Munim's Manager and its eight specialists, at their desks. Pick a recent run to watch what they did, step by step, from the run's own record. Tap a desk to see what it is working on.</p>
      <section class="card office-run"><label class="semi grow">Run<span class="select" style="display:flex">${esc(run)}</span></label>
        <span class="btn btn-primary" id="${p}watch">Watch it</span><span class="btn btn-plain">Next step</span><span class="btn btn-plain">Faster</span></section>
      <section class="office-floor"><div class="office-grid">
        ${UI.DESKS.map((d) => `<div class="office-desk" id="${p}desk-${d}">${deskArt(d, `${p}art-${d}`)}<span class="office-desk-name">${esc(deskName(F, d))}</span><span class="office-bubble" id="${p}bub-${d}"></span></div>`).join("")}
        <div class="office-desk" id="${p}desk-suppliers">${bayArt()}<span class="office-desk-name">Supplier bay</span><span class="office-bubble" id="${p}bub-suppliers"></span></div>
        <div class="office-desk" id="${p}desk-owner">${ownerArt()}<span class="office-desk-name">Your desk</span><span class="office-bubble" id="${p}bub-owner"></span></div>
      </div></section></main></div>`;

  // ---------------------------------------------------------------- a purchase-order proposal
  /** The PO proposal (suppliers/po-draft.tsx) as `who` sees it: "manager" gets the gate line and no buttons; "owner"
   *  gets the decision bar. Status and lineage are elements the scene switches. */
  UI.poDraft = (F, p, who) => {
    const po = F.negotiation.po;
    const inr = F.fmt.inr;
    const person = F.people[who];
    return `<div class="cb-page">${UI.staffBar(F, who, "Inbox")}
    <main class="staff-main"><span class="link semi">← Inbox</span>
      <article class="card po" id="${p}po">
        <header class="po-head"><h3 style="font-size:22px">Order from ${esc(po.supplier)}</h3><span class="badge badge-new" id="${p}status">Waiting for you</span></header>
        <div class="draft-field"><p class="semi">For</p><p>${esc(F.outlets[po.outlet].name)}</p></div>
        <div class="draft-field"><p class="semi">Expected</p><p>${esc(po.expected)}</p></div>
        <div class="po-line"><p class="semi">${esc(F.hazelnuts.name)}</p>
          <div class="draft-field"><p class="semi">Quantity (kg)</p><p id="${p}qty">${UI.sourced(String(po.qty), `${p}qty-v`)}</p></div>
          <div class="draft-field"><p class="semi">Price per kg</p><p>${UI.sourced(inr(po.price), `${p}price-v`)}</p></div></div>
        <p class="muted" style="font-size:14px">Munim works out the total when it is approved. Recorded only — Munim does not process payments.</p>
        <p class="semi">▸ Compare the quotes</p>
        <p class="lineage" id="${p}lineage">Proposed by ${esc(po.proposedBy)} · ${esc(po.proposedAt)}</p>
        ${who === "owner"
          ? `<div class="decision" id="${p}decide"><span class="btn btn-primary" id="${p}approve">${esc(po.approveLabel)}</span><span class="btn btn-plain">Edit</span><span class="btn btn-plain danger">Reject</span></div>`
          : `<p class="gate" id="${p}gate">${esc(po.farahGate)}</p>`}
      </article>
      <p class="muted" style="font-size:15px;margin-top:10px">Signed in as ${esc(person.name)} · ${esc(person.blurb)}</p>
    </main></div>`;
  };

  // ---------------------------------------------------------------- Cares
  /** The expiry finding (inbox FindingCard) and the donation proposal (cares/listing-draft.tsx). */
  UI.caresPage = (F, p) => {
    const c = F.cares;
    const inr = F.fmt.inr;
    return `<div class="cb-page">${UI.staffBar(F, "owner", "Cares")}
    <main class="staff-main"><h1 class="section-title">Cares</h1>
      <div class="cares-grid">
      <article class="card finding" id="${p}finding"><div class="find-top"><span class="badge">Finding</span><span class="badge badge-warn">Medium</span><span class="muted" style="font-size:15px">Stock &amp; Purchasing · 16 Oct, 8:30 pm</span></div>
        <h3 style="font-size:22px">Food at risk of going to waste</h3>
        <p>Sliced sourdough loaves at ${esc(F.outlets.hzg.name)}: ${UI.sourced(String(c.sourdough.loaves), `${p}loaves`)} of this batch are not expected to be used before it expires on ${UI.sourced(c.sourdough.expires, `${p}exp`)}, worth ${UI.sourced(inr(c.sourdough.atRisk), `${p}risk`)} at cost.</p>
        <p class="semi">Impact: ${UI.sourced(inr(c.sourdough.atRisk), `${p}impact`)}</p></article>
      <article class="card listing" id="${p}listing"><header class="po-head"><h3 style="font-size:22px">Give food at risk to a recipient</h3><span class="badge badge-new" id="${p}l-status">Waiting for you</span></header>
        <div class="draft-field"><p class="semi">Food</p><p>${esc(c.sourdough.name)} · Packaged · use by ${esc(c.sourdough.expires)}</p></div>
        <div class="draft-field"><p class="semi">Quantity (loaves)</p><p>${UI.sourced(String(c.sourdough.loaves), `${p}l-qty`)}</p></div>
        <div class="draft-field"><p class="semi">To</p><p id="${p}to">${esc(c.match)}</p></div>
        <div class="draft-field"><p class="semi">Pickup</p><p>Today ${UI.sourced(c.pickup, `${p}pickup`)}</p></div>
        <p class="semi">▾ Recipients that could take it</p>
        <table class="snap-table" id="${p}rank"><thead><tr><th>name</th><th class="num">distance</th><th>fits</th><th class="num">overlap</th></tr></thead>
          <tbody>${c.recipients.map((r, i) => `<tr${i === 0 ? ' class="here"' : ""}><td>${esc(r.name)}</td><td class="num">${r.m < 1000 ? `${r.m} m` : `${(r.m / 1000).toFixed(1)} km`}</td><td>Yes</td><td class="num">${i === 0 ? "90 min" : "60 min"}</td></tr>`).join("")}</tbody></table>
        <p class="lineage" id="${p}l-lineage">Proposed by Stock &amp; Purchasing · 16 Oct, 8:31 pm · from a finding: Food at risk of going to waste</p>
        <div class="decision" id="${p}l-decide"><span class="btn btn-primary" id="${p}l-approve">Approve as ${esc(F.people.owner.name)}</span><span class="btn btn-plain">Edit</span><span class="btn btn-plain danger">Reject</span></div>
      </article></div></main></div>`;
  };
})();
