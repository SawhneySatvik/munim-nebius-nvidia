// The real error envelope: {error:{code,message,reason_code}} (packages/contracts/src/shared/error.ts). Messages are
// fixed text chosen by code / reason code, copied in spirit from services/core-api/src/lib/errors.ts.
export type ErrorCode = "bad_request" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "idempotency_conflict" | "invalid_payload" | "loyalty_refused" | "unavailable";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400, unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409, idempotency_conflict: 409, invalid_payload: 422, loyalty_refused: 409, unavailable: 429,
};
const MESSAGES: Record<ErrorCode, string> = {
  bad_request: "The request is not valid.",
  unauthenticated: "Sign in again.",
  forbidden: "You are not allowed to do this.",
  not_found: "Not found.",
  conflict: "This changed since you loaded it.",
  idempotency_conflict: "This request key was already used for a different request.",
  invalid_payload: "This proposal or your changes are not valid.",
  loyalty_refused: "There are not enough loyalty points for this.",
  unavailable: "The service is unavailable.",
};
const REASONS: Record<string, string> = {
  window_full: "That pickup time just filled up. Please choose another.",
  outlet_paused: "This outlet stopped taking orders a moment ago.",
  item_sold_out: "An item just sold out. Remove it to continue.",
  deal_rejudged: "A deal is not available at that time, so your total changed.",
  coupon_invalid: "This coupon is not valid.",
  coupon_cap_reached: "This coupon has reached its limit.",
  coupon_min_spend: "Spend a little more to use this coupon.",
  coupon_expired: "This coupon has expired.",
  coupon_out_of_scope: "This coupon does not apply to this order.",
  change_window_closed: "It's too late to change this order online. Please call the outlet.",
  item_unavailable: "This item is not available.",
  guest_cannot_change: "Call the outlet to change this order",
  preview_total_changed: "The total changed since the preview. Review it and try again.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  pickup_time_outside_window: "That pickup time is outside the pickup window you chose.",
};

/** A refusal's typed parameters ride beside `error` (the contract's storefront.refusal-error), only when it has any. */
export class MockError extends Error {
  constructor(readonly code: ErrorCode, readonly reason: string | null = null, readonly params?: Record<string, unknown>) { super(code); }
  get status(): number { return STATUS[this.code]; }
  body() {
    return { error: { code: this.code, message: (this.reason && REASONS[this.reason]) || MESSAGES[this.code], reason_code: this.reason }, ...(this.params ? { params: this.params } : {}) };
  }
}
