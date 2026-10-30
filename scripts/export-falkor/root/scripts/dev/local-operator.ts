// `make demo`, first step: Cobnut Bakehouse is provisioned by a platform operator (its "Sample data" flag, Munim Cares and its AI
// budget are platform settings an operator approves), and the local database starts with none. This adds the one operator the
// seed signs in as (`worldgen-cobnut-operator`, a synthetic address that can receive no mail) as the local cluster's superuser.
// Local only: it reads the throwaway database's address and password from .run/local, which `make up` writes. Prints no secret.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { personaIdentity } from "../../tools/worldgen/src/api.ts";

const dir = resolve(process.env.MUNIM_RUN_DIR || join(import.meta.dirname, "../../.run/local"));
const { url } = JSON.parse(readFileSync(join(dir, "local-db.json"), "utf8")) as { url: string };
// The local cluster gives its superuser and every runtime role the same throwaway password (scripts/dev/local-db.ts).
const { roles } = JSON.parse(readFileSync(join(dir, "db-roles.json"), "utf8")) as { roles: Record<string, string> };
const at = new URL(url);
const operator = personaIdentity("cobnut", "operator");
const client = new pg.Client({ host: at.hostname, port: Number(at.port), database: at.pathname.slice(1), user: "postgres", password: roles.munim_core });
await client.connect();
try {
  const r = await client.query("INSERT INTO platform.operator (id, idp_sub, email) VALUES (gen_random_uuid(), $1, $2) ON CONFLICT (idp_sub) DO NOTHING",
    [operator.sub, operator.email]);
  console.log(`local-operator: ${r.rowCount ? "added" : "already present"}: ${operator.sub}`);
} finally {
  await client.end();
}
