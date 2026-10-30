// file: scripts/map-shots.ts
// T-131: every state of the supplier map (R68) in a browser, at 1280 and 390 px wide, with
// a check per state and a screenshot of each into --out. Against this app on the mock, started with a graph served:
//   MUNIM_GRAPH=<a graph backend's mode> NEXT_PUBLIC_MUNIM_MOCK_CONTROLS=1 next build, then
//   MUNIM_GRAPH=<the same> MUNIM_MOCK=1 MUNIM_MOCK_GRAPH=on next start -p <port>
//   [MUNIM_GRAPH=<the build's>] tsx scripts/map-shots.ts --base=http://127.0.0.1:<port> --out=<dir>
// MUNIM_GRAPH must be the build's (lib/server/graph-flag.ts). Without a graph backend it checks the other side instead: no
// "Supplier map" link on Suppliers or a supplier's page, and the map's address not found (the staff not-found page).
// Loading, numbers loading, error and the refused request are made by holding or failing single calls in the browser
// (page.route); the graph not answering and "no supplier on record" by the mock's own switch (X-Mock-Force-Graph); offline by
// the browser's offline mode. Exit 1 on any failed check.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { graphServed } from "../lib/server/graph-flag";

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
for (const a of process.argv.slice(2)) if (!/^--(base|out)=.+$/.test(a)) throw new Error(`map-shots: unknown argument ${a} (use --base=<url> --out=<dir>)`);
const base = arg("base");
const out = arg("out");
const graph = graphServed(process.env);
if (!base || !out) throw new Error("map-shots: --base=<url> and --out=<dir> are required");
let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};

const MAP = `${base}/staff/suppliers/map`;
const SIM = "Simulated supplier";
const ASK_BUTTER = "What does a price rise of Butter (synthetic) touch?";
const DOWN = "The supplier map needs the graph database, which isn't answering right now. Your books are fine; try again in a minute.";

async function signIn(page: Page, who: string) {
  await page.goto(`${base}/staff/sign-in`);
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/sign-in"), { timeout: 30_000 });
}
const controls = (page: Page, c: Record<string, string> | null) =>
  page.evaluate((v) => (v ? sessionStorage.setItem("munim.mock.controls", JSON.stringify(v)) : sessionStorage.removeItem("munim.mock.controls")), c);
/** The whole page; a drawer state only what is on screen (a modal dialog covers the viewport, not the page below it). */
const shot = (page: Page, state: string, width: number, fullPage = true) => page.screenshot({ path: join(out!, `${state}-${width}.png`), fullPage });
const visible = (page: Page, text: string | RegExp) => page.getByText(text).first().waitFor({ timeout: 20_000 }).then(() => true, () => false);

