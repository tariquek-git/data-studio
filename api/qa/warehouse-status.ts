import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { buildWarehouseStatus } from '../../lib/warehouse-readiness.js';

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const payload = await buildWarehouseStatus();
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.json(payload);
});
