import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { buildWarehouseStatus } from '../../lib/warehouse-readiness.js';
import { listSources } from '../../lib/source-service.js';

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const [warehouse, sources] = await Promise.all([
    buildWarehouseStatus(),
    listSources(),
  ]);

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
    },
    next_actions: [
      ...warehouse.next_actions,
      'Run scripts/sync-occ.mjs after the OCC source constraint migration.',
      'Advance FFIEC CDR and FFIEC NIC once credentials/files are available.',
    ],
  });
});
