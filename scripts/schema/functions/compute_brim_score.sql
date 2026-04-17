-- compute_brim_score(p_entity_table, p_entity_id)
--
-- Computes the Brim Fit score and tier for a single entity.
-- Pulls latest signal facts from entity_facts, joins against signal_registry
-- for weights/freshness/disqualifier config, and returns:
--   score (0-100 integer), tier (A/B/C/D/F), factors (JSONB breakdown), computed_at
--
-- Tier thresholds (recalibrated 2026-04-14):
--   A >= 55, B >= 40, C >= 25, D >= 15, F < 15
-- Must stay in sync with BRIM_TIERS in src/lib/signals/registry.ts
-- and BrimScoreBadge in src/components/explore/ExploreResultsTable.tsx.
--
-- confidence_score convention: 0-100 (integer percent).
-- CHECK constraint entity_facts_confidence_score_range enforces this.
--
-- completeness: signals_populated / signals_possible ratio (0-1).
-- Added 2026-04-16.

CREATE OR REPLACE FUNCTION public.compute_brim_score(p_entity_table text, p_entity_id uuid)
 RETURNS TABLE(score integer, tier text, factors jsonb, computed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_raw_score DOUBLE PRECISION := 0;
  v_factors   JSONB := '[]'::jsonb;
  v_disq      BOOLEAN := FALSE;
  v_disq_list JSONB := '[]'::jsonb;
  v_score_int INTEGER;
  v_tier      TEXT;
  v_signals_populated INTEGER := 0;
  v_signals_possible  INTEGER;
BEGIN
  -- Count total v1 signals from signal_registry
  SELECT count(*) INTO v_signals_possible
  FROM signal_registry WHERE version = 'v1';

  WITH latest_facts AS (
    SELECT DISTINCT ON (ef.fact_type, ef.source_kind)
      ef.fact_type,
      ef.fact_key,
      ef.fact_value_text,
      ef.fact_value_number,
      ef.fact_value_json,
      ef.source_kind,
      ef.source_url,
      ef.observed_at,
      ef.confidence_score,
      sr.display_name,
      sr.category,
      sr.weight,
      sr.freshness_days,
      sr.disqualifier,
      sr.version
    FROM entity_facts ef
    JOIN signal_registry sr ON sr.fact_type = ef.fact_type
    WHERE ef.entity_table = p_entity_table
      AND ef.entity_id = p_entity_id
      AND ef.fact_type LIKE 'signal.%'
      AND sr.version = 'v1'
    ORDER BY ef.fact_type, ef.source_kind, ef.observed_at DESC NULLS LAST
  ),
  scored AS (
    SELECT
      lf.*,
      -- Linear decay: 1.0 up to freshness_days, then fade to 0 at 2x freshness_days.
      GREATEST(
        0,
        LEAST(
          1.0,
          CASE
            WHEN lf.observed_at IS NULL THEN 0.5
            WHEN EXTRACT(EPOCH FROM (now() - lf.observed_at)) / 86400 <= lf.freshness_days THEN 1.0
            ELSE 1.0 - (EXTRACT(EPOCH FROM (now() - lf.observed_at)) / 86400 - lf.freshness_days) / lf.freshness_days
          END
        )
      ) AS freshness,
      COALESCE(lf.confidence_score, 75) / 100.0 AS conf,
      -- Per-signal contribution: weight x freshness x confidence x signal-specific scaling
      CASE
        WHEN lf.fact_type = 'signal.asset_band_fit' THEN
          lf.weight *
          CASE lf.fact_value_text
            WHEN 'sweet_spot' THEN 1.0
            WHEN 'below_band' THEN 0.5
            WHEN 'above_band' THEN 0.5
            ELSE 0.0
          END
        -- card_portfolio_size: scale 0-1 by log of portfolio size. $1M->0, $1B->1.0
        WHEN lf.fact_type = 'signal.card_portfolio_size' THEN
          lf.weight * LEAST(1.0, GREATEST(0, (ln(GREATEST(lf.fact_value_number, 1)) - ln(1000000)) / (ln(1000000000) - ln(1000000))))
        -- agent_bank_dependency: scaled by value_text semantics. The signal is
        -- "does this institution run its card program through a third party?"
        -- Agent-bank relationships (TCM, Elan, FNBO, etc.) are the highest-
        -- value BD signal — the bank is already outsourcing, so switching is
        -- a conversation about vendor not a conversation about strategy.
        -- Card-as-a-service (Marqeta, Galileo) is medium — they chose modern
        -- but not Brim; switching cost is real but the posture is right.
        -- In-house operators at scale are lower — they've already invested,
        -- displacement requires more than "let us do it for you".
        WHEN lf.fact_type = 'signal.agent_bank_dependency' THEN
          lf.weight *
          CASE lf.fact_value_text
            WHEN 'tcm_bank'        THEN 1.0
            WHEN 'elan_financial'  THEN 1.0
            WHEN 'fnbo'            THEN 1.0
            WHEN 'synovus_cards'   THEN 1.0
            WHEN 'cardworks'       THEN 1.0
            WHEN 'pscu'            THEN 0.9
            WHEN 'co_op_financial' THEN 0.9
            WHEN 'visa_dps'        THEN 0.9
            WHEN 'agent_bank'      THEN 0.9
            WHEN 'marqeta'         THEN 0.65
            WHEN 'galileo'         THEN 0.65
            WHEN 'caas_vendor'     THEN 0.65
            WHEN 'in_house'        THEN 0.33
            ELSE 0.0
          END
        ELSE lf.weight
      END AS scaled_weight
    FROM latest_facts lf
  )
  SELECT
    COALESCE(SUM(scaled_weight * freshness * conf), 0),
    bool_or(disqualifier AND freshness > 0),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'fact_type', fact_type,
        'display_name', display_name,
        'category', category,
        'contribution', round((scaled_weight * freshness * conf)::numeric, 2),
        'raw_weight', weight,
        'freshness', round(freshness::numeric, 3),
        'confidence', round(conf::numeric, 3),
        'observed_at', observed_at,
        'source_kind', source_kind,
        'source_url', source_url,
        'value_text', fact_value_text,
        'value_number', fact_value_number,
        'disqualifier', disqualifier
      ) ORDER BY (scaled_weight * freshness * conf) DESC
    ) FILTER (WHERE fact_type IS NOT NULL), '[]'::jsonb),
    COALESCE(jsonb_agg(fact_type) FILTER (WHERE disqualifier AND freshness > 0), '[]'::jsonb),
    COUNT(DISTINCT fact_type)
  INTO v_raw_score, v_disq, v_factors, v_disq_list, v_signals_populated
  FROM scored;

  IF v_disq THEN
    v_score_int := 0;
    v_tier := 'F';
  ELSE
    -- Normalized to a 0-100 scale against the theoretical max positive sum of 150.
    v_score_int := GREATEST(0, LEAST(100, ROUND(v_raw_score * 100.0 / 150.0)::INTEGER));
    -- Recalibrated 2026-04-14: realistic ceilings without bank_capabilities are
    -- roughly 36/100 for best-in-class (Cadence, JPM). Lower thresholds so the
    -- top of the population actually surfaces above F.
    v_tier := CASE
      WHEN v_score_int >= 55 THEN 'A'
      WHEN v_score_int >= 40 THEN 'B'
      WHEN v_score_int >= 25 THEN 'C'
      WHEN v_score_int >= 15 THEN 'D'
      ELSE 'F'
    END;
  END IF;

  RETURN QUERY SELECT
    v_score_int,
    v_tier,
    jsonb_build_object(
      'signals', v_factors,
      'disqualifiers', v_disq_list,
      'raw_score', round(v_raw_score::numeric, 2),
      'max_possible', 150,
      'disqualified', v_disq,
      'signals_populated', v_signals_populated,
      'signals_possible', v_signals_possible,
      'completeness', round(v_signals_populated::numeric / GREATEST(v_signals_possible, 1)::numeric, 3)
    ),
    now();
END;
$function$;
