import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  // Parse query params
  const q = (req.query.q as string || '').trim();
  const states = (req.query.states as string || '').split(',').filter(Boolean);
  const sources = (req.query.source as string || '').split(',').filter(Boolean);
  const charterTypes = (req.query.charter_types as string || '').split(',').filter(Boolean);
  const regulators = (req.query.regulators as string || '').split(',').filter(Boolean);
  const minAssets = req.query.min_assets ? Number(req.query.min_assets) : null;
  const maxAssets = req.query.max_assets ? Number(req.query.max_assets) : null;
  const minDeposits = req.query.min_deposits ? Number(req.query.min_deposits) : null;
  const maxDeposits = req.query.max_deposits ? Number(req.query.max_deposits) : null;
  const minBranches = req.query.min_branches ? Number(req.query.min_branches) : null;
  const maxBranches = req.query.max_branches ? Number(req.query.max_branches) : null;
  const minRoa = req.query.min_roa ? Number(req.query.min_roa) : null;
  const maxRoa = req.query.max_roa ? Number(req.query.max_roa) : null;
  const minRoi = req.query.min_roi ? Number(req.query.min_roi) : null;
  const maxRoi = req.query.max_roi ? Number(req.query.max_roi) : null;
  const hasCreditCards =
    req.query.has_credit_cards === 'true' ||
    req.query.has_credit_card_program === 'true';
  const minBrimScore = req.query.min_brim_score ? Number(req.query.min_brim_score) : null;
  const brimTier = (req.query.brim_tier as string || '').trim().toUpperCase() || null;
  const sortBy = (req.query.sort_by as string) || 'total_assets';
  const sortDir = (req.query.sort_dir as string) === 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 25));
  const offset = (page - 1) * perPage;

  // Build query — join bank_capabilities for brim_score/tier/card_portfolio_size
  let query = supabase
    .from('institutions')
    .select(`
      *,
      bank_capabilities (
        brim_score, brim_tier, card_portfolio_size, issues_credit_cards,
        core_processor, agent_bank_program
      )
    `, { count: 'exact' })
    .eq('active', true);

  // Text search
  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,holding_company.ilike.%${q}%`);
  }

  // Filters
  if (states.length > 0) query = query.in('state', states);
  if (sources.length > 0) query = query.in('source', sources);
  if (charterTypes.length > 0) query = query.in('charter_type', charterTypes);
  if (regulators.length > 0) query = query.in('regulator', regulators);
  if (minAssets != null) query = query.gte('total_assets', minAssets);
  if (maxAssets != null) query = query.lte('total_assets', maxAssets);
  if (minDeposits != null) query = query.gte('total_deposits', minDeposits);
  if (maxDeposits != null) query = query.lte('total_deposits', maxDeposits);
  if (minBranches != null) query = query.gte('num_branches', minBranches);
  if (maxBranches != null) query = query.lte('num_branches', maxBranches);
  if (minRoa != null) query = query.gte('roa', minRoa);
  if (maxRoa != null) query = query.lte('roa', maxRoa);
  if (minRoi != null) query = query.gte('roi', minRoi);
  if (maxRoi != null) query = query.lte('roi', maxRoi);
  if (hasCreditCards) query = query.gt('credit_card_loans', 0);

  // Brim filters (applied post-query since bank_capabilities is a join)
  // minBrimScore and brimTier filtered in JS below after fetching

  // Sort + paginate
  const allowedSorts = [
    'name', 'total_assets', 'total_deposits', 'total_loans',
    'num_branches', 'roi', 'roa', 'net_income', 'credit_card_loans',
    'equity_capital', 'state',
  ];
  const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'total_assets';

  query = query
    .order(safeSortBy, { ascending: sortDir, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  const { data: institutions, count, error } = await query;

  if (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Search failed' });
  }

  // Flatten bank_capabilities join into top-level fields for convenience
  let pageInstitutions = (institutions || []).map((inst: any) => {
    const cap = Array.isArray(inst.bank_capabilities) ? inst.bank_capabilities[0] : inst.bank_capabilities;
    return {
      ...inst,
      brim_score: cap?.brim_score ?? null,
      brim_tier: cap?.brim_tier ?? null,
      card_portfolio_size: cap?.card_portfolio_size ?? inst.credit_card_loans ?? null,
      core_processor: cap?.core_processor ?? null,
      agent_bank_program: cap?.agent_bank_program ?? null,
      bank_capabilities: undefined,
    };
  });

  // Apply brim filters in JS (bank_capabilities is a joined table, not filterable server-side easily)
  if (minBrimScore != null) pageInstitutions = pageInstitutions.filter((i: any) => (i.brim_score ?? 0) >= minBrimScore!);
  if (brimTier) pageInstitutions = pageInstitutions.filter((i: any) => i.brim_tier === brimTier);

  // Compute aggregations from the returned page (lightweight — full aggs via RPC if needed)
  const totalAssetsSum = pageInstitutions.reduce((sum: number, i: any) => sum + (i.total_assets || 0), 0);
  const stateMap: Record<string, number> = {};
  const charterMap: Record<string, number> = {};
  for (const inst of pageInstitutions) {
    if ((inst as any).state) stateMap[(inst as any).state] = (stateMap[(inst as any).state] || 0) + 1;
    if ((inst as any).charter_type) charterMap[(inst as any).charter_type] = (charterMap[(inst as any).charter_type] || 0) + 1;
  }
  const aggregations = {
    total_count: count || 0,
    total_assets_sum: totalAssetsSum,
    total_deposits_sum: pageInstitutions.reduce((sum: number, i: any) => sum + (i.total_deposits || 0), 0),
    avg_assets: pageInstitutions.length > 0 ? totalAssetsSum / pageInstitutions.length : 0,
    by_state: stateMap,
    by_charter_type: charterMap,
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.json({
    institutions: institutions || [],
    total: count || 0,
    page,
    per_page: perPage,
    aggregations,
  });
});
