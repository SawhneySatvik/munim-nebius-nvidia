// The negotiation as the film shows it, in Munim chrome: a behind-the-scenes view of the real backend run (the app has
// no such screen). The agent-to-agent chat with the three simulated suppliers follows the recorded run
// (services/intel/fixtures/recorded) and the deal review shows its five rules (negotiate/review.py). Munim's notes carry
// no number and each supplier gets the note for its own move; the price line is added by code (the code strip).
// The suppliers' own bid texts are shown as they quote (their prices are their quotes, not Munim's words).
(function () {
  const UI = (window.UI = window.UI || {});
  const esc = (s) => UI.esc(s);
  // Drawn marks (the body face has no check or cross glyph).
  const TICK = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CROSS = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

  const bidText = (F, b, round) => {
    const s = F.negotiation.suppliers[b.s];
    const price = `<b class="fig">${esc(F.fmt.inr(b.price))}</b> per kg`;
    if (round === 0) {
      const terms = s.minOrderG ? ` Minimum order ${s.minOrderG / 1000} kg.` : "";
      return `We can supply 1 kg at ${price}. Payment: net ${s.payDays} days.${terms}`;
    }
    return `Our revised price is ${price}.${b.move === "accept" && b.s === "steady" ? ` Payment: net ${s.payDays} days.` : ""}`;
  };
  const moveChip = (F, b) => {
    const name = F.negotiation.suppliers[b.s].name.split(" ")[0];
    const price = b.move === "counter" ? ` <b class="fig">${esc(F.fmt.inr(F.negotiation.counterAt))}</b>` : "";
    return `<span class="move move-${b.move}">${esc(name)} · ${b.move}${price}</span>`;
  };

  /** The chat thread, every round. Ids: `${p}r<round>-<supplier>` for bids, `${p}m<round>` for Munim's replies. */
  UI.chat = (F, p) => {
    const n = F.negotiation;
    const rounds = n.rounds.map((round, r) => {
      const bids = round
        .map((b) => {
          const s = n.suppliers[b.s];
          return `<div class="bid" id="${p}r${r + 1}-${b.s}"><span class="avatar av-${b.s}">${esc(s.name[0])}</span><div><p class="bid-name">${esc(s.name)}</p><p class="bid-text">${bidText(F, b, r)}</p></div></div>`;
        })
        .join("");
      // One line per move: "To Steady and Premium: <counter note>", "To Bargain: <accept note>".
      const short = (b) => n.suppliers[b.s].name.split(" ")[0];
      const notes = ["counter", "accept"]
        .map((move) => round.filter((b) => b.move === move))
        .filter((group) => group.length > 0)
        .map((group) => `<p class="reply-note"><b>To ${esc(group.map(short).join(" and "))}:</b> ${esc(group[0].note)}</p>`)
        .join("");
      const reply = `<div class="reply" id="${p}m${r + 1}"><p class="reply-who">Munim's agent</p>${notes}<p class="reply-code">${round.map((b) => moveChip(F, b)).join("")}</p></div>`;
      return `<div class="round-label" id="${p}rl${r + 1}">Round ${r + 1} of ${n.rounds.length}</div>${bids}${reply}`;
    });
    return `<section class="chat" id="${p}chat">
      <header class="chat-head"><span class="bts">Behind the scenes</span><p class="chat-title">Request for quotes</p>
        <p class="chat-sub">${esc(F.hazelnuts.name)} for ${esc(F.outlets.hzg.name)}</p>
        <p class="chat-sum fig">${esc(F.hazelnuts.sum)}</p>
        <span class="chat-pill">Simulated suppliers · agent to agent</span></header>
      <div class="chat-view" id="${p}chat-view" data-layout-allow-overflow><div class="chat-body" id="${p}chat-body">${rounds.join("")}</div></div>
    </section>`;
  };

  /** The deal review: each supplier's final quote against the five rules; the best passing quote is proposed. */
  UI.review = (F, p) => {
    const n = F.negotiation;
    const RULES = [["budget", "Budget"], ["margin", "Margin"], ["minimum", "Min. order"], ["overlap", "On order"], ["payment", "Pay terms"]];
    const rows = [...n.review]
      .sort((a, b) => (a.pass === b.pass ? a.price - b.price : a.pass ? -1 : 1))
      .map((q) => {
        const chips = RULES.map(([k, label]) => `<span class="rule ${q.checks[k] ? "rule-ok" : "rule-fail"}">${q.checks[k] ? TICK : CROSS} ${label}</span>`).join("");
        const tag = q.key === n.winner ? `<span class="proposed">Proposed</span>` : q.pass ? "" : `<span class="failed">Fails</span>`;
        return `<div class="q ${q.key === n.winner ? "q-win" : ""} ${q.pass ? "" : "q-fail"}" id="${p}q-${q.key}">
          <div class="q-top"><p class="q-name">${esc(q.name)}</p>${tag}</div>
          <p class="q-price fig">${esc(F.fmt.inr(q.price))}<small> per kg · pay within ${q.payDays} days${n.suppliers[q.key].minOrderG ? ` · minimum ${n.suppliers[q.key].minOrderG / 1000} kg` : ""}</small></p>
          <div class="q-rules">${chips}</div>${q.fail ? `<p class="q-why">${esc(q.fail)}</p>` : ""}</div>`;
      })
      .join("");
    return `<section class="review" id="${p}review">
      <header><span class="bts">Behind the scenes</span><p class="review-title">Deal review</p><p class="review-sub">Five rules, checked by code. No model picks a number.</p></header>
      ${rows}
      <p class="review-foot" id="${p}review-foot">Draft purchase order: <b>${esc(n.po.supplier)}</b> · ${n.po.qty} kg (${esc(F.hazelnuts.sum)}) · <b class="fig">${esc(F.fmt.inr(n.po.price))}</b> per kg · waiting for a person</p>
    </section>`;
  };
})();
