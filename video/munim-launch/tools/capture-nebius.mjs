// The Nebius cut's screens, shot from the running local stack (web :3000 live as Cobnut, demo sign-in on), never
// recreated: each state is a PNG at 2× (the camera zooms to about 1.6×) and shots.js records, per shot, the boxes of
// the things the film marks (an ink circle, the highlighter, a cursor target, a placeholder over a model tag), in the
// screen's own CSS pixels. Re-run it after N3 / NB-3 and the film picks up the new screens with no other change.
// It signs in through the app's own picker (the token stays in the browser), reads, opens panels and drawers, types one
// question without sending it, and switches the outlet. It never approves, rejects, edits or sends anything.
// The one exception is beat 10's question, which Munim cannot answer from the books: --ask asks it live (a person's
// question, about a minute on the model) and records its thread; without --ask that thread is only re-shot.
// Usage (from video/munim-launch): node tools/capture-nebius.mjs [--only=name,name] [--base=http://127.0.0.1:3000] [--ask]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "../..");
const { chromium } = createRequire(join(REPO, "apps/web/package.json"))("playwright-core");

const KNOWN = ["only", "base", "ask"];
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)(?:=(.+))?$/.exec(a);
  if (!m || !KNOWN.includes(m[1]) || (m[1] === "ask") !== (m[2] === undefined)) throw new Error(`unknown argument ${a} (use --only=a,b --base=<url> --ask)`);
  args[m[1]] = m[2] ?? true;
}
const BASE = args.base ?? "http://127.0.0.1:3000";
const only = args.only ? args.only.split(",") : null;
const OUT = join(ROOT, "assets/screens/nebius");
mkdirSync(OUT, { recursive: true });
// shots.js loads as a classic <script> in the film (globalThis.NB_SHOTS) and is read back here on every run.
const manifestFile = join(OUT, "shots.js");
let manifest = { shots: {} };
try {
  manifest = JSON.parse(/^[^=]*=\s*([\s\S]*);\s*$/.exec(readFileSync(manifestFile, "utf8"))[1]);
} catch {
  // first run
}

// The drafts the film shows while they are still proposed (NB-film brief), and the answered Ask thread (NB-1).
const IDS = {
  invoiceDraft: "01a17dbd-8e3e-7fa6-b4ae-07aae34f2d20",
  poDraft: "01a17dba-16f0-7603-85e1-37e1aee89a00",
  thread: "01a17d04-bbfc-79db-b4cf-5848094fa53b",
  // Beat 10's question, asked live with --ask on 27 Oct: abstained (missing_ref), shown as "Cannot verify".
  abstain: "01a17dea-11e9-71b9-a9bf-e3e2dd88815d",
};
const QUESTION = "Which ingredients are below their reorder level?";
// Beat 10: a question the books cannot back (the Cup film's, asked live here).
const UNKNOWABLE = "What will we sell on Diwali night?";

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

