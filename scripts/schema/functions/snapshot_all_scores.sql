-- snapshot_all_scores(p_snapshot_date)
--
-- Bulk-snapshot all active institutions' Brim scores into score_snapshots.
-- Calls compute_brim_score() for each active institution and upserts results.
-- Idempotent per date: re-running on the same day updates existing rows.
--
-- Usage:
--   SELECT snapshot_all_scores();              -- snapshot for today
--   SELECT snapshot_all_scores('2026-04-16');  -- snapshot for a specific date
--
-- Expected runtime: ~30s for 10K institutions (depends on signal density).
-- Called by the weekly cron job in scripts/cron-snapshot-scores.mjs.

CREATE OR REPLACE FUNCTION public.snapshot_all_scores(p_snapshot_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO score_snapshots (entity_table, entity_id, score, tier, signals_populated, signals_possible, completeness, raw_score, disqualified, factors, snapshot_date)
  SELECT
    'institutions',
    i.id,
    bs.score,
    bs.tier,
    COALESCE((bs.factors->>'signals_populated')::integer, 0),
    COALESCE((bs.factors->>'signals_possible')::integer, 0),
    COALESCE((bs.factors->>'completeness')::numeric, 0),
    COALESCE((bs.factors->>'raw_score')::numeric, 0),
    COALESCE((bs.factors->>'disqualified')::boolean, false),
    bs.factors,
    p_snapshot_date
  FROM institutions i
  CROSS JOIN LATERAL compute_brim_score('institutions', i.id) bs
  WHERE i.active = true
  ON CONFLICT (entity_table, entity_id, snapshot_date)
  DO UPDATE SET
    score = EXCLUDED.score,
    tier = EXCLUDED.tier,
    signals_populated = EXCLUDED.signals_populated,
    signals_possible = EXCLUDED.signals_possible,
    completeness = EXCLUDED.completeness,
    raw_score = EXCLUDED.raw_score,
    disqualified = EXCLUDED.disqualified,
    factors = EXCLUDED.factors;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
