import { getSupabase } from './supabase.js';

export type Severity = 'info' | 'warning' | 'error';

export interface WarehouseTableStatus {
  table: string;
  visible: boolean;
  row_count: number | null;
  error_code: string | null;
  error_message: string | null;
}

export interface WarehouseIssue {
  severity: Severity;
  code: string;
  message: string;
}

export const LEGACY_TABLES = ['institutions', 'financial_history', 'branches'] as const;

export const WAREHOUSE_TABLES = [
  'registry_entities',
  'entity_external_ids',
  'entity_tags',
  'entity_facts',
  'entity_relationships',
  'charter_events',
  'failure_events',
  'financial_history_quarterly',
  'branch_history_annual',
  'macro_series',
] as const;

async function probeTable(table: string): Promise<WarehouseTableStatus> {
  const supabase = getSupabase();
  const { error } = await supabase.from(table).select('id').limit(1);

  if (error) {
    return {
      table,
      visible: false,
      row_count: null,
      error_code: error.code ?? null,
      error_message: error.message ?? null,
    };
  }

  const countResult = await supabase.from(table).select('*', { count: 'exact', head: true });
  return {
    table,
    visible: !countResult.error,
    row_count: countResult.error ? null : (countResult.count ?? 0),
    error_code: countResult.error?.code ?? null,
    error_message: countResult.error?.message ?? null,
  };
}

export async function buildWarehouseStatus() {
  const supabase = getSupabase();

  const [legacyTables, warehouseTables, sourceCountsResult] = await Promise.all([
    Promise.all(LEGACY_TABLES.map((table) => probeTable(table))),
    Promise.all(WAREHOUSE_TABLES.map((table) => probeTable(table))),
    supabase.from('institutions').select('source').limit(20000),
  ]);

  const issues: WarehouseIssue[] = [];
  const invisible = warehouseTables.filter((table) => !table.visible);
  const emptyVisible = warehouseTables.filter((table) => table.visible && table.row_count === 0);

  if (invisible.length > 0) {
    const cacheBlocked = invisible.some((table) => table.error_code === 'PGRST205');
    issues.push({
      severity: 'error',
      code: cacheBlocked ? 'WAREHOUSE_SCHEMA_CACHE_BLOCKED' : 'WAREHOUSE_TABLES_UNAVAILABLE',
      message: cacheBlocked
        ? `PostgREST cannot see ${invisible.length} warehouse tables yet. Reload the schema cache before running the backfill.`
        : `${invisible.length} warehouse tables are not reachable from the API layer.`,
    });
  }

  if (emptyVisible.length > 0) {
    issues.push({
      severity: invisible.length > 0 ? 'info' : 'warning',
      code: 'WAREHOUSE_TABLES_EMPTY',
      message: `${emptyVisible.length} visible warehouse tables are still empty and likely need the entity backfill.`,
    });
  }

  if (sourceCountsResult.error) {
    issues.push({
      severity: 'error',
      code: 'INSTITUTION_SOURCE_COUNT_FAILED',
      message: sourceCountsResult.error.message ?? 'Unable to read institutions for source counts.',
    });
  }

  const sourceCounts = new Map<string, number>();
  for (const row of sourceCountsResult.data ?? []) {
    const source = typeof row.source === 'string' ? row.source : 'unknown';
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }

  const status =
    invisible.length > 0 ? 'blocked' :
    emptyVisible.length > 0 ? 'partial' :
    'ready';

  return {
    checked_at: new Date().toISOString(),
    status,
    legacy_tables: legacyTables,
    warehouse_tables: warehouseTables,
    issues,
    source_counts: [...sourceCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([source, count]) => ({ source, count })),
    next_actions: invisible.length > 0
      ? ["Run: NOTIFY pgrst, 'reload schema';", 'Then rerun scripts/backfill-entity-warehouse.mjs']
      : emptyVisible.length > 0
        ? ['Run scripts/backfill-entity-warehouse.mjs', 'Recheck /api/qa/warehouse-status']
        : ['Warehouse tables are visible and seeded. Proceed to API smoke tests and next source ingests.'],
  };
}
