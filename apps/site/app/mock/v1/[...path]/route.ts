// Catch-all so paths like /orders:preview and /orders/{id}:cancel need no dynamic-segment tricks. Base URL: <site>/mock
import { handle } from "../../../../mock/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
