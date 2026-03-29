#!/usr/bin/env node
/**
 * FDIC Historical Data Backfill Script
 * Populates the financial_history table with 8 quarters of data
 * for all active FDIC institutions.
 * Run: node scripts/backfill-history.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from .env.local (same pattern as sync-fdic.mjs)
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FDIC_API = 'https://banks.data.fdic.gov/api';

function formatDate(repdte) {
  if (!repdte || repdte.length !== 8) return repdte;
  return `${repdte.slice(0, 4)}-${repdte.slice(4, 6)}-${repdte.slice(6, 8)}`;
}

function thousands(v) { return v != null ? Number(v) * 1000 : null; }
function num(v) { return v != null ? Number(v) : null; }

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log('=== FDIC Historical Data Backfill ===');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  // Step 1: Fetch all active cert_numbers from our institutions table
  console.log('Step 1: Loading active cert_numbers from Supabase institutions table...');
  const activeCerts = new Set();
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('institutions')
      .select('cert_number')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw new Error(`Failed to load institutions: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) activeCerts.add(Number(row.cert_number));
    console.log(`  Loaded ${activeCerts.size} cert numbers so far...`);

    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Total active institutions in Supabase: ${activeCerts.size}\n`);

  // Step 2: Fetch the 8 most recent distinct REPDTE values from FDIC.
  // The FDIC financials endpoint returns ~4400 records per quarter, sorted
  // lexicographically by REPDTE DESC. We jump ahead in multiples of 4500 to
  // sample one record from each successive period.
  console.log('Step 2: Fetching top 8 reporting dates from FDIC...');

  const reportingDates = [];
  const seenDates = new Set();
  const PERIOD_SIZE = 4500; // slightly larger than max institutions per period

  for (let attempt = 0; reportingDates.length < 8 && attempt < 20; attempt++) {
    const offset = attempt * PERIOD_SIZE;
    const url = `${FDIC_API}/financials?fields=REPDTE&sort_by=REPDTE&sort_order=DESC&limit=1&offset=${offset}`;
    const data = await fetchJson(url);
    const dt = data.data?.[0]?.data?.REPDTE;
    if (!dt) break; // no more data
    if (!seenDates.has(dt)) {
      seenDates.add(dt);
      reportingDates.push(dt);
      console.log(`  Found date #${reportingDates.length}: ${dt} (at offset ${offset})`);
    }
    await sleep(100);
  }

  if (reportingDates.length === 0) throw new Error('Could not determine any FDIC reporting dates');

  console.log(`\nReporting dates to backfill (${reportingDates.length}):`);
  for (const dt of reportingDates) {
    console.log(`  ${dt} → ${formatDate(dt)}`);
  }
  console.log();

  // Step 3: For each reporting date, fetch all financials and upsert
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let di = 0; di < reportingDates.length; di++) {
    const repdte = reportingDates[di];
    const periodFormatted = formatDate(repdte);
    console.log(`\n--- Period ${di + 1}/${reportingDates.length}: ${repdte} (${periodFormatted}) ---`);

    // Paginate through all records for this date
    let offset = 0;
    const limit = 10000;
    let allRecords = [];

    while (true) {
      const url = `${FDIC_API}/financials?filters=REPDTE:${repdte}&fields=CERT,REPDTE,ASSET,DEP,NETLOANS,EQ,NETINC,ROA,ROE,LNCRCD&limit=${limit}&offset=${offset}`;
      console.log(`  Fetching offset=${offset}...`);

      const data = await fetchJson(url);
      if (!data.data || data.data.length === 0) break;

      allRecords = allRecords.concat(data.data);
      console.log(`  Got ${data.data.length} records (total: ${allRecords.length})`);

      if (data.data.length < limit) break;
      offset += limit;

      await sleep(100); // Be respectful to the FDIC API
    }

    console.log(`  Total FDIC records for ${repdte}: ${allRecords.length}`);

    // Filter to only institutions in our Supabase table
    const filteredRecords = allRecords.filter(row => {
      const cert = Number(row.data?.CERT);
      return activeCerts.has(cert);
    });

    const skipped = allRecords.length - filteredRecords.length;
    console.log(`  Matched to our institutions: ${filteredRecords.length} (skipped ${skipped} not in our DB)`);
    totalSkipped += skipped;

    if (filteredRecords.length === 0) {
      console.log(`  No records to insert for ${repdte}, skipping.`);
      continue;
    }

    // Map to financial_history schema
    const rows = filteredRecords.map(record => {
      const d = record.data;
      return {
        cert_number: Number(d.CERT),
        period: periodFormatted,
        total_assets: thousands(d.ASSET),
        total_deposits: thousands(d.DEP),
        total_loans: thousands(d.NETLOANS),
        net_income: thousands(d.NETINC),
        equity_capital: thousands(d.EQ),
        roa: num(d.ROA),
        roi: num(d.ROE),
        credit_card_loans: thousands(d.LNCRCD),
        raw_data: d,
      };
    });

    // Upsert in batches of 500
    const batchSize = 500;
    let periodInserted = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from('financial_history')
        .upsert(batch, { onConflict: 'cert_number,period' });

      if (error) {
        console.error(`  Batch error (offset ${i}):`, error.message);
        throw error;
      }

      periodInserted += batch.length;
      console.log(`  Upserted ${periodInserted}/${rows.length} records for ${periodFormatted}`);
    }

    totalInserted += periodInserted;
    console.log(`  Period ${periodFormatted} complete: ${periodInserted} rows inserted/updated`);

    // Small delay between periods to be polite
    if (di < reportingDates.length - 1) {
      await sleep(200);
    }
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Total rows inserted/updated: ${totalInserted}`);
  console.log(`Total records skipped (not in institutions table): ${totalSkipped}`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err);
  process.exit(1);
});
