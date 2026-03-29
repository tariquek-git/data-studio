-- Tracks all data sources ingested into the system
CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT UNIQUE NOT NULL,
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
INSERT INTO data_sources (source_key, display_name, description, country, regulator_url, data_url, update_frequency, status, notes) VALUES
('fdic', 'FDIC BankFind Suite', 'FDIC-insured U.S. commercial banks and savings institutions with quarterly condition and branch data.', 'US', 'https://banks.data.fdic.gov', 'https://banks.data.fdic.gov/api/institutions', 'quarterly', 'active', 'Primary bank core for U.S. depository institutions.'),
('ncua', 'NCUA Call Report Data', 'Federally insured U.S. credit union filings and quarterly financial condition data.', 'US', 'https://www.ncua.gov', 'https://www.ncua.gov/analysis/credit-union-corporate-call-report-data', 'quarterly', 'active', 'Quarterly credit union coverage.'),
('osfi', 'OSFI Who We Regulate', 'Federally regulated Canadian financial institutions supervised by OSFI.', 'CA', 'https://www.osfi-bsif.gc.ca', 'https://www.osfi-bsif.gc.ca/en/supervision/who-we-regulate', 'daily', 'active', 'Canadian regulated bank and insurer authority list.'),
('rpaa', 'Bank of Canada RPAA Registry', 'Registered payment service providers under the Retail Payment Activities Act.', 'CA', 'https://www.bankofcanada.ca', 'https://www.bankofcanada.ca/core-functions/funds-management/retail-payments-supervision/', 'realtime', 'active', 'Registry-backed PSP coverage for Canada.'),
('ciro', 'CIRO Member Registry', 'Canadian Investment Regulatory Organization member firms and dealer lookup data.', 'CA', 'https://www.ciro.ca', 'https://www.ciro.ca/investors/check-your-advisor-dealer', 'monthly', 'active', 'Dealer registry for securities and mutual fund participants.'),
('fintrac', 'FINTRAC MSB Registry', 'Canadian money services businesses and foreign MSBs registered with FINTRAC.', 'CA', 'https://fintrac-canafe.canada.ca', 'https://www10.fintrac-canafe.gc.ca/msb-esm/public/msb-list/', 'realtime', 'active', 'Includes Canadian MSBs and crypto-adjacent entities.'),
('fincen', 'FinCEN MSB Registry', 'U.S. money services businesses and related MSB registry records.', 'US', 'https://www.fincen.gov', 'https://www.fincen.gov/msb-registrant-search', 'realtime', 'active', 'Current repo has a starter loaded subset.'),
('ffiec_cdr', 'FFIEC CDR Public Web Services', 'Public call report and UBPR access for banks and savings institutions via the Central Data Repository.', 'US', 'https://cdr.ffiec.gov/public/PWS/PWSPage.aspx', 'https://cdr.ffiec.gov/public/PWS/PWSPage.aspx', 'quarterly', 'pending', 'Planned deeper call report field coverage beyond the FDIC subset.'),
('ffiec_nic', 'FFIEC National Information Center', 'Holding company, affiliate, and structure data for U.S. banking organizations.', 'US', 'https://www.ffiec.gov/npw/', 'https://www.ffiec.gov/npw/FinancialReport/FinancialDataDownload', 'quarterly', 'pending', 'Planned holding-company and affiliate structure layer.'),
('ffiec_hmda', 'FFIEC HMDA', 'Mortgage disclosure and origination data published through FFIEC HMDA resources.', 'US', 'https://www.ffiec.gov/hmda', 'https://www.ffiec.gov/hmda', 'annual', 'pending', 'Planned mortgage-market and fair-lending context.'),
('ffiec_census', 'FFIEC Census and Geomap', 'Census tract and geomap context used for CRA and HMDA geographic analysis.', 'US', 'https://www.ffiec.gov', 'https://www.ffiec.gov/census', 'annual', 'pending', 'Planned geographic benchmarking and tract overlays.'),
('ffiec_cra', 'FFIEC CRA Ratings', 'Community Reinvestment Act public ratings and related disclosure context.', 'US', 'https://www.ffiec.gov', 'https://www.ffiec.gov/craratings/', 'quarterly', 'pending', 'Current app uses some live enrichment but does not persist the source yet.'),
('occ', 'OCC Financial Institution Lists', 'Official OCC institution lists, trust bank lists, and charter reference materials.', 'US', 'https://www.occ.treas.gov', 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/index-financial-institution-lists.html', 'monthly', 'pending', 'Planned charter-family and trust-bank expansion source.'),
('frb_routing', 'FRB Routing Number Directory', 'Federal Reserve routing transit directory and payment rail participation context.', 'US', 'https://www.frbservices.org', 'https://www.frbservices.org/resources/routing-number-directory/', 'daily', 'pending', 'Planned payments-infrastructure context for rails and routing status.'),
('sec_edgar', 'SEC EDGAR APIs', 'Public company filings and structured SEC company data for listed banks and fintechs.', 'US', 'https://www.sec.gov', 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces', 'daily', 'pending', 'Planned public-company parent, issuer, and fintech filing context.'),
('cfpb_complaints', 'CFPB Consumer Complaint Database', 'Public complaint data covering consumer financial products and institutions.', 'US', 'https://www.consumerfinance.gov', 'https://www.consumerfinance.gov/data-research/consumer-complaints/', 'daily', 'pending', 'Planned reputation and complaint-signal layer.'),
('nmls', 'NMLS Consumer Access', 'State-licensed nonbank and mortgage licensing lookup through NMLS Consumer Access.', 'US', 'https://www.csbs.org/nonbank-licensing-and-examination', 'https://www.nmlsconsumeraccess.org/', 'daily', 'pending', 'Planned state-licensed nonbank expansion.'),
('cmhc', 'CMHC Housing Data', 'Canadian housing and mortgage market data from Canada Mortgage and Housing Corporation.', 'CA', 'https://www.cmhc-schl.gc.ca', 'https://www.cmhc-schl.gc.ca/en/data-and-research', 'monthly', 'active', 'Aggregate Canadian housing and mortgage context.'),
('boc', 'Bank of Canada Valet API', 'Bank of Canada policy rates, market series, and macro reference data.', 'CA', 'https://www.bankofcanada.ca', 'https://www.bankofcanada.ca/valet/docs', 'realtime', 'active', 'Aggregate market and policy series only.')
ON CONFLICT (source_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  country = EXCLUDED.country,
  regulator_url = EXCLUDED.regulator_url,
  data_url = EXCLUDED.data_url,
  update_frequency = EXCLUDED.update_frequency,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes;
