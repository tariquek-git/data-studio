import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { listSourceSyncStatuses } from '../../lib/source-sync.js';

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const sources = listSourceSyncStatuses();

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.json({
    sources,
    total: sources.length,
    ready: sources.filter((source) => source.ready).length,
    blocked: sources.filter((source) => source.supported && !source.ready).length,
  });
});
