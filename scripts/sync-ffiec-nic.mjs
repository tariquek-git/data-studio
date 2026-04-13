#!/usr/bin/env node
/**
 * FFIEC NIC starter sync
 *
 * Loads FFIEC/NIC structure data from the official bulk download files into the
 * entity warehouse. The public NIC download page is currently CAPTCHA-protected
 * from plain scripted fetches, so this loader is designed around local files
 * downloaded from the official site.
 *
 * Required:
 *   FFIEC_NIC_ACTIVE_FILE=/absolute/or/relative/path/to/attributes-active.zip
 *
 * Optional:
 *   FFIEC_NIC_RELATIONSHIPS_FILE=.../relationships.zip
 *   FFIEC_NIC_TRANSFORMATIONS_FILE=.../transformations.zip
 *   FFIEC_NIC_FILE_DATE=2026-03-27
 *
 * Official references:
 *   https://www.ffiec.gov/npw/FinancialReport/DataDownload
 *   https://www.ffiec.gov/npw/StaticData/DataDownload/NPW%20Data%20Dictionary.pdf
 */

import {
  booleanFlag,
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  formatUsDateToIso,
  getEnvValue,
  loadEnvLocal,
  parseDelimited,
  readTextSource,
  rowsToObjects,
  slugify,
  startSyncJob,
  tableExists,
  updateDataSourceSnapshot,
} from './_sync-utils.mjs';
import { createHash } from 'node:crypto';

const SOURCE_KEY = 'ffiec_nic';
const DATA_DOWNLOAD_URL = 'https://www.ffiec.gov/npw/FinancialReport/DataDownload';
const DATA_DICTIONARY_URL = 'https://www.ffiec.gov/npw/StaticData/DataDownload/NPW%20Data%20Dictionary.pdf';

