import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler';
import { getSupabase } from '../../lib/supabase';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  // Run all count queries in parallel
  const [
    totalRes,
    fdicRes,
    ncuaRes,
    stateDataRes,
    charterDataRes,
    regulatorDataRes,
    assetDataRes,
  ] = await Promise.all([
    // Total active institutions
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('active', true),

    // FDIC count
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'fdic')
      .eq('active', true),

    // NCUA count
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'ncua')
      .eq('active', true),

    // By-state data: fetch state + total_assets for all active institutions
    supabase
      .from('institutions')
      .select('state, total_assets')
      .eq('active', true)
      .not('state', 'is', null),

    // Charter type data
    supabase
      .from('institutions')
      .select('charter_type')
      .eq('active', true)
      .not('charter_type', 'is', null),

    // Regulator data
    supabase
      .from('institutions')
      .select('regulator')
      .eq('active', true)
      .not('regulator', 'is', null),

    // Asset totals — fetch total_assets for sum/avg
    supabase
      .from('institutions')
      .select('total_assets')
      .eq('active', true)
      .not('total_assets', 'is', null),
  ]);

  // Aggregate by state
  const byStateMap: Record<string, { count: number; total_assets: number }> = {};
  if (stateDataRes.data) {
    for (const row of stateDataRes.data) {
      const st = row.state as string;
      if (!byStateMap[st]) {
        byStateMap[st] = { count: 0, total_assets: 0 };
      }
      byStateMap[st].count += 1;
      byStateMap[st].total_assets += Number(row.total_assets) || 0;
    }
  }

  // Sort by count descending, take top 50
  const byState = Object.entries(byStateMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([state, stats]) => ({ state, ...stats }));

  // Aggregate by charter type
  const byCharterMap: Record<string, number> = {};
  if (charterDataRes.data) {
    for (const row of charterDataRes.data) {
      const ct = row.charter_type as string;
      byCharterMap[ct] = (byCharterMap[ct] || 0) + 1;
    }
  }

  // Aggregate by regulator
  const byRegulatorMap: Record<string, number> = {};
  if (regulatorDataRes.data) {
    for (const row of regulatorDataRes.data) {
      const reg = row.regulator as string;
      byRegulatorMap[reg] = (byRegulatorMap[reg] || 0) + 1;
    }
  }

  // Compute asset totals
  let totalAssetsSum = 0;
  let assetCount = 0;
  if (assetDataRes.data) {
    for (const row of assetDataRes.data) {
      totalAssetsSum += Number(row.total_assets) || 0;
      assetCount += 1;
    }
  }

  const overview = {
    total_institutions: totalRes.count || 0,
    total_by_source: {
      fdic: fdicRes.count || 0,
      ncua: ncuaRes.count || 0,
    },
    total_by_charter_type: byCharterMap,
    total_assets_sum: totalAssetsSum,
    avg_assets: assetCount > 0 ? Math.round(totalAssetsSum / assetCount) : 0,
    by_state: byState,
    by_regulator: byRegulatorMap,
  };

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.json(overview);
});
