// The second process of the two-process gate: the serverless boot exactly as a host runs it (env-root's composeFromEnv, env
// only), then one call of its tick route with the cron bearer. Prints the route's status and body as one JSON line and exits.
import { composeFromEnv } from "../../../../../services/core-api/src/env-root.ts";

const api = await composeFromEnv(process.env);
const res = await api.app.request("/internal/cron/v1/tick", { method: "POST", headers: { Authorization: `Bearer ${process.env.MUNIM_CRON_SECRET}` } });
process.stdout.write(`${JSON.stringify({ status: res.status, body: await res.json() })}\n`);
await api.close();
process.exit(0); // the tick's worker pools are not the app's to close; the process ends here
