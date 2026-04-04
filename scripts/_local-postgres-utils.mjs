import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

export const LOCAL_DB = process.env.LOCAL_PG_DB || 'data_studio_local';
export const LOCAL_HOST = process.env.LOCAL_PG_HOST || 'localhost';
export const LOCAL_PORT = process.env.LOCAL_PG_PORT || '5432';
export const LOCAL_USER = process.env.LOCAL_PG_USER || '';
export const NULL_TOKEN = '__CODEX_NULL__';
const MAX_BUFFER = 512 * 1024 * 1024;

export function psqlArgs(database = LOCAL_DB) {
  const args = ['-v', 'ON_ERROR_STOP=1', '-h', LOCAL_HOST, '-p', LOCAL_PORT];
  if (LOCAL_USER) args.push('-U', LOCAL_USER);
  args.push('-d', database);
  return args;
}

export function psqlQuery(database, sql) {
  return execFileSync('psql', [...psqlArgs(database), '-AtF', '\t', '-c', sql], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  }).trim();
}

export function psqlJson(database, sql) {
  const wrappedSql = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (${sql}) t;`;
  const raw = execFileSync('psql', [...psqlArgs(database), '-At', '-c', wrappedSql], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  }).trim();

  return raw ? JSON.parse(raw) : [];
}

export function localTableExists(table, database = LOCAL_DB) {
  return psqlQuery(
    database,
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}' LIMIT 1;`
  ) === '1';
}

function scalarToString(value) {
  if (value == null) return NULL_TOKEN;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `{${value.map((item) => {
    if (item == null) return 'NULL';
    if (typeof item === 'number' || typeof item === 'boolean') return String(item);
    const text = String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${text}"`;
  }).join(',')}}`;
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

export function writeCsvFile(table, columns, rows, dir) {
  const file = join(dir, `${table}.csv`);
  const lines = [columns.join(',')];

  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  }

  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

export function truncateTables(tables, database = LOCAL_DB) {
  if (!tables.length) return;
  const quoted = tables.map((table) => `"${table}"`).join(', ');
  execFileSync('psql', [...psqlArgs(database), '-c', `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`], {
    stdio: 'inherit',
    maxBuffer: MAX_BUFFER,
  });
}

export function copyCsvIntoTable(table, columns, file, database = LOCAL_DB) {
  const columnList = columns.map((column) => `"${column}"`).join(', ');
  const sql = `\\copy "${table}" (${columnList}) FROM '${file}' WITH (FORMAT csv, HEADER true, NULL '${NULL_TOKEN}')`;
  execFileSync('psql', [...psqlArgs(database), '-c', sql], {
    stdio: 'inherit',
    maxBuffer: MAX_BUFFER,
  });
}
