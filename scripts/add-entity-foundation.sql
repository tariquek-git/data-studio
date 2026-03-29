-- =============================================================================
-- Entity Warehouse Foundation Migration
-- =============================================================================
-- Adds the polymorphic entity warehouse tables used by the entity APIs:
-- registry_entities, ecosystem_entities, entity_external_ids, entity_tags,
-- entity_facts, entity_relationships, charter_events, financial_history_quarterly,
-- branch_history_annual, and macro_series.
--
-- Design goals:
--   - public read access on all warehouse tables
--   - service-role write access only
--   - updated_at triggers for mutable rows
--   - polymorphic entity_table + entity_id references for cross-layer graphs
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. REGISTRY ENTITIES
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_registry_entities_source_key ON registry_entities(source_key);
CREATE INDEX IF NOT EXISTS idx_registry_entities_country ON registry_entities(country);
CREATE INDEX IF NOT EXISTS idx_registry_entities_entity_subtype ON registry_entities(entity_subtype);
CREATE INDEX IF NOT EXISTS idx_registry_entities_status ON registry_entities(status);
CREATE INDEX IF NOT EXISTS idx_registry_entities_active ON registry_entities(active);
CREATE INDEX IF NOT EXISTS idx_registry_entities_regulator ON registry_entities(regulator);
CREATE INDEX IF NOT EXISTS idx_registry_entities_registration_number ON registry_entities(registration_number);
CREATE INDEX IF NOT EXISTS idx_registry_entities_raw_data ON registry_entities USING gin (raw_data);

ALTER TABLE registry_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on registry_entities"
  ON registry_entities FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on registry_entities"
  ON registry_entities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS registry_entities_updated_at ON registry_entities;
CREATE TRIGGER registry_entities_updated_at
  BEFORE UPDATE ON registry_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 2. ECOSYSTEM ENTITIES
-- =============================================================================

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

CREATE POLICY "Public read access on ecosystem_entities"
  ON ecosystem_entities FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on ecosystem_entities"
  ON ecosystem_entities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS ecosystem_entities_updated_at ON ecosystem_entities;
CREATE TRIGGER ecosystem_entities_updated_at
  BEFORE UPDATE ON ecosystem_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 3. ENTITY EXTERNAL IDS
-- =============================================================================

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

ALTER TABLE entity_external_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on entity_external_ids"
  ON entity_external_ids FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on entity_external_ids"
  ON entity_external_ids FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS entity_external_ids_updated_at ON entity_external_ids;
CREATE TRIGGER entity_external_ids_updated_at
  BEFORE UPDATE ON entity_external_ids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 4. ENTITY TAGS
-- =============================================================================

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

CREATE POLICY "Public read access on entity_tags"
  ON entity_tags FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on entity_tags"
  ON entity_tags FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS entity_tags_updated_at ON entity_tags;
CREATE TRIGGER entity_tags_updated_at
  BEFORE UPDATE ON entity_tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 5. ENTITY FACTS
-- =============================================================================

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

CREATE POLICY "Public read access on entity_facts"
  ON entity_facts FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on entity_facts"
  ON entity_facts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS entity_facts_updated_at ON entity_facts;
CREATE TRIGGER entity_facts_updated_at
  BEFORE UPDATE ON entity_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 6. ENTITY RELATIONSHIPS
-- =============================================================================

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

CREATE POLICY "Public read access on entity_relationships"
  ON entity_relationships FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on entity_relationships"
  ON entity_relationships FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS entity_relationships_updated_at ON entity_relationships;
CREATE TRIGGER entity_relationships_updated_at
  BEFORE UPDATE ON entity_relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 7. CHARTER EVENTS
-- =============================================================================

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

CREATE POLICY "Public read access on charter_events"
  ON charter_events FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on charter_events"
  ON charter_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS charter_events_updated_at ON charter_events;
CREATE TRIGGER charter_events_updated_at
  BEFORE UPDATE ON charter_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 8. FINANCIAL HISTORY QUARTERLY
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_entity_period ON financial_history_quarterly(entity_table, entity_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_period ON financial_history_quarterly(period DESC);
CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_source_kind ON financial_history_quarterly(source_kind);
CREATE INDEX IF NOT EXISTS idx_financial_history_quarterly_raw_data ON financial_history_quarterly USING gin (raw_data);

ALTER TABLE financial_history_quarterly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on financial_history_quarterly"
  ON financial_history_quarterly FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on financial_history_quarterly"
  ON financial_history_quarterly FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS financial_history_quarterly_updated_at ON financial_history_quarterly;
CREATE TRIGGER financial_history_quarterly_updated_at
  BEFORE UPDATE ON financial_history_quarterly
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 9. BRANCH HISTORY ANNUAL
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_branch_history_annual_entity_year ON branch_history_annual(entity_table, entity_id, reporting_year DESC);
CREATE INDEX IF NOT EXISTS idx_branch_history_annual_period ON branch_history_annual(period DESC);
CREATE INDEX IF NOT EXISTS idx_branch_history_annual_source_kind ON branch_history_annual(source_kind);
CREATE INDEX IF NOT EXISTS idx_branch_history_annual_raw_data ON branch_history_annual USING gin (raw_data);

ALTER TABLE branch_history_annual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on branch_history_annual"
  ON branch_history_annual FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on branch_history_annual"
  ON branch_history_annual FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS branch_history_annual_updated_at ON branch_history_annual;
CREATE TRIGGER branch_history_annual_updated_at
  BEFORE UPDATE ON branch_history_annual
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 10. MACRO SERIES
-- =============================================================================

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

CREATE POLICY "Public read access on macro_series"
  ON macro_series FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on macro_series"
  ON macro_series FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS macro_series_updated_at ON macro_series;
CREATE TRIGGER macro_series_updated_at
  BEFORE UPDATE ON macro_series
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

