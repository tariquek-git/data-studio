-- ICP cohort: US FDIC banks and NCUA credit unions with $10B-$250B total assets.
-- 164 institutions as of 2026-04-17. The canonical definition of Brim's sweet
-- spot for card-issuing BD. Every ICP-scoped script queries this view rather
-- than repeating the asset-band filter.
--
-- Includes the latest score_snapshot row + CIK (if mapped via entity_external_ids).
-- Apply via mcp__supabase__apply_migration if schema needs to be regenerated.

CREATE OR REPLACE VIEW public.icp_cohort_10b_250b_us AS
WITH latest_snapshot_date AS (
  SELECT MAX(snapshot_date) AS d FROM score_snapshots
),
latest_snapshot AS (
  SELECT s.entity_id, s.score, s.tier, s.completeness, s.signals_populated, s.signals_possible
  FROM score_snapshots s, latest_snapshot_date lsd
  WHERE s.snapshot_date = lsd.d
)
SELECT
  i.id,
  i.cert_number,
  i.name,
  i.city,
  i.state,
  i.source,
  i.charter_type,
  i.regulator,
  i.holding_company,
  i.holding_company_id,
  i.total_assets,
  i.total_deposits,
  i.total_loans,
  i.credit_card_loans,
  i.roa,
  i.website,
  i.data_as_of,
  i.bd_exclusion_reason,
  i.active,
  ls.score AS brim_score,
  ls.tier AS brim_tier,
  ls.completeness AS brim_completeness,
  ls.signals_populated,
  ls.signals_possible,
  ei.id_value AS cik
FROM institutions i
LEFT JOIN latest_snapshot ls ON ls.entity_id = i.id
LEFT JOIN entity_external_ids ei
  ON ei.entity_id = i.id
  AND ei.entity_table = 'institutions'
  AND ei.id_type = 'cik'
WHERE i.active = true
  AND i.source IN ('fdic', 'ncua')
  AND i.total_assets BETWEEN 10e9 AND 250e9;
