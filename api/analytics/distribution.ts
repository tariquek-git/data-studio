import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

function buildHistogram(values: number[], min: number, max: number, bins: number): { bin: string; min: number; max: number; count: number }[] {
  const step = (max - min) / bins;
  const result = Array.from({ length: bins }, (_, i) => ({
    bin: `${(min + i * step).toFixed(2)}`,
    min: min + i * step,
    max: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / step)));
    result[idx].count++;
  }
  return result;
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('institutions')
    .select('roa, roi, total_assets, total_deposits, total_loans, equity_capital')
    .eq('active', true)
    .not('roa', 'is', null)
    .not('roi', 'is', null)
    .gte('roa', -3)
    .lte('roa', 5)
    .gte('roi', -30)
    .lte('roi', 60);

  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];

  const roaValues = rows.map((r: any) => Number(r.roa));
  const roiValues = rows.map((r: any) => Number(r.roi));

  // Efficiency ratio: non-interest expense / (net interest income + non-interest income)
  // We approximate: (assets * 0.03) as proxy, but better to use raw_data
  // For now use loan-to-deposit ratio distribution
  const ldrValues = rows
    .filter((r: any) => r.total_deposits > 0 && r.total_loans > 0)
    .map((r: any) => (Number(r.total_loans) / Number(r.total_deposits)) * 100);

  const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b) / arr.length : 0;
  const std = (arr: number[]) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  };
  const percentile = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[idx] ?? 0;
  };

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json({
    roa: {
      histogram: buildHistogram(roaValues, -1.5, 3.5, 25),
      mean: mean(roaValues),
      std: std(roaValues),
      p25: percentile(roaValues, 25),
      p50: percentile(roaValues, 50),
      p75: percentile(roaValues, 75),
      count: roaValues.length,
    },
    roi: {
      histogram: buildHistogram(roiValues, -15, 40, 25),
      mean: mean(roiValues),
      std: std(roiValues),
      p25: percentile(roiValues, 25),
      p50: percentile(roiValues, 50),
      p75: percentile(roiValues, 75),
      count: roiValues.length,
    },
    loan_to_deposit: {
      histogram: buildHistogram(ldrValues.filter(v => v < 150), 0, 150, 20),
      mean: mean(ldrValues),
      p50: percentile(ldrValues, 50),
      count: ldrValues.length,
    },
  });
});
