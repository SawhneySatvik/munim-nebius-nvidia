// `make seed` helper (R44a): prints a JSON {persona: token} signed with the dev server's persistent local key —
// but only if the server at --url reports `idp: "local"` on /health. Against a supabase-mode (or unreachable, or
// unreadable) server it refuses with exit 1 and prints no token. Lives here, not in tools/worldgen/src, because
// worldgen's src may reach only the public SDK (gate d). Usage: --world=<w> --url=<base> [--run-dir=<dir>]
// Opt-in, from the environment (so `make demo`, which spawns this, passes them through unchanged):
//   MUNIM_SEED_OPERATOR=1   also print an "operator" token (sub worldgen-<world>-operator, never tagged): worldgen then sets the
//                           business's AI budget (R47 D2). Needs that platform.operator row; `make up LOCAL_DB=1` inserts none.
//   MUNIM_SEED_SUB_TAG=<t>  sign the world's personas as worldgen-<world>-<persona>-<t>: the onboarded tenant id hashes the sub,
//                           so a database that already holds a world's tenant gets a fresh one alongside instead of a replay.
import { resolve } from "node:path";
import { createPersistentLocalIdp } from "./index.ts";
import { loadWorld, WORLDS, type WorldName } from "../../../tools/worldgen/src/run.ts";
import { personaIdentity } from "../../../tools/worldgen/src/api.ts";

const arg = (name: string): string | undefined => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

try {
  const known = new Set(["world", "url", "run-dir"]);
  for (const a of process.argv.slice(2)) if (!/^--([a-z-]+)=/.test(a) || !known.has(/^--([a-z-]+)=/.exec(a)![1]!)) throw new Error(`unknown argument ${a}`);
  const world = arg("world");
  const url = arg("url");
  if (!world || !url) throw new Error("--world and --url are required");
  if (!(WORLDS as readonly string[]).includes(world)) throw new Error(`--world must be one of ${WORLDS.join(", ")}`);
  let idp: unknown;
  try {
    idp = ((await (await fetch(new URL("/health", url))).json()) as { idp?: unknown }).idp;
  } catch {
    throw new Error("cannot read /health from the server, so it cannot be confirmed as a local-IdP dev server");
  }
  if (idp !== "local") throw new Error(`the server reports idp=${JSON.stringify(idp)}, not "local" — refusing to mint tokens`);
  const local = createPersistentLocalIdp(resolve(arg("run-dir") ?? resolve(import.meta.dirname, "../../../.run")));
  const operator = process.env.MUNIM_SEED_OPERATOR;
  if (operator !== undefined && operator !== "1") throw new Error("MUNIM_SEED_OPERATOR must be exactly 1 when set");
  const tag = process.env.MUNIM_SEED_SUB_TAG;
  if (tag !== undefined && !/^[a-z0-9]{1,16}$/.test(tag)) throw new Error("MUNIM_SEED_SUB_TAG must be 1-16 of [a-z0-9] when set");
  const personas = (await loadWorld(world as WorldName)).meta.personas;
  const sign = (p: string) => {
    const id = personaIdentity(world, p);
    return local.sign(tag ? { ...id, sub: `${id.sub}-${tag}` } : id);
  };
  const tokens = Object.fromEntries(personas.map((p) => [p, sign(p)]));
  console.log(JSON.stringify(operator ? { ...tokens, operator: local.sign(personaIdentity(world, "operator")) } : tokens));
} catch (e) {
  console.error(`mint-seed-tokens: FAIL — ${(e as Error).message}`);
  process.exit(1);
}
