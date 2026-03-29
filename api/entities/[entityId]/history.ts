import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../../lib/api-handler.js';
import { getEntityById, getEntityHistory } from '../../../lib/entity-service.js';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const entityId = String(req.query.entityId ?? '').trim();
  if (!entityId) {
    return res.status(400).json({ error: 'Missing entity ID' });
  }

  const entity = await getEntityById(entityId);
  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const history = await getEntityHistory(entityId);
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return res.json({ history });
});