/** Next's dev badge is not the product: hidden on every shot. */
const clean = () => page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
const go = async (path, waitText) => {
  await page.goto(BASE + path, { waitUntil: "load" });
  await clean();
  if (waitText) await page.getByText(waitText, { exact: false }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
};

// In-page finder: the deepest element matching `sel` whose text contains `text` (or the first match without text),
// optionally lifted to its closest `up` ancestor; returns its box in page CSS px.
const box = (sel, { text = null, up = null, within = null, nth = 0, exact = false } = {}) =>
  page.evaluate(({ sel, text, up, within, nth, exact }) => {
    let scope = document;
    if (within) {
      const w = [...document.querySelectorAll(within.sel)].filter((e) => !within.text || e.textContent.includes(within.text));
      w.sort((a, b) => a.textContent.length - b.textContent.length);
      scope = w[0]?.closest(within.up || "*") ?? null;
      if (!scope) return null;
    }
    let els = [...scope.querySelectorAll(sel)].filter((e) => !text || (exact ? e.textContent.trim() === text : e.textContent.includes(text)));
    if (text) els = els.filter((e) => ![...e.querySelectorAll(sel)].some((c) => c.textContent.includes(text)));
    let el = els[nth];
    if (!el) return null;
    if (up) el = el.closest(up) ?? el;
    const r = el.getBoundingClientRect();
    return { x: +(r.left + scrollX).toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  }, { sel, text, up, within, nth, exact });
/** Every model tag on the page (the film covers each with a placeholder until N3), with what it said. */
const modelTags = () => page.evaluate(() => [...document.querySelectorAll(".model-tag")].map((e) => {
  const r = e.getBoundingClientRect();
  return { x: +(r.left + scrollX).toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), said: e.textContent.trim() };
}));
const need = (name, v) => {
  if (!v) throw new Error(`capture: "${name}" not found on the page`);
  return v;
};

/** One shot: the whole page, or a band of it ({y, h} in page px); `marks` in the shot's own px. */
async function shoot(name, marks, { band = null, viewport = false } = {}) {
  const full = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  let clip = null;
  let h = full.h;
  let oy = 0;
  if (viewport) {
    h = 800;
    oy = await page.evaluate(() => scrollY);
  } else if (band) {
    oy = Math.max(0, Math.round(band.y));
    h = Math.min(Math.round(band.h), full.h - oy);
    clip = { x: 0, y: oy, width: 1280, height: h };
  }
  const file = `${name}.png`;
  if (viewport) await page.screenshot({ path: join(OUT, file) });
  else await page.screenshot({ path: join(OUT, file), fullPage: true, ...(clip ? { clip } : {}) });
  const shift = (m) => (Array.isArray(m) ? m.map(shift) : m && typeof m === "object" && "x" in m ? { ...m, y: +(m.y - oy).toFixed(1), ...(m.cells ? { cells: m.cells.map(shift) } : {}) } : m);
  const rel = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, shift(v)]));
  manifest.shots[name] = { file, w: 1280, h, dpr: 2, url: page.url().replace(BASE, ""), takenAt: new Date().toISOString(), marks: rel };
  console.log(`${name}: ${h} px tall, ${Object.keys(marks).length} marks`);
}
const want = (name) => !only || only.includes(name);

// ---- sign in as Nandini through the demo picker (the session lives in this tab's sessionStorage)
await page.goto(`${BASE}/staff/sign-in`, { waitUntil: "load" });
await page.getByRole("button", { name: /Nandini/i }).first().click();
await page.waitForURL(/staff\/home/, { timeout: 30000 });
await page.waitForTimeout(2500);
const outlet = async (label) => {
  await page.locator("select").first().selectOption({ label });
  await page.waitForTimeout(2500);
};
await outlet("Cobnut Hazratganj");

// ---- beat 1: the owner home; beat 7 opens Request quotes on it
if (want("home") || want("home-rq")) {
  await go("/staff/home", "Most waste this week");
  const marks = {
    wasteValue: need("wasteValue", await box(".src-value", { text: "₹4,872.00" })),
    wasteChip: need("wasteChip", await box(".src-chip", { within: { sel: ".src-pair", text: "₹4,872.00" } })),
    wasteCard: need("wasteCard", await box("*", { text: "Most waste this week", up: "[class*=card]" })),
    lowCard: need("lowCard", await box("*", { text: "Low stock", up: "[class*=card]" })),
    requestQuotes: need("requestQuotes", await box("button", { text: "Request quotes" })),
    title: need("title", await box("h1")),
    models: await modelTags(),
  };
  if (want("home")) await shoot("home", marks);
  if (want("home-rq")) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.getByRole("button", { name: "Request quotes" }).first().click();
    await page.getByRole("button", { name: "Send request" }).first().waitFor();
    await page.waitForTimeout(800);
    await shoot("home-rq", {
      lowCard: need("lowCard", await box("*", { text: "Low stock", up: "[class*=card]" })),
      send: need("send", await box("button", { text: "Send request" })),
      models: await modelTags(),
    });
  }
}

