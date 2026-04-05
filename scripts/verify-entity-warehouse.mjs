#!/usr/bin/env node
/**
 * Verify the current entity warehouse activation state.
 *
 * Prints:
 * - legacy table readability and row counts
 * - warehouse table readability and row counts
 * - explicit schema-cache warnings when PostgREST still returns PGRST205
 *
 * Run:
 *   node scripts/verify-entity-warehouse.mjs
 */

import { createSupabaseServiceClient, loadEnvLocal } from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const LEGACY_TABLES = ['institutions', 'financial_history', 'branches'];
const WAREHOUSE_TABLES = [
  'registry_entities',
  'ecosystem_entities',
  'entity_external_ids',
  'entity_tags',
  'entity_facts',
  'entity_relationships',
  'financial_history_quarterly',
  'branch_history_annual',
  'charter_events',
  'failure_events',
];

async function inspectTable(table) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .limit(1);

  if (error) {
    return {
      table,
      readable: false,
      blockedBySchemaCache:
        error.code === 'PGRST205' || /schema cache/i.test(error.message ?? ''),
      code: error.code ?? null,
      message: error.message ?? 'Unknown error',
      count: null,
    };
  }

  const { count, error: countError } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  return {
    table,
    readable: !countError,
    blockedBySchemaCache: false,
    code: countError?.code ?? null,
    message: countError?.message ?? null,
    count: count ?? null,
    sampleRows: Array.isArray(data) ? data.length : null,
  };
}

function printReport(title, results) {
  console.log(`\n${title}`);
  for (const result of results) {
    if (result.readable) {
      console.log(`  OK   ${result.table.padEnd(28)} rows=${String(result.count ?? 'unknown')}`);
    } else if (result.blockedBySchemaCache) {
      console.log(`  WAIT ${result.table.padEnd(28)} blocked by PostgREST schema cache (${result.code})`);
    } else {
      console.log(`  ERR  ${result.table.padEnd(28)} ${result.code ?? 'unknown'} ${result.message}`);
    }
  }
}

async function main() {
  console.log('Verifying entity warehouse state...');

  const legacy = await Promise.all(LEGACY_TABLES.map(inspectTable));
  const warehouse = await Promise.all(WAREHOUSE_TABLES.map(inspectTable));

  printReport('Legacy tables', legacy);
  printReport('Warehouse tables', warehouse);

  const blocked = warehouse.filter((result) => result.blockedBySchemaCache);
  if (blocked.length > 0) {
    console.log(
      `\nWarehouse is not fully reachable yet. ${blocked.length} table(s) are still blocked by PostgREST schema cache.`
    );
    console.log("Run this in Supabase SQL editor if needed: NOTIFY pgrst, 'reload schema';");
    process.exitCode = 2;
    return;
  }

  console.log('\nWarehouse tables are readable through PostgREST.');
}

main().catch((error) => {
  console.error(`Verification failed: ${error.message}`);
  process.exit(1);
});
