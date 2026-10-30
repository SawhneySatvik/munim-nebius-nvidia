// The FalkorDB cut's graph scene (R74 V-2): the supply graph drawn as a Munim chrome board (film chrome, not an app
// screen), and the product's supplier map recreated from pages/supplier-map.tsx (T-131) with its drawer, "What a price
// change touches". Copy is the product's (lib/munim/graph.ts); its "Sample data" badges are left off (R65 V-5); every
// supplier keeps its "Simulated supplier" badge. Written for this film.
(function () {
  const esc = UI.esc;
  const sim = '<span class="badge badge-sim">Simulated supplier</span>';
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const reach = (dishes, outlets) => `Reaches ${plural(dishes, "dish", "dishes")} at ${plural(outlets, "outlet", "outlets")}`;
  /** The map's header mark: three linked stops (drawn for this film). */
  const pathIcon = '<svg width="34" height="20" viewBox="0 0 34 20" aria-hidden="true"><circle cx="5" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="17" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="29" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9 10h4M21 10h4" stroke="currentColor" stroke-width="2.4"/></svg>';

  // ---------------------------------------------------------------- the graph board (film chrome)
  // Everything sits right of the ledger's red margin (x 158–169), which is drawn over the stage.
  const COL = { supplier: 200, ingredient: 610, dish: 990, outlet: 1450 };
  const W = { supplier: 340, ingredient: 300, dish: 330, outlet: 300 };
  const H = 44;
  /** Node and edge layout for Cobnut's graph, in board pixels (1920 × 1080). Ids: `${p}n-<kind>-<key>`, `${p}e-<i>`. */
  UI.graphLayout = (F) => {
    const g = F.graph;
    const nodes = [];
    const col = (kind, keys, label, top, bottom) => {
      const step = (bottom - top) / keys.length;
      keys.forEach((k, i) => nodes.push({ kind, key: k, label: label(k), x: COL[kind], y: Math.round(top + step * i + (step - H) / 2), w: W[kind] }));
    };
    col("supplier", ["dairy", "steady", "premium", "bargain"], (k) => g.sup[k], 250, 830);
    col("ingredient", ["butter", "hazelnuts", "flour", "cream"], (k) => g.ing[k], 250, 830);
    col("dish", g.dishes, (k) => g.dishName(k), 186, 830);
    col("outlet", g.outlets, (k) => F.outlets[k].name, 420, 700);
    const at = (kind, key) => nodes.find((n) => n.kind === kind && n.key === key);
    const edges = [];
    for (const [s, i] of g.supplies) edges.push({ from: at("supplier", s), to: at("ingredient", i), kind: "supplies" });
    for (const [s, i] of g.quoted) edges.push({ from: at("supplier", s), to: at("ingredient", i), kind: "quoted" });
    for (const [i, list] of Object.entries(g.uses)) for (const d of list) edges.push({ from: at("ingredient", i), to: at("dish", d), kind: "uses" });
    for (const d of g.dishes) for (const o of g.outlets) edges.push({ from: at("dish", d), to: at("outlet", o), kind: "sold" });
    return { nodes, edges };
  };
  UI.graphBoard = (F, p) => {
    const { nodes, edges } = UI.graphLayout(F);
    const path = (e) => {
      const x1 = e.from.x + e.from.w, y1 = e.from.y + H / 2, x2 = e.to.x, y2 = e.to.y + H / 2, mx = (x1 + x2) / 2;
      return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
    };
    const heads = [["supplier", "Suppliers"], ["ingredient", "Ingredients"], ["dish", "Dishes"], ["outlet", "Outlets"]];
    return `<div class="gb" id="${p}board">
      <div class="gb-title"><span class="gb-eyebrow">Supply graph</span><span class="gb-biz">Cobnut Bakehouse</span><span class="gb-note">rebuilt from its own books</span>
        <span class="gb-other" id="${p}other">Laneway Cafe · a graph of its own</span></div>
      ${heads.map(([k, t]) => `<p class="gb-head" id="${p}h-${k}" style="left:${COL[k]}px;width:${W[k]}px">${t}</p>`).join("")}
      <svg class="gb-edges" width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">${edges.map((e, i) => `<path id="${p}e-${i}" class="gb-edge gb-${e.kind}" d="${path(e)}"/>`).join("")}</svg>
      ${nodes.map((n) => `<div class="gb-node gb-${n.kind}" id="${p}n-${n.kind}-${n.key}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px">${esc(n.label)}</div>`).join("")}
    </div>`;
  };

  // ---------------------------------------------------------------- the supplier map (pages/supplier-map.tsx)
  UI.supplierMap = (F, p) => {
    const g = F.graph;
    const inr = F.fmt.inr;
    const dishesOf = (i) => g.uses[i].length;
    const card = (s, i, { price, quoted = [] }) => `<article class="card sm-card" id="${p}card-${s}"><h3 class="sm-sup">${esc(g.sup[s])} ${sim}</h3>
      <div class="sm-row"><div class="sm-ing"><p class="sm-ing-name">${esc(g.ing[i])} <span class="badge badge-warn">Only source</span></p>
        ${quoted.length ? `<p class="sm-quoted"><span class="muted">Quoted by</span> ${quoted.map((q) => `<span>${esc(g.sup[q])} ${sim}</span>`).join(" ")}</p>` : ""}
        <p><span class="muted">Latest price</span> ${UI.sourced(inr(price), `${p}price-${i}`)}</p>
        <p>${reach(dishesOf(i), g.outlets.length)}</p></div>
        <span class="btn btn-plain" id="${p}open-${i}">What a price change touches</span></div></article>`;
    return `<div class="cb-page" id="${p}page">${UI.staffBar(F, "owner", "Suppliers")}
    <main class="staff-main sm-main" id="${p}main">
      <header class="sm-head"><div class="sm-title"><span class="sm-icon">${pathIcon}</span><h1 class="section-title">Supplier map</h1><span class="badge badge-sim">Simulated suppliers</span></div>
        <p class="sm-lede">Who your menu depends on, and what a price change reaches. Read from the graph, rebuilt from your books.</p></header>
      <section class="sm-sole" id="${p}sole"><h2 class="sm-h2">Only one source <span class="sm-count">${plural(g.sole.length, "ingredient", "ingredients")}</span></h2>
        <ul class="sm-pills">${g.sole.map(([i, s]) => `<li class="card sm-pill" id="${p}sole-${i}"><span class="semi">${esc(g.ing[i])}</span> ${s ? `<span>— only from</span> <span>${esc(g.sup[s])}</span> ${sim}` : "<span>— no supplier on record</span>"}</li>`).join("")}</ul></section>
      <section><h2 class="sm-h2">What depends on each supplier</h2>
        <div class="sm-cards">${card("dairy", "butter", { price: g.butterPrice })}${card("steady", "hazelnuts", { price: g.hazelnutPrice, quoted: ["premium", "bargain"] })}</div></section>
    </main>
    ${UI.priceDrawer(F, p)}</div>`;
  };
  /** The ingredient drawer, "What a price change touches" (IngredientDetail), for butter at Cobnut Hazratganj: its first
   *  four dishes, as far as the camera sees (the rest of the list, findings and actions sit below the fold). */
  UI.priceDrawer = (F, p) => {
    const g = F.graph;
    const outletBadges = (paused) => g.outlets.map((o) => `<span class="badge${paused ? " badge-warn" : ""}">${paused ? `Paused at ${esc(F.outlets[o].name)}` : esc(F.outlets[o].name)}</span>`).join("");
    return `<div class="backdrop" id="${p}backdrop"></div>
    <aside class="drawer sm-drawer" id="${p}drawer">
      <div class="drawer-head"><div><h2>What a price change touches</h2><p class="semi">${esc(g.ing.butter)}</p></div><span class="btn btn-plain btn-round">✕</span></div>
      <div class="drawer-body sm-dbody">
        <section><h3 class="sm-h3">Supplied by</h3><p>${esc(g.sup.dairy)} ${sim}</p></section>
        <section><h3 class="sm-h3">Dishes <span class="sm-count">${reach(g.uses.butter.length, g.outlets.length)}</span></h3>
          <ul class="sm-dishes">${g.drawer.map((d, i) => `<li class="card sm-dish" id="${p}dish-${i}"><p class="semi">${esc(g.dishName(d.slug))}</p><p class="sm-badges">${outletBadges(d.paused)}</p>
            <p><span class="muted">Margin here</span> ${d.margin === null ? UI.cannotVerify(`${p}cv-${i}`) : UI.sourced(F.fmt.rate(d.margin), `${p}m-${i}`)}</p></li>`).join("")}</ul></section>
      </div></aside>`;
  };
})();
