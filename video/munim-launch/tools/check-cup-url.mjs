// Release gate for a cut's end card: it fails while the end card still carries a placeholder for its URL (the Cup cuts'
// Cloud Run URL, the FalkorDB cut's live URL, the Nebius cut's live URL and repo). Until the founder sends the URL, every
// render of that cut is a review render and this gate says so with a non-zero exit.
// Usage: node tools/check-cup-url.mjs [cup|cup4|falkor|nebius] (default cup)
import "../assets/js/fixture.js";

const cut = process.argv[2] ?? "cup";
const card = globalThis.FIX.endCard[cut];
if (!card || cut === "full") {
  console.error(`usage: node tools/check-cup-url.mjs cup|cup4|falkor|nebius (no end card to check for "${cut}")`);
  process.exit(2);
}
const urls = [card.url, ...(cut === "nebius" ? [card.repo] : [])];
const bad = urls.filter((u) => /PENDING/.test(u) || !/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(u));
if (bad.length) {
  console.error(`FAIL the ${cut} end card shows ${bad.map((u) => `"${u}"`).join(" and ")}: not a release. Put the address in assets/js/fixture.js (endCard.${cut}) and render again.`);
  process.exit(1);
}
console.log(`ok: the ${cut} end card shows ${urls.join(" and ")}`);
