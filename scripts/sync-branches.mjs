#!/usr/bin/env node
/**
 * FDIC Branch Data Sync Script
 * Fetches all FDIC branch locations from the Summary of Deposits (SOD) API
 * and loads them into the Supabase `branches` table.
 * Run: node scripts/sync-branches.mjs
 */

import { loadEnvLocal, createSupabaseServiceClient } from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const FDIC_API = 'https://banks.data.fdic.gov/api';
const BRANCH_FIELDS = [
  'CERT', 'BRNUM', 'BRNAME', 'CITY', 'STALP', 'ZIPBR',
  'LATITUDE', 'LONGITUDE', 'DEPSUMBR', 'STNAME', 'COUNTY', 'REPDTE',
  'ESTYMD', 'ENDEFYMD',
].join(',');

function formatDate(repdte) {
  if (!repdte) return null;
  const s = String(repdte);
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return repdte;
}

function num(v) { return v != null && v !== '' ? Number(v) : null; }
function thousands(v) { return v != null && v !== '' ? Number(v) * 1000 : null; }

async function main() {
  console.log('Starting FDIC branch sync...');

  // Create sync job
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'fdic_branches', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  console.log('Sync job created:', job?.id);

  try {
    let offset = 0;
    const limit = 10000;
    let totalFetched = 0;
    let totalUpserted = 0;
    const batchSize = 500;

    while (true) {
      // Filter: active branches only — ESTYMD exists and ENDEFYMD is null/empty
      const url = `${FDIC_API}/branches?fields=${BRANCH_FIELDS}&limit=${limit}&offset=${offset}&filters=ENDEFYMD:[* TO *]&sort_by=CERT&sort_order=ASC`;

      // NOTE: FDIC uses Solr syntax. Active branches have no ENDEFYMD.
      // We fetch without the ENDEFYMD filter and skip closed branches in mapping.
      const activeUrl = `${FDIC_API}/branches?fields=${BRANCH_FIELDS}&limit=${limit}&offset=${offset}&sort_by=CERT&sort_order=ASC`;

      console.log(`Fetching branches offset=${offset}...`);
      const res = await fetch(activeUrl);

      if (!res.ok) {
        throw new Error(`FDIC API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.data || data.data.length === 0) {
        console.log('No more branch records.');
        break;
      }

      totalFetched += data.data.length;
      console.log(`  Fetched ${data.data.length} branches (total: ${totalFetched})`);

      // Map to branches table schema
      // Skip branches that have an end date (ENDEFYMD) — they are closed
      const branches = data.data
        .filter(record => {
          const d = record.data;
          // Active = no end effective year (ENDEFYMD is null/empty/0)
          return !d.ENDEFYMD || d.ENDEFYMD === '' || d.ENDEFYMD === '0';
        })
        .map(record => {
          const d = record.data;
          return {
            cert_number: Number(d.CERT),
            branch_number: d.BRNUM != null ? String(d.BRNUM) : null,
            branch_name: d.BRNAME || null,
            city: d.CITY || null,
            state: d.STALP || null,
            zip: d.ZIPBR ? String(d.ZIPBR) : null,
            county: d.COUNTY || null,
            latitude: num(d.LATITUDE),
            longitude: num(d.LONGITUDE),
            // DEPSUMBR is in thousands — convert to dollars
            total_deposits: thousands(d.DEPSUMBR),
            established_date: d.ESTYMD ? formatDate(String(d.ESTYMD)) : null,
            data_as_of: d.REPDTE ? formatDate(String(d.REPDTE)) : null,
          };
        });

      console.log(`  Active branches in batch: ${branches.length}`);

      // Upsert in sub-batches
      for (let i = 0; i < branches.length; i += batchSize) {
        const batch = branches.slice(i, i + batchSize);
        const { error } = await supabase
          .from('branches')
          .upsert(batch, { onConflict: 'cert_number,branch_number' });

        if (error) {
          console.error(`Batch upsert error at offset ${offset + i}:`, error.message);
          throw error;
        }
        totalUpserted += batch.length;
      }

      console.log(`  Upserted ${totalUpserted} total branches`);

      if (data.data.length < limit) {
        console.log('Reached end of branch records.');
        break;
      }

      offset += limit;
    }

    // Update sync job as completed
    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        records_processed: totalUpserted,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job?.id);

    console.log(`\nBranch sync complete! ${totalUpserted} branches loaded.`);

  } catch (error) {
    console.error('Branch sync failed:', error);
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
