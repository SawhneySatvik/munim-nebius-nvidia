// The One Guarantee, clause 1, checked over what a flow wrote (and the audit chain over the whole tenant).
//   watermark(): the keys of every book row of the tenant, the audit seq, the command log and the capture position,
//                before the flow. The first call on a clone installs the capture (below).
//   clause1():   every book row the flow INSERTED has an origin that resolves, in the transaction that wrote it
//                (matched on that transaction's now(), which command_log / audit_log / the capture all record):
//                  command    → that transaction logged this command type for this principal, and the command's
//                               core.command_authority row lists the table;
//                  decision   → an approved/edited decision whose draft executed, audited in that transaction under it;
//                  migration  → (0016 backfills: business_policy, account 4100) audited for that row by the
//                               transaction that wrote it;
//                  derivation → a core.derivation_rule (rule, source table, this table) whose source row exists and
//                               was in the rule's source_state AT THE WRITE (evaluated by the capture inside the
//                               writing transaction, as the writing role — R1-M4), written by a transaction that
//                               audited a named actor's command or a decision;
//                every UPDATE the flow made to a book row has an audit entry for that entity and id written in the
//                same transaction, by a named actor or under a decision; an UPDATE made under a derivation rule
//                (app.posting_rule, e.g. orders.reprice, the verified-email merge) also had its source in the rule's
//                source_state at that moment. origin is creation provenance and is never re-stamped, so updates are
//                traced through the audit log (gotcha 34) — and an UPDATE that rewrites a row's origin is itself a
//                finding; inserted rows are judged on the origin captured at the INSERT. No book row of ANOTHER tenant
//                was written after the mark.
//                Anything else is a finding. Book tables come from the catalog tags (munim:book), not a hand list.
//   chain():     verifyAuditChain over the tenant (gapless seq, prev_hash links, recomputed hashes).
// The capture is test instrumentation on the test clone only: an AFTER INSERT OR UPDATE row trigger on each book
// table (schema t034_probe, ENABLE ALWAYS so it also sees writes made with session_replication_role = replica)
// recording (op, table, tenant, key, now(), the derivation rule and source, the source_state verdict). It runs as
// the writing role (SECURITY INVOKER, like the book guard) so the rule's state reads what the guard read; it never
// refuses a write (an evaluation error is recorded, not raised). No migration and no runtime role touches it.
// plant(): the defects the scan must name (redproof.sh, guarantee-gates.test.ts) — written as the cluster superuser
// in one transaction with session_replication_role = replica (book guard, FK and other triggers off; the capture on).
import { verifyAuditChain } from "../../services/core-api/src/commit/index.ts";
import { type Env, uuidv7 } from "./harness.ts";

export type Mark = { tenant: string; rows: Map<string, Set<string>>; auditSeq: number; commands: Set<string>; capture: number };

// Book tables without an `id` column, keyed by their own primary key (cares_outlet: 0028, one row per opted-in outlet).
const keyExpr: Record<string, string> = { membership: "t.member_id::text", tenant: "t.tenant_id::text", cares_outlet: "t.outlet_id::text" };

async function bookTables(env: Env): Promise<string[]> {
  return (await env.rows<{ t: string }>(
    `SELECT c.relname AS t FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'core' AND c.relkind = 'r' AND obj_description(c.oid, 'pg_class') = 'munim:book' ORDER BY 1`)).map((r) => r.t);
}

async function snapshot(env: Env, tenant: string) {
  const out = new Map<string, Map<string, Record<string, string>>>();
  for (const t of await bookTables(env)) {
    const rows = await env.rows<{ k: string; origin: Record<string, string> }>(
      `SELECT ${keyExpr[t] ?? "t.id::text"} AS k, t.origin FROM core."${t}" t WHERE t.tenant_id = $1`, [tenant]);
    out.set(t, new Map(rows.map((r) => [r.k, r.origin])));
  }
  return out;
}

