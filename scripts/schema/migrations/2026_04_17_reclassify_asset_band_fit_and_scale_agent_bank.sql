-- 2026-04-17: two scoring changes to reflect the new $10B-$250B ICP definition.
--
-- (1) Re-classify signal.asset_band_fit for the new ICP. The original signal was
--     built for a $1-10B community-bank sweet spot. Tarique redefined (2026-04-17):
--     $10B-$250B US banks + CUs are the primary target. Classification is now:
--       $0 - $10B:     below_band   (half weight)
--       $10B - $250B:  sweet_spot   (full weight)
--       > $250B:       too_large    (zero weight)
--
-- (2) Scale signal.agent_bank_dependency by fact_value_text. Previously a blanket
--     +30 weight regardless of whether the bank used an agent bank (BD positive)
--     or ran in-house (BD negative/neutral). The pilot surfaced this as a bug —
--     First-Citizens (TCM Bank agent, prime target) scored equal to self-issuers
--     like Huntington. Now:
--       tcm_bank / elan_financial / fnbo / synovus_cards / cardworks  → 1.0x
--       pscu / co_op_financial / visa_dps / agent_bank                → 0.9x
--       marqeta / galileo / caas_vendor                               → 0.65x
--       in_house                                                      → 0.33x
--       anything else                                                 → 0.0x
--
-- Applied to prod Supabase (bvznhycwkgouwmaufdpe) via mcp__supabase__apply_migration
-- on 2026-04-17. This file persists the change in version control.

-- ─── Part 1: update signal_registry description + re-classify existing facts ─
UPDATE signal_registry
SET description = 'Total assets fall within Brim''s ICP sweet spot ($10B-$250B). Full weight in-band, half for $1-10B community banks, zero above $250B.',
    updated_at = now()
WHERE fact_type = 'signal.asset_band_fit';

UPDATE entity_facts ef
SET fact_value_text = CASE
      WHEN i.total_assets < 10e9 THEN 'below_band'
      WHEN i.total_assets <= 250e9 THEN 'sweet_spot'
      ELSE 'too_large'
    END,
    fact_value_json = jsonb_build_object(
      'total_assets_usd', i.total_assets,
      'icp_band', CASE
        WHEN i.total_assets < 10e9 THEN 'below_band'
        WHEN i.total_assets <= 250e9 THEN 'sweet_spot'
        ELSE 'too_large'
      END,
      'icp_version', '2026-04-17',
      'icp_description', '$10B-$250B US FDIC+NCUA sweet spot'
    ),
    notes = 'Re-classified 2026-04-17 for $10B-$250B ICP. ' || COALESCE(ef.notes, ''),
    updated_at = now()
FROM institutions i
WHERE ef.entity_id = i.id
  AND ef.entity_table = 'institutions'
  AND ef.fact_type = 'signal.asset_band_fit';

-- ─── Part 2 is in functions/compute_brim_score.sql (the CASE-on-value_text update)
-- The function body is the source of truth; this migration file is just a ledger.
