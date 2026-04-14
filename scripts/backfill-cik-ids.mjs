#!/usr/bin/env node
/**
 * backfill-cik-ids.mjs
 *
 * Populate entity_external_ids with id_type='cik' rows for FDIC institutions
 * whose holding_company matches a name in SEC's company_tickers.json feed.
 *
 * This is the precursor for signal.exec_transition (SEC EDGAR 8-K Item 5.02),
 * which keys off CIK. Before this, we had zero CIK IDs linked.
 *
 * Matching strategy:
 *   1. Fetch SEC's public ticker/CIK map (no auth, updated daily).
 *   2. Normalize both sides (lowercase, strip common suffixes/punct).
 *   3. Exact normalized match wins. Multiple FDIC rows can share a CIK (a
 *      holding company typically owns many bank subsidiaries).
 *   4. Upsert one entity_external_ids row per matched institution.
 *
 * Idempotent — ON CONFLICT (entity_table, entity_id, id_type, id_value) DO NOTHING.
 *
 * Run: node scripts/backfill-cik-ids.mjs [--dry-run]
 */

import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
  chunkArray,
} from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const USER_AGENT = 'data-studio brim-bd-intelligence (tarique@brimfinancial.com)';

const SUFFIX_PATTERNS = [
  /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|nv|llc|lp|llp|group|holdings|holding|bancorp|bancorporation|banc|bancshares|financial|financials|financial corp|financial corporation|national association|n\.a\.|na|fsb|fa)\b/gi,
  /[.,&']/g,
  /\s+/g,
];

function normalizeName(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  for (const pat of SUFFIX_PATTERNS) s = s.replace(pat, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

async function fetchSecTickers() {
  const resp = await fetch(SEC_TICKERS_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`SEC tickers fetch failed: ${resp.status}`);
  const json = await resp.json();
  // The JSON is keyed by index string: { "0": { cik_str, ticker, title }, ... }
  return Object.values(json).map((r) => ({
    cik: String(r.cik_str).padStart(10, '0'),
    ticker: r.ticker,
    title: r.title,
    normalized: normalizeName(r.title),
  }));
}

async function fetchInstitutionsWithHolding(supabase) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, cert_number, name, holding_company')
      .not('holding_company', 'is', null)
      .neq('holding_company', '')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetch institutions failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);

  console.log('=== backfill-cik-ids.mjs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  console.log('Fetching SEC ticker → CIK map...');
  const secRecords = await fetchSecTickers();
  console.log(`  Loaded ${secRecords.length.toLocaleString()} SEC companies`);

  // Build lookup: normalized title → { cik, title }
  // When duplicates exist (rare), keep the first.
  const secByNormalized = new Map();
  for (const r of secRecords) {
    if (!r.normalized) continue;
    if (!secByNormalized.has(r.normalized)) {
      secByNormalized.set(r.normalized, r);
    }
  }
  console.log(`  Unique normalized names: ${secByNormalized.size.toLocaleString()}`);
  console.log();

  console.log('Fetching institutions with holding_company...');
  const institutions = await fetchInstitutionsWithHolding(supabase);
  console.log(`  Loaded ${institutions.length.toLocaleString()} institutions`);
  console.log();

  console.log('Matching holding companies to SEC CIKs...');
  const matched = [];
  const sampleHits = new Map(); // cik → sample institution name

  for (const inst of institutions) {
    const normalized = normalizeName(inst.holding_company);
    if (!normalized) continue;
    const sec = secByNormalized.get(normalized);
    if (!sec) continue;
    matched.push({
      entity_table: 'institutions',
      entity_id: inst.id,
      id_type: 'cik',
      id_value: sec.cik,
      is_primary: false,
      source_url: SEC_TICKERS_URL,
      notes: `Matched holding_company="${inst.holding_company}" to SEC title="${sec.title}" (ticker ${sec.ticker})`,
    });
    if (!sampleHits.has(sec.cik)) {
      sampleHits.set(sec.cik, `${inst.name} (holding: ${inst.holding_company})`);
    }
  }

  console.log(`  Matched ${matched.length.toLocaleString()} institutions to ${sampleHits.size.toLocaleString()} unique CIKs`);
  console.log();
  console.log('Sample matches (first 10):');
  let i = 0;
  for (const [cik, sample] of sampleHits) {
    console.log(`  CIK ${cik}  ${sample}`);
    if (++i >= 10) break;
  }
  console.log();

  if (DRY_RUN) {
    console.log('(DRY RUN — no writes made)');
    return;
  }

  const jobId = await startSyncJob(supabase, 'backfill-cik-ids');
  let inserted = 0;
  const errors = [];

  for (const batch of chunkArray(matched, 500)) {
    const { error } = await supabase
      .from('entity_external_ids')
      .upsert(batch, { onConflict: 'entity_table,entity_id,id_type,id_value', ignoreDuplicates: true });
    if (error) {
      errors.push(error.message);
      continue;
    }
    inserted += batch.length;
  }

  await finishSyncJob(supabase, jobId, {
    status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
    records_processed: inserted,
    error: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
  });

  console.log(`Upserted ${inserted.toLocaleString()} CIK rows`);
  if (errors.length > 0) {
    console.log(`Errors (${errors.length}):`);
    for (const e of errors.slice(0, 3)) console.log(`  - ${e}`);
  }
}

main().catch((err) => {
  console.error('backfill-cik-ids failed:', err);
  process.exit(1);
});