async function instrument(env: Env): Promise<void> {
  if ((await env.one<{ ok: boolean }>(`SELECT to_regclass('t034_probe.book_update') IS NOT NULL AS ok`)).ok) return;
  await env.db.admin(`CREATE SCHEMA t034_probe`);
  await env.db.admin(`CREATE TABLE t034_probe.book_update (n bigserial PRIMARY KEY, op text NOT NULL, tbl text NOT NULL, tenant_id uuid, k text NOT NULL,
    at timestamptz NOT NULL, rule text, src text, state_ok boolean, state_err text, origin jsonb, restamped boolean)`);
  // Every writing role (munim_core, munim_crosstenant inside its definer functions) appends here as itself.
  await env.db.admin(`GRANT USAGE ON SCHEMA t034_probe TO PUBLIC`);
  await env.db.admin(`GRANT INSERT ON t034_probe.book_update TO PUBLIC`);
  await env.db.admin(`GRANT USAGE ON SEQUENCE t034_probe.book_update_n_seq TO PUBLIC`);
  await env.db.admin(`CREATE FUNCTION t034_probe.capture() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $f$
    DECLARE
      j     jsonb := to_jsonb(NEW);
      rule  text;
      src   text;
      r_src text;
      r_st  text;
      ok    boolean;
      err   text;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF j -> 'origin' ->> 'kind' = 'derivation' THEN
          rule := j -> 'origin' ->> 'rule_id';
          src  := j -> 'origin' ->> 'source_ref';
        END IF;
      ELSE
        rule := nullif(current_setting('app.posting_rule', true), '');
        src  := nullif(current_setting('app.source_ref', true), '');
      END IF;
      IF rule IS NOT NULL THEN
        BEGIN
          -- The same lookup and predicate the book guard runs (0015 branch 3), here and now.
          SELECT dr.source_table, dr.source_state INTO r_src, r_st FROM core.derivation_rule dr
           WHERE dr.rule_id = rule AND dr.target_table = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND dr.source_table = split_part(src, ':', 1);
          IF r_src IS NOT NULL THEN
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I s WHERE s.tenant_id = $1 AND s.id::text = $2 AND (%s))',
                           split_part(r_src, '.', 1), split_part(r_src, '.', 2), r_st)
               INTO ok USING NEW.tenant_id, split_part(src, ':', 2);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          err := SQLSTATE;
        END;
      END IF;
      INSERT INTO t034_probe.book_update (op, tbl, tenant_id, k, at, rule, src, state_ok, state_err, origin, restamped)
      VALUES (TG_OP, TG_TABLE_NAME, NEW.tenant_id, coalesce(j ->> 'id', j ->> 'member_id', CASE WHEN TG_TABLE_NAME = 'cares_outlet' THEN j ->> 'outlet_id' END, j ->> 'tenant_id'), now(), rule, src, ok, err,
              j -> 'origin', TG_OP = 'UPDATE' AND to_jsonb(OLD) -> 'origin' IS DISTINCT FROM j -> 'origin');
      RETURN NULL;
    END $f$`);
  for (const t of await bookTables(env)) {
    await env.db.admin(`CREATE TRIGGER zz_t034_insert AFTER INSERT ON core."${t}" FOR EACH ROW EXECUTE FUNCTION t034_probe.capture()`);
    await env.db.admin(`CREATE TRIGGER zz_t034_update AFTER UPDATE ON core."${t}" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION t034_probe.capture()`);
    await env.db.admin(`ALTER TABLE core."${t}" ENABLE ALWAYS TRIGGER zz_t034_insert`);
    await env.db.admin(`ALTER TABLE core."${t}" ENABLE ALWAYS TRIGGER zz_t034_update`);
  }
}

export async function watermark(env: Env, tenant: string): Promise<Mark> {
  await instrument(env);
  const snap = await snapshot(env, tenant);
  const rows = new Map([...snap].map(([t, m]) => [t, new Set(m.keys())]));
  const seq = (await env.one<{ s: string }>(`SELECT coalesce(max(seq), 0)::text AS s FROM core.audit_log WHERE tenant_id = $1`, [tenant])).s;
  const commands = new Set((await env.rows<{ k: string }>(`SELECT idempotency_key AS k FROM core.command_log WHERE tenant_id = $1`, [tenant])).map((r) => r.k));
  const capture = Number((await env.one<{ n: string }>(`SELECT coalesce(max(n), 0)::text AS n FROM t034_probe.book_update`)).n);
  return { tenant, rows, auditSeq: Number(seq), commands, capture };
}

