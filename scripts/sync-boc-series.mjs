#!/usr/bin/env node
/**
 * Bank of Canada Valet macro series sync.
 *
 * Writes key Bank of Canada series into macro_series.
 *
 * Usage:
 *   node scripts/sync-boc-series.mjs
 *   WRITE_TARGET=local_pg node scripts/sync-boc-series.mjs
 *   BOC_START_DATE=2010-01-01 node scripts/sync-boc-series.mjs
 */

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  loadEnvLocal,
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
const SOURCE_KEY = 'boc';
const SOURCE_URL = 'https://www.bankofcanada.ca/valet/docs';
const SERIES_ENDPOINT = 'https://www.bankofcanada.ca/valet/observations/CBC20210,V80691311,V80691335,FXUSDCAD/json';
const START_DATE = process.env.BOC_START_DATE || '2010-01-01';

const SERIES_META = [
  {
    code: 'CBC20210',
    series_key: 'overnight_rate_target',
    display_name: 'Target overnight rate',
    frequency: 'daily',
    unit: 'percent',
  },
  {
    code: 'V80691311',
    series_key: 'prime_rate',
    display_name: 'Prime rate',
    frequency: 'daily',
    unit: 'percent',
  },
  {
    code: 'V80691335',
    series_key: 'mortgage_5yr_conventional',
    display_name: '5-year conventional mortgage rate',
    frequency: 'daily',
    unit: 'percent',
  },
  {
    code: 'FXUSDCAD',
    series_key: 'usd_cad_exchange_rate',
    display_name: 'USD/CAD exchange rate',
    frequency: 'daily',
    unit: 'fx',
  },
];

function parseNumber(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchSeriesRows() {
  const url = `${SERIES_ENDPOINT}?start_date=${encodeURIComponent(START_DATE)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DataStudio/1.0',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bank of Canada Valet request failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const payload = await response.json();
  const observations = Array.isArray(payload.observations) ? payload.observations : [];
  const seriesDetail = payload.seriesDetail ?? {};
  const rows = [];

  for (const observation of observations) {
    const period = observation.d;
    if (!period) continue;

    for (const meta of SERIES_META) {
      const value = parseNumber(observation?.[meta.code]?.v);
      if (value == null) continue;
      const detail = seriesDetail?.[meta.code] ?? {};
      const displayName =
        [detail.description, detail.label]
          .map((entry) => String(entry ?? '').trim())
          .filter(Boolean)
          .join(' ')
          .trim() || meta.display_name;

      rows.push({
        source_key: SOURCE_KEY,
        series_key: meta.series_key,
        display_name: displayName,
        country: 'CA',
        frequency: meta.frequency,
        period,
        value,
        unit: meta.unit,
        notes: `Bank of Canada Valet series ${meta.code}`,
        source_url: url,
        raw_data: {
          observation,
          series_code: meta.code,
        },
      });
    }
  }

  return rows;
}

async function writeSupabase(rows) {
  const exists = await tableExists(supabase, 'macro_series');
  if (!exists) {
    throw new Error('macro_series table is missing or not visible in Supabase');
  }

  let jobId = null;

  try {
    jobId = await startSyncJob(supabase, SOURCE_KEY);

    for (const batch of chunkArray(rows, 500)) {
      const { error } = await supabase
        .from('macro_series')
        .upsert(batch, { onConflict: 'source_key,series_key,period' });

      if (error) throw new Error(`Unable to upsert macro_series rows: ${error.message}`);
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: rows[rows.length - 1]?.period ?? null,
      notes: 'Bank of Canada Valet series sync active.',
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: rows.length,
    });
  } catch (error) {
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    throw error;
  }
}

async function writeLocal(rows) {
  const client = await connectLocalPg();
  let jobId = null;

  try {
    const exists = await localTableExists(client, 'macro_series');
    if (!exists) {
      throw new Error('macro_series table is missing in local Postgres');
    }

    jobId = await startLocalSyncJob(client, SOURCE_KEY);

    await batchUpsert(
      client,
      'macro_series',
      ['source_key', 'series_key', 'display_name', 'country', 'frequency', 'period', 'value', 'unit', 'notes', 'source_url', 'raw_data'],
      ['source_key', 'series_key', 'period'],
      rows
    );

    await updateLocalDataSourceSnapshot(client, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: rows[rows.length - 1]?.period ?? null,
      notes: 'Bank of Canada Valet series sync active.',
    });

    await finishLocalSyncJob(client, jobId, {
      status: 'completed',
      records_processed: rows.length,
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
  const rows = await fetchSeriesRows();
  if (rows.length === 0) {
    throw new Error('Bank of Canada Valet returned no rows');
  }

  console.log(`Fetched ${rows.length.toLocaleString()} Bank of Canada series points from ${START_DATE}.`);
  if (WRITE_TARGET === 'local_pg') {
    await writeLocal(rows);
  } else {
    await writeSupabase(rows);
  }

  const latestPeriod = rows[rows.length - 1]?.period ?? 'unknown';
  console.log(`Synced ${rows.length.toLocaleString()} macro_series rows to ${WRITE_TARGET}. Latest period: ${latestPeriod}`);
}

main().catch((error) => {
  console.error(`Bank of Canada series sync failed: ${error.message}`);
  process.exit(1);
});
