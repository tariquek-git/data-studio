import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return maybe.code === '42P01' || /relation .* does not exist/i.test(maybe.message ?? '');
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const country = String(req.query.country ?? '').trim();
  const sourceKey = String(req.query.source_key ?? '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const { data, error } = await supabase
    .from('macro_series')
    .select('source_key, series_key, display_name, country, frequency, period, value, unit')
    .order('period', { ascending: false })
    .limit(limit * 6);

  if (error) {
    if (isMissingTableError(error)) {
      return res.json({ series: [], total: 0 });
    }
    throw error;
  }

  const rows = (data ?? []).filter((row) => {
    if (country && row.country !== country) return false;
    if (sourceKey && row.source_key !== sourceKey) return false;
    if (!q) return true;
    return [row.display_name, row.series_key, row.source_key]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return res.json({
    series: rows.slice(0, limit),
    total: rows.length,
  });
});
