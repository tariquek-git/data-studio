#!/usr/bin/env node
/**
 * Mirror live Supabase tables into the local Postgres sandbox.
 *
 * Defaults:
 *   source:   Supabase project from .env.local
 *   target:   postgresql://localhost:5432/data_studio_local
 *
 * Usage:
 *   node scripts/mirror-supabase-to-local-postgres.mjs
 *   TABLES=institutions,financial_history,branches node scripts/mirror-supabase-to-local-postgres.mjs
 *   RESET_LOCAL=1 node scripts/mirror-supabase-to-local-postgres.mjs
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import { join } from 'path';
import {
  createSupabaseServiceClient,
  loadEnvLocal,
} from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const LOCAL_DB = process.env.LOCAL_PG_DB || 'data_studio_local';
const LOCAL_HOST = process.env.LOCAL_PG_HOST || 'localhost';
const LOCAL_PORT = process.env.LOCAL_PG_PORT || '5432';
const LOCAL_USER = process.env.LOCAL_PG_USER || '';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 1000);
const RESET_LOCAL = /^(1|true|yes)$/i.test(process.env.RESET_LOCAL || '');
const NULL_TOKEN = '__CODEX_NULL__';

const TABLE_ORDER = [
  'data_sources',
  'institutions',
  'financial_history',
  'branches',
  'bank_capabilities',
  'sync_jobs',
  'saved_searches',
  'ai_summaries',
];

function psqlArgs(database = LOCAL_DB) {
  const args = ['-v', 'ON_ERROR_STOP=1', '-h', LOCAL_HOST, '-p', LOCAL_PORT];
  if (LOCAL_USER) args.push('-U', LOCAL_USER);
  args.push('-d', database);
  return args;
}

function psqlQuery(database, sql) {
  return execFileSync('psql', [...psqlArgs(database), '-AtF', '\t', '-c', sql], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  }).trim();
}

function localTableExists(table) {
  return psqlQuery(
    LOCAL_DB,
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}' LIMIT 1;`
  ) === '1';
}

function localColumns(table) {
  const output = psqlQuery(
    LOCAL_DB,
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position;`
  );

  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function projectRows(rows, columns) {
  return rows.map((row) => {
    const projected = {};
    for (const column of columns) {
      projected[column] = row[column];
    }
    return projected;
  });
}

async function fetchRemoteTable(table, localTableColumns) {
  const rows = [];
  let from = 0;
  let sharedColumns = null;

  while (true) {
    const query = supabase.from(table);
    const selectColumns = sharedColumns && sharedColumns.length > 0 ? sharedColumns.join(',') : '*';
    const { data, error } = await query
      .select(selectColumns)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /relation .* does not exist/i.test(error.message ?? '') ||
        /schema cache/i.test(error.message ?? '')
      ) {
        console.warn(`Skipping ${table}: ${error.message}`);
        return null;
      }

      throw new Error(`Unable to fetch ${table}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return { columns: sharedColumns ?? localTableColumns, rows };
    }

    if (!sharedColumns) {
      const remoteColumns = new Set(Object.keys(data[0] || {}));
      sharedColumns = localTableColumns.filter((column) => remoteColumns.has(column));

      if (sharedColumns.length === 0) {
        throw new Error(`Unable to mirror ${table}: no shared columns between remote and local tables.`);
      }

      rows.push(...projectRows(data, sharedColumns));
    } else {
      rows.push(...data);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { columns: sharedColumns ?? localTableColumns, rows };
}

function toPgArray(values) {
  return `{${values.map((value) => {
    if (value == null) return 'NULL';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const text = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${text}"`;
  }).join(',')}}`;
}

function scalarToString(value) {
  if (value == null) return NULL_TOKEN;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return toPgArray(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvEscape(value) {
  const text = scalarToString(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsvFile(table, columns, rows, dir) {
  const file = join(dir, `${table}.csv`);
  const lines = [columns.join(',')];

  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  }

  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

function truncateTable(table) {
  execFileSync('psql', [...psqlArgs(LOCAL_DB), '-c', `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`], {
    stdio: 'inherit',
  });
}

function copyCsvIntoTable(table, columns, file) {
  const columnList = columns.map((column) => `"${column}"`).join(', ');
  const sql = `\\copy "${table}" (${columnList}) FROM '${file}' WITH (FORMAT csv, HEADER true, NULL '${NULL_TOKEN}')`;
  execFileSync('psql', [...psqlArgs(LOCAL_DB), '-c', sql], {
    stdio: 'inherit',
  });
}

function countLocalRows(table) {
  return Number(psqlQuery(LOCAL_DB, `SELECT COUNT(*) FROM "${table}";`) || '0');
}

async function mirrorTable(table, tempDir) {
  if (!localTableExists(table)) {
    console.warn(`Skipping ${table}: table does not exist locally.`);
    return { table, skipped: true, reason: 'missing_local_table' };
  }

  const columns = localColumns(table);
  const remoteTable = await fetchRemoteTable(table, columns);
  if (remoteTable == null) {
    return { table, skipped: true, reason: 'missing_remote_table' };
  }
  const importColumns = remoteTable.columns;
  const rows = remoteTable.rows;

  if (RESET_LOCAL) {
    truncateTable(table);
  }

  if (rows.length === 0) {
    if (RESET_LOCAL) {
      console.log(`Local ${table} truncated and remote table is empty.`);
    } else {
      console.log(`Remote ${table} is empty; leaving local table unchanged.`);
    }
    return { table, fetched: 0, imported: countLocalRows(table) };
  }

  const csvFile = writeCsvFile(table, importColumns, rows, tempDir);

  if (!RESET_LOCAL) {
    truncateTable(table);
  }

  copyCsvIntoTable(table, importColumns, csvFile);

  return { table, fetched: rows.length, imported: countLocalRows(table) };
}

async function main() {
  const tempDir = mkdtempSync(join(os.tmpdir(), 'data-studio-local-mirror-'));
  const requestedTables = (process.env.TABLES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const tables = requestedTables.length > 0 ? requestedTables : TABLE_ORDER;

  console.log(`Mirroring Supabase into local Postgres database ${LOCAL_DB}...`);
  console.log(`Tables: ${tables.join(', ')}`);

  const results = [];

  try {
    for (const table of tables) {
      console.log(`\nMirroring ${table}...`);
      results.push(await mirrorTable(table, tempDir));
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\nMirror summary:');
  for (const result of results) {
    if (result.skipped) {
      console.log(`  ${result.table}: skipped (${result.reason})`);
      continue;
    }
    console.log(`  ${result.table}: fetched=${result.fetched} local=${result.imported}`);
  }
}

main().catch((error) => {
  console.error(`Local mirror failed: ${error.message}`);
  process.exit(1);
});
