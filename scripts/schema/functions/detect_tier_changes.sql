-- detect_tier_changes(p_current_date)
--
-- Compares score_snapshots between the given date and the most recent prior
-- snapshot date. Returns all institutions whose tier changed, with names.
--
-- Used by cron-snapshot-scores.mjs to report tier upgrades/downgrades,
-- and eventually by the Slack digest (Phase 3b).
--
-- Returns empty set if there's no previous snapshot to compare against.

CREATE OR REPLACE FUNCTION public.detect_tier_changes(p_current_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  entity_id uuid,
  name text,
  prev_tier text,
  new_tier text,
  prev_score integer,
  new_score integer,
  prev_date date,
  new_date date
)
LANGUAGE sql
STABLE
AS $function$
  WITH prev_date AS (
    SELECT MAX(snapshot_date) AS d
    FROM score_snapshots
    WHERE snapshot_date < p_current_date
  ),
  current_snap AS (
    SELECT entity_id, tier, score
    FROM score_snapshots
    WHERE snapshot_date = p_current_date
  ),
  prev_snap AS (
    SELECT s.entity_id, s.tier, s.score
    FROM score_snapshots s, prev_date pd
    WHERE s.snapshot_date = pd.d
  )
  SELECT
    c.entity_id,
    i.name,
    p.tier AS prev_tier,
    c.tier AS new_tier,
    p.score AS prev_score,
    c.score AS new_score,
    pd.d AS prev_date,
    p_current_date AS new_date
  FROM current_snap c
  JOIN prev_snap p ON p.entity_id = c.entity_id
  JOIN institutions i ON i.id = c.entity_id
  CROSS JOIN prev_date pd
  WHERE c.tier IS DISTINCT FROM p.tier
  ORDER BY c.score DESC;
$function$;
