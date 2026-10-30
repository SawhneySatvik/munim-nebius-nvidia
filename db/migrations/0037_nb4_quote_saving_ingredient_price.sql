-- 0037_nb4_quote_saving_ingredient_price — NB-4 (09-nebius-finish: the cited saving and the ingredient-price signal; why:
-- lanes/A.report.md P2 "The saving on that line" and "Price check through Tavily"), migrator lane, fix forward over 0001–0036.
-- Runs as munim_migrator. Additive: one nullable column with its FK and index, a widened kind CHECK and two new CHECKs on
-- core.market_signal, three new template versions and one new template. No table, policy, trigger, function, grant, command
-- type or derivation rule is changed; no row is written; no earlier template version is touched.
-- Items:
--   S1  purchasing.quote_compare v2 = v1's SQL, params, role and columns, with two columns appended (row order unchanged, so a
--       draft's ⟨snap·row·col⟩ refs keep their meaning):
--         reference_unit_price_minor  the last price paid for the quoted ingredient, from the books. Basis: the latest receipt into
--           stock (core.stock_movement kind 'receipt' with a unit cost: a goods receipt's landed cost, or an opening balance's
--           stated cost) of that ingredient, in the quote's currency, at the outlets of the quote's run (its outlet_scope; '*' =
--           every outlet), at or before the run was issued (intel.run.issued_at; latest by at, then id). Anchored to the run,
--           not to now or to the minter: the PO this negotiation produces, or any later receipt, does not move the cell, and an
--           owner and an outlet manager who can both see the run read the same value. Converted to the quote's unit (kg↔g,
--           l↔ml, as purchasing.price_creep) and rounded once to whole minor units: round(per1000 × f ÷ 1000), f = receipt
--           units per quote unit; NULL when no such receipt exists or its unit does not convert to the quote's.
--         saving_minor  (reference_unit_price_minor − unit_price_minor) × qty_milli ÷ 1000, from those two integer cells, exact
--           numeric (no floating point), rounded once to the minor unit (half away from zero); negative when the quote costs
--           more than the last price paid; NULL when the reference is NULL.
--   M1  core.market_signal: kind admits 'ingredient_price' (market_signal_kind_check, 0012's inline CHECK, dropped and re-added
--       under its own name with every older kind). An ingredient's price needs the ingredient, which the table cannot name
--       (item_id is a menu item; label is a slug): new nullable column ingredient_id (FK → core.ingredient, index
--       market_signal_ingredient_id_fk_idx (tenant_id, ingredient_id, on_date)). CHECKs: ingredient_id is set exactly on
--       ingredient_price rows; an ingredient_price row carries a price (value_minor, so currency, 0012) for a quantity
--       (value_milli set and > 0, so unit, 0012 — "IS NOT NULL" written out: a CHECK passes on NULL) and a source that is a
--       short lowercase token, not prose (it is returned to models below; the 0012 source CHECK only refuses ''). item_id
--       stays NULL on such a row (0012: item_id with value_minor ⇔ competitor_price). Rows still enter only inside an approved
--       import (0014 from_import trigger, unchanged); the column takes the table's grants (munim_core SELECT, INSERT;
--       munim_svc SELECT; read back below).
--   M2  market.upcoming v4 and market.signal_uplift v3 = the previous version with one clause changed: their `sig` CTE excludes
--       ingredient_price as it already excludes competitor_price. `sig` feeds the days ahead (upcoming), the past effect and
--       the "normal" baseline days (both), so a price observation is never an event and never makes its day abnormal. Same
--       params, columns and min_role. market.competitor_gap reads competitor_price only and is unchanged.
--   M3  market.ingredient_price v1 (min_role manager, as the market templates): one ingredient's price signals observed in
--       the :days days to the outlets' business date (as_of NULL = today; the competitor-price template's window and scope:
--       signals at the outlet or tenant-wide, outlets narrowed to the minter's own in the SQL). One row per signal: id,
--       observed date, outlet (NULL = all), label, source, value_minor + currency for value_milli of unit, and
--       unit_price_minor = round(value_minor × 1000 ÷ value_milli), the price of one unit. Agent exposure is the specialist
--       registry's (packages/contracts), not the database's.
-- Guarantee scan (both clauses). Books: nothing here writes a row or opens a write path; the new column is written only where
-- the table is written — inside an approved imports.run.commit.v1 decision (0014 MB006), as the approver; munim_svc and
-- munim_intel_ro gain nothing (read back below); no NOTIFY/SSE, error or trace payload is touched. Traces to a ledger row:
-- every new numeric column names its source columns (numeric_source); the saving is computed in SQL from the quote row and
-- the receipt row it cites, never by a browser or a model; the market price is the imported signal row; the only free text a
-- new template returns (source, label) is CHECKed to a token.
-- New SQLSTATEs: none (23514 from the CHECKs, 23503 from the FK).