export interface Clause1 { inserted: Record<string, number>; updated: Record<string, number>; bad: string[] }
type Captured = {
  op: string; tbl: string; k: string; at: string; rule: string | null; src: string | null; state_ok: boolean | null; state_err: string | null;
  origin: Record<string, string> | null; restamped: boolean | null;
};

export async function clause1(env: Env, mark: Mark): Promise<Clause1> {
  const T = mark.tenant;
  // redproof.sh: MUNIM_INT_PLANT=scan:<branch> plants that defect into this flow's window first; the flow's
  // `scan.bad = []` must then fail, naming it.
  const planted = scanPlant();
  if (planted) await plant(env, mark, planted);
  const after = await snapshot(env, T);
  const commands = (await env.rows<{ k: string; type: string; actor: string; at: string }>(
    `SELECT idempotency_key AS k, command_type AS type, actor ->> 'id' AS actor, created_at::text AS at FROM core.command_log WHERE tenant_id = $1`, [T]))
    .filter((c) => !mark.commands.has(c.k));
  const captured = await env.rows<Captured>(
    `SELECT op, tbl, k, at::text AS at, rule, src, state_ok, state_err, origin, restamped FROM t034_probe.book_update WHERE n > $1 AND tenant_id = $2 ORDER BY n`, [mark.capture, T]);
  const insertedBy = new Map(captured.filter((c) => c.op === "INSERT").map((c) => [`${c.tbl}:${c.k}`, c]));
  const audit = await env.rows<{ entity: string; entity_id: string; actor: string | null; decision_id: string | null; at: string }>(
    `SELECT entity, entity_id, actor ->> 'id' AS actor, decision_id::text, created_at::text AS at FROM core.audit_log WHERE tenant_id = $1 AND seq > $2`, [T, mark.auditSeq]);
  const out: Clause1 = { inserted: {}, updated: {}, bad: [] };
  for (const [t, rows] of after) {
    const before = mark.rows.get(t) ?? new Set<string>();
    for (const [k, o] of rows) {
      if (before.has(k)) continue;
      out.inserted[t] = (out.inserted[t] ?? 0) + 1;
      const cap = insertedBy.get(`${t}:${k}`);
      // Provenance is judged as written at the INSERT (the captured origin): origin is creation provenance (gotcha 34).
      const why = cap === undefined ? "inserted with no captured transaction" : await originFinding(env, T, `core.${t}`, k, cap.origin ?? o, cap,
        commands.filter((c) => c.at === cap.at), audit.filter((a) => a.at === cap.at));
      if (why) out.bad.push(`core.${t}:${k} ${why}`);
    }
  }
  for (const u of captured.filter((c) => c.op === "UPDATE")) {
    out.updated[u.tbl] = (out.updated[u.tbl] ?? 0) + 1;
    if (!audit.some((a) => a.entity === `core.${u.tbl}` && a.entity_id === u.k && a.at === u.at && (a.actor !== null || a.decision_id !== null))) {
      out.bad.push(`core.${u.tbl}:${u.k} updated at ${u.at} with no audit entry in that transaction`);
    }
    const state = stateFinding(u);
    if (state) out.bad.push(`core.${u.tbl}:${u.k} updated under ${u.rule}: ${state}`);
    // Gotcha 34: origin is creation provenance; an UPDATE that rewrites it erases how the row came to be.
    if (u.restamped) out.bad.push(`core.${u.tbl}:${u.k} origin re-stamped by an update at ${u.at} (now ${u.origin?.kind}${u.origin?.rule_id ? ` ${u.origin.rule_id}` : ""})`);
  }
  // R1-M4: the flow wrote only its own tenant's books.
  for (const x of await env.rows<{ tbl: string; k: string; tenant_id: string | null; op: string }>(
    `SELECT tbl, k, tenant_id::text, op FROM t034_probe.book_update WHERE n > $1 AND tenant_id IS DISTINCT FROM $2 ORDER BY n`, [mark.capture, T])) {
    out.bad.push(`core.${x.tbl}:${x.k} ${x.op === "INSERT" ? "inserted" : "updated"} for another tenant (${x.tenant_id}) after the mark`);
  }
  return out;
}

