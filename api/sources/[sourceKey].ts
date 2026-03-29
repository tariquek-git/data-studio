import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSourceByKey } from '../../lib/source-service.js';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const sourceKey = String(req.query.sourceKey ?? '').trim();
  if (!sourceKey) {
    return res.status(400).json({ error: 'Missing source key' });
  }

  const source = await getSourceByKey(sourceKey);
  if (!source) {
    return res.status(404).json({ error: 'Source not found' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return res.json({ source });
});
