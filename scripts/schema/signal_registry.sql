-- ── Signal Registry ──────────────────────────────────────────────────────────
-- SQL mirror of src/lib/signals/registry.ts.
-- The TypeScript file is the source of truth; this table is seeded from it
-- so that compute_brim_score() can join against signal metadata in SQL.
--
-- Apply via: mcp__supabase__apply_migration or psql.
-- Rerun is safe — uses CREATE TABLE IF NOT EXISTS + upsert seeds.

CREATE TABLE IF NOT EXISTS signal_registry (
  fact_type       TEXT PRIMARY KEY,
  category        TEXT NOT NULL CHECK (category IN ('program_fit', 'timing', 'growth', 'risk', 'peer')),
  display_name    TEXT NOT NULL,
  description     TEXT NOT NULL,
  unit            TEXT,
  weight          INTEGER NOT NULL,
  freshness_days  INTEGER NOT NULL CHECK (freshness_days > 0),
  how_collected   TEXT NOT NULL,
  disqualifier    BOOLEAN NOT NULL DEFAULT FALSE,
  version         TEXT NOT NULL CHECK (version IN ('v1', 'v2')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_registry_version ON signal_registry (version);
CREATE INDEX IF NOT EXISTS idx_signal_registry_category ON signal_registry (category);

-- ── Seeds ────────────────────────────────────────────────────────────────────
-- Keep in sync with src/lib/signals/registry.ts SIGNAL_REGISTRY.

INSERT INTO signal_registry (fact_type, category, display_name, description, unit, weight, freshness_days, how_collected, disqualifier, version) VALUES
  -- A. Program-fit
  ('signal.card_portfolio_size', 'program_fit', 'Card portfolio size',
   'Dollar value of credit card loans on the balance sheet. Larger = more reason to modernize.',
   'usd', 25, 120, 'fdic_call_report', FALSE, 'v1'),
  ('signal.agent_bank_dependency', 'program_fit', 'Agent bank dependency',
   'Institution currently runs its card program through Elan, TCM Bank, FNBO, or a similar agent. Prime migration target.',
   NULL, 30, 365, 'bank_capabilities_derived', FALSE, 'v1'),
  ('signal.core_processor_fit', 'program_fit', 'Core processor fit',
   'Brim integration compatibility with the institution''s core processor (Jack Henry, Fiserv, FIS, Symitar, etc.).',
   NULL, 15, 365, 'bank_capabilities_derived', FALSE, 'v1'),
  ('signal.card_network_membership', 'program_fit', 'Card network membership',
   'Visa or Mastercard principal member status — signals existing card network relationships.',
   NULL, 5, 365, 'bank_capabilities_derived', FALSE, 'v1'),
  ('signal.asset_band_fit', 'program_fit', 'Asset band fit',
   'Total assets fall within Brim''s ICP sweet spot ($1–10B). Full weight at the center of the band, linear falloff outside.',
   'usd', 10, 120, 'financial_history_delta', FALSE, 'v1'),

  -- B. Timing
  ('signal.post_merger_window', 'timing', 'Post-merger window',
   'Completed M&A event within the last 24 months — vendor decisions are typically re-opened after integration.',
   NULL, 20, 730, 'charter_events', FALSE, 'v1'),
  ('signal.core_conversion', 'timing', 'Core conversion',
   'Core processor changed year-over-year — adjacent vendor decisions (cards, payments) often follow.',
   NULL, 15, 540, 'financial_history_delta', FALSE, 'v1'),
  ('signal.exec_transition', 'timing', 'Executive transition',
   'New CFO, COO, or CEO within the last 12 months (SEC 8-K Item 5.02). New executives drive strategic refreshes.',
   NULL, 15, 365, 'sec_edgar_8k', FALSE, 'v1'),
  ('signal.rfp_active', 'timing', 'Active RFP',
   'Public procurement notice for a card vendor, processor, or adjacent service.',
   NULL, 20, 180, 'manual_curation', FALSE, 'v2'),
  ('signal.card_program_decline', 'timing', 'Card program decline',
   'Year-over-year drop in credit card loans of 10% or more — signals an underperforming program.',
   'percent', 10, 180, 'financial_history_delta', FALSE, 'v1'),

  -- C. Growth (v2)
  ('signal.deposit_growth_yoy', 'growth', 'Deposit growth YoY',
   'Deposit growth above peer median — signals an ambitious institution investing in new capabilities.',
   'percent', 10, 180, 'financial_history_delta', FALSE, 'v2'),
  ('signal.digital_banking_maturity', 'growth', 'Digital banking maturity',
   'Mobile app presence, online account opening, digital-first posture.',
   NULL, 5, 365, 'manual_curation', FALSE, 'v2'),
  ('signal.fintech_partnership', 'growth', 'Fintech partnership',
   'Named fintech partner — BaaS sponsor bank, embedded finance, or program manager relationship.',
   NULL, 10, 365, 'entity_relationships', FALSE, 'v2'),

  -- D. Risk / disqualifier
  ('signal.enforcement_action', 'risk', 'Enforcement action',
   'Active OCC, FDIC, or NCUA enforcement action. Not an automatic disqualifier but raises procurement friction.',
   NULL, -20, 730, 'occ_enforcement', FALSE, 'v1'),
  ('signal.regulatory_capital_stress', 'risk', 'Regulatory capital stress',
   'Tier 1 capital ratio below the well-capitalized threshold. Institutions in stress defer discretionary spend.',
   'percent', -15, 120, 'fdic_call_report', FALSE, 'v1'),
  ('signal.captive_card_arm', 'risk', 'Captive card arm',
   'Holding company already operates a captive card program (e.g., Capital One, Discover). Hard exclude.',
   NULL, 0, 3650, 'manual_curation', TRUE, 'v1'),
  ('signal.acquisition_target', 'risk', 'Acquisition target',
   'Announced as the acquiree in a pending M&A deal. Vendor decisions frozen until close.',
   NULL, 0, 540, 'charter_events', TRUE, 'v1'),
  ('signal.existing_brim_customer', 'risk', 'Existing Brim customer',
   'Already signed with Brim. Hard exclude from prospecting.',
   NULL, 0, 3650, 'manual_curation', TRUE, 'v1'),

  -- E. Peer / relationship (v2)
  ('signal.peer_migrated', 'peer', 'Peer migrated',
   'A comparable institution (similar size, geography, charter) modernized its card program recently.',
   NULL, 10, 540, 'manual_curation', FALSE, 'v2'),
  ('signal.holding_co_sibling_is_customer', 'peer', 'Sibling is Brim customer',
   'A sibling under the same holding company is already a Brim customer. Warm intro path.',
   NULL, 15, 3650, 'entity_relationships', FALSE, 'v2')
ON CONFLICT (fact_type) DO UPDATE SET
  category       = EXCLUDED.category,
  display_name   = EXCLUDED.display_name,
  description    = EXCLUDED.description,
  unit           = EXCLUDED.unit,
  weight         = EXCLUDED.weight,
  freshness_days = EXCLUDED.freshness_days,
  how_collected  = EXCLUDED.how_collected,
  disqualifier   = EXCLUDED.disqualifier,
  version        = EXCLUDED.version,
  updated_at     = now();
