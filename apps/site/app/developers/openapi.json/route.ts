// The public OpenAPI document, served as a static file: packages/contracts/generated/openapi/public.json as generated.
// The generator prunes it to the public surface itself, so nothing is re-pruned here.
import { publicDocument } from "../../../lib/openapi.ts";

export const dynamic = "force-static";

export function GET() {
  return Response.json(publicDocument());
}
