-- Tracks all data sources ingested into the system
CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT UNIQUE NOT NULL,    -- 'fdic', 'ncua', 'osfi', 'rpaa', 'ciro', 'fintrac', 'cmhc', 'boc'
  display_name TEXT NOT NULL,          -- 'FDIC BankFind Suite'
  description TEXT,
  country TEXT NOT NULL DEFAULT 'US',  -- 'US', 'CA'
  regulator_url TEXT,                  -- Link to the regulator
  data_url TEXT,                       -- Link to the specific data
  institution_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  data_as_of DATE,
  update_frequency TEXT,               -- 'quarterly', 'monthly', 'daily', 'realtime'
  status TEXT DEFAULT 'active',        -- 'active', 'pending', 'unavailable'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the known data sources
INSERT INTO data_sources (source_key, display_name, description, country, regulator_url, update_frequency, status, notes) VALUES
('fdic', 'FDIC BankFind Suite', 'All FDIC-insured U.S. commercial banks and savings institutions', 'US', 'https://banks.data.fdic.gov', 'quarterly', 'active', '4,408 active institutions as of Q4 2025'),
('ncua', 'NCUA Call Report Data', 'All federally-insured U.S. credit unions (5300 Call Report)', 'US', 'https://www.ncua.gov', 'quarterly', 'active', '4,287 credit unions loaded Q4 2025'),
('osfi', 'OSFI Who We Regulate', 'Federally-regulated Canadian financial institutions', 'CA', 'https://www.osfi-bsif.gc.ca', 'daily', 'active', NULL),
('rpaa', 'Bank of Canada RPAA Registry', 'Registered Payment Service Providers under the Retail Payments Activities Act', 'CA', 'https://rps.bankofcanada.ca', 'realtime', 'active', '~320 PSPs registered'),
('ciro', 'CIRO Member Registry', 'Canadian Investment Regulatory Organization — investment and mutual fund dealers', 'CA', 'https://www.ciro.ca', 'monthly', 'active', NULL),
('fintrac', 'FINTRAC MSB Registry', 'Money Services Businesses including crypto exchanges', 'CA', 'https://www10.fintrac-canafe.gc.ca', 'realtime', 'active', NULL),
('fincen', 'FinCEN MSB Registry', 'U.S. Money Services Businesses registered with FinCEN', 'US', 'https://www.fincen.gov', 'realtime', 'pending', 'Not yet loaded'),
('cmhc', 'CMHC Housing Data', 'Canada Mortgage and Housing Corporation — housing starts, prices, arrears', 'CA', 'https://www.cmhc-schl.gc.ca', 'monthly', 'active', 'Aggregate market data only'),
('boc', 'Bank of Canada Valet API', 'Key policy rates, mortgage rates, exchange rates', 'CA', 'https://www.bankofcanada.ca/valet', 'realtime', 'active', 'Aggregate data only — not institution-specific')
ON CONFLICT (source_key) DO UPDATE SET display_name = EXCLUDED.display_name;
