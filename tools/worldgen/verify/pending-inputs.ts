// Answer-key fields the recompute still reads from the KEY because no public read route returns them (R3-M7).
// Each is a route the owning lane must add (every number on screen is a row's own field, R26); when it lands the
// recompute switches to the row, the entry is deleted here, and test/pending-inputs.test.ts keeps the list honest:
// a new `w.<field>` read that is neither a locator nor listed here fails, and so does an entry no longer read.
export interface PendingInput { kind: string; field: string; owner: string; route: string }

// T-092 served the catalogue recipes, prices and coupons, so the last eight entries are retired: the recompute reads those rows and the key's
// figures (recipe quantity, waste and yield, the price's day, recipe versions, the coupon cap) are checks it compares the rows against.
export const PENDING_INPUTS: readonly PendingInput[] = [];

/** Key fields that only LOCATE rows (ids, refs, window offsets) or CHECK what the rows say (a count, a bound) — never a number the answer is computed
 *  from. Every `where` field of every key entry must be listed here or pending above (verify/coverage.ts), for every kind in the four keys. */
export const LOCATORS: Readonly<Record<string, readonly string[]>> = {
  above_mrp: ["batch", "ingredient", "item", "outlet"],
  ad_cap_excess: ["channel", "outlet", "payout_refs"],
  ad_within_cap: ["channel", "payout_refs"],
  advance_outstanding: ["outlet", "staff"],
  amc_overlap: ["asset"],
  amc_waste: ["asset"],
  cash_variance: ["orders", "outlet", "shift"],
  cost_drift: ["ingredient", "item", "outlet", "price_set_offset", "recipe_qty_milli", "recipe_waste_bp", "recipe_yield_milli", "since_offset"],
  cost_drift_held: ["ingredient", "outlet", "price_set_offset"],
  coupon_cap_evasion: ["coupon", "decoy_q", "per_customer_cap", "phone"],
  coupon_discount: ["coupon", "orders", "persona"],
  event_ahead: ["kind", "label", "lookahead_days", "outlet"],
  expired_batch: ["batch", "ingredient", "outlet"],
  expiry_risk: ["batch", "ingredient", "outlet", "within_days"],
  invoice_overbilled: ["invoice", "po"],
  lapsed_regulars: ["from_offset", "outlet", "phones", "silent_since_offset", "to_offset"],
  level_shift: ["outlet", "shift_offset", "window_days"],
  licence_expiring: ["licence", "outlet"],
  line_discount: ["bill_prefix", "outlet"],
  margin_bridge: ["compare_month_offset", "held_payout_ref", "ingredients", "outlets", "period_month_offset"],
  missed_logs: ["checklist", "days", "from_offset", "outlet", "to_offset"],
  missing_cycle: ["channel", "outlet", "payout_ref"],
  missing_payout: ["external_refs", "outlet"],
  near_duplicate_invoice: ["invoices"],
  no_marketing_consent: ["phones"],
  overstaffed_slot: ["from_offset", "outlet", "staff", "to_offset"],
  overtime_drift: ["from_offset", "outlet", "staff", "to_offset"],
  price_creep: ["ingredient", "post_invoices", "pre_invoices"],
  recipe_missing: ["bill_prefix", "item", "outlet", "recipe_versions"],
  recipe_waste_gap: ["from_offset", "ingredient", "outlet", "recipe_waste_bp", "to_offset", "waste_offsets"],
  refund_burst: ["bill_prefix", "outlet"],
  remake_voids: ["bill_prefix", "outlet"],
  short_commission: ["channel", "outlet", "payout_refs"],
  shrinkage: ["batch", "ingredient", "outlet", "pct_bp"],
  stock_below_reorder: ["ingredient", "outlet"],
  temp_excursion: ["asset", "ingredient", "logs", "out_of_range", "outlet", "waste_offsets"],
  tender_gap: ["method", "outlet"],
  unapproved_ad_fee: ["channel", "outlet", "payout_refs"],
  void_burst: ["bill_prefix", "outlet"],
  waste_value: ["ingredient", "outlet", "waste_offsets"],
};

/** Numeric `where` values allowed in a key: window offsets and bounds the recompute asserts against the rows (plus the pending inputs above). */
export const CHECK_FIELDS: readonly string[] = ["out_of_range", "within_days", "days", "lookahead_days", "window_days", "pct_bp",
  "recipe_qty_milli", "recipe_waste_bp", "recipe_yield_milli", "recipe_versions", "per_customer_cap"];
