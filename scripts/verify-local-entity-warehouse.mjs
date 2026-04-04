#!/usr/bin/env node
/**
 * Quick verification for the local Postgres warehouse sandbox.
 *
 * Usage:
 *   node scripts/verify-local-entity-warehouse.mjs
 */

import { execFileSync } from 'child_process';

const LOCAL_DB = process.env.LOCAL_PG_DB || 'data_studio_local';
const LOCAL_HOST = process.env.LOCAL_PG_HOST || 'localhost';
const LOCAL_PORT = process.env.LOCAL_PG_PORT || '5432';
const LOCAL_USER = process.env.LOCAL_PG_USER || '';

function psqlArgs(database = LOCAL_DB) {
  const args = ['-v', 'ON_ERROR_STOP=1', '-h', LOCAL_HOST, '-p', LOCAL_PORT];
  if (LOCAL_USER) args.push('-U', LOCAL_USER);
  args.push('-d', database);
  return args;
}

function query(sql) {
  return execFileSync('psql', [...psqlArgs(), '-P', 'pager=off', '-c', sql], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  }).trim();
}

function main() {
  console.log(`Verifying local warehouse in ${LOCAL_DB}...\n`);

  console.log(query(`
    SELECT 'institutions' AS table_name, COUNT(*) AS rows FROM institutions
    UNION ALL
    SELECT 'financial_history', COUNT(*) FROM financial_history
    UNION ALL
    SELECT 'branches', COUNT(*) FROM branches
    UNION ALL
    SELECT 'registry_entities', COUNT(*) FROM registry_entities
    UNION ALL
    SELECT 'entity_external_ids', COUNT(*) FROM entity_external_ids
    UNION ALL
    SELECT 'entity_tags', COUNT(*) FROM entity_tags
    UNION ALL
    SELECT 'entity_facts', COUNT(*) FROM entity_facts
    UNION ALL
    SELECT 'financial_history_quarterly', COUNT(*) FROM financial_history_quarterly
    UNION ALL
    SELECT 'branch_history_annual', COUNT(*) FROM branch_history_annual
    ORDER BY 1;
  `));

  console.log('\nSource coverage:');
  console.log(query(`
    SELECT source, COUNT(*) AS institutions
      FROM institutions
     GROUP BY 1
     ORDER BY 2 DESC, 1;
  `));

  console.log('\nWarehouse entity coverage:');
  console.log(query(`
    SELECT entity_table, COUNT(*) AS ids
      FROM entity_external_ids
     GROUP BY 1
     ORDER BY 2 DESC, 1;
  `));
}

main();
