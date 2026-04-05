#!/usr/bin/env node
/**
 * FDIC RSSD / CRA sync.
 *
 * Pulls the latest FDIC reporting-period RSSD IDs and CRA ratings for active
 * FDIC institutions, then persists them into the entity warehouse.
 *
 * Usage:
 *   node scripts/sync-fdic-rssd-cra.mjs
 *   WRITE_TARGET=local_pg node scripts/sync-fdic-rssd-cra.mjs
 *   DRY_RUN=1 node scripts/sync-fdic-rssd-cra.mjs
 */

import {
  booleanFlag,
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  loadEnvLocal,
  startSyncJob,
  tableExists,
  stableUuid,
  updateDataSourceSnapshot,
} from './_sync-utils.mjs';
import {
  batchUpsert,
  connectLocalPg,
  finishLocalSyncJob,
  localTableExists,
  startLocalSyncJob,
  updateLocalDataSourceSnapshot,
} from './_local-pg-write.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const FDIC_API = 'https://banks.data.fdic.gov/api';
const SOURCE_KEY = 'fdic_rssd_cra';
const SOURCE_URL = 'https://banks.data.fdic.gov/api/financials';
const WRITE_TARGET = /^(local|local_pg)$/i.test(process.env.WRITE_TARGET ?? '') ? 'local_pg' : 'supabase';
const DRY_RUN = booleanFlag(process.env.DRY_RUN ?? '');

const CRA_LABELS = {
  1: 'Outstanding',
  2: 'Satisfactory',
  3: 'Needs to Improve',
  4: 'Substantial Non-Compliance',
};

