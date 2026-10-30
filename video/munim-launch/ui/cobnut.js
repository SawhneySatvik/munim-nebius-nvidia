// The recreated Cobnut screens as markup strings (window.UI), filled from the fixture. Each screen follows its component
// in apps/web (named at each function), at the device's own width, with the app's demo badges left off (R65 V-5).
// Ids carry a scene prefix (`p`), because every scene shares one assembled page.
(function () {
  const UI = (window.UI = window.UI || {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  UI.esc = esc;

  // Small drawings from the app (components/art.tsx, staff/source.tsx, icons.tsx), redrawn at their sizes.
  UI.hazelnut = (size = 30) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><g stroke="#2a1a12" stroke-width="1.6" stroke-linejoin="round"><path d="M6 18c0-6 4.5-9.5 10-9.5S26 12 26 18c0 5.5-4.5 10-10 10S6 23.5 6 18z" fill="#9a5b2e"/><path d="M7 13c2-6 6-9 9-9s7 3 9 9c-3-2-6-3-9-3s-6 1-9 3z" fill="#6b3a1b"/></g><path d="M11 20c1.5 3 4 4.5 7 4.5" fill="none" stroke="#f0c993" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const stampMark = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 6.5h6M5 9.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  UI.alertIcon = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const closeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  /** SourcedValue (staff/source.tsx): the formatted cell and its Source chip. */
  UI.sourced = (text, id) => `<span class="src-value"${id ? ` id="${id}"` : ""}>${esc(text)}</span><span class="src-chip"${id ? ` id="${id}-chip"` : ""}>${stampMark} Source</span>`;
  UI.cannotVerify = (id) => `<span class="cv-chip"${id ? ` id="${id}"` : ""}>${UI.alertIcon} Cannot verify</span>`;

  /** The staff shell's bar (staff/shell.tsx) for a person, with the current tab. */
  UI.staffBar = (F, who, current) => {
    const p = F.people[who];
    // The tabs each role is shown (shell.tsx NAV filtered by session.ts CAN).
    const ROLE = { owner: "owner", manager: "manager", counter: "staff", kitchen: "staff" }[who];
    const NAV = [["Counter", 1], ["Kitchen", 1], ["Home", 0], ["Inbox", 0], ["Ask Munim", 1], ["The office", 0], ["Investigations", 2], ["Cares", 1], ["Suppliers", 0], ["Campaigns", 0], ["Storefront", 0]];
    const tabs = NAV.filter(([, k]) => (ROLE === "owner" ? true : ROLE === "manager" ? k !== 2 : k === 1)).map(([t]) => t);
    const outlet = p.outlets.length > 1
      ? `<span class="semi" style="display:inline-flex;align-items:center;gap:8px">Outlet <span class="select">${esc(F.outlets.hzg.name)}</span></span>`
      : `<span class="semi">${esc(F.outlets[p.outlets[0]].name)}</span>`;
    return `<header class="staff-bar"><div class="staff-bar-row">
      <span class="wordmark">${UI.hazelnut(30)}<span class="display">Cobnut <em>Bakehouse</em></span></span>
      <span class="badge">Staff</span>${outlet}
      <span class="spacer"><span class="semi">${esc(p.name)}</span><span class="muted">· ${esc(p.role)}</span><span class="btn btn-plain">Sign out</span></span>
    </div><nav class="staff-nav">${tabs.map((t) => `<span class="chip"${t === current ? ' aria-current="page"' : ""}>${esc(t)}</span>`).join("")}</nav></header>`;
  };

  /** Owner home (staff/pages/owner-home.tsx), Cobnut Hazratganj at 8:10 am, as the owner sees it. `drawer`: the snapshot
   *  drawer open on the waste figure (SnapshotDrawer). */
  UI.ownerHome = (F, p, { drawer = false, figures = {} } = {}) => {
    // `figures`: the day's later counts (F.ownerHomeLate) when the home is shown again in the evening.
    const h = { ...F.ownerHome, ...figures };
    const inr = F.fmt.inr;
    const low = h.lowStock[0];
    return `<div class="cb-page" id="${p}page">
      ${UI.staffBar(F, "owner", "Home")}
      <main class="staff-main">
        <div class="home-head"><div>
          <div class="scope-chips" id="${p}scope"><span class="chip" aria-current="true" id="${p}scope-outlet">${esc(F.outlets.hzg.name)}</span><span class="chip" id="${p}scope-all">All outlets</span></div>
          <h1 class="section-title">${esc(F.outlets.hzg.name)} today</h1>
          <p class="muted">Business date ${esc(F.day.label)} · Figures are taken from the books when this page opens.</p>
        </div><span class="btn btn-plain">Refresh figures</span></div>
        <section class="stats">
          <div class="card stat"><p class="stat-label">Orders today</p><p class="stat-value" id="${p}orders">${h.ordersToday}</p>
            <p class="stat-note">Counted from today's order list. <span class="link">See them at the counter</span></p></div>
          <div class="card stat"><p class="stat-label">Kitchen tickets today</p><p class="stat-value">${UI.sourced(String(h.ticketsToday), `${p}tickets`)}</p></div>
          <div class="card stat"><p class="stat-label">Net sales this week</p><p class="stat-value">${UI.sourced(inr(h.netSalesWeek), `${p}sales`)}</p>
            <p class="stat-note">Completed orders since Monday, after discounts.</p></div>
          <div class="card stat" id="${p}waste-card"><p class="stat-label">Most waste this week</p><p class="stat-value">${UI.sourced(inr(h.waste.waste), `${p}waste`)}</p>
            <p class="stat-note">${esc(h.waste.ingredient)}, since Monday. Open the source for every ingredient.</p></div>
          <div class="card stat stat-wide"><p class="stat-label">Food shared this month</p>
            <ul class="shared"><li>Portions ${UI.sourced(String(h.shared.portions), `${p}portions`)}</li><li>Packed items ${UI.sourced(String(h.shared.packed), `${p}packed`)}</li><li>Hand-overs ${UI.sourced(String(h.shared.handovers), `${p}handovers`)}</li></ul>
            <p class="stat-note"><span class="link semi">Open Cares</span></p></div>
        </section>
        <div class="home-lower">
          <section class="needs"><h2 class="section-title" style="font-size:28px">What needs you</h2>
            <ul class="needs">
              <li class="card need"><span class="badge">Finding</span><span class="need-title">More waste than a usual week</span><span class="need-meta">Stock &amp; Purchasing · 16 Oct, 6:55 am</span></li>
              <li class="card need"><span class="badge">Proposal · waiting for you</span><span class="need-title">Change an item's prep time</span><span class="need-meta">Kitchen · 16 Oct, 6:58 am</span></li>
            </ul></section>
          <section class="card low"><h2>Low stock</h2>
            <p class="semi">${esc(low.name)}</p>
            <p style="font-size:15px">On hand ${UI.sourced(`${F.fmt.qty(low.onHand * 1000)} ${low.unit}`, `${p}onhand`)} · minimum ${UI.sourced(`${F.fmt.qty(low.minimum * 1000)} ${low.unit}`, `${p}minimum`)}</p>
            <span class="btn btn-plain" id="${p}request" style="justify-self:start">Request quotes</span>
          </section>
        </div>
      </main>
      ${drawer ? UI.wasteDrawer(F, p) : ""}
    </div>`;
  };

  /** The snapshot drawer on "Most waste this week": one row of inventory.waste_week, the cited cell outlined. Id
   *  columns are not shown unless cited (as the app). */
  UI.wasteDrawer = (F, p) => {
    const w = F.waste;
    const inr = F.fmt.inr;
    return `<div class="backdrop" id="${p}backdrop"></div>
    <aside class="drawer" id="${p}drawer">
      <div class="drawer-head"><h2>Where this number comes from</h2><span class="btn btn-plain btn-round">${closeIcon}</span></div>
      <div class="drawer-body">
        <p class="semi">Waste this week</p>
        <p class="muted" style="font-size:14px">Taken from the books 16 Oct, 8:10 am · for this screen · 1 row</p>
        <table class="snap-table"><thead><tr><th class="num">waste_minor</th><th class="num">median_minor</th><th class="num">excess_minor</th></tr></thead>
          <tbody><tr class="here"><td class="num cited" id="${p}cited">${inr(w.waste)}</td><td class="num">${inr(w.median)}</td><td class="num">${inr(w.excess)}</td></tr></tbody></table>
      </div>
    </aside>`;
  };
})();
