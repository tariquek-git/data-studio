import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { buildAdminDataHealth } from '../../lib/admin-data-health.js';
import { checkAdminRequest } from '../../lib/admin-auth.js';

function parseConfidence(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const auth = checkAdminRequest(req);
  if (!auth.allowed) {
    return res.status(auth.statusCode).json({ message: auth.message });
  }

  const response = await buildAdminDataHealth({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : null,
    sourceKey: typeof req.query.source_key === 'string' ? req.query.source_key : null,
    minConfidence: parseConfidence(typeof req.query.min_confidence === 'string' ? req.query.min_confidence : undefined),
    issuesOnly: parseBoolean(typeof req.query.issues_only === 'string' ? req.query.issues_only : undefined),
  });

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  return res.json(response);
});
