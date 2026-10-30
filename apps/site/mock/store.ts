// In-memory state, per server instance (a serverless cold start or a new instance resets it — documented in README).
import type { Priced } from "./pricing";

export type StoredOrder = {
  id: string; biz: string; outletIdx: number; kind: string; ownerCustomer: string | null; guestTokenHash: string | null;
  createdAt: Date; ticketNo: number; businessDate: string; windowId: string | null; promisedAt: Date | null;
  lines: Array<{ item_id: string; variant_id: string | null; option_ids: string[]; qty_milli: number }>; couponCodes: string[];
  priced: Priced; cancelledAt: Date | null; promiseEvents: Array<{ from: Date | null; to: Date | null; at: Date }>;
};
export type Stored = { hash: string; status: number; body: unknown };

export const store = {
  orders: new Map<string, StoredOrder>(),
  idem: new Map<string, Stored>(),
  tickets: new Map<string, number>(),
  extraBooked: new Map<string, number>(),
};
export const clock = { now: (): Date => new Date() };

// A public mock with shared keys on a long-lived server must not grow without bound, and one visitor must not be able to
// fill every pickup window for the others: every map is capped (oldest evicted first, Map insertion order) and each
// business holds at most MAX_ORDERS_PER_BUSINESS orders, so at most that many window seats are ever taken by visitors.
export const LIMITS = { orders: 500, ordersPerBusiness: 30, idem: 2000, tickets: 500, extraBooked: 2000 };

function trim<V>(m: Map<string, V>, max: number, onEvict?: (k: string, v: V) => void): void {
  while (m.size > max) {
    const [k, v] = m.entries().next().value as [string, V];
    m.delete(k);
    onEvict?.(k, v);
  }
}

/** An evicted order gives its window seat back (a cancelled one already did). */
function release(o: StoredOrder): void {
  if (o.cancelledAt || !o.windowId) return;
  const k = `${o.biz}|${o.windowId}`;
  const n = (store.extraBooked.get(k) ?? 0) - 1;
  if (n > 0) store.extraBooked.set(k, n);
  else store.extraBooked.delete(k);
}

export function putOrder(o: StoredOrder): void {
  store.orders.set(o.id, o);
  const mine = [...store.orders.values()].filter((x) => x.biz === o.biz);
  for (const old of mine.slice(0, Math.max(0, mine.length - LIMITS.ordersPerBusiness))) (store.orders.delete(old.id), release(old));
  trim(store.orders, LIMITS.orders, (_, old) => release(old));
}
export function putIdem(k: string, v: Stored): void {
  store.idem.set(k, v);
  trim(store.idem, LIMITS.idem);
}
export function putTicket(k: string, n: number): void {
  store.tickets.set(k, n);
  trim(store.tickets, LIMITS.tickets);
}
export function putBooked(k: string, n: number): void {
  store.extraBooked.set(k, n);
  trim(store.extraBooked, LIMITS.extraBooked);
}

/** Forgets one business's state (the caller's own storefront key); every other business is untouched. */
export function resetBusiness(slug: string): void {
  for (const [k, o] of store.orders) if (o.biz === slug) store.orders.delete(k);
  for (const k of store.idem.keys()) if (k.startsWith(`${slug}|`)) store.idem.delete(k);
  for (const k of store.tickets.keys()) if (k.startsWith(`${slug}|`)) store.tickets.delete(k);
  for (const k of store.extraBooked.keys()) if (k.startsWith(`${slug}|`)) store.extraBooked.delete(k);
}
