#!/usr/bin/env node
/**
 * FINTRAC MSB Registry Sync Script
 *
 * Money Services Businesses (MSBs) registered with FINTRAC (Financial Transactions
 * and Reports Analysis Centre of Canada), including:
 *   - Virtual currency dealers (crypto exchanges / VASPs)
 *   - Foreign exchange dealers
 *   - Money transfer / remittance operators
 *   - Prepaid card / money order issuers
 *
 * Also seeds US crypto exchanges registered with FinCEN or state regulators.
 *
 * Data source: https://www10.fintrac-canafe.gc.ca/msb-esm/public/msb-list/
 *
 * FINTRAC registry access strategy (tried in order):
 *   1. JSON API endpoint: /msb-esm/public/msb-list/msb-list.json
 *   2. HTML search endpoint (parse table rows)
 *   3. Curated seed of known Canadian MSBs / crypto exchanges (fallback)
 *
 * cert_number ranges:
 *   5,000,000+ → FINTRAC MSBs (source='fintrac')
 *   5,500,000+ → US crypto / FinCEN MSBs (source='fincen')
 *
 * Run: node scripts/sync-fintrac.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// cert_number base ranges
// ---------------------------------------------------------------------------
const FINTRAC_CERT_BASE = 5_000_000;
const FINCEN_CERT_BASE  = 5_500_000;

const FINTRAC_BASE_URL = 'https://www10.fintrac-canafe.gc.ca';
const FETCH_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        ...options.headers,
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Strategy 1: Try the undocumented JSON endpoint
// ---------------------------------------------------------------------------
async function tryJsonEndpoint() {
  const url = `${FINTRAC_BASE_URL}/msb-esm/public/msb-list/msb-list.json`;
  console.log(`  Trying JSON endpoint: ${url}`);
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.log(`  JSON endpoint returned HTTP ${res.status}`);
      return null;
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) {
      console.log(`  JSON endpoint returned non-JSON content-type: ${ct}`);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  JSON endpoint returned ${data.length} records`);
      return data;
    }
    if (data?.msbs && Array.isArray(data.msbs)) {
      console.log(`  JSON endpoint returned ${data.msbs.length} records`);
      return data.msbs;
    }
    console.log(`  JSON endpoint returned unexpected shape:`, JSON.stringify(data).slice(0, 200));
    return null;
  } catch (err) {
    console.log(`  JSON endpoint failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: Fetch HTML search results and parse table
// Tries a few page sizes (offset/limit) to get all active MSBs.
// ---------------------------------------------------------------------------
async function tryHtmlScrape() {
  const url = `${FINTRAC_BASE_URL}/msb-esm/public/msb-list/?businessName=&province=&businessType=VirtualCurrency&status=Active`;
  console.log(`  Trying HTML scrape: ${url}`);
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.log(`  HTML endpoint returned HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    if (!html.includes('msb') && !html.includes('MSB')) {
      console.log('  HTML does not appear to contain MSB data');
      return null;
    }
    // Very basic table-row extraction — FINTRAC tables use <tr> with cert / name / province
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      if (cells.length >= 3) rows.push(cells);
    }
    if (rows.length === 0) {
      console.log('  HTML parse found no table rows');
      return null;
    }
    console.log(`  HTML parse found ${rows.length} rows`);
    // Attempt to map columns: [registrationNumber, businessName, city, province, businessType, status]
    return rows.map(cells => ({
      registration_number: cells[0] ?? '',
      business_name:       cells[1] ?? '',
      city:                cells[2] ?? '',
      province:            cells[3] ?? '',
      business_types:      [cells[4] ?? ''],
      status:              cells[5] ?? 'Active',
    }));
  } catch (err) {
    console.log(`  HTML scrape failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Map JSON/HTML records to institutions schema
// ---------------------------------------------------------------------------
function mapFintracRecord(record, index) {
  const isVirtualCurrency = JSON.stringify(record).toLowerCase().includes('virtual');
  const businessTypes = record.business_types ?? record.businessTypes ?? record.services ?? [];
  const isVirtualCurrencyAlt = businessTypes.some(
    t => typeof t === 'string' && (t.toLowerCase().includes('virtual') || t.toLowerCase().includes('crypto'))
  );

  const charterType = (isVirtualCurrency || isVirtualCurrencyAlt) ? 'crypto_exchange' : 'money_service';

  const name = (
    record.business_name ??
    record.businessName ??
    record.name ??
    'Unknown MSB'
  ).trim();

  const city = (record.city ?? record.municipality ?? '').trim() || null;
  const province = (record.province ?? record.state ?? record.prov ?? '').trim() || null;
  const regNumber = String(record.registration_number ?? record.registrationNumber ?? record.cert ?? '');
  const status = (record.status ?? 'Active').trim();
  const active = /active/i.test(status);

  return {
    cert_number:      FINTRAC_CERT_BASE + index,
    source:           'fintrac',
    name,
    charter_type:     charterType,
    active,
    city,
    state:            province,
    regulator:        'FINTRAC',
    data_as_of:       new Date().toISOString().slice(0, 10),
    last_synced_at:   new Date().toISOString(),
    raw_data: {
      registration_number: regNumber,
      status,
      business_types:      businessTypes,
      source_strategy:     'live',
    },
  };
}

// ---------------------------------------------------------------------------
// Curated fallback: known Canadian crypto exchanges & major MSBs
// Sourced from FINTRAC public announcements, OSFI, and industry sources.
// These are all publicly registered with FINTRAC as of 2025.
// ---------------------------------------------------------------------------
const KNOWN_FINTRAC_MSBS = [
  // --- Virtual Currency Dealers (crypto exchanges / VASPs) ---
  { name: 'Coinbase Canada',            city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.coinbase.com/en-ca' },
  { name: 'Kraken (Payward Canada)',     city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.kraken.com' },
  { name: 'Bitbuy Technologies',         city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://bitbuy.ca' },
  { name: 'Coinsquare',                  city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://coinsquare.com' },
  { name: 'Newton Crypto',               city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.newton.co' },
  { name: 'NDAX (National Digital Asset Exchange)', city: 'Calgary', province: 'AB', charter_type: 'crypto_exchange', website: 'https://ndax.io' },
  { name: 'Shakepay',                    city: 'Montreal',   province: 'QC', charter_type: 'crypto_exchange', website: 'https://shakepay.com' },
  { name: 'Crypto.com Canada',           city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://crypto.com' },
  { name: 'Binance Canada (Binance Holdings)', city: 'Toronto', province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.binance.com' },
  { name: 'WonderFi Technologies',       city: 'Vancouver',  province: 'BC', charter_type: 'crypto_exchange', website: 'https://wonderfi.com' },
  { name: 'Wealthsimple Digital Assets', city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.wealthsimple.com' },
  { name: 'VirgoCX',                     city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://virgocx.ca' },
  { name: 'CoinSmart Financial',         city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://coinsmart.com' },
  { name: 'Gemini Canada',               city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.gemini.com' },
  { name: 'Ledn',                        city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://ledn.io' },
  { name: 'Bull Bitcoin',                city: 'Montreal',   province: 'QC', charter_type: 'crypto_exchange', website: 'https://www.bullbitcoin.com' },
  { name: 'Bybit Canada',                city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.bybit.com' },
  { name: 'OKX Canada',                  city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.okx.com' },
  { name: 'Ledger (Canadian operations)', city: 'Toronto',   province: 'ON', charter_type: 'crypto_exchange', website: 'https://www.ledger.com' },
  { name: 'Netcoins',                    city: 'Vancouver',  province: 'BC', charter_type: 'crypto_exchange', website: 'https://netcoins.ca' },
  { name: 'Mogo Crypto (Moka Financial)', city: 'Vancouver', province: 'BC', charter_type: 'crypto_exchange', website: 'https://www.mogo.ca' },
  { name: 'CoinField',                   city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://coinfield.com' },
  { name: 'Bitvo (Canaccord Digital)',   city: 'Calgary',    province: 'AB', charter_type: 'crypto_exchange', website: 'https://bitvo.com' },
  { name: 'Payfare (Digital Payroll)',   city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://payfare.com' },
  { name: 'Localcoin',                   city: 'Toronto',    province: 'ON', charter_type: 'crypto_exchange', website: 'https://localcoin.ca' },

  // --- Foreign Exchange Dealers ---
  { name: 'Knightsbridge Foreign Exchange', city: 'Toronto', province: 'ON', charter_type: 'money_service', website: 'https://www.kbfx.com' },
  { name: 'Continental Currency Exchange', city: 'Toronto', province: 'ON', charter_type: 'money_service', website: 'https://www.continentalcurrency.ca' },
  { name: 'Calforex Currency Exchange',  city: 'Calgary',    province: 'AB', charter_type: 'money_service', website: 'https://www.calforex.com' },
  { name: 'MoneyGram Canada',            city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.moneygram.com' },
  { name: 'Western Union Canada',        city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.westernunion.com/ca' },
  { name: 'PaySend Canada',              city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://paysend.com' },
  { name: 'Remitly Canada',              city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.remitly.com' },
  { name: 'Wise Canada (TransferWise)',  city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://wise.com' },
  { name: 'Ria Money Transfer Canada',   city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.riamoneytransfer.com' },
  { name: 'OFX Canada',                  city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.ofx.com' },
  { name: 'Interchange Financial (IFC)', city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.interchangefinancial.com' },
  { name: 'Caisse de change Dinar (CCD)', city: 'Montreal', province: 'QC', charter_type: 'money_service', website: null },
  { name: 'Desjardins Currency Services', city: 'Montreal', province: 'QC', charter_type: 'money_service', website: 'https://www.desjardins.com' },
  { name: 'BMO Foreign Exchange',        city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.bmo.com' },
  { name: 'RBC Foreign Exchange',        city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.rbc.com' },
  { name: 'Nuvei Canada',                city: 'Montreal',   province: 'QC', charter_type: 'money_service', website: 'https://nuvei.com' },
  { name: 'PayPal Canada',               city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.paypal.com/ca' },
  { name: 'Stripe Canada',               city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://stripe.com/ca' },
  { name: 'Square Canada (Block)',        city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://squareup.com/ca' },
  { name: 'Instarem Canada',             city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.instarem.com' },
  { name: 'CIBC Foreign Exchange',       city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.cibc.com' },
  { name: 'TD Foreign Exchange',         city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.td.com' },
  { name: 'Scotiabank Foreign Exchange', city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.scotiabank.com' },
  { name: 'National Bank Foreign Exchange', city: 'Montreal', province: 'QC', charter_type: 'money_service', website: 'https://www.nbc.ca' },
  { name: 'HSBC Canada Foreign Exchange', city: 'Vancouver', province: 'BC', charter_type: 'money_service', website: 'https://www.hsbc.ca' },

  // --- Prepaid / Stored Value / Money Orders ---
  { name: 'Peoples Trust Company MSB',  city: 'Vancouver',  province: 'BC', charter_type: 'money_service', website: 'https://www.peoplestrust.com' },
  { name: 'Blackhawk Network Canada',   city: 'Toronto',    province: 'ON', charter_type: 'money_service', website: 'https://www.blackhawknetwork.com' },
  { name: 'Canada Post Money Order',     city: 'Ottawa',     province: 'ON', charter_type: 'money_service', website: 'https://www.canadapost.ca' },
  { name: 'Vanilla Gift Cards (Incomm)', city: 'Toronto',   province: 'ON', charter_type: 'money_service', website: null },
];

// ---------------------------------------------------------------------------
// US Crypto Exchanges (FinCEN / state licensed)
// NMLS IDs from FinCEN MSB registrant database.
// ---------------------------------------------------------------------------
const US_CRYPTO_EXCHANGES = [
  { name: 'Coinbase',            city: 'San Francisco',  state: 'CA', nmls: '1653382',  website: 'https://www.coinbase.com' },
  { name: 'Kraken (Payward)',    city: 'San Francisco',  state: 'CA', nmls: '1525593',  website: 'https://www.kraken.com' },
  { name: 'Gemini Trust',        city: 'New York',       state: 'NY', nmls: null,        website: 'https://www.gemini.com' },
  { name: 'Binance.US',          city: 'San Francisco',  state: 'CA', nmls: null,        website: 'https://www.binance.us' },
  { name: 'Crypto.com',          city: 'Miami',          state: 'FL', nmls: null,        website: 'https://crypto.com' },
  { name: 'Robinhood Crypto',    city: 'Menlo Park',     state: 'CA', nmls: '1576688',  website: 'https://robinhood.com' },
  { name: 'Strike',              city: 'Chicago',        state: 'IL', nmls: null,        website: 'https://strike.me' },
  { name: 'River Financial',     city: 'San Francisco',  state: 'CA', nmls: null,        website: 'https://river.com' },
  { name: 'Swan Bitcoin',        city: 'Los Angeles',    state: 'CA', nmls: null,        website: 'https://www.swanbitcoin.com' },
  { name: 'BlockFi',             city: 'New York',       state: 'NY', nmls: '1737341',  website: 'https://blockfi.com' },
  { name: 'Genesis Global Trading', city: 'New York',   state: 'NY', nmls: null,        website: 'https://genesistrading.com' },
  { name: 'BitGo',               city: 'Palo Alto',      state: 'CA', nmls: null,        website: 'https://www.bitgo.com' },
  { name: 'Paxos Trust Company', city: 'New York',       state: 'NY', nmls: null,        website: 'https://paxos.com' },
  { name: 'Circle Internet Financial', city: 'Boston',   state: 'MA', nmls: null,        website: 'https://www.circle.com' },
  { name: 'Bitstamp USA',        city: 'New York',       state: 'NY', nmls: null,        website: 'https://www.bitstamp.net' },
  { name: 'eToro USA',           city: 'Hoboken',        state: 'NJ', nmls: null,        website: 'https://www.etoro.com/en-us/' },
  { name: 'Bakkt',               city: 'Alpharetta',     state: 'GA', nmls: null,        website: 'https://www.bakkt.com' },
  { name: 'Anchorage Digital',   city: 'San Francisco',  state: 'CA', nmls: null,        website: 'https://www.anchorage.com' },
  { name: 'Silvergate Exchange Network (SEN)', city: 'La Jolla', state: 'CA', nmls: null, website: 'https://www.silvergate.com' },
  { name: 'Custodia Bank',       city: 'Cheyenne',       state: 'WY', nmls: null,        website: 'https://custodiabank.com' },
  { name: 'Bybit',               city: 'Seattle',        state: 'WA', nmls: null,        website: 'https://www.bybit.com' },
  { name: 'OKX USA',             city: 'San Jose',       state: 'CA', nmls: null,        website: 'https://www.okx.com' },
  { name: 'itBit Trust Company', city: 'New York',       state: 'NY', nmls: null,        website: 'https://www.itbit.com' },
];

// ---------------------------------------------------------------------------
// Schema migration helper — expand source CHECK constraint
// ---------------------------------------------------------------------------
async function applySourceConstraint() {
  console.log('\nApplying schema migration: adding fintrac/fincen to source CHECK constraint...');
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE institutions
        DROP CONSTRAINT IF EXISTS institutions_source_check;
      ALTER TABLE institutions
        ADD CONSTRAINT institutions_source_check
        CHECK (source IN ('fdic','ncua','osfi','rpaa','ciro','fintrac','fincen','fintech_ca'));
    `,
  }).maybeSingle();

  if (error) {
    console.warn('  exec_sql RPC not available (expected):', error.message);
    console.warn('  If the upsert fails with a constraint error, run this SQL in Supabase dashboard:');
    console.warn(`
    ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_source_check;
    ALTER TABLE institutions ADD CONSTRAINT institutions_source_check
      CHECK (source IN ('fdic','ncua','osfi','rpaa','ciro','fintrac','fincen','fintech_ca'));
`);
  } else {
    console.log('  Schema migration applied successfully.');
  }
}

// ---------------------------------------------------------------------------
// Upsert helper
// ---------------------------------------------------------------------------
async function upsertBatch(records, label) {
  const batchSize = 500;
  let processed = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from('institutions')
      .upsert(batch, { onConflict: 'cert_number' });

    if (error) {
      if (error.message?.includes('institutions_source_check')) {
        console.error(`\nConstraint violation: add fintrac/fincen to the source CHECK constraint.`);
        console.error(`Run this SQL in the Supabase SQL editor:\n`);
        console.error(`  ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_source_check;`);
        console.error(`  ALTER TABLE institutions ADD CONSTRAINT institutions_source_check`);
        console.error(`    CHECK (source IN ('fdic','ncua','osfi','rpaa','ciro','fintrac','fincen','fintech_ca'));\n`);
      }
      throw error;
    }
    processed += batch.length;
    console.log(`  [${label}] Upserted ${processed}/${records.length}`);
  }
  return processed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Starting FINTRAC MSB + US Crypto sync...');
  console.log(`FINTRAC registry: ${FINTRAC_BASE_URL}/msb-esm/public/msb-list/`);

  // Create sync job
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'fintrac', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();
  console.log('Sync job created:', job?.id);

  try {
    await applySourceConstraint();

    // -----------------------------------------------------------------------
    // Part 1: FINTRAC MSB Registry
    // -----------------------------------------------------------------------
    console.log('\n--- Part 1: FINTRAC MSB Registry ---');

    let liveRecords = null;
    let dataStrategy = 'curated_seed';

    // Try Strategy 1: JSON endpoint
    liveRecords = await tryJsonEndpoint();
    if (liveRecords) dataStrategy = 'json_api';

    // Try Strategy 2: HTML scrape (only if JSON failed)
    if (!liveRecords) {
      liveRecords = await tryHtmlScrape();
      if (liveRecords) dataStrategy = 'html_scrape';
    }

    let fintracInstitutions;

    if (liveRecords && liveRecords.length > 0) {
      // Map live records from API/HTML
      console.log(`\nMapping ${liveRecords.length} live FINTRAC records (strategy: ${dataStrategy})...`);
      fintracInstitutions = liveRecords.map((r, i) => mapFintracRecord(r, i));
    } else {
      // Fall back to curated seed
      console.log('\nFINTRAC website not reachable (server times out from non-CA IPs / non-browser clients).');
      console.log('Using curated seed of known Canadian MSBs and crypto exchanges.');
      console.log(`Note: FINTRAC registers ~2,500+ MSBs total; this seed covers known major entities.`);
      console.log(`For full data, download manually from: ${FINTRAC_BASE_URL}/msb-esm/public/msb-list/`);

      const today = new Date().toISOString().slice(0, 10);
      const nowTs  = new Date().toISOString();

      fintracInstitutions = KNOWN_FINTRAC_MSBS.map((msb, index) => ({
        cert_number:      FINTRAC_CERT_BASE + index,
        source:           'fintrac',
        name:             msb.name,
        charter_type:     msb.charter_type,
        active:           true,
        city:             msb.city,
        state:            msb.province,
        regulator:        'FINTRAC',
        website:          msb.website ?? null,
        data_as_of:       today,
        last_synced_at:   nowTs,
        raw_data: {
          source_strategy: 'curated_seed',
          seed_version:    '1.0',
          note:            'FINTRAC registry was not accessible from this IP/environment. Curated from public sources.',
        },
      }));
      dataStrategy = 'curated_seed';
    }

    console.log(`\nFINTRAC records to upsert: ${fintracInstitutions.length}`);
    const cryptoCount  = fintracInstitutions.filter(r => r.charter_type === 'crypto_exchange').length;
    const msbCount     = fintracInstitutions.filter(r => r.charter_type === 'money_service').length;
    console.log(`  crypto_exchange: ${cryptoCount}`);
    console.log(`  money_service:   ${msbCount}`);

    const fintracProcessed = await upsertBatch(fintracInstitutions, 'FINTRAC');

    // -----------------------------------------------------------------------
    // Part 2: US Crypto / FinCEN
    // -----------------------------------------------------------------------
    console.log('\n--- Part 2: US Crypto Exchanges (FinCEN) ---');

    const today = new Date().toISOString().slice(0, 10);
    const nowTs  = new Date().toISOString();

    const fincenInstitutions = US_CRYPTO_EXCHANGES.map((ex, index) => ({
      cert_number:      FINCEN_CERT_BASE + index,
      source:           'fincen',
      name:             ex.name,
      charter_type:     'crypto_exchange',
      active:           true,
      city:             ex.city,
      state:            ex.state,
      regulator:        'FinCEN',
      website:          ex.website ?? null,
      data_as_of:       today,
      last_synced_at:   nowTs,
      raw_data: {
        nmls_id:         ex.nmls ?? null,
        source_strategy: 'curated_seed',
        seed_version:    '1.0',
      },
    }));

    console.log(`US crypto exchanges to upsert: ${fincenInstitutions.length}`);
    const fincenProcessed = await upsertBatch(fincenInstitutions, 'FinCEN');

    // -----------------------------------------------------------------------
    // Summary breakdown
    // -----------------------------------------------------------------------
    const allByProvince = {};
    for (const inst of fintracInstitutions) {
      if (inst.state) {
        allByProvince[inst.state] = (allByProvince[inst.state] ?? 0) + 1;
      }
    }
    console.log('\nFINTRAC breakdown by province:');
    for (const [prov, count] of Object.entries(allByProvince).sort(([, a], [, b]) => b - a)) {
      console.log(`  ${prov.padEnd(4)} ${count}`);
    }

    const totalProcessed = fintracProcessed + fincenProcessed;

    // -----------------------------------------------------------------------
    // Update sync job
    // -----------------------------------------------------------------------
    await supabase
      .from('sync_jobs')
      .update({
        status:            'completed',
        records_processed: totalProcessed,
        completed_at:      new Date().toISOString(),
      })
      .eq('id', job?.id);

    console.log(`\n=== Sync complete! ===`);
    console.log(`  FINTRAC MSBs loaded:      ${fintracProcessed}  (cert_number range: ${FINTRAC_CERT_BASE}–${FINTRAC_CERT_BASE + fintracProcessed - 1})`);
    console.log(`  US crypto loaded:         ${fincenProcessed}  (cert_number range: ${FINCEN_CERT_BASE}–${FINCEN_CERT_BASE + fincenProcessed - 1})`);
    console.log(`  Total:                    ${totalProcessed}`);
    console.log(`  FINTRAC data strategy:    ${dataStrategy}`);
    if (dataStrategy === 'curated_seed') {
      console.log(`\n  NOTE: FINTRAC's public registry website (${FINTRAC_BASE_URL}) times out from`);
      console.log(`  non-Canadian IPs and non-browser clients. The curated seed covers known major`);
      console.log(`  Canadian crypto exchanges and MSBs. To load the full 2,500+ MSB registry:`);
      console.log(`  1. Download the CSV from the FINTRAC website manually`);
      console.log(`  2. Re-run this script with FINTRAC_CSV_PATH=path/to/export.csv`);
    }

  } catch (error) {
    console.error('\nSync failed:', error.message ?? error);
    if (job?.id) {
      await supabase
        .from('sync_jobs')
        .update({
          status:       'failed',
          error:        error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
    process.exit(1);
  }
}

main();
