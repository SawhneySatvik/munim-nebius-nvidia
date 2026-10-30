// `make demo`, first step: Cobnut Bakehouse is provisioned by a platform operator (its "Sample data" flag, Munim Cares and its AI
// budget are platform settings an operator approves), and the local database starts with none. This adds the one operator the
// seed signs in as (`worldgen-cobnut-operator`, a synthetic address that can receive no mail) as the local cluster's superuser.
// `--world=<w>` adds that world's operator instead (`worldgen-<w>-operator`), for the other demo businesses (blr_kitchen …).
// Local only: it reads the throwaway database's address and password from .run/local, which `make up` writes. Prints no secret.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { personaIdentity } from "../../tools/worldgen/src/api.ts";
import { WORLDS } from "../../tools/worldgen/src/run.ts";

const dir = resolve(process.env.MUNIM_RUN_DIR || join(import.meta.dirname, "../../.run/local"));
const { url } = JSON.parse(readFileSync(join(dir, "local-db.json"), "utf8")) as { url: string };
// The local cluster gives its superuser and every runtime role the same throwaway password (scripts/dev/local-db.ts).
const { roles } = JSON.parse(readFileSync(join(dir, "db-roles.json"), "utf8")) as { roles: Record<string, string> };
const at = new URL(url);
if (at.hostname !== "127.0.0.1") throw new Error("local-operator: the database in local-db.json is not on 127.0.0.1; stop");
const args = process.argv.slice(2);
const world = /^--world=([a-z_]+)$/.exec(args[0] ?? "")?.[1] ?? (args.length ? "" : "cobnut");
if (args.length > 1 || !(WORLDS as readonly string[]).includes(world)) throw new Error(`usage: local-operator.ts [--world=<${WORLDS.join("|")}>]`);
const operator = personaIdentity(world, "operator");
const client = new pg.Client({ host: at.hostname, port: Number(at.port), database: at.pathname.slice(1), user: "postgres", password: roles.munim_core });
await client.connect();
try {
  const r = await client.query("INSERT INTO platform.operator (id, idp_sub, email) VALUES (gen_random_uuid(), $1, $2) ON CONFLICT (idp_sub) DO NOTHING",
    [operator.sub, operator.email]);
  console.log(`local-operator: ${r.rowCount ? "added" : "already present"}: ${operator.sub}`);
} finally {
  await client.end();
}
