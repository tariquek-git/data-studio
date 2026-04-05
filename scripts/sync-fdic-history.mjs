#!/usr/bin/env node
/**
 * FDIC history / charter-events sync.
 *
 * Pulls the official FDIC history API and writes institution-level charter
 * events into charter_events. Branch-level rows are filtered out.
 *
 * Usage:
 *   node scripts/sync-fdic-history.mjs
 *   WRITE_TARGET=local_pg node scripts/sync-fdic-history.mjs
 *   DRY_RUN=1 FDIC_HISTORY_MAX_PAGES=1 node scripts/sync-fdic-history.mjs
 */

import {
  booleanFlag,
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  loadEnvLocal,
  slugify,
  stableUuid,
  startSyncJob,
  tableExists,
  formatUsDateToIso,
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

const WRITE_TARGET = /^(local|local_pg)$/i.test(process.env.WRITE_TARGET ?? '') ? 'local_pg' : 'supabase';
const SOURCE_KEY = 'fdic_history';
const SOURCE_URL = 'https://api.fdic.gov/banks/history';
const PAGE_SIZE = Number.parseInt(process.env.FDIC_HISTORY_PAGE_SIZE ?? '1000', 10);
const MAX_PAGES = Number.parseInt(process.env.FDIC_HISTORY_MAX_PAGES ?? '0', 10);
const HISTORY_FILTER = process.env.FDIC_HISTORY_FILTER ?? '-ORG_ROLE_CDE:BR';
const DRY_RUN = booleanFlag(process.env.DRY_RUN ?? '');

const HISTORY_FIELDS = [
  'CERT',
  'INSTNAME',
  'ORG_ROLE_CDE',
  'CHANGECODE',
  'CHANGECODE_DESC',
  'EFFDATE',
  'ESTDATE',
  'ENDDATE',
  'ACQDATE',
  'PROCDATE',
  'NEW_CHARTER_FLAG',
  'NEW_CHARTER_DENOVO_FLAG',
  'VOLUNTARY_LIQUIDATION_FLAG',
  'CLASS_CHANGE_FLAG',
  'REGAGENT_CHANGE_FLAG',
  'CHARTER_COM_TO_OTS_FLAG',
  'CHARTER_OTS_TO_COM_FLAG',
  'CHARTER_COM_TO_OTHER_FLAG',
  'CHARTER_OTHER_TO_COM_FLAG',
  'FAILED_COM_TO_COM_FLAG',
  'FAILED_COM_TO_OTS_FLAG',
  'FAILED_OTS_TO_COM_FLAG',
  'FAILED_OTS_TO_OTS_FLAG',
  'FAILED_OTHER_TO_COM_FLAG',
  'FAILED_OTHER_TO_OTS_FLAG',
].join(',');

const FLAG_FIELDS = [
  'NEW_CHARTER_FLAG',
  'NEW_CHARTER_DENOVO_FLAG',
  'VOLUNTARY_LIQUIDATION_FLAG',
  'CLASS_CHANGE_FLAG',
  'REGAGENT_CHANGE_FLAG',
  'CHARTER_COM_TO_OTS_FLAG',
  'CHARTER_OTS_TO_COM_FLAG',
  'CHARTER_COM_TO_OTHER_FLAG',
  'CHARTER_OTHER_TO_COM_FLAG',
  'FAILED_COM_TO_COM_FLAG',
  'FAILED_COM_TO_OTS_FLAG',
  'FAILED_OTS_TO_COM_FLAG',
  'FAILED_OTS_TO_OTS_FLAG',
  'FAILED_OTHER_TO_COM_FLAG',
  'FAILED_OTHER_TO_OTS_FLAG',
];

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function pickDate(...values) {
  for (const value of values) {
    const iso = formatUsDateToIso(value);
    if (iso) return iso;
  }
  return null;
}

function isBranchRole(row) {
  return String(row.ORG_ROLE_CDE ?? '').trim().toUpperCase() === 'BR';
}

function eventFlags(row) {
  return FLAG_FIELDS.filter((field) => booleanFlag(row[field]));
}

function eventDetails(row, flags) {
  const parts = [
    normalizeText(row.CHANGECODE_DESC),
    flags.length > 0 ? `flags: ${flags.join(', ')}` : null,
    normalizeText(row.INSTNAME) ? `institution: ${normalizeText(row.INSTNAME)}` : null,
    normalizeText(row.CERT) ? `cert: ${normalizeText(row.CERT)}` : null,
  ].filter(Boolean);

  return parts.join(' | ');
}

function deriveEvent(row) {
  const desc = normalizeText(row.CHANGECODE_DESC);
  const flags = eventFlags(row);
  const descLower = desc?.toLowerCase() ?? '';

  let eventType = null;
  let eventSubtype = null;
  let status = 'recorded';

  if (booleanFlag(row.NEW_CHARTER_DENOVO_FLAG) || booleanFlag(row.NEW_CHARTER_FLAG)) {
    eventType = 'charter_opening';
    eventSubtype = booleanFlag(row.NEW_CHARTER_DENOVO_FLAG) ? 'new_charter_denovo' : 'new_charter';
    status = 'opened';
  } else if (flags.some((flag) => flag.startsWith('FAILED_')) || descLower.includes('failed')) {
    eventType = 'failure';
    eventSubtype = flags.find((flag) => flag.startsWith('FAILED_')) ?? slugify(desc ?? 'failure');
    status = 'recorded';
  } else if (booleanFlag(row.VOLUNTARY_LIQUIDATION_FLAG)) {
    eventType = 'closure';
    eventSubtype = 'voluntary_liquidation';
    status = 'closed';
  } else if (descLower.includes('merger') || descLower.includes('consolidation')) {
    eventType = 'merger';
    eventSubtype = slugify(desc ?? 'merger');
  } else if (
    booleanFlag(row.CLASS_CHANGE_FLAG) ||
    booleanFlag(row.REGAGENT_CHANGE_FLAG) ||
    descLower.includes('conversion') ||
    flags.some((flag) => flag.startsWith('CHARTER_'))
  ) {
    eventType = 'conversion';
    eventSubtype = slugify(desc ?? 'conversion');
  } else if (desc) {
    eventType = 'charter_change';
    eventSubtype = slugify(desc);
  }

  if (!eventType) return null;

  const eventDate = pickDate(row.EFFDATE, row.ACQDATE, row.PROCDATE, row.ESTDATE, row.ENDDATE);
  if (!eventDate) return null;

  return {
    event_type: eventType,
    event_subtype: eventSubtype,
    event_date: eventDate,
    effective_date: pickDate(row.EFFDATE, row.ACQDATE, row.PROCDATE) ?? eventDate,
    status,
    details: eventDetails(row, flags),
  };
}

function eventId(certNumber, event) {
  return stableUuid(
    [
      'fdic-history',
      certNumber,
      event.event_type,
      event.event_subtype ?? '',
      event.event_date ?? '',
      event.effective_date ?? '',
      event.status ?? '',
    ].join(':')
  );
}

async function fetchHistoryRows() {
  const rows = [];
  let offset = 0;
  let page = 0;
  let total = null;

  while (true) {
    if (MAX_PAGES > 0 && page >= MAX_PAGES) break;

    const url = new URL(SOURCE_URL);
    url.searchParams.set('fields', HISTORY_FIELDS);
    if (HISTORY_FILTER) {
      url.searchParams.set('filters', HISTORY_FILTER);
    }
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DataStudio/1.0',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FDIC history request failed (${response.status}): ${body.slice(0, 400)}`);
    }

    const payload = await response.json();
    const pageRows = Array.isArray(payload?.data) ? payload.data : [];
    total ??= payload?.totals?.count ?? null;

    for (const item of pageRows) {
      const row = item?.data ?? item;
      if (row) rows.push(row);
    }

    page += 1;
    offset += pageRows.length;

    console.log(
      `Fetched page ${page}${total ? ` / ${Math.ceil(total / PAGE_SIZE)}` : ''}: ${pageRows.length.toLocaleString()} rows (total ${rows.length.toLocaleString()})`
    );

    if (pageRows.length < PAGE_SIZE) break;
  }

  return { rows, total };
}

