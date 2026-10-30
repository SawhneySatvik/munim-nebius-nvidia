// `make dev-db`: bring up the founder's hosted dev Supabase database through the config module (rule 20: no
// agent or script reads `.env` itself; every line printed passes through the config's redaction).
//   1. probe each UNVERIFIED hosted item from db/README in a rolled-back transaction (nothing persists)
//   2. pgvector: if available but not installed, create it once as the admin (0013's header asks for this)
//   3. migrate every file (or `--through NNNN`) over the session pooler — the @munim/db runner
//   4. set fresh runtime-role passwords → `.run/db-roles.json` (m-1's bootstrapRoles; the runner must run first:
//      it refuses a database whose roles do not exist)
//   5. seed the country packs
//   6. verify: runtime logins on the transaction pooler, LISTEN/NOTIFY on the session pooler, outcomes of 1–2
// Prints only counts, versions and pass/fail with the fallback taken. Never prints a host, URL or password.
//   node scripts/dev/bootstrap-dev-db.ts [--through <NNNN> | --through=<NNNN>]
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import pg from "pg";
import { migrate, readMigrations } from "../../db/migrate.ts";
import { bootstrapRoles } from "../../db/scripts/bootstrap-roles.ts";
import { seedPacks } from "../../db/seeds/packs.ts";
import { createLogger, loadRepoConfig } from "../../packages/config/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const config = loadRepoConfig(root);
const say = createLogger(config, (l) => console.log(l));
const results: Array<{ item: string; pass: boolean; detail: string }> = [];
const record = (item: string, pass: boolean, detail: string) => {
  results.push({ item, pass, detail });
  say(`  ${pass ? "PASS" : "FAIL"}  ${item} — ${detail}`);
};
const code = (e: unknown) => (e as { code?: string }).code ?? (e as Error).name;

function parseThrough(argv: string[]): number | null {
  let through: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const v = a === "--through" ? argv[++i] : a.startsWith("--through=") ? a.slice(10) : undefined;
    if (v === undefined || !/^\d{1,4}$/.test(v)) throw new Error(`bootstrap-dev-db: unknown or malformed argument '${a}'`);
    through = Number(v);
  }
  return through;
}

/** Runs fn in a transaction that is always rolled back: a probe never leaves anything behind. */
async function probe(c: pg.Client, fn: () => Promise<void>): Promise<string | null> {
  await c.query("BEGIN");
  try {
    await fn();
    return null;
  } catch (e) {
    return code(e);
  } finally {
    await c.query("ROLLBACK");
  }
}

