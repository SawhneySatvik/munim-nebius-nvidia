// Tiny strict-shape checks that mirror the contract's z.strictObject request bodies without a runtime dependency.
import { UUID7 } from "./util";

export type V = (x: unknown) => boolean;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export const strict = (shape: Record<string, V>): V => (x) => {
  if (!isObj(x)) return false;
  const keys = Object.keys(shape);
  return Object.keys(x).length === keys.length && keys.every((k) => k in x && shape[k]!(x[k]));
};
export const str = (min = 1, max = 200): V => (x) => typeof x === "string" && x.length >= min && x.length <= max;
export const re = (r: RegExp): V => (x) => typeof x === "string" && r.test(x);
export const int = (min = -Infinity): V => (x) => Number.isInteger(x) && (x as number) >= min;
export const bool: V = (x) => typeof x === "boolean";
export const nullable = (v: V): V => (x) => x === null || v(x);
export const arr = (v: V, min = 0, max = 1000): V => (x) => Array.isArray(x) && x.length >= min && x.length <= max && x.every(v);
export const lit = (s: string): V => (x) => x === s;
export const oneOf = (...s: string[]): V => (x) => typeof x === "string" && s.includes(x);

export const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
export const iso: V = (x) => typeof x === "string" && ISO.test(x) && !Number.isNaN(Date.parse(x));
export const uuid7: V = re(UUID7);
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,100}$/;
export const COUPON = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

export const envelope = (type: string, payload: V): V =>
  strict({ command_id: uuid7, idempotency_key: re(IDEMPOTENCY_KEY), type: lit(type), payload });

const money = strict({ amount_minor: int(), currency: re(/^[A-Z]{3}$/) });
const E164 = re(/^\+[1-9][0-9]{6,14}$/);

export const PREVIEW_REQ: V = strict({
  outlet_id: uuid7, channel_id: uuid7, brand_id: nullable(uuid7), kind: oneOf("dine_in", "takeaway", "pickup", "delivery"),
  pickup_window_id: nullable(uuid7), promised_at: nullable(iso), coupon_codes: arr(re(COUPON), 0, 5), loyalty_redeem_points: int(0),
  lines: arr(strict({
    item_id: uuid7, variant_id: nullable(uuid7), option_ids: arr(uuid7), qty_milli: int(1), barcode: nullable(re(/^[0-9A-Za-z-]{4,32}$/)),
  }), 1),
});

export const PLACE_PAYLOAD: V = strict({
  order_id: uuid7, outlet_id: uuid7, channel_id: uuid7, brand_id: nullable(uuid7), device_id: nullable(uuid7),
  kind: oneOf("dine_in", "takeaway", "pickup", "delivery"), table_ref: nullable(str(1, 20)), pickup_window_id: nullable(uuid7),
  promised_at: nullable(iso), external_ref: nullable(str(1, 100)),
  lines: arr(strict({
    line_id: uuid7, item_id: uuid7, variant_id: nullable(uuid7), option_ids: arr(uuid7), qty_milli: int(1),
    barcode: nullable(re(/^[0-9A-Za-z-]{4,32}$/)), note: nullable(str(0, 200)),
  }), 1),
  coupon_codes: arr(re(COUPON), 0, 5), loyalty_redeem_points: int(0), preview_total_minor: nullable(int()),
  client_totals: nullable(strict({ subtotal: money, total: money })),
});

export const PLACE_REQ: V = strict({
  order: envelope("orders.place.v1", PLACE_PAYLOAD),
  guest: nullable(envelope("storefront.guest.create.v1", strict({
    name: str(), phone: nullable(E164), email: nullable(re(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    consent: strict({ marketing: bool, at: iso }),
  }))),
  contact: nullable(strict({ name: str(), phone: nullable(E164) })),
});

export const RESCHEDULE_PREVIEW_REQ: V = strict({ pickup_window_id: nullable(uuid7), promised_at: iso });
export const CANCEL_CMD: V = envelope("storefront.order.cancel.v1", strict({
  order_id: uuid7, reason: nullable(oneOf("changed_mind", "ordered_by_mistake", "wait_too_long", "other")),
}));
export const RESCHEDULE_CMD: V = envelope("storefront.order.reschedule.v1", strict({
  order_id: uuid7, pickup_window_id: nullable(uuid7), promised_at: iso, preview_total_minor: int(),
}));
