#!/usr/bin/env node
/**
 * CIRO Member Sync Script
 *
 * Seeds CIRO (Canadian Investment Regulatory Organization) member firms into
 * the institutions table.
 *
 * CIRO was formed in 2023 by the merger of IIROC (Investment Industry
 * Regulatory Organization of Canada) and MFDA (Mutual Fund Dealers
 * Association of Canada). It regulates investment dealers and mutual fund
 * dealers operating in Canada.
 *
 * Data source: CIRO member firm list (https://www.ciro.ca)
 * The CIRO website blocks automated fetches (403). This script seeds the
 * major known members. Add new entries to the CIRO_MEMBERS array below.
 *
 * cert_number range: 4,000,000 + sequential index
 *   (avoids FDIC 1-99k, OSFI 1M-2M, RPAA 3M ranges)
 *
 * Run: node scripts/sync-ciro.mjs
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

const CERT_BASE = 4_000_000;

// ---------------------------------------------------------------------------
// CIRO member firm data
// ---------------------------------------------------------------------------
// Fields: name, city, province (2-letter), charter_type, website
// charter_type: 'investment_dealer' | 'mutual_fund_dealer'
// ---------------------------------------------------------------------------
const CIRO_MEMBERS = [
  // Big Six bank-owned investment dealers
  { name: 'RBC Dominion Securities',           city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.rbcds.com' },
  { name: 'TD Waterhouse Canada',              city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.td.com/ca/en/investing' },
  { name: 'BMO Nesbitt Burns',                 city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.bmo.com/nesbittburns' },
  { name: 'Scotia Capital',                    city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.scotiacapital.com' },
  { name: 'CIBC World Markets',                city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.cibcwm.com' },
  { name: 'National Bank Financial',           city: 'Montreal',   province: 'QC', charter_type: 'investment_dealer',  website: 'https://nbf.ca' },

  // Insurance-affiliated mutual fund dealers
  { name: 'Manulife Securities',               city: 'Waterloo',   province: 'ON', charter_type: 'mutual_fund_dealer', website: 'https://www.manulifesecurities.ca' },
  { name: 'Sun Life Financial Investment Services', city: 'Toronto', province: 'ON', charter_type: 'mutual_fund_dealer', website: 'https://www.sunlife.ca' },
  { name: 'Canada Life Investment Management', city: 'Toronto',    province: 'ON', charter_type: 'mutual_fund_dealer', website: 'https://www.canadalife.com' },

  // Independent / bank-affiliated mutual fund dealers
  { name: 'IG Wealth Management',              city: 'Winnipeg',   province: 'MB', charter_type: 'mutual_fund_dealer', website: 'https://www.ig.ca' },
  { name: 'Fidelity Investments Canada',       city: 'Toronto',    province: 'ON', charter_type: 'mutual_fund_dealer', website: 'https://www.fidelity.ca' },

  // Mid-market independent investment dealers
  { name: 'Raymond James Ltd.',                city: 'Vancouver',  province: 'BC', charter_type: 'investment_dealer',  website: 'https://www.raymondjames.ca' },
  { name: 'Canaccord Genuity Corp.',           city: 'Vancouver',  province: 'BC', charter_type: 'investment_dealer',  website: 'https://www.canaccordgenuity.com' },
  { name: 'GMP Securities',                    city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.gmpsecurities.com' },
  { name: 'Haywood Securities',                city: 'Vancouver',  province: 'BC', charter_type: 'investment_dealer',  website: 'https://www.haywood.com' },
  { name: 'PI Financial Corp.',                city: 'Vancouver',  province: 'BC', charter_type: 'investment_dealer',  website: 'https://www.pifinancial.com' },
  { name: 'Leede Jones Gable',                 city: 'Vancouver',  province: 'BC', charter_type: 'investment_dealer',  website: 'https://www.leedejonesgable.com' },

  // Online / discount brokerages
  { name: 'Questrade',                         city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.questrade.com' },
  { name: 'Wealthsimple Investments',          city: 'Toronto',    province: 'ON', charter_type: 'investment_dealer',  website: 'https://www.wealthsimple.com' },
  { name: 'Interactive Brokers Canada',        city: 'Montreal',   province: 'QC', charter_type: 'investment_dealer',  website: 'https://www.interactivebrokers.ca' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Starting CIRO member sync...');
  console.log(`Seeding ${CIRO_MEMBERS.length} known CIRO member firms`);
  console.log('Note: CIRO website blocks automated fetches; using curated member list.');

  // Create sync job
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({ source: 'ciro', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  console.log('Sync job created:', job?.id);

  try {
    // -----------------------------------------------------------------------
    // Ensure the source CHECK constraint allows 'ciro'.
    // The original schema only lists: fdic, ncua, osfi, rpaa.
    // We drop and recreate the constraint to add 'ciro'.
    // This is idempotent — safe to run multiple times.
    // -----------------------------------------------------------------------
    console.log('\nApplying schema migration: adding ciro to source CHECK constraint...');
    const { error: migErr } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE institutions
          DROP CONSTRAINT IF EXISTS institutions_source_check;
        ALTER TABLE institutions
          ADD CONSTRAINT institutions_source_check
          CHECK (source IN ('fdic', 'ncua', 'osfi', 'rpaa', 'ciro'));
      `,
    }).maybeSingle();

    if (migErr) {
      // exec_sql RPC may not exist — that's okay, we'll attempt the upsert
      // and print a manual migration hint if the constraint blocks us.
      console.warn('  exec_sql RPC not available (this is normal):', migErr.message);
      console.warn('  Will attempt upsert directly. If it fails with a constraint error,');
      console.warn('  run this SQL in the Supabase dashboard SQL editor:');
      console.warn(`
    ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_source_check;
    ALTER TABLE institutions ADD CONSTRAINT institutions_source_check
      CHECK (source IN ('fdic','ncua','osfi','rpaa','ciro'));
`);
    } else {
      console.log('  Schema migration applied successfully.');
    }

    // -----------------------------------------------------------------------
    // Map members to institutions schema
    // -----------------------------------------------------------------------
    const today = new Date().toISOString().slice(0, 10);
    const nowTs  = new Date().toISOString();

    const institutions = CIRO_MEMBERS.map((member, index) => ({
      cert_number:      CERT_BASE + index,
      source:           'ciro',
      name:             member.name,
      city:             member.city,
      state:            member.province,
      charter_type:     member.charter_type,
      regulator:        'CIRO',
      active:           true,
      website:          member.website ?? null,
      data_as_of:       today,
      last_synced_at:   nowTs,
      raw_data: {
        province:     member.province,
        charter_type: member.charter_type,
        seed_version: '1.0',
      },
    }));

    // -----------------------------------------------------------------------
    // Upsert in batches of 500 (one batch for 20 records, but structured
    // for future scale as CIRO member list grows)
    // -----------------------------------------------------------------------
    let processed = 0;
    const batchSize = 500;

    console.log(`\nUpserting ${institutions.length} CIRO institutions...`);
    for (let i = 0; i < institutions.length; i += batchSize) {
      const batch = institutions.slice(i, i + batchSize);
      const { error } = await supabase
        .from('institutions')
        .upsert(batch, { onConflict: 'cert_number' });

      if (error) {
        if (error.message?.includes('institutions_source_check')) {
          console.error('\nConstraint error: the "source" CHECK constraint does not include "ciro".');
          console.error('Please run the following SQL in your Supabase SQL editor, then re-run this script:\n');
          console.error(`  ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_source_check;`);
          console.error(`  ALTER TABLE institutions ADD CONSTRAINT institutions_source_check`);
          console.error(`    CHECK (source IN ('fdic','ncua','osfi','rpaa','ciro'));\n`);
        }
        console.error(`Batch ${i}-${i + batchSize} error:`, error.message);
        throw error;
      }
      processed += batch.length;
      console.log(`  Upserted ${processed}/${institutions.length}`);
    }

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    const byType = {};
    for (const inst of institutions) {
      byType[inst.charter_type] = (byType[inst.charter_type] ?? 0) + 1;
    }
    console.log('\nBreakdown by charter type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type.padEnd(22)} ${count}`);
    }

    const byProvince = {};
    for (const inst of institutions) {
      byProvince[inst.state] = (byProvince[inst.state] ?? 0) + 1;
    }
    console.log('\nBreakdown by province:');
    for (const [prov, count] of Object.entries(byProvince).sort(([, a], [, b]) => b - a)) {
      console.log(`  ${prov.padEnd(4)} ${count}`);
    }

    // -----------------------------------------------------------------------
    // Update sync job
    // -----------------------------------------------------------------------
    await supabase
      .from('sync_jobs')
      .update({
        status:            'completed',
        records_processed: processed,
        completed_at:      new Date().toISOString(),
      })
      .eq('id', job?.id);

    console.log(`\nSync complete! ${processed} CIRO member firms loaded.`);
    console.log(`cert_number range: ${CERT_BASE} – ${CERT_BASE + processed - 1}`);

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