function formatDate(repdte) {
  if (!repdte || String(repdte).length !== 8) return String(repdte ?? '');
  const text = String(repdte);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function externalIdId(entityId, idType, idValue) {
  return stableUuid(`external:${entityId}:${idType}:${idValue}`);
}

function factId(entityId, factKey, factValueText, observedAt) {
  return stableUuid(`fact:institutions:${entityId}:regulatory:${factKey}:${factValueText ?? ''}:${observedAt ?? ''}`);
}

async function fetchLatestReportingDate() {
  const res = await fetch(
    `${FDIC_API}/financials?fields=REPDTE&sort_by=REPDTE&sort_order=DESC&limit=1`,
    { headers: { Accept: 'application/json', 'User-Agent': 'DataStudio/1.0' } }
  );
  if (!res.ok) {
    throw new Error(`Unable to fetch latest FDIC reporting date: HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data?.[0]?.data?.REPDTE ?? null;
}

async function fetchCraRows(reportingDate) {
  const fields = ['CERT', 'CRARA', 'CRADATE', 'RSSDID', 'INSTNAME', 'REPDTE'].join(',');
  const res = await fetch(
    `${FDIC_API}/financials?filters=REPDTE:${reportingDate}&fields=${fields}&limit=10000`,
    { headers: { Accept: 'application/json', 'User-Agent': 'DataStudio/1.0' } }
  );
  if (!res.ok) {
    throw new Error(`Unable to fetch FDIC CRA/RSSD data: HTTP ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? []).map((row) => row.data ?? {});
}

async function fetchInstitutionsForSupabase() {
  const { data, error } = await supabase
    .from('institutions')
    .select('id, cert_number')
    .eq('source', 'fdic');

  if (error) throw new Error(`Unable to query FDIC institutions: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, cert_number: Number(row.cert_number) }));
}

async function fetchInstitutionsForLocal(client) {
  const { rows } = await client.query(`
    SELECT id, cert_number
    FROM institutions
    WHERE source = 'fdic'
  `);
  return rows.map((row) => ({ id: row.id, cert_number: Number(row.cert_number) }));
}

async function upsertToSupabase(externalIds, facts, snapshot) {
  let jobId = null;
  try {
    const hasExternalIdsTable = await tableExists(supabase, 'entity_external_ids');
    const hasFactsTable = await tableExists(supabase, 'entity_facts');

    if (!hasExternalIdsTable || !hasFactsTable) {
      throw new Error('entity_external_ids or entity_facts table is missing or not visible in Supabase');
    }

    jobId = await startSyncJob(supabase, SOURCE_KEY);

    if (!DRY_RUN && externalIds.length > 0) {
      for (const batch of chunkArray(externalIds, 500)) {
        const { error } = await supabase
          .from('entity_external_ids')
          .upsert(batch, { onConflict: 'id' });
        if (error) throw new Error(`Unable to upsert RSSD external IDs: ${error.message}`);
      }
    }

    if (!DRY_RUN && facts.length > 0) {
      for (const batch of chunkArray(facts, 500)) {
        const { error } = await supabase
          .from('entity_facts')
          .upsert(batch, { onConflict: 'id' });
        if (error) throw new Error(`Unable to upsert CRA facts: ${error.message}`);
      }
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      institution_count: snapshot.matchedInstitutions,
      data_as_of: snapshot.reportingDate,
      last_synced_at: new Date().toISOString(),
      status: 'active',
      notes: `RSSD enrichment refreshed from FDIC financials for reporting period ${snapshot.reportingDate}.`,
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: externalIds.length + facts.length,
      error: null,
    });
  } catch (error) {
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      records_processed: 0,
      error: error.message,
    });
    throw error;
  }
}

async function upsertToLocal(client, externalIds, facts, snapshot) {
  let jobId = null;
  try {
    const hasExternalIdsTable = await localTableExists(client, 'entity_external_ids');
    const hasFactsTable = await localTableExists(client, 'entity_facts');

    if (!hasExternalIdsTable || !hasFactsTable) {
      throw new Error('entity_external_ids or entity_facts table is missing in local Postgres');
    }

    jobId = await startLocalSyncJob(client, SOURCE_KEY);

    if (!DRY_RUN && externalIds.length > 0) {
      await batchUpsert(
        client,
        'entity_external_ids',
        ['id', 'entity_table', 'entity_id', 'id_type', 'id_value', 'is_primary', 'source_url', 'notes'],
        ['id'],
        externalIds
      );
    }

    if (!DRY_RUN && facts.length > 0) {
      await batchUpsert(
        client,
        'entity_facts',
        [
          'id',
          'entity_table',
          'entity_id',
          'fact_type',
          'fact_key',
          'fact_value_text',
          'fact_value_number',
          'fact_value_json',
          'fact_unit',
          'source_kind',
          'source_url',
          'observed_at',
          'confidence_score',
          'notes',
        ],
        ['id'],
        facts
      );
    }

    await updateLocalDataSourceSnapshot(client, SOURCE_KEY, {
      institution_count: snapshot.matchedInstitutions,
      data_as_of: snapshot.reportingDate,
      last_synced_at: new Date().toISOString(),
      status: 'active',
      notes: `RSSD enrichment refreshed from FDIC financials for reporting period ${snapshot.reportingDate}.`,
    });

    await finishLocalSyncJob(client, jobId, {
      status: 'completed',
      records_processed: externalIds.length + facts.length,
      error: null,
    });
  } catch (error) {
    await finishLocalSyncJob(client, jobId, {
      status: 'failed',
      records_processed: 0,
      error: error.message,
    });
    throw error;
  }
}

async function main() {
  const localClient = WRITE_TARGET === 'local_pg' ? await connectLocalPg() : null;

  try {
    const reportingDateRaw = await fetchLatestReportingDate();
    if (!reportingDateRaw) {
      throw new Error('FDIC API returned no latest reporting date');
    }

    const reportingDate = formatDate(reportingDateRaw);
    const rows = await fetchCraRows(reportingDateRaw);
    const institutions = WRITE_TARGET === 'local_pg'
      ? await fetchInstitutionsForLocal(localClient)
      : await fetchInstitutionsForSupabase();

    const byCert = new Map(institutions.map((row) => [Number(row.cert_number), row]));
    const observedAt = new Date().toISOString();
    const externalIds = [];
    const facts = [];
    let matchedInstitutions = 0;
    let rssdUpserts = 0;
    let craUpserts = 0;

    for (const row of rows) {
      const cert = Number(row.CERT);
      if (!Number.isFinite(cert)) continue;

      const institution = byCert.get(cert);
      if (!institution) continue;
      matchedInstitutions += 1;

      const rssdId = normalizeText(row.RSSDID);
      if (rssdId && rssdId !== '0') {
        rssdUpserts += 1;
        externalIds.push({
          id: externalIdId(institution.id, 'rssd_id', rssdId),
          entity_table: 'institutions',
          entity_id: institution.id,
          id_type: 'rssd_id',
          id_value: rssdId,
          is_primary: false,
          source_url: `${FDIC_API}/institutions`,
          notes: `FDIC financials API ${reportingDate}`,
        });
      }

      const ratingCode = Number(row.CRARA);
      if (Number.isFinite(ratingCode) && ratingCode > 0) {
        craUpserts += 1;
        facts.push({
          id: factId(institution.id, 'cra_rating', String(ratingCode), reportingDate),
          entity_table: 'institutions',
          entity_id: institution.id,
          fact_type: 'regulatory',
          fact_key: 'cra_rating',
          fact_value_text: CRA_LABELS[ratingCode] ?? 'Unknown',
          fact_value_number: ratingCode,
          fact_value_json: {
            cert_number: cert,
            institution_name: normalizeText(row.INSTNAME),
            exam_date: normalizeText(row.CRADATE),
            reporting_period: reportingDate,
          },
          fact_unit: null,
          source_kind: 'official',
          source_url: SOURCE_URL,
          observed_at: observedAt,
          confidence_score: 1,
          notes: `FDIC financials API ${reportingDate}`,
        });
      }
    }

    const snapshot = { matchedInstitutions, reportingDate };

    if (WRITE_TARGET === 'local_pg') {
      await upsertToLocal(localClient, externalIds, facts, snapshot);
    } else {
      await upsertToSupabase(externalIds, facts, snapshot);
    }

    console.log(`FDIC RSSD/CRA sync complete.
  target: ${WRITE_TARGET}
  reporting_date: ${reportingDate}
  matched_institutions: ${matchedInstitutions}
  rssd_upserts: ${rssdUpserts}
  cra_upserts: ${craUpserts}
  dry_run: ${DRY_RUN ? 'yes' : 'no'}`);
  } catch (error) {
    console.error(`FDIC RSSD/CRA sync failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (localClient) {
      await localClient.end();
    }
  }
}

main();
