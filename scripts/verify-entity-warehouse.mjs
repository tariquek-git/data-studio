#!/usr/bin/env node

import { createSupabaseServiceClient, loadEnvLocal } from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const WAREHOUSE_TABLES = [
  'registry_entities',
  'ecosystem_entities',
  'entity_external_ids',
  'entity_tags',
  'entity_facts',
  'entity_relationships',
  'charter_events',
  'financial_history_quarterly',
  'branch_history_annual',
];

async function probeTable(table) {
  const { error } = await supabase.from(table).select('id').limit(1);
  if (error) {
    return {
      table,
      visible: false,
      rowCount: null,
      errorCode: error.code ?? null,
      errorMessage: error.message ?? null,
    };
  }

  const countResult = await supabase.from(table).select('id', { count: 'exact', head: true });
  return {
    table,
    visible: true,
    rowCount: countResult.error ? null : (countResult.count ?? 0),
    errorCode: countResult.error?.code ?? null,
    errorMessage: countResult.error?.message ?? null,
  };
}

async function main() {
  const tableStatuses = await Promise.all(WAREHOUSE_TABLES.map((table) => probeTable(table)));
  const invisible = tableStatuses.filter((table) => !table.visible);
  const emptyVisible = tableStatuses.filter((table) => table.visible && table.rowCount === 0);

  console.log('Entity warehouse readiness');
  console.log('=========================');

  for (const table of tableStatuses) {
    const summary = table.visible
      ? `visible | rows=${table.rowCount ?? 'unknown'}`
      : `blocked | ${table.errorCode ?? 'unknown'} | ${table.errorMessage ?? 'unknown error'}`;
    console.log(`${table.table}: ${summary}`);
  }

  console.log('');
  if (invisible.length > 0) {
    const cacheBlocked = invisible.some((table) => table.errorCode === 'PGRST205');
    console.log(cacheBlocked
      ? "Blocker: PostgREST schema cache has not exposed the warehouse tables yet. Run: NOTIFY pgrst, 'reload schema';"
      : `Blocker: ${invisible.length} warehouse tables are not reachable from PostgREST.`);
    process.exitCode = 1;
    return;
  }

  if (emptyVisible.length > 0) {
    console.log(`Warehouse visible but not seeded: ${emptyVisible.length} tables still have 0 rows.`);
    console.log('Next: run node scripts/backfill-entity-warehouse.mjs');
    return;
  }

  console.log('Warehouse visible and seeded. Next: smoke-test entity APIs and advance the next source ingest.');
}

main().catch((error) => {
  console.error('Warehouse verification failed:', error.message);
  process.exit(1);
});
