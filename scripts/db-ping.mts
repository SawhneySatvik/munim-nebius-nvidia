// `make db-ping`: connect to the hosted dev database (R31) over the session pooler, through packages/config
// (rule 20: this script never opens `.env` itself), and print the server version and the pgvector extension
// version. Every line passes through the config's redaction; no host, URL or password is printed.
import { resolve } from "node:path";
import pg from "pg";
import { ConfigError, createLogger, loadRepoConfig, type Config } from "../packages/config/src/index.ts";

let config: Config;
try {
  config = loadRepoConfig(resolve(import.meta.dirname, ".."));
} catch (e) {
  // No redactor exists yet, so print only what ConfigError composes (names, never values).
  console.error(`db-ping: FAIL — config did not load: ${e instanceof ConfigError ? e.message : (e as Error).name} (R31)`);
  process.exit(1);
}
const say = createLogger(config, (l) => console.log(l));
const fail = createLogger(config, (l) => console.error(l));

let url: string;
try {
  url = config.require("SUPABASE_SESSION_POOLER_CONNECTION_STRING");
} catch (e) {
  fail(`db-ping: FAIL — ${(e as Error).message} (R31)`);
  process.exit(1);
}

let client: pg.Client | undefined;
try {
  // Constructed inside the try: a malformed connection string throws here, and that error quotes its input.
  client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  const version = await client.query<{ v: string }>("select current_setting('server_version') as v");
  const vector = await client.query<{ extversion: string }>("select extversion from pg_extension where extname = 'vector'");
  say("db-ping: ok (session pooler)");
  say(`server_version: ${version.rows[0]!.v}`);
  say(`vector extversion: ${vector.rows[0]?.extversion ?? "vector extension not installed"}`);
} catch (e) {
  // Code only: a driver message can quote the host; the code is enough to act on.
  const err = e as { code?: string; name?: string };
  fail(`db-ping: FAIL — could not query the session pooler: ${err.code ?? err.name ?? "error"}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
