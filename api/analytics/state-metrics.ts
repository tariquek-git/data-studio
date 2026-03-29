import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

interface RawRow {
  state: string | null;
  roa: number | null;
  roi: number | null;
  total_assets: number | null;
  total_deposits: number | null;
  equity_capital: number | null;
  total_loans: number | null;
}

interface StateAccum {
  roa_sum: number;
  roa_count: number;
  roi_sum: number;
  roi_count: number;
  assets_sum: number;
  assets_count: number;
  ltd_sum: number;
  ltd_count: number;
  eq_ratio_sum: number;
  eq_ratio_count: number;
  institution_count: number;
}

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('institutions')
    .select('state, roa, roi, total_assets, total_deposits, equity_capital, total_loans')
    .eq('active', true)
    .not('state', 'is', null);

  if (error) throw error;

  const stateMap: Record<string, StateAccum> = {};

  for (const r of (data ?? []) as RawRow[]) {
    const state = r.state as string;
    if (!state) continue;

    if (!stateMap[state]) {
      stateMap[state] = {
        roa_sum: 0, roa_count: 0,
        roi_sum: 0, roi_count: 0,
        assets_sum: 0, assets_count: 0,
        ltd_sum: 0, ltd_count: 0,
        eq_ratio_sum: 0, eq_ratio_count: 0,
        institution_count: 0,
      };
    }

    const acc = stateMap[state];
    acc.institution_count += 1;

    if (r.roa != null && isFinite(Number(r.roa))) {
      acc.roa_sum += Number(r.roa);
      acc.roa_count += 1;
    }
    if (r.roi != null && isFinite(Number(r.roi))) {
      acc.roi_sum += Number(r.roi);
      acc.roi_count += 1;
    }

    const assets = Number(r.total_assets);
    if (isFinite(assets) && assets > 0) {
      acc.assets_sum += assets;
      acc.assets_count += 1;

      const equity = Number(r.equity_capital);
      if (isFinite(equity)) {
        acc.eq_ratio_sum += equity / assets;
        acc.eq_ratio_count += 1;
      }
    }

    const deposits = Number(r.total_deposits);
    const loans = Number(r.total_loans);
    if (isFinite(deposits) && deposits > 0 && isFinite(loans)) {
      acc.ltd_sum += loans / deposits;
      acc.ltd_count += 1;
    }
  }

  const states = Object.entries(stateMap)
    .filter(([, acc]) => acc.institution_count >= 5)
    .map(([state, acc]) => ({
      state,
      avg_roa: acc.roa_count > 0 ? acc.roa_sum / acc.roa_count : null,
      avg_roi: acc.roi_count > 0 ? acc.roi_sum / acc.roi_count : null,
      avg_loan_to_deposit: acc.ltd_count > 0 ? acc.ltd_sum / acc.ltd_count : null,
      avg_equity_ratio: acc.eq_ratio_count > 0 ? acc.eq_ratio_sum / acc.eq_ratio_count : null,
      institution_count: acc.institution_count,
      total_assets_sum: acc.assets_sum,
      avg_assets: acc.assets_count > 0 ? acc.assets_sum / acc.assets_count : null,
    }))
    .sort((a, b) => (b.avg_roa ?? -Infinity) - (a.avg_roa ?? -Infinity));

  res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=14400');
  return res.json({ states });
});
