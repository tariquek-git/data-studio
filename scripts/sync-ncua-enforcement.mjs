#!/usr/bin/env node
/**
 * sync-ncua-enforcement.mjs
 *
 * Fetches NCUA administrative orders (enforcement actions) from the official
 * CSV download and writes `signal.enforcement_action` facts into entity_facts
 * for matched credit unions.
 *
 * Data source: https://ncua.gov/sites/default/files/list_csv/administrative-orders.csv
 * ~1,200 records going back to 2016. Updated by NCUA as new orders are issued.
 *
 * Matching strategy:
 *   NCUA CSV has institution name + city + state but NO charter number.
 *   We match against institutions WHERE source='ncua' by normalized name + state.
 *   Fuzzy fallback: strip common suffixes ("Federal Credit Union", "FCU", etc.)
 *   and try again.
 *
 * We keep actions from the last 2 years (signal.enforcement_action has
 * freshness_days=730 in the registry). Older actions decay to zero anyway.
 *
 * Idempotent: deletes prior NCUA enforcement signal facts, then re-inserts.
 *
 * Run: node scripts/sync-ncua-enforcement.mjs [--dry-run]
 */

import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
  chunkArray,
  readTextSource,
  parseDelimited,
  rowsToObjects,
} from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_URL = 'https://ncua.gov/sites/default/files/list_csv/administrative-orders.csv';
const LOOKBACK_YEARS = 2;