/** A derivation write's source_state verdict, taken in the writing transaction; null = fine or not a rule write. */
function stateFinding(c: Captured): string | null {
  if (c.rule === null) return null;
  if (c.state_err !== null) return `source ${c.src} state could not be evaluated (SQLSTATE ${c.state_err})`;
  return c.state_ok === false ? `source ${c.src} was not in the rule's source_state when written` : null;
}

/** `commands` / `audit`: what the inserting transaction (its now() = `cap.at`) logged and audited. */
async function originFinding(env: Env, tenant: string, table: string, key: string, o: Record<string, string>, cap: Captured, commands: Array<{ type: string; actor: string }>,
  audit: Array<{ entity: string; entity_id: string; decision_id: string | null; actor: string | null }>): Promise<string | null> {
  if (o.kind === "command") {
    if (!commands.some((c) => c.type === o.command_type && c.actor === o.principal_id)) return `origin command ${o.command_type} by ${o.principal_id}: not logged by the transaction that wrote it (${cap.at})`;
    const bound = await env.one<{ n: string }>(`SELECT count(*) AS n FROM core.command_authority WHERE command_type = $1 AND $2 = ANY (target_tables || customer_target_tables)`, [o.command_type, table]);
    return Number(bound.n) === 1 ? null : `origin command ${o.command_type} does not list ${table}`;
  }
  if (o.kind === "decision") {
    const d = await env.one<{ n: string }>(
      `SELECT count(*) AS n FROM core.decision d JOIN core.draft r ON r.tenant_id = d.tenant_id AND r.id = d.draft_id
        WHERE d.tenant_id = $1 AND d.id::text = $2 AND d.verdict IN ('approved', 'edited') AND r.status = 'executed'`, [tenant, o.decision_id]);
    if (Number(d.n) !== 1) return `origin decision ${o.decision_id}: no executed approved draft`;
    return audit.some((a) => a.decision_id === o.decision_id) ? null : `origin decision ${o.decision_id}: not audited by the transaction that wrote it`;
  }
  if (o.kind === "derivation") {
    const [srcTable, srcId] = (o.source_ref ?? "").split(":");
    const rule = await env.one<{ n: string }>(`SELECT count(*) AS n FROM core.derivation_rule WHERE rule_id = $1 AND source_table = $2 AND target_table = $3`, [o.rule_id, srcTable, table]);
    if (Number(rule.n) !== 1) return `origin derivation ${o.rule_id} from ${srcTable}: no such rule for ${table}`;
    const [schema, name] = srcTable!.split(".");
    const src = await env.one<{ n: string }>(`SELECT count(*) AS n FROM ${schema}."${name}" WHERE tenant_id = $1 AND id::text = $2`, [tenant, srcId]);
    if (Number(src.n) !== 1) return `origin derivation ${o.rule_id}: source ${o.source_ref} missing`;
    const state = stateFinding(cap);
    if (state) return `origin derivation ${o.rule_id}: ${state}`;
    // The rule exists for this source and target, so the capture must have evaluated it: a missing verdict is a gap.
    if (cap.state_ok !== true) return `origin derivation ${o.rule_id}: source_state not evaluated when written`;
    return audit.some((a) => a.actor !== null || a.decision_id !== null) ? null : `origin derivation ${o.rule_id}: written by a transaction that audited no command or decision`;
  }
  if (o.kind === "migration") {
    return audit.some((a) => a.entity === table && a.entity_id === key) ? null : `origin migration: not audited by the transaction that wrote it`;
  }
  return `origin kind ${String(o.kind)}`;
}

/** The tenant's audit chain verifies end to end. */
export async function chain(env: Env, tenant: string) {
  return verifyAuditChain(env.api.svc, tenant);
}

// ---- planted defects (red-proofs of every branch above) ----

