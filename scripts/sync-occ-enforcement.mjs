#!/usr/bin/env node
/**
 * sync-occ-enforcement.mjs
 *
 * Fetches OCC enforcement actions from the EASearch JSON API and writes
 * `signal.enforcement_action` facts into entity_facts for matched
 * national banks / federal savings associations.
 *
 * Data source: https://apps.occ.gov/EASearch/api/WebSearch/Actions
 * ~6,000 records going back to the early 2000s. Updated as new orders are issued.
 *
 * Matching strategy:
 *   OCC records include BankName + StateAbbreviation (+ CharterNumber, but
 *   OCC charter numbers don't map to FDIC cert numbers). We match against
 *   institutions WHERE source='fdic' by normalized name + state. Fuzzy
 *   fallback: strip common bank suffixes ("National Association", "N.A.",
 *   "National Bank", etc.) and retry.
 *
 * We keep actions from the last 2 years (signal.enforcement_action has
 * freshness_days=730 in the registry). Older actions decay to zero anyway.
 *
 * Idempotent: deletes prior OCC enforcement signal facts, then re-inserts.
 *
 * Run: node scripts/sync-occ-enforcement.mjs [--dry-run]
 */

import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
  chunkArray,
} from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const API_URL = 'https://apps.occ.gov/EASearch/api/WebSearch/Actions';
const LOOKBACK_YEARS = 2;

