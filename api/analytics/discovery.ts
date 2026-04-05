import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

const CA_SOURCES = ['osfi', 'rpaa', 'ciro', 'fintrac'];
const US_SOURCES = ['fdic', 'ncua'];

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === '42P01' ||
    maybe.code === 'PGRST205' ||
    /relation .* does not exist/i.test(maybe.message ?? '') ||
    /schema cache/i.test(maybe.message ?? '')
  );
}

export default apiHandler({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const supabase = getSupabase();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString();

  // Run queries in parallel
  const [
    totalCountRes,
    usAssetsRes,
    caAssetsRes,
    newThisQuarterRes,
    topMoversRes,
    newRegistrationsRes,
    recentEventRes,
    recentEnforcementRes,
  ] = await Promise.all([
    // Total institutions
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('active', true),

    // US total assets (fdic + ncua)
    supabase
      .from('institutions')
      .select('total_assets')
      .in('source', US_SOURCES)
      .eq('active', true)
      .not('total_assets', 'is', null),

    // CA total assets (osfi)
    supabase
      .from('institutions')
      .select('total_assets')
      .in('source', CA_SOURCES)
      .eq('active', true)
      .not('total_assets', 'is', null),

    // New this quarter
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', ninetyDaysAgoStr),

    // Latest financial_history periods to compare for top movers
    supabase
      .from('financial_history')
      .select('period')
      .order('period', { ascending: false })
      .limit(200),

    // New registrations (Canadian sources, recently added)
    supabase
      .from('institutions')
      .select('cert_number, name, source, charter_type, city, state, created_at')
      .in('source', CA_SOURCES)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('charter_events')
      .select('entity_id, entity_table, event_type, event_subtype, event_date, details')
      .gte('event_date', ninetyDaysAgoStr.slice(0, 10))
      .order('event_date', { ascending: false })
      .limit(20),
    supabase
      .from('entity_facts')
      .select('entity_id, entity_table, fact_value_text, fact_value_json, observed_at')
      .eq('fact_key', 'fdic_enforcement_action')
      .gte('observed_at', ninetyDaysAgoStr)
      .order('observed_at', { ascending: false })
      .limit(20),
  ]);

  // Compute US total assets
  let totalAssetsUs = 0;
  if (usAssetsRes.data) {
    for (const row of usAssetsRes.data) {
      totalAssetsUs += Number(row.total_assets) || 0;
    }
  }

  // Compute CA total assets
  let totalAssetsCa = 0;
  if (caAssetsRes.data) {
    for (const row of caAssetsRes.data) {
      totalAssetsCa += Number(row.total_assets) || 0;
    }
  }

  const topPeriods = [...new Set((topMoversRes.data ?? []).map((row: { period: string | null }) => row.period).filter(Boolean))].slice(0, 2);

  let historyRows: Array<{ cert_number: number; total_assets: number | null; period: string }> = [];
  if (topPeriods.length > 0) {
    const { data } = await supabase
      .from('financial_history')
      .select('cert_number, total_assets, period')
      .in('period', topPeriods)
      .order('period', { ascending: false });
    historyRows = (data ?? []) as Array<{ cert_number: number; total_assets: number | null; period: string }>;
  }

  // Compute top movers from financial_history
  // Group by cert_number, keep the latest 2 periods, compute asset change
  interface HistoryRow {
    cert_number: number;
    total_assets: number | null;
    period: string;
  }

  const byInstitution: Record<number, HistoryRow[]> = {};
  if (historyRows.length > 0) {
    for (const row of historyRows as HistoryRow[]) {
      const cert = row.cert_number;
      if (!byInstitution[cert]) byInstitution[cert] = [];
      if (byInstitution[cert].length < 2) {
        byInstitution[cert].push(row);
      }
    }
  }

  interface TopMover {
    cert_number: number;
    name: string;
    source: string;
    asset_change: number;
    asset_change_pct: number;
    total_assets: number;
  }

  const movers: TopMover[] = [];
  for (const [certStr, periods] of Object.entries(byInstitution)) {
    if (periods.length < 2) continue;
    const latest = periods[0];
    const prior = periods[1];
    if (latest.total_assets == null || prior.total_assets == null) continue;
    const assetChange = latest.total_assets - prior.total_assets;
    const assetChangePct = prior.total_assets !== 0
      ? (assetChange / prior.total_assets) * 100
      : 0;
    movers.push({
      cert_number: Number(certStr),
      name: '',
      source: '',
      asset_change: assetChange,
      asset_change_pct: assetChangePct,
      total_assets: latest.total_assets,
    });
  }

  // Sort by absolute change, take top 5
  const topMoverCerts = movers
    .sort((a, b) => Math.abs(b.asset_change) - Math.abs(a.asset_change))
    .slice(0, 5);

  // Fetch names for top movers
  let topMoversWithNames: TopMover[] = topMoverCerts;
  if (topMoverCerts.length > 0) {
    const certsToLookup = topMoverCerts.map((m) => m.cert_number);
    const { data: instData } = await supabase
      .from('institutions')
      .select('cert_number, name, source')
      .in('cert_number', certsToLookup);

    if (instData) {
      const nameMap: Record<number, { name: string; source: string }> = {};
      for (const inst of instData as { cert_number: number; name: string; source: string }[]) {
        nameMap[inst.cert_number] = { name: inst.name, source: inst.source };
      }
      topMoversWithNames = topMoverCerts.map((m) => ({
        ...m,
        name: nameMap[m.cert_number]?.name ?? `Cert #${m.cert_number}`,
        source: nameMap[m.cert_number]?.source ?? '',
      }));
    }
  }

  interface RegulatoryEventItem {
    cert_number: number | null;
    name: string;
    date: string;
    type: string;
    details: string | null;
  }

  let recentRegulatoryEvents: RegulatoryEventItem[] = [];
  if (!recentEventRes.error || !recentEnforcementRes.error) {
    const eventInstitutionIds = (recentEventRes.data ?? [])
      .filter((row) => row.entity_table === 'institutions' && row.entity_id)
      .map((row) => row.entity_id as string);
    const enforcementInstitutionIds = !recentEnforcementRes.error
      ? (recentEnforcementRes.data ?? [])
          .filter((row) => row.entity_table === 'institutions' && row.entity_id)
          .map((row) => row.entity_id as string)
      : [];

    const institutionIds = [...new Set([...eventInstitutionIds, ...enforcementInstitutionIds])];

    const institutionLookup = new Map<string, { cert_number: number | null; name: string }>();
    if (institutionIds.length > 0) {
      const { data: eventInstitutions } = await supabase
        .from('institutions')
        .select('id, cert_number, name')
        .in('id', institutionIds);

      for (const institution of eventInstitutions ?? []) {
        institutionLookup.set(institution.id, {
          cert_number: institution.cert_number ?? null,
          name: institution.name,
        });
      }
    }

    const charterEventItems = (recentEventRes.error ? [] : (recentEventRes.data ?? []))
      .filter((row) => ['failure', 'closure', 'conversion', 'merger', 'charter_change', 'charter_opening'].includes(String(row.event_type)))
      .map((row) => {
        const institution = row.entity_id ? institutionLookup.get(String(row.entity_id)) : null;
        return {
          cert_number: institution?.cert_number ?? null,
          name: institution?.name ?? 'Institution event',
          date: row.event_date ?? '',
          type: String(row.event_subtype ?? row.event_type ?? '').replace(/_/g, ' '),
          details: row.details ?? null,
        };
      });

    const enforcementItems = recentEnforcementRes.error
      ? []
      : (recentEnforcementRes.data ?? []).map((row) => {
          const payload = (row.fact_value_json ?? {}) as Record<string, unknown>;
          const institution = row.entity_id ? institutionLookup.get(String(row.entity_id)) : null;
          return {
            cert_number: institution?.cert_number ?? (Number(payload.cert_number ?? 0) || null),
            name: institution?.name ?? String(payload.institution_name ?? 'Institution event'),
            date: typeof payload.init_date === 'string' ? payload.init_date : String(row.observed_at ?? ''),
            type: String(row.fact_value_text ?? payload.action_type ?? 'enforcement action').replace(/_/g, ' '),
            details: payload.termination_date ? `terminated ${payload.termination_date}` : 'active enforcement action',
          };
        });

    recentRegulatoryEvents = [...charterEventItems, ...enforcementItems]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);
  } else if (!isMissingTableError(recentEventRes.error)) {
    console.warn(`Unable to load recent charter events: ${recentEventRes.error.message}`);
  }

  if (recentEnforcementRes.error && !isMissingTableError(recentEnforcementRes.error)) {
    console.warn(`Unable to load recent enforcement facts: ${recentEnforcementRes.error.message}`);
  }

  const newRegistrations = (newRegistrationsRes.data ?? []).map((r: {
    cert_number: number;
    name: string;
    source: string;
    charter_type: string | null;
    city: string | null;
    state: string | null;
  }) => ({
    cert_number: r.cert_number,
    name: r.name,
    source: r.source,
    charter_type: r.charter_type,
    city: r.city,
    state: r.state,
  }));

  const discovery = {
    top_movers: topMoversWithNames,
    recent_regulatory_events: recentRegulatoryEvents,
    largest_enforcement: recentRegulatoryEvents,
    new_registrations: newRegistrations,
    stat_snapshot: {
      total_institutions: totalCountRes.count ?? 0,
      total_assets_us: totalAssetsUs,
      total_assets_ca: totalAssetsCa,
      new_this_quarter: newThisQuarterRes.count ?? 0,
    },
  };

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
  return res.json(discovery);
});