// ---- beat 3: the inbox finding (the waste watcher)
if (want("inbox")) {
  await go("/staff/inbox", "More waste than a usual week");
  const card = need("card", await box("h2,h3,p,div", { text: "More waste than a usual week", up: "[class*=card]" }));
  const within = { sel: "h2,h3,p,div", text: "More waste than a usual week", up: "[class*=card]" };
  await shoot("inbox", {
    card,
    title: need("title", await box("h2,h3", { text: "More waste than a usual week" })),
    waste: need("waste", await box(".src-value", { text: "₹4,872.00", within })),
    usual: need("usual", await box(".src-value", { text: "₹1,512.00", within })),
    excess: await box(".src-value", { text: "₹3,360.00", within }),
    models: await modelTags(),
  }, { band: { y: card.y - 220, h: card.h + 440 } });
}

// ---- beat 2: Ask, the question typed (not sent), then the answered thread and its Source drawer
if (want("ask-empty") || want("ask-filled")) {
  await go("/staff/ask", "Your question");
  const marks = {
    box: need("box", await box("textarea")),
    ask: need("ask", await box("button", { text: "Ask" , nth: 0 })),
    panel: need("panel", await box("textarea", { up: "[class*=card]" })),
    models: await modelTags(),
  };
  if (want("ask-empty")) await shoot("ask-empty", marks, { viewport: true });
  if (want("ask-filled")) {
    await page.locator("textarea").first().fill(QUESTION);
    await page.waitForTimeout(500);
    await shoot("ask-filled", marks, { viewport: true });
    await page.locator("textarea").first().fill("");
  }
}
if (want("thread") || want("thread-drawer")) {
  await go(`/staff/ask/${IDS.thread}`, "Every number here comes from your books");
  const within = { sel: ".ai-text", text: "below its reorder level", up: "[class*=card]" };
  const marks = {
    asked: need("asked", await box("*", { text: "You asked", up: "[class*=bubble], [class*=card], div" })),
    answer: need("answer", await box(".ai-text", { text: "below its reorder level", up: "[class*=card]" })),
    onHand: need("onHand", await box(".src-value", { text: "0.143", within })),
    onHandChip: need("onHandChip", await box(".src-chip", { within: { sel: ".src-pair", text: "0.143" } })),
    minimum: need("minimum", await box(".src-value", { text: "1.322", within })),
    note: await box("p", { text: "Every number here comes from your books" }),
    models: await modelTags(),
  };
  if (want("thread")) await shoot("thread", marks, { viewport: true });
  if (want("thread-drawer")) {
    await page.locator(".src-pair", { hasText: "0.143" }).locator(".src-chip").first().click();
    await page.locator("dialog.drawer[open] tr[aria-current=true]").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    await shoot("thread-drawer", {
      drawer: need("drawer", await box("dialog.drawer[open]")),
      row: need("row", await box("dialog.drawer[open] tr[aria-current=true]")),
      cell: await box("dialog.drawer[open] td[aria-current=true]"),
      models: await modelTags(),
    }, { viewport: true });
    await page.keyboard.press("Escape");
  }
}

