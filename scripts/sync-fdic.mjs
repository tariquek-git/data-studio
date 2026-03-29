#!/usr/bin/env node
/**
 * FDIC Data Sync Script
 * Fetches all FDIC-insured institutions and loads them into Supabase.
 * Run: node scripts/sync-fdic.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FDIC_API = 'https://banks.data.fdic.gov/api';
const FIELDS = [
  'CERT', 'REPDTE', 'INSTNAME', 'CITY', 'STALP', 'ZIP', 'COUNTY',
  'ASSET', 'DEP', 'NETLOANS', 'EQ', 'NETINC', 'ROA', 'ROE',
  'OFFDOM', 'NAMEHCR', 'HCTMULT', 'BKCLASS', 'WEBADDR', 'ESTYMD',
  'REGAGENT', 'LATITUDE', 'LONGITUDE', 'NUMEMP', 'LNCRCD',
  'STNAME', 'ACTIVE',
  'INTINC', 'NONII', 'EINTEXP', 'ELNATR', 'ELNANTR',
  'SC', 'LNRE', 'LNCI', 'LNCON', 'LNAG', 'NCLNLS',
].join(',');

function mapCharterType(bkclass) {
  switch (bkclass) {
    case 'N': case 'SM': case 'NM': return 'commercial';
    case 'SB': return 'savings';
    case 'SA': return 'savings_association';
    case 'OI': return 'other';
    default: return 'other';
  }
}

function formatDate(repdte) {
  if (!repdte || repdte.length !== 8) return repdte;
  return `${repdte.slice(0, 4)}-${repdte.slice(4, 6)}-${repdte.slice(6, 8)}`;
}

function num(v) { return v != null ? Number(v) : null; }
function thousands(v) { return v != null ? Number(v) * 1000 : null; }

async function main() {
  console.log('Starting FDIC sync...');

  // Create sync job
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'fdic', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  console.log('Sync job created:', job?.id);

  try {
    // Get latest reporting date
    console.log('Fetching latest reporting date...');
    const latestRes = await fetch(`${FDIC_API}/financials?fields=REPDTE&sort_by=REPDTE&sort_order=DESC&limit=1`);
    const latestData = await latestRes.json();
    const latestDate = latestData.data?.[0]?.data?.REPDTE;
    console.log('Latest reporting date:', latestDate);

    if (!latestDate) throw new Error('Could not determine latest reporting date');

    // Fetch all institutions
    let offset = 0;
    const limit = 10000;
    let allRecords = [];

    while (true) {
      const url = `${FDIC_API}/financials?filters=REPDTE:${latestDate}&fields=${FIELDS}&limit=${limit}&offset=${offset}`;
      console.log(`Fetching offset=${offset}...`);
      const res = await fetch(url);
      const data = await res.json();

      if (!data.data || data.data.length === 0) break;
      allRecords = allRecords.concat(data.data);
      console.log(`  Got ${data.data.length} records (total: ${allRecords.length})`);

      if (data.data.length < limit) break;
      offset += limit;
    }

    console.log(`Total records fetched: ${allRecords.length}`);

    // Map to our schema
    const institutions = allRecords.map((record) => {
      const d = record.data;
      return {
        cert_number: Number(d.CERT),
        source: 'fdic',
        name: d.INSTNAME || '',
        city: d.CITY || null,
        state: d.STALP || null,
        zip: d.ZIP || null,
        county: d.COUNTY || null,
        latitude: num(d.LATITUDE),
        longitude: num(d.LONGITUDE),
        website: d.WEBADDR || null,
        established_date: d.ESTYMD || null,
        regulator: d.REGAGENT || null,
        holding_company: d.NAMEHCR || null,
        holding_company_id: d.HCTMULT || null,
        total_assets: thousands(d.ASSET),
        total_deposits: thousands(d.DEP),
        total_loans: thousands(d.NETLOANS),
        num_branches: num(d.OFFDOM),
        num_employees: num(d.NUMEMP),
        roi: num(d.ROE),
        roa: num(d.ROA),
        equity_capital: thousands(d.EQ),
        net_income: thousands(d.NETINC),
        credit_card_loans: thousands(d.LNCRCD),
        credit_card_charge_offs: thousands(d.NCLNLS),
        charter_type: mapCharterType(d.BKCLASS),
        active: d.ACTIVE !== '0' && d.ACTIVE !== 0,
        data_as_of: formatDate(latestDate),
        last_synced_at: new Date().toISOString(),
        raw_data: d,
      };
    });

    // Upsert in batches
    let processed = 0;
    const batchSize = 500;
    for (let i = 0; i < institutions.length; i += batchSize) {
      const batch = institutions.slice(i, i + batchSize);
      const { error } = await supabase
        .from('institutions')
        .upsert(batch, { onConflict: 'cert_number' });

      if (error) {
        console.error(`Batch ${i}-${i + batchSize} error:`, error.message);
        throw error;
      }
      processed += batch.length;
      console.log(`  Upserted ${processed}/${institutions.length}`);
    }

    // Update sync job
    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        records_processed: processed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job?.id);

    console.log(`\nSync complete! ${processed} institutions loaded.`);
    console.log(`Reporting date: ${latestDate}`);

  } catch (error) {
    console.error('Sync failed:', error);
    if (job?.id) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
    process.exit(1);
  }
}

main();
