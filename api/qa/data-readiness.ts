import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { buildWarehouseStatus } from '../../lib/warehouse-readiness.js';
import { listSources } from '../../lib/source-service.js';
import { listSourceSyncStatuses } from '../../lib/source-sync.js';

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const [warehouse, sources] = await Promise.all([
    buildWarehouseStatus(),
    listSources(),
  ]);
  const sourceSyncs = listSourceSyncStatuses();
  const blockedSyncs = sourceSyncs.filter((sync) => !sync.ready);

  const activeSources = sources.sources.filter((source) => source.status === 'active');
  const loadedSources = sources.sources.filter((source) => source.loaded);
  const pendingSources = sources.sources.filter((source) => source.status === 'pending');

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.json({
    checked_at: new Date().toISOString(),
    overall_status:
      warehouse.status === 'blocked' ? 'blocked' :
      pendingSources.length > 0 ? 'in_progress' :
      'ready',
    warehouse,
    sources: {
      total: sources.total,
      loaded: loadedSources.length,
      active: activeSources.length,
      pending: pendingSources.length,
      unavailable: sources.summary.unavailable,
      sync_ready: sourceSyncs.filter((sync) => sync.ready).length,
      sync_blocked: blockedSyncs.length,
      top_loaded: loadedSources
        .sort((a, b) => (b.record_count ?? 0) - (a.record_count ?? 0))
        .slice(0, 10)
        .map((source) => ({
          source_key: source.source_key,
          display_name: source.display_name,
          record_count: source.record_count,
          data_as_of: source.data_as_of,
          last_synced_at: source.last_synced_at,
        })),
      blocked_syncs: blockedSyncs.map((sync) => ({
        source_key: sync.source_key,
        endpoint: sync.endpoint,
        missing_requirements: sync.requirements.filter((requirement) => !requirement.ready && !requirement.optional),
      })),
    },
    next_actions: [
      ...warehouse.next_actions,
      'Use GET /api/qa/source-sync to inspect runnable loaders and missing prerequisites.',
      'Use POST /api/sync/:sourceKey to trigger backend sync scripts when a source is ready.',
    ],
  });
});