async function loadInstitutionLookupFromSupabase() {
  const { data, error } = await supabase
    .from('institutions')
    .select('id, cert_number, source')
    .limit(20000);

  if (error) throw new Error(`Unable to query institutions: ${error.message}`);

  return new Map((data ?? []).map((row) => [String(row.cert_number), row]));
}

async function loadInstitutionLookupFromLocalPg(client) {
  const { rows } = await client.query('SELECT id, cert_number, source FROM institutions');
  return new Map(rows.map((row) => [String(row.cert_number), row]));
}

async function loadEntityExternalIdLookupFromSupabase() {
  const hasTable = await tableExists(supabase, 'entity_external_ids');
  if (!hasTable) return new Map();

  const { data, error } = await supabase
    .from('entity_external_ids')
    .select('entity_table, entity_id, id_value, id_type')
    .in('id_type', ['fdic_cert', 'legacy_cert_number']);

  if (error) throw new Error(`Unable to query FDIC external IDs: ${error.message}`);

  return new Map((data ?? []).map((row) => [String(row.id_value), row]));
}

async function loadEntityExternalIdLookupFromLocalPg(client) {
  const hasTable = await localTableExists(client, 'entity_external_ids');
  if (!hasTable) return new Map();

  const { rows } = await client.query(`
    SELECT entity_table, entity_id, id_value, id_type
      FROM entity_external_ids
     WHERE id_type IN ('fdic_cert', 'legacy_cert_number')
  `);

  return new Map(rows.map((row) => [String(row.id_value), row]));
}

