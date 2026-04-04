import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { listSourceSyncStatuses } from '../../lib/source-sync.js';

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const syncs = listSourceSyncStatuses();

  return res.json({
    checked_at: new Date().toISOString(),
    total: syncs.length,
    ready: syncs.filter((sync) => sync.ready).length,
    blocked: syncs.filter((sync) => !sync.ready).length,
    syncs,
  });
});
