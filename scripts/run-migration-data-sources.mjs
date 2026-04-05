#!/usr/bin/env node
/**
 * Data Sources Migration Runner
 *
 * 1. Attempts to create the data_sources table via the Supabase Management API
 *    (requires SUPABASE_ACCESS_TOKEN env var).
 * 2. Falls back to printing manual SQL instructions if the access token is not
 *    available.
 * 3. Seeds / upserts all data source records using the Supabase JS client.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<pat> node scripts/run-migration-data-sources.mjs
 *   node scripts/run-migration-data-sources.mjs   # prints instructions + seeds data
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const ref = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

// ---------------------------------------------------------------------------
// Step 1 — Create table via Management API (if access token present)
// ---------------------------------------------------------------------------
const sqlFile = join(__dirname, 'add-data-sources-table.sql');
const sql = readFileSync(sqlFile, 'utf-8');

async function runViaMgmtApi(accessToken) {
  console.log(`Applying migration via Supabase Management API (project: ${ref})...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.text();
  if (res.ok) {
    console.log('Migration applied successfully.');
    return true;
  } else {
    console.error(`Management API error (${res.status}):`, body.slice(0, 500));
    return false;
  }
}

function printManualInstructions() {
  console.log('\n=== MANUAL MIGRATION — data_sources table ===');
  console.log('Apply the SQL migration manually using one of these methods:\n');
  console.log('OPTION 1 — Supabase Dashboard SQL Editor:');
  console.log(`  1. Open: https://supabase.com/dashboard/project/${ref}/sql/new`);
  console.log(`  2. Paste the contents of: ${sqlFile}`);
  console.log('  3. Click "Run"\n');
  console.log('OPTION 2 — Supabase CLI:');
  console.log('  supabase login && supabase link --project-ref', ref);
  console.log('  supabase db push\n');
  console.log('SQL preview:\n---');
  console.log(sql.split('\n').slice(0, 20).join('\n'));
  console.log('...\n---\n');
}

// ---------------------------------------------------------------------------
// Step 2 — Seed / upsert data source records using the JS client
// ---------------------------------------------------------------------------
const DATA_SOURCES = [
  {
    source_key: 'fdic',
    display_name: 'FDIC BankFind Suite',
    description: 'All FDIC-insured U.S. commercial banks and savings institutions',
    country: 'US',
    regulator_url: 'https://banks.data.fdic.gov',
    data_url: 'https://banks.data.fdic.gov/api/institutions',
    update_frequency: 'quarterly',
    status: 'active',
    notes: '4,408 active institutions as of Q4 2025',
  },
  {
    source_key: 'fdic_history',
    display_name: 'FDIC History API',
    description: 'Official FDIC institution history records for charter openings, mergers, failures, closures, and conversions',
    country: 'US',
    regulator_url: 'https://api.fdic.gov/banks/history',
    data_url: 'https://api.fdic.gov/banks/history',
    update_frequency: 'daily',
    status: 'active',
    notes: 'Institution-level events only; branch rows are filtered out before writing charter_events.',
  },
  {
    source_key: 'fdic_failures',
    display_name: 'FDIC Failures API',
    description: 'Official FDIC bank failure records, resolution details, and loss estimates.',
    country: 'US',
    regulator_url: 'https://banks.data.fdic.gov',
    data_url: 'https://banks.data.fdic.gov/api/failures',
    update_frequency: 'daily',
    status: 'active',
    notes: 'Warehouse-backed failure history persisted independently from the current institutions table.',
  },
  {
    source_key: 'fdic_enforcement',
    display_name: 'FDIC Enforcement API',
    description: 'Official FDIC enforcement action records, civil money penalties, and termination dates.',
    country: 'US',
    regulator_url: 'https://banks.data.fdic.gov',
    data_url: 'https://banks.data.fdic.gov/api/enforcement',
    update_frequency: 'weekly',
    status: 'pending',
    notes: 'Loader scaffolding exists, but the public FDIC enforcement endpoint needs a re-verified machine-readable path before this source is treated as active.',
  },
  {
    source_key: 'ncua',
    display_name: 'NCUA Call Report Data',
    description: 'All federally-insured U.S. credit unions (5300 Call Report)',
    country: 'US',
    regulator_url: 'https://www.ncua.gov',
    data_url: 'https://www.ncua.gov/analysis/credit-union-corporate/call-report-data-download',
    update_frequency: 'quarterly',
    status: 'active',
    notes: '4,287 credit unions loaded Q4 2025',
  },
  {
    source_key: 'osfi',
    display_name: 'OSFI Who We Regulate',
    description: 'Federally-regulated Canadian financial institutions',
    country: 'CA',
    regulator_url: 'https://www.osfi-bsif.gc.ca',
    data_url: 'https://www.osfi-bsif.gc.ca/en/supervised-institutions-activities/federally-regulated-financial-institutions',
    update_frequency: 'daily',
    status: 'active',
    notes: null,
  },
  {
    source_key: 'rpaa',
    display_name: 'Bank of Canada RPAA Registry',
    description: 'Registered Payment Service Providers under the Retail Payments Activities Act',
    country: 'CA',
    regulator_url: 'https://rps.bankofcanada.ca',
    data_url: 'https://www.bankofcanada.ca/rps-api/cif2/accounts/list',
    update_frequency: 'realtime',
    status: 'active',
    notes: '~320 PSPs registered',
  },
  {
    source_key: 'ciro',
    display_name: 'CIRO Member Registry',
    description: 'Canadian Investment Regulatory Organization — investment and mutual fund dealers',
    country: 'CA',
    regulator_url: 'https://www.ciro.ca',
    data_url: 'https://www.ciro.ca/investors/check-your-advisor-dealer',
    update_frequency: 'monthly',
    status: 'active',
    notes: null,
  },
  {
    source_key: 'fintrac',
    display_name: 'FINTRAC MSB Registry',
    description: 'Money Services Businesses including crypto exchanges',
    country: 'CA',
    regulator_url: 'https://www10.fintrac-canafe.gc.ca',
    data_url: 'https://www10.fintrac-canafe.gc.ca/msb-esm/public/msb-list/',
    update_frequency: 'realtime',
    status: 'active',
    notes: null,
  },
  {
    source_key: 'fincen',
    display_name: 'FinCEN MSB Registry',
    description: 'U.S. money services businesses and related MSB registry records.',
    country: 'US',
    regulator_url: 'https://www.fincen.gov',
    data_url: 'https://www.fincen.gov/msb-registrant-search',
    update_frequency: 'realtime',
    status: 'active',
    notes: 'Current repo has a starter loaded subset.',
  },
  {
    source_key: 'ffiec_cdr',
    display_name: 'FFIEC CDR Public Web Services',
    description: 'Public call report and UBPR access for banks and savings institutions via the Central Data Repository.',
    country: 'US',
    regulator_url: 'https://cdr.ffiec.gov/public/PWS/PWSPage.aspx',
    data_url: 'https://cdr.ffiec.gov/public/PWS/PWSPage.aspx',
    update_frequency: 'quarterly',
    status: 'pending',
    notes: 'Planned deeper call report field coverage beyond the FDIC subset.',
  },
  {
    source_key: 'ffiec_nic',
    display_name: 'FFIEC National Information Center',
    description: 'Holding company, affiliate, and structure data for U.S. banking organizations.',
    country: 'US',
    regulator_url: 'https://www.ffiec.gov/npw/',
    data_url: 'https://www.ffiec.gov/npw/FinancialReport/FinancialDataDownload',
    update_frequency: 'quarterly',
    status: 'pending',
    notes: 'Planned holding-company and affiliate structure layer.',
  },
  {
    source_key: 'ffiec_hmda',
    display_name: 'FFIEC HMDA',
    description: 'Mortgage disclosure and origination data published through FFIEC HMDA resources.',
    country: 'US',
    regulator_url: 'https://www.ffiec.gov/hmda',
    data_url: 'https://www.ffiec.gov/hmda',
    update_frequency: 'annual',
    status: 'pending',
    notes: 'Planned mortgage-market and fair-lending context.',
  },
  {
    source_key: 'ffiec_census',
    display_name: 'FFIEC Census and Geomap',
    description: 'Census tract and geomap context used for CRA and HMDA geographic analysis.',
    country: 'US',
    regulator_url: 'https://www.ffiec.gov',
    data_url: 'https://www.ffiec.gov/census',
    update_frequency: 'annual',
    status: 'pending',
    notes: 'Planned geographic benchmarking and tract overlays.',
  },
  {
    source_key: 'ffiec_cra',
    display_name: 'FFIEC CRA Ratings',
    description: 'Community Reinvestment Act public ratings and related disclosure context.',
    country: 'US',
    regulator_url: 'https://www.ffiec.gov',
    data_url: 'https://www.ffiec.gov/craratings/',
    update_frequency: 'quarterly',
    status: 'pending',
    notes: 'Official CRA ratings loader is wired, but the FFIEC public file may need a manual download when direct scripted fetches are blocked.',
  },
  {
    source_key: 'occ',
    display_name: 'OCC Financial Institution Lists',
    description: 'Official OCC institution lists, trust bank lists, and charter reference materials.',
    country: 'US',
    regulator_url: 'https://www.occ.treas.gov',
    data_url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/index-financial-institution-lists.html',
    update_frequency: 'monthly',
    status: 'pending',
    notes: 'Planned charter-family and trust-bank expansion source.',
  },
  {
    source_key: 'frb_routing',
    display_name: 'FRB Routing Number Directory',
    description: 'Federal Reserve routing transit directory and payment rail participation context.',
    country: 'US',
    regulator_url: 'https://www.frbservices.org',
    data_url: 'https://www.frbservices.org/resources/routing-number-directory/',
    update_frequency: 'daily',
    status: 'pending',
    notes: 'Planned payments-infrastructure context for rails and routing status.',
  },
  {
    source_key: 'sec_edgar',
    display_name: 'SEC EDGAR APIs',
    description: 'Public company filings and structured SEC company data for listed banks and fintechs.',
    country: 'US',
    regulator_url: 'https://www.sec.gov',
    data_url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    update_frequency: 'daily',
    status: 'pending',
    notes: 'Planned public-company parent, issuer, and fintech filing context.',
  },
  {
    source_key: 'cfpb_complaints',
    display_name: 'CFPB Consumer Complaint Database',
    description: 'Public complaint data covering consumer financial products and institutions.',
    country: 'US',
    regulator_url: 'https://www.consumerfinance.gov',
    data_url: 'https://www.consumerfinance.gov/data-research/consumer-complaints/',
    update_frequency: 'daily',
    status: 'active',
    notes: 'Complaint-signal layer using company suggestions and official CFPB trend aggregates.',
  },
  {
    source_key: 'nmls',
    display_name: 'NMLS Consumer Access',
    description: 'State-licensed nonbank and mortgage licensing lookup through NMLS Consumer Access.',
    country: 'US',
    regulator_url: 'https://www.csbs.org/nonbank-licensing-and-examination',
    data_url: 'https://www.nmlsconsumeraccess.org/',
    update_frequency: 'daily',
    status: 'pending',
    notes: 'Planned state-licensed nonbank expansion.',
  },
  {
    source_key: 'cmhc',
    display_name: 'CMHC Housing Data',
    description: 'Canada Mortgage and Housing Corporation — housing starts, prices, arrears',
    country: 'CA',
    regulator_url: 'https://www.cmhc-schl.gc.ca',
    data_url: 'https://www.cmhc-schl.gc.ca/en/data-and-research',
    update_frequency: 'monthly',
    status: 'active',
    notes: 'Aggregate market data only',
  },
  {
    source_key: 'boc',
    display_name: 'Bank of Canada Valet API',
    description: 'Key policy rates, mortgage rates, exchange rates',
    country: 'CA',
    regulator_url: 'https://www.bankofcanada.ca/valet',
    data_url: 'https://www.bankofcanada.ca/valet/observations',
    update_frequency: 'realtime',
    status: 'active',
    notes: 'Aggregate data only — not institution-specific',
  },
];

async function seedDataSources() {
  console.log('\nSeeding data_sources table...');

  const { data, error } = await supabase
    .from('data_sources')
    .upsert(DATA_SOURCES, { onConflict: 'source_key' })
    .select();

  if (error) {
    if (error.code === '42P01') {
      console.error(
        'Table data_sources does not exist yet.\n' +
          'Apply the SQL migration first (see instructions above), then re-run this script.'
      );
    } else {
      console.error('Upsert error:', error.message);
    }
    return false;
  }

  console.log(`Seeded ${data?.length ?? 0} data source records:`);
  for (const row of data ?? []) {
    console.log(`  [${row.country}] ${row.source_key} — ${row.display_name} (${row.status})`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (accessToken) {
    const ok = await runViaMgmtApi(accessToken);
    if (!ok) printManualInstructions();
  } else {
    console.log('No SUPABASE_ACCESS_TOKEN found — skipping automatic migration.');
    printManualInstructions();
  }

  await seedDataSources();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
