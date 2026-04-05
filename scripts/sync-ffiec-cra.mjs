#!/usr/bin/env node
/**
 * FFIEC CRA ratings sync.
 *
 * Loads the official quarterly CRA ratings database and persists the latest
 * public rating per matched institution into entity_facts.
 *
 * Source:
 *   https://www.ffiec.gov/craratings/Rtg_spec.html
 *   https://www.ffiec.gov/craratings/craratng.zip
 *
 * Usage:
 *   node scripts/sync-ffiec-cra.mjs
 *   WRITE_TARGET=local_pg node scripts/sync-ffiec-cra.mjs
 */

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  loadEnvLocal,
  parseDelimited,
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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);
const WRITE_TARGET = /^(local|local_pg)$/i.test(process.env.WRITE_TARGET ?? '') ? 'local_pg' : 'supabase';
const SOURCE_KEY = 'ffiec_cra';
const SOURCE_URL = 'https://www.ffiec.gov/craratings/Rtg_spec.html';
const DATA_URL = 'https://www.ffiec.gov/craratings/craratng.zip';
const LOCAL_FILE = process.env.FFIEC_CRA_FILE ?? null;

const CRA_LABELS = {
  1: 'Outstanding',
  2: 'Satisfactory',
  3: 'Needs to Improve',
  4: 'Substantial Non-Compliance',
};

const REGULATOR_LABELS = {
  1: 'OCC',
  2: 'FRB',
  3: 'FDIC',
  4: 'OTS',
};

const EXAM_METHOD_LABELS = {
  1: 'Large Bank Exam',
  2: 'Small Bank',
  3: 'Strategic Plan',
  4: 'Limited Purpose',
  5: 'Wholesale',
  6: 'Wholesale/Limited Purpose',
  7: 'Intermediate Small Bank',
  8: 'Assessment Factor',
  9: 'Not Reported',
  10: 'Hybrid',
};

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

function isoDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return text;
}

function craFactId(entityId) {
  return stableUuid(`fact:institutions:${entityId}:regulatory:cra_rating`);
}

async function fetchCraRows() {
  const text = await readCraText();
  const parsed = parseDelimited(text, '\t');
  if (parsed.length === 0) {
    throw new Error('FFIEC CRA ratings file returned no rows');
  }

  const firstRow = parsed[0].map((value) => String(value ?? '').trim().toLowerCase());
  const hasHeader = firstRow[0] === 'id' && firstRow[1] === 'regulator';
  const rows = (hasHeader ? parsed.slice(1) : parsed)
    .map((row) => ({
      source_id: normalizeText(row[0]),
      regulator_code: parseNumber(row[1]),
      exam_date: isoDate(row[2]),
      bank_name: normalizeText(row[3]),
      city: normalizeText(row[4]),
      state: normalizeText(row[5]),
      asset_size_thousands: parseNumber(row[6]),
      exam_method_code: parseNumber(row[7]),
      rating_code: parseNumber(row[8]),
    }))
    .filter((row) => row.source_id && row.regulator_code && row.exam_date && row.rating_code);

  if (rows.length === 0) {
    throw new Error('Unable to parse FFIEC CRA ratings rows from official file');
  }

  return rows;
}

