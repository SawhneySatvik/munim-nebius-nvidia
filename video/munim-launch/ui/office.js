// The AI back office: an original illustration drawn for this film in the Munim "Ledger, softened" style (ink
// outlines, hard shadows, ledger red and turmeric on paper). Eight specialist desks in two rows and the Manager's desk
// at the front, joined by dashed lines: the Manager routes every question. Each desk has a red cloth ledger (a
// bahi-khata) and a watcher lamp that lights when its specialist notices something. Provenance: assets/art/PROVENANCE.md.
(function () {
  const UI = (window.UI = window.UI || {});
  const INK = "#1b1611";
  const PAPER = "#fbf6ea";
  // Shirt colours: warm and muted, one per desk (the Manager wears ledger red).
  const SHIRTS = ["#f0b429", "#a9bccb", "#1f6b3a", "#8c6e5a", "#c9bba3", "#3a3029", "#e8b57c", "#6b7f8f"];
  const HAIR = [
    "M128 58c0-16 10-26 22-26s22 10 22 26c-6-8-14-11-22-11s-16 3-22 11z", // short
    "M126 62c-2-20 9-31 24-31s26 11 24 31l-6-8c-4 2-12 3-18 3s-14-1-18-3z", // side part
    "M127 60c0-17 10-28 23-28s23 11 23 28c0 10-3 18-6 22l-2-16c-5-4-10-6-15-6s-10 2-15 6l-2 16c-3-4-6-12-6-22z", // long
    "M128 56c0-14 10-24 22-24s22 10 22 24c-7-6-14-8-22-8s-15 2-22 8zM141 36a9 9 0 1 1 18 0z", // bun
  ];

  // One emblem per desk, on the drawer front (24 × 24 drawings): what each specialist looks after.
  const EMBLEMS = {
    catalogue: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.6"/>',
    kitchen: '<path d="M6.5 14a4 4 0 1 1 1.8-7.6 4.4 4.4 0 0 1 7.4 0A4 4 0 1 1 17.5 14v5h-11z"/><path d="M6.5 16.5h11"/>',
    inventory_purchasing: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
    finance: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 12h.1M12 12h.1M15.5 12h.1M8.5 16h.1M12 16h.1M15.5 16h.1"/>',
    people: '<rect x="5.5" y="5" width="13" height="16" rx="2"/><path d="M9 3.5h6v3H9zM8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
    customers: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M12 13.5l-2.6-2.4a1.6 1.6 0 0 1 2.6-1.8 1.6 1.6 0 0 1 2.6 1.8z"/>',
    compliance: '<path d="M12 3l8 3v6c0 5-3.6 8-8 9-4.4-1-8-4-8-9V6z"/><path d="M8.6 12l2.4 2.4 4.4-4.6"/>',
    market: '<path d="M4 20V11M10 20V6M16 20v-7M2.5 20h19"/>',
    manager: '<path d="M6 16.5h12l-1.6-2.6V10a4.4 4.4 0 0 0-8.8 0v3.9zM10 19.5h4M12 3.5v2"/>',
  };

  /** One desk as SVG (300 × 200): chair, person, desk, ledger, watcher lamp, emblem. `i` picks the shirt and hair. */
  function desk(id, i, { shirt, lit = false, emblem = "" } = {}) {
    const s = shirt || SHIRTS[i % SHIRTS.length];
    return `<svg class="desk" id="${id}" width="300" height="200" viewBox="0 0 300 200" aria-hidden="true">
      <defs><radialGradient id="${id}-g"><stop offset="0" stop-color="#f0b429" stop-opacity="0.85"/><stop offset="1" stop-color="#f0b429" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="150" cy="190" rx="132" ry="9" fill="rgb(27 22 17 / 0.14)"/>
      <circle class="glow" id="${id}-glow" cx="230" cy="92" r="70" fill="url(#${id}-g)" opacity="${lit ? 1 : 0}"/>
      <rect x="110" y="40" width="80" height="74" rx="20" fill="#6b5a4a" stroke="${INK}" stroke-width="3"/>
      <path d="M100 132c0-30 20-44 50-44s50 14 50 44z" fill="${s}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="150" cy="62" r="22" fill="#f3d9bc" stroke="${INK}" stroke-width="3"/>
      <path d="${HAIR[i % HAIR.length]}" fill="${INK}"/>
      <path d="M28 124h244l14 18H14z" fill="${PAPER}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="20" y="142" width="260" height="42" rx="4" fill="#e6d6b8" stroke="${INK}" stroke-width="3"/>
      <path d="M150 142v42M188 163h-8" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="96" cy="163" r="17" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/>
      <g transform="translate(84 151)" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${emblem}</g>
      <path d="M52 117l64-5 4 17-72 4z" fill="#b4232a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M56 129l66-4" stroke="${PAPER}" stroke-width="2"/>
      <ellipse cx="236" cy="125" rx="14" ry="4" fill="${INK}"/>
      <path d="M236 124l-8-26" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <path class="shade" id="${id}-shade" d="M204 100q24-30 50 0z" fill="${lit ? "#f0b429" : "#c9bba3"}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    </svg>`;
  }

  /** The whole office, 1920 × 1080, ids prefixed with `p`. Desks are addressable as `${p}desk-<specialist id>`. */
  UI.office = (F, p, { lit = [] } = {}) => {
    const cells = [];
    F.specialists.forEach((s, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      cells.push({ s, i, x: 200 + col * 380, y: 40 + row * 262 });
    });
    const mgr = { s: F.manager, i: 0, x: 770, y: 560 };
    const centre = (c) => [c.x + 190, c.y + 110];
    const [mx, my] = centre(mgr);
    const lines = cells.map((c) => {
      const [x, y] = centre(c);
      return `<path id="${p}line-${c.s.id}" d="M${x} ${y + 60}L${mx} ${my - 40}" stroke="#a9bccb" stroke-width="4" stroke-dasharray="4 12" stroke-linecap="round" fill="none"/>`;
    });
    const plate = (c, extra = "") =>
      `<div class="office-plate${extra}" style="left:${c.x + 20}px;top:${c.y + 200}px"><span id="${p}plate-${c.s.id}">${UI.esc(c.s.name)}</span></div>`;
    return `<div class="office" id="${p}office">
      <svg class="office-lines" width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">${lines.join("")}</svg>
      ${cells.map((c) => `<div class="office-desk" style="left:${c.x + 40}px;top:${c.y}px">${desk(`${p}desk-${c.s.id}`, c.i, { lit: lit.includes(c.s.id), emblem: EMBLEMS[c.s.id] })}</div>${plate(c)}`).join("")}
      <div class="office-desk office-manager" style="left:${mgr.x + 40}px;top:${mgr.y}px">${desk(`${p}desk-manager`, 3, { shirt: "#b4232a", lit: lit.includes("manager"), emblem: EMBLEMS.manager })}</div>
      ${plate(mgr, " office-plate-manager")}
    </div>`;
  };

  /** A ledger slip: what a specialist found, as it travels to the Manager. Numbers are the fixture's (traced cells). */
  UI.slip = (id, kind, title, figure) =>
    `<div class="slip" id="${id}"><span class="slip-kind">${UI.esc(kind)}</span><p class="slip-title">${UI.esc(title)}</p>${figure ? `<p class="slip-fig">${UI.esc(figure)}</p>` : ""}</div>`;
})();
