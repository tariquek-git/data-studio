import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();
  const charterType = req.query.charter_type as string | undefined;
  const state = req.query.state as string | undefined;
  const sizeBucket = req.query.size_bucket as string | undefined;

  // Asset size bucket ranges
  const buckets: Record<string, [number, number | null]> = {
    mega:         [250_000_000_000, null],      // $250B+
    large:        [10_000_000_000, 250_000_000_000],
    regional:     [1_000_000_000, 10_000_000_000],
    community:    [100_000_000, 1_000_000_000],
    small:        [0, 100_000_000],
  };

  let query = supabase
    .from('institutions')
    .select('cert_number, name, state, charter_type, total_assets, roa, roi, num_branches, total_deposits, net_income')
    .eq('active', true)
    .not('roa', 'is', null)
    .not('roi', 'is', null)
    .not('total_assets', 'is', null)
    .gt('total_assets', 0)
    // Filter to reasonable ROA/ROE range (remove extreme outliers)
    .gte('roa', -5)
    .lte('roa', 10)
    .gte('roi', -50)
    .lte('roi', 80)
    .limit(2000);

  if (charterType) query = query.eq('charter_type', charterType);
  if (state) query = query.eq('state', state);
  if (sizeBucket && buckets[sizeBucket]) {
    const [min, max] = buckets[sizeBucket];
    query = query.gte('total_assets', min);
    if (max !== null) query = query.lt('total_assets', max);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Group by asset size bucket for coloring/filtering
  const institutions = (data || []).map((inst: any) => {
    const assets = inst.total_assets as number;
    let bucket = 'small';
    if (assets >= 250_000_000_000) bucket = 'mega';
    else if (assets >= 10_000_000_000) bucket = 'large';
    else if (assets >= 1_000_000_000) bucket = 'regional';
    else if (assets >= 100_000_000) bucket = 'community';

    return {
      cert_number: inst.cert_number,
      name: inst.name || `Cert #${inst.cert_number}`,
      state: inst.state,
      charter_type: inst.charter_type,
      total_assets: assets,
      roa: inst.roa,
      roi: inst.roi,
      num_branches: inst.num_branches,
      size_bucket: bucket,
      // Log scale radius for bubble sizing (1-50 range)
      bubble_r: Math.max(3, Math.min(50, Math.log10(assets / 1_000_000) * 5)),
    };
  });

  // Compute summary stats
  const roaValues = institutions.map((i: any) => i.roa).sort((a: number, b: number) => a - b);
  const roiValues = institutions.map((i: any) => i.roi).sort((a: number, b: number) => a - b);
  const median = (arr: number[]) => arr.length > 0 ? arr[Math.floor(arr.length / 2)] : 0;
  const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json({
    institutions,
    count: institutions.length,
    stats: {
      median_roa: median(roaValues),
      mean_roa: mean(roaValues),
      median_roi: median(roiValues),
      mean_roi: mean(roiValues),
    },
  });
});