async function readCraText() {
  if (LOCAL_FILE) {
    const output = execFileSync('unzip', ['-p', LOCAL_FILE], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return output;
  }

  const tempDir = mkdtempSync(join(os.tmpdir(), 'data-studio-ffiec-cra-'));
  const zipPath = join(tempDir, 'craratng.zip');

  try {
    execFileSync(
      'python3',
      [
        '-c',
        `
from urllib.request import Request, urlopen
import sys

url = sys.argv[1]
destination = sys.argv[2]
headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Referer': 'https://www.ffiec.gov/craratings/Rtg_spec.html',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
}
request = Request(url, headers=headers)
with urlopen(request, timeout=30) as response, open(destination, 'wb') as output:
  output.write(response.read())
        `.trim(),
        DATA_URL,
        zipPath,
      ],
      { stdio: 'pipe' }
    );
    return execFileSync('unzip', ['-p', zipPath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function loadInstitutionMapsSupabase() {
  const { data: institutions, error } = await supabase
    .from('institutions')
    .select('id, cert_number')
    .limit(20000);

  if (error) throw new Error(`Unable to query institutions: ${error.message}`);

  const byCert = new Map();
  for (const institution of institutions ?? []) {
    if (institution.cert_number != null) {
      byCert.set(String(institution.cert_number), institution);
    }
  }

  const byRssd = new Map();
  const byOcc = new Map();
  const hasExternalIds = await tableExists(supabase, 'entity_external_ids');
  if (hasExternalIds) {
    const { data: externalIds, error: externalIdError } = await supabase
      .from('entity_external_ids')
      .select('entity_id, id_type, id_value')
      .eq('entity_table', 'institutions')
      .in('id_type', ['rssd_id', 'occ_charter_number']);

    if (externalIdError) throw new Error(`Unable to query entity_external_ids: ${externalIdError.message}`);

    for (const row of externalIds ?? []) {
      if (row.id_type === 'rssd_id') byRssd.set(String(row.id_value), row.entity_id);
      if (row.id_type === 'occ_charter_number') byOcc.set(String(row.id_value), row.entity_id);
    }
  }

  return { byCert, byRssd, byOcc };
}

async function loadInstitutionMapsLocal(client) {
  const { rows: institutions } = await client.query('SELECT id, cert_number FROM institutions');

  const byCert = new Map();
  for (const institution of institutions) {
    if (institution.cert_number != null) {
      byCert.set(String(institution.cert_number), institution);
    }
  }

  const byRssd = new Map();
  const byOcc = new Map();
  const hasExternalIds = await localTableExists(client, 'entity_external_ids');
  if (hasExternalIds) {
    const { rows: externalIds } = await client.query(`
      SELECT entity_id, id_type, id_value
        FROM entity_external_ids
       WHERE entity_table = 'institutions'
         AND id_type IN ('rssd_id', 'occ_charter_number')
    `);

    for (const row of externalIds) {
      if (row.id_type === 'rssd_id') byRssd.set(String(row.id_value), row.entity_id);
      if (row.id_type === 'occ_charter_number') byOcc.set(String(row.id_value), row.entity_id);
    }
  }

  return { byCert, byRssd, byOcc };
}

function buildLatestCraFacts(rows, maps) {
  const latestByEntity = new Map();
  let matched = 0;
  let skippedNoMatch = 0;

  for (const row of rows) {
    const sourceId = String(row.source_id);
    let institution = null;

    if (row.regulator_code === 3) {
      institution = maps.byCert.get(sourceId) ?? null;
    } else if (row.regulator_code === 2) {
      const entityId = maps.byRssd.get(sourceId);
      institution = entityId ? { id: entityId } : null;
    } else if (row.regulator_code === 1) {
      const entityId = maps.byOcc.get(sourceId);
      institution = entityId ? { id: entityId } : null;
    }

    if (!institution) {
      skippedNoMatch += 1;
      continue;
    }

    matched += 1;
    const current = latestByEntity.get(institution.id);
    if (current && current.exam_date >= row.exam_date) {
      continue;
    }

    latestByEntity.set(institution.id, row);
  }

  const facts = [...latestByEntity.entries()]
    .map(([entityId, row]) => ({
      id: craFactId(entityId),
      entity_table: 'institutions',
      entity_id: entityId,
      fact_type: 'regulatory',
      fact_key: 'cra_rating',
      fact_value_text: CRA_LABELS[row.rating_code] ?? 'Unknown',
      fact_value_number: row.rating_code,
      fact_value_json: {
        source_id: row.source_id,
        regulator_code: row.regulator_code,
        regulator_label: REGULATOR_LABELS[row.regulator_code] ?? 'Unknown',
        exam_date: row.exam_date,
        exam_method_code: row.exam_method_code,
        exam_method_label: EXAM_METHOD_LABELS[row.exam_method_code] ?? 'Unknown',
        bank_name: row.bank_name,
        city: row.city,
        state: row.state,
        asset_size_thousands: row.asset_size_thousands,
      },
      fact_unit: null,
      source_kind: 'official',
      source_url: DATA_URL,
      observed_at: row.exam_date,
      confidence_score: 1,
      notes: 'Latest CRA rating from the official FFIEC quarterly ratings database.',
    }))
    .sort((a, b) => String(b.observed_at ?? '').localeCompare(String(a.observed_at ?? '')));

  return {
    facts,
    matched,
    skippedNoMatch,
  };
}

async function deleteExistingCraFactsSupabase() {
  const { error } = await supabase
    .from('entity_facts')
    .delete()
    .eq('entity_table', 'institutions')
    .eq('fact_key', 'cra_rating');

  if (error) throw new Error(`Unable to clear existing CRA facts: ${error.message}`);
}

async function writeSupabase(facts) {
  const hasFactsTable = await tableExists(supabase, 'entity_facts');
  if (!hasFactsTable) {
    throw new Error('entity_facts table is missing or not visible in Supabase');
  }

  let jobId = null;

  try {
    jobId = await startSyncJob(supabase, SOURCE_KEY);
    await deleteExistingCraFactsSupabase();

    for (const batch of chunkArray(facts, 500)) {
      const { error } = await supabase
        .from('entity_facts')
        .upsert(batch, { onConflict: 'id' });

      if (error) throw new Error(`Unable to upsert CRA facts: ${error.message}`);
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: facts[0]?.observed_at ?? null,
      institution_count: facts.length,
      notes: 'Official FFIEC CRA ratings sync active.',
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
    await client.query(`
      DELETE FROM entity_facts
       WHERE entity_table = 'institutions'
         AND fact_key = 'cra_rating'
    `);

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
      notes: 'Official FFIEC CRA ratings sync active.',
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
  const rows = await fetchCraRows();
  let maps;
  if (WRITE_TARGET === 'local_pg') {
    const client = await connectLocalPg();
    try {
      maps = await loadInstitutionMapsLocal(client);
    } finally {
      await client.end();
    }
  } else {
    maps = await loadInstitutionMapsSupabase();
  }

  const { facts, matched, skippedNoMatch } = buildLatestCraFacts(rows, maps);
  if (facts.length === 0) {
    throw new Error('FFIEC CRA sync matched zero institutions in the current dataset');
  }

  if (WRITE_TARGET === 'local_pg') {
    await writeLocal(facts);
  } else {
    await writeSupabase(facts);
  }

  console.log(`FFIEC CRA sync complete.
  write_target: ${WRITE_TARGET}
  rows_parsed: ${rows.length}
  institutions_matched: ${matched}
  latest_cra_facts: ${facts.length}
  skipped_no_match: ${skippedNoMatch}
  latest_exam_date: ${facts[0]?.observed_at ?? 'unknown'}`);
}

main().catch((error) => {
  console.error(`FFIEC CRA sync failed: ${error.message}`);
  process.exit(1);
});
