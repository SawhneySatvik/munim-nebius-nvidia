# 02 — Schema as contract

**Purpose.** Every table, its invariants and its access rule, so the migrator lane can write `db/migrations`
without asking. **Depends on:** ledger R2–R6, R9, R15, R16, R21, R24–R29; `03-architecture.md` §1.
**Authority:** once a migration exists, **the migration SQL is the contract** and this doc is commentary
(RULES §1). Revised 9 Oct after the pass-1 review.

---

## 0 · Conventions (every table unless stated)

- `tenant_id uuid not null` is the **first column and leads the PK and every FK and index**. PK =
  `(tenant_id, id)`; `id` is UUIDv7, client-generated for commands.
- `created_at timestamptz not null default now()`, `created_by uuid`.
- Money: `<name>_minor bigint` + `currency char(3)`. Quantities: `qty_milli bigint` + `unit text`.
- **Tag:** every `core` table carries `COMMENT ON TABLE … IS 'munim:book'` or `'munim:operational'`
  (R29). Book tables get the `core.guard_book_write()` trigger and an `origin jsonb not null` column the
  trigger stamps (`{kind: command|decision|derivation, …}`) (03-arch §1.3, ADR-013).
- **Exception to tenant-leading keys:** global reference tables seeded by migration and identical for all
  tenants — `core.command_authority`, `core.derivation_rule`, `core.order_status_transition` — have no
  `tenant_id`, no RLS, and are SELECT-only at runtime.
- **No DELETE or TRUNCATE grant** on `core`/`evidence`/`intel` to any runtime role. Corrections are
  reversals, voids with reason, new versions, or `status = 'retired'`. `UPDATE` grants are column-pinned.
- RLS `enable` + `force` on every tenant table. Policies:
  `tenant_id = (select current_setting('app.tenant_id', true))::uuid`; outlet-scoped tables add
  `(select current_setting('app.outlet_ids', true)) = '{*}' or outlet_id = any((select current_setting('app.outlet_ids', true))::uuid[])`.
  **Outlet-scoped tables:** `outlet_calendar`, `device`, `pickup_window`, `order` (+ lines, events, tenders,
  voids, refunds, kitchen tickets), `shift`, `stock_movement`, `batch`, `stock_count`, `reorder_level`,
  `waste_log`, `goods_received`, `roster_shift`, `attendance`, `temp_log`, `checklist_run`. `draft` uses
  `outlet_ids && app.outlet_ids` (overlap).
- `0001` revokes all table privileges **and function EXECUTE** from PUBLIC (`ALTER DEFAULT PRIVILEGES`);
  every table and function has an explicit grant block.
- `W1` marks what the walking skeleton needs; `S1–S3` marks the demo stories.

## 1 · `platform` (operator config; `munim_platform` writes; others read)

| Table | Key columns | Notes |
|---|---|---|
| `country_pack` W1 | `code`, `version`, `effective_from`, `doc jsonb`, `status` | `doc` validated in the app against `contracts/country-pack.schema.json`; seeded by migration `0002` (IN, AU). The **only** copy of pack data — `core-domain` reads it, never embeds it. |
| `plan`, `feature_flag` | | `feature_flag` includes the typed `intel.enabled` kill switch |
| `tenant_registry` W1 | **view** over `core.tenant` (name, country, status, is_demo), owned by `munim_crosstenant` | not a second source of truth |
| `llm_budget` | `tenant_id`, `month`, `limit_minor`, `currency` | `spent_minor` is a view over `intel.intel_spend` |
| `model_role` W1 | `role`, `model_id`, `location`, `probed_at` | changed only by an approved `config_draft` (the probe emits the draft) |
| `operator` W1 | `id`, `idp_sub`, `email`, `active` | seeded operator for local/dev bootstrap |
| `config_draft`, `platform_audit` | `config_draft(target, patch, status, proposed_by, decided_by)`; audit hash-chained | an operator's own command is its approval (R27); drafts used for probe output and cross-operator review |

## 2 · `core` (the books and operational state)

