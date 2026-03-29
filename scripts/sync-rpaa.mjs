#!/usr/bin/env node
/**
 * RPAA PSP Registry Sync Script
 *
 * Fetches all registered Payment Service Providers from the Bank of Canada
 * RPAA (Retail Payments Activities Act) registry and loads them into the
 * institutions table with source='rpaa'.
 *
 * Data source: https://www.bankofcanada.ca/rps-api/cif2/accounts/list
 * Registry UI:  https://www.bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/
 *
 * cert_number range: 3,000,000 + sequential index (avoids FDIC/NCUA/OSFI conflicts)
 *
 * Run: node scripts/sync-rpaa.mjs
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

const REGISTRY_API = 'https://www.bankofcanada.ca/rps-api/cif2/accounts/list';

// RPAA cert_number base — offset to avoid collisions with FDIC (1-10k),
// NCUA (10k-99k), and OSFI (1M-2M) ranges.
const CERT_BASE = 3_000_000;

/**
 * Map verbose country names from the BoC registry to short ISO-ish codes
 * used in the state column (consistent with how OSFI uses province codes
 * and FDIC uses STALP state abbreviations).
 */
function countryToCode(country) {
  const map = {
    'Canada':                                                           'CA',
    'United States of America (the)':                                   'US',
    'United Kingdom of Great Britain and Northern Ireland (the)':       'GB',
    'Australia':                                                        'AU',
    'Belgium':                                                          'BE',
    'Brazil':                                                           'BR',
    'Cayman Islands (the)':                                             'KY',
    'Cyprus':                                                           'CY',
    'Czechia':                                                          'CZ',
    'Estonia':                                                          'EE',
    'India':                                                            'IN',
    'Ireland':                                                          'IE',
    'Isle of Man':                                                      'IM',
    'Japan':                                                            'JP',
    'Korea (the Republic of)':                                          'KR',
    'Latvia':                                                           'LV',
    'Lithuania':                                                        'LT',
    'Luxembourg':                                                       'LU',
    'Malaysia':                                                         'MY',
    'Nigeria':                                                          'NG',
    'Philippines (the)':                                                'PH',
    'Poland':                                                           'PL',
    'Singapore':                                                        'SG',
    'Switzerland':                                                      'CH',
    'United Arab Emirates (the)':                                       'AE',
  };
  return map[country] ?? country?.slice(0, 2).toUpperCase() ?? null;
}

/**
 * Pick the best display name from the three name fields.
 * Priority: en_legal_name > main_trade_name > fr_legal_name
 * For French-only entities (no en_legal_name), use fr_legal_name.
 */
function resolveName(record) {
  const en = record.en_legal_name?.trim();
  const fr = record.fr_legal_name?.trim();
  const trade = record.main_trade_name?.trim();

  if (en && en.toLowerCase() !== 'n/a') return en;
  if (fr && fr.toLowerCase() !== 'n/a') return fr;
  return trade || 'Unknown PSP';
}

/**
 * Build a legal_name string that captures trade name context when the
 * legal name is a numbered company (e.g. "1000515124 Ontario Inc. (Cashzen Inc)").
 */
function resolveLegalName(record) {
  const en = record.en_legal_name?.trim();
  const fr = record.fr_legal_name?.trim();
  const trade = record.main_trade_name?.trim();

  const legal = (en && en.toLowerCase() !== 'n/a') ? en
    : (fr && fr.toLowerCase() !== 'n/a') ? fr
    : null;

  if (!legal) return trade || null;

  // Annotate numbered companies with their trade name for readability
  if (trade && /^\d/.test(legal)) return `${legal} (${trade})`;
  return legal;
}

