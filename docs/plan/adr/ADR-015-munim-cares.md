# ADR-015 · Munim Cares: surplus listings, simulated recipients, shared surplus offers

**Status:** proposed, revision 1 (12 Oct 2026; review fix cycle 1 and the founder's "Cares design answers").

**Ledger:** R15, R16, R21, R24–R30, R40, R43, R45 (F8), R46, R48 (F-1, F-2 incl. design answers 1–4).

**Depends on:** ADR-013 (book guard) and ADR-014 §2–§6.

**Amends:**
- the pack §6 rows of `inventory.expiry_risk` and `people.overstaffed_slot` (§4.3);
- the `CountryPack` schema and IN/AU v4;
- the contracts `Auth` union;
- `goals.task.create.v1` (an additive nullable field);
- BOARD T-095, which §8 replaces.

**Labels:** **FACT** = read in this repo at the cited file. **INFERENCE** = design reasoning. There are no legal claims in this ADR (founder answer 4).

## 0 · Decision in twelve lines

1. **Where Cares lives.** Cares is a core module (`modules/cares`) plus two mappings and two read templates on existing specialists. There is no new detector and no 9th specialist; F8 holds.
2. **Publishing.** Every listing is a **book row**. `cares.listing.publish.v1` may be used by an owner or judge only, as their own command or by approving an intel draft. Nothing auto-publishes (R16).
3. **Opt-in.** A tenant can opt in only after an **operator enables it**: a per-tenant flag set through an approved platform config draft (R24), never inferred from `is_demo`.
4. **Recipients.** Recipients come from an operator directory and are simulated only. A DB CHECK enforces this, and every name must contain "(simulated)".
5. **Matching** is SQL (`cares.recipient_match`): city, food kinds, capacity, window overlap, then distance. The owner confirms.
6. **Stock.** A hand-over (`recorded`, then a write-once `voided`) moves stock through bound rules, using the new kinds `donation`, `surplus_out` and `cares_reversal`. The total handed over is never more than the approved line.
7. **Network page.** One read-only SECURITY DEFINER function, with exact column grants, serves the public network page and the storefront section.
8. **B2B offers** are one-claim, all-or-nothing:
   - each tenant writes only its own rows;
   - three id-keyed definer reads connect the two sides;
   - the offerer's decision locks its listing row;
   - money is "Recorded, never processed" (founder answer 1).
9. **AI pieces:**
   - an `inventory.expiry_risk` mapping drafts a donation listing; its at-risk quantity is already net of forecast use, which is the forecast surplus;
   - a `people.overstaffed_slot` mapping drafts a pack-and-hand-over task for a rostered staff member;
   - the market skill reads `cares.listings` and `cares.impact`.
10. **Cooked food** is listed only by the owner's own command. In v1 there is no cooked-surplus detector and no prep-list widening.
11. **Impact.**
    - Each business sees its own impact as a member snapshot.
    - The **network total** ("meals shared across Munim") is an **operator-minted, operator-published network snapshot**. Its cells open publicly. It is labelled "to simulated recipients" always, and "Measured on synthetic data" whenever every contributor is a demo tenant.
12. **Country pack** v4 gains an optional `cares` block of operating values only. The screens carry one generic note: "Check your local food-donation rules".

## 1 · Data model — migration 0028 (`0028_cares.sql`, migrator lane; 0027 is T-098, FACT)

### 1.1 Platform tables (operator-managed; written by an approved `platform.config_draft` or the operator mint; `platform_audit`)

| Table | Columns | Rules |
|---|---|---|
| `platform.cares_city` | `code text PK ^[a-z][a-z0-9_]*$`, `country_code char(2)`, `name`, `status active\|retired` | |
| `platform.cares_recipient` | `id uuid PK`, `city_code → cares_city`, `name`, `kind ngo\|food_bank`, `simulated bool NOT NULL`, `accepts_cooked/raw/packaged bool`, `capacity_kg_per_day int ≥0`, `capacity_portions_per_day int ≥0`, `receiving_from/to time`, `lat_e6 int`, `lng_e6 int`, `status active\|retired` | `CHECK (simulated)`; `CHECK (name ~ '\(simulated\)')` |
| `platform.cares_enablement` | `tenant_id uuid PK`, `enabled bool`, `config_draft_id → config_draft`, `updated_at` | RLS as `llm_budget` (FACT 0002): `operator_all` for `munim_platform`; `tenant_read` for `munim_core` and `munim_svc` |
| `platform.network_snapshot` | `id uuid PK`, `template_id`, `template_version` (FK → `evidence.snapshot_template`), `params jsonb`, `rows jsonb`, `row_count`, `sha256`, `minted_by_operator_id → operator`, `created_at`, `published_at NULL`, `publish_draft_id NULL → config_draft` | Append-only. `published_at` and `publish_draft_id` are write-once, by trigger, and set together. |

**Grants** (revoke, then grant; no DELETE for any role):
- `munim_platform`:
  - SELECT on all four tables;
  - INSERT and pinned UPDATE on the city, recipient and enablement tables (never `id` or `simulated`);
  - UPDATE(`published_at`, `publish_draft_id`) on `network_snapshot`.
- `munim_core`: SELECT on all four, plus INSERT on `network_snapshot` (the operator mint runs on `munim_core`, as `platform/snapshots.ts` does, FACT).
- `munim_svc`: SELECT on city, recipient and enablement.

### 1.2 Tenant tables

These 9 tables are all in `core`, tagged **`munim:book`**, with RLS ENABLE + FORCE. Each has PK `(tenant_id, id)` unless noted, plus `origin` and `created_at`.

| Table | Columns |
|---|---|
| `cares_profile` | UNIQUE `tenant_id`; `status active\|paused`, `public_name`, `b2b_enabled` |
| `cares_outlet` | PK `(tenant_id, outlet_id)`; `city_code → platform.cares_city`, `lat_e6`, `lng_e6`, `pickup_from/to time`, `active` |
| `cares_listing` | `outlet_id`, `kind donation\|offer`, `status published\|allocated\|closed\|withdrawn`, `recipient_id → platform.cares_recipient NULL`, `pickup_from/to timestamptz`, `pickup_on date` (= `((pickup_from AT TIME ZONE outlet.tz) − business_day_cutoff)::date`, set by core), `published_by`, `published_at` |
| `cares_listing_line` | `listing_id`, `line_no`, `food_kind cooked\|raw\|packaged`, `item_id NULL`, `ingredient_id NULL`, `batch_id NULL`, `qty_milli >0`, `unit`, `expires_on NULL`, `unit_price_minor NULL`, `currency NULL` |
| `cares_handover` | `listing_id`, `outlet_id`, `allocation_id NULL`, `status recorded\|voided`, `handed_at` (stamped by core, never client-sent — DECISIONS 12 Oct), `recorded_by`, `voided_by`, `void_reason_code` |
| `cares_handover_line` | `handover_id`, `listing_line_id`, `qty_milli >0` |
| `cares_claim` (buyer's tenant) | `outlet_id`, `offer_tenant_id`, `offer_listing_id`, `allocation_id NULL` (the offerer's allocation, copied at receive), `status requested\|cancelled\|closed\|received`, `total_minor`, `currency`, `created_by` |
| `cares_claim_line` | `claim_id`, `offer_line_id`, `ingredient_id` (the buyer's own), `qty_milli`, `unit`, `unit_price_minor`, `expires_on`, `received_qty_milli NULL` (`≤ qty_milli`, set once by receive) |
| `cares_allocation` (offerer's tenant) | `listing_id`, `outlet_id`, `claim_tenant_id`, `claim_id`, `buyer_public_name`, `verdict accepted\|declined`, `total_minor`, `currency`, `decided_by`; UNIQUE `(tenant_id, claim_tenant_id, claim_id)`; partial UNIQUE `(tenant_id, listing_id) WHERE verdict = 'accepted'` (one accepted claim per offer) |

`core.task` gains `cares_listing_id uuid NULL`, with FK `(tenant_id, cares_listing_id)` → `cares_listing` (additive).

**Row CHECKs:**
- each line names exactly one of `item_id` / `ingredient_id`;
- cooked ⇔ `item_id`;
- a donation has a recipient and unpriced lines;
- an offer has no cooked lines and every line priced;
- MB003 applies to every currency column;
- `total_minor` is re-derived by core (rule 9).

**Triggers:**
- `received_qty_milli` can be set once, from NULL.
- Σ of non-voided hand-over lines per listing line must not exceed that line's `qty_milli`. This is checked on insert under the listing row lock (see §1.3); otherwise MB001.

**Policy and catalogue rows:**

| Item | Rule |
|---|---|
| RLS | `tenant_outlet_isolation` on outlet-bearing tables; `tenant_via_parent` on line tables (as in 0019); `tenant_isolation` on `cares_profile` |
| Shoppers | RESTRICTIVE `customer_scope` and `guest_scope` deny-all on every table |
| `book_scope` | `column outlet_id` on the five headers; `parent` on lines; `none` on the profile |
| `book_status_transition` | listing: published → closed / withdrawn / allocated; allocated → closed<br>claim: requested → cancelled / closed / received<br>hand-over: recorded → voided (the only row, so a second void and any un-void get MB004)<br>profile: active ↔ paused |

**Updates and roles:**
- UPDATE is column-pinned to `munim_core`:
  - `status` on listing, claim and hand-over (plus `voided_by` and `void_reason_code` on hand-over);
  - `status`, `public_name`, `b2b_enabled` on profile;
  - `city_code`, `lat_e6`, `lng_e6`, `pickup_*` and `active` on outlet;
  - `allocation_id` on claim;
  - `received_qty_milli` on claim line.
- `munim_svc` gets SELECT only, as 0005 does.
- `munim_intel_ro` gets nothing, and intel has no write grant (R25).
- The intel-write N/N manifest grows by **13**: the 9 core and 4 platform tables 0028 creates. That figure comes from the migration manifest, not from this ADR.

`origin` is creation provenance only (gotcha 34); later changes are traced through `audit_log`.

### 1.3 Commands (`command_authority` with `target_tables`; none draft-only)

| Command | Roles | Scope | Notes |
|---|---|---|---|
| `cares.profile.set.v1` | owner, judge | tenant | Requires `platform.cares_enablement.enabled`, the pack `cares` block (`cares_not_available`), and each city's country = the tenant's (R30, `cares_city_mismatch`). |
| `cares.listing.publish.v1` | owner, judge | outlet | Own command **or approved draft**; workflow draftable of `inventory_purchasing`. Cooked lines only through the own command. |
| `cares.listing.withdraw.v1` | owner, manager, judge | outlet | `published` only, so an offer cannot be withdrawn after acceptance. |
| `cares.handover.record.v1` | owner, manager, staff, judge | outlet | Locks the listing row `FOR UPDATE` first. Σ ≤ the approved line (trigger). For an offer: `allocation_id` must be the accepted allocation, and the claim must not be cancelled (inbound read). |
| `cares.handover.void.v1` | owner, judge | outlet | recorded → voided with a reason code. Refused (`claim_received`) once the buyer has received. |
| `cares.claim.create.v1` | owner, manager, judge | outlet | Buyer. Claims **all** offer lines at the offered qty (all-or-nothing). Price, qty and expiry come from `cares_market_offers` in the same transaction. |
| `cares.claim.cancel.v1` / `cares.claim.close.v1` | owner, manager, judge | outlet | Cancel only with no verdict yet. Close only when the outcome is declined. |
| `cares.claim.decide.v1` | owner, judge | outlet | Offerer. The payload carries `(claim_tenant_id, claim_id)`. Accept sets the listing → `allocated`. |
| `cares.claim.receive.v1` | owner, manager, staff, judge | outlet | Buyer. Allowed only when the outcome is accepted and handed over. Writes `allocation_id` and each line's `received_qty_milli` = the handed qty from `cares_claim_outcome`, in the same transaction. |

**Final-payload checks (R27):**
- the outlet is opted in;
- the recipient is active, simulated, in the city, and accepts each line's food kind;
- `pickup_to > now()`;
- `expires_on` ≥ `pickup_on` + pack `min_days_left_at_pickup`;
- cooked: pickup within pack `cooked_max_hold_min` of approval. This is an operating limit, never shown as a safety guarantee.
- `qty_milli` ≤ on-hand for raw/packaged lines.

**Cooked bound.** Σ prepped − Σ sold per dish is **not derivable**: prep lists carry ingredient lines only (FACT `contracts/src/kitchen/index.ts`). So a cooked hand-over is bounded by the approved listing line alone.

**Decide locking.** The handler's first statement is `SELECT … FROM core.cares_listing WHERE tenant_id = $1 AND id = $2 FOR UPDATE`. It runs after the `command_log` advisory lock (FACT `commit/execute.ts:144`) and before the audit inserts (`execute.ts:160`, whose chain trigger takes the per-tenant audit lock). It then takes `pg_advisory_xact_lock(hashtextextended('cares_claim:' ‖ claim_tenant_id ‖ ':' ‖ claim_id, 0))`; cancel and close take only that claim lock. The lock order is command_log, then listing, then claim, then audit, so there is no cycle. Two concurrent accepts give one `accepted`; the other gets `offer_closed`.

**New `ReasonCode`s:**
- setup: `cares_not_available`, `cares_not_enabled`, `cares_not_opted_in`, `cares_city_mismatch`;
- listing: `recipient_ineligible`, `listing_expired`, `qty_exceeds_on_hand`, `qty_exceeds_listed`, `cooked_hold_exceeded`, `line_expired`, `no_eligible_recipient`, `no_rostered_staff`;
- B2B: `offer_not_enabled`, `offer_closed`, `claim_decided`, `claim_received`;
- public: `rate_limited`.

### 1.4 Stock kinds and derivation rules

0005 declares two unnamed CHECKs on `core.stock_movement`: the column's kind list, and the table's sign `CASE` (FACT). 0028 pre-checks both generated names, drops both, and re-adds both by name. New kinds:
- `donation` (−) and `surplus_out` (−), the offerer leaving stock;
- `surplus_in` (+), the buyer receiving;
- `cares_reversal` (+), a void.

**Why not existing kinds:**
- Not `waste`: waste-week and over-prep filter `kind = 'waste'` (FACT 0021).
- Not `receipt`: cost bases read `kind = 'receipt'` (FACT), and a surplus buy must not become a "last receipt cost".

**Other effects:**
- On-hand is Σ over all kinds.
- `MOVEMENT_KINDS` in `modules/inventory/index.ts` (FACT, hard-coded) gains the four kinds.
- There are **no journal postings**, as for waste (FACT `inventory.record_waste`).

| Rule (`db/derivation-rules.json`, non-null `bindings`) | Source → targets | Source state | Binding |
|---|---|---|---|
| `inventory.cares_handover` | `cares_handover` → `stock_movement` | `s.status = 'recorded'` | Ref = this hand-over, at its outlet. Kind is `donation` for a donation listing, `surplus_out` for an offer. Ingredient/batch match a handed line; for a cooked line, an ingredient of the dish's recipe valid on the hand-over's business date. Σ \|qty\| per ingredient/batch ≤ what the handed lines imply. |
| `inventory.cares_handover_void` | `cares_handover` → `stock_movement` | `s.status = 'voided'` | Kind `cares_reversal`, same ref. **Cumulative:** Σ `cares_reversal` per ingredient/batch for the hand-over, including this row, ≤ Σ \|donation/surplus_out\| of that hand-over. |
| `inventory.cares_claim_receive` | `cares_claim` → `stock_movement`, `batch` | `s.status = 'received'` | Kind `surplus_in`, ref = this claim, at its outlet. The movement's ingredient and `qty_milli` must equal a claim line's ingredient and `received_qty_milli`. `received_qty_milli` ≤ that line's `qty_milli` (the accepted, all-or-nothing qty). The batch's `expires_on` = the line's. |

Cooked portions consume the recipe × N, FEFO. This happens in a new framework-free `core-domain/cares/derive.ts` that mirrors order consumption (FACT `inventory.consume_order`).

### 1.5 Definer functions (owner `munim_crosstenant`, `SET search_path = pg_catalog, pg_temp`, `REVOKE ALL FROM PUBLIC`; EXECUTE per row)

| Function | EXECUTE | Returns | Checks inside (gotcha 20) |
|---|---|---|---|
| `core.cares_network_listings(p_city, p_tenant, p_listing, p_after, p_limit ≤50)` | munim_core | `listing_id, city_code, business_name, outlet_name, pickup_from, pickup_to, recipient_name, recipient_simulated, lines[{line_no, food_kind, label_key, label, qty_milli, unit, expires_on}]` | Donation; `published`; `pickup_to > now()`; profile and outlet active; enablement on; tenant `status = 'active'`; **no active `judge` membership** in the tenant (excludes judge-session tenants) |
| `core.cares_market_offers(p_listing)` | munim_core | other tenants' published offers in the caller's opted-in cities: `offer_tenant_id, listing_id, business_name, outlet_name, pickup_*, lines[{offer_line_id, food_kind, label, qty_milli, unit, expires_on, unit_price_minor, currency}]` (offered qty is a row field; no computed remainder) | Caller `app.member_id` is an active owner, manager or judge of `app.tenant_id`, with an active, enabled, `b2b_enabled` profile. The **offerer's** profile is active, enabled and `b2b_enabled`, and the offerer is not retired or a judge tenant. |
| `core.cares_inbound_claims(p_listing)` | munim_core | claims on the caller's listing: `claim_tenant_id, claim_id, buyer_public_name, status, created_at, lines[{offer_line_id, qty_milli, unit_price_minor}]` | The listing's tenant = `app.tenant_id`. The member is active as owner, manager or judge, **or as staff whose `outlet_ids` cover the listing's outlet**. Lookups key on `(tenant_id, id)`. |
| `core.cares_claim_outcome(p_claim)` | munim_core | `verdict accepted\|declined\|none, allocation_id, decided_at, lines[{offer_line_id, handed_qty_milli}]` for the caller's own claim. "Declined" also covers: offer withdrawn, or allocated to another claim. | The claim's tenant = `app.tenant_id`. Same member/staff-outlet rule as above. |
| `core.cares_network_impact(p_from, p_to, p_city)` | munim_core | aggregate rows for §2.3 | `app.role = 'operator'`, and `app.operator_id` is an active `platform.operator`. Same tenant filters as the network listings. Donations only; voided hand-overs excluded. |

**Column grants to `munim_crosstenant`: exactly the returned and predicate columns, SELECT only.**

| Table | Columns |
|---|---|
| `core.tenant` | `tenant_id`, `status`, `is_demo`, `country_code` |
| `core.membership` | `tenant_id`, `member_id`, `role`, `outlet_ids`, `active` |
| `core.member` | `tenant_id`, `id`, `active` |
| `core.outlet` | `tenant_id`, `id`, `name` |
| `core.item` | `tenant_id`, `id`, `name_key` |
| `core.ingredient` | `tenant_id`, `id`, `name` |
| `cares_profile` | `tenant_id`, `status`, `public_name`, `b2b_enabled` |
| `cares_outlet` | `tenant_id`, `outlet_id`, `city_code`, `active` |
| `cares_listing` | `tenant_id`, `id`, `outlet_id`, `kind`, `status`, `recipient_id`, `pickup_from`, `pickup_to`, `pickup_on` |
| `cares_listing_line` | `tenant_id`, `id`, `listing_id`, `line_no`, `food_kind`, `item_id`, `ingredient_id`, `qty_milli`, `unit`, `expires_on`, `unit_price_minor`, `currency` |
| `cares_handover` | `tenant_id`, `id`, `listing_id`, `allocation_id`, `status`, `handed_at` |
| `cares_handover_line` | `tenant_id`, `handover_id`, `listing_line_id`, `qty_milli` |
| `cares_claim` | `tenant_id`, `id`, `outlet_id`, `offer_tenant_id`, `offer_listing_id`, `status`, `created_at` |
| `cares_claim_line` | `tenant_id`, `claim_id`, `offer_line_id`, `qty_milli`, `unit_price_minor` |
| `cares_allocation` | `tenant_id`, `id`, `listing_id`, `claim_tenant_id`, `claim_id`, `verdict`, `created_at` |
| `platform.cares_recipient` | `id`, `name`, `simulated`, `status` |
| `platform.cares_city` | `code`, `status` |
| `platform.cares_enablement` | `tenant_id`, `enabled` |
| `platform.operator` | `id`, `active` |

The gate asserts this set exactly for the cares tables. A **negative** `has_column_privilege` check must be false for every cost or price column outside it:
- `stock_movement.unit_cost_minor` and `unit_cost_per_1000_minor`;
- `batch.mrp_minor`;
- `price.amount_minor`;
- `staff` wage and salary columns;
- `cares_claim.total_minor` and `cares_allocation.total_minor`.

The function bodies are read-only (a `prosrc` grep). The definer-object count (FACT: 8 at 0017) rises by 5 from its value at 0027.

**Disclosure between B2B parties.** Each party learns the other's `tenant_id` (the claim keys need it), its public name, its outlet name and the offer lines — and nothing else.

### 1.6 Snapshot templates (v1)

Conversion uses a `conv` table as in `kitchen.prep_need` (FACT 0021). Buckets:
- g and kg give `weight_g`;
- ml and l give `volume_ml`;
- `portion` gives portions;
- anything else counts as units.

| Template | Params | Columns (numeric_source) | min_role · exposure |
|---|---|---|---|
| `cares.recipient_match` | `outlet_id`, `needs_cooked`, `needs_raw`, `needs_packaged`, `qty_milli`, `unit`, `expires_on` (nullable) | `recipient_id`, `name`, `simulated`, `distance_m` (`cares_outlet` / `platform.cares_recipient` `lat_e6`, `lng_e6`), `capacity_fit`, `overlap_min`, `pickup_from`, `pickup_to`, `pickup_on`. Row order is the rank; there is no rank column. | manager · mapping follow-up and manual member mint |
| `cares.listings` | `outlet_id`, `status` | `listing_id`, `kind`, `status`, `recipient_id`, `pickup_from`, `pickup_to`, `pickup_on`, `pickup_weekday`, `pickup_slot_start`, `lines` (count:core.cares_listing_line) | staff · market skill, people follow-up |
| `cares.pickup_crew` | `outlet_id`, `listing_id` | `staff_id`, `member_id`: scheduled `roster_shift` rows at the outlet covering the listing's pickup slot, staff with an active `member_id`, ordered cheapest rate first then `staff_id` (the P2 "extra staff" order, FACT 0026; rates order only and are not output) | manager · people follow-up |
| `cares.impact` | `outlet_id`, `from`, `to` | Σ row first, then one row each for `donation` and `offer`: `handovers` (count), `portions_milli`, `weight_g`, `volume_ml`, `units_milli` (cares_handover_line.qty_milli), `value_at_cost_minor` (stock_movement qty × receipt cost, valued as `kitchen.remakes_overprep`); voided excluded | manager · market skill, console |
| `platform.cares_network_impact` | `from`, `to`, `city_code` (nullable) | `SELECT * FROM core.cares_network_impact(…)`. Σ row first, then per city: `businesses` (count:core.cares_profile), `donations` (count:core.cares_handover), `meals_portions_milli`, `weight_g`, `volume_ml` (cares_handover_line.qty_milli), `all_synthetic` bool | **operator** · §2.3 only |

**Template rules:**
- **Capacity fit.** Weight is compared with `capacity_kg_per_day`. Volume is compared with the same capacity at 1 l = 1 kg (INFERENCE, stated in the reference). Portions are compared with `capacity_portions_per_day`. Units always fit.
- **Pickup window and minimum days.** The match takes the next pickup window after `now()` in the outlet's zone, as `inventory.expiry_risk` does (FACT 0021). It reads `min_days_left_at_pickup` from the tenant's latest active pack in SQL, as 0023's templates do (FACT), and returns 0 rows when nothing is eligible.
- **Weekday and slot.** `pickup_weekday` and `pickup_slot_start` copy 0026's expressions **verbatim** (FACT 0026 lines 141, 144, 189), on `b = date_bin(interval '60 minutes', pickup_from AT TIME ZONE ou.tz, timestamp '2001-01-01')`:
  - `d = (b − ou.business_day_cutoff)::date`;
  - `slot = to_char(b, 'HH24:MI')`;
  - `weekday = to_char(d, 'dy')`.

  Both sides use the same expression under one database locale, so the cell equality in §4 holds.
- **Allow-list.** 0028 extends the `numeric_source` allow-list (the `books.test.ts` manifest) with exactly `platform.cares_recipient.{lat_e6, lng_e6, capacity_kg_per_day, capacity_portions_per_day}`.
- **Who may call the definer functions.** Only `platform.*` templates with `min_role = 'operator'` may reference a §1.5 function (gated). The member and internal intel mint routes refuse operator templates, and `munim_svc` has no EXECUTE. Both are red-proven.

## 2 · Public surfaces

### 2.1 Network page and storefront section

- **Network listings.** `GET /v1/cares-network/cities`, `GET /v1/cares-network/listings?city=&cursor=` and `GET /v1/cares-network/listings/{id}` call the network function on the `munim_core` pool with **no** `app.*` context. A miss returns 404.
- **Storefront.** `GET /v1/storefront/cares` runs the menu routes' `channelKind` check (FACT `storefront/read.ts`), then calls the same function with `p_tenant` = the key's verified tenant. A bad key or a non-storefront channel returns 404 (gotcha 16).
- **Auth.** Contracts `Auth` has no anonymous value (FACT `shared/routes.ts`). T-095c adds `"public"`: no OpenAPI security, plus a credential-free SDK method.
- **Caching.**
  - Network routes: an in-process cache keyed by `(city, cursor|id)`, TTL 30 s, `Cache-Control: public, max-age=30`. A withdrawn listing may show for up to 30 s; the API reference says so.
  - Storefront route: **uncached**.
- **Numbers.**
  - Every number is a line's own field (R26), and `listings/{id}` opens the row.
  - Counts are list lengths, shown as "N+" when capped (C3).
  - Recipients render "Simulated recipient".
  - The page shows "Check your local food-donation rules".

### 2.2 Rate limit (none exists in core-api today: FACT, no limiter in `services/core-api/src`)

T-095b adds `lib/ratelimit.ts`: a fixed window with an injectable clock.

**Client key:**
- `MUNIM_TRUSTED_PROXY_HOPS = n` (default 0). The client IP is the X-Forwarded-For entry `n` hops **from the right**. With `n = 0`, or when the header has fewer entries, the socket address is used.
- The limit is per instance (multi-instance means limit × N), which is accepted.

**Limits:**

| Route | Limit | Key |
|---|---|---|
| `/v1/cares-network/*` | 60 per minute | IP |
| `/v1/storefront/cares` | 60 per minute | per IP first, then (IP, sha256 of the storefront key) — so random keys cannot multiply one IP's budget (wave review 13 Oct); the key itself is never logged |

Over the limit, the route returns `429 rate_limited` with `Retry-After`.

### 2.3 Network impact total (founder answer 3)

1. **Mint.** An operator calls `POST /platform/v1/network-snapshots {template_id: "platform.cares_network_impact", params}` (the operator's own command, R27). Core runs it on `munim_core` with `role = operator` and no tenant, and stores a row in `platform.network_snapshot` (rows, sha256, minter).
2. **Publish.** An approved config draft with target `cares_public_impact:<snapshot_id>` (R24) sets `published_at` and `publish_draft_id` once. Nothing auto-publishes, and there is no cron mint.
3. **Show.** `GET /v1/cares-network/impact?city=` returns the latest published snapshot covering that city (or the Σ):
   - `snapshot_id`, `as_of` (= `created_at`), `template_id` and version;
   - each value beside its ref `⟨snap:<id>·<row>·<col>⟩`.

   `GET /v1/cares-network/snapshots/{id}` opens the stored rows, params and sha256 of a **published** network snapshot only; otherwise 404.
4. **Label.** "Meals shared across Munim — to simulated recipients" is always shown. "Measured on synthetic data" is shown when `all_synthetic`. Meals are donated cooked portions; weight and volume are shown separately, with no kg→meals factor.

## 3 · B2B shared surplus offers (founder answer 1: record only)

| Step | Who · tenant | Write | Cross-tenant read |
|---|---|---|---|
| Offer | offerer owner | publish `kind = 'offer'`; price typed by the owner, with the cost cell beside it | — |
| Browse | buyer owner, manager | — | `cares_market_offers` |
| Claim | buyer owner, manager | `cares.claim.create.v1`, all lines | same, in the same transaction |
| Decide | offerer owner | `cares.claim.decide.v1` (listing `FOR UPDATE`; accept → `allocated`) | `cares_inbound_claims` |
| Hand over | offerer staff+ (outlet) | `cares.handover.record.v1` with the allocation → `surplus_out` | `cares_inbound_claims` |
| Receive | buyer staff+ (outlet) | `cares.claim.receive.v1` → `received_qty_milli`, `surplus_in` | `cares_claim_outcome` |
| Cancel / close | buyer | cancel before any verdict; close after "declined" (declined, withdrawn, or allocated elsewhere) | `cares_claim_outcome` |

**Rules:**
- **Money.** `total_minor` on the claim and allocation is a row field, labelled "Recorded, never processed". There is no tax invoice, payable, receivable or posting.
- **City and currency.** Both sides must share a city. The R30 check fixes one country and one currency, with MB003 as the backstop.
- **No back-out.** An offerer cannot back out of an acceptance in v1.
- **No notifications** cross tenants.

## 4 · Intel (inside F8; deterministic; typed tools; no tenant parameter)

### `inventory.expiry_risk`: new mapping (inventory_purchasing)

- **Template:** v2 (FACT: carries `ingredient_id`, `unit`, `supplier_id`). Firing, thresholds and dedupe are **unchanged**.
- **Mapping steps:**
  1. Return `None` unless the run-frame `cares_active` flag is set.
  2. Run the follow-up `cares.recipient_match`, with `needs_packaged = is_sku`, `needs_raw = NOT is_sku`, `qty_milli = at_risk_qty_milli`, `unit = unit` and `expires_on = expiry_on`.
  3. If it returns 0 rows: `Abstain('no_eligible_recipient')`. Otherwise use row 0.
- **Draft:** `cares.listing.publish.v1` (donation):
  - qty ref: `at_risk_qty_milli`, which is net of forecast use;
  - expiry ref: `expiry_on`;
  - pickup refs and the recipient come from the match row;
  - **`targets = [batch_id, pickup_on]`**, so a re-detection on a later day gets a new draft.

### `people.overstaffed_slot`: new mapping, plus a watch on `munim.cares.listing.published.v1` (people)

- **Template:** `people.labour_vs_demand` v2 (FACT 0026). Firing is unchanged.
- **Mapping steps:**
  1. Follow-up `cares.listings` (published), filtered to listings whose `pickup_weekday` / `pickup_slot_start` cells equal the finding row's `weekday` / `slot_start` cells (cell equality only).
  2. For each match, follow-up `cares.pickup_crew`. If it returns 0 rows: `Abstain('no_rostered_staff')`.
- **Draft:** `goals.task.create.v1`:
  - `title_key`: `cares.task.pack_and_hand_over`;
  - `assignee_member_id`: crew row 0's `member_id` (an id cell);
  - `due_on`: the `pickup_on` cell;
  - `finding_id`;
  - **`cares_listing_id`**: the listing;
  - `targets = [listing_id, pickup_on]`.

### Not mapped: `kitchen.overprep`

Its finding is a past week's ingredient waste. It carries no dish, portion or current quantity, so a listing draft would need new data (a contract change). It stays unmapped.

### Approval and staleness

- **Re-runs.** Re-detection re-runs the mapping (FACT `watch/pipeline.py` 267–272).
- **Who approves.** Drafts carry `outlet_ids = [outlet]`; only owner or judge may approve (a manager gets MB006).
- **Staleness.** `based_on` holds the match and crew cells, so if they change the draft goes `stale`.

### Registry (`specialists.ts`)

| Specialist | Change |
|---|---|
| inventory_purchasing | workflow draftable `cares.listing.publish.v1` |
| people | workflow draftable `goals.task.create.v1` |
| market | templates `cares.listings`, `cares.impact` |

Workflow draftables are never model tools (FACT). Market's tool count on `draft_request` rises from 11 to 13, within the cap of 20. inventory_purchasing and kitchen are untouched.

### Market skill instruction (no digits)

"Cares figures go to simulated recipients and are measured on synthetic data; meals are cooked portions only."

### Run-frame, thresholds and taint

- The run-frame gains a per-outlet `cares_active` flag: enablement on, profile active, outlet active.
- No detector thresholds change.
- Taint: all inputs are cells; recipient names are platform-trusted.
- Intel never reads another tenant's data. Gate: only operator `platform.*` templates reach the definer functions.

### Pack amendments (ADR-014 §14 style)

| Pack row | Change |
|---|---|
| inventory-purchasing §6 `expiry_risk` | Gains the Cares mapping. Transfer and supplier-return stay unbuilt (FACT `expiry_risk.py`); building one later means a single mapping choosing between them. |
| people §6 `overstaffed_slot` | "No draft" becomes the Cares task. |
| market §3 | Rows for `cares.listings` and `cares.impact`, needed by `tests/template-spec.ts` and `verify/coverage.ts` (FACT: they parse the pack docs). |
| people §3 | A row for `cares.pickup_crew`. |

## 5 · Routes, contracts, SDK (R43: all routes in OpenAPI; R48 F-1: additive `/v1` changelog entry)

| Surface | Routes |
|---|---|
| Member `/v1/cares/**` | `GET/POST profile`<br>`GET recipients?outlet=`<br>`GET/POST listings`, `GET listings/{id}`, `POST listings/{id}:withdraw`<br>`POST handovers`, `POST handovers/{id}:void`<br>`GET market`<br>`GET/POST claims`, `POST claims/{id}:cancel`, `POST claims/{id}:close`, `POST claims/{id}:receive`<br>`GET listings/{id}/claims`, `POST listings/{id}:decide`<br>Manual ranking: `POST /v1/snapshots {cares.recipient_match}` (R40 C4) |
| Public | `GET /v1/cares-network/cities`, `/listings`, `/listings/{id}`, `/impact`, `/snapshots/{id}` (`auth: "public"`) |
| Storefront | `GET /v1/storefront/cares` |
| Operator | config-draft targets `cares_city`, `cares_recipient`, `cares_enablement`, `cares_public_impact`<br>`POST /platform/v1/network-snapshots`, `GET /platform/v1/network-snapshots` |
| Outbox (ids only) | `munim.cares.listing.published.v1`, `.listing.closed.v1`, `.handover.recorded.v1`, `.handover.voided.v1`, `.claim.created.v1`, `.claim.decided.v1` |

**Contracts (T-095c):**
- `src/cares/index.ts`, including `CARES_LISTING_DRAFT`; the ontology mints `/listing_id` and `/lines/*/line_id`;
- `Auth` gains `"public"`;
- the new reason codes;
- `GoalsTaskCreateV1` gains `cares_listing_id: Uuid7.nullable().default(null)`;
- an optional `CountryPack.cares`.

**Consumers:**
- The frontend repo and the **marketing site** use only `@munim/sdk`.
- The marketing site reads `cities`, `listings`, `listings/{id}`, `impact` and `snapshots/{id}`, and must keep the labels "Simulated recipient", "to simulated recipients", "Measured on synthetic data", "Recorded, never processed" and "Check your local food-donation rules".
- The in-repo screenshot gate does not apply.

## 6 · Country pack (IN v4, AU v4; founder answer 4)

`CountryPack` is a `strictObject`, and the v3 rows stay in place, so `cares` is **optional**. If it is absent, Cares is off (`cares_not_available`). The block holds operating values only. There are no legal fields, and no researched legal claims anywhere.

```
cares?: { food_kinds: ["cooked","raw","packaged"], offers_enabled, cooked_max_hold_min, min_days_left_at_pickup }
```

- **Values.** All values are INFERENCE (`_notes`); `min_days_left_at_pickup` is 1 in both packs. Both are read by core and the match SQL, with no country branch (rule 7).
- **Expiry dates.** A batch's single `expires_on` (FACT 0005) is treated as a last-use date.
- **Seeding.** T-095c bumps `packages/contracts/packs/{IN,AU}.json` to version 4. `db/seeds/packs.ts` (FACT: inserts each `(code, version)` into `platform.country_pack` and refuses a changed document) loads them on the embedded harness and `make dev-db`.
- **Copy.** The one copy line is the generic i18n note `cares.note.check_local_rules`.

## 7 · Worldgen and eval

Plants are deterministic at any hour: dates are relative to the run's business date, and only live commands are used (R44). Every expiry plant has `days_to_expiry = 3`, which is at least `min_days_left_at_pickup + 2` and inside the detector's 3-day horizon (FACT `expiry_risk.py`).

| Plant | World | Seeded by | Answer key (hand-typed) |
|---|---|---|---|
| ST-CA1 | store, IN | ST-I4 (YOG-B7, 40 cups, 3 days). 3 simulated recipients: A (packaged, fits), B (raw only, nearer: **trap**), C (another city: **trap**). | Donation draft to A for 40 cups. Match returns exactly **1** row. |
| CK-CA1 | cloud_kitchen, IN | Paneer batch, 3 days left, at risk | Donation draft for the at-risk qty |
| AU-CA1 | au_outlet, AUD | Milk batch, 3 days; recipients in Melbourne and Sydney (**trap**) | Draft to the Melbourne recipient, in AUD |
| RG-CA1 | restaurant_group | The owner publishes a listing in **RG-P2's** weekday-slot (FACT: RG-P2 fires, accept sum 408000). A roster for that date has one member-linked staffer on the slot. | **1** task draft: assignee = that member, due = pickup date, listing set |
| *-CA2 | all four | One hand-over today of a second owner-published listing | `cares.impact` Σ: handovers = 1, plus the typed weight or portions and value at cost |
| NET-1 | all four | The operator mints and publishes `platform.cares_network_impact` | Σ `donations` = 4 and `businesses` = 4, plus the typed meals and weight |

**Gates on the plants:**
- `verify/recompute.ts` reads only through `/v1` (FACT `test/no-sql.ts`).
- In `detector-map.json`: CA1 → `inventory.expiry_risk` (draft); RG-CA1 → `people.overstaffed_slot`; CA2 and NET-1 → `null` with "template".
- `evals/w3` gains per-plant draft expectations; `spec.json` is unchanged.

## 8 · Tickets (replace BOARD T-095)

Every gate asserts a hand-typed positive quantity and is red-proven by a non-zero process exit (gotcha 33). `templates-worlds` is a **regression check only**.

| Ticket | Territory | Size · model |
|---|---|---|
| **M-D** 0028 | `db/migrations/0028_cares.sql`, `db/derivation-rules.json`, `db/tests/*cares*`, db/README, manifests | L · **Opus** |
| **T-095c** contracts and packs | `packages/contracts/src/{cares, shared/routes.ts, goals, packs, intel/specialists.ts, ontology}`, `packages/contracts/packs/{IN,AU}.json` (v4), `db/seeds/packs.ts` (v4 load), `docs/plan/packs/{inventory-purchasing, people, market-strategy}.md` | M · Sonnet |
| **T-095a** core module | `services/core-api/src/modules/cares/**`, `packages/core-domain/cares/**`, `modules/inventory/index.ts`, `modules/goals` (task column), `internal/frame.ts`, `platform/drafts.ts` | L · **Opus** |
| **T-095b** public surfaces | `modules/cares-network/**`, `lib/ratelimit.ts`, the storefront Cares route, `platform/network-snapshots.ts`, SDK public client | L · **Opus** |
| **T-095d** intel | `munim_intel/watch/detectors/{inventory_purchasing/expiry_risk, people/overstaffed_slot}.py`, `skills/market`, fixtures | S · Sonnet (Opus review) |
| **T-095e** worldgen and eval | `tools/worldgen/{src, answer-key, verify}`, `evals/w3/*` | M · Sonnet |
| **T-095f** simulated recipients | operator config drafts in `make seed`, recipient fixtures | S · Sonnet |

**Gates by ticket:**
- **M-D**
  - 9/9 core tables tagged; FORCE RLS; deny for shoppers; `book_scope` and transitions present.
  - Intel-write N/N, with N +13 (manifest).
  - `munim_svc` holds 0 non-SELECT privileges; an unadmitted book write gets MB001.
  - Hand-over: a second void gets MB004; an un-void gets MB004.
  - Σ hand-over above the listing line gets MB001.
  - A second accepted allocation for one listing gets 23505.
  - `received_qty_milli` set twice is refused.
  - The cumulative-void binding refuses an over-reversal.
  - Both stock CHECKs are replaced by name, and the 4 kinds pass with their signs.
  - Rules: non-null bindings; DB = file.
  - 5 definer functions: owner and EXECUTE correct (`munim_svc` and `munim_intel_ro` false); bodies read-only.
  - Non-party tenant, forged `app.member_id`, or no context gives **0** rows; the party gives **≥1**.
  - Staff outside the outlet gives 0; staff inside gives ≥1.
  - Network function: retired, judge, non-enabled, paused, draft, withdrawn and expired listings are absent; exactly **1** live donation is present.
  - Exact `munim_crosstenant` column set, and the negative cost/price `has_column_privilege` checks.
  - Only an operator `platform.*` template may reference a definer function.
  - Recipient CHECKs: simulated = false gets 23514; a name without "(simulated)" gets 23514.
  - `redproof-0028.sh` plants a `0029` per item.
- **T-095c**
  - `make contracts` output is fresh (gotcha 13).
  - v3 packs still parse; `platform.country_pack` holds `(IN,4)` and `(AU,4)` after the seed, with v3 unchanged.
  - Registry, template-spec and coverage tests pass with the new pack-md rows; a missing row fails.
- **T-095a**
  - Idempotent replay per command; audit chain verifies; clause 1 scan.
  - An approved draft creates 1 listing; manager approval gets MB006.
  - Not enabled gets `cares_not_enabled`; wrong-country city gets `cares_city_mismatch`.
  - A 6-portion cooked hand-over writes exactly the recipe's ingredient rows × 6 (count from the fixture recipe); the void brings Σ back to 0.
  - A hand-over qty above the line gets `qty_exceeds_listed`.
  - Two-tenant B2B with a 20 kg onion offer: offerer Σ `surplus_out` = −20000, buyer Σ `surplus_in` = +20000.
  - **Two concurrent decides** give exactly 1 accepted and 1 `offer_closed`.
  - Cancel after accept gets `claim_decided`; close after decline is OK.
  - Receive before hand-over is refused.
  - Staff can hand over and receive within their outlet; outside it, 404.
  - With the kill switch on, every Cares route still answers.
- **T-095b**
  - Injected clock: the 60th call gives 200, the 61st gives 429 with `Retry-After`, and after the window, 200.
  - With a 3-entry X-Forwarded-For and `HOPS = 1`, the key is the right-most entry; a spoofed left entry has no effect.
  - The storefront limit is per (IP, key).
  - Response keys match the allow-list exactly; a planted column fails.
  - Storefront key A shows A's listings and 0 of B's; a bad or non-storefront key gives 404.
  - `impact` serves only a published snapshot (unpublished gives 404), and every value is beside a ref that `snapshots/{id}` resolves.
  - Member and intel mints of the operator template are refused.
- **T-095d**
  - Fixture: ≥1 donation draft and 1 task draft, with refs that resolve.
  - A tenant that is not opted in gets 0 Cares drafts and 0 abstains.
  - **`expiry_risk` findings are equal to the committed answer keys and `evals/w3/accept.json`.**
  - Draft leaves pass the free-digit scan.
  - Tools carry no `tenant_id` or `run_id`; market has ≤ 20 tools.
  - Models run in recorded mode.
- **T-095e**
  - The plants verify against the keys.
  - `make eval-w3` has **≥ 4 Cares drafts, all `proposed`, and 0 Cares rows created without a member decision** (no auto-apply).
  - 0 drafts name a trap recipient.
  - Determinism is unchanged.
- **T-095f**
  - Every recipient name matches `\(simulated\)`.
  - None matches a deny-list of well-known real food-rescue organisation names, kept in the test file. A planted real name fails.

**Order:**
1. M-D and T-095c run in parallel.
2. Then T-095a, T-095b, T-095d and T-095f in parallel.
3. Then T-095e.
4. Then the wave review with a guarantee scan.

## 9 · Guarantee scan

| Channel | Clause 1: named person | Clause 2: traces |
|---|---|---|
| DB grants | Book tables change only through the guard. `munim_svc` has SELECT only; intel has no grant. Definers are read-only with exact column grants. | — |
| Publish, hand-over, void, B2B | Each step is the actor's own command within `command_authority`, or an approved draft on its final payload. Movements come only from bound rules. Σ ≤ approved line. | Draft leaves are refs; edits are `{value, typed_by}`. Quantities are row fields; movements cite their source row. |
| Cross-tenant | No tenant writes another tenant's rows. Five functions have 0-row red-proofs. | Copied values are fields of the copying row, read in the same transaction. |
| Public listings, storefront | Read-only | Row fields, openable through `listings/{id}`. Counts follow C3. |
| Network impact | The operator mints (own command), and publication is an approved config draft (R24). | Each value sits beside a snapshot ref, and the snapshot opens publicly with its sha256. |
| Outbox, NOTIFY, errors, traces | Typed reason codes | Ids and labels only |
| Intel | Drafts go through `/internal/intel/v1/drafts`. Nothing auto-applies (gate). The kill switch leaves Cares working. | Cells only; impact is a snapshot. |

Both clauses hold by design. The one residual is a public cache lag of up to 30 s, which is a read lag, not a book change.

## 10 · Not doing in v1

**Recipients and messaging:**
- no public claims, volunteers, recipient logins or acceptance step;
- no real NGOs;
- no email or SMS (F-CH);
- no cross-tenant notifications.

**Money:**
- no B2B postings, tax invoices, payables, receivables or payments;
- no offerer back-out after acceptance;
- no partial claims;
- no joint supplier buying.

**AI:**
- no cooked-surplus detector;
- no prep-list widening;
- no `kitchen.overprep` mapping;
- no AI-drafted offers or claims;
- no 9th specialist.

**Public surface:**
- no automatic or cron mint or publication of the network total;
- no legal fields or compliance claims;
- no distributed rate limiter.

**Operations:**
- no recurring donations or logistics;
- no hand-over editing: void, then re-record.

## 11 · Founder questions

The founder's design answers (ledger R48 F-2) resolve questions 1–4 of the earlier draft. This revision raises no new question about money or a hard rule.
