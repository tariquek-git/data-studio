import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

type Severity = 'info' | 'warning' | 'error';

interface WarehouseTableStatus {
  table: string;
  visible: boolean;
  row_count: number | null;
  error_code: string | null;
  error_message: string | null;
}

interface WarehouseIssue {
  severity: Severity;
  code: string;
  message: string;
}

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

  const countResult = await supabase.from(table).select('id', { count: 'exact', head: true });
  return {
    table,
    visible: true,
    row_count: countResult.error ? null : (countResult.count ?? 0),
    error_code: countResult.error?.code ?? null,
    error_message: countResult.error?.message ?? null,
  };
}

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const [warehouseTables, sourceCountsResult] = await Promise.all([
    Promise.all(WAREHOUSE_TABLES.map((table) => probeTable(table))),
    supabase.from('institutions').select('source').limit(10000),
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

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.json({
    checked_at: new Date().toISOString(),
    status,
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
  });
});
