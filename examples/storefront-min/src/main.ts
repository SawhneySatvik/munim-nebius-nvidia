// Minimal storefront flow against the Munim mock API (synthetic data, nothing is paid): list outlets, read the menu,
// preview an order, place it as a guest, then follow its status over SSE (GET /v1/stream). Imports only @munim/sdk.
import { createMunimClient, openStream, uuidv7 } from "@munim/sdk";

const API = process.env.MUNIM_API_URL ?? "http://localhost:3000/mock";
const KEY = process.env.MUNIM_STOREFRONT_KEY ?? "sfk_mock_spice_route_7f3a91c2";
const WAIT_S = Number(process.env.MUNIM_WAIT_S ?? 60);

const fail = (what: string, status?: number, reason?: string | null): never => {
  throw new Error(`${what} failed${status ? ` (HTTP ${status})` : ""}${reason ? ` [${reason}]` : ""}`);
};
const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;

const client = createMunimClient({ baseUrl: API, storefrontKey: KEY });

const outlets = await client.GET("/v1/storefront/outlets");
if (!outlets.data) fail("outlets", outlets.response.status);
const outlet = outlets.data!.outlets[0]!;
console.log(`outlets: ${outlets.data!.outlets.map((o) => o.name).join(", ")}`);

const menu = await client.GET("/v1/storefront/outlets/{outlet_id}/menu", { params: { path: { outlet_id: outlet.outlet_id } } });
if (!menu.data) fail("menu", menu.response.status);
const item = menu.data!.items.find((i) => i.available && i.price_minor !== null && i.variants.length === 0 && i.option_groups.every((g) => !g.required));
if (!item) fail("menu has no simple available item");
// display_name is plain text the owner entered (render it as text); null = fall back to your own label for name_key.
console.log(`menu: ${menu.data!.items.length} items, accepting=${menu.data!.accepting.state}; ordering "${item!.display_name ?? item!.name_key}" at ${money(item!.price_minor!, item!.currency)}${menu.data!.prices_include_tax ? " (tax included)" : " + tax"}`);
// The key's channel: send it as channel_id (client ids are UUIDv7, from the SDK).
const channelId = menu.data!.channel_id;

const lines = [{ item_id: item!.item_id, variant_id: null, option_ids: [], qty_milli: 1000, barcode: null }];
const preview = await client.POST("/v1/storefront/orders:preview", {
  body: { outlet_id: outlet.outlet_id, channel_id: channelId, brand_id: null, kind: "pickup", pickup_window_id: null, promised_at: null, coupon_codes: [], loyalty_redeem_points: 0, lines },
});
if (!preview.data || preview.data.refusals.length) fail("preview", preview.response.status, preview.data?.refusals[0]?.reason_code);
const taxLines = preview.data!.tax_components.map((t) => `${t.code} ${t.rate_bp / 100}% ${money(t.amount_minor, preview.data!.currency)}`).join(", ");
console.log(`preview: server total ${money(preview.data!.total_minor, preview.data!.currency)} (${taxLines || "no tax"})`);

// One checkout attempt = one set of ids; retry a network failure with exactly these.
const orderId = uuidv7();
const placed = await client.POST("/v1/storefront/orders", {
  body: {
    order: {
      command_id: uuidv7(), idempotency_key: `place-${orderId}`, type: "orders.place.v1",
      payload: {
        order_id: orderId, outlet_id: outlet.outlet_id, channel_id: channelId, brand_id: null, device_id: null, kind: "pickup", table_ref: null,
        pickup_window_id: null, promised_at: null, external_ref: null,
        lines: lines.map((l) => ({ ...l, line_id: uuidv7(), note: null })),
        coupon_codes: [], loyalty_redeem_points: 0, preview_total_minor: preview.data!.total_minor, client_totals: null,
      },
    },
    guest: {
      command_id: uuidv7(), idempotency_key: `guest-${orderId}`, type: "storefront.guest.create.v1",
      payload: { name: "Test Guest (synthetic)", phone: null, email: null, consent: { marketing: false, at: new Date().toISOString() } },
    },
    contact: null,
  },
});
if (!placed.data) fail("place order", placed.response.status, placed.error?.error.reason_code);
const guestToken = placed.data!.guest_access_token;
if (!guestToken) fail("place order returned no guest token");
console.log(`placed: ticket ${placed.data!.ticket_no}, total ${money(placed.data!.total_minor, placed.data!.currency)}, status ${placed.data!.status}, pay at the counter`);

// Tracking: the SSE stream with the one-time guest token; on each event, re-read the order (events carry ids and statuses only).
const tracker = createMunimClient({ baseUrl: API, storefrontKey: KEY, guestToken: guestToken! });
let status = placed.data!.status;
await new Promise<void>((done, failed) => {
  const timer = setTimeout(() => { stream.close(); failed(new Error(`order still "${status}" after ${WAIT_S}s`)); }, WAIT_S * 1000);
  const stream = openStream({
    baseUrl: API, topics: [`order:${orderId}`], guestToken: guestToken!, headers: () => ({ "X-Munim-Storefront-Key": KEY }),
    onEvent: async (e) => {
      const order = await tracker.GET("/v1/storefront/orders/{id}", { params: { path: { id: orderId } } });
      if (!order.data) return failed(new Error(`track order failed (HTTP ${order.response.status})`));
      status = order.data.status;
      console.log(`event ${e.type}: status ${status} (events: ${order.data.events.length})`);
      if (status !== "placed") { clearTimeout(timer); stream.close(); done(); }
    },
  });
  stream.done.catch((err: unknown) => { clearTimeout(timer); failed(err); });
});
console.log(`done: order is now ${status}`);
