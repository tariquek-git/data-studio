import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../../lib/api-handler';
import { getSupabase } from '../../../lib/supabase';

function getAssetBucket(assets: number | null): [number, number] {
  if (!assets) return [0, 100_000_000];
  if (assets < 100_000_000) return [0, 100_000_000];
  if (assets < 500_000_000) return [100_000_000, 500_000_000];
  if (assets < 1_000_000_000) return [500_000_000, 1_000_000_000];
  if (assets < 10_000_000_000) return [1_000_000_000, 10_000_000_000];
  if (assets < 50_000_000_000) return [10_000_000_000, 50_000_000_000];
  return [50_000_000_000, 999_999_999_999_999];
}

function getAssetBucketLabel(assets: number | null): string {
  if (!assets) return 'Under $100M';
  if (assets < 100_000_000) return 'Under $100M';
  if (assets < 500_000_000) return '$100M - $500M';
  if (assets < 1_000_000_000) return '$500M - $1B';
  if (assets < 10_000_000_000) return '$1B - $10B';
  if (assets < 50_000_000_000) return '$10B - $50B';
  return 'Over $50B';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], target: number): number {
  if (values.length === 0) return 50;
  const below = values.filter(v => v < target).length;
  return Math.round((below / values.length) * 100);
}

export default apiHandler({ methods: ['GET'] }, async (req, res) => {
  const certNumber = Number(req.query.certNumber);
  if (!certNumber) return res.status(400).json({ error: 'Invalid cert number' });

  const supabase = getSupabase();

  // Get target institution
  const { data: institution, error: instError } = await supabase
    .from('institutions')
    .select('*')
    .eq('cert_number', certNumber)
    .single();

  if (instError || !institution) {
    return res.status(404).json({ error: 'Institution not found' });
  }

  // Determine peer group
  const [minAssets, maxAssets] = getAssetBucket(institution.total_assets);
  const charterType = institution.charter_type || 'commercial';
  const bucketLabel = getAssetBucketLabel(institution.total_assets);

  // Fetch peers
  const { data: peers, error: peerError } = await supabase
    .from('institutions')
    .select('total_assets, total_deposits, total_loans, roa, roi, equity_capital, net_income, credit_card_loans, num_branches')
    .eq('charter_type', charterType)
    .eq('active', true)
    .gte('total_assets', minAssets)
    .lt('total_assets', maxAssets);

  if (peerError) {
    return res.status(500).json({ error: 'Failed to fetch peers' });
  }

  const peerCount = peers?.length || 0;

  // Compute peer medians
  const validRoa = (peers || []).filter(p => p.roa != null).map(p => p.roa as number);
  const validRoi = (peers || []).filter(p => p.roi != null).map(p => p.roi as number);
  const validEquityRatio = (peers || [])
    .filter(p => p.equity_capital != null && p.total_assets != null && p.total_assets > 0)
    .map(p => (p.equity_capital as number) / (p.total_assets as number) * 100);
  const validLoanToDeposit = (peers || [])
    .filter(p => p.total_loans != null && p.total_deposits != null && p.total_deposits > 0)
    .map(p => (p.total_loans as number) / (p.total_deposits as number) * 100);
  const validEfficiency = (peers || [])
    .filter(p => p.net_income != null && p.total_assets != null && p.total_assets > 0)
    .map(p => (p.net_income as number) / (p.total_assets as number) * 100);
  const validAssets = (peers || []).filter(p => p.total_assets != null).map(p => p.total_assets as number);

  const peerMedian = {
    roa: median(validRoa),
    roi: median(validRoi),
    equity_ratio: median(validEquityRatio),
    loan_to_deposit: median(validLoanToDeposit),
    efficiency: median(validEfficiency),
    asset_size_percentile: 50, // median by definition
  };

  // Compute percentile rankings for target institution
  const instEquityRatio = institution.equity_capital && institution.total_assets
    ? (institution.equity_capital / institution.total_assets) * 100
    : null;

  function formatCurrency(v: number | null): string {
    if (v == null) return '\u2014';
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toLocaleString()}`;
  }

  function formatPct(v: number | null): string {
    if (v == null) return '\u2014';
    return `${v.toFixed(2)}%`;
  }

  const rankings = [
    {
      metric: 'Total Assets',
      value: institution.total_assets,
      formatted_value: formatCurrency(institution.total_assets),
      percentile: percentile(validAssets, institution.total_assets || 0),
      peer_group_label: `${charterType.replace(/_/g, ' ')} banks, ${bucketLabel}`,
    },
    {
      metric: 'Total Deposits',
      value: institution.total_deposits,
      formatted_value: formatCurrency(institution.total_deposits),
      percentile: percentile(
        (peers || []).filter(p => p.total_deposits != null).map(p => p.total_deposits as number),
        institution.total_deposits || 0
      ),
      peer_group_label: `${charterType.replace(/_/g, ' ')} banks, ${bucketLabel}`,
    },
    {
      metric: 'ROA',
      value: institution.roa,
      formatted_value: formatPct(institution.roa),
      percentile: percentile(validRoa, institution.roa || 0),
      peer_group_label: `${charterType.replace(/_/g, ' ')} banks, ${bucketLabel}`,
    },
    {
      metric: 'ROE',
      value: institution.roi,
      formatted_value: formatPct(institution.roi),
      percentile: percentile(validRoi, institution.roi || 0),
      peer_group_label: `${charterType.replace(/_/g, ' ')} banks, ${bucketLabel}`,
    },
    {
      metric: 'Net Income',
      value: institution.net_income,
      formatted_value: formatCurrency(institution.net_income),
      percentile: percentile(
        (peers || []).filter(p => p.net_income != null).map(p => p.net_income as number),
        institution.net_income || 0
      ),
      peer_group_label: `${charterType.replace(/_/g, ' ')} banks, ${bucketLabel}`,
    },
    {
      metric: 'Branches',
      value: institution.num_branches,
      formatted_value: institution.num_branches?.toLocaleString() || '\u2014',
      percentile: percentile(
        (peers || []).filter(p => p.num_branches != null).map(p => p.num_branches as number),
        institution.num_branches || 0
      ),
      peer_group_label: `${charterType.replace(/_/g, ' ')} banks, ${bucketLabel}`,
    },
  ];

  // Add credit card ranking only if institution has CC loans
  if (institution.credit_card_loans && institution.credit_card_loans > 0) {
    rankings.push({
      metric: 'Credit Card Loans',
      value: institution.credit_card_loans,
      formatted_value: formatCurrency(institution.credit_card_loans),
      percentile: percentile(
        (peers || []).filter(p => p.credit_card_loans != null && p.credit_card_loans > 0).map(p => p.credit_card_loans as number),
        institution.credit_card_loans
      ),
      peer_group_label: `${charterType.replace(/_/g, ' ')} banks, ${bucketLabel}`,
    });
  }

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  return res.json({
    peer_group: {
      charter_type: charterType,
      asset_bucket: bucketLabel,
      peer_count: peerCount,
    },
    peer_median: peerMedian,
    rankings,
  });
});