function buildCharterEvents(rows, institutionLookup, externalIdLookup) {
  const events = [];
  const matchedCerts = new Set();
  let skippedBranches = 0;
  let skippedNoInstitution = 0;
  let skippedNoEvent = 0;

  for (const row of rows) {
    const certNumber = normalizeText(row.CERT);
    if (!certNumber) continue;
    if (isBranchRole(row)) {
      skippedBranches += 1;
      continue;
    }

    const institution = institutionLookup.get(certNumber) ?? externalIdLookup.get(certNumber) ?? null;
    if (!institution) {
      skippedNoInstitution += 1;
      continue;
    }

    const event = deriveEvent(row);
    if (!event) {
      skippedNoEvent += 1;
      continue;
    }

    matchedCerts.add(certNumber);
    events.push({
      id: eventId(certNumber, event),
      entity_table: institution.entity_table ?? 'institutions',
      entity_id: institution.entity_id ?? institution.id,
      event_type: event.event_type,
      event_subtype: event.event_subtype,
      event_date: event.event_date,
      effective_date: event.effective_date,
      status: event.status,
      details: event.details,
      source_kind: 'official',
      source_url: SOURCE_URL,
      confidence_score: 1,
      raw_data: row,
    });
  }

  return {
    events,
    matched_institutions: matchedCerts.size,
    skippedBranches,
    skippedNoInstitution,
    skippedNoEvent,
  };
}

async function writeSupabase(events, dataAsOf) {
  const hasTable = await tableExists(supabase, 'charter_events');
  if (!hasTable) {
    throw new Error('charter_events table is missing or not visible in Supabase');
  }

  const institutionLookup = await loadInstitutionLookupFromSupabase();
  const externalIdLookup = await loadEntityExternalIdLookupFromSupabase();
  const { events: charterEvents, matched_institutions, skippedBranches, skippedNoInstitution, skippedNoEvent } =
    buildCharterEvents(events, institutionLookup, externalIdLookup);

  let jobId = null;

  try {
    jobId = await startSyncJob(supabase, SOURCE_KEY);

    for (const batch of chunkArray(charterEvents, 300)) {
      const { error } = await supabase.from('charter_events').upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(`Unable to upsert FDIC charter events: ${error.message}`);
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: dataAsOf,
      institution_count: matched_institutions,
      notes: `Institution-level FDIC history sync. Branch rows filtered out. Skipped branches: ${skippedBranches}; unmatched certs: ${skippedNoInstitution}; no-event rows: ${skippedNoEvent}.`,
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: charterEvents.length,
    });

    return { charterEvents, matched_institutions, skippedBranches, skippedNoInstitution, skippedNoEvent };
  } catch (error) {
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    throw error;
  }
}

