// file: tests/ev-p3-shots.ts
// EV-P3: every named state of "which agent, which model" and the Cobnut owner surfaces, in a browser, with a check per
// state and a screenshot of each into --out. Not a vitest file: run it with tsx against two local web servers:
//   --live=<the web live against a LOCAL core-api, NEXT_PUBLIC_MUNIM_API=/api>   owner home, Ask (pending, the live answer),
//          the inbox, a draft, approve, reject, and AI off (the ask call answered 503 in the browser, CLAUDE.md rule 11)
//   --mock=<the web on its own mock, MUNIM_MOCK=1>                                an Ask answer with citation chips; home,
//          inbox and suppliers with the model tags the mock's traces name (only the two purchase orders' negotiations
//          made a model call for their item) and none past a card's edge at 390 px; a draft approved but not applied;
//          a manager's home (what she may decide, and what waits for the owner). The mock keeps its books per server
//          process and the failed state decides one of its two kitchen drafts: restart the mock after two runs.
//   tsx tests/ev-p3-shots.ts --live=http://127.0.0.1:3000 --mock=http://127.0.0.1:3005 --out=<dir>
//   tsx tests/ev-p3-shots.ts --mock=http://127.0.0.1:3005 --out=<dir>     the mock states only (decides nothing live)
// With --live it approves one and rejects one proposed recipe-version draft on the live server, as the demo owner: local
// only (it refuses any host but 127.0.0.1 / localhost). Console errors are collected per state; the only browser lines
// allowed are the network failures a state makes on purpose (the 503, the 422). Exit 1 on any failed check.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { DEMO_PEOPLE, DEMO_TENANT_ID } from "../lib/munim/session";

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
for (const a of process.argv.slice(2)) if (!/^--(live|mock|out)=.+$/.test(a)) throw new Error(`ev-p3-shots: unknown argument ${a}`);
const live = arg("live"), mock = arg("mock"), out = arg("out");
if (!mock || !out) throw new Error("ev-p3-shots: --mock=<url> --out=<dir> are required (--live=<url> adds the live states)");
for (const u of [live, mock]) if (u !== undefined && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(u)) throw new Error(`ev-p3-shots: ${u} is not a local server`);
mkdirSync(out, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OWNER = "Nandini Mehrotra";
/** A manager of one outlet: core opens a sweep's trace only to someone with every outlet. */
const MANAGER = "Farah Qureshi";
let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};
const visible = (page: Page, text: string | RegExp, ms = 30_000) => page.getByText(text).first().waitFor({ timeout: ms }).then(() => true, () => false);

/** A page that records its console errors and failed responses; `allow` lists responses a state makes on purpose. */
async function open(browser: Browser, width: number) {
  // Reduced motion: the drawer's slide-in is off (globals.css), so no screenshot catches it half-way.
  const page = await (await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: "reduce" })).newPage();
  const errors: string[] = [];
  const allow: RegExp[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(`pageerror ${String(e).slice(0, 160)}`));
  page.on("response", (r) => { if (r.status() >= 400 && !allow.some((a) => a.test(`${r.status()} ${r.url()}`))) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  // The Next.js dev indicator is dev tooling, not the product: hidden from the screenshots.
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none!important}";
    document.head.append(s);
  }));
  return { page, errors, allow };
}
async function signIn(page: Page, base: string, who = OWNER) {
  await page.goto(`${base}/staff/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: `Sign in as ${who}` }).waitFor();
  // The sign-in button works once the page has hydrated; retry the click until the address changes.
  for (let i = 0; i < 10 && page.url().endsWith("/sign-in"); i++) {
    await page.getByRole("button", { name: `Sign in as ${who}` }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/sign-in"), { timeout: 3_000, waitUntil: "domcontentloaded" }).catch(() => undefined);
  }
}
/** The whole page, from the top: a full-page shot draws the sticky staff bar where the page was scrolled to. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out!, `${name}.png`), fullPage: true });
}
function clean(state: string, errors: string[]) {
  check(`${state}: no console errors`, errors.length === 0, errors.join(" | "));
  errors.length = 0;
}

/** Two proposed recipe-version drafts on the live server (the API through the web's own /api), as the demo owner. */
async function recipeDrafts(): Promise<string[]> {
  const s = (await (await fetch(`${live}/staff/demo-session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ person: "owner" }) })).json()) as { token: string; tenant_id: string };
  const r = await fetch(`${live}/api/v1/drafts?status=proposed`, { headers: { Authorization: `Bearer ${s.token}`, "X-Munim-Tenant": s.tenant_id } });
  const body = (await r.json()) as { items: { draft: { draft_id: string; command_type: string } }[] };
  return body.items.filter((i) => i.draft.command_type === "catalogue.recipe.version.create.v1").map((i) => i.draft.draft_id).slice(0, 2);
}

