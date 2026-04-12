#!/usr/bin/env node
/**
 * OSFI Data Sync Script
 * Fetches all federally-regulated Canadian financial institutions from the
 * OSFI "Who We Regulate" open dataset and loads them into Supabase.
 *
 * Data source: https://open.canada.ca/data/en/dataset/b27ec3ef-7338-4e76-a6fd-128339a92df5
 * CSV (EN):    https://open.canada.ca/data/dataset/b27ec3ef-.../download/who_we_regulate_fi_eng.csv
 *
 * cert_number range: 2,000,000 + sequential index (avoids conflicts with FDIC/NCUA)
 *
 * Run: node scripts/sync-osfi.mjs
 */

import { loadEnvLocal, createSupabaseServiceClient } from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

// ---------------------------------------------------------------------------
// OSFI open data — "Who We Regulate" (Financial Institutions, English CSV)
// The canonical dataset page redirects to this CSV on open.canada.ca.
// We follow the redirect chain programmatically.
// ---------------------------------------------------------------------------
const OSFI_DATASET_PAGE =
  'https://open.canada.ca/data/en/dataset/b27ec3ef-7338-4e76-a6fd-128339a92df5';

// Direct resource URL for the English financial-institutions CSV
const OSFI_CSV_RESOURCE_URL =
  'https://open.canada.ca/data/dataset/b27ec3ef-7338-4e76-a6fd-128339a92df5/resource/945045fa-2de0-47d4-aad2-144d69467824/download/who_we_regulate_fi_eng.csv';

// Fallback: CDIC member list (Schedule I banks only)
const CDIC_MEMBERS_URL = 'https://www.cdic.ca/depositors/list-of-members/';

// ---------------------------------------------------------------------------
// Province name → abbreviation map
// ---------------------------------------------------------------------------
const PROVINCE_ABBR = {
  'Alberta': 'AB',
  'British Columbia': 'BC',
  'Manitoba': 'MB',
  'New Brunswick': 'NB',
  'Newfoundland and Labrador': 'NL',
  'Northwest Territories': 'NT',
  'Nova Scotia': 'NS',
  'Nunavut': 'NU',
  'Ontario': 'ON',
  'Prince Edward Island': 'PE',
  'Quebec': 'QC',
  'Québec': 'QC',
  'Saskatchewan': 'SK',
  'Yukon': 'YT',
};

function normalizeProvince(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Already an abbreviation (2 letters)
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  return PROVINCE_ABBR[trimmed] || trimmed || null;
}

// ---------------------------------------------------------------------------
// Map OSFI FI Type / Group → our charter_type values
// ---------------------------------------------------------------------------
function mapCharterType(fiTypeName, fiGroupName, fiIndustryName) {
  const type = (fiTypeName || '').toLowerCase();
  const group = (fiGroupName || '').toLowerCase();
  const industry = (fiIndustryName || '').toLowerCase();

  if (group.includes('schedule i') || group.includes('domestic bank')) return 'commercial';
  if (group.includes('schedule ii') || group.includes('foreign bank subsidiary')) return 'commercial';
  if (group.includes('schedule iii') || group.includes('foreign bank branch')) return 'commercial';
  if (group.includes('trust')) return 'trust';
  if (group.includes('loan')) return 'savings';
  if (group.includes('credit union')) return 'credit_union';
  if (group.includes('retail association')) return 'commercial';
  if (industry.includes('insurance') || group.includes('insurance')) return 'other';
  if (group.includes('fraternal')) return 'other';
  if (type.includes('bank')) return 'commercial';
  if (type.includes('trust')) return 'trust';
  if (type.includes('loan')) return 'savings';
  return 'other';
}

