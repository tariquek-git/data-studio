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
    SELECT 'bank_capabilities', COUNT(*) FROM bank_capabilities
    UNION ALL
    SELECT 'registry_entities', COUNT(*) FROM registry_entities
    UNION ALL
    SELECT 'ecosystem_entities', COUNT(*) FROM ecosystem_entities
    UNION ALL
    SELECT 'entity_external_ids', COUNT(*) FROM entity_external_ids
    UNION ALL
    SELECT 'entity_tags', COUNT(*) FROM entity_tags
    UNION ALL
    SELECT 'entity_facts', COUNT(*) FROM entity_facts
    UNION ALL
    SELECT 'entity_relationships', COUNT(*) FROM entity_relationships
    UNION ALL
    SELECT 'charter_events', COUNT(*) FROM charter_events
    UNION ALL
    SELECT 'financial_history_quarterly', COUNT(*) FROM financial_history_quarterly
    UNION ALL
    SELECT 'branch_history_annual', COUNT(*) FROM branch_history_annual
    UNION ALL
    SELECT 'macro_series', COUNT(*) FROM macro_series
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

  console.log('\nContext enrichment checks:');
  console.log(query(`
    SELECT 'rssd_id_external_ids' AS metric, COUNT(*) AS rows
      FROM entity_external_ids
     WHERE id_type = 'rssd_id'
    UNION ALL
    SELECT 'cra_rating_facts', COUNT(*)
      FROM entity_facts
     WHERE fact_key = 'cra_rating'
    UNION ALL
    SELECT 'cfpb_complaint_facts', COUNT(*)
      FROM entity_facts
     WHERE fact_key IN ('cfpb_complaints_total', 'cfpb_complaints_recent_12m_total', 'cfpb_complaints_summary')
    UNION ALL
    SELECT 'fdic_history_events', COUNT(*)
      FROM charter_events
     WHERE source_url = 'https://api.fdic.gov/banks/history'
    UNION ALL
    SELECT 'sponsor_bank_relationships', COUNT(*)
      FROM entity_relationships
     WHERE relationship_type = 'sponsor_bank_for'
    UNION ALL
    SELECT 'sec_company_facts', COUNT(*)
      FROM entity_facts
     WHERE fact_key = 'sec_company'
    UNION ALL
    SELECT 'macro_series_ca', COUNT(*)
      FROM macro_series
     WHERE country = 'CA'
    ORDER BY 1;
  `));
}

main();
