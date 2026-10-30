-- 0036_ev3_nebius_provider — EV-3 / P1 (08-events-build: the Nebius entry counts only Token Factory calls, so a `nebius` provider
-- is built beside `nvidia`), migrator lane M, fix forward over 0001–0035. Runs as munim_migrator. Additive: two provider CHECKs
-- admit one more value. No table, column, index, policy, trigger, function, grant, command type, template or derivation rule is
-- changed; no row is written.
-- Items:
--   P1  platform.model_role.provider (0002, inline CHECK, auto-named model_role_provider_check): gemini, openai, openrouter,
--       nvidia, and now nebius. Dropped and re-added under the same name, written out here, in this file's one transaction. Every
--       value the 0002 list admits is still admitted, so no existing row can fail the new CHECK. A role still changes only
--       through an approved platform.config_draft (R24, T-031); munim_platform's UPDATE (provider, …) grant is 0002's, unchanged.
--       The model_id CHECK (never gemini-2.5-*, CLAUDE.md rule 13) is not touched.
--   P2  intel.intel_spend.provider (0012, inline CHECK, auto-named intel_spend_provider_check): the same list, the same way, so a
--       call served by `nebius` can be recorded as spend. Written by core-api's internal spend route as munim_svc (0012's grants,
--       unchanged); intel still has no write grant on it (R25).
-- Guarantee scan (both clauses). Books: nothing here writes or opens a write path to the books; no grant, policy, trigger or
-- function changes, and no NOTIFY/SSE or error payload is touched. Traces to a ledger row: no rendered number changes; spend rows
-- keep their amount, currency and model_id columns and checks, and a nebius spend row is a ledger row like any other.
-- New SQLSTATEs: none (23514 from the CHECKs, as before).

------------------------------------------------------------------------------------------------------------
-- 0. Pre-checks: what this file builds on is the shape it builds on.
------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  four constant text := $d$CHECK ((provider = ANY (ARRAY['gemini'::text, 'openai'::text, 'openrouter'::text, 'nvidia'::text])))$d$;
BEGIN
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
       WHERE c.conrelid = 'platform.model_role'::regclass AND c.conname = 'model_role_provider_check') IS DISTINCT FROM four THEN
    RAISE EXCEPTION '0036: platform.model_role model_role_provider_check is not the 0002 provider list 0036 widens';
  END IF;
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
       WHERE c.conrelid = 'intel.intel_spend'::regclass AND c.conname = 'intel_spend_provider_check') IS DISTINCT FROM four THEN
    RAISE EXCEPTION '0036: intel.intel_spend intel_spend_provider_check is not the 0012 provider list 0036 widens';
  END IF;
END $$;

------------------------------------------------------------------------------------------------------------
-- 1. P1 — platform.model_role
------------------------------------------------------------------------------------------------------------
ALTER TABLE platform.model_role DROP CONSTRAINT model_role_provider_check;
ALTER TABLE platform.model_role ADD CONSTRAINT model_role_provider_check
  CHECK (provider IN ('gemini', 'openai', 'openrouter', 'nvidia', 'nebius'));

------------------------------------------------------------------------------------------------------------
-- 2. P2 — intel.intel_spend
------------------------------------------------------------------------------------------------------------
ALTER TABLE intel.intel_spend DROP CONSTRAINT intel_spend_provider_check;
ALTER TABLE intel.intel_spend ADD CONSTRAINT intel_spend_provider_check
  CHECK (provider IN ('gemini', 'openai', 'openrouter', 'nvidia', 'nebius'));

------------------------------------------------------------------------------------------------------------
-- 3. Post-conditions (read back what Postgres holds)
------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  -- P1/P2's list, typed again: the read-back compares Postgres's own rendering with it, not with what blocks 1–2 sent.
  five constant text := $d$CHECK ((provider = ANY (ARRAY['gemini'::text, 'openai'::text, 'openrouter'::text, 'nvidia'::text, 'nebius'::text])))$d$;
  bad text;
BEGIN
  SELECT string_agg(x, ', ') INTO bad FROM (
    -- P1/P2: the named CHECK reads back as written and is validated (every existing row was checked against it).
    SELECT t || ' def' AS x FROM (VALUES ('platform.model_role', 'model_role_provider_check'),
                                         ('intel.intel_spend', 'intel_spend_provider_check')) v (t, n)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c
                        WHERE c.conrelid = v.t::regclass AND c.conname = v.n AND c.contype = 'c' AND c.convalidated
                          AND pg_get_constraintdef(c.oid) = five)
    UNION ALL
    -- P1/P2: exactly one CHECK on each table reads the provider column (no leftover narrower or duplicate CHECK).
    SELECT t || ' count' FROM (VALUES ('platform.model_role'), ('intel.intel_spend')) v (t)
     WHERE (SELECT count(*) FROM pg_constraint c
             WHERE c.conrelid = v.t::regclass AND c.contype = 'c'
               AND (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = v.t::regclass AND a.attname = 'provider') = ANY (c.conkey)) <> 1
    UNION ALL
    -- P1: the model_id CHECK (never gemini-2.5-*) is still 0002's.
    SELECT 'model_role model_id' WHERE (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
                                         WHERE c.conrelid = 'platform.model_role'::regclass AND c.conname = 'model_role_model_id_check')
                                       IS DISTINCT FROM $d$CHECK (((model_id <> ''::text) AND (model_id !~* 'gemini-2\.5'::text)))$d$) y;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '0036: provider CHECKs not as written: %', bad; END IF;

  PERFORM munim_meta.assert_catalog('0036');
END $$;
