-- 2026-04-17 — fix enforcement signal false positives.
--
-- The OCC + NCUA enforcement collectors wrote BOTH institution-level actions
-- (Cease & Desist orders, Civil Money Penalties against the bank) AND
-- individual-level actions (Section 1829 prohibition notifications against
-- specific former employees) to signal.enforcement_action with the same
-- fact_type. That penalized banks for employee-level actions — 106 of 207
-- total facts were individuals.
--
-- Fix: move individual-level facts to a new fact_type 'regulatory.individual_prohibition'
-- which is not in signal_registry and therefore not weighted by compute_brim_score.
-- Audit trail preserved; scoring no longer misled.
--
-- Code fix in sync-occ-enforcement.mjs + sync-ncua-enforcement.mjs (same commit)
-- prevents recurrence on future runs by filtering individual-target records at
-- collection time.
--
-- Applied via mcp__supabase__apply_migration 2026-04-17.

-- First, expand the fact_type allowlist so sub-namespaces are permitted
-- (regulatory.*, identity.*, source.*, registration.*). Previous constraint
-- only allowed the unqualified strings 'registration', 'regulatory',
-- 'identity', 'source' plus any 'signal.*'.
ALTER TABLE entity_facts
  DROP CONSTRAINT IF EXISTS entity_facts_fact_type_allowlist;

ALTER TABLE entity_facts
  ADD CONSTRAINT entity_facts_fact_type_allowlist CHECK (
    fact_type IS NULL
    OR fact_type LIKE 'signal.%'
    OR fact_type LIKE 'regulatory.%'
    OR fact_type LIKE 'identity.%'
    OR fact_type LIKE 'source.%'
    OR fact_type LIKE 'registration.%'
    OR fact_type IN ('registration', 'regulatory', 'identity', 'source')
  );

-- Move OCC individual-level actions
UPDATE entity_facts
SET fact_type = 'regulatory.individual_prohibition',
    notes = 'Moved 2026-04-17: individual-level OCC action (1829 prohibition / personal removal), not institution enforcement. ' || COALESCE(notes,'')
WHERE fact_type = 'signal.enforcement_action'
  AND fact_value_json->>'inst_or_individual' = 'Individual';

-- Move NCUA individual-relationship actions
UPDATE entity_facts
SET fact_type = 'regulatory.individual_prohibition',
    notes = 'Moved 2026-04-17: individual-level NCUA administrative order against '
      || COALESCE(fact_value_json->>'person_name', '(unknown person)') || ' — '
      || COALESCE(fact_value_json->>'relationship', '(unknown relationship)') || '. '
      || COALESCE(notes,'')
WHERE fact_type = 'signal.enforcement_action'
  AND fact_key LIKE 'ncua_%'
  AND fact_value_json->>'relationship' IN (
    'Former employee', 'Former Employee',
    'Former Institution-Affiliated Party', 'Former Institution-affiliated Party',
    'Supervisory Committee Chairman',
    'Former President and CEO',
    'Former Assistant Chief Executive Officer',
    'Former Office Manager',
    'Former Loan Officer',
    'Former Branch Manager'
  );

-- Expected result after both UPDATEs (seen in verification 2026-04-17):
--   signal.enforcement_action:            55 rows (true institution enforcement)
--   regulatory.individual_prohibition:   152 rows (audit-only, not scored)
