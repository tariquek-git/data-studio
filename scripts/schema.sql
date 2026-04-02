-- =============================================================================
-- Brim Data Studio - Supabase Schema Migration
-- =============================================================================
-- Run this file directly in the Supabase SQL Editor to create all tables,
-- indexes, RLS policies, functions, and triggers.
--
-- Sources: FDIC, NCUA, OSFI, RPAA, CIRO, FINTRAC, FinCEN, OCC
-- Purpose: Unified financial institution database for targeting, analysis,
--          and credit card program prospecting.
-- =============================================================================


-- =============================================================================
-- 1. INSTITUTIONS
-- =============================================================================
-- The main table storing all financial institutions from all regulatory sources.
-- Financials are stored in dollars (not thousands) for consistency.

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number INTEGER UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('fdic', 'ncua', 'osfi', 'rpaa', 'ciro', 'fintrac', 'fincen', 'fintech_ca', 'occ')),
  name TEXT NOT NULL,
  legal_name TEXT,
  charter_type TEXT,            -- 'commercial', 'savings', 'savings_association', 'credit_union', 'trust', 'psp', 'other'
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

  -- Key financials (stored in dollars, not thousands)
  total_assets BIGINT,
  total_deposits BIGINT,
  total_loans BIGINT,
  num_branches INTEGER,
  num_employees INTEGER,
  roi DOUBLE PRECISION,         -- Return on equity %
  roa DOUBLE PRECISION,         -- Return on assets %
  equity_capital BIGINT,
  net_income BIGINT,

  -- Credit card specific
  credit_card_loans BIGINT,
  credit_card_charge_offs BIGINT,

  -- Metadata
  data_as_of DATE,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- =============================================================================
-- 2. FINANCIAL HISTORY
-- =============================================================================
-- Quarterly snapshots for trend charts and historical analysis.
-- References institutions by cert_number (not UUID) for easier syncing.

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


-- =============================================================================
-- 3. BRANCHES
-- =============================================================================
-- Physical branch locations for geographic analysis and mapping.

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


-- =============================================================================
-- 4. SYNC JOBS
-- =============================================================================
-- Tracks data sync operations from each regulatory source.

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


-- =============================================================================
-- 5. SAVED SEARCHES
-- =============================================================================
-- User-saved filter configurations for the targeting feature.
-- The filters column stores the full filter state as JSON.

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL,
  result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- =============================================================================
-- INDEXES
-- =============================================================================
-- Comprehensive indexes for search and filter performance.

-- Full text search on institution name, city, holding company
CREATE INDEX IF NOT EXISTS idx_institutions_name_search
  ON institutions USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(holding_company, '')));

-- B-tree indexes for common filter columns
CREATE INDEX IF NOT EXISTS idx_institutions_state ON institutions(state);
CREATE INDEX IF NOT EXISTS idx_institutions_source ON institutions(source);
CREATE INDEX IF NOT EXISTS idx_institutions_charter_type ON institutions(charter_type);
CREATE INDEX IF NOT EXISTS idx_institutions_regulator ON institutions(regulator);
CREATE INDEX IF NOT EXISTS idx_institutions_total_assets ON institutions(total_assets);
CREATE INDEX IF NOT EXISTS idx_institutions_total_deposits ON institutions(total_deposits);
CREATE INDEX IF NOT EXISTS idx_institutions_active ON institutions(active);
CREATE INDEX IF NOT EXISTS idx_institutions_credit_card_loans ON institutions(credit_card_loans);

-- GIN index on raw_data for JSONB queries
CREATE INDEX IF NOT EXISTS idx_institutions_raw_data ON institutions USING gin (raw_data);

-- Composite index for common filter combination: state + asset size
CREATE INDEX IF NOT EXISTS idx_institutions_state_assets ON institutions(state, total_assets);

-- Financial history indexes
CREATE INDEX IF NOT EXISTS idx_financial_history_cert_period ON financial_history(cert_number, period);

-- Branches index
CREATE INDEX IF NOT EXISTS idx_branches_cert_number ON branches(cert_number);


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Public read access on data tables; only service role can write.

-- Institutions
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on institutions"
  ON institutions FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on institutions"
  ON institutions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Financial History
ALTER TABLE financial_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on financial_history"
  ON financial_history FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on financial_history"
  ON financial_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Branches
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on branches"
  ON branches FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on branches"
  ON branches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Sync Jobs
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sync_jobs"
  ON sync_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Saved Searches
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on saved_searches"
  ON saved_searches FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on saved_searches"
  ON saved_searches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Aggregation stats for the dashboard overview
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
-- TRIGGERS
-- =============================================================================

-- Auto-update the updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers first so this script is re-runnable
DROP TRIGGER IF EXISTS institutions_updated_at ON institutions;
CREATE TRIGGER institutions_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS saved_searches_updated_at ON saved_searches;
CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
