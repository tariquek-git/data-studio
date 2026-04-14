import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

/** Strip PostgREST special characters from user input before interpolating into .or() filters. */
function sanitizePostgrestText(text: string): string {
  return text.replace(/[(),\\.*"'%]/g, '');
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

interface BankCapabilities {
  brim_score: number | null;
  brim_tier: string | null;
  card_portfolio_size: number | null;
  issues_credit_cards: boolean | null;
  core_processor: string | null;
  agent_bank_program: string | null;
}

interface InstitutionRow {
  id: string;
  cert_number: number;
  name: string;
  state: string | null;
  city: string | null;
  charter_type: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  num_branches: number | null;
  roa: number | null;
  roi: number | null;
  net_income: number | null;
  credit_card_loans: number | null;
  equity_capital: number | null;
  source: string;
  country: string;
  active: boolean;
  bd_exclusion_reason: string | null;
  raw_data: Record<string, unknown> | null;
  bank_capabilities: BankCapabilities | BankCapabilities[] | null;
  [key: string]: unknown;
}

interface FlattenedInstitution {
  id: string;
  cert_number: number;
  name: string;
  state: string | null;
  city: string | null;
  charter_type: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  num_branches: number | null;
  roa: number | null;
  roi: number | null;
  net_income: number | null;
  credit_card_loans: number | null;
  equity_capital: number | null;
  source: string;
  country: string;
  brim_score: number | null;
  brim_tier: string | null;
  card_portfolio_size: number | null;
  core_processor: string | null;
  agent_bank_program: string | null;
  [key: string]: unknown;
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  // Parse query params
  const q = (req.query.q as string || '').trim();
  const states = (req.query.states as string || '').split(',').filter(Boolean);
  const sources = (req.query.source as string || '').split(',').filter(Boolean);
  const charterTypes = (req.query.charter_types as string || '').split(',').filter(Boolean);
  const regulators = (req.query.regulators as string || '').split(',').filter(Boolean);
  const minAssets = parseNumber(req.query.min_assets);
  const maxAssets = parseNumber(req.query.max_assets);
  const minDeposits = parseNumber(req.query.min_deposits);
  const maxDeposits = parseNumber(req.query.max_deposits);
  const minBranches = parseNumber(req.query.min_branches);
  const maxBranches = parseNumber(req.query.max_branches);
  const minRoa = parseNumber(req.query.min_roa);
  const maxRoa = parseNumber(req.query.max_roa);
  const minRoi = parseNumber(req.query.min_roi);
  const maxRoi = parseNumber(req.query.max_roi);
  const hasCreditCards =
    req.query.has_credit_cards === 'true' ||
    req.query.has_credit_card_program === 'true';
  const equityRatioMin = parseNumber(req.query.equity_ratio_min);
  const ldrMin = parseNumber(req.query.ldr_min);
  const ldrMax = parseNumber(req.query.ldr_max);
  const craRating = parseIntList(req.query.cra_rating);
  const minBrimScore = parseNumber(req.query.min_brim_score);
  const brimTiers = (req.query.brim_tier as string || '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const excludeBdExclusions = req.query.exclude_bd_exclusions === 'true';
  const migrationTargetsOnly = req.query.migration_targets_only === 'true';
  const sortBy = (req.query.sort_by as string) || 'total_assets';
  const sortDir = (req.query.sort_dir as string) === 'asc';
  const page = parseIntParam(req.query.page, 1, 1);
  const perPage = parseIntParam(req.query.per_page, 25, 1, 100);
  const offset = (page - 1) * perPage;

  const needsPostFilter =
    minBrimScore != null ||
    brimTiers.length > 0 ||
    migrationTargetsOnly ||
    equityRatioMin != null ||
    ldrMin != null ||
    ldrMax != null ||
    craRating.length > 0;

  const buildInstitutionsQuery = (rangeStart?: number, rangeEnd?: number, withCount = false) => {
    let query = supabase
      .from('institutions')
      .select(`
        *,
        bank_capabilities (
          brim_score, brim_tier, card_portfolio_size, issues_credit_cards,
          core_processor, agent_bank_program
        )
      `, { count: withCount ? 'exact' : undefined })
      .eq('active', true);

    // Text search — sanitize user input before interpolating into PostgREST filter
    if (q) {
      const safe = sanitizePostgrestText(q);
      if (safe.length > 0) {
        const term = `%${safe}%`;
        query = query.or(`name.ilike.${term},city.ilike.${term},holding_company.ilike.${term}`);
      }
    }

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
    if (excludeBdExclusions) query = query.is('bd_exclusion_reason', null);

    const allowedSorts = [
      'name', 'total_assets', 'total_deposits', 'total_loans',
      'num_branches', 'roi', 'roa', 'net_income', 'credit_card_loans',
      'equity_capital', 'state',
    ];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'total_assets';
    query = query.order(safeSortBy, { ascending: sortDir, nullsFirst: false });

    if (rangeStart != null && rangeEnd != null) {
      query = query.range(rangeStart, rangeEnd);
    }

    return query;
  };

  const flattenAndMap = (institutions: InstitutionRow[] | null) =>
    ((institutions ?? []) as InstitutionRow[]).map((inst) => {
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

  const applyPostFilters = (rows: FlattenedInstitution[]) => {
    let filtered = rows;
    if (minBrimScore != null) {
      filtered = filtered.filter((i) => (i.brim_score ?? 0) >= minBrimScore);
    }
    if (brimTiers.length > 0) {
      filtered = filtered.filter((i) => i.brim_tier != null && brimTiers.includes(i.brim_tier));
    }
    if (migrationTargetsOnly) {
      filtered = filtered.filter((i) => i.agent_bank_program != null && i.agent_bank_program !== '');
    }
    if (equityRatioMin != null) {
      filtered = filtered.filter((i) => {
        if (!i.equity_capital || !i.total_assets || i.total_assets === 0) return false;
        return (i.equity_capital / i.total_assets) * 100 >= equityRatioMin;
      });
    }
    if (ldrMin != null) {
      filtered = filtered.filter((i) => {
        if (!i.total_loans || !i.total_deposits || i.total_deposits === 0) return false;
        return (i.total_loans / i.total_deposits) * 100 >= ldrMin;
      });
    }
    if (ldrMax != null) {
      filtered = filtered.filter((i) => {
        if (!i.total_loans || !i.total_deposits || i.total_deposits === 0) return false;
        return (i.total_loans / i.total_deposits) * 100 <= ldrMax;
      });
    }
    if (craRating.length > 0) {
      filtered = filtered.filter((i) => {
        const raw = (i as Record<string, unknown>).raw_data;
        if (!raw || typeof raw !== 'object') return false;
        const crara = (raw as Record<string, unknown>)['CRARA'];
        if (crara == null) return false;
        const rating = typeof crara === 'number' ? crara : Number.parseInt(String(crara), 10);
        return !Number.isNaN(rating) && craRating.includes(rating);
      });
    }
    return filtered;
  };

  let total = 0;
  let pageInstitutions: FlattenedInstitution[] = [];

  if (needsPostFilter) {
    // For derived brim/migration filters, filter after full page candidate resolution so
    // `offset/page` semantics remain stable across post-filtered results.
    const fetchLimit = 500;
    let cursor = 0;
    const filteredInstitutions: FlattenedInstitution[] = [];

    while (true) {
      const { data: batch, error } = await buildInstitutionsQuery(cursor, cursor + fetchLimit - 1, false);
      if (error) {
        console.error('Search error:', error);
        return res.status(500).json({ error: 'Search failed' });
      }

      const mappedBatch = applyPostFilters(flattenAndMap(batch as InstitutionRow[]));
      filteredInstitutions.push(...mappedBatch);
      cursor += fetchLimit;

      if (!batch || batch.length < fetchLimit) {
        break;
      }
    }

    total = filteredInstitutions.length;
    pageInstitutions = filteredInstitutions.slice(offset, offset + perPage);
  } else {
    const { data: institutions, count, error } = await buildInstitutionsQuery(offset, offset + perPage - 1, true);
    if (error) {
      console.error('Search error:', error);
      return res.status(500).json({ error: 'Search failed' });
    }

    total = count || 0;
    pageInstitutions = flattenAndMap(institutions as InstitutionRow[]);
  }

  // Compute aggregations from the filtered result set
  const totalAssetsSum = pageInstitutions.reduce((sum, i) => sum + (i.total_assets || 0), 0);
  const stateMap: Record<string, number> = {};
  const charterMap: Record<string, number> = {};
  for (const inst of pageInstitutions) {
    if (inst.state) stateMap[inst.state] = (stateMap[inst.state] || 0) + 1;
    if (inst.charter_type) charterMap[inst.charter_type] = (charterMap[inst.charter_type] || 0) + 1;
  }
  const aggregations = {
    total_count: total,
    filtered_count: pageInstitutions.length,
    total_assets_sum: totalAssetsSum,
    total_deposits_sum: pageInstitutions.reduce((sum, i) => sum + (i.total_deposits || 0), 0),
    avg_assets: pageInstitutions.length > 0 ? totalAssetsSum / pageInstitutions.length : 0,
    by_state: stateMap,
    by_charter_type: charterMap,
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.json({
    institutions: pageInstitutions,
    total,
    filtered_total: total,
    page,
    per_page: perPage,
    aggregations,
  });
});