// ---- beat 5: the invoice, read into a draft on the suppliers screen (Hazratganj); beat 10: the draft that withholds
if (want("invoice")) {
  await go("/staff/suppliers", "Invoice from Lalbagh");
  const within = { sel: "h2,h3", text: "Invoice from Lalbagh", up: "[class*=card]" };
  const card = need("card", await box("h2,h3", { text: "Invoice from Lalbagh", up: "[class*=card]" }));
  const upload = need("upload", await box("*", { text: "Invoice photo or PDF", up: "[class*=card]" }));
  const reads = [];
  for (let i = 0; i < 5; i++) {
    const r = await box(".badge", { text: "Read on the page", within, nth: i });
    if (r) reads.push(r);
  }
  await shoot("invoice", {
    card, upload,
    lines: need("lines", await box("*", { text: "Price per kg", up: "[class*=card], [class*=rounded]", within })),
    qty: need("qty", await box(".src-value", { text: "4", within, exact: true })),
    price: need("price", await box(".src-value", { text: "1560.00", within })),
    tax: need("tax", await box(".src-value", { text: "312.00", within })),
    reads,
    simulated: await box("*", { text: "Simulated supplier", within, nth: 0 }),
    note: await box("p", { text: "is what Munim read from the photo" }),
    withhold: await box("p", { text: "don't trace to your books", within }),
    models: await modelTags(),
  }, { band: { y: upload.y - 140, h: card.y + card.h - upload.y + 200 } });
}
if (want("invoice-draft")) {
  await go(`/staff/inbox/${IDS.invoiceDraft}`, "A proposed change");
  await shoot("invoice-draft", {
    card: need("card", await box("h1,h2", { text: "A proposed change", up: "[class*=card]" })),
    withhold: need("withhold", await box("p", { text: "don't trace to your books" })),
    reads: await box(".badge", { text: "Read on the page" }),
    status: await box("*", { text: "Waiting for you", nth: 0 }),
    models: await modelTags(),
  }, { viewport: true });
}

// ---- beats 6, 8 and 9: the purchase order draft, proposed, as Nandini sees it (never approved here)
if (want("po")) {
  await go(`/staff/inbox/${IDS.poDraft}`, "A purchase order");
  const val = (text) => box(".src-value", { text });
  await shoot("po", {
    card: need("card", await box("h1,h2", { text: "A purchase order", up: "[class*=card]" })),
    title: need("title", await box("h1,h2", { text: "A purchase order" })),
    status: await box("*", { text: "Waiting for you", nth: 0 }),
    supplier: need("supplier", await box("*", { text: "Steady Wholesale (simulated)", nth: 0 })),
    qty: need("qty", await val("0.852")),
    price: need("price", await val("₹1,465.20")),
    lastPaid: need("lastPaid", await box("*", { text: "Supplier prices over time", up: "li, p, div" })),
    lastPaidValue: need("lastPaidValue", await val("₹1,480.00")),
    saving: need("saving", await box("*", { text: "₹12.61", up: "li, p, div" })),
    savingValue: need("savingValue", await val("₹12.61")),
    recorded: need("recorded", await box("p", { text: "Recorded only" })),
    approve: need("approve", await box("button", { text: "Approve as" })),
    happened: await box("h2,h3", { text: "What happened" }),
    models: await modelTags(),
  });
}

