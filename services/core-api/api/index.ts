import { handle } from "hono/vercel";
import { composeFromEnv } from "../src/env-root.ts";

const api = await composeFromEnv(process.env);

export default handle(api.app);
