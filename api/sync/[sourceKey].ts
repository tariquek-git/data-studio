import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSourceSyncStatus, runSourceSync } from '../../lib/source-sync.js';

function authorized(req: VercelRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return req.headers.authorization === `Bearer ${cronSecret}`;
}

export default apiHandler({ methods: ['GET', 'POST'] }, async (req: VercelRequest, res: VercelResponse) => {
  const sourceKey = String(req.query.sourceKey ?? '').trim();
  if (!sourceKey) {
    return res.status(400).json({ error: 'Missing source key' });
  }

  const sync = getSourceSyncStatus(sourceKey);
  if (!sync) {
    return res.status(404).json({ error: 'Sync source not found' });
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.json({ sync });
  }

  if (!authorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sync.supported) {
    return res.status(400).json({ error: `Source ${sourceKey} does not support backend sync` });
  }

  if (!sync.ready) {
    return res.status(409).json({
      error: `Source ${sourceKey} is missing required prerequisites`,
      sync,
    });
  }

  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
  if (dryRun && !sync.supports_dry_run) {
    return res.status(400).json({
      error: `Source ${sourceKey} does not currently support dry_run`,
      sync,
    });
  }

  const result = await runSourceSync(sourceKey, { dryRun });
  const statusCode = result.exit_code === 0 ? 200 : 500;
  return res.status(statusCode).json({
    success: result.exit_code === 0,
    sync,
    result,
  });
});
