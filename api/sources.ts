import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../lib/api-handler.js';
import { listSources } from '../lib/source-service.js';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const result = await listSources({
    q: typeof req.query.q === 'string' ? req.query.q : '',
    country: typeof req.query.country === 'string' ? req.query.country : null,
    category: typeof req.query.category === 'string' ? req.query.category : null,
    status: typeof req.query.status === 'string' ? req.query.status : null,
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return res.json(result);
});
