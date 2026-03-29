import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();
  const metric = (req.query.metric as string) || 'roa';
  const order = (req.query.order as string) === 'asc' ? true : false;
  const minAssets = Number(req.query.min_assets || 100_000_000); // default $100M+
  const limit = Math.min(25, Number(req.query.limit || 10));

  const allowedMetrics = ['roa', 'roi', 'total_assets', 'total_deposits', 'net_income', 'num_branches', 'credit_card_loans'];
  const safeMetric = allowedMetrics.includes(metric) ? metric : 'roa';

  const [topRes, concentrationRes] = await Promise.all([
    // Top/bottom performers
    supabase
      .from('institutions')
      .select('cert_number, name, state, charter_type, total_assets, roa, roi, net_income, num_branches, credit_card_loans')
      .eq('active', true)
      .not(safeMetric, 'is', null)
      .gte('total_assets', minAssets)
      .order(safeMetric, { ascending: order, nullsFirst: false })
      .limit(limit),

    // Asset concentration: fetch sorted by total_assets DESC
    supabase
      .from('institutions')
      .select('name, cert_number, total_assets')
      .eq('active', true)
      .not('total_assets', 'is', null)
      .order('total_assets', { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  const institutions = topRes.data || [];

  // Build concentration tiers from sorted data
  const sorted = concentrationRes.data || [];
  const totalAssetsAll = sorted.reduce((s, r: any) => s + Number(r.total_assets), 0);
  const top1 = sorted.slice(0, 1).reduce((s, r: any) => s + Number(r.total_assets), 0);
  const top5 = sorted.slice(0, 5).reduce((s, r: any) => s + Number(r.total_assets), 0);
  const top10 = sorted.slice(0, 10).reduce((s, r: any) => s + Number(r.total_assets), 0);
  const top25 = sorted.slice(0, 25).reduce((s, r: any) => s + Number(r.total_assets), 0);

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.json({
    metric: safeMetric,
    institutions,
    concentration: {
      total: totalAssetsAll,
      top1_pct: totalAssetsAll > 0 ? (top1 / totalAssetsAll) * 100 : 0,
      top5_pct: totalAssetsAll > 0 ? (top5 / totalAssetsAll) * 100 : 0,
      top10_pct: totalAssetsAll > 0 ? (top10 / totalAssetsAll) * 100 : 0,
      top25_pct: totalAssetsAll > 0 ? (top25 / totalAssetsAll) * 100 : 0,
      top_institutions: sorted.slice(0, 10).map((r: any, i: number) => ({
        rank: i + 1,
        name: r.name || `Cert #${r.cert_number}`,
        cert_number: r.cert_number,
        total_assets: Number(r.total_assets),
        pct_of_total: totalAssetsAll > 0 ? (Number(r.total_assets) / totalAssetsAll) * 100 : 0,
        cumulative_pct: totalAssetsAll > 0
          ? (sorted.slice(0, i + 1).reduce((s: number, x: any) => s + Number(x.total_assets), 0) / totalAssetsAll) * 100
          : 0,
      })),
    },
  });
});
