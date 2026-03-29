/**
 * GET /api/analytics/benchmarks
 *
 * Returns live industry-average benchmarks computed from all active FDIC-insured
 * institutions in our database. Used by institution profile pages for peer comparison.
 * No hardcoded values — everything computed from actual data.
 *
 * Cached 2 hours (data changes quarterly).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

function avg(values: number[]): number | null {
  const valid = values.filter(v => v != null && isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function median(values: number[]): number | null {
  const valid = values.filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

function percentile(values: number[], p: number): number | null {
  const valid = values.filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const idx = (p / 100) * (valid.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return valid[lo] + (valid[hi] - valid[lo]) * (idx - lo);
}

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  // Fetch all active institutions with financial metrics
  const { data, error } = await supabase
    .from('institutions')
    .select('roa, roi, total_assets, total_loans, total_deposits, equity_capital, net_income')
    .eq('active', true)
    .eq('source', 'fdic')
    .not('roa', 'is', null)
    .not('roi', 'is', null)
    .gt('total_assets', 0);

  if (error) throw error;

  const rows = data ?? [];

  const roas = rows.map(r => r.roa as number).filter(v => v > -5 && v < 10);
  const roes = rows.map(r => r.roi as number).filter(v => v > -50 && v < 80);

  const equityRatios = rows
    .filter(r => r.equity_capital != null && (r.total_assets as number) > 0)
    .map(r => ((r.equity_capital as number) / (r.total_assets as number)) * 100)
    .filter(v => v > 0 && v < 50);

  const loanToDeposits = rows
    .filter(r => r.total_loans != null && (r.total_deposits as number) > 0)
    .map(r => ((r.total_loans as number) / (r.total_deposits as number)) * 100)
    .filter(v => v > 0 && v < 200);

  const result = {
    institution_count: rows.length,
    roa: {
      mean: avg(roas),
      median: median(roas),
      p25: percentile(roas, 25),
      p75: percentile(roas, 75),
    },
    roe: {
      mean: avg(roes),
      median: median(roes),
      p25: percentile(roes, 25),
      p75: percentile(roes, 75),
    },
    equity_ratio: {
      mean: avg(equityRatios),
      median: median(equityRatios),
    },
    loan_to_deposit: {
      mean: avg(loanToDeposits),
      median: median(loanToDeposits),
    },
    computed_at: new Date().toISOString(),
  };

  res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
  res.json(result);
});
