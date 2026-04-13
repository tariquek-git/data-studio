import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

function parseCertNumber(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const certNumber = parseCertNumber(req.query.certNumber);
  if (certNumber == null) {
    return res.status(400).json({ error: 'Invalid cert_number parameter' });
  }

  // Fetch institution
  const { data: institution, error: instError } = await supabase
    .from('institutions')
    .select('*')
    .eq('cert_number', certNumber)
    .single();

  if (instError || !institution) {
    return res.status(404).json({ error: 'Institution not found' });
  }

  // Fetch financial history (last 20 periods)
  const { data: financialHistory, error: histError } = await supabase
    .from('financial_history')
    .select('*')
    .eq('cert_number', certNumber)
    .order('period', { ascending: false })
    .limit(20);

  if (histError) {
    console.error('Financial history fetch error:', histError);
  }

  // Fetch branch count
  const { count: branchCount, error: branchError } = await supabase
    .from('branches')
    .select('*', { count: 'exact', head: true })
    .eq('cert_number', certNumber);

  if (branchError) {
    console.error('Branch count fetch error:', branchError);
  }

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  return res.json({
    institution,
    financial_history: financialHistory || [],
    branch_count: branchCount || 0,
  });
});