------------------------------------------------------------------------------------------------------------
-- 0. Pre-checks: what this file builds on is the shape it builds on.
------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(w.id || ' versions ' || coalesce(t.v::text, 'none'), ', ') INTO bad
    FROM (VALUES ('purchasing.quote_compare', ARRAY[1]), ('market.upcoming', ARRAY[1, 2, 3]), ('market.signal_uplift', ARRAY[1, 2]),
                 ('market.ingredient_price', NULL::int[])) w(id, want)
    LEFT JOIN LATERAL (SELECT array_agg(version ORDER BY version) v FROM evidence.snapshot_template WHERE id = w.id) t ON true
   WHERE t.v IS DISTINCT FROM w.want;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '0037: templates not at the versions this file extends: %', bad; END IF;
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
       WHERE c.conrelid = 'core.market_signal'::regclass AND c.conname = 'market_signal_kind_check' AND c.contype = 'c')
     IS DISTINCT FROM $d$CHECK ((kind = ANY (ARRAY['weather'::text, 'festival'::text, 'holiday'::text, 'local_event'::text, 'competitor_price'::text, 'other'::text])))$d$ THEN
    RAISE EXCEPTION '0037: core.market_signal market_signal_kind_check is not the 0012 kind list 0037 widens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'core.market_signal'::regclass AND attname = 'ingredient_id' AND NOT attisdropped)
     OR to_regclass('core.market_signal_ingredient_id_fk_idx') IS NOT NULL THEN
    RAISE EXCEPTION '0037: core.market_signal already has an ingredient column or index';
  END IF;
END $$;

------------------------------------------------------------------------------------------------------------
-- 1. S1 — purchasing.quote_compare v2 (the last price paid and the saving per quote)
------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  conv constant text := $c$WITH conv (from_unit, to_unit, f) AS (VALUES ('kg', 'g', 1000::numeric), ('g', 'kg', 0.001), ('l', 'ml', 1000), ('ml', 'l', 0.001))
$c$;
  -- [anchor in v1, replacement]: each anchor must occur exactly once in v1's text.
  edits constant text[][] := ARRAY[
    [$a$q.payment_days::bigint AS payment_days
$a$,
     $a$q.payment_days::bigint AS payment_days,
       rf.ref::bigint AS reference_unit_price_minor,
       round((rf.ref - q.unit_price_minor) * q.qty_milli / 1000.0)::bigint AS saving_minor
$a$],
    [$a$  JOIN intel.run r ON r.tenant_id = q.tenant_id AND r.id = q.run_id
$a$,
     $a$  JOIN intel.run r ON r.tenant_id = q.tenant_id AND r.id = q.run_id
  LEFT JOIN LATERAL (
    SELECT round(m.unit_cost_per_1000_minor * CASE WHEN m.unit = q.unit THEN 1 ELSE cv.f END / 1000.0) AS ref
      FROM core.stock_movement m
      LEFT JOIN conv cv ON cv.from_unit = q.unit AND cv.to_unit = m.unit
     WHERE m.tenant_id = q.tenant_id AND m.ingredient_id = q.ingredient_id AND m.kind = 'receipt'
       AND m.unit_cost_per_1000_minor IS NOT NULL AND m.currency = q.currency AND m.at <= r.issued_at
       AND ('*' = ANY (r.outlet_scope) OR m.outlet_id::text = ANY (r.outlet_scope))
     ORDER BY m.at DESC, m.id DESC LIMIT 1) rf ON true
$a$]];
  v1 evidence.snapshot_template;
  q  text;
  i  integer;
