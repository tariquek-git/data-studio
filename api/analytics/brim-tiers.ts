import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('institutions')
    .select('brim_tier')
    .not('brim_tier', 'is', null);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const row of data || []) {
    const tier = row.brim_tier as string;
    if (tier in counts) counts[tier]++;
  }

  return res.json({ counts, total: (data || []).length });
});