/**
 * Normalize an institution name for matching.
 * Strips common CU suffixes, lowercases, removes punctuation.
 */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\bfederal credit union\b/g, '')
    .replace(/\bcredit union\b/g, '')
    .replace(/\bfcu\b/g, '')
    .replace(/\bcu\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);

  console.log('=== sync-ncua-enforcement.mjs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Step 1: Fetch CSV
  console.log(`Fetching: ${CSV_URL}`);
  const csvText = await readTextSource(CSV_URL);
  const rows = parseDelimited(csvText, ',');
  const records = rowsToObjects(rows);
  console.log(`Parsed ${records.length} enforcement records`);

  // Step 2: Filter to recent actions (last 2 years)
  const cutoffYear = new Date().getFullYear() - LOOKBACK_YEARS;
  const recentRecords = records.filter((r) => {
    const year = parseInt(r['Year'], 10);
    return year >= cutoffYear;
  });
  console.log(`${recentRecords.length} records within last ${LOOKBACK_YEARS} years (>= ${cutoffYear})`);

  // Step 3: Load ALL NCUA institutions for matching (paginate past 1000 limit)
  let ncuaInsts = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error: instErr } = await supabase
      .from('institutions')
      .select('id, name, city, state')
      .eq('source', 'ncua')
      .eq('active', true)
      .range(offset, offset + pageSize - 1);
    if (instErr) throw new Error(`fetch NCUA institutions: ${instErr.message}`);
    if (!data || data.length === 0) break;
    ncuaInsts = ncuaInsts.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  console.log(`Loaded ${ncuaInsts.length} NCUA institutions for matching`);

  // Build lookup indexes: (normalized_name + state) -> institution
  const byNameState = new Map();
  const byNormNameState = new Map();
  for (const inst of ncuaInsts) {
    const key1 = `${inst.name.toLowerCase().trim()}|${(inst.state || '').toLowerCase()}`;
    byNameState.set(key1, inst);

    const key2 = `${normalizeName(inst.name)}|${(inst.state || '').toLowerCase()}`;
    if (!byNormNameState.has(key2)) byNormNameState.set(key2, inst);
  }

  // Step 4: Match enforcement records to institutions
  const jobId = DRY_RUN ? null : await startSyncJob(supabase, 'sync-ncua-enforcement');
  const facts = [];
  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = [];

  // Relationship values that indicate the NCUA action is against an
  // individual (employee, board member, etc.) rather than the credit union
  // itself. These shouldn't penalize the CU's Brim score — the CU is just
  // named because the person worked there.
  const INDIVIDUAL_RELATIONSHIPS = new Set([
    'Former employee', 'Former Employee',
    'Former Institution-Affiliated Party', 'Former Institution-affiliated Party',
    'Supervisory Committee Chairman',
    'Former President and CEO',
    'Former Assistant Chief Executive Officer',
    'Former Office Manager',
    'Former Loan Officer',
    'Former Branch Manager',
  ]);

  for (const rec of recentRecords) {
    const instName = (rec['Institution'] || '').trim();
    const state = (rec['State'] || '').trim().toLowerCase();
    const docket = rec['Docket Number'] || '';
    const year = rec['Year'] || '';
    const url = rec['URL'] || '';
    const relationship = rec['Relationship'] || '';
    const firstName = rec['First Name'] || '';
    const lastName = rec['Last Name'] || '';

    // Skip individual-level actions (still audit-available via NCUA's CSV).
    if (INDIVIDUAL_RELATIONSHIPS.has(relationship)) {
      continue;
    }

    // Try exact name + state match first
    let inst = byNameState.get(`${instName.toLowerCase()}|${state}`);
    // Fallback: normalized name
    if (!inst) {
      inst = byNormNameState.get(`${normalizeName(instName)}|${state}`);
    }

    if (!inst) {
      unmatched++;
      if (unmatchedNames.length < 10) unmatchedNames.push(`${instName} (${state.toUpperCase()})`);
      continue;
    }

    matched++;
    const personName = [firstName, lastName].filter(Boolean).join(' ').trim();

    facts.push({
      entity_table: 'institutions',
      entity_id: inst.id,
      fact_type: 'signal.enforcement_action',
      fact_key: `ncua_${docket}`,
      fact_value_text: `NCUA Administrative Order`,
      fact_value_json: {
        docket,
        year: parseInt(year, 10),
        person_name: personName || null,
        relationship: relationship || null,
        institution_name: instName,
        regulator: 'NCUA',
      },
      source_kind: 'official',
      source_url: url || `https://ncua.gov/news/enforcement-actions/administrative-orders`,
      observed_at: `${year}-01-01T00:00:00Z`, // NCUA only gives year, not exact date
      confidence_score: 85,
      notes: `NCUA docket ${docket}${personName ? ` (${relationship}: ${personName})` : ''}`,
      sync_job_id: jobId,
    });
  }

  console.log(`\nMatched: ${matched}, Unmatched: ${unmatched}`);
  if (unmatchedNames.length > 0) {
    console.log(`Sample unmatched: ${unmatchedNames.join(', ')}`);
  }
  console.log(`${facts.length} facts to write`);

  // Deduplicate: one fact per (entity_id, docket)
  const seen = new Set();
  const dedupedFacts = facts.filter((f) => {
    const key = `${f.entity_id}|${f.fact_key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (dedupedFacts.length < facts.length) {
    console.log(`Deduped: ${facts.length} → ${dedupedFacts.length}`);
  }

  if (DRY_RUN) {
    console.log('(DRY RUN — no writes)');
    for (const f of dedupedFacts.slice(0, 10)) {
      console.log(`  ${f.fact_key} → ${f.notes}`);
    }
    return;
  }

  // Clear prior NCUA enforcement signal facts and re-insert
  const { error: delErr } = await supabase
    .from('entity_facts')
    .delete()
    .eq('fact_type', 'signal.enforcement_action')
    .like('fact_key', 'ncua_%');
  if (delErr) console.warn(`clear prior NCUA enforcement: ${delErr.message}`);

  let inserted = 0;
  const errors = [];
  for (const batch of chunkArray(dedupedFacts, 500)) {
    const { error } = await supabase.from('entity_facts').insert(batch);
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

  console.log(`Inserted ${inserted} NCUA enforcement signal facts`);
  if (errors.length > 0) console.log(`Errors: ${errors.slice(0, 3).join(' | ')}`);
}

main().catch((err) => {
  console.error('sync-ncua-enforcement failed:', err);
  process.exit(1);
});
