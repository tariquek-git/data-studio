#!/usr/bin/env node
/**
 * FDIC failures sync.
 *
 * Pulls the official FDIC failures dataset and persists it into failure_events.
 * This keeps the failures experience warehouse-backed instead of relying on
 * live read-time API fetches.
 *
 * Usage:
 *   node scripts/sync-fdic-failures.mjs
 *   WRITE_TARGET=local_pg node scripts/sync-fdic-failures.mjs
 *   DRY_RUN=1 FDIC_FAILURES_PAGE_SIZE=1000 node scripts/sync-fdic-failures.mjs
 */

import {
  booleanFlag,
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  formatUsDateToIso,
  loadEnvLocal,
  stableUuid,
  startSyncJob,
  tableExists,
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

const WRITE_TARGET = /^(local|local_pg)$/i.test(process.env.WRITE_TARGET ?? '') ? 'local_pg' : 'supabase';
const DRY_RUN = booleanFlag(process.env.DRY_RUN ?? '');
const SOURCE_KEY = 'fdic_failures';
const SOURCE_URL = 'https://banks.data.fdic.gov/api/failures';
const PAGE_SIZE = Number.parseInt(process.env.FDIC_FAILURES_PAGE_SIZE ?? '1000', 10);
const MAX_PAGES = Number.parseInt(process.env.FDIC_FAILURES_MAX_PAGES ?? '0', 10);
const FIELDS = ['CERT', 'INSTNAME', 'FAILDATE', 'RESTYPE', 'SAVR', 'COST', 'CHCLASS'].join(',');

function failureId(row) {
  return stableUuid([
    SOURCE_KEY,
    row.CERT,
    row.FAILDATE ?? '',
    row.RESTYPE ?? '',
    row.ID ?? '',
  ].join(':'));
}

async function fetchFailureRows() {
  const rows = [];
  let offset = 0;
  let page = 0;
  let total = null;

  while (true) {
    if (MAX_PAGES > 0 && page >= MAX_PAGES) break;

    const url = new URL(SOURCE_URL);
    url.searchParams.set('fields', FIELDS);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('sort_by', 'FAILDATE');
    url.searchParams.set('sort_order', 'DESC');

    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DataStudio/1.0' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FDIC failures request failed (${response.status}): ${body.slice(0, 400)}`);
    }

    const payload = await response.json();
    const pageRows = Array.isArray(payload?.data) ? payload.data : [];
    total ??= payload?.meta?.total ?? null;

    for (const item of pageRows) {
      const row = item?.data ?? item;
      if (row) rows.push(row);
    }

    page += 1;
    offset += pageRows.length;

    console.log(
      `Fetched failures page ${page}${total ? ` / ${Math.ceil(total / PAGE_SIZE)}` : ''}: ${pageRows.length.toLocaleString()} rows (total ${rows.length.toLocaleString()})`
    );

    if (pageRows.length < PAGE_SIZE) break;
  }

  return { rows, total };
}

async function fetchInstitutionLookupForSupabase(certNumbers) {
  const lookup = new Map();

  for (const certChunk of chunkArray(certNumbers, 400)) {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, cert_number')
      .in('cert_number', certChunk);

    if (error) throw new Error(`Unable to query institutions for failures sync: ${error.message}`);

    for (const row of data ?? []) {
      lookup.set(Number(row.cert_number), row.id);
    }
  }

  return lookup;
}

async function fetchInstitutionLookupForLocal(client, certNumbers) {
  const lookup = new Map();

  for (const certChunk of chunkArray(certNumbers, 500)) {
    const { rows } = await client.query(
      `
        SELECT id, cert_number
        FROM institutions
        WHERE cert_number = ANY($1::bigint[])
      `,
      [certChunk]
    );

    for (const row of rows) {
      lookup.set(Number(row.cert_number), row.id);
    }
  }

  return lookup;
}

