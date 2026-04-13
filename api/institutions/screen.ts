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

function parseNumber(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntParam(value: unknown, fallback: number, min = 1, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseIntList(value: unknown): number[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((num) => !Number.isNaN(num));
}

interface ScreenRow {
  id: string;
  cert_number: number;
  name: string;
  state: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  equity_capital: number | null;
  credit_card_loans: number | null;
  roa: number | null;
  roi: number | null;
  raw_data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  // ─── Parse params ────────────────────────────────────────────────────────
  const assetMin = parseNumber(req.query.asset_min);
  const assetMax = parseNumber(req.query.asset_max);
  const depositMin = parseNumber(req.query.deposit_min);
  const depositMax = parseNumber(req.query.deposit_max);
  const roaMin = parseNumber(req.query.roa_min);
  const roaMax = parseNumber(req.query.roa_max);
  const roeMin = parseNumber(req.query.roe_min);
  const roeMax = parseNumber(req.query.roe_max);
  const equityRatioMin = parseNumber(req.query.equity_ratio_min);
  const ldrMin = parseNumber(req.query.loan_to_deposit_min);
  const ldrMax = parseNumber(req.query.loan_to_deposit_max);
  const ccProgram =
    req.query.cc_program === 'true' ? true
      : req.query.cc_program === 'false' ? false
      : null;
  const ccMin = parseNumber(req.query.cc_min);
  const activeOnly = req.query.active_only !== 'false';
  const craRating = parseIntList(req.query.cra_rating);
  const sources = (req.query.source as string || '').split(',').filter(Boolean);
  const charterTypes = (req.query.charter_type as string || '').split(',').filter(Boolean);
  const states = (req.query.state as string || '').split(',').filter(Boolean);

  const sortBy = (req.query.sort_by as string) || 'total_assets';
  const sortOrder = (req.query.sort_order as string) === 'asc';
  const limit = parseIntParam(req.query.limit, 50, 1, 200);
  const offset = parseIntParam(req.query.offset, 0, 0);

  const depositGrowthMin = parseNumber(req.query.deposit_growth_min);

  const needsPostFilter =
    equityRatioMin != null ||
    ldrMin != null ||
    ldrMax != null ||
    craRating.length > 0 ||
    depositGrowthMin != null;

  const buildScreenQuery = (rangeStart?: number, rangeEnd?: number, withCount = false) => {
    let query = supabase
      .from('institutions')
      .select('*', { count: withCount ? 'exact' : undefined });

    if (activeOnly) query = query.eq('active', true);

    if (assetMin != null) query = query.gte('total_assets', assetMin);
    if (assetMax != null) query = query.lte('total_assets', assetMax);
    if (depositMin != null) query = query.gte('total_deposits', depositMin);
    if (depositMax != null) query = query.lte('total_deposits', depositMax);
    if (roaMin != null) query = query.gte('roa', roaMin);
    if (roaMax != null) query = query.lte('roa', roaMax);
    if (roeMin != null) query = query.gte('roi', roeMin);
    if (roeMax != null) query = query.lte('roi', roeMax);
    if (ccProgram === true) query = query.gt('credit_card_loans', 0);
    if (ccProgram === false) query = query.or('credit_card_loans.is.null,credit_card_loans.eq.0');
    if (ccMin != null) query = query.gte('credit_card_loans', ccMin);

    if (sources.length) query = query.in('source', sources);
    if (charterTypes.length) query = query.in('charter_type', charterTypes);
    if (states.length) query = query.in('state', states);

    const allowedSorts = ['total_assets', 'total_deposits', 'roa', 'roi', 'net_income', 'credit_card_loans', 'name'];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'total_assets';
    query = query.order(safeSortBy, { ascending: sortOrder, nullsFirst: false });

    if (rangeStart != null && rangeEnd != null) {
      query = query.range(rangeStart, rangeEnd);
    }

    return query;
  };

  let results: ScreenRow[] = [];
  let totalCount = 0;

  if (needsPostFilter) {
    const fetchLimit = 500;
    let cursor = 0;
    while (true) {
      const { data: batch, error } = await buildScreenQuery(cursor, cursor + fetchLimit - 1, false);
      if (error) {
        console.error('Screen error:', error);
        return res.status(500).json({ error: 'Screener query failed' });
      }

      results.push(...((batch ?? []) as ScreenRow[]));
      cursor += fetchLimit;

      if (!batch || batch.length < fetchLimit) {
        break;
      }
    }
  } else {
    const { data: institutions, count, error } = await buildScreenQuery(offset, offset + limit - 1, true);
    if (error) {
      console.error('Screen error:', error);
      return res.status(500).json({ error: 'Screener query failed' });
    }

    results = (institutions ?? []) as ScreenRow[];
    totalCount = count || 0;
  }

  // ─── Post-filters ────────────────────────────────────────────────────────
  if (equityRatioMin != null) {
    results = results.filter((inst) => {
      if (!inst.total_assets || inst.equity_capital == null) return false;
      return (inst.equity_capital / inst.total_assets) * 100 >= equityRatioMin;
    });
  }

  if (ldrMin != null || ldrMax != null) {
    results = results.filter((inst) => {
      if (!inst.total_deposits || inst.total_loans == null) return false;
      const ldr = (inst.total_loans / inst.total_deposits) * 100;
      if (ldrMin != null && ldr < ldrMin) return false;
      if (ldrMax != null && ldr > ldrMax) return false;
      return true;
    });
  }

  if (craRating.length > 0) {
    const institutionIds = results
      .map((inst) => inst.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

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

        results = results.filter((inst) => {
          const latestCra = latestCraByEntity.get(inst.id);
          return latestCra != null && craRating.includes(latestCra);
        });
      } else if (craFactsError && !isMissingTableError(craFactsError)) {
        console.warn(`CRA fact filter fallback triggered: ${craFactsError.message}`);
      }
    }

    if (!appliedWarehouseFacts) {
      results = results.filter((inst) => {
        if (!inst.raw_data) return false;
        const crara = Number(inst.raw_data['CRARA']);
        return craRating.includes(crara);
      });
    }
  }

  if (depositGrowthMin != null && results.length > 0) {
    type DepositHistoryRow = {
      cert_number: number;
      period: string;
      total_deposits: number;
    };

    const certNumbers = results
      .map((inst) => inst.cert_number)
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

        results = results.filter((inst) => {
          if (typeof inst.cert_number !== 'number') return false;
          const rows = byCert[String(inst.cert_number)];
          if (!rows || rows.length < 2) return false;

          const latest = rows[0];
          if (!latest.total_deposits) return false;

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

  if (needsPostFilter) {
    totalCount = results.length;
    results = results.slice(offset, offset + limit);
  }

  // ─── Build applied_filters summary ──────────────────────────────────────
  const appliedFilters: Record<string, unknown> = {};
  if (assetMin != null) appliedFilters.asset_min = assetMin;
  if (assetMax != null) appliedFilters.asset_max = assetMax;
  if (depositMin != null) appliedFilters.deposit_min = depositMin;
  if (depositMax != null) appliedFilters.deposit_max = depositMax;
  if (roaMin != null) appliedFilters.roa_min = roaMin;
  if (roaMax != null) appliedFilters.roa_max = roaMax;
  if (roeMin != null) appliedFilters.roe_min = roeMin;
  if (roeMax != null) appliedFilters.roe_max = roeMax;
  if (equityRatioMin != null) appliedFilters.equity_ratio_min = equityRatioMin;
  if (ldrMin != null) appliedFilters.loan_to_deposit_min = ldrMin;
  if (ldrMax != null) appliedFilters.loan_to_deposit_max = ldrMax;
  if (ccProgram != null) appliedFilters.cc_program = ccProgram;
  if (ccMin != null) appliedFilters.cc_min = ccMin;
  if (craRating.length) appliedFilters.cra_rating = craRating;
  if (sources.length) appliedFilters.source = sources;
  if (charterTypes.length) appliedFilters.charter_type = charterTypes;
  if (states.length) appliedFilters.state = states;
  if (depositGrowthMin != null) appliedFilters.deposit_growth_min = depositGrowthMin;
  appliedFilters.active_only = activeOnly;

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  return res.json({
    institutions: results,
    total_count: totalCount,
    offset,
    limit,
    applied_filters: appliedFilters,
  });
});