BEGIN
  SELECT * INTO v1 FROM evidence.snapshot_template WHERE id = 'purchasing.quote_compare' AND version = 1;
  IF left(v1.sql, 24) <> 'SELECT q.id AS quote_id,' THEN
    RAISE EXCEPTION '0037: purchasing.quote_compare v1 does not start with its select list';
  END IF;
  q := v1.sql;
  FOR i IN 1 .. array_length(edits, 1) LOOP
    IF (length(q) - length(replace(q, edits[i][1], ''))) / length(edits[i][1]) <> 1 THEN
      RAISE EXCEPTION '0037: purchasing.quote_compare v1 anchor % does not occur exactly once', i;
    END IF;
    q := replace(q, edits[i][1], edits[i][2]);
  END LOOP;
  INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role)
  VALUES ('purchasing.quote_compare', 2, conv || q, v1.params_schema,
          v1.columns || '[{"name": "reference_unit_price_minor", "type": "integer", "numeric_source": "core.stock_movement.unit_cost_per_1000_minor"},
                          {"name": "saving_minor", "type": "integer", "numeric_source": ["core.stock_movement.unit_cost_per_1000_minor", "intel.supplier_quote.unit_price_minor", "intel.supplier_quote.qty_milli"]}]'::jsonb,
          v1.min_role);
END $$;

------------------------------------------------------------------------------------------------------------
-- 2. M1 — core.market_signal: the ingredient_price kind and the ingredient it prices
------------------------------------------------------------------------------------------------------------
ALTER TABLE core.market_signal DROP CONSTRAINT market_signal_kind_check;
ALTER TABLE core.market_signal ADD CONSTRAINT market_signal_kind_check
  CHECK (kind IN ('weather', 'festival', 'holiday', 'local_event', 'competitor_price', 'other', 'ingredient_price'));
ALTER TABLE core.market_signal ADD COLUMN ingredient_id uuid;
ALTER TABLE core.market_signal
  ADD CONSTRAINT market_signal_tenant_id_ingredient_id_fkey FOREIGN KEY (tenant_id, ingredient_id) REFERENCES core.ingredient (tenant_id, id),
  ADD CONSTRAINT market_signal_ingredient_price_check CHECK ((kind = 'ingredient_price') = (ingredient_id IS NOT NULL)),
  ADD CONSTRAINT market_signal_ingredient_price_value_check
    CHECK (kind <> 'ingredient_price' OR (value_minor IS NOT NULL AND value_milli IS NOT NULL AND value_milli > 0 AND source ~ '^[a-z0-9][a-z0-9._:-]{0,79}$'));
CREATE INDEX market_signal_ingredient_id_fk_idx ON core.market_signal (tenant_id, ingredient_id, on_date);
REVOKE ALL (ingredient_id) ON core.market_signal FROM PUBLIC;

------------------------------------------------------------------------------------------------------------
-- 3. M2 — market.upcoming v4, market.signal_uplift v3: a price observation is not an event
------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  old_clause constant text := $a$   WHERE s.kind <> 'competitor_price'),$a$;
  new_clause constant text := $a$   WHERE s.kind NOT IN ('competitor_price', 'ingredient_price')),$a$;
  r    record;
  prev evidence.snapshot_template;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('market.upcoming', 3), ('market.signal_uplift', 2)) x (id, v) LOOP
    SELECT * INTO prev FROM evidence.snapshot_template WHERE id = r.id AND version = r.v;
    IF (length(prev.sql) - length(replace(prev.sql, old_clause, ''))) / length(old_clause) <> 1 THEN
      RAISE EXCEPTION '0037: % v% does not contain its sig filter exactly once', r.id, r.v;
    END IF;
    INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role)
    VALUES (r.id, r.v + 1, replace(prev.sql, old_clause, new_clause), prev.params_schema, prev.columns, prev.min_role);
  END LOOP;
END $$;

