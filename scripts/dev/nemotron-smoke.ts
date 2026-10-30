// Live Nemotron smoke on a locally seeded world (events build, P1). Local only: refuses unless core-api says `idp: "local"`, intel
// says `model_mode: "live"` and the database is the local one (.run/local/local-db.json on 127.0.0.1). Signs in as the world's
// owner with its demo tokens (.run/local/<world>/demo-tokens.json; re-mint: scripts/dev/restart-svc.sh tokens <world>), never
// printing one. Then, through the public API:
//   1. one Ask: the answer is not an abstention and its numbers resolve (resolved_refs non-empty);
//   2. one margin_fall investigation step, narrated. `--ask` or `--investigation` alone runs only that one; neither runs both.
//   3. `--rfq` only (events build, P2): a request for quotes on `--ingredient` at `--outlet` — the negotiation with the simulated
//      suppliers runs live (extract + reason) and its purchase-order draft's every number must be a resolved ref. The draft is
//      left proposed for a person, unless `--approve` is given: then this script approves it as proposed WITH THE DEMO OWNER'S
//      TOKEN (a decision the script makes, not a person — only for a local synthetic demo; R16). `--outlet=*` (the default)
//      asks for every outlet in the owner's scope: core re-judges a draft's cells under the approver's scope, and a
//      single-outlet RFQ's draft went stale at the owner's approval (A.report.md, P2). Local database only.
// For each run it reads back (local database, read only) the run's spend rows and (API) its trace, and fails unless every spend
// row names `--provider` and a Nemotron model id, and every model call's route trace was served `live` — a recorded fallback
// (fixtures served after a failed live call) or an abstained call fails the smoke, as does a narration that kept the template.
//   node scripts/dev/nemotron-smoke.ts [--world=cobnut] [--question=...] [--ask | --investigation | --rfq [--approve]]
//                                      [--provider=nvidia] [--ingredient="Roasted hazelnuts (synthetic)"] [--outlet=*|<name>]
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const RUN = resolve(import.meta.dirname, "../../.run");
const CORE = "http://127.0.0.1:8787";
const INTEL = "http://127.0.0.1:8081";

function args() {
  const o = {
    world: "cobnut", question: "Which ingredients are below their reorder level?", ask: false, investigation: false, rfq: false, approve: false,
    provider: "nvidia", ingredient: "Roasted hazelnuts (synthetic)", outlet: "*",
  };
  for (const a of process.argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    if (["investigation", "ask", "rfq", "approve"].includes(m?.[1] ?? "") && m![2] === undefined) (o as J)[m![1]!] = true;
    else if (m && m[2] && ["world", "question", "provider", "ingredient", "outlet"].includes(m[1]!)) (o as J)[m[1]!] = m[2];
    else throw new Error(`unknown or valueless argument ${a} (use --name=value)`);
  }
  if (!/^[a-z_]+$/.test(o.world)) throw new Error("--world must be a seeded world's name");
  if (o.approve && !o.rfq) throw new Error("--approve goes with --rfq");
  if (!o.ask && !o.investigation && !o.rfq) o.ask = o.investigation = true;
  return o;
}

type J = Record<string, any>;