function buildFailureEvent(row, entityId) {
  const resolutionType = String(row.RESTYPE ?? '').trim() || 'Unknown';
  return {
    id: failureId(row),
    source_key: SOURCE_KEY,
    cert_number: Number(row.CERT),
    entity_table: entityId ? 'institutions' : null,
    entity_id: entityId ?? null,
    institution_name: String(row.INSTNAME ?? '').trim() || `Cert ${row.CERT}`,
    city: null,
    state: null,
    fail_date: formatUsDateToIso(row.FAILDATE),
    resolution_type: resolutionType,
    insurance_fund: String(row.SAVR ?? '').trim() || null,
    estimated_loss: row.COST != null && row.COST !== ''
      ? Math.round(Number(row.COST) * 1_000_000)
      : null,
    charter_class: String(row.CHCLASS ?? '').trim() || null,
    source_kind: 'official',
    source_url: SOURCE_URL,
    raw_data: row,
  };
}

async function upsertToSupabase(events, dataAsOf) {
  let jobId = null;
  try {
    const hasTable = await tableExists(supabase, 'failure_events');
    if (!hasTable) throw new Error('failure_events table is missing or not visible in Supabase');

    jobId = await startSyncJob(supabase, SOURCE_KEY);

    if (!DRY_RUN && events.length > 0) {
      for (const batch of chunkArray(events, 500)) {
        const { error } = await supabase
          .from('failure_events')
          .upsert(batch, { onConflict: 'source_key,cert_number,fail_date,resolution_type' });

        if (error) throw new Error(`Unable to upsert failure_events: ${error.message}`);
      }
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      institution_count: events.length,
      data_as_of: dataAsOf,
      last_synced_at: new Date().toISOString(),
      status: 'active',
      notes: 'FDIC failure history persisted in failure_events.',
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: events.length,
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

async function upsertToLocal(client, events, dataAsOf) {
  let jobId = null;
  try {
    const hasTable = await localTableExists(client, 'failure_events');
    if (!hasTable) throw new Error('failure_events table is missing in local Postgres');

    jobId = await startLocalSyncJob(client, SOURCE_KEY);

    if (!DRY_RUN && events.length > 0) {
      await batchUpsert(
        client,
        'failure_events',
        [
          'id',
          'source_key',
          'cert_number',
          'entity_table',
          'entity_id',
          'institution_name',
          'city',
          'state',
          'fail_date',
          'resolution_type',
          'insurance_fund',
          'estimated_loss',
          'charter_class',
          'source_kind',
          'source_url',
          'raw_data',
        ],
        ['source_key', 'cert_number', 'fail_date', 'resolution_type'],
        events
      );
    }

    await updateLocalDataSourceSnapshot(client, SOURCE_KEY, {
      institution_count: events.length,
      data_as_of: dataAsOf,
      last_synced_at: new Date().toISOString(),
      status: 'active',
      notes: 'FDIC failure history persisted in failure_events.',
    });

    await finishLocalSyncJob(client, jobId, {
      status: 'completed',
      records_processed: events.length,
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
    console.log(`Starting FDIC failures sync with target=${WRITE_TARGET}, dry_run=${DRY_RUN ? 'yes' : 'no'}...`);

    const { rows } = await fetchFailureRows();
    const certNumbers = [...new Set(rows.map((row) => Number(row.CERT)).filter((value) => Number.isFinite(value) && value > 0))];

    const lookup = WRITE_TARGET === 'local_pg'
      ? await fetchInstitutionLookupForLocal(localClient, certNumbers)
      : await fetchInstitutionLookupForSupabase(certNumbers);

    const events = rows
      .map((row) => {
        const certNumber = Number(row.CERT);
        const failDate = formatUsDateToIso(row.FAILDATE);
        if (!Number.isFinite(certNumber) || certNumber <= 0 || !failDate) return null;
        return buildFailureEvent(row, lookup.get(certNumber) ?? null);
      })
      .filter(Boolean);

    const latestFailureDate = events
      .map((row) => row.fail_date)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;

    if (WRITE_TARGET === 'local_pg') {
      await upsertToLocal(localClient, events, latestFailureDate);
    } else {
      await upsertToSupabase(events, latestFailureDate);
    }

    console.log(`FDIC failures sync complete.
  target: ${WRITE_TARGET}
  rows: ${events.length.toLocaleString()}
  matched_current_institutions: ${[...lookup.keys()].length.toLocaleString()}
  latest_fail_date: ${latestFailureDate ?? 'unknown'}
  dry_run: ${DRY_RUN ? 'yes' : 'no'}`);
  } catch (error) {
    console.error(`FDIC failures sync failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (localClient) {
      await localClient.end();
    }
  }
}

main();