------------------------------------------------------------------------------------------------------------
-- 4. M3 — market.ingredient_price v1
------------------------------------------------------------------------------------------------------------
INSERT INTO evidence.snapshot_template (id, version, sql, params_schema, columns, min_role) VALUES (
  'market.ingredient_price', 1,
  $q$WITH ou AS (
  SELECT o.id, coalesce(:as_of::date, ((now() AT TIME ZONE o.tz) - o.business_day_cutoff)::date) AS today FROM core.outlet o
   WHERE (:outlet_id::uuid IS NULL OR o.id = :outlet_id::uuid)
     AND ((SELECT current_setting('app.outlet_ids', true)) = '{*}'
          OR o.id = ANY ((SELECT nullif(nullif(current_setting('app.outlet_ids', true), ''), '{*}'))::uuid[]))),
td AS (SELECT min(today) AS today FROM ou)
SELECT s.id AS signal_id, s.on_date, s.outlet_id, s.label, s.source, s.value_minor::bigint AS value_minor, s.currency::text AS currency,
       s.value_milli::bigint AS value_milli, s.unit, round(s.value_minor * 1000.0 / s.value_milli)::bigint AS unit_price_minor
  FROM core.market_signal s, td
 WHERE s.kind = 'ingredient_price' AND s.ingredient_id = :ingredient_id::uuid
   AND (s.outlet_id IS NULL OR s.outlet_id IN (SELECT id FROM ou))
   AND s.on_date > td.today - :days::int AND s.on_date <= td.today
 ORDER BY s.on_date, s.outlet_id NULLS FIRST, s.id$q$,
  '{"type": "object", "required": ["outlet_id", "ingredient_id", "days", "as_of"], "additionalProperties": false,
    "properties": {"outlet_id": {"type": ["string", "null"], "format": "uuid"}, "ingredient_id": {"type": "string", "format": "uuid"},
                   "days": {"type": "integer", "minimum": 1, "maximum": 365}, "as_of": {"type": ["string", "null"], "format": "date"}}}',
  '[{"name": "signal_id", "type": "uuid"},
    {"name": "on_date", "type": "date"},
    {"name": "outlet_id", "type": "uuid"},
    {"name": "label", "type": "text"},
    {"name": "source", "type": "text"},
    {"name": "value_minor", "type": "integer", "numeric_source": "core.market_signal.value_minor"},
    {"name": "currency", "type": "text"},
    {"name": "value_milli", "type": "integer", "numeric_source": "core.market_signal.value_milli"},
    {"name": "unit", "type": "text"},
    {"name": "unit_price_minor", "type": "integer", "numeric_source": ["core.market_signal.value_minor", "core.market_signal.value_milli"]}]',
  'manager');

------------------------------------------------------------------------------------------------------------
-- 5. Post-conditions (read back what Postgres holds; the expected text is typed again here, not reused from above)
------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  kinds constant text := $d$CHECK ((kind = ANY (ARRAY['weather'::text, 'festival'::text, 'holiday'::text, 'local_event'::text, 'competitor_price'::text, 'other'::text, 'ingredient_price'::text])))$d$;
  old_clause constant text := $a$   WHERE s.kind <> 'competitor_price'),$a$;
  new_clause constant text := $a$   WHERE s.kind NOT IN ('competitor_price', 'ingredient_price')),$a$;
  bad text;