/** Each branch of clause1 and the finding text it must produce. */
export const PLANTS = {
  command_unlogged: /not logged by the transaction that wrote it/,
  command_unlisted: /origin command tenancy\.channel\.create\.v1 does not list core\./,
  decision_missing: /no executed approved draft/,
  decision_unaudited: /not audited by the transaction that wrote it/,
  rule_missing: /no such rule for core\./,
  source_missing: /source core\.[a-z_]+:[0-9a-f-]+ missing/,
  state_insert: /origin derivation [a-z_.]+: source core\.[a-z_]+:[0-9a-f-]+ was not in the rule's source_state when written/,
  derivation_unaudited: /written by a transaction that audited no command or decision/,
  state_unevaluated: /origin derivation [a-z_.]+: source_state not evaluated when written/,
  unknown_kind: /origin kind planted_kind/,
  migration_unaudited: /origin migration: not audited by the transaction that wrote it/,
  no_capture: /inserted with no captured transaction/,
  update_unaudited: /updated at .* with no audit entry in that transaction/,
  state_update: /updated under [a-z_.]+: source core\.[a-z_]+:[0-9a-f-]+ was not in the rule's source_state when written/,
  other_tenant: /inserted for another tenant \([0-9a-f-]+\) after the mark/,
  restamp: /origin re-stamped by an update at /,
} as const;
export type PlantBranch = keyof typeof PLANTS;

function scanPlant(): PlantBranch | null {
  const v = process.env.MUNIM_INT_PLANT ?? "";
  if (!v.startsWith("scan:")) return null;
  const b = v.slice("scan:".length);
  if (!(b in PLANTS)) throw new Error(`MUNIM_INT_PLANT: unknown scan branch ${b}`);
  return b as PlantBranch;
}

/** Plants one defect for `branch` into the tenant's books after `mark`; returns the planted row's key. Tables with an
 *  `id` key and no other unique key are cloned from a row the flow wrote (stock movement, posting, expense, order event,
 *  roster shift). */
