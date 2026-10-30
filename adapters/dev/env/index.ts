// The dev mapping (T-122): this repo's development and Vercel deployment name their database and sign-in settings by
// Supabase's names (the founder's `.env.example`, CLAUDE.md rule 20, and the env `deploy/vercel/env-setup.ts` sends),
// and use Supabase Auth and Storage. packages/config loads this file when it exists (`devEnv`), so those names keep
// working permanently here while every exported path reads only the neutral names. Not part of the Cup export (R54 P-4).
//   SUPABASE_SESSION_POOLER_CONNECTION_STRING      stands in for MUNIM_DB_URL_SESSION
//   SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING  stands in for MUNIM_DB_URL_TRANSACTION
//   SUPABASE_PROJECT_ID                            a runtime role logs in as `<role>.<project id>` on those (the pooler's rule)
//   MUNIM_IDP=supabase (the default when unset)    Supabase Auth: SUPABASE_PROJECT_URL + SUPABASE_PUBLISHABLE_KEY
//   MUNIM_BLOB=supabase                            Supabase Storage: SUPABASE_PROJECT_URL + SUPABASE_SECRET_KEY + MUNIM_BLOB_BUCKET
// No value imports from packages/config: config awaits this module while it loads.
import type { Config, DevEnv } from "../../../packages/config/src/index.ts";
import { supabaseBlobStore } from "../blob-supabase/index.ts";
import { supabaseIdp } from "../idp-supabase/index.ts";

/** The `.env.example` names that are not neutral (packages/config's ENV_NAMES holds the rest). */
export const DEV_ENV_NAMES = [
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DIRECT_CONNECTION_STRING",
  "SUPABASE_DIRECT_CONNECTION_HOST",
  "SUPABASE_DIRECT_CONNECTION_PORT",
  "SUPABASE_DIRECT_CONNECTION_DATABASE",
  "SUPABASE_DIRECT_CONNECTION_USER",
  "SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING",
  "SUPABASE_TRANSACTION_POOLER_HOST",
  "SUPABASE_TRANSACTION_POOLER_PORT",
  "SUPABASE_TRANSACTION_POOLER_DATABASE",
  "SUPABASE_TRANSACTION_POOLER_USER",
  "SUPABASE_SESSION_POOLER_CONNECTION_STRING",
  "SUPABASE_SESSION_POOLER_HOST",
  "SUPABASE_SESSION_POOLER_PORT",
  "SUPABASE_SESSION_POOLER_DATABASE",
  "SUPABASE_SESSION_POOLER_USER",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

export const devEnv: DevEnv = {
  names: DEV_ENV_NAMES,
  // Connection strings carry the database password inside them (config registers it too).
  secretNames: [
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_DIRECT_CONNECTION_STRING",
    "SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING",
    "SUPABASE_SESSION_POOLER_CONNECTION_STRING",
    "UPSTASH_REDIS_REST_TOKEN",
  ],
  aliases: {
    MUNIM_DB_URL_SESSION: "SUPABASE_SESSION_POOLER_CONNECTION_STRING",
    MUNIM_DB_URL_TRANSACTION: "SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING",
  },
  // UNVERIFIED against the hosted project until the first login: Supavisor expects the user as `<role>.<project id>`.
  dbUser: (role: string, cfg: Config) => `${role}.${cfg.require("SUPABASE_PROJECT_ID")}`,
  idpModes: ["supabase"],
  idpDefault: "supabase",
  blobModes: ["supabase"],
  adapter(kind: "idp" | "blob", _mode: string, cfg: Config) {
    return kind === "idp"
      ? supabaseIdp({ projectUrl: cfg.require("SUPABASE_PROJECT_URL"), publishableKey: cfg.require("SUPABASE_PUBLISHABLE_KEY") })
      : supabaseBlobStore({ projectUrl: cfg.require("SUPABASE_PROJECT_URL"), secretKey: cfg.require("SUPABASE_SECRET_KEY"), bucket: cfg.blobBucket() });
  },
};