BEGIN
  SELECT string_agg(x, ', ') INTO bad FROM (
    -- M1: the kind CHECK reads back with every 0012 kind and the new one, validated.
    SELECT 'kind check' AS x WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c
                                                WHERE c.conrelid = 'core.market_signal'::regclass AND c.conname = 'market_signal_kind_check'
                                                  AND c.contype = 'c' AND c.convalidated AND pg_get_constraintdef(c.oid) = kinds)
    UNION ALL
    -- M1: the two new CHECKs, exactly; the 0012 competitor CHECK untouched.
    SELECT 'checks' WHERE (SELECT string_agg(conname || '=' || pg_get_constraintdef(oid), ' | ' ORDER BY conname) FROM pg_constraint
                            WHERE conrelid = 'core.market_signal'::regclass AND contype = 'c' AND convalidated
                              AND conname IN ('market_signal_ingredient_price_check', 'market_signal_ingredient_price_value_check', 'market_signal_check2'))
      IS DISTINCT FROM $d$market_signal_check2=CHECK (((kind = 'competitor_price'::text) = ((item_id IS NOT NULL) AND (value_minor IS NOT NULL))))$d$
                    || $d$ | market_signal_ingredient_price_check=CHECK (((kind = 'ingredient_price'::text) = (ingredient_id IS NOT NULL)))$d$
                    || $d$ | market_signal_ingredient_price_value_check=CHECK (((kind <> 'ingredient_price'::text) OR ((value_minor IS NOT NULL) AND (value_milli IS NOT NULL) AND (value_milli > 0) AND (source ~ '^[a-z0-9][a-z0-9._:-]{0,79}$'::text))))$d$
    UNION ALL
    -- M1: the column (uuid, nullable, no default), its FK (validated, no cascade) and its covering index (by pg_index columns).
    SELECT 'column' WHERE (SELECT data_type || ':' || is_nullable || ':' || coalesce(column_default, 'none') FROM information_schema.columns
                            WHERE table_schema = 'core' AND table_name = 'market_signal' AND column_name = 'ingredient_id')
                          IS DISTINCT FROM 'uuid:YES:none'
    UNION ALL
    SELECT 'fk' WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'core.market_signal'::regclass
                                     AND c.conname = 'market_signal_tenant_id_ingredient_id_fkey' AND c.contype = 'f' AND c.convalidated
                                     AND c.confdeltype = 'a' AND c.confupdtype = 'a'
                                     AND pg_get_constraintdef(c.oid) = 'FOREIGN KEY (tenant_id, ingredient_id) REFERENCES core.ingredient(tenant_id, id)')
    UNION ALL
    SELECT 'index' WHERE (SELECT array_agg(a.attname::text ORDER BY k.n) FROM pg_index i
                            CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY k(attnum, n)
                            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                           WHERE i.indexrelid = 'core.market_signal_ingredient_id_fk_idx'::regclass AND i.indrelid = 'core.market_signal'::regclass
                             AND NOT i.indisunique AND i.indpred IS NULL)
                         IS DISTINCT FROM ARRAY['tenant_id', 'ingredient_id', 'on_date']
    UNION ALL
    -- M1: who reads and writes the column — the table's grants, read back: munim_core reads and inserts it, munim_svc reads it,
    -- nobody updates it, and intel, the platform role and PUBLIC have nothing.
    SELECT 'grants:' || r FROM unnest(ARRAY['munim_core', 'munim_svc', 'munim_platform', 'munim_intel_ro', 'munim_crosstenant', 'public']) r
     WHERE has_column_privilege(r, 'core.market_signal', 'ingredient_id', 'SELECT') <> (r IN ('munim_core', 'munim_svc'))
        OR has_column_privilege(r, 'core.market_signal', 'ingredient_id', 'INSERT') <> (r = 'munim_core')
        OR has_column_privilege(r, 'core.market_signal', 'ingredient_id', 'UPDATE')
    UNION ALL
    -- M1: still operational, still import-only (from_import) and currency-checked, still the three 0019 policies.
    SELECT 'table' WHERE obj_description('core.market_signal'::regclass, 'pg_class') IS DISTINCT FROM 'munim:operational'
       OR (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'core.market_signal'::regclass AND NOT tgisinternal)
          IS DISTINCT FROM 'currency_check,from_import'
       OR (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy WHERE polrelid = 'core.market_signal'::regclass)
          IS DISTINCT FROM 'customer_scope,guest_scope,tenant_outlet_isolation'
    UNION ALL
    -- S1: v2 is the latest, with v1's params and role, v1's columns plus the two (named, sourced), and v1's text where v1 had it.
    SELECT 'quote_compare:' || coalesce(n.id, 'missing') FROM (SELECT 1) one
      LEFT JOIN evidence.snapshot_template n ON n.id = 'purchasing.quote_compare' AND n.version = 2
      LEFT JOIN evidence.snapshot_template o ON o.id = 'purchasing.quote_compare' AND o.version = 1
     WHERE n.id IS NULL OR (SELECT max(version) FROM evidence.snapshot_template WHERE id = 'purchasing.quote_compare') <> 2
        OR n.params_schema IS DISTINCT FROM o.params_schema OR n.min_role IS DISTINCT FROM o.min_role
        OR n.columns IS DISTINCT FROM o.columns || '[{"name": "reference_unit_price_minor", "type": "integer", "numeric_source": "core.stock_movement.unit_cost_per_1000_minor"},
                                                     {"name": "saving_minor", "type": "integer", "numeric_source": ["core.stock_movement.unit_cost_per_1000_minor", "intel.supplier_quote.unit_price_minor", "intel.supplier_quote.qty_milli"]}]'::jsonb
        OR position('round((rf.ref - q.unit_price_minor) * q.qty_milli / 1000.0)::bigint AS saving_minor' IN n.sql) = 0
        OR position('m.at <= r.issued_at' IN n.sql) = 0
        OR position($p$('*' = ANY (r.outlet_scope) OR m.outlet_id::text = ANY (r.outlet_scope))$p$ IN n.sql) = 0
        OR position('m.currency = q.currency' IN n.sql) = 0
        OR position(' WHERE q.run_id = :negotiation_run_id::uuid
 ORDER BY q.round, q.supplier_id, q.created_at, q.id' IN n.sql) = 0
        OR position(split_part(o.sql, E'\n', 1) IN n.sql) = 0
        OR n.sql ~* '(now\(|current_date|current_timestamp|localtimestamp|clock_timestamp|transaction_timestamp|statement_timestamp)'
    UNION ALL
    -- M2: each new version is the previous one with exactly the sig filter changed, at the previous params, columns and role.
    SELECT 'sig:' || w.id FROM (VALUES ('market.upcoming', 4), ('market.signal_uplift', 3)) w(id, v)
      LEFT JOIN evidence.snapshot_template n ON n.id = w.id AND n.version = w.v
      LEFT JOIN evidence.snapshot_template o ON o.id = w.id AND o.version = w.v - 1
     WHERE n.id IS NULL OR o.id IS NULL OR (SELECT max(version) FROM evidence.snapshot_template WHERE id = w.id) <> w.v
        OR n.params_schema IS DISTINCT FROM o.params_schema OR n.columns IS DISTINCT FROM o.columns OR n.min_role IS DISTINCT FROM o.min_role
        OR position(new_clause IN n.sql) = 0 OR position(old_clause IN n.sql) > 0 OR replace(n.sql, new_clause, old_clause) <> o.sql
    UNION ALL
    -- M3: the new template, once, at manager, with its params and columns.
    SELECT 'ingredient_price' WHERE (SELECT array_agg(version || ':' || min_role || ':'
                                                     || (SELECT string_agg(r, ',' ORDER BY r) FROM jsonb_array_elements_text(params_schema -> 'required') r) || ':'
                                                     || (SELECT string_agg(c ->> 'name', ',' ORDER BY k) FROM jsonb_array_elements(columns) WITH ORDINALITY e(c, k)))
                                       FROM evidence.snapshot_template WHERE id = 'market.ingredient_price')
      IS DISTINCT FROM ARRAY['1:manager:as_of,days,ingredient_id,outlet_id:signal_id,on_date,outlet_id,label,source,value_minor,currency,value_milli,unit,unit_price_minor']
    UNION ALL
    -- Every latest template that reads core.market_signal names the kinds it reads: competitor_price only, or the new kind by
    -- name (a reader that does neither would take a price observation as an event).
    SELECT 'reader:' || t.id FROM evidence.snapshot_template t
     WHERE t.version = (SELECT max(x.version) FROM evidence.snapshot_template x WHERE x.id = t.id)
       AND position('core.market_signal' IN t.sql) > 0
       AND position('''ingredient_price''' IN t.sql) = 0 AND position('s.kind = ''competitor_price''' IN t.sql) = 0
    UNION ALL
    -- No new version or template reads the wall clock except as the as_of fallback (0022's rule), and none beyond the version
    -- it extends (the new template: once, its as_of fallback).
    SELECT 'clock:' || n.id FROM evidence.snapshot_template n
      LEFT JOIN evidence.snapshot_template o ON o.id = n.id AND o.version = n.version - 1
     WHERE (n.id, n.version) IN (('purchasing.quote_compare', 2), ('market.upcoming', 4), ('market.signal_uplift', 3), ('market.ingredient_price', 1))
       AND ((SELECT count(*) FROM regexp_matches(n.sql, '(now\(|current_date|current_timestamp|localtimestamp|clock_timestamp)', 'gi'))
            <> CASE WHEN o.id IS NULL THEN 1
                    ELSE (SELECT count(*) FROM regexp_matches(o.sql, '(now\(|current_date|current_timestamp|localtimestamp|clock_timestamp)', 'gi')) END
            OR regexp_replace(n.sql, 'coalesce\(:as_of::date, \(\(now\(\) AT TIME ZONE [a-z]+\.tz\) - [a-z]+\.business_day_cutoff\)::date\)', '', 'g')
               ~* '(now\(|current_date|current_timestamp|localtimestamp|clock_timestamp|transaction_timestamp|statement_timestamp)')) y;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '0037: not as written: %', bad; END IF;

  PERFORM munim_meta.assert_catalog('0037');
END $$;
