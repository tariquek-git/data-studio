#!/usr/bin/env node
/**
 * FDIC enforcement action sync.
 *
 * Persists recent and historical FDIC enforcement actions into entity_facts as
 * structured regulatory records that can power discovery and institution
 * context without live per-request FDIC calls.
 *
 * Source:
 *   https://banks.data.fdic.gov/api/enforcement
 *
 * Usage:
 *   node scripts/sync-fdic-enforcement.mjs
 *   WRITE_TARGET=local_pg node scripts/sync-fdic-enforcement.mjs
 */

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
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
const SOURCE_KEY = 'fdic_enforcement';
const SOURCE_URL = 'https://banks.data.fdic.gov/api/enforcement';
const PAGE_SIZE = Number(process.env.FDIC_ENFORCEMENT_PAGE_SIZE || '5000');
const MAX_PAGES = Number(process.env.FDIC_ENFORCEMENT_MAX_PAGES || '0');
const FIELDS = 'CERT,INSTNAME,INITDATE,ENFORMACT,TERMDATE,CITYPENAL';

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseNumber(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function enforcementFactId(entityId, certNumber, initDate, actionType) {
  return stableUuid(
    `fact:institutions:${entityId}:regulatory:fdic_enforcement_action:${certNumber}:${initDate}:${actionType ?? ''}`
  );
}

async function fetchEnforcementRows() {
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
    url.searchParams.set('sort_by', 'INITDATE');
    url.searchParams.set('sort_order', 'DESC');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DataStudio/1.0',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FDIC enforcement request failed (${response.status}): ${body.slice(0, 400)}`);
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
      `Fetched page ${page}${total ? ` / ${Math.ceil(total / PAGE_SIZE)}` : ''}: ${pageRows.length.toLocaleString()} rows (total ${rows.length.toLocaleString()})`
    );

    if (pageRows.length < PAGE_SIZE) break;
  }

  return rows;
}

async function loadInstitutionLookupSupabase() {
  const { data, error } = await supabase
    .from('institutions')
    .select('id, cert_number')
    .limit(20000);

  if (error) throw new Error(`Unable to query institutions: ${error.message}`);
  return new Map((data ?? []).map((row) => [String(row.cert_number), row]));
}

async function loadInstitutionLookupLocal(client) {
  const { rows } = await client.query('SELECT id, cert_number FROM institutions');
  return new Map(rows.map((row) => [String(row.cert_number), row]));
}

function buildEnforcementFacts(rows, institutionLookup) {
  const facts = [];
  let matched = 0;
  let skippedNoInstitution = 0;

  for (const row of rows) {
    const certNumber = normalizeText(row.CERT);
    const initDate = normalizeText(row.INITDATE);
    const actionType = normalizeText(row.ENFORMACT);

    if (!certNumber || !initDate || !actionType) continue;

    const institution = institutionLookup.get(certNumber);
    if (!institution) {
      skippedNoInstitution += 1;
      continue;
    }

    matched += 1;
    const reportedPenalty = parseNumber(row.CITYPENAL);
    const penaltyAmountDollarsEstimate = reportedPenalty != null ? reportedPenalty * 1000 : null;

    facts.push({
      id: enforcementFactId(institution.id, certNumber, initDate, actionType),
      entity_table: 'institutions',
      entity_id: institution.id,
      fact_type: 'regulatory',
      fact_key: 'fdic_enforcement_action',
      fact_value_text: actionType,
      fact_value_number: penaltyAmountDollarsEstimate,
      fact_value_json: {
        cert_number: Number(certNumber),
        institution_name: normalizeText(row.INSTNAME),
        init_date: initDate,
        termination_date: normalizeText(row.TERMDATE),
        action_type: actionType,
        reported_penalty_value: reportedPenalty,
        penalty_amount_dollars_estimate: penaltyAmountDollarsEstimate,
      },
      fact_unit: penaltyAmountDollarsEstimate != null ? 'usd' : null,
      source_kind: 'official',
      source_url: SOURCE_URL,
      observed_at: initDate,
      confidence_score: 0.95,
      notes: normalizeText(row.TERMDATE)
        ? 'FDIC enforcement action terminated.'
        : 'FDIC enforcement action currently active or termination date not reported.',
    });
  }

  return { facts, matched, skippedNoInstitution };
}

async function writeSupabase(facts) {
  const hasFactsTable = await tableExists(supabase, 'entity_facts');
  if (!hasFactsTable) {
    throw new Error('entity_facts table is missing or not visible in Supabase');
  }

  let jobId = null;

  try {
    jobId = await startSyncJob(supabase, SOURCE_KEY);

    for (const batch of chunkArray(facts, 500)) {
      const { error } = await supabase
        .from('entity_facts')
        .upsert(batch, { onConflict: 'id' });

      if (error) throw new Error(`Unable to upsert enforcement facts: ${error.message}`);
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: facts[0]?.observed_at ?? null,
      institution_count: facts.length,
      notes: 'FDIC enforcement actions sync active.',
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: facts.length,
    });
  } catch (error) {
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    throw error;
  }
}

async function writeLocal(facts) {
  const client = await connectLocalPg();
  let jobId = null;

  try {
    const hasFactsTable = await localTableExists(client, 'entity_facts');
    if (!hasFactsTable) {
      throw new Error('entity_facts table is missing in local Postgres');
    }

    jobId = await startLocalSyncJob(client, SOURCE_KEY);

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

    await updateLocalDataSourceSnapshot(client, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: facts[0]?.observed_at ?? null,
      institution_count: facts.length,
      notes: 'FDIC enforcement actions sync active.',
    });

    await finishLocalSyncJob(client, jobId, {
      status: 'completed',
      records_processed: facts.length,
    });
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
  const rows = await fetchEnforcementRows();
  const lookup = WRITE_TARGET === 'local_pg'
    ? await connectLocalPg().then(async (client) => {
        try {
          return await loadInstitutionLookupLocal(client);
        } finally {
          await client.end();
        }
      })
    : await loadInstitutionLookupSupabase();

  const { facts, matched, skippedNoInstitution } = buildEnforcementFacts(rows, lookup);
  if (facts.length === 0) {
    throw new Error('FDIC enforcement sync matched zero institutions in the current dataset');
  }

  if (WRITE_TARGET === 'local_pg') {
    await writeLocal(facts);
  } else {
    await writeSupabase(facts);
  }

  console.log(`FDIC enforcement sync complete.
  write_target: ${WRITE_TARGET}
  rows_fetched: ${rows.length}
  matched_institutions: ${matched}
  enforcement_facts: ${facts.length}
  skipped_no_institution: ${skippedNoInstitution}
  latest_action_date: ${facts[0]?.observed_at ?? 'unknown'}`);
}

main().catch((error) => {
  console.error(`FDIC enforcement sync failed: ${error.message}`);
  process.exit(1);
});
