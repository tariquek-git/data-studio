#!/usr/bin/env node
/**
 * FDIC Data Sync Script
 * Fetches all FDIC-insured institutions and loads them into Supabase.
 * Run: node scripts/sync-fdic.mjs
 */

import { loadEnvLocal, createSupabaseServiceClient } from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const FDIC_API = 'https://banks.data.fdic.gov/api';
const FIELDS = [
  'CERT', 'REPDTE', 'INSTNAME', 'CITY', 'STALP', 'ZIP', 'COUNTY',
  'ASSET', 'DEP', 'NETLOANS', 'EQ', 'NETINC', 'ROA', 'ROE',
  'OFFDOM', 'NAMEHCR', 'HCTMULT', 'BKCLASS', 'WEBADDR', 'ESTYMD',
  'REGAGENT', 'LATITUDE', 'LONGITUDE', 'NUMEMP', 'LNCRCD',
  'STNAME', 'ACTIVE',
  'INTINC', 'NONII', 'EINTEXP', 'ELNATR', 'ELNANTR',
  'ERNAST',                               // Earning assets — NIM denominator
  'NIMY',                                 // Pre-computed NIM (uses avg earning assets)
  'EEFFR',                                // Pre-computed Efficiency Ratio
  'NPAM', 'NPLNLS', 'OREO', 'LNLSRES',   // Texas Ratio components
  'RBCT1',                                // Tier 1 capital (dollar amount)
  'RBCT1CER',                             // Common equity tier 1 capital ratio (%)
  'RBCT1J',                               // Tier 1 risk-based capital ratio (%)
  'RBCRWAJ',                              // Total risk-based capital ratio (%)
  'RBCT2',                                // Tier 2 risk-based capital ratio (%)
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

    // Pass 1: Fetch all institution names from /institutions endpoint (NAME not in /financials)
    console.log('Fetching institution names...');
    const nameMap = {};
    let nameOffset = 0;
    const nameLimit = 10000;
    while (true) {
      const url = `${FDIC_API}/institutions?fields=CERT,NAME&limit=${nameLimit}&offset=${nameOffset}&active=1`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.data || data.data.length === 0) break;
      for (const row of data.data) {
        if (row.data?.CERT && row.data?.NAME) {
          nameMap[Number(row.data.CERT)] = row.data.NAME;
        }
      }
      console.log(`  Names fetched: ${Object.keys(nameMap).length}`);
      if (data.data.length < nameLimit) break;
      nameOffset += nameLimit;
    }
    console.log(`Total institution names fetched: ${Object.keys(nameMap).length}`);

    // Pass 2: Fetch all financial data for the latest reporting period
    let offset = 0;
    const limit = 10000;
    let allRecords = [];

    while (true) {
      const url = `${FDIC_API}/financials?filters=REPDTE:${latestDate}&fields=${FIELDS}&limit=${limit}&offset=${offset}`;
      console.log(`Fetching financials offset=${offset}...`);
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
      const cert = Number(d.CERT);
      return {
        cert_number: cert,
        source: 'fdic',
        name: nameMap[cert] || d.INSTNAME || '',
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