function stableId(seedParts: Array<string | number | boolean | null | undefined>) {
  const seed = seedParts
    .map((value) => (value == null ? '' : String(value)))
    .join('|');
  const hash = createHash('sha1').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

const env = loadEnvLocal();
const activeFile = getEnvValue(env, 'FFIEC_NIC_ACTIVE_FILE');
const relationshipsFile = getEnvValue(env, 'FFIEC_NIC_RELATIONSHIPS_FILE');
const transformationsFile = getEnvValue(env, 'FFIEC_NIC_TRANSFORMATIONS_FILE');
const fileDate = getEnvValue(env, 'FFIEC_NIC_FILE_DATE', new Date().toISOString().slice(0, 10));
const supabase = createSupabaseServiceClient(env);

function parseNicObjects(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  if (firstLine.includes('<')) {
    throw new Error('XML NIC downloads are not supported yet. Please use the CSV ZIP file from the NIC Data Download page.');
  }

  const delimiter = firstLine.includes('^') ? '^' : ',';
  return rowsToObjects(parseDelimited(text, delimiter));
}

function mapCountry(row) {
  const countryCode = String(row.CNTRY_CD ?? '').trim().toUpperCase();
  const countryName = String(row.CNTRY_NM ?? '').trim().toUpperCase();

  if (countryCode === 'US' || countryName === 'UNITED STATES') return 'US';
  if (countryCode === 'CA' || countryName === 'CANADA') return 'CA';
  return countryCode || 'US';
}

function inferSubtype(row) {
  if (booleanFlag(row.BHC_IND)) return 'bank_holding_company';
  if (booleanFlag(row.SLHC_IND)) return 'savings_and_loan_holding_company';
  if (booleanFlag(row.FHC_IND)) return 'financial_holding_company';
  if (booleanFlag(row.IHC_IND)) return 'intermediate_holding_company';

  const entityType = String(row.ENTITY_TYPE ?? '').trim();
  if (!entityType) return 'regulated_entity';
  return slugify(entityType);
}

function isHoldingCompanyCandidate(row) {
  if (booleanFlag(row.BHC_IND) || booleanFlag(row.SLHC_IND) || booleanFlag(row.FHC_IND) || booleanFlag(row.IHC_IND)) {
    return true;
  }

  const entityType = String(row.ENTITY_TYPE ?? '').toLowerCase();
  return (
    entityType.includes('holding') ||
    entityType.includes('financial holding') ||
    entityType.includes('bank holding') ||
    entityType.includes('foreign banking organization') ||
    entityType.includes('edge') ||
    entityType.includes('agreement')
  );
}

function makeDescription(row) {
  const parts = [
    String(row.ENTITY_TYPE ?? '').trim(),
    booleanFlag(row.BHC_IND) ? 'BHC' : null,
    booleanFlag(row.FHC_IND) ? 'FHC' : null,
    booleanFlag(row.SLHC_IND) ? 'SLHC' : null,
    booleanFlag(row.IHC_IND) ? 'IHC' : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'FFIEC NIC structure entity';
}

function nicDate(value) {
  if (!value) return null;
  return formatUsDateToIso(String(value).trim());
}

async function loadSourceObjects(source, preferredPattern) {
  if (!source) return [];
  const text = await readTextSource(source, { preferredPattern });
  return parseNicObjects(text);
}

async function fetchExistingNicEntities() {
  const { data, error } = await supabase
    .from('registry_entities')
    .select('id, registration_number')
    .eq('source_key', SOURCE_KEY);

  if (error) throw new Error(`Unable to query existing FFIEC NIC registry entities: ${error.message}`);
  return new Map((data ?? []).map((row) => [String(row.registration_number ?? ''), row.id]));
}

async function fetchRegistryEntityLookup() {
  const { data, error } = await supabase
    .from('registry_entities')
    .select('id, registration_number')
    .eq('source_key', SOURCE_KEY)
    .not('registration_number', 'is', null);

  if (error) throw new Error(`Unable to reload FFIEC NIC registry entity IDs: ${error.message}`);
  return new Map((data ?? []).map((row) => [String(row.registration_number), { entity_table: 'registry_entities', entity_id: row.id }]));
}

async function fetchInstitutionRssdLookup() {
  const hasExternalIdsTable = await tableExists(supabase, 'entity_external_ids');
  if (!hasExternalIdsTable) return new Map();

  const { data, error } = await supabase
    .from('entity_external_ids')
    .select('entity_table, entity_id, id_value')
    .eq('entity_table', 'institutions')
    .eq('id_type', 'rssd_id');

  if (error) throw new Error(`Unable to query institution RSSD IDs: ${error.message}`);
  return new Map((data ?? []).map((row) => [String(row.id_value), { entity_table: row.entity_table, entity_id: row.entity_id }]));
}

async function main() {
  if (!activeFile) {
    console.error('FFIEC NIC sync requires FFIEC_NIC_ACTIVE_FILE pointing to the official Attributes-Active CSV ZIP file.');
    console.error(`Download it from ${DATA_DOWNLOAD_URL}`);
    process.exit(1);
  }

  let jobId = null;

  try {
    const registryTableReady = await tableExists(supabase, 'registry_entities');
    if (!registryTableReady) {
      throw new Error('registry_entities table is missing. Run node scripts/run-migration-entity-foundation.mjs first.');
    }

    console.log('Starting FFIEC NIC sync...');
    jobId = await startSyncJob(supabase, SOURCE_KEY);

    const activeRows = await loadSourceObjects(activeFile, /\.csv$/i);
    const relationshipRows = await loadSourceObjects(relationshipsFile, /relationship/i);
    const transformationRows = await loadSourceObjects(transformationsFile, /transform/i);

    const candidates = activeRows.filter(isHoldingCompanyCandidate);
    const existingIds = await fetchExistingNicEntities();
    const nowIso = new Date().toISOString();

    const registryPayload = candidates.map((row) => {
      const registrationNumber = String(row.ID_RSSD ?? '').trim();
      const name = String(row.NM_SHORT ?? row.NM_LGL ?? '').trim() || `RSSD ${registrationNumber}`;
      const legalName = String(row.NM_LGL ?? '').trim() || null;
      const status = row.D_DT_END || row.DT_END ? 'inactive' : 'active';
      const regulator =
        String(row.PRIM_FED_REG ?? row.PRIM_FED_FEG ?? row.FUNC_REG ?? '').trim() || 'Federal Reserve System';

      return {
        ...(existingIds.get(registrationNumber) ? { id: existingIds.get(registrationNumber) } : {}),
        source_key: SOURCE_KEY,
        name,
        legal_name: legalName,
        entity_subtype: inferSubtype(row),
        active: status === 'active',
        status,
        country: mapCountry(row),
        city: String(row.CITY ?? '').trim() || null,
        state: String(row.STATE_ABBR_NM ?? row.STATE_CD ?? '').trim() || null,
        website: String(row.URL ?? '').trim() || null,
        regulator,
        registration_number: registrationNumber || null,
        description: makeDescription(row),
        raw_data: row,
        data_as_of: fileDate,
        last_synced_at: nowIso,
      };
    });

    for (const batch of chunkArray(registryPayload, 400)) {
      const { error } = await supabase
        .from('registry_entities')
        .upsert(batch, { onConflict: 'id' });

      if (error) throw new Error(`Unable to upsert FFIEC NIC registry entities: ${error.message}`);
    }

    const registryLookup = await fetchRegistryEntityLookup();
    const institutionLookup = await fetchInstitutionRssdLookup();
    const allRssdLookup = new Map([...institutionLookup, ...registryLookup]);

    const hasExternalIdsTable = await tableExists(supabase, 'entity_external_ids');
    if (hasExternalIdsTable) {
      const externalIds = [];

      for (const row of candidates) {
        const registrationNumber = String(row.ID_RSSD ?? '').trim();
        const registryMatch = registryLookup.get(registrationNumber);
        if (!registryMatch) continue;

        const pushExternalId = (idType, idValue, isPrimary = false) => {
          if (idValue == null || String(idValue).trim() === '' || String(idValue) === '0') return;
          externalIds.push({
            entity_table: registryMatch.entity_table,
            entity_id: registryMatch.entity_id,
            id_type: idType,
            id_value: String(idValue).trim(),
            is_primary: isPrimary,
            source_url: DATA_DICTIONARY_URL,
            notes: `FFIEC NIC bulk attributes ${fileDate}`,
          });
        };

        pushExternalId('rssd_id', row.ID_RSSD, true);
        pushExternalId('fdic_cert', row.ID_FDIC_CERT);
        pushExternalId('occ_charter_number', row.ID_OCC);
        pushExternalId('routing_number', row.ID_ABA_PRIM);
        pushExternalId('lei', row.ID_LEI);
        pushExternalId('ncua_charter', row.ID_NCUA);
      }

      for (const batch of chunkArray(externalIds, 400)) {
        const { error } = await supabase
          .from('entity_external_ids')
          .upsert(batch, { onConflict: 'entity_table,entity_id,id_type,id_value' });

        if (error) throw new Error(`Unable to upsert FFIEC NIC external IDs: ${error.message}`);
      }
    } else {
      console.warn('Skipping FFIEC NIC external ID enrichment because entity_external_ids is not available.');
    }

    const hasRelationshipsTable = await tableExists(supabase, 'entity_relationships');
    if (hasRelationshipsTable && relationshipRows.length > 0) {
      const relationships = [];

      for (const row of relationshipRows) {
        const parent = allRssdLookup.get(String(row.ID_RSSD_PARENT ?? '').trim());
        const offspring = allRssdLookup.get(String(row.ID_RSSD_OFFSPRING ?? '').trim());
        if (!parent || !offspring) continue;

        relationships.push({
          id: stableId([
            parent.entity_table,
            parent.entity_id,
            offspring.entity_table,
            offspring.entity_id,
            row.CTRL_IND ?? '0',
            row.D_DT_START ?? row.DT_START ?? '',
            row.D_DT_END ?? row.DT_END ?? '',
          ]),
          from_entity_table: parent.entity_table,
          from_entity_id: parent.entity_id,
          to_entity_table: offspring.entity_table,
          to_entity_id: offspring.entity_id,
          relationship_type: 'nic_ownership',
          relationship_label: booleanFlag(row.CTRL_IND) ? 'control relationship' : 'ownership relationship',
          active: !(row.D_DT_END || row.DT_END),
          effective_start: nicDate(row.D_DT_START ?? row.DT_START),
          effective_end: nicDate(row.D_DT_END ?? row.DT_END),
          source_kind: 'official',
          source_url: DATA_DOWNLOAD_URL,
          confidence_score: 1,
          notes: SOURCE_KEY,
          raw_data: row,
        });
      }

      await supabase
        .from('entity_relationships')
        .delete()
        .eq('notes', SOURCE_KEY)
        .eq('relationship_type', 'nic_ownership');

      for (const batch of chunkArray(relationships, 300)) {
        const { error } = await supabase
          .from('entity_relationships')
          .upsert(batch, { onConflict: 'id' });
        if (error) throw new Error(`Unable to insert FFIEC NIC relationships: ${error.message}`);
      }
    } else if (!hasRelationshipsTable) {
      console.warn('Skipping FFIEC NIC relationships because entity_relationships is not available.');
    }

    const hasCharterEventsTable = await tableExists(supabase, 'charter_events');
    if (hasCharterEventsTable && transformationRows.length > 0) {
      const charterEvents = [];

      for (const row of transformationRows) {
        const predecessorId = String(row.ID_RSSD_PREDECESSOR ?? row.ID_RSSD_PRECESSOR ?? '').trim();
        const successorId = String(row.ID_RSSD_SUCCESSOR ?? '').trim();
        const successor = allRssdLookup.get(successorId);
        const predecessor = allRssdLookup.get(predecessorId);
        const target = successor ?? predecessor;
        if (!target) continue;

        const eventDate = nicDate(row.D_DT_TRANS ?? row.DT_TRANS);
        if (!eventDate) continue;

        charterEvents.push({
          id: stableId([
            target.entity_table,
            target.entity_id,
            row.TRNSFM_CD ?? '',
            predecessorId,
            successorId,
            eventDate,
          ]),
          entity_table: target.entity_table,
          entity_id: target.entity_id,
          event_type: 'transformation',
          event_subtype: String(row.TRNSFM_CD ?? '').trim() || null,
          event_date: eventDate,
          effective_date: eventDate,
          status: 'recorded',
          details: `NIC transformation ${String(row.TRNSFM_CD ?? '').trim() || 'unknown'}: ${predecessorId || 'unknown predecessor'} -> ${successorId || 'unknown successor'}`,
          source_kind: 'official',
          source_url: DATA_DOWNLOAD_URL,
          confidence_score: 1,
          raw_data: row,
        });
      }

      await supabase
        .from('charter_events')
        .delete()
        .eq('source_url', DATA_DOWNLOAD_URL)
        .eq('event_type', 'transformation');

      for (const batch of chunkArray(charterEvents, 300)) {
        const { error } = await supabase
          .from('charter_events')
          .upsert(batch, { onConflict: 'id' });
        if (error) throw new Error(`Unable to insert FFIEC NIC transformation events: ${error.message}`);
      }
    } else if (!hasCharterEventsTable) {
      console.warn('Skipping FFIEC NIC transformations because charter_events is not available.');
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      status: 'active',
      institution_count: registryPayload.length,
      data_as_of: fileDate,
      last_synced_at: nowIso,
      notes: 'Sync expects the official NIC bulk CSV ZIP downloads because the NIC public download page is CAPTCHA-protected from plain scripted fetches.',
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: registryPayload.length,
    });

    console.log(`FFIEC NIC sync complete. Registry entities loaded: ${registryPayload.length}.`);
  } catch (error) {
    console.error('FFIEC NIC sync failed:', error.message);
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    process.exit(1);
  }
}

main();