// ---------------------------------------------------------------------------
// Minimal CSV parser — handles quoted fields with embedded commas/newlines
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const row = [];
    // Parse one row
    while (i < n) {
      if (text[i] === '"') {
        // Quoted field
        let field = '';
        i++; // skip opening quote
        while (i < n) {
          if (text[i] === '"' && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else if (text[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            field += text[i++];
          }
        }
        row.push(field);
        // Skip comma or newline
        if (text[i] === ',') i++;
        else break;
      } else {
        // Unquoted field — read until comma or newline
        let field = '';
        while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++];
        }
        row.push(field.trim());
        if (text[i] === ',') { i++; }
        else break;
      }
    }
    // Skip \r\n or \n
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;

    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Fetch with redirect-following (Node 18+ fetch follows redirects by default,
// but we add retry logic and logging)
// ---------------------------------------------------------------------------
async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'DataStudio/1.0 (github.com/brimfinancial/data-studio)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`  Attempt ${attempt} failed: ${err.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// ---------------------------------------------------------------------------
// Primary: fetch the OSFI "Who We Regulate" CSV
// ---------------------------------------------------------------------------
async function fetchOSFIInstitutions() {
  console.log('Fetching OSFI "Who We Regulate" CSV...');
  console.log(`  URL: ${OSFI_CSV_RESOURCE_URL}`);

  const res = await fetchWithRetry(OSFI_CSV_RESOURCE_URL);
  const text = await res.text();

  console.log(`  Downloaded ${text.length} bytes`);

  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV appears empty or unparseable');

  // First row = headers
  const headers = rows[0].map(h => h.trim());
  console.log(`  Columns: ${headers.join(' | ')}`);
  console.log(`  Data rows: ${rows.length - 1}`);

  // Map header names to indices (flexible — OSFI may rename columns)
  const col = {};
  headers.forEach((h, idx) => { col[h] = idx; });

  const institutionRows = rows.slice(1);

  return institutionRows
    .map((row, idx) => {
      const get = (name) => {
        const index = col[name];
        return index !== undefined ? (row[index] || '').trim() : '';
      };

      const companyName = get('Company Name');
      if (!companyName) return null; // skip blank rows

      const fiTypeName    = get('FI Type Name');
      const fiGroupName   = get('FI Group Name');
      const fiIndustryName = get('FI Industry Name');
      const city          = get('City') || null;
      const provinceRaw   = get('Province State');
      const postalCode    = get('Postal ZIP Code') || null;
      const address1      = get('Address Line 1') || null;
      const address2      = get('Address Line 2') || null;

      return {
        cert_number: 2_000_000 + idx,
        source: 'osfi',
        name: companyName,
        legal_name: companyName,
        city,
        state: normalizeProvince(provinceRaw),
        zip: postalCode,
        charter_type: mapCharterType(fiTypeName, fiGroupName, fiIndustryName),
        active: true,
        regulator: 'OSFI',
        last_synced_at: new Date().toISOString(),
        data_as_of: new Date().toISOString().slice(0, 10),
        raw_data: {
          fi_type: fiTypeName,
          fi_group: fiGroupName,
          fi_industry: fiIndustryName,
          address_line_1: address1,
          address_line_2: address2,
        },
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Fallback: scrape CDIC member list for Schedule I bank names
// ---------------------------------------------------------------------------
async function fetchCDICFallback() {
  console.log('Falling back to CDIC member list...');
  console.log(`  URL: ${CDIC_MEMBERS_URL}`);

  const res = await fetchWithRetry(CDIC_MEMBERS_URL);
  const html = await res.text();

  // Extract institution names from the HTML — CDIC uses a list/table format
  const nameMatches = html.matchAll(/<(?:td|li)[^>]*>\s*([A-Z][A-Za-zÀ-ÿ ,'.&()-]+(?:Bank|Trust|Credit|Caisse|Financial|Canada)[A-Za-zÀ-ÿ ,'.&()-]*)\s*<\/(?:td|li)>/g);

  const names = [...new Set([...nameMatches].map(m => m[1].trim()))].filter(n => n.length > 3);

  if (names.length === 0) {
    // Broader fallback regex
    const broader = html.matchAll(/class="[^"]*member[^"]*"[^>]*>\s*<[^>]+>\s*([^<]{5,80})\s*</gi);
    names.push(...[...new Set([...broader].map(m => m[1].trim()))]);
  }

  console.log(`  Found ${names.length} CDIC member names`);

  return names.map((name, idx) => ({
    cert_number: 2_000_000 + idx,
    source: 'osfi',
    name,
    legal_name: name,
    charter_type: 'commercial',
    active: true,
    regulator: 'OSFI',
    last_synced_at: new Date().toISOString(),
    data_as_of: new Date().toISOString().slice(0, 10),
    raw_data: { source_list: 'CDIC members', fi_group: 'Schedule I' },
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== OSFI Sync ===');
  console.log('Starting OSFI institution sync...');
  console.log(`Dataset: ${OSFI_DATASET_PAGE}`);

  // Create sync job record
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'osfi', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  console.log('Sync job created:', job?.id);

  try {
    // Fetch institutions — primary source then fallback
    let institutions = [];

    try {
      institutions = await fetchOSFIInstitutions();
      console.log(`\nFetched ${institutions.length} institutions from OSFI open data CSV`);
    } catch (primaryErr) {
      console.warn(`Primary OSFI CSV fetch failed: ${primaryErr.message}`);
      console.log('Attempting CDIC fallback...');
      institutions = await fetchCDICFallback();
      console.log(`Fetched ${institutions.length} institutions from CDIC fallback`);
    }

    if (institutions.length === 0) {
      throw new Error('No institutions fetched from any source');
    }

    // Log breakdown by charter type
    const byType = {};
    for (const inst of institutions) {
      byType[inst.charter_type] = (byType[inst.charter_type] || 0) + 1;
    }
    console.log('\nBreakdown by charter_type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type.padEnd(20)} ${count}`);
    }

    // Log breakdown by FI group (from raw_data)
    const byGroup = {};
    for (const inst of institutions) {
      const group = inst.raw_data?.fi_group || 'unknown';
      byGroup[group] = (byGroup[group] || 0) + 1;
    }
    console.log('\nBreakdown by FI group:');
    for (const [group, count] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${group.padEnd(50)} ${count}`);
    }

    // Upsert in batches of 500
    const batchSize = 500;
    let processed = 0;

    console.log(`\nUpserting ${institutions.length} institutions in batches of ${batchSize}...`);

    for (let i = 0; i < institutions.length; i += batchSize) {
      const batch = institutions.slice(i, i + batchSize);
      const { error } = await supabase
        .from('institutions')
        .upsert(batch, { onConflict: 'cert_number' });

      if (error) {
        console.error(`Batch ${i}–${i + batchSize} error:`, error.message);
        throw error;
      }
      processed += batch.length;
      console.log(`  Upserted ${processed}/${institutions.length}`);
    }

    // Complete sync job
    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        records_processed: processed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job?.id);

    console.log(`\n=== Sync complete! ${processed} OSFI institutions loaded. ===`);
    console.log(`cert_number range: 2,000,000 – ${2_000_000 + processed - 1}`);
    console.log('\nNote: The institutions table does not have a "country" field.');
    console.log('      Consider adding: ALTER TABLE institutions ADD COLUMN country TEXT DEFAULT NULL;');
    console.log('      Then set country = \'CA\' for source = \'osfi\'.');

  } catch (err) {
    console.error('\nSync failed:', err.message);
    if (job?.id) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
    process.exit(1);
  }
}

main();
