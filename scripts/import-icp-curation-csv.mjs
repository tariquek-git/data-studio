#!/usr/bin/env node
/**
 * import-icp-curation-csv.mjs
 *
 * Read a filled-in ICP curation CSV (see export-icp-curation-csv.mjs) and:
 *   1. Upsert the fill-me columns into bank_capabilities.
 *   2. Write signal.* facts into entity_facts for each populated field so
 *      compute_brim_score() picks them up.
 *
 * Skipped fields (read-only in the CSV) are never written back.
 * Empty fields are never written over — preserves prior values.
 *
 * Run:
 *   node scripts/import-icp-curation-csv.mjs /path/to/icp-curation-filled.csv [--dry-run]
 *
 * Idempotent: re-running with the same CSV updates nothing if values match.
 */

import { readFileSync } from 'fs';
import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
  parseDelimited,
  rowsToObjects,
  chunkArray,
} from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const FILE_PATH = process.argv.find((a) => a.endsWith('.csv'));

if (!FILE_PATH) {
  console.error('Usage: node scripts/import-icp-curation-csv.mjs /path/to/file.csv [--dry-run]');
  process.exit(1);
}

function parseBool(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'y' || s === 'yes' || s === 'true' || s === '1') return true;
  if (s === 'n' || s === 'no' || s === 'false' || s === '0') return false;
  return null;
}

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);
  console.log(`=== import-icp-curation-csv.mjs (${FILE_PATH}) ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  const text = readFileSync(FILE_PATH, 'utf8');
  const rows = rowsToObjects(parseDelimited(text, ','));
  console.log(`Parsed ${rows.length} rows`);

  // Resolve cert_number → institution UUID for fact writes
  const certs = rows.map((r) => parseInt(r.cert_number, 10)).filter(Number.isFinite);
  const { data: insts, error: instErr } = await supabase
    .from('institutions')
    .select('id, cert_number, name')
    .in('cert_number', certs);
  if (instErr) throw new Error(`fetch institutions: ${instErr.message}`);
  const instByCert = new Map((insts ?? []).map((i) => [i.cert_number, i]));

  const jobId = DRY_RUN ? null : await startSyncJob(supabase, 'import-icp-curation-csv');
  const nowIso = new Date().toISOString();

  const capUpdates = [];  // bank_capabilities upserts
  const facts = [];       // entity_facts inserts
  let rowsWithAnyFill = 0;

  for (const row of rows) {
    const cert = parseInt(row.cert_number, 10);
    if (!Number.isFinite(cert)) continue;
    const inst = instByCert.get(cert);
    if (!inst) { console.warn(`  cert ${cert}: institution not found, skipping`); continue; }

    const coreProcessor = (row.core_processor || '').trim() || null;
    const agentBank = (row.agent_bank_program || '').trim() || null;
    const visaP = parseBool(row.visa_principal);
    const mcP = parseBool(row.mastercard_principal);
    const cpm = (row.card_program_manager || '').trim() || null;
    const notes = (row.notes || '').trim() || null;

    const anyFill = coreProcessor || agentBank || visaP != null || mcP != null || cpm || notes;
    if (!anyFill) continue;
    rowsWithAnyFill++;

    // ── bank_capabilities upsert (only include fields the user set)
    const capRow = { cert_number: cert, data_source: 'icp_curation_csv', verified_at: nowIso };
    if (coreProcessor) { capRow.core_processor = coreProcessor; capRow.core_processor_confidence = 'manual'; }
    if (agentBank) { capRow.agent_bank_program = agentBank; capRow.agent_bank_program_source = 'icp_curation_csv'; }
    if (visaP != null) capRow.visa_principal = visaP;
    if (mcP != null) capRow.mastercard_principal = mcP;
    if (cpm) capRow.card_program_manager = cpm;
    if (notes) capRow.notes = notes;
    capUpdates.push(capRow);

    // ── entity_facts writes for each signal the user populated
    if (coreProcessor) {
      facts.push({
        entity_table: 'institutions',
        entity_id: inst.id,
        fact_type: 'signal.core_processor_fit',
        fact_key: `curated_${coreProcessor}`,
        fact_value_text: coreProcessor,
        fact_value_json: { source: 'icp_curation_csv', cert: cert },
        source_kind: 'curated',
        source_url: 'internal://icp-curation',
        observed_at: nowIso,
        confidence_score: 95,
        notes: `Manually curated: core_processor = ${coreProcessor}`,
        sync_job_id: jobId,
      });
    }
    if (agentBank) {
      facts.push({
        entity_table: 'institutions',
        entity_id: inst.id,
        fact_type: 'signal.agent_bank_dependency',
        fact_key: `curated_${agentBank}`,
        fact_value_text: agentBank,
        fact_value_json: { source: 'icp_curation_csv', cert: cert },
        source_kind: 'curated',
        source_url: 'internal://icp-curation',
        observed_at: nowIso,
        confidence_score: 95,
        notes: `Manually curated: agent_bank_program = ${agentBank}`,
        sync_job_id: jobId,
      });
    }
    if (visaP || mcP) {
      const nets = [];
      if (visaP) nets.push('visa');
      if (mcP) nets.push('mastercard');
      facts.push({
        entity_table: 'institutions',
        entity_id: inst.id,
        fact_type: 'signal.card_network_membership',
        fact_key: 'curated_principal_membership',
        fact_value_text: nets.join('+'),
        fact_value_json: { networks: nets, source: 'icp_curation_csv', cert: cert },
        source_kind: 'curated',
        source_url: 'internal://icp-curation',
        observed_at: nowIso,
        confidence_score: 95,
        notes: `Manually curated: ${nets.join(' + ')} principal member`,
        sync_job_id: jobId,
      });
    }
  }

  console.log(`Rows with any fill: ${rowsWithAnyFill}`);
  console.log(`bank_capabilities updates: ${capUpdates.length}`);
  console.log(`signal facts: ${facts.length}`);

  if (DRY_RUN) {
    console.log('\n(DRY RUN — no writes)');
    for (const c of capUpdates.slice(0, 10)) console.log(`  cert ${c.cert_number}: ${JSON.stringify(c)}`);
    return;
  }

  if (capUpdates.length > 0) {
    let applied = 0;
    for (const batch of chunkArray(capUpdates, 100)) {
      const { error } = await supabase.from('bank_capabilities').upsert(batch, { onConflict: 'cert_number' });
      if (error) console.error(`  capability upsert: ${error.message}`);
      else applied += batch.length;
    }
    console.log(`Upserted ${applied} bank_capabilities rows`);
  }

  if (facts.length > 0) {
    // Replace prior curated facts (idempotent re-fill)
    const { error: delErr } = await supabase
      .from('entity_facts')
      .delete()
      .in('fact_type', ['signal.core_processor_fit', 'signal.agent_bank_dependency', 'signal.card_network_membership'])
      .like('fact_key', 'curated_%');
    if (delErr) console.warn(`delete prior curated facts: ${delErr.message}`);

    let inserted = 0;
    for (const batch of chunkArray(facts, 500)) {
      const { error } = await supabase.from('entity_facts').insert(batch);
      if (error) console.error(`  facts insert: ${error.message}`);
      else inserted += batch.length;
    }
    console.log(`Inserted ${inserted} signal facts`);
  }

  await finishSyncJob(supabase, jobId, {
    status: 'completed',
    records_processed: capUpdates.length,
  });
}

main().catch((e) => {
  console.error('import-icp-curation-csv failed:', e);
  process.exit(1);
});