### 2.1 Tenancy W1 — book
| Table | Columns / constraints |
|---|---|
| `tenant` | `tenant_id`, `name`, `country_code`, `base_currency`, `fy_start_month`, `status` (`active`,`retired`), `is_demo`, `onboarded_at` |
| `outlet` | `id`, `name`, `kind` (`restaurant`,`cloud_kitchen`,`store`), `tz`, `address`, `tax_ids jsonb`, `accepting_orders` (`open`,`busy`,`paused`), `busy_extra_min` |
| `brand`, `channel` | brand `outlet_ids uuid[]`; channel `kind` (`counter`,`table_qr`,`pickup`,`own_site`,`aggregator:<code>`) |
| `member` | `id`, `idp_sub` unique per tenant, `name`, `email`, `is_ephemeral_judge` (judges hold role `judge` = owner rights in their own demo tenant only) |
| `membership` | `member_id`, `role` (`owner`,`manager`,`staff`,`advisor`,`judge`), `outlet_ids uuid[]` (`{}` = all for owner/advisor/judge) |
| `device` (operational) | `id`, `outlet_id`, `kind` (`pos`,`kds`), `invoice_series`, `last_seen_at` |
| `outlet_calendar` | weekly hours + dated overrides |
| `command_authority` W1 (global, operational) | `command_type`, `allowed_roles text[]` (any of `owner, manager, staff, advisor, customer, operator, judge`), `scope` (`outlet`,`tenant`,`own_order`), `max_amount_minor` nullable — one row per command type (R27) |
| `derivation_rule` W1 (global, operational) | `rule_id`, `source_table`, `target_table` — e.g. `inventory.consume_order: core.order → core.stock_movement`; ids match `packages/core-domain/*/rules` (test) |
| `customer` W1 (book) | `id`, `phone`, `email`, `name`, `consent jsonb`, `is_guest` — guest checkout creates one by the customer's own command; loyalty and campaigns extend it in W4 |

**Country (R30):** chosen during onboarding; once `onboarded_at` is set, a trigger refuses any change to
`country_code` or `base_currency`. Every currency-bearing row (price, order, tender, journal entry) asserts
`NEW.currency = tenant.base_currency`.

### 2.2 Commands — operational W1
`command_log(tenant_id, idempotency_key, command_type, actor, request_hash, result, created_at)` unique
`(tenant_id, idempotency_key)`.

### 2.3 Catalogue W1 S2 — book
`item` (`kind` dish|sku|combo, `name_key`, `category`, `brand_id`, `barcode`, `active`) · `variant` ·
`option_group` (`min_select`, `max_select`, `required`) / `option` (`price_delta_minor`) ·
`recipe_version` (`item_id`/`variant_id`, `version`, `valid_from`, `valid_to`, `yield_qty_milli`;
non-overlapping validity — exclusion constraint) · `recipe_line` (`ingredient_id`, `qty_milli`, `unit`,
`waste_pct_bp`) · `ingredient` (`base_unit`, `shelf_life_days`, `tracked_by_batch`) · `price`
(`item_id`/`variant_id`, `outlet_id`, `channel_kind`, `amount_minor`, `currency`, `tax_class`, validity —
non-overlapping) · `deal` (`kind`, `rule`, `windows` in outlet tz, `outlet_ids`, validity — judged at the
promised time and re-judged when it changes) · `coupon` (caps, min spend, validity, outlet scope).

### 2.4 Orders / POS W1 S1 S3
| Table | Tag | Columns / constraints |
|---|---|---|
| `pickup_window` | operational | `outlet_id`, `starts_at`, `ends_at`, `capacity_orders`, `booked` (row-locked increment) |
| `order` | book | `outlet_id`, `channel_id`, `brand_id`, `kind`, `table_ref`, `promised_at`, `status`, `ticket_no` (daily per outlet), `invoice_no` (per device series per FY, gapless), `customer_id`, `subtotal_minor`, `discount_minor`, `tax_minor`, `total_minor`, `currency`, `pricing_snapshot`, `external_ref` (unique per channel) |
| `order_line` | book | `line_no`, `item_id`, `variant_id`, `options`, `qty_milli`, `unit_price_minor`, `line_discount_minor`, `tax_minor`, `recipe_version_id` |
| `order_status_transition` | operational (seeded) | `(from_status, to_status, min_role)` — the only legal transitions: `placed→accepted\|rejected`, `accepted→preparing`, `preparing→ready`, `ready→completed`, `placed\|accepted→cancelled`; `cancelled`, `rejected`, `completed` terminal |
| `order_event` | book | append-only status history (`from`, `to`, `actor`, `reason`, `at`); status updates are `UPDATE … WHERE status = $from` |
| `tender` | book | `method` (cash, card, upi), `amount_minor`, `currency`, `recorded_by`, `ref` — recorded only |
| `void`, `refund` | book | reason code + note + actor required |
| `shift` | book | float, counted cash, expected cash, variance |
| `kitchen_ticket` | operational | `station`, `status`, `accepted_at`, `ready_at`, `due_at` |

