// `make up` preflight: everything the services read at boot exists before any of them starts, so two processes
// never race to generate the run-token key pair. Prints names and counts only — never a value.
import { resolve } from "node:path";
import { createLogger, loadRepoConfig, resolveIdpMode } from "../../packages/config/src/index.ts";
import { ensureDevRunTokenKeys } from "../../services/core-api/src/runtoken/keys.ts";

const root = resolve(import.meta.dirname, "../..");
const config = loadRepoConfig(root);
const log = createLogger(config, (l) => console.error(l));
try {
  // Same refusals as core-api's boot (unknown value, production, non-dev), so `make up` fails before starting anything.
  const idp = resolveIdpMode(process.env, []);
  const keys = ensureDevRunTokenKeys(config.runTokenKeyDir);
  config.serviceSecret();
  // Both throw (naming the variable or file, never a value) if anything a service needs is missing.
  for (const role of ["munim_core", "munim_svc"] as const) config.dbUrl(role);
  config.sessionDbUrl("munim_core");
  console.log(`preflight: ok — database ${process.env.MUNIM_DATABASE_URL ? "local Postgres (MUNIM_DATABASE_URL)" : "MUNIM_DB_URL_* (or their dev names in .env)"}; `
    + `run-token keys ${keys.created ? "generated" : "present"}; service secret present; intel ${config.intelUrl}; core-api port ${config.port}; `
    + `sign-in ${idp === "local" ? "LOCAL (dev only — not for real users, MUNIM_IDP=local)" : idp}`);
} catch (e) {
  // ConfigError messages name a variable or file, never a value; anything else is logged redacted in full.
  if (e instanceof Error && e.name === "ConfigError") log(`preflight: FAIL — ${e.message}`);
  else log("preflight: FAIL —", e);
  process.exit(1);
}