async function states(page: Page, width: number) {
  await signIn(page, "Nandini Mehrotra");

  // loading: the graph's first read never answers.
  await page.route("**/mock/v1/graph/sole-sources", () => undefined);
  await page.goto(MAP);
  check(`${width} loading: skeletons`, await page.locator("[aria-label='Loading']").first().waitFor({ timeout: 20_000 }).then(() => true, () => false));
  await shot(page, "loading", width);
  await page.unroute("**/mock/v1/graph/sole-sources");

  // numbers loading: the price snapshot is being minted.
  await page.route("**/mock/v1/snapshots", (r) => (r.request().method() === "POST" ? undefined : r.continue()));
  await page.goto(MAP);
  check(`${width} numbers loading: cards with cell skeletons`, await visible(page, "Riverbank Dairy (simulated)") && (await page.locator("article [aria-label='Loading']").count()) > 0);
  await shot(page, "numbers-loading", width);
  await page.unroute("**/mock/v1/snapshots");

  // ready: the strip, the cards, a price cell with its chip; every supplier name with its badge.
  await page.goto(MAP);
  check(`${width} ready: the only-one-source strip`, await visible(page, /— only from/));
  await page.getByRole("button", { name: /^Source of / }).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  // Every supplier name ends "(simulated)" in the mock's books: count those text nodes, and the badges, on the page.
  const names = await page.evaluate(() => {
    const w = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
    let n = 0;
    while (w.nextNode()) if (/\(simulated\)\s*$/.test(w.currentNode.textContent ?? "")) n++;
    return n;
  });
  const badges = await page.locator("main").getByText(SIM, { exact: true }).count();
  check(`${width} ready: a badge beside every supplier name`, names > 0 && badges === names, `${names} names, ${badges} badges`);
  check(`${width} ready: price cells with chips`, (await page.getByRole("button", { name: /^Source of / }).count()) >= 2);
  await shot(page, "ready", width);

  // the drawer: what a butter price rise touches (a margin with its chip, "Cannot verify", "No sales here", a paused dish).
  await page.getByRole("button", { name: /Butter \(synthetic\)/ }).first().click();
  const drawer = page.locator("dialog[open]");
  check(`${width} drawer: dishes`, await drawer.getByText("Hazelnut Croissant").waitFor({ timeout: 20_000 }).then(() => true, () => false));
  await drawer.getByText("No sales here in the last four weeks").waitFor({ timeout: 20_000 }).catch(() => undefined);
  check(`${width} cannot verify: a margin about another recipe version`, (await drawer.getByText("Cannot verify").count()) > 0);
  check(`${width} drawer: no sales here`, (await drawer.getByText("No sales here in the last four weeks").count()) > 0);
  check(`${width} drawer: a paused dish`, (await drawer.getByText(/^Paused at /).count()) > 0);
  await shot(page, "drawer-cannot-verify", width, false);

  // RFQ sent: the simulated suppliers quoted and a draft waits (the mock is told to answer "drafted").
  await controls(page, { negotiation: "drafted" });
  await drawer.getByRole("button", { name: "Ask other simulated suppliers to quote" }).click();
  check(`${width} RFQ sent: the toast`, await drawer.getByText("Asked the simulated suppliers. Any purchase order comes back to your inbox as a draft to approve.").waitFor({ timeout: 30_000 }).then(() => true, () => false));
  await shot(page, "rfq-sent", width, false);
  await controls(page, null);

  // RFQ refused: core refuses the request.
  await page.route("**/mock/v1/rfq-requests", (r) => r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "forbidden", message: "x", reason_code: "authority_denied" } }) }));
  await drawer.getByRole("button", { name: "Ask other simulated suppliers to quote" }).click();
  check(`${width} RFQ refused: the error note`, await drawer.getByRole("alert").first().waitFor({ timeout: 20_000 }).then(() => true, () => false));
  await shot(page, "rfq-refused", width, false);
  await page.unroute("**/mock/v1/rfq-requests");
  await page.keyboard.press("Escape");

  // offline: the browser loses its connection.
  await page.context().setOffline(true);
  check(`${width} offline: the banner`, await visible(page, "You're offline. Showing the last update."));
  await shot(page, "offline", width);
  await page.context().setOffline(false);

  // error: a read fails on core's side.
  await page.route("**/mock/v1/graph/sole-sources", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "internal", message: "x", reason_code: null } }) }));
  await page.goto(MAP);
  check(`${width} error: words and Try again`, await visible(page, "Something went wrong on our side. Try again.") && await page.getByRole("button", { name: "Try again" }).isVisible());
  await shot(page, "error", width);
  await page.unroute("**/mock/v1/graph/sole-sources");

  // graph offline: 503 graph_unavailable.
  await controls(page, { graph: "down" });
  await page.goto(MAP);
  check(`${width} graph offline: its own words`, await visible(page, DOWN));
  await shot(page, "graph-offline", width);

  // empty: no supplier on record.
  await controls(page, { graph: "empty" });
  await page.goto(MAP);
  check(`${width} empty`, await visible(page, "No supplier is on record yet. Add one on Suppliers."));
  await shot(page, "empty", width);
  await controls(page, null);

  // the links: Suppliers header and a supplier's page.
  await page.goto(`${base}/staff/suppliers`);
  check(`${width} Suppliers links to the map`, await page.getByRole("link", { name: "Supplier map" }).waitFor({ timeout: 20_000 }).then(() => true, () => false));
  await shot(page, "suppliers-link", width);

  // The drawer's "Ask Munim what this touches" opens Ask with the question the recorded butter answer is keyed on (typed
  // again here; services/intel/tests/graph/test_butter_question_e2e.py types it too). Only offered, never sent.
  await page.goto(MAP);
  await page.getByRole("button", { name: /Butter \(synthetic\)/ }).first().click();
  await page.locator("dialog[open]").getByRole("link", { name: "Ask Munim what this touches" }).click({ timeout: 20_000 });
  await page.waitForURL(/\/staff\/ask\?q=/);
  const box = page.locator("textarea").first();
  await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const asked = await box.inputValue().catch(() => "");
  check(`${width} the drawer opens Ask with the butter question`, asked === ASK_BUTTER, asked);
  await shot(page, "ask-prefilled", width);

  // role not allowed: counter staff.
  await page.evaluate(() => sessionStorage.clear());
  await signIn(page, "Imran Siddiqui");
  await page.goto(MAP);
  check(`${width} role not allowed`, await visible(page, "Suppliers are for the owner and managers."));
  await shot(page, "role-not-allowed", width);
}

/** Without a graph: the Suppliers page and a supplier's page show no link to the map, and the map's address is not found. */
async function notServed(page: Page, width: number) {
  await signIn(page, "Nandini Mehrotra");
  await page.goto(`${base}/staff/suppliers`);
  const shown = await page.locator("a[href^='/staff/suppliers/0']").first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
  const suppliers = await page.locator("a[href^='/staff/suppliers/0']").count();
  check(`${width} no graph: Suppliers lists its suppliers and no map link`, shown && suppliers > 0 && (await page.getByRole("link", { name: "Supplier map" }).count()) === 0, `${suppliers} supplier link(s)`);
  await shot(page, "no-graph-suppliers", width);
  await page.locator("a[href^='/staff/suppliers/0']").first().click();
  await page.waitForURL(/\/staff\/suppliers\/[0-9a-f-]{36}$/);
  const named = await page.getByRole("heading", { name: "Price list" }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
  check(`${width} no graph: a supplier's page without "What depends on this supplier"`, named && (await page.getByRole("link", { name: "What depends on this supplier" }).count()) === 0);
  // The staff not-found page; its HTTP status is 200 (measured: the staff layout's Suspense streams before the page's notFound()).
  await page.goto(MAP);
  check(`${width} no graph: the map's address is not found`, await visible(page, "Not found.") && (await page.getByText("Who your menu depends on").count()) === 0);
  await shot(page, "no-graph-map-not-found", width);
}

async function main() {
  mkdirSync(out!, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromium.executablePath(), args: ["--headless=new"] });
  try {
    for (const width of [1280, 390]) {
      // Reduced motion: the drawer's slide-in is off (globals.css), so no screenshot catches it half-way.
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, reducedMotion: "reduce" });
      if (graph) await states(await context.newPage(), width);
      else await notServed(await context.newPage(), width);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(failed || passed === 0 ? `map-shots: FAIL (${failed} failed, ${passed} passed)` : `map-shots: ok (${passed} checks)`);
  process.exit(failed || passed === 0 ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
