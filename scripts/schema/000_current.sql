-- =============================================================================
-- Data Studio — Consolidated Schema (single source of truth)
-- =============================================================================
-- This file is the idempotent end-state schema for the Supabase project. It
-- replaces the fragment files previously scattered across scripts/*.sql. Those
-- fragments are preserved under scripts/schema/archive/ for historical context
-- only; do not apply them directly.
--
-- Safe to re-run. Every CREATE/ALTER/POLICY/TRIGGER uses IF NOT EXISTS or
-- DROP-then-CREATE so partial applies converge to the same end state.
--
-- Layer structure:
--   1. Shared extensions and helpers
--   2. Legacy institution-of-record layer (institutions, financial_history,
--      branches, sync_jobs, saved_searches, bank_capabilities, ai_summaries,
--      failure_events, data_sources)
--   3. Entity warehouse (registry_entities, ecosystem_entities, entity_*,
--      charter_events, financial_history_quarterly, branch_history_annual,
--      macro_series)
--   4. Data-confidence and BD-exclusion columns on the warehouse
--
-- STATE.md → Phase 1 Step 1 consolidation. See STATE.md for the convergence
-- strategy (everything is moving onto entity_warehouse; institutions is being
-- deprecated in place).
-- =============================================================================


-- =============================================================================
-- 0. SHARED
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. INSTITUTIONS (legacy system of record — deprecated in place)
-- =============================================================================
-- Canonical current-state table for regulated FIs. Financials stored in dollars
-- (not thousands). cert_number is the unique key; Canadian CUs use 900001+.

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number INTEGER UNIQUE NOT NULL,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  charter_type TEXT,
  active BOOLEAN DEFAULT true,
  city TEXT,
  state TEXT,
  zip TEXT,
  county TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  website TEXT,
  established_date TEXT,
  regulator TEXT,
  holding_company TEXT,
  holding_company_id TEXT,
  total_assets BIGINT,
  total_deposits BIGINT,
  total_loans BIGINT,
  num_branches INTEGER,
  num_employees INTEGER,
  roi DOUBLE PRECISION,
  roa DOUBLE PRECISION,
  equity_capital BIGINT,
  net_income BIGINT,
  credit_card_loans BIGINT,
  credit_card_charge_offs BIGINT,
  data_as_of DATE,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Source CHECK constraint — 16 sources as of prod state 2026-04-11.
-- Includes 7 Canadian provincial CU regulators added by sync-canadian-credit-unions.mjs.
-- DO NOT reduce this list: removing sources would break existing rows.
ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_source_check;
ALTER TABLE institutions
  ADD CONSTRAINT institutions_source_check
  CHECK (source IN (
    'fdic', 'ncua', 'osfi', 'rpaa', 'ciro',
    'fintrac', 'fincen', 'fintech_ca',
    'bcfsa', 'fsra', 'cudgc', 'dgcm',
    'cudgc_sk', 'nbcudic', 'nscudic', 'ccua'
  ));

CREATE INDEX IF NOT EXISTS idx_institutions_name_search
  ON institutions USING gin (to_tsvector('english',
    coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(holding_company, '')));
CREATE INDEX IF NOT EXISTS idx_institutions_state ON institutions(state);
CREATE INDEX IF NOT EXISTS idx_institutions_source ON institutions(source);
CREATE INDEX IF NOT EXISTS idx_institutions_charter_type ON institutions(charter_type);
CREATE INDEX IF NOT EXISTS idx_institutions_regulator ON institutions(regulator);
CREATE INDEX IF NOT EXISTS idx_institutions_total_assets ON institutions(total_assets);
CREATE INDEX IF NOT EXISTS idx_institutions_total_deposits ON institutions(total_deposits);
CREATE INDEX IF NOT EXISTS idx_institutions_active ON institutions(active);
CREATE INDEX IF NOT EXISTS idx_institutions_credit_card_loans ON institutions(credit_card_loans);
CREATE INDEX IF NOT EXISTS idx_institutions_raw_data ON institutions USING gin (raw_data);
CREATE INDEX IF NOT EXISTS idx_institutions_state_assets ON institutions(state, total_assets);

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on institutions" ON institutions;
CREATE POLICY "Public read access on institutions"
  ON institutions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on institutions" ON institutions;
CREATE POLICY "Service role write access on institutions"
  ON institutions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS institutions_updated_at ON institutions;
CREATE TRIGGER institutions_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 2. FINANCIAL HISTORY (quarterly, legacy layer keyed by cert_number)
-- =============================================================================

CREATE TABLE IF NOT EXISTS financial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number INTEGER NOT NULL REFERENCES institutions(cert_number),
  period DATE NOT NULL,
  total_assets BIGINT,
  total_deposits BIGINT,
  total_loans BIGINT,
  net_income BIGINT,
  equity_capital BIGINT,
  roa DOUBLE PRECISION,
  roi DOUBLE PRECISION,
  credit_card_loans BIGINT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cert_number, period)
);

CREATE INDEX IF NOT EXISTS idx_financial_history_cert_period
  ON financial_history(cert_number, period);

ALTER TABLE financial_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on financial_history" ON financial_history;
CREATE POLICY "Public read access on financial_history"
  ON financial_history FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on financial_history" ON financial_history;
CREATE POLICY "Service role write access on financial_history"
  ON financial_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- =============================================================================
-- 3. BRANCHES
-- =============================================================================

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number INTEGER NOT NULL REFERENCES institutions(cert_number),
  branch_name TEXT,
  branch_number TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  county TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  established_date TEXT,
  acquired_date TEXT,
  main_office BOOLEAN DEFAULT false,
  total_deposits BIGINT,
  data_as_of DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cert_number, branch_number)
);

CREATE INDEX IF NOT EXISTS idx_branches_cert_number ON branches(cert_number);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on branches" ON branches;
CREATE POLICY "Public read access on branches"
  ON branches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on branches" ON branches;
CREATE POLICY "Service role write access on branches"
  ON branches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- =============================================================================
-- 4. SYNC JOBS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  records_processed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on sync_jobs" ON sync_jobs;
CREATE POLICY "Service role full access on sync_jobs"
  ON sync_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- =============================================================================
-- 5. SAVED SEARCHES
-- =============================================================================

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL,
  result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on saved_searches" ON saved_searches;
CREATE POLICY "Public read access on saved_searches"
  ON saved_searches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on saved_searches" ON saved_searches;
CREATE POLICY "Service role write access on saved_searches"
  ON saved_searches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS saved_searches_updated_at ON saved_searches;
CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 6. BANK CAPABILITIES (sponsor bank infrastructure + Brim BD lens)
-- =============================================================================
-- Base columns come from add-capabilities-table.sql. Brim lens columns are
-- added as ALTER TABLE ADD COLUMN IF NOT EXISTS to match the schema that
-- agent_brim_*.py scripts expect. This keeps the end-state schema honest about
-- what the live database actually looks like.

CREATE TABLE IF NOT EXISTS bank_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number INTEGER NOT NULL REFERENCES institutions(cert_number),

  -- Federal Reserve access
  fed_master_account BOOLEAN,
  fedwire_participant BOOLEAN,

  -- Payment network memberships
  nacha_odfi BOOLEAN,
  nacha_rdfi BOOLEAN,
  swift_member BOOLEAN,

  -- Card networks
  visa_principal BOOLEAN,
  mastercard_principal BOOLEAN,
  amex_issuer BOOLEAN,

  -- Card product types
  issues_credit_cards BOOLEAN,
  issues_debit_cards BOOLEAN,
  issues_prepaid BOOLEAN,
  issues_commercial_cards BOOLEAN,

  -- BaaS / sponsor
  baas_platform BOOLEAN,
  baas_partners TEXT[],
  card_program_manager TEXT,

  -- Treasury / corporate
  treasury_management BOOLEAN,
  sweep_accounts BOOLEAN,
  lockbox_services BOOLEAN,

  -- Data quality
  data_source TEXT,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  notes TEXT,
  source_urls TEXT[],
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(cert_number)
);

-- Brim BD lens columns (added at runtime by agent_brim_*.py; made explicit here).
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS brim_score INTEGER;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS brim_tier TEXT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS brim_score_factors JSONB;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS core_processor TEXT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS agent_bank_program TEXT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS card_portfolio_size BIGINT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS core_processor_confidence TEXT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS credit_card_issuer_processor TEXT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS debit_network TEXT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS opportunity_signals JSONB;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS opportunity_score INTEGER;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS opportunity_type TEXT;
ALTER TABLE bank_capabilities ADD COLUMN IF NOT EXISTS opportunity_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_capabilities_fed ON bank_capabilities(fed_master_account);
CREATE INDEX IF NOT EXISTS idx_capabilities_visa ON bank_capabilities(visa_principal);
CREATE INDEX IF NOT EXISTS idx_capabilities_baas ON bank_capabilities(baas_platform);
CREATE INDEX IF NOT EXISTS idx_capabilities_cert ON bank_capabilities(cert_number);
CREATE INDEX IF NOT EXISTS idx_capabilities_brim_tier ON bank_capabilities(brim_tier);
CREATE INDEX IF NOT EXISTS idx_capabilities_brim_score ON bank_capabilities(brim_score);
CREATE INDEX IF NOT EXISTS idx_capabilities_core_processor ON bank_capabilities(core_processor);
CREATE INDEX IF NOT EXISTS idx_capabilities_agent_bank_program ON bank_capabilities(agent_bank_program);

ALTER TABLE bank_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on bank_capabilities" ON bank_capabilities;
CREATE POLICY "Public read access on bank_capabilities"
  ON bank_capabilities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on bank_capabilities" ON bank_capabilities;
CREATE POLICY "Service role write access on bank_capabilities"
  ON bank_capabilities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS bank_capabilities_updated_at ON bank_capabilities;
CREATE TRIGGER bank_capabilities_updated_at
  BEFORE UPDATE ON bank_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 7. AI SUMMARIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_summaries (
  cert_number INTEGER PRIMARY KEY,
  summary TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  model TEXT DEFAULT 'claude-haiku-4-5-20251001',
  source TEXT DEFAULT 'api'
);

CREATE INDEX IF NOT EXISTS ai_summaries_generated_at_idx ON ai_summaries(generated_at);


-- =============================================================================
-- 8. FAILURE EVENTS
-- =============================================================================
-- Independent of institutions because most failed banks are no longer in the
-- current registry. Keyed only by cert_number + fail_date.

CREATE TABLE IF NOT EXISTS failure_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL DEFAULT 'fdic_failures',
  cert_number BIGINT NOT NULL,
  entity_table TEXT NULL,
  entity_id UUID NULL,
  institution_name TEXT NOT NULL,
  city TEXT NULL,
  state TEXT NULL,
  fail_date DATE NOT NULL,
  resolution_type TEXT NULL,
  insurance_fund TEXT NULL,
  estimated_loss NUMERIC NULL,
  charter_class TEXT NULL,
  source_kind TEXT NOT NULL DEFAULT 'official',
  source_url TEXT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_failure_events_unique_record
  ON failure_events(source_key, cert_number, fail_date, resolution_type);
CREATE INDEX IF NOT EXISTS idx_failure_events_fail_date ON failure_events(fail_date DESC);
CREATE INDEX IF NOT EXISTS idx_failure_events_cert ON failure_events(cert_number);
CREATE INDEX IF NOT EXISTS idx_failure_events_entity ON failure_events(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_failure_events_raw_data ON failure_events USING gin (raw_data);

ALTER TABLE failure_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on failure_events" ON failure_events;
CREATE POLICY "Public read access on failure_events"
  ON failure_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on failure_events" ON failure_events;
CREATE POLICY "Service role write access on failure_events"
  ON failure_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS failure_events_updated_at ON failure_events;
CREATE TRIGGER failure_events_updated_at
  BEFORE UPDATE ON failure_events
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- =============================================================================
-- 9. DATA SOURCES (registry for the source catalog UI)
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  regulator_url TEXT,
  data_url TEXT,
  institution_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  data_as_of DATE,
  update_frequency TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed rows live in add-data-sources-table.sql (preserved in archive/) and the
-- data_sources registry migration script. This consolidated file does not
-- re-seed; run scripts/run-migration-data-sources.mjs for that.


-- =============================================================================
-- 10. ENTITY WAREHOUSE (polymorphic — target of convergence)
-- =============================================================================
-- registry_entities, ecosystem_entities, entity_external_ids, entity_tags,
-- entity_facts, entity_relationships, charter_events, financial_history_quarterly,
-- branch_history_annual, macro_series.
-- Everything below is pulled from add-entity-foundation.sql unchanged, plus the
-- data_confidence and bd_exclusion columns added in the STATE.md Phase 1 tasks.

-- 10.1 REGISTRY ENTITIES ------------------------------------------------------

CREATE TABLE IF NOT EXISTS registry_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  entity_subtype TEXT,
  active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  country TEXT NOT NULL DEFAULT 'US',
  city TEXT,
  state TEXT,
  website TEXT,
  regulator TEXT,
  registration_number TEXT,
  description TEXT,
  raw_data JSONB,
  data_as_of DATE,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Data confidence system (STATE.md → Chief Data Officer bridge).
-- Backfill policy: fdic/ncua API ingest = high(90); osfi/bcfsa w/ financials =
-- medium(70); registry-only = unverified(10). See STATE.md rule set.
ALTER TABLE registry_entities
  ADD COLUMN IF NOT EXISTS data_confidence TEXT
    CHECK (data_confidence IS NULL OR data_confidence IN ('high', 'medium', 'low', 'unverified'));
ALTER TABLE registry_entities
  ADD COLUMN IF NOT EXISTS data_confidence_score INTEGER
    CHECK (data_confidence_score IS NULL OR (data_confidence_score BETWEEN 0 AND 100));
ALTER TABLE registry_entities
  ADD COLUMN IF NOT EXISTS data_provenance JSONB;

-- Validate data_provenance structure against the application contract.
-- Each source entry must be an object with source_key, source_url, fetched_at,
-- and confidence (0-100). The top-level object must also include
-- last_verified_at. Application code still performs richer runtime validation.
CREATE OR REPLACE FUNCTION validate_data_provenance(prov JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF prov IS NULL THEN RETURN TRUE; END IF;
  IF jsonb_typeof(prov) != 'object' THEN RETURN FALSE; END IF;
  IF prov->>'sources' IS NULL THEN RETURN FALSE; END IF;
  IF jsonb_typeof(prov->'sources') != 'array' THEN RETURN FALSE; END IF;
  IF jsonb_typeof(prov->'last_verified_at') != 'string' OR btrim(prov->>'last_verified_at') = '' THEN RETURN FALSE; END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(prov->'sources') AS src
    WHERE jsonb_typeof(src) != 'object'
      OR jsonb_typeof(src->'source_key') != 'string'
      OR btrim(src->>'source_key') = ''
      OR jsonb_typeof(src->'source_url') != 'string'
      OR btrim(src->>'source_url') = ''
      OR jsonb_typeof(src->'fetched_at') != 'string'
      OR btrim(src->>'fetched_at') = ''
      OR jsonb_typeof(src->'confidence') != 'number'
      OR (src->>'confidence')::numeric < 0
      OR (src->>'confidence')::numeric > 100
  ) THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$;

ALTER TABLE registry_entities DROP CONSTRAINT IF EXISTS chk_registry_data_provenance;
ALTER TABLE registry_entities ADD CONSTRAINT chk_registry_data_provenance
  CHECK (validate_data_provenance(data_provenance));
ALTER TABLE registry_entities
  ADD COLUMN IF NOT EXISTS verified_by TEXT;

-- Brim BD exclusion rule — encoded in data, not prose. See STATE.md rule list
-- for the seeded set (Manulife, Affinity CU, Laurentian Bank, CWB,
-- Zolve/Continental, Air France KLM, PayFacto). Seeding happens in the
-- Phase 1 script, not this schema file.
ALTER TABLE registry_entities
  ADD COLUMN IF NOT EXISTS bd_exclusion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_registry_entities_source_key ON registry_entities(source_key);
CREATE INDEX IF NOT EXISTS idx_registry_entities_country ON registry_entities(country);
CREATE INDEX IF NOT EXISTS idx_registry_entities_entity_subtype ON registry_entities(entity_subtype);
CREATE INDEX IF NOT EXISTS idx_registry_entities_status ON registry_entities(status);
CREATE INDEX IF NOT EXISTS idx_registry_entities_active ON registry_entities(active);
CREATE INDEX IF NOT EXISTS idx_registry_entities_regulator ON registry_entities(regulator);
CREATE INDEX IF NOT EXISTS idx_registry_entities_registration_number ON registry_entities(registration_number);
CREATE INDEX IF NOT EXISTS idx_registry_entities_raw_data ON registry_entities USING gin (raw_data);
CREATE INDEX IF NOT EXISTS idx_registry_entities_data_confidence ON registry_entities(data_confidence);
CREATE INDEX IF NOT EXISTS idx_registry_entities_bd_exclusion ON registry_entities(bd_exclusion_reason)
  WHERE bd_exclusion_reason IS NOT NULL;

ALTER TABLE registry_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on registry_entities" ON registry_entities;
CREATE POLICY "Public read access on registry_entities"
  ON registry_entities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on registry_entities" ON registry_entities;
CREATE POLICY "Service role write access on registry_entities"
  ON registry_entities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS registry_entities_updated_at ON registry_entities;
CREATE TRIGGER registry_entities_updated_at
  BEFORE UPDATE ON registry_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.2 ECOSYSTEM ENTITIES -----------------------------------------------------

CREATE TABLE IF NOT EXISTS ecosystem_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT,
  source_authority TEXT DEFAULT 'Curated Research',
  name TEXT NOT NULL,
  legal_name TEXT,
  entity_type TEXT NOT NULL,
  business_model TEXT,
  active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  country TEXT NOT NULL DEFAULT 'NA',
  city TEXT,
  state TEXT,
  website TEXT,
  description TEXT,
  parent_name TEXT,
  confidence_score DOUBLE PRECISION,
  raw_data JSONB,
  data_as_of DATE,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_source_key ON ecosystem_entities(source_key);
CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_source_authority ON ecosystem_entities(source_authority);
CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_entity_type ON ecosystem_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_business_model ON ecosystem_entities(business_model);
CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_country ON ecosystem_entities(country);
CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_status ON ecosystem_entities(status);
CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_active ON ecosystem_entities(active);
CREATE INDEX IF NOT EXISTS idx_ecosystem_entities_raw_data ON ecosystem_entities USING gin (raw_data);

ALTER TABLE ecosystem_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on ecosystem_entities" ON ecosystem_entities;
CREATE POLICY "Public read access on ecosystem_entities"
  ON ecosystem_entities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on ecosystem_entities" ON ecosystem_entities;
CREATE POLICY "Service role write access on ecosystem_entities"
  ON ecosystem_entities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS ecosystem_entities_updated_at ON ecosystem_entities;
CREATE TRIGGER ecosystem_entities_updated_at
  BEFORE UPDATE ON ecosystem_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.3 ENTITY EXTERNAL IDS ----------------------------------------------------

CREATE TABLE IF NOT EXISTS entity_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL CHECK (entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  entity_id UUID NOT NULL,
  id_type TEXT NOT NULL,
  id_value TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_table, entity_id, id_type, id_value)
);

CREATE INDEX IF NOT EXISTS idx_entity_external_ids_entity ON entity_external_ids(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_external_ids_type ON entity_external_ids(id_type);
CREATE INDEX IF NOT EXISTS idx_entity_external_ids_value ON entity_external_ids(id_value);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_external_ids_primary
  ON entity_external_ids(entity_table, entity_id) WHERE is_primary;

ALTER TABLE entity_external_ids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on entity_external_ids" ON entity_external_ids;
CREATE POLICY "Public read access on entity_external_ids"
  ON entity_external_ids FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on entity_external_ids" ON entity_external_ids;
CREATE POLICY "Service role write access on entity_external_ids"
  ON entity_external_ids FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS entity_external_ids_updated_at ON entity_external_ids;
CREATE TRIGGER entity_external_ids_updated_at
  BEFORE UPDATE ON entity_external_ids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.4 ENTITY TAGS ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entity_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL CHECK (entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  entity_id UUID NOT NULL,
  tag_key TEXT NOT NULL,
  tag_value TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'curated' CHECK (source_kind IN ('official', 'company', 'curated')),
  source_url TEXT,
  confidence_score DOUBLE PRECISION,
  effective_start DATE,
  effective_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_tags_key_value ON entity_tags(tag_key, tag_value);
CREATE INDEX IF NOT EXISTS idx_entity_tags_source_kind ON entity_tags(source_kind);

ALTER TABLE entity_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on entity_tags" ON entity_tags;
CREATE POLICY "Public read access on entity_tags"
  ON entity_tags FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on entity_tags" ON entity_tags;
CREATE POLICY "Service role write access on entity_tags"
  ON entity_tags FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE entity_tags ADD COLUMN IF NOT EXISTS sync_job_id UUID REFERENCES sync_jobs(id);

DROP TRIGGER IF EXISTS entity_tags_updated_at ON entity_tags;
CREATE TRIGGER entity_tags_updated_at
  BEFORE UPDATE ON entity_tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.5 ENTITY FACTS -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS entity_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL CHECK (entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  entity_id UUID NOT NULL,
  fact_type TEXT,
  fact_key TEXT,
  fact_value_text TEXT,
  fact_value_number DOUBLE PRECISION,
  fact_value_json JSONB,
  fact_unit TEXT,
  source_kind TEXT NOT NULL DEFAULT 'curated' CHECK (source_kind IN ('official', 'company', 'curated')),
  source_url TEXT,
  observed_at TIMESTAMPTZ,
  confidence_score DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_facts_entity ON entity_facts(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_facts_fact_key ON entity_facts(fact_key);
CREATE INDEX IF NOT EXISTS idx_entity_facts_observed_at ON entity_facts(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_facts_source_kind ON entity_facts(source_kind);
CREATE INDEX IF NOT EXISTS idx_entity_facts_json ON entity_facts USING gin (fact_value_json);

ALTER TABLE entity_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on entity_facts" ON entity_facts;
CREATE POLICY "Public read access on entity_facts"
  ON entity_facts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on entity_facts" ON entity_facts;
CREATE POLICY "Service role write access on entity_facts"
  ON entity_facts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Lineage: link each fact to the sync job that produced it
ALTER TABLE entity_facts ADD COLUMN IF NOT EXISTS sync_job_id UUID REFERENCES sync_jobs(id);
CREATE INDEX IF NOT EXISTS idx_entity_facts_sync_job ON entity_facts(sync_job_id) WHERE sync_job_id IS NOT NULL;

DROP TRIGGER IF EXISTS entity_facts_updated_at ON entity_facts;
CREATE TRIGGER entity_facts_updated_at
  BEFORE UPDATE ON entity_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.6 ENTITY RELATIONSHIPS ---------------------------------------------------

CREATE TABLE IF NOT EXISTS entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_table TEXT NOT NULL CHECK (from_entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  from_entity_id UUID NOT NULL,
  to_entity_table TEXT NOT NULL CHECK (to_entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  to_entity_id UUID NOT NULL,
  relationship_type TEXT NOT NULL,
  relationship_label TEXT,
  active BOOLEAN DEFAULT true,
  effective_start DATE,
  effective_end DATE,
  source_kind TEXT DEFAULT 'curated' CHECK (source_kind IN ('official', 'company', 'curated')),
  source_url TEXT,
  confidence_score DOUBLE PRECISION,
  notes TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_from_entity ON entity_relationships(from_entity_table, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_to_entity ON entity_relationships(to_entity_table, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_relationship_type ON entity_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_active ON entity_relationships(active);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_effective_start ON entity_relationships(effective_start);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_raw_data ON entity_relationships USING gin (raw_data);

ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on entity_relationships" ON entity_relationships;
CREATE POLICY "Public read access on entity_relationships"
  ON entity_relationships FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on entity_relationships" ON entity_relationships;
CREATE POLICY "Service role write access on entity_relationships"
  ON entity_relationships FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE entity_relationships ADD COLUMN IF NOT EXISTS sync_job_id UUID REFERENCES sync_jobs(id);

DROP TRIGGER IF EXISTS entity_relationships_updated_at ON entity_relationships;
CREATE TRIGGER entity_relationships_updated_at
  BEFORE UPDATE ON entity_relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.7 CHARTER EVENTS ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS charter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL CHECK (entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_subtype TEXT,
  event_date DATE NOT NULL,
  effective_date DATE,
  status TEXT,
  details TEXT,
  source_kind TEXT NOT NULL DEFAULT 'curated' CHECK (source_kind IN ('official', 'company', 'curated')),
  source_url TEXT,
  confidence_score DOUBLE PRECISION,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charter_events_entity ON charter_events(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_charter_events_event_type ON charter_events(event_type);
CREATE INDEX IF NOT EXISTS idx_charter_events_event_date ON charter_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_charter_events_source_kind ON charter_events(source_kind);
CREATE INDEX IF NOT EXISTS idx_charter_events_raw_data ON charter_events USING gin (raw_data);

ALTER TABLE charter_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on charter_events" ON charter_events;
CREATE POLICY "Public read access on charter_events"
  ON charter_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on charter_events" ON charter_events;
CREATE POLICY "Service role write access on charter_events"
  ON charter_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS charter_events_updated_at ON charter_events;
CREATE TRIGGER charter_events_updated_at
  BEFORE UPDATE ON charter_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.8 FINANCIAL HISTORY QUARTERLY (warehouse layer) --------------------------

CREATE TABLE IF NOT EXISTS financial_history_quarterly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL CHECK (entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  entity_id UUID NOT NULL,
  period DATE NOT NULL,
  total_assets BIGINT,
  total_deposits BIGINT,
  total_loans BIGINT,
  net_income BIGINT,
  equity_capital BIGINT,
  roa DOUBLE PRECISION,
  roi DOUBLE PRECISION,
  credit_card_loans BIGINT,
  source_kind TEXT DEFAULT 'official' CHECK (source_kind IN ('official', 'company', 'curated')),
  source_url TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_table, entity_id, period)
);

CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_entity_period
  ON financial_history_quarterly(entity_table, entity_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_period
  ON financial_history_quarterly(period DESC);
CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_source_kind
  ON financial_history_quarterly(source_kind);
CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_raw_data
  ON financial_history_quarterly USING gin (raw_data);

ALTER TABLE financial_history_quarterly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on financial_history_quarterly" ON financial_history_quarterly;
CREATE POLICY "Public read access on financial_history_quarterly"
  ON financial_history_quarterly FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on financial_history_quarterly" ON financial_history_quarterly;
CREATE POLICY "Service role write access on financial_history_quarterly"
  ON financial_history_quarterly FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS financial_history_quarterly_updated_at ON financial_history_quarterly;
CREATE TRIGGER financial_history_quarterly_updated_at
  BEFORE UPDATE ON financial_history_quarterly
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.9 BRANCH HISTORY ANNUAL --------------------------------------------------

CREATE TABLE IF NOT EXISTS branch_history_annual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL CHECK (entity_table IN ('institutions', 'registry_entities', 'ecosystem_entities')),
  entity_id UUID NOT NULL,
  reporting_year INTEGER NOT NULL,
  period DATE NOT NULL,
  branch_count INTEGER,
  main_office_count INTEGER,
  total_branch_deposits BIGINT,
  source_kind TEXT DEFAULT 'official' CHECK (source_kind IN ('official', 'company', 'curated')),
  source_url TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_table, entity_id, reporting_year)
);

CREATE INDEX IF NOT EXISTS idx_branch_history_annual_entity_year
  ON branch_history_annual(entity_table, entity_id, reporting_year DESC);
CREATE INDEX IF NOT EXISTS idx_branch_history_annual_period
  ON branch_history_annual(period DESC);
CREATE INDEX IF NOT EXISTS idx_branch_history_annual_source_kind
  ON branch_history_annual(source_kind);
CREATE INDEX IF NOT EXISTS idx_branch_history_annual_raw_data
  ON branch_history_annual USING gin (raw_data);

ALTER TABLE branch_history_annual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on branch_history_annual" ON branch_history_annual;
CREATE POLICY "Public read access on branch_history_annual"
  ON branch_history_annual FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on branch_history_annual" ON branch_history_annual;
CREATE POLICY "Service role write access on branch_history_annual"
  ON branch_history_annual FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS branch_history_annual_updated_at ON branch_history_annual;
CREATE TRIGGER branch_history_annual_updated_at
  BEFORE UPDATE ON branch_history_annual
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10.10 MACRO SERIES ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS macro_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  series_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  frequency TEXT NOT NULL,
  period DATE NOT NULL,
  value DOUBLE PRECISION,
  unit TEXT,
  notes TEXT,
  source_url TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_key, series_key, period)
);

CREATE INDEX IF NOT EXISTS idx_macro_series_source_key ON macro_series(source_key);
CREATE INDEX IF NOT EXISTS idx_macro_series_series_key ON macro_series(series_key);
CREATE INDEX IF NOT EXISTS idx_macro_series_country ON macro_series(country);
CREATE INDEX IF NOT EXISTS idx_macro_series_frequency ON macro_series(frequency);
CREATE INDEX IF NOT EXISTS idx_macro_series_period ON macro_series(period DESC);
CREATE INDEX IF NOT EXISTS idx_macro_series_raw_data ON macro_series USING gin (raw_data);

ALTER TABLE macro_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access on macro_series" ON macro_series;
CREATE POLICY "Public read access on macro_series"
  ON macro_series FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write access on macro_series" ON macro_series;
CREATE POLICY "Service role write access on macro_series"
  ON macro_series FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS macro_series_updated_at ON macro_series;
CREATE TRIGGER macro_series_updated_at
  BEFORE UPDATE ON macro_series
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 11. HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION institution_stats()
RETURNS JSON AS $$
  SELECT json_build_object(
    'total_count', (SELECT COUNT(*) FROM institutions WHERE active = true),
    'total_assets', (SELECT COALESCE(SUM(total_assets), 0) FROM institutions WHERE active = true),
    'avg_assets', (SELECT COALESCE(AVG(total_assets), 0) FROM institutions WHERE active = true),
    'fdic_count', (SELECT COUNT(*) FROM institutions WHERE source = 'fdic' AND active = true),
    'ncua_count', (SELECT COUNT(*) FROM institutions WHERE source = 'ncua' AND active = true),
    'with_credit_cards', (SELECT COUNT(*) FROM institutions WHERE credit_card_loans > 0 AND active = true),
    'states_represented', (SELECT COUNT(DISTINCT state) FROM institutions WHERE active = true)
  );
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- 12. BD EXCLUSION COLUMN ON INSTITUTIONS
-- =============================================================================
-- Mirrors registry_entities.bd_exclusion_reason so the MV can expose it
-- without requiring the full backfill to registry_entities to be complete.

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS bd_exclusion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_institutions_bd_exclusion
  ON institutions (bd_exclusion_reason)
  WHERE bd_exclusion_reason IS NOT NULL;

-- Seed: 7 Brim Rule-7 exclusions (idempotent — only sets if NULL)
UPDATE institutions SET bd_exclusion_reason = 'Existing Brim client — Rule 7'
WHERE name ILIKE '%manulife%' AND bd_exclusion_reason IS NULL;
UPDATE institutions SET bd_exclusion_reason = 'Existing Brim client — Rule 7'
WHERE name ILIKE '%affinity credit union%' AND bd_exclusion_reason IS NULL;
UPDATE institutions SET bd_exclusion_reason = 'Existing Brim client — Rule 7'
WHERE name ILIKE '%laurentian%' AND bd_exclusion_reason IS NULL;
UPDATE institutions SET bd_exclusion_reason = 'Existing Brim client — Rule 7'
WHERE (name ILIKE '%canadian western bank%' OR name ILIKE '% cwb %' OR name = 'CWB')
  AND bd_exclusion_reason IS NULL;
UPDATE institutions SET bd_exclusion_reason = 'Existing Brim client — Rule 7'
WHERE (name ILIKE '%continental bank%' OR name ILIKE '%zolve%')
  AND bd_exclusion_reason IS NULL;
UPDATE institutions SET bd_exclusion_reason = 'Existing Brim client — Rule 7'
WHERE name ILIKE '%air france%' AND bd_exclusion_reason IS NULL;
UPDATE institutions SET bd_exclusion_reason = 'Existing Brim client — Rule 7'
WHERE name ILIKE '%payfacto%' AND bd_exclusion_reason IS NULL;


-- =============================================================================
-- 13. INSTITUTION_SUMMARY_MV (fast read surface for screener / search / profile)
-- =============================================================================
-- Joins institutions + bank_capabilities + latest financial_history_quarterly.
-- Refresh nightly via refresh_institution_summary_mv().
-- Phase 2 API routes will read from this view instead of the raw tables.

DROP MATERIALIZED VIEW IF EXISTS institution_summary_mv;

CREATE MATERIALIZED VIEW institution_summary_mv AS
SELECT
  i.id,
  i.cert_number,
  i.source,
  i.name,
  i.legal_name,
  i.charter_type,
  i.active,
  i.city,
  i.state,
  i.zip,
  i.county,
  i.latitude,
  i.longitude,
  i.website,
  i.established_date,
  i.regulator,
  i.holding_company,
  i.holding_company_id,
  i.total_assets,
  i.total_deposits,
  i.total_loans,
  i.num_branches,
  i.num_employees,
  i.roa,
  i.roi,
  i.equity_capital,
  i.net_income,
  i.credit_card_loans,
  i.bd_exclusion_reason,
  i.data_as_of,
  -- Brim fields from bank_capabilities
  bc.brim_score,
  bc.brim_tier,
  bc.core_processor,
  bc.core_processor_confidence,
  bc.agent_bank_program,
  bc.card_portfolio_size,
  bc.issues_credit_cards,
  bc.issues_debit_cards,
  bc.credit_card_issuer_processor,
  bc.debit_network,
  bc.card_program_manager,
  bc.opportunity_signals,
  bc.opportunity_score,
  bc.opportunity_type,
  bc.opportunity_summary,
  -- Latest quarterly financials
  fhq.period       AS latest_quarter,
  fhq.total_assets AS q_total_assets,
  fhq.roa          AS q_roa,
  fhq.net_income   AS q_net_income,
  -- Full-text search vector
  to_tsvector('english',
    coalesce(i.name, '') || ' ' ||
    coalesce(i.legal_name, '') || ' ' ||
    coalesce(i.city, '') || ' ' ||
    coalesce(i.state, '') || ' ' ||
    coalesce(i.holding_company, '')
  ) AS search_vector,
  i.last_synced_at,
  i.updated_at
FROM institutions i
LEFT JOIN bank_capabilities bc ON bc.cert_number = i.cert_number
LEFT JOIN LATERAL (
  SELECT period, total_assets, roa, net_income
  FROM financial_history_quarterly
  WHERE entity_table = 'institutions' AND entity_id = i.id
  ORDER BY period DESC
  LIMIT 1
) fhq ON true
WHERE i.active = true;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX institution_summary_mv_id     ON institution_summary_mv (id);
-- Screener / filter indexes
CREATE INDEX institution_summary_mv_cert          ON institution_summary_mv (cert_number);
CREATE INDEX institution_summary_mv_source        ON institution_summary_mv (source);
CREATE INDEX institution_summary_mv_state         ON institution_summary_mv (state);
CREATE INDEX institution_summary_mv_charter       ON institution_summary_mv (charter_type);
CREATE INDEX institution_summary_mv_assets        ON institution_summary_mv (total_assets);
CREATE INDEX institution_summary_mv_roa           ON institution_summary_mv (roa);
CREATE INDEX institution_summary_mv_brim          ON institution_summary_mv (brim_score);
CREATE INDEX institution_summary_mv_tier          ON institution_summary_mv (brim_tier);
CREATE INDEX institution_summary_mv_excl          ON institution_summary_mv (bd_exclusion_reason)
  WHERE bd_exclusion_reason IS NOT NULL;
CREATE INDEX institution_summary_mv_search        ON institution_summary_mv USING gin (search_vector);
CREATE INDEX institution_summary_mv_state_assets  ON institution_summary_mv (state, total_assets);
CREATE INDEX institution_summary_mv_source_assets ON institution_summary_mv (source, total_assets);
CREATE INDEX institution_summary_mv_geo           ON institution_summary_mv (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Nightly refresh function (call from pg_cron or a scheduled Supabase function)
CREATE OR REPLACE FUNCTION refresh_institution_summary_mv()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY institution_summary_mv;
$$;


-- =============================================================================
-- 14. PGVECTOR — SEMANTIC SIMILARITY SEARCH
-- =============================================================================
-- Enables cosine-distance nearest-neighbour queries over institution profiles.
-- Embeddings are generated offline by scripts/generate-embeddings.mjs using
-- OpenAI text-embedding-3-small (1536 dimensions) and stored here.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE registry_entities ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS idx_registry_entities_embedding
  ON registry_entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS idx_institutions_embedding
  ON institutions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RPC helper used by the similar-institutions API route.
-- Returns up to match_count institutions nearest to query_embedding,
-- excluding the institution with exclude_id.
CREATE OR REPLACE FUNCTION find_similar_institutions(
  query_embedding vector(1536),
  exclude_id UUID,
  match_count INT DEFAULT 10
) RETURNS TABLE(id UUID, cert_number INT, name TEXT, source TEXT, city TEXT, state TEXT, total_assets BIGINT, similarity FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT i.id, i.cert_number, i.name, i.source, i.city, i.state, i.total_assets,
         1 - (i.embedding <=> query_embedding) AS similarity
  FROM institutions i
  WHERE i.id != exclude_id AND i.embedding IS NOT NULL
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- End of 000_current.sql.