export async function plant(env: Env, mark: Mark, branch: PlantBranch): Promise<string> {
  const T = mark.tenant;
  const derivable = ["stock_movement", "posting"];
  const pick = async (tables: string[]) => {
    for (const t of tables) if ((await env.rows(`SELECT 1 FROM core."${t}" WHERE tenant_id = $1 LIMIT 1`, [T])).length) return t;
    throw new Error(`plant ${branch}: the flow wrote none of ${tables.join(", ")}`);
  };
  const table = await pick(branch.startsWith("state_") || branch === "source_missing" || branch === "derivation_unaudited"
    ? derivable : [...derivable, "expense", "order_event", "roster_shift"]);
  const id = uuidv7();
  const owner = (await env.one<{ id: string }>(`SELECT m.id FROM core.member m JOIN core.membership s ON s.tenant_id = m.tenant_id AND s.member_id = m.id
    WHERE m.tenant_id = $1 AND s.role = 'owner' ORDER BY m.created_at LIMIT 1`, [T])).id;
  /** A source of a rule that targets `table`, in (or out of) its source_state. */
  const ruleSource = async (inState: boolean) => {
    for (const r of await env.rows<{ rule_id: string; source_table: string; source_state: string }>(
      `SELECT rule_id, source_table, source_state FROM core.derivation_rule WHERE target_table = $1 ORDER BY rule_id, source_table`, [`core.${table}`])) {
      const [s, n] = r.source_table.split(".");
      const hit = await env.rows<{ id: string }>(`SELECT s.id::text AS id FROM ${s}."${n}" s WHERE s.tenant_id = $1 AND ${inState ? "" : "NOT "}coalesce((${r.source_state}), false) LIMIT 1`, [T]);
      if (hit[0]) return { rule: r.rule_id, ref: `${r.source_table}:${hit[0].id}` };
    }
    throw new Error(`plant ${branch}: no source ${inState ? "in" : "out of"} state for a rule writing core.${table}`);
  };
  const c = await env.db.connect("admin");
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role = replica");
    const clone = async (origin: object) => {
      const r = await c.query(
        `INSERT INTO core."${table}" SELECT (jsonb_populate_record(NULL::core."${table}",
           to_jsonb(x) || jsonb_build_object('id', $2::uuid, 'origin', $3::jsonb)
                       || CASE WHEN to_jsonb(x) ? 'seq' THEN jsonb_build_object('seq', (to_jsonb(x) ->> 'seq')::bigint + 1000000) ELSE '{}' END)).*
           FROM core."${table}" x WHERE x.tenant_id = $1 ORDER BY x.created_at DESC LIMIT 1`, [T, id, JSON.stringify(origin)]);
      if (r.rowCount !== 1) throw new Error(`plant ${branch}: clone of core.${table} wrote ${r.rowCount} rows`);
    };
    const touch = async () => {
      const r = await c.query(`UPDATE core."${table}" SET origin = origin || '{"planted": true}' WHERE tenant_id = $1 AND id = (SELECT id FROM core."${table}" WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1) RETURNING id::text`, [T]);
      return r.rows[0]!.id as string;
    };
    const cmd = { kind: "command", command_type: "tenancy.channel.create.v1", role: "owner", principal_id: owner };
    let key = id;
    switch (branch) {
      case "command_unlogged":
        await clone(cmd);
        break;
      case "command_unlisted":
        await c.query(`INSERT INTO core.command_log (tenant_id, idempotency_key, command_id, command_type, actor, request_hash, result)
          VALUES ($1, $2, $3, 'tenancy.channel.create.v1', $4, repeat('0', 64), '{}')`, [T, `plant-${id}`, uuidv7(), JSON.stringify({ kind: "member", id: owner, role: "owner" })]);
        await clone(cmd);
        break;
      case "decision_missing":
        await clone({ kind: "decision", decision_id: uuidv7() });
        break;
      case "decision_unaudited": {
        const d = await env.rows<{ id: string }>(`SELECT d.id::text FROM core.decision d JOIN core.draft r ON r.tenant_id = d.tenant_id AND r.id = d.draft_id
          WHERE d.tenant_id = $1 AND d.verdict IN ('approved', 'edited') AND r.status = 'executed' LIMIT 1`, [T]);
        if (!d[0]) throw new Error("plant decision_unaudited: the flow has no executed approved decision");
        await clone({ kind: "decision", decision_id: d[0].id });
        break;
      }
      case "rule_missing":
        await clone({ kind: "derivation", rule_id: "planted.no_such_rule", source_ref: `core.order:${uuidv7()}` });
        break;
      case "source_missing": {
        const s = await ruleSource(true);
        await clone({ kind: "derivation", rule_id: s.rule, source_ref: `${s.ref.split(":")[0]}:${uuidv7()}` });
        break;
      }
      case "state_insert": {
        const s = await ruleSource(false);
        await clone({ kind: "derivation", rule_id: s.rule, source_ref: s.ref });
        break;
      }
      case "derivation_unaudited": {
        const s = await ruleSource(true);
        await clone({ kind: "derivation", rule_id: s.rule, source_ref: s.ref });
        break;
      }
      case "state_unevaluated": {
        const s = await ruleSource(true);
        await clone({ kind: "derivation", rule_id: s.rule, source_ref: s.ref });
        await c.query(`UPDATE t034_probe.book_update SET state_ok = NULL WHERE n > $1 AND tbl = $2 AND k = $3`, [mark.capture, table, id]);
        break;
      }
      case "unknown_kind":
        await clone({ kind: "planted_kind" });
        break;
      case "migration_unaudited":
        await clone({ kind: "migration" });
        break;
      case "no_capture":
        await clone(cmd);
        await c.query(`DELETE FROM t034_probe.book_update WHERE n > $1 AND tbl = $2 AND k = $3`, [mark.capture, table, id]);
        break;
      case "update_unaudited":
      case "restamp":
        key = await touch();
        break;
      case "state_update": {
        const s = await ruleSource(false);
        await c.query(`SELECT set_config('app.posting_rule', $1, true), set_config('app.source_ref', $2, true)`, [s.rule, s.ref]);
        key = await touch();
        break;
      }
      case "other_tenant": {
        // A second tenant (a clone of this one's row) written inside the flow's window.
        const other = uuidv7();
        await c.query(`INSERT INTO core.tenant SELECT (jsonb_populate_record(NULL::core.tenant, to_jsonb(x) || jsonb_build_object('tenant_id', $2::uuid))).*
          FROM core.tenant x WHERE x.tenant_id = $1`, [T, other]);
        key = other;
        break;
      }
    }
    await c.query("COMMIT");
    return key;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}
