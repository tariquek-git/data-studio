#!/usr/bin/env node
/**
 * Quick local warehouse verification for the Postgres sandbox.
 */

import { LOCAL_DB, localTableExists, psqlQuery } from './_local-postgres-utils.mjs';

const TABLES = [
  'registry_entities',
  'ecosystem_entities',
  'entity_external_ids',
  'entity_tags',
  'entity_facts',
  'entity_relationships',
  'charter_events',
  'financial_history_quarterly',
  'branch_history_annual',
  'macro_series',
  'bank_capabilities',
];

function countRows(table) {
  return Number(psqlQuery(LOCAL_DB, `SELECT COUNT(*) FROM "${table}";`) || '0');
}

function main() {
  console.log(`Verifying local warehouse tables in ${LOCAL_DB}...`);

  let blocked = false;

  for (const table of TABLES) {
    if (!localTableExists(table, LOCAL_DB)) {
      blocked = true;
      console.log(`  ${table}: missing`);
      continue;
    }

    console.log(`  ${table}: ${countRows(table).toLocaleString()} rows`);
  }

  if (blocked) {
    console.log('\nStatus: blocked');
    process.exit(1);
  }

  console.log('\nStatus: ready');
}

main();