function uuid7(): string {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = 0x70 | (b[6]! & 0x0f);
  b[8] = 0x80 | (b[8]! & 0x3f);
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const fail = (msg: string): never => { throw new Error(msg); };

const o = args();
let db: pg.Client | undefined;
const out: string[] = [];
try {
  const core = (await (await fetch(`${CORE}/health`)).json()) as J;
  if (core.idp !== "local") fail(`core-api reports idp=${JSON.stringify(core.idp)}, not "local" — refusing (local only)`);
  const intel = (await (await fetch(`${INTEL}/health`)).json()) as J;
  if (intel.model_mode !== "live") fail(`intel reports model_mode=${JSON.stringify(intel.model_mode)}: restart it with MUNIM_MODEL_MODE=live`);
  const { url } = JSON.parse(readFileSync(join(RUN, "local/local-db.json"), "utf8")) as { url: string };
  const at = new URL(url);
  if (at.hostname !== "127.0.0.1") fail("the database is not the local one — refusing");
  const { roles } = JSON.parse(readFileSync(join(RUN, "local/db-roles.json"), "utf8")) as { roles: Record<string, string> };
  db = new pg.Client({ host: at.hostname, port: Number(at.port), database: at.pathname.slice(1), user: "postgres", password: roles.munim_core });
  await db.connect();
  await db.query("SET default_transaction_read_only = on");

  const site = readFileSync(join(RUN, `local/${o.world}/site.env`), "utf8");
  const tenant = /^MUNIM_DEMO_TENANT_ID=(.+)$/m.exec(site)?.[1] ?? fail(`no tenant in .run/local/${o.world}/site.env`);
  const token = (JSON.parse(readFileSync(join(RUN, `local/${o.world}/demo-tokens.json`), "utf8")) as J).owner as string;
  const call = async (method: string, path: string, body?: unknown): Promise<{ body: J; headers: Headers }> => {
    const r = await fetch(`${CORE}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "x-munim-tenant": tenant, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = (await r.json().catch(() => ({}))) as J;
    if (!r.ok) fail(`${method} ${path}: HTTP ${r.status} ${String(j.error?.code ?? "")}${r.status === 401 ? " (re-mint: scripts/dev/restart-svc.sh tokens " + o.world + ")" : ""}`);
    return { body: j, headers: r.headers };
  };
  const api = async (method: string, path: string, body?: unknown): Promise<J> => (await call(method, path, body)).body;
  const command = (type: string, payload: J) => ({ command_id: uuid7(), idempotency_key: `nemotron-smoke:${uuid7()}`, type, payload });

  // Reads one run back: its spend rows (DB) and its model calls' route traces (API). Fails on anything not live Nemotron.
  const evidence = async (label: string, runId: string): Promise<string[]> => {
    const spend = (await db!.query(
      "SELECT role, provider, model_id, input_tokens, output_tokens FROM intel.intel_spend WHERE tenant_id = $1 AND run_id = $2 ORDER BY at, id",
      [tenant, runId])).rows as J[];
    const events: J[] = [];
    for (let after = 0, page: J; ; after = page.next_after_seq) {
      page = await api("GET", `/v1/traces/${runId}?after_seq=${after}&limit=100`);
      events.push(...((page.events ?? []) as J[]));
      if (page.next_after_seq === null || page.next_after_seq === undefined || (page.events ?? []).length === 0) break;
    }
    const served = events.filter((e) => e.kind === "route" && e.payload?.model_path !== undefined).map((e) => e.payload as J);
    const lines = [`${label}: run ${runId}`];
    for (const r of spend) lines.push(`  spend  ${r.role.padEnd(7)} ${r.provider}/${r.model_id}  in=${r.input_tokens} out=${r.output_tokens}`);
    for (const p of served) lines.push(`  trace  route model_path=${p.model_path} provider=${p.provider ?? "-"} model_id=${p.model_id ?? "-"}`);
    if (spend.length === 0) fail(`${label}: no spend row for run ${runId}`);
    const off = spend.filter((r) => r.provider !== o.provider || !/nemotron/i.test(r.model_id));
    if (off.length) fail(`${label}: spend not on ${o.provider} Nemotron: ${off.map((r) => `${r.role}=${r.provider}/${r.model_id}`).join(", ")}`);
    if (served.length === 0) fail(`${label}: no model call traced its path (is intel live?)`);
    const notLive = served.filter((p) => p.model_path !== "live");
    if (notLive.length) fail(`${label}: ${notLive.length} call(s) not served live (${notLive.map((p) => p.model_path).join(", ")}): not a live claim`);
    const unnamed = served.filter((p) => !/nemotron/i.test(String(p.model_id ?? "")));
    if (unnamed.length) fail(`${label}: ${unnamed.length} route trace(s) name no Nemotron model`);
    return lines;
  };

  // ---- 1. Ask ----
  if (o.ask) {
  const t0 = Date.now();
  const ask = await api("POST", "/v1/ask", { question: o.question });
  const answer = ask.answer as J;
  const env = answer.envelope as J;
  const run = (await db.query("SELECT run_id FROM intel.answer WHERE tenant_id = $1 AND id = $2", [tenant, answer.answer_id])).rows[0]?.run_id as string | undefined;
  out.push(`ask (${o.world}, ${Date.now() - t0} ms): answer ${answer.answer_id} abstained=${env.abstained} reason=${env.reason_code ?? "-"} `
    + `segments=${(env.segments ?? []).length} resolved_refs=${(answer.resolved_refs ?? []).length}`);
  // Name the serving provider before an abstention can hide it (NB-1b: roles still on Gemini looked like an abstention).
  if (run) {
    const ran = (await db.query("SELECT DISTINCT provider, model_id FROM intel.intel_spend WHERE tenant_id = $1 AND run_id = $2", [tenant, run])).rows as J[];
    out.push(`  ask ran on: ${ran.map((r) => `${r.provider}/${r.model_id}`).join(", ") || "no spend row"}`);
    const wrong = ran.filter((r) => r.provider !== o.provider);
    if (wrong.length) fail(`ask ran on ${[...new Set(wrong.map((r) => r.provider))].join(", ")}, expected ${o.provider}`);
  }
  if (env.abstained) fail(`ask: abstained (${env.reason_code}) — not an answer`);
  const resolved = new Set(((answer.resolved_refs ?? []) as J[]).map((r) => r.ref));
  const cited = ((env.segments ?? []) as J[]).flatMap((s) => (s.refs ?? []) as string[]).filter((r) => r.startsWith("snap:"));
  if (resolved.size === 0) fail("ask: no resolved refs — its numbers do not trace to snapshot cells");
  out.push(`  cited snapshot refs: ${cited.length}; resolved for this viewer: ${resolved.size}`);
  if (!run) fail("ask: no intel.answer row for the answer");
  out.push(...(await evidence("ask", run!)));
  }

  // ---- 2. Investigation (one narrated step) ----
  if (o.investigation) {
    const now = new Date();
    const month = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const period = month(now);
    const compare = month(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    const id = uuid7();
    await api("POST", "/v1/investigations", { investigation_id: id, playbook_id: "margin_fall", params: { period_month: period, compare_month: compare }, mode: "step" });
    const t1 = Date.now();
    const view = await api("POST", `/v1/investigations/${id}:continue`, { step_no: 1 });
    const step = ((view.steps ?? []) as J[]).find((s) => s.step_no === 1) ?? fail("investigation: no step 1 in the view");
    const narration = step.narration as J | null;
    out.push(`investigation ${id} (${Date.now() - t1} ms): status=${view.status} items_updated=${(step.item_updates ?? []).length} `
      + `segments=${narration ? (narration.envelope.segments ?? []).length : 0}`);
    if (!narration) fail("investigation: step 1 has no narration");
    const nrun = (await db.query("SELECT run_id FROM intel.answer WHERE tenant_id = $1 AND id = $2", [tenant, narration!.answer_id])).rows[0]?.run_id as string;
    out.push(...(await evidence("investigation narration", nrun)));
    const log = readFileSync(join(RUN, "intel.log"), "utf8");
    const source = new RegExp(`narrate run ${nrun} source (model|template)`).exec(log)?.[1];
    out.push(`  narration source (intel.log): ${source ?? "not found"}`);
    if (source !== "model") fail("investigation: the narration kept core's template — the model's lines were not used");
  }
  // ---- 3. RFQ → negotiation → purchase-order draft → the owner approves ----
  if (o.rfq) {
    const ing = (((await api("GET", `/v1/inventory/ingredients?q=${encodeURIComponent(o.ingredient)}`)).items ?? []) as J[])
      .find((i) => i.name === o.ingredient) ?? fail(`no ingredient named ${o.ingredient}`);
    const all = ((await api("GET", "/v1/outlets")).outlets ?? []) as J[];
    const outletIds = o.outlet === "*" ? all.map((x) => x.id as string) : [(all.find((x) => x.name === o.outlet) ?? fail(`no outlet named ${o.outlet}`)).id];
    const t2 = Date.now();
    const rfq = await call("POST", "/v1/rfq-requests",
      command("purchasing.rfq.request.v1", { rfq_id: uuid7(), ingredient_id: ing.ingredient_id, outlet_ids: outletIds }));
    const status = rfq.headers.get("x-munim-negotiation");
    const draftId = rfq.headers.get("x-munim-draft-id");
    out.push(`rfq (${o.ingredient} at ${o.outlet}, ${Date.now() - t2} ms): negotiation=${status} draft=${draftId ?? "-"}`);
    if (status !== "drafted" || !draftId) fail(`rfq: the negotiation ended ${status}, with no purchase-order draft`);
    const draft = await api("GET", `/v1/drafts/${draftId}`);
    const view = (draft.draft ?? draft) as J;
    const runId = view.run_id as string;
    out.push(...(await evidence("negotiation", runId)));
    // Every number in the draft is a ref (R26): walk the payload; a bare number anywhere fails, and each ref must resolve.
    const numbers: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (typeof v === "number") numbers.push(path);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}/${i}`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}/${k}`);
    };
    walk(view.payload, "");
    const resolved = (view.resolved_refs ?? []) as J[];
    out.push(`  draft ${view.command_type} status=${view.status}: ${resolved.length} resolved refs`);
    for (const r of resolved) out.push(`    ${r.path} = ${JSON.stringify(r.value)}  ← ${r.ref}`);
    if (numbers.length) fail(`rfq: the draft holds typed numbers at ${numbers.join(", ")}`);
    if (resolved.length === 0) fail("rfq: the draft resolves no refs");
    if (!o.approve) out.push("  left proposed for a person to decide (no --approve)");
    if (o.approve) {
    const done = await api("POST", `/v1/drafts/${draftId}:approve`,
      command("drafts.approve.v1", { draft_id: draftId, command_type: view.command_type, edited_payload: null, reason: null }));
    const after = await api("GET", `/v1/drafts/${draftId}`);
    const st = (after.draft ?? after).status;
    out.push(`  approved as proposed by this script with the demo owner's token: ${JSON.stringify(done).slice(0, 160)}; draft now ${st}`);
    if (st !== "executed") fail(`rfq: the draft is ${st} after approval`);
    }
  }
  console.log(out.join("\n"));
  out.length = 0;
  console.log(`nemotron-smoke: PASS — live ${o.provider} Nemotron, every call served live`);
} catch (e) {
  if (out.length) console.log(out.join("\n"));
  console.error(`nemotron-smoke: FAIL — ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db?.end();
}
