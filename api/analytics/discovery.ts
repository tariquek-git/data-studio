import type { VercelRequest, VercelResponse } from '@vercel/node';
import { apiHandler } from '../../lib/api-handler.js';
import { getSupabase } from '../../lib/supabase.js';

const CA_SOURCES = ['osfi', 'rpaa', 'ciro', 'fintrac'];
const US_SOURCES = ['fdic', 'ncua'];

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

    // Top movers: need latest financial_history comparison
    // Fetch institutions with total_assets and compare to prior quarter via financial_history
    supabase
      .from('financial_history')
      .select('cert_number, total_assets, period_date')
      .order('period_date', { ascending: false })
      .limit(2000),

    // New registrations (Canadian sources, recently added)
    supabase
      .from('institutions')
      .select('cert_number, name, source, charter_type, city, state, created_at')
      .in('source', CA_SOURCES)
      .order('created_at', { ascending: false })
      .limit(5),
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

  // Compute top movers from financial_history
  // Group by cert_number, keep last 2 periods, compute asset change
  interface HistoryRow {
    cert_number: number;
    total_assets: number | null;
    period_date: string;
  }

  const byInstitution: Record<number, HistoryRow[]> = {};
  if (topMoversRes.data) {
    for (const row of topMoversRes.data as HistoryRow[]) {
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

  // Fetch enforcement actions from FDIC (live)
  interface EnforcementItem {
    cert_number: number | null;
    name: string;
    date: string;
    type: string;
    penalty: string | null;
  }

  let largestEnforcement: EnforcementItem[] = [];
  try {
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    const startStr = startDate.toISOString().split('T')[0];

    const enfUrl = `https://banks.data.fdic.gov/api/enforcement?filters=INITDATE:[${startStr} TO ${today}]&fields=CERT,INSTNAME,INITDATE,ENFORMACT,CITYPENAL&limit=5&sort_by=INITDATE&sort_order=DESC`;
    const enfRes = await fetch(enfUrl, { signal: AbortSignal.timeout(8000) });

    if (enfRes.ok) {
      const enfJson = await enfRes.json() as { data?: Array<{ data: { CERT: number; INSTNAME: string; INITDATE: string; ENFORMACT: string; CITYPENAL: string } }> };
      largestEnforcement = (enfJson.data ?? []).map((item) => ({
        cert_number: item.data.CERT || null,
        name: item.data.INSTNAME || '',
        date: item.data.INITDATE || '',
        type: item.data.ENFORMACT || '',
        penalty: item.data.CITYPENAL || null,
      }));
    }
  } catch {
    // Non-critical — return empty if FDIC API is unavailable
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
    largest_enforcement: largestEnforcement,
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