async function writeLocal(events, dataAsOf) {
  const client = await connectLocalPg();
  const hasTable = await localTableExists(client, 'charter_events');
  if (!hasTable) {
    throw new Error('charter_events table is missing in local Postgres');
  }

  const institutionLookup = await loadInstitutionLookupFromLocalPg(client);
  const externalIdLookup = await loadEntityExternalIdLookupFromLocalPg(client);
  const { events: charterEvents, matched_institutions, skippedBranches, skippedNoInstitution, skippedNoEvent } =
    buildCharterEvents(events, institutionLookup, externalIdLookup);

  let jobId = null;

  try {
    jobId = await startLocalSyncJob(client, SOURCE_KEY);

    await batchUpsert(
      client,
      'charter_events',
      [
        'id',
        'entity_table',
        'entity_id',
        'event_type',
        'event_subtype',
        'event_date',
        'effective_date',
        'status',
        'details',
        'source_kind',
        'source_url',
        'confidence_score',
        'raw_data',
      ],
      ['id'],
      charterEvents
    );

    await updateLocalDataSourceSnapshot(client, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: dataAsOf,
      institution_count: matched_institutions,
      notes: `Institution-level FDIC history sync. Branch rows filtered out. Skipped branches: ${skippedBranches}; unmatched certs: ${skippedNoInstitution}; no-event rows: ${skippedNoEvent}.`,
    });

    await finishLocalSyncJob(client, jobId, {
      status: 'completed',
      records_processed: charterEvents.length,
    });

    return { charterEvents, matched_institutions, skippedBranches, skippedNoInstitution, skippedNoEvent };
  } catch (error) {
    await finishLocalSyncJob(client, jobId, {
      status: 'failed',
      error: error.message,
    });
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const { rows, total } = await fetchHistoryRows();
  const dataAsOf = rows.reduce((latest, row) => {
    const candidate = pickDate(row.EFFDATE, row.ACQDATE, row.PROCDATE, row.ESTDATE, row.ENDDATE);
    if (!candidate) return latest;
    if (!latest) return candidate;
    return candidate > latest ? candidate : latest;
  }, null);

  console.log(
    `Fetched ${rows.length.toLocaleString()} FDIC history rows${total ? ` out of ${total.toLocaleString()}` : ''}.`
  );

  if (DRY_RUN) {
    let institutionLookup;
    let externalIdLookup;
    let client = null;

    try {
      if (WRITE_TARGET === 'local_pg') {
        client = await connectLocalPg();
        institutionLookup = await loadInstitutionLookupFromLocalPg(client);
        externalIdLookup = await loadEntityExternalIdLookupFromLocalPg(client);
      } else {
        institutionLookup = await loadInstitutionLookupFromSupabase();
        externalIdLookup = await loadEntityExternalIdLookupFromSupabase();
      }

      const { events, matched_institutions, skippedBranches, skippedNoInstitution, skippedNoEvent } =
        buildCharterEvents(rows, institutionLookup, externalIdLookup);

      console.log(`Dry run: derived ${events.length.toLocaleString()} institution-level charter events.`);
      console.log(`Matched institutions: ${matched_institutions.toLocaleString()}`);
      console.log(`Skipped branch rows: ${skippedBranches.toLocaleString()}`);
      console.log(`Skipped unmatched certs: ${skippedNoInstitution.toLocaleString()}`);
      console.log(`Skipped no-event rows: ${skippedNoEvent.toLocaleString()}`);
      console.log(`Latest event date: ${dataAsOf ?? 'unknown'}`);
    } finally {
      if (client) await client.end();
    }
    return;
  }

  const result =
    WRITE_TARGET === 'local_pg'
      ? await writeLocal(rows, dataAsOf)
      : await writeSupabase(rows, dataAsOf);

  console.log(
    `Synced ${result.charterEvents.length.toLocaleString()} FDIC charter events to ${WRITE_TARGET}. Matched institutions: ${result.matched_institutions.toLocaleString()}. Latest event date: ${dataAsOf ?? 'unknown'}`
  );
}

main().catch((error) => {
  console.error(`FDIC history sync failed: ${error.message}`);
  process.exit(1);
});