async function main(): Promise<number> {
  const through = parseThrough(process.argv.slice(2));
  const files = readMigrations().filter((f) => through === null || f.version <= through);
  const admin = new pg.Client({ connectionString: config.require("SUPABASE_SESSION_POOLER_CONNECTION_STRING"), connectionTimeoutMillis: 15_000 });
  try {
    await admin.connect();
  } catch (e) {
    say(`bootstrap-dev-db: FAIL — cannot connect to the session pooler as the .env admin user: SQLSTATE/error ${code(e)}`
      + `${code(e) === "28P01" ? " (password authentication failed — SUPABASE_DB_PASSWORD / the pooler connection strings in .env are not accepted; founder action)" : ""}`);
    return 1;
  }
  try {
    const v = await admin.query<{ num: string; ver: string; usr: string }>(
      "SELECT current_setting('server_version_num') AS num, current_setting('server_version') AS ver, current_user AS usr");
    const num = Number(v.rows[0]!.num);
    say(`bootstrap-dev-db: connected (session pooler); server_version ${v.rows[0]!.ver}`);

    say("UNVERIFIED hosted items (db/README) — probes in rolled-back transactions:");
    record("6 server version ≥ 15", num >= 150000, `server_version_num ${num}`);
    const attrs = await probe(admin, async () => {
      await admin.query("CREATE ROLE munim_probe_attrs NOLOGIN");
      await admin.query("ALTER ROLE munim_probe_attrs NOLOGIN NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT");
      await admin.query("ALTER ROLE munim_probe_attrs LOGIN");
    });
    record("0 ALTER ROLE attribute set used by 0001 (no SUPERUSER/NOSUPERUSER: PG16+ superuser-only)", attrs === null,
      attrs === null ? "accepted" : `refused (${attrs}) — 0001 role attributes need a different clause set (migrator lane)`);
    const bypass = await probe(admin, async () => {
      await admin.query("CREATE ROLE munim_probe_bypass NOLOGIN");
      await admin.query("ALTER ROLE munim_probe_bypass BYPASSRLS");
    });
    record("1 ALTER ROLE … BYPASSRLS from the admin role", bypass === null,
      bypass === null ? "granted" : `refused (${bypass}) — fallback (db/README 1): create munim_crosstenant once in the dashboard SQL editor, or per-tenant loops (migrator lane)`);
    const setRole = await probe(admin, async () => {
      await admin.query("CREATE ROLE munim_probe_owner NOLOGIN");
      await admin.query("GRANT munim_probe_owner TO CURRENT_USER");
      await admin.query("SET LOCAL ROLE munim_probe_owner");
    });
    record("2 GRANT <role> TO CURRENT_USER + SET LOCAL ROLE", setRole === null,
      setRole === null ? "works" : `refused (${setRole}) — fallback (db/README 2): run 0002+ without the role switch, then REASSIGN OWNED (migrator lane)`);
    const defPriv = await probe(admin, async () => {
      await admin.query("CREATE ROLE munim_probe_defpriv NOLOGIN");
      await admin.query("GRANT munim_probe_defpriv TO CURRENT_USER");
      await admin.query("ALTER DEFAULT PRIVILEGES FOR ROLE munim_probe_defpriv REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC");
    });
    record("3 ALTER DEFAULT PRIVILEGES FOR ROLE <member role>", defPriv === null,
      defPriv === null ? "works" : `refused (${defPriv}) — fallback: explicit REVOKE per function (migrator lane)`);
    const ext = await admin.query<{ name: string; installed: string | null; schema: string | null }>(
      `SELECT a.name, a.installed_version AS installed, n.nspname AS schema
         FROM pg_available_extensions a LEFT JOIN pg_extension e ON e.extname = a.name LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE a.name IN ('btree_gist', 'pgcrypto', 'vector')`);
    const has = (n: string) => ext.rows.find((r) => r.name === n);
    record("4 btree_gist available", !!has("btree_gist"),
      has("btree_gist") ? `available${has("btree_gist")!.installed ? `, installed ${has("btree_gist")!.installed}` : ""}` : "absent — fallback (db/README 4): advisory-lock overlap trigger (migrator lane)");
    record("5 pgcrypto (unused by migrations)", true, has("pgcrypto")?.installed ? `installed in schema ${has("pgcrypto")!.schema}` : "not installed (nothing calls it)");
    record("7 pooler for migrations", true, "session pooler (one transaction per file + SET LOCAL ROLE)");

    const vector = has("vector");
    if (vector && !vector.installed && files.some((f) => f.requires.includes("vector"))) {
      const schemas = await admin.query("SELECT 1 FROM pg_namespace WHERE nspname = 'extensions'");
      await admin.query(schemas.rowCount ? "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions" : "CREATE EXTENSION IF NOT EXISTS vector");
      say(`bring-up action: CREATE EXTENSION vector as the admin (${schemas.rowCount ? "schema extensions" : "default schema"}) — 0013 header`);
    }
    // Hosted Supabase installs extensions into schema `extensions`, which is on the search_path but not usable by our
    // roles: 0013 then fails with 42704 (type "vector" does not exist) under munim_migrator. Measured 10 Oct.
    const vecNow = await admin.query<{ schema: string }>(
      "SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector'");
    const vecSchema = vecNow.rows[0]?.schema;
    if (vecSchema && vecSchema !== "public" && vecSchema !== "pg_catalog") {
      await admin.query(`GRANT USAGE ON SCHEMA ${pg.escapeIdentifier(vecSchema)} TO munim_migrator, munim_view_owner, munim_core, munim_svc, munim_intel_ro`);
      say(`bring-up action: GRANT USAGE ON SCHEMA ${vecSchema} to the munim roles (vector type lookup) — 0013`);
    }
    say(`pgvector: ${vector ? "available" : "NOT available — 0013 will be skipped"}`);

    // The runner reads a directory: hand it only the files up to --through (symlinks, same bytes and sha256).
    let dir: string | undefined;
    if (through !== null) {
      dir = mkdtempSync(join(tmpdir(), "munim-migrate-"));
      for (const f of files) symlinkSync(f.path, join(dir, `${f.name}.sql`));
    }
    const m = await migrate(admin, { log: (l) => say(`  ${l}`), ...(dir ? { dir } : {}) });
    const recorded = await admin.query<{ n: number; max: number }>("SELECT count(*)::int AS n, max(version)::int AS max FROM munim_meta.schema_migrations");
    const expected = files.length - m.skipped.length;
    record("migrations applied = files − skipped", recorded.rows[0]!.n === expected,
      `files ${files.length}, skipped ${m.skipped.length}${m.skipped.length ? ` (${m.skipped.map((s) => s.name).join(", ")})` : ""}, `
      + `applied now ${m.applied.length}, already ${m.alreadyApplied.length}, recorded ${recorded.rows[0]!.n}, highest version ${recorded.rows[0]!.max}`);

    const passwords = await bootstrapRoles(admin);
    const out = join(config.runDir, "db-roles.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ written_at: new Date().toISOString(), roles: passwords }, null, 2)}\n`, { mode: 0o600 });
    chmodSync(out, 0o600);
    config.registerRunSecrets();
    say(`roles: fresh passwords set for ${Object.keys(passwords).length} login roles → .run/db-roles.json (mode 0600)`);

    const packs = await seedPacks(admin, { log: () => {} });
    say(`packs: inserted ${packs.inserted.length}, unchanged ${packs.unchanged.length}`);

    const after = await admin.query<{ bypass: boolean | null; gist: string | null; vec: string | null; owner_ok: boolean; defacl: number }>(
      `SELECT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'munim_crosstenant') AS bypass,
              (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist') AS gist,
              (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vec,
              NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname IN ('core', 'evidence', 'intel', 'platform')
                          AND tableowner <> 'munim_migrator') AS owner_ok,
              (SELECT count(*)::int FROM pg_default_acl d JOIN pg_roles r ON r.oid = d.defaclrole WHERE r.rolname = 'munim_migrator') AS defacl`);
    const a = after.rows[0]!;
    say("after migrating:");
    record("1 munim_crosstenant has BYPASSRLS", a.bypass === true, `rolbypassrls ${a.bypass}`);
    record("2 every table owned by munim_migrator (SET LOCAL ROLE took effect)", a.owner_ok, a.owner_ok ? "yes" : "some tables owned by another role");
    record("3 default privileges recorded for munim_migrator", a.defacl > 0, `${a.defacl} pg_default_acl rows`);
    record("4 btree_gist installed", a.gist !== null, `extversion ${a.gist}`);
    record("vector migration applied", a.vec !== null && !m.skipped.some((s) => s.missing.includes("vector")), `vector extversion ${a.vec}`);
    const tables = await admin.query<{ schemaname: string; n: number }>(
      `SELECT schemaname, count(*)::int AS n FROM pg_tables WHERE schemaname IN ('core', 'evidence', 'intel', 'platform', 'munim_meta')
        GROUP BY 1 ORDER BY 1`);
    say(`tables: ${tables.rows.map((r) => `${r.schemaname} ${r.n}`).join(", ")}`);

    // The transaction pooler caches credentials: right after step 4 rotates the passwords it refuses the new one
    // with 28P01 for a short while (measured 10 Oct; ok on every retry ~20 s later). Retry 28P01 only, then report.
    for (const role of ["munim_core", "munim_svc"] as const) {
      let last = "";
      for (let attempt = 1; attempt <= 6; attempt++) {
        const c = new pg.Client({ connectionString: config.dbUrl(role), connectionTimeoutMillis: 15_000 });
        try {
          await c.connect();
          const r = await c.query<{ u: string }>("SELECT current_user AS u");
          record(`runtime login ${role} (transaction pooler)`, r.rows[0]!.u === role, `current_user ${r.rows[0]!.u}${attempt > 1 ? ` (attempt ${attempt})` : ""}`);
          last = "";
          break;
        } catch (e) {
          last = code(e);
          if (last !== "28P01" || attempt === 6) break;
          await new Promise((ok) => setTimeout(ok, 10_000));
        } finally {
          await c.end().catch(() => {});
        }
      }
      if (last) record(`runtime login ${role} (transaction pooler)`, false, `error ${last}`);
    }
    const listen = new pg.Client({ connectionString: config.sessionDbUrl("munim_core"), application_name: "munim_stream_listen", connectionTimeoutMillis: 15_000 });
    try {
      await listen.connect();
      await listen.query("LISTEN munim_bootstrap_probe");
      const got = new Promise<boolean>((ok) => {
        const t = setTimeout(() => ok(false), 5_000);
        listen.on("notification", (n) => { if (n.channel === "munim_bootstrap_probe") { clearTimeout(t); ok(true); } });
      });
      await admin.query("NOTIFY munim_bootstrap_probe, 'probe'");
      record("LISTEN/NOTIFY as munim_core (session pooler)", await got, "notification received within 5 s");
    } catch (e) {
      record("LISTEN/NOTIFY as munim_core (session pooler)", false, `error ${code(e)}`);
    } finally {
      await listen.end().catch(() => {});
    }
  } catch (e) {
    say(`bootstrap-dev-db: FAIL — ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    await admin.end().catch(() => {});
  }
  const failed = results.filter((r) => !r.pass).length;
  say(`bootstrap-dev-db: ${results.length - failed} pass, ${failed} fail`);
  return failed === 0 ? 0 : 1;
}

process.exit(await main());