/**
 * Normalize an institution name for matching.
 * Strips common national-bank suffixes, lowercases, removes punctuation.
 */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\bnational association\b/g, '')
    .replace(/\bnational bank\b/g, '')
    .replace(/\bfederal savings bank\b/g, '')
    .replace(/\bsavings association\b/g, '')
    .replace(/\bsavings bank\b/g, '')
    .replace(/\btrust company\b/g, '')
    .replace(/\btrust co\b/g, '')
    .replace(/\bn\.?\s*a\.?\s*$/g, '')
    .replace(/,\s*$/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the PDF URL for an enforcement action document.
 * Pattern: https://www.occ.treas.gov/static/enforcement-actions/ea{DocumentNumber}.pdf
 */
function buildPdfUrl(documentNumber) {
  if (!documentNumber) return null;
  return `https://www.occ.treas.gov/static/enforcement-actions/ea${documentNumber}.pdf`;
}

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);

  console.log('=== sync-occ-enforcement.mjs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Step 1: Fetch all enforcement actions from OCC API
  console.log(`Fetching: ${API_URL}`);
  const response = await fetch(API_URL, {
    headers: { 'User-Agent': 'DataStudio/1.0', Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`OCC API request failed: HTTP ${response.status}`);
  }
  const allRecords = await response.json();
  console.log(`Fetched ${allRecords.length} total enforcement records`);

  // Step 2: Filter to recent actions (last 2 years) by CompleteDate
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - LOOKBACK_YEARS);
  const cutoffIso = cutoff.toISOString();

  const recentRecords = allRecords.filter((r) => {
    const d = r.CompleteDate;
    return d && d >= cutoffIso;
  });
  console.log(`${recentRecords.length} records within last ${LOOKBACK_YEARS} years`);

  // Step 3: Load FDIC-sourced institutions for matching (OCC regulates national banks)
  let fdicInsts = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error: instErr } = await supabase
      .from('institutions')
      .select('id, name, city, state')
      .eq('source', 'fdic')
      .eq('active', true)
      .range(offset, offset + pageSize - 1);
    if (instErr) throw new Error(`fetch FDIC institutions: ${instErr.message}`);
    if (!data || data.length === 0) break;
    fdicInsts = fdicInsts.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  console.log(`Loaded ${fdicInsts.length} FDIC institutions for matching`);

  // Build lookup indexes: (normalized_name + state) -> institution
  const byNameState = new Map();
  const byNormNameState = new Map();
  for (const inst of fdicInsts) {
    const key1 = `${inst.name.toLowerCase().trim()}|${(inst.state || '').toLowerCase()}`;
    byNameState.set(key1, inst);

    const key2 = `${normalizeName(inst.name)}|${(inst.state || '').toLowerCase()}`;
    if (!byNormNameState.has(key2)) byNormNameState.set(key2, inst);
  }

  // Step 4: Match enforcement records to institutions
  const jobId = DRY_RUN ? null : await startSyncJob(supabase, 'sync-occ-enforcement');
  const facts = [];
  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = [];

  for (const rec of recentRecords) {
    const bankName = (rec.BankName || '').trim();
    const state = (rec.StateAbbreviation || '').trim().toLowerCase();
    const docket = rec.DocketNumber || '';
    const docNumber = rec.DocumentNumber || '';
    const actionType = rec.EnforcementTypeCode || '';
    const actionDesc = rec.EnforcementTypeDescription || '';
    const city = rec.CityName || '';
    const completeDate = rec.CompleteDate || '';
    const hasPdf = rec.HasPdf;
    const amount = rec.Amount || 0;
    const firstName = rec.FirstName || '';
    const lastName = rec.LastName || '';
    const instOrIndividual = rec.EnforcementInstIAPType || '';
    const subjectMatters = rec.SubjectMatterAssociations || '';

    // Skip records without a bank name (company-only / non-bank entities)
    if (!bankName) {
      unmatched++;
      continue;
    }

    // Skip individual-level OCC actions (Section 1829 prohibition notifications,
    // personal removal orders). The bank is named in the record because the
    // individual worked there, but the action is about THEM, not the bank's
    // operations. These shouldn't penalize the bank's Brim score.
    // The record is still observable via OCC EASearch for audit purposes,
    // we just don't write it as signal.enforcement_action.
    if (instOrIndividual === 'Individual') {
      continue;
    }

    // Try exact name + state match first
    let inst = byNameState.get(`${bankName.toLowerCase()}|${state}`);
    // Fallback: normalized name
    if (!inst) {
      inst = byNormNameState.get(`${normalizeName(bankName)}|${state}`);
    }

    if (!inst) {
      unmatched++;
      if (unmatchedNames.length < 15) unmatchedNames.push(`${bankName} (${state.toUpperCase()})`);
      continue;
    }

    matched++;
    const personName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const factKey = `occ_${docket || docNumber}`;
    const isoDate = completeDate ? completeDate.replace(/T.*$/, '') : null;
    const pdfUrl = hasPdf ? buildPdfUrl(docNumber) : null;

    facts.push({
      entity_table: 'institutions',
      entity_id: inst.id,
      fact_type: 'signal.enforcement_action',
      fact_key: factKey,
      fact_value_text: `OCC ${actionDesc || actionType}`,
      fact_value_json: {
        docket: docket || null,
        document_number: docNumber || null,
        action_type: actionType,
        action_description: actionDesc,
        institution_name: bankName,
        city: city || null,
        state: state.toUpperCase() || null,
        regulator: 'OCC',
        complete_date: isoDate,
        amount: amount || null,
        person_name: personName || null,
        inst_or_individual: instOrIndividual,
        subject_matters: subjectMatters || null,
        pdf_url: pdfUrl,
      },
      source_kind: 'official',
      source_url: pdfUrl || 'https://apps.occ.gov/EASearch/',
      observed_at: isoDate ? `${isoDate}T00:00:00Z` : new Date().toISOString(),
      confidence_score: 85,
      notes: `OCC ${actionType} ${docket || docNumber}${personName ? ` (${personName})` : ''}`,
      sync_job_id: jobId,
    });
  }

  console.log(`\nMatched: ${matched}, Unmatched: ${unmatched}`);
  if (unmatchedNames.length > 0) {
    console.log(`Sample unmatched: ${unmatchedNames.join(', ')}`);
  }
  console.log(`${facts.length} facts to write`);

  // Deduplicate: one fact per (entity_id, fact_key)
  const seen = new Set();
  const dedupedFacts = facts.filter((f) => {
    const key = `${f.entity_id}|${f.fact_key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (dedupedFacts.length < facts.length) {
    console.log(`Deduped: ${facts.length} -> ${dedupedFacts.length}`);
  }

  if (DRY_RUN) {
    console.log('(DRY RUN - no writes)');
    for (const f of dedupedFacts.slice(0, 10)) {
      console.log(`  ${f.fact_key} -> ${f.notes}`);
    }
    return;
  }

  // Clear prior OCC enforcement signal facts and re-insert
  const { error: delErr } = await supabase
    .from('entity_facts')
    .delete()
    .eq('fact_type', 'signal.enforcement_action')
    .like('fact_key', 'occ_%');
  if (delErr) console.warn(`clear prior OCC enforcement: ${delErr.message}`);

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

  console.log(`Inserted ${inserted} OCC enforcement signal facts`);
  if (errors.length > 0) console.log(`Errors: ${errors.slice(0, 3).join(' | ')}`);
}

main().catch((err) => {
  console.error('sync-occ-enforcement failed:', err);
  process.exit(1);
});
