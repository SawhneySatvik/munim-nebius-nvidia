// The munim-api core service's function entry (staged as out/core/index.mjs by build.mjs). Plain JavaScript and a
// computed import path on purpose: Vercel's Node builder compiles every TypeScript file it traces and renames it to
// .js, which breaks core-api's discovery of `<module>/index.ts` by path; with nothing traceable here, every staged
// file ships as is (`includeFiles` in vercel.json) and Node 24 strips the types at run time.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; core-api's tick route reads MUNIM_CRON_SECRET.
if (!process.env.MUNIM_CRON_SECRET && process.env.CRON_SECRET) process.env.MUNIM_CRON_SECRET = process.env.CRON_SECRET;

const root = pathToFileURL(join(import.meta.dirname, "services/core-api/src/env-root.ts")).href;
const { composeFromEnv } = await import(root);
const api = await composeFromEnv(process.env);

export default { fetch: (request) => api.app.fetch(request) };
