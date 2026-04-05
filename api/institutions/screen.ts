import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === '42P01' ||
    maybe.code === '42703' ||
    maybe.code === 'PGRST205' ||
    /relation .* does not exist/i.test(maybe.message ?? '') ||
    /schema cache/i.test(maybe.message ?? '')
  );
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  // ─── Parse params ────────────────────────────────────────────────────────
  const assetMin     = req.query.asset_min     ? Number(req.query.asset_min)     : null;
  const assetMax     = req.query.asset_max     ? Number(req.query.asset_max)     : null;
  const depositMin   = req.query.deposit_min   ? Number(req.query.deposit_min)   : null;
  const depositMax   = req.query.deposit_max   ? Number(req.query.deposit_max)   : null;
  const roaMin       = req.query.roa_min       ? Number(req.query.roa_min)       : null;
  const roaMax       = req.query.roa_max       ? Number(req.query.roa_max)       : null;
  const roeMin       = req.query.roe_min       ? Number(req.query.roe_min)       : null;
  const roeMax       = req.query.roe_max       ? Number(req.query.roe_max)       : null;
  const equityRatioMin = req.query.equity_ratio_min ? Number(req.query.equity_ratio_min) : null;
  const ldrMin       = req.query.loan_to_deposit_min ? Number(req.query.loan_to_deposit_min) : null;
  const ldrMax       = req.query.loan_to_deposit_max ? Number(req.query.loan_to_deposit_max) : null;
  const ccProgram    = req.query.cc_program    === 'true'  ? true
                     : req.query.cc_program    === 'false' ? false
                     : null;
  const ccMin        = req.query.cc_min        ? Number(req.query.cc_min)        : null;
  const activeOnly   = req.query.active_only !== 'false'; // default true
  const craRating    = req.query.cra_rating    ? (req.query.cra_rating as string).split(',').map(Number).filter(Boolean) : [];
  const sources      = (req.query.source       as string || '').split(',').filter(Boolean);
  const charterTypes = (req.query.charter_type as string || '').split(',').filter(Boolean);
  const states       = (req.query.state        as string || '').split(',').filter(Boolean);

  const sortBy       = (req.query.sort_by as string) || 'total_assets';
  const sortOrder    = (req.query.sort_order as string) === 'asc';
  const limit        = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset       = Math.max(0, Number(req.query.offset) || 0);

  const depositGrowthMin = req.query.deposit_growth_min ? Number(req.query.deposit_growth_min) : null;

  // ─── Build base query ────────────────────────────────────────────────────
  let query = supabase
    .from('institutions')
    .select('*', { count: 'exact' });

  if (activeOnly) query = query.eq('active', true);

  // Simple column filters
  if (assetMin   != null) query = query.gte('total_assets',   assetMin);
  if (assetMax   != null) query = query.lte('total_assets',   assetMax);
  if (depositMin != null) query = query.gte('total_deposits', depositMin);
  if (depositMax != null) query = query.lte('total_deposits', depositMax);
  if (roaMin     != null) query = query.gte('roa',            roaMin);
  if (roaMax     != null) query = query.lte('roa',            roaMax);
  if (roeMin     != null) query = query.gte('roi',            roeMin);
  if (roeMax     != null) query = query.lte('roi',            roeMax);
  if (ccProgram  === true)  query = query.gt('credit_card_loans', 0);
  if (ccProgram  === false) query = query.or('credit_card_loans.is.null,credit_card_loans.eq.0');
  if (ccMin      != null) query = query.gte('credit_card_loans', ccMin);

  if (sources.length)      query = query.in('source', sources);
  if (charterTypes.length) query = query.in('charter_type', charterTypes);
  if (states.length)       query = query.in('state', states);

  // Computed ratio filters: equity_ratio = equity_capital / total_assets
  // These can't be filtered in Supabase directly without a generated column;
  // we post-filter after fetching (see below) — fetching extra rows to compensate.
  const needsPostFilter = equityRatioMin != null || ldrMin != null || ldrMax != null || craRating.length > 0 || depositGrowthMin != null;

  // Sort
  const allowedSorts = ['total_assets', 'total_deposits', 'roa', 'roi', 'net_income', 'credit_card_loans', 'name'];
  const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'total_assets';
  query = query.order(safeSortBy, { ascending: sortOrder, nullsFirst: false });

  // For post-filtered queries, fetch more rows to ensure enough results after filtering
  const fetchLimit  = needsPostFilter ? Math.min(2000, limit * 10) : limit;
  const fetchOffset = needsPostFilter ? 0 : offset;
  query = query.range(fetchOffset, fetchOffset + fetchLimit - 1);

  const { data: institutions, count, error } = await query;

  if (error) {
    console.error('Screen error:', error);
    return res.status(500).json({ error: 'Screener query failed' });
  }

  let results = institutions || [];

  // ─── Post-filters ────────────────────────────────────────────────────────

  if (equityRatioMin != null) {
    results = results.filter((inst: any) => {
      if (!inst.total_assets || inst.equity_capital == null) return false;
      return (inst.equity_capital / inst.total_assets) * 100 >= equityRatioMin;
    });
  }

  if (ldrMin != null || ldrMax != null) {
    results = results.filter((inst: any) => {
      if (!inst.total_deposits || inst.total_loans == null) return false;
      const ldr = (inst.total_loans / inst.total_deposits) * 100;
      if (ldrMin != null && ldr < ldrMin) return false;
      if (ldrMax != null && ldr > ldrMax) return false;
      return true;
    });
  }

  if (craRating.length > 0) {
    const institutionIds = results
      .map((inst: any) => inst.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

    let appliedWarehouseFacts = false;
    if (institutionIds.length > 0) {
      const { data: craFacts, error: craFactsError } = await supabase
        .from('entity_facts')
        .select('entity_id, fact_value_number, observed_at')
        .eq('entity_table', 'institutions')
        .eq('fact_key', 'cra_rating')
        .in('entity_id', institutionIds)
        .order('observed_at', { ascending: false });

      if (!craFactsError && craFacts) {
        appliedWarehouseFacts = true;
        const latestCraByEntity = new Map<string, number>();
        for (const row of craFacts as Array<{ entity_id: string; fact_value_number: number | null }>) {
          if (!latestCraByEntity.has(row.entity_id) && row.fact_value_number != null) {
            latestCraByEntity.set(row.entity_id, Number(row.fact_value_number));
          }
        }

        results = results.filter((inst: any) => {
          const latestCra = latestCraByEntity.get(inst.id);
          return latestCra != null && craRating.includes(latestCra);
        });
      } else if (craFactsError && !isMissingTableError(craFactsError)) {
        console.warn(`CRA fact filter fallback triggered: ${craFactsError.message}`);
      }
    }

    if (!appliedWarehouseFacts) {
      results = results.filter((inst: any) => {
        if (!inst.raw_data) return false;
        const crara = Number(inst.raw_data['CRARA']);
        return craRating.includes(crara);
      });
    }
  }

  // Deposit growth YoY: requires financial_history lookup
  // Only applied if depositGrowthMin is set and we have a manageable result set
  if (depositGrowthMin != null && results.length > 0) {
    type DepositHistoryRow = {
      cert_number: number;
      period: string;
      total_deposits: number;
    };

    const certNumbers = results
      .map((inst: any) => inst.cert_number)
      .filter((cert: unknown): cert is number => typeof cert === 'number' && Number.isFinite(cert));

    if (certNumbers.length > 0) {
      const { data: history } = await supabase
        .from('financial_history')
        .select('cert_number, period, total_deposits')
        .in('cert_number', certNumbers)
        .not('total_deposits', 'is', null)
        .order('period', { ascending: false });

      if (history && history.length > 0) {
        // For each institution, find latest deposit and deposit ~1yr ago
        const byCert: Record<string, DepositHistoryRow[]> = {};
        for (const row of history as DepositHistoryRow[]) {
          const key = String(row.cert_number);
          if (!byCert[key]) byCert[key] = [];
          byCert[key].push(row);
        }

        results = results.filter((inst: any) => {
          if (typeof inst.cert_number !== 'number') return false;
          const rows = byCert[String(inst.cert_number)];
          if (!rows || rows.length < 2) return false;

          const latest = rows[0];
          if (!latest.total_deposits) return false;

          // Find a row approximately 1 year prior (within ±60 days)
          const targetDate = new Date(latest.period);
          targetDate.setFullYear(targetDate.getFullYear() - 1);
          const targetTime = targetDate.getTime();
          const prior = rows.find((row) => {
            const periodTime = new Date(row.period).getTime();
            const diff = Math.abs(periodTime - targetTime);
            return diff <= 60 * 24 * 60 * 60 * 1000;
          });

          if (!prior || !prior.total_deposits) return false;
          const growth = ((latest.total_deposits - prior.total_deposits) / prior.total_deposits) * 100;
          return growth >= depositGrowthMin;
        });
      }
    }
  }

  // Apply offset+limit after post-filtering
  const totalCount = needsPostFilter ? results.length : (count || 0);
  const paged = needsPostFilter ? results.slice(offset, offset + limit) : results;

  // ─── Build applied_filters summary ──────────────────────────────────────
  const appliedFilters: Record<string, unknown> = {};
  if (assetMin   != null) appliedFilters.asset_min   = assetMin;
  if (assetMax   != null) appliedFilters.asset_max   = assetMax;
  if (depositMin != null) appliedFilters.deposit_min = depositMin;
  if (depositMax != null) appliedFilters.deposit_max = depositMax;
  if (roaMin     != null) appliedFilters.roa_min     = roaMin;
  if (roaMax     != null) appliedFilters.roa_max     = roaMax;
  if (roeMin     != null) appliedFilters.roe_min     = roeMin;
  if (roeMax     != null) appliedFilters.roe_max     = roeMax;
  if (equityRatioMin != null) appliedFilters.equity_ratio_min = equityRatioMin;
  if (ldrMin     != null) appliedFilters.loan_to_deposit_min  = ldrMin;
  if (ldrMax     != null) appliedFilters.loan_to_deposit_max  = ldrMax;
  if (ccProgram  != null) appliedFilters.cc_program  = ccProgram;
  if (ccMin      != null) appliedFilters.cc_min      = ccMin;
  if (craRating.length)   appliedFilters.cra_rating  = craRating;
  if (sources.length)     appliedFilters.source      = sources;
  if (charterTypes.length) appliedFilters.charter_type = charterTypes;
  if (states.length)      appliedFilters.state       = states;
  if (depositGrowthMin != null) appliedFilters.deposit_growth_min = depositGrowthMin;
  appliedFilters.active_only = activeOnly;

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  return res.json({
    institutions: paged,
    total_count: totalCount,
    offset,
    limit,
    applied_filters: appliedFilters,
  });
});
