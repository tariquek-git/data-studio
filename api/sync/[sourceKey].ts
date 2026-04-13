import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSourceSyncStatus, hasSourceSync, runSourceSync } from '../../lib/source-sync.js';
import { checkAdminRequest } from '../../lib/admin-auth.js';

function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return /^(1|true|yes)$/i.test(value);
}

export default apiHandler({ methods: ['GET', 'POST'] }, async (req: VercelRequest, res: VercelResponse) => {
  const sourceKey = String(req.query.sourceKey ?? '').trim();

  if (!sourceKey) {
    return res.status(400).json({ error: 'Missing source key' });
  }

  if (!hasSourceSync(sourceKey)) {
    return res.status(404).json({ error: `No sync is registered for ${sourceKey}` });
  }

  const sync = getSourceSyncStatus(sourceKey);
  if (!sync) {
    return res.status(404).json({ error: `No sync is registered for ${sourceKey}` });
  }

  if (req.method === 'GET') {
    return res.json({ source_key: sourceKey, sync });
  }

  const auth = checkAdminRequest(req);
  if (!auth.allowed) {
    return res.status(auth.statusCode).json({ message: auth.message });
  }

  const dryRun =
    parseBoolean(req.query.dry_run) ||
    parseBoolean((req.body as { dry_run?: unknown } | undefined)?.dry_run);

  if (dryRun && !sync.supports_dry_run) {
    return res.status(400).json({
      error: `${sourceKey} does not currently support dry runs`,
      source_key: sourceKey,
      sync,
    });
  }

  if (!dryRun && !sync.ready) {
    return res.status(409).json({
      error: `Sync prerequisites are not satisfied for ${sourceKey}`,
      source_key: sourceKey,
      sync,
    });
  }

  const execution = await runSourceSync(sourceKey, { dryRun });

  return res.status(execution.exit_code === 0 ? 200 : 500).json({
    success: execution.exit_code === 0,
    source_key: sourceKey,
    sync,
    execution,
  });
});
