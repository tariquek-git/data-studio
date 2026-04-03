#!/usr/bin/env node
/**
 * Set up a local Postgres sandbox for Data Studio.
 *
 * Defaults:
 *   database: data_studio_local
 *   host: localhost
 *   port: 5432
 *   user: current shell user / psql default
 *
 * Usage:
 *   node scripts/setup-local-postgres.mjs
 *   RESET=1 node scripts/setup-local-postgres.mjs
 *   LOCAL_PG_DB=my_db node scripts/setup-local-postgres.mjs
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_NAME = process.env.LOCAL_PG_DB || 'data_studio_local';
const HOST = process.env.LOCAL_PG_HOST || 'localhost';
const PORT = process.env.LOCAL_PG_PORT || '5432';
const USER = process.env.LOCAL_PG_USER || '';
const RESET = /^(1|true|yes)$/i.test(process.env.RESET || '');

const REQUIRED_FILES = [
  'local-postgres-bootstrap.sql',
  'schema.sql',
  'add-capabilities-table.sql',
  'add-data-sources-table.sql',
  'add-ai-summaries-table.sql',
  'add-entity-foundation.sql',
];

const MIGRATIONS = [
  { name: 'core schema', marker: 'institutions', file: 'schema.sql' },
  { name: 'bank capabilities', marker: 'bank_capabilities', file: 'add-capabilities-table.sql' },
  { name: 'data sources', marker: 'data_sources', file: 'add-data-sources-table.sql' },
  { name: 'ai summaries', marker: 'ai_summaries', file: 'add-ai-summaries-table.sql' },
  { name: 'entity foundation', marker: 'registry_entities', file: 'add-entity-foundation.sql' },
];

function connArgs(database = DB_NAME) {
  const args = ['-v', 'ON_ERROR_STOP=1', '-h', HOST, '-p', PORT];
  if (USER) args.push('-U', USER);
  args.push('-d', database);
  return args;
}

function runPsql(database, sql) {
  return execFileSync('psql', [...connArgs(database), '-Atqc', sql], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  }).trim();
}

function runPsqlFile(database, filePath) {
  execFileSync('psql', [...connArgs(database), '-f', filePath], {
    stdio: 'inherit',
  });
}

function databaseExists(database) {
  const escaped = database.replace(/'/g, "''");
  return runPsql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${escaped}';`) === '1';
}

function tableExists(database, tableName) {
  const escaped = tableName.replace(/'/g, "''");
  return runPsql(
    database,
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${escaped}' LIMIT 1;`
  ) === '1';
}

function ensureFiles() {
  for (const file of REQUIRED_FILES) {
    const path = join(__dirname, file);
    if (!existsSync(path)) {
      throw new Error(`Missing required file: ${path}`);
    }
  }
}

function createDatabaseIfNeeded() {
  const dbExists = databaseExists(DB_NAME);

  if (dbExists && RESET) {
    console.log(`Resetting local database ${DB_NAME}...`);
    execFileSync('psql', [...connArgs('postgres'), '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME.replace(/'/g, "''")}' AND pid <> pg_backend_pid();`], {
      stdio: 'inherit',
    });
    execFileSync('psql', [...connArgs('postgres'), '-c', `DROP DATABASE "${DB_NAME}";`], {
      stdio: 'inherit',
    });
  }

  if (!databaseExists(DB_NAME)) {
    console.log(`Creating local database ${DB_NAME}...`);
    execFileSync('psql', [...connArgs('postgres'), '-c', `CREATE DATABASE "${DB_NAME}";`], {
      stdio: 'inherit',
    });
  } else {
    console.log(`Using existing local database ${DB_NAME}.`);
  }
}

function applyBootstrap() {
  console.log('Applying local compatibility bootstrap...');
  runPsqlFile(DB_NAME, join(__dirname, 'local-postgres-bootstrap.sql'));
}

function applyMigrations() {
  for (const migration of MIGRATIONS) {
    if (tableExists(DB_NAME, migration.marker)) {
      console.log(`Skipping ${migration.name}; ${migration.marker} already exists.`);
      continue;
    }

    console.log(`Applying ${migration.name}...`);
    runPsqlFile(DB_NAME, join(__dirname, migration.file));
  }
}

function printSummary() {
  const tables = runPsql(
    DB_NAME,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  )
    .split('\n')
    .filter(Boolean);

  console.log('\nLocal Postgres sandbox is ready.');
  console.log(`Database: ${DB_NAME}`);
  console.log(`Connection: postgresql://${HOST}:${PORT}/${DB_NAME}`);
  console.log(`Public tables: ${tables.length}`);
  console.log(`Key tables present:`);
  for (const table of ['institutions', 'financial_history', 'branches', 'bank_capabilities', 'data_sources', 'registry_entities']) {
    console.log(`  ${table}: ${tableExists(DB_NAME, table) ? 'yes' : 'no'}`);
  }
}

function main() {
  ensureFiles();
  createDatabaseIfNeeded();
  applyBootstrap();
  applyMigrations();
  printSummary();
}

main();