// ---- beat 7: the quotes, on the suppliers screen at Gomti Nagar (the order's outlet)
if (want("quotes")) {
  await outlet("Cobnut Gomti Nagar");
  await go("/staff/suppliers", "Quotes from simulated suppliers");
  const rows = await page.evaluate(() => [...document.querySelectorAll("table.snap-table tbody tr")].map((tr) => {
    const r = tr.getBoundingClientRect();
    const cells = [...tr.children].map((td) => {
      const c = td.getBoundingClientRect();
      return { text: td.textContent.trim(), x: +(c.left + scrollX).toFixed(1), y: +(c.top + scrollY).toFixed(1), w: +c.width.toFixed(1), h: +c.height.toFixed(1) };
    });
    return { x: +(r.left + scrollX).toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), proposed: tr.getAttribute("aria-current") === "true", cells };
  }));
  const table = need("table", await box("table.snap-table"));
  const card = need("card", await box("table.snap-table", { up: "[class*=card]" }));
  const low = need("low", await box("*", { text: "Running low" }));
  const within = { sel: "table.snap-table", up: "[class*=card]" };
  await shoot("quotes", {
    low, card, table, rows,
    title: need("title", await box("h2,h3", { text: "Order from" })),
    status: await box("*", { text: "Waiting for you", within, nth: 0 }),
    simulated: await box("*", { text: "Simulated supplier", within, nth: 0 }),
    saving: need("saving", await box("*", { text: "Saving against the last price paid", up: "div" })),
    savingValue: need("savingValue", await box(".src-value", { text: "₹12.61", within })),
    savingChip: await box(".src-chip", { within: { sel: ".src-pair", text: "₹12.61" } }),
    lastPaidValue: need("lastPaidValue", await box(".src-value", { text: "₹1,480.00", within })),
    recorded: need("recorded", await box("p", { text: "Recorded only", within })),
    approve: need("approve", await box("button", { text: "Approve as", within })),
    // NB-7's market line (a recorded, labelled search until the Tavily key exists); optional while that lane builds it.
    market: await box("*", { text: "Market price", up: "p, li, div", within }),
    marketValue: await box(".src-value", { text: "/ kg", within }),
    marketCheck: await box("button", { text: "Check market price", within }),
    caption: await box("caption"),
    note: await box("p", { text: "recorded during a simulated negotiation" }),
    models: await modelTags(),
  }, { band: { y: low.y - 120, h: card.y + card.h - low.y + 240 } });
  await outlet("Cobnut Hazratganj");
}

// ---- beat 10: "Cannot verify", on a question asked live once (--ask), re-shot from its thread after that
if (want("abstain")) {
  let url = `/staff/ask/${IDS.abstain}`;
  if (args.ask) {
    await go("/staff/ask", "Your question");
    await page.locator("textarea").first().fill(UNKNOWABLE);
    await page.getByRole("button", { name: "Ask", exact: true }).first().click();
    await page.getByText("is reading your books", { exact: false }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    await shoot("abstain-pending", { pending: await box("p", { text: "is reading your books", up: "[class*=card]" }), models: await modelTags() }, { viewport: true });
    await page.waitForURL(/\/staff\/ask\/[0-9a-f-]{36}/, { timeout: 180000, waitUntil: "commit" });
    await page.locator(".ai-text, .cv-chip").first().waitFor({ timeout: 180000 });
    url = page.url().replace(BASE, "");
  }
  await go(url, UNKNOWABLE);
  await page.locator(".ai-text, .cv-chip").first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(1500);
  await shoot("abstain", {
    asked: await box("*", { text: "You asked", up: "div" }),
    answer: need("answer", await box(".cv-chip, .ai-text", { up: "[class*=card]" })),
    cv: await box(".cv-chip"),
    models: await modelTags(),
  }, { viewport: true });
}

await browser.close();

// ---- beat 5's photo: the synthetic invoice the draft was read from (NB-6 rendered it; the local blob store keeps it by
// its sha256, so the hash is checked before it is copied).
const PHOTO = "143e6397a63ddf537bc7c46514c961e73c8b9aff71a5dea5ef65bff132a69aeb"; // LNS-2026-0421, 4 kg at 1560.00, tax 312.00
const tenant = "6baabaae-ad3e-71cf-a761-1992f362d764";
const blob = join(REPO, ".run/local/blobs", tenant, PHOTO);
if (createHash("sha256").update(readFileSync(blob)).digest("hex") !== PHOTO) throw new Error("capture: the invoice blob does not match its hash");
copyFileSync(blob, join(OUT, "invoice-photo.png"));
manifest.photo = { file: "invoice-photo.png", w: 900, h: 560, sha256: PHOTO, draft: IDS.invoiceDraft };

writeFileSync(manifestFile, `// GENERATED by tools/capture-nebius.mjs from the running local stack: the Nebius cut's screens and their marks.\nglobalThis.NB_SHOTS = ${JSON.stringify(manifest, null, 1)};\n`);
console.log(`wrote ${manifestFile}`);
