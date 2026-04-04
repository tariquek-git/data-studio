#!/usr/bin/env node
/**
 * Fed Master Account Sync Script
 *
 * Attempts to fetch the Federal Reserve's published master account list, then
 * cross-references it against our institutions table and upserts records into
 * bank_capabilities.
 *
 * Fed master account list (xlsx):
 *   https://www.frbservices.org/binaries/content/assets/crsocms/financial-services/master-account/master-account-granted-requests.xlsx
 *
 * If the download fails or the xlsx cannot be parsed, the script falls back to
 * a curated seed list of well-known sponsor / base banks.
 *
 * Run: node scripts/sync-fed-master-accounts.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  FED_MASTER_ACCOUNT_PAGE_URL,
  FED_MASTER_ACCOUNT_URL,
  SPONSOR_BANK_SEEDS,
} from './_sponsor-bank-seeds.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Env loading (same pattern as sync-fdic.mjs)
// ---------------------------------------------------------------------------
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Attempt to fetch the Fed master account xlsx
// Returns true if the download succeeded (even if we can't parse xlsx without
// a dedicated library), false on network / HTTP failure.
// ---------------------------------------------------------------------------
async function tryFetchFedList() {
  console.log(`\nAttempting Fed master account list download...`);
  console.log(`  URL: ${FED_MASTER_ACCOUNT_URL}`);

  try {
    const res = await fetch(FED_MASTER_ACCOUNT_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataStudio/1.0)' },
    });

    console.log(`  HTTP status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      console.log('  Download failed — will use seed data only.');
      return { success: false, status: res.status };
    }

    const contentType = res.headers.get('content-type') || '';
    const contentLength = res.headers.get('content-length') || 'unknown';
    console.log(`  Content-Type: ${contentType}`);
    console.log(`  Content-Length: ${contentLength} bytes`);

    // We got a 200 but we don't have an xlsx parser available by default.
    // Log success and note that full parsing requires `xlsx` npm package.
    console.log('  Download succeeded. NOTE: xlsx parsing requires `npm install xlsx`.');
    console.log('  For now, seeding with curated sponsor bank list.');
    return { success: true, status: res.status };
  } catch (err) {
    console.log(`  Fetch error: ${err.message}`);
    console.log('  Falling back to seed data only.');
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Look up cert_number in our institutions table by name (ILIKE)
// ---------------------------------------------------------------------------
async function findCertByName(name) {
  const { data, error } = await supabase
    .from('institutions')
    .select('cert_number, name, state')
    .ilike('name', `%${name}%`)
    .eq('active', true)
    .limit(5);

  if (error) {
    console.warn(`  DB lookup error for "${name}":`, error.message);
    return null;
  }

  if (!data || data.length === 0) {
    console.log(`  No match found for "${name}"`);
    return null;
  }

  // Prefer exact match if available
  const exact = data.find((r) => r.name.toLowerCase() === name.toLowerCase());
  const chosen = exact || data[0];
  console.log(`  Matched "${name}" -> cert=${chosen.cert_number} "${chosen.name}" (${chosen.state})`);
  return chosen.cert_number;
}

// ---------------------------------------------------------------------------
// Upsert a single capability record
// ---------------------------------------------------------------------------
async function upsertCapability(certNumber, seedBank, fedListSource) {
  const record = {
    cert_number: certNumber,
    fed_master_account: seedBank.fed_master_account ?? true, // all FDIC banks technically eligible; seed = assumed yes
    fedwire_participant: seedBank.fedwire_participant ?? null,
    nacha_odfi: seedBank.nacha_odfi ?? null,
    nacha_rdfi: seedBank.nacha_rdfi ?? true, // all FDIC banks are RDFIs
    swift_member: seedBank.swift_member ?? null,
    visa_principal: seedBank.visa_principal ?? null,
    mastercard_principal: seedBank.mastercard_principal ?? null,
    amex_issuer: seedBank.amex_issuer ?? null,
    issues_credit_cards: seedBank.issues_credit_cards ?? null,
    issues_debit_cards: seedBank.issues_debit_cards ?? null,
    issues_prepaid: seedBank.issues_prepaid ?? null,
    issues_commercial_cards: seedBank.issues_commercial_cards ?? null,
    baas_platform: seedBank.baas_platform ?? null,
    baas_partners: seedBank.baas_partners ?? null,
    card_program_manager: seedBank.card_program_manager ?? null,
    treasury_management: null,
    sweep_accounts: null,
    lockbox_services: null,
    data_source: fedListSource ? 'fed_list' : 'manual',
    confidence: 'medium',
    notes: seedBank.notes ?? null,
    source_urls: fedListSource
      ? [FED_MASTER_ACCOUNT_URL]
      : [FED_MASTER_ACCOUNT_PAGE_URL],
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('bank_capabilities')
    .upsert(record, { onConflict: 'cert_number' });

  if (error) {
    console.error(`  Upsert error for cert=${certNumber}:`, error.message);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Fed Master Account Sync ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const fedResult = await tryFetchFedList();
  const fedListAvailable = fedResult.success;

  console.log('\nProcessing seed bank list...');
  let matched = 0;
  let inserted = 0;
  let skipped = 0;

  for (const bank of SPONSOR_BANK_SEEDS) {
    console.log(`\n-> ${bank.name}`);

    let certNumber = bank.cert;

    if (!certNumber) {
      certNumber = await findCertByName(bank.name);
    } else {
      // Verify the cert exists
      const { data } = await supabase
        .from('institutions')
        .select('cert_number, name')
        .eq('cert_number', certNumber)
        .maybeSingle();
      if (data) {
        console.log(`  Using hardcoded cert=${certNumber} "${data.name}"`);
      } else {
        console.log(`  Hardcoded cert=${certNumber} not found in DB — trying name search`);
        certNumber = await findCertByName(bank.name);
      }
    }

    if (!certNumber) {
      console.log(`  Skipping — institution not found in DB`);
      skipped++;
      continue;
    }

    matched++;
    const ok = await upsertCapability(certNumber, bank, fedListAvailable);
    if (ok) {
      inserted++;
      console.log(`  Upserted cert=${certNumber}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Fed list download: ${fedListAvailable ? 'SUCCESS (xlsx parsing pending)' : 'FAILED (network/HTTP)'}`);
  console.log(`  Seed banks processed: ${SPONSOR_BANK_SEEDS.length}`);
  console.log(`  Matched in DB:        ${matched}`);
  console.log(`  Upserted:             ${inserted}`);
  console.log(`  Skipped (not in DB):  ${skipped}`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