async function liveStates(browser: Browser, width: number) {
  const { page, errors, allow } = await open(browser, width);
  await signIn(page, live!);

  // Owner home: figures with chips, proposals, findings by severity, each with its agent.
  await page.goto(`${live}/staff/home`, { waitUntil: "domcontentloaded" });
  check(`${width} home: what needs you`, await visible(page, "What needs you"));
  check(`${width} home: a figure with its chip`, await page.getByRole("button", { name: /^Source of / }).first().waitFor({ timeout: 30_000 }).then(() => true, () => false));
  check(`${width} home: an agent line`, await page.locator(".run-by-agent").first().waitFor({ timeout: 30_000 }).then(() => true, () => false));
  await page.waitForTimeout(1500);
  await shot(page, `home-${width}`);
  clean(`${width} home`, errors);

  // Ask, pending: the ask call is held in the browser for a few seconds, then let through to core.
  await page.goto(`${live}/staff/ask`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox").waitFor();
  await page.waitForTimeout(1500);
  await page.route("**/api/v1/ask", async (r) => { await new Promise((ok) => setTimeout(ok, 6_000)); await r.continue(); });
  await page.getByRole("textbox").fill("How did net sales go this week?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  check(`${width} ask pending: who is reading`, await visible(page, "The Manager is reading your books…", 10_000));
  await shot(page, `ask-pending-${width}`);
  // The live answer: an abstention ("Cannot verify") while intel serves recorded fixtures it lacks, or a cited answer.
  await page.waitForURL(/\/staff\/ask\/[0-9a-f-]{36}$/, { timeout: 120_000, waitUntil: "domcontentloaded" });
  await page.unroute("**/api/v1/ask");
  const answered = await page.locator(".run-by-agent").first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
  const abstained = await page.getByText("Cannot verify").first().isVisible().catch(() => false);
  check(`${width} ask answer: the agent line`, answered);
  await page.waitForTimeout(1000);
  await shot(page, abstained ? `ask-abstained-live-${width}` : `ask-answer-live-${width}`);
  console.log(`     (${width} live answer: ${abstained ? "abstained, Cannot verify" : "answered"})`);
  clean(`${width} ask answer`, errors);

  // AI off: core answers 503 (intel unavailable). The box hides and past answers stay; never an error state.
  allow.push(/^503 .*\/api\/v1\/ask$/);
  await page.route("**/api/v1/ask", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "x", reason_code: null } }) }));
  await page.getByRole("textbox").fill("And last week?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  check(`${width} AI off: the template line, not an error`, await visible(page, "Munim can't answer right now. Past answers are still here.", 15_000));
  // Next's route announcer is a role="alert" outside <main>; an error note would be inside it.
  check(`${width} AI off: no error note`, (await page.locator("main").getByRole("alert").count()) === 0);
  await shot(page, `ask-ai-off-${width}`);
  await page.unroute("**/api/v1/ask");
  allow.pop();
  clean(`${width} AI off`, errors);

  if (width < 600) return page.close();

  // Inbox: findings and proposals, each with its agent (and its model when the run's trace names one).
  await page.goto(`${live}/staff/inbox`, { waitUntil: "domcontentloaded" });
  check(`${width} inbox: findings with agents`, await page.locator("article .run-by-agent").first().waitFor({ timeout: 30_000 }).then(() => true, () => false));
  await page.waitForTimeout(2500);
  const models = await page.locator(".model-tag").count();
  console.log(`     (inbox: ${await page.locator(".run-by-agent").count()} agent lines, ${models} model tags)`);
  await shot(page, `inbox-${width}`);
  clean(`${width} inbox`, errors);

  // A draft, then approve; another, then reject. Both are proposed recipe versions on the local books.
  const [toApprove, toReject] = await recipeDrafts();
  check(`${width} two proposed recipe-version drafts to decide`, !!toApprove && !!toReject);
  if (!toApprove || !toReject) return page.close();
  await page.goto(`${live}/staff/inbox/${toApprove}`, { waitUntil: "domcontentloaded" });
  check(`${width} draft: the approve button names the person`, await page.getByRole("button", { name: `Approve as ${OWNER}` }).waitFor({ timeout: 30_000 }).then(() => true, () => false));
  await page.waitForTimeout(1500);
  await shot(page, `draft-detail-${width}`);
  await page.getByRole("button", { name: `Approve as ${OWNER}` }).click();
  check(`${width} after approve: who decided, what it did`, await visible(page, new RegExp(`^Approved by ${OWNER}`)) && await visible(page, "Applied. The change is in the books under their approval."));
  await page.waitForTimeout(1000);
  await shot(page, `after-approve-${width}`);
  clean(`${width} approve`, errors);

  await page.goto(`${live}/staff/inbox/${toReject}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Reject", exact: true }).click({ timeout: 30_000 });
  await page.getByLabel("Why reject it?").selectOption("not_needed");
  await page.getByLabel("What's wrong?").fill("The current recipe is fine for now.");
  await page.getByRole("button", { name: `Reject as ${OWNER}` }).click();
  check(`${width} after reject: who decided, nothing changed`, await visible(page, new RegExp(`^Rejected by ${OWNER}`)) && await visible(page, "Nothing in the books changed."));
  await page.waitForTimeout(1000);
  await shot(page, `after-reject-${width}`);
  clean(`${width} reject`, errors);
  await page.close();
}

/** A manager's home and inbox: agents shown, no trace read that core would refuse (no 404 in the console). */
async function managerStates(browser: Browser) {
  const { page, errors } = await open(browser, 1440);
  await signIn(page, live!, MANAGER);
  for (const [path, name] of [["/staff/home", "manager-home"], ["/staff/inbox", "manager-inbox"]] as const) {
    await page.goto(`${live}${path}`, { waitUntil: "domcontentloaded" });
    check(`manager ${name}: agent lines`, await page.locator(".run-by-agent").first().waitFor({ timeout: 30_000 }).then(() => true, () => false));
    await page.waitForTimeout(2500);
    await shot(page, `${name}-1440`);
    clean(`manager ${name}`, errors);
  }
  await page.close();
}

/** Model tags whose right edge passes their card's content edge (or the window's): their words, or [] when none does. */
const pastTheEdge = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".model-tag")].flatMap((t) => {
  const r = t.getBoundingClientRect();
  const card = t.closest(".card");
  const edge = card ? card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight) : window.innerWidth;
  return r.right > Math.min(edge, window.innerWidth) + 0.5 || document.documentElement.scrollWidth > window.innerWidth ? [t.textContent ?? ""] : [];
}));
const PO_TITLE = "A purchase order";
/** A kitchen draft still proposed on the mock (the owner approves it with nothing to type), through the mock's own API. */
async function kitchenDraft(): Promise<string | null> {
  const owner = DEMO_PEOPLE.find((p) => p.key === "owner")!.token;
  const r = await fetch(`${mock}/mock/v1/inbox`, { headers: { Authorization: `Bearer ${owner}`, "X-Munim-Tenant": DEMO_TENANT_ID } });
  const body = (await r.json()) as { items: { kind: string; draft?: { draft_id: string; command_type: string } }[] };
  return body.items.find((i) => i.draft?.command_type.startsWith("kitchen."))?.draft?.draft_id ?? null;
}

async function mockStates(browser: Browser, width: number) {
  const { page, errors, allow } = await open(browser, width);
  await signIn(page, mock!);
  // An answer whose every number is a snapshot cell with its chip, and the agent that gave it.
  await page.goto(`${mock}/staff/ask`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox").waitFor();
  await page.waitForTimeout(1500);
  await page.getByRole("textbox").fill("How did the cake tickets go this week?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.waitForURL(/\/staff\/ask\/[0-9a-f-]{36}$/, { timeout: 60_000, waitUntil: "domcontentloaded" });
  check(`${width} mock ask answer: the agent`, await visible(page, "Kitchen · via Manager"));
  check(`${width} mock ask answer: citation chips`, (await page.getByRole("button", { name: /^Source of / }).count()) >= 3);
  check(`${width} mock ask answer: every number traces`, await visible(page, "Every number here comes from your books: tap Source to open its rows."));
  await page.waitForTimeout(1000);
  await shot(page, `ask-answer-${width}`);
  // A source chip opens the rows behind the number.
  await page.getByRole("button", { name: /^Source of / }).first().click();
  check(`${width} mock: the chip opens the rows`, await visible(page, "Where this number comes from"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out!, `ask-source-drawer-${width}.png`) });
  clean(`${width} mock ask`, errors);

  // Home: what needs the owner, each with its agent; every run an item names has a trace (no 404 in the console).
  await page.goto(`${mock}/staff/home`, { waitUntil: "domcontentloaded" });
  check(`${width} mock home: to approve or reject`, await visible(page, "To approve or reject"));
  check(`${width} mock home: an agent line`, await page.locator(".run-by-agent").first().waitFor({ timeout: 30_000 }).then(() => true, () => false));
  await page.waitForTimeout(2500);
  check(`${width} mock home: no model tag past its card`, (await pastTheEdge(page)).length === 0, (await pastTheEdge(page)).join(" | "));
  await shot(page, `mock-home-${width}`);
  clean(`${width} mock home`, errors);

  // Inbox: the two purchase orders name the models their negotiations used (two each, from the mock's traces); no finding
  // and no sweep draft borrows the kitchen watcher's model from the same sweep.
  await page.goto(`${mock}/staff/inbox`, { waitUntil: "domcontentloaded" });
  await page.locator(".model-tag").first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  const tagged = await page.locator("article").filter({ has: page.locator(".model-tag") }).locator("h3").allTextContents();
  check(`${width} mock inbox: model tags on the two purchase orders, two each`, (await page.locator(".model-tag").count()) === 4 && tagged.length === 2 && tagged.every((t) => t === PO_TITLE), `${await page.locator(".model-tag").count()} tags on ${tagged.join(", ")}`);
  check(`${width} mock inbox: no finding shows a model`, (await page.locator('article[id^="finding-"] .model-tag').count()) === 0);
  check(`${width} mock inbox: no model tag past its card`, (await pastTheEdge(page)).length === 0, (await pastTheEdge(page)).join(" | "));
  await shot(page, `mock-inbox-${width}`);
  clean(`${width} mock inbox`, errors);

  // Suppliers: the purchase-order proposal cards, each with its agent and its negotiation's models.
  await page.goto(`${mock}/staff/suppliers`, { waitUntil: "domcontentloaded" });
  const cards = page.locator('article[aria-label="Proposed purchase order"]');
  await cards.locator(".model-tag").first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  check(`${width} mock suppliers: proposal cards name their models`, (await cards.count()) >= 1 && (await cards.locator(".model-tag").count()) === 2 * (await cards.count()), `${await cards.count()} cards, ${await cards.locator(".model-tag").count()} tags`);
  check(`${width} mock suppliers: no model tag past its card`, (await pastTheEdge(page)).length === 0, (await pastTheEdge(page)).join(" | "));
  await shot(page, `mock-suppliers-${width}`);
  clean(`${width} mock suppliers`, errors);

  if (width < 600) return page.close();

  // Approved but not applied (core's 422 execution_failed, forced on the mock): the panel says so without the approved look.
  const prep = await kitchenDraft();
  check(`${width} mock failed: a proposed kitchen draft to approve`, prep !== null, prep ? "" : "none left on this mock server: restart it");
  if (!prep) return page.close();
  allow.push(/^422 .*\/drafts\/[^/]+:approve$/);
  await page.route("**/mock/v1/drafts/*:approve", (r) => r.continue({ headers: { ...r.request().headers(), "x-mock-force-decision": "execution_failed" } }));
  await page.goto(`${mock}/staff/inbox/${prep}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: `Approve as ${OWNER}` }).click({ timeout: 30_000 });
  const panel = page.locator(".decided");
  check(`${width} mock failed: who approved, nothing changed`, await visible(page, "It was approved but could not be applied. Nothing changed.") && await visible(page, new RegExp(`^Approved by ${OWNER}`)));
  const look = await panel.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, check: el.querySelector('path[d="m5 12.5 4.2 4L19 7"]') !== null, alert: el.querySelector('path[d="M12 3.5 2.8 19.5h18.4z"]') !== null })).catch(() => null);
  check(`${width} mock failed: not green, no check mark, the alert mark`, look !== null && look.bg === "rgb(251, 217, 211)" && !look.check && look.alert, JSON.stringify(look));
  await page.waitForTimeout(800);
  await shot(page, `mock-after-failed-${width}`);
  await page.unroute("**/mock/v1/drafts/*:approve");
  allow.pop();
  clean(`${width} mock failed`, errors);
  await page.close();

  // A manager of one outlet: the pooled order covers an outlet beyond hers, so it waits for the owner, not for her.
  const m = await open(browser, width);
  await signIn(m.page, mock!, MANAGER);
  await m.page.goto(`${mock}/staff/home`, { waitUntil: "domcontentloaded" });
  check(`${width} mock manager home: the pooled order waits for the owner`, await visible(m.page, "For the owner to decide"));
  check(`${width} mock manager home: nothing for her to approve or reject`, (await m.page.getByText("To approve or reject").count()) === 0);
  await m.page.waitForTimeout(1500);
  await shot(m.page, `mock-manager-home-${width}`);
  clean(`${width} mock manager home`, m.errors);
  await m.page.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    if (live) {
      for (const w of [1440, 390]) await liveStates(browser, w);
      await managerStates(browser);
    }
    for (const w of [1440, 390]) await mockStates(browser, w);
  } finally {
    await browser.close();
  }
  console.log(failed || passed === 0 ? `ev-p3-shots: FAIL (${failed} failed, ${passed} passed)` : `ev-p3-shots: ok (${passed} checks)`);
  process.exit(failed || passed === 0 ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
