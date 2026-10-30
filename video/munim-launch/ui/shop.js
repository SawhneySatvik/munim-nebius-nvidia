// Cobnut's own storefront on a phone (390 px), recreated from apps/web/components/pages/{menu,checkout,tracker}.tsx,
// components/{ui,art,cart-bits}.tsx and lib/site.ts, filled from the fixture. The shop's demo bar and its "Sample
// shop" lines are left off (R65 V-5); "Pay at the counter" and "Recorded only" stay. Ids carry a scene prefix (`p`).
(function () {
  const UI = (window.UI = window.UI || {});
  const esc = (s) => UI.esc(s);
  const INK = "#2a1a12";
  const s = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
  const MOTIF = {
    pastries: `<g ${s}><path d="M4 22c2-8 7-12 12-12s10 4 12 12c-4 2-8 3-12 3s-8-1-12-3z" fill="#e8b57c"/><path d="M11 12l2 11M21 12l-2 11" fill="none"/></g>`,
    cakes: `<g ${s}><path d="M5 26V15l22-6v17z" fill="#f6d9c8"/><path d="M5 19.5 27 14" fill="none" stroke="#9e2f4e"/><circle cx="22" cy="7" r="2.4" fill="#9e2f4e"/></g>`,
    cookies: `<g ${s}><circle cx="16" cy="16" r="11" fill="#d9a066"/><g fill="${INK}" stroke="none"><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="14" r="1.6"/><circle cx="14" cy="20" r="1.6"/><circle cx="21" cy="21" r="1.2"/></g></g>`,
    gift_boxes: `<g ${s}><rect x="5" y="13" width="22" height="14" rx="2" fill="#f6d9c8"/><path d="M4 13h24M16 13v14" fill="none" stroke="#9e2f4e"/><path d="M16 13c-3-6-9-6-9-2.5S13 13 16 13zm0 0c3-6 9-6 9-2.5S19 13 16 13z" fill="none" stroke="#9e2f4e"/></g>`,
    drinks: `<g ${s}><path d="M8 11h16l-2 16H10z" fill="#ffffff"/><path d="M7 11h18" fill="none"/><path d="M10 16h12l-1 6H11z" fill="#9a5b2e" stroke="none"/><path d="M13 7c-1.5-1.5 1.5-2.5 0-4M19 7c-1.5-1.5 1.5-2.5 0-4" fill="none" stroke="#9e2f4e"/></g>`,
  };
  UI.motif = (slug, size = 30) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${MOTIF[slug] ?? ""}</svg>`;
  const DIET = { veg: "Eggless", egg: "Egg", vegan: "Vegan" };
  const dietBadge = (d) => {
    if (!DIET[d]) return "";
    const mark = d === "vegan"
      ? `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13C3 7 7 3 13 3c0 6-4 10-10 10zM3 13l6-6" fill="none" stroke="#2e6b34" stroke-width="1.6" stroke-linecap="round"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="${d === "veg" ? "#2e6b34" : INK}" stroke-width="1.6"/>${d === "veg" ? '<circle cx="8" cy="8" r="3.6" fill="#2e6b34"/>' : `<ellipse cx="8" cy="8.3" rx="3" ry="3.9" fill="${INK}"/>`}</svg>`;
    return `<span class="badge">${mark}${DIET[d]}</span>`;
  };
  const plus = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const bag = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const check = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  UI.checkIcon = check;
  const CAT = { pastries: "Pastries", cakes: "Cakes", cookies: "Cookies", gift_boxes: "Gift boxes", drinks: "Drinks" };

  /** The shop's header (components/ui.tsx SiteHeader) at phone width: the wordmark, "Staff", the bag. */
  UI.shopHeader = (count = 0) => `<header class="shop-head"><span class="wordmark">${UI.hazelnut(30)}<span class="display">Cobnut</span></span>
    <span class="shop-nav"><span class="btn btn-plain">Staff</span><span class="btn btn-plain">${bag}${count ? `<span class="num">${count}</span>` : ""}</span></span></header>`;

  const itemCard = (F, slug, p) => {
    const it = F.items[slug];
    const price = it.price !== null ? `${F.fmt.inr(it.price)}<span class="gst"> + GST</span>` : "Choose size";
    return `<li class="card shop-item" id="${p}item-${slug}">
      <div class="shop-item-top"><span${it.soldOut ? ' style="opacity:.55"' : ""}>${UI.motif(it.category, 40)}</span>${it.soldOut ? '<span class="soldout-pill">Sold out</span>' : ""}</div>
      <div class="shop-diet">${dietBadge(it.diet)}</div>
      <h3 class="shop-name">${esc(it.name)}</h3>
      ${it.description ? `<p class="muted shop-desc">${esc(it.description)}</p>` : ""}
      <div class="shop-foot"><p class="num semi">${price}</p>${it.soldOut ? '<span class="btn" aria-disabled="true">Sold out</span>' : `<span class="btn btn-primary btn-round" id="${p}add-${slug}">${plus}</span>`}</div>
    </li>`;
  };

  /** The menu (pages/menu.tsx) for Cobnut Hazratganj: the outlet, the category rail, the ribbon, then each category. */
  UI.shopMenu = (F, p) => {
    const byCat = {};
    for (const [slug, it] of Object.entries(F.items)) (byCat[it.category] ||= []).push(slug);
    const cats = F.categories.map(([k]) => k);
    return `<div class="shop-page">${UI.shopHeader()}
      <div class="shop-scroll" id="${p}menu-scroll">
        <div class="shop-wrap shop-outlet"><p class="display shop-title">${esc(F.outlets.hzg.name)}</p><p class="muted">${esc(F.outlets.hzg.area)}</p><span class="link semi">Change bakehouse</span></div>
        <nav class="shop-rail">${cats.map((c, i) => `<span class="chip"${i === 0 ? ' aria-current="true"' : ""}>${CAT[c]}</span>`).join("")}<span class="chip">Deals</span></nav>
        <div class="ribbon"><div class="ribbon-track">${[...cats.map((c) => CAT[c]), F.deal.name, "Pickup only", "Fresh every morning"].map((w) => `<span>${esc(w)}</span><span aria-hidden="true">·</span>`).join("")}</div></div>
        <div class="shop-wrap">${cats.map((c) => `<section class="shop-cat" id="${p}cat-${c}"><h2 class="section-title shop-cat-title">${UI.motif(c, 30)}${CAT[c]}</h2><ul class="shop-list">${byCat[c].map((slug) => itemCard(F, slug, p)).join("")}</ul></section>`).join("")}</div>
      </div></div>`;
  };

  /** The item sheet (pages/menu.tsx ItemModal) for the Hazelnut Praline Cake. Ids for the scene to tick and type into. */
  UI.itemSheet = (F, p) => {
    const it = F.items.praline_celebration_cake;
    const v = it.variants;
    const g = it.groups.sponge.options;
    return `<div class="sheet-backdrop" id="${p}sheet-backdrop"></div>
    <div class="sheet" id="${p}sheet">
      <p class="muted semi" style="font-size:14px">Cakes</p>
      <h2 class="sheet-title">${esc(it.name)}</h2>
      <p class="muted">${esc(it.description)}</p>
      <fieldset class="sheet-group"><legend class="semi">Choose one <span class="badge">Required</span></legend>
        <label class="choice" id="${p}v-half"><span class="radio"></span><span class="grow">${esc(v.half_kg.name)}</span><span class="num">${F.fmt.inr(v.half_kg.price)}</span></label>
        <label class="choice" id="${p}v-one"><span class="radio"></span><span class="grow">${esc(v.one_kg.name)}</span><span class="num">${F.fmt.inr(v.one_kg.price)}</span></label></fieldset>
      <fieldset class="sheet-group"><legend class="semi">Sponge <span class="badge">Required</span></legend><p class="muted" style="font-size:14px">Choose one.</p>
        <label class="choice" id="${p}o-classic"><span class="radio"></span><span class="grow">${esc(g.classic.name)}</span></label>
        <label class="choice" id="${p}o-eggless"><span class="radio"></span><span class="grow">${esc(g.eggless.name)}</span><span class="num">+${F.fmt.inr(g.eggless.delta)}</span></label></fieldset>
      <label class="sheet-note"><span class="semi">Message on the cake (optional)</span><span class="field" id="${p}note"></span><span class="muted" style="font-size:14px">Piped in chocolate. Up to 40 characters fit best.</span></label>
      <div class="sheet-foot"><p class="num semi sheet-price"><span id="${p}sheet-price">${F.fmt.inr(v.one_kg.price)}</span><span class="gst"> + GST</span></p><span class="btn btn-primary" id="${p}add-cart">Add to cart</span></div>
    </div>`;
  };

  /** Checkout (pages/checkout.tsx): pickup time, review with the coupon, details, place. The refusal and the totals are
   *  both drawn; the scene shows one, then the other. */
  UI.checkout = (F, p) => {
    const o = F.cakeOrder;
    const c = o.priced;
    const line = c.lines[0];
    const inr = F.fmt.inr;
    return `<div class="shop-page">${UI.shopHeader(1)}
      <div class="shop-scroll" id="${p}co-scroll"><div class="shop-wrap" style="padding-top:20px">
        <h1 class="display shop-title">Checkout</h1><p class="muted">Pickup from ${esc(F.outlets.hzg.name)}</p>
        <section class="card co-sec"><h2 class="co-h"><span class="sec-no">1 · </span>Pickup time</h2>
          <label class="choice"><span class="radio"></span>As soon as possible</label>
          <label class="choice on"><span class="radio on"></span>Today, ${esc(o.pickup)}</label></section>
        <section class="card co-sec" id="${p}review"><h2 class="co-h"><span class="sec-no">2 · </span>Review</h2>
          <div class="co-line"><div><p class="semi">1 × ${esc(F.items.praline_celebration_cake.name)}</p><p class="muted" style="font-size:14px">${esc(F.items.praline_celebration_cake.variants.one_kg.name)} · Eggless</p><p style="font-size:14px">Note: “${esc(o.lines[0].note)}”</p></div><p class="num semi">${inr(line.gross)}</p></div>
          <p class="semi" style="margin-top:14px">Coupon code</p>
          <div class="co-coupon"><span class="field num" id="${p}coupon"></span><span class="btn btn-plain" id="${p}apply">Apply</span></div>
          <div class="co-swap">
            <div class="co-refusal" id="${p}refusal"><p class="err">${UI.alertIcon} ${esc(o.tried.refused[0].text)}</p><span class="btn btn-plain" id="${p}remove">Remove coupon</span></div>
            <dl class="co-totals num" id="${p}totals">
              <div><dt>Subtotal</dt><dd>${inr(c.subtotal)}</dd></div>
              <div class="ok"><dt>Discount</dt><dd>−${inr(c.discount)}</dd></div>
              <div class="muted"><dt>CGST 2.5%</dt><dd>${inr(c.cgst)}</dd></div>
              <div class="muted"><dt>SGST 2.5%</dt><dd>${inr(c.sgst)}</dd></div>
              <div class="co-total"><dt>Total <span class="badge badge-new">Preview</span></dt><dd id="${p}total">${inr(c.total)}</dd></div>
            </dl>
          </div></section>
        <section class="card co-sec"><h2 class="co-h"><span class="sec-no">3 · </span>Your details</h2>
          <p class="semi">Name</p><span class="field">${esc(o.customer)}</span><p class="semi" style="margin-top:10px">Phone</p><span class="field num">+91 90000 00412</span></section>
        <section class="card co-sec" id="${p}place-sec"><h2 class="co-h"><span class="sec-no">4 · </span>Place</h2>
          <p class="semi">Pay at the counter — cash, card or UPI.</p><p class="muted">Recorded only — Munim does not process payments.</p>
          <span class="btn btn-primary co-place" id="${p}place">Place order</span></section>
      </div></div></div>`;
  };

  const STEPS = ["Placed", "Accepted", "Preparing", "Ready", "Picked up"];
  /** The tracker (pages/tracker.tsx): every step drawn; the scene moves the "now" marker with MK.states. */
  UI.tracker = (F, p) => `<div class="shop-page">${UI.shopHeader()}
    <div class="shop-wrap" style="padding-top:28px"><p class="badge badge-new">Pickup order</p>
      <h1 class="num tr-no">Order #${F.cakeOrder.ticket}</h1>
      <p class="tr-line" id="${p}tr-line"></p>
      <p class="tr-live"><span class="dot"></span> Live</p>
      <ol class="tr-steps" id="${p}tr-steps">${STEPS.map((w, i) => `<li><span class="tr-dot" id="${p}tr-dot-${i}">${check}</span><span class="tr-word">${w}</span></li>`).join("")}</ol>
      <p class="num tr-ready">Ready at about <strong>${esc(F.cakeOrder.pickup.split("–")[0])} am</strong></p>
      <section class="card co-sec"><p class="semi">1 × ${esc(F.items.praline_celebration_cake.name)}</p><p class="muted" style="font-size:14px">1 kg (serves 8–10) · Eggless</p>
        <p class="num semi" style="margin-top:8px">Total ${F.fmt.inr(F.cakeOrder.priced.total)} · pay at the counter</p></section>
    </div></div>`;
  UI.trackerLines = ["Order placed. Waiting for the kitchen to accept it.", "The kitchen accepted your order.", "Your order is being prepared.", "Your order is ready for pickup.", "Picked up. Enjoy!"];
})();