Invariants: `total = subtotal − discount + tax` (check); prices re-derived by core from `price`, `option`,
`deal` at placement and on every promised-time change; client totals ignored; `invoice_no` from a per-device
per-FY counter under row lock.

### 2.5 Inventory W1 S1 S2 — book
`stock_movement` (append-only; `outlet_id`, `ingredient_id`, `batch_id`, signed `qty_milli`, `kind`
receipt|sale_consumption|waste|transfer_out|transfer_in|count_adjust|return, `ref_type`, `ref_id`,
`unit_cost_minor`, `at`) · `batch` · `stock_count` / `stock_count_line` · `reorder_level` (`min_qty_milli`,
`par_qty_milli`) · `waste_log`. On-hand = Σ `qty_milli`; consumption posted by rule `inventory.consume_order`
from the order (source must be a book-approved order); **negative on-hand allowed, raises an alert**.
Event `munim.inventory.movement.recorded.v1` per movement batch.

### 2.6 Purchasing W1 S1 S2 — book
`supplier` (`kind` real|simulated, `a2a_card_url`, `terms`) · `supplier_price` (observed price,
`source_ref`) · `purchase_order` (`supplier_id`, `outlet_id` or pooled `outlet_ids`, `status`
`committed→received|cancelled`, `total_minor`, `negotiation_run_id`) — **a PO exists only once committed;
proposals live as `core.draft` rows** · `po_line` · `goods_received` / `grn_line` · `supplier_invoice`
(unique `(tenant_id, supplier_id, invoice_no)` → duplicate refused) · `supplier_invoice_line` ·
`supplier_return`. Intel proposes `purchasing.po.create.v1`; executing it creates a committed PO.

### 2.7 Finance S3 — book
`account` (chart from the pack) · `journal_entry` (`outlet_id`, `brand_id`, `channel_id`, `entry_date`,
`source_type`, `source_id`, `posting_rule`, `reverses_id`, `decision_id`) · `posting` (`account_id`, signed
`amount_minor`, `currency`) · `settlement` / `settlement_line` (gross, commission, ad fee, promo share, tax
withheld, net, `matched_order_id`) · `bank_line` · `reconciliation_break` (derived by rule
`finance.reconcile` from approved imports; operational) · `expense`, `payable`, `receivable`, `budget`,
`tax_return_draft`, `period_close`.
Invariants: Σ postings = 0 per entry per currency (deferred constraint trigger); immutable; corrections
reverse; postings derived only by allow-listed rules from book-approved sources; postings dated in a closed
period refused.

### 2.8–2.11 People, customers, compliance, goals (W4; book unless noted)
`staff`, `roster`, `roster_shift`, `attendance`, `payroll_draft` (IN only), `advance`, `tip_pool`,
`training_record`, `hiring_candidate` · (`customer` and `coupon_use` live in `0004`, W1) `loyalty_entry` (append-only; balance Σ ≥ 0 under a
per-customer row lock), `campaign`, `reservation`, `bulk_order`, `review` · `licence`,
`checklist`, `checklist_run`, `temp_log`, `asset`, `maintenance`, `amc` · `goal`, `task` (assignments
created by intel are drafts).

### 2.12 Approvals, audit, outbox W1 — operational
| Table | Columns / constraints |
|---|---|
| `draft` | `id`, `outlet_ids uuid[]`, `source` (`intel:<pack>`, `import`, `member`), `finding_id` (FK added in `0006`), `run_id`, `command_type`, `command_payload` (numbers proposed by intel are refs, resolved and stored beside the value; validated in the app against the command contract), `evidence` refs, `based_on jsonb` (`[{template_id, params, expected: {cell: value}}]`), `status` (`proposed`,`executing`,`rejected`,`stale`,`executed`,`failed`), `exec_txid bigint`, `updated_at`; insert/update fires `NOTIFY munim_inbox` |
| `decision` | `draft_id` (unique), `verdict` (`approved`,`edited`,`rejected`), `final_payload`, `reason`, `decided_by`, `decided_at` — authority checked against `final_payload` |
| `audit_log` | per-tenant gapless `seq`, `actor`, `action`, `entity`, `entity_id`, `before`, `after`, `decision_id`, `prev_hash`, `hash`; append-only; chain verified nightly and in tests |
| `outbox` | `id`, `aggregatetype`, `aggregateid`, `type`, `payload`, `created_at`, `published_at`; insert fires `NOTIFY munim_outbox`; `core.outbox_claim(batch)` SECURITY DEFINER owned by `munim_crosstenant` (`munim_svc` EXECUTE only) for the sweeper; `core.active_tenants()` likewise, for the `fanout` job (returns tenant ids only) |

