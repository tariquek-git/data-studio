import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

interface OpportunityRow {
  id: string;
  cert_number: number;
  name: string;
  city: string | null;
  state: string | null;
  total_assets: number | null;
  credit_card_loans: number | null;
  agent_bank_program: string | null;
  core_processor: string | null;
  brim_score: number | null;
  opportunity_score: number | null;
  opportunity_type: string | null;
  opportunity_summary: string | null;
  opportunity_signals: unknown;
}

const VALID_OPPORTUNITY_TYPES = [
  'too_big_for_agent',
  'post_merger_window',
  'portfolio_acquirer',
  'core_conversion',
  'outgrowing_program',
] as const;

type OpportunityType = (typeof VALID_OPPORTUNITY_TYPES)[number];

function isValidOpportunityType(value: string): value is OpportunityType {
  return (VALID_OPPORTUNITY_TYPES as readonly string[]).includes(value);
}

export default apiHandler({ methods: ['GET'] }, async (req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const minScore = req.query.min_score ? Number(req.query.min_score) : null;
  const typeParam = req.query.type ? String(req.query.type) : null;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));

  if (typeParam !== null && !isValidOpportunityType(typeParam)) {
    return res.status(400).json({
      error: `Invalid opportunity type. Must be one of: ${VALID_OPPORTUNITY_TYPES.join(', ')}`,
    });
  }

  // Try institution_summary_mv first (includes opportunity columns when rebuilt).
  // Fall back to joining institutions + bank_capabilities if MV columns are missing.
  let rows: OpportunityRow[] | null = null;
  let total = 0;
  let usedFallback = false;

  // Attempt 1: query institution_summary_mv
  try {
    let mvQuery = supabase
      .from('institution_summary_mv')
      .select(
        'id,cert_number,name,city,state,total_assets,credit_card_loans,' +
        'agent_bank_program,core_processor,brim_score,' +
        'opportunity_score,opportunity_type,opportunity_summary,opportunity_signals',
        { count: 'exact' },
      )
      .not('opportunity_type', 'is', null);

    if (minScore !== null) {
      mvQuery = mvQuery.gte('opportunity_score', minScore);
    }
    if (typeParam !== null) {
      mvQuery = mvQuery.eq('opportunity_type', typeParam);
    }

    mvQuery = mvQuery
      .order('opportunity_score', { ascending: false, nullsFirst: false })
      .limit(limit);

    const { data, count, error } = await mvQuery;

    if (error) {
      // If the MV is missing the new columns (schema cache miss), fall through
      const isSchemaMiss =
        error.code === '42703' ||
        error.code === 'PGRST205' ||
        /column .* does not exist/i.test(error.message ?? '') ||
        /schema cache/i.test(error.message ?? '');
      if (!isSchemaMiss) throw error;
      usedFallback = true;
    } else {
      rows = (data ?? []) as unknown as OpportunityRow[];
      total = count ?? rows.length;
    }
  } catch (err: unknown) {
    const maybe = err as { code?: string; message?: string } | null;
    const isSchemaMiss =
      maybe?.code === '42703' ||
      maybe?.code === 'PGRST205' ||
      /column .* does not exist/i.test(maybe?.message ?? '') ||
      /schema cache/i.test(maybe?.message ?? '');
    if (!isSchemaMiss) throw err;
    usedFallback = true;
  }

  // Attempt 2: join institutions + bank_capabilities directly
  if (usedFallback || rows === null) {
    let bcQuery = supabase
      .from('bank_capabilities')
      .select(
        'cert_number,agent_bank_program,core_processor,brim_score,' +
        'opportunity_score,opportunity_type,opportunity_summary,opportunity_signals',
        { count: 'exact' },
      )
      .not('opportunity_type', 'is', null);

    if (minScore !== null) {
      bcQuery = bcQuery.gte('opportunity_score', minScore);
    }
    if (typeParam !== null) {
      bcQuery = bcQuery.eq('opportunity_type', typeParam);
    }

    bcQuery = bcQuery
      .order('opportunity_score', { ascending: false, nullsFirst: false })
      .limit(limit);

    const { data: bcData, count: bcCount, error: bcError } = await bcQuery;

    if (bcError) {
      console.error('Opportunities fallback query error:', bcError);
      return res.status(500).json({ error: 'Opportunity query failed' });
    }

    const bcRows = (bcData ?? []) as unknown as Array<{
      cert_number: number;
      agent_bank_program: string | null;
      core_processor: string | null;
      brim_score: number | null;
      opportunity_score: number | null;
      opportunity_type: string | null;
      opportunity_summary: string | null;
      opportunity_signals: unknown;
    }>;

    total = bcCount ?? bcRows.length;

    if (bcRows.length === 0) {
      rows = [];
    } else {
      // Enrich with institution data
      const certNumbers = bcRows.map((r) => r.cert_number);
      const { data: instData, error: instError } = await supabase
        .from('institutions')
        .select('id,cert_number,name,city,state,total_assets,credit_card_loans')
        .in('cert_number', certNumbers)
        .eq('active', true);

      if (instError) {
        console.error('Opportunities institutions enrichment error:', instError);
        return res.status(500).json({ error: 'Opportunity enrichment query failed' });
      }

      const instByCert = new Map<number, {
        id: string;
        name: string;
        city: string | null;
        state: string | null;
        total_assets: number | null;
        credit_card_loans: number | null;
      }>();
      for (const inst of instData ?? []) {
        instByCert.set(inst.cert_number as number, inst as {
          id: string;
          name: string;
          city: string | null;
          state: string | null;
          total_assets: number | null;
          credit_card_loans: number | null;
        });
      }

      rows = bcRows.map((bc) => {
        const inst = instByCert.get(bc.cert_number);
        return {
          id: inst?.id ?? '',
          cert_number: bc.cert_number,
          name: inst?.name ?? '',
          city: inst?.city ?? null,
          state: inst?.state ?? null,
          total_assets: inst?.total_assets ?? null,
          credit_card_loans: inst?.credit_card_loans ?? null,
          agent_bank_program: bc.agent_bank_program,
          core_processor: bc.core_processor,
          brim_score: bc.brim_score,
          opportunity_score: bc.opportunity_score,
          opportunity_type: bc.opportunity_type,
          opportunity_summary: bc.opportunity_summary,
          opportunity_signals: bc.opportunity_signals,
        };
      });
    }
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.json({
    opportunities: rows ?? [],
    total,
  });
});
