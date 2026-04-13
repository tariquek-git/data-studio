#!/usr/bin/env node
/**
 * FFIEC NIC Relationships Sync
 *
 * Imports holding company parent-subsidiary hierarchies from FFIEC NIC bulk CSV
 * files into entity_relationships. Both parent and offspring must already exist
 * in the institutions table (matched via RSSD ID stored in raw_data or
 * entity_external_ids). Where one or both sides resolve only to registry_entities,
 * those are also matched.
 *
 * The NIC download page is CAPTCHA-protected, so this script reads local files.
 * Place the downloaded files in scripts/data/ffiec-nic/ before running.
 *
 * Required (at least one of):
 *   FFIEC_NIC_RELATIONSHIPS_FILE=scripts/data/ffiec-nic/RELATIONSHIPS.CSV
 *     — or —
 *   File auto-discovered from scripts/data/ffiec-nic/ directory
 *
 * Optional:
 *   FFIEC_NIC_FILE_DATE=2026-03-27
 *   FFIEC_NIC_SIBLING_RELATIONSHIPS=true   (default: false — skips sibling_of rows)
 *
 * Official reference:
 *   https://www.ffiec.gov/npw/FinancialReport/DataDownload
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  formatUsDateToIso,
  getEnvValue,
  loadEnvLocal,
  parseDelimited,
  PROJECT_ROOT,
  readTextSource,
  rowsToObjects,
  stableUuid,
  startSyncJob,
  tableExists,
} from './_sync-utils.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_KEY = 'ffiec_nic_relationships';
const SOURCE_URL = 'https://www.ffiec.gov/npw';
const DATA_DIR = join(PROJECT_ROOT, 'scripts', 'data', 'ffiec-nic');
const CHUNK_SIZE = 300;

// Column name aliases: FFIEC sometimes ships different header capitalisation
// and slight naming variations across download vintages.
const COL_OFFSPRING = ['RSSD_ID_OFFSPRING', 'ID_RSSD_OFFSPRING', 'OFFSPRING_RSSD_ID', 'OFFSPRINGID'];
const COL_PARENT = ['RSSD_ID_PARENT', 'ID_RSSD_PARENT', 'PARENT_RSSD_ID', 'PARENTID'];
const COL_START = ['D_DT_START', 'DT_START', 'RELN_BEGIN_DT', 'START_DATE'];
const COL_END = ['D_DT_END', 'DT_END', 'RELN_END_DT', 'END_DATE'];
const COL_CTRL = ['CTRL_IND', 'CONTROL_IND', 'CONTROL_INDICATOR'];
const COL_PCT_EQUITY = ['PCT_EQUITY', 'EQUITY_PCT', 'PERCENT_EQUITY'];
const COL_RELN_LVL = ['RELN_LVL', 'RELATIONSHIP_LEVEL', 'LEVEL'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the first non-empty value from a row using a list of candidate keys. */
function pick(row, candidates) {
  for (const key of candidates) {
    const val = row[key];
    if (val !== undefined && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

/** Parse a NIC-style date string to ISO date or null. */
function nicDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '0' || trimmed === '00000000') return null;
  return formatUsDateToIso(trimmed);
}

/** True when an end date is absent or still in the future relative to today. */
function isActiveDate(endDateIso) {
  if (!endDateIso) return true;
  return endDateIso >= new Date().toISOString().slice(0, 10);
}

/**
 * Stable deterministic UUID for a relationship so the upsert is idempotent.
 * Seed on the canonical triple: from_entity_id + to_entity_id + relationship_type.
 */
function relationshipId(fromId, toId, relType) {
  return stableUuid(`relationship:${fromId}:${toId}:${relType}`);
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Find the relationships CSV file.
 * Preference order:
 *   1. FFIEC_NIC_RELATIONSHIPS_FILE env var
 *   2. Any file in scripts/data/ffiec-nic/ whose name matches /relation/i
 */
function resolveRelationshipsFile(env) {
  const envPath = getEnvValue(env, 'FFIEC_NIC_RELATIONSHIPS_FILE');
  if (envPath) return envPath;

  if (!existsSync(DATA_DIR)) return null;

  const files = readdirSync(DATA_DIR);
  const match = files.find((f) => /relation/i.test(f) && /\.(csv|zip)$/i.test(f));
  return match ? join(DATA_DIR, match) : null;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseNicCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  if (firstLine.includes('<')) {
    throw new Error(
      'XML NIC downloads are not supported. Please use the CSV file from the NIC Data Download page.'
    );
  }
  const delimiter = firstLine.includes('^') ? '^' : ',';
  return rowsToObjects(parseDelimited(text, delimiter));
}

// ---------------------------------------------------------------------------
// Institution / registry RSSD lookup builders
// ---------------------------------------------------------------------------

/**
 * Build a Map<rssdId, { entity_table, entity_id, name }> from the institutions
 * table. Scans raw_data for the keys that different source ingestion pipelines
 * use to store the FED RSSD identifier.
 *
 * This uses a paginated select instead of a raw SQL call so it works with the
 * Supabase PostgREST layer without needing a DB function.
 */
async function buildInstitutionRssdMap(supabase) {
  const map = new Map();
  let offset = 0;
  const pageSize = 10000;

  while (true) {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name, raw_data')
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Unable to query institutions for RSSD lookup: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const raw = row.raw_data;
      if (!raw) continue;

      // Different sources store RSSD under different keys
      const rssd =
        raw['RSSD'] ??
        raw['FED_RSSD'] ??
        raw['ID_RSSD'] ??
        raw['CERT_RSSD'] ??
        null;

      if (!rssd) continue;
      const rssdStr = String(rssd).trim();
      if (!rssdStr || rssdStr === '0') continue;

      if (!map.has(rssdStr)) {
        map.set(rssdStr, {
          entity_table: 'institutions',
          entity_id: String(row.id),
          name: String(row.name ?? ''),
        });
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return map;
}

/**
 * Supplement the RSSD map from entity_external_ids (id_type = 'rssd_id').
 * Entries already in the map (from raw_data) are not overwritten so the
 * institutions table takes precedence.
 */
async function supplementFromExternalIds(supabase, map) {
  const hasTable = await tableExists(supabase, 'entity_external_ids');
  if (!hasTable) {
    console.warn('  entity_external_ids table not found — skipping supplemental RSSD lookup.');
    return;
  }

  let offset = 0;
  const pageSize = 10000;

  while (true) {
    const { data, error } = await supabase
      .from('entity_external_ids')
      .select('entity_table, entity_id, id_value')
      .eq('id_type', 'rssd_id')
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Unable to query entity_external_ids for RSSD lookup: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const rssdStr = String(row.id_value ?? '').trim();
      if (!rssdStr || rssdStr === '0') continue;
      if (map.has(rssdStr)) continue; // institutions take precedence

      map.set(rssdStr, {
        entity_table: String(row.entity_table),
        entity_id: String(row.entity_id),
        name: '',
      });
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }
}

/**
 * For entries in the RSSD map that have an empty name (came from external IDs),
 * try to fill in the name from registry_entities.
 */
async function fillNamesFromRegistry(supabase, map) {
  const missingNameIds = [];
  for (const [, entry] of map) {
    if (!entry.name && entry.entity_table === 'registry_entities') {
      missingNameIds.push(entry.entity_id);
    }
  }

  if (missingNameIds.length === 0) return;

  for (const batch of chunkArray(missingNameIds, 500)) {
    const { data, error } = await supabase
      .from('registry_entities')
      .select('id, name')
      .in('id', batch);

    if (error) {
      console.warn(`  Could not fill registry_entity names: ${error.message}`);
      return;
    }

    const nameById = new Map((data ?? []).map((r) => [String(r.id), String(r.name ?? '')]));
    for (const [, entry] of map) {
      if (entry.entity_table === 'registry_entities' && !entry.name) {
        entry.name = nameById.get(entry.entity_id) ?? '';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Relationship builders
// ---------------------------------------------------------------------------

/**
 * Build subsidiary_of relationship rows from the raw CSV objects.
 * Returns { relationships, unmatchedRssds }.
 */
function buildSubsidiaryRelationships(csvRows, rssdMap) {
  const relationships = [];
  const unmatchedSet = new Set();

  for (const row of csvRows) {
    const offspringRssd = pick(row, COL_OFFSPRING);
    const parentRssd = pick(row, COL_PARENT);

    if (!offspringRssd || !parentRssd) continue;

    const offspring = rssdMap.get(offspringRssd);
    const parent = rssdMap.get(parentRssd);

    if (!offspring) unmatchedSet.add(offspringRssd);
    if (!parent) unmatchedSet.add(parentRssd);
    if (!offspring || !parent) continue;

    const startIso = nicDate(pick(row, COL_START));
    const endIso = nicDate(pick(row, COL_END));
    const active = isActiveDate(endIso);

    const offspringName = offspring.name || `RSSD ${offspringRssd}`;
    const parentName = parent.name || `RSSD ${parentRssd}`;

    const pctEquityRaw = pick(row, COL_PCT_EQUITY);
    const pctEquity = pctEquityRaw !== '' ? Number(pctEquityRaw) : null;

    relationships.push({
      id: relationshipId(offspring.entity_id, parent.entity_id, 'subsidiary_of'),
      from_entity_table: offspring.entity_table,
      from_entity_id: offspring.entity_id,
      to_entity_table: parent.entity_table,
      to_entity_id: parent.entity_id,
      relationship_type: 'subsidiary_of',
      relationship_label: `${offspringName} is subsidiary of ${parentName}`,
      active,
      effective_start: startIso,
      effective_end: endIso,
      source_kind: 'official',
      source_url: SOURCE_URL,
      confidence_score: 0.95,
      raw_data: {
        rssd_id_offspring: offspringRssd,
        rssd_id_parent: parentRssd,
        reln_lvl: pick(row, COL_RELN_LVL) || null,
        ctrl_ind: pick(row, COL_CTRL) || null,
        pct_equity: Number.isFinite(pctEquity) ? pctEquity : null,
        d_dt_start: startIso,
        d_dt_end: endIso,
      },
    });
  }

  return { relationships, unmatchedRssds: unmatchedSet };
}

/**
 * Build sibling_of relationship rows for all pairs of offspring that share
 * the same parent. Only active relationships are considered for siblings.
 * Returns a flat array of relationship rows.
 */
function buildSiblingRelationships(subsidiaryRows) {
  // Group offspring entity IDs by parent entity ID
  const parentToOffspring = new Map();

  for (const rel of subsidiaryRows) {
    if (!rel.active) continue;
    const parentId = rel.to_entity_id;
    const existing = parentToOffspring.get(parentId);
    if (!existing) {
      parentToOffspring.set(parentId, [rel]);
    } else {
      existing.push(rel);
    }
  }

  const siblings = [];

  for (const [parentId, children] of parentToOffspring) {
    if (children.length < 2) continue;

    for (let i = 0; i < children.length; i += 1) {
      for (let j = i + 1; j < children.length; j += 1) {
        const a = children[i];
        const b = children[j];

        // Only create sibling relationships within the same entity table to
        // keep the constraint check tidy.
        if (a.from_entity_table !== b.from_entity_table) continue;

        const aName = a.relationship_label.split(' is subsidiary of')[0] ?? a.from_entity_id;
        const bName = b.relationship_label.split(' is subsidiary of')[0] ?? b.from_entity_id;

        // Canonical ordering: smaller UUID first so (A,B) and (B,A) resolve
        // to the same stable ID.
        const [firstId, secondId, firstName, secondName] =
          a.from_entity_id < b.from_entity_id
            ? [a.from_entity_id, b.from_entity_id, aName, bName]
            : [b.from_entity_id, a.from_entity_id, bName, aName];

        siblings.push({
          id: relationshipId(firstId, secondId, 'sibling_of'),
          from_entity_table: a.from_entity_table,
          from_entity_id: firstId,
          to_entity_table: b.from_entity_table,
          to_entity_id: secondId,
          relationship_type: 'sibling_of',
          relationship_label: `${firstName} and ${secondName} share parent RSSD ${parentId}`,
          active: true,
          effective_start: null,
          effective_end: null,
          source_kind: 'official',
          source_url: SOURCE_URL,
          confidence_score: 0.9,
          raw_data: {
            common_parent_entity_id: parentId,
          },
        });
      }
    }
  }

  return siblings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const env = loadEnvLocal();
  const supabase = createSupabaseServiceClient(env);
  const fileDate = getEnvValue(env, 'FFIEC_NIC_FILE_DATE', new Date().toISOString().slice(0, 10));
  const includeSiblings =
    String(getEnvValue(env, 'FFIEC_NIC_SIBLING_RELATIONSHIPS', 'false')).toLowerCase() === 'true';

  const relationshipsFile = resolveRelationshipsFile(env);

  if (!relationshipsFile) {
    console.error('No RELATIONSHIPS CSV file found.');
    console.error(
      `Place RELATIONSHIPS.CSV in ${DATA_DIR} or set FFIEC_NIC_RELATIONSHIPS_FILE in .env.local.`
    );
    console.error('Download the NIC bulk data from: https://www.ffiec.gov/npw/FinancialReport/DataDownload');
    process.exit(1);
  }

  console.log(`Using relationships file: ${relationshipsFile}`);

  const relTableReady = await tableExists(supabase, 'entity_relationships');
  if (!relTableReady) {
    console.error('entity_relationships table is missing. Run the entity foundation migration first.');
    process.exit(1);
  }

  let jobId = null;

  try {
    console.log('Starting FFIEC NIC relationships sync...');
    jobId = await startSyncJob(supabase, SOURCE_KEY);

    // -----------------------------------------------------------------------
    // 1. Parse the relationships CSV
    // -----------------------------------------------------------------------
    console.log('Reading CSV...');
    const rawText = await readTextSource(relationshipsFile);
    const csvRows = parseNicCsv(rawText);
    console.log(`  CSV rows parsed: ${csvRows.length.toLocaleString()}`);

    if (csvRows.length === 0) {
      throw new Error('The relationships CSV is empty or could not be parsed.');
    }

    // Detect columns to help the operator diagnose mismatches
    const sampleHeaders = Object.keys(csvRows[0] ?? {});
    console.log(`  Detected columns (first row): ${sampleHeaders.join(', ')}`);

    // -----------------------------------------------------------------------
    // 2. Build RSSD → entity lookup
    // -----------------------------------------------------------------------
    console.log('Building RSSD lookup from institutions...');
    const rssdMap = await buildInstitutionRssdMap(supabase);
    console.log(`  Institutions with RSSD IDs in raw_data: ${rssdMap.size.toLocaleString()}`);

    await supplementFromExternalIds(supabase, rssdMap);
    console.log(`  Total RSSD entries after entity_external_ids supplement: ${rssdMap.size.toLocaleString()}`);

    await fillNamesFromRegistry(supabase, rssdMap);

    // -----------------------------------------------------------------------
    // 3. Build subsidiary_of relationships
    // -----------------------------------------------------------------------
    console.log('Building subsidiary_of relationships...');
    const { relationships: subsidiaryRows, unmatchedRssds } = buildSubsidiaryRelationships(
      csvRows,
      rssdMap
    );
    console.log(`  Matched subsidiary relationships: ${subsidiaryRows.length.toLocaleString()}`);
    console.log(`  Unmatched RSSD IDs (no institution or registry match): ${unmatchedRssds.size.toLocaleString()}`);

    if (unmatchedRssds.size > 0) {
      const sample = [...unmatchedRssds].slice(0, 10);
      console.log(`  Sample unmatched RSSD IDs: ${sample.join(', ')}${unmatchedRssds.size > 10 ? ` … (${unmatchedRssds.size - 10} more)` : ''}`);
    }

    // -----------------------------------------------------------------------
    // 4. Optionally build sibling_of relationships
    // -----------------------------------------------------------------------
    const siblingRows = includeSiblings ? buildSiblingRelationships(subsidiaryRows) : [];
    if (includeSiblings) {
      console.log(`  Sibling_of relationships derived: ${siblingRows.length.toLocaleString()}`);
    }

    const allRelationships = [...subsidiaryRows, ...siblingRows];

    if (allRelationships.length === 0) {
      console.warn('No relationships could be matched. Finishing without writing any rows.');
      await finishSyncJob(supabase, jobId, {
        status: 'completed',
        records_processed: 0,
      });
      return;
    }

    // -----------------------------------------------------------------------
    // 5. Upsert relationships
    // -----------------------------------------------------------------------
    console.log(`Upserting ${allRelationships.length.toLocaleString()} relationships (chunk size ${CHUNK_SIZE})...`);
    let upserted = 0;

    for (const batch of chunkArray(allRelationships, CHUNK_SIZE)) {
      const { error } = await supabase
        .from('entity_relationships')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        throw new Error(`Upsert failed: ${error.message}`);
      }

      upserted += batch.length;
      process.stdout.write(`\r  Upserted ${upserted.toLocaleString()} / ${allRelationships.length.toLocaleString()}`);
    }

    process.stdout.write('\n');

    // -----------------------------------------------------------------------
    // 6. Finish
    // -----------------------------------------------------------------------
    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: upserted,
    });

    console.log('\n--- Summary ---');
    console.log(`  File date:                   ${fileDate}`);
    console.log(`  CSV rows read:               ${csvRows.length.toLocaleString()}`);
    console.log(`  RSSD entries in lookup:      ${rssdMap.size.toLocaleString()}`);
    console.log(`  Unmatched RSSD IDs:          ${unmatchedRssds.size.toLocaleString()}`);
    console.log(`  subsidiary_of relationships: ${subsidiaryRows.length.toLocaleString()}`);
    if (includeSiblings) {
      console.log(`  sibling_of relationships:    ${siblingRows.length.toLocaleString()}`);
    }
    console.log(`  Total upserted:              ${upserted.toLocaleString()}`);
    console.log('FFIEC NIC relationships sync complete.');
  } catch (err) {
    console.error('\nFFIEC NIC relationships sync failed:', err.message);
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: err.message,
    });
    process.exit(1);
  }
}

main();
