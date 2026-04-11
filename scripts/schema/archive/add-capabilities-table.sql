-- =============================================================================
-- Bank Capabilities Migration
-- =============================================================================
-- Tracks sponsor/base bank infrastructure capabilities.
-- Run in the Supabase SQL Editor after schema.sql has been applied.
-- =============================================================================

-- Bank capabilities table: tracks sponsor/base bank infrastructure capabilities
CREATE TABLE IF NOT EXISTS bank_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number INTEGER NOT NULL REFERENCES institutions(cert_number),

  -- Federal Reserve access
  fed_master_account BOOLEAN,        -- Has direct Fed master account
  fedwire_participant BOOLEAN,       -- Direct Fedwire participant

  -- Payment network memberships
  nacha_odfi BOOLEAN,               -- Originating Depository Financial Institution (ACH originator)
  nacha_rdfi BOOLEAN,               -- Receiving DFI
  swift_member BOOLEAN,             -- SWIFT member (international wires)

  -- Card network capabilities
  visa_principal BOOLEAN,           -- Visa principal member (can issue Visa)
  mastercard_principal BOOLEAN,     -- MC principal member (can issue MC)
  amex_issuer BOOLEAN,              -- Amex issuing capability

  -- Card product types
  issues_credit_cards BOOLEAN,
  issues_debit_cards BOOLEAN,
  issues_prepaid BOOLEAN,           -- GPR/reloadable prepaid
  issues_commercial_cards BOOLEAN,  -- Corporate/fleet cards

  -- BaaS / sponsor capabilities
  baas_platform BOOLEAN,            -- Offers BaaS / embedded banking
  baas_partners TEXT[],             -- Known fintech partners (array of names)
  card_program_manager TEXT,        -- If using a program manager

  -- Treasury / corporate services
  treasury_management BOOLEAN,
  sweep_accounts BOOLEAN,
  lockbox_services BOOLEAN,

  -- Data quality
  data_source TEXT,                 -- 'fed_list', 'nacha_list', 'web_research', 'manual'
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  notes TEXT,
  source_urls TEXT[],
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(cert_number)
);

CREATE INDEX IF NOT EXISTS idx_capabilities_fed ON bank_capabilities(fed_master_account);
CREATE INDEX IF NOT EXISTS idx_capabilities_visa ON bank_capabilities(visa_principal);
CREATE INDEX IF NOT EXISTS idx_capabilities_baas ON bank_capabilities(baas_platform);
CREATE INDEX IF NOT EXISTS idx_capabilities_cert ON bank_capabilities(cert_number);

-- RLS: public read, service role write
ALTER TABLE bank_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on bank_capabilities"
  ON bank_capabilities FOR SELECT
  USING (true);

CREATE POLICY "Service role write access on bank_capabilities"
  ON bank_capabilities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-update updated_at
DROP TRIGGER IF EXISTS bank_capabilities_updated_at ON bank_capabilities;
CREATE TRIGGER bank_capabilities_updated_at
  BEFORE UPDATE ON bank_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
