#!/usr/bin/env node
/**
 * Backfill entity warehouse tables from the existing legacy institution tables.
 *
 * This seeds the new warehouse layer in Supabase before every source has a
 * native warehouse loader.
 */

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  loadEnvLocal,
  startSyncJob,
  tableExists,
} from './_sync-utils.mjs';
import {
  buildBackfillPayloads,
  resolveBranchReportingYear,
} from './_entity-warehouse-backfill-shared.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const SOURCE = 'entity_warehouse_backfill';

async function fetchAllRows(table, columns, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Unable to query ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function ensureWarehouseTables() {
  const required = [
    'registry_entities',
    'entity_external_ids',
    'entity_tags',
    'entity_facts',
    'financial_history_quarterly',
    'branch_history_annual',
  ];

  for (const table of required) {
    const exists = await tableExists(supabase, table);
    if (!exists) {
      throw new Error(`Required warehouse table ${table} is missing`);
    }
  }
}

async function main() {
  await ensureWarehouseTables();

  let jobId = null;

  try {
    console.log('Starting entity warehouse backfill...');
    jobId = await startSyncJob(supabase, SOURCE);

    const [institutions, financialHistory, branches] = await Promise.all([
      fetchAllRows(
        'institutions',
        'id, cert_number, source, name, legal_name, charter_type, active, city, state, website, regulator, holding_company, total_assets, total_deposits, total_loans, net_income, roa, roi, data_as_of, last_synced_at, raw_data'
      ),
      fetchAllRows(
        'financial_history',
        'cert_number, period, total_assets, total_deposits, total_loans, net_income, equity_capital, roa, roi, credit_card_loans, raw_data'
      ),
      fetchAllRows(
        'branches',
        'cert_number, branch_number, main_office, total_deposits'
      ),
    ]);

    const payloads = buildBackfillPayloads({
      institutions,
      financialHistory,
      branches,
      branchReportingYear: resolveBranchReportingYear(),
    });

    for (const batch of chunkArray(payloads.registryRows, 400)) {
      const { error } = await supabase
        .from('registry_entities')
        .upsert(batch, { onConflict: 'id' });

      if (error) throw new Error(`Unable to upsert registry_entities: ${error.message}`);
    }

    for (const batch of chunkArray([
      ...payloads.institutionExternalIdRows,
      ...payloads.registryExternalIdRows,
    ], 500)) {
      const { error } = await supabase
        .from('entity_external_ids')
        .upsert(batch, { onConflict: 'entity_table,entity_id,id_type,id_value' });

      if (error) throw new Error(`Unable to upsert entity_external_ids: ${error.message}`);
    }

    for (const batch of chunkArray(payloads.tagRows, 500)) {
      const { error } = await supabase.from('entity_tags').upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(`Unable to upsert entity_tags: ${error.message}`);
    }

    for (const batch of chunkArray(payloads.factRows, 400)) {
      const { error } = await supabase.from('entity_facts').upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(`Unable to upsert entity_facts: ${error.message}`);
    }

    for (const batch of chunkArray(payloads.quarterlyRows, 500)) {
      const { error } = await supabase
        .from('financial_history_quarterly')
        .upsert(batch, { onConflict: 'entity_table,entity_id,period' });

      if (error) throw new Error(`Unable to upsert financial_history_quarterly: ${error.message}`);
    }

    for (const batch of chunkArray(payloads.branchAnnualRows, 500)) {
      const { error } = await supabase
        .from('branch_history_annual')
        .upsert(batch, { onConflict: 'entity_table,entity_id,reporting_year' });

      if (error) throw new Error(`Unable to upsert branch_history_annual: ${error.message}`);
    }

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed:
        payloads.registryRows.length +
        payloads.institutionExternalIdRows.length +
        payloads.registryExternalIdRows.length +
        payloads.tagRows.length +
        payloads.factRows.length +
        payloads.quarterlyRows.length +
        payloads.branchAnnualRows.length,
    });

    console.log(`Backfill complete.
  registry_entities: ${payloads.registryRows.length}
  entity_external_ids: ${payloads.institutionExternalIdRows.length + payloads.registryExternalIdRows.length}
  entity_tags: ${payloads.tagRows.length}
  entity_facts: ${payloads.factRows.length}
  financial_history_quarterly: ${payloads.quarterlyRows.length}
  branch_history_annual: ${payloads.branchAnnualRows.length}`);
  } catch (error) {
    console.error('Entity warehouse backfill failed:', error.message);
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    process.exit(1);
  }
}

main();