### 2.13 Documents and imports (W2) — operational
`document` (immutable, `sha256` unique per tenant) · `import_format` (`header_signature`, `mapping` —
renames + units only, `decision_id`) · `import_run` (`document_id`, `format_id`, `status`, `rows_ok`,
`rows_quarantined`, `control_total_minor`, `decision_id`) · `import_staging` (parsed rows awaiting the run's
approval) · `import_quarantine` (`row_no`, `raw`, `reason`) · `conversation` / `message`. Approving the
run's draft moves staging rows into book tables under the approver (R28).

## 3 · `evidence` (created in `0003`; minted by core-api)

| Object | Columns / rule |
|---|---|
| `snapshot_template` | `id` (e.g. `inventory.below_reorder`), `sql`, `params_schema`, `columns jsonb` (name, type, `numeric_source`), `version` — created **only by migrations**, each module's templates in that module's migration (schema exists from `0003`) |
| `snapshot` | `id`, `template_id`, `params`, `run_id`, `outlet_scope`, `rows jsonb`, `row_count`, `sha256`, `created_at` |
| minting | ordinary core-api code as `munim_svc` (SELECT on the template's tables, INSERT on `evidence.snapshot`), under `SET LOCAL` of the run token's tenant + outlet scope; caps 500 rows; sha256 over canonical JSON. No SECURITY DEFINER. |

Template rule (test-enforced): every numeric output column's `numeric_source` is a `core` table or one of
`intel.forecast_point`, `intel.supplier_quote`, `intel.intel_spend`.

## 4 · `intel` (W1 subset marked; written by core-api as `munim_svc`)

| Table | Columns / notes |
|---|---|
| `run` W1 (created in `0003`) | `id`, `trigger`, `actor`, `outlet_scope`, `issued_at`, `expires_at`, `ended_at` |
| `event_claim` W1 | `event_id` unique per tenant, `claimed_at` |
| `watch_state` W1 | `pack`, `last_run_at` (leading-edge debounce) |
| `finding` W1 | `run_id`, `pack`, `type`, `severity`, `impact_ref` (snapshot cell), `confidence_bp`, `status`, `envelope`, `dedupe_key`, `updated_at` (NOTIFY `munim_inbox`) |
| `answer` W1 | `question`, `asked_by`, `envelope`, `abstained`, `reason_code` |
| `trace_event` W1 | `run_id`, `seq`, `id`, `parent_id`, `kind`, `actor`, `payload`, `at`; NOTIFY `munim_trace` |
| `supplier_quote` W2 | `run_id`, `supplier_id` (simulated), `ingredient_id`, `qty_milli`, `unit_price_minor`, `currency`, `terms`, `round`, `trace_event_id`, `is_simulated = true` (check) |
| `entity`, `alias`, `claim`, `edge` | claim `quote` must equal the source substring (checked at insert); edges carry provenance |
| `chunk` / `embedding` | `tsv`, `embedding vector(768)` |
| `wiki_page` / `wiki_version`, `forecast_run` / `forecast_point`, `intel_spend`, `outcome` | forecast points reference `inputs_snapshot_id` |

## 5 · `intel_ro` (views owned by `munim_view_owner`, NOBYPASSRLS)

Views: `wiki_current`, `claim_search`, `chunk_search` (FTS + vector), `entity_alias`, `finding_recent`
(**no numeric columns**: id, pack, type, severity, status, dedupe key), `trace_recent`, and name-only views
of outlets, items, ingredients and suppliers for entity resolution. Base-table policies apply to the view
owner, so `munim_intel_ro` sees only rows of the `app.tenant_id` it sets — which intel sets from the
verified run token (03-architecture §1.4, §1.7). Numbers reach intel only through snapshots.

## 6 · Graph projection model (R6)

One graph `munim`; labels `business, outlet, brand, channel, item, ingredient, supplier, person, customer,
day, claim, finding, draft, page`; edges `uses{qty,unit,valid_from,valid_to}, quoted{at}, sold{date},
wasted{date}, supplies, works_at, mentions, supported_by, proposes, about, contradicts` — **edges carry no
money or quantity values used for display**; numbers come from snapshots. All labels/properties lowercase.
Keys `(tenant_id, id)`, fallback string `"<tenant_id>/<id>"`. Rebuild = delete tenant range + chunked
upserts (~2k rows). Five templates: `price_shock_path`, `dish_margin_drivers`, `supplier_dependency`,
`claim_support`, `neighbourhood(depth ≤ 3)`.

## 7 · Migration plan (migrator lane `m-1` only)

1. `0001_roles_schemas` — roles (§0, 03-arch §1.2), schemas, default-privilege revokes (tables and
   functions), `pgvector`, `pgcrypto`.
2. `0002_platform` — packs (IN, AU), plans, flags, model roles, operators, config drafts.
3. `0003_core_tenancy_commands_audit_outbox_evidence` — §2.1, §2.2, §2.12, `evidence` schema (§3),
   `intel` schema with `intel.run` only, `core.guard_book_write()`, `command_authority` + `derivation_rule`
   seeds, `outbox_claim`, `active_tenants`, NOTIFY triggers, `munim_crosstenant`-owned objects.
4. `0004_core_catalogue_orders` — §2.3, §2.4, `customer`, `coupon_use` + their snapshot templates.
5. `0005_core_inventory_purchasing` — §2.5, §2.6 + templates incl. `inventory.below_reorder`.
6. `0006_intel_views` — §4 W1 subset (FK `core.draft.finding_id` added here), §5.
7. `0007_core_finance` — §2.7 + templates.
8. `0008_documents_imports_conversations` — §2.13; `0009_intel_knowledge` — §4 rest; `0010_people_customers_compliance_goals`.

Every migration applies on the **dev Supabase project** and passes the static Supabase-ism gate (R31); the
plain-Postgres run happens on Cloud SQL when gcloud lands (T-011b); never edited once
applied; asserts catalog state (`pg_index`, `pg_policy`, comments), never trusts `if not exists`.

## 8 · Gates owned by the schema (each red-proven; each refusal paired with an accepted case)

| Gate | Expected positive quantity (independent source) | Red-proof |
|---|---|---|
| Isolation | Expected set = every `core`/`evidence`/`intel` table with a `tenant_id` column (from `pg_attribute`, count printed, > 0). Each has `relrowsecurity` **and** `relforcerowsecurity` **and** ≥ 1 policy; as tenant A: ≥ 1 own row and 0 of B's in every table | `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` on one table, or a `USING (true)` policy → red |
| intel cannot write | Fixed expected count N of tables (from the migration manifest). As `munim_intel_ro`: INSERT, UPDATE, DELETE, TRUNCATE each denied with SQLSTATE `42501` on N/N; functions **in our schemas** executable by `munim_intel_ro` = 0 | grant USAGE + INSERT on one table → red |
| Service has no book grants | `has_table_privilege('munim_svc', t, 'INSERT,UPDATE')` false for every book-tagged table (count = book tables from tags) and true for each listed operational table | grant INSERT on one book table → red |
| Book guard | As `munim_core` with no admitting context: a write to each book table raises `MB001` (count = book tables); with a member command allowed by authority → accepted; with an `executing` draft in this txid → accepted; replaying a decision id from an earlier txid → `MB001`; derivation with a listed rule + existing source → accepted, unlisted → `MB001` | drop the trigger on one table → its write succeeds → red |
| Definer owners | functions with `prosecdef` and views owned by `munim_crosstenant` = exactly {`outbox_claim`, `active_tenants`, `tenant_registry`} | add one → red |
| Tags | tagged tables = all tables in `core` | untag one → red |
| Balanced books | unbalanced entry rejected at commit; balanced accepted | disable trigger → red |
| Append-only | update/delete on posting, movement, audit, loyalty → `42501`; insert accepted | grant delete → red |
| Audit chain | recomputed hashes N/N | tamper one → red |
| Duplicate supplier invoice | second refused, first accepted | drop unique → red |
| Country fixed at onboarding | country change before `onboarded_at` accepted, after → refused; a price in a different currency → refused, same currency → accepted | drop the trigger → red |
| No Supabase-isms | static scan of `db/` finds 0 forbidden constructs (list in R31) | plant `auth.uid()` → 1 → red |
| Template numeric sources | every numeric column's source in the allow-list | add a template reading `intel.claim.object` numerically → red |
