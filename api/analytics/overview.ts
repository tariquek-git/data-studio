import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getAnalyticsOverviewData } from '../../lib/entity-service.js';

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const data = await getAnalyticsOverviewData();

  // Aggregate by state
  const byStateMap: Record<string, { count: number; total_assets: number }> = {};
  const byCountryMap: Record<string, number> = {};

  for (const row of data.byState) {
    const st = row.state as string;
    if (!byStateMap[st]) byStateMap[st] = { count: 0, total_assets: 0 };
    byStateMap[st].count += 1;
    byStateMap[st].total_assets += Number(row.total_assets) || 0;
  }

  const byState = Object.entries(byStateMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([state, stats]) => ({ state, ...stats }));

  // Aggregate by charter type
  const byCharterMap: Record<string, number> = {};
  for (const row of data.byCharter) {
    const ct = row.charter_type as string;
    byCharterMap[ct] = (byCharterMap[ct] || 0) + 1;
  }

  // Aggregate by regulator
  const byRegulatorMap: Record<string, number> = {};
  for (const row of data.byRegulator) {
    const reg = row.regulator as string;
    byRegulatorMap[reg] = (byRegulatorMap[reg] || 0) + 1;
  }

  // Compute asset totals
  let totalAssetsSum = 0;
  let assetCount = 0;
  for (const row of data.assets) {
    totalAssetsSum += Number(row.total_assets) || 0;
    assetCount += 1;
  }

  // Source + country breakdown
  const bySourceMap: Record<string, number> = {};
  for (const row of data.bySource) {
    const source = row.source as string;
    bySourceMap[source] = (bySourceMap[source] || 0) + 1;
    const country = (row.country as string | null) ?? 'US';
    byCountryMap[country] = (byCountryMap[country] || 0) + 1;
  }

  // Source registry summary
  const sourceRegistrySummary = { tracked: 0, active: 0, pending: 0, unavailable: 0 };
  const sourcePosture: Array<{
    source_key: string;
    status: string;
    institution_count: number | null;
    data_as_of: string | null;
    last_synced_at: string | null;
  }> = [];

  sourceRegistrySummary.tracked = data.dataSources.length;
  for (const row of data.dataSources) {
    const status = row.status as string;
    if (status === 'active') sourceRegistrySummary.active += 1;
    if (status === 'pending') sourceRegistrySummary.pending += 1;
    if (status === 'unavailable') sourceRegistrySummary.unavailable += 1;
    sourcePosture.push({
      source_key: row.source_key as string,
      status,
      institution_count: 'institution_count' in row ? Number((row as { institution_count?: number | null }).institution_count ?? 0) : null,
      data_as_of: 'data_as_of' in row ? ((row as { data_as_of?: string | null }).data_as_of ?? null) : null,
      last_synced_at: 'last_synced_at' in row ? ((row as { last_synced_at?: string | null }).last_synced_at ?? null) : null,
    });
  }

  const overview = {
    total_institutions: data.totalActive,
    total_by_source: bySourceMap,
    total_by_country: byCountryMap,
    total_by_charter_type: byCharterMap,
    total_assets_sum: totalAssetsSum,
    avg_assets: assetCount > 0 ? Math.round(totalAssetsSum / assetCount) : 0,
    by_state: byState,
    by_regulator: byRegulatorMap,
    source_registry: sourceRegistrySummary,
    source_posture: sourcePosture,
    warehouse_summary: {
      registry_entities: data.registryCount,
      entity_relationships: data.relationshipCount,
      charter_events: data.charterEventCount,
      failure_events: data.failureEventCount,
      macro_series: data.macroSeriesCount,
    },
  };

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json(overview);
});
