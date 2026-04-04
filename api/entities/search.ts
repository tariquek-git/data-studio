import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { searchEntities } from '../../lib/entity-service.js';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const result = await searchEntities({
    q: typeof req.query.q === 'string' ? req.query.q : '',
    country: typeof req.query.country === 'string' ? req.query.country : null,
    profile_kind: typeof req.query.profile_kind === 'string' ? req.query.profile_kind : null,
    regulator: typeof req.query.regulator === 'string' ? req.query.regulator : null,
    source_authority: typeof req.query.source_authority === 'string' ? req.query.source_authority : null,
    charter_family: typeof req.query.charter_family === 'string' ? req.query.charter_family : null,
    business_role: typeof req.query.business_role === 'string' ? req.query.business_role : null,
    status: typeof req.query.status === 'string' ? req.query.status : null,
    page: Number(req.query.page) || 1,
    perPage: Number(req.query.per_page) || 24,
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return res.json(result);
});
