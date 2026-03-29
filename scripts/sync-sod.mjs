#!/usr/bin/env node
/**
 * FDIC Summary of Deposits (SOD) Branch Sync Script
 * Fetches all active branch/office locations from the FDIC /api/sod endpoint
 * (filtered to latest year) and loads them into the Supabase `branches` table.
 *
 * Run: node scripts/sync-sod.mjs
 *
 * FDIC /sod endpoint fields used:
 *   CERT                  - cert number (FK to institutions)
 *   NAMEBR                - branch name
 *   BRNUM                 - branch number (unique per cert)
 *   ADDRESBR              - street address
 *   CITYBR                - city
 *   STALPBR               - state abbreviation
 *   ZIPBR                 - zip code
 *   CNTYNAMB              - county name
 *   SIMS_LATITUDE         - latitude
 *   SIMS_LONGITUDE        - longitude
 *   DEPSUMBR              - branch deposits in thousands (multiply by 1000)
 *   SIMS_ESTABLISHED_DATE - established date
 *   BRSERTYP              - service type (11 = main/full-service brick & mortar, etc.)
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

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// The FDIC /sod endpoint has annual SOD snapshots; filter to the latest year.
// The /locations endpoint has current branches but lacks deposit data.
const FDIC_SOD_URL = 'https://api.fdic.gov/banks/sod';
const SOD_YEAR_OVERRIDE = process.env.FDIC_SOD_YEAR ? Number(process.env.FDIC_SOD_YEAR) : null;
const SOD_FIELDS = [
  'CERT', 'NAMEBR', 'BRNUM', 'ADDRESBR', 'CITYBR', 'STALPBR', 'ZIPBR',
  'CNTYNAMB', 'SIMS_LATITUDE', 'SIMS_LONGITUDE', 'DEPSUMBR',
  'SIMS_ESTABLISHED_DATE', 'BRSERTYP',
].join(',');

const PAGE_LIMIT = 10000;   // max records per FDIC API page
const BATCH_SIZE = 500;     // upsert batch size into Supabase
const PAGE_DELAY_MS = 100;  // delay between API pages
const LOG_EVERY = 10000;    // log a progress line every N records fetched

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function num(v) { return v != null && v !== '' ? Number(v) : null; }
function thousands(v) { return v != null && v !== '' ? Number(v) * 1000 : null; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function resolveSodYear() {
  if (SOD_YEAR_OVERRIDE != null && Number.isFinite(SOD_YEAR_OVERRIDE)) {
    return SOD_YEAR_OVERRIDE;
  }

  const url =
    `${FDIC_SOD_URL}` +
    '?fields=YEAR' +
    '&limit=1' +
    '&sort_by=YEAR' +
    '&sort_order=DESC';

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not determine latest SOD year (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const year = Number(json.data?.[0]?.data?.YEAR);
  if (!Number.isFinite(year)) {
    throw new Error('Could not determine latest SOD year from FDIC response');
  }

  return year;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== FDIC SOD Branch Sync ===');
  console.log(`Started at: ${new Date().toISOString()}`);

  // Create sync job record
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'fdic_sod', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();
  console.log('Sync job created:', job?.id);

  try {
    // -----------------------------------------------------------------------
    // Step 1: Load all cert_numbers from our institutions table into a Set
    // -----------------------------------------------------------------------
    console.log('\nStep 1: Loading cert numbers from institutions table...');
    const certSet = new Set();
    let certOffset = 0;
    const certPageSize = 1000; // Supabase hard max per page

    while (true) {
      const { data: rows, error } = await supabase
        .from('institutions')
        .select('cert_number')
        .range(certOffset, certOffset + certPageSize - 1);

      if (error) throw new Error(`Failed to load institutions: ${error.message}`);
      if (!rows || rows.length === 0) break;

      for (const row of rows) certSet.add(row.cert_number);
      if (rows.length < certPageSize) break;
      certOffset += certPageSize;
    }

    console.log(`  Loaded ${certSet.size.toLocaleString()} cert numbers from institutions.`);
    if (certSet.size === 0) {
      throw new Error('No institutions found in DB. Run sync-fdic.mjs first.');
    }

    const sodYear = await resolveSodYear();
    console.log(`\nResolved SOD year: ${sodYear}${SOD_YEAR_OVERRIDE != null ? ' (env override)' : ''}`);

    // -----------------------------------------------------------------------
    // Step 2: Paginate through FDIC SOD (~76,000 records for latest year)
    // -----------------------------------------------------------------------
    console.log(`\nStep 2: Fetching FDIC SOD branches for year ${sodYear} (paginated)...`);
    let offset = 0;
    let totalFetched = 0;
    let totalMatched = 0;
    let totalUpserted = 0;
    let pendingBatch = [];
    let page = 0;

    while (true) {
      page++;
      const url =
        `${FDIC_SOD_URL}` +
        `?fields=${SOD_FIELDS}` +
        `&filters=YEAR:${sodYear}` +
        `&limit=${PAGE_LIMIT}` +
        `&offset=${offset}` +
        `&sort_by=CERT` +
        `&sort_order=ASC`;

      let res;
      try {
        res = await fetch(url);
      } catch (err) {
        throw new Error(`Network error fetching page ${page}: ${err.message}`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`FDIC API error (HTTP ${res.status}) on page ${page}: ${text.slice(0, 200)}`);
      }

      const json = await res.json();
      const records = json.data;

      if (!records || records.length === 0) {
        console.log(`  Page ${page}: no more records. Stopping pagination.`);
        break;
      }

      totalFetched += records.length;

      // Filter and map records
      for (const record of records) {
        const d = record.data;
        const cert = Number(d.CERT);

        // Only keep branches for institutions we track
        if (!certSet.has(cert)) continue;

        totalMatched++;
        pendingBatch.push({
          cert_number: cert,
          branch_name: d.NAMEBR || null,
          branch_number: d.BRNUM != null ? String(d.BRNUM) : null,
          address: d.ADDRESBR || null,
          city: d.CITYBR || null,
          state: d.STALPBR || null,
          zip: d.ZIPBR || null,
          latitude: num(d.SIMS_LATITUDE),
          longitude: num(d.SIMS_LONGITUDE),
          total_deposits: thousands(d.DEPSUMBR),
          // BRNUM=0 is the main/head office in SOD convention
          main_office: d.BRNUM === 0 || d.BRNUM === '0',
          established_date: d.SIMS_ESTABLISHED_DATE || null,
          data_as_of: `${sodYear}-06-30`,
          created_at: new Date().toISOString(),
        });

        // Flush batch when full
        if (pendingBatch.length >= BATCH_SIZE) {
          const { error } = await supabase
            .from('branches')
            .upsert(pendingBatch, { onConflict: 'cert_number,branch_number' });

          if (error) {
            console.error(`Insert error at offset ${offset}:`, error.message);
            throw error;
          }

          totalUpserted += pendingBatch.length;
          pendingBatch = [];
        }
      }

      // Progress log every LOG_EVERY fetched records
      if (totalFetched % LOG_EVERY < PAGE_LIMIT || records.length < PAGE_LIMIT) {
        console.log(
          `  Page ${page} | Fetched: ${totalFetched.toLocaleString()} | ` +
          `Matched: ${totalMatched.toLocaleString()} | ` +
          `Upserted: ${totalUpserted.toLocaleString()}`
        );
      }

      // Stop if we got a partial page (last page)
      if (records.length < PAGE_LIMIT) {
        console.log(`  Received ${records.length} records (< ${PAGE_LIMIT}), reached end.`);
        break;
      }

      offset += PAGE_LIMIT;

      // Polite delay
      await sleep(PAGE_DELAY_MS);
    }

    // -----------------------------------------------------------------------
    // Step 3: Flush any remaining records
    // -----------------------------------------------------------------------
    if (pendingBatch.length > 0) {
      const { error } = await supabase
        .from('branches')
        .upsert(pendingBatch, { onConflict: 'cert_number,branch_number' });

      if (error) {
        console.error('Final batch insert error:', error.message);
        throw error;
      }

      totalUpserted += pendingBatch.length;
      pendingBatch = [];
    }

    // -----------------------------------------------------------------------
    // Done
    // -----------------------------------------------------------------------
    console.log('\n=== Sync Complete ===');
    console.log(`  Total FDIC offices fetched : ${totalFetched.toLocaleString()}`);
    console.log(`  Matched to our institutions: ${totalMatched.toLocaleString()}`);
    console.log(`  Rows upserted into branches: ${totalUpserted.toLocaleString()}`);
    console.log(`  Finished at: ${new Date().toISOString()}`);

    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        records_processed: totalUpserted,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job?.id);

  } catch (err) {
    console.error('\nSync FAILED:', err.message);
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