async function main() {
  console.log('Starting RPAA PSP registry sync...');
  console.log(`API: ${REGISTRY_API}`);

  // Create sync job record
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'rpaa', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  console.log('Sync job created:', job?.id);

  try {
    // -------------------------------------------------------------------------
    // Fetch registry data
    // -------------------------------------------------------------------------
    console.log('\nFetching registry from Bank of Canada...');
    const res = await fetch(REGISTRY_API, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Fintech-Commons-Data-Studio/1.0 (data.fintechcommons.com)',
      },
    });

    if (!res.ok) {
      throw new Error(`Registry API returned HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    const accounts = payload?.accounts;

    if (!accounts) {
      throw new Error('Unexpected API response shape — missing "accounts" key');
    }

    const registered  = accounts.registered  ?? [];
    const inReview    = accounts.in_review    ?? [];
    const refused     = accounts.refused      ?? [];
    const revoked     = accounts.revoked      ?? [];

    console.log(`Registry counts:`);
    console.log(`  registered:  ${registered.length}`);
    console.log(`  in_review:   ${inReview.length}`);
    console.log(`  refused:     ${refused.length}`);
    console.log(`  revoked:     ${revoked.length}`);

    // -------------------------------------------------------------------------
    // We only load actively registered PSPs into the institutions table.
    // in_review / refused / revoked are stored in raw_data for reference but
    // not surfaced as active institutions.
    // -------------------------------------------------------------------------
    const allRecords = [
      ...registered.map(r => ({ ...r, _active: true })),
      ...revoked.map(r => ({ ...r, _active: false })),
    ];

    console.log(`\nMapping ${allRecords.length} records to institutions schema...`);

    // Build a stable sort key so cert_number assignments are deterministic
    // across re-runs: sort by BoC record id (UUID, lexicographic).
    allRecords.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));

    // Also build a lookup of all known IDs so we can detect new PSPs on
    // future runs by checking if their id already exists.
    const institutions = allRecords.map((record, index) => {
      const name = resolveName(record);
      const legalName = resolveLegalName(record);
      const stateCode = countryToCode(record.head_office_country);

      return {
        cert_number:          CERT_BASE + index,
        source:               'rpaa',
        name,
        legal_name:           legalName,
        charter_type:         'other',       // PSPs are not deposit-taking institutions
        active:               record._active,
        state:                stateCode,
        regulator:            'BoC',
        established_date:     record.registration_date ?? null,
        data_as_of:           new Date().toISOString().slice(0, 10),
        last_synced_at:       new Date().toISOString(),
        raw_data: {
          boc_id:             record.id,
          en_legal_name:      record.en_legal_name || null,
          fr_legal_name:      record.fr_legal_name || null,
          main_trade_name:    record.main_trade_name || null,
          head_office_country: record.head_office_country,
          status:             record.status,
          has_violations:     record.has_violations,
          created_on:         record.created_on,
          registration_date:  record.registration_date,
          group_label:        record.group_label,
        },
      };
    });

    // -------------------------------------------------------------------------
    // Upsert in batches of 500
    // -------------------------------------------------------------------------
    let processed = 0;
    const batchSize = 500;

    console.log(`\nUpserting ${institutions.length} institutions...`);
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

    // -------------------------------------------------------------------------
    // Summary breakdown
    // -------------------------------------------------------------------------
    const byCountry = {};
    for (const inst of institutions) {
      byCountry[inst.state] = (byCountry[inst.state] ?? 0) + 1;
    }
    const topCountries = Object.entries(byCountry)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    console.log('\nTop countries by registered PSP count:');
    for (const [code, count] of topCountries) {
      console.log(`  ${code.padEnd(4)} ${count}`);
    }

    // -------------------------------------------------------------------------
    // Update sync job
    // -------------------------------------------------------------------------
    await supabase
      .from('sync_jobs')
      .update({
        status:            'completed',
        records_processed: processed,
        completed_at:      new Date().toISOString(),
      })
      .eq('id', job?.id);

    console.log(`\nSync complete! ${processed} PSPs loaded (${registered.length} active, ${revoked.length} revoked).`);
    console.log(`Note: ${inReview.length} in_review and ${refused.length} refused PSPs were NOT loaded (not yet registered).`);

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
