#!/usr/bin/env node
/**
 * Canadian Fintech Seed Script
 *
 * Upserts known Canadian fintechs into the institutions table.
 * These are companies not already covered by RPAA/CIRO/FINTRAC bulk syncs.
 *
 * cert_number range: 6,000,000+ (avoids FDIC 1-10k, NCUA 10k-99k,
 *   OSFI 1M-2M, RPAA 3M, and future ranges up to 5.9M)
 * source: 'fintech_ca'
 *
 * Usage: node scripts/seed-canadian-fintechs.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
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

// cert_number base — 6,000,000+ range for manually-curated Canadian fintechs
const CERT_BASE = 6_000_000;

const CANADIAN_FINTECHS = [
  {
    name: 'Wealthsimple',
    city: 'Toronto',
    state: 'ON',
    website: 'wealthsimple.com',
  },
  {
    name: 'Koho Financial',
    city: 'Toronto',
    state: 'ON',
    website: 'koho.ca',
  },
  {
    name: 'Borrowell',
    city: 'Toronto',
    state: 'ON',
    website: 'borrowell.com',
  },
  {
    name: 'Mogo',
    city: 'Vancouver',
    state: 'BC',
    website: 'mogo.ca',
  },
  {
    name: 'Financeit',
    city: 'Toronto',
    state: 'ON',
    website: 'financeit.ca',
  },
  {
    name: 'Nuvei',
    city: 'Montreal',
    state: 'QC',
    website: 'nuvei.com',
  },
  {
    name: 'Lightspeed Commerce',
    city: 'Montreal',
    state: 'QC',
    website: 'lightspeedhq.com',
  },
  {
    name: 'Interac Corp',
    city: 'Toronto',
    state: 'ON',
    website: 'interac.ca',
  },
  {
    name: 'EQ Bank / Equitable Bank',
    city: 'Toronto',
    state: 'ON',
    website: 'eqbank.ca',
  },
  {
    name: 'Neo Financial',
    city: 'Calgary',
    state: 'AB',
    website: 'neofinancial.com',
  },
  {
    name: 'Stack Financial',
    city: 'Vancouver',
    state: 'BC',
    website: 'getstack.ca',
  },
  {
    name: 'Paytm Canada',
    city: 'Toronto',
    state: 'ON',
    website: 'paytm.ca',
  },
  {
    name: 'Brim Financial',
    city: 'Toronto',
    state: 'ON',
    website: 'brimfinancial.com',
  },
  {
    name: 'Float Financial',
    city: 'Toronto',
    state: 'ON',
    website: 'floatcard.com',
  },
  {
    name: 'Humi',
    city: 'Toronto',
    state: 'ON',
    website: 'humi.ca',
  },
  {
    name: 'Clearco',
    city: 'Toronto',
    state: 'ON',
    website: 'clearco.com',
  },
];

// Build institution records
const records = CANADIAN_FINTECHS.map((ft, idx) => ({
  cert_number: CERT_BASE + idx + 1,
  source: 'fintech_ca',
  name: ft.name,
  legal_name: ft.name,
  charter_type: 'fintech',
  active: true,
  city: ft.city,
  state: ft.state,
  country: 'CA',
  website: ft.website,
  regulator: 'self',
  // Financials intentionally null — these are not regulated deposit-takers
  total_assets: null,
  total_deposits: null,
  total_loans: null,
  num_branches: null,
  num_employees: null,
  roi: null,
  roa: null,
  equity_capital: null,
  net_income: null,
  credit_card_loans: null,
  credit_card_charge_offs: null,
  zip: null,
  county: null,
  latitude: null,
  longitude: null,
  established_date: null,
  holding_company: null,
  holding_company_id: null,
  data_as_of: null,
  raw_data: null,
}));

async function main() {
  console.log(`Seeding ${records.length} Canadian fintechs (cert_number range ${CERT_BASE + 1}–${CERT_BASE + records.length})...`);

  const { data, error } = await supabase
    .from('institutions')
    .upsert(records, { onConflict: 'cert_number' })
    .select('cert_number, name, city, state');

  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }

  console.log(`Successfully upserted ${data?.length ?? 0} records:`);
  for (const row of data ?? []) {
    console.log(`  [${row.cert_number}] ${row.name} — ${row.city}, ${row.state}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
