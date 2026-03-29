import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

interface RawRow {
  roa: number | null;
  roi: number | null;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  equity_capital: number | null;
  net_income: number | null;
  num_branches: number | null;
}

interface MetricRow {
  roa: number;
  roe: number;
  equity_ratio: number;
  loan_to_deposit: number;
  log_assets: number;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return Math.max(-1, Math.min(1, num / den));
}

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('institutions')
    .select('roa, roi, total_assets, total_deposits, total_loans, equity_capital, net_income, num_branches')
    .eq('active', true)
    .not('roa', 'is', null)
    .not('roi', 'is', null)
    .gt('total_assets', 0)
    .limit(5000);

  if (error) throw error;

  const rows: MetricRow[] = [];
  for (const r of (data ?? []) as RawRow[]) {
    const assets = Number(r.total_assets);
    const deposits = Number(r.total_deposits);
    const loans = Number(r.total_loans);
    const equity = Number(r.equity_capital);

    if (
      !isFinite(assets) || assets <= 0 ||
      !isFinite(deposits) || deposits <= 0 ||
      !isFinite(loans) ||
      !isFinite(equity)
    ) continue;

    rows.push({
      roa: Number(r.roa),
      roe: Number(r.roi),
      equity_ratio: equity / assets,
      loan_to_deposit: loans / deposits,
      log_assets: Math.log10(assets),
    });
  }

  const metricKeys: (keyof MetricRow)[] = ['roa', 'roe', 'equity_ratio', 'loan_to_deposit', 'log_assets'];
  const metricLabels = ['ROA', 'ROE', 'Equity Ratio', 'Loan/Deposit', 'Log Assets'];

  const columns: Record<keyof MetricRow, number[]> = {
    roa: [],
    roe: [],
    equity_ratio: [],
    loan_to_deposit: [],
    log_assets: [],
  };
  for (const row of rows) {
    for (const k of metricKeys) {
      columns[k].push(row[k]);
    }
  }

  const matrix: number[][] = metricKeys.map(rowKey =>
    metricKeys.map(colKey => {
      if (rowKey === colKey) return 1;
      return Math.round(pearson(columns[rowKey], columns[colKey]) * 10000) / 10000;
    })
  );

  res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=14400');
  return res.json({
    metrics: metricLabels,
    matrix,
    count: rows.length,
  });
});
